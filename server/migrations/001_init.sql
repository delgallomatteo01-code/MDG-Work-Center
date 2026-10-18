-- Matteo Work center — schema iniziale (SQLite)
CREATE TABLE IF NOT EXISTS meta (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS projects (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  client TEXT NOT NULL DEFAULT '',
  startDate TEXT,
  status TEXT NOT NULL DEFAULT 'In corso',
  color TEXT NOT NULL DEFAULT '#EA684A',
  notes TEXT NOT NULL DEFAULT '',
  links TEXT NOT NULL DEFAULT '[]',
  archived INTEGER NOT NULL DEFAULT 0,
  dueDate TEXT,
  createdAt TEXT NOT NULL,
  updatedAt TEXT NOT NULL,
  deletedAt TEXT
);

CREATE TABLE IF NOT EXISTS recurring_templates (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  projectId TEXT REFERENCES projects(id),
  client TEXT NOT NULL DEFAULT '',
  workType TEXT NOT NULL DEFAULT 'Altro',
  priority TEXT NOT NULL DEFAULT 'Media',
  baseDueDate TEXT,
  estimatedMinutes INTEGER NOT NULL DEFAULT 60,
  notes TEXT NOT NULL DEFAULT '',
  links TEXT NOT NULL DEFAULT '[]',
  tags TEXT NOT NULL DEFAULT '[]',
  active INTEGER NOT NULL DEFAULT 1,
  lastPeriodKey TEXT,
  createdAt TEXT NOT NULL,
  updatedAt TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS tasks (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  projectId TEXT REFERENCES projects(id),
  client TEXT NOT NULL DEFAULT '',
  workType TEXT NOT NULL DEFAULT 'Altro',
  status TEXT NOT NULL DEFAULT 'Da iniziare',
  priority TEXT NOT NULL DEFAULT 'Media',
  createdAt TEXT NOT NULL,
  startDate TEXT,
  dueDate TEXT,
  estimatedMinutes INTEGER NOT NULL DEFAULT 60,
  actualMinutes INTEGER NOT NULL DEFAULT 0,
  notes TEXT NOT NULL DEFAULT '',
  links TEXT NOT NULL DEFAULT '[]',
  tags TEXT NOT NULL DEFAULT '[]',
  archived INTEGER NOT NULL DEFAULT 0,
  archivedAt TEXT,
  completedAt TEXT,
  recurrenceId TEXT REFERENCES recurring_templates(id),
  recurrencePeriod TEXT,
  deletedAt TEXT,
  updatedAt TEXT NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS tasks_recurrence_unique ON tasks(recurrenceId, recurrencePeriod)
  WHERE recurrenceId IS NOT NULL AND recurrencePeriod IS NOT NULL;
CREATE INDEX IF NOT EXISTS tasks_project ON tasks(projectId);

CREATE TABLE IF NOT EXISTS task_history (
  id TEXT PRIMARY KEY,
  taskId TEXT NOT NULL REFERENCES tasks(id),
  eventType TEXT NOT NULL,
  message TEXT NOT NULL,
  createdAt TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS history_task ON task_history(taskId, createdAt);

CREATE TABLE IF NOT EXISTS attachments (
  id TEXT PRIMARY KEY,
  taskId TEXT NOT NULL REFERENCES tasks(id),
  objectKey TEXT NOT NULL,
  fileName TEXT NOT NULL,
  contentType TEXT NOT NULL,
  size INTEGER NOT NULL,
  createdAt TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS reports (
  id TEXT PRIMARY KEY,
  periodStart TEXT NOT NULL,
  periodEnd TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'generated',
  taskCount INTEGER NOT NULL DEFAULT 0,
  totalMinutes INTEGER NOT NULL DEFAULT 0,
  estimatedMinutes INTEGER NOT NULL DEFAULT 0,
  projectCount INTEGER NOT NULL DEFAULT 0,
  htmlContent TEXT NOT NULL,
  plainText TEXT NOT NULL,
  source TEXT NOT NULL,
  frequency TEXT NOT NULL,
  archived INTEGER NOT NULL DEFAULT 0,
  archivedAt TEXT,
  deletedAt TEXT,
  createdAt TEXT NOT NULL,
  sentAt TEXT,
  errorMessage TEXT
);
CREATE UNIQUE INDEX IF NOT EXISTS reports_automatic_unique ON reports(periodStart, periodEnd) WHERE source = 'automatic';

CREATE TABLE IF NOT EXISTS notes (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  contentHtml TEXT NOT NULL DEFAULT '',
  plainText TEXT NOT NULL DEFAULT '',
  pinned INTEGER NOT NULL DEFAULT 0,
  deletedAt TEXT,
  createdAt TEXT NOT NULL,
  updatedAt TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS settings (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  personalName TEXT NOT NULL DEFAULT 'Matteo',
  logoKey TEXT,
  logoContentType TEXT,
  logoUpdatedAt TEXT,
  accentPrimary TEXT NOT NULL DEFAULT '#CA4144',
  accentSecondary TEXT NOT NULL DEFAULT '#EA684A',
  theme TEXT NOT NULL DEFAULT 'light',
  reportEnabled INTEGER NOT NULL DEFAULT 1,
  reportFrequency TEXT NOT NULL DEFAULT 'weekly',
  reportDay INTEGER NOT NULL DEFAULT 5,
  reportMonthDay INTEGER NOT NULL DEFAULT 1,
  reportTime TEXT NOT NULL DEFAULT '15:00',
  reportTimezone TEXT NOT NULL DEFAULT 'Europe/Rome',
  emptyReportBehavior TEXT NOT NULL DEFAULT 'generate',
  archiveDays INTEGER NOT NULL DEFAULT 7,
  notificationHours INTEGER NOT NULL DEFAULT 48,
  updatedAt TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS sessions (
  idHash TEXT PRIMARY KEY,
  email TEXT NOT NULL,
  createdAt TEXT NOT NULL,
  expiresAt TEXT NOT NULL
);
