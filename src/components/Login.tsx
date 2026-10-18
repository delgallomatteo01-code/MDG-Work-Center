import { useState, type FormEvent } from 'react';
import { Lock, LogIn } from 'lucide-react';
import { api } from '../api';

export function Login({ onSuccess }: { onSuccess: () => void }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api.login(email, password);
      onSuccess();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="login">
      <div className="login-card">
        <img src="/logo-placeholder.svg" alt="Logo Work center" />
        <div className="eyebrow" style={{ marginTop: 18 }}>
          Workspace personale
        </div>
        <h1>
          I tuoi lavori.
          <br />
          <span>Senza rumore.</span>
        </h1>
        <p className="muted" style={{ margin: 0 }}>
          Task, progetti, scadenze e report settimanali in un unico spazio privato.
        </p>
        <form onSubmit={submit}>
          <label className="field">
            <span>Email</span>
            <input className="input" type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} required />
          </label>
          <label className="field">
            <span>Password</span>
            <input
              className="input"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </label>
          {error && <div className="form-error" role="alert">{error}</div>}
          <button className="btn btn-dark" type="submit" disabled={busy}>
            <LogIn size={17} />
            {busy ? 'Accesso in corso…' : 'Accedi'}
          </button>
        </form>
        <p className="login-note">
          <Lock size={14} style={{ flex: 'none', marginTop: 2 }} />
          Workspace riservato: dati, API e allegati sono accessibili solo al proprietario con una sessione autenticata.
        </p>
      </div>
    </div>
  );
}
