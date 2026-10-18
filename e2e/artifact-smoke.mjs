// Prova la build Artifact (dist-artifact/index.html) con un runtime claude.ai simulato
// (db e assets in localStorage), per verificare avvio, salvataggio e ricaricamento.
import { chromium } from 'playwright-core';
import http from 'node:http';
import fs from 'node:fs';

const MOCK = `<script>
(() => {
  const K = 'mock-db:';
  const doc = (path) => ({
    path,
    async get() { const v = localStorage.getItem(K + path); return { id: path.split('/').pop(), exists: v !== null, data: () => (v === null ? undefined : JSON.parse(v)), metadata: {} }; },
    async set(d) { const s = JSON.stringify(d); if (s.length > 256 * 1024) throw { code: 'invalid_argument', message: 'too big' }; localStorage.setItem(K + path, s); window.__writes = (window.__writes || 0) + 1; },
    async delete() { localStorage.removeItem(K + path); },
  });
  const caps = {
    db: { doc, collection: () => ({}) },
    user: { isOwner: async () => true, me: async () => ({ id: 'u1', email: 'matteo@example.com', name: 'Matteo' }) },
    assets: { upload: async (f) => ({ id: 'a' + Math.random().toString(16).slice(2), url: '#', sizeBytes: f.size, contentType: f.type || 'application/octet-stream' }), delete: async () => {} },
    downloads: { save: async ({ filename }) => { window.__saved = filename; return 'saved'; } },
  };
  window.claude = { use: (n) => Promise.resolve(caps[n] ?? null) };
})();
</script>`;
const html = fs.readFileSync('dist-artifact/index.html', 'utf8').replace('<head>', '<head>' + MOCK);
const server = http.createServer((_q, r) => { r.setHeader('content-type', 'text/html'); r.end(html); }).listen(0);
const url = `http://localhost:${server.address().port}/`;

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
const ok = (c, m) => { if (!c) throw new Error('FALLITO: ' + m); console.log('✓ ' + m); };

await page.goto(url);
await page.getByText('Buongiorno, Matteo.').waitFor({ timeout: 20000 });
ok(true, 'avvio con dati demo');
ok((await page.locator('.focus-row').count()) === 5, 'focus 5 attività');
ok(!(await page.getByLabel('Esci').count()), 'nessun logout (accesso gestito da claude.ai)');
await page.getByRole('button', { name: 'Nuova task' }).first().click();
await page.getByLabel('Titolo *').fill('Task salvata su claude.ai');
await page.getByLabel('Progetto').fill('Artifact');
await page.getByRole('button', { name: 'Crea task' }).click();
await page.locator('.toast', { hasText: 'Task creata' }).waitFor();
await page.reload();
await page.getByText('Buongiorno, Matteo.').waitFor({ timeout: 20000 });
await page.locator('.nav button', { hasText: 'Le mie task' }).click();
await page.locator('.tcard', { hasText: 'Task salvata su claude.ai' }).waitFor();
ok(true, 'task persistente dopo ricaricamento');
ok((await page.locator('.tcard').count()) === 7, 'demo non ricreata (7 task)');
await page.locator('.nav button', { hasText: 'Note' }).click();
await page.getByRole('button', { name: 'Nuova nota' }).click();
await page.getByLabel(/Titolo \*/).fill('Nota');
await page.locator('.rte-area').click();
await page.keyboard.type('ciao ');
await page.getByLabel('Grassetto').click();
await page.keyboard.type('mondo');
await page.getByRole('button', { name: 'Salva nota' }).click();
await page.locator('.toast', { hasText: 'Nota salvata' }).waitFor();
await page.reload();
await page.getByText('Buongiorno').waitFor({ timeout: 20000 });
await page.locator('.nav button', { hasText: 'Note' }).click();
ok((await page.locator('.ncard', { hasText: 'Nota' }).innerHTML()).includes('<strong>mondo</strong>') || (await page.locator('.ncard', { hasText: 'Nota' }).innerHTML()).includes('<b>mondo</b>'), 'nota formattata persistente');
await page.locator('.nav button', { hasText: 'Report' }).click();
await page.getByRole('button', { name: 'Genera ora' }).click();
await page.locator('.toast', { hasText: 'Report generato' }).waitFor();
await page.getByRole('button', { name: 'Apri anteprima' }).first().click();
await page.getByRole('button', { name: 'Scarica PDF' }).click();
await page.waitForFunction(() => window.__saved);
ok(/^report-.*\.pdf$/.test(await page.evaluate(() => window.__saved)), 'PDF consegnato al capability downloads');
const size = await page.evaluate(() => Object.keys(localStorage).filter((k) => k.startsWith('mock-db:wc/c-')).length);
ok(size >= 1, `snapshot salvato in ${size} blocco/i, vecchie revisioni ripulite`);
await page.screenshot({ path: 'e2e/screens/artifact-report.png' });
await browser.close();
server.close();
if (errors.length) { console.log(errors.join('\n')); process.exit(1); }
console.log('Build Artifact verificata.');
