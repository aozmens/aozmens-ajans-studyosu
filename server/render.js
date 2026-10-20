// SVG varlıkları ve çizim: yazı tipleri (assets/fonts), {{LOGO}} / {{IMG:id}} yer tutucuları,
// SVG → PNG/JPEG (resvg, sunucuda; tarayıcı gerekmez) ve görsel küçültme (sharp).
import { fileURLToPath } from 'node:url';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { Resvg } from '@resvg/resvg-js';
import sharp from 'sharp';
import * as store from './store.js';

const FONT_DIR = fileURLToPath(new URL('../assets/fonts/', import.meta.url));
let fontMeta = null;

export function fonts() {
  if (!fontMeta) fontMeta = JSON.parse(fs.readFileSync(path.join(FONT_DIR, 'fonts.json'), 'utf8'));
  return fontMeta;
}
export const fontNames = () => fonts().map((f) => f.family);
export const fontList = () => fonts().map((f) => `${f.family} (${f.note}; ağırlıklar ${f.faces.map((x) => x.weight).join('/')})`);
const fontFiles = () => fonts().flatMap((f) => f.faces.map((x) => path.join(FONT_DIR, x.file)));

export const BLANK = 'data:image/gif;base64,R0lGODlhAQABAAAAACw=';

// SVG içinde geçen ve programda bulunan yazı tipi aileleri
export function familiesIn(svg) {
  const found = new Set();
  const re = /font-family\s*[=:]\s*("([^"]*)"|'([^']*)'|([^;"'>]+))/gi;
  let m;
  while ((m = re.exec(svg))) {
    const v = (m[2] ?? m[3] ?? m[4] ?? '').replace(/&quot;/g, '');
    for (const part of v.split(',')) found.add(part.trim().replace(/^['"]|['"]$/g, '').toLowerCase());
  }
  return fonts().filter((f) => found.has(f.family.toLowerCase()));
}

const faceCache = new Map();
function faceCss(family, face) {
  const k = face.file;
  if (!faceCache.has(k)) {
    const b64 = fs.readFileSync(path.join(FONT_DIR, face.file)).toString('base64');
    faceCache.set(k, `@font-face{font-family:'${family.family}';font-style:normal;font-weight:${face.weight};src:url(data:font/ttf;base64,${b64}) format('truetype');}`);
  }
  return faceCache.get(k);
}

// SVG'de geçen ağırlıklar (yalnızca kullanılan yüzler gömülür, dosya küçük kalır)
function weightsIn(svg) {
  const w = new Set([400]);
  for (const m of String(svg).matchAll(/font-weight\s*[=:]\s*["']?\s*(\d{3}|bold|normal)/gi)) w.add(m[1] === 'bold' ? 700 : m[1] === 'normal' ? 400 : +m[1]);
  return [...w];
}

export function fontCss(family, weights = family.faces.map((x) => x.weight)) {
  const faces = new Set(weights.map((wt) => family.faces.reduce((b, x) => (Math.abs(x.weight - wt) < Math.abs(b.weight - wt) ? x : b), family.faces[0])));
  return [...faces].map((f) => faceCss(family, f)).join('');
}

export const imageIdsIn = (svg) => [...new Set([...String(svg).matchAll(/\{\{IMG:([\w-]+)\}\}/g)].map((m) => m[1]))];

// Firma görselinin tasarımda kullanılacak hali (küçültülmüş kopya varsa o)
export function designFile(company, fid) {
  const f = company?.files?.find((x) => x.id === fid);
  if (!f) return null;
  const file = f.designFile || f.file;
  const ext = path.extname(file).slice(1).toLowerCase();
  const mime = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp' }[ext];
  if (!mime) return null;
  try {
    return { f, mime, data: fs.readFileSync(store.assetPath(company.id, file)).toString('base64') };
  } catch {
    return null;
  }
}

// Yer tutucuları doldurur; embedFonts ise kullanılan ailelerin yazı tiplerini <style> olarak gömer (indirilebilir SVG için)
export function finalize(svg, company, { embedFonts = false } = {}) {
  const logo = company ? store.logoDataUrl(company.id) : null;
  let out = String(svg).replace(/\{\{LOGO\}\}/g, logo || BLANK);
  out = out.replace(/\{\{IMG:([\w-]+)\}\}/g, (_, fid) => {
    const x = designFile(company, fid);
    return x ? `data:${x.mime};base64,${x.data}` : BLANK;
  });
  if (embedFonts) {
    const ws = weightsIn(out);
    const css = familiesIn(out).map((f) => fontCss(f, ws)).join('');
    if (css) out = out.replace(/<svg\b[^>]*>/i, (open) => `${open}<style>${css}</style>`);
  }
  return out;
}

// SVG → PNG (resvg). width verilirse o genişliğe ölçeklenir.
export function svgToPng(svg, width) {
  const opts = {
    font: { fontFiles: fontFiles(), loadSystemFonts: false, defaultFontFamily: 'Inter', sansSerifFamily: 'Inter', serifFamily: 'Playfair Display' },
    imageRendering: 0,
    shapeRendering: 2,
    textRendering: 1,
  };
  if (width) opts.fitTo = { mode: 'width', value: Math.round(width) };
  try {
    const r = new Resvg(svg, opts);
    return r.render().asPng();
  } catch (e) {
    throw new Error('SVG çizilemedi (tasarım kodunda hata olabilir): ' + e.message);
  }
}

// Tasarımın önizlemesi / indirmesi için önbellekli PNG
export function cachedPng(svgFinal, width) {
  const key = crypto.createHash('sha1').update(svgFinal).update(String(width || '')).digest('hex');
  const file = path.join(store.cacheDir(), key + '.png');
  if (fs.existsSync(file)) return fs.readFileSync(file);
  const png = svgToPng(svgFinal, width);
  fs.writeFileSync(file, png);
  return png;
}

// Kalite turu için Claude'a gönderilecek JPEG (en fazla 1080 px genişlik)
export async function svgToJpeg(svgFinal, maxWidth = 1080) {
  const png = svgToPng(svgFinal);
  return sharp(png).resize({ width: maxWidth, withoutEnlargement: true }).flatten({ background: '#ffffff' }).jpeg({ quality: 85 }).toBuffer();
}

// Yüklenen görseli tasarımda / Claude'a göndermek için hazırlar: en uzun kenar max, şeffafsa PNG, değilse JPEG
export async function prepareImage(buf, max = 1600) {
  const img = sharp(buf, { failOn: 'none' }).rotate();
  const meta = await img.metadata();
  let alpha = false;
  if (meta.hasAlpha) {
    const { data, info } = await sharp(buf).rotate().resize(64, 64, { fit: 'inside' }).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    for (let i = 3; i < data.length; i += info.channels) if (data[i] < 250) { alpha = true; break; }
  }
  const resized = img.resize({ width: max, height: max, fit: 'inside', withoutEnlargement: true });
  const out = alpha ? await resized.png({ compressionLevel: 9 }).toBuffer() : await resized.flatten({ background: '#ffffff' }).jpeg({ quality: 88 }).toBuffer();
  const m2 = await sharp(out).metadata();
  return { buf: out, mime: alpha ? 'image/png' : 'image/jpeg', ext: alpha ? 'png' : 'jpg', width: m2.width, height: m2.height, alpha };
}

// Claude'a gönderilecek görsel bloğu (5 MB sınırının altında kalacak şekilde küçültülür)
export async function imageBlockFromFile(absPath, max = 1400) {
  const buf = fs.readFileSync(absPath);
  const p = await prepareImage(buf, max);
  return { type: 'image', source: { type: 'base64', media_type: p.mime, data: p.buf.toString('base64') } };
}

// Görselden baskın renkler (logo paleti için)
export async function extractColors(buf, n = 5) {
  const { data, info } = await sharp(buf).resize(96, 96, { fit: 'inside' }).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const buckets = new Map();
  for (let i = 0; i < data.length; i += info.channels) {
    const [r, g, b, a] = [data[i], data[i + 1], data[i + 2], data[i + 3]];
    if (a < 200 || (r > 245 && g > 245 && b > 245)) continue;
    const k = `${r >> 4},${g >> 4},${b >> 4}`;
    const e = buckets.get(k) || { n: 0, r: 0, g: 0, b: 0 };
    e.n++; e.r += r; e.g += g; e.b += b;
    buckets.set(k, e);
  }
  const sorted = [...buckets.values()].sort((a, b) => b.n - a.n).map((e) => [e.r / e.n, e.g / e.n, e.b / e.n]);
  const out = [];
  for (const c of sorted) {
    if (out.some((o) => Math.abs(o[0] - c[0]) + Math.abs(o[1] - c[1]) + Math.abs(o[2] - c[2]) < 70)) continue;
    out.push(c);
    if (out.length >= n) break;
  }
  return out.map((c) => '#' + c.map((v) => Math.round(v).toString(16).padStart(2, '0')).join('').toUpperCase());
}
