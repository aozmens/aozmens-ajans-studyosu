// Web klon (/webclone): bir sayfanın klonunu program içinden çeker ve markanın "08 Web Klon" klasörüne kaydeder.
// Üç yol:
//   kopya       → program sayfayı, CSS'leri, görselleri ve yazı tiplerini indirir, yolları yerelleştirir.
//   claude      → kopyanın üstüne Claude (API) sayfayı temiz, tek dosyalık HTML/CSS olarak yeniden kurar (istenirse markaya uyarlar).
//   claude-code → sunucuda / bilgisayarda Claude Code kuruluysa arka planda "claude -p" açılır, klonu o tamamlar.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawn, spawnSync } from 'node:child_process';
import * as store from './store.js';
import * as claude from './claude.js';
import { send } from './events.js';
import { systemFor, companyBrief, truncate } from './orchestrator.js';

const settings = () => store.getSettings(false);
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0 Safari/537.36';
const MAX_FILES = 160;
const MAX_BYTES = 40e6;
const running = new Map(); // klon id → { abort, child }

// ---------------- Claude Code ----------------

let ccCache = null;
export function claudeCode() {
  if (ccCache && Date.now() - ccCache.at < 60000) return ccCache;
  const bin = process.env.CLAUDE_CODE_PATH || 'claude';
  let version = '';
  try {
    const r = spawnSync(bin, ['--version'], { encoding: 'utf8', timeout: 8000, shell: process.platform === 'win32', windowsHide: true });
    if (r.status === 0) version = String(r.stdout || '').trim().split('\n')[0];
  } catch {}
  ccCache = { at: Date.now(), available: !!version, version, bin };
  return ccCache;
}

// ---------------- yardımcılar ----------------

const clean = (u) => String(u || '').trim().replace(/&amp;/g, '&');
function abs(u, base) {
  try {
    const x = new URL(clean(u), base);
    return /^https?:$/.test(x.protocol) ? x.href.replace(/#.*$/, '') : null;
  } catch { return null; }
}
const KIND = (ct, url) => {
  const e = (path.extname(new URL(url).pathname).slice(1) || '').toLowerCase();
  if (/css/.test(ct) || e === 'css') return 'css';
  if (/javascript/.test(ct) || ['js', 'mjs'].includes(e)) return 'js';
  if (/font|woff|ttf|otf/.test(ct) || ['woff', 'woff2', 'ttf', 'otf', 'eot'].includes(e)) return 'fonts';
  return 'img';
};
const EXT = { 'text/css': 'css', 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp', 'image/gif': 'gif', 'image/svg+xml': 'svg', 'image/avif': 'avif', 'image/x-icon': 'ico', 'font/woff2': 'woff2', 'font/woff': 'woff', 'application/javascript': 'js', 'text/javascript': 'js' };
function localName(url, ct) {
  const u = new URL(url);
  const base = path.basename(u.pathname).replace(/\.[a-z0-9]+$/i, '').replace(/[^a-zA-Z0-9_-]+/g, '-').slice(0, 40) || 'dosya';
  const ext = (path.extname(u.pathname).slice(1).toLowerCase().replace(/[^a-z0-9]/g, '') || EXT[(ct || '').split(';')[0]] || 'bin').slice(0, 5);
  const h = crypto.createHash('sha1').update(url).digest('hex').slice(0, 6);
  return `${base}-${h}.${ext}`;
}

async function get(url, signal) {
  const r = await fetch(url, { signal: AbortSignal.any([signal, AbortSignal.timeout(20000)]), headers: { 'user-agent': UA, accept: '*/*' }, redirect: 'follow' });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  const buf = Buffer.from(await r.arrayBuffer());
  return { buf, ct: r.headers.get('content-type') || '', url: r.url || url };
}

// HTML içindeki varlık adresleri (stil, betik, görsel, ikon, yazı tipi ön yükleme, satır içi arka planlar)
function htmlRefs(html) {
  const out = [];
  const attr = (re, kind) => { for (const m of html.matchAll(re)) out.push({ raw: m[1], kind }); };
  for (const m of html.matchAll(/<link\b[^>]*>/gi)) {
    const tag = m[0];
    const href = /\bhref\s*=\s*["']([^"']+)["']/i.exec(tag)?.[1];
    const rel = /\brel\s*=\s*["']([^"']+)["']/i.exec(tag)?.[1] || '';
    if (href && /stylesheet|icon|preload|apple-touch/i.test(rel)) out.push({ raw: href, kind: /stylesheet/i.test(rel) || /as=["']style/i.test(tag) ? 'css' : null });
  }
  attr(/<script\b[^>]*\bsrc\s*=\s*["']([^"']+)["']/gi, 'js');
  attr(/<(?:img|source|video|audio|input)\b[^>]*\b(?:src|data-src|poster|data-lazy-src)\s*=\s*["']([^"']+)["']/gi, 'img');
  attr(/<meta\b[^>]*property\s*=\s*["']og:image["'][^>]*content\s*=\s*["']([^"']+)["']/gi, 'img');
  for (const m of html.matchAll(/\b(?:srcset|data-srcset)\s*=\s*["']([^"']+)["']/gi)) for (const part of m[1].split(',')) { const u = part.trim().split(/\s+/)[0]; if (u) out.push({ raw: u, kind: 'img' }); }
  for (const m of html.matchAll(/url\(\s*["']?([^"')]+)["']?\s*\)/gi)) out.push({ raw: m[1], kind: null });
  return out.filter((r) => r.raw && !/^(data:|javascript:|mailto:|tel:|#|about:)/i.test(r.raw.trim()));
}
const cssRefs = (css) => [
  ...[...css.matchAll(/url\(\s*["']?([^"')]+)["']?\s*\)/gi)].map((m) => m[1]),
  ...[...css.matchAll(/@import\s+["']([^"']+)["']/gi)].map((m) => m[1]),
].filter((u) => u && !/^(data:|#)/i.test(u.trim()));

const escRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
function replaceAll(text, from, to) {
  if (!from || from === to) return text;
  return text.replace(new RegExp(`(["'(\\s,])${escRe(from)}(?=["')\\s,])`, 'g'), `$1${to}`);
}

// ---------------- akış ----------------

export function list(companyId) {
  return (store.getCompany(companyId)?.webClones || []);
}

export function start(companyId, { url, mode = 'kopya', adapt = false, notes = '' } = {}) {
  const c = store.getCompany(companyId);
  if (!c) throw new Error('Marka bulunamadı');
  let u = String(url || '').trim();
  if (!u) throw new Error('Klonlanacak sayfanın adresini yazın.');
  if (!/^https?:\/\//i.test(u)) u = 'https://' + u;
  const host = new URL(u).hostname.replace(/^www\./, '');
  if (mode === 'claude-code' && !claudeCode().available) throw new Error('Bu sunucuda Claude Code kurulu değil. "Claude ile yeniden kur" seçeneğini kullanın ya da bilgisayara Claude Code kurun (npm i -g @anthropic-ai/claude-code).');
  if ((mode === 'claude' || mode === 'claude-code') && !settings().apiKey) throw new Error('Claude API anahtarı girilmemiş (Ayarlar).');
  const stamp = new Date().toISOString().slice(0, 16).replace('T', ' ').replace(':', '.');
  const w = {
    id: store.id(), url: u, host, mode, adapt: !!adapt, notes: String(notes || '').slice(0, 2000), status: 'running', step: 'Sayfa indiriliyor',
    folder: `${store.FOLDERS.webClone}/${store.safeName(`${host} ${stamp}`, 70)}`, entry: null, files: 0, bytes: 0, log: [], error: null, createdAt: store.now(), usage: null,
  };
  c.webClones.unshift(w);
  c.webClones = c.webClones.slice(0, 40);
  store.flush();
  send('company:update', { id: c.id });
  const ctl = new AbortController();
  running.set(w.id, { abort: () => ctl.abort() });
  run(c, w, ctl.signal).finally(() => running.delete(w.id));
  return w;
}

export function cancel(companyId, wid) {
  running.get(wid)?.abort();
}

const log = (c, w, line) => {
  w.log.push(`${new Date().toLocaleTimeString('tr-TR')} ${line}`);
  if (w.log.length > 400) w.log.splice(0, w.log.length - 400);
  store.save();
  send('webclone:update', { companyId: c.id, id: w.id, step: w.step, line, status: w.status });
};

async function run(c, w, signal) {
  const dir = store.assetDir(c.id, w.folder);
  try {
    await copySite(c, w, dir, signal);
    if (w.mode === 'claude') await rebuildWithClaude(c, w, dir, signal);
    if (w.mode === 'claude-code') await runClaudeCode(c, w, dir, signal);
    w.status = 'done';
    w.step = 'Hazır';
    log(c, w, 'Klon hazır.');
  } catch (e) {
    w.status = signal.aborted ? 'stopped' : 'error';
    w.error = signal.aborted ? null : e.message;
    w.step = signal.aborted ? 'Durduruldu' : 'Hata';
    log(c, w, signal.aborted ? 'Durduruldu.' : `Hata: ${e.message}`);
  } finally {
    store.flush();
    send('company:update', { id: c.id });
  }
}

async function copySite(c, w, dir, signal) {
  const page = await get(w.url, signal);
  const base = page.url;
  let html = page.buf.toString('utf8');
  fs.writeFileSync(path.join(dir, 'kaynak.html'), html);
  log(c, w, `Sayfa indirildi (${Math.round(page.buf.length / 1024)} KB).`);
  w.step = 'Varlıklar indiriliyor';
  fs.mkdirSync(path.join(dir, 'assets'), { recursive: true });
  const map = new Map(); // mutlak adres → yerel ad
  let bytes = page.buf.length;
  const fetchOne = async (absUrl, hint) => {
    if (map.has(absUrl)) return map.get(absUrl);
    if (map.size >= MAX_FILES || bytes > MAX_BYTES) return null;
    map.set(absUrl, null);
    try {
      const r = await get(absUrl, signal);
      bytes += r.buf.length;
      const kind = hint || KIND(r.ct, r.url);
      const name = localName(absUrl, r.ct);
      let body = r.buf;
      if (kind === 'css') {
        let css = r.buf.toString('utf8');
        for (const ref of [...new Set(cssRefs(css))]) {
          const a = abs(ref, r.url);
          if (!a) continue;
          const local = await fetchOne(a, /\.css(\?|$)/i.test(a) ? 'css' : null);
          if (local) css = replaceAll(css, ref, local);
        }
        body = Buffer.from(css);
      }
      fs.writeFileSync(path.join(dir, 'assets', name), body);
      map.set(absUrl, name);
      return name;
    } catch (e) {
      if (signal.aborted) throw e;
      log(c, w, `İndirilemedi: ${absUrl.slice(0, 120)} (${e.message})`);
      return null;
    }
  };
  const refs = htmlRefs(html);
  const queue = [...new Map(refs.map((r) => [r.raw, r])).values()];
  let i = 0;
  const worker = async () => {
    while (i < queue.length) {
      const r = queue[i++];
      const a = abs(r.raw, base);
      if (!a) continue;
      const local = await fetchOne(a, r.kind);
      if (local) r.local = `assets/${local}`;
    }
  };
  await Promise.all([worker(), worker(), worker(), worker()]);
  for (const r of queue) if (r.local) html = replaceAll(html, r.raw, r.local);
  html = html.replace(/<base\b[^>]*>/gi, '');
  // Klon: betikler çalışmasın diye ayrı dosyaya alınmış halleri korunur ama sayfada devre dışı bırakılır
  const cloned = html.replace(/<script\b([^>]*)>/gi, '<script type="text/plain" data-klon-devre-disi $1>');
  fs.writeFileSync(path.join(dir, 'index.html'), cloned);
  fs.writeFileSync(path.join(dir, 'BILGI.txt'), `Kaynak: ${w.url}\nTarih: ${new Date().toLocaleString('tr-TR')}\nDosya: ${map.size} varlık, ${Math.round(bytes / 1024)} KB\n\nindex.html: yolları yerelleştirilmiş kopya (betikler devre dışı)\nkaynak.html: sayfanın indirilen hali\n${w.mode === 'claude' ? 'yeniden-kurulum.html: Claude ile temiz yeniden kurulum\n' : ''}${w.mode === 'claude-code' ? 'claude-code/: Claude Code ile tamamlanan klon\n' : ''}\nKopyalanan tasarım ve içerik üçüncü kişilere aittir; yayınlamadan önce hakları kontrol edin.\n`);
  w.files = [...map.values()].filter(Boolean).length;
  w.bytes = bytes;
  w.entry = 'index.html';
  w.title = (/<title[^>]*>([\s\S]*?)<\/title>/i.exec(html)?.[1] || '').trim().slice(0, 140);
  log(c, w, `${w.files} varlık indirildi (${Math.round(bytes / 1024)} KB).`);
}

function brandAssets(c, dir) {
  const l = store.primaryLogo(c);
  if (!l) return '';
  const name = `logo.${l.mime.split('/')[1].replace('jpeg', 'jpg')}`;
  fs.writeFileSync(path.join(dir, 'assets', name), Buffer.from(l.data, 'base64'));
  return `assets/${name}`;
}

const adaptText = (c, logoPath) => `# Markaya uyarlama
Klonu ${c.name} markasına uyarla: metinleri markaya göre yeniden yaz (Türkçe), renkleri marka paletiyle değiştir${c.palette?.length ? ` (${c.palette.map((p) => p.hex).join(', ')})` : ''}, yazı tiplerini ${c.fontHeading || 'Montserrat'} (başlık) ve ${c.fontBody || 'Inter'} (gövde) yap (Google Fonts bağlantısıyla). ${logoPath ? `Logoyu "${logoPath}" dosyasıyla değiştir.` : 'Logo yerine marka adını yazı logo olarak kullan.'} Düzen, boşluklar ve bölüm yapısı kaynak sayfadaki gibi kalsın.`;

async function rebuildWithClaude(c, w, dir, signal) {
  w.step = 'Claude yeniden kuruyor';
  log(c, w, 'Claude sayfayı temiz HTML/CSS olarak yeniden kuruyor…');
  const src = fs.readFileSync(path.join(dir, 'index.html'), 'utf8');
  const body = src.replace(/<script[\s\S]*?<\/script>/gi, '').replace(/<style[\s\S]*?<\/style>/gi, '').replace(/<!--[\s\S]*?-->/g, '').replace(/\s{2,}/g, ' ');
  const cssFiles = fs.readdirSync(path.join(dir, 'assets')).filter((f) => f.endsWith('.css'));
  const css = cssFiles.map((f) => `/* ${f} */\n${fs.readFileSync(path.join(dir, 'assets', f), 'utf8')}`).join('\n').replace(/\s{2,}/g, ' ');
  const inline = [...src.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/gi)].map((m) => m[1]).join('\n');
  const images = fs.readdirSync(path.join(dir, 'assets')).filter((f) => /\.(png|jpe?g|webp|gif|svg|avif)$/i.test(f));
  const logoPath = w.adapt ? brandAssets(c, dir) : '';
  const prompt = `${w.adapt ? `${companyBrief(c, { steps: [], options: {} })}\n\n` : ''}# Kaynak sayfa: ${w.url}
Başlık: ${w.title || '-'}

## HTML (betikler ve stiller çıkarıldı)
${truncate(body, 60000)}

## CSS
${truncate(inline + '\n' + css, 40000)}

## Yerel görseller (assets/ klasöründe)
${images.join(', ') || '-'}

${w.adapt ? adaptText(c, logoPath) : ''}
${w.notes ? `# Kullanıcının notu\n${w.notes}\n` : ''}
# Görevin: sayfayı yeniden kur
Bu sayfanın görsel olarak birebir klonunu tek dosyalık, temiz, mobil uyumlu bir HTML belgesi olarak yeniden kur. Tüm CSS'i tek <style> içine yaz, gereksiz sınıfları ve çerçeve (framework) kalıntılarını at, bölüm yapısını, renkleri, boşlukları, tipografiyi ve görselleri koru. Görselleri "assets/<dosya>" yollarıyla kullan. JavaScript gerekiyorsa en sonda küçük bir <script> ile yaz. Yanıtın yalnızca tam HTML belgesi olsun (<!doctype html> ile başlasın), açıklama yazma.`;
  const r = await claude.call({
    model: settings().model,
    system: systemFor('frontend-gelistirici', '', true),
    messages: [{ role: 'user', content: prompt }],
    maxTokens: 32000,
    signal,
    tag: { companyId: c.id, agent: 'frontend-gelistirici', kind: 'web-klon' },
  });
  w.usage = r.usage;
  const m = /<!doctype html[\s\S]*<\/html>/i.exec(r.text) || /<html[\s\S]*<\/html>/i.exec(r.text);
  const html = m ? m[0] : r.text.replace(/^```html?\s*|```\s*$/g, '');
  fs.writeFileSync(path.join(dir, 'yeniden-kurulum.html'), html);
  w.entry = 'yeniden-kurulum.html';
  log(c, w, 'Yeniden kurulum hazır: yeniden-kurulum.html');
}

async function runClaudeCode(c, w, dir, signal) {
  const cc = claudeCode();
  w.step = 'Claude Code çalışıyor';
  log(c, w, `Claude Code arka planda açıldı (${cc.version}).`);
  const logoPath = w.adapt ? brandAssets(c, dir) : '';
  fs.mkdirSync(path.join(dir, 'claude-code'), { recursive: true });
  const prompt = `Bu klasörde ${w.url} sayfasının otomatik kopyası var: index.html (yolları yerelleştirilmiş, betikler devre dışı), kaynak.html (ham hali) ve assets/ (indirilen CSS, görsel ve yazı tipleri).
Görevin: sayfanın çalışan, görsel olarak birebir bir klonunu "claude-code/" klasörüne kur.
1. index.html ve kaynak.html'i incele; eksik kalan görselleri, yazı tiplerini ve CSS'leri (gerekirse WebFetch ya da curl ile) assets/ klasörüne indir.
2. claude-code/index.html dosyasını yaz: temiz, mobil uyumlu HTML + CSS; görseller ../assets/ yolundan gelsin. Gereksiz izleme ve reklam betiklerini alma.
3. Bitince claude-code/OKUBENI.md dosyasına neyi nasıl yaptığını 5-10 satırla yaz.
${w.adapt ? adaptText(c, logoPath ? '../' + logoPath : '') : ''}
${w.notes ? `Kullanıcının notu: ${w.notes}` : ''}
Bu klasörün dışına dosya yazma.`;
  const args = ['-p', '--output-format', 'stream-json', '--verbose', '--permission-mode', 'acceptEdits', '--allowedTools', 'Read,Write,Edit,Glob,Grep,WebFetch,Bash(curl:*),Bash(mkdir:*),Bash(ls:*)', '--max-turns', '60'];
  const env = { ...process.env, ANTHROPIC_API_KEY: settings().apiKey };
  if (settings().baseUrl) env.ANTHROPIC_BASE_URL = settings().baseUrl;
  await new Promise((resolve, reject) => {
    // Prompt stdin'den gider: Windows'ta claude.cmd kabukla çalışır ve çok satırlı argümanlar orada bozulur
    const win = process.platform === 'win32';
    const child = spawn(cc.bin, win ? args.map((a) => `"${a}"`) : args, { cwd: dir, env, shell: win, windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] });
    child.stdin.on('error', () => {});
    child.stdin.end(prompt);
    const kill = () => { try { child.kill(); } catch {} };
    signal.addEventListener('abort', kill, { once: true });
    const timer = setTimeout(kill, 30 * 60 * 1000);
    let buf = '';
    let result = null;
    child.stdout.on('data', (d) => {
      buf += d.toString();
      let nl;
      while ((nl = buf.indexOf('\n')) >= 0) {
        const line = buf.slice(0, nl).trim();
        buf = buf.slice(nl + 1);
        if (!line) continue;
        try {
          const ev = JSON.parse(line);
          if (ev.type === 'assistant') {
            for (const b of ev.message?.content || []) {
              if (b.type === 'text' && b.text.trim()) log(c, w, b.text.trim().slice(0, 300));
              if (b.type === 'tool_use') log(c, w, `→ ${b.name} ${JSON.stringify(b.input || {}).slice(0, 140)}`);
            }
          }
          if (ev.type === 'result') result = ev;
        } catch { log(c, w, line.slice(0, 300)); }
      }
    });
    child.stderr.on('data', (d) => log(c, w, String(d).trim().slice(0, 300)));
    child.on('error', (e) => { clearTimeout(timer); reject(e); });
    child.on('close', (code) => {
      clearTimeout(timer);
      if (result?.usage) w.usage = claude.logExternal({ usage: result.usage, cost: result.total_cost_usd, tag: { companyId: c.id, agent: 'claude-code', kind: 'web-klon' } });
      if (signal.aborted) return reject(new Error('İptal edildi'));
      if (code !== 0 && !fs.existsSync(path.join(dir, 'claude-code', 'index.html'))) return reject(new Error(`Claude Code ${code} koduyla kapandı${result?.result ? `: ${String(result.result).slice(0, 200)}` : ''}`));
      resolve();
    });
  });
  if (fs.existsSync(path.join(dir, 'claude-code', 'index.html'))) w.entry = 'claude-code/index.html';
}

export function remove(companyId, wid) {
  const c = store.getCompany(companyId);
  const w = c?.webClones.find((x) => x.id === wid);
  if (!w) return;
  if (running.has(wid)) throw new Error('Önce klonu durdurun.');
  fs.rmSync(store.assetPath(c.id, w.folder), { recursive: true, force: true });
  c.webClones = c.webClones.filter((x) => x.id !== wid);
  store.flush();
}

// ZIP için klasördeki bütün dosyalar
export function files(companyId, wid) {
  const c = store.getCompany(companyId);
  const w = c?.webClones.find((x) => x.id === wid);
  if (!w) throw new Error('Klon bulunamadı');
  const root = store.assetPath(c.id, w.folder);
  const out = {};
  const walk = (d, rel) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      if (e.isDirectory()) walk(path.join(d, e.name), `${rel}${e.name}/`);
      else out[`${rel}${e.name}`] = fs.readFileSync(path.join(d, e.name));
    }
  };
  if (fs.existsSync(root)) walk(root, '');
  return { name: `${c.name} - ${w.host} klon`, files: out };
}
