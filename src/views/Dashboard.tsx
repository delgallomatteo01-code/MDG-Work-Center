import { useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, ArrowRight, CalendarRange, CheckCircle2, Copy, Flame, Inbox, Sparkles } from 'lucide-react';
import { useStore } from '../store';
import { TASK_STATUSES } from '../../shared/constants';
import { addDays, formatDate, monthStart, romeDateOf, weekStart } from '../../shared/dates';
import { STATUS_COLOR, focusTasks, isOpen, isOverdue, projectOf, today as getToday } from '../lib';
import { Due, Empty, PriorityBadge, ProgressBar, taskProgress } from '../components/ui';
import { copyText } from '../clipboard';
import type { Report } from '../../shared/types';

export function Dashboard() {
  const { data, navigate, openModal, toast } = useStore();
  const today = getToday();
  const active = useMemo(() => data.tasks.filter((t) => !t.archived), [data.tasks]);

  const stats = useMemo(() => {
    const open = active.filter(isOpen);
    const dueToday = open.filter((t) => t.dueDate === today).length;
    const overdue = open.filter((t) => isOverdue(t, today)).length;
    const next7 = open.filter((t) => t.dueDate && t.dueDate >= today && t.dueDate <= addDays(today, 7)).length;
    const urgent = open.filter((t) => t.priority === 'Urgente').length;
    const month = monthStart(today);
    const completedMonth = active.filter((t) => {
      const d = t.status === 'Completato' ? romeDateOf(t.completedAt) : null;
      return !!d && d >= month && d <= today;
    }).length;
    const completedAll = active.filter((t) => t.status === 'Completato').length;
    const pct = active.length ? Math.round((completedAll / active.length) * 100) : 0;
    return { dueToday, overdue, next7, urgent, completedMonth, pct, completedAll };
  }, [active, today]);

  const focus = useMemo(() => focusTasks(active), [active]);

  const weeks = useMemo(() => {
    const current = weekStart(today);
    return Array.from({ length: 6 }, (_, i) => {
      const start = addDays(current, (i - 5) * 7);
      const end = addDays(start, 6);
      const n = active.filter((t) => {
        const d = romeDateOf(t.completedAt);
        return !!d && d >= start && d <= end;
      }).length;
      return { start, n, current: i === 5 };
    });
  }, [active, today]);
  const maxWeek = Math.max(...weeks.map((w) => w.n), 0);

  const projectStats = useMemo(
    () =>
      data.projects.slice(0, 4).map((p) => {
        const list = active.filter((t) => t.projectId === p.id);
        const done = list.filter((t) => t.status === 'Completato').length;
        return { p, total: list.length, pct: list.length ? Math.round((done / list.length) * 100) : 0 };
      }),
    [data.projects, active],
  );
  const projectsOpen = data.projects.filter((p) => p.status !== 'Completato').length;

  // Banner "Ultimo report pronto" quando cambia l'ultimo report
  const latest = useMemo(() => [...data.reports].sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0] ?? null, [data.reports]);
  const seen = useRef(latest?.id ?? null);
  const [banner, setBanner] = useState<Report | null>(null);
  useEffect(() => {
    if (latest && latest.id !== seen.current) {
      seen.current = latest.id;
      setBanner(latest);
      const h = window.setTimeout(() => setBanner(null), 5000);
      return () => window.clearTimeout(h);
    }
    seen.current = latest?.id ?? null;
  }, [latest]);

  const attention = stats.dueToday + stats.overdue;
  const r = 52;
  const circ = 2 * Math.PI * r;

  return (
    <>
      <div className="dash-alert">
        <Sparkles size={18} color="var(--accent)" />
        <p>
          Hai <b>{attention}</b> {attention === 1 ? 'attività che merita' : 'attività che meritano'} attenzione oggi
        </p>
        <button className="btn btn-sm" onClick={() => navigate('tasks', 'today')}>
          Vai alle priorità <ArrowRight size={14} />
        </button>
      </div>

      <div className="kpis">
        <Kpi icon={<CalendarRange size={19} />} color="var(--accent-2)" value={stats.next7} label="Entro 7 giorni" sub={`${stats.dueToday} in scadenza oggi`} />
        <Kpi icon={<AlertTriangle size={19} />} color="var(--danger)" value={stats.overdue} label="Scadute" sub="Da recuperare" />
        <Kpi icon={<Flame size={19} />} color="var(--prio-high)" value={stats.urgent} label="Alta priorità" sub="Task urgenti aperte" />
        <Kpi icon={<CheckCircle2 size={19} />} color="var(--success)" value={stats.completedMonth} label="Completate" sub={`Nel mese · ${stats.pct}% sul totale`} />
      </div>

      <div className="dash-grid">
        <section className="card panel">
          <div className="panel-head">
            <div>
              <div className="eyebrow">Focus della settimana</div>
              <h2>Le 5 attività più urgenti</h2>
            </div>
            <button className="btn btn-sm" onClick={() => navigate('tasks', 'week')}>
              Vedi settimana
            </button>
          </div>
          {focus.length === 0 ? (
            <Empty icon={<Inbox size={28} />} title="Nessuna attività aperta">
              Crea una task con «Nuova task» per iniziare.
            </Empty>
          ) : (
            <div className="focus-list">
              {focus.map((t, i) => {
                const p = projectOf(data.projects, t.projectId);
                return (
                  <div
                    key={t.id}
                    className="focus-row"
                    role="button"
                    tabIndex={0}
                    onClick={() => openModal({ kind: 'taskView', id: t.id })}
                    onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), openModal({ kind: 'taskView', id: t.id }))}
                  >
                    <span className="focus-index">{String(i + 1).padStart(2, '0')}</span>
                    <div style={{ minWidth: 0 }}>
                      <div className="focus-title">{t.title}</div>
                      <div className="focus-project">{p?.name ?? 'Senza progetto'}</div>
                    </div>
                    <ProgressBar value={taskProgress(t)} color={p?.color ?? 'var(--status-todo)'} />
                    <PriorityBadge priority={t.priority} />
                    <Due task={t} compact />
                  </div>
                );
              })}
            </div>
          )}
        </section>

        <section className="card panel">
          <div className="panel-head">
            <div>
              <div className="eyebrow">Carico di lavoro</div>
              <h2>Stato attività</h2>
            </div>
          </div>
          <div className="donut-wrap">
            <div className="donut">
              <svg width="132" height="132" viewBox="0 0 132 132" aria-hidden="true">
                <circle cx="66" cy="66" r={r} fill="none" stroke="var(--surface)" strokeWidth="14" />
                {stats.pct > 0 && (
                  <circle
                    cx="66"
                    cy="66"
                    r={r}
                    fill="none"
                    stroke="var(--accent)"
                    strokeWidth="14"
                    strokeLinecap="round"
                    strokeDasharray={`${(stats.pct / 100) * circ} ${circ}`}
                  />
                )}
              </svg>
              <div className="donut-center">
                <strong>{stats.pct}%</strong>
                <span>completato</span>
              </div>
            </div>
            <div className="legend">
              {TASK_STATUSES.map((s) => (
                <div key={s}>
                  <span className="dot" style={{ ['--c' as string]: STATUS_COLOR[s] }} />
                  {s}
                  <b>{active.filter((t) => t.status === s).length}</b>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="card panel">
          <div className="panel-head">
            <div>
              <div className="eyebrow">Ritmo</div>
              <h2>Task completate nel tempo</h2>
            </div>
            <span className="muted" style={{ fontSize: 12 }}>
              Ultime 6 settimane
            </span>
          </div>
          <div className="chart" role="img" aria-label="Task completate nelle ultime sei settimane">
            {weeks.map((w) => (
              <div key={w.start} className={`chart-col${w.current ? ' current' : ''}`}>
                <b>{w.n}</b>
                <div className="chart-bar" style={{ height: maxWeek ? `${Math.max(4, (w.n / maxWeek) * 100)}%` : '4px' }} />
                <span>{formatDate(w.start, false)}</span>
              </div>
            ))}
          </div>
        </section>

        <section className="card panel">
          <div className="panel-head">
            <div>
              <div className="eyebrow">Progetti</div>
              <h2>Avanzamento attuale</h2>
            </div>
            <span className="badge" style={{ ['--c' as string]: 'var(--accent-2)' }}>
              {projectsOpen} in corso
            </span>
          </div>
          {projectStats.length === 0 ? (
            <Empty title="Nessun progetto">Crea un progetto dalla sezione Progetti.</Empty>
          ) : (
            <div className="proj-list">
              {projectStats.map(({ p, total, pct }) => (
                <div key={p.id}>
                  <div className="proj-row-head">
                    <strong>{p.name}</strong>
                    <span>
                      {total} task · {pct}%
                    </span>
                  </div>
                  <ProgressBar value={pct} color={p.color} label={false} />
                </div>
              ))}
            </div>
          )}
        </section>
      </div>

      {banner && (
        <div className="ready-banner" role="status">
          <CheckCircle2 size={18} color="var(--success)" />
          <div>
            <strong style={{ display: 'block', fontSize: 13 }}>Ultimo report pronto</strong>
            <span className="muted" style={{ fontSize: 12 }}>
              {formatDate(banner.periodStart)} – {formatDate(banner.periodEnd)}
            </span>
          </div>
          <button
            className="btn btn-sm"
            onClick={() =>
              copyText(banner.plainText).then(
                () => toast('Report copiato negli appunti'),
                (e: Error) => toast(e.message, { tone: 'error' }),
              )
            }
          >
            <Copy size={14} /> Copia
          </button>
        </div>
      )}
    </>
  );
}

function Kpi({ icon, color, value, label, sub }: { icon: React.ReactNode; color: string; value: number; label: string; sub: string }) {
  return (
    <div className="card kpi">
      <div className="kpi-icon" style={{ ['--c' as string]: color }}>
        {icon}
      </div>
      <div style={{ minWidth: 0 }}>
        <div className="kpi-label">{label}</div>
        <div className="kpi-value">{value}</div>
        <div className="kpi-sub">{sub}</div>
      </div>
    </div>
  );
}
