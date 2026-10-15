// Ajans Stüdyosu web sunucusu: REST API + canlı olaylar (SSE) + derlenmiş arayüz (web/dist).
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import express from 'express';
import sharp from 'sharp';
import * as store from './store.js';
import * as agents from './agents.js';
import * as orch from './orchestrator.js';
import * as brand from './brand.js';
import * as logo from './logo.js';
import * as render from './render.js';
import * as imagegen from './imagegen.js';
import * as events from './events.js';
import * as exporter from './export.js';
import { JOB_TYPES, FORMATS } from './jobTypes.js';

const ROOT = new URL('..', import.meta.url).pathname;
const DATA_DIR = process.env.DATA_DIR || path.join(ROOT, 'data');
const PORT = +process.env.PORT || 3000;
const PASSWORD = process.env.APP_PASSWORD || '';
const SECRET = process.env.SESSION_SECRET || crypto.createHash('sha256').update('ajans:' + PASSWORD + ':' + DATA_DIR).digest('hex');
const VERSION = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8')).version;
const COMMIT = (process.env.RAILWAY_GIT_COMMIT_SHA || process.env.GIT_COMMIT || '').slice(0, 7);

store.init(DATA_DIR);
agents.init(path.join(ROOT, 'agents'));

const app = express();
app.disable('x-powered-by');
app.set('trust proxy', 1);
app.use(express.json({ limit: '80mb' }));

// ---------------- oturum (tek şifre) ----------------

const sign = (v) => crypto.createHmac('sha256', SECRET).update(v).digest('base64url');
const cookieOf = (req, name) => (req.headers.cookie || '').split(';').map((x) => x.trim().split('=')).find(([k]) => k === name)?.[1];
function authed(req) {
  if (!PASSWORD) return true;
  const v = cookieOf(req, 'as_oturum');
  if (!v) return false;
  const [ts, sig] = decodeURIComponent(v).split('.');
  return sig && sign(ts) === sig && Date.now() - +ts < 30 * 864e5;
}

app.post('/api/login', (req, res) => {
  if (!PASSWORD) return res.json({ ok: true });
  const a = Buffer.from(String(req.body?.password || ''));
  const b = Buffer.from(PASSWORD);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return res.status(401).json({ error: 'Şifre yanlış' });
  const ts = String(Date.now());
  res.setHeader('Set-Cookie', `as_oturum=${encodeURIComponent(ts + '.' + sign(ts))}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${30 * 86400}${req.secure ? '; Secure' : ''}`);
  res.json({ ok: true });
});
app.post('/api/logout', (req, res) => {
  res.setHeader('Set-Cookie', 'as_oturum=; Path=/; Max-Age=0');
  res.json({ ok: true });
});
app.get('/api/health', (req, res) => res.json({ ok: true, version: VERSION, commit: COMMIT }));
app.get('/api/me', (req, res) => res.json({ authed: authed(req), passwordRequired: !!PASSWORD, version: VERSION, commit: COMMIT }));

// İmzalı herkese açık bağlantı (Higgsfield gibi dış servislerin tasarım görselini indirebilmesi için)
app.get('/pub/:token', (req, res) => {
  const [payload, sig] = String(req.params.token).split('.');
  if (!payload || sign(payload) !== sig) return res.status(403).end();
  const { f, exp } = JSON.parse(Buffer.from(payload, 'base64url').toString());
  if (Date.now() > exp) return res.status(410).end();
  const file = path.join(store.cacheDir(), path.basename(f));
  if (!fs.existsSync(file)) return res.status(404).end();
  res.type('png').sendFile(file);
});
function publicUrl(req, cacheFile) {
  const payload = Buffer.from(JSON.stringify({ f: cacheFile, exp: Date.now() + 3 * 3600e3 })).toString('base64url');
  const base = process.env.PUBLIC_URL || `${req.protocol}://${req.get('host')}`;
  return `${base.replace(/\/$/, '')}/pub/${payload}.${sign(payload)}`;
}

app.use(['/api', '/files'], (req, res, next) => (authed(req) ? next() : res.status(401).json({ error: 'Giriş gerekli' })));

// Hata yakalayan sarmalayıcı
const h = (fn) => async (req, res) => {
  try {
    const out = await fn(req, res);
    if (!res.headersSent) res.json(out === undefined ? { ok: true } : out);
  } catch (e) {
    if (!res.headersSent) res.status(e.status && e.status < 500 ? e.status : 400).json({ error: e.message || String(e) });
  }
};
// Uzun süren işlemleri arka planda başlatır; hata olursa tarayıcıya bildirim gider
const bg = (label, fn) => {
  fn().catch((e) => events.send('toast', { error: true, text: `${label}: ${e.message}` }));
};

// ---------------- dosyalar ----------------

app.get('/files/:owner/:file', (req, res) => {
  const owner = path.basename(req.params.owner);
  const file = path.basename(req.params.file);
  const p = path.join(store.assetRoot(), owner, file);
  if (!p.startsWith(store.assetRoot()) || !fs.existsSync(p)) return res.status(404).send('Bulunamadı');
  res.setHeader('Cache-Control', 'private, max-age=86400');
  res.sendFile(p);
});

app.get('/api/events', events.handler);

// ---------------- meta, ayarlar, kullanım ----------------

app.get('/api/meta', h(() => ({
  version: VERSION, commit: COMMIT,
  jobTypes: Object.entries(JOB_TYPES).map(([id, t]) => ({ id, label: t.label, icon: t.icon, desc: t.desc, designs: t.designs, postCount: t.postCount || 6, agents: t.agents, quick: !!t.quick })),
  formats: Object.entries(FORMATS).map(([id, f]) => ({ id, ...f })),
  fonts: render.fonts().map((f) => ({ family: f.family, note: f.note, weights: f.faces.map((x) => x.weight) })),
  providers: Object.entries(imagegen.PROVIDERS).map(([id, p]) => ({ id, ...p, connected: imagegen.isConnected(id) })),
  agentGroups: agents.GROUPS,
  agentLabels: agents.LABELS,
})));

app.get('/api/settings', h(() => store.getSettings(true)));
app.put('/api/settings', h((req) => store.saveSettings(req.body || {})));
app.post('/api/settings/test', h(async () => ({ text: await orch.testConnection() })));
app.post('/api/integrations/:name/test', h(async (req) => ({ text: await imagegen.test(req.params.name) })));

app.get('/api/usage', h((req) => {
  const days = Math.max(1, Math.min(365, +req.query.days || 30));
  const since = Date.now() - days * 864e5;
  const log = store.usageLog().filter((e) => new Date(e.at).getTime() >= since);
  const total = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, cost: 0, images: 0, imageCost: 0, calls: 0 };
  const byDay = {};
  const byAgent = {};
  const byCompany = {};
  const byModel = {};
  for (const e of log) {
    const add = (o) => { for (const k of Object.keys(total)) o[k] = (o[k] || 0) + (k === 'calls' ? (e.kind === 'image' || e.kind === 'video' ? 0 : 1) : e[k] || 0); };
    add(total);
    add((byDay[e.at.slice(0, 10)] = byDay[e.at.slice(0, 10)] || {}));
    if (e.agent) add((byAgent[e.agent] = byAgent[e.agent] || {}));
    if (e.companyId) add((byCompany[e.companyId] = byCompany[e.companyId] || {}));
    if (e.model || e.provider) add((byModel[e.model || e.provider] = byModel[e.model || e.provider] || {}));
  }
  return { days, total, byDay, byAgent, byCompany, byModel };
}));

// ---------------- markalar ----------------

app.get('/api/companies', h(() => store.listCompanies()));
app.get('/api/companies/:id', h((req) => {
  const c = store.publicCompany(store.getCompany(req.params.id));
  if (!c) throw Object.assign(new Error('Marka bulunamadı'), { status: 404 });
  return { ...c, learningBrand: brand.isLearningBrand(c.id), learningStyle: orch.isLearningStyle(c.id) };
}));
app.post('/api/companies', h((req) => ({ id: store.saveCompany(req.body || {}) })));
app.delete('/api/companies/:id', h((req) => store.deleteCompany(req.params.id)));
app.get('/api/companies/:id/designs', h((req) => store.companyDesigns(req.params.id)));

// Logo yükle: orijinal + PNG kopyası; palet boşsa logodan çıkarılır
app.post('/api/companies/:id/logos', h(async (req) => {
  const c = store.getCompany(req.params.id);
  if (!c) throw new Error('Marka bulunamadı');
  const { name, dataUrl } = req.body;
  const { buf, mime } = store.parseDataUrl(dataUrl);
  const entry = store.writeAsset(c.id, { name, buf, mime });
  const png = mime === 'image/svg+xml' ? render.svgToPng(buf.toString('utf8'), 1200) : await sharp(buf).resize({ width: 1200, height: 1200, fit: 'inside', withoutEnlargement: true }).png().toBuffer();
  if (mime !== 'image/png') {
    entry.pngFile = `${entry.id}-png.png`;
    fs.writeFileSync(store.assetPath(c.id, entry.pngFile), png);
  }
  store.addAsset(c.id, 'logos', entry);
  if (!c.palette.length) {
    c.palette = (await render.extractColors(png, 5)).map((hex, i) => ({ name: `Renk ${i + 1}`, hex }));
    store.flush();
  }
  return store.publicCompany(c);
}));

app.post('/api/companies/:id/palette-from-logo', h(async (req) => {
  const c = store.getCompany(req.params.id);
  const l = store.primaryLogo(c);
  if (!l) throw new Error('Önce bir logo yükleyin.');
  return render.extractColors(Buffer.from(l.data, 'base64'), 6);
}));

// Dosya ekle (role verilirse tasarım görseli olarak hazırlanır)
app.post('/api/companies/:id/files', h(async (req) => {
  const c = store.getCompany(req.params.id);
  if (!c) throw new Error('Marka bulunamadı');
  const { items = [], role = '' } = req.body;
  const added = [];
  for (const it of items.slice(0, 40)) {
    const { buf, mime } = store.parseDataUrl(it.dataUrl);
    if (buf.length > 60e6) continue;
    if (role && /^image\/(png|jpe?g|webp)/.test(mime)) {
      added.push((await orch.saveCompanyImage(c, { buf, mime }, { name: it.name, role })).id);
    } else {
      const e = store.writeAsset(c.id, { name: it.name, buf, mime });
      if (/^image\/(png|jpe?g|webp|gif)/.test(mime)) {
        try { const m = await sharp(buf).metadata(); Object.assign(e, { width: m.width, height: m.height }); } catch {}
      }
      store.addAsset(c.id, 'files', e);
      added.push(e.id);
    }
  }
  return { company: store.publicCompany(c), added };
}));

app.patch('/api/companies/:id/assets/:kind/:aid', h(async (req) => {
  const { id, kind, aid } = req.params;
  if (!['logos', 'files', 'styles'].includes(kind)) throw new Error('Geçersiz tür');
  const patch = { ...req.body };
  if (kind === 'files' && patch.role) {
    const c = store.getCompany(id);
    const f = c.files.find((x) => x.id === aid);
    if (f && !f.designFile && /^image\//.test(f.mime || '')) {
      const p = await render.prepareImage(fs.readFileSync(store.assetPath(c.id, f.file)), 1600);
      const dfile = `${f.id}-d.${p.ext}`;
      fs.writeFileSync(store.assetPath(c.id, dfile), p.buf);
      Object.assign(patch, { designFile: dfile, width: p.width, height: p.height, alpha: p.alpha });
    }
  }
  store.updateAsset(id, kind, aid, patch);
  return id === store.AGENCY_ID ? store.publicAgency() : store.publicCompany(store.getCompany(id));
}));
app.delete('/api/companies/:id/assets/:kind/:aid', h((req) => {
  store.removeAsset(req.params.id, req.params.kind, req.params.aid);
  return req.params.id === store.AGENCY_ID ? store.publicAgency() : store.publicCompany(store.getCompany(req.params.id));
}));
app.post('/api/companies/:id/files/:fid/edit', h(async (req) => brand.editCompanyImage(req.params.id, req.params.fid, req.body.op)));

// Örnek tasarımlar (firma ya da ilham arşivi: id = _ajans)
app.post('/api/companies/:id/styles', h(async (req) => {
  const ownerId = req.params.id;
  const o = store.owner(ownerId);
  if (!o) throw new Error('Bulunamadı');
  const limit = ownerId === store.AGENCY_ID ? 300 : 40;
  const added = [];
  for (const it of (req.body.items || []).slice(0, Math.max(0, limit - o.styles.length))) {
    const { buf } = store.parseDataUrl(it.dataUrl);
    const p = await render.prepareImage(buf, 1600);
    const e = store.writeAsset(ownerId, { name: it.name, buf: p.buf, mime: p.mime, ext: p.ext });
    Object.assign(e, { width: p.width, height: p.height });
    store.addAsset(ownerId, 'styles', e);
    added.push(e.id);
  }
  if (ownerId === store.AGENCY_ID && req.body.analyze !== false && added.length) bg('İlham tarama', () => brand.analyzeMany(added));
  return { added, owner: ownerId === store.AGENCY_ID ? store.publicAgency() : store.publicCompany(o) };
}));
app.put('/api/companies/:id/style-guide', h((req) => {
  const text = String(req.body.text || '').trim();
  store.setStyleGuide(req.params.id, text ? { ...(store.owner(req.params.id).styleGuide || {}), text, editedAt: store.now(), bundled: false } : null);
}));
app.post('/api/companies/:id/learn-style', h(async (req) => {
  await orch.learnStyle(req.params.id);
  return store.owner(req.params.id).styleGuide;
}));

// Marka Öğren
app.post('/api/companies/:id/learn-brand', h(async (req) => brand.learnBrand(req.params.id)));
app.put('/api/companies/:id/brand-profile', h((req) => {
  const text = String(req.body.text || '').trim();
  const c = store.getCompany(req.params.id);
  store.setBrandProfile(req.params.id, text ? { ...(c.brandProfile || {}), text, editedAt: store.now() } : null);
}));

// Hafıza
app.post('/api/companies/:id/memory', h((req) => store.addMemory(req.params.id, req.body.text, 'Siz')));
app.delete('/api/companies/:id/memory/:mid', h((req) => store.removeMemory(req.params.id, req.params.mid)));
app.post('/api/companies/:id/learn-now', h(async (req) => ({ added: await orch.learnNow(req.params.id) })));

// ---------------- Logo Stüdyosu ----------------

const L = '/api/companies/:id/logo-projects';
app.post(L, h((req) => logo.createProject(req.params.id, req.body)));
app.patch(`${L}/:pid`, h((req) => logo.updateProject(req.params.id, req.params.pid, req.body)));
app.delete(`${L}/:pid`, h((req) => logo.deleteProject(req.params.id, req.params.pid)));
app.post(`${L}/:pid/sketches`, h((req) => logo.addSketch(req.params.id, req.params.pid, req.body.dataUrl, req.body.name)));
app.delete(`${L}/:pid/sketches/:sid`, h((req) => logo.removeSketch(req.params.id, req.params.pid, req.params.sid)));
app.post(`${L}/:pid/concepts`, h((req) => { bg('Logo konseptleri', () => logo.generateConcepts(req.params.id, req.params.pid, req.body)); }));
app.post(`${L}/:pid/concepts/:kid/revise`, h((req) => { bg('Logo revizyonu', () => logo.reviseConcept(req.params.id, req.params.pid, req.params.kid, req.body.feedback, { variations: +req.body.variations || 0 })); }));
app.post(`${L}/:pid/concepts/:kid/undo`, h((req) => logo.undoConcept(req.params.id, req.params.pid, req.params.kid)));
app.delete(`${L}/:pid/concepts/:kid`, h((req) => logo.removeConcept(req.params.id, req.params.pid, req.params.kid)));
app.post(`${L}/:pid/finalize`, h((req) => { bg('Logo seti', () => logo.finalizeLogo(req.params.id, req.params.pid, req.body.conceptId)); }));
app.post(`${L}/:pid/icons`, h((req) => { bg('Uygulama ikonu', () => logo.generateIcons(req.params.id, req.params.pid, req.body)); }));
app.post(`${L}/:pid/use-as-logo`, h((req) => logo.useAsBrandLogo(req.params.id, req.params.pid, req.body.variantId)));
app.get(`${L}/:pid/export.zip`, h((req, res) => {
  const { name, files } = logo.exportFiles(req.params.id, req.params.pid);
  sendZip(res, name, files);
}));
// Logo önizlemesi (PNG): kind = concept | set | icon | final
app.get(`${L}/:pid/preview/:kind/:kid.:fmt`, h((req, res) => {
  const c = store.getCompany(req.params.id);
  const p = c?.logoProjects.find((x) => x.id === req.params.pid);
  if (!p) throw new Error('Bulunamadı');
  const { kind, kid, fmt } = req.params;
  const list = kind === 'concept' ? p.concepts : kind === 'set' ? p.final?.set || [] : kind === 'icon' ? p.icons || [] : [{ id: 'final', svg: p.final?.svg }];
  const item = list.find((x) => x.id === kid);
  if (!item?.svg) throw new Error('Bulunamadı');
  if (fmt === 'svg') {
    res.type('image/svg+xml');
    if (req.query.dl) res.attachment(`${exporter.slug(c.name)}-${exporter.slug(item.title || kind)}.svg`);
    return res.send(logo.outlineText(item.svg));
  }
  const w = Math.max(16, Math.min(4096, +req.query.w || 600));
  res.type('png');
  if (req.query.dl) res.attachment(`${exporter.slug(c.name)}-${exporter.slug(item.title || kind)}-${w}.png`);
  res.setHeader('Cache-Control', 'private, max-age=31536000, immutable');
  res.send(render.cachedPng(logo.outlineText(item.svg), w));
}));

// ---------------- ilham arşivi ----------------

app.get('/api/agency', h(() => store.publicAgency()));
app.put('/api/agency', h((req) => { store.setAgencyEnabled(req.body.enabled); return store.publicAgency(); }));
app.post('/api/agency/reset-guide', h(() => {
  const g = fs.readFileSync(path.join(ROOT, 'assets/ajans-stili/rehber.md'), 'utf8');
  store.setStyleGuide(store.AGENCY_ID, { text: g, learnedAt: null, sampleCount: 0, editedAt: null, bundled: true });
  return store.publicAgency();
}));
app.post('/api/agency/styles/:sid/analyze', h(async (req) => brand.analyzeInspiration(req.params.sid)));
app.post('/api/agency/analyze-missing', h(() => {
  const ids = store.getAgency().styles.filter((s) => !s.analysis).map((s) => s.id);
  bg('İlham tarama', () => brand.analyzeMany(ids));
  return { count: ids.length };
}));
app.patch('/api/agency/styles/:sid', h((req) => {
  const s = store.getAgency().styles.find((x) => x.id === req.params.sid);
  if (!s) throw new Error('Bulunamadı');
  if (req.body.name !== undefined) s.name = String(req.body.name).slice(0, 120);
  if (req.body.analysis) s.analysis = { ...(s.analysis || {}), ...req.body.analysis };
  if (req.body.collection !== undefined) s.collection = String(req.body.collection).slice(0, 60);
  store.flush();
  return s;
}));

// ---------------- Görsel Stüdyosu ----------------

app.post('/api/studio/prompt', h(async (req) => brand.composeImagePrompt(req.body)));
app.post('/api/studio/generate', h(async (req) => {
  const files = await brand.generateImages(req.body);
  return { files: files.map((f) => ({ ...f, url: store.assetUrl(req.body.companyId, f.file) })) };
}));

// ---------------- ajanlar ----------------

app.get('/api/agents', h(() => agents.list().map((a) => ({ ...a, lessons: store.agentLessons(a.name), tools: store.agentTools(a.name) }))));
app.put('/api/agents/:name', h((req) => {
  const a = agents.get(req.params.name);
  if (!a) throw new Error('Ajan bulunamadı');
  const text = String(req.body.prompt || '').trim();
  store.setAgentOverride(a.name, text && text !== a.original ? text : null);
}));
app.delete('/api/agents/:name/override', h((req) => store.setAgentOverride(req.params.name, null)));
app.post('/api/agents/:name/directives', h((req) => orch.addDirective(req.params.name, req.body.text)));
app.delete('/api/agents/:name/lessons/:lid', h((req) => store.removeAgentLesson(req.params.name, req.params.lid)));
app.post('/api/agents/:name/train', h(async (req) => orch.trainAgent(req.params.name, req.body.feedback, req.body)));
app.put('/api/agents/:name/tools', h((req) => store.setAgentTools(req.params.name, req.body.tools)));

// ---------------- dış araç rehberleri ----------------

app.get('/api/tools', h(() => store.listTools()));
app.post('/api/tools', h((req) => store.saveTool(req.body)));
app.delete('/api/tools/:id', h((req) => store.deleteTool(req.params.id)));
app.post('/api/tools/:id/learn', h((req) => { bg('Araç öğrenme', () => brand.learnTool(req.params.id)); }));

// ---------------- işler ----------------

app.get('/api/jobs', h((req) => store.listJobs(req.query.companyId).map((j) => ({ ...j, running: orch.isRunning(j.id) }))));
app.get('/api/jobs/:id', h((req) => {
  const j = store.getJob(req.params.id);
  if (!j) throw Object.assign(new Error('İş bulunamadı'), { status: 404 });
  return j;
}));
app.post('/api/jobs', h((req) => {
  if (!store.getSettings(false).apiKey) throw new Error('Önce Ayarlar ekranından Claude API anahtarını girin.');
  if (!store.getCompany(req.body.companyId)) throw new Error('Marka bulunamadı');
  return { id: orch.createAndRun(req.body) };
}));
app.delete('/api/jobs/:id', h((req) => {
  if (orch.isRunning(req.params.id)) throw new Error('Önce işi durdurun.');
  store.deleteJob(req.params.id);
}));
app.post('/api/jobs/:id/cancel', h((req) => orch.cancel(req.params.id)));
app.post('/api/jobs/:id/resume', h((req) => orch.resume(req.params.id)));
app.post('/api/jobs/:id/followup', h((req) => orch.followup(req.params.id, req.body.message)));

const D = '/api/jobs/:id/designs/:did';
app.post(`${D}/revise`, h((req) => { bg('Tasarım', () => orch.reviseDesign(req.params.id, req.params.did, req.body.variant, req.body.frame ?? null, req.body.feedback)); }));
app.post(`${D}/undo`, h((req) => orch.undoDesign(req.params.id, req.params.did, req.body.variant, req.body.frame || 0)));
app.post(`${D}/variant`, h((req) => { bg('Yeni boyut', () => orch.addVariant(req.params.id, req.params.did, req.body.format)); }));
app.post(`${D}/images`, h((req) => orch.setDesignImages(req.params.id, req.params.did, req.body.ids)));
app.post(`${D}/ai-image`, h((req) => { bg('AI görsel', () => orch.regenerateAiImage(req.params.id, req.params.did, req.body.variant, req.body.prompt)); }));
app.post(`${D}/video`, h(async (req) => {
  const job = store.getJob(req.params.id);
  const d = job?.designs.find((x) => x.id === req.params.did);
  const v = d?.variants.find((x) => x.key === (req.body.variant || d.variants[0].key));
  if (!v?.frames[0]?.svg) throw new Error('Önce tasarımı üretin.');
  const company = store.getCompany(job.companyId);
  const fin = render.finalize(v.frames[0].svg, company);
  const png = render.cachedPng(fin, v.width);
  const key = crypto.createHash('sha1').update(png).digest('hex') + '-pub.png';
  fs.writeFileSync(path.join(store.cacheDir(), key), png);
  const prompt = req.body.prompt || d.arac_promptlari?.Higgsfield || `Subtle cinematic camera push-in, gentle parallax and light movement, keep all text and logo perfectly stable and legible.`;
  bg('Video', async () => {
    const vid = await imagegen.imageToVideo({ imageUrl: publicUrl(req, key), prompt });
    const e = store.writeAsset(company.id, { name: `Video · #${d.no} ${d.gorsel_baslik || ''}`.slice(0, 80), buf: vid.buf, mime: vid.mime.includes('video') ? vid.mime : 'video/mp4', ext: 'mp4' });
    e.source = 'ai';
    store.addAsset(company.id, 'files', e);
    d.videos = [...(d.videos || []), { fileId: e.id, at: store.now(), prompt }];
    orch.emit(job);
    events.send('toast', { text: `#${d.no} için video hazır (Dosyalar sekmesinde).` });
  });
}));

// Tasarım çıktıları: PNG (önizleme ve indirme) ve SVG (yazı tipleri gömülü)
app.get(`${D}/:variant/:frame.:fmt`, h((req, res) => {
  const job = store.getJob(req.params.id);
  const d = job?.designs.find((x) => x.id === req.params.did);
  const v = d?.variants.find((x) => x.key === req.params.variant);
  const f = v?.frames[+req.params.frame];
  if (!f?.svg) return res.status(404).end();
  const company = store.getCompany(job.companyId);
  const base = `${exporter.designBaseName(d)}_${v.key}${d.kind === 'carousel' ? `_slayt-${+req.params.frame + 1}` : ''}`;
  if (req.params.fmt === 'svg') {
    res.type('image/svg+xml');
    if (req.query.dl) res.attachment(`${base}.svg`);
    return res.send(render.finalize(f.svg, company, { embedFonts: true }));
  }
  const w = req.query.w ? Math.max(100, Math.min(v.width * 2, +req.query.w)) : v.width;
  res.type('png');
  res.setHeader('Cache-Control', 'private, max-age=31536000, immutable');
  if (req.query.dl) res.attachment(`${base}.png`);
  res.send(render.cachedPng(render.finalize(f.svg, company), w));
}));
// Eski bir revizyonun önizlemesi
app.get(`${D}/:variant/:frame/history/:hi.png`, h((req, res) => {
  const job = store.getJob(req.params.id);
  const d = job?.designs.find((x) => x.id === req.params.did);
  const f = d?.variants.find((x) => x.key === req.params.variant)?.frames[+req.params.frame];
  const old = f?.history[+req.params.hi];
  if (!old) return res.status(404).end();
  res.type('png').send(render.cachedPng(render.finalize(old.svg, store.getCompany(job.companyId)), 480));
}));

function sendZip(res, name, files) {
  const buf = exporter.zip(name, files);
  res.setHeader('Content-Type', 'application/zip');
  res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(exporter.safeName(name))}.zip`);
  res.send(buf);
}

app.get('/api/jobs/:id/export.zip', h((req, res) => {
  const job = store.getJob(req.params.id);
  if (!job) throw new Error('İş bulunamadı');
  const { name, files } = exporter.jobFiles(job, { only: req.query.only, svg: req.query.svg !== '0' });
  sendZip(res, req.query.only === 'designs' ? `${name} - tasarımlar` : name, files);
}));
app.get('/api/jobs/:id/calendar.csv', h((req, res) => {
  const job = store.getJob(req.params.id);
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(exporter.safeName(job.title))}-takvim.csv`);
  res.send(exporter.calendarCsv(job));
}));

// Tüm verinin yedeği (db + varlıklar) — Ayarlar → Yedek
app.get('/api/backup.zip', h((req, res) => {
  store.flush();
  const files = { 'db.json': fs.readFileSync(path.join(DATA_DIR, 'db.json')) };
  const walk = (dir, rel) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      if (e.isDirectory()) walk(path.join(dir, e.name), `${rel}/${e.name}`);
      else files[`${rel}/${e.name}`] = fs.readFileSync(path.join(dir, e.name));
    }
  };
  if (fs.existsSync(store.assetRoot())) walk(store.assetRoot(), 'assets');
  sendZip(res, `ajans-yedek-${new Date().toISOString().slice(0, 10)}`, files);
}));

app.use('/api', (req, res) => res.status(404).json({ error: 'Bulunamadı' }));

// ---------------- arayüz ----------------

const DIST = path.join(ROOT, 'web', 'dist');
if (fs.existsSync(DIST)) {
  app.use(express.static(DIST, { index: false, maxAge: '1h' }));
  app.get('*', (req, res) => res.sendFile(path.join(DIST, 'index.html')));
} else {
  app.get('/', (req, res) => res.send('Arayüz derlenmemiş. "npm run build" çalıştırın ya da geliştirmede "npm run dev:web" kullanın.'));
}

app.listen(PORT, () => console.log(`Ajans Stüdyosu ${VERSION}${COMMIT ? ' (' + COMMIT + ')' : ''} → http://localhost:${PORT} · veri: ${DATA_DIR}`));
