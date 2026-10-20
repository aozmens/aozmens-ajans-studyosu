// Ayarlar: Claude bağlantısı ve modeller, görsel/video entegrasyonları, görünüm, genel, yedek ve sürüm.
import React, { useState } from 'react';
import { api, download, readAsDataUrl } from '../api.js';
import { useApp, go } from '../App.jsx';
import { Icon, AsyncButton, FilePick, toast } from '../ui.jsx';

const MODELS = [['claude-opus-5-5', 'Claude Opus 5.5 (en güçlü)'], ['claude-sonnet-5-5', 'Claude Sonnet 5.5 (hızlı, dengeli)'], ['claude-haiku-5-5', 'Claude Haiku 5.5 (en ucuz)'], ['claude-fable-5-1', 'Claude Fable 5.1']];
const EFFORTS = [['low', 'Düşük'], ['medium', 'Orta (önerilen)'], ['high', 'Yüksek'], ['xhigh', 'Çok yüksek'], ['max', 'En yüksek']];
const SECTIONS = [['claude', 'Claude', 'brain'], ['entegrasyonlar', 'Entegrasyonlar', 'link'], ['gorunum', 'Görünüm', 'sun'], ['genel', 'Genel ve yedek', 'settings']];

const PROV_FIELDS = {
  clipdrop: [['apiKey', 'API anahtarı', true]],
  fal: [['apiKey', 'API anahtarı (FAL_KEY)', true], ['model', 'Model', false, 'fal-ai/flux-pro/v1.1-ultra']],
  openai: [['apiKey', 'API anahtarı', true], ['model', 'Model', false, 'gpt-image-2.5']],
  gemini: [['apiKey', 'API anahtarı', true], ['model', 'Model', false, 'gemini-2.5-flash-image']],
  higgsfield: [['keyId', 'API Key ID', true], ['secret', 'API Key Secret', true], ['imageModel', 'Görsel modeli', false, 'higgsfield-ai/soul/v2/standard'], ['videoModel', 'Video modeli (görselden video)', false, 'ör. higgsfield-ai/dop/standard'], ['extra', 'Ek parametreler (JSON)', false, '{"resolution":"720p"}']],
};
const PROV_HELP = {
  clipdrop: 'clipdrop.co/apis → API key. Metinden görsel, arka plan silme ve büyütme.',
  fal: 'fal.ai/dashboard/keys. Flux Pro Ultra ile fotoğraf gerçekçiliğinde görseller.',
  openai: 'platform.openai.com/api-keys. Varsayılan model gpt-image-2.5; ürün ve logo görselleri referans olarak gider.',
  gemini: 'aistudio.google.com/apikey. Nano Banana; ilham görsellerini referans olarak da kullanır.',
  higgsfield: 'cloud.higgsfield.ai → API keys. Görsel ve görselden video (Reels).',
};

export default function Settings({ section = 'claude' }) {
  const { settings, setSettings, meta, loadMeta } = useApp();
  const [s, setS] = useState(settings);
  const [dirty, setDirty] = useState(false);
  const set = (patch) => { setS((x) => ({ ...x, ...patch })); setDirty(true); };
  const setInt = (name, patch) => set({ integrations: { ...s.integrations, [name]: { ...s.integrations[name], ...patch } } });
  const save = async () => {
    const next = await api.put('/api/settings', s);
    setSettings(next);
    setS(next);
    setDirty(false);
    loadMeta();
    toast('Ayarlar kaydedildi');
  };
  return (
    <div className="page">
      <div className="hello">
        <div><h1 className="title">Ayarlar</h1><p className="sub">Anahtarlar sunucuda saklanır. Railway'de ortam değişkeni olarak girersen burada "ortam değişkeninden" görünür.</p></div>
        <AsyncButton className="btn primary" disabled={!dirty} onClick={save}><Icon name="check" />Kaydet</AsyncButton>
      </div>
      <div className="settings-grid">
        <div className="settings-nav">
          {SECTIONS.map(([k, l, i]) => <button key={k} className={`nav-item ${section === k ? 'active' : ''}`} onClick={() => go(`ayarlar/${k}`)}><Icon name={i} />{l}</button>)}
        </div>
        <div className="stack" style={{ gap: 16 }}>
          {section === 'claude' && (
            <>
              <div className="card pad stack">
                <h3>Claude API</h3>
                <div className="field">
                  <label>API anahtarı</label>
                  <input className="input mono" type="password" placeholder="sk-ant-…" value={s.apiKey || ''} onChange={(e) => set({ apiKey: e.target.value })} />
                  <span className="hint">{s.apiKeyFromEnv ? 'ANTHROPIC_API_KEY ortam değişkeninden okunuyor.' : 'console.anthropic.com → API Keys'}</span>
                </div>
                <div className="field"><label>API adresi (isteğe bağlı)</label><input className="input mono" placeholder="https://api.anthropic.com" value={s.baseUrl || ''} onChange={(e) => set({ baseUrl: e.target.value })} /></div>
                <div className="row"><AsyncButton className="btn" onClick={async () => { if (dirty) await save(); const r = await api.post('/api/settings/test'); toast(`Claude: ${r.text}`); }}><Icon name="zap" />Bağlantıyı test et</AsyncButton></div>
              </div>
              <div className="card pad stack">
                <h3>Modeller</h3>
                <div className="grid-2">
                  <div className="field"><label>Ajanlar (strateji, metin, plan)</label><select className="select" value={s.model} onChange={(e) => set({ model: e.target.value })}>{MODELS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></div>
                  <div className="field"><label>Tasarım ve logo (SVG)</label><select className="select" value={s.designModel} onChange={(e) => set({ designModel: e.target.value })}>{MODELS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></div>
                  <div className="field"><label>Düşünme eforu</label><select className="select" value={s.effort} onChange={(e) => set({ effort: e.target.value })}>{EFFORTS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select><span className="hint">Yüksek efor daha kaliteli ama daha çok token harcar.</span></div>
                  <div className="field"><label>Aynı anda tasarım</label><input className="input" type="number" min="1" max="6" value={s.concurrency} onChange={(e) => set({ concurrency: +e.target.value })} /></div>
                  <div className="field"><label>Tasarım kalite turu</label><select className="select" value={s.designQa} onChange={(e) => set({ designQa: +e.target.value })}><option value={0}>Kapalı (ucuz)</option><option value={1}>1 tur (önerilen)</option><option value={2}>2 tur</option></select><span className="hint">Tasarım çizilip Claude'a gösterilir, taşma ve okunurluk düzeltilir.</span></div>
                  <div className="field"><label>&nbsp;</label><label className="check"><input type="checkbox" checked={s.fallbacks} onChange={(e) => set({ fallbacks: e.target.checked })} />Reddedilirse yedek modelle devam et</label></div>
                </div>
              </div>
            </>
          )}
          {section === 'entegrasyonlar' && (
            <>
              <div className="card pad stack">
                <h3>Varsayılan görsel motoru</h3>
                <select className="select" style={{ maxWidth: 320 }} value={s.imageProvider || ''} onChange={(e) => set({ imageProvider: e.target.value })}>
                  <option value="">İlk bağlı olan</option>
                  {meta.providers.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
                </select>
              </div>
              {meta.providers.map((p) => (
                <div key={p.id} className="card pad stack">
                  <div className="row between">
                    <div><h3>{p.label}</h3><div className="small muted">{PROV_HELP[p.id]}</div></div>
                    <div className="row">
                      <span className={`badge ${p.connected ? 'done' : ''}`}>{p.connected ? 'Bağlı' : 'Bağlı değil'}</span>
                      <AsyncButton className="btn sm" onClick={async () => { if (dirty) await save(); const r = await api.post(`/api/integrations/${p.id}/test`); toast(`${p.label}: ${r.text}`); }}>Test et</AsyncButton>
                    </div>
                  </div>
                  <div className="grid-2">
                    {PROV_FIELDS[p.id].map(([k, l, secret, ph]) => (
                      <div key={k} className="field">
                        <label>{l}</label>
                        <input className="input mono" type={secret ? 'password' : 'text'} placeholder={ph} value={s.integrations[p.id]?.[k] || ''} onChange={(e) => setInt(p.id, { [k]: e.target.value })} />
                        {s.integrations[p.id]?.[k + 'FromEnv'] && <span className="hint">Ortam değişkeninden okunuyor.</span>}
                      </div>
                    ))}
                  </div>
                </div>
              ))}
              <p className="small muted">Bağladıktan sonra Ajan ekibi'nden hangi ajanın hangi araca bağlı olduğunu seçebilirsin.</p>
            </>
          )}
          {section === 'gorunum' && (
            <div className="card pad stack">
              <h3>Tema</h3>
              <div className="seg" style={{ alignSelf: 'flex-start' }}>
                {[['system', 'Sistem'], ['light', 'Açık'], ['dark', 'Koyu']].map(([k, l]) => <button key={k} className={s.theme === k ? 'on' : ''} onClick={async () => { const n = await api.put('/api/settings', { theme: k }); setSettings(n); setS((x) => ({ ...x, theme: k })); }}>{l}</button>)}
              </div>
            </div>
          )}
          {section === 'genel' && (
            <>
              <div className="card pad stack">
                <h3>Ajans</h3>
                <div className="field"><label>Ajans adı</label><input className="input" value={s.agencyName} onChange={(e) => set({ agencyName: e.target.value })} /></div>
                <span className="small muted">Marka dosyası ve tasarım dili PDF'lerinin son sayfasında logo, iletişim bilgileri ve "© {new Date().getFullYear()} {s.agencyName}. All Rights Reserved." yer alır.</span>
                <div className="grid-2">
                  <div className="field"><label>Web sitesi</label><input className="input" placeholder="agent-cy.com" value={s.agencyWebsite || ''} onChange={(e) => set({ agencyWebsite: e.target.value })} /></div>
                  <div className="field"><label>E-posta</label><input className="input" placeholder="info@agent-cy.com" value={s.agencyEmail || ''} onChange={(e) => set({ agencyEmail: e.target.value })} /></div>
                  <div className="field"><label>Telefon</label><input className="input" value={s.agencyPhone || ''} onChange={(e) => set({ agencyPhone: e.target.value })} /></div>
                  <div className="field"><label>Adres</label><input className="input" value={s.agencyAddress || ''} onChange={(e) => set({ agencyAddress: e.target.value })} /></div>
                </div>
                <div className="row">
                  <div className="logo-sq" style={{ width: 120, height: 48, background: '#111' }}><img src={s.agencyLogo ? `/api/settings/agency-logo.png?v=${encodeURIComponent(s.agencyLogo)}` : '/agent-cy-logo.png'} alt="" style={{ objectFit: 'contain' }} /></div>
                  <FilePick className="btn sm" accept="image/*,.svg" onFiles={async ([f]) => { const n = await api.post('/api/settings/agency-logo', { dataUrl: await readAsDataUrl(f) }); setSettings(n); setS(n); toast('Ajans logosu kaydedildi'); }}><Icon name="upload" />PDF'ler için logo yükle</FilePick>
                  {s.agencyLogo && <AsyncButton className="btn sm ghost" onClick={async () => { const n = await api.post('/api/settings/agency-logo', {}); setSettings(n); setS(n); }}>Agent-cy logosuna dön</AsyncButton>}
                  <span className="small muted">Koyu zemin üzerinde durur; açık renk ya da şeffaf zeminli logo önerilir.</span>
                </div>
              </div>
              <div className="card pad stack">
                <h3>Yedek</h3>
                <span className="small muted">Bütün veriler (markalar, işler, tasarımlar, ilham arşivi, dosyalar) tek ZIP olarak iner. Kod GitHub'da; veriler sunucunun kalıcı diskinde durur.</span>
                <button className="btn" style={{ alignSelf: 'flex-start' }} onClick={() => download('/api/backup.zip')}><Icon name="download" />Yedeği indir</button>
              </div>
              <div className="card pad stack">
                <h3>Sürüm</h3>
                <span className="small muted">Agent-cy {meta.version}{meta.commit ? ` · ${meta.commit}` : ''}. GitHub'daki main dalına gelen her değişiklik sunucuya otomatik yüklenir.</span>
                <button className="btn" style={{ alignSelf: 'flex-start' }} onClick={async () => { await api.post('/api/logout'); location.reload(); }}><Icon name="logout" />Çıkış yap</button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
