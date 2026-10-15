// Logo Stüdyosu: eskiz + brif → logo konseptleri (SVG) → revizyon / varyasyon → final logo seti → uygulama ikonları.
// Çıktılar vektör (metinler yollara çevrilmiş SVG) ve PNG olarak indirilebilir.
import fs from 'node:fs';
import opentype from 'opentype.js';
import sharp from 'sharp';
import * as store from './store.js';
import * as claude from './claude.js';
import * as render from './render.js';
import { send } from './events.js';
import { slug as exportSlug } from './export.js';
import { systemFor, companyBrief, extractSvg } from './orchestrator.js';

const settings = () => store.getSettings(false);

function getProject(cid, pid) {
  const c = store.getCompany(cid);
  const p = c?.logoProjects?.find((x) => x.id === pid);
  if (!p) throw new Error('Logo projesi bulunamadı');
  return { c, p };
}

const changed = (c) => {
  store.flush();
  send('company:update', { id: c.id });
};

export function createProject(cid, input = {}) {
  const c = store.getCompany(cid);
  if (!c) throw new Error('Marka bulunamadı');
  const p = {
    id: store.id(), name: input.name || `${c.name} logo`, brief: input.brief || '', style: input.style || '', keywords: input.keywords || '',
    colors: input.colors || c.palette.map((x) => x.hex).slice(0, 4), logoType: input.logoType || 'kombine',
    sketches: [], concepts: [], selectedId: null, final: null, icons: [], busy: false, error: null, createdAt: store.now(),
  };
  c.logoProjects.unshift(p);
  changed(c);
  return p;
}

export function updateProject(cid, pid, patch) {
  const { c, p } = getProject(cid, pid);
  for (const k of ['name', 'brief', 'style', 'keywords', 'colors', 'logoType', 'selectedId']) if (patch[k] !== undefined) p[k] = patch[k];
  changed(c);
  return p;
}

export function deleteProject(cid, pid) {
  const { c, p } = getProject(cid, pid);
  for (const s of p.sketches) fs.rmSync(store.assetPath(c.id, s.file), { force: true });
  c.logoProjects = c.logoProjects.filter((x) => x.id !== pid);
  changed(c);
}

export async function addSketch(cid, pid, dataUrl, name = 'Eskiz') {
  const { c, p } = getProject(cid, pid);
  const { buf } = store.parseDataUrl(dataUrl);
  const prepared = await sharp(buf).rotate().resize({ width: 1400, height: 1400, fit: 'inside', withoutEnlargement: true }).flatten({ background: '#ffffff' }).png().toBuffer();
  const e = store.writeAsset(c.id, { name, buf: prepared, mime: 'image/png' });
  p.sketches.push({ id: e.id, file: e.file, name, at: store.now() });
  changed(c);
  return p;
}

export function removeSketch(cid, pid, sid) {
  const { c, p } = getProject(cid, pid);
  const s = p.sketches.find((x) => x.id === sid);
  if (s) fs.rmSync(store.assetPath(c.id, s.file), { force: true });
  p.sketches = p.sketches.filter((x) => x.id !== sid);
  changed(c);
}

const LOGO_RULES = `

## Logo SVG kuralları (zorunlu)
- Her logo tek bir <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1000 1000" width="1000" height="1000"> öğesidir; logo tuvalin ortasında, çevresinde ~%8 boşlukla durur. Zemin şeffaf (arka plan dikdörtgeni koyma).
- Gerçek vektör: path, circle, rect, polygon, line, ellipse, g; düz renk dolgular (HEX). Degrade yalnızca gerçekten gerekiyorsa ve en fazla bir tane. Filtre, gölge, görsel (<image>), foreignObject, script, dış bağlantı YOK.
- Yazı için <text> kullanabilirsin (program yollara çevirir): font-family yalnızca şu listeden: ${'${FONTS}'}; font-weight sayıyla; text-anchor ve letter-spacing serbest. <tspan> kullanma; her satır ayrı <text> olsun.
- Sembol basit, akılda kalıcı ve 32 px'de bile okunur olsun; en fazla 3 renk. Her konsept birbirinden gerçekten farklı bir fikir olsun.
- Türkçe karakterleri doğru yaz.`;

const logoRules = () => LOGO_RULES.replace('${FONTS}', render.fontNames().join(', '));

// Yanıttaki "### Konsept N: başlık / Gerekçe: … / <svg>…</svg>" bloklarını ayrıştırır
function parseConcepts(text) {
  const out = [];
  const re = /(?:\s*#+\s*(?:Konsept|Varyasyon|Logo|İkon\s+[A-Z])?\s*\d*\s*[:.-]?\s*([^\n]*)\n)?([\s\S]*?)(<svg[\s\S]*?<\/svg>)/gi;
  let m;
  while ((m = re.exec(text))) {
    const svg = extractSvg(m[3]);
    if (!svg) continue;
    const rationale = (m[2] || '').replace(/^\s*(Gerekçe|Fikir)\s*:\s*/im, '').replace(/```\w*/g, '').trim();
    out.push({ title: (m[1] || '').replace(/[*#]/g, '').trim(), rationale: rationale.slice(0, 600), svg });
  }
  return out;
}

async function sketchBlocks(c, p) {
  const out = [];
  for (const s of p.sketches.slice(-3)) {
    try { out.push({ type: 'text', text: `Kullanıcının eskizi: ${s.name}` }, await render.imageBlockFromFile(store.assetPath(c.id, s.file), 1200)); } catch {}
  }
  return out;
}

function briefText(c, p) {
  return `${companyBrief(c, { steps: [], options: {} })}

# Logo brifi
- Proje: ${p.name}
- Logo türü: ${{ kombine: 'sembol + yazı (kombine)', sembol: 'yalnızca sembol / ikon', yazi: 'yalnızca yazı (logotype / wordmark)', monogram: 'monogram (baş harfler)', amblem: 'amblem (rozet içinde)' }[p.logoType] || p.logoType}
- İstenen stil: ${p.style || '-'}
- Anahtar kelimeler / çağrışımlar: ${p.keywords || '-'}
- Renkler: ${(p.colors || []).join(', ') || 'serbest (markaya uygun)'}
${p.brief ? `\n## Kullanıcının notları\n${p.brief}` : ''}`;
}

async function withBusy(c, p, fn) {
  if (p.busy) throw new Error('Bu projede bir üretim zaten sürüyor.');
  p.busy = true;
  p.error = null;
  changed(c);
  try {
    return await fn();
  } catch (e) {
    p.error = e.message;
    throw e;
  } finally {
    p.busy = false;
    changed(c);
  }
}

export async function generateConcepts(cid, pid, { count = 4, direction = '' } = {}) {
  const { c, p } = getProject(cid, pid);
  return withBusy(c, p, async () => {
    const content = [...(await sketchBlocks(c, p))];
    const logo = store.primaryLogo(c);
    if (logo && p.concepts.length === 0) content.push({ type: 'text', text: 'Markanın mevcut logosu (yenileniyorsa referans):' }, { type: 'image', source: { type: 'base64', media_type: logo.mime, data: logo.data } });
    const prev = p.concepts.slice(-6).map((x, i) => `${i + 1}. ${x.title}: ${x.rationale.slice(0, 160)}`).join('\n');
    content.push({ type: 'text', text: `${briefText(c, p)}

${prev ? `# Daha önce üretilen konseptler (bunları tekrarlama, yeni fikirler bul)\n${prev}\n` : ''}${direction ? `# Bu tur için yön\n${direction}\n` : ''}
# Görevin
${p.sketches.length ? 'Kullanıcının eskizindeki fikri temel al: eskizdeki ana formu, oranları ve yerleşimi profesyonel bir logoya dönüştür; konseptlerin en az yarısı eskize sadık kalsın, diğerleri eskizden yola çıkan cesur yorumlar olsun.' : 'Marka için'} ${count} farklı logo konsepti tasarla. Her konsept için şu biçimi kullan:

### Konsept N: Kısa başlık
Gerekçe: Fikri, sembolün anlamını ve tipografi seçimini 1-2 cümleyle anlat.
<svg ...>...</svg>` });
    const r = await claude.call({
      model: settings().designModel || settings().model,
      system: systemFor('grafik-tasarimci', logoRules()),
      messages: [{ role: 'user', content }],
      maxTokens: 32000,
      tag: { companyId: cid, agent: 'grafik-tasarimci', kind: 'logo' },
    });
    const list = parseConcepts(r.text);
    if (!list.length) throw new Error('Yanıtta logo bulunamadı, tekrar deneyin.');
    for (const x of list) p.concepts.push({ id: store.id(), ...x, history: [], at: store.now() });
    p.usage = claude.sumUsage(p.usage, r.usage);
    return p;
  });
}

export async function reviseConcept(cid, pid, conceptId, feedback, { variations = 0 } = {}) {
  const { c, p } = getProject(cid, pid);
  const k = p.concepts.find((x) => x.id === conceptId);
  if (!k) throw new Error('Konsept bulunamadı');
  return withBusy(c, p, async () => {
    const jpg = await render.svgToJpeg(k.svg, 800).catch(() => null);
    const content = [...(await sketchBlocks(c, p))];
    if (jpg) content.push({ type: 'text', text: 'Üzerinde çalışılan logonun çizilmiş hali:' }, { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: jpg.toString('base64') } });
    content.push({ type: 'text', text: `${briefText(c, p)}

# Üzerinde çalışılan konsept: ${k.title}
${k.rationale}
${k.svg}

# ${variations ? `Görevin: bu konseptin ${variations} varyasyonunu üret` : 'Görevin: revizyon'}
${feedback ? `Kullanıcının geri bildirimi: ${feedback}\n` : ''}${variations ? `Ana fikri koru; sembol detayı, tipografi, oran ve renk kullanımında birbirinden belirgin şekilde farklı ${variations} varyasyon yap.` : 'Geri bildirimi uygula, gerisini koru.'} Her biri için:

### Varyasyon N: Kısa başlık
Gerekçe: Ne değişti?
<svg ...>...</svg>` });
    const r = await claude.call({
      model: settings().designModel || settings().model,
      system: systemFor('grafik-tasarimci', logoRules()),
      messages: [{ role: 'user', content }],
      maxTokens: 32000,
      tag: { companyId: cid, agent: 'grafik-tasarimci', kind: 'logo' },
    });
    const list = parseConcepts(r.text);
    if (!list.length) throw new Error('Yanıtta logo bulunamadı, tekrar deneyin.');
    p.usage = claude.sumUsage(p.usage, r.usage);
    if (variations) {
      for (const x of list) p.concepts.push({ id: store.id(), ...x, title: x.title || `${k.title} varyasyonu`, parentId: k.id, history: [], at: store.now() });
    } else {
      k.history.push({ svg: k.svg, at: store.now(), feedback });
      k.svg = list[0].svg;
      if (list[0].rationale) k.rationale = list[0].rationale;
      if (feedback) store.addFeedback(cid, feedback, `Logo revizyonu (${p.name})`);
    }
    return p;
  });
}

export function undoConcept(cid, pid, conceptId) {
  const { c, p } = getProject(cid, pid);
  const k = p.concepts.find((x) => x.id === conceptId);
  if (!k?.history.length) return p;
  k.svg = k.history.pop().svg;
  changed(c);
  return p;
}

export function removeConcept(cid, pid, conceptId) {
  const { c, p } = getProject(cid, pid);
  p.concepts = p.concepts.filter((x) => x.id !== conceptId);
  changed(c);
  return p;
}

// Seçilen konsepti final yapar ve logo setini (tek renk, ters, sembol) üretir
export async function finalizeLogo(cid, pid, conceptId) {
  const { c, p } = getProject(cid, pid);
  const k = p.concepts.find((x) => x.id === conceptId);
  if (!k) throw new Error('Konsept bulunamadı');
  return withBusy(c, p, async () => {
    p.selectedId = k.id;
    p.final = { conceptId: k.id, svg: k.svg, title: k.title, at: store.now(), set: [] };
    const r = await claude.call({
      model: settings().designModel || settings().model,
      system: systemFor('grafik-tasarimci', logoRules()),
      messages: [{ role: 'user', content: `${briefText(c, p)}

# Onaylanan final logo
${k.svg}

# Görevin: logo setini hazırla
Bu logonun uygulamada kullanılacak versiyonlarını üret. Formu birebir koru, yalnızca belirtileni değiştir:

### Logo 1: Tek renk koyu
Gerekçe: Tamamı #111111.
<svg>…</svg>

### Logo 2: Tek renk beyaz (koyu zemin için)
Gerekçe: Tamamı #FFFFFF; koyu zeminde kullanılır (zemin ekleme).
<svg>…</svg>

### Logo 3: Yatay yerleşim
Gerekçe: Sembol solda, yazı sağda; viewBox="0 0 1600 600" width="1600" height="600". Logo yalnızca sembolse sembolün yanına marka adını ekle.
<svg>…</svg>

### Logo 4: Yalnızca sembol / monogram
Gerekçe: Yazısız, küçük boyutlarda (favicon, profil fotoğrafı) kullanılacak sade işaret.
<svg>…</svg>` }],
      maxTokens: 32000,
      tag: { companyId: cid, agent: 'grafik-tasarimci', kind: 'logo' },
    });
    p.usage = claude.sumUsage(p.usage, r.usage);
    const names = ['Tek renk koyu', 'Tek renk beyaz', 'Yatay', 'Sembol'];
    p.final.set = parseConcepts(r.text).slice(0, 4).map((x, i) => ({ id: store.id(), title: names[i] || x.title, svg: x.svg }));
    return p;
  });
}

// Uygulama ikonları: 1024x1024, 2 farklı varyasyon
export async function generateIcons(cid, pid, { feedback = '' } = {}) {
  const { c, p } = getProject(cid, pid);
  if (!p.final) throw new Error('Önce logoyu tamamlayın.');
  return withBusy(c, p, async () => {
    const symbol = p.final.set?.find((x) => x.title === 'Sembol')?.svg || p.final.svg;
    const r = await claude.call({
      model: settings().designModel || settings().model,
      system: systemFor('grafik-tasarimci', logoRules().replace('viewBox="0 0 1000 1000" width="1000" height="1000"> öğesidir; logo tuvalin ortasında, çevresinde ~%8 boşlukla durur. Zemin şeffaf (arka plan dikdörtgeni koyma).', 'viewBox="0 0 1024 1024" width="1024" height="1024"> öğesidir. İkon tam kare tuvali doldurur (köşeleri yuvarlatma; işletim sistemi maskeler). Zemin dolu olmalı.')),
      messages: [{ role: 'user', content: `${briefText(c, p)}

# Final logo
${p.final.svg}

# Sembol
${symbol}

${p.icons?.length ? `# Önceki ikonlar (farklı yap)\n${p.icons.map((x) => x.title).join(', ')}\n` : ''}${feedback ? `# Kullanıcının isteği\n${feedback}\n` : ''}
# Görevin: uygulama ikonu
iOS / Android / web uygulaması için 2 farklı ikon varyasyonu tasarla. Sembol, tuvalin yaklaşık %60'ını kaplasın ve ortada dursun (Android uyarlanabilir ikon güvenli alanı: merkezdeki %66'lık daire). Küçük boyutlarda (48 px) okunur olsun; ince detay ve yazı kullanma (monogram hariç).
- İkon A: marka ana rengi zemin + açık renk sembol (ya da tersi), düz ve net.
- İkon B: farklı bir yorum: degrade zemin, ters renk, ya da sembolün kırpılmış/büyütülmüş dinamik yerleşimi.

### İkon A: Kısa başlık
Gerekçe: …
<svg>…</svg>

### İkon B: Kısa başlık
Gerekçe: …
<svg>…</svg>` }],
      maxTokens: 24000,
      tag: { companyId: cid, agent: 'grafik-tasarimci', kind: 'ikon' },
    });
    p.usage = claude.sumUsage(p.usage, r.usage);
    const list = parseConcepts(r.text).slice(0, 2);
    if (!list.length) throw new Error('Yanıtta ikon bulunamadı, tekrar deneyin.');
    p.icons = [...list.map((x) => ({ id: store.id(), title: x.title, rationale: x.rationale, svg: x.svg, at: store.now() })), ...(p.icons || [])].slice(0, 8);
    return p;
  });
}

// ---------------- metni yollara çevirme (gerçek vektör çıktı) ----------------

const fontCache = new Map();
function loadFont(family, weight) {
  const meta = render.fonts().find((f) => f.family.toLowerCase() === String(family).toLowerCase()) || render.fonts()[0];
  const face = meta.faces.reduce((best, x) => (Math.abs(x.weight - weight) < Math.abs(best.weight - weight) ? x : best), meta.faces[0]);
  if (!fontCache.has(face.file)) {
    const b = fs.readFileSync(new URL(`../assets/fonts/${face.file}`, import.meta.url));
    fontCache.set(face.file, opentype.parse(b.buffer.slice(b.byteOffset, b.byteOffset + b.length)));
  }
  return fontCache.get(face.file);
}

const attr = (s, name) => {
  const m = new RegExp(`\\s${name}\\s*=\\s*("([^"]*)"|'([^']*)')`, 'i').exec(s);
  return m ? (m[2] ?? m[3]) : null;
};
const styleProp = (s, name) => {
  const st = attr(s, 'style');
  if (!st) return null;
  const m = new RegExp(`(?:^|;)\\s*${name}\\s*:\\s*([^;]+)`, 'i').exec(st);
  return m ? m[1].trim() : null;
};
const decode = (t) => t.replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'");

// <text> öğelerini aynı görünümdeki <path> öğelerine çevirir (Illustrator / Figma'da font gerekmez)
export function outlineText(svg) {
  return svg.replace(/<text\b([^>]*)>([\s\S]*?)<\/text>/gi, (whole, attrs, inner) => {
    try {
      const get = (n) => styleProp(attrs, n) ?? attr(attrs, n);
      const family = (get('font-family') || 'Inter').split(',')[0].replace(/['"]/g, '').trim();
      const weightRaw = get('font-weight') || '400';
      const weight = weightRaw === 'bold' ? 700 : weightRaw === 'normal' ? 400 : parseInt(weightRaw, 10) || 400;
      const size = parseFloat(get('font-size') || '16');
      const ls = parseFloat(get('letter-spacing') || '0') || 0;
      const anchor = get('text-anchor') || 'start';
      let x = parseFloat(attr(attrs, 'x') || '0');
      const y = parseFloat(attr(attrs, 'y') || '0');
      const text = decode(inner);
      const font = loadFont(family, weight);
      const scale = size / font.unitsPerEm;
      const glyphs = font.stringToGlyphs(text);
      let width = 0;
      glyphs.forEach((g, i) => {
        width += g.advanceWidth * scale + (i < glyphs.length - 1 ? ls + (font.getKerningValue(g, glyphs[i + 1]) || 0) * scale : 0);
      });
      if (anchor === 'middle') x -= width / 2;
      else if (anchor === 'end') x -= width;
      let d = '';
      let cx = x;
      glyphs.forEach((g, i) => {
        d += g.getPath(cx, y, size).toPathData(2);
        cx += g.advanceWidth * scale + ls + (i < glyphs.length - 1 ? (font.getKerningValue(g, glyphs[i + 1]) || 0) * scale : 0);
      });
      const keep = ['fill', 'stroke', 'stroke-width', 'opacity', 'fill-opacity', 'transform', 'class', 'id'];
      const extra = keep.map((n) => { const v = get(n); return v ? ` ${n}="${v}"` : ''; }).join('');
      return `<path d="${d}"${extra || ' fill="#000"'}/>`;
    } catch {
      return whole;
    }
  });
}

// ---------------- dışa aktarma ----------------

function ico(pngs) {
  // PNG içeren .ico dosyası (16, 32, 48)
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0); header.writeUInt16LE(1, 2); header.writeUInt16LE(pngs.length, 4);
  const dir = Buffer.alloc(16 * pngs.length);
  let offset = 6 + dir.length;
  pngs.forEach(({ size, buf }, i) => {
    dir.writeUInt8(size >= 256 ? 0 : size, i * 16); dir.writeUInt8(size >= 256 ? 0 : size, i * 16 + 1);
    dir.writeUInt16LE(1, i * 16 + 4); dir.writeUInt16LE(32, i * 16 + 6);
    dir.writeUInt32LE(buf.length, i * 16 + 8); dir.writeUInt32LE(offset, i * 16 + 12);
    offset += buf.length;
  });
  return Buffer.concat([header, dir, ...pngs.map((p) => p.buf)]);
}

const slug = (s) => exportSlug(s, 40) || 'logo';

// { 'klasör/dosya': Buffer } — ZIP için logo paketi
export function exportFiles(cid, pid) {
  const { c, p } = getProject(cid, pid);
  const files = {};
  const base = slug(c.name);
  const addLogo = (folder, name, svg) => {
    const outlined = outlineText(svg);
    files[`${folder}/${name}.svg`] = Buffer.from(outlined);
    for (const w of [512, 1024, 2048]) files[`${folder}/png/${name}-${w}.png`] = render.svgToPng(outlined, w);
  };
  if (p.final) {
    addLogo('logo', `${base}-logo`, p.final.svg);
    for (const x of p.final.set || []) addLogo('logo', `${base}-${slug(x.title)}`, x.svg);
  } else {
    p.concepts.forEach((k, i) => addLogo('konseptler', `${String(i + 1).padStart(2, '0')}-${slug(k.title)}`, k.svg));
  }
  (p.icons || []).slice(0, 2).forEach((ic, i) => {
    const folder = `uygulama-ikonu/${String.fromCharCode(65 + i)}-${slug(ic.title)}`;
    const svg = outlineText(ic.svg);
    files[`${folder}/icon.svg`] = Buffer.from(svg);
    for (const s of [1024, 512, 192, 180, 167, 152, 120, 96, 72, 48, 32, 16]) files[`${folder}/icon-${s}.png`] = render.svgToPng(svg, s);
    files[`${folder}/favicon.ico`] = ico([16, 32, 48].map((s) => ({ size: s, buf: files[`${folder}/icon-${s}.png`] || render.svgToPng(svg, s) })));
  });
  files['BENIOKU.txt'] = Buffer.from(`${c.name} · ${p.name}\n\nSVG dosyalarında yazılar yollara çevrilmiştir; Illustrator, Figma ve Inkscape'te font gerektirmeden açılır.\nPNG dosyaları şeffaf zeminlidir. Uygulama ikonlarının köşeleri düzdür; iOS/Android kendi maskesini uygular.\nRenkler: ${(p.colors || []).join(', ')}\n`);
  return { name: `${c.name} - ${p.name}`, files };
}

// Final logoyu markanın ana logosu yapar (SVG + PNG kopyası)
export function useAsBrandLogo(cid, pid, variantId) {
  const { c, p } = getProject(cid, pid);
  if (!p.final) throw new Error('Önce logoyu tamamlayın.');
  const svg = outlineText(variantId ? (p.final.set.find((x) => x.id === variantId)?.svg || p.final.svg) : p.final.svg);
  const entry = store.writeAsset(c.id, { name: `${p.name}.svg`, buf: Buffer.from(svg), mime: 'image/svg+xml' });
  const png = render.svgToPng(svg, 1200);
  const pngFile = `${entry.id}-png.png`;
  fs.writeFileSync(store.assetPath(c.id, pngFile), png);
  entry.pngFile = pngFile;
  for (const l of c.logos) l.primary = false;
  entry.primary = true;
  store.addAsset(c.id, 'logos', entry);
  changed(c);
  return entry;
}

