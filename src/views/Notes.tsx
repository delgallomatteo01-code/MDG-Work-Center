import { NotebookPen, Pencil, Pin, PinOff, Plus, StickyNote } from 'lucide-react';
import { useStore } from '../store';
import { formatDateTime } from '../../shared/dates';
import { Empty, stop } from '../components/ui';

export function NotesView() {
  const { data, act, openModal } = useStore();
  const pinned = data.notes.find((n) => n.pinned) ?? null;
  const others = data.notes.filter((n) => !n.pinned).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  const pin = (id: string, value: boolean) =>
    act('pinNote', { id, pinned: value }, { success: value ? 'Nota fissata' : 'Fissaggio rimosso' }).catch(() => undefined);

  return (
    <>
      <div className="section-head">
        <div>
          <div className="eyebrow">Taccuino di lavoro</div>
          <h2>Brief, idee e appunti</h2>
        </div>
        <button className="btn btn-dark" onClick={() => openModal({ kind: 'noteEditor', id: null })}>
          <Plus size={16} /> Nuova nota
        </button>
      </div>
      <div className="notes-layout">
        {pinned ? (
          <section className="card pinned-note" aria-label="Nota fissata">
            <div className="pinned-head">
              <Pin size={17} className="pin" />
              <h3>{pinned.title}</h3>
              <button className="icon-btn" title="Modifica" aria-label="Modifica nota" onClick={() => openModal({ kind: 'noteEditor', id: pinned.id })}>
                <Pencil size={15} />
              </button>
              <button className="icon-btn" title="Rimuovi fissaggio" aria-label="Rimuovi fissaggio" onClick={() => pin(pinned.id, false)}>
                <PinOff size={15} />
              </button>
            </div>
            <div className="pinned-body rich" dangerouslySetInnerHTML={{ __html: pinned.contentHtml || '<p class="muted">Nota vuota</p>' }} />
            <div className="pinned-foot">Aggiornata il {formatDateTime(pinned.updatedAt)}</div>
          </section>
        ) : (
          <div className="pinned-empty">
            <Pin size={24} style={{ margin: '0 auto' }} />
            <strong style={{ color: 'var(--text)' }}>Fissa una nota importante</strong>
            <span>Usa la puntina su una card per tenerla sempre in vista qui.</span>
          </div>
        )}
        {others.length === 0 ? (
          <div className="card" style={{ display: 'grid', placeItems: 'center' }}>
            <Empty icon={<NotebookPen size={28} />} title={data.notes.length ? 'Nessun’altra nota' : 'Nessuna nota'}>
              Annota brief, idee e appunti con «Nuova nota».
            </Empty>
          </div>
        ) : (
          <div className="notes-grid">
            {others.map((n) => (
              <article
                key={n.id}
                className="card ncard"
                role="button"
                tabIndex={0}
                onClick={() => openModal({ kind: 'noteView', id: n.id })}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    openModal({ kind: 'noteView', id: n.id });
                  }
                }}
              >
                <div className="ncard-head">
                  <StickyNote size={16} className="ico" />
                  <h3 title={n.title}>{n.title}</h3>
                </div>
                <div className="ncard-excerpt rich" aria-hidden="true" dangerouslySetInnerHTML={{ __html: n.contentHtml }} />
                <div className="ncard-foot">
                  <span>{formatDateTime(n.updatedAt)}</span>
                  <span style={{ display: 'flex', gap: 2 }}>
                    <button className="icon-btn" title="Fissa" aria-label="Fissa nota" onClick={stop(() => pin(n.id, true))} onKeyDown={(e) => e.stopPropagation()}>
                      <Pin size={15} />
                    </button>
                    <button
                      className="icon-btn"
                      title="Modifica"
                      aria-label="Modifica nota"
                      onClick={stop(() => openModal({ kind: 'noteEditor', id: n.id }))}
                      onKeyDown={(e) => e.stopPropagation()}
                    >
                      <Pencil size={15} />
                    </button>
                  </span>
                </div>
              </article>
            ))}
          </div>
        )}
      </div>
    </>
  );
}
