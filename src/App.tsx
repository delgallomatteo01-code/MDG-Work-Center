import { useEffect, useMemo, useState } from 'react';
import {
  Archive,
  ArrowRight,
  CalendarDays,
  FileText,
  FolderKanban,
  LayoutDashboard,
  ListTodo,
  Loader2,
  LogOut,
  Menu,
  NotebookPen,
  Plus,
  Settings as SettingsIcon,
  X,
} from 'lucide-react';
import { api } from './api';
import { useStore } from './store';
import { SECTIONS, cx, initials, isArchivedReport, type Section } from './lib';
import { formatLongDate, formatRange, todayRome } from '../shared/dates';
import { reportTypeLabel } from '../shared/report';
import type { Settings } from '../shared/types';
import { Dashboard } from './views/Dashboard';
import { TasksView } from './views/Tasks';
import { ProjectsView } from './views/Projects';
import { CalendarPage } from './views/CalendarPage';
import { ArchiveView } from './views/Archive';
import { ReportsView } from './views/Reports';
import { NotesView } from './views/Notes';
import { SettingsView } from './views/Settings';
import { ModalHost } from './modals/ModalHost';
import { Toasts } from './components/Toasts';
import { rememberLogo } from './logoCache';

const ICONS: Record<Section, typeof LayoutDashboard> = {
  dashboard: LayoutDashboard,
  tasks: ListTodo,
  projects: FolderKanban,
  calendar: CalendarDays,
  archive: Archive,
  reports: FileText,
  notes: NotebookPen,
  settings: SettingsIcon,
};

export const logoUrl = (s: Settings) => api.logoSrc(s);

function useThemeAndBrand() {
  const { data } = useStore();
  const { theme, accentPrimary, accentSecondary } = data.settings;
  const logo = logoUrl(data.settings);
  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const apply = () => {
      const dark = theme === 'dark' || (theme === 'system' && mq.matches);
      document.documentElement.dataset.theme = dark ? 'dark' : 'light';
    };
    apply();
    try {
      localStorage.setItem('wc-theme', theme);
    } catch {
      /* storage non disponibile */
    }
    mq.addEventListener('change', apply);
    return () => mq.removeEventListener('change', apply);
  }, [theme]);
  useEffect(() => {
    const root = document.documentElement.style;
    root.setProperty('--accent', accentPrimary);
    root.setProperty('--accent-2', accentSecondary);
  }, [accentPrimary, accentSecondary]);
  useEffect(() => {
    const link = document.getElementById('favicon') as HTMLLinkElement | null;
    if (link) link.href = logo;
    rememberLogo(data.settings.hasCustomLogo ? logo : null);
  }, [logo, data.settings.hasCustomLogo]);
}

export function App({ onLogout }: { onLogout: () => void }) {
  const { data, section, navigate, setQuickFilter, saving, openModal, toast } = useStore();
  const [menuOpen, setMenuOpen] = useState(false);
  useThemeAndBrand();

  const today = todayRome();
  const counts = useMemo(() => {
    const reports = data.reports.filter((r) => !r.archived).length;
    const archive = data.tasks.filter((t) => t.archived).length + data.reports.filter((r) => isArchivedReport(r, today)).length;
    return { reports, archive } as Partial<Record<Section, number>>;
  }, [data.reports, data.tasks, today]);

  const lastReport = useMemo(() => [...data.reports].sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0] ?? null, [data.reports]);

  function go(s: Section) {
    // Il clic diretto su "Le mie task" ripristina il filtro rapido Tutte.
    if (s === 'tasks') setQuickFilter('all');
    navigate(s);
    setMenuOpen(false);
  }

  async function logout() {
    try {
      await api.logout();
      onLogout();
    } catch (err) {
      toast((err as Error).message, { tone: 'error' });
    }
  }

  const label = SECTIONS.find((s) => s.id === section)!.label;
  const isDash = section === 'dashboard';

  return (
    <div className="app">
      <div className={cx('overlay', menuOpen && 'show')} onClick={() => setMenuOpen(false)} />
      <aside className={cx('sidebar', menuOpen && 'open')} aria-label="Navigazione">
        <div className="brand">
          <img src={logoUrl(data.settings)} alt="Logo" />
          <strong>Work center</strong>
          <button className="icon-btn sidebar-close" onClick={() => setMenuOpen(false)} aria-label="Chiudi menu">
            <X size={18} />
          </button>
        </div>
        <div className="eyebrow">Workspace</div>
        <nav className="nav">
          {SECTIONS.map((s) => {
            const Icon = ICONS[s.id];
            const n = counts[s.id];
            return (
              <button key={s.id} className={cx(section === s.id && 'active')} onClick={() => go(s.id)} aria-current={section === s.id ? 'page' : undefined}>
                <Icon size={18} />
                {s.label}
                {!!n && <span className="count-badge">{n}</span>}
              </button>
            );
          })}
        </nav>
        <div className="sidebar-bottom">
          <div className="last-report">
            <div className="eyebrow">Ultimo report generato</div>
            {lastReport ? (
              <>
                <strong>{reportTypeLabel(lastReport.source, lastReport.frequency)}</strong>
                <p>
                  {formatRange(lastReport.periodStart, lastReport.periodEnd)} · {lastReport.taskCount} task
                </p>
                <button
                  onClick={() => {
                    openModal({ kind: 'report', id: lastReport.id });
                    setMenuOpen(false);
                  }}
                >
                  Apri report <ArrowRight size={14} />
                </button>
              </>
            ) : (
              <>
                <strong>Nessun report</strong>
                <p>Genera il primo report dalle attività completate.</p>
                <button onClick={() => go('reports')}>
                  Vai ai report <ArrowRight size={14} />
                </button>
              </>
            )}
          </div>
          <div className="profile">
            <div className="avatar">{initials(data.settings.personalName).charAt(0)}</div>
            <div className="profile-info">
              <strong>{data.settings.personalName}</strong>
              <span title={data.user.email}>{data.user.email}</span>
            </div>
            {api.canLogout && (
              <button className="icon-btn" onClick={logout} aria-label="Esci" title="Esci">
                <LogOut size={17} />
              </button>
            )}
          </div>
        </div>
      </aside>

      <div className="main">
        <header className={cx('topbar', isDash && 'compact')}>
          <button className="icon-btn bordered hamburger" onClick={() => setMenuOpen(true)} aria-label="Apri menu">
            <Menu size={18} />
          </button>
          <div className="topbar-title">
            <div className="date">{formatLongDate(today)}</div>
            <h1>{isDash ? `Buongiorno, ${data.settings.personalName}.` : label}</h1>
          </div>
          {saving && (
            <span className="saving" aria-live="polite">
              <Loader2 size={14} className="spin" /> Salvataggio…
            </span>
          )}
          {isDash && <DashboardReportActions />}
          <div className="topbar-actions">
            <button className="btn btn-primary" aria-label="Nuova task" onClick={() => openModal({ kind: 'taskEditor', id: null })}>
              <Plus size={17} />
              <span className="btn-label">Nuova task</span>
            </button>
          </div>
        </header>
        <main className={cx('content', isDash && 'dash')}>
          {section === 'dashboard' && <Dashboard />}
          {section === 'tasks' && <TasksView />}
          {section === 'projects' && <ProjectsView />}
          {section === 'calendar' && <CalendarPage />}
          {section === 'archive' && <ArchiveView />}
          {section === 'reports' && <ReportsView />}
          {section === 'notes' && <NotesView />}
          {section === 'settings' && <SettingsView />}
        </main>
      </div>
      <ModalHost />
      <Toasts />
    </div>
  );
}

/** Selettore Settimanale/Mensile della dashboard: vale solo per la generazione manuale. */
function DashboardReportActions() {
  const { data, act } = useStore();
  const [kind, setKind] = useState<'weekly' | 'monthly'>(data.settings.reportFrequency);
  return (
    <div className="topbar-actions dash-actions">
      <div className="segmented" role="group" aria-label="Frequenza report manuale">
        <button className={cx(kind === 'weekly' && 'active')} onClick={() => setKind('weekly')}>
          Settimanale
        </button>
        <button className={cx(kind === 'monthly' && 'active')} onClick={() => setKind('monthly')}>
          Mensile
        </button>
      </div>
      <button
        className="btn"
        aria-label="Genera report"
        onClick={() =>
          act('generateReport', { kind }, {
            success: (r) => (r.skipped ? r.message ?? 'Report non creato' : 'Report generato'),
            undo: (r) => (r.createdId ? { action: 'deleteReport', payload: { id: r.createdId } } : null),
          }).catch(() => undefined)
        }
      >
        <FileText size={16} />
        <span className="btn-label">Genera report</span>
      </button>
    </div>
  );
}
