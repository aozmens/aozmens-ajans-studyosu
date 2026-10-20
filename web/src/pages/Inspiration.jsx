// İlham arşivi: görsel yükle → otomatik tarama → prompt kütüphanesi. Ajansın ortak görsel dili de burada.
import React, { useEffect, useMemo, useState } from 'react';
import { api, on, filesToItems } from '../api.js';
import { go } from '../App.jsx';
import { Icon, Modal, Empty, AsyncButton, FilePick, DropZone, Markdown, toast, toastErr, copy, confirmAsk } from '../ui.jsx';
import { DesignLanguages, MockupLibrary } from './DesignLibrary.jsx';

function useAgency() {
  const [a, setA] = useState(null);
  const load = () => api.get('/api/agency').then(setA);
  useEffect(() => {
    load();
    let t = null;
    const off = on('agency:update', () => { clearTimeout(t); t = setTimeout(load, 250); });
    return () => { off(); clearTimeout(t); };
  }, []);
  return [a, load];
}

const matches = (s, q) => {
  if (!q) return true;
  const n = q.toLocaleLowerCase('tr-TR');
  const hay = [s.name, s.collection, s.analysis?.style, s.analysis?.mood, s.analysis?.medium, s.analysis?.prompt, ...(s.analysis?.tags || [])].join(' ').toLocaleLowerCase('tr-TR');
  return hay.includes(n);
};

// Seçici: marka "İlham Al", yeni iş ve görsel stüdyosunda kullanılır
export function InspirationPicker({ selected, onChange, max = 24 }) {
  const [a] = useAgency();
  const [q, setQ] = useState('');
  if (!a) return <div className="spinner" />;
  const list = a.styles.filter((s) => matches(s, q));
  if (!a.styles.length) return <Empty icon="sparkles" title="İlham arşivi boş"><a href="#/ilham">İlham arşivine</a> görsel yükle; her görsel otomatik taranıp prompta dönüşür.</Empty>;
  return (
    <div className="stack">
      <input className="input" placeholder="Etiket, stil ya da ruh hâli ara (ör. sinematik, pastel, ürün)" value={q} onChange={(e) => setQ(e.target.value)} />
      <div className="img-grid" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))' }}>
        {list.map((s) => {
          const on2 = selected.includes(s.id);
          return (
            <div key={s.id} className={`img-card ${on2 ? 'selected' : ''}`} style={{ cursor: 'pointer' }} onClick={() => onChange(on2 ? selected.filter((x) => x !== s.id) : selected.length >= max ? selected : [...selected, s.id])}>
              <div className="th"><img src={s.url} alt="" loading="lazy" /></div>
              {on2 && <div className="sel-mark"><Icon name="check" size={13} /></div>}
              <div className="meta">
                <b style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{s.analysis?.style || s.name}</b>
                <span className="muted">{s.analysis ? (s.analysis.tags || []).slice(0, 3).join(' · ') : s.analyzing ? 'Taranıyor…' : 'Taranmadı'}</span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default function Inspiration() {
  const [a, load] = useAgency();
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(null);
  const [tab, setTab] = useState('arsiv');
  const upload = async (files) => {
    try {
      const r = await api.post('/api/companies/_ajans/styles', { items: await filesToItems(files) });
      toast(`${r.added.length} görsel eklendi; taranıyor…`);
      load();
    } catch (e) { toastErr(e); }
  };
  if (!a) return <div className="page"><div className="spinner" /></div>;
  const list = a.styles.filter((s) => matches(s, q));
  const missing = a.styles.filter((s) => !s.analysis && !s.analyzing).length;
  const analyzing = a.styles.filter((s) => s.analyzing).length;
  const cur = open && a.styles.find((s) => s.id === open);
  return (
    <div className="page">
      <div className="hello">
        <div>
          <h1 className="title">İlham arşivi</h1>
          <p className="sub">Beğendiğin görselleri yükle; her biri taranıp yeniden üretilebilir bir prompta dönüşür. Markalara "İlham Al" ile bağla, işler bu promptlarla ultra kaliteli görseller üretsin.</p>
        </div>
        <div className="row">
          {missing > 0 && <AsyncButton className="btn" onClick={async () => { await api.post('/api/agency/analyze-missing'); toast(`${missing} görsel taranıyor`); }}><Icon name="search" />Taranmamışları tara ({missing})</AsyncButton>}
          <FilePick className="btn primary" accept="image/*" multiple onFiles={upload}><Icon name="upload" />Görsel yükle</FilePick>
        </div>
      </div>
      <div className="tabs">
        <button className={`tab ${tab === 'arsiv' ? 'on' : ''}`} onClick={() => setTab('arsiv')}><Icon name="sparkles" size={15} />Görseller ve promptlar<span className="cnt">{a.styles.length}</span></button>
        <button className={`tab ${tab === 'dil' ? 'on' : ''}`} onClick={() => setTab('dil')}><Icon name="file" size={15} />Tasarım dili (PDF)<span className="cnt">{a.designLanguages.length || ''}</span></button>
        <button className={`tab ${tab === 'mockup' ? 'on' : ''}`} onClick={() => setTab('mockup')}><Icon name="layers" size={15} />Mockuplar</button>
        <button className={`tab ${tab === 'rehber' ? 'on' : ''}`} onClick={() => setTab('rehber')}><Icon name="palette" size={15} />Ajansın görsel dili</button>
      </div>
      {tab === 'dil' ? <DesignLanguages a={a} load={load} /> : tab === 'mockup' ? <MockupLibrary /> : tab === 'arsiv' ? (
        <DropZone onFiles={upload}>
          <div className="stack">
            <div className="row">
              <input className="input grow" placeholder="Ara: etiket, stil, ruh hâli, prompt…" value={q} onChange={(e) => setQ(e.target.value)} />
              {analyzing > 0 && <span className="badge running">{analyzing} görsel taranıyor</span>}
            </div>
            {a.styles.length ? (
              <div className="img-grid" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))' }}>
                {list.map((s) => (
                  <div key={s.id} className="img-card">
                    <div className="th" onClick={() => setOpen(s.id)}><img src={s.url} alt="" loading="lazy" /></div>
                    <div className="meta">
                      <b>{s.analysis?.style || s.name}</b>
                      {s.analyzing ? <span className="row muted"><span className="spinner sm" />Taranıyor…</span>
                        : s.analysis ? (
                          <>
                            <div className="row" style={{ gap: 3 }}>{(s.analysis.palette || []).map((h) => <span key={h} title={h} style={{ width: 14, height: 14, borderRadius: 4, background: h }} />)}</div>
                            <span className="muted">{(s.analysis.tags || []).slice(0, 4).join(' · ')}</span>
                            <div className="row" style={{ gap: 4 }}>
                              <button className="btn sm" onClick={() => copy(s.analysis.prompt)}><Icon name="copy" />Prompt</button>
                              <button className="btn sm" onClick={() => setOpen(s.id)}><Icon name="eye" /></button>
                            </div>
                          </>
                        ) : (
                          <>
                            {s.analysisError && <span style={{ color: 'var(--err)' }}>{s.analysisError.slice(0, 80)}</span>}
                            <AsyncButton className="btn sm" onClick={() => api.post(`/api/agency/styles/${s.id}/analyze`)}><Icon name="search" />Tara</AsyncButton>
                          </>
                        )}
                    </div>
                  </div>
                ))}
              </div>
            ) : <Empty icon="sparkles" title="Arşiv boş">Görselleri buraya sürükle ya da "Görsel yükle". Pinterest, Behance, kampanya görselleri… En fazla 300 görsel.</Empty>}
          </div>
        </DropZone>
      ) : <AgencyStyle a={a} load={load} />}
      {cur && <InspirationDetail s={cur} onClose={() => setOpen(null)} load={load} />}
    </div>
  );
}

function InspirationDetail({ s, onClose, load }) {
  const [an, setAn] = useState(s.analysis || {});
  const [name, setName] = useState(s.name);
  useEffect(() => setAn(s.analysis || {}), [s.analysis]);
  const save = async () => { await api.patch(`/api/agency/styles/${s.id}`, { name, analysis: an }); toast('Kaydedildi'); load(); };
  const F = ({ k, label, area }) => (
    <div className="field">
      <label>{label}</label>
      {area ? <textarea className="textarea mono" value={an[k] || ''} onChange={(e) => setAn({ ...an, [k]: e.target.value })} /> : <input className="input" value={an[k] || ''} onChange={(e) => setAn({ ...an, [k]: e.target.value })} />}
    </div>
  );
  return (
    <Modal size="wide" title={s.analysis?.style || s.name} onClose={onClose} footer={<>
      <button className="btn danger" onClick={async () => { if (confirmAsk('Görsel arşivden silinsin mi?')) { await api.del(`/api/companies/_ajans/assets/styles/${s.id}`); onClose(); load(); } }}><Icon name="trash" />Sil</button>
      <div className="grow" />
      <AsyncButton className="btn" onClick={() => api.post(`/api/agency/styles/${s.id}/analyze`)}><Icon name="refresh" />Yeniden tara</AsyncButton>
      <button className="btn" onClick={() => { sessionStorage.setItem('studio-insp', JSON.stringify([s.id])); go('studyo'); }}><Icon name="wand" />Bu stille görsel üret</button>
      <AsyncButton className="btn primary" onClick={save}><Icon name="check" />Kaydet</AsyncButton>
    </>}>
      <div className="design-modal">
        <div className="preview"><div className="big"><img src={s.url} alt="" /></div></div>
        <div className="stack">
          <div className="field"><label>Ad</label><input className="input" value={name} onChange={(e) => setName(e.target.value)} /></div>
          {s.analyzing ? <div className="row muted"><span className="spinner" />Taranıyor…</div> : !s.analysis ? <div className="muted">Henüz taranmadı.</div> : (
            <>
              <div className="field"><label className="row between">Prompt<button className="btn sm ghost" onClick={() => copy(an.prompt)}><Icon name="copy" /></button></label><textarea className="textarea mono" style={{ minHeight: 130 }} value={an.prompt || ''} onChange={(e) => setAn({ ...an, prompt: e.target.value })} /></div>
              <div className="field"><label className="row between">Stil eki (başka konulara eklenir)<button className="btn sm ghost" onClick={() => copy(an.styleSuffix)}><Icon name="copy" /></button></label><textarea className="textarea mono" style={{ minHeight: 60 }} value={an.styleSuffix || ''} onChange={(e) => setAn({ ...an, styleSuffix: e.target.value })} /></div>
              <div className="field"><label className="row between">Ana ürün / kompozisyon {an.subjectPlacement ? `· ${an.subjectPlacement}` : ''}<button className="btn sm ghost" onClick={() => copy(an.subject)}><Icon name="copy" /></button></label><textarea className="textarea mono" style={{ minHeight: 70 }} value={an.subject || ''} onChange={(e) => setAn({ ...an, subject: e.target.value })} /></div>
              {F({ k: 'negative', label: 'Negatif prompt' })}
              {(an.fonts || []).length > 0 && <div className="row">{an.fonts.map((f, i) => <span key={i} className="pill" title={f.stil}>{f.rol}: {f.tahmin} → <b style={{ fontFamily: `'${f.programFontu}'` }}>{f.programFontu}</b></span>)}</div>}
              <div className="grid-2">
                {F({ k: 'medium', label: 'Tür' })}{F({ k: 'style', label: 'Stil' })}
                {F({ k: 'lighting', label: 'Işık' })}{F({ k: 'composition', label: 'Kompozisyon' })}
                {F({ k: 'mood', label: 'Ruh hâli' })}{F({ k: 'typography', label: 'Tipografi' })}
              </div>
              <div className="row">{(an.palette || []).map((h) => <span key={h} className="pill" onClick={() => copy(h)} style={{ cursor: 'pointer' }}><span style={{ width: 12, height: 12, borderRadius: 3, background: h }} />{h}</span>)}</div>
              <div className="field"><label>Etiketler (virgülle)</label><input className="input" value={(an.tags || []).join(', ')} onChange={(e) => setAn({ ...an, tags: e.target.value.split(',').map((x) => x.trim()).filter(Boolean) })} /></div>
            </>
          )}
        </div>
      </div>
    </Modal>
  );
}

function AgencyStyle({ a, load }) {
  const [edit, setEdit] = useState(false);
  const [text, setText] = useState(a.styleGuide?.text || '');
  useEffect(() => setText(a.styleGuide?.text || ''), [a.styleGuide?.text]);
  return (
    <div className="stack">
      <div className="card pad row between">
        <div>
          <label className="check" style={{ fontWeight: 650 }}><input type="checkbox" checked={a.enabled} onChange={async (e) => { await api.put('/api/agency', { enabled: e.target.checked }); load(); }} />Ajansın görsel dilini bütün tasarımlarda uygula</label>
          <div className="small muted">Markanın kendi stil rehberi varsa önce o uygulanır; bu rehber genel kalite çıtasını belirler.</div>
        </div>
        <div className="row">
          <AsyncButton className="btn" disabled={a.styles.length < 2} busyText="Öğreniyor…" onClick={async () => { await api.post('/api/companies/_ajans/learn-style'); toast('Arşivden görsel dil öğrenildi'); load(); }}><Icon name="graduation" />Arşivden öğren</AsyncButton>
          <AsyncButton className="btn" onClick={async () => { if (confirmAsk('Hazır rehbere dönülsün mü?')) { await api.post('/api/agency/reset-guide'); load(); } }}><Icon name="undo" />Hazır rehber</AsyncButton>
          {!edit && <button className="btn" onClick={() => setEdit(true)}><Icon name="edit" />Düzenle</button>}
        </div>
      </div>
      <div className="card pad">
        {edit ? (
          <div className="stack">
            <textarea className="textarea mono" style={{ minHeight: 420 }} value={text} onChange={(e) => setText(e.target.value)} />
            <div className="row end">
              <button className="btn" onClick={() => setEdit(false)}>Vazgeç</button>
              <AsyncButton className="btn primary" onClick={async () => { await api.put('/api/companies/_ajans/style-guide', { text }); setEdit(false); load(); }}>Kaydet</AsyncButton>
            </div>
          </div>
        ) : <Markdown text={a.styleGuide?.text || '_Rehber yok._'} />}
      </div>
    </div>
  );
}
