// Dış araç rehberleri: Higgsfield, Clipdrop, Midjourney… Program dokümanları okuyup prompt rehberi çıkarır.
import React, { useEffect, useState } from 'react';
import { api, on } from '../api.js';
import { useApp } from '../App.jsx';
import { Icon, Modal, AsyncButton, Markdown, Empty, timeAgo, toast, confirmAsk } from '../ui.jsx';

export default function Tools() {
  const { meta } = useApp();
  const [list, setList] = useState(null);
  const [edit, setEdit] = useState(null);
  const [view, setView] = useState(null);
  const load = () => api.get('/api/tools').then(setList);
  useEffect(() => {
    load();
    return on('tool:update', load);
  }, []);
  if (!list) return <div className="page"><div className="spinner" /></div>;
  return (
    <div className="page">
      <div className="hello">
        <div>
          <h1 className="title">Araçlar</h1>
          <p className="sub">Ajanların prompt yazacağı dış araçlar. "Öğren" ile aracın dokümanları okunur ve bir prompt rehberi çıkarılır; yeni işte araç seçersen her içerik için o araca uygun prompt hazırlanır. API'si olan araçlar (Higgsfield, Clipdrop…) Ayarlar'dan bağlanınca doğrudan çalıştırılır.</p>
        </div>
        <button className="btn primary" onClick={() => setEdit({ name: '', kind: 'görsel', urls: [''], notes: '' })}><Icon name="plus" />Araç ekle</button>
      </div>
      {list.length ? (
        <div className="agent-grid">
          {list.map((t) => {
            const p = meta.providers.find((x) => x.id === t.integration);
            return (
              <div key={t.id} className="card agent-card" style={{ cursor: 'default' }}>
                <div className="row"><div className="logo-sq" style={{ color: 'var(--accent)' }}><Icon name={t.kind === 'video' ? 'film' : t.kind === 'görsel' ? 'image' : 'tool'} /></div><div className="grow"><b>{t.name}</b><div className="small muted">{t.kind}{p ? ` · ${p.connected ? 'API bağlı' : 'API bağlanmadı'}` : ''}</div></div></div>
                <div className="small muted">{t.notes}</div>
                <div className="row" style={{ gap: 6 }}>
                  {t.learning ? <span className="badge running">Öğreniyor</span> : t.guide ? <span className="badge done">Rehber hazır · {timeAgo(t.learnedAt || t.updatedAt)}</span> : <span className="badge">Rehber yok</span>}
                  {t.learnError && <span className="badge error" title={t.learnError}>Hata</span>}
                </div>
                <div className="row" style={{ gap: 4 }}>
                  <AsyncButton className="btn sm primary" disabled={t.learning || !t.urls?.length} onClick={async () => { await api.post(`/api/tools/${t.id}/learn`); toast(`${t.name} dokümanları okunuyor…`); }}><Icon name="graduation" />Öğren</AsyncButton>
                  {t.guide && <button className="btn sm" onClick={() => setView(t)}><Icon name="book" />Rehber</button>}
                  <button className="btn sm" onClick={() => setEdit({ ...t, urls: t.urls?.length ? t.urls : [''] })}><Icon name="edit" /></button>
                  <button className="btn sm ghost danger" onClick={async () => { if (confirmAsk('Araç silinsin mi?')) { await api.del(`/api/tools/${t.id}`); load(); } }}><Icon name="trash" /></button>
                </div>
              </div>
            );
          })}
        </div>
      ) : <Empty icon="tool" title="Araç yok" />}
      {edit && <ToolForm t={edit} onClose={() => setEdit(null)} onSaved={() => { setEdit(null); load(); }} />}
      {view && <ToolGuide t={view} onClose={() => setView(null)} onSaved={() => { setView(null); load(); }} />}
    </div>
  );
}

function ToolForm({ t, onClose, onSaved }) {
  const { meta } = useApp();
  const [f, setF] = useState(t);
  return (
    <Modal title={t.id ? 'Aracı düzenle' : 'Araç ekle'} onClose={onClose} footer={<>
      <button className="btn" onClick={onClose}>Vazgeç</button>
      <AsyncButton className="btn primary" onClick={async () => { await api.post('/api/tools', { ...f, urls: f.urls.filter(Boolean) }); onSaved(); }}>Kaydet</AsyncButton>
    </>}>
      <div className="stack">
        <div className="grid-3">
          <div className="field" style={{ gridColumn: 'span 1' }}><label>Ad</label><input className="input" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></div>
          <div className="field"><label>Tür</label><select className="select" value={f.kind} onChange={(e) => setF({ ...f, kind: e.target.value })}>{['görsel', 'video', 'ses', 'metin', 'diğer'].map((k) => <option key={k}>{k}</option>)}</select></div>
          <div className="field"><label>API bağlantısı</label><select className="select" value={f.integration || ''} onChange={(e) => setF({ ...f, integration: e.target.value })}><option value="">Yok (yalnızca prompt)</option>{meta.providers.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}</select></div>
        </div>
        <div className="field">
          <label>Doküman adresleri</label>
          {f.urls.map((u, i) => (
            <div key={i} className="row"><input className="input grow" placeholder="https://docs…" value={u} onChange={(e) => setF({ ...f, urls: f.urls.map((x, j) => (j === i ? e.target.value : x)) })} /><button className="btn icon" onClick={() => setF({ ...f, urls: f.urls.filter((_, j) => j !== i) })}><Icon name="x" /></button></div>
          ))}
          <button className="btn sm" style={{ alignSelf: 'flex-start' }} onClick={() => setF({ ...f, urls: [...f.urls, ''] })}><Icon name="plus" />Adres ekle</button>
        </div>
        <div className="field"><label>Notlar</label><textarea className="textarea" placeholder="Aracı ne için kullanıyoruz?" value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} /></div>
      </div>
    </Modal>
  );
}

function ToolGuide({ t, onClose, onSaved }) {
  const [edit, setEdit] = useState(false);
  const [text, setText] = useState(t.guide);
  return (
    <Modal size="wide" title={`${t.name} rehberi`} onClose={onClose} footer={edit ? <>
      <button className="btn" onClick={() => setEdit(false)}>Vazgeç</button>
      <AsyncButton className="btn primary" onClick={async () => { await api.post('/api/tools', { ...t, guide: text }); onSaved(); }}>Kaydet</AsyncButton>
    </> : <button className="btn" onClick={() => setEdit(true)}><Icon name="edit" />Düzenle</button>}>
      {edit ? <textarea className="textarea mono" style={{ minHeight: 480 }} value={text} onChange={(e) => setText(e.target.value)} /> : <Markdown text={t.guide} />}
    </Modal>
  );
}
