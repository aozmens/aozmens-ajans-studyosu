// Ajan ekibi: her ajanın direktifleri (eğitim), bağlı araçları (Higgsfield, Clipdrop…) ve sistem promptu.
import React, { useEffect, useState } from 'react';
import { api } from '../api.js';
import { useApp, go } from '../App.jsx';
import { Icon, Modal, Avatar, AsyncButton, Markdown, UsageLine, timeAgo, toast, confirmAsk } from '../ui.jsx';

export default function Agents({ focus }) {
  const { meta } = useApp();
  const [list, setList] = useState(null);
  const load = () => api.get('/api/agents').then(setList);
  useEffect(() => { load(); }, []);
  if (!list) return <div className="page"><div className="spinner" /></div>;
  const cur = focus && list.find((a) => a.name === focus);
  const grouped = meta.agentGroups.map(([g, names]) => [g, names.map((n) => list.find((a) => a.name === n)).filter(Boolean)]);
  const rest = list.filter((a) => !meta.agentGroups.some(([, n]) => n.includes(a.name)));
  if (rest.length) grouped.push(['Diğer', rest]);
  return (
    <div className="page">
      <div className="hello">
        <div>
          <h1 className="title">Ajan ekibi</h1>
          <p className="sub">Her ajan eğitilebilir: bir çıktıyı beğenmediğinde "Ajanı eğit" de ya da buradan direktif yaz. Direktifler ajanın bütün sonraki üretimlerinde uygulanır. Görsel ajanlarını Higgsfield, Clipdrop gibi araçlara bağlayabilirsin.</p>
        </div>
      </div>
      {grouped.map(([g, agents]) => (
        <div key={g} style={{ marginBottom: 24 }}>
          <h2 className="section" style={{ marginBottom: 10 }}>{g}</h2>
          <div className="agent-grid">
            {agents.map((a) => (
              <div key={a.name} className="card agent-card" onClick={() => go(`ajanlar/${a.name}`)}>
                <div className="row"><Avatar name={a.name} label={a.label} size={36} /><div className="grow"><b>{a.label}</b><div className="small muted mono">{a.name}</div></div></div>
                <div className="small muted" style={{ display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{a.description}</div>
                <div className="row" style={{ gap: 6 }}>
                  {a.lessons.length > 0 && <span className="pill"><Icon name="graduation" size={12} />{a.lessons.length} direktif</span>}
                  {a.tools.map((t) => <span key={t} className="pill"><Icon name="link" size={12} />{meta.providers.find((p) => p.id === t)?.label || t}</span>)}
                  {a.edited && <span className="pill">Prompt düzenlendi</span>}
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}
      {cur && <AgentModal a={cur} reload={load} onClose={() => go('ajanlar')} />}
    </div>
  );
}

function AgentModal({ a, reload, onClose }) {
  const { meta } = useApp();
  const [tab, setTab] = useState('egitim');
  const [fb, setFb] = useState('');
  const [direct, setDirect] = useState('');
  const [last, setLast] = useState(null);
  const [prompt, setPrompt] = useState(a.prompt);
  useEffect(() => setPrompt(a.prompt), [a.prompt]);
  const setTools = async (tools) => { await api.put(`/api/agents/${a.name}/tools`, { tools }); reload(); };
  return (
    <Modal size="wide" title={a.label} onClose={onClose}>
      <div className="tabs">
        {[['egitim', 'Eğitim ve direktifler', 'graduation'], ['araclar', 'Bağlı araçlar', 'link'], ['prompt', 'Sistem promptu', 'code']].map(([k, l, i]) => <button key={k} className={`tab ${tab === k ? 'on' : ''}`} onClick={() => setTab(k)}><Icon name={i} size={15} />{l}</button>)}
      </div>
      {tab === 'egitim' && (
        <div className="stack">
          <div className="card pad stack">
            <h3>Geri bildirimle eğit</h3>
            <span className="small muted">Serbestçe yaz; Claude bunu ölçülebilir, kalıcı direktiflere çevirir ve çelişen eski direktifi değiştirir.</span>
            <textarea className="textarea" placeholder="ör. Çok fazla gereksiz kod yazıyorsun; kullanılmayan fonksiyonlar, uzun yorumlar ekleme." value={fb} onChange={(e) => setFb(e.target.value)} />
            <div className="row">
              <AsyncButton className="btn primary" disabled={!fb.trim()} busyText="Direktife çevriliyor…" onClick={async () => { const r = await api.post(`/api/agents/${a.name}/train`, { feedback: fb }); setLast(r); setFb(''); reload(); }}><Icon name="graduation" />Eğit</AsyncButton>
              {last && <span className="small">{last.added.length ? `${last.added.length} direktif eklendi` : 'Yeni direktif gerekmedi'} <UsageLine usage={last.usage} compact /></span>}
            </div>
          </div>
          <div className="card pad row">
            <input className="input grow" placeholder="Ya da direktifi kendin yaz (olduğu gibi eklenir)" value={direct} onChange={(e) => setDirect(e.target.value)} />
            <AsyncButton className="btn" disabled={!direct.trim()} onClick={async () => { await api.post(`/api/agents/${a.name}/directives`, { text: direct }); setDirect(''); reload(); }}><Icon name="plus" />Ekle</AsyncButton>
          </div>
          <div className="card">
            {a.lessons.length ? a.lessons.map((l) => (
              <div key={l.id} className="list-row" style={{ cursor: 'default' }}>
                <Icon name="check" />
                <div className="grow">{l.text}<div className="small faint">{l.source} · {timeAgo(l.at)}</div></div>
                <button className="btn sm ghost danger" onClick={async () => { await api.del(`/api/agents/${a.name}/lessons/${l.id}`); reload(); }}><Icon name="trash" /></button>
              </div>
            )) : <div className="muted small" style={{ padding: 16 }}>Henüz direktif yok.</div>}
          </div>
        </div>
      )}
      {tab === 'araclar' && (
        <div className="stack">
          <div className="note-box"><Icon name="link" /><div>Bağlı araçlar ajanın sistem promptuna eklenir; ajan bu araçlarda doğrudan çalışacak promptlar yazar ve program görsel/video üretiminde bunları kullanır. Anahtarlar Ayarlar → Entegrasyonlar'da.</div></div>
          {meta.providers.map((p) => {
            const on2 = a.tools.includes(p.id);
            return (
              <div key={p.id} className="card prov">
                <div className="lg" style={{ background: `hsl(${p.id.length * 47} 60% 50%)` }}>{p.label[0]}</div>
                <div className="grow"><b>{p.label}</b><div className="small muted">{p.kinds.join(', ')} · {p.connected ? 'bağlı' : 'anahtar girilmedi'}</div></div>
                <label className="check"><input type="checkbox" checked={on2} onChange={() => setTools(on2 ? a.tools.filter((x) => x !== p.id) : [...a.tools, p.id])} />Bu ajana bağla</label>
              </div>
            );
          })}
        </div>
      )}
      {tab === 'prompt' && (
        <div className="stack">
          <textarea className="textarea mono" style={{ minHeight: 440 }} value={prompt} onChange={(e) => setPrompt(e.target.value)} />
          <div className="row end">
            {a.edited && <AsyncButton className="btn" onClick={async () => { if (confirmAsk('Orijinal prompta dönülsün mü?')) { await api.del(`/api/agents/${a.name}/override`); reload(); } }}><Icon name="undo" />Orijinale dön</AsyncButton>}
            <AsyncButton className="btn primary" onClick={async () => { await api.put(`/api/agents/${a.name}`, { prompt }); toast('Kaydedildi'); reload(); }}>Kaydet</AsyncButton>
          </div>
        </div>
      )}
    </Modal>
  );
}
