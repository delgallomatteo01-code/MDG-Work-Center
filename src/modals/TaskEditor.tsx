import { useMemo, useRef, useState, type FormEvent } from 'react';
import { Archive, ChevronDown, Copy, History, Paperclip, Repeat, Target, Trash2, Upload } from 'lucide-react';
import { useStore } from '../store';
import { api } from '../api';
import { MAX_ATTACHMENT_BYTES, PRIORITIES, TASK_STATUSES, WORK_TYPES, type Priority, type TaskStatus } from '../../shared/constants';
import { formatDateTime } from '../../shared/dates';
import type { Task } from '../../shared/types';
import { cx, projectOf, today } from '../lib';
import { Modal } from '../components/ui';

function formatSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export function TaskEditor({ id, defaults, onClose }: { id: string | null; defaults?: { dueDate?: string; projectName?: string }; onClose: () => void }) {
  const { data, act, confirm, track, replaceData, toast } = useStore();
  const task = id ? data.tasks.find((t) => t.id === id) ?? null : null;
  const freq = data.settings.reportFrequency === 'weekly' ? 'settimanale' : 'mensile';

  const [form, setForm] = useState(() => ({
    recurring: !!task?.recurrenceId,
    title: task?.title ?? '',
    projectName: task ? projectOf(data.projects, task.projectId)?.name ?? '' : defaults?.projectName ?? '',
    dueDate: task?.dueDate ?? defaults?.dueDate ?? '',
    priority: (task?.priority ?? 'Media') as Priority,
    status: (task?.status ?? 'Da iniziare') as TaskStatus,
    description: task?.description ?? '',
    client: task?.client ?? '',
    workType: task?.workType ?? 'Altro',
    startDate: task?.startDate ?? today(),
    estimatedMinutes: String(task?.estimatedMinutes ?? 60),
    actualMinutes: String(task?.actualMinutes ?? 0),
    tags: task?.tags.join(', ') ?? '',
    links: task?.links.join(', ') ?? '',
    notes: task?.notes ?? '',
  }));
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const set = <K extends keyof typeof form>(k: K, v: (typeof form)[K]) => setForm((f) => ({ ...f, [k]: v }));

  const attachments = useMemo(() => (task ? data.attachments.filter((a) => a.taskId === task.id) : []), [data.attachments, task]);
  const history = useMemo(() => (task ? data.history.filter((h) => h.taskId === task.id).slice(0, 8) : []), [data.history, task]);

  if (id && !task) {
    return (
      <Modal title="Task non disponibile" onClose={onClose} size="small">
        <p className="muted">La task è stata eliminata o non esiste più.</p>
      </Modal>
    );
  }

  const snapshot = (t: Task) => ({ task: t, template: t.recurrenceId ? data.templates.find((x) => x.id === t.recurrenceId) ?? null : null });

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    const title = form.title.trim();
    if (!title) return setError('Il titolo è obbligatorio.');
    const est = Number(form.estimatedMinutes || 0);
    const act_ = Number(form.actualMinutes || 0);
    if (!Number.isInteger(est) || est < 0 || !Number.isInteger(act_) || act_ < 0) return setError('I tempi devono essere numeri interi non negativi (minuti).');
    const payload = {
      title,
      projectName: form.projectName,
      dueDate: form.dueDate || null,
      priority: form.priority,
      status: form.status,
      recurring: form.recurring,
      description: form.description,
      client: form.client,
      workType: form.workType,
      startDate: form.startDate || null,
      estimatedMinutes: est,
      actualMinutes: act_,
      tags: form.tags,
      links: form.links,
      notes: form.notes,
    };
    setBusy(true);
    try {
      if (task) {
        const snap = snapshot(task);
        await act('updateTask', { id: task.id, ...payload }, { success: 'Modifiche salvate', undo: () => ({ action: 'restoreTaskSnapshot', payload: snap }) });
      } else {
        await act('createTask', payload, {
          success: 'Task creata',
          undo: (r) => (r.createdId ? { action: 'deleteTask', payload: { id: r.createdId } } : null),
        });
      }
      onClose();
    } catch (err) {
      // l'editor resta aperto: il lavoro non va perso
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function duplicate() {
    if (!task) return;
    await act('duplicateTask', { id: task.id }, { success: 'Task duplicata', undo: (r) => (r.createdId ? { action: 'deleteTask', payload: { id: r.createdId } } : null) })
      .then(onClose)
      .catch(() => undefined);
  }
  async function archive() {
    if (!task) return;
    const snap = snapshot(task);
    await act('archiveTask', { id: task.id }, { success: 'Task archiviata', undo: () => ({ action: 'restoreTaskSnapshot', payload: snap }) })
      .then(onClose)
      .catch(() => undefined);
  }
  async function remove() {
    if (!task) return;
    const ok = await confirm({
      title: 'Eliminare la task?',
      message: `«${task.title}» verrà eliminata${task.recurrenceId ? ' e la ricorrenza disattivata' : ''}. Potrai annullare subito dopo.`,
      confirmLabel: 'Elimina',
      danger: true,
    });
    if (!ok) return;
    await act('deleteTask', { id: task.id }, { success: 'Task eliminata', undo: () => ({ action: 'restoreDeletedTask', payload: { id: task.id } }) })
      .then(onClose)
      .catch(() => undefined);
  }

  async function upload(file: File) {
    if (!task) return;
    if (file.size > MAX_ATTACHMENT_BYTES) return toast('Il file supera il limite di 15 MiB.', { tone: 'error' });
    try {
      const res = await track(api.upload(task.id, file));
      replaceData(res.data);
      toast('Allegato caricato', { tone: 'success' });
    } catch (err) {
      toast((err as Error).message, { tone: 'error' });
    }
  }

  return (
    <Modal
      title={task ? 'Modifica task' : 'Nuova task'}
      eyebrow={task ? (task.archived ? 'Task archiviata' : 'Editor') : 'Crea'}
      onClose={onClose}
      footer={
        <>
          {task && (
            <>
              <button type="button" className="btn btn-sm" onClick={duplicate}>
                <Copy size={14} /> Duplica
              </button>
              {!task.archived && (
                <button type="button" className="btn btn-sm" onClick={archive}>
                  <Archive size={14} /> Archivia
                </button>
              )}
              <button type="button" className="btn btn-sm btn-danger" onClick={remove}>
                <Trash2 size={14} /> Elimina
              </button>
            </>
          )}
          <span className="spacer" />
          <button type="button" className="btn" onClick={onClose}>
            Annulla
          </button>
          <button type="submit" form="task-form" className="btn btn-primary" disabled={busy}>
            {task ? 'Salva modifiche' : 'Crea task'}
          </button>
        </>
      }
    >
      <form id="task-form" onSubmit={submit} style={{ display: 'grid', gap: 14 }}>
        <div className="kind-switch" role="radiogroup" aria-label="Tipo di task">
          <button type="button" className={cx(!form.recurring && 'active')} onClick={() => set('recurring', false)} aria-pressed={!form.recurring}>
            <strong>
              <Target size={15} /> Una tantum
            </strong>
            <span>Un’attività singola</span>
          </button>
          <button type="button" className={cx(form.recurring && 'active')} onClick={() => set('recurring', true)} aria-pressed={form.recurring}>
            <strong>
              <Repeat size={15} /> Ricorrente
            </strong>
            <span>Si ripete con frequenza {freq}, come il report</span>
          </button>
        </div>
        <label className="field">
          <span>Titolo *</span>
          <input className="input" data-autofocus value={form.title} onChange={(e) => set('title', e.target.value)} maxLength={200} placeholder="Es. Banner promo autunno" />
        </label>
        <div className="grid-2">
          <label className="field">
            <span>Progetto</span>
            <input className="input" list="project-names" value={form.projectName} onChange={(e) => set('projectName', e.target.value)} placeholder="Scegli o scrivi un nome nuovo" />
            <datalist id="project-names">
              {data.projects.map((p) => (
                <option key={p.id} value={p.name} />
              ))}
            </datalist>
          </label>
          <label className="field">
            <span>Scadenza</span>
            <input className="input" type="date" value={form.dueDate} onChange={(e) => set('dueDate', e.target.value)} />
          </label>
          <label className="field">
            <span>Priorità</span>
            <select className="select" value={form.priority} onChange={(e) => set('priority', e.target.value as Priority)}>
              {PRIORITIES.map((p) => (
                <option key={p}>{p}</option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>Stato</span>
            <select className="select" value={form.status} onChange={(e) => set('status', e.target.value as TaskStatus)}>
              {TASK_STATUSES.map((p) => (
                <option key={p}>{p}</option>
              ))}
            </select>
          </label>
        </div>

        <button type="button" className={cx('details-toggle', open && 'open')} onClick={() => setOpen((o) => !o)} aria-expanded={open}>
          <Paperclip size={16} /> Dettagli e materiali
          <ChevronDown size={16} />
        </button>

        {open && (
          <>
            <label className="field">
              <span>Descrizione</span>
              <textarea className="textarea" value={form.description} onChange={(e) => set('description', e.target.value)} />
            </label>
            <div className="grid-2">
              <label className="field">
                <span>Cliente o reparto</span>
                <input className="input" value={form.client} onChange={(e) => set('client', e.target.value)} />
              </label>
              <label className="field">
                <span>Tipologia</span>
                <select className="select" value={form.workType} onChange={(e) => set('workType', e.target.value)}>
                  {WORK_TYPES.map((w) => (
                    <option key={w}>{w}</option>
                  ))}
                </select>
              </label>
              <label className="field">
                <span>Data inizio</span>
                <input className="input" type="date" value={form.startDate} onChange={(e) => set('startDate', e.target.value)} />
              </label>
              <div className="grid-2" style={{ gap: 10 }}>
                <label className="field">
                  <span>Stimato (min)</span>
                  <input className="input" type="number" min={0} step={1} value={form.estimatedMinutes} onChange={(e) => set('estimatedMinutes', e.target.value)} />
                </label>
                <label className="field">
                  <span>Effettivo (min)</span>
                  <input className="input" type="number" min={0} step={1} value={form.actualMinutes} onChange={(e) => set('actualMinutes', e.target.value)} />
                </label>
              </div>
            </div>
            <label className="field">
              <span>Tag (separati da virgola)</span>
              <input className="input" value={form.tags} onChange={(e) => set('tags', e.target.value)} placeholder="social, autunno" />
            </label>
            <label className="field">
              <span>Link (separati da virgola)</span>
              <input className="input" value={form.links} onChange={(e) => set('links', e.target.value)} placeholder="https://figma.com/…, https://drive…" />
            </label>
            <label className="field">
              <span>Note</span>
              <textarea className="textarea" value={form.notes} onChange={(e) => set('notes', e.target.value)} />
            </label>

            {task ? (
              <>
                <div className="sub-section">
                  <h3>
                    <Paperclip size={15} /> Allegati
                    <button type="button" className="btn btn-sm" style={{ marginLeft: 'auto' }} onClick={() => fileRef.current?.click()}>
                      <Upload size={14} /> Carica file
                    </button>
                  </h3>
                  <input
                    ref={fileRef}
                    type="file"
                    hidden
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      e.target.value = '';
                      if (f) void upload(f);
                    }}
                  />
                  {attachments.length ? (
                    <ul className="file-list">
                      {attachments.map((a) => (
                        <li key={a.id}>
                          <a href={`/api/attachments?id=${encodeURIComponent(a.id)}`} target="_blank" rel="noopener noreferrer">
                            <Paperclip size={14} />
                            <span>{a.fileName}</span>
                            <small>{formatSize(a.size)}</small>
                          </a>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="hint" style={{ margin: 0 }}>
                      Nessun allegato. Massimo 15 MiB per file.
                    </p>
                  )}
                </div>
                <div className="sub-section">
                  <h3>
                    <History size={15} /> Cronologia
                  </h3>
                  {history.length ? (
                    <ul className="history-list">
                      {history.map((h) => (
                        <li key={h.id}>
                          <span>{h.message}</span>
                          <time>{formatDateTime(h.createdAt)}</time>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="hint" style={{ margin: 0 }}>
                      Nessun evento registrato.
                    </p>
                  )}
                </div>
              </>
            ) : (
              <p className="hint" style={{ margin: 0 }}>
                Gli allegati si caricano dopo aver creato la task.
              </p>
            )}
          </>
        )}
        {error && (
          <div className="form-error" role="alert">
            {error}
          </div>
        )}
      </form>
    </Modal>
  );
}
