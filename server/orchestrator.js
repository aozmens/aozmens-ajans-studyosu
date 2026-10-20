// Programın kalbi: iş akışı (plan → uzman ajanlar → içerik listesi → tasarımlar → teslim özeti → öğrenme),
// tasarım hattı (post/story boyutları, carousel slaytları, AI görseller, kalite turu), revizyon, öğrenme.
import fs from 'node:fs';
import { jsonrepair } from 'jsonrepair';
import * as store from './store.js';
import * as agents from './agents.js';
import * as claude from './claude.js';
import * as render from './render.js';
import * as imagegen from './imagegen.js';
import { send } from './events.js';
import { JOB_TYPES, FORMATS } from './jobTypes.js';
import { writeJobFolder } from './export.js';

const running = new Map(); // jobId → AbortController
const MAX_CTX_PER_STEP = 14000;
const settings = () => store.getSettings(false);

// İş nesnesini kaydedip tarayıcıya gönderir (akış sırasında sık çağrılır, kayıt gecikmelidir)
export function emit(job) {
  store.save();
  send('job:update', job);
}

function addUsage(job, u, step) {
  if (!u) return;
  job.usage = claude.sumUsage(job.usage, u);
  if (step) step.usage = claude.sumUsage(step.usage, u);
}

export function truncate(s, n) {
  s = String(s || '');
  return s.length > n ? s.slice(0, n) + '\n\n[…kısaltıldı…]' : s;
}

const today = () => new Date().toLocaleDateString('tr-TR', { day: 'numeric', month: 'long', year: 'numeric', weekday: 'long', timeZone: 'Europe/Istanbul' });

// strict: çıktı makine tarafından okunuyorsa (JSON, SVG, HTML) Markdown ve "Varsayımlar" maddeleri verilmez
const APP_SUFFIX = (strict = false) => `

## Bu programdaki çalışma şeklin
Şu an "Agent-cy" programının içinde çalışıyorsun. Dosya, terminal, web veya alt ajan araçların yok; iş akışını ajans yöneticisi ve program yönetir, sana düşen görevi sen yaparsın.
${strict
    ? '- Bu adımın çıktısı program tarafından otomatik okunur. Görevde istenen biçimin dışına çıkma: açıklama, Markdown başlığı veya "Varsayımlar" bölümü ekleme.'
    : '- Çıktını doğrudan, eksiksiz ve kullanıma hazır olarak Markdown biçiminde yaz. "Dosyaya kaydettim" gibi ifadeler kullanma.\n- Eksik bilgi varsa makul varsayım yap ve en sonda kısa bir "Varsayımlar" başlığıyla belirt.'}
- Kullanıcıya soru sorma.
- Diğer ajanlara iş devretmen gerekmez; senden sonraki adımlar zaten planlandı.
- Bugünün tarihi: ${today()}.`;

// Ajanın sistem promptu: talimat + kullanıcının verdiği direktifler / öğrenilen dersler + bağlı araçlar
export function systemFor(agentName, extra = '', strict = !!extra) {
  const a = agents.get(agentName);
  const lessons = store.agentLessons(agentName);
  const lessonText = lessons.length
    ? `\n\n## Eğitim: kullanıcının direktifleri ve deneyimlerinden öğrendiklerin\nÖnceki işlerde kullanıcıdan gelen geri bildirimler ve doğrudan verilen direktifler. Bunlara her üretimde mutlaka uy; talimatınla çelişirse bunlar geçerlidir:\n${lessons.map((l) => `- ${l.text}`).join('\n')}`
    : '';
  const tools = store.agentTools(agentName).filter((t) => imagegen.PROVIDERS[t]);
  const toolText = tools.length
    ? `\n\n## Sana bağlı araçlar\n${tools.map((t) => `- ${imagegen.PROVIDERS[t].label} (${imagegen.PROVIDERS[t].kinds.join(', ')})`).join('\n')}\nGörsel veya video önerirken bu araçlarda doğrudan çalışacak İngilizce promptlar yaz; program bu promptlarla aracı otomatik çalıştırabilir.`
    : '';
  const text = (a ? a.prompt : '') + lessonText + toolText + APP_SUFFIX(strict) + extra;
  return [{ type: 'text', text, cache_control: { type: 'ephemeral' } }];
}

const newStep = (kind, fields) => ({ id: store.id(), kind, status: 'pending', output: '', ...fields });

// ---------------- JSON çıkarma ve onarma ----------------

export function extractJson(text) {
  const candidates = [];
  const open = text.search(/```(?:json)?/i);
  if (open >= 0) {
    const after = text.slice(open).replace(/^```(?:json)?/i, '');
    const close = after.lastIndexOf('```');
    candidates.push((close >= 0 ? after.slice(0, close) : after).replace(/^\s*```(?:json)?\s*$/gim, ''));
  }
  const firstObj = text.indexOf('{');
  const firstArr = text.indexOf('[');
  const start = [firstObj, firstArr].filter((i) => i >= 0).sort((a, b) => a - b)[0];
  if (start != null) {
    const close = text[start] === '{' ? '}' : ']';
    const end = text.lastIndexOf(close);
    candidates.push(end > start ? text.slice(start, end + 1) : text.slice(start));
    candidates.push(text.slice(start).replace(/^\s*```(?:json)?\s*$/gim, ''));
  }
  let firstError = null;
  for (const c of candidates) {
    try { return JSON.parse(c); } catch (e) { firstError = firstError || e; }
  }
  for (const c of candidates) {
    try { return JSON.parse(jsonrepair(c)); } catch {}
    try { return JSON.parse(jsonrepair(c.replace(/,(\s*,)+/g, ','))); } catch {}
  }
  const err = new Error('Yanıt JSON olarak okunamadı.' + (firstError ? ' (' + firstError.message + ')' : ''));
  err.jsonError = true;
  throw err;
}

async function repairJsonWithModel(job, text, error, signal, stream, step) {
  stream && stream('\n\n[Yanıt biçimi bozuk geldi, JSON düzeltiliyor…]\n');
  const r = await claude.call({
    model: settings().designModel || settings().model,
    system: 'Sen bir JSON onarım aracısın. Verilen metni içeriğini değiştirmeden geçerli JSON\'a çevirirsin.',
    messages: [{ role: 'user', content: `Aşağıdaki metin geçerli JSON değil (hata: ${error.message}). İçeriği, alanları ve sırayı aynen koruyarak geçerli JSON olarak yeniden yaz. Metinlerin içindeki çift tırnakları \\" ile kaçır, satır sonlarını \\n yap. Yalnızca JSON yaz, açıklama ekleme.\n\n${text}` }],
    maxTokens: 32000,
    signal,
    tag: { jobId: job?.id, agent: 'json-onarim' },
  });
  addUsage(job, r.usage, step);
  return extractJson(r.text);
}

// ---------------- ortak bağlam blokları ----------------

function logoBlock(company) {
  const l = store.primaryLogo(company);
  return l ? { type: 'image', source: { type: 'base64', media_type: l.mime, data: l.data } } : null;
}

// Firma dosyalarında "ajanlara göster" işaretli referans görseller (en fazla 3)
async function referenceBlocks(company) {
  const out = [];
  for (const f of company?.files || []) {
    if (!f.reference || out.length >= 3 || !/^image\/(png|jpe?g|webp|gif)/.test(f.mime || '')) continue;
    try { out.push(await render.imageBlockFromFile(store.assetPath(company.id, f.designFile || f.file))); } catch {}
  }
  return out;
}

function jobTools(job) {
  return (job.options?.tools || []).map((tid) => store.getTool(tid)).filter(Boolean);
}

function toolsBlock(job) {
  const tools = jobTools(job);
  if (!tools.length) return '';
  return `# Bu işte kullanılacak dış araçlar\nAşağıdaki araçlar için içerik/prompt hazırlanacak. Ajanların bu araçlar hakkında öğrendiği kullanım rehberleri:\n\n` +
    tools.map((t) => `## ${t.name} (${t.kind})\n${t.guide ? truncate(t.guide, 7000) : `Henüz rehber öğrenilmedi. Kullanıcı notu: ${t.notes || '-'}. Bu aracı genel bilginle kullan.`}`).join('\n\n');
}

// İşte "İlham Al" seçildiyse kullanılacak ilham görselleri (seçilenler, yoksa markanın ilham panosu)
function jobInspirations(job, company) {
  const o = job?.options || {};
  if (o.useInspiration === false) return [];
  const ids = o.inspirationIds?.length ? o.inspirationIds : company?.inspirationIds || [];
  const all = store.getAgency()?.styles || [];
  return ids.map((x) => all.find((s) => s.id === x)).filter(Boolean).slice(0, 8);
}

function inspirationText(list) {
  const withPrompt = list.filter((s) => s.analysis?.prompt);
  if (!withPrompt.length) return '';
  return `# İlham kaynakları (kullanıcının seçtiği görsellerden çıkarılan promptlar)
Görsel fikirleri, kompozisyon, ışık ve AI görsel promptları bu stillerden beslenmeli; içeriklerini değil, estetiklerini al.
${withPrompt.map((s, i) => `## İlham ${i + 1}: ${s.name || ''}\n- Prompt: ${s.analysis.prompt}\n- Stil: ${s.analysis.style || '-'} · Işık: ${s.analysis.lighting || '-'} · Kompozisyon: ${s.analysis.composition || '-'} · Ruh hâli: ${s.analysis.mood || '-'}\n- Renkler: ${(s.analysis.palette || []).join(', ')}`).join('\n')}`;
}

export function companyBrief(company, job) {
  const c = company || {};
  const useProfile = job?.options?.useBrandProfile !== false;
  const lines = [
    `# Müşteri firma`,
    `- Firma adı: ${c.name || '-'}`,
    c.sector && `- Sektör: ${c.sector}`,
    c.website && `- Web sitesi: ${c.website}`,
    c.social && `- Sosyal medya hesapları: ${c.social}`,
    c.palette?.length ? `- Marka renk paleti: ${c.palette.map((p) => `${p.name} ${p.hex}`).join(', ')}` : (c.colors && `- Marka renkleri: ${c.colors}`),
    (c.fontHeading || c.fontBody) && `- Marka yazı tipleri (marka kimliğinde seçildi; tasarımlarda bunları kullan): başlık ${c.fontHeading || c.fontBody}, gövde ${c.fontBody || c.fontHeading}`,
    c.fonts && `- Fontlar: ${c.fonts}`,
    c.tone && `- Marka tonu: ${c.tone}`,
    c.audience && `- Hedef kitle: ${c.audience}`,
    c.competitors && `- Rakipler: ${c.competitors}`,
    c.logos?.length ? `- Logo: ekteki ilk görsel firmanın ana logosu.` : `- Logo: yok (firma adı yazı logo olarak kullanılabilir).`,
    (c.files || []).some((f) => f.reference) && `- Ekteki diğer görseller firmanın referans görselleri (marka materyali, beğendiği örnekler).`,
    c.styleGuide?.text && `- Onaylı tasarım stili: var. Firmanın örnek tasarımlarından çıkarılmış bir stil rehberi bulunuyor; görsel öneriler ve konseptler bu stille uyumlu olmalı.`,
    c.about && `\n## Firma hakkında / müşteri isterleri\n${c.about}`,
  ].filter(Boolean);
  if (useProfile && c.brandProfile?.text) {
    lines.push(`\n## Marka profili ("Marka Öğren" ile çıkarıldı; bütün üretimler bu profille bağdaşmalı)\n${truncate(c.brandProfile.text, 9000)}`);
  }
  if (c.memory?.length) {
    lines.push(`\n## Ajans hafızası: bu müşteriden daha önce öğrendiklerimiz\nBunlara mutlaka uy:\n${c.memory.map((m) => `- ${m.text}`).join('\n')}`);
  }
  const site = job?.steps?.find((s) => s.kind === 'website' && s.status === 'done');
  if (site?.output) lines.push(`\n## Web sitesinden alınan metin (özet için ham içerik)\n${truncate(site.output, 6000)}`);
  return lines.join('\n');
}

function jobRequest(job) {
  const t = JOB_TYPES[job.type] || JOB_TYPES.serbest;
  const o = job.options || {};
  const lines = [`# İş talebi`, `- İş türü: ${t.label}`, `- Başlık: ${job.title}`];
  if (o.month) lines.push(`- Dönem: ${o.month}`);
  if (o.platforms?.length) lines.push(`- Platformlar: ${o.platforms.join(', ')}`);
  if (o.makeDesigns) {
    lines.push(`- Tasarlanacak içerik sayısı: ${o.postCount || 0}${o.carouselCount ? ` (bunların ${o.carouselCount} tanesi ${o.slideCount || 5} slaytlık carousel)` : ''}`);
    lines.push(`- Tasarım boyutları: ${(o.formats || ['post']).map((f) => FORMATS[f]?.label || f).join(', ')}`);
  }
  if (o.budget) lines.push(`- Bütçe: ${o.budget}`);
  if (job.request) lines.push(`\n## Müşterinin istekleri\n${job.request}`);
  return lines.join('\n');
}

function previousOutputs(job, uptoIndex, maxEach = MAX_CTX_PER_STEP) {
  const parts = [];
  job.steps.slice(0, uptoIndex).forEach((s) => {
    if (s.status !== 'done' || !s.output) return;
    if (s.kind === 'agent' || s.kind === 'followup') parts.push(`## ${s.agentLabel} — ${s.title}\n${truncate(s.output, maxEach)}`);
  });
  return parts.length ? `# Önceki ajanların çıktıları\n\n${parts.join('\n\n---\n\n')}` : '';
}

function planBlock(job) {
  if (!job.plan) return '';
  const v = (job.plan.varsayimlar || []).map((x) => `- ${x}`).join('\n');
  return `# Ajans yöneticisinin planı\n${job.plan.ozet || ''}${v ? `\n\nVarsayımlar:\n${v}` : ''}`;
}

async function userContent(company, text) {
  const blocks = [];
  const logo = logoBlock(company);
  if (logo) blocks.push(logo);
  blocks.push(...(await referenceBlocks(company)));
  blocks.push({ type: 'text', text });
  return blocks;
}

// ---------------- tasarım dili (ilham arşivi + firma stili) ----------------

function agencyStyle() {
  const a = store.getAgency();
  return a && a.enabled ? a : null;
}

async function styleImage(ownerId, f) {
  try { return await render.imageBlockFromFile(store.assetPath(ownerId, f.file), 1280); } catch { return null; }
}

// Bir havuzdan tasarım ölçüsüne en uygun örnekler: önce aynı en-boy oranındakiler, sıra içeriğe göre döner
function pickSamples(pool, ownerId, w, h, no, n) {
  const all = (pool || []).map((f, i) => ({ f, i, ownerId }));
  if (!all.length || n <= 0) return [];
  const ratio = w / h;
  const score = (x) => Math.abs(Math.log(((x.f.width || 1080) / (x.f.height || 1080)) / ratio));
  const close = all.filter((x) => score(x) < 0.12);
  const pool2 = close.length >= n ? close : [...close, ...all.filter((x) => !close.includes(x)).sort((a, b) => score(a) - score(b))];
  const start = close.length >= n ? ((no - 1) * n) % pool2.length : 0;
  const out = [];
  for (let k = 0; k < pool2.length && out.length < n; k++) out.push(pool2[(start + k) % pool2.length]);
  return out;
}

// Tasarımcıya gösterilecek 3 örnek: işte seçilen ilham görselleri öncelikli, sonra ilham arşivi, firmanın kendi örneği 1 tane
function styleSamplesFor(job, company, w, h, no = 1, n = 3) {
  const insp = jobInspirations(job, company);
  const own = pickSamples(company?.styles, company?.id, w, h, no, company?.styles?.length ? 1 : 0);
  if (insp.length) return [...pickSamples(insp, store.AGENCY_ID, w, h, no, n - own.length), ...own];
  const agency = agencyStyle();
  if (!agency?.styles?.length) return pickSamples(company?.styles, company?.id, w, h, no, n);
  return [...pickSamples(agency.styles, store.AGENCY_ID, w, h, no, n - own.length), ...own];
}

export function styleGuideText(company, max = 14000) {
  const a = agencyStyle()?.styleGuide?.text || '';
  const g = company?.styleGuide?.text || '';
  const head = `## Ajansın tasarım dili (ilham arşivi, bağlayıcı)
Bütün firmalarda geçerli. Yerleşim, tipografi, yazı tipleri, düğme ve etiket şekilleri, ürün yerleşimi, ışık ve renk tonlaması bu dile uymalı. Firma bilgisi, hafıza, eski dersler veya konsept bu dille çelişirse (ör. başka bir yazı tipi, düz ve basit bir şablon) bu dil geçerlidir. Renkleri firmanın paletinden al ama bu dildeki ton mantığıyla kur.`;
  if (a && g) return `${head}\n${truncate(a, Math.round(max * 0.6))}\n\n## Bu firmaya özel notlar (yalnızca renk, logo, ürün ve içerik için; yerleşim ve tipografide ajans dili geçerli)\n${truncate(g, Math.round(max * 0.4))}`;
  if (a) return `${head}\n${truncate(a, max)}`;
  return g ? truncate(g, max) : '';
}

// ---------------- iş oluşturma ve çalıştırma ----------------

export function createAndRun(input) {
  const t = JOB_TYPES[input.type] || JOB_TYPES.serbest;
  const options = { ...(input.options || {}) };
  if (options.makeDesigns && !options.formats?.length) options.formats = ['post'];
  const allowed = t.agents || agents.names();
  options.agents = (options.agents?.length ? options.agents : allowed).filter((a) => agents.names().includes(a));
  const job = store.addJob({ companyId: input.companyId, type: input.type, title: input.title, request: input.request, options });
  const company = store.getCompany(job.companyId);
  if (t.quick) {
    if (options.agents.length && job.request && job.request.length > 160) {
      job.steps.push(newStep('plan', { title: 'İş planı', agent: 'ajans-yoneticisi', agentLabel: agents.LABELS['ajans-yoneticisi'] }));
    } else {
      job.steps.push(...designSteps(job), ...brandBookSteps(job), learnStep());
    }
  } else {
    if (company?.website) job.steps.push(newStep('website', { title: 'Web sitesi incelemesi', agent: 'program', agentLabel: 'Program' }));
    job.steps.push(newStep('plan', { title: 'İş planı', agent: 'ajans-yoneticisi', agentLabel: agents.LABELS['ajans-yoneticisi'] }));
  }
  emit(job);
  run(job.id);
  return job.id;
}

// Yeni işte "Marka dosyası hazırla" açıksa: logo zeminleri, ikon, fontlar, renkler, mockuplar ve ajans alt bilgisiyle PDF
function brandBookSteps(job) {
  if (!job.options?.brandBook) return [];
  return [newStep('brandbook', { agent: 'grafik-tasarimci', agentLabel: agents.LABELS['grafik-tasarimci'], title: 'Marka dosyası (PDF)' })];
}

async function stepBrandBook(job, step, company, signal) {
  const { build } = await import('./brandBook.js');
  const entry = await build(company.id, { mockupIds: job.options.brandBookMockups, jobId: job.id, signal });
  addUsage(job, entry.usage, step);
  job.brandBookId = entry.id;
  step.output = `Marka dosyası hazır: **${entry.name}** (${Math.round(entry.size / 1024)} KB). Markanın "${store.FOLDERS.brandBook}" klasörüne kaydedildi; Marka → Klasör sekmesinden açabilirsin.`;
}

function designSteps(job) {
  if (!job.options?.makeDesigns) return [];
  return [
    newStep('designList', { agent: 'sosyal-medya-uzmani', agentLabel: agents.LABELS['sosyal-medya-uzmani'], title: 'Tasarlanacak içerik listesi' }),
    newStep('designs', { agent: 'grafik-tasarimci', agentLabel: agents.LABELS['grafik-tasarimci'], title: 'Tasarımların üretimi' }),
  ];
}

export const isRunning = (jobId) => running.has(jobId);

export function cancel(jobId) {
  running.get(jobId)?.abort();
}

export function resume(jobId) {
  const job = store.getJob(jobId);
  if (!job || running.has(jobId)) return;
  for (const s of job.steps) {
    if (s.kind === 'designList' && s.status === 'error' && s.output && s.output.length > 200) s.raw = s.output;
    if (s.status === 'error' || s.status === 'running') s.status = 'pending';
  }
  for (const d of job.designs) for (const v of d.variants || []) if (v.status === 'error' || v.status === 'running') v.status = 'pending';
  run(jobId);
}

async function run(jobId) {
  const job = store.getJob(jobId);
  const ctl = new AbortController();
  running.set(jobId, ctl);
  job.status = 'running';
  job.error = null;
  emit(job);
  try {
    for (let i = 0; i < job.steps.length; i++) {
      const step = job.steps[i];
      if (step.status === 'done' || step.status === 'skipped') continue;
      step.status = 'running';
      step.startedAt = store.now();
      step.output = step.kind === 'designs' ? step.output : '';
      emit(job);
      try {
        await runStep(job, step, i, ctl.signal);
        step.status = 'done';
      } catch (e) {
        if (ctl.signal.aborted) { step.status = 'pending'; throw e; }
        if (step.kind === 'website' || step.kind === 'learn' || step.kind === 'brandbook') {
          step.status = 'skipped';
          step.output = step.kind === 'learn' ? `Öğrenme adımı atlandı: ${e.message}` : step.kind === 'brandbook' ? `Marka dosyası hazırlanamadı: ${e.message}` : `Web sitesi okunamadı: ${e.message}`;
        } else {
          step.status = 'error';
          step.error = e.message;
          throw e;
        }
      } finally {
        step.endedAt = store.now();
        emit(job);
      }
    }
    job.status = 'done';
    // Bitmiş iş markanın "09 İşler" klasörüne de yazılır (tasarımlar PNG, metinler, takvim)
    try { job.folder = writeJobFolder(job); } catch {}
  } catch (e) {
    job.status = ctl.signal.aborted ? 'stopped' : 'error';
    job.error = ctl.signal.aborted ? null : e.message;
  } finally {
    running.delete(jobId);
    store.flush();
    send('job:update', job);
  }
}

async function runStep(job, step, index, signal) {
  const company = store.getCompany(job.companyId);
  const stream = (t) => send('job:stream', { jobId: job.id, stepId: step.id, text: t });
  switch (step.kind) {
    case 'website': return stepWebsite(job, step, company, signal);
    case 'plan': return stepPlan(job, step, company, signal, stream);
    case 'agent':
    case 'followup': return stepAgent(job, step, index, company, signal, stream);
    case 'designList': return stepDesignList(job, step, index, company, signal, stream);
    case 'designs': return stepDesigns(job, step, company, signal);
    case 'learn': return stepLearn(job, step, company, signal);
    case 'brandbook': return stepBrandBook(job, step, company, signal);
    default: throw new Error('Bilinmeyen adım: ' + step.kind);
  }
}

// ---------------- web sitesi ve plan ----------------

export async function fetchPageText(url, signal) {
  if (!/^https?:\/\//i.test(url)) url = 'https://' + url;
  const res = await fetch(url, {
    signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(15000)]) : AbortSignal.timeout(15000),
    headers: { 'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0 Safari/537.36 Agent-cy/3.0' },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const html = await res.text();
  const title = (html.match(/<title[^>]*>([\s\S]*?)<\/title>/i) || [])[1] || '';
  const desc = (html.match(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']*)/i) || [])[1] || '';
  const links = [...html.matchAll(/<a[^>]+href=["']([^"'#]+)["'][^>]*>([\s\S]*?)<\/a>/gi)].slice(0, 200).map((m) => {
    let href = m[1];
    try { href = new URL(href, url).href; } catch {}
    return { href, text: m[2].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 80) };
  });
  const body = html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ').replace(/<style[\s\S]*?<\/style>/gi, ' ').replace(/<svg[\s\S]*?<\/svg>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&#39;|&rsquo;/g, "'").replace(/&quot;/g, '"')
    .replace(/\s+/g, ' ').trim();
  return { url, title: title.trim(), desc: desc.trim(), text: body, links };
}

async function stepWebsite(job, step, company, signal) {
  const p = await fetchPageText(company.website.trim(), signal);
  step.output = `Sayfa başlığı: ${p.title}\nAçıklama: ${p.desc}\n\n${p.text.slice(0, 8000)}`;
}

async function stepPlan(job, step, company, signal, stream) {
  const t = JOB_TYPES[job.type] || JOB_TYPES.serbest;
  const allowed = new Set(job.options.agents || []);
  const roster = agents.list()
    .filter((a) => a.name !== 'ajans-yoneticisi' && a.name !== 'grafik-tasarimci' && allowed.has(a.name))
    .map((a) => `- ${a.name} (${a.label}): ${a.description || ''}`)
    .join('\n');
  const wantDesigns = !!job.options?.makeDesigns;
  const prompt = `${companyBrief(company, job)}

${jobRequest(job)}

# Görevin: iş planı
Bu işi ajans ekibine dağıtmak için bir plan hazırla. Önce 2-4 cümlelik kısa bir değerlendirme yaz, ardından planı tek bir JSON kod bloğu olarak ver.

Bu işte kullanabileceğin ajanlar (yalnızca bunlar; listede olmayan ajanı plana yazma):
${roster || '- (uzman seçilmedi: plan boş kalabilir)'}
${wantDesigns ? `\nGörsel tasarımları program ayrıca otomatik üretecek: planın sonunda içerik listesi çıkarılacak ve grafik tasarımcı her içerik için tasarım yapacak. Bu yüzden plana grafik-tasarimci ekleme${allowed.has('kreatif-direktor') ? '; ama tasarımların dayanacağı konsept ve görsel dil için kreatif-direktor adımı ekle' : ''}.\n` : ''}
Bu iş türü için önerilen akış: ${t.hint}

Kurallar:
- En fazla 7 adım; işi karşılayan en küçük ekibi seç. İşle ilgisi olmayan ajanı çalıştırma. Her adım tek bir ajana gider ve sırayla çalışır; her ajan önceki adımların çıktılarını görür.
- "gorev" alanı o ajanın tek başına anlayabileceği, net ve eksiksiz bir görev tanımı olsun (beklenen çıktı formatı dahil).
- Eksik bilgi için makul varsayımlar yap, soru sorma.

JSON biçimi:
\`\`\`json
{
  "ozet": "İşin özeti ve yaklaşım (2-3 cümle)",
  "varsayimlar": ["..."],
  "adimlar": [
    { "ajan": "musteri-temsilcisi", "baslik": "Kısa adım başlığı", "gorev": "..." }
  ]
}
\`\`\``;
  const r = await claude.call({
    model: settings().model,
    system: systemFor('ajans-yoneticisi'),
    messages: [{ role: 'user', content: await userContent(company, prompt) }],
    maxTokens: 8000,
    onText: (x) => { step.output += x; stream(x); },
    signal,
    tag: { jobId: job.id, companyId: job.companyId, agent: 'ajans-yoneticisi' },
  });
  addUsage(job, r.usage, step);
  step.output = r.text;
  let plan;
  try { plan = extractJson(r.text); } catch { plan = null; }
  let adimlar = (plan?.adimlar || []).filter((a) => allowed.has(a.ajan) && a.ajan !== 'ajans-yoneticisi' && a.ajan !== 'grafik-tasarimci').slice(0, 7);
  if (!plan) adimlar = t.fallback.filter((a) => allowed.has(a.ajan)).map((a) => ({ ...a }));
  job.plan = { ozet: plan?.ozet || '', varsayimlar: plan?.varsayimlar || [] };

  const newSteps = adimlar.map((a) => newStep('agent', {
    agent: a.ajan, agentLabel: agents.LABELS[a.ajan] || a.ajan, title: a.baslik || 'Görev', task: a.gorev || '',
  }));
  newSteps.push(...designSteps(job), ...brandBookSteps(job));
  if (!t.quick) {
    newSteps.push(newStep('agent', {
      agent: 'ajans-yoneticisi', agentLabel: agents.LABELS['ajans-yoneticisi'], title: 'Teslim özeti',
      task: 'Ekibin tüm çıktılarını kontrol et: mesaj, ton, tarih ve rakamlar tutarlı mı? Müşteriye sunulacak kısa bir teslim özeti yaz: neler üretildi, öne çıkan fikirler, müşteri onayı gereken noktalar ve önerilen sonraki adımlar. Tutarsızlık bulduysan açıkça belirt.' +
        (wantDesigns ? ' Tasarımlar programda ayrıca listeleniyor; içerik listesine göre kaç tasarım üretildiğini belirt.' : ''),
      isSummary: true,
    }));
  }
  newSteps.push(learnStep());
  job.steps.push(...newSteps);
}

// ---------------- uzman ajan adımı ----------------

async function stepAgent(job, step, index, company, signal, stream) {
  const extra = step.isSummary && job.designs.length
    ? `\n\n# Üretilen tasarımlar\n${job.designs.map((d) => `- #${d.no} ${d.tarih || ''} ${d.platform || ''} ${d.format || ''}: ${d.gorsel_baslik || d.konu || ''} (${(d.variants || []).map((v) => `${v.key}: ${v.status === 'done' ? 'tasarlandı' : 'tasarlanamadı'}`).join(', ')})`).join('\n')}`
    : '';
  const visual = ['kreatif-direktor', 'grafik-tasarimci', 'sosyal-medya-uzmani', 'video-editor'].includes(step.agent);
  const style = visual && styleGuideText(company, 8000);
  const insp = visual ? inspirationText(jobInspirations(job, company)) : '';
  const prompt = `${companyBrief(company, job)}
${style ? `\n# Onaylı tasarım dili\nKonsept ve görsel fikirler bu stile uymalı; yeni bir görsel dil icat etme, bu stilin içinde kal.\n${style}\n` : ''}${insp ? `\n${insp}\n` : ''}
${jobRequest(job)}

${planBlock(job)}

${toolsBlock(job)}

${previousOutputs(job, index)}${extra}

# Senin görevin (${step.title})
${step.task}`;
  const r = await claude.call({
    model: settings().model,
    system: systemFor(step.agent),
    messages: [{ role: 'user', content: await userContent(company, prompt) }],
    maxTokens: 16000,
    onText: (x) => { step.output += x; stream(x); },
    signal,
    tag: { jobId: job.id, companyId: job.companyId, agent: step.agent },
  });
  addUsage(job, r.usage, step);
  step.output = r.text;
}

// ---------------- tasarlanacak içerik listesi ----------------

function designAssetList(company) {
  const all = (company?.files || []).filter((f) => f.role && f.role !== 'mockup' && f.designFile);
  if (!all.length) return '';
  return `Firmanın tasarımlarda kullanılabilecek görselleri (her içeriğin "gorseller" alanına konusuna uyan görsellerin kimliklerini yaz):\n${all.map((f) => `- ${f.id}: ${ROLE_TR[f.role]} · ${f.name}${f.aiPrompt ? ' (AI üretimi)' : ''}`).join('\n')}\n\n`;
}

const ROLE_TR = { urun: 'Ürün görseli', arkaplan: 'Arka plan fotoğrafı', diger: 'Görsel' };

async function stepDesignList(job, step, index, company, signal, stream) {
  if (step.raw) {
    const raw = step.raw;
    delete step.raw;
    let items = null;
    try {
      stream('Önceki yanıt onarılıyor…\n');
      items = await readDesignList(job, raw, signal, stream, step);
    } catch (e) {
      if (signal.aborted) throw e;
    }
    if (items) return useDesignList(job, step, items);
  }
  const o = job.options || {};
  const count = Math.max(1, Math.min(60, +o.postCount || 12));
  const carousels = Math.max(0, Math.min(count, +o.carouselCount || 0));
  const slides = Math.max(2, Math.min(10, +o.slideCount || 5));
  const formats = (o.formats || ['post']).filter((f) => FORMATS[f]);
  const insp = inspirationText(jobInspirations(job, company));
  const aiOn = o.aiImages && imagegen.connected().length;
  const prompt = `${companyBrief(company, job)}

${jobRequest(job)}

${insp}

${previousOutputs(job, index)}

# Senin görevin: tasarlanacak içerik listesi
Yukarıdaki plan ve takvime dayanarak grafik tasarımcıya gidecek ${count} içeriğin listesini çıkar. Takvimde zaten içerikler varsa onları birebir kullan (tarih, konu, metin aynı kalsın); eksikse tamamla.
${designAssetList(company)}Her içerik şu boyutların hepsinde tasarlanacak: ${formats.map((f) => `${FORMATS[f].label} ${FORMATS[f].w}x${FORMATS[f].h}`).join(', ')}. Story boyutunda metinler dikey güvenli alanlara göre yeniden yerleştirilecek; bu yüzden görsel başlıkları kısa tut.
${carousels ? `Bu içeriklerden tam ${carousels} tanesi "format": "carousel" olsun ve her birinde ${slides} slaytlık "slaytlar" dizisi bulunsun: ilk slayt kapak (merak uyandıran başlık), ara slaytlar tek fikir ve kısa metin, son slayt CTA. Carousel dışındaki içeriklerde "slaytlar" alanını yazma.\n` : 'Carousel istenmedi; "format" alanına "post" yaz.\n'}
"ai_gorsel_prompt" alanı: ${aiOn ? 'bu prompt doğrudan bir görsel üretim modeline gönderilecek ve çıkan fotoğraf tasarımın arka planı/kahraman görseli olacak. İngilizce, 40-90 kelime, sinematik ve çok detaylı yaz: konu, ortam, kamera ve lens, ışık, renk paleti (marka renkleriyle uyumlu), doku, kompozisyon (başlık için boş alan bırak), kalite anahtar kelimeleri. Görselde yazı, logo veya harf istemediğini sonda belirt (no text, no logo). İlham promptları verildiyse onların stil, ışık ve kompozisyon kalıbını kullan.' : 'fotoğraf/illüstrasyon gerekiyorsa Midjourney/DALL-E için İngilizce, detaylı bir prompt; gerekmiyorsa boş.'}

${jobTools(job).length ? `${toolsBlock(job)}\n\nHer içerik için "arac_promptlari" alanına yukarıdaki araçların her biri için, o aracın rehberindeki formata ve en iyi uygulamalara birebir uyan, kopyalanıp doğrudan araca yapıştırılabilecek bir prompt yaz (anahtar: araç adı). Video aracıysa Reels/Story içerikleri için hareket, kamera ve süre bilgisini de prompta kat.\n\n` : ''}Yanıtın YALNIZCA bir JSON dizisi olsun (kod bloğu içinde), başka açıklama yazma. Metinlerin içinde çift tırnak (") kullanma; alıntı gerekiyorsa tek tırnak (') ya da « » kullan. Satır sonu gerekiyorsa \\n yaz:
\`\`\`json
[
  {
    "no": 1,
    "tarih": "YYYY-AA-GG",
    "gun": "Pazartesi",
    "yayin_saati": "19:00",
    "platform": "Instagram",
    "format": "post | carousel",
    "konu": "İçeriğin konusu / içerik sütunu",
    "gorsel_baslik": "Görselin üzerindeki ana başlık (en fazla 6-7 kelime)",
    "gorsel_alt_metin": "Görsel üzerindeki destek metni (kısa, opsiyonel)",
    "cta": "Görseldeki çağrı (opsiyonel)",
    "gorsel_fikri": "Tasarımcıya kompozisyon, renk ve görsel öğe tarifi",
    "aciklama": "Gönderinin paylaşım metni (caption), emoji kullanılabilir",
    "hashtagler": ["#ornek"],
${carousels ? `    "slaytlar": [{ "baslik": "Slayt başlığı", "metin": "Kısa slayt metni", "gorsel_fikri": "Bu slaytın görsel tarifi" }],
` : ''}${designAssetList(company) ? `    "gorseller": ["Bu içerikte kullanılacak firma görsellerinin kimlikleri"],
` : ''}    "ai_gorsel_prompt": "..."${jobTools(job).length ? `,\n    "arac_promptlari": { ${jobTools(job).map((t) => `"${t.name}": "..."`).join(', ')} }` : ''}
  }
]
\`\`\``;
  const r = await claude.call({
    model: settings().model,
    system: systemFor('sosyal-medya-uzmani', '', true),
    messages: [{ role: 'user', content: await userContent(company, prompt) }],
    maxTokens: 32000,
    onText: (x) => { step.output += x; stream(x); },
    signal,
    tag: { jobId: job.id, companyId: job.companyId, agent: 'sosyal-medya-uzmani' },
  });
  addUsage(job, r.usage, step);
  step.output = r.text;
  useDesignList(job, step, await readDesignList(job, r.text, signal, stream, step));
}

function toDesignArray(x) {
  const a = Array.isArray(x) ? x : (x && (x.icerikler || x.items)) || [];
  const list = a.filter((it) => it && typeof it === 'object' && !Array.isArray(it));
  if (!list.length) {
    const e = new Error('İçerik listesi okunamadı.');
    e.jsonError = true;
    throw e;
  }
  return list;
}

async function readDesignList(job, text, signal, stream, step) {
  try {
    return toDesignArray(extractJson(text));
  } catch (e) {
    if (!e.jsonError) throw e;
    return toDesignArray(await repairJsonWithModel(job, text, e, signal, stream, step));
  }
}

// Bir içeriğin boyut varyantları. Carousel yalnızca gönderi boyutunda (4:5 ya da kare) üretilir.
export function makeVariant(key, frames = 1) {
  const f = FORMATS[key] || FORMATS.post;
  return { key, width: f.w, height: f.h, status: 'pending', error: null, frames: Array.from({ length: frames }, () => ({ svg: '', history: [] })) };
}

function useDesignList(job, step, items) {
  const formats = (job.options?.formats || ['post']).filter((f) => FORMATS[f]);
  job.designs = items.slice(0, 60).map((it, i) => {
    const isCarousel = /carousel/i.test(it.format || '') && Array.isArray(it.slaytlar) && it.slaytlar.length >= 2;
    // Carousel de seçilen her boyutta üretilir (ör. post + story); hiçbiri yoksa post
    const list = formats.length ? formats : ['post'];
    const variants = list.map((f) => makeVariant(f, isCarousel ? Math.min(10, it.slaytlar.length) : 1));
    return { ...it, format: isCarousel ? 'carousel' : (it.format && !/carousel/i.test(it.format) ? it.format : 'post'), kind: isCarousel ? 'carousel' : 'single', id: store.id(), no: it.no || i + 1, variants, images: [], aiImages: {} };
  });
  step.output = `${job.designs.length} içerik listelendi.\n\n` + job.designs
    .map((d) => `${d.no}. ${d.tarih || ''} · ${d.platform || ''} ${d.kind === 'carousel' ? `carousel (${d.slaytlar.length} slayt)` : d.variants.map((v) => v.key).join(' + ')} · ${d.gorsel_baslik || d.konu || ''}`).join('\n');
}

// ---------------- tasarım hattı ----------------

const SVG_RULES = (w, h, assets = []) => `

## SVG üretim kuralları (zorunlu)
- Yanıtın YALNIZCA tek bir <svg> öğesi olsun. Öncesinde veya sonrasında açıklama, kod bloğu (\`\`\`) yazma.
- Kök öğe: <svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">
- Logo için tam olarak şu yer tutucuyu kullan: <image href="{{LOGO}}" x=".." y=".." width=".." height=".." preserveAspectRatio="xMidYMid meet"/>. Logo verilmediyse firma adını şık bir yazı logo olarak yaz.
${assets.length ? `- Firma görselleri: aşağıda verilen görselleri <image href="{{IMG:kimlik}}" x y width height preserveAspectRatio="..."/> ile kullan (kimlik görselin yanında yazıyor). Ürün görselini kompozisyonun kahramanı yap; arka plan fotoğrafını tuvali dolduracak şekilde "xMidYMid slice" ile yerleştir. Görselin en-boy oranını bozma.
` : ''}- Yazı tipleri (program SVG'nin içine gömer; font-family ve font-weight ile seç): ${render.fontList().join('; ')}. Bunlardan başka font kullanma; her zaman Arial, sans-serif yedeğini ekle. Bir tasarımda en fazla 2 aile.
- URL, @import, script ve foreignObject yok. Filtre (feGaussianBlur, feDropShadow), degrade, desen, clipPath ve mask serbest; ölçülü kullan.
- Metinler kenarlardan en az 64px içeride kalsın. Uzun metni <tspan x=".." dy=".."> ile satırlara böl. Hiçbir metin taşmasın veya üst üste binmesin.
- Başlık en az 64px, destek metin en az 30px. Fotoğraf üstündeki metnin arkasına okunurluk için degrade karartma veya plaka koy.
- Dikey (1920) formatta (story, reels, TikTok) üstte 250px, altta 340px ve sağda 140px güvenli alan bırak; bu alanlara metin veya logo koyma.
- Türkçe karakterleri (ç, ğ, ı, İ, ö, ş, ü) doğru yaz; & işaretini &amp; olarak kaçır.`;

export function extractSvg(text) {
  const m = String(text).match(/<svg[\s\S]*<\/svg>/i);
  if (!m) return null;
  let svg = m[0];
  if (!/xmlns=/.test(svg.slice(0, 300))) svg = svg.replace(/<svg/i, '<svg xmlns="http://www.w3.org/2000/svg"');
  if (/xlink:href/.test(svg) && !/xmlns:xlink/.test(svg.slice(0, 400))) svg = svg.replace(/<svg/i, '<svg xmlns:xlink="http://www.w3.org/1999/xlink"');
  return svg;
}

function designContext(job, company) {
  const concept = job.steps.filter((s) => s.kind === 'agent' && s.status === 'done' && s.agent === 'kreatif-direktor');
  const conceptText = concept.map((s) => s.output).join('\n\n');
  const ozet = job.plan?.ozet ? `# İşin özeti (ajans yöneticisi)\n${job.plan.ozet}\n\n` : '';
  const guide = styleGuideText(company);
  const insp = inspirationText(jobInspirations(job, company));
  return `${companyBrief(company, job)}

${ozet}${guide ? `# Onaylı tasarım dili (en yüksek öncelik)
Bu rehber ajansın ilham arşivinden ve varsa firmanın kendi örnek tasarımlarından çıkarıldı. Tasarımlar bu dilin dışına çıkmamalı. Yerleşim, tipografi, renk kullanımı, grafik öğeler ve logo yerleşimi bu rehbere uymalı; kreatif direktörün konsepti ile çelişirse görsel biçimde bu rehber, mesaj ve içerikte konsept geçerlidir. İçeriğe en uygun şablonu seç; aynı şablonu art arda kullanma.

${guide}

` : ''}${insp ? `${insp}\n\n` : ''}${conceptText ? `# Kreatif direktörün konsepti ve görsel dili\n${truncate(conceptText, guide ? 8000 : 14000)}` : ''}${job.request && !conceptText ? `# Müşterinin istekleri\n${job.request}` : ''}

Tüm tasarımlar aynı kampanyanın parçası: renk, tipografi ve görsel dil seri boyunca tutarlı olsun, ama her içerik kendi konusuna göre farklı bir kompozisyona sahip olsun.`;
}

// Tasarımda kullanılacak firma görselleri: bu boyut için üretilen AI görsel, kullanıcının seçtikleri, sonra diğerleri (en fazla 6)
function designAssets(company, d, variantKey) {
  const all = (company?.files || []).filter((f) => f.role && f.role !== 'mockup' && f.designFile);
  const want = [d.aiImages?.[variantKey], ...(d.images || []), ...(Array.isArray(d.gorseller) ? d.gorseller : [])].filter(Boolean).map((x) => String(x).replace(/^IMG:/, ''));
  const first = want.map((fid) => all.find((f) => f.id === fid)).filter(Boolean);
  const rest = all.filter((f) => !f.aiPrompt || first.includes(f));
  return [...new Set([...first, ...rest])].slice(0, 6);
}

function assetBlocks(company, assets) {
  const out = [];
  for (const f of assets) {
    const x = render.designFile(company, f.id);
    if (!x) continue;
    out.push({ type: 'text', text: `Görsel {{IMG:${f.id}}} · ${ROLE_TR[f.role] || 'Görsel'} · ${f.name} · ${f.width || '?'}x${f.height || '?'}${f.alpha ? ' · şeffaf zeminli (dekupe)' : ''}${f.aiPrompt ? ' · bu içerik için üretilmiş AI görsel' : ''}` });
    out.push({ type: 'image', source: { type: 'base64', media_type: x.mime, data: x.data } });
  }
  return out;
}

// Bir içerik için AI görsel üretir (görsel motoru bağlıysa ve işte açıksa), firma görsellerine "arka plan" olarak ekler
async function ensureAiImage(job, d, variant, company, signal) {
  const o = job.options || {};
  if (!o.aiImages || d.aiImages?.[variant.key] || !d.ai_gorsel_prompt) return;
  const provider = o.imageProvider || imagegen.defaultProvider();
  if (!provider || !imagegen.isConnected(provider)) return;
  // Aynı oranda başka varyant için üretilmiş görsel varsa onu kullan
  const same = (d.variants || []).find((v) => v.key !== variant.key && d.aiImages?.[v.key] && Math.abs(v.width / v.height - variant.width / variant.height) < 0.05);
  if (same) { d.aiImages[variant.key] = d.aiImages[same.key]; return; }
  const insp = jobInspirations(job, company).filter((s) => s.analysis?.styleSuffix);
  const suffix = insp.length ? ', ' + [...new Set(insp.slice(0, 2).map((s) => s.analysis.styleSuffix))].join(', ') : '';
  const prompt = `${d.ai_gorsel_prompt}${suffix}. No text, no letters, no logos, no watermark.`;
  const refs = [];
  if (imagegen.PROVIDERS[provider].refs) {
    for (const s of jobInspirations(job, company).slice(0, 2)) {
      try {
        const b = await render.imageBlockFromFile(store.assetPath(store.AGENCY_ID, s.file), 1024);
        refs.push({ mime: b.source.media_type, data: b.source.data });
      } catch {}
    }
  }
  const r = await imagegen.generate(provider, { prompt: refs.length ? `Use the attached reference images only for style, lighting and color mood. ${prompt}` : prompt, width: variant.width, height: variant.height, refs, signal });
  addUsage(job, { images: r.images.length, imageCost: r.cost }, designsStep(job));
  const entry = await saveCompanyImage(company, r.images[0], { name: `AI · #${d.no} ${d.gorsel_baslik || d.konu || ''}`.slice(0, 80), role: 'arkaplan', aiPrompt: prompt, provider });
  d.aiImages = { ...(d.aiImages || {}), [variant.key]: entry.id };
}

// Görseli firmanın dosyalarına ekler; tasarımda kullanılacak küçültülmüş kopyasını hazırlar
export async function saveCompanyImage(company, img, { name, role = 'arkaplan', aiPrompt, provider } = {}) {
  const entry = store.writeAsset(company.id, { name, buf: img.buf, mime: img.mime, folder: store.fileFolder({ role, mime: img.mime }) });
  const p = await render.prepareImage(img.buf, 1600);
  const dfile = store.writeSibling(company.id, entry.file, `${entry.id}-d.${p.ext}`, p.buf);
  Object.assign(entry, { role, designFile: dfile, width: p.width, height: p.height, alpha: p.alpha, reference: false });
  if (aiPrompt) Object.assign(entry, { aiPrompt, provider, source: 'ai' });
  store.addAsset(company.id, 'files', entry);
  send('company:update', { id: company.id });
  return entry;
}

const designsStep = (job) => job.steps?.find((s) => s.kind === 'designs');

// Tek bir kareyi (tek tasarım ya da carousel slaytı) üretir
async function designFrame(job, d, variant, frameIndex, company, signal, { feedback, adaptFrom } = {}) {
  const s = settings();
  const w = variant.width;
  const h = variant.height;
  const frame = variant.frames[frameIndex];
  const item = { ...d };
  for (const k of ['id', 'variants', 'images', 'aiImages', 'kind']) delete item[k];
  const content = [];
  const logo = logoBlock(company);
  if (logo) content.push(logo);
  content.push(...(await referenceBlocks(company)));
  content.push({ type: 'text', text: designContext(job, company), cache_control: { type: 'ephemeral' } });
  const samples = styleSamplesFor(job, company, w, h, d.no || 1);
  if (samples.length) {
    content.push({ type: 'text', text: `Onaylı örnek / ilham tasarımlarından ${samples.length} tanesi (stil referansı). Bu örneklerin yazı tipi tarzını, düğme ve etiket şekillerini, ürün yerleşimini, kompozisyonunu, ışık ve derinlik hissini tekrarla; metinlerini ve ürünlerini kopyalama:` });
    for (const x of samples) {
      const img = await styleImage(x.ownerId, x.f);
      if (img) content.push({ type: 'text', text: `${x.ownerId === store.AGENCY_ID ? 'İlham örneği' : 'Firma örneği'} ${x.i + 1} (${x.f.width || '?'}x${x.f.height || '?'})` }, img);
    }
  }
  const assets = designAssets(company, d, variant.key);
  if (assets.length) {
    content.push({ type: 'text', text: `# Kullanabileceğin firma görselleri\nAşağıdaki görselleri tasarımda gerçek fotoğraf olarak kullan. İçeriğin konusuna uyan ürünü seç.${d.aiImages?.[variant.key] ? ' "Bu içerik için üretilmiş AI görsel" etiketli fotoğrafı kompozisyonun ana görseli yap.' : ''}${(d.images || []).length ? ' Kullanıcının bu içerik için özellikle seçtiği görselleri mutlaka kullan.' : ''}` });
    content.push(...assetBlocks(company, assets));
  }
  let task = `# Tasarlanacak içerik\n\`\`\`json\n${JSON.stringify(item, null, 2)}\n\`\`\`\n\n`;
  if (d.kind === 'carousel') {
    const slide = d.slaytlar?.[frameIndex] || {};
    const n = variant.frames.length;
    task += `Bu içerik ${n} slaytlık bir carousel. Şimdi ${frameIndex + 1}. slaytı tasarla (${frameIndex === 0 ? 'kapak: güçlü başlık, kaydırmaya davet eden küçük bir işaret' : frameIndex === n - 1 ? 'son slayt: CTA ve logo' : 'ara slayt'}).\nSlayt içeriği: ${JSON.stringify(slide)}\nSağ altta küçük bir sayfa göstergesi koy (${frameIndex + 1}/${n}). Slaytlar yan yana kaydırılınca tek bir seri gibi görünmeli: aynı ızgara, aynı kenar boşlukları, aynı tipografi.\n`;
    const cover = variant.frames[0]?.svg;
    if (frameIndex > 0 && cover) task += `\nSerinin kapak slaytı (bu görsel dili, ızgarayı ve tipografiyi aynen sürdür; metni ve kompozisyonu bu slayta göre değiştir):\n${cover}\n`;
  }
  if (adaptFrom) {
    task += `\nAynı içeriğin ${adaptFrom.width}x${adaptFrom.height} boyutundaki onaylı tasarımı aşağıda. Bu tasarımı ${w}x${h} boyutuna uyarla: aynı görsel dil, renkler, yazı tipleri, metinler, logo ve görseller kalsın; kompozisyonu yeni orana göre yeniden kur (yalnızca ölçekleme yapma).${h >= 1900 ? ' Story güvenli alanlarına uy.' : ''}\n${adaptFrom.svg}\n`;
  }
  task += `\nBu içeriğin ${w}x${h} tasarımını SVG olarak üret.`;
  if (feedback && frame.svg) {
    task += `\n\n# Revizyon\nÖnceki tasarım:\n${frame.svg}\n\nMüşteri/kreatif direktör geri bildirimi: ${feedback}\n\nGeri bildirime göre tasarımı düzelt ve yeni SVG'yi ver.`;
  }
  content.push({ type: 'text', text: task });
  const system = systemFor('grafik-tasarimci', SVG_RULES(w, h, assets));
  const tag = { jobId: job.id, companyId: job.companyId, agent: 'grafik-tasarimci' };
  let lastErr;
  let svg = null;
  for (let attempt = 0; attempt < 2 && !svg; attempt++) {
    const r = await claude.call({ model: s.designModel || s.model, system, messages: [{ role: 'user', content }], maxTokens: 32000, continueOnMax: false, signal, tag });
    addUsage(job, r.usage, designsStep(job));
    svg = extractSvg(r.text);
    if (!svg) lastErr = new Error(r.stopReason === 'max_tokens' ? 'Tasarım çok uzun çıktı ve kesildi.' : 'Yanıtta SVG bulunamadı.');
  }
  if (!svg) throw lastErr;
  // Kalite turu: tasarım gerçekte nasıl göründüğüyle çizilir, tasarımcı kendi işine bakıp düzeltir
  const rounds = Math.max(0, Math.min(2, s.designQa ?? 1));
  for (let i = 0; i < rounds; i++) {
    let jpg = null;
    try { jpg = await render.svgToJpeg(render.finalize(svg, company)); } catch (e) { if (signal?.aborted) throw e; }
    const check = [
      ...(jpg ? [{ type: 'text', text: 'Tasarımının ekranda çizilmiş hali:' }, { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: jpg.toString('base64') } }] : []),
      { type: 'text', text: `${jpg ? '' : 'SVG ekranda çizilemedi; kodu kontrol et.\n'}# Kalite kontrolü
Çizilmiş tasarıma bir sanat yönetmeni gibi bak${samples.length ? ' ve örnek tasarımlarla yan yana karşılaştır' : ''}. Şunları kontrol et:
- Taşan, kesilen, üst üste binen veya kenara yapışan metin var mı; satır kırılımları dengeli mi?
- Yazı tipi, ağırlık ve harf aralığı ${samples.length ? 'örneklerdeki' : 'stil rehberindeki'} tarza uyuyor mu; hiyerarşi net mi?
- Ürün/ana görsel kahraman mı, boyutu ve konumu güçlü mü, gölge ve ışık inandırıcı mı?
- Etiket, düğme ve kartların şekli${samples.length ? ' örneklerle' : ''} uyumlu mu; hizalar ve boşluklar tutarlı mı?
- Görünüm "basit şablon" gibi mi duruyor? Öyleyse derinlik, ışık, katman ve detay ekle.
- Logo görünür ve doğru yerde mi; güvenli alanlara uyulmuş mu?
Sorunları düzeltilmiş tam SVG'yi ver. Yanıtın yalnızca SVG olsun.` },
    ];
    const r = await claude.call({
      model: s.designModel || s.model, system,
      messages: [{ role: 'user', content }, { role: 'assistant', content: svg }, { role: 'user', content: check }],
      maxTokens: 32000, continueOnMax: false, signal, tag,
    });
    addUsage(job, r.usage, designsStep(job));
    const better = extractSvg(r.text);
    if (!better) break;
    svg = better;
  }
  return svg;
}

// Bir varyantın bütün karelerini üretir. İlk varyant sıfırdan, diğerleri ilk varyanttan uyarlanır.
async function designVariant(job, d, variant, company, signal) {
  variant.status = 'running';
  variant.error = null;
  emit(job);
  try {
    await ensureAiImage(job, d, variant, company, signal);
    const base = d.variants.find((v) => v !== variant && v.status === 'done' && v.frames.length === variant.frames.length);
    for (let i = 0; i < variant.frames.length; i++) {
      if (variant.frames[i].svg) continue;
      const adaptFrom = base?.frames[i]?.svg ? { svg: base.frames[i].svg, width: base.width, height: base.height } : null;
      variant.frames[i].svg = await designFrame(job, d, variant, i, company, signal, { adaptFrom });
      emit(job);
    }
    variant.status = 'done';
  } catch (e) {
    variant.status = signal.aborted ? 'pending' : 'error';
    variant.error = e.message;
  }
  emit(job);
}

async function stepDesigns(job, step, company, signal) {
  const pending = job.designs.filter((d) => d.variants.some((v) => v.status !== 'done'));
  const conc = Math.max(1, Math.min(6, +settings().concurrency || 3));
  let next = 0;
  const update = () => {
    const units = job.designs.flatMap((d) => d.variants);
    const done = units.filter((v) => v.status === 'done').length;
    const err = units.filter((v) => v.status === 'error').length;
    step.output = `${done}/${units.length} tasarım hazır${err ? `, ${err} hata` : ''}.`;
    emit(job);
  };
  const worker = async () => {
    while (next < pending.length && !signal.aborted) {
      const d = pending[next++];
      for (const v of d.variants) {
        if (v.status === 'done' || signal.aborted) continue;
        await designVariant(job, d, v, company, signal);
        update();
      }
    }
  };
  update();
  await Promise.all(Array.from({ length: conc }, worker));
  if (signal.aborted) throw new Error('Durduruldu');
  const units = job.designs.flatMap((d) => d.variants);
  const failed = units.filter((v) => v.status === 'error');
  if (units.length && failed.length === units.length) throw new Error('Hiçbir tasarım üretilemedi: ' + (failed[0]?.error || ''));
}

// ---------------- sonradan işlemler: revizyon, geri alma, yeni boyut ----------------

function findDesign(jobId, designId, variantKey) {
  const job = store.getJob(jobId);
  const d = job?.designs.find((x) => x.id === designId);
  if (!d) throw new Error('Tasarım bulunamadı');
  const v = variantKey ? d.variants.find((x) => x.key === variantKey) : d.variants[0];
  if (!v) throw new Error('Bu boyut bulunamadı');
  return { job, d, v, company: store.getCompany(job.companyId) };
}

const busy = new Set();

// frameIndex null ise varyantın bütün kareleri (carousel) yeniden üretilir
export async function reviseDesign(jobId, designId, variantKey, frameIndex, feedback) {
  const { job, d, v, company } = findDesign(jobId, designId, variantKey);
  const k = `${designId}:${v.key}`;
  if (busy.has(k)) throw new Error('Bu tasarım zaten üretiliyor.');
  busy.add(k);
  const ctl = new AbortController();
  v.status = 'running';
  v.error = null;
  emit(job);
  try {
    if (!v.frames.some((f) => f.svg)) {
      await ensureAiImage(job, d, v, company, ctl.signal);
      for (let i = 0; i < v.frames.length; i++) {
        const base = d.variants.find((x) => x !== v && x.status === 'done' && x.frames.length === v.frames.length);
        v.frames[i].svg = await designFrame(job, d, v, i, company, ctl.signal, { adaptFrom: base?.frames[i]?.svg ? { svg: base.frames[i].svg, width: base.width, height: base.height } : null });
        emit(job);
      }
    } else {
      const idxs = frameIndex == null ? v.frames.map((_, i) => i) : [frameIndex];
      for (const i of idxs) {
        const f = v.frames[i];
        const svg = await designFrame(job, d, v, i, company, ctl.signal, { feedback: feedback || 'Tasarımı yenile, farklı bir kompozisyon dene.' });
        if (f.svg) f.history.push({ svg: f.svg, at: store.now(), feedback });
        f.svg = svg;
        emit(job);
      }
    }
    if (feedback) store.addFeedback(job.companyId, feedback, `Tasarım revizyonu #${d.no} ${v.key} (${d.gorsel_baslik || d.konu || ''}, ${d.platform || ''})`);
    v.status = 'done';
    v.error = null;
  } catch (e) {
    v.status = v.frames.some((f) => f.svg) ? 'done' : 'error';
    v.error = e.message;
    emit(job);
    throw e;
  } finally {
    busy.delete(k);
  }
  emit(job);
  store.flush();
}

export function undoDesign(jobId, designId, variantKey, frameIndex = 0) {
  const { job, v } = findDesign(jobId, designId, variantKey);
  const f = v.frames[frameIndex];
  if (!f?.history.length) return;
  f.svg = f.history.pop().svg;
  v.status = 'done';
  v.error = null;
  emit(job);
  store.flush();
}

// Var olan bir tasarımı başka bir boyutta da üretir (ör. post → story)
export async function addVariant(jobId, designId, formatKey) {
  const { job, d } = findDesign(jobId, designId);
  if (!FORMATS[formatKey]) throw new Error('Bilinmeyen boyut');
  if (d.variants.some((v) => v.key === formatKey)) throw new Error('Bu boyut zaten var.');
  const v = makeVariant(formatKey, d.kind === 'carousel' ? d.variants[0].frames.length : 1);
  d.variants.push(v);
  emit(job);
  return reviseDesign(jobId, designId, formatKey, null, null);
}

export function setDesignImages(jobId, designId, ids) {
  const { job, d } = findDesign(jobId, designId);
  d.images = (ids || []).slice(0, 4);
  emit(job);
  store.flush();
}

// Tasarımın AI görselini yeniden üretir (yeni bir fotoğraf), sonra kullanıcı revize edebilir
export async function regenerateAiImage(jobId, designId, variantKey, prompt) {
  const { job, d, v, company } = findDesign(jobId, designId, variantKey);
  if (prompt) d.ai_gorsel_prompt = prompt;
  for (const x of d.variants) if (Math.abs(x.width / x.height - v.width / v.height) < 0.05) delete d.aiImages?.[x.key];
  await ensureAiImage({ ...job, options: { ...job.options, aiImages: true } }, d, v, company, undefined);
  emit(job);
  store.flush();
  return d.aiImages[v.key];
}

export function followup(jobId, message) {
  const job = store.getJob(jobId);
  if (!job || running.has(jobId)) return;
  store.addFeedback(job.companyId, message, `"${job.title}" işine ek talep`);
  job.steps.push(newStep('followup', {
    agent: 'ajans-yoneticisi', agentLabel: agents.LABELS['ajans-yoneticisi'], title: 'Ek talep', userMessage: message,
    task: `Kullanıcının bu iş hakkındaki ek talebi:\n"${message}"\n\nTalebi yanıtla. Bir çıktının değişmesi gerekiyorsa değişmiş halini doğrudan, eksiksiz yaz (ilgili uzmanın bakış açısıyla). Tasarım revizyonu gerekiyorsa hangi tasarım numaralarının nasıl değişmesi gerektiğini madde madde yaz; kullanıcı bunları tasarım kartlarındaki "Revize et" ile uygulayabilir.`,
  }));
  job.steps.push(learnStep());
  emit(job);
  run(jobId);
}

export async function testConnection() {
  const r = await claude.call({
    model: settings().model,
    messages: [{ role: 'user', content: 'Yalnızca "Bağlantı tamam" yaz.' }],
    maxTokens: 2000,
    continueOnMax: false,
    tag: { agent: 'test' },
  });
  return r.text.trim();
}

// ---------------- öğrenme: firma hafızası ve ajan dersleri ----------------

function learnStep() {
  return newStep('learn', { agent: 'ajans-yoneticisi', agentLabel: agents.LABELS['ajans-yoneticisi'], title: 'Öğrenilenleri kaydet' });
}

async function learnFrom(company, contextText, signal, tag = {}) {
  const pending = company.feedback.filter((f) => !f.learned);
  const roster = agents.names().join(', ');
  const prompt = `# Müşteri: ${company.name}

# Ajans hafızasında zaten kayıtlı olanlar
${company.memory.map((m) => `- ${m.text}`).join('\n') || '- (boş)'}

# Kullanıcının son geri bildirimleri ve talepleri
${pending.map((f) => `- [${f.context}] ${f.text}`).join('\n') || '- (yok)'}

${contextText || ''}

# Görevin: öğren
Ekibin bir sonraki işte daha iyi çalışması için bu iş ve geri bildirimlerden kalıcı dersler çıkar.
1. "firma": Bu müşteriye özel, sonraki işlerde de geçerli olacak tercih ve kurallar (ör. "Logo her zaman sağ üstte ve beyaz zemin üzerinde", "Ton samimi ama emoji az", "Kış kampanyalarında kırmızı kullanılmıyor"). Yalnızca bu işe özgü tek seferlik istekleri ekleme. Hafızada zaten olanı tekrar yazma.
2. "ajanlar": Müşteriden bağımsız, bir ajanın genel çalışma şeklini iyileştirecek dersler (ör. grafik-tasarimci: "Başlıklarda satır başına 18 karakteri geçme"). Ajan adları: ${roster}.
Emin olmadığın veya kanıtı olmayan bir şey yazma. Ders yoksa boş liste ver. Her madde tek, net cümle olsun.

Yanıtın yalnızca şu JSON olsun:
\`\`\`json
{ "firma": ["..."], "ajanlar": { "grafik-tasarimci": ["..."] } }
\`\`\``;
  const r = await claude.call({
    model: settings().model,
    system: systemFor('ajans-yoneticisi', '', true),
    messages: [{ role: 'user', content: prompt }],
    maxTokens: 6000,
    signal,
    tag: { companyId: company.id, agent: 'ajans-yoneticisi', ...tag },
  });
  let out = { firma: [], ajanlar: {} };
  try { out = extractJson(r.text); } catch {}
  const added = [];
  for (const t of out.firma || []) { store.addMemory(company.id, t, 'Ajanlar öğrendi'); added.push(t); }
  const valid = new Set(agents.names());
  for (const [name, list] of Object.entries(out.ajanlar || {})) {
    if (!valid.has(name)) continue;
    for (const t of list || []) if (store.addAgentLesson(name, t, company.name)) added.push(`${agents.LABELS[name] || name}: ${t}`);
  }
  for (const f of pending) f.learned = true;
  store.flush();
  return { usage: r.usage, added };
}

async function stepLearn(job, step, company, signal) {
  const summary = job.steps.filter((s) => s.status === 'done' && (s.isSummary || s.kind === 'followup')).map((s) => truncate(s.output, 4000)).join('\n\n');
  const revised = job.designs.flatMap((d) => d.variants.map((v) => ({ d, v, n: v.frames.reduce((a, f) => a + f.history.length, 0) }))).filter((x) => x.n);
  const designs = revised.map((x) => `- #${x.d.no} ${x.v.key}: ${x.n} revizyon`).join('\n');
  const ctx = `# Bu iş: ${job.title}\n${summary ? `## Teslim özeti / ek talepler\n${summary}` : ''}${designs ? `\n## Revizyon alan tasarımlar\n${designs}` : ''}`;
  const { usage, added } = await learnFrom(company, ctx, signal, { jobId: job.id });
  addUsage(job, usage, step);
  step.output = added.length ? `Kaydedilen dersler:\n${added.map((a) => `- ${a}`).join('\n')}` : 'Yeni bir ders çıkmadı.';
}

export async function learnNow(companyId) {
  const company = store.getCompany(companyId);
  const r = await learnFrom(company, '', undefined);
  return r.added;
}

// ---------------- ajan eğitimi: kullanıcının geri bildiriminden genel kural çıkarma ----------------

// Kullanıcı bir çıktıyı eleştirir ("gereksiz kod yazıyor") → ajan için kalıcı, genel direktifler üretilir
export async function trainAgent(agentName, feedback, { jobId, stepId } = {}) {
  if (!agents.get(agentName)) throw new Error('Ajan bulunamadı');
  if (!String(feedback || '').trim()) throw new Error('Geri bildirim boş');
  let sample = '';
  if (jobId && stepId) {
    const s = store.getJob(jobId)?.steps.find((x) => x.id === stepId);
    if (s?.output) sample = `\n# Eleştirilen çıktı (kısaltılmış)\n${truncate(s.output, 8000)}\n`;
  }
  const existing = store.agentLessons(agentName).map((l) => `- ${l.text}`).join('\n') || '- (yok)';
  const r = await claude.call({
    model: settings().model,
    system: systemFor('ajans-yoneticisi', '', true),
    messages: [{ role: 'user', content: `# Eğitilecek ajan: ${agents.LABELS[agentName]} (${agentName})
# Ajanın mevcut direktifleri ve dersleri
${existing}
${sample}
# Kullanıcının geri bildirimi
${feedback}

# Görevin
Bu geri bildirimi, ajanın bundan sonraki BÜTÜN üretimlerinde uygulayacağı 1-3 kalıcı, genel ve ölçülebilir direktife çevir. Her direktif tek cümle, emir kipinde ve somut olsun (ör. "Yalnızca istenen işlevi yaz; kullanılmayan yardımcı fonksiyon, yorum satırı ve örnek kod ekleme."). Mevcut direktiflerle aynı olanı tekrar yazma; çelişen varsa yenisini yaz ve "yerine" alanında eskisini aynen belirt.
Yanıtın yalnızca şu JSON olsun:
\`\`\`json
{ "direktifler": ["..."], "yerine": ["(varsa değiştirilecek eski direktifin metni)"] }
\`\`\`` }],
    maxTokens: 4000,
    tag: { agent: agentName, kind: 'egitim' },
  });
  let out = { direktifler: [] };
  try { out = extractJson(r.text); } catch {}
  for (const old of out.yerine || []) {
    const l = store.agentLessons(agentName).find((x) => x.text === old);
    if (l) store.removeAgentLesson(agentName, l.id);
  }
  const added = [];
  for (const t of out.direktifler || []) if (store.addAgentLesson(agentName, t, 'Eğitim')) added.push(t);
  return { added, usage: r.usage };
}

export function addDirective(agentName, text) {
  if (!agents.get(agentName)) throw new Error('Ajan bulunamadı');
  store.addAgentLesson(agentName, text, 'Siz');
}

// ---------------- tasarım stili öğrenme (ilham arşivi ya da firma örnekleri) ----------------

const learningStyles = new Set();

export async function learnStyle(companyId) {
  const isAgency = companyId === store.AGENCY_ID;
  const company = isAgency ? store.getAgency() : store.getCompany(companyId);
  if (!company || learningStyles.has(companyId)) return;
  const pool = company.styles || [];
  const samples = pool.length <= 30 ? pool : Array.from({ length: 30 }, (_, k) => pool[Math.floor((k * pool.length) / 30)]);
  if (samples.length < 2) throw new Error('Stili öğrenmek için en az 2 örnek tasarım yükleyin (20-25 önerilir).');
  learningStyles.add(companyId);
  try {
    const content = [];
    const logo = !isAgency && logoBlock(company);
    if (logo) content.push({ type: 'text', text: 'Firmanın ana logosu:' }, logo);
    for (const [i, f] of samples.entries()) {
      const img = await styleImage(company.id, f);
      if (img) content.push({ type: 'text', text: `Örnek ${i + 1}: ${f.name} (${f.width || '?'}x${f.height || '?'} px)` }, img);
    }
    const intro = isAgency
      ? `# Ajansın ilham arşivi
Bu örnekler farklı markalar için yapılmış, birbirinden bağımsız tasarımlar; ama hepsi ajansın benimsediği tek bir tasarım dilini temsil ediyor. Bu rehber bütün firmalarda varsayılan tasarım dili olarak kullanılacak; firmanın renkleri, logosu ve ürünleri bu dilin içine yerleştirilecek. Bu yüzden markaya özgü şeyleri (ürün, metin, logo) değil, ortak dili yaz. Renk bölümünde her örneğin kendi renk ailesini (zemin, orta ton, vurgu HEX) ve bu tonların nasıl kurulduğunu çıkar; firma paletinden aynı mantıkla nasıl renk seti türetileceğini anlat. Yazı tipi olarak yalnızca şu listeden seç ve listenin dışına çıkma: ${render.fontNames().join(', ')}.`
      : companyBrief(company, { steps: [] });
    const prompt = `${intro}

${company.styleGuide?.text && !company.styleGuide.bundled ? `# Mevcut stil rehberi (güncelle; kullanıcının elle eklediği kuralları koru)\n${truncate(company.styleGuide.text, 10000)}\n` : ''}
# Görevin: tasarım stilini öğren
Yukarıda ${samples.length} örnek tasarım var. Bunlar ${isAgency ? 'ajansın onaylı tasarım dili' : 'bu firmanın onaylı tasarım stili'}. Bundan sonra ${isAgency ? 'herhangi bir firma' : 'bu firma'} için üreteceğin her sosyal medya tasarımı, konusu ve metni farklı olsa da bu örneklerin aynı elinden çıkmış gibi görünmeli.

Örnekleri tek tek incele, ortak kuralları ve tekrar eden şablonları çıkar, sonra kendine yönelik ölçülebilir bir stil rehberi yaz. Rehberi sen okuyup SVG üretirken uygulayacaksın; bu yüzden "modern, şık" gibi muğlak ifadeler değil, 1080 px genişliğe göre px, oran, HEX ve sayı ver.

Rehberin bölümleri:
1. **Stilin özeti:** 3-4 cümle; bu tasarımları tanınır yapan şey ne.
2. **Yerleşim şablonları:** tekrar eden her kompozisyon için bir şablon (Şablon A, B, C…). Her biri için: hangi örneklerde görüldüğü, hangi içerik türüne uygun olduğu, ızgara ve bölgeler (başlık, görsel alanı, logo, CTA nerede; kenar boşlukları px), yaklaşık oranlar.
3. **Renk kullanımı:** zemin, başlık, vurgu, CTA renkleri (HEX), hangi oranda kullanıldığı, degrade ve kaplama kuralları.
4. **Tipografi:** başlık / alt başlık / gövde / CTA için yazı karakteri tarzı, boyutlar (px), satır aralığı, hizalama, satır başına yaklaşık karakter. Her rol için programın yazı tipi kütüphanesinden örneklere en yakın aileyi ve ağırlığı seç: ${render.fontNames().join(', ')}. Harf aralığını px olarak ver.
5. **Grafik öğeler:** düğme ve etiket şekilleri, kartlar, ikonlar, çizgiler, rozetler, ışık hüzmeleri, parlamalar, gölgeler. Her birinin SVG ile nasıl kurulacağını kısaca yaz.
5b. **Fotoğraf, ürün ve 3B öğeler:** örneklerde hangi tür görseller var, ürün nasıl yerleştirilmiş. Bu görünümü SVG'de firmanın yüklediği görsellerle nasıl kuracağını yaz. Ayrıca arka plan fotoğrafları üretmek için İngilizce bir AI görsel prompt şablonu ver.
6. **Logo kullanımı:** konum, boyut (genişliğin yüzdesi), boşluk, zemin.
7. **Metin dili:** görsel üzerindeki metinlerin uzunluğu, tonu, emoji/işaret kullanımı.
8. **Formatlara göre farklar:** kare, 4:5, 9:16 (story/reels) örneklerinde neyin değiştiği.
9. **Yapılması ve yapılmaması gerekenler:** en az 6'şar madde.
10. **Kontrol listesi:** bir tasarımı teslim etmeden önce bakacağın 6-8 madde.

Örneklerdeki metinleri ve ürünleri kopyalamak için değil, görsel dili tekrarlamak için yazıyorsun. Örnekler birbirinden çok farklıysa bunu söyle ve en baskın stili ana stil, diğerlerini alternatif şablon olarak yaz. Yalnızca rehberi yaz; giriş veya kapanış cümlesi ekleme.`;
    content.push({ type: 'text', text: prompt });
    const r = await claude.call({
      model: settings().model,
      system: systemFor('grafik-tasarimci', '', true),
      messages: [{ role: 'user', content }],
      maxTokens: 16000,
      tag: { companyId: isAgency ? null : companyId, agent: 'grafik-tasarimci', kind: 'stil' },
    });
    store.setStyleGuide(companyId, { text: r.text.trim(), learnedAt: store.now(), sampleCount: samples.length, editedAt: null });
  } finally {
    learningStyles.delete(companyId);
  }
}

export const isLearningStyle = (cid) => learningStyles.has(cid);
