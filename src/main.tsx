import { StrictMode, useCallback, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { api, ApiError } from './api';
import { App } from './App';
import { Login } from './components/Login';
import { StoreProvider } from './store';
import type { AppData } from '../shared/types';
import './styles.css';

type State = { phase: 'loading' } | { phase: 'login' } | { phase: 'error'; message: string } | { phase: 'ready'; data: AppData };

function Root() {
  const [state, setState] = useState<State>({ phase: 'loading' });

  const load = useCallback(async () => {
    setState({ phase: 'loading' });
    try {
      const data = await api.load();
      setState({ phase: 'ready', data });
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) setState({ phase: 'login' });
      else setState({ phase: 'error', message: (err as Error).message });
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  if (state.phase === 'loading')
    return (
      <div className="splash">
        <img src="/logo-placeholder.svg" alt="" />
        <span>Preparo il tuo workspace…</span>
      </div>
    );
  if (state.phase === 'login') return <Login onSuccess={load} />;
  if (state.phase === 'error')
    return (
      <div className="splash">
        <strong style={{ color: 'var(--text)' }}>Impossibile caricare il workspace</strong>
        <span>{state.message}</span>
        <button className="btn btn-primary" onClick={load}>
          Riprova
        </button>
      </div>
    );
  return (
    <StoreProvider initial={state.data}>
      <App onLogout={() => setState({ phase: 'login' })} />
    </StoreProvider>
  );
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Root />
  </StrictMode>,
);
