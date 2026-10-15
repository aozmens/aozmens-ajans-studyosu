// "Marka Öğren", "İlham Al" (ilham görsellerinden prompt çıkarma), Görsel Stüdyosu ve dış araç öğrenme.
import fs from 'node:fs';
import * as store from './store.js';
import * as agents from './agents.js';
import * as claude from './claude.js';
import * as render from './render.js';
import * as imagegen from './imagegen.js';
import { send } from './events.js';
import { systemFor, extractJson, truncate, companyBrief, fetchPageText, saveCompanyImage, styleGuideText } from './orchestrator.js';

const settings = () => store.getSettings(false);

// ---------------- Marka Öğren ----------------

const learningBrands = new Set();
export const isLearningBrand = (cid) => learningBrands.has(cid);

export async function learnBrand(companyId) {
  const c = store.getCompany(companyId);
  if (!c) throw new Error('Marka bulunamadı');
  if (learningBrands.has(companyId)) throw new Error('Bu marka zaten öğreniliyor.');
  learningBrands.add(companyId);
  send('company:update', { id: companyId });
  try {
    const content = [];
    const sources = [];
    const logo = store.primaryLogo(c);
    if (logo) { content.push({ type: 'text', text: 'Ana logo:' }, { type: 'image', source: { type: 'base64', media_type: logo.mime, data: logo.data } }); sources.push('logo'); }
    const images = (c.files || []).filter((f) => /^image\//.test(f.mime || '') && (f.reference || f.role)).slice(0, 6);
    for (const f of images) {
      try { content.push({ type: 'text', text: `Marka görseli: ${f.name}` }, await render.imageBlockFromFile(store.assetPath(c.id, f.designFile || f.file), 1200)); } catch {}
    }
    if (images.length) sources.push(`${images.length} marka görseli`);
    for (const f of (c.styles || []).slice(0, 6)) {
      try { content.push({ type: 'text', text: `Onaylı örnek tasarım: ${f.name}` }, await render.imageBlockFromFile(store.assetPath(c.id, f.file), 1200)); } catch {}
    }
    if (c.styles?.length) sources.push(`${Math.min(6, c.styles.length)} örnek tasarım`);
    const designs = store.companyDesigns(companyId).slice(0, 4);
    for (const { design } of designs) {
      const svg = design.variants?.[0]?.frames?.[0]?.svg;
      if (!svg) continue;
      try {
        const jpg = await render.svgToJpeg(render.finalize(svg, c), 900);
        content.push({ type: 'text', text: `Ajansın bu marka için yaptığı tasarım: #${design.no} ${design.gorsel_baslik || ''}` }, { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: jpg.toString('base64') } });
      } catch {}
    }
    if (designs.length) sources.push(`${designs.length} önceki tasarım`);
    let site = '';
    if (c.website) {
      try { const p = await fetchPageText(c.website); site = `# Web sitesinden metin\nBaşlık: ${p.title}\nAçıklama: ${p.desc}\n${p.text.slice(0, 7000)}`; sources.push('web sitesi'); } catch {}
    }
    const prompt = `${companyBrief(c, { steps: [], options: { useBrandProfile: false } })}

${site}

${c.brandProfile?.text ? `# Mevcut marka profili (güncelle; kullanıcının elle eklediklerini koru)\n${truncate(c.brandProfile.text, 8000)}\n` : ''}
# Görevin: markayı öğren
Yukarıdaki logo, görseller, örnek tasarımlar, firma bilgileri ve web sitesinden bu markanın kalıcı bir "marka profili"ni çıkar. Bu profil, ajanın bu marka için ürettiği her içerik, metin, tasarım ve AI görselinde referans alınacak. Muğlak sıfatlar yerine uygulanabilir kurallar yaz (HEX, oran, kelime, örnek).

Bölümler:
1. **Marka özü:** konumlandırma, vaat, kişilik (3-5 sıfat ve ne anlama geldiği).
2. **Ses ve dil:** ton, hitap (sen/siz), cümle uzunluğu, emoji ve ünlem kullanımı, sevdiği/kaçındığı kelimeler, 3 örnek başlık.
3. **Renk sistemi:** ana, ikincil, vurgu, nötr renkler (HEX) ve kullanım oranları (ör. %60/%30/%10); hangi zeminde hangi metin rengi.
4. **Tipografi:** programın yazı tiplerinden (${render.fontNames().join(', ')}) markaya en uygun başlık ve gövde eşleşmesi, ağırlıklar.
5. **Logo kullanımı:** konum, minimum boyut, koruma alanı, hangi zeminlerde hangi logo.
6. **Görsel dil:** fotoğraf stili, ışık, kompozisyon, grafik öğeler, doku; yapılmayacaklar.
7. **AI görsel promptu için anahtar kelimeler:** markanın görsel kimliğini taşıyan İngilizce stil anahtar kelimeleri (tek satır, virgülle).
8. **Yapılacaklar / yapılmayacaklar:** 5'er madde.
Yalnızca profili Markdown olarak yaz; giriş ya da kapanış cümlesi ekleme.`;
    content.push({ type: 'text', text: prompt });
    const r = await claude.call({
      model: settings().model,
      system: systemFor('kreatif-direktor', '', true),
      messages: [{ role: 'user', content }],
      maxTokens: 12000,
      tag: { companyId, agent: 'kreatif-direktor', kind: 'marka-ogren' },
    });
    store.setBrandProfile(companyId, { text: r.text.trim(), learnedAt: store.now(), sources, editedAt: null, usage: r.usage });
    return store.getCompany(companyId).brandProfile;
  } finally {
    learningBrands.delete(companyId);
    send('company:update', { id: companyId });
  }
}

// ---------------- İlham arşivi: görselden prompt çıkarma ----------------

const analyzing = new Set();

export async function analyzeInspiration(sid) {
  const a = store.getAgency();
  const s = a.styles.find((x) => x.id === sid);
  if (!s) throw new Error('İlham görseli bulunamadı');
  if (analyzing.has(sid)) return s;
  analyzing.add(sid);
  s.analyzing = true;
  send('agency:update', {});
  try {
    const img = await render.imageBlockFromFile(store.assetPath(store.AGENCY_ID, s.file), 1400);
    const r = await claude.call({
      model: settings().designModel || settings().model,
      system: systemFor('grafik-tasarimci', '', true),
      messages: [{ role: 'user', content: [img, { type: 'text', text: `# Görevin: bu ilham görselini tara ve prompta dönüştür
Bu görsel ajansın ilham kaynağı. Görseli bir görsel üretim modeline (Flux, Midjourney, Gemini, GPT Image) neredeyse aynı estetikte yeniden ürettirecek kadar ayrıntılı çöz. İçeriğin kendisini değil, estetiği yakala: ortam, ışık, kamera, lens, renk derecelendirmesi, doku, kompozisyon, tipografi tarzı (varsa), grafik öğeler.

Yanıtın yalnızca şu JSON olsun:
\`\`\`json
{
  "prompt": "İngilizce, 60-120 kelimelik, bu görseli yeniden üretecek tam prompt",
  "styleSuffix": "İngilizce, 15-30 kelimelik, başka bir konuya eklenince aynı estetiği verecek stil eki (konu içermesin)",
  "negative": "İngilizce negatif prompt",
  "medium": "fotoğraf | 3B render | illüstrasyon | grafik tasarım | karışık",
  "style": "Türkçe kısa stil tanımı",
  "lighting": "Türkçe ışık tanımı",
  "composition": "Türkçe kompozisyon tanımı",
  "mood": "Türkçe ruh hâli",
  "typography": "Görselde yazı varsa Türkçe tipografi tarzı, yoksa boş",
  "palette": ["#HEX", "#HEX", "#HEX", "#HEX"],
  "tags": ["kısa", "türkçe", "etiketler"]
}
\`\`\`` }] }],
      maxTokens: 4000,
      tag: { agent: 'grafik-tasarimci', kind: 'ilham-tara' },
    });
    const out = extractJson(r.text);
    s.analysis = {
      prompt: String(out.prompt || ''), styleSuffix: String(out.styleSuffix || ''), negative: String(out.negative || ''),
      medium: out.medium || '', style: out.style || '', lighting: out.lighting || '', composition: out.composition || '',
      mood: out.mood || '', typography: out.typography || '', palette: (out.palette || []).filter((h) => /^#[0-9a-f]{3,8}$/i.test(h)).slice(0, 6),
      tags: (out.tags || []).slice(0, 8),
    };
    s.analyzedAt = store.now();
    s.analysisError = null;
    return s;
  } catch (e) {
    s.analysisError = e.message;
    throw e;
  } finally {
    s.analyzing = false;
    analyzing.delete(sid);
    store.flush();
    send('agency:update', {});
  }
}

// Birden fazla görseli sırayla (aynı anda 3) tarar
export async function analyzeMany(ids) {
  let i = 0;
  const worker = async () => {
    while (i < ids.length) {
      const sid = ids[i++];
      try { await analyzeInspiration(sid); } catch {}
    }
  };
  await Promise.all([worker(), worker(), worker()]);
}

// ---------------- Görsel Stüdyosu: ilhamdan prompt yaz, görsel üret ----------------

export async function composeImagePrompt({ companyId, inspirationIds = [], subject, width = 1080, height = 1350, useBrandProfile = true }) {
  const c = companyId ? store.getCompany(companyId) : null;
  const all = store.getAgency().styles;
  const insp = inspirationIds.map((x) => all.find((s) => s.id === x)).filter((s) => s?.analysis?.prompt);
  const content = [];
  for (const s of insp.slice(0, 3)) {
    try { content.push({ type: 'text', text: `İlham görseli: ${s.name}` }, await render.imageBlockFromFile(store.assetPath(store.AGENCY_ID, s.file), 1000)); } catch {}
  }
  content.push({ type: 'text', text: `${c ? companyBrief(c, { steps: [], options: { useBrandProfile } }) : ''}

${insp.length ? `# İlham promptları\n${insp.map((s, i) => `${i + 1}. ${s.analysis.prompt}\n   Stil eki: ${s.analysis.styleSuffix}`).join('\n')}` : ''}

# İstenen görsel
${subject}
Oran: ${width}x${height}

# Görevin
Bu görsel için bir görsel üretim modeline gidecek tek bir İngilizce prompt yaz. İlham görsellerinin estetiğini (ışık, kamera, renk derecelendirmesi, doku, kompozisyon) birebir taşı; konuyu istenen görsele göre kur; marka renklerini ve marka profilindeki görsel anahtar kelimeleri işle. 70-130 kelime, çok somut. Görselin üzerine sonradan başlık konacaksa kompozisyonda boş alan bırak. Sonda "no text, no logo, no watermark" ekle (kullanıcı yazı istemediyse).
Yanıtın yalnızca şu JSON olsun:
\`\`\`json
{ "prompt": "...", "negative": "...", "aciklama": "Türkçe, tek cümle: neyi nasıl birleştirdin" }
\`\`\`` });
  const r = await claude.call({
    model: settings().designModel || settings().model,
    system: systemFor('grafik-tasarimci', '', true),
    messages: [{ role: 'user', content }],
    maxTokens: 4000,
    tag: { companyId, agent: 'grafik-tasarimci', kind: 'gorsel-prompt' },
  });
  const out = extractJson(r.text);
  return { prompt: out.prompt || '', negative: out.negative || '', note: out.aciklama || '', usage: r.usage };
}

export async function generateImages({ companyId, prompt, provider, width = 1080, height = 1350, count = 1, inspirationIds = [], role = 'arkaplan' }) {
  const c = store.getCompany(companyId);
  if (!c) throw new Error('Önce bir marka seçin; üretilen görseller markanın dosyalarına eklenir.');
  if (!String(prompt || '').trim()) throw new Error('Prompt boş');
  const refs = [];
  const p = provider || settings().imageProvider || imagegen.connected()[0];
  if (p && imagegen.PROVIDERS[p]?.refs) {
    const all = store.getAgency().styles;
    for (const sid of inspirationIds.slice(0, 3)) {
      const s = all.find((x) => x.id === sid);
      if (!s) continue;
      try { const b = await render.imageBlockFromFile(store.assetPath(store.AGENCY_ID, s.file), 1024); refs.push({ mime: b.source.media_type, data: b.source.data }); } catch {}
    }
  }
  const finalPrompt = refs.length ? `Use the attached reference images only for style, lighting and color mood; do not copy their subjects. ${prompt}` : prompt;
  const out = [];
  for (let i = 0; i < Math.max(1, Math.min(4, count)); i++) {
    const r = await imagegen.generate(p, { prompt: finalPrompt, width, height, refs });
    for (const img of r.images) out.push(await saveCompanyImage(c, img, { name: `AI · ${prompt.slice(0, 50)}`, role, aiPrompt: prompt, provider: r.provider }));
  }
  return out;
}

// Firma görselinde arka plan silme / büyütme (Clipdrop)
export async function editCompanyImage(companyId, fid, op) {
  const c = store.getCompany(companyId);
  const f = c?.files.find((x) => x.id === fid);
  if (!f) throw new Error('Görsel bulunamadı');
  const buf = fs.readFileSync(store.assetPath(c.id, f.file));
  let img;
  if (op === 'removeBg') img = { buf: await imagegen.removeBackground(buf, f.mime), mime: 'image/png' };
  else if (op === 'upscale') img = await imagegen.upscale(buf, f.mime, f.width || 1024, f.height || 1024);
  else throw new Error('Bilinmeyen işlem');
  return saveCompanyImage(c, img, { name: `${f.name} (${op === 'removeBg' ? 'dekupe' : 'büyütülmüş'})`, role: op === 'removeBg' ? 'urun' : f.role || 'diger', aiPrompt: f.aiPrompt, provider: 'clipdrop' });
}

// ---------------- dış araçları öğrenme ----------------

const learningTools = new Set();

export async function learnTool(toolId) {
  const tool = store.getTool(toolId);
  if (!tool || learningTools.has(toolId)) return tool;
  learningTools.add(toolId);
  tool.learning = true;
  tool.learnError = null;
  send('tool:update', tool);
  try {
    const pages = [];
    const visited = new Set();
    const queue = [...(tool.urls || [])].filter(Boolean).slice(0, 5);
    while (queue.length && pages.length < 6) {
      const u = queue.shift();
      if (visited.has(u)) continue;
      visited.add(u);
      try {
        const p = await fetchPageText(u);
        pages.push(p);
        if (pages.length <= (tool.urls || []).length) {
          for (const l of p.links) {
            if (/doc|guide|rehber|prompt|tutorial|help|learn|how|api|feature/i.test(l.href + ' ' + l.text) && !visited.has(l.href)) queue.push(l.href);
            if (queue.length > 8) break;
          }
        }
      } catch (e) {
        pages.push({ url: u, title: '', text: `(Sayfa okunamadı: ${e.message})`, links: [] });
      }
    }
    const agent = tool.kind === 'video' ? 'video-editor' : tool.kind === 'görsel' ? 'grafik-tasarimci' : 'dijital-pazarlama-stratejisti';
    const prompt = `# Öğrenilecek araç: ${tool.name} (${tool.kind})
Kullanıcının notları: ${tool.notes || '-'}
${tool.guide ? `\n# Mevcut rehber (güncelle ve iyileştir)\n${truncate(tool.guide, 8000)}` : ''}

# Okunan sayfalar
${pages.map((p) => `## ${p.title || p.url}\nKaynak: ${p.url}\n${truncate(p.text, 9000)}`).join('\n\n') || '(Sayfa verilmedi)'}

# Görevin: bu aracı öğren ve ekip için kullanım rehberi yaz
Ajanstaki diğer ajanlar bu rehberi okuyarak ${tool.name} için doğrudan kullanılabilir prompt ve içerik hazırlayacak. Okuduğun sayfalara ve kendi bilgine dayanarak Türkçe bir rehber yaz:
1. **Ne işe yarar:** aracın yetenekleri, modelleri/modları.
2. **Ajansımızda ne için kullanırız:** sosyal medya, reklam, Reels/TikTok vb. kullanım senaryoları.
3. **Girdiler ve ayarlar:** en-boy oranları, süre, çözünürlük, stil/şablon/efekt seçenekleri, parametre sözdizimi.
4. **Prompt şablonu:** aracın en iyi anladığı prompt yapısı. Kopyalanabilir bir şablon ver.
5. **En iyi uygulamalar ve kaçınılacaklar.**
6. **Örnek promptlar:** bir kahve markası, bir moda markası ve bir teknoloji markası için birer hazır prompt.
7. **Emin olmadıkların:** sayfalarda doğrulanamayan, genel bilgine dayanan noktaları açıkça belirt.`;
    const r = await claude.call({
      model: settings().model,
      system: systemFor(agent),
      messages: [{ role: 'user', content: prompt }],
      maxTokens: 12000,
      tag: { agent, kind: 'arac-ogren' },
    });
    tool.guide = r.text.trim();
    tool.learnedAt = store.now();
    tool.sources = pages.map((p) => p.url);
    tool.learnedBy = agents.LABELS[agent];
  } catch (e) {
    tool.learnError = e.message;
  } finally {
    tool.learning = false;
    learningTools.delete(toolId);
    store.flush();
    send('tool:update', tool);
  }
  return tool;
}

export { styleGuideText };
