import placeholderLogo from './assets/logo-placeholder.svg';

// Ricorda nel browser l'ultimo logo caricato, così il caricamento iniziale lo mostra
// prima che arrivino i dati. È solo una comodità: senza storage si usa il segnaposto.
const KEY = 'wc-logo';

export function cachedLogo(): string {
  try {
    return localStorage.getItem(KEY) || placeholderLogo;
  } catch {
    return placeholderLogo;
  }
}

export function rememberLogo(url: string | null) {
  try {
    if (url) localStorage.setItem(KEY, url);
    else localStorage.removeItem(KEY);
  } catch {
    /* storage non disponibile */
  }
}

/** Se il logo ricordato non è più raggiungibile, torna al segnaposto. */
export function onLogoError(e: { currentTarget: HTMLImageElement }) {
  if (e.currentTarget.src !== new URL(placeholderLogo, location.href).href) {
    rememberLogo(null);
    e.currentTarget.src = placeholderLogo;
  }
}
