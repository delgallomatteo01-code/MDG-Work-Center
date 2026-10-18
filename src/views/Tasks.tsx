import { useMemo, useRef, useState } from 'react';
import {
  DndContext,
  DragOverlay,
  MouseSensor,
  TouchSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from '@dnd-kit/core';
import { Archive, CalendarDays, Clock, Copy, GripVertical, LayoutGrid, List, Pencil, Search, Trash2 } from 'lucide-react';
import { useStore } from '../store';
import { PRIORITIES, TASK_STATUSES, WORK_TYPES, type TaskStatus } from '../../shared/constants';
import { formatDate, formatMinutesShort } from '../../shared/dates';
import type { Task } from '../../shared/types';
import { PRIORITY_COLOR, QUICK_FILTERS, STATUS_COLOR, cx, matchesQuick, projectOf, sortTasks, type SortKey } from '../lib';
import { Due, Empty, PriorityBadge, StatusBadge, dueState, stop } from '../components/ui';
import { CalendarGrid } from '../components/CalendarGrid';

type View = 'cards' | 'list' | 'calendar';

export function TasksView() {
  const { data, quickFilter, setQuickFilter, openModal } = useStore();
  const [view, setView] = useState<View>('cards');
  const [q, setQ] = useState('');
  const [status, setStatus] = useState('');
  const [priority, setPriority] = useState('');
  const [project, setProject] = useState('');
  const [workType, setWorkType] = useState('');
  const [sort, setSort] = useState<SortKey>('due');

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const list = data.tasks.filter((t) => {
      if (t.archived) return false;
      if (!matchesQuick(t, quickFilter)) return false;
      if (status && t.status !== status) return false;
      if (priority && t.priority !== priority) return false;
      if (project === '__none' ? !!t.projectId : project && t.projectId !== project) return false;
      if (workType && t.workType !== workType) return false;
      if (needle) {
        const hay = [t.title, t.description, t.client, ...t.tags].join(' ').toLowerCase();
        if (!hay.includes(needle)) return false;
      }
      return true;
    });
    return sortTasks(list, sort);
  }, [data.tasks, quickFilter, q, status, priority, project, workType, sort]);

  return (
    <>
      <div className="toolbar">
        <div className="segmented" role="tablist" aria-label="Vista">
          <button className={cx(view === 'cards' && 'active')} onClick={() => setView('cards')}>
            <LayoutGrid size={14} /> Task cards
          </button>
          <button className={cx(view === 'list' && 'active')} onClick={() => setView('list')}>
            <List size={14} /> Lista
          </button>
          <button className={cx(view === 'calendar' && 'active')} onClick={() => setView('calendar')}>
            <CalendarDays size={14} /> Calendario
          </button>
        </div>
        <span className="result-count">
          {filtered.length} {filtered.length === 1 ? 'risultato' : 'risultati'}
        </span>
      </div>
      <div className="toolbar">
        <label className="search">
          <Search size={16} />
          <input className="input" placeholder="Cerca per titolo, descrizione, reparto o tag" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Cerca task" />
        </label>
        <select className="select" value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Stato">
          <option value="">Tutti gli stati</option>
          {TASK_STATUSES.map((s) => (
            <option key={s}>{s}</option>
          ))}
        </select>
        <select className="select" value={priority} onChange={(e) => setPriority(e.target.value)} aria-label="Priorità">
          <option value="">Tutte le priorità</option>
          {PRIORITIES.map((s) => (
            <option key={s}>{s}</option>
          ))}
        </select>
        <select className="select hide-lg" value={project} onChange={(e) => setProject(e.target.value)} aria-label="Progetto">
          <option value="">Tutti i progetti</option>
          <option value="__none">Senza progetto</option>
          {data.projects.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
        <select className="select hide-lg" value={workType} onChange={(e) => setWorkType(e.target.value)} aria-label="Tipologia">
          <option value="">Tutte le tipologie</option>
          {WORK_TYPES.map((s) => (
            <option key={s}>{s}</option>
          ))}
        </select>
        <select className="select hide-lg" value={sort} onChange={(e) => setSort(e.target.value as SortKey)} aria-label="Ordinamento">
          <option value="due">Scadenza</option>
          <option value="priority">Priorità</option>
          <option value="created">Più recenti</option>
        </select>
      </div>
      <div className="chips" role="tablist" aria-label="Filtri rapidi">
        {QUICK_FILTERS.map((f) => (
          <button key={f.id} className={cx('chip', quickFilter === f.id && 'active')} onClick={() => setQuickFilter(f.id)}>
            {f.label}
          </button>
        ))}
      </div>

      {view === 'cards' && <Kanban tasks={filtered} />}
      {view === 'list' && <TaskTable tasks={filtered} />}
      {view === 'calendar' && (
        <div className="card" style={{ padding: 16 }}>
          <CalendarGrid tasks={filtered} projects={data.projects} onOpen={(t) => openModal({ kind: 'taskView', id: t.id })} />
        </div>
      )}
    </>
  );
}

// ───────────────────────── Kanban ─────────────────────────

function Kanban({ tasks }: { tasks: Task[] }) {
  const { data, replaceData, act, openModal, templatesSnapshot } = useKanbanHelpers();
  const [activeId, setActiveId] = useState<string | null>(null);
  const justDragged = useRef(false);
  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 220, tolerance: 8 } }),
  );
  const active = activeId ? data.tasks.find((t) => t.id === activeId) ?? null : null;

  function onDragStart(e: DragStartEvent) {
    setActiveId(String(e.active.id));
  }

  async function onDragEnd(e: DragEndEvent) {
    setActiveId(null);
    justDragged.current = true;
    window.setTimeout(() => (justDragged.current = false), 150);
    const task = data.tasks.find((t) => t.id === e.active.id);
    const target = e.over?.id;
    if (!task || !target) return;
    const before = data;
    if (target === '__trash') {
      replaceData({ ...data, tasks: data.tasks.filter((t) => t.id !== task.id) });
      try {
        await act('deleteTask', { id: task.id }, { success: 'Task eliminata', undo: () => ({ action: 'restoreDeletedTask', payload: { id: task.id } }) });
      } catch {
        replaceData(before);
      }
      return;
    }
    const status = target as TaskStatus;
    if (status === task.status) return;
    const snapshot = { task, template: templatesSnapshot(task) };
    // Aggiornamento ottimistico con rollback in caso di errore.
    replaceData({
      ...data,
      tasks: data.tasks.map((t) =>
        t.id === task.id ? { ...t, status, completedAt: status === 'Completato' ? t.completedAt ?? new Date().toISOString() : null } : t,
      ),
    });
    try {
      await act('updateTask', { id: task.id, status }, { success: `Spostata in «${status}»`, undo: () => ({ action: 'restoreTaskSnapshot', payload: snapshot }) });
    } catch {
      replaceData(before);
    }
  }

  return (
    <DndContext sensors={sensors} onDragStart={onDragStart} onDragEnd={onDragEnd} onDragCancel={() => setActiveId(null)}>
      <div className="kanban">
        {TASK_STATUSES.map((s) => (
          <Column key={s} status={s} tasks={tasks.filter((t) => t.status === s)}>
            {tasks
              .filter((t) => t.status === s)
              .map((t) => (
                <DraggableCard
                  key={t.id}
                  task={t}
                  onOpen={() => !justDragged.current && openModal({ kind: 'taskView', id: t.id })}
                  onEdit={() => openModal({ kind: 'taskEditor', id: t.id })}
                />
              ))}
          </Column>
        ))}
      </div>
      {activeId && <TrashZone />}
      <DragOverlay dropAnimation={null}>{active ? <CardBody task={active} overlay /> : null}</DragOverlay>
    </DndContext>
  );
}

function useKanbanHelpers() {
  const { data, replaceData, act, openModal } = useStore();
  const templatesSnapshot = (t: Task) => (t.recurrenceId ? data.templates.find((x) => x.id === t.recurrenceId) ?? null : null);
  return { data, replaceData, act, openModal, templatesSnapshot };
}

function Column({ status, tasks, children }: { status: TaskStatus; tasks: Task[]; children: React.ReactNode }) {
  const { setNodeRef, isOver } = useDroppable({ id: status });
  return (
    <div ref={setNodeRef} className={cx('column', isOver && 'over')}>
      <div className="column-head">
        <span className="dot" style={{ ['--c' as string]: STATUS_COLOR[status] }} />
        {status}
        <span className="n">{tasks.length}</span>
      </div>
      <div className="column-body">{tasks.length ? children : <div className="drop-hint">Trascina qui</div>}</div>
    </div>
  );
}

function TrashZone() {
  const { setNodeRef, isOver } = useDroppable({ id: '__trash' });
  return (
    <div ref={setNodeRef} className={cx('trash-zone', isOver && 'over')}>
      <Trash2 size={22} />
      <div>
        <strong>Elimina task</strong>
        <span>Trascina qui la card</span>
      </div>
    </div>
  );
}

function DraggableCard({ task, onOpen, onEdit }: { task: Task; onOpen: () => void; onEdit: () => void }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: task.id });
  return (
    <div ref={setNodeRef} {...attributes} {...listeners} role="button" tabIndex={0} onKeyDown={(e) => e.key === 'Enter' && onOpen()}>
      <CardBody task={task} dragging={isDragging} onOpen={onOpen} onEdit={onEdit} />
    </div>
  );
}

function CardBody({ task, dragging, overlay, onOpen, onEdit }: { task: Task; dragging?: boolean; overlay?: boolean; onOpen?: () => void; onEdit?: () => void }) {
  const { data } = useStore();
  const p = projectOf(data.projects, task.projectId);
  return (
    <div className={cx('tcard', dragging && 'dragging', overlay && 'drag-overlay')} onClick={onOpen}>
      <div className="tcard-top">
        <span className="grip" aria-hidden="true">
          <GripVertical size={15} />
        </span>
        <PriorityBadge priority={task.priority} />
        {onEdit && (
          <button className="icon-btn" onClick={stop(onEdit)} onPointerDown={(e) => e.stopPropagation()} onMouseDown={(e) => e.stopPropagation()} onTouchStart={(e) => e.stopPropagation()} aria-label="Modifica task">
            <Pencil size={14} />
          </button>
        )}
      </div>
      <h4>{task.title}</h4>
      <div className="proj">
        <span className="dot" style={{ ['--c' as string]: p?.color ?? 'var(--status-todo)' }} />
        {p?.name ?? 'Senza progetto'}
      </div>
      <div className="tcard-foot">
        <Due task={task} />
        <span className="due">
          <Clock size={13} />
          {formatMinutesShort(task.estimatedMinutes)}
        </span>
      </div>
    </div>
  );
}

// ───────────────────────── Lista ─────────────────────────

function TaskTable({ tasks }: { tasks: Task[] }) {
  const { data, act, openModal } = useStore();
  if (!tasks.length)
    return (
      <div className="card">
        <Empty icon={<Search size={26} />} title="Nessuna task trovata">
          Modifica i filtri o crea una nuova task.
        </Empty>
      </div>
    );
  const snapshotOf = (t: Task) => ({ task: t, template: t.recurrenceId ? data.templates.find((x) => x.id === t.recurrenceId) ?? null : null });
  return (
    <div className="card table-wrap">
      <table className="list">
        <thead>
          <tr>
            <th>Attività</th>
            <th>Progetto</th>
            <th>Stato</th>
            <th>Priorità</th>
            <th>Scadenza</th>
            <th>Stima</th>
            <th aria-label="Azioni">Azioni</th>
          </tr>
        </thead>
        <tbody>
          {tasks.map((t) => {
            const p = projectOf(data.projects, t.projectId);
            const st = dueState(t);
            return (
              <tr key={t.id} onClick={() => openModal({ kind: 'taskView', id: t.id })}>
                <td>
                  <div className="title-cell">
                    <span className="prio-bar" style={{ ['--c' as string]: PRIORITY_COLOR[t.priority] }} />
                    <div>
                      <strong>{t.title}</strong>
                      <small>
                        {t.workType}
                        {t.client ? ` · ${t.client}` : ''}
                      </small>
                    </div>
                  </div>
                </td>
                <td>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                    <span className="dot" style={{ ['--c' as string]: p?.color ?? 'var(--status-todo)' }} />
                    {p?.name ?? 'Senza progetto'}
                  </span>
                </td>
                <td>
                  <StatusBadge status={t.status} />
                </td>
                <td>
                  <PriorityBadge priority={t.priority} />
                </td>
                <td>
                  <span className={cx('due', st)}>{t.dueDate ? formatDate(t.dueDate) : '—'}</span>
                </td>
                <td>{formatMinutesShort(t.estimatedMinutes)}</td>
                <td>
                  <div className="row-actions">
                    <button
                      className="icon-btn"
                      title="Duplica"
                      aria-label="Duplica"
                      onClick={stop(() =>
                        act('duplicateTask', { id: t.id }, { success: 'Task duplicata', undo: (r) => (r.createdId ? { action: 'deleteTask', payload: { id: r.createdId } } : null) }).catch(() => undefined),
                      )}
                    >
                      <Copy size={15} />
                    </button>
                    <button className="icon-btn" title="Modifica" aria-label="Modifica" onClick={stop(() => openModal({ kind: 'taskEditor', id: t.id }))}>
                      <Pencil size={15} />
                    </button>
                    <button
                      className="icon-btn"
                      title="Archivia"
                      aria-label="Archivia"
                      onClick={stop(() =>
                        act('archiveTask', { id: t.id }, { success: 'Task archiviata', undo: () => ({ action: 'restoreTaskSnapshot', payload: snapshotOf(t) }) }).catch(() => undefined),
                      )}
                    >
                      <Archive size={15} />
                    </button>
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
