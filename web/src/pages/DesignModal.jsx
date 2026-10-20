// Tasarım kartı ve detay penceresi: boyutlar (Post/Story…), carousel slaytları, PNG/SVG indirme, revizyon, geri alma, AI görsel, video.
import React, { useEffect, useState } from 'react';
import { api, on, download } from '../api.js';
import { useApp } from '../App.jsx';
import { Icon, Modal, AsyncButton, toast, copy } from '../ui.jsx';

const FMT_SHORT = { post: 'Post', kare: 'Kare', story: 'Story', linkedin: 'LinkedIn', yatay: 'Yatay' };
export const fmtShort = (k) => FMT_SHORT[k] || k;

const ver = (f) => `${f?.history?.length || 0}-${f?.svg?.length || 0}`;
export const frameUrl = (jobId, d, v, i, w) => `/api/jobs/${jobId}/designs/${d.id}/${v.key}/${i}.png?${w ? `w=${w}&` : ''}v=${ver(v.frames[i])}`;

export function DesignCard({ jobId, d, sub, onOpen }) {
  const v = d.variants.find((x) => x.frames[0]?.svg) || d.variants[0];
  const ready = v?.frames[0]?.svg;
  return (
    <div className="dcard" onClick={onOpen}>
      <div className="pv" style={{ aspectRatio: v ? `${v.width} / ${v.height}` : undefined, maxHeight: 360 }}>
        {ready ? <img src={frameUrl(jobId, d, v, 0, 480)} alt="" loading="lazy" />
          : <div className="shimmer">{v?.status === 'running' ? 'Tasarlanıyor…' : v?.status === 'error' ? 'Hata' : 'Sırada'}</div>}
        <div className="tags">
          {d.kind === 'carousel' && <span>Carousel · {v.frames.length}</span>}
          {d.variants.map((x) => <span key={x.key} style={x.status === 'running' ? { background: 'var(--warn)' } : undefined}>{fmtShort(x.key)}</span>)}
        </div>
      </div>
      <div className="info">
        <div style={{ fontWeight: 650, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>#{d.no} {d.gorsel_baslik || d.konu}</div>
        <div className="small muted">{[d.tarih, d.platform, sub].filter(Boolean).join(' · ')}</div>
      </div>
    </div>
  );
}

export function DesignModal({ jobId, designId, onClose, onNav }) {
  const { meta } = useApp();
  const [job, setJob] = useState(null);
  const [company, setCompany] = useState(null);
  const [vk, setVk] = useState(null);
  const [fi, setFi] = useState(0);
  const [fb, setFb] = useState('');
  const [allFrames, setAllFrames] = useState(true);
  const [aiPrompt, setAiPrompt] = useState(null);
  const [pickImg, setPickImg] = useState(false);
  useEffect(() => {
    api.get(`/api/jobs/${jobId}`).then((j) => { setJob(j); api.get(`/api/companies/${j.companyId}`).then(setCompany); });
    return on('job:update', (j) => j.id === jobId && setJob(j));
  }, [jobId]);
  const d = job?.designs.find((x) => x.id === designId);
  useEffect(() => { if (d && (!vk || !d.variants.some((v) => v.key === vk))) setVk(d.variants[0]?.key); }, [d?.id, d?.variants.length]);
  useEffect(() => setFi(0), [vk]);
  if (!job || !d) return <Modal title="Tasarım" onClose={onClose}><div className="spinner" /></Modal>;
  const v = d.variants.find((x) => x.key === vk) || d.variants[0];
  const f = v.frames[fi] || v.frames[0];
  const D = `/api/jobs/${jobId}/designs/${d.id}`;
  const running = v.status === 'running';
  const missing = meta.formats.filter((x) => !d.variants.some((y) => y.key === x.id));
  const hf = meta.providers.find((p) => p.id === 'higgsfield')?.connected;
  const aiOn = meta.providers.some((p) => p.connected);
  const images = (company?.files || []).filter((x) => x.role && x.designFile);
  const aiFile = d.aiImages?.[v.key] && company?.files.find((x) => x.id === d.aiImages[v.key]);

  const revise = async () => {
    await api.post(`${D}/revise`, { variant: v.key, frame: d.kind === 'carousel' && !allFrames ? fi : null, feedback: fb });
    setFb('');
    toast('Revizyon başladı');
  };

  const idx = onNav ? onNav.index : -1;
  return (
    <Modal size="wide" title={`#${d.no} ${d.gorsel_baslik || d.konu || 'Tasarım'}`} onClose={onClose} head={onNav && (
      <div className="row" style={{ gap: 4 }}>
        <button className="btn sm icon" disabled={idx <= 0} onClick={() => onNav.go(-1)}><Icon name="back" /></button>
        <span className="small muted">{idx + 1}/{onNav.total}</span>
        <button className="btn sm icon" disabled={idx >= onNav.total - 1} onClick={() => onNav.go(1)}><Icon name="chevron" /></button>
      </div>
    )}>
      <div className="design-modal">
        <div className="preview">
          <div className="row between">
            <div className="seg">
              {d.variants.map((x) => <button key={x.key} className={x.key === v.key ? 'on' : ''} onClick={() => setVk(x.key)}>{fmtShort(x.key)} <span className="faint">{x.width}×{x.height}</span>{x.status === 'running' && <span className="spinner sm" style={{ marginLeft: 6, display: 'inline-block', verticalAlign: -2 }} />}</button>)}
            </div>
            {missing.length > 0 && (
              <select className="select" style={{ width: 'auto' }} value="" onChange={async (e) => { if (!e.target.value) return; try { await api.post(`${D}/variant`, { format: e.target.value }); setVk(e.target.value); toast(`${fmtShort(e.target.value)} boyutu hazırlanıyor`); } catch (x) { toast(x.message, true); } }}>
                <option value="">+ Başka boyutta da üret</option>
                {missing.map((x) => <option key={x.id} value={x.id}>{x.label} · {x.w}×{x.h}</option>)}
              </select>
            )}
          </div>
          <div className="big checker" style={{ aspectRatio: `${v.width} / ${v.height}` }}>
            {f?.svg ? <img src={frameUrl(jobId, d, v, v.frames.indexOf(f), Math.min(1080, v.width))} alt="" /> : <div className="shimmer" style={{ minHeight: 300 }}>{running ? 'Tasarlanıyor…' : v.error || 'Henüz üretilmedi'}</div>}
          </div>
          {d.kind === 'carousel' && (
            <div className="frames">
              {v.frames.map((x, i) => (
                <button key={i} className={i === fi ? 'on' : ''} onClick={() => setFi(i)} title={`Slayt ${i + 1}`}>
                  {x.svg ? <img src={frameUrl(jobId, d, v, i, 160)} alt="" /> : <div className="shimmer" style={{ aspectRatio: `${v.width}/${v.height}` }}>{i + 1}</div>}
                </button>
              ))}
            </div>
          )}
          <div className="row">
            <a className="btn sm" href={`${D}/${v.key}/${v.frames.indexOf(f)}.png?dl=1`} aria-disabled={!f?.svg}><Icon name="download" />PNG</a>
            <a className="btn sm" href={`${D}/${v.key}/${v.frames.indexOf(f)}.svg?dl=1`}><Icon name="download" />SVG</a>
            {d.kind === 'carousel' && <button className="btn sm" onClick={() => v.frames.forEach((x, i) => x.svg && setTimeout(() => download(`${D}/${v.key}/${i}.png?dl=1`), i * 400))}><Icon name="download" />Tüm slaytlar</button>}
            {f?.history?.length > 0 && <AsyncButton className="btn sm" onClick={() => api.post(`${D}/undo`, { variant: v.key, frame: v.frames.indexOf(f) })}><Icon name="undo" />Geri al ({f.history.length})</AsyncButton>}
            {d.variants.length > 1 && <span className="small muted">Aynı tasarım {d.variants.length} boyutta</span>}
          </div>
          {v.error && <div className="err-box"><Icon name="alert" />{v.error}</div>}
        </div>

        <div className="stack">
          <div className="card pad stack">
            <h3>Revizyon</h3>
            <textarea className="textarea" placeholder="ör. Başlığı büyüt, logoyu sağ alta al, arka planı daha koyu yap" value={fb} onChange={(e) => setFb(e.target.value)} />
            {d.kind === 'carousel' && (
              <div className="seg" style={{ alignSelf: 'flex-start' }}>
                <button className={allFrames ? 'on' : ''} onClick={() => setAllFrames(true)}>Tüm slaytlar</button>
                <button className={!allFrames ? 'on' : ''} onClick={() => setAllFrames(false)}>Yalnızca slayt {fi + 1}</button>
              </div>
            )}
            <div className="row">
              <AsyncButton className="btn primary" disabled={running} onClick={revise}>{running ? <span className="spinner sm" /> : <Icon name="send" />}{fb.trim() ? 'Revize et' : f?.svg ? 'Yeniden tasarla' : 'Tasarla'}</AsyncButton>
              <span className="small muted">Geri bildirimler marka hafızasına işlenir.</span>
            </div>
          </div>

          {(aiOn || d.ai_gorsel_prompt) && (
            <div className="card pad stack">
              <div className="row between"><h3>AI görsel</h3>{aiFile && <a className="btn sm" href={aiFile.url} target="_blank" rel="noreferrer"><Icon name="eye" />Görseli aç</a>}</div>
              {aiFile && <img src={aiFile.url} alt="" style={{ width: 120, borderRadius: 8 }} />}
              {d.aiImageError && !aiFile && <div className="small" style={{ color: 'var(--danger, #d33)' }}>AI görsel üretilemedi, tasarım firma görselleriyle yapıldı: {d.aiImageError}</div>}
              <textarea className="textarea mono" style={{ minHeight: 90 }} value={aiPrompt ?? d.ai_gorsel_prompt ?? ''} onChange={(e) => setAiPrompt(e.target.value)} placeholder="İngilizce görsel promptu" />
              <div className="row">
                {aiOn ? <AsyncButton className="btn" onClick={async () => { await api.post(`${D}/ai-image`, { variant: v.key, prompt: aiPrompt ?? d.ai_gorsel_prompt }); toast('Yeni AI görsel üretiliyor; bitince "Yeniden tasarla" ile tasarıma yerleştir.'); }}><Icon name="wand" />Görseli yeniden üret</AsyncButton> : <span className="small muted">Görsel motoru bağlı değil (Ayarlar → Entegrasyonlar).</span>}
                <button className="btn sm ghost" onClick={() => copy(aiPrompt ?? d.ai_gorsel_prompt ?? '')}><Icon name="copy" />Kopyala</button>
              </div>
            </div>
          )}

          <div className="card pad stack">
            <div className="row between">
              <h3>Firma görselleri</h3>
              <button className="btn sm" onClick={() => setPickImg((x) => !x)}><Icon name="image" />{pickImg ? 'Kapat' : 'Seç'}</button>
            </div>
            {pickImg ? (
              images.length ? (
                <div className="img-grid" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(80px, 1fr))' }}>
                  {images.map((im) => {
                    const on2 = d.images?.includes(im.id);
                    return (
                      <div key={im.id} className={`img-card ${on2 ? 'selected' : ''}`} onClick={() => api.post(`${D}/images`, { ids: on2 ? d.images.filter((x) => x !== im.id) : [...(d.images || []), im.id] })}>
                        <div className="th"><img src={im.url} alt="" /></div>
                        {on2 && <div className="sel-mark"><Icon name="check" size={13} /></div>}
                      </div>
                    );
                  })}
                </div>
              ) : <span className="small muted">Markanın Dosyalar sekmesinde tasarım görseli yok.</span>
            ) : <span className="small muted">{d.images?.length ? `${d.images.length} görsel seçili; değişiklikten sonra "Yeniden tasarla".` : 'Bu tasarım için özel görsel seçilmedi.'}</span>}
          </div>

          {hf && (
            <div className="card pad stack">
              <h3>Higgsfield video</h3>
              <span className="small muted">Bu tasarımı kısa bir hareketli videoya çevirir; hazır olunca markanın Dosyalar sekmesine eklenir.</span>
              <AsyncButton className="btn" disabled={!f?.svg} onClick={async () => { await api.post(`${D}/video`, { variant: v.key }); toast('Video üretimi başladı'); }}><Icon name="film" />Videoya çevir</AsyncButton>
              {d.videos?.length > 0 && <span className="small">{d.videos.length} video üretildi</span>}
            </div>
          )}

          <div className="card pad stack">
            <h3>İçerik</h3>
            {[['Tarih', [d.tarih, d.gun, d.yayin_saati].filter(Boolean).join(' · ')], ['Platform', d.platform], ['Konu', d.konu], ['Görsel fikri', d.gorsel_fikri], ['CTA', d.cta]].filter(([, x]) => x).map(([k, x]) => (
              <div key={k} className="info-block"><span className="k">{k}</span><span className="v">{x}</span></div>
            ))}
            {d.slaytlar?.length > 0 && <div className="info-block"><span className="k">Slaytlar</span>{d.slaytlar.map((s, i) => <span key={i} className="v small">{i + 1}. <b>{s.baslik}</b> {s.metin}</span>)}</div>}
            {d.aciklama && (
              <div className="info-block">
                <span className="k row between">Paylaşım metni<button className="btn sm ghost" onClick={() => copy(`${d.aciklama}\n\n${(d.hashtagler || []).join(' ')}`)}><Icon name="copy" />Kopyala</button></span>
                <span className="v">{d.aciklama}</span>
                {d.hashtagler?.length > 0 && <span className="v" style={{ color: 'var(--accent)' }}>{d.hashtagler.join(' ')}</span>}
              </div>
            )}
            {Object.entries(d.arac_promptlari || {}).map(([t, p]) => (
              <div key={t} className="info-block"><span className="k row between">{t} promptu<button className="btn sm ghost" onClick={() => copy(p)}><Icon name="copy" /></button></span><div className="prompt-box">{p}</div></div>
            ))}
          </div>
        </div>
      </div>
    </Modal>
  );
}
