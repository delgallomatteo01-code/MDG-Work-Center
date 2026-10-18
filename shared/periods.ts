import { addDays, addMonths, daysInMonth, isoWeekday, monthEnd, monthStart, weekStart } from './dates';

export type Frequency = 'weekly' | 'monthly';

/** weekly:YYYY-MM-DD (lunedì) oppure monthly:YYYY-MM */
export function periodKey(frequency: Frequency, today: string): string {
  return frequency === 'weekly' ? `weekly:${weekStart(today)}` : `monthly:${today.slice(0, 7)}`;
}

/** Scadenza dell'istanza ricorrente generata oggi a partire dalla data base del template. */
export function recurrenceDueDate(frequency: Frequency, baseDueDate: string | null, today: string): string | null {
  if (!baseDueDate) return null;
  if (frequency === 'weekly') {
    return addDays(weekStart(today), isoWeekday(baseDueDate) - 1);
  }
  const day = Number(baseDueDate.slice(8, 10));
  const [y, m] = today.split('-').map(Number);
  const clamped = Math.min(day, daysInMonth(y, m));
  return `${today.slice(0, 8)}${String(clamped).padStart(2, '0')}`;
}

export interface Period {
  start: string;
  end: string;
}

export function manualReportPeriod(frequency: Frequency, today: string): Period {
  if (frequency === 'weekly') {
    const start = weekStart(today);
    return { start, end: addDays(start, 6) };
  }
  return { start: monthStart(today), end: today };
}

/**
 * Periodo automatico maturato a "now" (data e ora Europe/Rome), oppure null.
 * Settimanale: settimana corrente, dal giorno impostato (venerdì) all'orario scelto fino a domenica.
 * Mensile: mese precedente intero, dal giorno impostato del mese attuale (limitato all'ultimo valido).
 */
export function dueAutomaticPeriod(
  frequency: Frequency,
  opts: { today: string; time: string; reportDay: number; reportMonthDay: number; reportTime: string },
): Period | null {
  const { today, time, reportTime } = opts;
  if (frequency === 'weekly') {
    const start = weekStart(today);
    const trigger = addDays(start, Math.min(7, Math.max(1, opts.reportDay)) - 1);
    if (today < trigger || (today === trigger && time < reportTime)) return null;
    return { start, end: addDays(start, 6) };
  }
  const [y, m] = today.split('-').map(Number);
  const day = Math.min(Math.max(1, opts.reportMonthDay), daysInMonth(y, m));
  const trigger = `${today.slice(0, 8)}${String(day).padStart(2, '0')}`;
  if (today < trigger || (today === trigger && time < reportTime)) return null;
  const prev = addMonths(monthStart(today), -1);
  return { start: prev, end: monthEnd(prev) };
}
