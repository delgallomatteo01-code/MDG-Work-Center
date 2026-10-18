import type { DB } from './db';
import type {
  Attachment,
  HistoryEntry,
  Note,
  Project,
  RecurringTemplate,
  Report,
  Settings,
  Task,
} from '../shared/types';

type Row = Record<string, unknown>;

const arr = (v: unknown): string[] => {
  try {
    const parsed = JSON.parse(String(v ?? '[]'));
    return Array.isArray(parsed) ? parsed.map(String) : [];
  } catch {
    return [];
  }
};
const str = (v: unknown) => (v == null ? '' : String(v));
const strOrNull = (v: unknown) => (v == null || v === '' ? null : String(v));
const num = (v: unknown) => Number(v ?? 0);
const bool = (v: unknown) => Number(v) === 1;

export function mapTask(r: Row): Task {
  return {
    id: str(r.id),
    title: str(r.title),
    description: str(r.description),
    projectId: strOrNull(r.projectId),
    client: str(r.client),
    workType: str(r.workType),
    status: str(r.status) as Task['status'],
    priority: str(r.priority) as Task['priority'],
    createdAt: str(r.createdAt),
    startDate: strOrNull(r.startDate),
    dueDate: strOrNull(r.dueDate),
    estimatedMinutes: num(r.estimatedMinutes),
    actualMinutes: num(r.actualMinutes),
    notes: str(r.notes),
    links: arr(r.links),
    tags: arr(r.tags),
    archived: bool(r.archived),
    archivedAt: strOrNull(r.archivedAt),
    completedAt: strOrNull(r.completedAt),
    recurrenceId: strOrNull(r.recurrenceId),
    recurrencePeriod: strOrNull(r.recurrencePeriod),
    deletedAt: strOrNull(r.deletedAt),
    updatedAt: str(r.updatedAt),
  };
}

export function mapProject(r: Row): Project {
  return {
    id: str(r.id),
    name: str(r.name),
    description: str(r.description),
    client: str(r.client),
    startDate: strOrNull(r.startDate),
    status: str(r.status) as Project['status'],
    color: str(r.color),
    notes: str(r.notes),
    links: arr(r.links),
    archived: bool(r.archived),
    dueDate: strOrNull(r.dueDate),
    createdAt: str(r.createdAt),
    updatedAt: str(r.updatedAt),
    deletedAt: strOrNull(r.deletedAt),
  };
}

export function mapTemplate(r: Row): RecurringTemplate {
  return {
    id: str(r.id),
    title: str(r.title),
    description: str(r.description),
    projectId: strOrNull(r.projectId),
    client: str(r.client),
    workType: str(r.workType),
    priority: str(r.priority) as RecurringTemplate['priority'],
    baseDueDate: strOrNull(r.baseDueDate),
    estimatedMinutes: num(r.estimatedMinutes),
    notes: str(r.notes),
    links: arr(r.links),
    tags: arr(r.tags),
    active: bool(r.active),
    lastPeriodKey: strOrNull(r.lastPeriodKey),
    createdAt: str(r.createdAt),
    updatedAt: str(r.updatedAt),
  };
}

export function mapReport(r: Row): Report {
  return {
    id: str(r.id),
    periodStart: str(r.periodStart),
    periodEnd: str(r.periodEnd),
    status: str(r.status),
    taskCount: num(r.taskCount),
    totalMinutes: num(r.totalMinutes),
    estimatedMinutes: num(r.estimatedMinutes),
    projectCount: num(r.projectCount),
    htmlContent: str(r.htmlContent),
    plainText: str(r.plainText),
    source: str(r.source) as Report['source'],
    frequency: str(r.frequency) as Report['frequency'],
    archived: bool(r.archived),
    archivedAt: strOrNull(r.archivedAt),
    deletedAt: strOrNull(r.deletedAt),
    createdAt: str(r.createdAt),
  };
}

export function mapNote(r: Row): Note {
  return {
    id: str(r.id),
    title: str(r.title),
    contentHtml: str(r.contentHtml),
    plainText: str(r.plainText),
    pinned: bool(r.pinned),
    deletedAt: strOrNull(r.deletedAt),
    createdAt: str(r.createdAt),
    updatedAt: str(r.updatedAt),
  };
}

export interface SettingsRow extends Settings {
  logoKey: string | null;
  logoContentType: string | null;
}

export function getSettings(db: DB): SettingsRow {
  const r = db.prepare('SELECT * FROM settings WHERE id = 1').get() as Row;
  return {
    personalName: str(r.personalName),
    logoKey: strOrNull(r.logoKey),
    logoContentType: strOrNull(r.logoContentType),
    hasCustomLogo: !!r.logoKey,
    logoUpdatedAt: strOrNull(r.logoUpdatedAt),
    accentPrimary: str(r.accentPrimary),
    accentSecondary: str(r.accentSecondary),
    theme: str(r.theme) as Settings['theme'],
    reportEnabled: bool(r.reportEnabled),
    reportFrequency: str(r.reportFrequency) as Settings['reportFrequency'],
    reportDay: num(r.reportDay),
    reportMonthDay: num(r.reportMonthDay),
    reportTime: str(r.reportTime),
    reportTimezone: str(r.reportTimezone),
    emptyReportBehavior: str(r.emptyReportBehavior) as Settings['emptyReportBehavior'],
    archiveDays: num(r.archiveDays),
    notificationHours: num(r.notificationHours),
    updatedAt: str(r.updatedAt),
  };
}

export function publicSettings(s: SettingsRow): Settings {
  const { logoKey: _k, logoContentType: _c, ...rest } = s;
  return rest;
}

export const getTask = (db: DB, id: string): Task | null => {
  const r = db.prepare('SELECT * FROM tasks WHERE id = ?').get(id) as Row | undefined;
  return r ? mapTask(r) : null;
};
export const getProject = (db: DB, id: string): Project | null => {
  const r = db.prepare('SELECT * FROM projects WHERE id = ?').get(id) as Row | undefined;
  return r ? mapProject(r) : null;
};
export const getTemplate = (db: DB, id: string): RecurringTemplate | null => {
  const r = db.prepare('SELECT * FROM recurring_templates WHERE id = ?').get(id) as Row | undefined;
  return r ? mapTemplate(r) : null;
};
export const getReport = (db: DB, id: string): Report | null => {
  const r = db.prepare('SELECT * FROM reports WHERE id = ?').get(id) as Row | undefined;
  return r ? mapReport(r) : null;
};
export const getNote = (db: DB, id: string): Note | null => {
  const r = db.prepare('SELECT * FROM notes WHERE id = ?').get(id) as Row | undefined;
  return r ? mapNote(r) : null;
};

export const allTasks = (db: DB) => (db.prepare('SELECT * FROM tasks').all() as Row[]).map(mapTask);
export const allProjects = (db: DB) => (db.prepare('SELECT * FROM projects').all() as Row[]).map(mapProject);

const TASK_COLS = [
  'id', 'title', 'description', 'projectId', 'client', 'workType', 'status', 'priority', 'createdAt',
  'startDate', 'dueDate', 'estimatedMinutes', 'actualMinutes', 'notes', 'links', 'tags', 'archived',
  'archivedAt', 'completedAt', 'recurrenceId', 'recurrencePeriod', 'deletedAt', 'updatedAt',
] as const;

const PROJECT_COLS = [
  'id', 'name', 'description', 'client', 'startDate', 'status', 'color', 'notes', 'links', 'archived',
  'dueDate', 'createdAt', 'updatedAt', 'deletedAt',
] as const;

const TEMPLATE_COLS = [
  'id', 'title', 'description', 'projectId', 'client', 'workType', 'priority', 'baseDueDate',
  'estimatedMinutes', 'notes', 'links', 'tags', 'active', 'lastPeriodKey', 'createdAt', 'updatedAt',
] as const;

function toDb(v: unknown): string | number | null {
  if (v === undefined || v === null) return null;
  if (typeof v === 'boolean') return v ? 1 : 0;
  if (Array.isArray(v)) return JSON.stringify(v);
  if (typeof v === 'number') return v;
  return String(v);
}

function upsert(db: DB, table: string, cols: readonly string[], obj: Record<string, unknown>, orIgnore = false) {
  const sql = `INSERT ${orIgnore ? 'OR IGNORE ' : ''}INTO ${table} (${cols.join(', ')}) VALUES (${cols
    .map(() => '?')
    .join(', ')})${orIgnore ? '' : ` ON CONFLICT(id) DO UPDATE SET ${cols.filter((c) => c !== 'id').map((c) => `${c} = excluded.${c}`).join(', ')}`}`;
  return db.prepare(sql).run(...cols.map((c) => toDb(obj[c])));
}

export const saveTask = (db: DB, t: Task, orIgnore = false) => upsert(db, 'tasks', TASK_COLS, t as never, orIgnore);
export const saveProject = (db: DB, p: Project) => upsert(db, 'projects', PROJECT_COLS, p as never);
export const saveTemplate = (db: DB, t: RecurringTemplate) => upsert(db, 'recurring_templates', TEMPLATE_COLS, t as never);

export function loadAll(db: DB) {
  const tasks = (db.prepare('SELECT * FROM tasks WHERE deletedAt IS NULL ORDER BY updatedAt DESC').all() as Row[]).map(mapTask);
  const projects = (db.prepare('SELECT * FROM projects WHERE deletedAt IS NULL ORDER BY updatedAt DESC').all() as Row[]).map(
    mapProject,
  );
  const templates = (db.prepare('SELECT * FROM recurring_templates ORDER BY updatedAt DESC').all() as Row[]).map(mapTemplate);
  const history = db
    .prepare('SELECT h.* FROM task_history h JOIN tasks t ON t.id = h.taskId WHERE t.deletedAt IS NULL ORDER BY h.createdAt DESC, h.rowid DESC')
    .all() as unknown as HistoryEntry[];
  const attachments = db
    .prepare(
      'SELECT a.id, a.taskId, a.fileName, a.contentType, a.size, a.createdAt FROM attachments a JOIN tasks t ON t.id = a.taskId WHERE t.deletedAt IS NULL ORDER BY a.createdAt DESC',
    )
    .all() as unknown as Attachment[];
  const reports = (db.prepare('SELECT * FROM reports WHERE deletedAt IS NULL ORDER BY createdAt DESC').all() as Row[]).map(mapReport);
  const notes = (db.prepare('SELECT * FROM notes WHERE deletedAt IS NULL ORDER BY pinned DESC, updatedAt DESC').all() as Row[]).map(
    mapNote,
  );
  return { tasks, projects, templates, history, attachments, reports, notes, settings: publicSettings(getSettings(db)) };
}
