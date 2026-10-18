import express, { type NextFunction, type Request, type Response } from 'express';
import multer from 'multer';
import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import type { DB } from './db';
import { createAuth, type AuthConfig } from './auth';
import type { ObjectStorage } from './storage';
import { Workspace } from './workspace';
import { MAX_ATTACHMENT_BYTES, MAX_LOGO_BYTES } from '../shared/constants';

export interface AppOptions {
  db: DB;
  storage: ObjectStorage;
  auth: AuthConfig;
  clock?: () => Date;
  staticDir?: string;
  placeholderLogo: string;
}

function detectImage(buf: Buffer): string | null {
  if (buf.length > 8 && buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'image/png';
  if (buf.length > 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'image/jpeg';
  if (buf.length > 12 && buf.toString('ascii', 0, 4) === 'RIFF' && buf.toString('ascii', 8, 12) === 'WEBP') return 'image/webp';
  return null;
}

function safeFileName(name: string): string {
  // multer espone il nome in latin1: lo riportiamo a UTF-8
  const utf8 = Buffer.from(name, 'latin1').toString('utf8');
  return utf8.replace(/[\u0000-\u001f"\\/]/g, '_').slice(0, 200) || 'file';
}

type Handler = (req: Request, res: Response, next: NextFunction) => Promise<unknown>;
const wrap = (fn: Handler) => (req: Request, res: Response, next: NextFunction) => fn(req, res, next).catch(next);

export function createApp(opts: AppOptions) {
  const { db, storage } = opts;
  const ws = new Workspace(db, opts.clock);
  const auth = createAuth(db, opts.auth);
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', 'loopback');

  app.use((_req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'same-origin');
    res.setHeader('X-Frame-Options', 'DENY');
    next();
  });
  app.use('/api', express.json({ limit: '1mb' }));

  // ── Autenticazione ──
  app.post('/api/auth/login', (req, res) => {
    if (!auth.configured) return res.status(503).json({ error: 'Accesso non configurato: imposta OWNER_EMAIL e OWNER_PASSWORD_HASH sul server.' });
    return auth.login(req, res);
  });
  app.post('/api/auth/logout', (req, res) => auth.logout(req, res));
  app.get('/api/auth/me', (req, res) => auth.me(req, res));

  const requireAuth = auth.require.bind(auth);
  const send = (res: Response, extra: object = {}) => res.json({ ok: true, ...extra, data: { ...ws.data(), user: res.locals.user } });

  // ── Dati ──
  app.get('/api/data', requireAuth, (_req, res) => {
    ws.prepare();
    send(res);
  });

  app.post('/api/data', requireAuth, (req, res) => {
    const { action, payload } = (req.body ?? {}) as { action?: unknown; payload?: unknown };
    if (typeof action !== 'string') return res.status(400).json({ error: 'Azione mancante.' });
    const result = ws.run(action, (payload ?? {}) as Record<string, unknown>);
    send(res, result);
  });

  // ── Allegati ──
  const uploadAttachment = multer({ storage: multer.memoryStorage(), limits: { fileSize: MAX_ATTACHMENT_BYTES, files: 1 } });
  app.post('/api/attachments', requireAuth, uploadAttachment.single('file'), wrap(async (req, res) => {
    const file = req.file;
    const taskId = typeof req.body?.taskId === 'string' ? req.body.taskId : '';
    if (!file) return res.status(400).json({ error: 'Nessun file ricevuto.' });
    if (!taskId) return res.status(400).json({ error: 'Task mancante.' });
    const objectKey = `attachments/${randomUUID()}`;
    const contentType = /^[\w.+-]+\/[\w.+-]+$/.test(file.mimetype) ? file.mimetype : 'application/octet-stream';
    const fileName = safeFileName(file.originalname);
    await storage.put(objectKey, file.buffer, contentType);
    try {
      const id = ws.addAttachment({ taskId, objectKey, fileName, contentType, size: file.size });
      send(res, { createdId: id });
    } catch (err) {
      await storage.delete(objectKey);
      throw err;
    }
  }));

  app.get('/api/attachments', requireAuth, wrap(async (req, res) => {
    const id = typeof req.query.id === 'string' ? req.query.id : '';
    const meta = id ? ws.getAttachment(id) : undefined;
    if (!meta) return res.status(404).json({ error: 'Allegato non trovato.' });
    const body = await storage.get(meta.objectKey);
    if (!body) return res.status(404).json({ error: 'File non disponibile nello storage.' });
    res.setHeader('Content-Type', meta.contentType);
    res.setHeader('Content-Length', String(body.length));
    res.setHeader('Content-Disposition', `inline; filename*=UTF-8''${encodeURIComponent(meta.fileName)}`);
    // I file caricati non possono eseguire script nell'origine dell'app.
    res.setHeader('Content-Security-Policy', "sandbox; default-src 'none'; img-src 'self' data:; media-src 'self'; style-src 'unsafe-inline'");
    res.setHeader('Cache-Control', 'private, no-store');
    res.end(body);
  }));

  // ── Logo ──
  const uploadLogo = multer({ storage: multer.memoryStorage(), limits: { fileSize: MAX_LOGO_BYTES, files: 1 } });
  app.get('/api/branding/logo', requireAuth, wrap(async (_req, res) => {
    const { key, contentType } = ws.logo();
    res.setHeader('Cache-Control', 'private, max-age=0, must-revalidate');
    if (key && contentType) {
      const body = await storage.get(key);
      if (body) {
        res.setHeader('Content-Type', contentType);
        return res.end(body);
      }
    }
    res.setHeader('Content-Type', 'image/svg+xml');
    res.end(fs.readFileSync(opts.placeholderLogo));
  }));
  app.post('/api/branding/logo', requireAuth, uploadLogo.single('file'), wrap(async (req, res) => {
    const file = req.file;
    if (!file) return res.status(400).json({ error: 'Nessun file ricevuto.' });
    const type = detectImage(file.buffer);
    if (!type) return res.status(400).json({ error: 'Formato non supportato: usa PNG, JPG o WebP.' });
    const key = `branding/logo-${randomUUID()}`;
    await storage.put(key, file.buffer, type);
    const prev = ws.setLogo(key, type);
    if (prev) await storage.delete(prev).catch(() => undefined);
    send(res);
  }));
  app.delete('/api/branding/logo', requireAuth, wrap(async (_req, res) => {
    const prev = ws.setLogo(null, null);
    if (prev) await storage.delete(prev).catch(() => undefined);
    send(res);
  }));

  app.use('/api', (_req, res) => res.status(404).json({ error: 'Endpoint non trovato.' }));

  // ── Frontend (produzione) ──
  if (opts.staticDir && fs.existsSync(opts.staticDir)) {
    app.use(express.static(opts.staticDir, { index: false, maxAge: '1h' }));
    app.get('*', (_req, res) => res.sendFile(path.join(opts.staticDir!, 'index.html')));
  }

  // ── Errori ──
  app.use((err: Error & { status?: number; code?: string }, _req: Request, res: Response, _next: NextFunction) => {
    if (err.code === 'LIMIT_FILE_SIZE') return res.status(413).json({ error: 'File troppo grande per il limite consentito.' });
    const status = err.status ?? 500;
    if (status >= 500) console.error(err);
    res.status(status).json({ error: status >= 500 ? 'Errore interno del server.' : err.message });
  });

  return app;
}
