import { useState, type FormEvent } from 'react';
import { Pencil, Trash2 } from 'lucide-react';
import { useStore } from '../store';
import { NOTE_HTML_MAX, NOTE_TITLE_MAX } from '../../shared/constants';
import { formatDateTime } from '../../shared/dates';
import { Modal } from '../components/ui';
import { RichTextEditor } from '../components/RichTextEditor';

export function NoteEditor({ id, onClose }: { id: string | null; onClose: () => void }) {
  const { data, act, confirm } = useStore();
  const note = id ? data.notes.find((n) => n.id === id) ?? null : null;
  const [title, setTitle] = useState(note?.title ?? '');
  const [html, setHtml] = useState(note?.contentHtml ?? '');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (!title.trim()) return setError('Il titolo è obbligatorio.');
    if (html.length > NOTE_HTML_MAX) return setError('Il contenuto è troppo lungo.');
    setBusy(true);
    try {
      if (note) {
        const prev = { id: note.id, title: note.title, contentHtml: note.contentHtml };
        await act('updateNote', { id: note.id, title, contentHtml: html }, { success: 'Nota aggiornata', undo: () => ({ action: 'updateNote', payload: prev }) });
      } else {
        await act('createNote', { title, contentHtml: html }, { success: 'Nota salvata', undo: (r) => (r.createdId ? { action: 'deleteNote', payload: { id: r.createdId } } : null) });
      }
      onClose();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (!note) return;
    const ok = await confirm({ title: 'Eliminare la nota?', message: `«${note.title}» verrà eliminata. Potrai annullare subito dopo.`, confirmLabel: 'Elimina nota', danger: true });
    if (!ok) return;
    await act('deleteNote', { id: note.id }, { success: 'Nota eliminata', undo: () => ({ action: 'restoreDeletedNote', payload: { id: note.id } }) })
      .then(onClose)
      .catch(() => undefined);
  }

  return (
    <Modal
      title={note ? 'Modifica nota' : 'Nuova nota'}
      eyebrow="Taccuino di lavoro"
      size="wide"
      onClose={onClose}
      footer={
        <>
          {note && (
            <button type="button" className="btn btn-sm btn-danger" onClick={remove}>
              <Trash2 size={14} /> Elimina nota
            </button>
          )}
          <span className="spacer" />
          <button type="button" className="btn" onClick={onClose}>
            Annulla
          </button>
          <button type="submit" form="note-form" className="btn btn-primary" disabled={busy}>
            {note ? 'Salva modifiche' : 'Salva nota'}
          </button>
        </>
      }
    >
      <form id="note-form" onSubmit={submit} style={{ display: 'grid', gap: 14 }}>
        <label className="field">
          <span>Titolo * <span className="muted">({title.length}/{NOTE_TITLE_MAX})</span></span>
          <input className="input" data-autofocus maxLength={NOTE_TITLE_MAX} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Es. Brief campagna autunno" />
        </label>
        <div className="field">
          <span className="field-label">Contenuto</span>
          <RichTextEditor initialHtml={note?.contentHtml ?? ''} onChange={setHtml} placeholder="Scrivi brief, idee, appunti…" />
        </div>
        {error && (
          <div className="form-error" role="alert">
            {error}
          </div>
        )}
      </form>
    </Modal>
  );
}

export function NoteView({ id, onClose }: { id: string; onClose: () => void }) {
  const { data } = useStore();
  const note = data.notes.find((n) => n.id === id);
  if (!note)
    return (
      <Modal title="Nota non disponibile" onClose={onClose} size="small">
        <p className="muted">La nota è stata eliminata.</p>
      </Modal>
    );
  return (
    <Modal
      title={note.title}
      eyebrow={`Aggiornata il ${formatDateTime(note.updatedAt)}`}
      size="wide"
      onClose={onClose}
      footer={
        <>
          <span className="foot-hint">
            <Pencil size={13} /> Usa la matita sulla card per modificare
          </span>
          <span className="spacer" />
          <button className="btn" onClick={onClose}>
            Chiudi
          </button>
        </>
      }
    >
      <div className="rich" dangerouslySetInnerHTML={{ __html: note.contentHtml || '<p>Nota vuota.</p>' }} />
    </Modal>
  );
}
