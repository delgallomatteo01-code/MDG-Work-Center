import type { Priority, ProjectStatus, TaskStatus } from './constants';

export interface Task {
  id: string;
  title: string;
  description: string;
  projectId: string | null;
  client: string;
  workType: string;
  status: TaskStatus;
  priority: Priority;
  createdAt: string;
  startDate: string | null;
  dueDate: string | null;
  estimatedMinutes: number;
  actualMinutes: number;
  notes: string;
  links: string[];
  tags: string[];
  archived: boolean;
  archivedAt: string | null;
  completedAt: string | null;
  recurrenceId: string | null;
  recurrencePeriod: string | null;
  deletedAt: string | null;
  updatedAt: string;
}

export interface Project {
  id: string;
  name: string;
  description: string;
  client: string;
  startDate: string | null;
  status: ProjectStatus;
  color: string;
  notes: string;
  links: string[];
  archived: boolean;
  dueDate: string | null;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
}

export interface RecurringTemplate {
  id: string;
  title: string;
  description: string;
  projectId: string | null;
  client: string;
  workType: string;
  priority: Priority;
  baseDueDate: string | null;
  estimatedMinutes: number;
  notes: string;
  links: string[];
  tags: string[];
  active: boolean;
  lastPeriodKey: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface HistoryEntry {
  id: string;
  taskId: string;
  eventType: string;
  message: string;
  createdAt: string;
}

export interface Attachment {
  id: string;
  taskId: string;
  fileName: string;
  contentType: string;
  size: number;
  createdAt: string;
}

export type ReportSource = 'automatic' | 'manual' | 'custom';
export type ReportFrequency = 'weekly' | 'monthly' | 'custom';

export interface Report {
  id: string;
  periodStart: string;
  periodEnd: string;
  status: string;
  taskCount: number;
  totalMinutes: number;
  estimatedMinutes: number;
  projectCount: number;
  htmlContent: string;
  plainText: string;
  source: ReportSource;
  frequency: ReportFrequency;
  archived: boolean;
  archivedAt: string | null;
  deletedAt: string | null;
  createdAt: string;
  sentAt?: string | null;
  errorMessage?: string | null;
}

export interface Note {
  id: string;
  title: string;
  contentHtml: string;
  plainText: string;
  pinned: boolean;
  deletedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export type ThemeSetting = 'light' | 'dark' | 'system';

export interface Settings {
  personalName: string;
  hasCustomLogo: boolean;
  logoUpdatedAt: string | null;
  accentPrimary: string;
  accentSecondary: string;
  theme: ThemeSetting;
  reportEnabled: boolean;
  reportFrequency: 'weekly' | 'monthly';
  reportDay: number;
  reportMonthDay: number;
  reportTime: string;
  reportTimezone: string;
  emptyReportBehavior: 'generate' | 'skip';
  archiveDays: number;
  notificationHours: number;
  updatedAt: string;
}

export interface AppData {
  tasks: Task[];
  projects: Project[];
  templates: RecurringTemplate[];
  history: HistoryEntry[];
  attachments: Attachment[];
  reports: Report[];
  notes: Note[];
  settings: Settings;
  user: { email: string };
}
