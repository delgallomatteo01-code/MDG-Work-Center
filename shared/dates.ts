import { TIMEZONE } from './constants';

/**
 * Le date di calendario (YYYY-MM-DD) sono trattate come valori puri, senza fuso:
 * l'aritmetica avviene in UTC a mezzanotte, così non si spostano di un giorno.
 * "Oggi", l'ora corrente e la data di un timestamp ISO si calcolano in Europe/Rome.
 */

const partsFormatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: TIMEZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
});

export function romeParts(at: Date = new Date()): { date: string; time: string } {
  const p: Record<string, string> = {};
  for (const part of partsFormatter.formatToParts(at)) p[part.type] = part.value;
  return { date: `${p.year}-${p.month}-${p.day}`, time: `${p.hour}:${p.minute}` };
}

export function todayRome(at: Date = new Date()): string {
  return romeParts(at).date;
}

/** Data di calendario (Europe/Rome) di un timestamp ISO. */
export function romeDateOf(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return romeParts(d).date;
}

export function isValidDate(s: unknown): s is string {
  if (typeof s !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const d = parseDate(s);
  return toDateString(d) === s;
}

export function parseDate(s: string): Date {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

export function toDateString(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function addDays(s: string, n: number): string {
  const d = parseDate(s);
  d.setUTCDate(d.getUTCDate() + n);
  return toDateString(d);
}

export function diffDays(a: string, b: string): number {
  return Math.round((parseDate(a).getTime() - parseDate(b).getTime()) / 86_400_000);
}

/** 1 = lunedì … 7 = domenica */
export function isoWeekday(s: string): number {
  const wd = parseDate(s).getUTCDay();
  return wd === 0 ? 7 : wd;
}

export function weekStart(s: string): string {
  return addDays(s, 1 - isoWeekday(s));
}

export function monthStart(s: string): string {
  return s.slice(0, 8) + '01';
}

export function daysInMonth(year: number, month1: number): number {
  return new Date(Date.UTC(year, month1, 0)).getUTCDate();
}

export function monthEnd(s: string): string {
  const [y, m] = s.split('-').map(Number);
  return `${s.slice(0, 8)}${String(daysInMonth(y, m)).padStart(2, '0')}`;
}

export function addMonths(s: string, n: number): string {
  const [y, m, d] = s.split('-').map(Number);
  const total = y * 12 + (m - 1) + n;
  const ny = Math.floor(total / 12);
  const nm = (total % 12) + 1;
  const nd = Math.min(d, daysInMonth(ny, nm));
  return `${ny}-${String(nm).padStart(2, '0')}-${String(nd).padStart(2, '0')}`;
}

export function nowIso(): string {
  return new Date().toISOString();
}

const MONTHS = ['gen', 'feb', 'mar', 'apr', 'mag', 'giu', 'lug', 'ago', 'set', 'ott', 'nov', 'dic'];
const MONTHS_LONG = [
  'gennaio', 'febbraio', 'marzo', 'aprile', 'maggio', 'giugno',
  'luglio', 'agosto', 'settembre', 'ottobre', 'novembre', 'dicembre',
];
const WEEKDAYS_LONG = ['lunedì', 'martedì', 'mercoledì', 'giovedì', 'venerdì', 'sabato', 'domenica'];
export const WEEKDAYS_SHORT = ['Lun', 'Mar', 'Mer', 'Gio', 'Ven', 'Sab', 'Dom'];

/** 18 ott 2026 */
export function formatDate(s: string | null | undefined, withYear = true): string {
  if (!s || !isValidDate(s)) return '—';
  const [y, m, d] = s.split('-').map(Number);
  return withYear ? `${d} ${MONTHS[m - 1]} ${y}` : `${d} ${MONTHS[m - 1]}`;
}

/** domenica 18 ottobre 2026 */
export function formatLongDate(s: string): string {
  const [y, m, d] = s.split('-').map(Number);
  return `${WEEKDAYS_LONG[isoWeekday(s) - 1]} ${d} ${MONTHS_LONG[m - 1]} ${y}`;
}

export function formatMonthYear(s: string): string {
  const [y, m] = s.split('-').map(Number);
  const name = MONTHS_LONG[m - 1];
  return `${name.charAt(0).toUpperCase()}${name.slice(1)} ${y}`;
}

/** Data e ora in Europe/Rome di un timestamp ISO: 18 ott 2026, 15:04 */
export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  const p = romeParts(d);
  return `${formatDate(p.date)}, ${p.time}`;
}

export function formatRange(start: string, end: string): string {
  return `${formatDate(start)} – ${formatDate(end)}`;
}

/** 90 → "1h 30m", 45 → "45m", 0 → "0m" */
export function formatMinutes(min: number | null | undefined): string {
  const m = Math.max(0, Math.round(min ?? 0));
  const h = Math.floor(m / 60);
  const r = m % 60;
  if (h && r) return `${h}h ${r}m`;
  if (h) return `${h}h`;
  return `${r}m`;
}

/** Variante sintetica: zero diventa un trattino. */
export function formatMinutesShort(min: number | null | undefined): string {
  return !min ? '—' : formatMinutes(min);
}
