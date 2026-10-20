// Uygulama kabuğu: oturum, ortak durum (markalar, işler, ayarlar), yönlendirme ve kenar çubuğu.
import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { api, connectEvents, on } from './api.js';
import { Icon, Logo, Toasts, toast, AsyncButton } from './ui.jsx';
import Home from './pages/Home.jsx';
import Brand from './pages/Brand.jsx';
import Job from './pages/Job.jsx';
import Inspiration from './pages/Inspiration.jsx';
import Studio from './pages/Studio.jsx';
import Agents from './pages/Agents.jsx';
import Tools from './pages/Tools.jsx';
import Usage from './pages/Usage.jsx';
import Settings from './pages/Settings.jsx';
import NewJob from './pages/NewJob.jsx';
import CompanyForm from './pages/CompanyForm.jsx';

const Ctx = createContext(null);
export const useApp = () => useContext(Ctx);

// ---------------- yönlendirme (#/yol) ----------------
function parseHash() {
  const parts = decodeURIComponent(location.hash.replace(/^#\/?/, '')).split('/').filter(Boolean);
  return { page: parts[0] || '', a: parts[1], b: parts[2], c: parts[3] };
}
export const go = (path) => { location.hash = '#/' + path.replace(/^\//, ''); };

function useRoute() {
  const [r, setR] = useState(parseHash);
  useEffect(() => {
    const f = () => setR(parseHash());
    window.addEventListener('hashchange', f);
    return () => window.removeEventListener('hashchange', f);
  }, []);
  return r;
}

// Programın yazı tipleri arayüzde de önizlensin (marka kimliği, müşteri seçimi)
let fontsLoaded = false;
function loadFonts(fonts = []) {
  if (fontsLoaded) return;
  fontsLoaded = true;
  const css = fonts.flatMap((f) => (f.files || []).map((x) => `@font-face{font-family:'${f.family}';font-weight:${x.weight};src:url(/fonts/${x.file}) format('truetype');font-display:swap}`)).join('');
  const el = document.createElement('style');
  el.textContent = css;
  document.head.appendChild(el);
}

function applyTheme(t) {
  const dark = t === 'dark' || (t !== 'light' && window.matchMedia('(prefers-color-scheme: dark)').matches);
  document.documentElement.dataset.theme = dark ? 'dark' : 'light';
}

function Login({ onDone }) {
  const [pw, setPw] = useState('');
  const [err, setErr] = useState('');
  return (
    <div className="login">
      <form className="card stack" onSubmit={async (e) => {
        e.preventDefault();
        try { await api.post('/api/login', { password: pw }); onDone(); } catch (x) { setErr(x.message); }
      }}>
        <div className="brand" style={{ padding: 0 }}>
          <img className="brand-mark" src="/agent-cy-ikon.png" alt="Agent-cy" />
          <div><div className="brand-name">Agent-cy</div><div className="brand-sub">Devam etmek için giriş yapın</div></div>
        </div>
        <div className="field">
          <label>Şifre</label>
          <input className="input" type="password" autoFocus value={pw} onChange={(e) => setPw(e.target.value)} />
        </div>
        {err && <div className="err-box"><Icon name="alert" />{err}</div>}
        <button className="btn primary lg">Giriş yap</button>
      </form>
    </div>
  );
}

function CommandPalette({ onClose }) {
  const { companies, jobs, openNewJob } = useApp();
  const [q, setQ] = useState('');
  const [sel, setSel] = useState(0);
  const items = useMemo(() => {
    const n = q.toLocaleLowerCase('tr-TR');
    const m = (s) => !n || String(s).toLocaleLowerCase('tr-TR').includes(n);
    const out = [];
    const pages = [['Markalar', 'home', ''], ['İlham arşivi', 'sparkles', 'ilham'], ['Görsel stüdyosu', 'wand', 'studyo'], ['Ajan ekibi', 'users', 'ajanlar'], ['Araçlar', 'tool', 'araclar'], ['Token ve maliyet', 'chart', 'kullanim'], ['Ayarlar', 'settings', 'ayarlar']];
    out.push({ g: 'İşlem', label: 'Yeni iş başlat', icon: 'plus', run: () => openNewJob() });
    for (const [l, i, p] of pages) if (m(l)) out.push({ g: 'Sayfalar', label: l, icon: i, run: () => go(p) });
    for (const c of companies) if (m(c.name)) out.push({ g: 'Markalar', label: c.name, icon: 'folder', run: () => go(`marka/${c.id}`) });
    for (const j of jobs.slice(0, 60)) if (m(j.title)) out.push({ g: 'İşler', label: j.title, icon: 'layers', run: () => go(`is/${j.id}`) });
    return out.filter((x) => x.g !== 'İşlem' || m(x.label)).slice(0, 40);
  }, [q, companies, jobs]);
  useEffect(() => setSel(0), [q]);
  let lastG = '';
  return (
    <div className="cmdk-root" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="cmdk">
        <input autoFocus placeholder="Marka, iş ya da sayfa ara…" value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => {
          if (e.key === 'Escape') onClose();
          if (e.key === 'ArrowDown') { e.preventDefault(); setSel((s) => Math.min(items.length - 1, s + 1)); }
          if (e.key === 'ArrowUp') { e.preventDefault(); setSel((s) => Math.max(0, s - 1)); }
          if (e.key === 'Enter' && items[sel]) { items[sel].run(); onClose(); }
        }} />
        <div className="cmdk-list">
          {items.map((it, i) => {
            const head = it.g !== lastG ? <div className="cmdk-group">{it.g}</div> : null;
            lastG = it.g;
            return (
              <React.Fragment key={i}>
                {head}
                <div className={`cmdk-item ${i === sel ? 'sel' : ''}`} onMouseEnter={() => setSel(i)} onClick={() => { it.run(); onClose(); }}>
                  <Icon name={it.icon} />{it.label}
                </div>
              </React.Fragment>
            );
          })}
          {!items.length && <div className="cmdk-item muted">Sonuç yok</div>}
        </div>
      </div>
    </div>
  );
}

export default function App() {
  const [auth, setAuth] = useState(null);
  const [meta, setMeta] = useState(null);
  const [settings, setSettings] = useState(null);
  const [companies, setCompanies] = useState([]);
  const [jobs, setJobs] = useState([]);
  const [newJob, setNewJob] = useState(null);
  const [companyForm, setCompanyForm] = useState(null);
  const [cmdk, setCmdk] = useState(false);
  const [sideOpen, setSideOpen] = useState(false);
  const route = useRoute();

  const loadCompanies = useCallback(() => api.get('/api/companies').then(setCompanies).catch(() => {}), []);
  const loadJobs = useCallback(() => api.get('/api/jobs').then(setJobs).catch(() => {}), []);
  const loadSettings = useCallback(() => api.get('/api/settings').then((s) => { setSettings(s); applyTheme(s.theme); }).catch(() => {}), []);
  const loadMeta = useCallback(() => api.get('/api/meta').then((m) => { loadFonts(m.fonts); setMeta(m); }).catch(() => {}), []);

  const boot = useCallback(async () => {
    const me = await api.get('/api/me').catch(() => ({ authed: false }));
    setAuth(me);
    if (!me.authed) return;
    await Promise.all([loadMeta(), loadSettings(), loadCompanies(), loadJobs()]);
    connectEvents();
  }, []);

  useEffect(() => {
    boot();
    const out = () => setAuth((a) => (a ? { ...a, authed: false } : a));
    window.addEventListener('as:logout', out);
    return () => window.removeEventListener('as:logout', out);
  }, []);

  // Canlı olaylar: iş listesi ve markalar güncel kalsın
  useEffect(() => {
    if (!auth?.authed) return;
    let t1 = null;
    let t2 = null;
    const offs = [
      on('job:update', (j) => {
        setJobs((list) => {
          const i = list.findIndex((x) => x.id === j.id);
          const row = { id: j.id, companyId: j.companyId, title: j.title, type: j.type, status: j.status, createdAt: j.createdAt, designCount: j.designs.length, usage: j.usage, running: j.status === 'running', progress: list[i]?.progress };
          if (i < 0) return [row, ...list];
          const n = [...list];
          n[i] = { ...n[i], ...row };
          return n;
        });
        clearTimeout(t1);
        t1 = setTimeout(loadJobs, 1500);
      }),
      on('company:update', () => { clearTimeout(t2); t2 = setTimeout(loadCompanies, 300); }),
      on('toast', (t) => toast(t.text, t.error)),
    ];
    const k = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); setCmdk((v) => !v); }
    };
    window.addEventListener('keydown', k);
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const th = () => applyTheme(settings?.theme);
    mq.addEventListener('change', th);
    return () => { offs.forEach((f) => f()); window.removeEventListener('keydown', k); mq.removeEventListener('change', th); };
  }, [auth?.authed, settings?.theme]);

  useEffect(() => setSideOpen(false), [route.page, route.a]);

  const ctx = useMemo(() => ({
    meta, settings, companies, jobs, auth,
    loadCompanies, loadJobs, loadSettings, loadMeta, setSettings: (s) => { setSettings(s); applyTheme(s.theme); },
    openNewJob: (companyId, preset) => setNewJob({ companyId, preset }),
    openCompanyForm: (company) => setCompanyForm(company || {}),
    company: (id) => companies.find((c) => c.id === id),
  }), [meta, settings, companies, jobs, auth]);

  if (!auth) return <div className="login"><div className="spinner" /></div>;
  if (!auth.authed) return <><Login onDone={boot} /><Toasts /></>;
  if (!meta || !settings) return <div className="login"><div className="spinner" /></div>;

  const runningCount = jobs.filter((j) => j.running || j.status === 'running').length;
  const nav = [
    ['', 'home', 'Markalar'],
    ['ilham', 'sparkles', 'İlham arşivi'],
    ['studyo', 'wand', 'Görsel stüdyosu'],
    ['ajanlar', 'users', 'Ajan ekibi'],
    ['araclar', 'tool', 'Araçlar'],
    ['kullanim', 'chart', 'Token ve maliyet'],
  ];

  let page = null;
  let crumbs = [];
  const co = route.page === 'marka' ? companies.find((c) => c.id === route.a) : null;
  switch (route.page) {
    case 'marka': page = <Brand key={route.a} id={route.a} tab={route.b || 'genel'} />; crumbs = [['Markalar', ''], [co?.name || 'Marka']]; break;
    case 'is': {
      const j = jobs.find((x) => x.id === route.a);
      const c = j && companies.find((x) => x.id === j.companyId);
      page = <Job key={route.a} id={route.a} />;
      crumbs = [['Markalar', ''], c ? [c.name, `marka/${c.id}/isler`] : null, [j?.title || 'İş']].filter(Boolean);
      break;
    }
    case 'ilham': page = <Inspiration />; crumbs = [['İlham arşivi']]; break;
    case 'studyo': page = <Studio />; crumbs = [['Görsel stüdyosu']]; break;
    case 'ajanlar': page = <Agents focus={route.a} />; crumbs = [['Ajan ekibi']]; break;
    case 'araclar': page = <Tools />; crumbs = [['Araçlar']]; break;
    case 'kullanim': page = <Usage />; crumbs = [['Token ve maliyet']]; break;
    case 'ayarlar': page = <Settings section={route.a} />; crumbs = [['Ayarlar']]; break;
    default: page = <Home />; crumbs = [['Markalar']];
  }

  return (
    <Ctx.Provider value={ctx}>
      <div className="app">
        <aside className={`sidebar ${sideOpen ? 'open' : ''}`}>
          <div className="brand">
            <img className="brand-mark" src="/agent-cy-ikon.png" alt="Agent-cy" />
            <div style={{ minWidth: 0 }}>
              <div className="brand-name">Agent-cy</div>
              <div className="brand-sub">{settings.agencyName && settings.agencyName !== 'Agent-cy' ? settings.agencyName : 'Yaratıcı ajans stüdyosu'}</div>
            </div>
          </div>
          <button className="search-trigger" onClick={() => setCmdk(true)}><Icon name="search" />Ara<kbd>Ctrl K</kbd></button>
          <button className="btn primary" style={{ marginBottom: 8 }} onClick={() => ctx.openNewJob(co?.id)}><Icon name="plus" />Yeni iş</button>
          {nav.map(([p, i, l]) => (
            <button key={p} className={`nav-item ${route.page === p || (p === '' && route.page === '') ? 'active' : ''}`} onClick={() => go(p)}>
              <Icon name={i} />{l}
              {p === '' && runningCount ? <span className="nav-badge">{runningCount}</span> : null}
            </button>
          ))}
          <div className="side-section">Markalar<button title="Yeni marka" onClick={() => ctx.openCompanyForm()}><Icon name="plus" size={14} /></button></div>
          <div className="side-companies">
            {companies.map((c) => {
              const run = jobs.some((j) => j.companyId === c.id && (j.running || j.status === 'running'));
              return (
                <button key={c.id} className={`side-co ${route.page === 'marka' && route.a === c.id ? 'active' : ''}`} onClick={() => go(`marka/${c.id}`)}>
                  <Logo company={c} size={22} />
                  <span className="n">{c.name}</span>
                  {run && <span className="dot-run" />}
                </button>
              );
            })}
            {!companies.length && <div className="small faint" style={{ padding: '4px 10px' }}>Henüz marka yok</div>}
          </div>
          <div className="side-foot">
            <button className="conn" onClick={() => go('ayarlar')}>
              <span className="d" style={{ background: settings.ready ? 'var(--ok)' : 'var(--warn)' }} />
              <span style={{ minWidth: 0 }}><b>{settings.ready ? 'Claude bağlı' : 'API anahtarı yok'}</b>{settings.model}</span>
            </button>
            <button className="icon-btn" title="Ayarlar" onClick={() => go('ayarlar')}><Icon name="settings" /></button>
          </div>
        </aside>
        <main className="main">
          <div className="topbar">
            <button className="icon-btn menu-btn" onClick={() => setSideOpen((v) => !v)}><Icon name="menu" /></button>
            <div className="crumbs">
              {crumbs.map(([l, p], i) => (
                <React.Fragment key={i}>
                  {i > 0 && <Icon name="chevron" size={14} />}
                  {i < crumbs.length - 1 ? <button onClick={() => go(p)}>{l}</button> : <b>{l}</b>}
                </React.Fragment>
              ))}
            </div>
            <div className="grow" />
            {!settings.ready && <button className="btn sm" onClick={() => go('ayarlar')}><Icon name="alert" />Claude API anahtarını girin</button>}
            <button className="icon-btn" title="Tema" onClick={async () => {
              const next = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
              ctx.setSettings(await api.put('/api/settings', { theme: next }));
            }}><Icon name={document.documentElement.dataset.theme === 'dark' ? 'sun' : 'moon'} /></button>
          </div>
          <div className="view" id="view">{page}</div>
        </main>
      </div>
      {newJob && <NewJob initial={newJob} onClose={() => setNewJob(null)} />}
      {companyForm && <CompanyForm company={companyForm} onClose={() => setCompanyForm(null)} />}
      {cmdk && <CommandPalette onClose={() => setCmdk(false)} />}
      <Toasts />
    </Ctx.Provider>
  );
}
