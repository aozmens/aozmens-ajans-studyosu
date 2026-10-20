// Marka klasörü: genel bakış, marka profili (Marka Öğren), ilham (İlham Al), Logo Stüdyosu, tasarım stili, dosyalar, tasarımlar, işler, hafıza.
import React, { useEffect, useState } from 'react';
import { api, on, filesToItems } from '../api.js';
import { useApp, go } from '../App.jsx';
import {
  Icon, Logo, Markdown, Modal, Empty, AsyncButton, FilePick, DropZone, StatusBadge, UsageLine,
  brandColor, timeAgo, toast, toastErr, confirmAsk, copy,
} from '../ui.jsx';
import LogoStudio from './LogoStudio.jsx';
import { DesignCard, DesignModal } from './DesignModal.jsx';
import { InspirationPicker } from './Inspiration.jsx';
import { FontsCard, Kartela, ChoiceLink, ClientChoiceCard, BrandBookTab, FolderTab, WebCloneTab } from './BrandKit.jsx';

const TABS = [
  ['genel', 'Genel bakış', 'home'],
  ['profil', 'Marka profili', 'brain'],
  ['ilham', 'İlham', 'sparkles'],
  ['logo', 'Logo Stüdyosu', 'pen'],
  ['stil', 'Tasarım stili', 'palette'],
  ['kilavuz', 'Marka dosyası', 'book'],
  ['dosyalar', 'Dosyalar', 'file'],
  ['klasor', 'Klasör', 'folder'],
  ['webklon', 'Web klon', 'code'],
  ['tasarimlar', 'Tasarımlar', 'image'],
  ['isler', 'İşler', 'layers'],
  ['hafiza', 'Hafıza', 'book'],
];

export default function Brand({ id, tab }) {
  const { jobs, openNewJob, openCompanyForm, loadCompanies } = useApp();
  const [c, setC] = useState(null);
  const [err, setErr] = useState('');
  const [inspOpen, setInspOpen] = useState(false);
  const load = () => api.get(`/api/companies/${id}`).then(setC).catch((e) => setErr(e.message));
  useEffect(() => {
    load();
    return on('company:update', (d) => d.id === id && load());
  }, [id]);
  if (err) return <div className="page"><div className="err-box"><Icon name="alert" />{err}</div></div>;
  if (!c) return <div className="page"><div className="spinner" /></div>;
  const color = brandColor(c);
  const cj = jobs.filter((j) => j.companyId === c.id);
  const counts = { kilavuz: c.brandBooks.length, webklon: c.webClones.length, tasarimlar: c.designCount, isler: cj.length, dosyalar: c.files.length, hafiza: c.memory.length, ilham: c.inspirationIds.length, logo: c.logoProjects.length, stil: c.styles.length };
  const setTab = (t) => go(`marka/${c.id}/${t}`);

  const learnBrand = async () => {
    await api.post(`/api/companies/${c.id}/learn-brand`);
    toast('Marka öğrenildi; bundan sonraki işler bu profili referans alacak.');
    load();
    loadCompanies();
  };

  return (
    <div className="page">
      <div className="hero">
        <div style={{ position: 'absolute', inset: 0, background: `radial-gradient(900px 260px at 0% 0%, color-mix(in srgb, ${color} 22%, transparent), transparent 70%)` }} />
        <div className="hero-in">
          <div className="hero-logo">{c.logoUrl ? <img src={c.logoUrl} alt="" /> : <Logo company={c} size={64} />}</div>
          <div className="grow">
            <h1>{c.name}</h1>
            <div className="row muted" style={{ marginTop: 4 }}>
              {c.sector && <span>{c.sector}</span>}
              {c.website && <a href={c.website} target="_blank" rel="noreferrer">{c.website.replace(/^https?:\/\//, '')}</a>}
            </div>
            <div className="row" style={{ marginTop: 10 }}>
              {c.brandProfile?.text ? <span className="badge done">Marka öğrenildi · {timeAgo(c.brandProfile.learnedAt || c.brandProfile.editedAt)}</span> : <span className="badge">Marka henüz öğrenilmedi</span>}
              {c.inspirationIds.length > 0 && <span className="badge accent">{c.inspirationIds.length} ilham bağlı</span>}
              {c.palette.slice(0, 6).map((p, i) => <span key={i} title={p.hex} style={{ width: 18, height: 18, borderRadius: 6, background: p.hex, border: '1px solid var(--line)' }} />)}
            </div>
          </div>
          <div className="row">
            <AsyncButton className="btn" onClick={learnBrand} disabled={c.learningBrand} busyText="Öğreniyor…" title="Logo, görseller, tasarımlar ve web sitesinden marka profilini çıkarır">
              {c.learningBrand ? <span className="spinner sm" /> : <Icon name="brain" />}Markayı Öğren
            </AsyncButton>
            <button className="btn" onClick={() => setInspOpen(true)} title="İlham arşivinden bu markanın işlerine ilham bağla"><Icon name="sparkles" />İlham Al</button>
            <button className="btn ghost icon" title="Düzenle" onClick={() => openCompanyForm(c)}><Icon name="edit" /></button>
            <button className="btn primary" onClick={() => openNewJob(c.id)}><Icon name="plus" />Yeni iş</button>
          </div>
        </div>
      </div>

      <div className="tabs">
        {TABS.map(([k, l, i]) => (
          <button key={k} className={`tab ${tab === k ? 'on' : ''}`} onClick={() => setTab(k)}>
            <Icon name={i} size={15} />{l}{counts[k] ? <span className="cnt">{counts[k]}</span> : null}
          </button>
        ))}
      </div>

      {tab === 'genel' && <Overview c={c} reload={load} jobs={cj} setTab={setTab} learnBrand={learnBrand} />}
      {tab === 'profil' && <Profile c={c} reload={load} learnBrand={learnBrand} />}
      {tab === 'ilham' && <BrandInspiration c={c} reload={load} open={() => setInspOpen(true)} />}
      {tab === 'logo' && <LogoStudio c={c} reload={load} />}
      {tab === 'stil' && <StyleTab c={c} reload={load} />}
      {tab === 'kilavuz' && <BrandBookTab c={c} reload={load} />}
      {tab === 'dosyalar' && <Files c={c} reload={load} />}
      {tab === 'klasor' && <FolderTab c={c} />}
      {tab === 'webklon' && <WebCloneTab c={c} reload={load} />}
      {tab === 'tasarimlar' && <Designs c={c} />}
      {tab === 'isler' && <Jobs c={c} jobs={cj} />}
      {tab === 'hafiza' && <Memory c={c} reload={load} />}

      {inspOpen && <InspireModal c={c} onClose={() => setInspOpen(false)} onSaved={() => { setInspOpen(false); load(); setTab('ilham'); }} />}
    </div>
  );
}

// ---------------- genel bakış: bilgiler, logolar, palet ----------------

function Overview({ c, reload, jobs, setTab, learnBrand }) {
  const { openCompanyForm, loadCompanies } = useApp();
  const [palette, setPalette] = useState(c.palette);
  useEffect(() => setPalette(c.palette), [c.palette]);
  const savePalette = async (p) => {
    setPalette(p);
    await api.post('/api/companies', { id: c.id, palette: p });
    reload();
    loadCompanies();
  };
  const info = [['Sektör', c.sector], ['Hedef kitle', c.audience], ['Ton', c.tone], ['Fontlar', c.fonts], ['Rakipler', c.competitors], ['Sosyal medya', c.social], ['Hakkında', c.about]].filter(([, v]) => v);
  const steps = [
    [!!c.logos.length, 'Logo yükle ya da Logo Stüdyosu\'nda oluştur', () => setTab('logo')],
    [!!c.palette.length, 'Renk paletini belirle', null],
    [!!c.brandProfile?.text, '"Markayı Öğren" ile marka profilini çıkar', learnBrand],
    [!!c.inspirationIds.length, '"İlham Al" ile ilham görselleri bağla', () => setTab('ilham')],
  ];
  return (
    <div className="stack" style={{ gap: 18 }}>
      <ClientChoiceCard c={c} reload={reload} />
      {steps.some(([d]) => !d) && (
        <div className="card pad">
          <h3 style={{ marginBottom: 10 }}>Markayı hazırlayalım</h3>
          <div className="stack" style={{ gap: 6 }}>
            {steps.map(([done, label, fn], i) => (
              <div key={i} className="row" style={{ gap: 10 }}>
                <span style={{ width: 20, height: 20, borderRadius: 6, display: 'grid', placeItems: 'center', background: done ? 'var(--ok-soft)' : 'var(--surface-2)', color: done ? 'var(--ok)' : 'var(--faint)' }}><Icon name={done ? 'check' : 'chevron'} size={13} /></span>
                <span className={done ? 'muted' : ''} style={done ? { textDecoration: 'line-through' } : undefined}>{label}</span>
                {!done && fn && <button className="btn sm ghost" onClick={fn}>Başla</button>}
              </div>
            ))}
          </div>
        </div>
      )}
      <div className="grid-2" style={{ alignItems: 'start' }}>
        <div className="card pad stack">
          <div className="row between"><h3>Marka bilgileri</h3><button className="btn sm" onClick={() => openCompanyForm(c)}><Icon name="edit" />Düzenle</button></div>
          {info.length ? <dl className="kv" style={{ margin: 0 }}>{info.map(([k, v]) => <React.Fragment key={k}><dt>{k}</dt><dd>{v}</dd></React.Fragment>)}</dl> : <p className="muted small">Henüz bilgi girilmedi.</p>}
        </div>
        <div className="card pad stack">
          <div className="row between">
            <h3>Logolar</h3>
            <FilePick className="btn sm" accept="image/*,.svg" onFiles={async (files) => {
              try {
                for (const it of await filesToItems(files)) await api.post(`/api/companies/${c.id}/logos`, it);
                reload(); loadCompanies();
              } catch (e) { toastErr(e); }
            }}><Icon name="upload" />Logo yükle</FilePick>
          </div>
          {c.logos.length ? (
            <div className="img-grid" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))' }}>
              {c.logos.map((l) => (
                <div key={l.id} className={`img-card ${l.primary || (c.logos[0].id === l.id && !c.logos.some((x) => x.primary)) ? 'selected' : ''}`}>
                  <div className="th contain checker"><img src={l.pngFile ? `/files/${c.id}/${l.pngFile}` : l.url} alt="" /></div>
                  <div className="meta">
                    <div className="row" style={{ gap: 4 }}>
                      <button className="btn sm" title="Ana logo yap" onClick={async () => { await api.patch(`/api/companies/${c.id}/assets/logos/${l.id}`, { primary: true }); reload(); loadCompanies(); }}><Icon name="check" /></button>
                      <a className="btn sm" href={l.url} download><Icon name="download" /></a>
                      <button className="btn sm danger" onClick={async () => { if (confirmAsk('Logo silinsin mi?')) { await api.del(`/api/companies/${c.id}/assets/logos/${l.id}`); reload(); loadCompanies(); } }}><Icon name="trash" /></button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : <Empty icon="pen" title="Logo yok">Logo yükle ya da <a href={`#/marka/${c.id}/logo`}>Logo Stüdyosu</a>'nda oluştur.</Empty>}
        </div>
      </div>
      <div className="card pad stack">
        <div className="row between">
          <h3>Renk paleti</h3>
          <div className="row">
            <Kartela c={c} palette={palette} savePalette={savePalette} />
            <ChoiceLink c={c} />
            {c.logos.length > 0 && <AsyncButton className="btn sm" onClick={async () => savePalette((await api.post(`/api/companies/${c.id}/palette-from-logo`)).map((hex, i) => ({ name: palette[i]?.name || `Renk ${i + 1}`, hex })))}><Icon name="refresh" />Logodan çıkar</AsyncButton>}
            <button className="btn sm" onClick={() => savePalette([...palette, { name: `Renk ${palette.length + 1}`, hex: '#5B4CF0' }])}><Icon name="plus" />Renk ekle</button>
          </div>
        </div>
        {palette.length ? (
          <div className="swatches">
            {palette.map((p, i) => (
              <div key={i} className="swatch">
                <div className="c" style={{ background: p.hex }}>
                  <input type="color" value={p.hex.length === 7 ? p.hex : '#000000'} onChange={(e) => setPalette(palette.map((x, j) => (j === i ? { ...x, hex: e.target.value.toUpperCase() } : x)))} onBlur={() => savePalette(palette)} />
                </div>
                <div className="m">
                  <input value={p.name} onChange={(e) => setPalette(palette.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))} onBlur={() => savePalette(palette)} />
                  <div className="row between small muted"><span className="mono" style={{ cursor: 'pointer' }} onClick={() => copy(p.hex)}>{p.hex}</span><button className="btn sm ghost icon" onClick={() => savePalette(palette.filter((_, j) => j !== i))}><Icon name="x" size={13} /></button></div>
                </div>
              </div>
            ))}
          </div>
        ) : <p className="muted small">Palet boş. Logo yüklendiğinde renkler otomatik çıkarılır; hazır kartelalardan da seçebilirsin.</p>}
      </div>
      <FontsCard c={c} reload={reload} />
      {jobs.length > 0 && (
        <div className="card">
          <div className="row between" style={{ padding: '14px 16px 6px' }}><h3>Son işler</h3><button className="btn sm ghost" onClick={() => setTab('isler')}>Tümü</button></div>
          {jobs.slice(0, 5).map((j) => <JobRow key={j.id} j={j} />)}
        </div>
      )}
    </div>
  );
}

function JobRow({ j }) {
  const { meta } = useApp();
  const t = meta.jobTypes.find((x) => x.id === j.type);
  return (
    <div className="list-row" onClick={() => go(`is/${j.id}`)}>
      <div className="logo-sq" style={{ color: 'var(--accent)' }}><Icon name={t?.icon || 'layers'} /></div>
      <div className="grow">
        <div style={{ fontWeight: 600 }}>{j.title}</div>
        <div className="small muted">{t?.label} · {timeAgo(j.createdAt)} · {j.designCount} tasarım</div>
      </div>
      <UsageLine usage={j.usage} compact />
      <StatusBadge status={j.status} running={j.running} />
    </div>
  );
}

// ---------------- marka profili (Marka Öğren) ----------------

function Profile({ c, reload, learnBrand }) {
  const [edit, setEdit] = useState(false);
  const [text, setText] = useState(c.brandProfile?.text || '');
  useEffect(() => setText(c.brandProfile?.text || ''), [c.brandProfile?.text]);
  const bp = c.brandProfile;
  return (
    <div className="stack">
      <div className="note-box"><Icon name="info" /><div>"Markayı Öğren" logoyu, marka görsellerini, onaylı örnek tasarımları, önceki işleri ve web sitesini inceleyip kalıcı bir marka profili çıkarır. Yeni işlerde "Marka profilini kullan" açıkken bütün ajanlar, tasarımlar ve AI görseller bu profili referans alır.</div></div>
      <div className="card pad stack">
        <div className="row between">
          <div>
            <h3>Marka profili</h3>
            {bp && <div className="small muted">{bp.learnedAt ? `Öğrenildi ${timeAgo(bp.learnedAt)}` : ''}{bp.sources?.length ? ` · kaynak: ${bp.sources.join(', ')}` : ''}{bp.editedAt ? ` · elle düzenlendi ${timeAgo(bp.editedAt)}` : ''}</div>}
          </div>
          <div className="row">
            {bp?.usage && <UsageLine usage={bp.usage} compact />}
            {bp && !edit && <button className="btn sm" onClick={() => setEdit(true)}><Icon name="edit" />Düzenle</button>}
            <AsyncButton className="btn sm primary" onClick={learnBrand} disabled={c.learningBrand} busyText="Öğreniyor…">{c.learningBrand ? <span className="spinner sm" /> : <Icon name="brain" />}{bp ? 'Yeniden öğren' : 'Markayı Öğren'}</AsyncButton>
          </div>
        </div>
        {edit ? (
          <>
            <textarea className="textarea mono" style={{ minHeight: 420 }} value={text} onChange={(e) => setText(e.target.value)} />
            <div className="row end">
              <button className="btn" onClick={() => { setEdit(false); setText(bp?.text || ''); }}>Vazgeç</button>
              <AsyncButton className="btn primary" onClick={async () => { await api.put(`/api/companies/${c.id}/brand-profile`, { text }); setEdit(false); reload(); }}>Kaydet</AsyncButton>
            </div>
          </>
        ) : bp?.text ? <Markdown text={bp.text} /> : c.learningBrand ? <div className="row muted"><span className="spinner" />Marka inceleniyor…</div> : (
          <Empty icon="brain" title="Marka henüz öğrenilmedi">En iyi sonuç için önce logo, birkaç marka görseli (Dosyalar) ve onaylı örnek tasarımlar (Tasarım stili) ekle.</Empty>
        )}
      </div>
    </div>
  );
}

// ---------------- İlham Al ----------------

function InspireModal({ c, onClose, onSaved }) {
  const [sel, setSel] = useState(c.inspirationIds);
  return (
    <Modal size="wide" title={`İlham Al · ${c.name}`} onClose={onClose} footer={<>
      <span className="small muted grow">{sel.length} görsel seçildi (en fazla 24). Bu markanın işleri seçilen görsellerin promptlarını ve estetiğini kullanır.</span>
      <button className="btn" onClick={onClose}>Vazgeç</button>
      <AsyncButton className="btn primary" onClick={async () => { await api.post('/api/companies', { id: c.id, inspirationIds: sel }); onSaved(); }}><Icon name="check" />Bağla</AsyncButton>
    </>}>
      <InspirationPicker selected={sel} onChange={setSel} max={24} />
    </Modal>
  );
}

function BrandInspiration({ c, reload, open }) {
  const [agency, setAgency] = useState(null);
  useEffect(() => { api.get('/api/agency').then(setAgency); }, []);
  const items = (agency?.styles || []).filter((s) => c.inspirationIds.includes(s.id));
  return (
    <div className="stack">
      <div className="row between">
        <div className="note-box grow"><Icon name="sparkles" /><div>Bu markaya bağlı ilham görselleri, yeni işlerde ("İlhamı kullan" açıkken) tasarımcıya ve AI görsel motoruna referans olarak gider: tarama sırasında çıkarılan promptlar, ışık, kompozisyon ve renk kalıbı korunur.</div></div>
      </div>
      <div className="row between">
        <h2 className="section">Bağlı ilhamlar</h2>
        <div className="row">
          <button className="btn" onClick={() => go('ilham')}><Icon name="upload" />İlham arşivine görsel yükle</button>
          <button className="btn primary" onClick={open}><Icon name="sparkles" />İlham Al</button>
        </div>
      </div>
      {!agency ? <div className="spinner" /> : items.length ? (
        <div className="img-grid">
          {items.map((s) => (
            <div key={s.id} className="img-card">
              <div className="th"><img src={s.url} alt="" loading="lazy" /></div>
              <div className="meta">
                <b>{s.analysis?.style || s.name}</b>
                {s.analysis?.prompt ? <div className="prompt-box" style={{ maxHeight: 80 }}>{s.analysis.prompt}</div> : <span className="muted">Taranmadı</span>}
                <div className="row" style={{ gap: 4 }}>
                  {s.analysis?.prompt && <button className="btn sm" onClick={() => copy(s.analysis.prompt)}><Icon name="copy" />Prompt</button>}
                  <button className="btn sm danger" onClick={async () => { await api.post('/api/companies', { id: c.id, inspirationIds: c.inspirationIds.filter((x) => x !== s.id) }); reload(); }}><Icon name="x" />Çıkar</button>
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : <Empty icon="sparkles" title="İlham bağlanmadı">"İlham Al" ile arşivden görsel seç. Arşive görsel yüklediğinde her görsel otomatik taranıp prompta dönüştürülür.</Empty>}
    </div>
  );
}

// ---------------- tasarım stili (örnek tasarımlardan) ----------------

function StyleTab({ c, reload }) {
  const [edit, setEdit] = useState(false);
  const [text, setText] = useState(c.styleGuide?.text || '');
  useEffect(() => setText(c.styleGuide?.text || ''), [c.styleGuide?.text]);
  const upload = async (files) => {
    try { await api.post(`/api/companies/${c.id}/styles`, { items: await filesToItems(files) }); reload(); } catch (e) { toastErr(e); }
  };
  return (
    <div className="stack">
      <div className="note-box"><Icon name="palette" /><div>Markanın daha önce onayladığı tasarımları (Instagram gönderileri, afişler) yükle; "Stili öğren" bunlardan tipografi, grid, renk kullanımı ve kompozisyon kurallarını çıkarır. Tasarımcı her yeni tasarımda bu rehbere uyar.</div></div>
      <DropZone onFiles={upload}>
        <div className="card pad stack">
          <div className="row between">
            <h3>Örnek tasarımlar ({c.styles.length}/40)</h3>
            <div className="row">
              <FilePick className="btn sm" accept="image/*" multiple onFiles={upload}><Icon name="upload" />Yükle</FilePick>
              <AsyncButton className="btn sm primary" disabled={c.styles.length < 2 || c.learningStyle} busyText="Öğreniyor…" onClick={async () => { await api.post(`/api/companies/${c.id}/learn-style`); toast('Tasarım stili öğrenildi'); reload(); }}><Icon name="graduation" />Stili öğren</AsyncButton>
            </div>
          </div>
          {c.styles.length ? (
            <div className="img-grid" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(130px, 1fr))' }}>
              {c.styles.map((s) => (
                <div key={s.id} className="img-card">
                  <div className="th"><img src={s.url} alt="" loading="lazy" /></div>
                  <button className="btn sm ghost danger" style={{ position: 'absolute', top: 4, right: 4, background: 'var(--surface)' }} onClick={async () => { await api.del(`/api/companies/${c.id}/assets/styles/${s.id}`); reload(); }}><Icon name="x" size={13} /></button>
                </div>
              ))}
            </div>
          ) : <p className="muted small">Görselleri buraya sürükle ya da yükle (20-25 örnek önerilir).</p>}
        </div>
      </DropZone>
      <div className="card pad stack">
        <div className="row between">
          <h3>Stil rehberi</h3>
          {c.styleGuide && !edit && <button className="btn sm" onClick={() => setEdit(true)}><Icon name="edit" />Düzenle</button>}
        </div>
        {edit ? (
          <>
            <textarea className="textarea mono" style={{ minHeight: 360 }} value={text} onChange={(e) => setText(e.target.value)} />
            <div className="row end">
              <button className="btn" onClick={() => setEdit(false)}>Vazgeç</button>
              <AsyncButton className="btn primary" onClick={async () => { await api.put(`/api/companies/${c.id}/style-guide`, { text }); setEdit(false); reload(); }}>Kaydet</AsyncButton>
            </div>
          </>
        ) : c.styleGuide?.text ? <Markdown text={c.styleGuide.text} /> : <p className="muted small">Henüz rehber yok. Örnekleri yükleyip "Stili öğren"e bas; ya da Düzenle ile elle yaz.</p>}
        {!c.styleGuide && !edit && <button className="btn sm" style={{ alignSelf: 'flex-start' }} onClick={() => setEdit(true)}><Icon name="edit" />Elle yaz</button>}
      </div>
    </div>
  );
}

// ---------------- dosyalar ----------------

const ROLES = [['', 'Yalnızca dosya'], ['urun', 'Ürün görseli'], ['arkaplan', 'Arka plan fotoğrafı'], ['diger', 'Tasarım görseli'], ['mockup', 'Mockup']];

function Files({ c, reload }) {
  const { meta } = useApp();
  const [role, setRole] = useState('urun');
  const [preview, setPreview] = useState(null);
  const clipdrop = meta.providers.find((p) => p.id === 'clipdrop')?.connected;
  const upload = async (files) => {
    try { await api.post(`/api/companies/${c.id}/files`, { items: await filesToItems(files), role }); reload(); } catch (e) { toastErr(e); }
  };
  const isImg = (f) => /^image\//.test(f.mime || '');
  return (
    <div className="stack">
      <DropZone onFiles={upload} accept="*">
        <div className="card pad row between">
          <div>
            <h3>Dosya ve görseller</h3>
            <div className="small muted">Tasarım görseli olarak işaretlenenler tasarımlarda kullanılır; "Referans" işaretliler (en fazla 3) her işte ajanlara gösterilir.</div>
          </div>
          <div className="row">
            <select className="select" style={{ width: 190 }} value={role} onChange={(e) => setRole(e.target.value)}>
              {ROLES.map(([k, l]) => <option key={k} value={k}>Yüklenen: {l}</option>)}
            </select>
            <FilePick className="btn primary" multiple accept="*" onFiles={upload}><Icon name="upload" />Yükle</FilePick>
          </div>
        </div>
      </DropZone>
      {c.files.length ? (
        <div className="img-grid">
          {c.files.map((f) => (
            <div key={f.id} className="img-card">
              {isImg(f) ? <div className={`th ${f.alpha ? 'contain checker' : ''}`} onClick={() => setPreview(f)}><img src={f.url} alt="" loading="lazy" /></div>
                : /^video\//.test(f.mime || '') ? <div className="th"><video src={f.url} controls style={{ width: '100%', height: '100%', objectFit: 'cover' }} /></div>
                  : <div className="th"><Icon name="file" className="xl" /></div>}
              <div className="meta">
                <div style={{ fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={f.name}>{f.name}</div>
                {isImg(f) && (
                  <select className="select" style={{ padding: '4px 6px', fontSize: 12 }} value={f.role || ''} onChange={async (e) => { await api.patch(`/api/companies/${c.id}/assets/files/${f.id}`, { role: e.target.value }); reload(); }}>
                    {ROLES.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
                  </select>
                )}
                {isImg(f) && <label className="check small"><input type="checkbox" checked={!!f.reference} onChange={async (e) => { try { await api.patch(`/api/companies/${c.id}/assets/files/${f.id}`, { reference: e.target.checked }); reload(); } catch (x) { toastErr(x); } }} />Referans</label>}
                {f.aiPrompt && <span className="pill" title={f.aiPrompt}><Icon name="wand" size={11} />AI · {f.provider}</span>}
                {f.role === 'urun' && (f.analysis?.prompt
                  ? <span className="pill" style={{ cursor: 'pointer' }} title={f.analysis.prompt} onClick={() => copy(f.analysis.prompt)}><Icon name="copy" size={11} />Ürün promptu</span>
                  : <AsyncButton className="btn sm" title="Ürünü piksel piksel tarif et" onClick={async () => { await api.post(`/api/companies/${c.id}/files/${f.id}/analyze`); reload(); }}><Icon name="search" />Ürünü tara</AsyncButton>)}
                <div className="row" style={{ gap: 4 }}>
                  <a className="btn sm" href={f.url} download={f.name}><Icon name="download" /></a>
                  {isImg(f) && clipdrop && <AsyncButton className="btn sm" title="Arka planı sil (Clipdrop)" onClick={async () => { await api.post(`/api/companies/${c.id}/files/${f.id}/edit`, { op: 'removeBg' }); reload(); }}><Icon name="eraser" /></AsyncButton>}
                  {isImg(f) && clipdrop && <AsyncButton className="btn sm" title="Büyüt (Clipdrop)" onClick={async () => { await api.post(`/api/companies/${c.id}/files/${f.id}/edit`, { op: 'upscale' }); reload(); }}><Icon name="zap" /></AsyncButton>}
                  <button className="btn sm danger" onClick={async () => { if (confirmAsk('Dosya silinsin mi?')) { await api.del(`/api/companies/${c.id}/assets/files/${f.id}`); reload(); } }}><Icon name="trash" /></button>
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : <Empty icon="file" title="Dosya yok">Ürün fotoğrafları, kampanya görselleri, briefler… Sürükleyip bırakabilirsin.</Empty>}
      {preview && <Modal title={preview.name} onClose={() => setPreview(null)} size="wide"><img src={preview.url} alt="" style={{ maxWidth: '100%', display: 'block', margin: '0 auto' }} />{preview.aiPrompt && <div className="prompt-box" style={{ marginTop: 12 }}>{preview.aiPrompt}</div>}{preview.analysis?.prompt && <div className="prompt-box" style={{ marginTop: 12 }}>{preview.analysis.prompt}</div>}</Modal>}
    </div>
  );
}

// ---------------- tasarımlar ----------------

function Designs({ c }) {
  const [list, setList] = useState(null);
  const [open, setOpen] = useState(null);
  const [filter, setFilter] = useState('');
  const load = () => api.get(`/api/companies/${c.id}/designs`).then(setList);
  useEffect(() => {
    load();
    return on('job:update', (j) => j.companyId === c.id && load());
  }, [c.id]);
  if (!list) return <div className="spinner" />;
  const shown = list.filter(({ design: d }) => !filter || (filter === 'carousel' ? d.kind === 'carousel' : d.variants.some((v) => v.key === filter)));
  return (
    <div className="stack">
      <div className="row between">
        <div className="seg">
          {[['', 'Hepsi'], ['post', 'Post'], ['story', 'Story'], ['carousel', 'Carousel']].map(([k, l]) => <button key={k} className={filter === k ? 'on' : ''} onClick={() => setFilter(k)}>{l}</button>)}
        </div>
        <span className="small muted">{shown.length} tasarım</span>
      </div>
      {shown.length ? (
        <div className="gallery">
          {shown.map(({ jobId, jobTitle, design }) => <DesignCard key={design.id} jobId={jobId} d={design} sub={jobTitle} onOpen={() => setOpen({ jobId, id: design.id })} />)}
        </div>
      ) : <Empty icon="image" title="Henüz tasarım yok">Yeni bir iş başlat; tasarımlar burada toplanır.</Empty>}
      {open && <DesignModal jobId={open.jobId} designId={open.id} onClose={() => setOpen(null)} />}
    </div>
  );
}

function Jobs({ c, jobs }) {
  const { openNewJob } = useApp();
  return jobs.length ? (
    <div className="card">{jobs.map((j) => <JobRow key={j.id} j={j} />)}</div>
  ) : <Empty icon="layers" title="Henüz iş yok"><button className="btn primary" style={{ marginTop: 10 }} onClick={() => openNewJob(c.id)}><Icon name="plus" />Yeni iş</button></Empty>;
}

// ---------------- hafıza ----------------

function Memory({ c, reload }) {
  const [text, setText] = useState('');
  return (
    <div className="stack">
      <div className="note-box"><Icon name="book" /><div>Ajans bu markayla ilgili öğrendiklerini burada saklar ve her işte uygular. Revizyonlarda verdiğin geri bildirimler iş sonunda otomatik olarak buraya işlenir.</div></div>
      <div className="card pad row">
        <input className="input grow" placeholder="ör. Logo her zaman sağ üstte, başlıklarda ünlem kullanma" value={text} onChange={(e) => setText(e.target.value)} onKeyDown={async (e) => { if (e.key === 'Enter' && text.trim()) { await api.post(`/api/companies/${c.id}/memory`, { text }); setText(''); reload(); } }} />
        <AsyncButton className="btn primary" disabled={!text.trim()} onClick={async () => { await api.post(`/api/companies/${c.id}/memory`, { text }); setText(''); reload(); }}><Icon name="plus" />Ekle</AsyncButton>
        {c.pendingFeedback > 0 && <AsyncButton className="btn" onClick={async () => { const r = await api.post(`/api/companies/${c.id}/learn-now`); toast(`${r.added || 0} yeni madde öğrenildi`); reload(); }}><Icon name="graduation" />Geri bildirimlerden öğren ({c.pendingFeedback})</AsyncButton>}
      </div>
      {c.memory.length ? (
        <div className="card">
          {c.memory.map((m) => (
            <div key={m.id} className="list-row" style={{ cursor: 'default' }}>
              <Icon name="check" />
              <div className="grow">{m.text}<div className="small faint">{m.source} · {timeAgo(m.at)}</div></div>
              <button className="btn sm ghost danger" onClick={async () => { await api.del(`/api/companies/${c.id}/memory/${m.id}`); reload(); }}><Icon name="trash" /></button>
            </div>
          ))}
        </div>
      ) : <Empty icon="book" title="Hafıza boş">İlk iş bittiğinde ajans öğrendiklerini buraya yazar.</Empty>}
    </div>
  );
}
