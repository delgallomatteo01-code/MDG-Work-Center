import { X } from 'lucide-react';
import { useStore } from '../store';
import { cx } from '../lib';

export function Toasts() {
  const { toasts, dismissToast } = useStore();
  return (
    <div className="toasts" aria-live="polite">
      {toasts.map((t) => (
        <div key={t.id} className={cx('toast', t.tone === 'error' && 'error')} role={t.tone === 'error' ? 'alert' : 'status'}>
          <p>{t.message}</p>
          {t.undo && (
            <button
              onClick={() => {
                dismissToast(t.id);
                void t.undo!();
              }}
            >
              Annulla
            </button>
          )}
          {t.action && (
            <button
              onClick={() => {
                dismissToast(t.id);
                t.action!.run();
              }}
            >
              {t.action.label}
            </button>
          )}
          <button className="x" onClick={() => dismissToast(t.id)} aria-label="Chiudi notifica">
            <X size={14} />
          </button>
        </div>
      ))}
    </div>
  );
}
