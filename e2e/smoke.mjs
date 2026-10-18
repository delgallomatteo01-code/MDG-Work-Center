// Test end-to-end nel browser reale (Chromium via playwright-core).
// Uso: BASE_URL=http://localhost:3001 E2E_EMAIL=… E2E_PASSWORD=… npm run e2e
import { chromium } from 'playwright-core';
import fs from 'node:fs';
import path from 'node:path';

const BASE = process.env.BASE_URL ?? 'http://localhost:3001';
const EMAIL = process.env.E2E_EMAIL ?? 'matteo@example.com';
const PASSWORD = process.env.E2E_PASSWORD ?? 'demo1234';
const OUT = path.resolve('e2e/screens');
fs.mkdirSync(OUT, { recursive: true });

const executablePath = process.env.CHROMIUM_PATH || undefined;
const browser = await chromium.launch({ executablePath });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, acceptDownloads: true, locale: 'it-IT', timezoneId: 'Europe/Rome' });
await ctx.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: BASE });
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
// I 401 attesi (verifica sessione prima del login, credenziali errate) non sono errori dell'app.
page.on('console', (m) => m.type() === 'error' && !m.text().includes('401') && errors.push(`console: ${m.text()}`));

let step = 0;
const shot = (name) => page.screenshot({ path: path.join(OUT, `${String(++step).padStart(2, '0')}-${name}.png`) });
const ok = (cond, msg) => {
  if (!cond) throw new Error(`FALLITO: ${msg}`);
  console.log(`✓ ${msg}`);
};
const nav = (label) => page.locator('.nav button', { hasText: label }).first().click();
const toast = () => page.locator('.toast').last();

// 1. Accesso
await page.goto(BASE);
await page.getByText('Senza rumore.').waitFor();
await shot('login');
await page.getByLabel('Email').fill(EMAIL);
await page.getByLabel('Password').fill('sbagliata');
await page.getByRole('button', { name: 'Accedi' }).click();
await page.getByRole('alert').waitFor();
ok((await page.getByRole('alert').textContent()).includes('Credenziali'), 'credenziali errate rifiutate');
await page.getByLabel('Password').fill(PASSWORD);
await page.getByRole('button', { name: 'Accedi' }).click();
await page.getByText('Buongiorno, Matteo.').waitFor();
ok(true, 'accesso e dashboard');
await page.waitForTimeout(300);
await shot('dashboard');
ok((await page.locator('.focus-row').count()) === 5, 'focus mostra 5 attività');

// 2. Nuova task con progetto nuovo
await page.getByRole('button', { name: 'Nuova task' }).first().click();
await page.getByLabel('Titolo *').fill('Locandina fiera EIMA');
await page.getByLabel('Progetto').fill('Fiera EIMA 2026');
await page.getByLabel('Priorità').selectOption('Alta');
await page.getByText('Dettagli e materiali').click();
await page.getByLabel('Cliente o reparto').fill('Marketing');
await page.getByLabel('Tag (separati da virgola)').fill('fiera, stampa');
await shot('task-editor');
await page.getByRole('button', { name: 'Crea task' }).click();
await toast().getByText('Task creata').waitFor();
ok(true, 'task creata con toast');
await page.reload();
await page.getByText('Buongiorno, Matteo.').waitFor();
await nav('Le mie task');
await page.locator('.tcard', { hasText: 'Locandina fiera EIMA' }).waitFor();
ok(true, 'task persistente dopo ricaricamento');
ok((await page.locator('.tcard', { hasText: 'Locandina fiera EIMA' }).textContent()).includes('Fiera EIMA 2026'), 'progetto nuovo associato');

// sola lettura con clic card, editor con matita
await page.locator('.tcard', { hasText: 'Locandina fiera EIMA' }).locator('h4').click();
await page.getByText('Dettaglio task').waitFor();
ok((await page.locator('.modal input, .modal textarea').count()) === 0, 'dettaglio in sola lettura senza campi');
await shot('task-view');
await page.keyboard.press('Escape');
await page.locator('.tcard', { hasText: 'Locandina fiera EIMA' }).getByLabel('Modifica task').click();
await page.getByRole('heading', { name: 'Modifica task' }).waitFor();
ok(true, 'matita apre editor');
await page.locator('.backdrop').click({ position: { x: 5, y: 5 } });
await page.waitForTimeout(200);
ok((await page.locator('.modal').count()) === 0, 'clic sul backdrop chiude');

// 3. Drag tra colonne e cestino con Annulla
const card = page.locator('.tcard', { hasText: 'Locandina fiera EIMA' }).locator('.grip');
const doneCol = page.locator('.column', { hasText: 'Completato' }).first();
async function drag(from, to) {
  const a = await from.boundingBox();
  const b = await to.boundingBox();
  await page.mouse.move(a.x + a.width / 2, a.y + a.height / 2);
  await page.mouse.down();
  await page.mouse.move(a.x + 30, a.y + 30, { steps: 5 });
  await page.mouse.move(b.x + b.width / 2, b.y + 60, { steps: 12 });
  await page.waitForTimeout(150);
  await page.mouse.up();
}
await drag(card, doneCol);
await toast().getByText('Spostata in «Completato»').waitFor();
ok((await doneCol.textContent()).includes('Locandina fiera EIMA'), 'drag in Completato');
ok((await page.locator('.modal').count()) === 0, 'il drag non apre la modale');

const card2 = page.locator('.tcard', { hasText: 'Locandina fiera EIMA' }).locator('.grip');
const a = await card2.boundingBox();
await page.mouse.move(a.x + 5, a.y + 5);
await page.mouse.down();
await page.mouse.move(a.x + 40, a.y + 40, { steps: 5 });
const trash = page.locator('.trash-zone');
await trash.waitFor();
await shot('drag-trash');
const t = await trash.boundingBox();
await page.mouse.move(t.x + t.width / 2, t.y + t.height / 2, { steps: 12 });
await page.waitForTimeout(150);
await page.mouse.up();
await toast().getByText('Task eliminata').waitFor();
ok((await page.locator('.tcard', { hasText: 'Locandina fiera EIMA' }).count()) === 0, 'drop nel cestino elimina');
await toast().getByRole('button', { name: 'Annulla' }).click();
await page.locator('.tcard', { hasText: 'Locandina fiera EIMA' }).waitFor();
ok(true, 'Annulla ripristina la task eliminata');

// 4. Filtri e viste
await page.locator('.chip', { hasText: 'Urgenti' }).click();
const urgentCount = await page.locator('.tcard').count();
ok(urgentCount === 1, `filtro Urgenti (${urgentCount})`);
await page.locator('.chip', { hasText: 'Tutte' }).click();
await page.getByPlaceholder('Cerca per titolo').fill('fiera');
ok((await page.locator('.tcard').count()) === 1, 'ricerca per tag/titolo');
await page.getByRole('button', { name: 'Lista' }).click();
ok((await page.locator('table.list tbody tr').count()) === 1, 'vista lista coerente con filtri');
await page.getByPlaceholder('Cerca per titolo').fill('');
await shot('task-list');
await page.locator('.toolbar .segmented button', { hasText: 'Calendario' }).click();
await shot('task-calendar');
await page.getByRole('button', { name: 'Task cards' }).click();
await shot('kanban');

// 5. Progetti
await nav('Progetti');
await page.locator('.pcard', { hasText: 'Fiera EIMA 2026' }).waitFor();
await shot('projects');
await page.locator('.pcard', { hasText: 'AgriEuro Point' }).locator('h3').click();
await page.getByRole('button', { name: 'Chiudi progetto' }).click();
await page.locator('.modal.small').getByRole('button', { name: 'Chiudi progetto' }).click();
await page.getByRole('button', { name: 'Progetto completato' }).waitFor();
ok(await page.getByRole('button', { name: 'Progetto completato' }).isDisabled(), 'progetto chiuso, pulsante disabilitato');
await page.keyboard.press('Escape');

// 6. Calendario
await nav('Calendario');
await page.getByText('Controlla sovrapposizioni').waitFor();
await shot('calendar-week');
await page.locator('.segmented button', { hasText: 'Mese' }).click();
await shot('calendar-month');

// 7. Note
await nav('Note');
await page.getByRole('button', { name: 'Nuova nota' }).click();
await page.getByLabel(/Titolo \*/).fill('Brief campagna autunno');
const area = page.locator('.rte-area');
await area.click();
await page.keyboard.type('Obiettivi ');
await page.getByLabel('Grassetto').click();
await page.keyboard.type('principali');
await page.getByLabel('Grassetto').click();
await page.keyboard.press('Enter');
await page.getByLabel('Elenco puntato').click();
await page.keyboard.type('Banner social');
await shot('note-editor');
await page.getByRole('button', { name: 'Salva nota' }).click();
await toast().getByText('Nota salvata').waitFor();
await page.locator('.ncard', { hasText: 'Brief campagna autunno' }).getByLabel('Fissa nota').click();
await page.locator('.pinned-note', { hasText: 'Brief campagna autunno' }).waitFor();
ok((await page.locator('.pinned-note strong, .pinned-note b').count()) >= 1, 'nota fissata con formattazione persistente');
await shot('notes');

// 8. Report
await nav('Report');
await page.getByRole('button', { name: 'Genera ora' }).click();
await toast().getByText('Report generato').waitFor();
await page.getByRole('button', { name: 'Apri anteprima' }).first().click();
await page.locator('.report-doc').waitFor();
await shot('report-preview');
const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Scarica PDF' }).click()]);
const pdfPath = path.join(OUT, download.suggestedFilename());
await download.saveAs(pdfPath);
ok(/^report-\d{4}-\d{2}-\d{2}-\d{4}-\d{2}-\d{2}\.pdf$/.test(download.suggestedFilename()), `PDF scaricato (${download.suggestedFilename()})`);
ok(fs.readFileSync(pdfPath).subarray(0, 4).toString() === '%PDF', 'file PDF valido');
await page.getByRole('button', { name: 'Copia tutto il testo' }).click();
const clip = await page.evaluate(() => navigator.clipboard.readText());
ok(clip.includes('REPORT ATTIVITÀ'), 'copia testo report');
await page.keyboard.press('Escape');

// 9. Impostazioni: tema scuro
await nav('Impostazioni');
await page.getByRole('button', { name: 'Scuro' }).click();
await page.getByRole('button', { name: 'Salva impostazioni' }).click();
await toast().getByText('Impostazioni salvate').waitFor();
await page.reload();
await page.getByText('Buongiorno, Matteo.').waitFor();
ok((await page.evaluate(() => document.documentElement.dataset.theme)) === 'dark', 'tema scuro persistente');
await page.waitForTimeout(300);
await shot('dashboard-dark');
await nav('Note');
await shot('notes-dark');
await nav('Impostazioni');
await page.getByRole('button', { name: 'Chiaro' }).click();
await page.getByRole('button', { name: 'Salva impostazioni' }).click();
await toast().getByText('Impostazioni salvate').waitFor();

// 10. Mobile
await page.setViewportSize({ width: 390, height: 844 });
await nav('Dashboard').catch(() => undefined);
await page.getByLabel('Apri menu').click();
await page.locator('.sidebar.open').waitFor();
await shot('mobile-menu');
await page.locator('.sidebar .nav button', { hasText: 'Dashboard' }).click();
await page.waitForTimeout(300);
await shot('mobile-dashboard');
await page.getByLabel('Apri menu').click();
await page.locator('.sidebar .nav button', { hasText: 'Le mie task' }).click();
await page.waitForTimeout(300);
await shot('mobile-tasks');
await page.getByRole('button', { name: 'Nuova task' }).first().click();
await page.waitForTimeout(300);
await shot('mobile-modal');

await browser.close();
if (errors.length) {
  console.log('Errori in console:\n' + errors.join('\n'));
  process.exit(1);
}
console.log(`\nTutti i passaggi superati. Screenshot in ${OUT}`);
