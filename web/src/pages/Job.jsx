// İş sayfası: akış (adım başına token ve maliyet), ajan çıktıları ve eğitim, tasarımlar, içerik takvimi, klasör olarak dışa aktarma.
import React, { useEffect, useRef, useState } from 'react';
import { api, on, download } from '../api.js';
import { useApp, go } from '../App.jsx';
import {
  Icon, Markdown, Modal, Empty, AsyncButton, StatusBadge, UsageLine, Avatar,
  fmtTok, fmtCost, fmtNum, totalTokens, totalCost, timeAgo, toast, confirmAsk, copy,
} from '../ui.jsx';
import { DesignCard, DesignModal, fmtShort, frameUrl } from './DesignModal.jsx';

const KIND_TR = { website: 'Web sitesi', plan: 'Plan', agent: 'Ajan', designList: 'İçerik listesi', designs: 'Tasarım', learn: 'Öğrenme', followup: 'Ek talep' };

export default function Job({ id }) {
  const { meta, company: getCompany } = useApp();
  const [job, setJob] = useState(null);
  const [err, setErr] = useState('');
  const [tab, setTab] = useState('akis');
  const [streams, setStreams] = useState({});
  const [openStep, setOpenStep] = useState(null);
  const [design, setDesign] = useState(null);
  const [train, setTrain] = useState(null);
  const [msg, setMsg] = useState('');
  const [usageOpen, setUsageOpen] = useState(false);

  useEffect(() => {
    api.get(`/api/jobs/${id}`).then(setJob).catch((e) => setErr(e.message));
    const a = on('job:update', (j) => j.id === id && setJob(j));
    const b = on('job:stream', (s) => s.jobId === id && setStreams((m) => ({ ...m, [s.stepId]: (m[s.stepId] || '') + s.text })));
    return () => { a(); b(); };
  }, [id]);
  useEffect(() => {
    if (!job) return;
    const r = job.steps.find((s) => s.status === 'running');
    if (r && tab === 'akis') setOpenStep(r.id);
  }, [job?.steps.map((s) => s.status).join()]);

  if (err) return <div className="page"><div className="err-box"><Icon name="alert" />{err}</div></div>;
  if (!job) return <div className="page"><div className="spinner" /></div>;
  const c = getCompany(job.companyId);
  const t = meta.jobTypes.find((x) => x.id === job.type);
  const running = job.status === 'running';
  const units = job.designs.flatMap((d) => d.variants);
  const doneUnits = units.filter((v) => v.status === 'done').length;
  const outputs = job.steps.filter((s) => (s.kind === 'agent' || s.kind === 'followup' || s.kind === 'plan') && s.output);
  const o = job.options || {};

  return (
    <div className="page">
      <div className="job-head">
        <Avatar name={c?.name || '?'} size={48} />
        <div className="grow">
          <h1 className="title" style={{ fontSize: 23 }}>{job.title}</h1>
          <div className="row muted small" style={{ marginTop: 4 }}>
            <span>{c && <a href={`#/marka/${c.id}`}>{c.name}</a>}</span><span>·</span><span>{t?.label}</span><span>·</span><span>{timeAgo(job.createdAt)}</span>
            {o.formats?.length > 0 && o.makeDesigns && <span>· {o.formats.map(fmtShort).join(' + ')}</span>}
            {o.carouselCount > 0 && <span>· {o.carouselCount} carousel</span>}
            {o.useBrandProfile !== false && c?.brandProfile?.text && <span className="badge accent plain" style={{ height: 20 }}>Marka profili</span>}
            {o.useInspiration !== false && (o.inspirationIds?.length || c?.inspirationIds?.length) ? <span className="badge accent plain" style={{ height: 20 }}>İlham</span> : null}
          </div>
        </div>
        <div className="row">
          <StatusBadge status={job.status} running={running} />
          {running ? <AsyncButton className="btn" onClick={() => api.post(`/api/jobs/${id}/cancel`)}><Icon name="stop" />Durdur</AsyncButton>
            : job.status !== 'done' && <AsyncButton className="btn" onClick={() => api.post(`/api/jobs/${id}/resume`)}><Icon name="refresh" />Kaldığı yerden devam</AsyncButton>}
          <div className="row" style={{ gap: 0 }}>
            <button className="btn" style={{ borderRadius: '9px 0 0 9px' }} onClick={() => download(`/api/jobs/${id}/export.zip`)}><Icon name="download" />Klasör (ZIP)</button>
            <button className="btn" style={{ borderRadius: '0 9px 9px 0', marginLeft: -1 }} disabled={!job.designs.length} title="Yalnızca tasarımlar, boyut klasörlerinde" onClick={() => download(`/api/jobs/${id}/export.zip?only=designs`)}>Tasarımlar</button>
            <AsyncButton className="btn" style={{ marginLeft: 6 }} title="Markanın 09 İşler klasörüne yaz" onClick={async () => { const r = await api.post(`/api/jobs/${id}/save-to-folder`); toast(`Klasöre kaydedildi: ${r.folder}`); }}><Icon name="folder" />Klasöre kaydet</AsyncButton>
          </div>
          {!running && <button className="btn ghost danger icon" title="İşi sil" onClick={async () => { if (confirmAsk('İş silinsin mi?')) { await api.del(`/api/jobs/${id}`); go(c ? `marka/${c.id}/isler` : ''); } }}><Icon name="trash" /></button>}
        </div>
      </div>

      <div className="card pad row between" style={{ marginBottom: 16, cursor: 'pointer' }} onClick={() => setUsageOpen(true)} title="Ayrıntı için tıkla">
        <div className="row" style={{ gap: 22 }}>
          <div><div className="small muted">Toplam token</div><div style={{ fontSize: 20, fontWeight: 750 }}>{fmtNum(totalTokens(job.usage))}</div></div>
          <div><div className="small muted">Girdi / çıktı</div><div style={{ fontWeight: 650 }}>{fmtTok(job.usage?.input)} / {fmtTok(job.usage?.output)}</div></div>
          <div><div className="small muted">Önbellekten</div><div style={{ fontWeight: 650 }}>{fmtTok(job.usage?.cacheRead)}</div></div>
          {job.usage?.images ? <div><div className="small muted">AI görsel</div><div style={{ fontWeight: 650 }}>{job.usage.images}</div></div> : null}
          <div><div className="small muted">Yaklaşık maliyet</div><div style={{ fontSize: 20, fontWeight: 750 }}>{fmtCost(totalCost(job.usage))}</div></div>
        </div>
        {units.length > 0 && (
          <div style={{ width: 240 }}>
            <div className="row between small muted"><span>Tasarımlar</span><span>{doneUnits}/{units.length}</span></div>
            <div className="progress" style={{ marginTop: 6 }}><div style={{ width: `${(doneUnits / units.length) * 100}%` }} /></div>
          </div>
        )}
      </div>

      {job.error && <div className="err-box" style={{ marginBottom: 14 }}><Icon name="alert" /><div>{job.error}<div className="small muted">"Kaldığı yerden devam" ile hatalı adımdan sürdürebilirsin.</div></div></div>}

      <div className="tabs">
        {[['akis', 'Akış', 'layers'], ['ciktilar', 'Çıktılar', 'file', outputs.length], ['tasarimlar', 'Tasarımlar', 'image', job.designs.length], ['takvim', 'İçerik takvimi', 'calendar', job.designs.length]].map(([k, l, i, n]) => (
          (k === 'tasarimlar' || k === 'takvim') && !job.designs.length ? null
            : <button key={k} className={`tab ${tab === k ? 'on' : ''}`} onClick={() => setTab(k)}><Icon name={i} size={15} />{l}{n ? <span className="cnt">{n}</span> : null}</button>
        ))}
      </div>

      {tab === 'akis' && (
        <div className="job-grid">
          <div className="card flow">
            {job.steps.map((s) => (
              <div key={s.id} className={`flow-step ${s.status === 'running' ? 'running' : ''}`} onClick={() => setOpenStep(s.id)}>
                <StepIcon s={s} />
                <div className="grow" style={{ minWidth: 0 }}>
                  <div className="t">{s.title}</div>
                  <div className="a">{s.agentLabel}</div>
                  {totalTokens(s.usage) > 0 && <div className="tok">{fmtTok(totalTokens(s.usage))} token · {fmtCost(totalCost(s.usage))}</div>}
                </div>
              </div>
            ))}
            {!running && (
              <div style={{ borderTop: '1px solid var(--line)', marginTop: 10, paddingTop: 10 }} className="stack">
                <textarea className="textarea" style={{ minHeight: 60 }} placeholder="Bu işe ek talep yaz (ör. takvime 2 Reels ekle)" value={msg} onChange={(e) => setMsg(e.target.value)} />
                <AsyncButton className="btn sm primary" disabled={!msg.trim()} onClick={async () => { await api.post(`/api/jobs/${id}/followup`, { message: msg }); setMsg(''); }}><Icon name="send" />Gönder</AsyncButton>
              </div>
            )}
          </div>
          <div>
            {job.steps.map((s) => (
              <StepCard key={s.id} s={s} job={job} open={openStep === s.id} toggle={() => setOpenStep(openStep === s.id ? null : s.id)} stream={streams[s.id]} onTrain={() => setTrain(s)} onDesigns={() => setTab('tasarimlar')} />
            ))}
          </div>
        </div>
      )}

      {tab === 'ciktilar' && (
        outputs.length ? outputs.map((s) => (
          <div key={s.id} className="card pad" style={{ marginBottom: 14 }}>
            <div className="row between" style={{ marginBottom: 10 }}>
              <div className="row"><Avatar name={s.agent} label={s.agentLabel} /><div><b>{s.title}</b><div className="small muted">{s.agentLabel}</div></div></div>
              <div className="row">
                <UsageLine usage={s.usage} compact />
                <button className="btn sm" onClick={() => copy(s.output)}><Icon name="copy" />Kopyala</button>
                {s.agent !== 'program' && <button className="btn sm" onClick={() => setTrain(s)}><Icon name="graduation" />Ajanı eğit</button>}
              </div>
            </div>
            <Markdown text={s.output} />
          </div>
        )) : <Empty icon="file" title="Henüz çıktı yok">Ajanlar çalıştıkça çıktılar burada toplanır.</Empty>
      )}

      {tab === 'tasarimlar' && <Gallery job={job} open={setDesign} />}
      {tab === 'takvim' && <Calendar job={job} open={setDesign} />}

      {design && (() => {
        const i = job.designs.findIndex((x) => x.id === design);
        return <DesignModal jobId={id} designId={design} onClose={() => setDesign(null)} onNav={{ index: i, total: job.designs.length, go: (d) => setDesign(job.designs[i + d]?.id || design) }} />;
      })()}
      {train && <TrainModal step={train} job={job} onClose={() => setTrain(null)} />}
      {usageOpen && <UsageModal job={job} onClose={() => setUsageOpen(false)} />}
    </div>
  );
}

function StepIcon({ s }) {
  if (s.status === 'running') return <div className="avatar" style={{ background: 'var(--warn)' }}><span className="spinner sm" style={{ borderColor: 'rgba(255,255,255,.4)', borderTopColor: '#fff' }} /></div>;
  if (s.status === 'done') return <div className="avatar" style={{ background: 'var(--ok)' }}><Icon name="check" size={15} /></div>;
  if (s.status === 'error') return <div className="avatar" style={{ background: 'var(--err)' }}><Icon name="alert" size={15} /></div>;
  if (s.status === 'skipped') return <div className="avatar" style={{ background: 'var(--faint)' }}><Icon name="chevron" size={15} /></div>;
  return <div className="avatar" style={{ background: 'var(--surface-3)', color: 'var(--muted)' }}>{KIND_TR[s.kind]?.[0] || '•'}</div>;
}

function StepCard({ s, job, open, toggle, stream, onTrain, onDesigns }) {
  const ref = useRef();
  const text = s.status === 'running' ? (stream || s.output || '') : s.output;
  useEffect(() => { if (ref.current && s.status === 'running') ref.current.scrollTop = ref.current.scrollHeight; }, [text]);
  const designsStep = s.kind === 'designs';
  return (
    <div className="card step-card">
      <div className="hd" onClick={toggle}>
        <StepIcon s={s} />
        <div className="grow">
          <b>{s.title}</b>
          <div className="small muted">{s.agentLabel}{s.task ? ` · ${s.task.slice(0, 110)}${s.task.length > 110 ? '…' : ''}` : ''}</div>
        </div>
        <UsageLine usage={s.usage} compact />
        <StatusBadge status={s.status} />
        <Icon name={open ? 'chevronDown' : 'chevron'} />
      </div>
      {open && (
        <div className="bd stack">
          {s.userMessage && <div className="note-box"><Icon name="message" /><div>{s.userMessage}</div></div>}
          {s.error && <div className="err-box"><Icon name="alert" />{s.error}</div>}
          {designsStep && job.designs.length > 0 && (
            <div className="stack">
              <div className="row between"><span className="small muted">{job.designs.flatMap((d) => d.variants).filter((v) => v.status === 'done').length}/{job.designs.flatMap((d) => d.variants).length} tasarım hazır</span><button className="btn sm" onClick={onDesigns}><Icon name="image" />Tasarımları gör</button></div>
              <div className="row" style={{ gap: 6 }}>
                {job.designs.slice(0, 12).map((d) => {
                  const v = d.variants.find((x) => x.frames[0]?.svg);
                  return v ? <img key={d.id} src={frameUrl(job.id, d, v, 0, 120)} alt="" style={{ width: 54, borderRadius: 6 }} /> : <div key={d.id} className="shimmer" style={{ width: 54, height: 68, borderRadius: 6 }} />;
                })}
              </div>
            </div>
          )}
          {text ? (s.status === 'running' ? <div className="stream" ref={ref}>{text}</div> : <Markdown text={text} />) : !designsStep && <span className="small muted">{s.status === 'pending' ? 'Sırada bekliyor.' : 'Çıktı yok.'}</span>}
          {s.usage && <UsageLine usage={s.usage} />}
          {s.status === 'done' && (s.kind === 'agent' || s.kind === 'followup' || s.kind === 'designList') && s.agent !== 'program' && (
            <div className="row"><button className="btn sm" onClick={onTrain}><Icon name="graduation" />{s.agentLabel} ajanını eğit</button></div>
          )}
        </div>
      )}
    </div>
  );
}

function Gallery({ job, open }) {
  const [filter, setFilter] = useState('');
  const keys = [...new Set(job.designs.flatMap((d) => d.variants.map((v) => v.key)))];
  const shown = job.designs.filter((d) => !filter || (filter === 'carousel' ? d.kind === 'carousel' : d.variants.some((v) => v.key === filter)));
  return (
    <div className="stack">
      <div className="row between">
        <div className="seg">
          <button className={!filter ? 'on' : ''} onClick={() => setFilter('')}>Hepsi</button>
          {keys.map((k) => <button key={k} className={filter === k ? 'on' : ''} onClick={() => setFilter(k)}>{fmtShort(k)}</button>)}
          {job.designs.some((d) => d.kind === 'carousel') && <button className={filter === 'carousel' ? 'on' : ''} onClick={() => setFilter('carousel')}>Carousel</button>}
        </div>
        <button className="btn" onClick={() => download(`/api/jobs/${job.id}/export.zip?only=designs`)}><Icon name="download" />Tasarım klasörünü indir</button>
      </div>
      <div className="gallery">{shown.map((d) => <DesignCard key={d.id} jobId={job.id} d={d} onOpen={() => open(d.id)} />)}</div>
    </div>
  );
}

function Calendar({ job, open }) {
  return (
    <div className="stack">
      <div className="row end"><button className="btn" onClick={() => download(`/api/jobs/${job.id}/calendar.csv`)}><Icon name="download" />Excel (CSV)</button></div>
      <div className="card" style={{ overflow: 'auto' }}>
        <table className="cal">
          <thead><tr><th></th><th>Tarih</th><th>Platform</th><th>Format</th><th>Konu / başlık</th><th>Paylaşım metni</th></tr></thead>
          <tbody>
            {job.designs.map((d) => {
              const v = d.variants.find((x) => x.frames[0]?.svg);
              return (
                <tr key={d.id} onClick={() => open(d.id)}>
                  <td>{v ? <img src={frameUrl(job.id, d, v, 0, 160)} alt="" /> : <div className="shimmer" style={{ width: 64, height: 80, borderRadius: 6 }} />}</td>
                  <td style={{ whiteSpace: 'nowrap' }}><b>{d.tarih}</b><div className="small muted">{d.gun} {d.yayin_saati}</div></td>
                  <td>{d.platform}</td>
                  <td>{d.kind === 'carousel' ? `Carousel (${d.slaytlar?.length})` : d.variants.map((x) => fmtShort(x.key)).join(' + ')}</td>
                  <td><b>{d.gorsel_baslik}</b><div className="small muted">{d.konu}</div></td>
                  <td className="small" style={{ maxWidth: 380 }}>{d.aciklama}<div style={{ color: 'var(--accent)' }}>{(d.hashtagler || []).join(' ')}</div></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function TrainModal({ step, job, onClose }) {
  const [fb, setFb] = useState('');
  const [res, setRes] = useState(null);
  return (
    <Modal title={`${step.agentLabel} ajanını eğit`} onClose={onClose} footer={res ? <>
      <button className="btn" onClick={() => go(`ajanlar/${step.agent}`)}>Ajanın direktiflerine git</button>
      <button className="btn primary" onClick={onClose}>Tamam</button>
    </> : <>
      <button className="btn" onClick={onClose}>Vazgeç</button>
      <AsyncButton className="btn primary" disabled={!fb.trim()} busyText="Direktife çevriliyor…" onClick={async () => setRes(await api.post(`/api/agents/${step.agent}/train`, { feedback: fb, jobId: job.id, stepId: step.id }))}><Icon name="graduation" />Eğit</AsyncButton>
    </>}>
      {res ? (
        <div className="stack">
          <div className="note-box"><Icon name="check" /><div>{res.added.length ? 'Ajan bundan sonraki bütün işlerde şu direktiflere uyacak:' : 'Bu geri bildirim mevcut direktiflerle zaten karşılanıyor; yeni direktif eklenmedi.'}</div></div>
          {res.added.map((x, i) => <div key={i} className="card pad">{x}</div>)}
          <UsageLine usage={res.usage} />
        </div>
      ) : (
        <div className="stack">
          <p className="muted" style={{ margin: 0 }}>Bu çıktıda neyi beğenmedin? Geri bildirimin kalıcı direktiflere çevrilir; ajan sonraki üretimlerde buna dikkat eder (yalnızca bu marka için değil, her işte).</p>
          <textarea className="textarea" autoFocus style={{ minHeight: 120 }} placeholder="ör. Gereksiz uzun kod yazıyorsun, kullanılmayan fonksiyonlar ekleme. / Paylaşım metinleri çok uzun, en fazla 3 cümle olsun." value={fb} onChange={(e) => setFb(e.target.value)} />
        </div>
      )}
    </Modal>
  );
}

function UsageModal({ job, onClose }) {
  const rows = job.steps.filter((s) => totalTokens(s.usage) > 0 || s.usage?.images);
  return (
    <Modal title="Bu işin token kullanımı" onClose={onClose}>
      <table className="cal">
        <thead><tr><th>Adım</th><th>Ajan</th><th style={{ textAlign: 'right' }}>Girdi</th><th style={{ textAlign: 'right' }}>Çıktı</th><th style={{ textAlign: 'right' }}>Önbellek</th><th style={{ textAlign: 'right' }}>Görsel</th><th style={{ textAlign: 'right' }}>Maliyet</th></tr></thead>
        <tbody>
          {rows.map((s) => (
            <tr key={s.id} style={{ cursor: 'default' }}>
              <td>{s.title}</td><td className="muted">{s.agentLabel}</td>
              <td style={{ textAlign: 'right' }}>{fmtNum(s.usage.input)}</td><td style={{ textAlign: 'right' }}>{fmtNum(s.usage.output)}</td>
              <td style={{ textAlign: 'right' }}>{fmtNum((s.usage.cacheRead || 0) + (s.usage.cacheWrite || 0))}</td>
              <td style={{ textAlign: 'right' }}>{s.usage.images || ''}</td>
              <td style={{ textAlign: 'right' }}><b>{fmtCost(totalCost(s.usage))}</b></td>
            </tr>
          ))}
          <tr style={{ cursor: 'default' }}>
            <td><b>Toplam</b></td><td />
            <td style={{ textAlign: 'right' }}><b>{fmtNum(job.usage?.input)}</b></td><td style={{ textAlign: 'right' }}><b>{fmtNum(job.usage?.output)}</b></td>
            <td style={{ textAlign: 'right' }}><b>{fmtNum((job.usage?.cacheRead || 0) + (job.usage?.cacheWrite || 0))}</b></td>
            <td style={{ textAlign: 'right' }}><b>{job.usage?.images || ''}</b></td>
            <td style={{ textAlign: 'right' }}><b>{fmtCost(totalCost(job.usage))}</b></td>
          </tr>
        </tbody>
      </table>
      <p className="small muted">Maliyet, Anthropic'in liste fiyatlarına göre yaklaşık hesaplanır; AI görseller sağlayıcının ortalama fiyatıyla eklenir. Revizyonlar da bu işe yazılır.</p>
    </Modal>
  );
}
