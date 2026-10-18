import { CheckCircle2, Pencil } from 'lucide-react';
import { useStore } from '../store';
import { formatDate } from '../../shared/dates';
import { initials } from '../lib';
import { Due, Modal, ProgressBar, StatusBadge } from '../components/ui';

export function ProjectDetail({ id, onClose }: { id: string; onClose: () => void }) {
  const { data, act, confirm, openModal } = useStore();
  const p = data.projects.find((x) => x.id === id);
  if (!p)
    return (
      <Modal title="Progetto non disponibile" onClose={onClose} size="small">
        <p className="muted">Il progetto è stato eliminato.</p>
      </Modal>
    );
  const tasks = data.tasks.filter((t) => !t.archived && t.projectId === p.id);
  const done = tasks.filter((t) => t.status === 'Completato').length;
  const pct = tasks.length ? Math.round((done / tasks.length) * 100) : 0;
  const closed = p.status === 'Completato';

  async function closeProject() {
    if (!p) return;
    const ok = await confirm({
      title: 'Chiudere il progetto?',
      message: 'Lo stato del progetto diventerà «Completato». Le task collegate non vengono modificate.',
      confirmLabel: 'Chiudi progetto',
    });
    if (!ok) return;
    const prevStatus = p.status;
    await act('updateProject', { id: p.id, status: 'Completato' }, { success: 'Progetto completato', undo: () => ({ action: 'updateProject', payload: { id: p.id, status: prevStatus } }) }).catch(
      () => undefined,
    );
  }

  return (
    <Modal
      title={p.name}
      eyebrow={p.client || 'Progetto'}
      size="wide"
      onClose={onClose}
      headExtra={
        <div style={{ marginTop: 8 }}>
          <StatusBadge status={p.status} />
        </div>
      }
      footer={
        <>
          <button className="btn" onClick={closeProject} disabled={closed}>
            <CheckCircle2 size={15} /> {closed ? 'Progetto completato' : 'Chiudi progetto'}
          </button>
          <span className="spacer" />
          <button className="btn btn-dark" onClick={() => openModal({ kind: 'projectEditor', id: p.id })}>
            <Pencil size={15} /> Modifica progetto
          </button>
        </>
      }
    >
      <div style={{ display: 'flex', gap: 14, alignItems: 'center' }}>
        <span className="psymbol" style={{ ['--c' as string]: p.color, width: 52, height: 52, fontSize: 17 }}>
          {initials(p.name)}
        </span>
        <div style={{ flex: 1 }}>
          <ProgressBar value={pct} color={p.color} />
        </div>
      </div>
      {p.description && <p style={{ margin: 0 }}>{p.description}</p>}
      <div className="view-grid">
        <div className="view-item">
          <span>Inizio</span>
          <b>{formatDate(p.startDate)}</b>
        </div>
        <div className="view-item">
          <span>Task</span>
          <b>{tasks.length}</b>
        </div>
        <div className="view-item">
          <span>Concluse</span>
          <b>{done}</b>
        </div>
      </div>
      <div className="sub-section">
        <h3>Task collegate</h3>
        {tasks.length === 0 ? (
          <p className="hint" style={{ margin: 0 }}>
            Nessuna task attiva collegata.
          </p>
        ) : (
          <div className="detail-tasks">
            {tasks.map((t) => (
              <button key={t.id} className="detail-task" onClick={() => openModal({ kind: 'taskEditor', id: t.id })}>
                <strong>{t.title}</strong>
                <Due task={t} />
                <StatusBadge status={t.status} />
              </button>
            ))}
          </div>
        )}
      </div>
    </Modal>
  );
}
