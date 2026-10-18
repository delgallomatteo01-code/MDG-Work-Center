import { useStore } from '../store';
import { Modal } from '../components/ui';
import { TaskEditor } from './TaskEditor';
import { TaskView } from './TaskView';
import { ProjectEditor } from './ProjectEditor';
import { ProjectDetail } from './ProjectDetail';
import { NoteEditor, NoteView } from './NoteModals';
import { ReportPreview } from './ReportPreview';

export function ModalHost() {
  const { modal, closeModal, confirmDialog } = useStore();
  return (
    <>
      {modal?.kind === 'taskEditor' && <TaskEditor key={modal.id ?? 'new'} id={modal.id} defaults={modal.defaults} onClose={closeModal} />}
      {modal?.kind === 'taskView' && <TaskView id={modal.id} onClose={closeModal} />}
      {modal?.kind === 'projectEditor' && <ProjectEditor key={modal.id ?? 'new'} id={modal.id} onClose={closeModal} />}
      {modal?.kind === 'projectDetail' && <ProjectDetail id={modal.id} onClose={closeModal} />}
      {modal?.kind === 'noteEditor' && <NoteEditor key={modal.id ?? 'new'} id={modal.id} onClose={closeModal} />}
      {modal?.kind === 'noteView' && <NoteView id={modal.id} onClose={closeModal} />}
      {modal?.kind === 'report' && <ReportPreview id={modal.id} onClose={closeModal} />}
      {confirmDialog && (
        <Modal
          title={confirmDialog.title}
          size="small"
          onClose={() => confirmDialog.resolve(false)}
          footer={
            <>
              <span className="spacer" />
              <button className="btn" onClick={() => confirmDialog.resolve(false)}>
                Annulla
              </button>
              <button
                className={confirmDialog.danger ? 'btn btn-primary' : 'btn btn-dark'}
                style={confirmDialog.danger ? { background: 'var(--danger)', borderColor: 'var(--danger)' } : undefined}
                data-autofocus
                onClick={() => confirmDialog.resolve(true)}
              >
                {confirmDialog.confirmLabel}
              </button>
            </>
          }
        >
          <p style={{ margin: 0 }}>{confirmDialog.message}</p>
        </Modal>
      )}
    </>
  );
}
