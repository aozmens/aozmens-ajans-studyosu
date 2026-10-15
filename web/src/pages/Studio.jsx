// Görsel stüdyosu: ilham promptlarından marka uyumlu prompt yaz, bağlı görsel motorlarıyla üret.
import React, { useEffect, useState } from 'react';
import { api } from '../api.js';
import { useApp, go } from '../App.jsx';
import { Icon, Modal, AsyncButton, UsageLine, Empty, copy, toast } from '../ui.jsx';
import { InspirationPicker } from './Inspiration.jsx';

const SIZES = [['1080x1350', 'Post 4:5'], ['1080x1080', 'Kare 1:1'], ['1080x1920', 'Story 9:16'], ['1200x628', 'Yatay 1.91:1'], ['1600x900', 'Geniş 16:9']];

export default function Studio() {
  const { meta, companies, settings } = useApp();
  const connected = meta.providers.filter((p) => p.connected);
  const [companyId, setCompanyId] = useState(companies[0]?.id || '');
  const company = companies.find((c) => c.id === companyId);
  const [insp, setInsp] = useState(() => { try { const v = JSON.parse(sessionStorage.getItem('studio-insp') || 'null'); sessionStorage.removeItem('studio-insp'); return v || []; } catch { return []; } });
  const [subject, setSubject] = useState('');
  const [size, setSize] = useState('1080x1350');
  const [prompt, setPrompt] = useState('');
  const [note, setNote] = useState('');
  const [usage, setUsage] = useState(null);
  const [provider, setProvider] = useState(settings.imageProvider || connected[0]?.id || '');
  const [count, setCount] = useState(1);
  const [useBrandProfile, setUseBrandProfile] = useState(true);
  const [results, setResults] = useState([]);
  const [pick, setPick] = useState(false);
  const [w, h] = size.split('x').map(Number);
  useEffect(() => { if (!insp.length && company?.inspirationIds?.length) setInsp(company.inspirationIds.slice(0, 3)); }, [companyId]);

  return (
    <div className="page">
      <div className="hello">
        <div>
          <h1 className="title">Görsel stüdyosu</h1>
          <p className="sub">İlham görsellerinin promptlarını markanın renkleri ve profiliyle birleştirip ultra detaylı bir prompt yazar, bağlı motorla üretir. Üretilenler markanın Dosyalar sekmesine eklenir ve tasarımlarda kullanılabilir.</p>
        </div>
      </div>
      <div className="grid-2" style={{ alignItems: 'start' }}>
        <div className="card pad stack">
          <div className="grid-2">
            <div className="field"><label>Marka</label>
              <select className="select" value={companyId} onChange={(e) => setCompanyId(e.target.value)}>
                {companies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
            <div className="field"><label>Boyut</label>
              <select className="select" value={size} onChange={(e) => setSize(e.target.value)}>{SIZES.map(([k, l]) => <option key={k} value={k}>{l} · {k.replace('x', '×')}</option>)}</select>
            </div>
          </div>
          <div className="field">
            <label className="row between">İlham ({insp.length})<button className="btn sm" onClick={() => setPick(true)}><Icon name="sparkles" />İlham Al</button></label>
            {insp.length ? <span className="small muted">Seçilen ilhamların ışığı, kamerası, renk derecelendirmesi ve kompozisyonu taşınır.</span> : <span className="small muted">İlham seçmezsen prompt yalnızca marka profilinden yazılır.</span>}
          </div>
          <div className="field"><label>Ne görmek istiyorsun?</label><textarea className="textarea" placeholder="ör. Mermer tezgâhta latte, sabah ışığı, sağda başlık için boşluk" value={subject} onChange={(e) => setSubject(e.target.value)} /></div>
          <label className="check"><input type="checkbox" checked={useBrandProfile} onChange={(e) => setUseBrandProfile(e.target.checked)} />Marka profilini kullan</label>
          <AsyncButton className="btn primary" disabled={!subject.trim()} busyText="Prompt yazılıyor…" onClick={async () => {
            const r = await api.post('/api/studio/prompt', { companyId, inspirationIds: insp, subject, width: w, height: h, useBrandProfile });
            setPrompt(r.prompt); setNote(r.note); setUsage(r.usage);
          }}><Icon name="sparkles" />Prompt yaz</AsyncButton>
          <div className="field">
            <label className="row between">Prompt <span className="row" style={{ gap: 4 }}>{usage && <UsageLine usage={usage} compact />}<button className="btn sm ghost" onClick={() => copy(prompt)}><Icon name="copy" /></button></span></label>
            <textarea className="textarea mono" style={{ minHeight: 150 }} placeholder="Prompt yaz ya da kendin gir" value={prompt} onChange={(e) => setPrompt(e.target.value)} />
            {note && <span className="hint">{note}</span>}
          </div>
          {connected.length ? (
            <div className="row">
              <select className="select" style={{ width: 220 }} value={provider} onChange={(e) => setProvider(e.target.value)}>{connected.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}</select>
              <select className="select" style={{ width: 90 }} value={count} onChange={(e) => setCount(+e.target.value)}>{[1, 2, 3, 4].map((n) => <option key={n} value={n}>{n} adet</option>)}</select>
              <AsyncButton className="btn primary" disabled={!prompt.trim() || !companyId} busyText="Üretiliyor…" onClick={async () => {
                const r = await api.post('/api/studio/generate', { companyId, prompt, provider, width: w, height: h, count, inspirationIds: insp });
                setResults((x) => [...r.files, ...x]);
                toast(`${r.files.length} görsel markanın dosyalarına eklendi`);
              }}><Icon name="wand" />Üret</AsyncButton>
            </div>
          ) : <div className="warn-box"><Icon name="alert" /><div>Görsel motoru bağlı değil. <a href="#/ayarlar/entegrasyonlar">Ayarlar → Entegrasyonlar</a>'dan Clipdrop, fal.ai, OpenAI, Gemini ya da Higgsfield bağla. Prompt'u kopyalayıp Midjourney'de de kullanabilirsin.</div></div>}
        </div>
        <div className="stack">
          {results.length ? (
            <div className="img-grid" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))' }}>
              {results.map((f) => (
                <div key={f.id} className="img-card">
                  <div className="th" style={{ aspectRatio: `${f.width || 1} / ${f.height || 1}` }}><img src={f.url} alt="" /></div>
                  <div className="meta row"><a className="btn sm" href={f.url} download><Icon name="download" />İndir</a><button className="btn sm" onClick={() => go(`marka/${companyId}/dosyalar`)}>Dosyalarda aç</button></div>
                </div>
              ))}
            </div>
          ) : <Empty icon="wand" title="Henüz görsel yok">Prompt yaz, motoru seç ve üret.</Empty>}
        </div>
      </div>
      {pick && (
        <Modal size="wide" title="İlham Al" onClose={() => setPick(false)} footer={<button className="btn primary" onClick={() => setPick(false)}><Icon name="check" />Tamam ({insp.length})</button>}>
          <InspirationPicker selected={insp} onChange={setInsp} max={3} />
          <p className="small muted">Görsel stüdyosu en fazla 3 ilham kullanır (Gemini seçiliyse görseller referans olarak da gönderilir).</p>
        </Modal>
      )}
    </div>
  );
}
