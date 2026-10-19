import { useMemo, useState } from 'react';
import { Archive as ArchiveIcon, Clock, Copy, Eye, FileText, MoreHorizontal, RotateCcw, Search, Trash2, Undo2 } from 'lucide-react';
import { useStore } from '../store';
import { formatDate, formatMinutes, formatRange, romeDateOf } from '../../shared/dates';
import { reportCopyText, reportTypeLabel } from '../../shared/report';
import type { Report, Task } from '../../shared/types';
import { cx, isArchivedReport, projectOf, today } from '../lib';
import { Empty, PriorityBadge } from '../components/ui';
import { copyText } from '../clipboard';

export function ArchiveView() {
  const { data } = useStore();
  const [tab, setTab] = useState<'tasks' | 'reports'>('tasks');
  const [q, setQ] = useState('');
  const [project, setProject] = useState('');
  const archivedTasks = data.tasks.filter((t) => t.archived);
  const archivedReports = data.reports.filter((r) => isArchivedReport(r, today()));

  const switchTab = (t: typeof tab) => {
    setTab(t);
    setQ(''); // cambiando tab la ricerca si azzera
  };

  return (
    <>
      <div className="tabs" role="tablist">
        <button className={cx(tab === 'tasks' && 'active')} onClick={() => switchTab('tasks')}>
          Attività <span className="muted">{archivedTasks.length}</span>
        </button>
        <button className={cx(tab === 'reports' && 'active')} onClick={() => switchTab('reports')}>
          Report <span className="muted">{archivedReports.length}</span>
        </button>
      </div>
      <div className="toolbar">
        <label className="search">
          <Search size={16} />
          <input
            className="input"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={tab === 'tasks' ? 'Cerca per titolo o reparto' : 'Cerca per tipo, date o testo'}
            aria-label="Cerca in archivio"
          />
        </label>
        {tab === 'tasks' && (
          <select className="select" value={project} onChange={(e) => setProject(e.target.value)} aria-label="Progetto">
            <option value="">Tutti i progetti</option>
            <option value="__none">Senza progetto</option>
            {data.projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        )}
      </div>
      {tab === 'tasks' ? <ArchivedTasks tasks={archivedTasks} q={q} project={project} /> : <ArchivedReports reports={archivedReports} q={q} />}
    </>
  );
}

function ArchivedTasks({ tasks, q, project }: { tasks: Task[]; q: string; project: string }) {
  const { data, act, openModal } = useStore();
  const list = useMemo(() => {
    const n = q.trim().toLowerCase();
    return tasks
      .filter((t) => (!n || `${t.title} ${t.client}`.toLowerCase().includes(n)) && (project === '__none' ? !t.projectId : !project || t.projectId === project))
      .sort((a, b) => (b.archivedAt ?? '').localeCompare(a.archivedAt ?? ''));
  }, [tasks, q, project]);

  if (!tasks.length)
    return (
      <div className="card">
        <Empty icon={<ArchiveIcon size={28} />} title="Archivio vuoto">
          Le task archiviate manualmente o completate da più di {data.settings.archiveDays} giorni compaiono qui.
        </Empty>
      </div>
    );
  if (!list.length)
    return (
      <div className="card">
        <Empty icon={<Search size={26} />} title="Nessun risultato">
          Nessuna attività archiviata corrisponde alla ricerca.
        </Empty>
      </div>
    );
  return (
    <div className="cards-3">
      {list.map((t) => {
        const p = projectOf(data.projects, t.projectId);
        const snapshot = { task: t, template: t.recurrenceId ? data.templates.find((x) => x.id === t.recurrenceId) ?? null : null };
        return (
          <article key={t.id} className="card acard">
            <div className="meta">
              <span className="dot" style={{ ['--c' as string]: p?.color ?? 'var(--status-todo)' }} />
              {p?.name ?? 'Senza progetto'}
              <span style={{ marginLeft: 'auto' }}>
                <PriorityBadge priority={t.priority} />
              </span>
            </div>
            <h3>{t.title}</h3>
            <div className="meta">
              <span style={{ display: 'inline-flex', gap: 4, alignItems: 'center' }}>
                <Clock size={13} /> {formatMinutes(t.actualMinutes)}
              </span>
              {t.completedAt && <span>· Completata il {formatDate(romeDateOf(t.completedAt))}</span>}
            </div>
            <div className="rcard-actions">
              <button
                className="btn btn-sm"
                onClick={() =>
                  act('reopenTask', { id: t.id }, { success: 'Task riaperta', undo: () => ({ action: 'restoreTaskSnapshot', payload: snapshot }) }).catch(() => undefined)
                }
              >
                <RotateCcw size={14} /> Riapri
              </button>
              <button
                className="btn btn-sm"
                onClick={() =>
                  act('duplicateTask', { id: t.id }, { success: 'Task duplicata', undo: (r) => (r.createdId ? { action: 'deleteTask', payload: { id: r.createdId } } : null) }).catch(
                    () => undefined,
                  )
                }
              >
                <Copy size={14} /> Duplica
              </button>
              <button className="icon-btn" aria-label="Apri dettaglio" title="Dettaglio" onClick={() => openModal({ kind: 'taskEditor', id: t.id })}>
                <MoreHorizontal size={16} />
              </button>
            </div>
          </article>
        );
      })}
    </div>
  );
}

function ArchivedReports({ reports, q }: { reports: Report[]; q: string }) {
  const list = useMemo(() => {
    const n = q.trim().toLowerCase();
    if (!n) return reports;
    return reports.filter((r) =>
      [reportTypeLabel(r.source, r.frequency), r.periodStart, r.periodEnd, formatRange(r.periodStart, r.periodEnd), r.plainText].join(' ').toLowerCase().includes(n),
    );
  }, [reports, q]);
  if (!reports.length)
    return (
      <div className="card">
        <Empty icon={<FileText size={28} />} title="Nessun report in archivio">
          Qui trovi i report archiviati e quelli relativi a periodi conclusi.
        </Empty>
      </div>
    );
  if (!list.length)
    return (
      <div className="card">
        <Empty icon={<Search size={26} />} title="Nessun risultato" />
      </div>
    );
  return (
    <div className="cards-3">
      {list.map((r) => (
        <ArchivedReportCard key={r.id} report={r} />
      ))}
    </div>
  );
}

function ArchivedReportCard({ report: r }: { report: Report }) {
  const { act, openModal, toast, confirm } = useStore();
  return (
    <article className="card acard">
      <div className="meta">
        <span className="badge" style={{ ['--c' as string]: r.source === 'automatic' ? 'var(--accent-2)' : 'var(--muted)' }}>
          {r.source === 'automatic' ? 'Automatico' : r.source === 'manual' ? 'Manuale' : 'Personalizzato'}
        </span>
        {r.archived && <span className="badge">Archiviato</span>}
      </div>
      <h3>{reportTypeLabel(r.source, r.frequency)}</h3>
      <div className="meta">
        {formatRange(r.periodStart, r.periodEnd)} · {r.taskCount} task · {formatMinutes(r.totalMinutes)}
      </div>
      <div className="rcard-actions">
        <button className="btn btn-sm" onClick={() => openModal({ kind: 'report', id: r.id })}>
          <Eye size={14} /> Apri
        </button>
        <button
          className="btn btn-sm"
          onClick={() => copyText(reportCopyText(r.plainText)).then(() => toast('Elenco attività copiato'), (e: Error) => toast(e.message, { tone: 'error' }))}
        >
          <Copy size={14} /> Copia
        </button>
        {r.archived && (
          <button
            className="btn btn-sm"
            onClick={() =>
              act('reopenReport', { id: r.id }, {
                success: 'Report ripristinato',
                undo: () => ({ action: 'restoreReportState', payload: { id: r.id, archived: r.archived, archivedAt: r.archivedAt } }),
              }).catch(() => undefined)
            }
          >
            <Undo2 size={14} /> Ripristina
          </button>
        )}
        <button
          className="icon-btn btn-danger"
          aria-label="Elimina report"
          title="Elimina"
          onClick={async () => {
            const ok = await confirm({ title: 'Eliminare il report?', message: 'Il report verrà rimosso. Potrai annullare subito dopo.', confirmLabel: 'Elimina', danger: true });
            if (ok)
              act('deleteReport', { id: r.id }, { success: 'Report eliminato', undo: () => ({ action: 'restoreDeletedReport', payload: { id: r.id } }) }).catch(() => undefined);
          }}
        >
          <Trash2 size={15} />
        </button>
      </div>
    </article>
  );
}
