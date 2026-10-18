import { formatDate, formatMinutes, romeDateOf } from './dates';
import type { Project, ReportFrequency, ReportSource, Task } from './types';

export function reportTypeLabel(source: ReportSource, frequency: ReportFrequency): string {
  if (source === 'automatic') return frequency === 'monthly' ? 'Report mensile automatico' : 'Report settimanale automatico';
  if (source === 'manual') return 'Report generato manualmente';
  return 'Report personalizzato';
}

export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export interface BuiltReport {
  taskCount: number;
  totalMinutes: number;
  estimatedMinutes: number;
  projectCount: number;
  htmlContent: string;
  plainText: string;
}

/** Task incluse: stato Completato e data di completamento (Europe/Rome) nel periodo, archiviate comprese. */
export function selectReportTasks(tasks: Task[], start: string, end: string, excludeDeleted: boolean): Task[] {
  return tasks
    .filter((t) => {
      if (t.status !== 'Completato' || !t.completedAt) return false;
      if (excludeDeleted && t.deletedAt) return false;
      const d = romeDateOf(t.completedAt);
      return !!d && d >= start && d <= end;
    })
    .sort((a, b) => (b.completedAt ?? '').localeCompare(a.completedAt ?? ''));
}

function countBy(items: string[]): [string, number][] {
  const map = new Map<string, number>();
  for (const k of items) map.set(k, (map.get(k) ?? 0) + 1);
  return [...map.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'it'));
}

export function buildReport(opts: {
  personalName: string;
  start: string;
  end: string;
  tasks: Task[];
  projects: Project[];
}): BuiltReport {
  const { personalName, start, end, tasks, projects } = opts;
  const projectName = (id: string | null) => projects.find((p) => p.id === id)?.name ?? 'Senza progetto';
  const totalMinutes = tasks.reduce((s, t) => s + (t.actualMinutes || 0), 0);
  const estimatedMinutes = tasks.reduce((s, t) => s + (t.estimatedMinutes || 0), 0);
  const byProject = countBy(tasks.map((t) => projectName(t.projectId)));
  const byType = countBy(tasks.map((t) => t.workType || 'Altro'));
  const delta = totalMinutes - estimatedMinutes;
  const deltaText =
    tasks.length === 0
      ? 'Nessuno scostamento da calcolare'
      : delta === 0
        ? 'In linea con la stima'
        : `${formatMinutes(Math.abs(delta))} ${delta > 0 ? 'sopra' : 'sotto'} la stima`;
  const range = `${formatDate(start)} – ${formatDate(end)}`;

  // Testo semplice
  const lines: string[] = [];
  lines.push(`${personalName} · Work center`);
  lines.push('REPORT ATTIVITÀ');
  lines.push(`Periodo: ${range}`);
  lines.push('');
  lines.push(`Task completate: ${tasks.length}`);
  lines.push(`Tempo effettivo: ${formatMinutes(totalMinutes)}`);
  lines.push(`Tempo stimato: ${formatMinutes(estimatedMinutes)}`);
  lines.push(`Progetti: ${byProject.length}`);
  lines.push(`Scostamento: ${deltaText}`);
  if (tasks.length === 0) {
    lines.push('');
    lines.push('Nessuna attività completata in questo periodo.');
  } else {
    lines.push('');
    lines.push('PER PROGETTO');
    for (const [k, n] of byProject) lines.push(`- ${k}: ${n}`);
    lines.push('');
    lines.push('PER TIPOLOGIA');
    for (const [k, n] of byType) lines.push(`- ${k}: ${n}`);
    lines.push('');
    lines.push('ATTIVITÀ COMPLETATE');
    tasks.forEach((t, i) => {
      lines.push('');
      lines.push(`${i + 1}. ${t.title}`);
      lines.push(`   Progetto: ${projectName(t.projectId)}`);
      if (t.client) lines.push(`   Cliente/reparto: ${t.client}`);
      lines.push(`   Tipologia: ${t.workType || 'Altro'}`);
      lines.push(`   Completata il: ${formatDate(romeDateOf(t.completedAt))}`);
      lines.push(`   Tempo stimato: ${formatMinutes(t.estimatedMinutes)} · Tempo effettivo: ${formatMinutes(t.actualMinutes)}`);
      if (t.notes.trim()) lines.push(`   Note: ${t.notes.trim().replace(/\s*\n\s*/g, ' / ')}`);
    });
  }
  const plainText = lines.join('\n');

  // HTML (snapshot)
  const e = escapeHtml;
  const metric = (label: string, value: string) =>
    `<div class="rd-metric"><span class="rd-metric-label">${e(label)}</span><strong>${e(value)}</strong></div>`;
  const tags = (rows: [string, number][]) =>
    `<div class="rd-tags">${rows.map(([k, n]) => `<span class="rd-tag">${e(k)} <b>${n}</b></span>`).join('')}</div>`;
  const items = tasks
    .map((t) => {
      const meta = [projectName(t.projectId), t.client, t.workType || 'Altro', `Completata il ${formatDate(romeDateOf(t.completedAt))}`]
        .filter(Boolean)
        .map(e)
        .join(' · ');
      return `<article class="rd-item"><h3>${e(t.title)}</h3><p class="rd-meta">${meta}</p><p class="rd-times">Stimato <b>${e(
        formatMinutes(t.estimatedMinutes),
      )}</b> · Effettivo <b>${e(formatMinutes(t.actualMinutes))}</b></p>${
        t.notes.trim() ? `<p class="rd-notes">${e(t.notes.trim()).replace(/\n/g, '<br>')}</p>` : ''
      }</article>`;
    })
    .join('');
  const htmlContent = `<div class="rd"><header class="rd-head"><div class="rd-brand"><span class="rd-name">${e(
    personalName,
  )}</span> Work center</div><h1>Report attività</h1><p class="rd-range">${e(range)}</p></header><section class="rd-body"><div class="rd-metrics">${metric(
    'Task completate',
    String(tasks.length),
  )}${metric('Tempo effettivo', formatMinutes(totalMinutes))}${metric('Tempo stimato', formatMinutes(estimatedMinutes))}${metric(
    'Progetti',
    String(byProject.length),
  )}</div><p class="rd-delta">Scostamento: <b>${e(deltaText)}</b></p>${
    tasks.length === 0
      ? '<p class="rd-empty">Nessuna attività completata in questo periodo.</p>'
      : `<h2>Per progetto</h2>${tags(byProject)}<h2>Per tipologia</h2>${tags(byType)}<h2>Attività completate</h2><div class="rd-list">${items}</div>`
  }</section></div>`;

  return { taskCount: tasks.length, totalMinutes, estimatedMinutes, projectCount: byProject.length, htmlContent, plainText };
}
