import { useState, type FormEvent } from 'react';
import { Trash2 } from 'lucide-react';
import { useStore } from '../store';
import { NEW_PROJECT_COLOR, PROJECT_STATUSES, type ProjectStatus } from '../../shared/constants';
import { today } from '../lib';
import { Modal } from '../components/ui';

export function ProjectEditor({ id, onClose }: { id: string | null; onClose: () => void }) {
  const { data, act, confirm } = useStore();
  const p = id ? data.projects.find((x) => x.id === id) ?? null : null;
  const [form, setForm] = useState(() => ({
    name: p?.name ?? '',
    description: p?.description ?? '',
    client: p?.client ?? '',
    status: (p?.status ?? 'In corso') as ProjectStatus,
    startDate: p?.startDate ?? today(),
    color: p?.color ?? NEW_PROJECT_COLOR,
    links: p?.links.join(', ') ?? '',
    notes: p?.notes ?? '',
  }));
  const [error, setError] = useState<string | null>(null);
  const set = <K extends keyof typeof form>(k: K, v: (typeof form)[K]) => setForm((f) => ({ ...f, [k]: v }));

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (!form.name.trim()) return setError('Il nome del progetto è obbligatorio.');
    if (!/^#[0-9a-f]{6}$/i.test(form.color)) return setError('Colore non valido (#RRGGBB).');
    const payload = { ...form, name: form.name.trim(), startDate: form.startDate || null };
    try {
      if (p) {
        const prev = { id: p.id, name: p.name, description: p.description, client: p.client, status: p.status, startDate: p.startDate, color: p.color, links: p.links, notes: p.notes };
        await act('updateProject', { id: p.id, ...payload }, { success: 'Progetto aggiornato', undo: () => ({ action: 'updateProject', payload: prev }) });
      } else {
        await act('createProject', payload, { success: 'Progetto creato', undo: (r) => (r.createdId ? { action: 'deleteProject', payload: { id: r.createdId } } : null) });
      }
      onClose();
    } catch (err) {
      setError((err as Error).message);
    }
  }

  async function remove() {
    if (!p) return;
    const linked = data.tasks.some((t) => t.projectId === p.id);
    if (linked) return setError('Sposta o elimina prima le task collegate.');
    const ok = await confirm({ title: 'Eliminare il progetto?', message: `«${p.name}» verrà eliminato. Potrai annullare subito dopo.`, confirmLabel: 'Elimina', danger: true });
    if (!ok) return;
    try {
      await act('deleteProject', { id: p.id }, { success: 'Progetto eliminato', undo: () => ({ action: 'restoreDeletedProject', payload: { id: p.id } }) });
      onClose();
    } catch (err) {
      setError((err as Error).message);
    }
  }

  return (
    <Modal
      title={p ? 'Modifica progetto' : 'Nuovo progetto'}
      eyebrow="Progetto"
      onClose={onClose}
      footer={
        <>
          {p && (
            <button type="button" className="btn btn-sm btn-danger" onClick={remove}>
              <Trash2 size={14} /> Elimina
            </button>
          )}
          <span className="spacer" />
          <button type="button" className="btn" onClick={onClose}>
            Annulla
          </button>
          <button type="submit" form="project-form" className="btn btn-primary">
            {p ? 'Salva modifiche' : 'Crea progetto'}
          </button>
        </>
      }
    >
      <form id="project-form" onSubmit={submit} style={{ display: 'grid', gap: 14 }}>
        <label className="field">
          <span>Nome *</span>
          <input className="input" data-autofocus value={form.name} onChange={(e) => set('name', e.target.value)} maxLength={120} />
        </label>
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
            <span>Stato</span>
            <select className="select" value={form.status} onChange={(e) => set('status', e.target.value as ProjectStatus)}>
              {PROJECT_STATUSES.map((s) => (
                <option key={s}>{s}</option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>Data di inizio</span>
            <input className="input" type="date" value={form.startDate} onChange={(e) => set('startDate', e.target.value)} />
          </label>
          <label className="field">
            <span>Colore</span>
            <div className="color-field">
              <input type="color" value={/^#[0-9a-f]{6}$/i.test(form.color) ? form.color : NEW_PROJECT_COLOR} onChange={(e) => set('color', e.target.value.toUpperCase())} aria-label="Colore progetto" />
              <input className="input" value={form.color} maxLength={7} onChange={(e) => set('color', e.target.value)} aria-label="Colore HEX" />
            </div>
          </label>
        </div>
        <label className="field">
          <span>Link e materiali (separati da virgola)</span>
          <input className="input" value={form.links} onChange={(e) => set('links', e.target.value)} />
        </label>
        <label className="field">
          <span>Note</span>
          <textarea className="textarea" value={form.notes} onChange={(e) => set('notes', e.target.value)} />
        </label>
        {error && (
          <div className="form-error" role="alert">
            {error}
          </div>
        )}
      </form>
    </Modal>
  );
}
