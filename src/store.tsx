import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { api, type ActionResponse } from './api';
import type { QuickFilter, Section } from './lib';
import type { AppData } from '../shared/types';

export type Modal =
  | { kind: 'taskEditor'; id: string | null; defaults?: { dueDate?: string; projectName?: string } }
  | { kind: 'taskView'; id: string }
  | { kind: 'projectEditor'; id: string | null }
  | { kind: 'projectDetail'; id: string }
  | { kind: 'noteEditor'; id: string | null }
  | { kind: 'noteView'; id: string }
  | { kind: 'report'; id: string };

export interface ConfirmDialog {
  title: string;
  message: string;
  confirmLabel: string;
  danger?: boolean;
  resolve: (ok: boolean) => void;
}

export interface Toast {
  id: number;
  message: string;
  tone: 'default' | 'error' | 'success';
  undo?: () => Promise<unknown>;
  action?: { label: string; run: () => void };
}

type UndoSpec = { action: string; payload: object } | null;

export interface ActOptions {
  success?: string | ((res: ActionResponse) => string);
  undo?: (res: ActionResponse) => UndoSpec;
  undoMessage?: string;
  silent?: boolean;
}

interface Store {
  data: AppData;
  saving: boolean;
  section: Section;
  quickFilter: QuickFilter;
  navigate: (s: Section, quick?: QuickFilter) => void;
  setQuickFilter: (q: QuickFilter) => void;
  modal: Modal | null;
  openModal: (m: Modal) => void;
  closeModal: () => void;
  toasts: Toast[];
  toast: (message: string, opts?: Partial<Omit<Toast, 'id' | 'message'>>) => void;
  dismissToast: (id: number) => void;
  act: (action: string, payload: object, opts?: ActOptions) => Promise<ActionResponse>;
  track: <T>(p: Promise<T>) => Promise<T>;
  replaceData: (d: AppData) => void;
  confirm: (opts: { title: string; message: string; confirmLabel: string; danger?: boolean }) => Promise<boolean>;
  confirmDialog: ConfirmDialog | null;
}

const Ctx = createContext<Store | null>(null);

export function useStore(): Store {
  const s = useContext(Ctx);
  if (!s) throw new Error('Store non disponibile');
  return s;
}

export function StoreProvider({ initial, children }: { initial: AppData; children: ReactNode }) {
  const [data, setData] = useState(initial);
  const [pending, setPending] = useState(0);
  const [section, setSection] = useState<Section>('dashboard');
  const [quickFilter, setQuickFilter] = useState<QuickFilter>('all');
  const [modal, setModal] = useState<Modal | null>(null);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const seq = useRef(0);
  const timers = useRef(new Map<number, number>());

  const dismissToast = useCallback((id: number) => {
    setToasts((t) => t.filter((x) => x.id !== id));
    const h = timers.current.get(id);
    if (h) window.clearTimeout(h);
    timers.current.delete(id);
  }, []);

  const toast = useCallback<Store['toast']>(
    (message, opts = {}) => {
      const id = ++seq.current;
      const t: Toast = { id, message, tone: opts.tone ?? 'default', undo: opts.undo, action: opts.action };
      // L'Annulla vale per l'ultima azione: i toast con Annulla precedenti vengono sostituiti.
      setToasts((list) => [...list.filter((x) => !(t.undo && x.undo)), t].slice(-4));
      const ms = opts.undo ? 6500 : opts.tone === 'error' ? 5000 : 2600;
      timers.current.set(id, window.setTimeout(() => dismissToast(id), ms));
    },
    [dismissToast],
  );

  const track = useCallback(async <T,>(p: Promise<T>) => {
    setPending((n) => n + 1);
    try {
      return await p;
    } finally {
      setPending((n) => n - 1);
    }
  }, []);

  const act = useCallback<Store['act']>(
    async (action, payload, opts = {}) => {
      try {
        const res = await track(api.action(action, payload));
        setData(res.data);
        const spec = opts.undo?.(res) ?? null;
        const msg = typeof opts.success === 'function' ? opts.success(res) : opts.success;
        if (msg && !opts.silent) {
          toast(msg, {
            tone: res.skipped ? 'default' : 'success',
            undo: spec
              ? async () => {
                  try {
                    const r2 = await track(api.action(spec.action, spec.payload));
                    setData(r2.data);
                    toast(opts.undoMessage ?? 'Azione annullata');
                  } catch (err) {
                    toast((err as Error).message, { tone: 'error' });
                  }
                }
              : undefined,
          });
        }
        return res;
      } catch (err) {
        toast((err as Error).message, { tone: 'error' });
        throw err;
      }
    },
    [toast, track],
  );

  const navigate = useCallback((s: Section, quick?: QuickFilter) => {
    setSection(s);
    if (quick) setQuickFilter(quick);
    window.scrollTo({ top: 0 });
  }, []);

  // La conferma è un livello separato: la modale sottostante (e il suo stato) resta montata.
  const [confirmDialog, setConfirmDialog] = useState<ConfirmDialog | null>(null);
  const confirm = useCallback<Store['confirm']>(
    (o) =>
      new Promise<boolean>((resolve) => {
        setConfirmDialog({
          ...o,
          resolve: (ok) => {
            setConfirmDialog(null);
            resolve(ok);
          },
        });
      }),
    [],
  );

  const closeModal = useCallback(() => setModal(null), []);

  useEffect(() => () => timers.current.forEach((h) => window.clearTimeout(h)), []);

  const value = useMemo<Store>(
    () => ({
      data,
      saving: pending > 0,
      section,
      quickFilter,
      navigate,
      setQuickFilter,
      modal,
      openModal: setModal,
      closeModal,
      toasts,
      toast,
      dismissToast,
      act,
      track,
      replaceData: setData,
      confirm,
      confirmDialog,
    }),
    [data, pending, section, quickFilter, navigate, modal, closeModal, toasts, toast, dismissToast, act, track, confirm, confirmDialog],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
