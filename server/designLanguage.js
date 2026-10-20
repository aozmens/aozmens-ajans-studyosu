// Tasarım dili PDF'i: ilham arşivindeki görsellerin promptları, renk paletleri ve yazı tipleri tek bir ana prompt
// ve kurallar bütününe çevrilir. PDF hem insan için okunur hem de bir yapay zekâ aracına yüklendiğinde
// algılanabilir: içinde düz metin JSON bloğu, PDF anahtar kelimeleri ve ek dosya olarak tasarim-dili.json var.
import fs from 'node:fs';
import * as store from './store.js';
import * as claude from './claude.js';
import * as render from './render.js';
import * as pdf from './pdf.js';
import { send } from './events.js';
import { systemFor, extractJson } from './orchestrator.js';

const settings = () => store.getSettings(false);
export const MARKER_START = '<<<DESIGN_LANGUAGE_JSON';
export const MARKER_END = 'DESIGN_LANGUAGE_JSON>>>';

function inspirations(ids) {
  const all = store.getAgency().styles;
  const list = (ids?.length ? ids.map((x) => all.find((s) => s.id === x)) : all).filter((s) => s?.analysis?.prompt);
  return list.slice(0, 40);
}

export async function create({ inspirationIds = [], name = '' } = {}) {
  const list = inspirations(inspirationIds);
  if (list.length < 1) throw new Error('Önce ilham arşivine görsel yükleyip taranmasını bekleyin (en az 1 taranmış görsel).');
  const a = store.getAgency();
  const entry = { id: store.id(), name: name || 'Tasarım dili', inspirationIds: list.map((s) => s.id), status: 'running', createdAt: store.now(), data: null, pdfFile: null, error: null };
  a.designLanguages.unshift(entry);
  store.flush();
  send('agency:update', {});
  build(entry, list).catch(() => {});
  return entry;
}

async function build(entry, list) {
  try {
    const content = [];
    for (const s of list.slice(0, 8)) {
      try { content.push({ type: 'text', text: `İlham görseli: ${s.name}` }, await render.imageBlockFromFile(store.assetPath(store.AGENCY_ID, s.file), 800)); } catch {}
    }
    content.push({ type: 'text', text: `# İlham görsellerinden çıkarılan analizler
${list.map((s, i) => `## ${i + 1}. ${s.name}
- Prompt: ${s.analysis.prompt}
- Ana ürün / kompozisyon: ${s.analysis.subject || '-'}
- Stil eki: ${s.analysis.styleSuffix || '-'}
- Negatif: ${s.analysis.negative || '-'}
- Tür: ${s.analysis.medium || '-'} · Stil: ${s.analysis.style || '-'} · Işık: ${s.analysis.lighting || '-'} · Kompozisyon: ${s.analysis.composition || '-'} · Ruh hâli: ${s.analysis.mood || '-'}
- Tipografi: ${s.analysis.typography || '-'}${(s.analysis.fonts || []).length ? ` · Yazı tipleri: ${s.analysis.fonts.map((f) => `${f.rol}: ${f.tahmin} (${f.stil}) → ${f.programFontu}`).join('; ')}` : ''}
- Palet: ${(s.analysis.palette || []).join(', ')}`).join('\n')}

# Görevin: tasarım dili çıkar
Bu ${list.length} görsel ajansın benimsediği tek bir tasarım dilini temsil ediyor. Ortak paydayı bul ve tek bir tasarım dili olarak tanımla. Bu tanım bir PDF'e dönüşecek ve kullanıcı PDF'i bir görsel üretim aracına (Midjourney, Flux, GPT Image, Gemini) ya da başka bir yapay zekâya yüklediğinde, araç bu dili birebir uygulayabilmeli. Bu yüzden her şeyi ölçülebilir yaz: HEX, yüzde, piksel, lens, açı.

Yazı tiplerinde önce görsellerdeki gerçek yazı tipini tahmin et, sonra programdaki en yakın karşılığı yalnızca şu listeden seç: ${render.fontNames().join(', ')}.

Yanıtın yalnızca şu JSON olsun:
\`\`\`json
{
  "ad": "Tasarım dilinin kısa adı",
  "ozet": "Türkçe 2-3 cümle: bu dil nedir, nasıl hissettirir",
  "masterPrompt": "İngilizce, 150-250 kelime, piksel piksel tek ana prompt: tür, kompozisyon ızgarası ve ürün yerleşimi (yüzdelerle), kamera ve lens, ışık kurulumu, renk derecelendirmesi (HEX ile), doku, grafik öğeler, tipografi tarzı. Konu yerine [SUBJECT] yer tutucusu kullan.",
  "styleSuffix": "İngilizce 20-40 kelime, herhangi bir konuya eklenince bu dili veren ek",
  "negative": "İngilizce negatif prompt",
  "palette": [{ "name": "Türkçe ad", "hex": "#RRGGBB", "role": "zemin | orta ton | vurgu | metin | ikincil", "oran": "%60" }],
  "fonts": [{ "rol": "Başlık | Alt başlık | Gövde | Etiket/CTA", "tahmin": "görseldeki yazı tipi tahmini", "stil": "Türkçe tarif", "program": "listeden aile", "agirlik": 800, "boyut": "1080 px tuvalde 96-120 px", "harfAraligi": "-2 px", "satirAraligi": "1.05" }],
  "kompozisyon": ["ölçülü kural", "…"],
  "isik": "Türkçe ışık kurulumu",
  "kamera": "Türkçe kamera, lens, açı",
  "doku": "Türkçe doku ve malzeme",
  "grafikOgeler": ["hap düğme rx…", "…"],
  "yapilacaklar": ["…"],
  "yapilmayacaklar": ["…"]
}
\`\`\`` });
    const r = await claude.call({
      model: settings().designModel || settings().model,
      system: systemFor('grafik-tasarimci', '', true),
      messages: [{ role: 'user', content }],
      maxTokens: 8000,
      tag: { agent: 'grafik-tasarimci', kind: 'tasarim-dili' },
    });
    const d = normalize(extractJson(r.text));
    d.gorseller = list.map((s) => ({ id: s.id, name: s.name, prompt: s.analysis.prompt, subject: s.analysis.subject || '', palette: s.analysis.palette || [], fonts: s.analysis.fonts || [] }));
    entry.data = d;
    if (!entry.name || entry.name === 'Tasarım dili') entry.name = d.ad || entry.name;
    entry.usage = r.usage;
    const buf = await renderPdf(entry, list);
    const file = store.writeAsset(store.AGENCY_ID, { name: `${entry.name}.pdf`, buf, mime: 'application/pdf', ext: 'pdf', folder: store.AGENCY_FOLDERS.designLanguage });
    entry.pdfFile = file.file;
    entry.status = 'done';
  } catch (e) {
    entry.status = 'error';
    entry.error = e.message;
  } finally {
    store.flush();
    send('agency:update', {});
  }
}

function normalize(o) {
  const arr = (x) => (Array.isArray(x) ? x.map(String).filter(Boolean) : []);
  return {
    ad: String(o.ad || ''), ozet: String(o.ozet || ''), masterPrompt: String(o.masterPrompt || ''), styleSuffix: String(o.styleSuffix || ''), negative: String(o.negative || ''),
    palette: (o.palette || []).filter((p) => pdf.validHex(p?.hex)).slice(0, 10).map((p) => ({ name: String(p.name || ''), hex: p.hex.toUpperCase(), role: String(p.role || ''), oran: String(p.oran || '') })),
    fonts: (o.fonts || []).slice(0, 6).map((f) => ({ ...f, program: pdf.hasFont(f.program) ? f.program : 'Inter', agirlik: +f.agirlik || 400 })),
    kompozisyon: arr(o.kompozisyon), isik: String(o.isik || ''), kamera: String(o.kamera || ''), doku: String(o.doku || ''),
    grafikOgeler: arr(o.grafikOgeler), yapilacaklar: arr(o.yapilacaklar), yapilmayacaklar: arr(o.yapilmayacaklar),
  };
}

// Yapay zekâ araçları için düz metin talimat ve JSON (PDF'in 2. sayfası ve ek dosya)
export function machineJson(entry) {
  const d = entry.data;
  return {
    type: 'design-language', version: 1, name: entry.name, generator: 'Agent-cy', createdAt: entry.createdAt,
    instructions: 'Apply this design language to every image or layout you generate. Replace [SUBJECT] in masterPrompt with the requested subject, append styleSuffix, use the palette HEX values with the given ratios and the listed font roles, and avoid everything in negative and donts.',
    masterPrompt: d.masterPrompt, styleSuffix: d.styleSuffix, negative: d.negative,
    palette: d.palette, fonts: d.fonts, composition: d.kompozisyon, lighting: d.isik, camera: d.kamera, texture: d.doku,
    graphicElements: d.grafikOgeler, dos: d.yapilacaklar, donts: d.yapilmayacaklar,
    sources: d.gorseller.map((g) => ({ name: g.name, prompt: g.prompt, subject: g.subject, palette: g.palette })),
  };
}

// Ajansın görsel diline aktarmak için Markdown
export function toMarkdown(entry) {
  const d = entry.data;
  return `# ${entry.name}

${d.ozet}

## Ana prompt
${d.masterPrompt}

Stil eki: ${d.styleSuffix}
Negatif: ${d.negative}

## Renk sistemi
${d.palette.map((p) => `- ${p.name} ${p.hex} · ${p.role}${p.oran ? ` · ${p.oran}` : ''}`).join('\n')}

## Tipografi
${d.fonts.map((f) => `- ${f.rol}: ${f.program} ${f.agirlik} · ${f.boyut || ''} · harf aralığı ${f.harfAraligi || '0'} · satır ${f.satirAraligi || ''} (görseldeki: ${f.tahmin || '-'}, ${f.stil || ''})`).join('\n')}

## Kompozisyon
${d.kompozisyon.map((x) => `- ${x}`).join('\n')}

## Işık, kamera, doku
- Işık: ${d.isik}
- Kamera: ${d.kamera}
- Doku: ${d.doku}

## Grafik öğeler
${d.grafikOgeler.map((x) => `- ${x}`).join('\n')}

## Yapılacaklar
${d.yapilacaklar.map((x) => `- ${x}`).join('\n')}

## Yapılmayacaklar
${d.yapilmayacaklar.map((x) => `- ${x}`).join('\n')}
`;
}

async function renderPdf(entry, list) {
  const d = entry.data;
  const json = machineJson(entry);
  const accent = d.palette.find((p) => /vurgu/i.test(p.role))?.hex || d.palette[0]?.hex || '#5B4CF0';
  const { doc, finish } = pdf.createDoc({
    title: `${entry.name} · Tasarım dili`,
    subject: `Design language for AI image generation. Master prompt: ${d.masterPrompt.slice(0, 400)}`,
    keywords: `design-language, style-guide, ai-prompt, ${d.palette.map((p) => p.hex).join(', ')}, ${d.fonts.map((f) => f.program).join(', ')}`,
  });
  const W = doc.page.width;
  const H = doc.page.height;
  const ink = '#111116';

  // 1. Kapak
  doc.rect(0, 0, W, H).fill('#0E0E12');
  const bandW = (W - 96) / Math.max(1, d.palette.length);
  d.palette.forEach((p, i) => doc.rect(48 + i * bandW, H - 210, bandW, 120).fill(p.hex));
  pdf.font(doc, 'Montserrat', 600).fontSize(9).fillColor(accent).text('TASARIM DİLİ · DESIGN LANGUAGE', 48, 72, { characterSpacing: 2.5 });
  pdf.font(doc, d.fonts[0]?.program || 'Inter', d.fonts[0]?.agirlik || 800).fontSize(40).fillColor('#FFFFFF').text(entry.name, 48, 96, { width: W - 96 });
  pdf.font(doc, 'Inter', 300).fontSize(12).fillColor('#C9C9D2').text(d.ozet, 48, doc.y + 14, { width: W - 140, lineGap: 3 });
  pdf.font(doc, 'Inter', 400).fontSize(9).fillColor('#8A8A93').text(`${list.length} ilham görselinden · ${new Date(entry.createdAt).toLocaleDateString('tr-TR', { day: 'numeric', month: 'long', year: 'numeric' })} · ${pdf.agencyInfo().name}`, 48, H - 70, { width: W - 96, lineBreak: false });

  // 2. Yapay zekâ için talimat (makine tarafından okunur)
  doc.addPage();
  let y = pdf.heading(doc, 'Yapay zekâ aracı için', 'Ana prompt ve talimat', { accent });
  pdf.font(doc, 'Inter', 400).fontSize(9).fillColor('#55555E').text('Bu PDF bir tasarım dilidir. Bir görsel üretim aracına ya da yapay zekâya yüklediğinde aşağıdaki talimatı ve JSON bloğunu okur: [SUBJECT] yerine istenen konuyu koyar, stil ekini, paleti ve yazı tiplerini uygular.', 48, y, { width: W - 96, lineGap: 2 });
  y = doc.y + 12;
  doc.save().roundedRect(48, y, W - 96, 8, 4).fill(accent).restore();
  y += 18;
  pdf.font(doc, 'Inter', 700).fontSize(10).fillColor(ink).text('MASTER PROMPT', 48, y);
  pdf.font(doc, 'Inter', 400).fontSize(10).fillColor(ink).text(d.masterPrompt, 48, doc.y + 4, { width: W - 96, lineGap: 2.5 });
  pdf.font(doc, 'Inter', 700).fontSize(10).text('STYLE SUFFIX', 48, doc.y + 10);
  pdf.font(doc, 'Inter', 400).fontSize(10).text(d.styleSuffix, 48, doc.y + 4, { width: W - 96, lineGap: 2 });
  pdf.font(doc, 'Inter', 700).fontSize(10).text('NEGATIVE PROMPT', 48, doc.y + 10);
  pdf.font(doc, 'Inter', 400).fontSize(10).text(d.negative, 48, doc.y + 4, { width: W - 96, lineGap: 2 });
  pdf.font(doc, 'Inter', 700).fontSize(10).text('MACHINE-READABLE DESIGN LANGUAGE (JSON)', 48, doc.y + 14);
  pdf.font(doc, 'Inter', 400).fontSize(6.5).fillColor('#33333A').text(`${MARKER_START}\n${JSON.stringify(json)}\n${MARKER_END}`, 48, doc.y + 4, { width: W - 96, lineGap: 0.5 });

  // 3. Renk sistemi
  doc.addPage();
  y = pdf.heading(doc, 'Renk sistemi', 'Palet ve oranlar', { accent });
  const cols = 3;
  const gw = (W - 96 - (cols - 1) * 14) / cols;
  d.palette.forEach((p, i) => pdf.swatch(doc, 48 + (i % cols) * (gw + 14), y + Math.floor(i / cols) * 132, gw, 118, { hex: p.hex, name: `${p.name}${p.oran ? ` · ${p.oran}` : ''}`, role: p.role }));

  // 4. Tipografi
  doc.addPage();
  y = pdf.heading(doc, 'Tipografi', 'Yazı tipleri ve hiyerarşi', { accent });
  for (const f of d.fonts) {
    if (y > H - 170) { doc.addPage(); y = 48; }
    pdf.font(doc, 'Montserrat', 600).fontSize(8).fillColor(accent).text(String(f.rol || '').toLocaleUpperCase('tr-TR'), 48, y, { characterSpacing: 1.5 });
    pdf.font(doc, f.program, f.agirlik).fontSize(30).fillColor(ink).text('Aa Bb Çç Ğğ İı Öö Şş Üü 123', 48, y + 14, { width: W - 96, lineBreak: false });
    pdf.font(doc, 'Inter', 400).fontSize(9).fillColor('#55555E').text(`${f.program} ${f.agirlik} · ${f.boyut || ''} · harf aralığı ${f.harfAraligi || '0'} · satır aralığı ${f.satirAraligi || '-'}\nGörseldeki yazı tipi: ${f.tahmin || '-'} · ${f.stil || ''}`, 48, y + 54, { width: W - 96, lineGap: 1.5 });
    y = doc.y + 18;
  }

  // 5. Kurallar
  doc.addPage();
  y = pdf.heading(doc, 'Kurallar', 'Kompozisyon, ışık ve öğeler', { accent });
  const section = (title, items) => {
    if (!items.length) return;
    if (doc.y > H - 120) doc.addPage();
    pdf.font(doc, 'Inter', 700).fontSize(11).fillColor(ink).text(title, 48, doc.y + 10);
    pdf.font(doc, 'Inter', 400).fontSize(9.5).fillColor('#33333A');
    for (const it of items) doc.text(`•  ${it}`, 56, doc.y + 3, { width: W - 112, lineGap: 1.5 });
  };
  doc.y = y - 10;
  section('Kompozisyon', d.kompozisyon);
  section('Işık', [d.isik].filter(Boolean));
  section('Kamera ve lens', [d.kamera].filter(Boolean));
  section('Doku ve malzeme', [d.doku].filter(Boolean));
  section('Grafik öğeler', d.grafikOgeler);
  section('Yapılacaklar', d.yapilacaklar);
  section('Yapılmayacaklar', d.yapilmayacaklar);

  // 6. Kaynak görseller ve her birinin promptu
  let col = 0;
  for (const s of list) {
    if (col % 2 === 0) { doc.addPage(); y = pdf.heading(doc, 'Kaynak görseller', 'İlham ve piksel promptları', { accent }); }
    const top = col % 2 === 0 ? y : y + (H - y - 60) / 2;
    try {
      const p = await render.prepareImage(fs.readFileSync(store.assetPath(store.AGENCY_ID, s.file)), 700);
      doc.image(p.buf, 48, top, { fit: [190, (H - y - 80) / 2], align: 'center', valign: 'top' });
    } catch {}
    pdf.font(doc, 'Inter', 700).fontSize(10).fillColor(ink).text(s.analysis.style || s.name, 252, top, { width: W - 300 });
    pdf.font(doc, 'Inter', 400).fontSize(7.8).fillColor('#33333A').text(s.analysis.prompt, 252, doc.y + 3, { width: W - 300, lineGap: 1, height: (H - y - 140) / 2, ellipsis: true });
    if (s.analysis.subject) pdf.font(doc, 'Inter', 400).fontSize(7.5).fillColor('#55555E').text(`Ürün / kompozisyon: ${s.analysis.subject}`, 252, doc.y + 4, { width: W - 300, height: 60, ellipsis: true });
    (s.analysis.palette || []).forEach((h, i) => doc.save().roundedRect(252 + i * 22, doc.y + 6, 18, 18, 4).fill(h).restore());
    col++;
  }

  pdf.agencyPage(doc, { title: `${entry.name} · Tasarım dili`, accent });
  pdf.footers(doc, `${entry.name} · Tasarım dili`);
  doc.file(Buffer.from(JSON.stringify(json, null, 2)), { name: 'tasarim-dili.json', type: 'application/json', description: 'Machine-readable design language' });
  return finish();
}

export function remove(id) {
  const a = store.getAgency();
  const d = a.designLanguages.find((x) => x.id === id);
  if (!d) return;
  if (d.pdfFile) fs.rmSync(store.assetPath(store.AGENCY_ID, d.pdfFile), { force: true });
  a.designLanguages = a.designLanguages.filter((x) => x.id !== id);
  store.flush();
}

// Tasarım dilini ajansın görsel diline (bütün tasarımlarda kullanılan rehber) aktarır
export function applyToAgency(id) {
  const d = store.getAgency().designLanguages.find((x) => x.id === id);
  if (!d?.data) throw new Error('Tasarım dili hazır değil.');
  store.setStyleGuide(store.AGENCY_ID, { text: toMarkdown(d), learnedAt: store.now(), sampleCount: d.inspirationIds.length, editedAt: null, bundled: false, fromDesignLanguage: d.id });
}
