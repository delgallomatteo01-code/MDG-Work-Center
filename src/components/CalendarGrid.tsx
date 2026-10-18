import { useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { WEEKDAYS_SHORT, addDays, addMonths, formatMonthYear, monthStart, weekStart } from '../../shared/dates';
import type { Project, Task } from '../../shared/types';
import { cx, projectOf, today as getToday } from '../lib';
import { dueState } from './ui';

/** Task collocate per scadenza, senza griglia oraria; quelle senza scadenza non compaiono. */
export function CalendarGrid({
  tasks,
  projects,
  onOpen,
  showLegend = true,
}: {
  tasks: Task[];
  projects: Project[];
  onOpen: (t: Task) => void;
  showLegend?: boolean;
}) {
  const today = getToday();
  const [mode, setMode] = useState<'week' | 'month'>('week');
  const [anchor, setAnchor] = useState(today);

  const days = useMemo(() => {
    if (mode === 'week') {
      const s = weekStart(anchor);
      return Array.from({ length: 7 }, (_, i) => addDays(s, i));
    }
    const s = weekStart(monthStart(anchor));
    return Array.from({ length: 42 }, (_, i) => addDays(s, i));
  }, [mode, anchor]);

  const byDay = useMemo(() => {
    const map = new Map<string, Task[]>();
    for (const t of tasks) {
      if (!t.dueDate) continue;
      const list = map.get(t.dueDate) ?? [];
      list.push(t);
      map.set(t.dueDate, list);
    }
    return map;
  }, [tasks]);

  const limit = mode === 'week' ? 6 : 3;
  const month = anchor.slice(0, 7);
  const move = (dir: number) => setAnchor((a) => (mode === 'week' ? addDays(a, dir * 7) : addMonths(monthStart(a), dir)));

  return (
    <div>
      <div className="cal-head">
        <div className="segmented">
          <button className={cx(mode === 'week' && 'active')} onClick={() => setMode('week')}>
            Settimana
          </button>
          <button className={cx(mode === 'month' && 'active')} onClick={() => setMode('month')}>
            Mese
          </button>
        </div>
        <button className="icon-btn bordered" onClick={() => move(-1)} aria-label="Precedente">
          <ChevronLeft size={17} />
        </button>
        <button className="btn btn-sm" onClick={() => setAnchor(today)}>
          Oggi
        </button>
        <button className="icon-btn bordered" onClick={() => move(1)} aria-label="Successivo">
          <ChevronRight size={17} />
        </button>
        <h3>{formatMonthYear(mode === 'week' ? weekStart(anchor) : anchor)}</h3>
        {showLegend && (
          <div className="cal-legend">
            <span>
              <span className="dot" style={{ ['--c' as string]: 'var(--danger)' }} /> Scaduta
            </span>
            <span>
              <span className="dot" style={{ ['--c' as string]: 'var(--prio-high)' }} /> Entro 48 ore
            </span>
          </div>
        )}
      </div>
      <div className="cal-scroll">
        <div className={cx('cal-grid', mode)}>
          {WEEKDAYS_SHORT.map((d) => (
            <div key={d} className="cal-dow">
              {d}
            </div>
          ))}
          {days.map((d) => {
            const list = byDay.get(d) ?? [];
            const extra = list.length - limit;
            return (
              <div key={d} className={cx('cal-day', d === today && 'today', mode === 'month' && d.slice(0, 7) !== month && 'other')}>
                <div className="cal-num">
                  <span>{Number(d.slice(8))}</span>
                  {list.length > 0 && <span className="muted">{list.length}</span>}
                </div>
                {list.slice(0, limit).map((t) => {
                  const p = projectOf(projects, t.projectId);
                  const st = dueState(t);
                  return (
                    <button
                      key={t.id}
                      className={cx('cal-task', st, t.status === 'Completato' && 'done')}
                      style={{ ['--c' as string]: p?.color ?? 'var(--muted)' }}
                      onClick={() => onOpen(t)}
                      title={t.title}
                    >
                      <strong>{t.title}</strong>
                      {mode === 'week' && <small>{t.client || t.workType}</small>}
                    </button>
                  );
                })}
                {extra > 0 && <span className="cal-more">+{extra} altre</span>}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
