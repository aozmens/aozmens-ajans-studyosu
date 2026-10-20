// PDF yardımcıları (pdfkit): programın yazı tipleri, renk dönüşümleri, sayfa altı ve ajansın kurumsal alt bilgisi.
// Tasarım dili ve marka dosyası PDF'leri bu modülle çizilir; metinler seçilebilir, yapay zekâ araçları okuyabilir.
import { fileURLToPath } from 'node:url';
import fs from 'node:fs';
import path from 'node:path';
import PDFDocument from 'pdfkit';
import sharp from 'sharp';
import * as store from './store.js';
import * as render from './render.js';

const FONT_DIR = fileURLToPath(new URL('../assets/fonts/', import.meta.url));

export function createDoc({ title, subject = '', keywords = '', layout = 'portrait' }) {
  const s = store.getSettings(false);
  const doc = new PDFDocument({
    size: 'A4', layout, bufferPages: true, autoFirstPage: true,
    margins: { top: 48, bottom: 48, left: 48, right: 48 },
    info: { Title: title, Author: s.agencyName, Subject: subject, Keywords: keywords, Creator: 'Agent-cy' },
    lang: 'tr-TR', displayTitle: true,
  });
  for (const f of render.fonts()) for (const x of f.faces) doc.registerFont(`${f.family}-${x.weight}`, path.join(FONT_DIR, x.file));
  font(doc, 'Inter', 400);
  const chunks = [];
  doc.on('data', (c) => chunks.push(c));
  const done = new Promise((res, rej) => { doc.on('end', () => res(Buffer.concat(chunks))); doc.on('error', rej); });
  return { doc, finish: () => { doc.end(); return done; } };
}

// Programdaki en yakın yazı tipi yüzü (aile yoksa Inter)
export function font(doc, family, weight = 400) {
  const f = render.fonts().find((x) => x.family.toLowerCase() === String(family || '').toLowerCase()) || render.fonts()[0];
  const face = f.faces.reduce((b, x) => (Math.abs(x.weight - weight) < Math.abs(b.weight - weight) ? x : b), f.faces[0]);
  doc.font(`${f.family}-${face.weight}`);
  return doc;
}
export const hasFont = (family) => render.fontNames().some((n) => n.toLowerCase() === String(family || '').toLowerCase());

// ---------------- renk ----------------

export function hexToRgb(hex) {
  let h = String(hex || '').replace('#', '');
  if (h.length === 3) h = h.split('').map((c) => c + c).join('');
  const n = parseInt(h.slice(0, 6), 16) || 0;
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
export function rgbToCmyk([r, g, b]) {
  const [R, G, B] = [r / 255, g / 255, b / 255];
  const k = 1 - Math.max(R, G, B);
  if (k >= 1) return [0, 0, 0, 100];
  return [(1 - R - k) / (1 - k), (1 - G - k) / (1 - k), (1 - B - k) / (1 - k), k].map((v) => Math.round(v * 100));
}
const lum = (hex) => {
  const [r, g, b] = hexToRgb(hex).map((v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
export const isDark = (hex) => lum(hex) < 0.35;
export const textOn = (hex) => (isDark(hex) ? '#FFFFFF' : '#111111');
export const validHex = (h) => /^#[0-9a-f]{3}([0-9a-f]{3})?$/i.test(String(h || ''));

// ---------------- görsel ----------------

// pdfkit PNG/JPEG çizer; SVG ve WebP önce PNG'ye çevrilir
export async function toPng(buf, mime = '') {
  if (/svg/.test(mime) || /^\s*<svg|^\s*<\?xml/.test(buf.subarray(0, 200).toString())) return render.svgToPng(buf.toString('utf8'), 1600);
  if (/png|jpe?g/.test(mime)) return buf;
  return sharp(buf).png().toBuffer();
}

// Şeffaf zeminli logodan tek renk (ör. beyaz) kopya; zemin şeffaf değilse null
export async function tintLogo(png, hex = '#FFFFFF') {
  const { data, info } = await sharp(png).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  let transparent = 0;
  for (let i = 3; i < data.length; i += 4) if (data[i] < 200) transparent++;
  if (transparent < (data.length / 4) * 0.05) return null;
  const [r, g, b] = hexToRgb(hex);
  for (let i = 0; i < data.length; i += 4) { data[i] = r; data[i + 1] = g; data[i + 2] = b; }
  return sharp(data, { raw: info }).png().toBuffer();
}

// ---------------- ajans ----------------

export function agencyInfo() {
  const s = store.getSettings(false);
  let logo = null;
  if (s.agencyLogo) {
    try { logo = fs.readFileSync(store.assetPath(store.AGENCY_ID, s.agencyLogo)); } catch {}
  }
  // Ayarlarda ajans logosu yüklenmediyse Agent-cy logosu (açık renk yazı, koyu son sayfada kullanılır)
  if (!logo) try { logo = fs.readFileSync(new URL('../assets/marka/agent-cy-logo.png', import.meta.url)); } catch {}
  const contact = [s.agencyWebsite, s.agencyEmail, s.agencyPhone, s.agencyAddress].map((x) => String(x || '').trim()).filter(Boolean);
  return { name: s.agencyName || 'Ajans', contact, logo };
}

// Ajansın logosu (yoksa adının baş harfleriyle bir işaret)
export function drawAgencyMark(doc, x, y, h, { color = '#111111', onDark = false } = {}) {
  const a = agencyInfo();
  if (a.logo) {
    try { doc.image(a.logo, x, y, { height: h }); return; } catch {}
  }
  const initials = a.name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0].toLocaleUpperCase('tr-TR')).join('');
  doc.save().roundedRect(x, y, h, h, h * 0.22).fill(onDark ? '#FFFFFF' : color);
  font(doc, 'Montserrat', 800).fontSize(h * 0.42).fillColor(onDark ? color : '#FFFFFF').text(initials, x, y + h * 0.27, { width: h, align: 'center', lineBreak: false });
  doc.restore();
  font(doc, 'Montserrat', 700).fontSize(h * 0.36).fillColor(onDark ? '#FFFFFF' : color).text(a.name, x + h * 1.25, y + h * 0.3, { lineBreak: false });
}

// Her sayfanın altına ince bir satır: sol tarafta belge adı, sağda ajans ve sayfa numarası
export function footers(doc, label, { skipFirst = true } = {}) {
  const a = agencyInfo();
  const range = doc.bufferedPageRange();
  const year = new Date().getFullYear();
  for (let i = range.start; i < range.start + range.count; i++) {
    if (skipFirst && i === range.start) continue;
    doc.switchToPage(i);
    const { width, height } = doc.page;
    const bottom = doc.page.margins.bottom;
    doc.page.margins.bottom = 0;
    doc.save().moveTo(48, height - 34).lineTo(width - 48, height - 34).lineWidth(0.5).strokeColor('#D9D9DE').stroke().restore();
    font(doc, 'Inter', 400).fontSize(7.5).fillColor('#8A8A93');
    doc.text(label, 48, height - 26, { width: width / 2, lineBreak: false });
    doc.text(`© ${year} ${a.name} · All Rights Reserved · ${i - range.start + 1}/${range.count}`, width / 2, height - 26, { width: width / 2 - 48, align: 'right', lineBreak: false });
    doc.page.margins.bottom = bottom;
  }
}

// Belgenin son sayfası: ajansın logosu, iletişim bilgileri ve telif notu
export function agencyPage(doc, { title, accent = '#111111' }) {
  const a = agencyInfo();
  doc.addPage();
  const { width, height } = doc.page;
  doc.rect(0, 0, width, height).fill('#0E0E12');
  doc.rect(0, height - 8, width, 8).fill(accent);
  drawAgencyMark(doc, 64, height / 2 - 140, 80, { color: accent, onDark: true });
  font(doc, 'Inter', 300).fontSize(11).fillColor('#B9B9C3').text(title, 64, height / 2 - 40, { width: width - 128 });
  let y = height / 2;
  font(doc, 'Inter', 500).fontSize(11).fillColor('#FFFFFF');
  for (const line of a.contact) { doc.text(line, 64, y, { width: width - 128 }); y += 17; }
  const year = new Date().getFullYear();
  font(doc, 'Inter', 600).fontSize(9).fillColor('#FFFFFF').text(`© ${year} ${a.name}. Tüm hakları saklıdır. All Rights Reserved.`, 64, height - 92, { width: width - 128 });
  font(doc, 'Inter', 300).fontSize(7.5).fillColor('#8A8A93').text(`Bu belgedeki tasarımlar, marka varlıkları ve metinler ${a.name} tarafından hazırlanmıştır; yazılı izin olmadan çoğaltılamaz, değiştirilemez ve üçüncü kişilerle paylaşılamaz.`, 64, height - 74, { width: width - 128 });
}

// Başlık bandı: küçük üst etiket + büyük başlık
export function heading(doc, kicker, title, { x = 48, y = 48, color = '#111111', accent = '#5B4CF0', width } = {}) {
  const w = width || doc.page.width - 96;
  font(doc, 'Montserrat', 600).fontSize(8.5).fillColor(accent).text(kicker.toLocaleUpperCase('tr-TR'), x, y, { width: w, characterSpacing: 2 });
  font(doc, 'Inter', 800).fontSize(24).fillColor(color).text(title, x, y + 16, { width: w });
  return doc.y + 14;
}

export function swatch(doc, x, y, w, h, { hex, name, role }) {
  const rgb = hexToRgb(hex);
  const cmyk = rgbToCmyk(rgb);
  doc.save().roundedRect(x, y, w, h, 8).fill(hex).restore();
  doc.save().roundedRect(x, y, w, h, 8).lineWidth(0.5).strokeColor('#E2E2E8').stroke().restore();
  const c = textOn(hex);
  font(doc, 'Inter', 700).fontSize(10).fillColor(c).text(name || hex, x + 10, y + h - 50, { width: w - 20, lineBreak: false, ellipsis: true });
  font(doc, 'Inter', 400).fontSize(7.5).fillColor(c);
  doc.text(`${hex.toUpperCase()} · RGB ${rgb.join(' ')}`, x + 10, y + h - 34, { width: w - 20, lineBreak: false });
  doc.text(`CMYK ${cmyk.join(' ')}${role ? ` · ${role}` : ''}`, x + 10, y + h - 22, { width: w - 20, lineBreak: false, ellipsis: true });
}
