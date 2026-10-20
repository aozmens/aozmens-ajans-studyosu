// Marka dosyası (PDF): logonun farklı zeminlerde kullanımı, uygulama ikonu, yazı tipleri, renkler, seçilen mockuplar
// ve en sonda ajansın logosu ve iletişim bilgileriyle kurumsal alt bilgi. Markanın "02 Marka Dosyası" klasörüne kaydedilir.
import fs from 'node:fs';
import sharp from 'sharp';
import * as store from './store.js';
import * as claude from './claude.js';
import * as pdf from './pdf.js';
import * as mockups from './mockups.js';
import { send } from './events.js';
import { systemFor, extractJson, companyBrief, saveCompanyImage, truncate } from './orchestrator.js';

const settings = () => store.getSettings(false);
const building = new Set();
export const isBuilding = (cid) => building.has(cid);

export const DEFAULT_MOCKUPS = ['hazir-kartvizit', 'hazir-uygulama', 'hazir-tabela'];

// Kısa yönlendirme metinleri (Claude). Hata olursa sade varsayılanlar kullanılır.
async function texts(c, { jobId, signal } = {}) {
  const fallback = {
    ozet: c.about ? truncate(c.about, 400).replace(/\n+/g, ' ') : `${c.name} marka kimliğinin doğru ve tutarlı kullanımı için hazırlanmış kılavuz.`,
    logoKurallari: ['Logonun çevresinde logo yüksekliğinin en az yarısı kadar boşluk bırakın.', 'Dijitalde en küçük kullanım 120 px, baskıda 25 mm genişliktir.', 'Koyu zeminlerde açık renk logoyu, açık zeminlerde ana logoyu kullanın.'],
    yanlisKullanim: ['Logoyu esnetmeyin, döndürmeyin, oranlarını bozmayın.', 'Logoya gölge, kontur veya efekt eklemeyin.', 'Kontrastı düşük zeminlerde kullanmayın.'],
    ikonNotu: 'Uygulama ikonu köşeleri düz olarak hazırlanır; iOS ve Android kendi maskesini uygular.',
    fontNotu: 'Başlıklarda başlık yazı tipini, metinlerde gövde yazı tipini kullanın; bir tasarımda en fazla iki aile.',
    renkKullanimi: {},
    usage: null,
  };
  if (!settings().apiKey) return fallback;
  try {
    const r = await claude.call({
      model: settings().designModel || settings().model,
      system: systemFor('kreatif-direktor', '', true),
      messages: [{ role: 'user', content: `${companyBrief(c, { steps: [], options: {} })}

# Görevin: marka dosyası metinleri
${c.name} için hazırlanan marka kılavuzu PDF'ine kısa, uygulanabilir metinler yaz. Yazı tipleri: başlık ${fontsOf(c).heading}, gövde ${fontsOf(c).body}. Renkler: ${(c.palette || []).map((p) => `${p.name} ${p.hex}`).join(', ') || '-'}.
Yanıtın yalnızca şu JSON olsun:
\`\`\`json
{ "ozet": "Türkçe 2-3 cümle marka özü", "logoKurallari": ["3-5 madde"], "yanlisKullanim": ["3-5 madde"], "ikonNotu": "tek cümle", "fontNotu": "tek cümle", "renkKullanimi": { "#HEX": "bu renk nerede ve hangi oranda kullanılır" } }
\`\`\`` }],
      maxTokens: 3000,
      signal,
      tag: { companyId: c.id, jobId, agent: 'kreatif-direktor', kind: 'marka-dosyasi' },
    });
    const o = extractJson(r.text);
    const arr = (x, d) => (Array.isArray(x) && x.length ? x.map(String).slice(0, 6) : d);
    return {
      ozet: String(o.ozet || fallback.ozet), logoKurallari: arr(o.logoKurallari, fallback.logoKurallari), yanlisKullanim: arr(o.yanlisKullanim, fallback.yanlisKullanim),
      ikonNotu: String(o.ikonNotu || fallback.ikonNotu), fontNotu: String(o.fontNotu || fallback.fontNotu),
      renkKullanimi: o.renkKullanimi && typeof o.renkKullanimi === 'object' ? o.renkKullanimi : {}, usage: r.usage,
    };
  } catch (e) {
    if (signal?.aborted) throw e;
    return fallback;
  }
}

export const fontsOf = (c) => ({ heading: pdf.hasFont(c.fontHeading) ? c.fontHeading : 'Montserrat', body: pdf.hasFont(c.fontBody) ? c.fontBody : 'Inter' });

// Görseli kutuya sığdırır ve ortalar
function fit(doc, buf, x, y, w, h) {
  try { doc.image(buf, x, y, { fit: [w, h], align: 'center', valign: 'center' }); } catch {}
}

export async function build(companyId, { mockupIds = DEFAULT_MOCKUPS, jobId, signal } = {}) {
  const c = store.getCompany(companyId);
  if (!c) throw new Error('Marka bulunamadı');
  if (building.has(companyId)) throw new Error('Bu markanın dosyası zaten hazırlanıyor.');
  building.add(companyId);
  send('company:update', { id: companyId });
  try {
    const logos = await mockups.brandLogos(c);
    const t = await texts(c, { jobId, signal });
    const f = fontsOf(c);
    const pal = (c.palette || []).filter((p) => pdf.validHex(p.hex));
    const colors = pal.length ? pal : [{ name: 'Koyu', hex: '#16161C' }, { name: 'Açık', hex: '#F4F4F6' }];
    const primary = colors[0].hex;
    const secondary = colors[1]?.hex || primary;
    const dark = colors.find((p) => pdf.isDark(p.hex))?.hex || '#141418';
    const ink = '#15151B';
    const date = new Date().toLocaleDateString('tr-TR', { day: 'numeric', month: 'long', year: 'numeric' });
    const title = `${c.name} · Marka Kılavuzu`;
    const { doc, finish } = pdf.createDoc({ title, subject: `${c.name} brand guidelines: logo usage, app icon, typography, colors, mockups`, keywords: `brand guidelines, ${c.name}, ${colors.map((p) => p.hex).join(', ')}, ${f.heading}, ${f.body}`, layout: 'landscape' });
    const W = doc.page.width;
    const H = doc.page.height;
    const logoOn = (bg) => (pdf.isDark(bg) ? logos.white : logos.color);

    // 1. Kapak
    doc.rect(0, 0, W, H).fill(dark);
    doc.rect(0, H - 10, W, 10).fill(primary === dark ? secondary : primary);
    if (logoOn(dark)) fit(doc, logoOn(dark), W / 2 - 170, 120, 340, 180);
    else if (logos.color) { doc.save().roundedRect(W / 2 - 180, 110, 360, 200, 18).fill('#FFFFFF').restore(); fit(doc, logos.color, W / 2 - 150, 130, 300, 160); }
    pdf.font(doc, f.heading, 800).fontSize(34).fillColor('#FFFFFF').text(c.name, 48, 350, { width: W - 96, align: 'center' });
    pdf.font(doc, 'Montserrat', 600).fontSize(10).fillColor('#BDBDC7').text('MARKA KILAVUZU · BRAND GUIDELINES', 48, doc.y + 8, { width: W - 96, align: 'center', characterSpacing: 2.5 });
    doc.page.margins.bottom = 0;
    pdf.font(doc, 'Inter', 400).fontSize(9).fillColor('#8A8A93').text(`${date} · Hazırlayan: ${pdf.agencyInfo().name}`, 48, H - 52, { width: W - 96, align: 'center', lineBreak: false });
    doc.page.margins.bottom = 48;

    // 2. Marka özü + palet özeti
    doc.addPage();
    let y = pdf.heading(doc, 'Marka', `${c.name} kimliği`, { accent: primary === '#FFFFFF' ? ink : primary });
    pdf.font(doc, f.body, 400).fontSize(13).fillColor('#33333A').text(t.ozet, 48, y + 6, { width: W * 0.55, lineGap: 4 });
    if (logos.color) fit(doc, logos.color, W * 0.64, 110, W * 0.3, 200);
    const bw = (W - 96) / colors.length;
    colors.forEach((p, i) => doc.rect(48 + i * bw, H - 170, bw, 100).fill(p.hex));
    pdf.font(doc, 'Inter', 400).fontSize(8).fillColor('#8A8A93').text([c.sector, c.website, c.tone].filter(Boolean).join(' · '), 48, H - 60, { width: W - 96 });

    // 3. Logo farklı zeminlerde
    doc.addPage();
    y = pdf.heading(doc, 'Logo', 'Farklı zeminlerde kullanım', { accent: primary });
    const grounds = [
      ['Beyaz zemin', '#FFFFFF'], ['Açık gri zemin', '#F1F1F4'], ['Siyah zemin', '#111114'],
      [`Ana renk · ${primary}`, primary], [`İkincil renk · ${secondary}`, secondary], ['Marka degradesi', null],
    ];
    const gw = (W - 96 - 2 * 16) / 3;
    const gh = (H - y - 120) / 2;
    for (let i = 0; i < grounds.length; i++) {
      const [label, hex] = grounds[i];
      const gx = 48 + (i % 3) * (gw + 16);
      const gy = y + Math.floor(i / 3) * (gh + 30);
      if (hex) doc.save().roundedRect(gx, gy, gw, gh, 10).fill(hex).restore();
      else {
        const grad = doc.linearGradient(gx, gy, gx + gw, gy + gh);
        grad.stop(0, primary).stop(1, secondary === primary ? dark : secondary);
        doc.save().roundedRect(gx, gy, gw, gh, 10).fill(grad).restore();
      }
      doc.save().roundedRect(gx, gy, gw, gh, 10).lineWidth(0.5).strokeColor('#E0E0E6').stroke().restore();
      const bg = hex || primary;
      const lg = logoOn(bg);
      if (lg) fit(doc, lg, gx + gw * 0.18, gy + gh * 0.2, gw * 0.64, gh * 0.6);
      else if (logos.color) {
        doc.save().roundedRect(gx + gw * 0.2, gy + gh * 0.22, gw * 0.6, gh * 0.56, 8).fill('#FFFFFF').restore();
        fit(doc, logos.color, gx + gw * 0.26, gy + gh * 0.28, gw * 0.48, gh * 0.44);
      } else pdf.font(doc, f.heading, 800).fontSize(20).fillColor(pdf.textOn(bg)).text(c.name, gx, gy + gh / 2 - 12, { width: gw, align: 'center' });
      pdf.font(doc, 'Inter', 500).fontSize(8).fillColor('#55555E').text(label + (lg && pdf.isDark(bg) ? ' · açık renk logo' : ''), gx, gy + gh + 6, { width: gw });
    }

    // 4. Logo kuralları
    doc.addPage();
    y = pdf.heading(doc, 'Logo', 'Kullanım kuralları', { accent: primary });
    if (logos.color) {
      doc.save().roundedRect(48, y, W * 0.42, H - y - 80, 10).fill('#F6F6F8').restore();
      const bx = 48 + W * 0.07;
      const bwid = W * 0.28;
      const bh = H - y - 80 - 80;
      doc.save().dash(4, { space: 3 }).rect(bx - 20, y + 20, bwid + 40, bh + 40).lineWidth(0.7).strokeColor(primary).stroke().undash().restore();
      fit(doc, logos.color, bx, y + 40, bwid, bh);
      pdf.font(doc, 'Inter', 400).fontSize(7.5).fillColor('#8A8A93').text('Kesik çizgi: koruma alanı', 60, H - 92, { width: W * 0.4 });
    }
    const rx = logos.color ? 48 + W * 0.46 : 48;
    const rw = W - rx - 48;
    pdf.font(doc, 'Inter', 700).fontSize(11).fillColor(ink).text('Doğru kullanım', rx, y);
    pdf.font(doc, f.body, 400).fontSize(10).fillColor('#33333A');
    for (const it of t.logoKurallari) doc.text(`•  ${it}`, rx, doc.y + 5, { width: rw, lineGap: 1.5 });
    pdf.font(doc, 'Inter', 700).fontSize(11).fillColor(ink).text('Yapılmaması gerekenler', rx, doc.y + 16);
    pdf.font(doc, f.body, 400).fontSize(10).fillColor('#33333A');
    for (const it of t.yanlisKullanim) doc.text(`×  ${it}`, rx, doc.y + 5, { width: rw, lineGap: 1.5 });

    // 5. Uygulama ikonu
    doc.addPage();
    y = pdf.heading(doc, 'Uygulama ikonu', 'İkon kullanımları', { accent: primary });
    const appMock = mockups.get('hazir-uygulama');
    // Kare ikon (favicon), iOS (yuvarlatılmış), Android (daire)
    const tiles = { square: await iconTile(c, logos, 0.08), ios: await iconTile(c, logos, 0.225), android: await iconTile(c, logos, 0.5) };
    const sizes = [[150, 'iOS · 1024 px'], [96, 'Android · 512 px'], [64, '180 px'], [32, 'Favicon · 48 px']];
    let ix = 48;
    for (const [s, label] of sizes) {
      fit(doc, s === 96 ? tiles.android : s === 32 ? tiles.square : tiles.ios, ix, y + 10 + (150 - s), s, s);
      pdf.font(doc, 'Inter', 500).fontSize(8).fillColor('#55555E').text(label, ix, y + 172, { width: Math.max(s, 80) });
      ix += Math.max(s, 80) + 34;
    }
    pdf.font(doc, f.body, 400).fontSize(10).fillColor('#33333A').text(t.ikonNotu, 48, y + 200, { width: W * 0.45, lineGap: 2 });
    try {
      const phone = await mockups.compose(appMock, c, logos);
      fit(doc, phone, W * 0.55, y - 10, W * 0.4, H - y - 60);
    } catch {}

    // 6. Yazı tipleri
    doc.addPage();
    y = pdf.heading(doc, 'Tipografi', 'Yazı tipi seçimleri', { accent: primary });
    const specimen = (fam, label, weights, yy) => {
      pdf.font(doc, 'Montserrat', 600).fontSize(8).fillColor(primary === '#FFFFFF' ? ink : primary).text(label.toLocaleUpperCase('tr-TR'), 48, yy, { characterSpacing: 1.6 });
      pdf.font(doc, fam, weights[0]).fontSize(44).fillColor(ink).text(fam, 48, yy + 14, { width: W / 2 - 60, lineBreak: false });
      pdf.font(doc, fam, weights[0]).fontSize(15).fillColor('#33333A').text('ABCÇDEFGĞHIİJKLMNOÖPRSŞTUÜVYZ\nabcçdefgğhıijklmnoöprsştuüvyz 0123456789', 48, yy + 70, { width: W / 2 - 60, lineGap: 3 });
      let wx = 48;
      for (const w of weights) { pdf.font(doc, fam, w).fontSize(10).fillColor('#55555E').text(`${w}`, wx, yy + 128, { lineBreak: false }); wx += 46; }
    };
    specimen(f.heading, 'Başlık yazı tipi', [800, 600, 400], y);
    specimen(f.body, 'Gövde yazı tipi', [400, 600, 300], y + 170);
    const hx = W / 2 + 20;
    doc.save().roundedRect(hx, y, W - hx - 48, H - y - 80, 12).fill('#F6F6F8').restore();
    pdf.font(doc, f.heading, 800).fontSize(26).fillColor(primary === '#FFFFFF' ? ink : primary).text('Başlık örneği', hx + 24, y + 26, { width: W - hx - 96 });
    pdf.font(doc, f.heading, 600).fontSize(15).fillColor(ink).text('Alt başlık burada yer alır', hx + 24, doc.y + 6, { width: W - hx - 96 });
    pdf.font(doc, f.body, 400).fontSize(10.5).fillColor('#33333A').text('Gövde metni okunur, sade ve dengeli olmalı. Uzun metinlerde satır uzunluğu 60-75 karakteri geçmesin; satır aralığı yazı boyutunun yaklaşık 1,4 katı olsun.', hx + 24, doc.y + 10, { width: W - hx - 96, lineGap: 3 });
    pdf.font(doc, 'Inter', 400).fontSize(9).fillColor('#55555E').text(t.fontNotu, hx + 24, H - 130, { width: W - hx - 96, lineGap: 2 });

    // 7. Renkler
    doc.addPage();
    y = pdf.heading(doc, 'Renk', 'Renk paleti', { accent: primary === '#FFFFFF' ? ink : primary });
    const n = colors.length;
    const cols = Math.min(4, n);
    const cw = (W - 96 - (cols - 1) * 14) / cols;
    const ch = n > 4 ? 150 : 220;
    colors.forEach((p, i) => {
      const cx = 48 + (i % cols) * (cw + 14);
      const cy = y + Math.floor(i / cols) * (ch + 46);
      pdf.swatch(doc, cx, cy, cw, ch, { hex: p.hex, name: p.name, role: i === 0 ? 'ana renk' : i === 1 ? 'ikincil' : '' });
      const use = t.renkKullanimi?.[p.hex] || t.renkKullanimi?.[p.hex.toLowerCase()] || '';
      if (use) pdf.font(doc, 'Inter', 400).fontSize(8).fillColor('#55555E').text(use, cx, cy + ch + 6, { width: cw, height: 36, ellipsis: true });
    });

    // 8. Mockuplar
    const chosen = (mockupIds || []).map((id) => mockups.get(id)).filter(Boolean);
    const saved = [];
    if (logos.color && chosen.length) {
      for (let i = 0; i < chosen.length; i += 2) {
        doc.addPage();
        y = pdf.heading(doc, 'Uygulamalar', 'Mockup tasarımları', { accent: primary });
        for (let k = 0; k < 2 && chosen[i + k]; k++) {
          const m = chosen[i + k];
          try {
            const png = await mockups.compose(m, c, logos);
            const mw = (W - 96 - 16) / 2;
            fit(doc, png, 48 + k * (mw + 16), y, mw, H - y - 90);
            pdf.font(doc, 'Inter', 500).fontSize(9).fillColor('#55555E').text(m.name, 48 + k * (mw + 16), H - 82, { width: mw });
            saved.push({ m, png });
          } catch {}
        }
      }
    }

    pdf.agencyPage(doc, { title, accent: primary });
    pdf.footers(doc, title);
    const buf = await finish();

    // Mockupları markanın klasörüne de kaydet (aynı mockupun eski kopyası silinir)
    for (const { m, png } of saved) {
      for (const old of c.files.filter((x) => x.mockupId === m.id && !x.aiPrompt)) store.removeAsset(c.id, 'files', old.id);
      const e = await saveCompanyImage(c, { buf: png, mime: 'image/png' }, { name: `Mockup · ${m.name}`, role: 'mockup' });
      e.mockupId = m.id;
    }
    const day = new Date().toISOString().slice(0, 10);
    const file = store.writeAsset(c.id, { name: `${c.name} Marka Kılavuzu ${day}.pdf`, buf, mime: 'application/pdf', ext: 'pdf', folder: store.FOLDERS.brandBook });
    const entry = { id: file.id, name: `${c.name} Marka Kılavuzu`, file: file.file, size: buf.length, createdAt: store.now(), mockupIds: chosen.map((m) => m.id), jobId: jobId || null, usage: t.usage };
    c.brandBooks.unshift(entry);
    c.brandBooks = c.brandBooks.slice(0, 30);
    store.flush();
    return entry;
  } finally {
    building.delete(companyId);
    send('company:update', { id: companyId });
  }
}

// Boş bir tuval üzerinde ikon karosu (mockup sahnesi olmadan); radius: köşe yuvarlaklığı (0.5 = daire)
function iconTile(c, logos, radius) {
  const blank = { id: 'ikon', builtin: true, icon: true, width: 1024, height: 1024, radius, placement: { x: 0, y: 0, w: 1, h: 1 }, svg: () => '<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024"/>' };
  return mockups.compose(blank, c, logos).catch(() => null);
}

export function remove(companyId, bid) {
  const c = store.getCompany(companyId);
  const b = c?.brandBooks.find((x) => x.id === bid);
  if (!b) return;
  fs.rmSync(store.assetPath(c.id, b.file), { force: true });
  c.brandBooks = c.brandBooks.filter((x) => x.id !== bid);
  store.flush();
}
