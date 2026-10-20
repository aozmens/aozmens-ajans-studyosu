// Yerel veri deposu: tek JSON dosyası (db.json) + varlık dosyaları.
// Her firmanın kendi klasörü var: DATA_DIR/firmalar/<Firma adı>/<01 Logolar, 02 Marka Dosyası, …>/<dosya>.
// İlham arşivi (ajans) DATA_DIR/assets/_ajans altında. Sunucuda kalıcı diske (ör. Railway volume) bağlanır.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

export const AGENCY_ID = '_ajans';

export const DEFAULT_SETTINGS = {
  apiKey: '',
  baseUrl: '',
  model: 'claude-opus-5-5',
  designModel: 'claude-sonnet-5-5',
  effort: 'medium', // low | medium | high | xhigh | max
  concurrency: 3,
  agencyName: 'Agent-cy',
  // Marka dosyasının sonundaki kurumsal alt bilgi
  agencyEmail: '',
  agencyPhone: '',
  agencyWebsite: '',
  agencyAddress: '',
  agencyLogo: '', // ajans klasöründeki logo dosyası
  theme: 'system',
  designQa: 1, // her tasarımdan sonra çizip kontrol eden tur sayısı (0-2)
  fallbacks: true, // Claude reddederse sunucu tarafında yedek modele geç
  imageProvider: 'openai', // varsayılan görsel motoru: openai (gpt-image-2.5) | clipdrop | fal | gemini | higgsfield
  integrations: {
    clipdrop: { apiKey: '' },
    fal: { apiKey: '', model: 'fal-ai/flux-pro/v1.1-ultra' },
    openai: { apiKey: '', model: 'gpt-image-2.5' },
    gemini: { apiKey: '', model: 'gemini-2.5-flash-image' },
    higgsfield: { keyId: '', secret: '', imageModel: 'higgsfield-ai/soul/v2/standard', videoModel: '', extra: '' },
  },
};

// İlk açılışta hazır gelen dış araç rehberleri (prompt hazırlamak için). Kullanıcı yenilerini ekleyebilir.
const DEFAULT_TOOLS = [
  {
    name: 'Higgsfield', kind: 'video', integration: 'higgsfield',
    urls: ['https://docs.higgsfield.ai/quickstart'],
    notes: 'Yapay zeka ile video ve görsel üretim platformu. Kamera hareketleri ve efekt şablonlarıyla kısa video (Reels/TikTok) üretiminde kullanıyoruz.',
  },
  {
    name: 'Clipdrop', kind: 'görsel', integration: 'clipdrop',
    urls: ['https://clipdrop.co/apis/docs/text-to-image'],
    notes: 'Metinden görsel, arka plan silme, büyütme. Ürün dekupesi ve arka plan üretiminde kullanıyoruz.',
  },
  {
    name: 'Midjourney', kind: 'görsel', integration: '',
    urls: ['https://docs.midjourney.com/hc/en-us/articles/32023408776205-Prompt-Basics'],
    notes: 'Fotoğraf gerçekçiliğinde görseller ve illüstrasyonlar için (API yok; prompt kopyalanıp kullanılır).',
  },
];

let root = '';
let db = null;
let timer = null;

export const now = () => new Date().toISOString();
export const id = () => crypto.randomUUID();

const dbFile = () => path.join(root, 'db.json');
export const assetRoot = () => path.join(root, 'assets');
export const companiesRoot = () => path.join(root, 'firmalar');

// Firma klasöründeki alt klasörler (dosya yöneticisinde sıralı görünsün diye numaralı)
export const FOLDERS = {
  logos: '01 Logolar',
  brandBook: '02 Marka Dosyası',
  images: '03 Görseller',
  products: '04 Ürünler',
  mockups: '05 Mockuplar',
  styles: '06 Örnek Tasarımlar',
  logoStudio: '07 Logo Stüdyosu',
  webClone: '08 Web Klon',
  jobs: '09 İşler',
  other: '10 Diğer',
};
// İlham arşivinin (ajans) alt klasörleri
export const AGENCY_FOLDERS = { inspiration: 'ilham', mockups: 'mockuplar', designLanguage: 'tasarim-dili', brand: 'ajans' };

// Dosya ve klasör adı: Windows'ta yasak karakterler çıkarılır, Türkçe harfler korunur
export const safeName = (s, n = 80) => String(s || '').replace(/[<>:"/\\|?*\u0000-\u001f]/g, ' ').replace(/\s+/g, ' ').replace(/[. ]+$/, '').trim().slice(0, n) || 'Adsız';

// Sahibin (firma ya da ajans) klasörü. Klasörü atanmamış eski firmalar assets/<id> altında kalır.
export function ownerDir(ownerId) {
  if (ownerId !== AGENCY_ID) {
    const c = db?.companies.find((x) => x.id === ownerId);
    if (c?.folder) return path.join(companiesRoot(), c.folder);
  }
  return path.join(assetRoot(), path.basename(String(ownerId)));
}
export const assetDir = (owner, sub = '') => {
  const d = path.join(ownerDir(owner), sub);
  fs.mkdirSync(d, { recursive: true });
  return d;
};
// file: sahibin klasörüne göreli yol ("01 Logolar/abc.png"); eski kayıtlarda yalnızca dosya adı
export const assetPath = (owner, file) => path.join(ownerDir(owner), file);
// Türetilmiş kopya (ör. tasarımda kullanılan küçültülmüş görsel, logonun PNG'si): asıl dosyanın klasöründeki
// ".kopyalar" alt klasörüne yazılır, klasörde yalnızca kullanıcının dosyaları görünür. Göreli yolu döndürür.
export function writeSibling(owner, file, name, buf) {
  const dir = path.posix.dirname(file);
  const rel = dir === '.' ? name : `${dir}/.kopyalar/${name}`;
  fs.mkdirSync(path.dirname(assetPath(owner, rel)), { recursive: true });
  fs.writeFileSync(assetPath(owner, rel), buf);
  return rel;
}
export const cacheDir = () => {
  const d = path.join(root, 'cache');
  fs.mkdirSync(d, { recursive: true });
  return d;
};
export const dataRoot = () => root;

function emptyDb() {
  return { settings: {}, companies: [], jobs: [], agentLessons: {}, agentOverrides: {}, agentTools: {}, tools: null, agency: null, usageLog: [] };
}

export function init(dir) {
  root = dir;
  fs.mkdirSync(root, { recursive: true });
  try {
    db = JSON.parse(fs.readFileSync(dbFile(), 'utf8'));
  } catch {
    db = emptyDb();
  }
  db = { ...emptyDb(), ...db };
  db.settings = mergeSettings(DEFAULT_SETTINGS, db.settings || {});
  if (db.settings.agencyName === 'AOZTECH Ajans') db.settings.agencyName = 'Agent-cy'; // programın adı Agent-cy oldu
  // Görsel üretiminde varsayılan OpenAI gpt-image-2.5 oldu (bir kez uygulanır; sonra Ayarlar'dan değiştirilebilir)
  if ((db.settings.imageDefaults || 0) < 1) {
    db.settings.imageProvider = 'openai';
    db.settings.integrations.openai.model = 'gpt-image-2.5';
    db.settings.imageDefaults = 1;
  }
  if (!db.tools) db.tools = DEFAULT_TOOLS.map((t) => ({ ...t, id: id(), guide: '', createdAt: now() }));
  for (const c of db.companies) migrateCompany(c);
  for (const c of db.companies) ensureFolder(c);
  seedAgency();
  for (const j of db.jobs) {
    if (j.status === 'running') j.status = 'stopped';
    for (const d of j.designs || []) {
      for (const v of d.variants || []) if (v.status === 'running') v.status = 'pending';
    }
  }
  for (const c of db.companies) {
    for (const p of c.logoProjects || []) if (p.busy) p.busy = false;
  }
  flush();
}

function mergeSettings(def, s) {
  const out = { ...def, ...s, integrations: { ...def.integrations } };
  for (const k of Object.keys(def.integrations)) out.integrations[k] = { ...def.integrations[k], ...(s.integrations?.[k] || {}) };
  return out;
}

export function flush() {
  clearTimeout(timer);
  timer = null;
  const tmp = dbFile() + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(db));
  fs.renameSync(tmp, dbFile());
}

// Akış sırasında sık yazmamak için gecikmeli kayıt
export function save() {
  if (timer) return;
  timer = setTimeout(flush, 400);
}

// ---------------- ayarlar ----------------

const SECRET_PATHS = [['apiKey'], ['integrations', 'clipdrop', 'apiKey'], ['integrations', 'fal', 'apiKey'], ['integrations', 'openai', 'apiKey'], ['integrations', 'gemini', 'apiKey'], ['integrations', 'higgsfield', 'keyId'], ['integrations', 'higgsfield', 'secret']];
const getPath = (o, p) => p.reduce((x, k) => (x == null ? x : x[k]), o);
const setPath = (o, p, v) => { let x = o; for (const k of p.slice(0, -1)) x = x[k] = x[k] || {}; x[p[p.length - 1]] = v; };
const mask = (v) => (v ? '••••' + String(v).slice(-4) : '');

// Ortam değişkenleri (Railway'de gizli değişken olarak) ayarlardaki anahtarların önüne geçer
const ENV_KEYS = {
  apiKey: 'ANTHROPIC_API_KEY',
  'integrations.clipdrop.apiKey': 'CLIPDROP_API_KEY',
  'integrations.fal.apiKey': 'FAL_KEY',
  'integrations.openai.apiKey': 'OPENAI_API_KEY',
  'integrations.gemini.apiKey': 'GEMINI_API_KEY',
  'integrations.higgsfield.keyId': 'HF_API_KEY',
  'integrations.higgsfield.secret': 'HF_API_SECRET',
};

export function getSettings(masked = false) {
  const s = JSON.parse(JSON.stringify(db.settings));
  for (const p of SECRET_PATHS) {
    const env = process.env[ENV_KEYS[p.join('.')]];
    if (env && !getPath(s, p)) setPath(s, p, env);
  }
  if (!masked) return s;
  for (const p of SECRET_PATHS) {
    const v = getPath(s, p);
    const fromEnv = !getPath(db.settings, p) && !!v;
    setPath(s, p, mask(v));
    if (fromEnv) setPath(s, [...p.slice(0, -1), p[p.length - 1] + 'FromEnv'], true);
  }
  s.ready = !!getPath(getSettings(false), ['apiKey']);
  return s;
}

export function saveSettings(input) {
  const next = mergeSettings(DEFAULT_SETTINGS, { ...db.settings, ...input, integrations: { ...db.settings.integrations } });
  for (const k of Object.keys(input.integrations || {})) next.integrations[k] = { ...db.settings.integrations[k], ...input.integrations[k] };
  for (const p of SECRET_PATHS) {
    const v = getPath(next, p);
    if (v == null || String(v).startsWith('••••')) setPath(next, p, getPath(db.settings, p) || '');
    delete getPath(next, p.slice(0, -1))?.[p[p.length - 1] + 'FromEnv'];
  }
  delete next.ready;
  next.concurrency = Math.max(1, Math.min(6, +next.concurrency || 3));
  next.designQa = Math.max(0, Math.min(2, +next.designQa || 0));
  db.settings = next;
  flush();
  return getSettings(true);
}

// ---------------- kullanım günlüğü (token ve maliyet) ----------------

export function logUsage(entry) {
  db.usageLog.push({ at: now(), ...entry });
  if (db.usageLog.length > 20000) db.usageLog.splice(0, db.usageLog.length - 20000);
  save();
}
export const usageLog = () => db.usageLog;

// ---------------- firmalar (markalar) ----------------

export function migrateCompany(c) {
  for (const k of ['logos', 'files', 'styles', 'memory', 'feedback', 'palette', 'logoProjects', 'inspirationIds']) if (!Array.isArray(c[k])) c[k] = [];
  if (!c.palette.length && c.colors) {
    const hex = String(c.colors).match(/#(?:[0-9a-f]{6}|[0-9a-f]{3})\b/gi) || [];
    c.palette = hex.map((h, i) => ({ name: `Renk ${i + 1}`, hex: h.toUpperCase() }));
  }
  for (const k of ['brandBooks', 'webClones']) if (!Array.isArray(c[k])) c[k] = [];
  for (const k of ['fontHeading', 'fontBody']) if (typeof c[k] !== 'string') c[k] = '';
  if (c.styleGuide === undefined) c.styleGuide = null;
  if (c.brandProfile === undefined) c.brandProfile = null;
  // Logo projelerine sonradan eklenen alanlar: örnek logolar, eskiz taraması, cevaplar, ikon yolu
  for (const p of c.logoProjects) {
    if (!Array.isArray(p.refs)) p.refs = [];
    if (!p.answers || typeof p.answers !== 'object') p.answers = {};
    if (p.scan === undefined) p.scan = null;
    if (!p.iconMode) p.iconMode = 'tasarla';
  }
}

// Firma klasörü: ilk açılışta eski assets/<id> klasörü firmalar/<Firma adı> altına taşınır,
// bilinen dosyalar türlerine göre alt klasörlere ayrılır (kayıtlardaki yollar da güncellenir).
function uniqueFolder(name, selfId) {
  const base = safeName(name, 60);
  for (let i = 1; ; i++) {
    const f = i === 1 ? base : `${base} (${i})`;
    const taken = db.companies.some((x) => x.id !== selfId && x.folder?.toLocaleLowerCase('tr-TR') === f.toLocaleLowerCase('tr-TR'));
    if (!taken && (!fs.existsSync(path.join(companiesRoot(), f)) || db.companies.find((x) => x.id === selfId)?.folder === f)) return f;
  }
}

export function fileFolder(entry) {
  const mime = entry.mime || '';
  if (entry.role === 'urun') return FOLDERS.products;
  if (entry.role === 'mockup') return FOLDERS.mockups;
  if (/^(image|video)\//.test(mime)) return FOLDERS.images;
  return FOLDERS.other;
}

export function ensureFolder(c) {
  if (c.folder) {
    fs.mkdirSync(path.join(companiesRoot(), c.folder), { recursive: true });
    return;
  }
  const legacy = path.join(assetRoot(), c.id);
  c.folder = uniqueFolder(c.name, c.id);
  const dir = path.join(companiesRoot(), c.folder);
  fs.mkdirSync(companiesRoot(), { recursive: true });
  if (fs.existsSync(legacy)) {
    try { fs.renameSync(legacy, dir); } catch { fs.cpSync(legacy, dir, { recursive: true }); fs.rmSync(legacy, { recursive: true, force: true }); }
  }
  fs.mkdirSync(dir, { recursive: true });
  const move = (entry, folder) => {
    for (const k of ['file', 'pngFile', 'designFile', 'thumbFile']) {
      const f = entry?.[k];
      if (!f || f.includes('/')) continue;
      const src = path.join(dir, f);
      if (!fs.existsSync(src)) continue;
      fs.mkdirSync(path.join(dir, folder), { recursive: true });
      try { fs.renameSync(src, path.join(dir, folder, f)); entry[k] = `${folder}/${f}`; } catch {}
    }
  };
  for (const l of c.logos || []) move(l, FOLDERS.logos);
  for (const f of c.files || []) move(f, fileFolder(f));
  for (const s of c.styles || []) move(s, FOLDERS.styles);
  for (const p of c.logoProjects || []) for (const s of [...(p.sketches || []), ...(p.refs || [])]) move(s, FOLDERS.logoStudio);
}

// Marka adı değişince klasör adı da değişir (yollar klasöre göreli olduğu için kayıtlar etkilenmez)
function renameFolder(c) {
  const want = safeName(c.name, 60);
  if (!c.folder || c.folder === want || c.folder.startsWith(want + ' (')) return;
  const next = uniqueFolder(c.name, c.id);
  try {
    fs.renameSync(path.join(companiesRoot(), c.folder), path.join(companiesRoot(), next));
    c.folder = next;
  } catch {}
}

export const listCompanies = () => db.companies.map(publicCompany);
export const getCompany = (cid) => db.companies.find((c) => c.id === cid) || null;
export const getAgency = () => db.agency;
export const owner = (cid) => (cid === AGENCY_ID ? db.agency : getCompany(cid));

const COMPUTED = ['logos', 'files', 'styles', 'styleGuide', 'memory', 'feedback', 'logoUrl', 'jobCount', 'designCount', 'pendingFeedback', 'logoProjects', 'brandProfile', 'folder', 'brandBooks', 'webClones', 'clientChoice'];

export function saveCompany(input) {
  const data = { ...input };
  for (const k of COMPUTED) delete data[k];
  if (Array.isArray(data.palette)) data.palette = data.palette.filter((p) => /^#[0-9a-fA-F]{3,8}$/.test(p.hex || '')).map((p) => ({ name: String(p.name || '').slice(0, 40), hex: p.hex.toUpperCase() }));
  if (Array.isArray(data.inspirationIds)) data.inspirationIds = data.inspirationIds.filter((x) => typeof x === 'string').slice(0, 24);
  if (data.id) {
    const c = getCompany(data.id);
    if (!c) throw new Error('Marka bulunamadı');
    Object.assign(c, data, { updatedAt: now() });
    if (data.name) renameFolder(c);
    flush();
    return c.id;
  }
  const c = { ...data, id: id(), createdAt: now(), updatedAt: now() };
  migrateCompany(c);
  db.companies.unshift(c);
  ensureFolder(c);
  flush();
  return c.id;
}

export function deleteCompany(cid) {
  const dir = ownerDir(cid);
  db.companies = db.companies.filter((c) => c.id !== cid);
  db.jobs = db.jobs.filter((j) => j.companyId !== cid);
  fs.rmSync(dir, { recursive: true, force: true });
  fs.rmSync(path.join(assetRoot(), path.basename(cid)), { recursive: true, force: true });
  flush();
}

export const assetUrl = (cid, file) => `/files/${cid}/${String(file).split('/').map(encodeURIComponent).join('/')}`;

export function publicCompany(c) {
  if (!c) return null;
  const withUrl = (a) => ({ ...a, url: assetUrl(c.id, a.file), designUrl: a.designFile ? assetUrl(c.id, a.designFile) : undefined });
  const logos = c.logos.map(withUrl);
  const primary = logos.find((l) => l.primary) || logos[0];
  const jobs = db.jobs.filter((j) => j.companyId === c.id);
  return {
    ...c,
    logos,
    files: c.files.map(withUrl),
    styles: c.styles.map(withUrl),
    logoUrl: primary ? (primary.pngFile ? assetUrl(c.id, primary.pngFile) : primary.url) : null,
    jobCount: jobs.length,
    designCount: jobs.reduce((n, j) => n + (j.designs || []).filter((d) => (d.variants || []).some((v) => v.frames?.some((f) => f.svg))).length, 0),
    pendingFeedback: c.feedback.filter((f) => !f.learned).length,
    logoProjects: (c.logoProjects || []).map((p) => ({ ...p })),
    brandBooks: (c.brandBooks || []).map((b) => ({ ...b, url: assetUrl(c.id, b.file) })),
    webClones: (c.webClones || []).map((w) => ({ ...w, log: undefined, previewUrl: w.entry ? assetUrl(c.id, `${w.folder}/${w.entry}`) : null })),
  };
}

export function publicAgency() {
  const a = db.agency;
  return {
    ...a,
    styles: a.styles.map((s) => ({ ...s, url: assetUrl(AGENCY_ID, s.file) })),
    mockups: a.mockups.map((m) => ({ ...m, url: m.file ? assetUrl(AGENCY_ID, m.file) : null })),
    designLanguages: a.designLanguages.map((d) => ({ ...d, pdfUrl: d.pdfFile ? assetUrl(AGENCY_ID, d.pdfFile) : null })),
  };
}

// Ana logonun çizilebilir hali (PNG kopyası varsa o)
export function primaryLogo(c) {
  const l = c?.logos?.find((x) => x.primary) || c?.logos?.[0];
  if (!l) return null;
  const file = l.pngFile || l.file;
  const ext = path.extname(file).slice(1).toLowerCase();
  const mime = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp', gif: 'image/gif' }[ext];
  if (!mime) return null;
  try {
    return { mime, data: fs.readFileSync(assetPath(c.id, file)).toString('base64') };
  } catch {
    return null;
  }
}

export function logoDataUrl(cid) {
  const l = primaryLogo(getCompany(cid));
  return l ? `data:${l.mime};base64,${l.data}` : null;
}

const EXT = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp', 'image/gif': 'gif', 'image/svg+xml': 'svg', 'application/pdf': 'pdf' };

export function parseDataUrl(dataUrl) {
  const m = /^data:([^;,]+)(;base64)?,(.*)$/s.exec(dataUrl || '');
  if (!m) throw new Error('Geçersiz dosya verisi');
  const buf = m[2] ? Buffer.from(m[3], 'base64') : Buffer.from(decodeURIComponent(m[3]), 'utf8');
  return { mime: m[1], buf };
}

// Bir sahibin (firma ya da ajans) klasörüne dosya yazar, girdiyi döndürür. folder: alt klasör (FOLDERS)
export function writeAsset(ownerId, { name, dataUrl, buf, mime, ext, folder = '' }) {
  if (dataUrl) ({ buf, mime } = parseDataUrl(dataUrl));
  const e = ext || EXT[mime] || (path.extname(name || '').slice(1).toLowerCase() || 'bin');
  const fid = id();
  // Klasörde okunur ad: "Ürün fotoğrafı_1a2b3c.jpg"
  const base = safeName(String(name || '').replace(/\.[a-z0-9]{2,5}$/i, ''), 60).replace(/^Adsız$/, 'dosya');
  const fname = folder ? `${base}_${fid.slice(0, 6)}.${e}` : `${fid}.${e}`;
  const file = folder ? `${folder}/${fname}` : fname;
  assetDir(ownerId, folder);
  fs.writeFileSync(assetPath(ownerId, file), buf);
  return { id: fid, name: name || file, file, mime: mime || 'application/octet-stream', size: buf.length, addedAt: now() };
}

export function addAsset(cid, kind, entry) {
  const o = owner(cid);
  if (!o) throw new Error('Bulunamadı');
  o[kind].push(entry);
  if (kind === 'logos' && !o.logos.some((l) => l.primary)) entry.primary = true;
  if (o.updatedAt) o.updatedAt = now();
  flush();
  return entry;
}

export function updateAsset(cid, kind, aid, patch) {
  const o = owner(cid);
  const a = o?.[kind]?.find((x) => x.id === aid);
  if (!a) throw new Error('Dosya bulunamadı');
  if (kind === 'logos' && patch.primary) for (const l of o.logos) l.primary = false;
  if (kind === 'files' && patch.reference && o.files.filter((f) => f.reference && f.id !== aid).length >= 3) {
    throw new Error('En fazla 3 referans görsel seçebilirsiniz.');
  }
  Object.assign(a, patch);
  flush();
  return a;
}

export function removeAsset(cid, kind, aid) {
  const o = owner(cid);
  const a = o?.[kind]?.find((x) => x.id === aid);
  if (!a) return;
  o[kind] = o[kind].filter((x) => x.id !== aid);
  for (const f of [a.file, a.pngFile, a.designFile, a.thumbFile].filter(Boolean)) fs.rmSync(assetPath(o.id, f), { force: true });
  if (kind === 'logos' && a.primary && o.logos[0]) o.logos[0].primary = true;
  flush();
}

export function setStyleGuide(cid, guide) {
  const o = owner(cid);
  o.styleGuide = guide;
  flush();
}

export function setBrandProfile(cid, profile) {
  const c = getCompany(cid);
  c.brandProfile = profile;
  flush();
}

// ---------------- hafıza ve geri bildirim ----------------

const norm = (s) => String(s).trim().toLocaleLowerCase('tr-TR');

export function addMemory(cid, text, source = 'Siz') {
  const c = getCompany(cid);
  if (!c || !String(text).trim()) return;
  if (c.memory.some((m) => norm(m.text) === norm(text))) return;
  c.memory.unshift({ id: id(), text: String(text).trim(), source, at: now() });
  c.memory = c.memory.slice(0, 60);
  flush();
}

export function removeMemory(cid, mid) {
  const c = getCompany(cid);
  c.memory = c.memory.filter((m) => m.id !== mid);
  flush();
}

export function addFeedback(cid, text, context) {
  const c = getCompany(cid);
  if (!c || !String(text || '').trim()) return;
  c.feedback.push({ text: String(text).trim(), context, at: now(), learned: false });
  c.feedback = c.feedback.slice(-200);
  save();
}

// ---------------- ajan dersleri, talimat düzenlemeleri, bağlı araçlar ----------------

export const agentLessons = (name) => db.agentLessons[name] || [];

export function addAgentLesson(name, text, source) {
  const list = (db.agentLessons[name] = db.agentLessons[name] || []);
  if (!String(text).trim() || list.some((l) => norm(l.text) === norm(text))) return false;
  list.unshift({ id: id(), text: String(text).trim(), source, at: now() });
  db.agentLessons[name] = list.slice(0, 60);
  flush();
  return true;
}

export function removeAgentLesson(name, lid) {
  db.agentLessons[name] = agentLessons(name).filter((l) => l.id !== lid);
  flush();
}

export const agentOverrides = () => db.agentOverrides;
export function setAgentOverride(name, text) {
  if (text == null) delete db.agentOverrides[name];
  else db.agentOverrides[name] = text;
  flush();
}

// Ajana bağlanan entegrasyonlar (ör. grafik-tasarimci → fal, video-editor → higgsfield)
export const agentTools = (name) => db.agentTools[name] || [];
export function setAgentTools(name, list) {
  db.agentTools[name] = (list || []).filter((x) => typeof x === 'string');
  flush();
}

// ---------------- işler ----------------

export function addJob(input) {
  const job = {
    id: id(), createdAt: now(), status: 'running', error: null,
    steps: [], designs: [], plan: null,
    usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, cost: 0, images: 0, imageCost: 0 },
    ...input,
  };
  db.jobs.unshift(job);
  flush();
  return job;
}

export const getJob = (jid) => db.jobs.find((j) => j.id === jid) || null;

export function listJobs(cid) {
  return db.jobs
    .filter((j) => !cid || j.companyId === cid)
    .map((j) => ({
      id: j.id, companyId: j.companyId, title: j.title, type: j.type, status: j.status, createdAt: j.createdAt,
      designCount: (j.designs || []).length, usage: j.usage,
      progress: progressOf(j),
    }));
}

function progressOf(j) {
  const steps = j.steps.filter((s) => s.kind !== 'designs');
  const sd = steps.filter((s) => s.status === 'done' || s.status === 'skipped').length;
  const units = (j.designs || []).flatMap((d) => d.variants || []);
  const dd = units.filter((v) => v.status === 'done').length;
  const p = units.length ? (sd / Math.max(1, steps.length)) * 0.5 + (dd / units.length) * 0.5 : sd / Math.max(1, steps.length);
  return Math.round(p * 100);
}

export function deleteJob(jid) {
  db.jobs = db.jobs.filter((j) => j.id !== jid);
  flush();
}

export function companyDesigns(cid) {
  const out = [];
  for (const j of db.jobs) {
    if (j.companyId !== cid) continue;
    for (const d of j.designs || []) if ((d.variants || []).some((v) => v.frames?.some((f) => f.svg))) out.push({ jobId: j.id, jobTitle: j.title, design: d });
  }
  return out;
}

// ---------------- ilham arşivi (ajansın ortak görsel dili + prompt kütüphanesi) ----------------

export function seedAgency(force = false) {
  if (db.agency && !force) {
    for (const k of ['styles', 'mockups', 'designLanguages']) if (!Array.isArray(db.agency[k])) db.agency[k] = [];
    return;
  }
  const keepEnabled = db.agency ? db.agency.enabled : true;
  const styles = force ? [] : db.agency?.styles || [];
  if (force) fs.rmSync(path.join(assetRoot(), AGENCY_ID), { recursive: true, force: true });
  let guide = '';
  try {
    guide = fs.readFileSync(new URL('../assets/ajans-stili/rehber.md', import.meta.url), 'utf8');
  } catch {}
  db.agency = {
    id: AGENCY_ID, enabled: keepEnabled, styles, mockups: db.agency?.mockups || [], designLanguages: db.agency?.designLanguages || [],
    styleGuide: guide ? { text: guide, learnedAt: null, sampleCount: 0, editedAt: null, bundled: true } : null,
  };
  flush();
}

export function setAgencyEnabled(v) {
  db.agency.enabled = !!v;
  flush();
}

// ---------------- dış araçlar ----------------

export const listTools = () => db.tools;
export const getTool = (tid) => db.tools.find((t) => t.id === tid) || null;

export function saveTool(input) {
  const data = {
    name: String(input.name || '').trim(), kind: input.kind || 'diğer', integration: input.integration || '',
    urls: (input.urls || []).map((u) => String(u).trim()).filter(Boolean).slice(0, 8), notes: input.notes || '',
  };
  if (!data.name) throw new Error('Araç adı gerekli');
  if (input.id) {
    const t = getTool(input.id);
    Object.assign(t, data, { updatedAt: now() });
    if (input.guide !== undefined) t.guide = input.guide;
    flush();
    return t;
  }
  const t = { ...data, id: id(), guide: '', createdAt: now() };
  db.tools.push(t);
  flush();
  return t;
}

export function deleteTool(tid) {
  db.tools = db.tools.filter((t) => t.id !== tid);
  flush();
}

export const raw = () => db;
