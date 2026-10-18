import { useMemo } from 'react';
import { useStore } from '../store';
import { CalendarGrid } from '../components/CalendarGrid';

export function CalendarPage() {
  const { data, openModal } = useStore();
  // Tutte le task non archiviate, completate incluse; il clic apre l'editor.
  const tasks = useMemo(() => data.tasks.filter((t) => !t.archived), [data.tasks]);
  return (
    <>
      <div className="section-head">
        <div>
          <div className="eyebrow">Scadenze</div>
          <h2>Controlla sovrapposizioni e giornate più cariche</h2>
        </div>
      </div>
      <div className="card" style={{ padding: 16 }}>
        <CalendarGrid tasks={tasks} projects={data.projects} onOpen={(t) => openModal({ kind: 'taskEditor', id: t.id })} />
      </div>
    </>
  );
}
