import { FolderKanban, Pencil, Plus } from 'lucide-react';
import { useStore } from '../store';
import { formatDate } from '../../shared/dates';
import { initials } from '../lib';
import { Empty, ProgressBar, StatusBadge, stop } from '../components/ui';

export function ProjectsView() {
  const { data, openModal } = useStore();
  return (
    <>
      <div className="section-head">
        <div>
          <div className="eyebrow">Progetti</div>
          <h2>{data.projects.length} progetti</h2>
        </div>
        <button className="btn btn-dark" onClick={() => openModal({ kind: 'projectEditor', id: null })}>
          <Plus size={16} /> Nuovo progetto
        </button>
      </div>
      {data.projects.length === 0 ? (
        <div className="card">
          <Empty icon={<FolderKanban size={28} />} title="Nessun progetto">
            Crea un progetto oppure scrivi un nome nuovo nel campo Progetto di una task.
          </Empty>
        </div>
      ) : (
        <div className="cards-4">
          {data.projects.map((p) => {
            // Le statistiche usano le task non archiviate, come nel riferimento.
            const list = data.tasks.filter((t) => !t.archived && t.projectId === p.id);
            const done = list.filter((t) => t.status === 'Completato').length;
            const pct = list.length ? Math.round((done / list.length) * 100) : 0;
            return (
              <article
                key={p.id}
                className="card pcard"
                role="button"
                tabIndex={0}
                onClick={() => openModal({ kind: 'projectDetail', id: p.id })}
                onKeyDown={(e) => e.key === 'Enter' && openModal({ kind: 'projectDetail', id: p.id })}
              >
                <div className="pcard-top">
                  <span className="psymbol" style={{ ['--c' as string]: p.color }}>
                    {initials(p.name)}
                  </span>
                  <div className="client">{p.client || 'Nessun reparto'}</div>
                  <button className="icon-btn" aria-label="Modifica progetto" onClick={stop(() => openModal({ kind: 'projectEditor', id: p.id }))}>
                    <Pencil size={15} />
                  </button>
                </div>
                <h3>{p.name}</h3>
                <p className="clamp-2">{p.description || 'Nessuna descrizione'}</p>
                <div className="pstats">
                  <span>
                    <b>{list.length}</b> task
                  </span>
                  <span>
                    <b>{done}</b> concluse
                  </span>
                  <span>
                    <b>{pct}%</b>
                  </span>
                </div>
                <ProgressBar value={pct} color={p.color} label={false} />
                <div className="pcard-foot">
                  <span>Inizio {formatDate(p.startDate)}</span>
                  <StatusBadge status={p.status} />
                </div>
              </article>
            );
          })}
        </div>
      )}
    </>
  );
}
