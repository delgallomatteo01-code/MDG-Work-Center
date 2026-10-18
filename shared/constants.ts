export const TASK_STATUSES = ['Da iniziare', 'In corso', 'In revisione', 'In attesa', 'Completato'] as const;
export type TaskStatus = (typeof TASK_STATUSES)[number];

export const PROJECT_STATUSES = ['Da iniziare', 'In corso', 'In attesa', 'Completato'] as const;
export type ProjectStatus = (typeof PROJECT_STATUSES)[number];

export const PRIORITIES = ['Bassa', 'Media', 'Alta', 'Urgente'] as const;
export type Priority = (typeof PRIORITIES)[number];

export const PRIORITY_WEIGHT: Record<Priority, number> = { Bassa: 1, Media: 2, Alta: 3, Urgente: 4 };

export const WORK_TYPES = [
  'Grafica social',
  'Banner',
  'Newsletter',
  'Landing page',
  'UI/UX',
  'Brochure',
  'Catalogo',
  'Branding',
  'Stampa',
  'Modifica sito',
  'Traduzioni',
  'HTML/CSS',
  'Revisione',
  'Altro',
] as const;
export type WorkType = (typeof WORK_TYPES)[number];

/** Convenzione: avanzamento della singola task in base allo stato (non al tempo). */
export const STATUS_PROGRESS: Record<TaskStatus, number> = {
  'Da iniziare': 0,
  'In corso': 45,
  'In attesa': 60,
  'In revisione': 80,
  Completato: 100,
};

export const DEFAULT_ACCENT_PRIMARY = '#CA4144';
export const DEFAULT_ACCENT_SECONDARY = '#EA684A';
export const NEW_PROJECT_COLOR = '#EA684A';
export const TIMEZONE = 'Europe/Rome';

export const MAX_ATTACHMENT_BYTES = 15 * 1024 * 1024;
export const MAX_LOGO_BYTES = 4 * 1024 * 1024;
export const NOTE_TITLE_MAX = 160;
export const NOTE_HTML_MAX = 50_000;
export const NOTE_TEXT_MAX = 20_000;
export const PERSONAL_NAME_MAX = 40;

/**
 * Anomalia del riferimento: il report seleziona le task per stato e data di completamento
 * senza escludere quelle eliminate logicamente. Mantenuto per fedeltà; impostare a true
 * per applicare la correzione proposta (esclusione delle task con deletedAt).
 */
export const REPORT_EXCLUDE_DELETED_TASKS = false;
