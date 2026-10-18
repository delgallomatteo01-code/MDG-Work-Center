import { ExternalLink, Pencil } from 'lucide-react';
import { useStore } from '../store';
import { formatDate, formatMinutes } from '../../shared/dates';
import { projectOf, safeHref } from '../lib';
import { Modal, PriorityBadge, ProgressBar, StatusBadge, taskProgress } from '../components/ui';

/** Dettaglio di sola lettura, distinto dall'editor. */
export function TaskView({ id, onClose }: { id: string; onClose: () => void }) {
  const { data, navigate } = useStore();
  const t = data.tasks.find((x) => x.id === id);
  if (!t)
    return (
      <Modal title="Task non disponibile" onClose={onClose} size="small">
        <p className="muted">La task è stata eliminata o non esiste più.</p>
      </Modal>
    );
  const p = projectOf(data.projects, t.projectId);
  return (
    <Modal
      title={t.title}
      eyebrow="Dettaglio task"
      onClose={onClose}
      headExtra={
        <div style={{ display: 'flex', gap: 6, marginTop: 8, flexWrap: 'wrap' }}>
          <StatusBadge status={t.status} />
          <PriorityBadge priority={t.priority} />
          {t.recurrenceId && <span className="badge">Ricorrente</span>}
        </div>
      }
      footer={
        <>
          <span className="foot-hint">
            <Pencil size={13} /> Usa la matita sulla card per modificare
          </span>
          <span className="spacer" />
          <button className="btn" onClick={onClose}>
            Chiudi
          </button>
          <button
            className="btn btn-dark"
            onClick={() => {
              onClose();
              navigate('tasks');
            }}
          >
            Vai a Le mie task
          </button>
        </>
      }
    >
      {t.description && (
        <div className="view-block">
          <h4>Descrizione</h4>
          <p>{t.description}</p>
        </div>
      )}
      <div className="view-block">
        <h4>Avanzamento</h4>
        <ProgressBar value={taskProgress(t)} color={p?.color} />
      </div>
      <div className="view-grid">
        <Item label="Progetto" value={p?.name ?? 'Senza progetto'} />
        <Item label="Cliente o reparto" value={t.client || '—'} />
        <Item label="Tipologia" value={t.workType} />
        <Item label="Inizio" value={formatDate(t.startDate)} />
        <Item label="Scadenza" value={t.dueDate ? formatDate(t.dueDate) : 'Nessuna'} />
        <Item label="Tempo effettivo / stimato" value={`${formatMinutes(t.actualMinutes)} / ${formatMinutes(t.estimatedMinutes)}`} />
      </div>
      {t.notes && (
        <div className="view-block">
          <h4>Note</h4>
          <p>{t.notes}</p>
        </div>
      )}
      {t.tags.length > 0 && (
        <div className="view-block">
          <h4>Tag</h4>
          <div className="tags">
            {t.tags.map((tag) => (
              <span key={tag} className="tag">
                #{tag}
              </span>
            ))}
          </div>
        </div>
      )}
      {t.links.length > 0 && (
        <div className="view-block">
          <h4>Link</h4>
          <div className="link-list">
            {t.links.map((l) => {
              const href = safeHref(l);
              return href ? (
                <a key={l} href={href} target="_blank" rel="noopener noreferrer">
                  <ExternalLink size={13} /> {l}
                </a>
              ) : (
                <span key={l}>{l}</span>
              );
            })}
          </div>
        </div>
      )}
    </Modal>
  );
}

function Item({ label, value }: { label: string; value: string }) {
  return (
    <div className="view-item">
      <span>{label}</span>
      <b>{value}</b>
    </div>
  );
}
