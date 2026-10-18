import { PRIORITY_WEIGHT, type Priority, type TaskStatus } from '../shared/constants';
import { addDays, romeDateOf, todayRome } from '../shared/dates';
import type { Project, Report, Task } from '../shared/types';

export type Section = 'dashboard' | 'tasks' | 'projects' | 'calendar' | 'archive' | 'reports' | 'notes' | 'settings';

export const SECTIONS: { id: Section; label: string }[] = [
  { id: 'dashboard', label: 'Dashboard' },
  { id: 'tasks', label: 'Le mie task' },
  { id: 'projects', label: 'Progetti' },
  { id: 'calendar', label: 'Calendario' },
  { id: 'archive', label: 'Archivio' },
  { id: 'reports', label: 'Report' },
  { id: 'notes', label: 'Note' },
  { id: 'settings', label: 'Impostazioni' },
];

export type QuickFilter = 'all' | 'today' | 'week' | 'overdue' | 'urgent' | 'review' | 'recent';
export const QUICK_FILTERS: { id: QuickFilter; label: string }[] = [
  { id: 'all', label: 'Tutte' },
  { id: 'today', label: 'Oggi' },
  { id: 'week', label: 'Questa settimana' },
  { id: 'overdue', label: 'Scadute' },
  { id: 'urgent', label: 'Urgenti' },
  { id: 'review', label: 'In revisione' },
  { id: 'recent', label: 'Completate recentemente' },
];

export const today = () => todayRome();

export const isOpen = (t: Task) => t.status !== 'Completato';
export const isOverdue = (t: Task, now = today()) => !!t.dueDate && t.dueDate < now && isOpen(t);

export function matchesQuick(t: Task, f: QuickFilter, now = today()): boolean {
  switch (f) {
    case 'all':
      return true;
    case 'today':
      return t.dueDate === now;
    case 'week':
      return !!t.dueDate && t.dueDate >= now && t.dueDate <= addDays(now, 7);
    case 'overdue':
      return isOverdue(t, now);
    case 'urgent':
      return t.priority === 'Urgente';
    case 'review':
      return t.status === 'In revisione';
    case 'recent': {
      if (!t.completedAt) return false;
      return new Date(t.completedAt).getTime() >= Date.now() - 7 * 86_400_000;
    }
  }
}

export type SortKey = 'due' | 'priority' | 'created';

export function sortTasks(list: Task[], key: SortKey): Task[] {
  const copy = [...list];
  if (key === 'due') copy.sort((a, b) => cmpDue(a.dueDate, b.dueDate));
  if (key === 'priority') copy.sort((a, b) => PRIORITY_WEIGHT[b.priority] - PRIORITY_WEIGHT[a.priority] || cmpDue(a.dueDate, b.dueDate));
  if (key === 'created') copy.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  return copy;
}

export function cmpDue(a: string | null, b: string | null) {
  if (a === b) return 0;
  if (!a) return 1;
  if (!b) return -1;
  return a.localeCompare(b);
}

/** Focus: priorità decrescente, poi scadenza crescente (senza scadenza in fondo). */
export function focusTasks(tasks: Task[]): Task[] {
  return tasks
    .filter(isOpen)
    .sort((a, b) => PRIORITY_WEIGHT[b.priority] - PRIORITY_WEIGHT[a.priority] || cmpDue(a.dueDate, b.dueDate))
    .slice(0, 5);
}

export const STATUS_COLOR: Record<TaskStatus, string> = {
  'Da iniziare': 'var(--status-todo)',
  'In corso': 'var(--status-doing)',
  'In revisione': 'var(--status-review)',
  'In attesa': 'var(--status-wait)',
  Completato: 'var(--success)',
};

export const PRIORITY_COLOR: Record<Priority, string> = {
  Bassa: 'var(--prio-low)',
  Media: 'var(--prio-medium)',
  Alta: 'var(--prio-high)',
  Urgente: 'var(--prio-urgent)',
};

export function projectOf(projects: Project[], id: string | null) {
  return id ? projects.find((p) => p.id === id) ?? null : null;
}

/** Report in archivio: archiviati esplicitamente o con periodo concluso. */
export const isArchivedReport = (r: Report, now = today()) => r.archived || r.periodEnd < now;

export function completedInRomeRange(t: Task, start: string, end: string) {
  const d = romeDateOf(t.completedAt);
  return !!d && d >= start && d <= end;
}

export function initials(name: string) {
  return name.trim().slice(0, 2).toUpperCase() || '··';
}

export function splitList(s: string): string[] {
  return s
    .split(',')
    .map((x) => x.trim())
    .filter(Boolean);
}

export function safeHref(link: string): string | null {
  const s = link.trim();
  if (/^(https?:|mailto:)/i.test(s)) return s;
  if (/^[\w.-]+\.[a-z]{2,}(\/.*)?$/i.test(s)) return `https://${s}`;
  return null;
}

export function cx(...parts: (string | false | null | undefined)[]) {
  return parts.filter(Boolean).join(' ');
}
