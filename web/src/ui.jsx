// Ortak arayüz parçaları: ikonlar, modal, bildirim, Markdown, biçimlendirme yardımcıları.
import React, { useEffect, useRef, useState } from 'react';
import { marked } from 'marked';

const P = {
  home: 'M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6h-6v6H4a1 1 0 0 1-1-1z',
  plus: 'M12 5v14M5 12h14',
  folder: 'M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z',
  calendar: 'M4 6a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v13a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2zM4 10h16M8 2v4M16 2v4',
  image: 'M4 5a1 1 0 0 1 1-1h14a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1zM4 16l5-5 4 4 3-3 4 4M15 9.5a1.5 1.5 0 1 0 0-.01',
  megaphone: 'M3 11v2a1 1 0 0 0 1 1h3l6 4V6L7 10H4a1 1 0 0 0-1 1zM16 8.5a5 5 0 0 1 0 7M19 6a8.5 8.5 0 0 1 0 12',
  play: 'M7 4.5v15l12-7.5z',
  trending: 'M3 17l6-6 4 4 8-8M15 7h6v6',
  pen: 'M4 20h4L19 9l-4-4L4 16zM13.5 6.5l4 4',
  code: 'M8 7l-5 5 5 5M16 7l5 5-5 5M14 4l-4 16',
  message: 'M4 5h16v11H8l-4 4z',
  users: 'M16 19v-1a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v1M9 10a3.5 3.5 0 1 0 0-.01M22 19v-1a4 4 0 0 0-3-3.85M16 3.15a3.5 3.5 0 0 1 0 6.7',
  sparkles: 'M12 3l1.8 4.7L18.5 9.5l-4.7 1.8L12 16l-1.8-4.7L5.5 9.5l4.7-1.8zM19 15l.8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8zM5 15l.6 1.4L7 17l-1.4.6L5 19l-.6-1.4L3 17l1.4-.6z',
  wand: 'M15 4V2M15 10V8M11 6h2M17 6h2M4 20 14 10M18 14l-1-1',
  bulb: 'M9 18h6M10 21h4M12 3a6 6 0 0 0-4 10.5c.7.7 1 1.5 1 2.5h6c0-1 .3-1.8 1-2.5A6 6 0 0 0 12 3z',
  tool: 'M14.7 6.3a4 4 0 0 0 5 5L21 13l-8 8-3-3 8-8-1.3-1.3a4 4 0 0 0-5-5L14 6zM3 21l6-6',
  chart: 'M4 20V10M10 20V4M16 20v-7M22 20H2',
  settings: 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z',
  search: 'M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14zM21 21l-5-5',
  x: 'M6 6l12 12M18 6 6 18',
  check: 'M5 12.5l4.5 4.5L19 7.5',
  download: 'M12 4v11M7 10l5 5 5-5M5 20h14',
  upload: 'M12 20V9M7 14l5-5 5 5M5 4h14',
  trash: 'M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13',
  edit: 'M4 20h4L19 9l-4-4L4 16z',
  refresh: 'M20 11a8 8 0 0 0-14.5-4.5L4 8M4 4v4h4M4 13a8 8 0 0 0 14.5 4.5L20 16M20 20v-4h-4',
  undo: 'M9 14 4 9l5-5M4 9h11a5 5 0 0 1 0 10h-3',
  stop: 'M6 6h12v12H6z',
  chevron: 'M9 6l6 6-6 6',
  chevronDown: 'M6 9l6 6 6-6',
  back: 'M15 6l-6 6 6 6',
  menu: 'M4 6h16M4 12h16M4 18h16',
  sun: 'M12 16a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4',
  moon: 'M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z',
  link: 'M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1',
  brain: 'M9 4a3 3 0 0 0-3 3 3 3 0 0 0-2 5 3 3 0 0 0 2 5 3 3 0 0 0 3 3h0a3 3 0 0 0 3-3V7a3 3 0 0 0-3-3zM15 4a3 3 0 0 1 3 3 3 3 0 0 1 2 5 3 3 0 0 1-2 5 3 3 0 0 1-3 3h0a3 3 0 0 1-3-3',
  layers: 'M12 3 2 8l10 5 10-5zM2 13l10 5 10-5M2 17.5l10 5 10-5',
  copy: 'M9 9h11v11H9zM5 15H4V4h11v1',
  eye: 'M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12zM12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z',
  zap: 'M13 2 4 14h7l-1 8 9-12h-7z',
  logout: 'M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9',
  info: 'M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20zM12 16v-4M12 8h.01',
  alert: 'M12 9v4M12 17h.01M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z',
  grid: 'M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z',
  palette: 'M12 22a10 10 0 1 1 10-10c0 2.8-2.2 4-4 4h-2a2 2 0 0 0-1.4 3.4A2 2 0 0 1 12 22zM7.5 11.5h.01M10.5 7.5h.01M15.5 7.5h.01M18 11.5h.01',
  send: 'M22 2 11 13M22 2l-7 20-4-9-9-4z',
  film: 'M4 4h16v16H4zM8 4v16M16 4v16M4 8h4M4 12h4M4 16h4M16 8h4M16 12h4M16 16h4',
  brush: 'M9.5 14.5 3 21M14 4l6 6-8.5 8.5-6-6zM16 2l6 6',
  eraser: 'M7 21h10M5 15l9-9 5 5-9 9H8z',
  hash: 'M4 9h16M4 15h16M10 3 8 21M16 3l-2 18',
  book: 'M4 19.5A2.5 2.5 0 0 1 6.5 17H20V3H6.5A2.5 2.5 0 0 0 4 5.5zM4 19.5A2.5 2.5 0 0 0 6.5 22H20v-5',
  graduation: 'M22 9 12 4 2 9l10 5zM6 11v5c3 2 9 2 12 0v-5',
  file: 'M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9zM14 3v6h6',
  slides: 'M3 6h4v12H3zM9 4h6v16H9zM17 6h4v12h-4z',
};

export function Icon({ name, className = '', size, style }) {
  return (
    <svg className={`ic ${className}`} viewBox="0 0 24 24" aria-hidden="true" style={size ? { width: size, height: size, ...style } : style}>
      <path d={P[name] || P.info} />
    </svg>
  );
}

// ---------------- biçimlendirme ----------------

export const fmtNum = (n) => new Intl.NumberFormat('tr-TR').format(Math.round(n || 0));
export const fmtTok = (n) => {
  n = n || 0;
  if (n >= 1e6) return (n / 1e6).toFixed(n >= 1e7 ? 1 : 2).replace('.', ',') + ' mn';
  if (n >= 1e3) return (n / 1e3).toFixed(n >= 1e4 ? 0 : 1).replace('.', ',') + ' bin';
  return String(Math.round(n));
};
export const fmtCost = (n) => '$' + (n || 0).toFixed(n >= 10 ? 2 : 3);
export const totalTokens = (u) => (u?.input || 0) + (u?.output || 0) + (u?.cacheRead || 0) + (u?.cacheWrite || 0);
export const totalCost = (u) => (u?.cost || 0) + (u?.imageCost || 0);
export function timeAgo(iso) {
  if (!iso) return '';
  const s = (Date.now() - new Date(iso).getTime()) / 1000;
  if (s < 60) return 'az önce';
  if (s < 3600) return `${Math.floor(s / 60)} dk önce`;
  if (s < 86400) return `${Math.floor(s / 3600)} sa önce`;
  if (s < 86400 * 7) return `${Math.floor(s / 86400)} gün önce`;
  return new Date(iso).toLocaleDateString('tr-TR', { day: 'numeric', month: 'short', year: 'numeric' });
}
export const initials = (name) => String(name || '?').trim().split(/\s+/).slice(0, 2).map((w) => w[0]?.toLocaleUpperCase('tr-TR')).join('');

const HUES = [252, 200, 330, 160, 24, 280, 190, 350, 130, 45];
export function hueOf(s) {
  let h = 0;
  for (const ch of String(s || '')) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return HUES[h % HUES.length];
}
export const brandColor = (c) => c?.palette?.[0]?.hex || `hsl(${hueOf(c?.name)} 62% 52%)`;

export const STATUS_TR = { running: 'Çalışıyor', done: 'Tamamlandı', error: 'Hata', stopped: 'Durduruldu', pending: 'Bekliyor', skipped: 'Atlandı', cancelled: 'Durduruldu' };
export function StatusBadge({ status, running }) {
  const s = running ? 'running' : status;
  const cls = s === 'running' ? 'running' : s === 'done' ? 'done' : s === 'error' ? 'error' : '';
  return <span className={`badge ${cls}`}>{STATUS_TR[s] || s}</span>;
}

export function UsageLine({ usage, compact }) {
  if (!usage) return null;
  const t = totalTokens(usage);
  if (!t && !usage.images) return null;
  if (compact) return <span className="pill" title={`${fmtNum(usage.input)} girdi · ${fmtNum(usage.output)} çıktı · ${fmtNum(usage.cacheRead)} önbellek`}><Icon name="zap" size={12} />{fmtTok(t)} token · {fmtCost(totalCost(usage))}</span>;
  return (
    <div className="usage-line">
      <span><b>{fmtTok(t)}</b> token</span>
      <span>{fmtNum(usage.input)} girdi</span>
      <span>{fmtNum(usage.output)} çıktı</span>
      {usage.cacheRead ? <span>{fmtNum(usage.cacheRead)} önbellekten</span> : null}
      {usage.images ? <span>{usage.images} AI görsel</span> : null}
      <span><b>{fmtCost(totalCost(usage))}</b></span>
    </div>
  );
}

// ---------------- markdown ----------------

marked.setOptions({ gfm: true, breaks: true });
export function Markdown({ text, className = '' }) {
  const html = React.useMemo(() => {
    const raw = marked.parse(String(text || ''));
    // Basit temizlik: betik ve olay öznitelikleri çıkarılır
    return raw.replace(/<script[\s\S]*?<\/script>/gi, '').replace(/\son\w+\s*=\s*("[^"]*"|'[^']*')/gi, '');
  }, [text]);
  return <div className={`md ${className}`} dangerouslySetInnerHTML={{ __html: html }} />;
}

// ---------------- modal ----------------

export function Modal({ title, onClose, children, footer, size = '', head }) {
  useEffect(() => {
    const k = (e) => e.key === 'Escape' && onClose?.();
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [onClose]);
  return (
    <div className="modal-root" onMouseDown={(e) => e.target === e.currentTarget && onClose?.()}>
      <div className={`modal ${size}`} role="dialog" aria-modal="true">
        <div className="modal-head">
          <h2>{title}</h2>
          {head}
          <button className="btn ghost icon" onClick={onClose} aria-label="Kapat"><Icon name="x" /></button>
        </div>
        <div className="modal-body">{children}</div>
        {footer && <div className="modal-foot">{footer}</div>}
      </div>
    </div>
  );
}

// ---------------- bildirimler ----------------

let pushToast = () => {};
export const toast = (text, error = false) => pushToast({ text, error });
export const toastErr = (e) => toast(e?.message || String(e), true);

export function Toasts() {
  const [list, setList] = useState([]);
  useEffect(() => {
    pushToast = (t) => {
      const id = Math.random();
      setList((l) => [...l, { ...t, id }]);
      setTimeout(() => setList((l) => l.filter((x) => x.id !== id)), t.error ? 7000 : 3500);
    };
  }, []);
  return (
    <div className="toast-root">
      {list.map((t) => (
        <div key={t.id} className={`toast ${t.error ? 'err' : ''}`} onClick={() => setList((l) => l.filter((x) => x.id !== t.id))}>
          <Icon name={t.error ? 'alert' : 'check'} />
          <span>{t.text}</span>
        </div>
      ))}
    </div>
  );
}

// İşlem butonu: tıklayınca bekler, hata olursa bildirir
export function AsyncButton({ onClick, children, className = 'btn', busyText, disabled, title, ...rest }) {
  const [busy, setBusy] = useState(false);
  const alive = useRef(true);
  useEffect(() => () => { alive.current = false; }, []);
  return (
    <button
      {...rest}
      title={title}
      className={className}
      disabled={disabled || busy}
      onClick={async (e) => {
        setBusy(true);
        try { await onClick(e); } catch (err) { toastErr(err); } finally { if (alive.current) setBusy(false); }
      }}
    >
      {busy ? <span className="spinner sm" /> : null}
      {busy && busyText ? busyText : children}
    </button>
  );
}

export function Empty({ icon = 'folder', title, children }) {
  return (
    <div className="empty">
      <Icon name={icon} className="xl" />
      {title && <div style={{ fontWeight: 650, color: 'var(--ink)', marginBottom: 4 }}>{title}</div>}
      <div className="small">{children}</div>
    </div>
  );
}

// Dosya seçici (gizli input + buton)
export function FilePick({ accept, multiple, onFiles, children, className = 'btn' }) {
  const ref = useRef();
  return (
    <>
      <button className={className} onClick={() => ref.current.click()}>{children}</button>
      <input ref={ref} type="file" hidden accept={accept} multiple={multiple} onChange={(e) => { const f = [...e.target.files]; e.target.value = ''; if (f.length) onFiles(f); }} />
    </>
  );
}

// Sürükle-bırak alanı
export function DropZone({ onFiles, accept = 'image/*', children }) {
  const [over, setOver] = useState(false);
  return (
    <div
      onDragOver={(e) => { e.preventDefault(); setOver(true); }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setOver(false);
        const files = [...e.dataTransfer.files].filter((f) => !accept || accept === '*' || f.type.match(accept.replace('*', '.*')));
        if (files.length) onFiles(files);
      }}
      style={over ? { outline: '2px dashed var(--accent)', outlineOffset: 4, borderRadius: 16 } : undefined}
    >
      {children}
    </div>
  );
}

export function Avatar({ name, label, size = 30 }) {
  const h = hueOf(name);
  return <div className="avatar" style={{ width: size, height: size, background: `linear-gradient(140deg, hsl(${h} 70% 60%), hsl(${(h + 40) % 360} 65% 48%))` }}>{initials(label || name)}</div>;
}

export function Logo({ company, size = 36 }) {
  if (company?.logoUrl) return <div className="logo-sq" style={{ width: size, height: size }}><img src={company.logoUrl} alt="" /></div>;
  return <div className="initials" style={{ width: size, height: size, borderRadius: size * 0.28, background: brandColor(company), fontSize: size * 0.36 }}>{initials(company?.name)}</div>;
}

export function copy(text) {
  navigator.clipboard?.writeText(text).then(() => toast('Kopyalandı'), () => toast('Kopyalanamadı', true));
}

export function confirmAsk(text) {
  return window.confirm(text);
}
