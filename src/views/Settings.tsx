import { useRef, useState } from 'react';
import { Archive, FileText, ImageUp, Palette, RotateCcw, Save, UserRound } from 'lucide-react';
import { useStore } from '../store';
import { api } from '../api';
import { logoUrl } from '../App';
import { DEFAULT_ACCENT_PRIMARY, DEFAULT_ACCENT_SECONDARY, MAX_LOGO_BYTES, PERSONAL_NAME_MAX } from '../../shared/constants';
import type { Settings } from '../../shared/types';
import { cx } from '../lib';

const HEX = /^#[0-9a-f]{6}$/i;

export function SettingsView() {
  const { data, act, track, replaceData, toast } = useStore();
  const s = data.settings;
  const [form, setForm] = useState(() => ({
    personalName: s.personalName,
    theme: s.theme,
    accentPrimary: s.accentPrimary,
    accentSecondary: s.accentSecondary,
    reportEnabled: s.reportEnabled,
    reportFrequency: s.reportFrequency,
    reportDay: s.reportDay,
    reportMonthDay: String(s.reportMonthDay),
    reportTime: s.reportTime,
    emptyReportBehavior: s.emptyReportBehavior,
    archiveDays: String(s.archiveDays),
    notificationHours: String(s.notificationHours),
  }));
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const set = <K extends keyof typeof form>(k: K, v: (typeof form)[K]) => setForm((f) => ({ ...f, [k]: v }));

  async function save() {
    setError(null);
    const name = form.personalName.trim();
    if (!name) return setError('Il nome personale è obbligatorio.');
    if (!HEX.test(form.accentPrimary) || !HEX.test(form.accentSecondary)) return setError('I colori devono essere nel formato #RRGGBB.');
    const archiveDays = Number(form.archiveDays);
    const notificationHours = Number(form.notificationHours);
    const monthDay = Number(form.reportMonthDay);
    if (!Number.isInteger(archiveDays) || archiveDays < 1) return setError('«Archivia dopo» deve essere un intero positivo.');
    if (!Number.isInteger(notificationHours) || notificationHours < 1) return setError('«Avviso scadenza» deve essere un intero positivo.');
    if (!Number.isInteger(monthDay) || monthDay < 1 || monthDay > 31) return setError('Il giorno del mese deve essere tra 1 e 31.');
    const payload: Partial<Settings> = {
      personalName: name,
      theme: form.theme,
      accentPrimary: form.accentPrimary.toUpperCase(),
      accentSecondary: form.accentSecondary.toUpperCase(),
      reportEnabled: form.reportEnabled,
      reportFrequency: form.reportFrequency,
      reportDay: form.reportDay,
      reportMonthDay: monthDay,
      reportTime: form.reportTime,
      emptyReportBehavior: form.emptyReportBehavior,
      archiveDays,
      notificationHours,
    };
    await act('updateSettings', payload, { success: 'Impostazioni salvate' }).catch((e: Error) => setError(e.message));
  }

  async function uploadLogo(file: File) {
    if (!/^image\/(png|jpeg|webp)$/.test(file.type)) return toast('Formato non supportato: usa PNG, JPG o WebP.', { tone: 'error' });
    if (file.size > MAX_LOGO_BYTES) return toast('Il logo supera 4 MiB.', { tone: 'error' });
    try {
      const res = await track(api.uploadLogo(file));
      replaceData(res.data);
      toast('Logo aggiornato', { tone: 'success' });
    } catch (e) {
      toast((e as Error).message, { tone: 'error' });
    }
  }

  async function resetLogo() {
    try {
      const res = await track(api.resetLogo());
      replaceData(res.data);
      toast('Logo originale ripristinato', { tone: 'success' });
    } catch (e) {
      toast((e as Error).message, { tone: 'error' });
    }
  }

  return (
    <div className="settings">
      <section className="card settings-group">
        <header>
          <span className="settings-icon">
            <UserRound size={19} />
          </span>
          <div>
            <h2>Profilo e identità</h2>
            <p>Nome usato nel saluto, nel profilo e nei report generati da ora in poi.</p>
          </div>
        </header>
        <div className="grid-2">
          <label className="field">
            <span>Nome personale *</span>
            <input className="input" maxLength={PERSONAL_NAME_MAX} value={form.personalName} onChange={(e) => set('personalName', e.target.value)} />
          </label>
          <div className="field">
            <span className="field-label">Logo personale</span>
            <div className="logo-row">
              <div className="logo-preview">
                <img src={logoUrl(s.logoUpdatedAt)} alt="Anteprima logo" />
              </div>
              <div style={{ display: 'grid', gap: 8 }}>
                <button className="btn btn-sm" onClick={() => fileRef.current?.click()}>
                  <ImageUp size={15} /> Carica logo
                </button>
                <button className="btn btn-sm btn-ghost" onClick={resetLogo} disabled={!s.hasCustomLogo}>
                  <RotateCcw size={15} /> Ripristina originale
                </button>
              </div>
              <input
                ref={fileRef}
                type="file"
                accept="image/png,image/jpeg,image/webp"
                hidden
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  e.target.value = '';
                  if (f) void uploadLogo(f);
                }}
              />
            </div>
            <p className="hint">PNG, JPG o WebP fino a 4 MiB. Salvataggio immediato; aggiorna sidebar e favicon. Il logo predefinito è un segnaposto sostituibile.</p>
          </div>
        </div>
      </section>

      <section className="card settings-group">
        <header>
          <span className="settings-icon">
            <Palette size={19} />
          </span>
          <div>
            <h2>Aspetto e colori</h2>
            <p>Nero, bianco e superfici restano la base; gli accenti sono personalizzabili.</p>
          </div>
        </header>
        <div className="grid-3">
          <div className="field">
            <span className="field-label">Tema</span>
            <div className="segmented">
              {(
                [
                  ['light', 'Chiaro'],
                  ['dark', 'Scuro'],
                  ['system', 'Sistema'],
                ] as const
              ).map(([v, l]) => (
                <button key={v} className={cx(form.theme === v && 'active')} onClick={() => set('theme', v)}>
                  {l}
                </button>
              ))}
            </div>
          </div>
          <ColorField label="Accento principale" value={form.accentPrimary} onChange={(v) => set('accentPrimary', v)} fallback={DEFAULT_ACCENT_PRIMARY} />
          <ColorField label="Accento secondario" value={form.accentSecondary} onChange={(v) => set('accentSecondary', v)} fallback={DEFAULT_ACCENT_SECONDARY} />
        </div>
      </section>

      <section className="card settings-group">
        <header>
          <span className="settings-icon">
            <FileText size={19} />
          </span>
          <div>
            <h2>Report automatico</h2>
            <p>La frequenza vale anche per le task ricorrenti.</p>
          </div>
        </header>
        <div className="grid-3">
          <label className="field">
            <span>Stato</span>
            <select className="select" value={form.reportEnabled ? '1' : '0'} onChange={(e) => set('reportEnabled', e.target.value === '1')}>
              <option value="1">Attivo</option>
              <option value="0">Disattivato</option>
            </select>
          </label>
          <label className="field">
            <span>Frequenza</span>
            <select className="select" value={form.reportFrequency} onChange={(e) => set('reportFrequency', e.target.value as 'weekly' | 'monthly')}>
              <option value="weekly">Settimanale</option>
              <option value="monthly">Mensile</option>
            </select>
          </label>
          {form.reportFrequency === 'weekly' ? (
            <label className="field">
              <span>Giorno</span>
              <select className="select" value={form.reportDay} onChange={(e) => set('reportDay', Number(e.target.value))}>
                <option value={5}>Venerdì</option>
              </select>
            </label>
          ) : (
            <label className="field">
              <span>Giorno del mese</span>
              <input className="input" type="number" min={1} max={31} value={form.reportMonthDay} onChange={(e) => set('reportMonthDay', e.target.value)} />
            </label>
          )}
          <label className="field">
            <span>Ora</span>
            <input className="input" type="time" value={form.reportTime} onChange={(e) => set('reportTime', e.target.value)} />
          </label>
          <label className="field">
            <span>Fuso orario</span>
            <input className="input" value="Europe/Rome" readOnly />
          </label>
          <label className="field">
            <span>Se non ci sono attività</span>
            <select className="select" value={form.emptyReportBehavior} onChange={(e) => set('emptyReportBehavior', e.target.value as 'generate' | 'skip')}>
              <option value="generate">Crea comunque la card</option>
              <option value="skip">Non creare il report</option>
            </select>
          </label>
        </div>
      </section>

      <section className="card settings-group">
        <header>
          <span className="settings-icon">
            <Archive size={19} />
          </span>
          <div>
            <h2>Archivio e scadenze</h2>
            <p>Le task completate vengono archiviate automaticamente dopo il numero di giorni indicato.</p>
          </div>
        </header>
        <div className="grid-2">
          <label className="field">
            <span>Archivia dopo (giorni)</span>
            <input className="input" type="number" min={1} value={form.archiveDays} onChange={(e) => set('archiveDays', e.target.value)} />
          </label>
          <label className="field">
            <span>Avviso scadenza (ore)</span>
            <input className="input" type="number" min={1} value={form.notificationHours} onChange={(e) => set('notificationHours', e.target.value)} />
            <p className="hint" style={{ margin: 0 }}>
              Valore salvato come preferenza: non attiva notifiche browser, email o push.
            </p>
          </label>
        </div>
      </section>

      <div className="settings-save">
        {error && (
          <span className="form-error" role="alert" style={{ marginRight: 'auto', alignSelf: 'center' }}>
            {error}
          </span>
        )}
        <button className="btn btn-primary" onClick={save}>
          <Save size={16} /> Salva impostazioni
        </button>
      </div>
    </div>
  );
}

function ColorField({ label, value, onChange, fallback }: { label: string; value: string; onChange: (v: string) => void; fallback: string }) {
  return (
    <label className="field">
      <span>{label}</span>
      <div className="color-field">
        <input type="color" value={HEX.test(value) ? value : fallback} onChange={(e) => onChange(e.target.value.toUpperCase())} aria-label={`${label} (selettore)`} />
        <input className="input" value={value} maxLength={7} onChange={(e) => onChange(e.target.value)} aria-label={`${label} (HEX)`} />
      </div>
    </label>
  );
}
