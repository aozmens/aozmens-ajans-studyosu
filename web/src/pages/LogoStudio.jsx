// Logo Stüdyosu: brif, eskiz alanı + tarama soruları, ikon yolu, renk paleti, örnek logolar, konseptler, revizyon/varyasyon, final logo seti, uygulama ikonları, SVG + PNG çıktı.
import React, { useEffect, useRef, useState } from 'react';
import { api, readAsDataUrl, download } from '../api.js';
import { Icon, Modal, Empty, AsyncButton, FilePick, UsageLine, toast, toastErr, confirmAsk } from '../ui.jsx';

const TYPES = [['kombine', 'Sembol + yazı'], ['sembol', 'Yalnızca sembol'], ['yazi', 'Yalnızca yazı'], ['monogram', 'Monogram'], ['amblem', 'Amblem / rozet']];

export default function LogoStudio({ c, reload }) {
  const [pid, setPid] = useState(c.logoProjects[0]?.id || null);
  const p = c.logoProjects.find((x) => x.id === pid) || c.logoProjects[0];
  const create = async () => {
    const np = await api.post(`/api/companies/${c.id}/logo-projects`, { name: `${c.name} logo` });
    setPid(np.id);
    reload();
  };
  if (!p) {
    return (
      <div className="stack">
        <div className="note-box"><Icon name="pen" /><div>Logo Stüdyosu'nda önce brifi yaz, istersen eskiz çiz ya da kâğıttaki eskizinin fotoğrafını yükle. Tasarımcı eskizinden yola çıkan konseptler üretir; beğendiğini revize ettirir, varyasyonlarını alırsın. Final logo vektörel SVG (yazılar yola çevrilmiş) ve PNG olarak iner; ardından 2 farklı uygulama ikonu hazırlanır.</div></div>
        <Empty icon="pen" title="Logo projesi yok"><button className="btn primary" style={{ marginTop: 10 }} onClick={create}><Icon name="plus" />Logo projesi başlat</button></Empty>
      </div>
    );
  }
  return (
    <div className="stack" style={{ gap: 18 }}>
      <div className="row between">
        <div className="row">
          {c.logoProjects.length > 1 && (
            <select className="select" style={{ width: 240 }} value={p.id} onChange={(e) => setPid(e.target.value)}>
              {c.logoProjects.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
            </select>
          )}
          {p.busy && <span className="badge running">Tasarımcı çalışıyor</span>}
          <UsageLine usage={p.usage} compact />
        </div>
        <div className="row">
          <button className="btn" onClick={create}><Icon name="plus" />Yeni proje</button>
          <button className="btn" onClick={() => download(`/api/companies/${c.id}/logo-projects/${p.id}/export.zip`)} disabled={!p.concepts.length}><Icon name="download" />Logo paketi (ZIP)</button>
          <button className="btn ghost danger icon" title="Projeyi sil" onClick={async () => { if (confirmAsk('Logo projesi silinsin mi?')) { await api.del(`/api/companies/${c.id}/logo-projects/${p.id}`); setPid(null); reload(); } }}><Icon name="trash" /></button>
        </div>
      </div>
      {p.error && <div className="err-box"><Icon name="alert" />{p.error}</div>}
      <Brief c={c} p={p} reload={reload} />
      <Sketches c={c} p={p} reload={reload} />
      <ScanQuestions c={c} p={p} reload={reload} />
      <IconMode c={c} p={p} />
      <PalettePicker c={c} p={p} reload={reload} />
      <RefLogos c={c} p={p} reload={reload} />
      <Concepts c={c} p={p} reload={reload} />
      {p.final && <Final c={c} p={p} reload={reload} />}
    </div>
  );
}

const base = (c, p) => `/api/companies/${c.id}/logo-projects/${p.id}`;
const prev = (c, p, kind, item, w = 600) => `${base(c, p)}/preview/${kind}/${item.id}.png?w=${w}&v=${(item.history?.length || 0)}-${String(item.svg?.length || 0)}`;

function Brief({ c, p, reload }) {
  const [f, setF] = useState(p);
  useEffect(() => { setF(p); }, [p.id]);
  const save = async (patch) => {
    const next = { ...f, ...patch };
    setF(next);
    await api.patch(base(c, p), patch).catch(toastErr);
  };
  return (
    <div className="card pad stack">
      <h3>Brif</h3>
      <div className="grid-3">
        <div className="field"><label>Proje adı</label><input className="input" value={f.name || ''} onChange={(e) => setF({ ...f, name: e.target.value })} onBlur={() => save({ name: f.name })} /></div>
        <div className="field"><label>Logo türü</label>
          <select className="select" value={f.logoType} onChange={(e) => save({ logoType: e.target.value })}>{TYPES.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
        </div>
        <div className="field"><label>İstenen stil (isteğe bağlı)</label><input className="input" placeholder="ör. minimal, geometrik, premium" value={f.style || ''} onChange={(e) => setF({ ...f, style: e.target.value })} onBlur={() => save({ style: f.style })} /></div>
        <div className="field" style={{ gridColumn: 'span 2' }}><label>Anahtar kelimeler / çağrışımlar</label><input className="input" placeholder="ör. dağ, güneş, kahve çekirdeği, güven" value={f.keywords || ''} onChange={(e) => setF({ ...f, keywords: e.target.value })} onBlur={() => save({ keywords: f.keywords })} /></div>
        <div className="field" style={{ gridColumn: '1 / -1' }}><label>Notlar</label><textarea className="textarea" style={{ minHeight: 60 }} placeholder="Neyi anlatsın, nelerden kaçınsın, beğendiğin logolar…" value={f.brief || ''} onChange={(e) => setF({ ...f, brief: e.target.value })} onBlur={() => save({ brief: f.brief })} /></div>
      </div>
    </div>
  );
}

// ---------------- eskiz alanı ----------------

function Sketches({ c, p, reload }) {
  const [draw, setDraw] = useState(false);
  return (
    <div className="card pad stack">
      <div className="row between">
        <div><h3>1. Eskiz</h3><div className="small muted">Çiz ya da kâğıttaki eskizin / hazır ikonunun fotoğrafını yükle. Tasarımcı son 3 eskizi temel alır.</div></div>
        <div className="row">
          <FilePick className="btn sm" accept="image/*" onFiles={async (files) => {
            try { for (const f of files) await api.post(`${base(c, p)}/sketches`, { dataUrl: await readAsDataUrl(f), name: f.name }); reload(); } catch (e) { toastErr(e); }
          }}><Icon name="upload" />Eskiz fotoğrafı yükle</FilePick>
          <button className="btn sm" onClick={() => setDraw(true)}><Icon name="brush" />Eskiz çiz</button>
          <AsyncButton className="btn sm primary" disabled={p.busy || !p.sketches.length} title={p.sketches.length ? 'Tasarımcı eskizi inceler ve 2-3 soru sorar' : 'Önce bir eskiz ekle'} onClick={async () => { await api.post(`${base(c, p)}/scan`); toast('Eskiz taranıyor…'); reload(); }}>{p.busy ? <span className="spinner sm" /> : <Icon name="eye" />}{p.scan ? 'Yeniden tara' : 'Eskizi tara'}</AsyncButton>
        </div>
      </div>
      {p.sketches.length ? (
        <div className="img-grid" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))' }}>
          {p.sketches.map((s) => (
            <div key={s.id} className="img-card">
              <div className="th contain" style={{ background: '#fff' }}><img src={`/files/${c.id}/${s.file}`} alt="" /></div>
              <button className="btn sm ghost danger" style={{ position: 'absolute', top: 4, right: 4, background: 'var(--surface)' }} onClick={async () => { await api.del(`${base(c, p)}/sketches/${s.id}`); reload(); }}><Icon name="x" size={13} /></button>
            </div>
          ))}
        </div>
      ) : <p className="small muted" style={{ margin: 0 }}>Eskiz zorunlu değil; ama aklındaki formu çizersen konseptler ona göre şekillenir.</p>}
      {draw && <SketchPad onClose={() => setDraw(false)} onSave={async (dataUrl) => { await api.post(`${base(c, p)}/sketches`, { dataUrl, name: `Eskiz ${p.sketches.length + 1}` }); setDraw(false); reload(); }} />}
    </div>
  );
}

function SketchPad({ onClose, onSave }) {
  const ref = useRef();
  const [tool, setTool] = useState('pen');
  const [size, setSize] = useState(6);
  const [color, setColor] = useState('#111111');
  const hist = useRef([]);
  const start = useRef(null);
  const snap = useRef(null);
  useEffect(() => {
    const ctx = ref.current.getContext('2d');
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, 1000, 1000);
  }, []);
  const pos = (e) => {
    const r = ref.current.getBoundingClientRect();
    return [((e.clientX - r.left) / r.width) * 1000, ((e.clientY - r.top) / r.height) * 1000];
  };
  const ctx = () => ref.current.getContext('2d');
  const down = (e) => {
    e.target.setPointerCapture(e.pointerId);
    const x = ctx();
    hist.current.push(x.getImageData(0, 0, 1000, 1000));
    if (hist.current.length > 30) hist.current.shift();
    const [px, py] = pos(e);
    start.current = [px, py];
    snap.current = x.getImageData(0, 0, 1000, 1000);
    x.lineCap = 'round';
    x.lineJoin = 'round';
    x.lineWidth = tool === 'eraser' ? size * 4 : size;
    x.strokeStyle = tool === 'eraser' ? '#fff' : color;
    x.beginPath();
    x.moveTo(px, py);
  };
  const move = (e) => {
    if (!start.current) return;
    const x = ctx();
    const [px, py] = pos(e);
    if (tool === 'pen' || tool === 'eraser') { x.lineTo(px, py); x.stroke(); return; }
    x.putImageData(snap.current, 0, 0);
    x.beginPath();
    const [sx, sy] = start.current;
    if (tool === 'line') { x.moveTo(sx, sy); x.lineTo(px, py); }
    if (tool === 'rect') x.rect(sx, sy, px - sx, py - sy);
    if (tool === 'circle') { const r = Math.hypot(px - sx, py - sy); x.arc(sx, sy, r, 0, Math.PI * 2); }
    x.stroke();
  };
  const up = () => { start.current = null; };
  return (
    <Modal size="wide" title="Eskiz çiz" onClose={onClose} footer={<>
      <span className="small muted grow">Kaba bir çizim yeterli: form, yerleşim ve oranlar tasarımcıya yol gösterir. Yazı yerine kutu çizebilir, notu brife yazabilirsin.</span>
      <button className="btn" onClick={onClose}>Vazgeç</button>
      <AsyncButton className="btn primary" onClick={() => onSave(ref.current.toDataURL('image/png'))}><Icon name="check" />Eskizi kaydet</AsyncButton>
    </>}>
      <div className="canvas-box" style={{ maxWidth: 640, margin: '0 auto' }}>
        <div className="tools-bar">
          {[['pen', 'brush', 'Kalem'], ['eraser', 'eraser', 'Silgi'], ['line', 'edit', 'Çizgi'], ['rect', 'grid', 'Kare'], ['circle', 'info', 'Daire']].map(([k, i, l]) => (
            <button key={k} className={`btn sm ${tool === k ? 'on' : ''}`} onClick={() => setTool(k)}><Icon name={i} />{l}</button>
          ))}
          <input type="range" min="2" max="30" value={size} onChange={(e) => setSize(+e.target.value)} style={{ width: 90 }} title="Kalınlık" />
          <input type="color" value={color} onChange={(e) => setColor(e.target.value)} style={{ width: 32, height: 28, border: 'none', background: 'none' }} />
          <div className="grow" />
          <button className="btn sm" onClick={() => { const h = hist.current.pop(); if (h) ctx().putImageData(h, 0, 0); }}><Icon name="undo" />Geri al</button>
          <button className="btn sm" onClick={() => { hist.current.push(ctx().getImageData(0, 0, 1000, 1000)); ctx().fillStyle = '#fff'; ctx().fillRect(0, 0, 1000, 1000); }}><Icon name="trash" />Temizle</button>
        </div>
        <canvas ref={ref} width={1000} height={1000} onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up} />
      </div>
    </Modal>
  );
}

// ---------------- eskiz taraması: tasarımcının okuması ve soruları ----------------

function ScanQuestions({ c, p, reload }) {
  const [ans, setAns] = useState(p.answers || {});
  useEffect(() => setAns(p.answers || {}), [p.id, p.scan?.at]);
  if (!p.scan) return null;
  const pick = (q, opt) => {
    const cur = ans[q.id];
    let v;
    if (q.coklu) {
      const arr = Array.isArray(cur) ? cur : cur ? [cur] : [];
      v = arr.includes(opt) ? arr.filter((x) => x !== opt) : [...arr, opt];
    } else v = cur === opt ? '' : opt;
    const next = { ...ans, [q.id]: v };
    setAns(next);
    api.patch(base(c, p), { answers: next }).then(reload).catch(toastErr);
  };
  const isOn = (q, opt) => (Array.isArray(ans[q.id]) ? ans[q.id].includes(opt) : ans[q.id] === opt);
  const answered = p.scan.questions.filter((q) => (Array.isArray(ans[q.id]) ? ans[q.id].length : ans[q.id])).length;
  return (
    <div className="card pad stack">
      <div className="row between">
        <div><h3>2. Tasarımcının soruları</h3><div className="small muted">{answered}/{p.scan.questions.length} cevaplandı · cevaplar konseptlere doğrudan yansır</div></div>
      </div>
      {p.scan.text && <div className="note-box"><Icon name="eye" /><div><b>Eskizde gördüklerim:</b> {p.scan.text}</div></div>}
      {p.scan.questions.map((q) => (
        <div key={q.id} className="stack" style={{ gap: 6 }}>
          <b style={{ fontSize: 13 }}>{q.soru}{q.coklu && <span className="small muted"> (birden fazla seçilebilir)</span>}</b>
          <div className="row" style={{ gap: 6, flexWrap: 'wrap' }}>
            {q.secenekler.map((o) => <button key={o} className={`chip ${isOn(q, o) ? 'on' : ''}`} onClick={() => pick(q, o)}>{isOn(q, o) && <Icon name="check" size={12} />}{o}</button>)}
          </div>
        </div>
      ))}
    </div>
  );
}

// ---------------- sembol / ikon yolu ----------------

const ICON_MODES = [
  ['tasarla', 'sparkles', 'İkonu tasarla', 'Tasarımcı sembolü sıfırdan çizer; eskiz yalnızca yol gösterir.'],
  ['hazir', 'check', 'Eskizi hazır kullan', 'Eskizdeki ikon aynen korunur, temiz vektöre çevrilir; konseptler yazı ve renkte farklılaşır.'],
];

function IconMode({ c, p }) {
  const [mode, setMode] = useState(p.iconMode || 'tasarla');
  useEffect(() => setMode(p.iconMode || 'tasarla'), [p.id, p.iconMode]);
  const set = (m) => { setMode(m); api.patch(base(c, p), { iconMode: m }).catch(toastErr); };
  return (
    <div className="card pad stack">
      <h3>3. Sembol / ikon</h3>
      <div className="type-cards">
        {ICON_MODES.map(([k, ic, t, d]) => (
          <button key={k} className={`type-card ${mode === k ? 'on' : ''}`} disabled={k === 'hazir' && !p.sketches.length} title={k === 'hazir' && !p.sketches.length ? 'Önce eskiz ya da hazır ikon yükle' : ''} onClick={() => set(k)}>
            <Icon name={ic} className="ic" /><div><b>{t}</b><span>{d}</span></div>
          </button>
        ))}
      </div>
    </div>
  );
}

// ---------------- renk paleti ----------------

const PALETTES = [
  ['Gece mavisi', ['#0B1F3A', '#1E4FD8', '#8FB3FF', '#F4F6FA']],
  ['Holografik', ['#7F5AF0', '#2CB1BC', '#FF8BD1', '#F9F871']],
  ['Lüks altın', ['#111111', '#C9A227', '#E8D9A8', '#FAFAF7']],
  ['Toprak', ['#3E2C23', '#A0522D', '#D9A066', '#F3E9DC']],
  ['Orman', ['#0F3D2E', '#2E7D32', '#A5D6A7', '#F1F8E9']],
  ['Mercan', ['#1D1D1F', '#FF6B5B', '#FFC2B4', '#FFF5F0']],
  ['Neon', ['#0D0D0D', '#39FF14', '#FF2FD6', '#00E5FF']],
  ['Pastel', ['#6C63FF', '#FFB5C2', '#B5EAD7', '#FFF1C1']],
  ['Monokrom', ['#111111', '#555555', '#BDBDBD', '#FFFFFF']],
];

const same = (a, b) => a.length === b.length && a.every((x, i) => x.toUpperCase() === b[i].toUpperCase());

function PalettePicker({ c, p, reload }) {
  const [colors, setColors] = useState(p.colors || []);
  useEffect(() => setColors(p.colors || []), [p.id, (p.colors || []).join()]);
  const save = (next) => { setColors(next); api.patch(base(c, p), { colors: next }).then(reload).catch(toastErr); };
  const brand = c.palette.map((x) => x.hex).slice(0, 6);
  const options = [...(brand.length ? [['Marka paleti', brand]] : []), ...PALETTES];
  const Sw = ({ list }) => <div className="row" style={{ gap: 0 }}>{list.map((h, i) => <span key={i} style={{ width: 22, height: 22, background: h, borderRadius: i === 0 ? '6px 0 0 6px' : i === list.length - 1 ? '0 6px 6px 0' : 0, border: '1px solid var(--line)' }} />)}</div>;
  return (
    <div className="card pad stack">
      <div className="row between">
        <div><h3>4. Renk paleti</h3><div className="small muted">Hazır bir palet seç ya da renkleri kendin belirle. Boş bırakırsan tasarımcı markaya uygun renk seçer.</div></div>
        {colors.length > 0 && <button className="btn sm ghost" onClick={() => save([])}><Icon name="x" />Serbest bırak</button>}
      </div>
      <div className="type-cards" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))' }}>
        {options.map(([name, list]) => (
          <button key={name} className={`type-card ${same(colors, list) ? 'on' : ''}`} style={{ flexDirection: 'column', gap: 8 }} onClick={() => save(list)}>
            <Sw list={list} /><b>{name}</b>
          </button>
        ))}
      </div>
      <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
        <span className="small muted">Seçili:</span>
        {colors.map((h, i) => (
          <span key={i} className="chip" style={{ paddingLeft: 4 }}>
            <input type="color" value={h.length === 7 ? h : '#000000'} onChange={(e) => setColors(colors.map((x, j) => (j === i ? e.target.value.toUpperCase() : x)))} onBlur={() => save(colors)} style={{ display: 'inline-block', width: 22, height: 22, border: 'none', padding: 0, background: 'none' }} />
            <span className="mono">{h}</span>
            <button className="btn sm ghost icon" style={{ padding: 0, height: 18 }} onClick={() => save(colors.filter((_, j) => j !== i))}><Icon name="x" size={12} /></button>
          </span>
        ))}
        {colors.length < 6 && <button className="btn sm" onClick={() => save([...colors, '#888888'])}><Icon name="plus" />Renk ekle</button>}
        {!colors.length && <span className="small muted">serbest</span>}
      </div>
    </div>
  );
}

// ---------------- ilham alınacak örnek logolar ----------------

function RefLogos({ c, p, reload }) {
  const refs = p.refs || [];
  return (
    <div className="card pad stack">
      <div className="row between">
        <div><h3>5. Örnek logolar (ilham)</h3><div className="small muted">Beğendiğin logoları yükle; tasarımcı stilini, çizgi ve harf karakterini yakalar ama kopyalamaz. Son 4 tanesi kullanılır.</div></div>
        <FilePick className="btn sm" accept="image/*" multiple onFiles={async (files) => {
          try { for (const f of files) await api.post(`${base(c, p)}/refs`, { dataUrl: await readAsDataUrl(f), name: f.name }); reload(); } catch (e) { toastErr(e); }
        }}><Icon name="upload" />Örnek logo yükle</FilePick>
      </div>
      {refs.length ? (
        <div className="img-grid" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))' }}>
          {refs.map((s) => (
            <div key={s.id} className="img-card">
              <div className="th contain" style={{ background: '#fff' }}><img src={`/files/${c.id}/${s.file}`} alt="" /></div>
              <button className="btn sm ghost danger" style={{ position: 'absolute', top: 4, right: 4, background: 'var(--surface)' }} onClick={async () => { await api.del(`${base(c, p)}/refs/${s.id}`); reload(); }}><Icon name="x" size={13} /></button>
            </div>
          ))}
        </div>
      ) : <p className="small muted" style={{ margin: 0 }}>İsteğe bağlı. Örnek yüklemezsen tasarımcı eskiz, cevaplar ve markadan yola çıkar.</p>}
    </div>
  );
}

// ---------------- konseptler ----------------

function Concepts({ c, p, reload }) {
  const [direction, setDirection] = useState('');
  const [count, setCount] = useState(4);
  const [rev, setRev] = useState(null);
  const gen = async () => {
    await api.post(`${base(c, p)}/concepts`, { count, direction });
    toast('Tasarımcı konseptleri çiziyor…');
    reload();
  };
  return (
    <div className="card pad stack">
      <div className="row between">
        <h3>6. Konseptler</h3>
        <div className="row">
          <input className="input" style={{ width: 280 }} placeholder="Bu tur için yön (isteğe bağlı)" value={direction} onChange={(e) => setDirection(e.target.value)} />
          <select className="select" style={{ width: 90 }} value={count} onChange={(e) => setCount(+e.target.value)}>{[2, 3, 4, 6].map((n) => <option key={n} value={n}>{n} adet</option>)}</select>
          <AsyncButton className="btn primary" disabled={p.busy} onClick={gen}>{p.busy ? <span className="spinner sm" /> : <Icon name="sparkles" />}{p.concepts.length ? 'Yeni konseptler' : 'Konsept üret'}</AsyncButton>
        </div>
      </div>
      {p.concepts.length ? (
        <div className="logo-grid">
          {p.concepts.map((k) => (
            <div key={k.id} className={`logo-card ${p.final?.conceptId === k.id ? 'final' : ''}`}>
              <div className="pv checker"><img src={prev(c, p, 'concept', k)} alt="" loading="lazy" /></div>
              <div className="bd">
                <div className="row between"><b>{k.title || 'Konsept'}</b>{p.final?.conceptId === k.id && <span className="badge accent">Final</span>}</div>
                {k.rationale && <div className="muted">{k.rationale}</div>}
                <div className="row" style={{ gap: 4 }}>
                  <button className="btn sm" disabled={p.busy} onClick={() => setRev(k)}><Icon name="edit" />Revize</button>
                  <AsyncButton className="btn sm" disabled={p.busy} title="Bu konseptin 3 varyasyonu" onClick={async () => { await api.post(`${base(c, p)}/concepts/${k.id}/revise`, { variations: 3 }); reload(); }}><Icon name="layers" />Varyasyon</AsyncButton>
                  {k.history?.length > 0 && <AsyncButton className="btn sm icon" title="Geri al" onClick={async () => { await api.post(`${base(c, p)}/concepts/${k.id}/undo`); reload(); }}><Icon name="undo" /></AsyncButton>}
                </div>
                <div className="row" style={{ gap: 4 }}>
                  <AsyncButton className="btn sm primary" disabled={p.busy} onClick={async () => { await api.post(`${base(c, p)}/finalize`, { conceptId: k.id }); toast('Logo seti hazırlanıyor…'); reload(); }}><Icon name="check" />Bunu seç</AsyncButton>
                  <a className="btn sm" href={`${base(c, p)}/preview/concept/${k.id}.svg?dl=1`}>SVG</a>
                  <a className="btn sm" href={`${base(c, p)}/preview/concept/${k.id}.png?w=2048&dl=1`}>PNG</a>
                  <button className="btn sm ghost danger icon" onClick={async () => { await api.del(`${base(c, p)}/concepts/${k.id}`); reload(); }}><Icon name="trash" /></button>
                </div>
              </div>
            </div>
          ))}
          {p.busy && <div className="logo-card"><div className="pv"><div className="shimmer">Çiziliyor…</div></div></div>}
        </div>
      ) : p.busy ? <div className="row muted"><span className="spinner" />Tasarımcı konseptleri çiziyor…</div> : <p className="small muted" style={{ margin: 0 }}>Brifi doldurup "Konsept üret"e bas.</p>}
      {rev && <ReviseModal title={`Revize: ${rev.title}`} onClose={() => setRev(null)} onSend={async (fb) => { await api.post(`${base(c, p)}/concepts/${rev.id}/revise`, { feedback: fb }); setRev(null); reload(); }} />}
    </div>
  );
}

function ReviseModal({ title, onClose, onSend, placeholder = 'ör. Sembolü sadeleştir, yazıyı daha kalın yap, kırmızı yerine lacivert kullan' }) {
  const [t, setT] = useState('');
  return (
    <Modal size="narrow" title={title} onClose={onClose} footer={<>
      <button className="btn" onClick={onClose}>Vazgeç</button>
      <AsyncButton className="btn primary" disabled={!t.trim()} onClick={() => onSend(t)}><Icon name="send" />Gönder</AsyncButton>
    </>}>
      <textarea className="textarea" autoFocus placeholder={placeholder} value={t} onChange={(e) => setT(e.target.value)} />
    </Modal>
  );
}

// ---------------- final logo seti ve uygulama ikonları ----------------

function Final({ c, p, reload }) {
  const [iconFb, setIconFb] = useState(false);
  const all = [{ id: 'final', title: 'Ana logo', svg: p.final.svg, kind: 'final' }, ...(p.final.set || []).map((x) => ({ ...x, kind: 'set' }))];
  return (
    <>
      <div className="card pad stack">
        <div className="row between">
          <div><h3>Final logo seti</h3><div className="small muted">SVG dosyalarında yazılar yollara çevrilir; Illustrator ve Figma'da font gerektirmeden açılır.</div></div>
          {p.busy && !p.final.set?.length && <span className="badge running">Set hazırlanıyor</span>}
        </div>
        <div className="logo-grid">
          {all.map((x) => (
            <div key={x.id} className="logo-card">
              <div className="pv" style={{ background: /beyaz/i.test(x.title) ? '#16181d' : undefined }}><img src={`${base(c, p)}/preview/${x.kind}/${x.id}.png?w=600`} alt="" loading="lazy" /></div>
              <div className="bd">
                <b>{x.title}</b>
                <div className="row" style={{ gap: 4 }}>
                  <a className="btn sm" href={`${base(c, p)}/preview/${x.kind}/${x.id}.svg?dl=1`}><Icon name="download" />SVG</a>
                  {[512, 1024, 2048].map((w) => <a key={w} className="btn sm" href={`${base(c, p)}/preview/${x.kind}/${x.id}.png?w=${w}&dl=1`}>{w}</a>)}
                </div>
                <AsyncButton className="btn sm" onClick={async () => { await api.post(`${base(c, p)}/use-as-logo`, { variantId: x.kind === 'set' ? x.id : undefined }); toast('Markanın ana logosu yapıldı'); reload(); }}><Icon name="check" />Marka logosu yap</AsyncButton>
              </div>
            </div>
          ))}
        </div>
      </div>
      <div className="card pad stack">
        <div className="row between">
          <div><h3>Uygulama ikonları</h3><div className="small muted">1024×1024; ZIP'te iOS/Android/web boyutları ve favicon.ico bulunur.</div></div>
          <div className="row">
            <button className="btn" disabled={p.busy || !p.icons?.length} onClick={() => setIconFb(true)}><Icon name="edit" />Yorumla yeniden</button>
            <AsyncButton className="btn primary" disabled={p.busy} onClick={async () => { await api.post(`${base(c, p)}/icons`, {}); toast('İkonlar tasarlanıyor…'); reload(); }}>{p.busy ? <span className="spinner sm" /> : <Icon name="sparkles" />}{p.icons?.length ? 'Yeni 2 varyasyon' : '2 ikon varyasyonu üret'}</AsyncButton>
          </div>
        </div>
        {p.icons?.length ? (
          <div className="logo-grid">
            {p.icons.map((ic) => (
              <div key={ic.id} className="logo-card">
                <div className="pv" style={{ padding: 20 }}>
                  <div className="icon-prev">
                    <img src={`${base(c, p)}/preview/icon/${ic.id}.png?w=360`} width="96" height="96" alt="" />
                    <img src={`${base(c, p)}/preview/icon/${ic.id}.png?w=120`} width="48" height="48" alt="" />
                    <img src={`${base(c, p)}/preview/icon/${ic.id}.png?w=64`} width="24" height="24" alt="" />
                  </div>
                </div>
                <div className="bd">
                  <b>{ic.title}</b>
                  {ic.rationale && <div className="muted">{ic.rationale}</div>}
                  <div className="row" style={{ gap: 4 }}>
                    <a className="btn sm" href={`${base(c, p)}/preview/icon/${ic.id}.svg?dl=1`}><Icon name="download" />SVG</a>
                    <a className="btn sm" href={`${base(c, p)}/preview/icon/${ic.id}.png?w=1024&dl=1`}>PNG 1024</a>
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : <p className="small muted" style={{ margin: 0 }}>Logo tamamlandı; şimdi uygulama ikonlarını üretebilirsin.</p>}
        <div className="row end"><button className="btn" onClick={() => download(`${base(c, p)}/export.zip`)}><Icon name="download" />Logo + ikon paketi (ZIP)</button></div>
      </div>
      {iconFb && <ReviseModal title="İkonlar için yorum" placeholder="ör. Zemin degrade olsun, sembol daha büyük" onClose={() => setIconFb(false)} onSend={async (fb) => { await api.post(`${base(c, p)}/icons`, { feedback: fb }); setIconFb(false); reload(); }} />}
    </>
  );
}
