import { describe, expect, it } from 'vitest';
import { setup } from './helpers';
import type { AppData, Task } from '../shared/types';

const byTitle = (d: AppData, title: string) => d.tasks.find((t) => t.title === title) as Task;

describe('accesso', () => {
  it('protegge API e allegati senza sessione', async () => {
    const { agent } = setup();
    await agent.get('/api/data').expect(401);
    await agent.get('/api/attachments?id=x').expect(401);
    await agent.get('/api/branding/logo').expect(401);
    await agent.post('/api/auth/login').send({ email: 'matteo@example.com', password: 'sbagliata' }).expect(401);
  });
  it('ignora header di identità e richiede header anti-CSRF', async () => {
    const { agent, login } = setup();
    await agent.get('/api/data').set('X-User-Email', 'matteo@example.com').expect(401);
    await login();
    await agent.post('/api/data').send({ action: 'createNote', payload: { title: 'x' } }).expect(403);
  });
});

describe('dati demo e task', () => {
  it('crea i dati demo una sola volta', async () => {
    const { login, load, act } = setup();
    await login();
    let d: AppData = await load();
    expect(d.projects).toHaveLength(3);
    expect(d.tasks).toHaveLength(6);
    const done = byTitle(d, 'Esportazione materiali per la stampa');
    expect(done.completedAt).toBe('2026-10-13T10:00:00.000Z');
    for (const t of d.tasks) await act('deleteTask', { id: t.id });
    d = await load();
    expect(d.tasks).toHaveLength(0);
  });

  it('crea task con progetto nuovo e riusa progetti senza duplicati di maiuscole', async () => {
    const { login, load, act } = setup();
    await login();
    await load();
    const r = await act('createTask', { title: 'Locandina fiera', projectName: '  Fiera EIMA ', dueDate: '' });
    expect(r.createdId).toBeTruthy();
    await act('createTask', { title: 'Totem fiera', projectName: 'fiera eima' });
    await act('createTask', { title: 'Post', projectName: 'agrieuro point' });
    const d: AppData = await load();
    const fiera = d.projects.filter((p) => p.name.toLowerCase() === 'fiera eima');
    expect(fiera).toHaveLength(1);
    expect(fiera[0]).toMatchObject({ name: 'Fiera EIMA', status: 'In corso', color: '#EA684A', startDate: '2026-10-14' });
    const t = byTitle(d, 'Locandina fiera');
    expect(t).toMatchObject({ status: 'Da iniziare', priority: 'Media', workType: 'Altro', estimatedMinutes: 60, actualMinutes: 0, dueDate: null });
    expect(byTitle(d, 'Totem fiera').projectId).toBe(fiera[0].id);
    expect(byTitle(d, 'Post').projectId).toBe(d.projects.find((p) => p.name === 'AgriEuro Point')!.id);
    expect(d.history.some((h) => h.taskId === t.id && h.eventType === 'created')).toBe(true);
  });

  it('completedAt: assegnato entrando in Completato, conservato, azzerato riaprendo', async () => {
    const { login, load, act, setTime } = setup();
    await login();
    let d: AppData = await load();
    const t = byTitle(d, 'Preparazione newsletter');
    await act('updateTask', { id: t.id, status: 'Completato' });
    d = await load();
    const first = byTitle(d, t.title).completedAt;
    expect(first).toBe('2026-10-14T10:00:00.000Z');
    setTime('2026-10-14T11:00:00Z');
    await act('updateTask', { id: t.id, title: t.title, status: 'Completato', actualMinutes: 30 });
    d = await load();
    expect(byTitle(d, t.title).completedAt).toBe(first);
    await act('updateTask', { id: t.id, status: 'In corso' });
    d = await load();
    expect(byTitle(d, t.title).completedAt).toBeNull();
  });

  it('elimina e ripristina (Annulla), snapshot ripristina stato precedente', async () => {
    const { login, load, act } = setup();
    await login();
    let d: AppData = await load();
    const t = byTitle(d, 'Aggiornamento pagina prodotto');
    await act('deleteTask', { id: t.id });
    d = await load();
    expect(d.tasks.find((x) => x.id === t.id)).toBeUndefined();
    await act('restoreDeletedTask', { id: t.id });
    d = await load();
    const snap = byTitle(d, t.title);
    await act('updateTask', { id: t.id, status: 'Completato', dueDate: '2026-12-01' });
    await act('restoreTaskSnapshot', { task: snap, template: null });
    d = await load();
    expect(byTitle(d, t.title)).toMatchObject({ status: 'Da iniziare', completedAt: null, dueDate: snap.dueDate });
  });

  it('duplica azzera stato, tempo effettivo, completamento e ricorrenza', async () => {
    const { login, load, act } = setup();
    await login();
    await load();
    const { createdId } = await act('createTask', { title: 'Social mensile', recurring: true, actualMinutes: 50, status: 'Completato', tags: 'social, ig' });
    const r = await act('duplicateTask', { id: createdId });
    const copy = (r.data as AppData).tasks.find((x) => x.id === r.createdId)!;
    expect(copy).toMatchObject({
      title: 'Social mensile — copia',
      status: 'Da iniziare',
      actualMinutes: 0,
      completedAt: null,
      archived: false,
      recurrenceId: null,
      recurrencePeriod: null,
      tags: ['social', 'ig'],
    });
    expect((r.data as AppData).attachments.filter((a) => a.taskId === copy.id)).toHaveLength(0);
  });

  it('valida input', async () => {
    const { login, load, act } = setup();
    await login();
    await load();
    await act('createTask', { title: '  ' }, 400);
    await act('createTask', { title: 'x', estimatedMinutes: -5 }, 400);
    await act('createTask', { title: 'x', dueDate: '2026-02-30' }, 400);
    await act('createTask', { title: 'x', priority: 'Altissima' }, 400);
    await act('sendReport', {}, 400);
    await act('boh', {}, 400);
  });
});

describe('ricorrenze', () => {
  it('una sola istanza per periodo, nessun duplicato completando, cambio frequenza senza istanza immediata', async () => {
    const { login, load, act, setTime } = setup('2026-10-14T10:00:00Z');
    await login();
    await load();
    const { createdId } = await act('createTask', { title: 'Report social', recurring: true, dueDate: '2026-10-16' });
    let d: AppData = await load();
    expect(d.tasks.filter((t) => t.title === 'Report social')).toHaveLength(1);
    await act('updateTask', { id: createdId, status: 'Completato' });
    d = await load();
    d = await load();
    expect(d.tasks.filter((t) => t.title === 'Report social')).toHaveLength(1);

    // settimana successiva: nuova istanza, venerdì
    setTime('2026-10-20T08:00:00Z');
    d = await load();
    const inst = d.tasks.filter((t) => t.title === 'Report social' && t.id !== createdId);
    expect(inst).toHaveLength(1);
    expect(inst[0]).toMatchObject({ status: 'Da iniziare', dueDate: '2026-10-23', startDate: '2026-10-20', actualMinutes: 0, recurrencePeriod: 'weekly:2026-10-19' });
    await load();
    expect((await load()).tasks.filter((t: Task) => t.title === 'Report social')).toHaveLength(2);

    // salto di settimane: crea solo l'istanza corrente
    setTime('2026-11-11T08:00:00Z');
    d = await load();
    expect(d.tasks.filter((t) => t.title === 'Report social')).toHaveLength(3);

    // cambio frequenza → nessuna istanza immediata nel periodo corrente
    await act('updateSettings', { reportFrequency: 'monthly' });
    d = await load();
    expect(d.tasks.filter((t) => t.title === 'Report social')).toHaveLength(3);
    setTime('2026-12-02T08:00:00Z');
    d = await load();
    const dec = d.tasks.filter((t) => t.title === 'Report social' && t.recurrencePeriod === 'monthly:2026-12');
    expect(dec).toHaveLength(1);
    expect(dec[0].dueDate).toBe('2026-12-16');
  });

  it('mensile su febbraio, modifica aggiorna template, una tantum disattiva, elimina/annulla riattiva', async () => {
    const { login, load, act, setTime } = setup('2026-01-10T10:00:00Z');
    await login();
    await load();
    await act('updateSettings', { reportFrequency: 'monthly' });
    const { createdId } = await act('createTask', { title: 'Chiusura mese', recurring: true, dueDate: '2026-01-31', priority: 'Alta' });
    await act('updateTask', { id: createdId, title: 'Chiusura mese', priority: 'Urgente', recurring: true });
    setTime('2026-02-03T10:00:00Z');
    let d: AppData = await load();
    const feb = d.tasks.find((t) => t.recurrencePeriod === 'monthly:2026-02')!;
    expect(feb).toMatchObject({ dueDate: '2026-02-28', priority: 'Urgente' });

    await act('deleteTask', { id: feb.id });
    setTime('2026-03-03T10:00:00Z');
    d = await load();
    expect(d.tasks.find((t) => t.recurrencePeriod === 'monthly:2026-03')).toBeUndefined();
    await act('restoreDeletedTask', { id: feb.id });
    setTime('2026-04-03T10:00:00Z');
    d = await load();
    const apr = d.tasks.find((t) => t.recurrencePeriod === 'monthly:2026-04')!;
    expect(apr.dueDate).toBe('2026-04-30');

    await act('updateTask', { id: apr.id, recurring: false });
    d = await load();
    expect(d.tasks.find((t) => t.id === apr.id)!.recurrenceId).toBeNull();
    setTime('2026-05-03T10:00:00Z');
    d = await load();
    expect(d.tasks.find((t) => t.recurrencePeriod === 'monthly:2026-05')).toBeUndefined();
  });
});

describe('progetti', () => {
  it('chiusura non tocca le task, eliminazione bloccata con task collegate (anche archiviate)', async () => {
    const { login, load, act } = setup();
    await login();
    let d: AppData = await load();
    const p = d.projects.find((x) => x.name === 'AgriEuro Point')!;
    const before = d.tasks.filter((t) => t.projectId === p.id).map((t) => t.status);
    await act('updateProject', { id: p.id, status: 'Completato' });
    d = await load();
    expect(d.tasks.filter((t) => t.projectId === p.id).map((t) => t.status)).toEqual(before);
    const r = await act('deleteProject', { id: p.id }, 400);
    expect(r.error).toBe('Sposta o elimina prima le task collegate.');
    for (const t of d.tasks.filter((t) => t.projectId === p.id)) await act('archiveTask', { id: t.id });
    await act('deleteProject', { id: p.id }, 400);
    const { createdId } = await act('createProject', { name: 'Vuoto', color: '#112233' });
    await act('deleteProject', { id: createdId });
    await act('restoreDeletedProject', { id: createdId });
    d = await load();
    expect(d.projects.some((x) => x.id === createdId)).toBe(true);
  });
});

describe('archivio', () => {
  it('archivio manuale, automatico dopo archiveDays da completedAt, riapertura', async () => {
    const { login, load, act, setTime } = setup();
    await login();
    let d: AppData = await load();
    const t = byTitle(d, 'Revisione grafica landing page');
    await act('archiveTask', { id: t.id });
    d = await load();
    expect(byTitle(d, t.title)).toMatchObject({ archived: true, status: 'In attesa' });
    await act('reopenTask', { id: t.id });
    d = await load();
    expect(byTitle(d, t.title)).toMatchObject({ archived: false, archivedAt: null, status: 'Da iniziare', completedAt: null, actualMinutes: 60 });

    const done = byTitle(d, 'Esportazione materiali per la stampa'); // completata il 13/10
    setTime('2026-10-19T09:00:00Z');
    d = await load();
    expect(byTitle(d, done.title).archived).toBe(false);
    setTime('2026-10-20T10:00:01Z');
    d = await load();
    expect(byTitle(d, done.title).archived).toBe(true);
    expect(d.history.some((h) => h.taskId === done.id && h.message === 'Archiviata automaticamente')).toBe(true);
  });
});

describe('report', () => {
  it('manuale settimanale, mensile, personalizzato con conteggi e snapshot stabile', async () => {
    const { login, load, act } = setup();
    await login();
    let d: AppData = await load();
    const nl = byTitle(d, 'Preparazione newsletter');
    await act('updateTask', { id: nl.id, status: 'Completato', actualMinutes: 150, notes: 'Inviata a 2 liste' });
    const w = await act('generateReport', { kind: 'weekly' });
    d = w.data;
    const rep = d.reports.find((r) => r.id === w.createdId)!;
    expect(rep).toMatchObject({ periodStart: '2026-10-12', periodEnd: '2026-10-18', taskCount: 2, totalMinutes: 250, estimatedMinutes: 210, projectCount: 2, source: 'manual', frequency: 'weekly' });
    expect(rep.plainText).toContain('40m sopra la stima');
    expect(rep.plainText).toContain('Note: Inviata a 2 liste');
    expect(rep.htmlContent).toContain('Report attività');

    const m = await act('generateReport', { kind: 'monthly' });
    expect((m.data as AppData).reports.find((r) => r.id === m.createdId)).toMatchObject({ periodStart: '2026-10-01', periodEnd: '2026-10-14' });
    await act('generateReport', { kind: 'weekly' }); // i manuali si possono ripetere

    await act('updateTask', { id: nl.id, title: 'Titolo cambiato' });
    d = await load();
    expect(d.reports.find((r) => r.id === w.createdId)!.plainText).toContain('Preparazione newsletter');

    // archiviate incluse
    await act('archiveTask', { id: nl.id });
    const c = await act('generateReport', { kind: 'custom', start: '2026-10-14', end: '2026-10-14' });
    expect((c.data as AppData).reports.find((r) => r.id === c.createdId)).toMatchObject({ taskCount: 1, source: 'custom' });
    await act('generateReport', { kind: 'custom', start: '2026-10-15', end: '2026-10-01' }, 400);
  });

  it('policy report vuoti', async () => {
    const { login, load, act } = setup();
    await login();
    await load();
    const empty = await act('generateReport', { kind: 'custom', start: '2026-01-01', end: '2026-01-07' });
    const r = (empty.data as AppData).reports.find((x) => x.id === empty.createdId)!;
    expect(r.taskCount).toBe(0);
    expect(r.plainText).toContain('Nessuna attività completata');
    await act('updateSettings', { emptyReportBehavior: 'skip' });
    const skipped = await act('generateReport', { kind: 'custom', start: '2026-01-01', end: '2026-01-07' });
    expect(skipped.skipped).toBe(true);
    expect(skipped.createdId).toBeUndefined();
  });

  it('un solo automatico per periodo, anche se archiviato o eliminato', async () => {
    const { login, load, act, setTime } = setup('2026-10-16T12:00:00Z'); // ven 14:00 Roma
    await login();
    let d: AppData = await load();
    expect(d.reports).toHaveLength(0);
    setTime('2026-10-16T13:00:00Z'); // 15:00 Roma
    d = await load();
    expect(d.reports).toHaveLength(1);
    expect(d.reports[0]).toMatchObject({ source: 'automatic', frequency: 'weekly', periodStart: '2026-10-12', periodEnd: '2026-10-18' });
    await act('archiveReport', { id: d.reports[0].id });
    d = await load();
    expect(d.reports).toHaveLength(1);
    await act('deleteReport', { id: d.reports[0].id });
    setTime('2026-10-18T20:00:00Z');
    d = await load();
    expect(d.reports).toHaveLength(0);
    // disattivato: nessun automatico
    await act('updateSettings', { reportEnabled: false });
    setTime('2026-10-23T14:00:00Z');
    d = await load();
    expect(d.reports).toHaveLength(0);
  });

  it('archivia, ripristina stato, elimina e annulla', async () => {
    const { login, load, act } = setup();
    await login();
    await load();
    const { createdId } = await act('generateReport', { kind: 'weekly' });
    await act('archiveReport', { id: createdId });
    let d: AppData = await load();
    expect(d.reports[0].archived).toBe(true);
    await act('restoreReportState', { id: createdId, archived: false, archivedAt: null });
    await act('deleteReport', { id: createdId });
    d = await load();
    expect(d.reports).toHaveLength(0);
    await act('restoreDeletedReport', { id: createdId });
    d = await load();
    expect(d.reports[0]).toMatchObject({ id: createdId, archived: false });
  });
});

describe('note', () => {
  it('sanifica HTML, deriva testo, una sola nota fissata', async () => {
    const { login, load, act } = setup();
    await login();
    await load();
    const dirty =
      '<h2 onclick="x()">Brief</h2><p>Testo <strong>forte</strong> <a href="javascript:alert(1)">bad</a> <a href="https://ok.it">ok</a></p><script>alert(1)</script><iframe src="x"></iframe><img src=x onerror=alert(1)><ul><li>uno</li></ul>';
    const a = await act('createNote', { title: 'Nota A', contentHtml: dirty });
    const note = (a.data as AppData).notes.find((n) => n.id === a.createdId)!;
    expect(note.contentHtml).not.toMatch(/script|iframe|onclick|onerror|javascript|<img/i);
    expect(note.contentHtml).toContain('<a href="https://ok.it" target="_blank" rel="noopener noreferrer nofollow">ok</a>');
    expect(note.contentHtml).toContain('<h2>Brief</h2>');
    expect(note.plainText).toContain('Brief');
    expect(note.plainText).toContain('• uno');
    const b = await act('createNote', { title: 'Nota B', contentHtml: '<p>b</p>' });
    await act('pinNote', { id: a.createdId });
    await act('pinNote', { id: b.createdId });
    const d: AppData = await load();
    expect(d.notes.filter((n) => n.pinned).map((n) => n.id)).toEqual([b.createdId]);
    await act('createNote', { title: 'x'.repeat(161), contentHtml: '' }, 400);
    await act('createNote', { title: 'Lunga', contentHtml: '<p>' + 'a'.repeat(20_001) + '</p>' }, 400);
  });
});

describe('allegati e logo', () => {
  it('upload, limite 15 MiB, accesso protetto e persistente', async () => {
    const { login, load, agent, app } = setup();
    await login();
    const d: AppData = await load();
    const t = d.tasks[0];
    const up = await agent
      .post('/api/attachments')
      .set('X-Requested-With', 'workcenter')
      .field('taskId', t.id)
      .attach('file', Buffer.from('ciao mondo'), { filename: 'brief.txt', contentType: 'text/plain' })
      .expect(200);
    const id = up.body.createdId;
    const file = await agent.get(`/api/attachments?id=${id}`).expect(200);
    expect(file.text).toBe('ciao mondo');
    expect(file.headers['content-security-policy']).toContain('sandbox');
    const again: AppData = await load();
    expect(again.attachments.find((a) => a.id === id)).toMatchObject({ fileName: 'brief.txt', size: 10 });
    await agent
      .post('/api/attachments')
      .set('X-Requested-With', 'workcenter')
      .field('taskId', t.id)
      .attach('file', Buffer.alloc(15 * 1024 * 1024 + 1), { filename: 'big.bin' })
      .expect(413);
    const request = (await import('supertest')).default;
    await request(app).get(`/api/attachments?id=${id}`).expect(401);
  });

  it('logo: accetta solo PNG/JPG/WebP, ripristino', async () => {
    const { login, load, agent } = setup();
    await login();
    await load();
    const png = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(20)]);
    const r = await agent.post('/api/branding/logo').set('X-Requested-With', 'workcenter').attach('file', png, 'logo.png').expect(200);
    expect(r.body.data.settings.hasCustomLogo).toBe(true);
    const img = await agent.get('/api/branding/logo').expect(200);
    expect(img.headers['content-type']).toBe('image/png');
    await agent.post('/api/branding/logo').set('X-Requested-With', 'workcenter').attach('file', Buffer.from('<svg/>'), 'x.svg').expect(400);
    const del = await agent.delete('/api/branding/logo').set('X-Requested-With', 'workcenter').expect(200);
    expect(del.body.data.settings.hasCustomLogo).toBe(false);
    expect((await agent.get('/api/branding/logo')).headers['content-type']).toContain('svg');
  });
});
