// Mockup kütüphanesi: hazır mockuplar (programla gelen) + kullanıcının yüklediği mockup dosyaları (ilham arşivinde).
// Yüklenen mockup taranır: logo alanı, zemin tonu ve sahneyi piksel piksel tarif eden prompt çıkarılır.
// Bir markaya uygulanırken iki yol var: logoyu hazır tasarımın üstüne yerleştirmek (program) ya da promptla
// görsel motoruna ürettirmek (AI). Sonuç markanın "05 Mockuplar" klasörüne kaydedilir.
import fs from 'node:fs';
import sharp from 'sharp';
import * as store from './store.js';
import * as claude from './claude.js';
import * as render from './render.js';
import * as imagegen from './imagegen.js';
import * as pdf from './pdf.js';
import { send } from './events.js';
import { systemFor, extractJson, companyBrief, saveCompanyImage } from './orchestrator.js';

const settings = () => store.getSettings(false);

// ---------------- markanın logo varlıkları ----------------

function finalProject(c) {
  return (c.logoProjects || []).find((p) => p.final?.svg) || null;
}

// Renkli logo, açık renk (koyu zeminler için) logo ve uygulama ikonu PNG'leri
export async function brandLogos(c) {
  const out = { color: null, white: null, symbol: null, icon: null, alpha: false };
  const l = store.primaryLogo(c);
  const proj = finalProject(c);
  if (l) out.color = await pdf.toPng(Buffer.from(l.data, 'base64'), l.mime);
  else if (proj) out.color = render.svgToPng(proj.final.svg, 1200);
  if (!out.color) return out;
  const meta = await sharp(out.color).metadata();
  out.alpha = !!meta.hasAlpha;
  const whiteSvg = proj?.final?.set?.find((x) => /beyaz/i.test(x.title))?.svg;
  out.white = whiteSvg ? render.svgToPng(whiteSvg, 1200) : await pdf.tintLogo(out.color, '#FFFFFF').catch(() => null);
  const symbolSvg = proj?.final?.set?.find((x) => /sembol/i.test(x.title))?.svg;
  out.symbol = symbolSvg ? render.svgToPng(symbolSvg, 1024) : null;
  const iconSvg = proj?.icons?.[0]?.svg;
  out.icon = iconSvg ? render.svgToPng(iconSvg, 1024) : null;
  return out;
}

const brandColors = (c) => {
  const p = (c?.palette || []).map((x) => x.hex).filter(pdf.validHex);
  return { primary: p[0] || '#1E1E24', secondary: p[1] || p[0] || '#5B4CF0', light: p.find((h) => !pdf.isDark(h)) || '#F4F4F6', dark: p.find((h) => pdf.isDark(h)) || '#16161C' };
};

// ---------------- hazır mockuplar (SVG sahneler, markanın renkleriyle) ----------------

const shadow = `<filter id="sh" x="-20%" y="-20%" width="140%" height="160%"><feDropShadow dx="0" dy="24" stdDeviation="26" flood-color="#000" flood-opacity="0.28"/></filter>`;

export const BUILTIN = [
  {
    id: 'hazir-kartvizit', name: 'Kartvizit', category: 'Kırtasiye', builtin: true, width: 1600, height: 1200,
    svg: (k) => `<svg xmlns="http://www.w3.org/2000/svg" width="1600" height="1200" viewBox="0 0 1600 1200"><defs>${shadow}<linearGradient id="bg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#E9E6E1"/><stop offset="1" stop-color="#CFCAC2"/></linearGradient></defs><rect width="1600" height="1200" fill="url(#bg)"/><g transform="rotate(-8 980 720)" filter="url(#sh)"><rect x="720" y="520" width="640" height="370" rx="14" fill="${k.primary}"/></g><g filter="url(#sh)"><rect x="300" y="330" width="760" height="440" rx="16" fill="#FAFAF8"/></g><rect x="370" y="690" width="210" height="10" rx="5" fill="${k.primary}" opacity="0.35"/><rect x="370" y="712" width="140" height="8" rx="4" fill="${k.primary}" opacity="0.2"/></svg>`,
    placement: { x: 0.25, y: 0.33, w: 0.36, h: 0.22 }, surface: 'light',
  },
  {
    id: 'hazir-uygulama', name: 'Uygulama ikonu (telefon)', category: 'Dijital', builtin: true, width: 1600, height: 1200, icon: true,
    svg: (k) => `<svg xmlns="http://www.w3.org/2000/svg" width="1600" height="1200" viewBox="0 0 1600 1200"><defs>${shadow}<linearGradient id="bg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${k.light}"/><stop offset="1" stop-color="#DADBE0"/></linearGradient><linearGradient id="scr" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#2A2D3A"/><stop offset="1" stop-color="#0F1016"/></linearGradient></defs><rect width="1600" height="1200" fill="url(#bg)"/><g filter="url(#sh)"><rect x="560" y="80" width="480" height="1040" rx="76" fill="#111216"/></g><rect x="580" y="100" width="440" height="1000" rx="60" fill="url(#scr)"/><rect x="740" y="122" width="120" height="30" rx="15" fill="#000"/>${[0, 1, 2, 3].map((r) => [0, 1, 2, 3].map((cc) => (r === 1 && cc === 1 ? '' : `<rect x="${620 + cc * 98}" y="${220 + r * 120}" width="74" height="74" rx="18" fill="#FFFFFF" opacity="${0.1 + ((r + cc) % 3) * 0.05}"/>`)).join('')).join('')}<rect x="704" y="324" width="96" height="96" rx="24" fill="${k.primary}" opacity="0.25"/><rect x="610" y="980" width="380" height="96" rx="36" fill="#FFFFFF" opacity="0.12"/></svg>`,
    placement: { x: 704 / 1600, y: 324 / 1200, w: 96 / 1600, h: 96 / 1200 }, surface: 'dark', radius: 0.24,
  },
  {
    id: 'hazir-tabela', name: 'Cephe tabelası', category: 'Mekân', builtin: true, width: 1600, height: 1200,
    svg: (k) => `<svg xmlns="http://www.w3.org/2000/svg" width="1600" height="1200" viewBox="0 0 1600 1200"><defs>${shadow}<pattern id="br" width="120" height="60" patternUnits="userSpaceOnUse"><rect width="120" height="60" fill="#B9B2A8"/><rect x="2" y="2" width="116" height="26" fill="#C7C0B6"/><rect x="-58" y="32" width="116" height="26" fill="#C2BBB1"/><rect x="62" y="32" width="116" height="26" fill="#C2BBB1"/></pattern><linearGradient id="lt" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff" stop-opacity="0.25"/><stop offset="1" stop-color="#000" stop-opacity="0.25"/></linearGradient></defs><rect width="1600" height="1200" fill="url(#br)"/><rect width="1600" height="1200" fill="url(#lt)"/><g filter="url(#sh)"><rect x="300" y="300" width="1000" height="420" rx="24" fill="${k.dark}"/></g><rect x="300" y="300" width="1000" height="420" rx="24" fill="none" stroke="#FFFFFF" stroke-opacity="0.12" stroke-width="4"/><rect x="0" y="900" width="1600" height="300" fill="#2B2724"/><rect x="0" y="900" width="1600" height="18" fill="#141210"/></svg>`,
    placement: { x: 0.25, y: 0.3, w: 0.5, h: 0.26 }, surface: 'dark',
  },
  {
    id: 'hazir-canta', name: 'Bez çanta', category: 'Ürün', builtin: true, width: 1600, height: 1200,
    svg: (k) => `<svg xmlns="http://www.w3.org/2000/svg" width="1600" height="1200" viewBox="0 0 1600 1200"><defs>${shadow}<linearGradient id="bg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${k.light}"/><stop offset="1" stop-color="#D8D4CE"/></linearGradient><linearGradient id="fold" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#000" stop-opacity="0.08"/><stop offset="0.5" stop-color="#fff" stop-opacity="0.06"/><stop offset="1" stop-color="#000" stop-opacity="0.1"/></linearGradient></defs><rect width="1600" height="1200" fill="url(#bg)"/><path d="M640 360 C640 160 960 160 960 360" fill="none" stroke="#EFE9DF" stroke-width="34" stroke-linecap="round"/><g filter="url(#sh)"><path d="M520 360 H1080 L1120 1060 H480 Z" fill="#F3EEE6"/></g><path d="M520 360 H1080 L1120 1060 H480 Z" fill="url(#fold)"/><path d="M640 360 C640 210 960 210 960 360" fill="none" stroke="#E6DED2" stroke-width="30" stroke-linecap="round"/></svg>`,
    placement: { x: 0.36, y: 0.47, w: 0.28, h: 0.24 }, surface: 'light', blend: 'multiply',
  },
];

export function list() {
  const a = store.getAgency();
  return [...BUILTIN.map(({ svg, ...m }) => ({ ...m, previewUrl: `/api/mockups/${m.id}/preview.png` })), ...a.mockups.map((m) => ({ ...m, url: store.assetUrl(store.AGENCY_ID, m.file), previewUrl: store.assetUrl(store.AGENCY_ID, m.file) }))];
}
export const get = (mid) => BUILTIN.find((m) => m.id === mid) || store.getAgency().mockups.find((m) => m.id === mid) || null;

export async function basePng(m, c) {
  if (m.builtin) return render.svgToPng(m.svg(brandColors(c)), m.width);
  const p = await render.prepareImage(fs.readFileSync(store.assetPath(store.AGENCY_ID, m.file)), 1600);
  return p.buf;
}

// ---------------- yükleme ve tarama ----------------

export async function upload(items = []) {
  const a = store.getAgency();
  const added = [];
  for (const it of items.slice(0, 30)) {
    const { buf } = store.parseDataUrl(it.dataUrl);
    const p = await render.prepareImage(buf, 2000);
    const e = store.writeAsset(store.AGENCY_ID, { name: it.name, buf: p.buf, mime: p.mime, ext: p.ext, folder: store.AGENCY_FOLDERS.mockups });
    const m = { ...e, name: String(it.name || 'Mockup').replace(/\.[a-z0-9]+$/i, ''), width: p.width, height: p.height, category: '', placement: { x: 0.35, y: 0.35, w: 0.3, h: 0.2 }, surface: 'light', blend: 'normal', analysis: null };
    a.mockups.unshift(m);
    added.push(m.id);
  }
  store.flush();
  send('agency:update', {});
  return added;
}

const scanning = new Set();
export async function analyze(mid) {
  const m = store.getAgency().mockups.find((x) => x.id === mid);
  if (!m) throw new Error('Mockup bulunamadı');
  if (scanning.has(mid)) return m;
  scanning.add(mid);
  m.analyzing = true;
  send('agency:update', {});
  try {
    const img = await render.imageBlockFromFile(store.assetPath(store.AGENCY_ID, m.file), 1400);
    const r = await claude.call({
      model: settings().designModel || settings().model,
      system: systemFor('grafik-tasarimci', '', true),
      messages: [{ role: 'user', content: [img, { type: 'text', text: `# Görevin: mockup dosyasını tara
Bu görsel bir mockup (logonun ya da tasarımın yerleştirileceği hazır sahne). Görsel ${m.width}x${m.height} piksel.
1. Logonun / tasarımın yerleşeceği alanı bul (kartvizitin yüzü, tişörtün göğsü, ekran, tabela…). Alanı görselin genişliğine ve yüksekliğine oranla 0-1 arası kutu olarak ver.
2. O yüzeyin tonu açık mı koyu mu (logo rengi buna göre seçilecek).
3. Sahneyi bir görsel üretim modeline piksel piksel yeniden ürettirecek İngilizce prompt yaz: nesne, malzeme, kamera açısı ve lensi, ışık, gölgeler, zemin, renkler (HEX), kompozisyon oranları. Logonun yerini "[LOGO]" yer tutucusuyla belirt.
Yanıtın yalnızca şu JSON olsun:
\`\`\`json
{ "ad": "Türkçe kısa ad", "kategori": "Kırtasiye | Giyim | Ambalaj | Dijital | Mekân | Ürün | Diğer", "alan": { "x": 0.3, "y": 0.4, "w": 0.3, "h": 0.15 }, "yuzey": "acik | koyu", "karisim": "normal | multiply", "perspektif": "Türkçe: düz mü, eğik mi, kavisli mi", "prompt": "İngilizce 100-180 kelime" }
\`\`\`` }] }],
      maxTokens: 3000,
      tag: { agent: 'grafik-tasarimci', kind: 'mockup-tara' },
    });
    const o = extractJson(r.text);
    const box = o.alan || {};
    const clamp = (v, d) => Math.max(0, Math.min(1, Number.isFinite(+v) ? +v : d));
    m.placement = { x: clamp(box.x, 0.35), y: clamp(box.y, 0.35), w: clamp(box.w, 0.3) || 0.3, h: clamp(box.h, 0.2) || 0.2 };
    m.surface = /koyu|dark/i.test(o.yuzey || '') ? 'dark' : 'light';
    m.blend = /multiply/i.test(o.karisim || '') ? 'multiply' : 'normal';
    if (o.ad && /^mockup|^img|^\d/i.test(m.name)) m.name = String(o.ad).slice(0, 60);
    m.category = String(o.kategori || m.category || '');
    m.analysis = { prompt: String(o.prompt || ''), perspective: String(o.perspektif || ''), at: store.now() };
    m.analysisError = null;
    return m;
  } catch (e) {
    m.analysisError = e.message;
    throw e;
  } finally {
    m.analyzing = false;
    scanning.delete(mid);
    store.flush();
    send('agency:update', {});
  }
}

export function update(mid, patch) {
  const m = store.getAgency().mockups.find((x) => x.id === mid);
  if (!m) throw new Error('Hazır mockuplar düzenlenemez.');
  if (patch.name !== undefined) m.name = String(patch.name).slice(0, 80);
  if (patch.category !== undefined) m.category = String(patch.category).slice(0, 40);
  if (patch.placement) for (const k of ['x', 'y', 'w', 'h']) if (Number.isFinite(+patch.placement[k])) m.placement[k] = Math.max(0, Math.min(1, +patch.placement[k]));
  if (patch.surface) m.surface = patch.surface === 'dark' ? 'dark' : 'light';
  if (patch.blend) m.blend = patch.blend === 'multiply' ? 'multiply' : 'normal';
  if (patch.prompt !== undefined) m.analysis = { ...(m.analysis || {}), prompt: String(patch.prompt) };
  store.flush();
  return m;
}

export function remove(mid) {
  const a = store.getAgency();
  const m = a.mockups.find((x) => x.id === mid);
  if (!m) return;
  fs.rmSync(store.assetPath(store.AGENCY_ID, m.file), { force: true });
  a.mockups = a.mockups.filter((x) => x.id !== mid);
  store.flush();
}

// ---------------- markaya uygulama ----------------

// Logoyu mockup sahnesine yerleştirir (PNG döner)
export async function compose(m, c, logos) {
  const base = await basePng(m, c);
  const meta = await sharp(base).metadata();
  const W = meta.width;
  const H = meta.height;
  const pl = m.placement;
  const box = { left: Math.round(pl.x * W), top: Math.round(pl.y * H), width: Math.max(8, Math.round(pl.w * W)), height: Math.max(8, Math.round(pl.h * H)) };
  const layers = [];
  if (m.icon) {
    // Uygulama ikonu: Logo Stüdyosu ikonu varsa o, yoksa marka renginde zemin + logo
    const k = brandColors(c);
    const r = Math.round(box.width * (m.radius || 0.22));
    const mask = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${box.width}" height="${box.height}"><rect width="${box.width}" height="${box.height}" rx="${r}" fill="#fff"/></svg>`);
    let tile;
    if (logos.icon) tile = await sharp(logos.icon).resize(box.width, box.height).png().toBuffer();
    else {
      const mark = logos.symbol || (pdf.isDark(k.primary) ? logos.white : null) || logos.color;
      const bg = await sharp({ create: { width: box.width, height: box.height, channels: 4, background: k.primary } }).png().toBuffer();
      const inner = Math.round(box.width * 0.68);
      const logo = mark ? await sharp(mark).resize(inner, inner, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } }).png().toBuffer() : null;
      tile = logo ? await sharp(bg).composite([{ input: logo, gravity: 'center' }]).png().toBuffer() : bg;
    }
    tile = await sharp(tile).composite([{ input: mask, blend: 'dest-in' }]).png().toBuffer();
    layers.push({ input: tile, left: box.left, top: box.top });
  } else {
    let logo = m.surface === 'dark' ? (logos.white || null) : logos.color;
    let plate = null;
    if (!logo) {
      // Koyu yüzeyde açık renk logo yoksa logo beyaz plaka üzerinde
      logo = logos.color;
      plate = true;
    }
    const pad = plate ? 0.78 : 0.86;
    const lw = Math.round(box.width * pad);
    const lh = Math.round(box.height * pad);
    let fitted = await sharp(logo).trim({ threshold: 4 }).resize(lw, lh, { fit: 'inside' }).png().toBuffer().catch(() => sharp(logo).resize(lw, lh, { fit: 'inside' }).png().toBuffer());
    const fm = await sharp(fitted).metadata();
    if (plate) {
      const pw = fm.width + Math.round(box.width * 0.08);
      const ph = fm.height + Math.round(box.height * 0.12);
      const plateSvg = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${pw}" height="${ph}"><rect width="${pw}" height="${ph}" rx="${Math.round(ph * 0.12)}" fill="#fff"/></svg>`);
      fitted = await sharp(plateSvg).composite([{ input: fitted, gravity: 'center' }]).png().toBuffer();
    }
    const f2 = await sharp(fitted).metadata();
    layers.push({ input: fitted, left: box.left + Math.round((box.width - f2.width) / 2), top: box.top + Math.round((box.height - f2.height) / 2), blend: m.blend === 'multiply' && m.surface !== 'dark' ? 'multiply' : 'over' });
  }
  return sharp(base).composite(layers).png().toBuffer();
}

// Mockupun markaya uyarlanmış piksel piksel promptu (Claude)
export async function promptFor(mid, companyId, { jobId } = {}) {
  const m = get(mid);
  const c = store.getCompany(companyId);
  if (!m || !c) throw new Error('Mockup ya da marka bulunamadı');
  const content = [];
  try { content.push({ type: 'text', text: 'Mockup sahnesi:' }, { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: (await sharp(await basePng(m, c)).resize({ width: 1000, withoutEnlargement: true }).jpeg({ quality: 85 }).toBuffer()).toString('base64') } }); } catch {}
  const l = store.primaryLogo(c);
  if (l) content.push({ type: 'text', text: 'Markanın logosu:' }, { type: 'image', source: { type: 'base64', media_type: l.mime, data: l.data } });
  content.push({ type: 'text', text: `${companyBrief(c, { steps: [], options: {} })}

# Mockup
- Ad: ${m.name} (${m.category || '-'})
- Logo alanı (0-1): x ${m.placement.x.toFixed(2)}, y ${m.placement.y.toFixed(2)}, genişlik ${m.placement.w.toFixed(2)}, yükseklik ${m.placement.h.toFixed(2)} · yüzey ${m.surface === 'dark' ? 'koyu' : 'açık'}
${m.analysis?.prompt ? `- Sahne promptu: ${m.analysis.prompt}` : ''}

# Görevin: mockup promptu yaz
Bu mockupu ${c.name} markası için bir görsel üretim modeline ürettirecek tek bir İngilizce prompt yaz. Sahneyi piksel piksel tarif et (nesne, malzeme, kamera, lens, ışık, gölge, zemin, HEX renkler, oranlar) ve logoyu tarif ederek doğru yere, doğru perspektif ve baskı tekniğiyle (baskı, kabartma, nakış, ekran…) yerleştir. Marka renklerini sahnede ölçülü kullan.
Yanıtın yalnızca şu JSON olsun:
\`\`\`json
{ "prompt": "İngilizce 120-200 kelime", "negative": "İngilizce", "aciklama": "Türkçe tek cümle" }
\`\`\`` });
  const r = await claude.call({
    model: settings().designModel || settings().model,
    system: systemFor('grafik-tasarimci', '', true),
    messages: [{ role: 'user', content }],
    maxTokens: 3000,
    tag: { companyId, jobId, agent: 'grafik-tasarimci', kind: 'mockup-prompt' },
  });
  const o = extractJson(r.text);
  return { prompt: String(o.prompt || ''), negative: String(o.negative || ''), note: String(o.aciklama || ''), usage: r.usage };
}

// mode: 'yerlestir' (logo hazır tasarımın üstüne) | 'ai' (görsel motoru ile üretim)
export async function apply(mid, companyId, { mode = 'yerlestir', provider, prompt } = {}) {
  const m = get(mid);
  const c = store.getCompany(companyId);
  if (!m || !c) throw new Error('Mockup ya da marka bulunamadı');
  if (mode === 'ai') {
    const p = provider || imagegen.defaultProvider();
    if (!p || !imagegen.isConnected(p)) throw new Error('Görsel motoru bağlı değil (Ayarlar → Entegrasyonlar).');
    const text = prompt || (await promptFor(mid, companyId)).prompt;
    const refs = [];
    if (imagegen.PROVIDERS[p].refs) {
      try { refs.push({ mime: 'image/png', data: (await basePng(m, c)).toString('base64') }); } catch {}
      const l = store.primaryLogo(c);
      if (l) refs.push({ mime: l.mime, data: l.data });
    }
    const finalPrompt = refs.length ? `The first attached image is the mockup scene to reproduce, the second is the brand logo to place exactly as described. ${text}` : text;
    const r = await imagegen.generate(p, { prompt: finalPrompt, width: m.width || 1600, height: m.height || 1200, refs });
    return saveCompanyImage(c, r.images[0], { name: `Mockup · ${m.name} (AI)`, role: 'mockup', aiPrompt: text, provider: r.provider });
  }
  const logos = await brandLogos(c);
  if (!logos.color) throw new Error('Markanın logosu yok. Önce logo yükleyin ya da Logo Stüdyosu\'nda oluşturun.');
  const png = await compose(m, c, logos);
  const e = await saveCompanyImage(c, { buf: png, mime: 'image/png' }, { name: `Mockup · ${m.name}`, role: 'mockup' });
  e.mockupId = m.id;
  store.flush();
  return e;
}
