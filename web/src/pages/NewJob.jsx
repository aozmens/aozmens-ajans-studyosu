// Yeni iş: tür, yalnızca ilgili ajanlar, tasarım boyutları (Post/Story), carousel, marka profili, ilham, AI görsel, araçlar.
import React, { useEffect, useMemo, useState } from 'react';
import { api } from '../api.js';
import { useApp, go } from '../App.jsx';
import { Icon, Modal, toastErr } from '../ui.jsx';
import { InspirationPicker } from './Inspiration.jsx';

const PLATFORMS = ['Instagram', 'Facebook', 'LinkedIn', 'TikTok', 'X', 'YouTube'];
const monthName = (offset = 1) => {
  const d = new Date();
  d.setMonth(d.getMonth() + offset, 1);
  return d.toLocaleDateString('tr-TR', { month: 'long', year: 'numeric' });
};

export default function NewJob({ initial, onClose }) {
  const { meta, companies, settings, loadJobs } = useApp();
  const [companyId, setCompanyId] = useState(initial.companyId || companies[0]?.id || '');
  const [type, setType] = useState(initial.preset?.type || 'sosyal-medya-aylik');
  const t = meta.jobTypes.find((x) => x.id === type) || meta.jobTypes[0];
  const company = companies.find((c) => c.id === companyId);
  const [title, setTitle] = useState('');
  const [request, setRequest] = useState(initial.preset?.request || '');
  const [month, setMonth] = useState(monthName());
  const [platforms, setPlatforms] = useState(['Instagram']);
  const [budget, setBudget] = useState('');
  const [agentSel, setAgentSel] = useState(null);
  const [makeDesigns, setMakeDesigns] = useState(t.designs);
  const [formats, setFormats] = useState(['post', 'story']);
  const [postCount, setPostCount] = useState(t.postCount);
  const [carouselCount, setCarouselCount] = useState(0);
  const [slideCount, setSlideCount] = useState(5);
  const [useBrandProfile, setUseBrandProfile] = useState(true);
  const [useInspiration, setUseInspiration] = useState(true);
  const [inspirationIds, setInspirationIds] = useState(null);
  const [pickInsp, setPickInsp] = useState(false);
  const [aiImages, setAiImages] = useState(false);
  const connected = meta.providers.filter((p) => p.connected);
  const [imageProvider, setImageProvider] = useState(settings.imageProvider || connected[0]?.id || '');
  const [tools, setTools] = useState([]);
  const [toolList, setToolList] = useState([]);
  const [busy, setBusy] = useState(false);
  const [agents, setAgents] = useState([]);

  useEffect(() => { api.get('/api/tools').then(setToolList); api.get('/api/agents').then(setAgents); }, []);
  useEffect(() => {
    setMakeDesigns(t.designs);
    setPostCount(t.postCount);
    setAgentSel(null);
    if (type === 'tasarim') setFormats(['post']);
  }, [type]);
  useEffect(() => setInspirationIds(null), [companyId]);

  const allowed = t.agents || agents.map((a) => a.name);
  const selAgents = agentSel || allowed;
  const insp = inspirationIds ?? company?.inspirationIds ?? [];
  const autoTitle = type === 'sosyal-medya-aylik' ? `${month} sosyal medya` : t.label.split(' (')[0];

  const submit = async () => {
    if (!companyId) return toastErr(new Error('Önce bir marka seç ya da oluştur.'));
    if (makeDesigns && !formats.length) return toastErr(new Error('En az bir tasarım boyutu seç.'));
    setBusy(true);
    try {
      const options = {
        agents: selAgents, month: type === 'sosyal-medya-aylik' ? month : undefined, platforms, budget,
        makeDesigns, formats, postCount: +postCount, carouselCount: +carouselCount, slideCount: +slideCount,
        useBrandProfile, useInspiration, inspirationIds: useInspiration ? insp : [], aiImages: makeDesigns && aiImages && !!imageProvider, imageProvider, tools,
      };
      const { id } = await api.post('/api/jobs', { companyId, type, title: title.trim() || autoTitle, request, options });
      loadJobs();
      onClose();
      go(`is/${id}`);
    } catch (e) { toastErr(e); } finally { setBusy(false); }
  };

  const toggle = (list, set, v) => set(list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);
  const labelOf = (n) => meta.agentLabels[n] || n;

  return (
    <Modal size="wide" title="Yeni iş" onClose={onClose} footer={<>
      <span className="small muted grow">{selAgents.length} ajan çalışacak{makeDesigns ? ` · ${postCount} içerik × ${formats.length} boyut` : ''}. Harcanan token iş sayfasında adım adım görünür.</span>
      <button className="btn" onClick={onClose}>Vazgeç</button>
      <button className="btn primary lg" disabled={busy || !companyId} onClick={submit}>{busy ? <span className="spinner sm" /> : <Icon name="sparkles" />}İşi başlat</button>
    </>}>
      <div className="stack" style={{ gap: 18 }}>
        <div className="grid-2">
          <div className="field">
            <label>Marka</label>
            <select className="select" value={companyId} onChange={(e) => setCompanyId(e.target.value)}>
              {!companies.length && <option value="">Önce marka ekleyin</option>}
              {companies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          <div className="field">
            <label>Başlık</label>
            <input className="input" placeholder={autoTitle} value={title} onChange={(e) => setTitle(e.target.value)} />
          </div>
        </div>

        <div className="field">
          <label>İş türü</label>
          <div className="type-cards">
            {meta.jobTypes.map((x) => (
              <button key={x.id} className={`type-card ${x.id === type ? 'on' : ''}`} onClick={() => setType(x.id)}>
                <Icon name={x.icon} />
                <div><b>{x.label.split(' (')[0]}</b><span>{x.desc}</span></div>
              </button>
            ))}
          </div>
        </div>

        <div className="field">
          <label>Çalışacak ajanlar <span className="faint" style={{ fontWeight: 400 }}>· yalnızca bu işle ilgili olanlar; istemediğini kapat</span></label>
          <div className="row">
            {allowed.map((n) => (
              <label key={n} className={`chip ${selAgents.includes(n) ? 'on' : ''}`}>
                <input type="checkbox" checked={selAgents.includes(n)} onChange={() => toggle(selAgents, setAgentSel, n)} />
                {selAgents.includes(n) && <Icon name="check" size={13} />}{labelOf(n)}
              </label>
            ))}
          </div>
        </div>

        <div className="field">
          <label>İstekler</label>
          <textarea className="textarea" style={{ minHeight: 100 }} placeholder={t.quick ? 'ör. Yeni latte için 3 tasarım: biri carousel olsun, sıcak ve davetkâr' : 'ör. Kasımda yeni ürün lansmanı var, kampanya %20 indirim, ton samimi…'} value={request} onChange={(e) => setRequest(e.target.value)} />
        </div>

        <div className="grid-3">
          {type === 'sosyal-medya-aylik' && <div className="field"><label>Dönem</label><input className="input" value={month} onChange={(e) => setMonth(e.target.value)} /></div>}
          <div className="field" style={{ gridColumn: type === 'sosyal-medya-aylik' ? 'span 1' : 'span 2' }}>
            <label>Platformlar</label>
            <div className="row" style={{ gap: 6 }}>
              {PLATFORMS.map((p) => <label key={p} className={`chip ${platforms.includes(p) ? 'on' : ''}`}><input type="checkbox" checked={platforms.includes(p)} onChange={() => toggle(platforms, setPlatforms, p)} />{p}</label>)}
            </div>
          </div>
          {type === 'reklam-kampanyasi' && <div className="field"><label>Bütçe</label><input className="input" placeholder="ör. 50.000 TL" value={budget} onChange={(e) => setBudget(e.target.value)} /></div>}
        </div>

        <div className="card pad stack">
          <label className="check" style={{ fontWeight: 650 }}><input type="checkbox" checked={makeDesigns} onChange={(e) => setMakeDesigns(e.target.checked)} />Tasarım üret</label>
          {makeDesigns && (
            <>
              <div className="field">
                <label>Boyutlar <span className="faint" style={{ fontWeight: 400 }}>· her tasarım seçilen bütün boyutlarda üretilir</span></label>
                <div className="row">
                  {meta.formats.map((f) => (
                    <label key={f.id} className={`chip ${formats.includes(f.id) ? 'on' : ''}`}>
                      <input type="checkbox" checked={formats.includes(f.id)} onChange={() => toggle(formats, setFormats, f.id)} />
                      {formats.includes(f.id) && <Icon name="check" size={13} />}{f.label} <span className="faint">{f.w}×{f.h}</span>
                    </label>
                  ))}
                </div>
              </div>
              <div className="grid-3">
                <div className="field"><label>İçerik sayısı</label><input className="input" type="number" min="1" max="60" value={postCount} onChange={(e) => setPostCount(e.target.value)} /></div>
                <div className="field"><label>Bunlardan carousel</label><input className="input" type="number" min="0" max={postCount} value={carouselCount} onChange={(e) => setCarouselCount(e.target.value)} /></div>
                <div className="field"><label>Carousel slayt sayısı</label><input className="input" type="number" min="2" max="10" value={slideCount} disabled={!+carouselCount} onChange={(e) => setSlideCount(e.target.value)} /></div>
              </div>
              <div className="row">
                <label className="check"><input type="checkbox" checked={aiImages} disabled={!connected.length} onChange={(e) => setAiImages(e.target.checked)} />Her tasarıma AI görsel üret</label>
                {connected.length ? (
                  <select className="select" style={{ width: 220 }} value={imageProvider} disabled={!aiImages} onChange={(e) => setImageProvider(e.target.value)}>
                    {connected.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
                  </select>
                ) : <span className="small muted">Görsel motoru bağlı değil (<a href="#/ayarlar/entegrasyonlar" onClick={onClose}>Ayarlar → Entegrasyonlar</a>).</span>}
              </div>
            </>
          )}
        </div>

        <div className="grid-2">
          <div className="card pad stack">
            <label className="check" style={{ fontWeight: 650 }}><input type="checkbox" checked={useBrandProfile} onChange={(e) => setUseBrandProfile(e.target.checked)} />Marka profilini kullan</label>
            <span className="small muted">{company?.brandProfile?.text ? 'Ajanlar ve tasarımlar "Markayı Öğren" ile çıkarılan profile uyar.' : 'Bu marka henüz öğrenilmedi; marka sayfasındaki "Markayı Öğren" ile profili çıkarabilirsin.'}</span>
          </div>
          <div className="card pad stack">
            <label className="check" style={{ fontWeight: 650 }}><input type="checkbox" checked={useInspiration} onChange={(e) => setUseInspiration(e.target.checked)} />İlhamı kullan</label>
            <div className="row between">
              <span className="small muted">{insp.length ? `${insp.length} ilham görseli: promptları ve estetiği tasarımlara ve AI görsellere taşınır.` : 'İlham seçilmedi.'}</span>
              <button className="btn sm" disabled={!useInspiration} onClick={() => setPickInsp(true)}><Icon name="sparkles" />İlham Al</button>
            </div>
          </div>
        </div>

        {toolList.length > 0 && (
          <div className="field">
            <label>Prompt yazılacak dış araçlar <span className="faint" style={{ fontWeight: 400 }}>· her içerik için bu araçlara uygun prompt hazırlanır</span></label>
            <div className="row">
              {toolList.map((x) => <label key={x.id} className={`chip ${tools.includes(x.id) ? 'on' : ''}`}><input type="checkbox" checked={tools.includes(x.id)} onChange={() => toggle(tools, setTools, x.id)} />{x.name}</label>)}
            </div>
          </div>
        )}
      </div>
      {pickInsp && (
        <Modal size="wide" title="İlham Al" onClose={() => setPickInsp(false)} footer={<button className="btn primary" onClick={() => setPickInsp(false)}><Icon name="check" />Tamam ({insp.length})</button>}>
          <InspirationPicker selected={insp} onChange={setInspirationIds} max={24} />
        </Modal>
      )}
    </Modal>
  );
}
