import { Copy, Download } from 'lucide-react';
import { useStore } from '../store';
import { formatDateTime, formatRange } from '../../shared/dates';
import { reportTypeLabel } from '../../shared/report';
import { Modal } from '../components/ui';
import { copyText } from '../clipboard';

export function ReportPreview({ id, onClose }: { id: string; onClose: () => void }) {
  const { data, toast } = useStore();
  const r = data.reports.find((x) => x.id === id);
  if (!r)
    return (
      <Modal title="Report non disponibile" onClose={onClose} size="small">
        <p className="muted">Il report è stato eliminato.</p>
      </Modal>
    );
  return (
    <Modal
      title={reportTypeLabel(r.source, r.frequency)}
      eyebrow={`${formatRange(r.periodStart, r.periodEnd)} · generato il ${formatDateTime(r.createdAt)}`}
      size="wide"
      onClose={onClose}
      footer={
        <>
          <span className="spacer" />
          <button
            className="btn"
            onClick={() => copyText(r.plainText).then(() => toast('Testo del report copiato'), (e: Error) => toast(e.message, { tone: 'error' }))}
          >
            <Copy size={15} /> Copia tutto il testo
          </button>
          <button
            className="btn btn-dark"
            onClick={async () => {
              try {
                // jsPDF caricato solo quando serve
                const { downloadReportPdf } = await import('../reportActions');
                await downloadReportPdf(r, data.settings.personalName, data.settings.accentSecondary);
              } catch (e) {
                toast(`PDF non generato: ${(e as Error).message}`, { tone: 'error' });
              }
            }}
          >
            <Download size={15} /> Scarica PDF
          </button>
        </>
      }
    >
      {/* Snapshot HTML generato e sanificato lato server al momento della generazione */}
      <div className="report-doc" dangerouslySetInnerHTML={{ __html: r.htmlContent }} />
    </Modal>
  );
}
