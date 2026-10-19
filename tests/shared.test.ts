import { describe, expect, it } from 'vitest';
import { addMonths, formatMinutes, isValidDate, romeDateOf, weekStart } from '../shared/dates';
import { dueAutomaticPeriod, manualReportPeriod, periodKey, recurrenceDueDate } from '../shared/periods';

describe('date', () => {
  it('settimana da lunedì', () => {
    expect(weekStart('2026-10-18')).toBe('2026-10-12'); // domenica
    expect(weekStart('2026-10-12')).toBe('2026-10-12');
  });
  it('data Europe/Rome dei timestamp, ora legale inclusa', () => {
    expect(romeDateOf('2026-10-18T22:30:00Z')).toBe('2026-10-19'); // CEST +2
    expect(romeDateOf('2026-12-31T23:30:00Z')).toBe('2027-01-01'); // CET +1
    expect(romeDateOf('2026-12-31T22:59:00Z')).toBe('2026-12-31');
  });
  it('validazione date', () => {
    expect(isValidDate('2026-02-29')).toBe(false);
    expect(isValidDate('2028-02-29')).toBe(true);
  });
  it('minuti compatti', () => {
    expect(formatMinutes(90)).toBe('1h 30m');
    expect(formatMinutes(45)).toBe('45m');
    expect(formatMinutes(120)).toBe('2h');
  });
  it('addMonths limita il giorno', () => {
    expect(addMonths('2026-01-31', 1)).toBe('2026-02-28');
  });
});

describe('periodi e ricorrenze', () => {
  it('chiavi periodo', () => {
    expect(periodKey('weekly', '2026-10-18')).toBe('weekly:2026-10-12');
    expect(periodKey('monthly', '2026-10-18')).toBe('monthly:2026-10');
  });
  it('scadenza settimanale conserva il giorno della settimana', () => {
    // base: venerdì 2 ottobre 2026 → venerdì della settimana corrente
    expect(recurrenceDueDate('weekly', '2026-10-02', '2026-10-13')).toBe('2026-10-16');
  });
  it('scadenza mensile limitata all’ultimo giorno valido (febbraio)', () => {
    expect(recurrenceDueDate('monthly', '2026-01-31', '2026-02-03')).toBe('2026-02-28');
    expect(recurrenceDueDate('monthly', '2026-01-31', '2028-02-03')).toBe('2028-02-29');
    expect(recurrenceDueDate('monthly', null, '2026-02-03')).toBeNull();
  });
  it('periodi report manuali', () => {
    expect(manualReportPeriod('weekly', '2026-10-14')).toEqual({ start: '2026-10-12', end: '2026-10-18' });
    expect(manualReportPeriod('monthly', '2026-10-14')).toEqual({ start: '2026-10-01', end: '2026-10-14' });
  });
  it('report automatico settimanale maturo dal venerdì alle 15:00', () => {
    const base = { reportDay: 5, reportMonthDay: 1, reportTime: '15:00' };
    expect(dueAutomaticPeriod('weekly', { ...base, today: '2026-10-16', time: '14:59' })).toBeNull();
    expect(dueAutomaticPeriod('weekly', { ...base, today: '2026-10-16', time: '15:00' })).toEqual({ start: '2026-10-12', end: '2026-10-18' });
    expect(dueAutomaticPeriod('weekly', { ...base, today: '2026-10-18', time: '09:00' })).toEqual({ start: '2026-10-12', end: '2026-10-18' });
    expect(dueAutomaticPeriod('weekly', { ...base, today: '2026-10-19', time: '20:00' })).toBeNull();
  });
  it('report automatico mensile: mese precedente, giorno limitato', () => {
    const base = { reportDay: 5, reportMonthDay: 31, reportTime: '15:00' };
    expect(dueAutomaticPeriod('monthly', { ...base, today: '2026-02-28', time: '15:01' })).toEqual({ start: '2026-01-01', end: '2026-01-31' });
    expect(dueAutomaticPeriod('monthly', { ...base, today: '2026-02-27', time: '23:00' })).toBeNull();
  });
});

describe('copia report', () => {
  it('solo elenco numerato dei nomi', async () => {
    const { buildReport, reportCopyText } = await import('../shared/report');
    const t = (title: string, completedAt: string) =>
      ({ title, projectId: null, client: 'Mkt', workType: 'Banner', completedAt, estimatedMinutes: 60, actualMinutes: 30, notes: 'nota\nsu due righe' }) as never;
    const r = buildReport({ personalName: 'Matteo', start: '2026-10-12', end: '2026-10-18', tasks: [t('Banner autunno', '2026-10-14T10:00:00Z'), t('Newsletter', '2026-10-13T10:00:00Z')], projects: [] });
    expect(reportCopyText(r.plainText)).toBe('1. Banner autunno\n2. Newsletter');
    const empty = buildReport({ personalName: 'Matteo', start: '2026-10-12', end: '2026-10-18', tasks: [], projects: [] });
    expect(reportCopyText(empty.plainText)).toBe('Nessuna attività completata in questo periodo.');
  });
});
