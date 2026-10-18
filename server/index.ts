import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { openDatabase } from './db';
import { DiskStorage } from './storage';
import { createApp } from './app';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dataDir = path.resolve(process.env.DATA_DIR ?? path.join(root, 'data'));
const db = openDatabase(path.join(dataDir, 'workcenter.db'));
const storage = new DiskStorage(path.join(dataDir, 'objects'));

const placeholder = [path.join(root, 'public', 'logo-placeholder.svg'), path.join(root, 'dist', 'logo-placeholder.svg')].find((p) =>
  fs.existsSync(p),
)!;

const app = createApp({
  db,
  storage,
  auth: {
    ownerEmail: process.env.OWNER_EMAIL ?? '',
    passwordHash: process.env.OWNER_PASSWORD_HASH || undefined,
    password: process.env.OWNER_PASSWORD || undefined,
    secureCookie: process.env.COOKIE_SECURE === 'true',
  },
  staticDir: path.join(root, 'dist'),
  placeholderLogo: placeholder,
});

const port = Number(process.env.PORT ?? 3001);
app.listen(port, () => {
  console.log(`Matteo Work center in ascolto su http://localhost:${port}`);
  if (!process.env.OWNER_EMAIL) console.warn('⚠ OWNER_EMAIL non impostata: l’accesso è disabilitato finché non configuri le credenziali.');
});
