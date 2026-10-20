// Marka kimliği parçaları: yazı tipi seçimi, renk kartelaları, müşteriye seçim bağlantısı, marka dosyası (PDF),
// mockup uygulama, firma klasörü ve web klon.
import React, { useEffect, useState } from 'react';
import { api, on, download } from '../api.js';
import { useApp } from '../App.jsx';
import { Icon, Modal, Empty, AsyncButton, UsageLine, timeAgo, toast, toastErr, confirmAsk, copy } from '../ui.jsx';

const same = (a, b) => a.length === b.length && a.every((x, i) => x.toUpperCase() === b[i].toUpperCase());
const kb = (n) => (n > 1e6 ? `${(n / 1e6).toFixed(1).replace('.', ',')} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);
export const Strip = ({ list, h = 22 }) => (
  <div className="row" style={{ gap: 0 }}>{list.map((x, i) => <span key={i} style={{ width: h, height: h, background: x, borderRadius: i === 0 ? '6px 0 0 6px' : i === list.length - 1 ? '0 6px 6px 0' : 0, border: '1px solid var(--line)' }} />)}</div>
);

// ---------------- yazı tipleri ----------------

export function FontsCard({ c, reload }) {
  const { meta, loadCompanies } = useApp();
  const [h, setH] = useState(c.fontHeading || '');
  const [b, setB] = useState(c.fontBody || '');
  useEffect(() => { setH(c.fontHeading || ''); setB(c.fontBody || ''); }, [c.fontHeading, c.fontBody]);
  const save = async (fh, fb) => {
    setH(fh); setB(fb);
    try { await api.post('/api/companies', { id: c.id, fontHeading: fh, fontBody: fb }); reload(); loadCompanies(); } catch (e) { toastErr(e); }
  };
  const fam = meta.fonts.map((f) => f.family);
  return (
    <div className="card pad stack">
      <div className="row between">
        <div><h3>Yazı tipleri</h3><div className="small muted">Marka kimliğinin yazı tipleri. Tasarımlar, marka dosyası ve web klonu bunları kullanır.</div></div>
        {(h || b) && <button className="btn sm ghost" onClick={() => save('', '')}><Icon name="x" />Serbest bırak</button>}
      </div>
      <div className="grid-2">
        <div className="field"><label>Başlık</label>
          <select className="select" value={h} onChange={(e) => save(e.target.value, b || 'Inter')}><option value="">Tasarımcı seçsin</option>{fam.map((f) => <option key={f}>{f}</option>)}</select>
        </div>
        <div className="field"><label>Gövde</label>
          <select className="select" value={b} onChange={(e) => save(h || 'Montserrat', e.target.value)}><option value="">Tasarımcı seçsin</option>{fam.map((f) => <option key={f}>{f}</option>)}</select>
        </div>
      </div>
      {(h || b) && (
        <div className="card pad" style={{ background: 'var(--surface-2)' }}>
          <div style={{ fontFamily: `'${h || b}'`, fontWeight: 800, fontSize: 30, lineHeight: 1.1 }}>{c.name} · Başlık örneği</div>
          <div style={{ fontFamily: `'${b || h}'`, fontSize: 15, marginTop: 6 }}>Gövde metni böyle görünür: çağrı, şöyle, İstanbul, güneş, öğle.</div>
        </div>
      )}
      <div className="field">
        <label>Hazır eşleşmeler</label>
        <div className="type-cards" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))' }}>
          {meta.fontPairs.map(([fh, fb]) => (
            <button key={fh + fb} className={`type-card ${h === fh && b === fb ? 'on' : ''}`} style={{ flexDirection: 'column', gap: 2 }} onClick={() => save(fh, fb)}>
              <b style={{ fontFamily: `'${fh}'`, fontWeight: 800, fontSize: 18 }}>{fh}</b>
              <span style={{ fontFamily: `'${fb}'` }}>{fb}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

// ---------------- renk kartelaları + müşterinin seçimi ----------------

export function Kartela({ c, palette, savePalette }) {
  const { meta } = useApp();
  const [open, setOpen] = useState(false);
  const hexes = palette.map((p) => p.hex);
  return (
    <>
      <button className="btn sm" onClick={() => setOpen(true)}><Icon name="palette" />Hazır kartelalar</button>
      {open && (
        <Modal size="wide" title="Renk kartelası seç" onClose={() => setOpen(false)}>
          <div className="type-cards" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(170px, 1fr))' }}>
            {meta.palettes.map(([name, list]) => (
              <button key={name} className={`type-card ${same(hexes, list) ? 'on' : ''}`} style={{ flexDirection: 'column', gap: 8 }} onClick={() => { savePalette(list.map((hex, i) => ({ name: palette[i]?.name || `Renk ${i + 1}`, hex }))); setOpen(false); }}>
                <Strip list={list} /><b>{name}</b>
              </button>
            ))}
          </div>
          <p className="small muted">Seçtikten sonra her rengi palette tıklayarak özel olarak değiştirebilirsin.</p>
        </Modal>
      )}
    </>
  );
}

export function ChoiceLink({ c }) {
  const [link, setLink] = useState(null);
  return (
    <>
      <AsyncButton className="btn sm" title="Müşteri kartelalardan ya da özel renk ve yazı tipi seçsin" onClick={async () => setLink(await api.post(`/api/companies/${c.id}/choice-link`))}><Icon name="link" />Müşteriye seçtir</AsyncButton>
      {link && (
        <Modal title="Müşteri seçim bağlantısı" onClose={() => setLink(null)} footer={<><button className="btn" onClick={() => window.open(link.url, '_blank')}><Icon name="eye" />Önizle</button><button className="btn primary" onClick={() => copy(link.url)}><Icon name="copy" />Kopyala</button></>}>
          <div className="stack">
            <p className="small muted" style={{ margin: 0 }}>Bu bağlantıyı müşterine gönder. Şifre gerekmez; müşteri hazır kartelalardan birini ya da kendi renklerini ve bir yazı tipi eşleşmesini seçip gönderir. Seçimi burada "Müşterinin seçimi" olarak görürsün. Bağlantı {link.days} gün geçerli.</p>
            <div className="prompt-box">{link.url}</div>
          </div>
        </Modal>
      )}
    </>
  );
}

export function ClientChoiceCard({ c, reload }) {
  const ch = c.clientChoice;
  if (!ch) return null;
  return (
    <div className="card pad stack" style={{ borderColor: ch.appliedAt ? undefined : 'var(--accent-line)' }}>
      <div className="row between">
        <div><h3>Müşterinin seçimi</h3><div className="small muted">{timeAgo(ch.at)} gönderildi{ch.appliedAt ? ` · ${timeAgo(ch.appliedAt)} uygulandı` : ''}</div></div>
        <div className="row">
          <button className="btn sm ghost" onClick={async () => { await api.del(`/api/companies/${c.id}/choice`); reload(); }}><Icon name="x" /></button>
          <AsyncButton className="btn sm primary" onClick={async () => { await api.post(`/api/companies/${c.id}/apply-choice`); toast('Müşterinin seçimi markaya uygulandı'); reload(); }}><Icon name="check" />Markaya uygula</AsyncButton>
        </div>
      </div>
      <div className="row" style={{ gap: 14 }}>
        {ch.palette.length ? <Strip list={ch.palette} h={28} /> : <span className="small muted">Renk seçmedi</span>}
        {ch.fontHeading && <span style={{ fontFamily: `'${ch.fontHeading}'`, fontWeight: 800, fontSize: 18 }}>{ch.fontHeading}</span>}
        {ch.fontBody && <span className="muted" style={{ fontFamily: `'${ch.fontBody}'` }}>+ {ch.fontBody}</span>}
      </div>
      {ch.note && <div className="note-box"><Icon name="message" /><div>{ch.note}</div></div>}
    </div>
  );
}

// ---------------- mockup seçici (yeni iş ve marka dosyası) ----------------

export function useMockups() {
  const [list, setList] = useState(null);
  const load = () => api.get('/api/mockups').then(setList).catch(() => setList([]));
  useEffect(() => { load(); return on('agency:update', load); }, []);
  return [list, load];
}

export function MockupPicker({ companyId, selected, onChange }) {
  const [list] = useMockups();
  if (!list) return <div className="spinner" />;
  return (
    <div className="img-grid" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(130px, 1fr))' }}>
      {list.map((m) => {
        const sel = selected.includes(m.id);
        return (
          <div key={m.id} className={`img-card ${sel ? 'selected' : ''}`} style={{ cursor: 'pointer' }} onClick={() => onChange(sel ? selected.filter((x) => x !== m.id) : [...selected, m.id])}>
            <div className="th" style={{ aspectRatio: '4 / 3' }}><img src={`/api/mockups/${m.id}/preview.png?w=400${companyId ? `&companyId=${companyId}` : ''}`} alt="" loading="lazy" /></div>
            {sel && <div className="sel-mark"><Icon name="check" size={13} /></div>}
            <div className="meta"><b style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{m.name}</b><span className="muted">{m.builtin ? 'Hazır' : m.category || 'Yüklenen'}</span></div>
          </div>
        );
      })}
    </div>
  );
}

// ---------------- marka dosyası sekmesi ----------------

export function BrandBookTab({ c, reload }) {
  const { meta } = useApp();
  const [sel, setSel] = useState(['hazir-kartvizit', 'hazir-uygulama', 'hazir-tabela']);
  const [apply, setApply] = useState(null);
  const building = c.buildingBook;
  return (
    <div className="stack" style={{ gap: 18 }}>
      <div className="note-box"><Icon name="book" /><div>Marka dosyası; logonun farklı zeminlerde kullanımını, uygulama ikonlarını, yazı tiplerini, renk paletini ve seçtiğin mockupları tek PDF'te toplar. Sonunda {meta.agencyName || 'Agent-cy'} logosu, iletişim bilgileri ve "All Rights Reserved" notu olan kurumsal bir sayfa var (Ayarlar → Genel'den düzenlenir). Yeni işte "Marka dosyası hazırla" açıksa iş sırasında da hazırlanır.</div></div>
      <div className="card pad stack">
        <div className="row between">
          <div><h3>Mockuplar</h3><div className="small muted">Dosyaya girecek mockupları seç. Kendi mockup dosyalarını İlham arşivi → Mockuplar'a yükleyebilirsin.</div></div>
          <AsyncButton className="btn primary" disabled={!c.logos.length && !c.logoProjects.some((p) => p.final)} busyText="Hazırlanıyor…" onClick={async () => { await api.post(`/api/companies/${c.id}/brand-book`, { mockupIds: sel }); toast('Marka dosyası hazırlanıyor; birkaç saniye sürer.'); setTimeout(reload, 2500); }}>
            {building ? <span className="spinner sm" /> : <Icon name="file" />}Marka dosyası hazırla
          </AsyncButton>
        </div>
        {!c.logos.length && <div className="warn-box"><Icon name="alert" /><div>Önce bir logo yükle ya da Logo Stüdyosu'nda oluştur.</div></div>}
        <MockupPicker companyId={c.id} selected={sel} onChange={setSel} />
        <div className="row">
          <span className="small muted grow">{sel.length} mockup seçildi.</span>
          {sel.length === 1 && <button className="btn sm" onClick={() => setApply(sel[0])}><Icon name="wand" />Bu mockupu ayrı uygula / prompt çıkar</button>}
        </div>
      </div>
      <div className="card">
        <div className="row between" style={{ padding: '14px 16px 6px' }}><h3>Hazırlanan dosyalar</h3></div>
        {c.brandBooks.length ? c.brandBooks.map((b) => (
          <div key={b.id} className="list-row" style={{ cursor: 'default' }}>
            <div className="logo-sq" style={{ color: 'var(--accent)' }}><Icon name="file" /></div>
            <div className="grow"><div style={{ fontWeight: 600 }}>{b.name}</div><div className="small muted">{timeAgo(b.createdAt)} · {kb(b.size)} · {b.mockupIds.length} mockup{b.jobId ? ' · bir işle hazırlandı' : ''}</div></div>
            <UsageLine usage={b.usage} compact />
            <a className="btn sm" href={b.url} target="_blank" rel="noreferrer"><Icon name="eye" />Aç</a>
            <a className="btn sm" href={b.url} download={`${b.name}.pdf`}><Icon name="download" /></a>
            <button className="btn sm ghost danger" onClick={async () => { if (confirmAsk('Dosya silinsin mi?')) { await api.del(`/api/companies/${c.id}/brand-books/${b.id}`); reload(); } }}><Icon name="trash" /></button>
          </div>
        )) : <Empty icon="file" title="Henüz marka dosyası yok">Mockupları seçip "Marka dosyası hazırla"ya bas.</Empty>}
      </div>
      {apply && <MockupApply c={c} mid={apply} onClose={() => { setApply(null); reload(); }} />}
    </div>
  );
}

// Tek mockup: logoyu yerleştir, AI ile üret ya da piksel piksel promptunu çıkar
export function MockupApply({ c, mid, onClose }) {
  const { meta } = useApp();
  const connected = meta.providers.filter((p) => p.connected);
  const [provider, setProvider] = useState(connected[0]?.id || '');
  const [prompt, setPrompt] = useState('');
  const [res, setRes] = useState(null);
  return (
    <Modal size="wide" title="Mockup uygula" onClose={onClose}>
      <div className="design-modal">
        <div className="preview"><div className="big"><img src={res?.url || `/api/mockups/${mid}/preview.png?w=1200&companyId=${c.id}`} alt="" /></div></div>
        <div className="stack">
          <div className="small muted">Önizlemede logo hazır tasarımın üstüne yerleştirilmiş hali görünüyor.</div>
          <AsyncButton className="btn primary" busyText="Yerleştiriliyor…" onClick={async () => { setRes(await api.post(`/api/mockups/${mid}/apply`, { companyId: c.id, mode: 'yerlestir' })); toast('Mockup markanın 05 Mockuplar klasörüne kaydedildi'); }}><Icon name="check" />Logoyu yerleştir ve kaydet</AsyncButton>
          <AsyncButton className="btn" busyText="Prompt yazılıyor…" onClick={async () => setPrompt((await api.post(`/api/mockups/${mid}/prompt`, { companyId: c.id })).prompt)}><Icon name="sparkles" />Piksel piksel promptunu çıkar</AsyncButton>
          {prompt && <div className="field"><label className="row between">Prompt<button className="btn sm ghost" onClick={() => copy(prompt)}><Icon name="copy" /></button></label><textarea className="textarea mono" style={{ minHeight: 150 }} value={prompt} onChange={(e) => setPrompt(e.target.value)} /></div>}
          {connected.length ? (
            <div className="row">
              <select className="select" style={{ width: 200 }} value={provider} onChange={(e) => setProvider(e.target.value)}>{connected.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}</select>
              <AsyncButton className="btn" busyText="Üretiliyor…" onClick={async () => { setRes(await api.post(`/api/mockups/${mid}/apply`, { companyId: c.id, mode: 'ai', provider, prompt })); toast('AI mockup kaydedildi'); }}><Icon name="wand" />AI ile üret</AsyncButton>
            </div>
          ) : <span className="small muted">AI ile üretmek için bir görsel motoru bağla (Ayarlar → Entegrasyonlar).</span>}
        </div>
      </div>
    </Modal>
  );
}

// ---------------- firma klasörü ----------------

export function FolderTab({ c }) {
  const { meta } = useApp();
  const [t, setT] = useState(null);
  const [open, setOpen] = useState(null);
  const load = () => api.get(`/api/companies/${c.id}/folder`).then(setT).catch(toastErr);
  useEffect(() => { load(); return on('company:update', (d) => d.id === c.id && load()); }, [c.id]);
  if (!t) return <div className="spinner" />;
  const cur = t.folders.find((f) => f.name === open);
  return (
    <div className="stack">
      <div className="card pad row between">
        <div style={{ minWidth: 0 }}>
          <h3>{t.folder}</h3>
          <div className="small muted mono" style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{t.root}</div>
        </div>
        <div className="row">
          {meta.desktop && <AsyncButton className="btn" onClick={() => api.post(`/api/companies/${c.id}/folder/open`, {})}><Icon name="folder" />Klasörü aç</AsyncButton>}
          <button className="btn primary" onClick={() => download(`/api/companies/${c.id}/folder.zip`)}><Icon name="download" />Klasörü indir (ZIP)</button>
        </div>
      </div>
      <div className="img-grid" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(190px, 1fr))' }}>
        {t.folders.map((f) => (
          <button key={f.name} className={`type-card ${open === f.name ? 'on' : ''}`} onClick={() => setOpen(open === f.name ? null : f.name)}>
            <Icon name="folder" />
            <div><b>{f.name}</b><span>{f.count ? `${f.count} dosya · ${kb(f.size)}` : 'boş'}</span></div>
          </button>
        ))}
      </div>
      {cur && (
        <div className="card">
          <div className="row between" style={{ padding: '14px 16px 6px' }}>
            <h3>{cur.name}</h3>
            {meta.desktop && <AsyncButton className="btn sm" onClick={() => api.post(`/api/companies/${c.id}/folder/open`, { sub: cur.name })}><Icon name="folder" />Aç</AsyncButton>}
          </div>
          {cur.items.length ? cur.items.map((x) => (
            <div key={x.path} className="list-row" style={{ cursor: 'default' }}>
              <Icon name={/\.(png|jpe?g|webp|gif|svg)$/i.test(x.path) ? 'image' : /\.pdf$/i.test(x.path) ? 'file' : 'layers'} />
              <div className="grow" style={{ minWidth: 0 }}><div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{x.path}</div><div className="small faint">{kb(x.size)} · {timeAgo(x.at)}</div></div>
              <a className="btn sm" href={x.url} target="_blank" rel="noreferrer"><Icon name="eye" /></a>
              <a className="btn sm" href={x.url} download><Icon name="download" /></a>
            </div>
          )) : <div className="small muted" style={{ padding: 16 }}>Bu klasör boş.</div>}
        </div>
      )}
    </div>
  );
}

// ---------------- web klon ----------------

const MODES = [
  ['kopya', 'Hızlı kopya', 'Sayfa, CSS, görseller ve yazı tipleri indirilir; yollar yerelleştirilir.'],
  ['claude', 'Claude ile yeniden kur', 'Kopyanın üstüne Claude sayfayı temiz, tek dosyalık HTML/CSS olarak kurar.'],
  ['claude-code', 'Claude Code (arka planda)', 'Program arka planda Claude Code açar; eksikleri indirip çalışan klonu kurar.'],
];

export function WebCloneTab({ c, reload }) {
  const { meta } = useApp();
  const [url, setUrl] = useState('');
  const [mode, setMode] = useState('kopya');
  const [adapt, setAdapt] = useState(false);
  const [notes, setNotes] = useState('');
  const [logFor, setLogFor] = useState(null);
  const [lines, setLines] = useState([]);
  const cc = meta.claudeCode || {};
  useEffect(() => on('webclone:update', (d) => {
    if (d.companyId !== c.id) return;
    if (d.id === logFor) setLines((l) => [...l, d.line].slice(-400));
    if (d.status !== 'running' || /Hazır|Hata/.test(d.step)) reload();
  }), [c.id, logFor]);
  const openLog = async (wid) => { setLogFor(wid); setLines((await api.get(`/api/companies/${c.id}/webclone/${wid}/log`)).log); };
  return (
    <div className="stack" style={{ gap: 18 }}>
      <div className="card pad stack">
        <h3>Sayfa klonla</h3>
        <div className="row">
          <input className="input grow" placeholder="https://ornek.com/sayfa" value={url} onChange={(e) => setUrl(e.target.value)} />
          <AsyncButton className="btn primary" disabled={!url.trim()} busyText="Başlatılıyor…" onClick={async () => { const w = await api.post(`/api/companies/${c.id}/webclone`, { url, mode, adapt, notes }); setUrl(''); reload(); openLog(w.id); }}><Icon name="download" />Klonla</AsyncButton>
        </div>
        <div className="type-cards">
          {MODES.map(([k, l, d]) => {
            const off = k === 'claude-code' && !cc.available;
            return (
              <button key={k} className={`type-card ${mode === k ? 'on' : ''}`} disabled={off} style={off ? { opacity: 0.55 } : undefined} onClick={() => setMode(k)}>
                <Icon name={k === 'kopya' ? 'copy' : k === 'claude' ? 'sparkles' : 'code'} />
                <div><b>{l}</b><span>{off ? 'Bu sunucuda Claude Code kurulu değil.' : d}{k === 'claude-code' && cc.version ? ` (${cc.version})` : ''}</span></div>
              </button>
            );
          })}
        </div>
        {mode !== 'kopya' && (
          <>
            <label className="check"><input type="checkbox" checked={adapt} onChange={(e) => setAdapt(e.target.checked)} />{c.name} markasına uyarla (metinler, renkler, yazı tipleri, logo)</label>
            <textarea className="textarea" placeholder="İsteğe bağlı not: ör. yalnızca ana sayfa, iletişim formunu çıkar" value={notes} onChange={(e) => setNotes(e.target.value)} />
          </>
        )}
        <span className="small muted">Klonlar markanın "08 Web Klon" klasörüne kaydedilir. Kopyalanan tasarım ve içerik başkasına ait olabilir; yayınlamadan önce hakları kontrol et.</span>
      </div>
      <div className="card">
        <div className="row between" style={{ padding: '14px 16px 6px' }}><h3>Klonlar</h3></div>
        {c.webClones.length ? c.webClones.map((w) => (
          <div key={w.id} className="list-row" style={{ cursor: 'default' }}>
            <div className="logo-sq" style={{ color: 'var(--accent)' }}>{w.status === 'running' ? <span className="spinner sm" /> : <Icon name="code" />}</div>
            <div className="grow" style={{ minWidth: 0 }}>
              <div style={{ fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{w.title || w.host}</div>
              <div className="small muted">{w.url} · {MODES.find((m) => m[0] === w.mode)?.[1]} · {w.status === 'running' ? w.step : w.status === 'done' ? `${w.files} varlık · ${kb(w.bytes)}` : w.error || w.step} · {timeAgo(w.createdAt)}</div>
            </div>
            {w.usage && <UsageLine usage={w.usage} compact />}
            <button className="btn sm" onClick={() => openLog(w.id)}><Icon name="info" />Günlük</button>
            {w.status === 'running' && <AsyncButton className="btn sm" onClick={() => api.post(`/api/companies/${c.id}/webclone/${w.id}/cancel`)}><Icon name="stop" /></AsyncButton>}
            {w.previewUrl && <a className="btn sm" href={w.previewUrl} target="_blank" rel="noreferrer"><Icon name="eye" />Önizle</a>}
            {w.status !== 'running' && <button className="btn sm" onClick={() => download(`/api/companies/${c.id}/webclone/${w.id}/export.zip`)}><Icon name="download" /></button>}
            {w.status !== 'running' && <button className="btn sm ghost danger" onClick={async () => { if (confirmAsk('Klon silinsin mi?')) { await api.del(`/api/companies/${c.id}/webclone/${w.id}`); reload(); } }}><Icon name="trash" /></button>}
          </div>
        )) : <Empty icon="code" title="Henüz klon yok">Bir sayfa adresi yaz ve "Klonla"ya bas.</Empty>}
      </div>
      {logFor && <Modal size="wide" title="Klon günlüğü" onClose={() => setLogFor(null)}><div className="prompt-box" style={{ maxHeight: 460 }}>{lines.join('\n') || '…'}</div></Modal>}
    </div>
  );
}
