import type { AppData } from '../shared/types';

export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
}

async function parse(res: Response) {
  let body: any = null;
  try {
    body = await res.json();
  } catch {
    /* risposta non JSON */
  }
  if (!res.ok) throw new ApiError(body?.error ?? `Errore ${res.status}`, res.status);
  return body;
}

async function call(input: string, init?: RequestInit) {
  try {
    return await parse(await fetch(input, { credentials: 'same-origin', ...init }));
  } catch (err) {
    if (err instanceof ApiError) throw err;
    throw new ApiError('Connessione non riuscita. Controlla la rete e riprova.', 0);
  }
}

const mutating = { 'X-Requested-With': 'workcenter' };

export interface ActionResponse {
  ok: true;
  data: AppData;
  createdId?: string;
  skipped?: boolean;
  message?: string;
}

export const api = {
  me: () => call('/api/auth/me') as Promise<{ email: string }>,
  login: (email: string, password: string) =>
    call('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...mutating },
      body: JSON.stringify({ email, password }),
    }),
  logout: () => call('/api/auth/logout', { method: 'POST', headers: mutating }),
  load: () => call('/api/data').then((b) => b.data as AppData),
  action: (action: string, payload: object) =>
    call('/api/data', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...mutating },
      body: JSON.stringify({ action, payload }),
    }) as Promise<ActionResponse>,
  upload: (taskId: string, file: File) => {
    const fd = new FormData();
    fd.append('taskId', taskId);
    fd.append('file', file);
    return call('/api/attachments', { method: 'POST', headers: mutating, body: fd }) as Promise<ActionResponse>;
  },
  uploadLogo: (file: File) => {
    const fd = new FormData();
    fd.append('file', file);
    return call('/api/branding/logo', { method: 'POST', headers: mutating, body: fd }) as Promise<ActionResponse>;
  },
  resetLogo: () => call('/api/branding/logo', { method: 'DELETE', headers: mutating }) as Promise<ActionResponse>,
};
