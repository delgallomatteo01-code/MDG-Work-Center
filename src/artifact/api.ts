// Implementazione di `api` per la build Artifact su claude.ai.
// La logica è la stessa del server (Workspace + SQLite via sql.js), eseguita nel browser.
// Persistenza: snapshot SQLite compresso nel `db` dell'artifact (solo proprietario),
// allegati e logo negli `assets` dell'artifact. Accesso gestito da claude.ai.
import initSqlJs from 'sql.js/dist/sql-wasm-inline.js';
import type { SqlJsStatic } from 'sql.js';
import { migrate, wrapDatabase, type BrowserDB } from '../../server/db.browser';
import { Workspace } from '../../server/workspace';
import { getSettings } from '../../server/repo';
import { MAX_ATTACHMENT_BYTES, MAX_LOGO_BYTES } from '../../shared/constants';
import type { AppData, Attachment, Settings } from '../../shared/types';
import placeholderLogo from '../assets/logo-placeholder.svg';

export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
}

export interface ActionResponse {
  ok: true;
  data: AppData;
  createdId?: string;
  skipped?: boolean;
  message?: string;
}

/* eslint-disable @typescript-eslint/no-explicit-any */
type Cap = any;
declare global {
  interface Window {
    claude?: { use(name: string): Promise<Cap | null> };
  }
}

const COLLECTION = 'wc';
const CHUNK = 180_000; // caratteri base64 per documento (limite 256 KiB)

let SQL: SqlJsStatic | null = null;
let raw: import('sql.js').Database | null = null;
let db: BrowserDB | null = null;
let ws: Workspace | null = null;
let store: Cap = null;
let assets: Cap = null;
let downloads: Cap = null;
let email = '';
let rev: string | null = null;
let booted: Promise<void> | null = null;
let queue: Promise<unknown> = Promise.resolve();

const use = async (name: string) => (window.claude ? window.claude.use(name).catch(() => null) : null);

// ── codifica snapshot ──
async function gzip(bytes: Uint8Array): Promise<Uint8Array> {
  const s = new Blob([bytes as BlobPart]).stream().pipeThrough(new CompressionStream('gzip'));
  return new Uint8Array(await new Response(s).arrayBuffer());
}
async function gunzip(bytes: Uint8Array): Promise<Uint8Array> {
  const s = new Blob([bytes as BlobPart]).stream().pipeThrough(new DecompressionStream('gzip'));
  return new Uint8Array(await new Response(s).arrayBuffer());
}
function toB64(bytes: Uint8Array): string {
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}
function fromB64(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function openFrom(bytes: Uint8Array | null) {
  raw?.close();
  raw = bytes ? new SQL!.Database(bytes) : new SQL!.Database();
  db = wrapDatabase(raw);
  migrate(db);
  ws = new Workspace(db as never);
}

async function readManifest(): Promise<{ rev: string; chunks: number } | null> {
  const snap = await store.doc(`${COLLECTION}/manifest`).get();
  return snap.exists ? (snap.data() as { rev: string; chunks: number }) : null;
}

/** Carica dal db dell'artifact lo snapshot indicato dal manifest. */
async function loadRemote(manifest: { rev: string; chunks: number } | null) {
  if (!manifest) {
    openFrom(null);
    rev = null;
    return;
  }
  const parts: string[] = [];
  for (let i = 0; i < manifest.chunks; i++) {
    const c = await store.doc(`${COLLECTION}/c-${manifest.rev}-${i}`).get();
    if (!c.exists) throw new ApiError('Snapshot del workspace incompleto: ricarica la pagina.', 500);
    parts.push((c.data() as { d: string }).d);
  }
  openFrom(await gunzip(fromB64(parts.join(''))));
  rev = manifest.rev;
}

/** Salva lo snapshot: prima i blocchi della nuova revisione, poi il manifest (passaggio atomico), poi pulizia. */
async function persist() {
  const bytes = raw!.export();
  const b64 = toB64(await gzip(bytes));
  const next = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
  const n = Math.max(1, Math.ceil(b64.length / CHUNK));
  for (let i = 0; i < n; i++) await store.doc(`${COLLECTION}/c-${next}-${i}`).set({ d: b64.slice(i * CHUNK, (i + 1) * CHUNK) });
  const prev = await readManifest();
  await store.doc(`${COLLECTION}/manifest`).set({ rev: next, chunks: n, savedAt: new Date().toISOString(), bytes: bytes.length });
  rev = next;
  if (prev && prev.rev !== next) {
    for (let i = 0; i < prev.chunks; i++) await store.doc(`${COLLECTION}/c-${prev.rev}-${i}`).delete().catch(() => undefined);
  }
}

async function boot() {
  if (!window.claude) throw new ApiError('Questa versione funziona solo aperta da claude.ai.', 503);
  const [d, u, a, dl] = await Promise.all([use('db'), use('user'), use('assets'), use('downloads')]);
  if (!d) throw new ApiError('Archivio dati non disponibile in questa vista: aprila da claude.ai con il tuo account.', 503);
  if (u && !(await u.isOwner())) throw new ApiError('Workspace privato: solo il proprietario può aprirlo.', 403);
  store = d;
  assets = a;
  downloads = dl;
  email = (u ? (await u.me())?.email : null) ?? 'Account claude.ai';
  SQL = await initSqlJs();
  await loadRemote(await readManifest());
}

const ensureBooted = () => (booted ??= boot().catch((e) => ((booted = null), Promise.reject(e))));

/** Serializza le operazioni: un solo salvataggio alla volta. */
function serial<T>(fn: () => Promise<T>): Promise<T> {
  const p = queue.then(fn, fn);
  queue = p.catch(() => undefined);
  return p;
}

const totalChanges = () => Number((db!.prepare('SELECT total_changes() AS n').get() as { n: number }).n);

function snapshotData(): AppData {
  const data = ws!.data() as Omit<AppData, 'user'>;
  const keys = new Map(
    (db!.prepare('SELECT id, objectKey FROM attachments').all() as { id: string; objectKey: string }[]).map((r) => [r.id, r.objectKey]),
  );
  const s = getSettings(db as never);
  const settings: Settings = { ...data.settings, logoUrl: s.logoKey ? `/_blob/${s.logoKey}` : placeholderLogo };
  const attachments: Attachment[] = data.attachments.map((a) => ({ ...a, url: `/_blob/${keys.get(a.id)}` }));
  return { ...data, settings, attachments, user: { email } };
}

/** Esegue una modifica: allinea allo stato remoto, applica, salva. In caso di errore di salvataggio ripristina. */
async function mutate<T>(fn: () => T): Promise<T> {
  await ensureBooted();
  return serial(async () => {
    const m = await readManifest();
    if ((m?.rev ?? null) !== rev) await loadRemote(m); // modifiche da un'altra scheda o dispositivo
    let result: T;
    try {
      result = fn();
    } catch (err) {
      const e = err as Error & { status?: number };
      throw new ApiError(e.status && e.status < 500 ? e.message : 'Operazione non riuscita.', e.status ?? 500);
    }
    try {
      await persist();
    } catch (err) {
      await loadRemote(await readManifest()).catch(() => undefined);
      const code = (err as { code?: string }).code;
      throw new ApiError(
        code === 'quota_exceeded' ? 'Spazio dati dell’artifact esaurito: modifica non salvata.' : 'Salvataggio non riuscito: modifica annullata. Riprova.',
        503,
      );
    }
    return result;
  });
}

function assetError(err: unknown): never {
  const code = (err as { code?: string }).code;
  if (code === 'unsupported_type')
    throw new ApiError('Tipo di file non supportato dallo storage claude.ai: usa immagini, video, PDF, font o file di testo/CSV/JSON/Markdown.', 400);
  if (code === 'too_large') throw new ApiError('File troppo grande.', 413);
  throw new ApiError((err as Error).message || 'Caricamento non riuscito.', 500);
}

export const api = {
  canLogout: false,
  logoSrc: (s: Settings) => s.logoUrl ?? placeholderLogo,
  attachmentHref: (a: Attachment) => a.url ?? '#',
  me: async () => ({ email }),
  login: async (_e: string, _p: string) => {
    throw new ApiError('Accesso gestito da claude.ai.', 400);
  },
  logout: async () => undefined,

  load: async (): Promise<AppData> => {
    await ensureBooted();
    return serial(async () => {
      const m = await readManifest();
      if ((m?.rev ?? null) !== rev) await loadRemote(m);
      const before = totalChanges();
      ws!.prepare(); // demo al primo avvio, archivio automatico, ricorrenze, report maturato
      if (totalChanges() !== before || !m) {
        try {
          await persist();
        } catch {
          await loadRemote(await readManifest()).catch(() => undefined);
          throw new ApiError('Impossibile salvare il workspace. Ricarica la pagina.', 503);
        }
      }
      return snapshotData();
    });
  },

  action: async (action: string, payload: object): Promise<ActionResponse> => {
    const result = await mutate(() => ws!.run(action, payload as Record<string, unknown>));
    return { ok: true, ...result, data: snapshotData() };
  },

  upload: async (taskId: string, file: File): Promise<ActionResponse> => {
    if (file.size > MAX_ATTACHMENT_BYTES) throw new ApiError('Il file supera il limite di 15 MiB.', 413);
    await ensureBooted();
    if (!assets) throw new ApiError('Caricamento file non disponibile in questa vista.', 503);
    const up = await assets.upload(file, file.type ? undefined : { type: 'application/octet-stream' }).catch(assetError);
    try {
      const id = await mutate(() =>
        ws!.addAttachment({ taskId, objectKey: up.id, fileName: file.name.slice(0, 200) || 'file', contentType: up.contentType, size: file.size }),
      );
      return { ok: true, createdId: id, data: snapshotData() };
    } catch (err) {
      await assets.delete(up.id).catch(() => undefined);
      throw err;
    }
  },

  uploadLogo: async (file: File): Promise<ActionResponse> => {
    if (!/^image\/(png|jpeg|webp)$/.test(file.type)) throw new ApiError('Formato non supportato: usa PNG, JPG o WebP.', 400);
    if (file.size > MAX_LOGO_BYTES) throw new ApiError('Il logo supera 4 MiB.', 413);
    await ensureBooted();
    if (!assets) throw new ApiError('Caricamento file non disponibile in questa vista.', 503);
    const up = await assets.upload(file).catch(assetError);
    const prev = await mutate(() => ws!.setLogo(up.id, up.contentType));
    if (prev) await assets.delete(prev).catch(() => undefined);
    return { ok: true, data: snapshotData() };
  },

  resetLogo: async (): Promise<ActionResponse> => {
    const prev = await mutate(() => ws!.setLogo(null, null));
    if (prev && assets) await assets.delete(prev).catch(() => undefined);
    return { ok: true, data: snapshotData() };
  },

  saveFile: async (filename: string, blob: Blob) => {
    await ensureBooted();
    if (!downloads) throw new Error('Download non disponibile in questa vista.');
    const res = await downloads.save({ filename, data: blob });
    return res;
  },
};
