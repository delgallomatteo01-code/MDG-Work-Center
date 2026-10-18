import { jsPDF } from 'jspdf';
import type { Report } from '../shared/types';
import { formatRange } from '../shared/dates';
import { reportTypeLabel } from '../shared/report';
import { api } from './api';

/** PDF testuale impaginato A4 multipagina (non uno screenshot), intestazione scura. */
export async function downloadReportPdf(report: Report, personalName: string, accent: string) {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const W = 210;
  const H = 297;
  const M = 18;
  const clean = (s: string) => s.replace(/[–—]/g, '-').replace(/[•]/g, '-').replace(/[·]/g, '|').replace(/[^\x00-\xFF]/g, '');

  const header = (first: boolean) => {
    doc.setFillColor(39, 39, 39);
    doc.rect(0, 0, W, first ? 40 : 14, 'F');
    doc.setTextColor(accent);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(first ? 10 : 8);
    doc.text(clean(personalName.toUpperCase()), M, first ? 13 : 9);
    const nameW = doc.getTextWidth(clean(personalName.toUpperCase()));
    doc.setTextColor(185, 181, 172);
    doc.text(' WORK CENTER', M + nameW, first ? 13 : 9);
    if (first) {
      doc.setTextColor(255, 255, 255);
      doc.setFontSize(20);
      doc.text('Report attività', M, 25);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(10);
      doc.setTextColor(212, 208, 199);
      doc.text(clean(`${reportTypeLabel(report.source, report.frequency)} | ${formatRange(report.periodStart, report.periodEnd)}`), M, 33);
    }
  };

  header(true);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.setTextColor(39, 39, 39);
  let y = 52;
  const lineH = 5;
  // Le prime tre righe del testo ripetono intestazione e periodo: già nella testata.
  const lines = report.plainText.split('\n').slice(3);
  for (const raw of lines) {
    const isHeading = /^[A-ZÀ-Ü ]{6,}$/.test(raw.trim());
    doc.setFont('helvetica', isHeading ? 'bold' : 'normal');
    const wrapped = doc.splitTextToSize(clean(raw) || ' ', W - M * 2) as string[];
    for (const w of wrapped) {
      if (y > H - M) {
        doc.addPage();
        header(false);
        doc.setFont('helvetica', isHeading ? 'bold' : 'normal');
        doc.setFontSize(10);
        doc.setTextColor(39, 39, 39);
        y = 26;
      }
      doc.text(w, M, y);
      y += lineH;
    }
  }
  const pages = doc.getNumberOfPages();
  for (let i = 1; i <= pages; i++) {
    doc.setPage(i);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(119, 115, 108);
    doc.text(`${i} / ${pages}`, W - M, H - 8, { align: 'right' });
  }
  await api.saveFile(`report-${report.periodStart}-${report.periodEnd}.pdf`, doc.output('blob'));
}
