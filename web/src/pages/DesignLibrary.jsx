// İlham arşivinin iki sekmesi: tasarım dili PDF'leri ve mockup kütüphanesi.
import React, { useEffect, useState } from 'react';
import { api, filesToItems, download } from '../api.js';
import { Icon, Modal, Empty, AsyncButton, FilePick, DropZone, UsageLine, timeAgo, toast, toastErr, confirmAsk, copy } from '../ui.jsx';
import { InspirationPicker } from './Inspiration.jsx';
import { useMockups, Strip } from './BrandKit.jsx';

// ---------------- tasarım dili ----------------

export function DesignLanguages({ a, load }) {
  const [pick, setPick] = useState(false);
  const [sel, setSel] = useState([]);
  const [name, setName] = useState('');
  const analyzed = a.styles.filter((s) => s.analysis?.prompt).length;
  return (
    <div className="stack" style={{ gap: 18 }}>
      <div className="note-box"><Icon name="file" /><div>Seçtiğin ilham görsellerinin piksel piksel promptları, renk paletleri ve yazı tipleri tek bir ana prompta ve kurallar bütününe çevrilir, PDF olarak indirilir. PDF'in içinde yapay zekâ araçlarının okuyabileceği bir JSON bloğu ve ek dosya (tasarim-dili.json) var: PDF'i ChatGPT, Gemini, Midjourney ya da Claude'a yüklediğinde dili otomatik algılar.</div></div>
      <div className="card pad stack">
        <h3>Yeni tasarım dili</h3>
        <div className="row">
          <input className="input grow" placeholder="Ad (boş bırakırsan tasarımcı koyar)" value={name} onChange={(e) => setName(e.target.value)} />
          <button className="btn" onClick={() => setPick(true)}><Icon name="sparkles" />Görsel seç ({sel.length || `tümü · ${analyzed}`})</button>
          <AsyncButton className="btn primary" disabled={!analyzed} busyText="Başlatılıyor…" onClick={async () => { await api.post('/api/agency/design-languages', { inspirationIds: sel, name }); setName(''); toast('Tasarım dili hazırlanıyor'); load(); }}><Icon name="file" />PDF oluştur</AsyncButton>
        </div>
        {!analyzed && <span className="small muted">Önce arşive görsel yükle; taranan görseller burada kullanılır.</span>}
      </div>
      {a.designLanguages.length ? (
        <div className="card">
          {a.designLanguages.map((d) => (
            <div key={d.id} className="list-row" style={{ cursor: 'default', alignItems: 'flex-start' }}>
              <div className="logo-sq" style={{ color: 'var(--accent)' }}>{d.status === 'running' ? <span className="spinner sm" /> : <Icon name="file" />}</div>
              <div className="grow stack" style={{ gap: 6, minWidth: 0 }}>
                <div style={{ fontWeight: 650 }}>{d.name}</div>
                <div className="small muted">{d.inspirationIds.length} görsel · {timeAgo(d.createdAt)}{d.status === 'running' ? ' · hazırlanıyor…' : ''}{d.error ? ` · ${d.error}` : ''}</div>
                {d.data && (
                  <>
                    <div className="row" style={{ gap: 10 }}><Strip list={d.data.palette.map((p) => p.hex)} />{d.data.fonts.slice(0, 2).map((f) => <span key={f.rol} className="pill" style={{ fontFamily: `'${f.program}'` }}>{f.rol}: {f.program}</span>)}</div>
                    <div className="prompt-box" style={{ maxHeight: 90 }}>{d.data.masterPrompt}</div>
                  </>
                )}
              </div>
              <div className="row" style={{ gap: 4 }}>
                {d.usage && <UsageLine usage={d.usage} compact />}
                {d.data && <button className="btn sm" onClick={() => copy(d.data.masterPrompt)}><Icon name="copy" />Prompt</button>}
                {d.pdfUrl && <a className="btn sm primary" href={d.pdfUrl} download={`${d.name}.pdf`}><Icon name="download" />PDF</a>}
                {d.data && <button className="btn sm" onClick={() => download(`/api/agency/design-languages/${d.id}/json`)}>JSON</button>}
                {d.data && <AsyncButton className="btn sm" title="Bütün tasarımlarda kullanılan ajans görsel diline aktar" onClick={async () => { if (confirmAsk('Ajansın görsel dili bu tasarım diliyle değiştirilsin mi?')) { await api.post(`/api/agency/design-languages/${d.id}/apply`); toast('Ajansın görsel diline aktarıldı'); load(); } }}><Icon name="check" />Uygula</AsyncButton>}
                <button className="btn sm ghost danger" onClick={async () => { if (confirmAsk('Silinsin mi?')) { await api.del(`/api/agency/design-languages/${d.id}`); load(); } }}><Icon name="trash" /></button>
              </div>
            </div>
          ))}
        </div>
      ) : <Empty icon="file" title="Henüz tasarım dili yok">Görselleri seç ya da hepsini kullan, "PDF oluştur"a bas.</Empty>}
      {pick && (
        <Modal size="wide" title="Tasarım dili için görseller" onClose={() => setPick(false)} footer={<><span className="small muted grow">Seçmezsen taranmış bütün görseller (en fazla 40) kullanılır.</span><button className="btn primary" onClick={() => setPick(false)}><Icon name="check" />Tamam ({sel.length})</button></>}>
          <InspirationPicker selected={sel} onChange={setSel} max={40} />
        </Modal>
      )}
    </div>
  );
}

// ---------------- mockup kütüphanesi ----------------

export function MockupLibrary() {
  const [list, load] = useMockups();
  const [open, setOpen] = useState(null);
  const upload = async (files) => {
    try { const r = await api.post('/api/mockups', { items: await filesToItems(files) }); toast(`${r.added.length} mockup eklendi; taranıyor…`); load(); } catch (e) { toastErr(e); }
  };
  if (!list) return <div className="spinner" />;
  const cur = open && list.find((m) => m.id === open);
  return (
    <DropZone onFiles={upload}>
      <div className="stack">
        <div className="card pad row between">
          <div><h3>Mockuplar</h3><div className="small muted">Örnek mockup dosyalarını yükle (kartvizit, tişört, ambalaj, ekran…). Her biri taranır: logonun yeri, yüzey tonu ve sahnenin piksel piksel promptu çıkarılır. Marka dosyasında ve markanın "Marka dosyası" sekmesinde kullanılır.</div></div>
          <FilePick className="btn primary" accept="image/*" multiple onFiles={upload}><Icon name="upload" />Mockup yükle</FilePick>
        </div>
        <div className="img-grid" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))' }}>
          {list.map((m) => (
            <div key={m.id} className="img-card">
              <div className="th" style={{ aspectRatio: '4 / 3' }} onClick={() => setOpen(m.id)}><img src={m.builtin ? `${m.previewUrl}?w=500` : m.url} alt="" loading="lazy" /></div>
              <div className="meta">
                <b>{m.name}</b>
                <span className="muted">{m.builtin ? 'Hazır mockup' : m.analyzing ? 'Taranıyor…' : m.analysis ? m.category || 'Tarandı' : m.analysisError ? m.analysisError.slice(0, 60) : 'Taranmadı'}</span>
                <div className="row" style={{ gap: 4 }}>
                  <button className="btn sm" onClick={() => setOpen(m.id)}><Icon name={m.builtin ? 'eye' : 'edit'} /></button>
                  {m.analysis?.prompt && <button className="btn sm" onClick={() => copy(m.analysis.prompt)}><Icon name="copy" />Prompt</button>}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
      {cur && <MockupDetail m={cur} onClose={() => setOpen(null)} load={load} />}
    </DropZone>
  );
}

function MockupDetail({ m, onClose, load }) {
  const [pl, setPl] = useState(m.placement);
  const [name, setName] = useState(m.name);
  const [surface, setSurface] = useState(m.surface);
  const [blend, setBlend] = useState(m.blend || 'normal');
  const [prompt, setPrompt] = useState(m.analysis?.prompt || '');
  useEffect(() => { setPl(m.placement); setPrompt(m.analysis?.prompt || ''); setSurface(m.surface); setBlend(m.blend || 'normal'); }, [m.analysis?.at]);
  const ro = !!m.builtin;
  const S = (k, label) => (
    <div className="field"><label>{label} · %{Math.round(pl[k] * 100)}</label><input type="range" min="0" max="1" step="0.005" disabled={ro} value={pl[k]} onChange={(e) => setPl({ ...pl, [k]: +e.target.value })} /></div>
  );
  return (
    <Modal size="wide" title={m.name} onClose={onClose} footer={ro ? null : <>
      <button className="btn danger" onClick={async () => { if (confirmAsk('Mockup silinsin mi?')) { await api.del(`/api/mockups/${m.id}`); onClose(); load(); } }}><Icon name="trash" />Sil</button>
      <div className="grow" />
      <AsyncButton className="btn" onClick={() => api.post(`/api/mockups/${m.id}/analyze`)}><Icon name="refresh" />Yeniden tara</AsyncButton>
      <AsyncButton className="btn primary" onClick={async () => { await api.patch(`/api/mockups/${m.id}`, { name, placement: pl, surface, blend, prompt }); toast('Kaydedildi'); load(); }}><Icon name="check" />Kaydet</AsyncButton>
    </>}>
      <div className="design-modal">
        <div className="preview">
          <div className="big" style={{ position: 'relative' }}>
            <img src={m.builtin ? `${m.previewUrl}?w=1200` : m.url} alt="" style={{ display: 'block', width: '100%' }} />
            <div style={{ position: 'absolute', left: `${pl.x * 100}%`, top: `${pl.y * 100}%`, width: `${pl.w * 100}%`, height: `${pl.h * 100}%`, border: '2px dashed #ff2d7a', background: 'rgba(255,45,122,.12)', borderRadius: 6 }} />
          </div>
        </div>
        <div className="stack">
          {ro ? <div className="small muted">Hazır mockup: markanın renkleriyle çizilir, logo kesik çizgili alana yerleşir.</div> : (
            <>
              <div className="field"><label>Ad</label><input className="input" value={name} onChange={(e) => setName(e.target.value)} /></div>
              <div className="small muted">Logonun yerleşeceği alan (kesik çizgi). Tarama otomatik bulur; gerekirse kaydırıcılarla düzelt.</div>
              <div className="grid-2">{S('x', 'Sol')}{S('y', 'Üst')}{S('w', 'Genişlik')}{S('h', 'Yükseklik')}</div>
              <div className="row">
                <div className="seg">{[['light', 'Açık yüzey'], ['dark', 'Koyu yüzey']].map(([k, l]) => <button key={k} className={surface === k ? 'on' : ''} onClick={() => setSurface(k)}>{l}</button>)}</div>
                <div className="seg">{[['normal', 'Normal'], ['multiply', 'Baskı (multiply)']].map(([k, l]) => <button key={k} className={blend === k ? 'on' : ''} onClick={() => setBlend(k)}>{l}</button>)}</div>
              </div>
              {m.analyzing ? <div className="row muted"><span className="spinner" />Taranıyor…</div> : (
                <div className="field"><label className="row between">Sahne promptu (piksel piksel)<button className="btn sm ghost" onClick={() => copy(prompt)}><Icon name="copy" /></button></label><textarea className="textarea mono" style={{ minHeight: 150 }} value={prompt} onChange={(e) => setPrompt(e.target.value)} /></div>
              )}
              {m.analysis?.perspective && <span className="small muted">Perspektif: {m.analysis.perspective}</span>}
            </>
          )}
        </div>
      </div>
    </Modal>
  );
}
