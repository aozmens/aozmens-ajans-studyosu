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
  procs.push(spawn(process.execPath, [path.join(ROOT, 'server/index.js')], { env: { ...process.env, PORT: String(PORT), DATA_DIR: DATA, APP_PASSWORD: '', ANTHROPIC_API_KEY: 'test' }, stdio: 'ignore' }));
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
