import { useState } from 'react';
import { Archive, CalendarClock, Copy, Eye, FileText, Sparkles, Zap } from 'lucide-react';
import { useStore } from '../store';
import { addDays, formatMinutes, formatRange, isValidDate } from '../../shared/dates';
import { reportTypeLabel } from '../../shared/report';
import type { Report } from '../../shared/types';
import { cx, today } from '../lib';
import { Empty } from '../components/ui';
import { copyText } from '../clipboard';

export function ReportsView() {
  const { data, act, toast } = useStore();
  const s = data.settings;
  const [from, setFrom] = useState(addDays(today(), -6));
  const [to, setTo] = useState(today());
  const reports = data.reports.filter((r) => !r.archived);
  const weekly = s.reportFrequency === 'weekly';

  const generate = (payload: object) =>
    act('generateReport', payload, {
      success: (r) => (r.skipped ? r.message ?? 'Report non creato' : 'Report generato'),
      undo: (r) => (r.createdId ? { action: 'deleteReport', payload: { id: r.createdId } } : null),
    }).catch(() => undefined);

  function generateCustom() {
    if (!isValidDate(from) || !isValidDate(to)) return toast('Inserisci due date valide.', { tone: 'error' });
    if (from > to) return toast('La data «Da» deve precedere la data «A».', { tone: 'error' });
    void generate({ kind: 'custom', start: from, end: to });
  }

  const schedule = weekly ? `Ogni venerdì alle ${s.reportTime}` : `Ogni mese, il giorno ${s.reportMonthDay} alle ${s.reportTime} (mese precedente)`;

  return (
    <>
      <section className="card report-hero">
        <div className="kpi-icon" style={{ ['--c' as string]: 'var(--accent)', width: 52, height: 52 }}>
          <Sparkles size={24} />
        </div>
        <div>
          <div className="eyebrow">Report automatico</div>
          <h2>{weekly ? 'Un report a settimana' : 'Un report al mese'}</h2>
          <div className="meta">
            <span className="badge" style={{ ['--c' as string]: s.reportEnabled ? 'var(--success)' : 'var(--muted)' }}>
              <span className="dot" />
              {s.reportEnabled ? 'Attivo' : 'Disattivato'}
            </span>
            <span>{schedule}</span>
            <span>· Europe/Rome</span>
          </div>
          <p className="hint">Il controllo avviene all’apertura dell’app: se il sito resta chiuso, il report viene creato al primo accesso utile del periodo.</p>
        </div>
        <button className="btn btn-primary" onClick={() => generate({ kind: s.reportFrequency })}>
          <Zap size={16} /> Genera ora
        </button>
      </section>

      <section className="card custom-bar">
        <div style={{ alignSelf: 'center', marginRight: 6 }}>
          <div className="eyebrow">Report personalizzato</div>
          <strong>Scegli un intervallo</strong>
        </div>
        <label className="field">
          <span>Da</span>
          <input className="input" type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
        </label>
        <label className="field">
          <span>A</span>
          <input className="input" type="date" value={to} onChange={(e) => setTo(e.target.value)} />
        </label>
        <button className="btn btn-dark" onClick={generateCustom}>
          <CalendarClock size={16} /> Genera
        </button>
      </section>

      {reports.length === 0 ? (
        <div className="card">
          <Empty icon={<FileText size={28} />} title="Nessun report attivo">
            Genera un report oppure attendi il prossimo report automatico. I report archiviati sono nella sezione Archivio.
          </Empty>
        </div>
      ) : (
        <div className="cards-3">
          {reports.map((r) => (
            <ReportCard key={r.id} report={r} />
          ))}
        </div>
      )}
    </>
  );
}

function ReportCard({ report: r }: { report: Report }) {
  const { act, openModal, toast } = useStore();
  return (
    <article className={cx('card rcard', r.source === 'automatic' && 'auto')}>
      <div className="rcard-head">
        <div>
          <div className="eyebrow" style={{ color: r.source === 'automatic' ? 'var(--accent-2)' : undefined }}>
            {r.source === 'automatic' ? 'Automatico' : r.source === 'manual' ? 'Manuale' : 'Personalizzato'}
          </div>
          <h3>{reportTypeLabel(r.source, r.frequency)}</h3>
          <div className="muted" style={{ fontSize: 12.5 }}>
            {formatRange(r.periodStart, r.periodEnd)}
          </div>
        </div>
        <button
          className="icon-btn"
          title="Sposta nell’archivio"
          aria-label="Sposta nell’archivio"
          onClick={() =>
            act('archiveReport', { id: r.id }, {
              success: 'Report archiviato',
              undo: () => ({ action: 'restoreReportState', payload: { id: r.id, archived: r.archived, archivedAt: r.archivedAt } }),
            }).catch(() => undefined)
          }
        >
          <Archive size={16} />
        </button>
      </div>
      <div className="rstats">
        <div>
          <b>{r.taskCount}</b>
          <span>Task completate</span>
        </div>
        <div>
          <b>{formatMinutes(r.totalMinutes)}</b>
          <span>Tempo effettivo</span>
        </div>
        <div>
          <b>{r.projectCount}</b>
          <span>Progetti</span>
        </div>
      </div>
      <div className="rcard-actions">
        <button className="btn btn-sm" onClick={() => openModal({ kind: 'report', id: r.id })}>
          <Eye size={14} /> Apri anteprima
        </button>
        <button
          className="btn btn-sm"
          onClick={() => copyText(r.plainText).then(() => toast('Report copiato negli appunti'), (e: Error) => toast(e.message, { tone: 'error' }))}
        >
          <Copy size={14} /> Copia report
        </button>
      </div>
    </article>
  );
}
