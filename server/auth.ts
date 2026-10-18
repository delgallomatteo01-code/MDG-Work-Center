import { createHash, randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';
import type { DB } from './db';

export const SESSION_COOKIE = 'wc_session';
const SESSION_DAYS = 30;

export interface AuthConfig {
  ownerEmail: string;
  passwordHash?: string; // formato scrypt$salt$hash (hex)
  password?: string; // solo sviluppo
  secureCookie: boolean;
}

export function hashPassword(password: string): string {
  const salt = randomBytes(16).toString('hex');
  const hash = scryptSync(password, salt, 64).toString('hex');
  return `scrypt$${salt}$${hash}`;
}

function verifyPassword(cfg: AuthConfig, password: string): boolean {
  if (cfg.passwordHash) {
    const [scheme, salt, hash] = cfg.passwordHash.split('$');
    if (scheme !== 'scrypt' || !salt || !hash) return false;
    const expected = Buffer.from(hash, 'hex');
    const actual = scryptSync(password, salt, expected.length);
    return timingSafeEqual(expected, actual);
  }
  if (cfg.password) {
    const a = createHash('sha256').update(password).digest();
    const b = createHash('sha256').update(cfg.password).digest();
    return timingSafeEqual(a, b);
  }
  return false;
}

const sha = (s: string) => createHash('sha256').update(s).digest('hex');

export function parseCookies(header: string | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  for (const part of (header ?? '').split(';')) {
    const i = part.indexOf('=');
    if (i < 0) continue;
    const k = part.slice(0, i).trim();
    if (k) out[k] = decodeURIComponent(part.slice(i + 1).trim());
  }
  return out;
}

/** Limite tentativi di accesso per IP (memoria di processo). */
const attempts = new Map<string, { count: number; first: number }>();
function tooManyAttempts(ip: string): boolean {
  const now = Date.now();
  const a = attempts.get(ip);
  if (!a || now - a.first > 15 * 60_000) {
    attempts.set(ip, { count: 1, first: now });
    return false;
  }
  a.count += 1;
  return a.count > 10;
}

export function createAuth(db: DB, cfg: AuthConfig) {
  const cookie = (value: string, maxAgeSec: number) =>
    `${SESSION_COOKIE}=${value}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAgeSec}${cfg.secureCookie ? '; Secure' : ''}`;

  function currentSession(req: Request): { email: string } | null {
    const token = parseCookies(req.headers.cookie)[SESSION_COOKIE];
    if (!token) return null;
    const row = db.prepare('SELECT email, expiresAt FROM sessions WHERE idHash = ?').get(sha(token)) as
      | { email: string; expiresAt: string }
      | undefined;
    if (!row || row.expiresAt < new Date().toISOString()) return null;
    // L'identità arriva solo dalla sessione lato server, mai da header inviati dal browser.
    if (row.email.toLowerCase() !== cfg.ownerEmail.toLowerCase()) return null;
    return { email: row.email };
  }

  return {
    configured: !!cfg.ownerEmail && !!(cfg.passwordHash || cfg.password),

    login(req: Request, res: Response) {
      const ip = req.ip ?? 'unknown';
      if (tooManyAttempts(ip)) return res.status(429).json({ error: 'Troppi tentativi. Riprova tra qualche minuto.' });
      const { email, password } = (req.body ?? {}) as { email?: unknown; password?: unknown };
      if (typeof email !== 'string' || typeof password !== 'string' || password.length > 500) {
        return res.status(400).json({ error: 'Inserisci email e password.' });
      }
      const ok = email.trim().toLowerCase() === cfg.ownerEmail.toLowerCase() && verifyPassword(cfg, password);
      if (!ok) return res.status(401).json({ error: 'Credenziali non valide.' });
      attempts.delete(ip);
      const token = randomBytes(32).toString('hex');
      const now = new Date();
      const expires = new Date(now.getTime() + SESSION_DAYS * 86_400_000);
      db.prepare('DELETE FROM sessions WHERE expiresAt < ?').run(now.toISOString());
      db.prepare('INSERT INTO sessions (idHash, email, createdAt, expiresAt) VALUES (?, ?, ?, ?)').run(
        sha(token),
        cfg.ownerEmail,
        now.toISOString(),
        expires.toISOString(),
      );
      res.setHeader('Set-Cookie', cookie(token, SESSION_DAYS * 86_400));
      return res.json({ ok: true, email: cfg.ownerEmail });
    },

    logout(req: Request, res: Response) {
      const token = parseCookies(req.headers.cookie)[SESSION_COOKIE];
      if (token) db.prepare('DELETE FROM sessions WHERE idHash = ?').run(sha(token));
      res.setHeader('Set-Cookie', cookie('', 0));
      res.json({ ok: true });
    },

    me(req: Request, res: Response) {
      const s = currentSession(req);
      if (!s) return res.status(401).json({ error: 'Accesso richiesto.' });
      return res.json({ email: s.email });
    },

    /** Richiede sessione valida; per le richieste che modificano dati verifica anche l'origine (CSRF). */
    require(req: Request, res: Response, next: NextFunction) {
      const s = currentSession(req);
      if (!s) return res.status(401).json({ error: 'Accesso richiesto.' });
      if (req.method !== 'GET' && req.method !== 'HEAD') {
        if (req.get('x-requested-with') !== 'workcenter') return res.status(403).json({ error: 'Richiesta non consentita.' });
        const origin = req.get('origin');
        if (origin && new URL(origin).host !== req.get('host')) return res.status(403).json({ error: 'Origine non consentita.' });
      }
      res.locals.user = s;
      next();
    },
  };
}
