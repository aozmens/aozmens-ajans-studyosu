// Claude Messages API istemcisi (resmi SDK, akışlı). Kesilen yanıtı "devam et" ile tamamlar,
// geçici hatalarda yeniden dener, token kullanımını ve maliyetini hesaplar.
import Anthropic from '@anthropic-ai/sdk';
import * as store from './store.js';

// $ / 1M token (girdi, çıktı, önbellek okuma, önbellek yazma)
export const PRICES = {
  'claude-opus-5-5': { input: 4, output: 20, cacheRead: 0.2, cacheWrite: 5 },
  'claude-sonnet-5-5': { input: 2, output: 10, cacheRead: 0.2, cacheWrite: 2.5 },
  'claude-haiku-5-5': { input: 0.1, output: 0.5, cacheRead: 0.01, cacheWrite: 0.125 },
  'claude-fable-5-1': { input: 10, output: 50, cacheRead: 0.25, cacheWrite: 12.5 },
};

export function costOf(model, u) {
  const p = PRICES[model] || PRICES['claude-opus-5-5'];
  return ((u.input || 0) * p.input + (u.output || 0) * p.output + (u.cacheRead || 0) * p.cacheRead + (u.cacheWrite || 0) * p.cacheWrite) / 1e6;
}

export function sumUsage(a, b) {
  const out = { ...a };
  for (const k of ['input', 'output', 'cacheRead', 'cacheWrite', 'cost', 'images', 'imageCost']) out[k] = (a?.[k] || 0) + (b?.[k] || 0);
  return out;
}

let cached = { key: null, base: null, client: null };
function client() {
  const s = store.getSettings(false);
  if (!s.apiKey) {
    const e = new Error('Claude API anahtarı girilmemiş. Ayarlar ekranından ekleyin (ya da sunucuda ANTHROPIC_API_KEY tanımlayın).');
    e.status = 401;
    throw e;
  }
  const base = s.baseUrl || undefined;
  if (cached.key !== s.apiKey || cached.base !== base) {
    cached = { key: s.apiKey, base, client: new Anthropic({ apiKey: s.apiKey, baseURL: base, maxRetries: 0, timeout: 20 * 60 * 1000 }) };
  }
  return cached.client;
}

function friendly(status, msg) {
  const t = {
    400: 'İstek reddedildi',
    401: 'API anahtarı geçersiz. Ayarlar ekranından kontrol edin',
    403: 'Bu API anahtarının bu işleme izni yok',
    404: 'Model bulunamadı. Ayarlar ekranında model adını kontrol edin',
    429: 'Claude kullanım limiti doldu, biraz sonra tekrar denenecek',
    529: 'Claude şu an yoğun',
  }[status];
  return t ? `${t}. (${msg})` : msg;
}

const sleep = (ms, signal) => new Promise((res, rej) => {
  const t = setTimeout(res, ms);
  signal?.addEventListener('abort', () => { clearTimeout(t); rej(new Error('İptal edildi')); }, { once: true });
});

async function streamOnce({ model, system, messages, maxTokens, onText, signal }) {
  const s = store.getSettings(false);
  const body = {
    model,
    max_tokens: maxTokens,
    messages,
    output_config: { effort: s.effort || 'medium' },
  };
  if (system) body.system = system;
  const opts = { signal };
  let stream;
  if (s.fallbacks !== false && /^claude-(opus-5|sonnet-5-5|fable)/.test(model)) {
    stream = client().beta.messages.stream({ ...body, betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default' }, opts);
  } else {
    stream = client().messages.stream(body, opts);
  }
  let text = '';
  stream.on('text', (t) => { text += t; onText && onText(t); });
  const msg = await stream.finalMessage();
  if (msg.stop_reason === 'refusal') {
    const e = new Error('Claude bu isteği güvenlik nedeniyle yanıtlamadı' + (msg.stop_details?.category ? ` (${msg.stop_details.category})` : '') + '. İsteği farklı ifade edip tekrar deneyin.');
    e.status = 400;
    e.refusal = true;
    throw e;
  }
  const u = msg.usage || {};
  const usage = {
    input: u.input_tokens || 0,
    output: u.output_tokens || 0,
    cacheRead: u.cache_read_input_tokens || 0,
    cacheWrite: u.cache_creation_input_tokens || 0,
  };
  usage.cost = costOf(model, usage);
  if (!text) text = (msg.content || []).filter((b) => b.type === 'text').map((b) => b.text).join('');
  return { text, usage, stopReason: msg.stop_reason };
}

// tag: kullanım günlüğünde iş/marka/ajan bilgisi (token ekranı için)
export async function call({ model, system, messages, maxTokens = 16000, onText, signal, continueOnMax = true, tag = {} }) {
  const m = model || store.getSettings(false).model;
  let usage = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, cost: 0 };
  let text = '';
  let msgs = messages;
  for (let round = 0; round < 3; round++) {
    let r;
    for (let attempt = 0; ; attempt++) {
      try {
        r = await streamOnce({ model: m, system, messages: msgs, maxTokens, onText, signal });
        break;
      } catch (e) {
        if (signal?.aborted) throw new Error('İptal edildi');
        const status = e.status;
        const transient = !e.refusal && (!status || status === 429 || status >= 500);
        if (!transient || attempt >= 4) {
          const err = new Error(friendly(status, e.error?.error?.message || e.message));
          err.status = status;
          throw err;
        }
        onText && onText(`\n[Bağlantı sorunu, yeniden deneniyor (${attempt + 1}/4)…]\n`);
        await sleep(Math.min(30000, 2000 * 2 ** attempt), signal);
      }
    }
    text += r.text;
    usage = sumUsage(usage, r.usage);
    if (r.stopReason !== 'max_tokens' || !continueOnMax) {
      store.logUsage({ model: m, ...usage, ...tag });
      return { text, usage, stopReason: r.stopReason };
    }
    msgs = [...messages, { role: 'assistant', content: text }, { role: 'user', content: 'Yanıtın kesildi. Tam kaldığın yerden devam et; önceki kısmı tekrar etme, giriş cümlesi yazma.' }];
  }
  store.logUsage({ model: m, ...usage, ...tag });
  return { text, usage, stopReason: 'max_tokens' };
}
