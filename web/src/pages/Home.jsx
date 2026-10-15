// Ana ekran: özet sayılar, çalışan işler ve marka klasörleri.
import React from 'react';
import { useApp, go } from '../App.jsx';
import { Icon, Logo, StatusBadge, UsageLine, brandColor, fmtTok, fmtCost, totalTokens, totalCost, timeAgo } from '../ui.jsx';

export default function Home() {
  const { companies, jobs, settings, openNewJob, openCompanyForm } = useApp();
  const running = jobs.filter((j) => j.running || j.status === 'running');
  const monthAgo = Date.now() - 30 * 864e5;
  const recent = jobs.filter((j) => new Date(j.createdAt).getTime() > monthAgo);
  const tok = recent.reduce((n, j) => n + totalTokens(j.usage), 0);
  const cost = recent.reduce((n, j) => n + totalCost(j.usage), 0);
  const designs = companies.reduce((n, c) => n + (c.designCount || 0), 0);
  const hour = new Date().getHours();
  const hello = hour < 6 ? 'İyi geceler' : hour < 12 ? 'Günaydın' : hour < 18 ? 'İyi günler' : 'İyi akşamlar';

  return (
    <div className="page">
      <div className="hello">
        <div>
          <h1 className="title">{hello}</h1>
          <p className="sub">{settings.agencyName} ekibi hazır. Bir marka seç ya da yeni bir iş başlat.</p>
        </div>
        <div className="row">
          <button className="btn" onClick={() => openCompanyForm()}><Icon name="plus" />Yeni marka</button>
          <button className="btn primary" onClick={() => openNewJob()}><Icon name="sparkles" />Yeni iş</button>
        </div>
      </div>

      <div className="stats">
        <div className="card stat"><div className="ib"><Icon name="folder" className="lg" /></div><div><div className="v">{companies.length}</div><div className="k">Marka</div></div></div>
        <div className={`card stat ${running.length ? 'warn' : ''}`}><div className="ib"><Icon name="zap" className="lg" /></div><div><div className="v">{running.length}</div><div className="k">Çalışan iş</div></div></div>
        <div className="card stat"><div className="ib"><Icon name="image" className="lg" /></div><div><div className="v">{designs}</div><div className="k">Tasarım</div></div></div>
        <div className="card stat" style={{ cursor: 'pointer' }} onClick={() => go('kullanim')}><div className="ib"><Icon name="chart" className="lg" /></div><div><div className="v">{fmtTok(tok)}</div><div className="k">Son 30 gün token · {fmtCost(cost)}</div></div></div>
      </div>

      {running.length > 0 && (
        <>
          <h2 className="section" style={{ marginBottom: 10 }}>Şu an çalışan işler</h2>
          <div className="run-list" style={{ marginBottom: 26 }}>
            {running.map((j) => {
              const c = companies.find((x) => x.id === j.companyId);
              return (
                <div key={j.id} className="card run-card" onClick={() => go(`is/${j.id}`)}>
                  <Logo company={c} />
                  <div className="grow">
                    <div style={{ fontWeight: 650, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{j.title}</div>
                    <div className="small muted">{c?.name}</div>
                    <div className="progress" style={{ marginTop: 8 }}><div style={{ width: `${j.progress || 3}%` }} /></div>
                  </div>
                  <UsageLine usage={j.usage} compact />
                </div>
              );
            })}
          </div>
        </>
      )}

      <div className="row between">
        <h2 className="section">Markalar</h2>
        <span className="small muted">Her marka kendi klasöründe: kimlik, logo, ilham, tasarımlar ve işler</span>
      </div>
      <div className="folders">
        {companies.map((c) => {
          const color = brandColor(c);
          const cj = jobs.filter((j) => j.companyId === c.id);
          const last = cj[0];
          return (
            <div key={c.id} className="folder" onClick={() => go(`marka/${c.id}`)}>
              <div className="folder-tab" style={{ background: color }}>{c.sector || 'Marka'}</div>
              <div className="folder-body" style={{ borderTopColor: color }}>
                <div className="folder-logo" style={{ background: `linear-gradient(160deg, color-mix(in srgb, ${color} 14%, var(--surface)), var(--surface))` }}>
                  {c.logoUrl ? <img src={c.logoUrl} alt="" /> : <Logo company={c} size={64} />}
                </div>
                {c.palette?.length > 0 && <div className="palette-strip">{c.palette.slice(0, 6).map((p, i) => <div key={i} style={{ background: p.hex }} />)}</div>}
                <div className="folder-info">
                  <div className="nm">{c.name}</div>
                  <div className="row small muted" style={{ marginTop: 6, gap: 10 }}>
                    <span>{c.jobCount} iş</span><span>{c.designCount} tasarım</span>
                    {c.brandProfile?.text && <span className="badge accent plain" style={{ height: 20 }}>Marka öğrenildi</span>}
                  </div>
                  {last && <div className="row small" style={{ marginTop: 8 }}><StatusBadge status={last.status} running={last.running} /><span className="faint">{timeAgo(last.createdAt)}</span></div>}
                </div>
              </div>
            </div>
          );
        })}
        <div className="folder new" onClick={() => openCompanyForm()}>
          <div className="folder-body">
            <div>
              <Icon name="plus" className="xl" />
              <div style={{ fontWeight: 650, color: 'var(--ink)', marginTop: 6 }}>Yeni marka ekle</div>
              <div className="small">Bilgileri gir, logo yükle ya da Logo Stüdyosu'nda oluştur</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
