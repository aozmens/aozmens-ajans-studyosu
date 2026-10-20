// Sunucu ile konuşma: JSON istekleri, dosya okuma ve canlı olaylar (SSE).
export class ApiError extends Error {}

async function req(method, url, body) {
  const r = await fetch(url, {
    method,
    headers: body !== undefined ? { 'Content-Type': 'application/json' } : undefined,
    body: body !== undefined ? JSON.stringify(body) : undefined,
    credentials: 'same-origin',
  });
  let data = null;
  try { data = await r.json(); } catch {}
  if (r.status === 401 && url !== '/api/login') window.dispatchEvent(new Event('as:logout'));
  if (!r.ok) throw new ApiError(data?.error || `İstek başarısız (HTTP ${r.status})`);
  return data;
}

export const api = {
  get: (u) => req('GET', u),
  post: (u, b = {}) => req('POST', u, b),
  put: (u, b = {}) => req('PUT', u, b),
  patch: (u, b = {}) => req('PATCH', u, b),
  del: (u) => req('DELETE', u),
};

export const readAsDataUrl = (file) => new Promise((res, rej) => {
  const r = new FileReader();
  r.onload = () => res(r.result);
  r.onerror = rej;
  r.readAsDataURL(file);
});

export async function filesToItems(files) {
  const out = [];
  for (const f of files) out.push({ name: f.name, dataUrl: await readAsDataUrl(f) });
  return out;
}

// Canlı olaylar: tek bağlantı, kanal başına dinleyiciler
const listeners = new Map();
let es = null;
export function connectEvents() {
  if (es) return;
  es = new EventSource('/api/events');
  for (const ch of ['job:update', 'job:stream', 'company:update', 'agency:update', 'tool:update', 'toast', 'webclone:update']) {
    es.addEventListener(ch, (e) => {
      let d = null;
      try { d = JSON.parse(e.data); } catch { return; }
      for (const fn of listeners.get(ch) || []) fn(d);
    });
  }
  es.onerror = () => {
    es.close();
    es = null;
    setTimeout(connectEvents, 3000);
  };
}
export function on(ch, fn) {
  if (!listeners.has(ch)) listeners.set(ch, new Set());
  listeners.get(ch).add(fn);
  return () => listeners.get(ch).delete(fn);
}

export const download = (url) => {
  const a = document.createElement('a');
  a.href = url;
  a.rel = 'noopener';
  document.body.appendChild(a);
  a.click();
  a.remove();
};
