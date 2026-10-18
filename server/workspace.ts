import type { DB } from './db';
import { newId, tx } from './db';
import {
  allProjects,
  allTasks,
  getNote,
  getProject,
  getReport,
  getSettings,
  getTask,
  getTemplate,
  loadAll,
  mapTemplate,
  saveProject,
  saveTask,
  saveTemplate,
} from './repo';
import { prepareNoteContent } from './sanitize';
import {
  NEW_PROJECT_COLOR,
  NOTE_TITLE_MAX,
  PERSONAL_NAME_MAX,
  PRIORITIES,
  PROJECT_STATUSES,
  REPORT_EXCLUDE_DELETED_TASKS,
  TASK_STATUSES,
  WORK_TYPES,
  type Priority,
  type ProjectStatus,
  type TaskStatus,
} from '../shared/constants';
import { addDays, formatDate, isValidDate, romeParts } from '../shared/dates';
import { dueAutomaticPeriod, manualReportPeriod, periodKey, recurrenceDueDate, type Frequency } from '../shared/periods';
import { buildReport, selectReportTasks } from '../shared/report';
import type { Project, RecurringTemplate, Report, ReportFrequency, ReportSource, Task } from '../shared/types';

export class ValidationError extends Error {
  status = 400;
}
export class NotFoundError extends Error {
  status = 404;
}

type Payload = Record<string, unknown>;
export interface ActionResult {
  createdId?: string;
  skipped?: boolean;
  message?: string;
}

const HEX = /^#[0-9a-f]{6}$/i;

function text(v: unknown, max: number, field: string): string {
  if (v == null) return '';
  if (typeof v !== 'string') throw new ValidationError(`Campo «${field}» non valido.`);
  const s = v.trim();
  if (s.length > max) throw new ValidationError(`Il campo «${field}» supera ${max} caratteri.`);
  return s;
}

function multiline(v: unknown, max: number, field: string): string {
  if (v == null) return '';
  if (typeof v !== 'string') throw new ValidationError(`Campo «${field}» non valido.`);
  if (v.length > max) throw new ValidationError(`Il campo «${field}» supera ${max} caratteri.`);
  return v.replace(/\r\n/g, '\n').trimEnd();
}

function optionalDate(v: unknown, field: string): string | null {
  if (v == null || v === '') return null;
  if (!isValidDate(v)) throw new ValidationError(`Data «${field}» non valida.`);
  return v;
}

function minutes(v: unknown, field: string): number {
  if (v == null || v === '') return 0;
  const n = typeof v === 'number' ? v : Number(v);
  if (!Number.isInteger(n) || n < 0 || n > 1_000_000) throw new ValidationError(`«${field}» deve essere un numero intero non negativo.`);
  return n;
}

function list(v: unknown, field: string): string[] {
  if (v == null || v === '') return [];
  const items = Array.isArray(v) ? v : typeof v === 'string' ? v.split(',') : null;
  if (!items) throw new ValidationError(`Campo «${field}» non valido.`);
  const out = items.map((x) => String(x).trim()).filter(Boolean);
  if (out.length > 50 || out.some((x) => x.length > 500)) throw new ValidationError(`Campo «${field}» troppo lungo.`);
  return out;
}

function oneOf<T extends string>(v: unknown, allowed: readonly T[], field: string): T {
  if (typeof v !== 'string' || !allowed.includes(v as T)) throw new ValidationError(`Valore «${field}» non valido.`);
  return v as T;
}

function requireId(p: Payload, key = 'id'): string {
  const id = p[key];
  if (typeof id !== 'string' || !id || id.length > 100) throw new ValidationError('Identificativo mancante.');
  return id;
}

export class Workspace {
  constructor(
    private db: DB,
    private clock: () => Date = () => new Date(),
  ) {}

  private now() {
    return this.clock().toISOString();
  }
  private today() {
    return romeParts(this.clock()).date;
  }

  data() {
    return loadAll(this.db);
  }

  // ───────────────────────── Manutenzione (eseguita in GET /api/data) ─────────────────────────

  prepare() {
    tx(this.db, () => {
      this.seedIfEmpty();
      this.autoArchive();
      this.generateRecurringInstances();
      this.generateAutomaticReport();
    });
  }

  private seedIfEmpty() {
    const seeded = this.db.prepare("SELECT value FROM meta WHERE key = 'seeded'").get();
    if (seeded) return;
    const hasData = this.db.prepare('SELECT (SELECT COUNT(*) FROM tasks) + (SELECT COUNT(*) FROM projects) AS n').get() as { n: number };
    this.db.prepare("INSERT INTO meta (key, value) VALUES ('seeded', ?)").run(this.now());
    if (hasData.n > 0) return;

    const now = this.now();
    const today = this.today();
    const projects: Record<string, Project> = {};
    for (const [name, client, color] of [
      ['AgriEuro Point', 'Marketing', '#CA4144'],
      ['Campagna promozionale', 'E-commerce', '#EA684A'],
      ['Ottimizzazione e-commerce', 'Kaleido / UX', '#6D6A63'],
    ] as const) {
      const p: Project = {
        id: newId(),
        name,
        description: `Progetto dimostrativo modificabile (${client}).`,
        client,
        startDate: today,
        status: 'In corso',
        color,
        notes: '',
        links: [],
        archived: false,
        dueDate: null,
        createdAt: now,
        updatedAt: now,
        deletedAt: null,
      };
      saveProject(this.db, p);
      projects[name] = p;
    }
    const demo: [string, string, string, TaskStatus, Priority, number, number, number][] = [
      ['Revisione brochure AgriEuro Point', 'AgriEuro Point', 'Brochure', 'In revisione', 'Alta', 1, 210, 165],
      ['Creazione banner promozionali', 'Campagna promozionale', 'Banner', 'In corso', 'Urgente', 0, 180, 75],
      ['Aggiornamento pagina prodotto', 'Ottimizzazione e-commerce', 'UI/UX', 'Da iniziare', 'Alta', 3, 150, 0],
      ['Preparazione newsletter', 'Campagna promozionale', 'Newsletter', 'Da iniziare', 'Media', 5, 120, 0],
      ['Esportazione materiali per la stampa', 'AgriEuro Point', 'Stampa', 'Completato', 'Media', -2, 90, 100],
      ['Revisione grafica landing page', 'Ottimizzazione e-commerce', 'Landing page', 'In attesa', 'Bassa', 8, 180, 60],
    ];
    const yesterday = new Date(this.clock().getTime() - 86_400_000).toISOString();
    for (const [title, projectName, workType, status, priority, dueOffset, est, act] of demo) {
      const p = projects[projectName];
      const t: Task = {
        id: newId(),
        title,
        description: 'Dato dimostrativo: esempio modificabile o eliminabile liberamente.',
        projectId: p.id,
        client: p.client,
        workType,
        status,
        priority,
        createdAt: now,
        startDate: today,
        dueDate: addDays(today, dueOffset),
        estimatedMinutes: est,
        actualMinutes: act,
        notes: '',
        links: [],
        tags: ['demo'],
        archived: false,
        archivedAt: null,
        completedAt: status === 'Completato' ? yesterday : null,
        recurrenceId: null,
        recurrencePeriod: null,
        deletedAt: null,
        updatedAt: now,
      };
      saveTask(this.db, t);
      this.history(t.id, 'created', 'Task creata (dato dimostrativo)');
    }
  }

  /** Archivia le task completate da almeno archiveDays giorni (in base a completedAt, non alla scadenza). */
  autoArchive() {
    const s = getSettings(this.db);
    const threshold = new Date(this.clock().getTime() - s.archiveDays * 86_400_000).toISOString();
    const rows = this.db
      .prepare(
        "SELECT id FROM tasks WHERE status = 'Completato' AND archived = 0 AND deletedAt IS NULL AND completedAt IS NOT NULL AND completedAt <= ?",
      )
      .all(threshold) as { id: string }[];
    const now = this.now();
    for (const { id } of rows) {
      this.db.prepare('UPDATE tasks SET archived = 1, archivedAt = ?, updatedAt = ? WHERE id = ?').run(now, now, id);
      this.history(id, 'archived', 'Archiviata automaticamente');
    }
  }

  /** Una sola istanza per template e periodo corrente; i periodi saltati non vengono recuperati. */
  generateRecurringInstances() {
    const s = getSettings(this.db);
    const today = this.today();
    const key = periodKey(s.reportFrequency, today);
    const templates = (this.db.prepare('SELECT * FROM recurring_templates WHERE active = 1').all() as Record<string, unknown>[]).map(
      mapTemplate,
    );
    const now = this.now();
    for (const tpl of templates) {
      if (tpl.lastPeriodKey === key) continue;
      const projectOk = tpl.projectId ? getProject(this.db, tpl.projectId) : null;
      const t: Task = {
        id: newId(),
        title: tpl.title,
        description: tpl.description,
        projectId: projectOk && !projectOk.deletedAt ? tpl.projectId : null,
        client: tpl.client,
        workType: tpl.workType,
        status: 'Da iniziare',
        priority: tpl.priority,
        createdAt: now,
        startDate: today,
        dueDate: recurrenceDueDate(s.reportFrequency, tpl.baseDueDate, today),
        estimatedMinutes: tpl.estimatedMinutes,
        actualMinutes: 0,
        notes: tpl.notes,
        links: tpl.links,
        tags: tpl.tags,
        archived: false,
        archivedAt: null,
        completedAt: null,
        recurrenceId: tpl.id,
        recurrencePeriod: key,
        deletedAt: null,
        updatedAt: now,
      };
      const res = saveTask(this.db, t, true);
      if (Number(res.changes) > 0) this.history(t.id, 'created', 'Task ricorrente generata per il nuovo periodo');
      this.db.prepare('UPDATE recurring_templates SET lastPeriodKey = ? WHERE id = ?').run(key, tpl.id);
    }
  }

  /**
   * Controllo del report automatico maturato. Eseguito al caricamento dei dati: non è uno scheduler,
   * quindi a sito chiuso il report viene creato solo al primo accesso successivo nel periodo valido.
   */
  generateAutomaticReport() {
    const s = getSettings(this.db);
    if (!s.reportEnabled) return;
    const { date, time } = romeParts(this.clock());
    const period = dueAutomaticPeriod(s.reportFrequency, {
      today: date,
      time,
      reportDay: s.reportDay,
      reportMonthDay: s.reportMonthDay,
      reportTime: s.reportTime,
    });
    if (!period) return;
    const exists = this.db
      .prepare("SELECT id FROM reports WHERE source = 'automatic' AND periodStart = ? AND periodEnd = ?")
      .get(period.start, period.end);
    if (exists) return;
    this.createReport(period.start, period.end, 'automatic', s.reportFrequency);
  }

  private createReport(start: string, end: string, source: ReportSource, frequency: ReportFrequency): ActionResult {
    const s = getSettings(this.db);
    const tasks = selectReportTasks(allTasks(this.db), start, end, REPORT_EXCLUDE_DELETED_TASKS);
    if (tasks.length === 0 && s.emptyReportBehavior === 'skip') {
      return { skipped: true, message: 'Nessuna attività completata nel periodo: report non creato.' };
    }
    const built = buildReport({ personalName: s.personalName, start, end, tasks, projects: allProjects(this.db) });
    const id = newId();
    this.db
      .prepare(
        `INSERT INTO reports (id, periodStart, periodEnd, status, taskCount, totalMinutes, estimatedMinutes, projectCount,
          htmlContent, plainText, source, frequency, archived, createdAt) VALUES (?, ?, ?, 'generated', ?, ?, ?, ?, ?, ?, ?, ?, 0, ?)`,
      )
      .run(
        id,
        start,
        end,
        built.taskCount,
        built.totalMinutes,
        built.estimatedMinutes,
        built.projectCount,
        built.htmlContent,
        built.plainText,
        source,
        frequency,
        this.now(),
      );
    return { createdId: id };
  }

  private history(taskId: string, eventType: string, message: string) {
    this.db
      .prepare('INSERT INTO task_history (id, taskId, eventType, message, createdAt) VALUES (?, ?, ?, ?, ?)')
      .run(newId(), taskId, eventType, message, this.now());
  }

  // ───────────────────────── Azioni ─────────────────────────

  run(action: string, payload: Payload): ActionResult {
    const handler = (this.actions as Record<string, (p: Payload) => ActionResult>)[action];
    if (!handler) throw new ValidationError('Azione non supportata.');
    return tx(this.db, () => handler(payload ?? {}));
  }

  private actions = {
    createTask: (p: Payload) => this.createTask(p),
    updateTask: (p: Payload) => this.updateTask(p),
    duplicateTask: (p: Payload) => this.duplicateTask(p),
    archiveTask: (p: Payload) => this.archiveTask(p),
    reopenTask: (p: Payload) => this.reopenTask(p),
    deleteTask: (p: Payload) => this.deleteTask(p),
    restoreDeletedTask: (p: Payload) => this.restoreDeletedTask(p),
    restoreTaskSnapshot: (p: Payload) => this.restoreTaskSnapshot(p),
    createProject: (p: Payload) => this.createProject(p),
    updateProject: (p: Payload) => this.updateProject(p),
    deleteProject: (p: Payload) => this.deleteProject(p),
    restoreDeletedProject: (p: Payload) => this.restoreDeletedProject(p),
    createNote: (p: Payload) => this.createNote(p),
    updateNote: (p: Payload) => this.updateNote(p),
    pinNote: (p: Payload) => this.pinNote(p),
    deleteNote: (p: Payload) => this.deleteNote(p),
    restoreDeletedNote: (p: Payload) => this.restoreDeletedNote(p),
    generateReport: (p: Payload) => this.generateReport(p),
    archiveReport: (p: Payload) => this.archiveReport(p),
    reopenReport: (p: Payload) => this.reopenReport(p),
    deleteReport: (p: Payload) => this.deleteReport(p),
    restoreDeletedReport: (p: Payload) => this.restoreDeletedReport(p),
    restoreReportState: (p: Payload) => this.restoreReportState(p),
    updateSettings: (p: Payload) => this.updateSettings(p),
    sendReport: () => {
      throw new ValidationError("L'invio email dei report è stato rimosso: usa Copia o Scarica PDF.");
    },
  };

  // ── Task ──

  private mustTask(id: string): Task {
    const t = getTask(this.db, id);
    if (!t || t.deletedAt) throw new NotFoundError('Task non trovata.');
    return t;
  }

  /** Risolve il nome progetto: corrispondenza senza maiuscole/spazi esterni, altrimenti crea il progetto. */
  private resolveProject(name: unknown): string | null {
    const clean = text(name, 120, 'Progetto');
    if (!clean) return null;
    const existing = this.db
      .prepare('SELECT id FROM projects WHERE deletedAt IS NULL AND lower(trim(name)) = lower(?) ORDER BY createdAt LIMIT 1')
      .get(clean) as { id: string } | undefined;
    if (existing) return existing.id;
    const now = this.now();
    const p: Project = {
      id: newId(),
      name: clean,
      description: '',
      client: '',
      startDate: this.today(),
      status: 'In corso',
      color: NEW_PROJECT_COLOR,
      notes: '',
      links: [],
      archived: false,
      dueDate: null,
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
    };
    saveProject(this.db, p);
    return p.id;
  }

  /** Applica i campi presenti nel payload (semantica patch) su una task. */
  private applyTaskFields(base: Task, p: Payload): Task {
    const t = { ...base };
    if ('title' in p) {
      t.title = text(p.title, 200, 'Titolo');
      if (!t.title) throw new ValidationError('Il titolo è obbligatorio.');
    }
    if ('description' in p) t.description = multiline(p.description, 10_000, 'Descrizione');
    if ('client' in p) t.client = text(p.client, 120, 'Cliente o reparto');
    if ('workType' in p) t.workType = p.workType ? oneOf(p.workType, WORK_TYPES, 'Tipologia') : 'Altro';
    if ('status' in p) t.status = oneOf(p.status, TASK_STATUSES, 'Stato');
    if ('priority' in p) t.priority = oneOf(p.priority, PRIORITIES, 'Priorità');
    if ('startDate' in p) t.startDate = optionalDate(p.startDate, 'Data inizio');
    if ('dueDate' in p) t.dueDate = optionalDate(p.dueDate, 'Scadenza');
    if ('estimatedMinutes' in p) t.estimatedMinutes = minutes(p.estimatedMinutes, 'Tempo stimato');
    if ('actualMinutes' in p) t.actualMinutes = minutes(p.actualMinutes, 'Tempo effettivo');
    if ('notes' in p) t.notes = multiline(p.notes, 10_000, 'Note');
    if ('links' in p) t.links = list(p.links, 'Link');
    if ('tags' in p) t.tags = list(p.tags, 'Tag');
    if ('projectName' in p) t.projectId = this.resolveProject(p.projectName);
    else if ('projectId' in p) {
      const pid = p.projectId == null || p.projectId === '' ? null : String(p.projectId);
      if (pid && !getProject(this.db, pid)) throw new ValidationError('Progetto non trovato.');
      t.projectId = pid;
    }
    return t;
  }

  private templateFromTask(t: Task, existing?: RecurringTemplate | null): RecurringTemplate {
    const now = this.now();
    return {
      id: existing?.id ?? newId(),
      title: t.title,
      description: t.description,
      projectId: t.projectId,
      client: t.client,
      workType: t.workType,
      priority: t.priority,
      baseDueDate: t.dueDate,
      estimatedMinutes: t.estimatedMinutes,
      notes: t.notes,
      links: t.links,
      tags: t.tags,
      active: true,
      lastPeriodKey: existing?.lastPeriodKey ?? periodKey(getSettings(this.db).reportFrequency, this.today()),
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    };
  }

  private createTask(p: Payload): ActionResult {
    const now = this.now();
    const today = this.today();
    const blank: Task = {
      id: newId(),
      title: '',
      description: '',
      projectId: null,
      client: '',
      workType: 'Altro',
      status: 'Da iniziare',
      priority: 'Media',
      createdAt: now,
      startDate: today,
      dueDate: null,
      estimatedMinutes: 60,
      actualMinutes: 0,
      notes: '',
      links: [],
      tags: [],
      archived: false,
      archivedAt: null,
      completedAt: null,
      recurrenceId: null,
      recurrencePeriod: null,
      deletedAt: null,
      updatedAt: now,
    };
    if (!('title' in p)) throw new ValidationError('Il titolo è obbligatorio.');
    const t = this.applyTaskFields(blank, p);
    if (t.status === 'Completato') t.completedAt = now;
    if (p.recurring === true) {
      const tpl = this.templateFromTask(t);
      saveTemplate(this.db, tpl);
      t.recurrenceId = tpl.id;
      t.recurrencePeriod = tpl.lastPeriodKey;
    }
    saveTask(this.db, t);
    this.history(t.id, 'created', t.recurrenceId ? 'Task ricorrente creata' : 'Task creata');
    if (t.status === 'Completato') this.history(t.id, 'completed', 'Task completata');
    return { createdId: t.id };
  }

  private updateTask(p: Payload): ActionResult {
    const before = this.mustTask(requireId(p));
    const t = this.applyTaskFields(before, p);
    const now = this.now();
    t.updatedAt = now;

    if (t.status !== before.status) {
      if (t.status === 'Completato') {
        t.completedAt = before.completedAt ?? now;
        this.history(t.id, 'completed', 'Task completata');
      } else {
        t.completedAt = null;
        this.history(t.id, 'status', `Stato cambiato da «${before.status}» a «${t.status}»`);
      }
    }
    if (t.dueDate !== before.dueDate) {
      this.history(t.id, 'due', t.dueDate ? `Scadenza impostata al ${formatDate(t.dueDate)}` : 'Scadenza rimossa');
    }

    // Ricorrenza
    if ('recurring' in p) {
      const wantRecurring = p.recurring === true;
      if (t.recurrenceId && !wantRecurring) {
        this.db.prepare('UPDATE recurring_templates SET active = 0, updatedAt = ? WHERE id = ?').run(now, t.recurrenceId);
        t.recurrenceId = null;
        t.recurrencePeriod = null;
      } else if (!t.recurrenceId && wantRecurring) {
        const tpl = this.templateFromTask(t);
        saveTemplate(this.db, tpl);
        t.recurrenceId = tpl.id;
        t.recurrencePeriod = tpl.lastPeriodKey;
      }
    }
    if (t.recurrenceId) {
      const existing = getTemplate(this.db, t.recurrenceId);
      const contentChanged = ['title', 'description', 'client', 'workType', 'priority', 'dueDate', 'estimatedMinutes', 'notes', 'links', 'tags', 'projectName', 'projectId'].some(
        (k) => k in p,
      );
      if (existing && existing.active && contentChanged) saveTemplate(this.db, this.templateFromTask(t, existing));
    }
    saveTask(this.db, t);
    return {};
  }

  private duplicateTask(p: Payload): ActionResult {
    const src = this.mustTask(requireId(p));
    const now = this.now();
    const copy: Task = {
      ...src,
      id: newId(),
      title: `${src.title} — copia`.slice(0, 220),
      status: 'Da iniziare',
      actualMinutes: 0,
      completedAt: null,
      archived: false,
      archivedAt: null,
      recurrenceId: null,
      recurrencePeriod: null,
      deletedAt: null,
      createdAt: now,
      updatedAt: now,
    };
    saveTask(this.db, copy);
    this.history(copy.id, 'created', `Task duplicata da «${src.title}»`);
    return { createdId: copy.id };
  }

  private archiveTask(p: Payload): ActionResult {
    const t = this.mustTask(requireId(p));
    if (t.archived) return {};
    const now = this.now();
    this.db.prepare('UPDATE tasks SET archived = 1, archivedAt = ?, updatedAt = ? WHERE id = ?').run(now, now, t.id);
    this.history(t.id, 'archived', 'Task archiviata');
    return {};
  }

  private reopenTask(p: Payload): ActionResult {
    const t = this.mustTask(requireId(p));
    const now = this.now();
    this.db
      .prepare("UPDATE tasks SET archived = 0, archivedAt = NULL, status = 'Da iniziare', completedAt = NULL, updatedAt = ? WHERE id = ?")
      .run(now, t.id);
    this.history(t.id, 'reopened', "Task riaperta dall'archivio");
    return {};
  }

  private deleteTask(p: Payload): ActionResult {
    const t = this.mustTask(requireId(p));
    const now = this.now();
    this.db.prepare('UPDATE tasks SET deletedAt = ?, updatedAt = ? WHERE id = ?').run(now, now, t.id);
    if (t.recurrenceId) this.db.prepare('UPDATE recurring_templates SET active = 0, updatedAt = ? WHERE id = ?').run(now, t.recurrenceId);
    return {};
  }

  private restoreDeletedTask(p: Payload): ActionResult {
    const id = requireId(p);
    const t = getTask(this.db, id);
    if (!t) throw new NotFoundError('Task non trovata.');
    const now = this.now();
    this.db.prepare('UPDATE tasks SET deletedAt = NULL, updatedAt = ? WHERE id = ?').run(now, id);
    if (t.recurrenceId) this.db.prepare('UPDATE recurring_templates SET active = 1, updatedAt = ? WHERE id = ?').run(now, t.recurrenceId);
    this.history(id, 'restored', 'Task ripristinata');
    return {};
  }

  /** Ripristina lo snapshot precedente di una task (e del suo template) per l'Annulla. */
  private restoreTaskSnapshot(p: Payload): ActionResult {
    const snap = p.task as Task | undefined;
    if (!snap || typeof snap !== 'object') throw new ValidationError('Snapshot mancante.');
    const current = getTask(this.db, requireId(snap as unknown as Payload));
    if (!current) throw new NotFoundError('Task non trovata.');
    const restored = this.applyTaskFields(current, {
      title: snap.title,
      description: snap.description,
      client: snap.client,
      workType: snap.workType,
      status: snap.status,
      priority: snap.priority,
      startDate: snap.startDate,
      dueDate: snap.dueDate,
      estimatedMinutes: snap.estimatedMinutes,
      actualMinutes: snap.actualMinutes,
      notes: snap.notes,
      links: snap.links,
      tags: snap.tags,
      projectId: snap.projectId,
    });
    const next: Task = {
      ...restored,
      archived: !!snap.archived,
      archivedAt: snap.archivedAt ?? null,
      completedAt: snap.completedAt ?? null,
      recurrenceId: snap.recurrenceId ?? null,
      recurrencePeriod: snap.recurrencePeriod ?? null,
      deletedAt: snap.deletedAt ?? null,
      updatedAt: this.now(),
    };
    if (current.recurrenceId && current.recurrenceId !== next.recurrenceId) {
      this.db.prepare('UPDATE recurring_templates SET active = 0 WHERE id = ?').run(current.recurrenceId);
    }
    const tplSnap = p.template as RecurringTemplate | null | undefined;
    if (tplSnap && next.recurrenceId === tplSnap.id && getTemplate(this.db, tplSnap.id)) {
      saveTemplate(this.db, { ...tplSnap, links: list(tplSnap.links, 'Link'), tags: list(tplSnap.tags, 'Tag') });
    }
    saveTask(this.db, next);
    this.history(next.id, 'restored', 'Modifica annullata');
    return {};
  }

  // ── Progetti ──

  private applyProjectFields(base: Project, p: Payload): Project {
    const pr = { ...base };
    if ('name' in p) {
      pr.name = text(p.name, 120, 'Nome');
      if (!pr.name) throw new ValidationError('Il nome del progetto è obbligatorio.');
    }
    if ('description' in p) pr.description = multiline(p.description, 5_000, 'Descrizione');
    if ('client' in p) pr.client = text(p.client, 120, 'Cliente o reparto');
    if ('status' in p) pr.status = oneOf<ProjectStatus>(p.status, PROJECT_STATUSES, 'Stato');
    if ('startDate' in p) pr.startDate = optionalDate(p.startDate, 'Data di inizio');
    if ('color' in p) {
      if (typeof p.color !== 'string' || !HEX.test(p.color)) throw new ValidationError('Colore non valido (#RRGGBB).');
      pr.color = p.color.toUpperCase();
    }
    if ('notes' in p) pr.notes = multiline(p.notes, 10_000, 'Note');
    if ('links' in p) pr.links = list(p.links, 'Link');
    return pr;
  }

  private createProject(p: Payload): ActionResult {
    const now = this.now();
    if (!('name' in p)) throw new ValidationError('Il nome del progetto è obbligatorio.');
    const pr = this.applyProjectFields(
      {
        id: newId(),
        name: '',
        description: '',
        client: '',
        startDate: this.today(),
        status: 'In corso',
        color: NEW_PROJECT_COLOR,
        notes: '',
        links: [],
        archived: false,
        dueDate: null,
        createdAt: now,
        updatedAt: now,
        deletedAt: null,
      },
      p,
    );
    saveProject(this.db, pr);
    return { createdId: pr.id };
  }

  private updateProject(p: Payload): ActionResult {
    const id = requireId(p);
    const base = getProject(this.db, id);
    if (!base || base.deletedAt) throw new NotFoundError('Progetto non trovato.');
    saveProject(this.db, { ...this.applyProjectFields(base, p), updatedAt: this.now() });
    return {};
  }

  private deleteProject(p: Payload): ActionResult {
    const id = requireId(p);
    const base = getProject(this.db, id);
    if (!base || base.deletedAt) throw new NotFoundError('Progetto non trovato.');
    const linked = this.db.prepare('SELECT COUNT(*) AS n FROM tasks WHERE projectId = ? AND deletedAt IS NULL').get(id) as { n: number };
    if (linked.n > 0) throw new ValidationError('Sposta o elimina prima le task collegate.');
    this.db.prepare('UPDATE projects SET deletedAt = ?, updatedAt = ? WHERE id = ?').run(this.now(), this.now(), id);
    return {};
  }

  private restoreDeletedProject(p: Payload): ActionResult {
    const id = requireId(p);
    if (!getProject(this.db, id)) throw new NotFoundError('Progetto non trovato.');
    this.db.prepare('UPDATE projects SET deletedAt = NULL, updatedAt = ? WHERE id = ?').run(this.now(), id);
    return {};
  }

  // ── Note ──

  private noteFields(p: Payload) {
    const title = text(p.title, NOTE_TITLE_MAX, 'Titolo');
    if (!title) throw new ValidationError('Il titolo della nota è obbligatorio.');
    try {
      const { html, text: plain } = prepareNoteContent(p.contentHtml);
      return { title, html, plain };
    } catch (err) {
      if (err instanceof RangeError) throw new ValidationError(err.message);
      throw err;
    }
  }

  private createNote(p: Payload): ActionResult {
    const { title, html, plain } = this.noteFields(p);
    const id = newId();
    const now = this.now();
    this.db
      .prepare('INSERT INTO notes (id, title, contentHtml, plainText, pinned, createdAt, updatedAt) VALUES (?, ?, ?, ?, 0, ?, ?)')
      .run(id, title, html, plain, now, now);
    return { createdId: id };
  }

  private updateNote(p: Payload): ActionResult {
    const id = requireId(p);
    const n = getNote(this.db, id);
    if (!n || n.deletedAt) throw new NotFoundError('Nota non trovata.');
    const { title, html, plain } = this.noteFields(p);
    this.db.prepare('UPDATE notes SET title = ?, contentHtml = ?, plainText = ?, updatedAt = ? WHERE id = ?').run(title, html, plain, this.now(), id);
    return {};
  }

  /** Una sola nota fissata: fissarne una toglie il fissaggio alle altre. */
  private pinNote(p: Payload): ActionResult {
    const id = requireId(p);
    const n = getNote(this.db, id);
    if (!n || n.deletedAt) throw new NotFoundError('Nota non trovata.');
    const pinned = p.pinned !== false;
    if (pinned) this.db.prepare('UPDATE notes SET pinned = 0 WHERE pinned = 1').run();
    this.db.prepare('UPDATE notes SET pinned = ? WHERE id = ?').run(pinned ? 1 : 0, id);
    return {};
  }

  private deleteNote(p: Payload): ActionResult {
    const id = requireId(p);
    const n = getNote(this.db, id);
    if (!n || n.deletedAt) throw new NotFoundError('Nota non trovata.');
    this.db.prepare('UPDATE notes SET deletedAt = ? WHERE id = ?').run(this.now(), id);
    return {};
  }

  private restoreDeletedNote(p: Payload): ActionResult {
    const id = requireId(p);
    const n = getNote(this.db, id);
    if (!n) throw new NotFoundError('Nota non trovata.');
    if (n.pinned) {
      const other = this.db.prepare('SELECT id FROM notes WHERE pinned = 1 AND deletedAt IS NULL AND id != ?').get(id);
      if (other) this.db.prepare('UPDATE notes SET pinned = 0 WHERE id = ?').run(id);
    }
    this.db.prepare('UPDATE notes SET deletedAt = NULL WHERE id = ?').run(id);
    return {};
  }

  // ── Report ──

  private generateReport(p: Payload): ActionResult {
    const kind = oneOf(p.kind, ['weekly', 'monthly', 'custom'] as const, 'Tipo di report');
    if (kind === 'custom') {
      const start = optionalDate(p.start, 'Da');
      const end = optionalDate(p.end, 'A');
      if (!start || !end) throw new ValidationError('Indica entrambe le date del periodo.');
      if (start > end) throw new ValidationError('La data iniziale deve precedere quella finale.');
      return this.createReport(start, end, 'custom', 'custom');
    }
    const period = manualReportPeriod(kind, this.today());
    return this.createReport(period.start, period.end, 'manual', kind);
  }

  private mustReport(id: string): Report {
    const r = getReport(this.db, id);
    if (!r || r.deletedAt) throw new NotFoundError('Report non trovato.');
    return r;
  }

  private archiveReport(p: Payload): ActionResult {
    const r = this.mustReport(requireId(p));
    this.db.prepare('UPDATE reports SET archived = 1, archivedAt = ? WHERE id = ?').run(this.now(), r.id);
    return {};
  }

  private reopenReport(p: Payload): ActionResult {
    const r = this.mustReport(requireId(p));
    this.db.prepare('UPDATE reports SET archived = 0, archivedAt = NULL WHERE id = ?').run(r.id);
    return {};
  }

  private deleteReport(p: Payload): ActionResult {
    const r = this.mustReport(requireId(p));
    this.db.prepare('UPDATE reports SET deletedAt = ? WHERE id = ?').run(this.now(), r.id);
    return {};
  }

  private restoreDeletedReport(p: Payload): ActionResult {
    const id = requireId(p);
    if (!getReport(this.db, id)) throw new NotFoundError('Report non trovato.');
    this.db.prepare('UPDATE reports SET deletedAt = NULL WHERE id = ?').run(id);
    return {};
  }

  private restoreReportState(p: Payload): ActionResult {
    const r = this.mustReport(requireId(p));
    const archivedAt = p.archivedAt == null ? null : String(p.archivedAt);
    this.db.prepare('UPDATE reports SET archived = ?, archivedAt = ? WHERE id = ?').run(p.archived ? 1 : 0, p.archived ? archivedAt : null, r.id);
    return {};
  }

  // ── Impostazioni ──

  private updateSettings(p: Payload): ActionResult {
    const cur = getSettings(this.db);
    const next = { ...cur };
    if ('personalName' in p) {
      next.personalName = text(p.personalName, PERSONAL_NAME_MAX, 'Nome personale');
      if (!next.personalName) throw new ValidationError('Il nome personale è obbligatorio.');
    }
    for (const key of ['accentPrimary', 'accentSecondary'] as const) {
      if (key in p) {
        if (typeof p[key] !== 'string' || !HEX.test(p[key] as string)) throw new ValidationError('Colore non valido: usa il formato #RRGGBB.');
        next[key] = (p[key] as string).toUpperCase();
      }
    }
    if ('theme' in p) next.theme = oneOf(p.theme, ['light', 'dark', 'system'] as const, 'Tema');
    if ('reportEnabled' in p) next.reportEnabled = p.reportEnabled === true;
    if ('reportFrequency' in p) next.reportFrequency = oneOf(p.reportFrequency, ['weekly', 'monthly'] as const, 'Frequenza');
    const int = (v: unknown, min: number, max: number, field: string) => {
      const n = Number(v);
      if (!Number.isInteger(n) || n < min || n > max) throw new ValidationError(`«${field}» deve essere un intero tra ${min} e ${max}.`);
      return n;
    };
    if ('reportDay' in p) next.reportDay = int(p.reportDay, 1, 7, 'Giorno del report');
    if ('reportMonthDay' in p) next.reportMonthDay = int(p.reportMonthDay, 1, 31, 'Giorno del mese');
    if ('reportTime' in p) {
      if (typeof p.reportTime !== 'string' || !/^([01]\d|2[0-3]):[0-5]\d$/.test(p.reportTime)) throw new ValidationError('Orario non valido (HH:MM).');
      next.reportTime = p.reportTime;
    }
    if ('emptyReportBehavior' in p) next.emptyReportBehavior = oneOf(p.emptyReportBehavior, ['generate', 'skip'] as const, 'Report vuoti');
    if ('archiveDays' in p) next.archiveDays = int(p.archiveDays, 1, 3650, 'Archivia dopo (giorni)');
    if ('notificationHours' in p) next.notificationHours = int(p.notificationHours, 1, 8760, 'Avviso scadenza (ore)');

    this.db
      .prepare(
        `UPDATE settings SET personalName = ?, accentPrimary = ?, accentSecondary = ?, theme = ?, reportEnabled = ?, reportFrequency = ?,
          reportDay = ?, reportMonthDay = ?, reportTime = ?, emptyReportBehavior = ?, archiveDays = ?, notificationHours = ?, updatedAt = ? WHERE id = 1`,
      )
      .run(
        next.personalName,
        next.accentPrimary,
        next.accentSecondary,
        next.theme,
        next.reportEnabled ? 1 : 0,
        next.reportFrequency,
        next.reportDay,
        next.reportMonthDay,
        next.reportTime,
        next.emptyReportBehavior,
        next.archiveDays,
        next.notificationHours,
        this.now(),
      );

    // Cambio frequenza: il periodo corrente è considerato già coperto per evitare un'istanza immediata.
    if (next.reportFrequency !== cur.reportFrequency) {
      const key = periodKey(next.reportFrequency as Frequency, this.today());
      this.db.prepare('UPDATE recurring_templates SET lastPeriodKey = ? WHERE active = 1').run(key);
    }
    return {};
  }

  // ── Allegati e logo (metadati) ──

  addAttachment(meta: { taskId: string; objectKey: string; fileName: string; contentType: string; size: number }): string {
    this.mustTask(meta.taskId);
    const id = newId();
    this.db
      .prepare('INSERT INTO attachments (id, taskId, objectKey, fileName, contentType, size, createdAt) VALUES (?, ?, ?, ?, ?, ?, ?)')
      .run(id, meta.taskId, meta.objectKey, meta.fileName, meta.contentType, meta.size, this.now());
    return id;
  }

  getAttachment(id: string) {
    return this.db.prepare('SELECT * FROM attachments WHERE id = ?').get(id) as
      | { id: string; taskId: string; objectKey: string; fileName: string; contentType: string; size: number }
      | undefined;
  }

  setLogo(key: string | null, contentType: string | null) {
    const prev = getSettings(this.db).logoKey;
    const now = this.now();
    this.db.prepare('UPDATE settings SET logoKey = ?, logoContentType = ?, logoUpdatedAt = ?, updatedAt = ? WHERE id = 1').run(key, contentType, now, now);
    return prev;
  }

  logo() {
    const s = getSettings(this.db);
    return { key: s.logoKey, contentType: s.logoContentType };
  }
}
