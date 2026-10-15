// Görsel motorları: Clipdrop, fal.ai (Flux), OpenAI Images, Google Gemini, Higgsfield.
// Hepsi aynı arayüzü kullanır: generate({ prompt, width, height, refs }) → [{ buf, mime }]
import * as store from './store.js';

const RATIOS = ['21:9', '16:9', '3:2', '4:3', '5:4', '1:1', '4:5', '3:4', '2:3', '9:16', '9:21'];
const ratioValue = (r) => { const [a, b] = r.split(':').map(Number); return a / b; };
export function nearestRatio(w, h, allowed = RATIOS) {
  const t = w / h;
  return allowed.reduce((best, r) => (Math.abs(Math.log(ratioValue(r) / t)) < Math.abs(Math.log(ratioValue(best) / t)) ? r : best), allowed[0]);
}

// Görsel başına yaklaşık maliyet (USD); token ekranında tahmini gösterilir
export const APPROX_COST = { clipdrop: 0.02, fal: 0.06, openai: 0.17, gemini: 0.04, higgsfield: 0.05 };

export const PROVIDERS = {
  clipdrop: { label: 'Clipdrop', kinds: ['görsel', 'arka plan silme', 'büyütme'], refs: false },
  fal: { label: 'fal.ai (Flux)', kinds: ['görsel'], refs: false },
  openai: { label: 'OpenAI Images', kinds: ['görsel'], refs: false },
  gemini: { label: 'Google Gemini (Nano Banana)', kinds: ['görsel', 'referanslı görsel'], refs: true },
  higgsfield: { label: 'Higgsfield', kinds: ['görsel', 'video'], refs: false },
};

const cfg = (name) => store.getSettings(false).integrations[name] || {};

export function isConnected(name) {
  const c = cfg(name);
  if (name === 'higgsfield') return !!(c.keyId && c.secret);
  return !!c.apiKey;
}

export const connected = () => Object.keys(PROVIDERS).filter(isConnected);

async function check(res, label) {
  if (res.ok) return res;
  let msg = '';
  try { msg = await res.text(); } catch {}
  throw new Error(`${label} hatası (HTTP ${res.status}): ${msg.slice(0, 300)}`);
}

async function download(url, signal) {
  const r = await check(await fetch(url, { signal }), 'Görsel indirme');
  return { buf: Buffer.from(await r.arrayBuffer()), mime: r.headers.get('content-type') || 'image/png' };
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const impl = {
  async clipdrop({ prompt, signal }) {
    const form = new FormData();
    form.append('prompt', prompt.slice(0, 1000));
    const r = await check(await fetch('https://clipdrop-api.co/text-to-image/v1', { method: 'POST', headers: { 'x-api-key': cfg('clipdrop').apiKey }, body: form, signal }), 'Clipdrop');
    return [{ buf: Buffer.from(await r.arrayBuffer()), mime: 'image/png' }];
  },

  async fal({ prompt, width, height, signal }) {
    const c = cfg('fal');
    const model = c.model || 'fal-ai/flux-pro/v1.1-ultra';
    const body = { prompt, num_images: 1, output_format: 'jpeg', enable_safety_checker: true };
    if (/ultra/.test(model)) body.aspect_ratio = nearestRatio(width, height, ['21:9', '16:9', '4:3', '3:2', '1:1', '2:3', '3:4', '9:16', '9:21']);
    else body.image_size = { width: Math.round(width / 16) * 16, height: Math.round(height / 16) * 16 };
    const r = await check(await fetch(`https://fal.run/${model}`, { method: 'POST', headers: { Authorization: `Key ${c.apiKey}`, 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal }), 'fal.ai');
    const j = await r.json();
    const urls = (j.images || []).map((x) => x.url).filter(Boolean);
    if (!urls.length) throw new Error('fal.ai görsel döndürmedi.');
    return Promise.all(urls.map((u) => download(u, signal)));
  },

  async openai({ prompt, width, height, signal }) {
    const c = cfg('openai');
    const ratio = width / height;
    const size = ratio > 1.15 ? '1536x1024' : ratio < 0.87 ? '1024x1536' : '1024x1024';
    const r = await check(await fetch('https://api.openai.com/v1/images/generations', {
      method: 'POST', headers: { Authorization: `Bearer ${c.apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: c.model || 'gpt-image-1', prompt, size, quality: 'high', n: 1 }), signal,
    }), 'OpenAI');
    const j = await r.json();
    return (j.data || []).map((d) => ({ buf: Buffer.from(d.b64_json, 'base64'), mime: 'image/png' }));
  },

  async gemini({ prompt, width, height, refs = [], signal }) {
    const c = cfg('gemini');
    const model = c.model || 'gemini-2.5-flash-image';
    const parts = [...refs.slice(0, 3).map((x) => ({ inlineData: { mimeType: x.mime, data: x.data } })), { text: prompt }];
    const r = await check(await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
      method: 'POST', headers: { 'x-goog-api-key': c.apiKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({ contents: [{ parts }], generationConfig: { responseModalities: ['IMAGE'], imageConfig: { aspectRatio: nearestRatio(width, height, ['1:1', '2:3', '3:2', '3:4', '4:3', '4:5', '5:4', '9:16', '16:9', '21:9']) } } }),
      signal,
    }), 'Gemini');
    const j = await r.json();
    const out = [];
    for (const p of j.candidates?.[0]?.content?.parts || []) if (p.inlineData?.data) out.push({ buf: Buffer.from(p.inlineData.data, 'base64'), mime: p.inlineData.mimeType || 'image/png' });
    if (!out.length) throw new Error('Gemini görsel döndürmedi' + (j.promptFeedback?.blockReason ? ` (${j.promptFeedback.blockReason})` : '.'));
    return out;
  },

  async higgsfield({ prompt, width, height, signal }) {
    const c = cfg('higgsfield');
    const j = await higgsfieldRun(c.imageModel || 'higgsfield-ai/soul/v2/standard', { prompt, aspect_ratio: nearestRatio(width, height, ['1:1', '3:4', '4:3', '2:3', '3:2', '9:16', '16:9']) }, signal);
    const urls = (j.images || []).map((x) => x.url).filter(Boolean);
    if (!urls.length) throw new Error('Higgsfield görsel döndürmedi.');
    return Promise.all(urls.map((u) => download(u, signal)));
  },
};

// Higgsfield: istek gönder → status_url'yi tamamlanana kadar yokla
async function higgsfieldRun(model, body, signal) {
  const c = cfg('higgsfield');
  let extra = {};
  try { extra = c.extra ? JSON.parse(c.extra) : {}; } catch { throw new Error('Higgsfield ek parametreleri geçerli JSON değil.'); }
  const headers = { Authorization: `Key ${c.keyId}:${c.secret}`, 'Content-Type': 'application/json' };
  const r = await check(await fetch(`https://api.higgsfield.ai/${model.replace(/^\/+/, '')}`, { method: 'POST', headers, body: JSON.stringify({ ...body, ...extra }), signal }), 'Higgsfield');
  let j = await r.json();
  const statusUrl = j.status_url || (j.request_id && `https://api.higgsfield.ai/requests/${j.request_id}/status`);
  const started = Date.now();
  while (!['completed', 'failed', 'nsfw', 'canceled'].includes(j.status)) {
    if (Date.now() - started > 15 * 60 * 1000) throw new Error('Higgsfield 15 dakikada sonuç vermedi.');
    await sleep(4000);
    if (signal?.aborted) throw new Error('İptal edildi');
    j = await (await check(await fetch(statusUrl, { headers, signal }), 'Higgsfield')).json();
  }
  if (j.status !== 'completed') throw new Error(`Higgsfield isteği tamamlanamadı (${j.status}).`);
  return j;
}

export async function generate(provider, { prompt, width = 1080, height = 1350, refs = [], signal }) {
  const name = provider || store.getSettings(false).imageProvider || connected()[0];
  if (!name || !impl[name]) throw new Error('Görsel motoru seçilmemiş. Ayarlar → Entegrasyonlar bölümünden bir görsel motoru bağlayın.');
  if (!isConnected(name)) throw new Error(`${PROVIDERS[name].label} bağlı değil. Ayarlar → Entegrasyonlar bölümünden API anahtarını girin.`);
  const out = await impl[name]({ prompt, width, height, refs, signal });
  store.logUsage({ kind: 'image', provider: name, images: out.length, imageCost: APPROX_COST[name] * out.length });
  return { provider: name, images: out, cost: APPROX_COST[name] * out.length };
}

// Clipdrop: arka planı siler (şeffaf PNG)
export async function removeBackground(buf, mime = 'image/png') {
  if (!isConnected('clipdrop')) throw new Error('Arka plan silme için Clipdrop bağlı olmalı.');
  const form = new FormData();
  form.append('image_file', new Blob([buf], { type: mime }), 'image.' + (mime.split('/')[1] || 'png'));
  const r = await check(await fetch('https://clipdrop-api.co/remove-background/v1', { method: 'POST', headers: { 'x-api-key': cfg('clipdrop').apiKey }, body: form }), 'Clipdrop');
  store.logUsage({ kind: 'image', provider: 'clipdrop', images: 1, imageCost: APPROX_COST.clipdrop });
  return Buffer.from(await r.arrayBuffer());
}

// Clipdrop: görseli büyütür (en fazla 4096 px)
export async function upscale(buf, mime, width, height) {
  if (!isConnected('clipdrop')) throw new Error('Büyütme için Clipdrop bağlı olmalı.');
  const k = Math.min(4096 / width, 4096 / height, 2);
  const form = new FormData();
  form.append('image_file', new Blob([buf], { type: mime }), 'image.' + (mime.split('/')[1] || 'png'));
  form.append('target_width', String(Math.round(width * k)));
  form.append('target_height', String(Math.round(height * k)));
  const r = await check(await fetch('https://clipdrop-api.co/image-upscaling/v1/upscale', { method: 'POST', headers: { 'x-api-key': cfg('clipdrop').apiKey }, body: form }), 'Clipdrop');
  store.logUsage({ kind: 'image', provider: 'clipdrop', images: 1, imageCost: APPROX_COST.clipdrop });
  return { buf: Buffer.from(await r.arrayBuffer()), mime: r.headers.get('content-type') || 'image/jpeg' };
}

// Higgsfield: görselden video (Reels). imageUrl herkese açık olmalı (sunucu imzalı bağlantı üretir).
export async function imageToVideo({ imageUrl, prompt, signal }) {
  const c = cfg('higgsfield');
  if (!isConnected('higgsfield')) throw new Error('Video için Higgsfield bağlı olmalı.');
  if (!c.videoModel) throw new Error('Ayarlar → Entegrasyonlar → Higgsfield bölümünde video modeli yolunu girin (Higgsfield model listesinden, ör. görselden videoya modeli).');
  const j = await higgsfieldRun(c.videoModel, { image_url: imageUrl, prompt }, signal);
  const url = j.video?.url || j.videos?.[0]?.url;
  if (!url) throw new Error('Higgsfield video döndürmedi.');
  store.logUsage({ kind: 'video', provider: 'higgsfield', images: 1, imageCost: APPROX_COST.higgsfield * 4 });
  return download(url, signal);
}

export async function test(name) {
  if (name === 'clipdrop') {
    // Ücretsiz kontrol yok; küçük bir istek gönderir
    await impl.clipdrop({ prompt: 'a single small red dot on white background' });
    return 'Bağlantı tamam';
  }
  await generate(name, { prompt: 'a minimal flat red circle on a white background', width: 1024, height: 1024 });
  return 'Bağlantı tamam (test görseli üretildi)';
}
