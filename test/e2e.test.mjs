// Uçtan uca test: sahte Claude sunucusuyla marka → iş (post + story + carousel) → dışa aktarma, logo stüdyosu ve ajan eğitimi.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import sharp from 'sharp';

const ROOT = new URL('..', import.meta.url).pathname;
const PORT = 3600 + Math.floor(Math.random() * 300);
const MOCK = PORT + 1;
const BASE = `http://127.0.0.1:${PORT}`;
const DATA = fs.mkdtempSync(path.join(os.tmpdir(), 'ajans-test-'));
const procs = [];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function api(method, p, body) {
  const r = await fetch(BASE + p, { method, headers: body ? { 'content-type': 'application/json' } : {}, body: body ? JSON.stringify(body) : undefined });
  const ct = r.headers.get('content-type') || '';
  const data = ct.includes('json') ? await r.json() : Buffer.from(await r.arrayBuffer());
  if (!r.ok) throw new Error(`${method} ${p}: ${r.status} ${JSON.stringify(data)}`);
  return data;
}
async function until(fn, ms = 60000) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    const v = await fn();
    if (v) return v;
    await sleep(300);
  }
  throw new Error('zaman aşımı');
}

before(async () => {
  procs.push(spawn(process.execPath, [path.join(ROOT, 'test/mock-claude.mjs'), String(MOCK)], { stdio: 'ignore' }));
  procs.push(spawn(process.execPath, [path.join(ROOT, 'server/index.js')], { env: { ...process.env, PORT: String(PORT), DATA_DIR: DATA, APP_PASSWORD: '', ANTHROPIC_API_KEY: 'test', OPENAI_BASE_URL: `http://127.0.0.1:${MOCK}` }, stdio: 'ignore' }));
  await until(() => fetch(BASE + '/api/health').then((r) => r.ok).catch(() => false), 20000);
  await api('PUT', '/api/settings', { baseUrl: `http://127.0.0.1:${MOCK}`, designQa: 0 });
});
after(() => {
  for (const p of procs) p.kill();
  fs.rmSync(DATA, { recursive: true, force: true });
});

test('iş akışı: yalnızca ilgili ajanlar, post + story, carousel, token ve klasör çıktısı', async () => {
  const { id: cid } = await api('POST', '/api/companies', { name: 'Test Kahve', sector: 'Kahve' });
  const { id } = await api('POST', '/api/jobs', {
    companyId: cid, type: 'sosyal-medya-aylik', title: 'Kasım',
    options: { makeDesigns: true, formats: ['post', 'story'], postCount: 2, carouselCount: 1, slideCount: 3 },
  });
  const job = await until(async () => { const j = await api('GET', `/api/jobs/${id}`); return j.status !== 'running' && j; });
  assert.equal(job.status, 'done', job.error);
  const agentsRun = job.steps.filter((s) => s.kind === 'agent').map((s) => s.agent);
  assert.ok(!agentsRun.includes('seo-uzmani'), 'ilgisiz ajan çalışmamalı');
  const car = job.designs.find((d) => d.kind === 'carousel');
  assert.ok(car, 'carousel üretilmeli');
  assert.deepEqual(car.variants.map((v) => v.key), ['post', 'story']);
  assert.ok(car.variants.every((v) => v.frames.length === 3 && v.frames.every((f) => f.svg)));
  const single = job.designs.find((d) => d.kind === 'single');
  assert.deepEqual(single.variants.map((v) => [v.width, v.height]), [[1080, 1350], [1080, 1920]]);
  assert.ok(job.usage.input > 0 && job.usage.cost > 0, 'token sayılmalı');
  assert.ok(job.steps.find((s) => s.kind === 'designs').usage?.input > 0, 'tasarım adımının tokenı görünmeli');
  const png = await api('GET', `/api/jobs/${id}/designs/${single.id}/story/0.png`);
  assert.equal(png.subarray(1, 4).toString(), 'PNG');
  const zip = await api('GET', `/api/jobs/${id}/export.zip?only=designs`);
  const names = zip.toString('latin1');
  assert.match(names, /Story \(1080x1920\)/);
  assert.match(names, /Carousel\//);
});

test('logo stüdyosu: eskiz, konsept, final set, ikonlar, vektör ve PNG paketi', async () => {
  const [c] = await api('GET', '/api/companies');
  const p = await api('POST', `/api/companies/${c.id}/logo-projects`, { name: 'Logo' });
  const white = 'data:image/png;base64,' + (await sharp({ create: { width: 64, height: 64, channels: 3, background: '#ffffff' } }).png().toBuffer()).toString('base64');
  await api('POST', `/api/companies/${c.id}/logo-projects/${p.id}/sketches`, { dataUrl: white });
  const proj = async () => (await api('GET', `/api/companies/${c.id}`)).logoProjects.find((x) => x.id === p.id);
  // Eskiz taraması: 2-3 soru, cevaplar, örnek logo, hazır ikon ve palet seçimi
  await api('POST', `/api/companies/${c.id}/logo-projects/${p.id}/refs`, { dataUrl: white, name: 'ornek.png' });
  await api('POST', `/api/companies/${c.id}/logo-projects/${p.id}/scan`);
  const scanned = await until(async () => { const x = await proj(); return !x.busy && x.scan && x; });
  assert.equal(scanned.scan.questions.length, 2);
  assert.equal(scanned.scan.questions[0].secenekler[1], 'Holografik');
  assert.equal(scanned.refs.length, 1);
  await api('PATCH', `/api/companies/${c.id}/logo-projects/${p.id}`, { answers: { stil: 'Holografik' }, iconMode: 'hazir', colors: ['#7F5AF0', '#2CB1BC'] });
  const saved = await proj();
  assert.equal(saved.answers.stil, 'Holografik');
  assert.equal(saved.iconMode, 'hazir');
  await api('POST', `/api/companies/${c.id}/logo-projects/${p.id}/concepts`, { count: 4 });
  const withConcepts = await until(async () => { const x = await proj(); return !x.busy && x.concepts.length && x; });
  assert.equal(withConcepts.concepts[1].title, 'Deneme 2');
  await api('POST', `/api/companies/${c.id}/logo-projects/${p.id}/finalize`, { conceptId: withConcepts.concepts[0].id });
  await until(async () => { const x = await proj(); return !x.busy && x.final?.set?.length; });
  await api('POST', `/api/companies/${c.id}/logo-projects/${p.id}/icons`, {});
  const done = await until(async () => { const x = await proj(); return !x.busy && x.icons.length === 2 && x; });
  const svg = (await api('GET', `/api/companies/${c.id}/logo-projects/${p.id}/preview/final/final.svg`)).toString();
  assert.ok(!/<text/.test(svg) && /<path/.test(svg), 'yazılar yola çevrilmeli');
  const zip = (await api('GET', `/api/companies/${c.id}/logo-projects/${p.id}/export.zip`)).toString('latin1');
  assert.match(zip, /uygulama-ikonu\/A-/);
  assert.match(zip, /favicon\.ico/);
  assert.ok(done.final.set.length === 4);
});

test('ajan eğitimi direktif ekler', async () => {
  const r = await api('POST', '/api/agents/frontend-gelistirici/train', { feedback: 'Gereksiz kod yazma' });
  assert.equal(r.added.length, 1);
  const a = (await api('GET', '/api/agents')).find((x) => x.name === 'frontend-gelistirici');
  assert.ok(a.lessons.some((l) => /kullanılmayan/.test(l.text)));
});

test('grafik tasarımcı: tasarım dili PDF, mockup, marka dosyası, ürün promptu, klasörler', async () => {
  const red = 'data:image/png;base64,' + (await sharp({ create: { width: 200, height: 120, channels: 4, background: { r: 200, g: 16, b: 46, alpha: 1 } } }).extend({ top: 20, bottom: 20, left: 20, right: 20, background: { r: 0, g: 0, b: 0, alpha: 0 } }).png().toBuffer()).toString('base64');
  const { id: cid } = await api('POST', '/api/companies', { name: 'Klasör Kahve' });
  await api('POST', `/api/companies/${cid}/logos`, { name: 'logo.png', dataUrl: red });
  // 8: firma klasörü ve okunur alt klasörler
  const tree = await api('GET', `/api/companies/${cid}/folder`);
  assert.equal(tree.folder, 'Klasör Kahve');
  assert.equal(tree.folders.find((f) => f.name === '01 Logolar').count, 1);
  assert.ok(fs.existsSync(path.join(DATA, 'firmalar', 'Klasör Kahve', '01 Logolar')));

  // 1: ilham → tasarım dili PDF (makine tarafından okunur JSON eki)
  const up = await api('POST', '/api/companies/_ajans/styles', { items: [{ name: 'ilham.png', dataUrl: red }] });
  await until(async () => (await api('GET', '/api/agency')).styles.find((s) => s.id === up.added[0])?.analysis);
  const dl = await api('POST', '/api/agency/design-languages', { inspirationIds: up.added });
  const ready = await until(async () => { const a = await api('GET', '/api/agency'); const d = a.designLanguages.find((x) => x.id === dl.id); return d?.status !== 'running' && d; });
  assert.equal(ready.status, 'done', ready.error);
  const pdfBuf = await api('GET', ready.pdfUrl);
  assert.equal(pdfBuf.subarray(0, 4).toString(), '%PDF');
  assert.match(pdfBuf.toString('latin1'), /tasarim-dili\.json/);
  const js = await api('GET', `/api/agency/design-languages/${dl.id}/json`);
  assert.equal(js.type, 'design-language');
  assert.match(js.masterPrompt, /\[SUBJECT\]/);

  // 2: mockup yükle → tara → markaya yerleştir; hazır mockuplar
  const ml = await api('GET', '/api/mockups');
  assert.ok(ml.some((m) => m.id === 'hazir-kartvizit'));
  const mu = await api('POST', '/api/mockups', { items: [{ name: 'kupa.png', dataUrl: red }] });
  const scanned = await until(async () => (await api('GET', '/api/mockups')).find((m) => m.id === mu.added[0] && m.analysis));
  assert.equal(scanned.blend, 'multiply');
  const applied = await api('POST', `/api/mockups/${mu.added[0]}/apply`, { companyId: cid });
  assert.match(applied.file, /^05 Mockuplar\//);
  const prev = await api('GET', `/api/mockups/hazir-uygulama/preview.png?companyId=${cid}`);
  assert.equal(prev.subarray(1, 4).toString(), 'PNG');

  // 4: ürün görseli taranır, prompt ürünle kurulur
  const pr = await api('POST', `/api/companies/${cid}/files`, { items: [{ name: 'paket.png', dataUrl: red }], role: 'urun' });
  const prod = await api('POST', `/api/companies/${cid}/files/${pr.added[0]}/analyze`);
  assert.match(prod.analysis.prompt, /kraft/);
  assert.match(prod.file, /^04 Ürünler\//);
  const sp = await api('POST', '/api/studio/prompt', { companyId: cid, inspirationIds: up.added, productFileId: pr.added[0], subject: '' });
  assert.ok(sp.prompt && sp.productFileId === pr.added[0]);

  // 5-6: font seçimi ve müşterinin seçim sayfası
  await api('POST', '/api/companies', { id: cid, fontHeading: 'Playfair Display', fontBody: 'Inter' });
  const { url } = await api('POST', `/api/companies/${cid}/choice-link`);
  const pagePath = new URL(url).pathname;
  const html = (await api('GET', pagePath)).toString();
  assert.match(html, /Renk kartelası/);
  await api('POST', pagePath, { palette: ['#0B1F3A', '#1E4FD8'], fontHeading: 'Montserrat', fontBody: 'Inter', note: 'lacivert' });
  const applied2 = await api('POST', `/api/companies/${cid}/apply-choice`);
  assert.equal(applied2.palette[0].hex, '#0B1F3A');
  assert.equal(applied2.fontHeading, 'Montserrat');

  // 3: yeni işte marka dosyası (PDF) + iş klasörü
  const { id: jid } = await api('POST', '/api/jobs', { companyId: cid, type: 'tasarim', title: 'Lansman', options: { makeDesigns: true, formats: ['post'], postCount: 1, brandBook: true, brandBookMockups: ['hazir-kartvizit', 'hazir-uygulama', mu.added[0]] } });
  const job = await until(async () => { const j = await api('GET', `/api/jobs/${jid}`); return j.status !== 'running' && j; });
  assert.equal(job.status, 'done', job.error);
  const bbStep = job.steps.find((s) => s.kind === 'brandbook');
  assert.equal(bbStep.status, 'done', bbStep.output);
  const co = await api('GET', `/api/companies/${cid}`);
  assert.equal(co.brandBooks.length, 1);
  const book = await api('GET', co.brandBooks[0].url);
  assert.equal(book.subarray(0, 4).toString(), '%PDF');
  assert.ok(book.length > 20000);
  assert.ok(job.folder && fs.existsSync(path.join(DATA, 'firmalar', 'Klasör Kahve', job.folder)), 'iş klasörü yazılmalı');
  const zip = (await api('GET', `/api/companies/${cid}/folder.zip`)).toString('latin1');
  assert.match(zip, /02 Marka Dosyas/);
  assert.ok(!/\.kopyalar/.test(zip), 'türetilmiş kopyalar ZIP\'e girmemeli');
});

test('web klon: sayfa, CSS ve görseller indirilir; Claude yeniden kurar', async () => {
  const http = await import('node:http');
  const png = await sharp({ create: { width: 8, height: 8, channels: 3, background: '#ff0000' } }).png().toBuffer();
  const site = http.createServer((req, res) => {
    if (req.url === '/') { res.setHeader('content-type', 'text/html'); return res.end('<html><head><title>Örnek</title><link rel="stylesheet" href="/s/site.css"></head><body><img src="img/a.png" srcset="img/a.png 1x, /img/b.png 2x"><script src="/app.js"></script></body></html>'); }
    if (req.url === '/s/site.css') { res.setHeader('content-type', 'text/css'); return res.end('body{background:url("../img/bg.png")}'); }
    if (req.url === '/app.js') { res.setHeader('content-type', 'text/javascript'); return res.end('alert(1)'); }
    if (req.url.startsWith('/img/')) { res.setHeader('content-type', 'image/png'); return res.end(png); }
    res.statusCode = 404; res.end();
  }).listen(0);
  const sitePort = site.address().port;
  try {
    const [c] = await api('GET', '/api/companies');
    const w = await api('POST', `/api/companies/${c.id}/webclone`, { url: `http://127.0.0.1:${sitePort}/`, mode: 'claude', adapt: true });
    const done = await until(async () => { const x = (await api('GET', `/api/companies/${c.id}`)).webClones.find((y) => y.id === w.id); return x.status !== 'running' && x; });
    assert.equal(done.status, 'done', done.error);
    assert.equal(done.files, 5);
    assert.equal(done.entry, 'yeniden-kurulum.html');
    const dir = path.join(DATA, 'firmalar', c.folder, done.folder);
    const idx = fs.readFileSync(path.join(dir, 'index.html'), 'utf8');
    assert.match(idx, /href="assets\/site-[0-9a-f]{6}\.css"/);
    assert.match(idx, /type="text\/plain" data-klon-devre-disi/);
    const css = fs.readdirSync(path.join(dir, 'assets')).find((f) => f.endsWith('.css'));
    assert.match(fs.readFileSync(path.join(dir, 'assets', css), 'utf8'), /url\("bg-[0-9a-f]{6}\.png"\)/);
    const r = await fetch(BASE + done.previewUrl);
    assert.match(r.headers.get('content-security-policy') || '', /sandbox/);
    const zip = (await api('GET', `/api/companies/${c.id}/webclone/${w.id}/export.zip`)).toString('latin1');
    assert.match(zip, /yeniden-kurulum\.html/);
  } finally { site.close(); }
});

test('GPT Image tasarım motoru: bitmiş görsel + gerçek logo, motor etiketi, Claude tasarımını GPT ile yeniden üretme', async () => {
  await api('PUT', '/api/settings', { integrations: { openai: { apiKey: 'sk-proj-testtesttesttesttesttest01' } } });
  const { id: cid } = await api('POST', '/api/companies', { name: 'GPT Marka', sector: 'Robotik' });
  const { id } = await api('POST', '/api/jobs', {
    companyId: cid, type: 'sosyal-medya-aylik', title: 'GPT',
    options: { makeDesigns: true, formats: ['post', 'story'], postCount: 1, designEngine: 'gpt' },
  });
  const job = await until(async () => { const j = await api('GET', `/api/jobs/${id}`); return j.status !== 'running' && j; });
  assert.equal(job.status, 'done', job.error);
  const v = job.designs[0].variants;
  assert.ok(v.every((x) => x.status === 'done' && x.frames[0].engine === 'gpt'), 'GPT motoruyla üretilmeli');
  assert.match(v[0].frames[0].svg, /\{\{IMG:[\w-]+\}\}/);
  assert.ok(job.usage.images >= 2, 'görsel sayısı işe yazılmalı');
  const png = await api('GET', `/api/jobs/${id}/designs/${job.designs[0].id}/post/0.png`);
  assert.equal(png.subarray(1, 4).toString(), 'PNG');
  const c = await api('GET', `/api/companies/${cid}`);
  assert.ok(c.files.some((f) => f.role === 'tasarim'), 'tasarım firma dosyalarına kaydedilmeli');

  // İlk testteki Claude SVG işi GPT ile yeniden tasarlanır; eski tasarım geri alma geçmişinde kalır
  const old = (await api('GET', '/api/jobs')).find((j) => j.title === 'Kasım');
  await api('POST', `/api/jobs/${old.id}/redesign`, { engine: 'gpt' });
  const re = await until(async () => { const j = await api('GET', `/api/jobs/${old.id}`); return j.status !== 'running' && j; });
  assert.equal(re.status, 'done', re.error);
  const f0 = re.designs[0].variants[0].frames[0];
  assert.equal(f0.engine, 'gpt');
  assert.ok(f0.history.length >= 1, 'eski tasarım geçmişte kalmalı');
});
