import { useEffect, useRef, type ReactNode } from 'react';
import { CalendarClock, X } from 'lucide-react';
import { STATUS_PROGRESS, type Priority, type TaskStatus } from '../../shared/constants';
import { diffDays, formatDate } from '../../shared/dates';
import type { Task } from '../../shared/types';
import { PRIORITY_COLOR, STATUS_COLOR, cx, isOpen, today } from '../lib';

/** Pila delle modali aperte: Esc chiude solo quella in primo piano. */
const modalStack: symbol[] = [];

export function Modal({
  title,
  eyebrow,
  onClose,
  children,
  footer,
  size = 'standard',
  headExtra,
}: {
  title: ReactNode;
  eyebrow?: ReactNode;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  size?: 'standard' | 'wide' | 'small';
  headExtra?: ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  useEffect(() => {
    const me = Symbol('modal');
    modalStack.push(me);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && modalStack[modalStack.length - 1] === me) {
        e.stopPropagation();
        closeRef.current();
      }
    };
    window.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    ref.current?.querySelector<HTMLElement>('[data-autofocus]')?.focus();
    return () => {
      modalStack.splice(modalStack.indexOf(me), 1);
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, []);
  return (
    <div className="backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className={cx('modal', size === 'wide' && 'wide', size === 'small' && 'small')} role="dialog" aria-modal="true" ref={ref}>
        <div className="modal-head">
          <div style={{ minWidth: 0 }}>
            {eyebrow && <div className="eyebrow" style={{ marginBottom: 4 }}>{eyebrow}</div>}
            <h2>{title}</h2>
            {headExtra}
          </div>
          <button className="icon-btn" onClick={onClose} aria-label="Chiudi">
            <X size={18} />
          </button>
        </div>
        <div className="modal-body">{children}</div>
        {footer && <div className="modal-foot">{footer}</div>}
      </div>
    </div>
  );
}

export function StatusBadge({ status }: { status: TaskStatus | string }) {
  const c = STATUS_COLOR[status as TaskStatus] ?? 'var(--muted)';
  return (
    <span className="badge" style={{ ['--c' as string]: c }}>
      <span className="dot" />
      {status}
    </span>
  );
}

export function PriorityBadge({ priority }: { priority: Priority }) {
  return (
    <span className="badge" style={{ ['--c' as string]: PRIORITY_COLOR[priority] }}>
      {priority}
    </span>
  );
}

export function ProgressBar({ value, color, label = true }: { value: number; color?: string; label?: boolean }) {
  return (
    <div className="progress">
      <div className="bar" style={{ ['--c' as string]: color ?? 'var(--accent)' }}>
        <i style={{ width: `${Math.max(0, Math.min(100, value))}%` }} />
      </div>
      {label && <span>{value}%</span>}
    </div>
  );
}

export const taskProgress = (t: Task) => STATUS_PROGRESS[t.status] ?? 0;

/** Scadenza: rossa se passata e aperta, arancione entro due giorni; senza data nessun allarme. */
export function dueState(t: Task): 'overdue' | 'soon' | null {
  if (!t.dueDate || !isOpen(t)) return null;
  const d = diffDays(t.dueDate, today());
  if (d < 0) return 'overdue';
  if (d <= 2) return 'soon';
  return null;
}

export function Due({ task, icon = true }: { task: Task; icon?: boolean }) {
  if (!task.dueDate) return <span className="due">{icon && <CalendarClock size={13} />}Nessuna scadenza</span>;
  const st = dueState(task);
  const d = diffDays(task.dueDate, today());
  const label = d === 0 ? 'Oggi' : d === 1 ? 'Domani' : d === -1 ? 'Ieri' : formatDate(task.dueDate, false);
  return (
    <span className={cx('due', st)} title={formatDate(task.dueDate)}>
      {icon && <CalendarClock size={13} />}
      {label}
    </span>
  );
}

export function Empty({ icon, title, children }: { icon?: ReactNode; title: string; children?: ReactNode }) {
  return (
    <div className="empty">
      {icon}
      <strong>{title}</strong>
      {children && <div style={{ maxWidth: 380 }}>{children}</div>}
    </div>
  );
}

/** Evita che i pulsanti interni alle card attivino anche il clic della card. */
export const stop = (fn: () => void) => (e: { stopPropagation: () => void }) => {
  e.stopPropagation();
  fn();
};
