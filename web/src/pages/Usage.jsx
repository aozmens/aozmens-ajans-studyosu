// Token ve maliyet: günlük grafik, ajan / marka / model kırılımı, en pahalı işler.
import React, { useEffect, useState } from 'react';
import { api } from '../api.js';
import { useApp, go } from '../App.jsx';
import { Icon, fmtTok, fmtCost, fmtNum, totalTokens, totalCost, UsageLine } from '../ui.jsx';

export default function Usage() {
  const { meta, companies, jobs } = useApp();
  const [days, setDays] = useState(30);
  const [u, setU] = useState(null);
  useEffect(() => { api.get(`/api/usage?days=${days}`).then(setU); }, [days]);
  if (!u) return <div className="page"><div className="spinner" /></div>;
  const dayKeys = Array.from({ length: Math.min(days, 90) }, (_, i) => new Date(Date.now() - (Math.min(days, 90) - 1 - i) * 864e5).toISOString().slice(0, 10));
  const maxDay = Math.max(1e-9, ...dayKeys.map((k) => totalCost(u.byDay[k])));
  const since = Date.now() - days * 864e5;
  const topJobs = jobs.filter((j) => new Date(j.createdAt).getTime() >= since).sort((a, b) => totalCost(b.usage) - totalCost(a.usage)).slice(0, 10);
  const table = (obj, label) => Object.entries(obj).sort((a, b) => totalCost(b[1]) - totalCost(a[1])).map(([k, v]) => [label(k), v]);
  return (
    <div className="page">
      <div className="hello">
        <div><h1 className="title">Token ve maliyet</h1><p className="sub">Her Claude çağrısı ve AI görsel buraya yazılır. Maliyetler liste fiyatına göre yaklaşıktır.</p></div>
        <div className="seg">{[7, 30, 90, 365].map((d) => <button key={d} className={days === d ? 'on' : ''} onClick={() => setDays(d)}>{d === 365 ? '1 yıl' : `${d} gün`}</button>)}</div>
      </div>
      <div className="stats">
        <div className="card stat"><div className="ib"><Icon name="zap" className="lg" /></div><div><div className="v">{fmtTok(totalTokens(u.total))}</div><div className="k">Toplam token</div></div></div>
        <div className="card stat"><div className="ib"><Icon name="chart" className="lg" /></div><div><div className="v">{fmtCost(totalCost(u.total))}</div><div className="k">Yaklaşık maliyet</div></div></div>
        <div className="card stat"><div className="ib"><Icon name="message" className="lg" /></div><div><div className="v">{fmtNum(u.total.calls)}</div><div className="k">Claude çağrısı</div></div></div>
        <div className="card stat"><div className="ib"><Icon name="image" className="lg" /></div><div><div className="v">{fmtNum(u.total.images)}</div><div className="k">AI görsel · {fmtCost(u.total.imageCost)}</div></div></div>
      </div>
      <div className="card pad" style={{ marginBottom: 18 }}>
        <div className="row between"><h3>Günlük maliyet</h3><UsageLine usage={u.total} /></div>
        <div className="bars">{dayKeys.map((k) => <div key={k} data-t={`${k}: ${fmtCost(totalCost(u.byDay[k]))} · ${fmtTok(totalTokens(u.byDay[k]))} token`} style={{ height: `${(totalCost(u.byDay[k]) / maxDay) * 100}%` }} />)}</div>
      </div>
      <div className="grid-2" style={{ alignItems: 'start' }}>
        <Breakdown title="Ajanlara göre" rows={table(u.byAgent, (k) => meta.agentLabels[k] || k)} />
        <Breakdown title="Markalara göre" rows={table(u.byCompany, (k) => companies.find((c) => c.id === k)?.name || 'Silinmiş marka')} />
        <Breakdown title="Model / motora göre" rows={table(u.byModel, (k) => k)} />
        <div className="card">
          <div style={{ padding: '14px 16px 6px' }}><h3>En çok harcayan işler</h3></div>
          {topJobs.map((j) => (
            <div key={j.id} className="list-row" onClick={() => go(`is/${j.id}`)}>
              <div className="grow"><div style={{ fontWeight: 600 }}>{j.title}</div><div className="small muted">{companies.find((c) => c.id === j.companyId)?.name}</div></div>
              <span className="small muted">{fmtTok(totalTokens(j.usage))}</span><b>{fmtCost(totalCost(j.usage))}</b>
            </div>
          ))}
          {!topJobs.length && <div className="small muted" style={{ padding: 16 }}>Bu dönemde iş yok.</div>}
        </div>
      </div>
    </div>
  );
}

function Breakdown({ title, rows }) {
  const max = Math.max(1e-9, ...rows.map(([, v]) => totalCost(v)));
  return (
    <div className="card">
      <div style={{ padding: '14px 16px 6px' }}><h3>{title}</h3></div>
      {rows.slice(0, 12).map(([k, v]) => (
        <div key={k} className="list-row" style={{ cursor: 'default', flexDirection: 'column', alignItems: 'stretch', gap: 6 }}>
          <div className="row between"><span style={{ fontWeight: 600 }}>{k}</span><span className="small"><span className="muted">{fmtTok(totalTokens(v))} token · </span><b>{fmtCost(totalCost(v))}</b></span></div>
          <div className="progress"><div style={{ width: `${(totalCost(v) / max) * 100}%` }} /></div>
        </div>
      ))}
      {!rows.length && <div className="small muted" style={{ padding: 16 }}>Veri yok.</div>}
    </div>
  );
}
