# Matteo Work center

Workspace personale e privato per un graphic & web designer: task, progetti, scadenze, calendario, archivio, report e note in un'unica app.

- **Frontend**: React 18 + TypeScript (Vite), CSS personalizzato, icone Lucide, drag & drop con `@dnd-kit/core`, PDF con jsPDF.
- **Backend**: Node.js 22 + Express, database **SQLite** (`node:sqlite`, nessuna dipendenza nativa), storage oggetti su disco con interfaccia sostituibile (S3/R2).
- **Sicurezza**: sessione autenticata con cookie `HttpOnly`/`SameSite=Lax` (+ `Secure` in produzione), sessioni salvate lato server come hash, header anti-CSRF e controllo `Origin`, limite tentativi di login, query parametrizzate, HTML delle note sanificato lato server, allegati serviti con `Content-Security-Policy: sandbox`.

## Avvio in locale

```bash
npm install
cp .env.example .env          # imposta OWNER_EMAIL e la password
npm run hash-password -- "la-tua-password"   # copia l'output in OWNER_PASSWORD_HASH
npm run dev                   # API su :3001, interfaccia su http://localhost:5173
```

Al primo accesso, con database vuoto, vengono creati **una sola volta** 3 progetti e 6 task dimostrativi (tag `demo`), modificabili o eliminabili.

### Produzione

```bash
npm run build                 # typecheck + build frontend + bundle server
npm start                     # serve API e frontend su PORT (default 3001)
```

Con Docker:

```bash
docker build -t workcenter .
docker run -p 3001:3001 -v workcenter-data:/data \
  -e OWNER_EMAIL=tu@esempio.it -e OWNER_PASSWORD_HASH='scrypt$…' workcenter
```

Mettilo dietro HTTPS (reverse proxy, es. Caddy/Nginx, o un PaaS come Render/Fly.io/Railway con volume persistente su `/data`). `COOKIE_SECURE=true` è già impostato nell'immagine.

| Variabile | Descrizione |
| --- | --- |
| `OWNER_EMAIL` | Email del proprietario (unico utente) |
| `OWNER_PASSWORD_HASH` | Hash scrypt della password (`npm run hash-password`) |
| `OWNER_PASSWORD` | Password in chiaro, **solo sviluppo** |
| `DATA_DIR` | Cartella con `workcenter.db` e `objects/` (allegati, logo) |
| `PORT` | Porta HTTP |
| `COOKIE_SECURE` | `true` dietro HTTPS |

## Struttura

```
shared/      tipi, costanti, date Europe/Rome, periodi/ricorrenze, generatore report (usati da client e server)
server/      app Express, auth, Workspace (logiche e azioni), repository SQLite, sanificazione, storage
server/migrations/001_init.sql   schema e indici (vincolo unico recurrenceId + recurrencePeriod)
src/         interfaccia React: viste, modali, store condiviso con toast/Annulla
tests/       test Vitest (logiche date/periodi + API end-to-end lato server)
e2e/         test nel browser reale con Playwright (npm run e2e)
```

### Contratti API

- `GET /api/data` — verifica sessione, crea i dati demo se il DB è vuoto, archivia le completate da `archiveDays` giorni, genera le istanze ricorrenti del periodo e il report automatico maturato; restituisce `tasks, projects, templates, history, attachments, reports, notes, settings`.
- `POST /api/data` `{ action, payload }` → `{ ok, createdId?, skipped?, data }`. Azioni: `createTask, updateTask, duplicateTask, archiveTask, reopenTask, deleteTask, restoreDeletedTask, restoreTaskSnapshot, createProject, updateProject, deleteProject, restoreDeletedProject, createNote, updateNote, pinNote, deleteNote, restoreDeletedNote, generateReport, archiveReport, reopenReport, deleteReport, restoreDeletedReport, restoreReportState, updateSettings`. `sendReport` è rifiutata (email rimossa).
- `POST /api/attachments` (multipart `file`, `taskId`, max 15 MiB) · `GET /api/attachments?id=…`
- `GET | POST | DELETE /api/branding/logo` (PNG/JPG/WebP, max 4 MiB, verificati per firma binaria)
- `POST /api/auth/login`, `POST /api/auth/logout`, `GET /api/auth/me`

## Test

```bash
npm test          # 30 test: date/DST, periodi, ricorrenze, report, archivio, note, allegati, logo, auth
npm run e2e       # flusso completo nel browser (server avviato, BASE_URL/E2E_EMAIL/E2E_PASSWORD)
```

## Adattamenti e limiti dichiarati

- **Autenticazione**: l'originale usa «Accedi con ChatGPT», disponibile solo nel suo hosting. Qui l'accesso è email + password del proprietario configurati sul server. È l'unica differenza funzionale. L'identità deriva solo dalla sessione lato server, mai da header inviati dal browser.
- **Logo**: l'asset originale non è stato fornito; `public/logo-placeholder.svg` è un **segnaposto** sostituibile da Impostazioni → Profilo e identità.
- **Report automatico**: non c'è uno scheduler. Il controllo avviene a ogni `GET /api/data` (apertura/ricarica dell'app): a sito chiuso il report viene creato al primo accesso utile del periodo (settimanale: da venerdì all'ora scelta fino a domenica; mensile: dal giorno impostato del mese per il mese precedente). Un cron sarebbe un miglioramento separato.
- **Avviso scadenza (ore)**: viene salvato ma non comanda notifiche; la lista usa una soglia fissa di 2 giorni e il calendario la legenda «Entro 48 ore». Non esistono notifiche browser, email o push.
- **Anomalia del riferimento conservata**: il report seleziona le task per stato e `completedAt` senza escludere quelle eliminate logicamente. Correzione proposta e pronta: `REPORT_EXCLUDE_DELETED_TASKS = true` in `shared/constants.ts`. I report già generati restano snapshot.
- **Fuso orario**: tutte le regole di periodo (oggi, settimana lun–dom, mese, completamento nel periodo, chiavi di ricorrenza) usano Europe/Rome con ora legale; l'originale mescolava UTC e Europe/Rome. Le date di calendario `YYYY-MM-DD` non vengono mai convertite.
- **Statistiche** di dashboard e progetti escludono le task archiviate, come nell'originale.
- **Dati**: questa ricostruzione non contiene né migra i dati dell'app originale.
- **Fedeltà visiva**: ricostruita da token e descrizione; una corrispondenza al pixel richiederebbe asset e screenshot originali.
- Non presenti per scelta (come nell'originale): email, timer, CSV, importazioni, ricerca globale, drag delle date nel calendario, cestino navigabile, team/ruoli.
