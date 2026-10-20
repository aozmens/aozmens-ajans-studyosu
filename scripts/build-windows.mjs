// Windows paketi: Agent-cy.exe (başlatıcı) + taşınabilir Node + uygulama + Windows için derlenmiş bağımlılıklar → tek zip.
// Kullanım: npm run build && node scripts/build-windows.mjs   (Go ve internet gerekir; çıktı: dist-windows/Agent-cy-Windows.zip)
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const OUT = path.join(ROOT, 'dist-windows');
const PKG = path.join(OUT, 'Agent-cy');
const APP = path.join(PKG, 'app');
const CACHE = path.join(OUT, '.cache');
const NODE_VERSION = process.env.NODE_WIN_VERSION || process.versions.node;
const GO = process.env.GO || (fs.existsSync('/usr/local/go/bin/go') ? '/usr/local/go/bin/go' : 'go');
const version = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8')).version;

const run = (cmd, args, opts = {}) => execFileSync(cmd, args, { stdio: 'inherit', ...opts });
const step = (s) => console.log(`\n▸ ${s}`);

if (!fs.existsSync(path.join(ROOT, 'web/dist/index.html'))) throw new Error('Önce arayüzü derle: npm run build');

step('Klasör hazırlanıyor');
fs.rmSync(PKG, { recursive: true, force: true });
fs.mkdirSync(path.join(APP, 'server'), { recursive: true });
fs.mkdirSync(CACHE, { recursive: true });
for (const d of ['agents', 'assets', 'web/dist']) fs.cpSync(path.join(ROOT, d), path.join(APP, d), { recursive: true });

// Sunucu tek dosyaya paketlenir: zip binlerce küçük dosya yerine ~1000 dosya içerir, Windows'ta hızlı çıkar.
// Yerel ikili ya da veri dosyası okuyan paketler (sharp, resvg, pdfkit) dışarıda kalır.
step('Sunucu tek dosyaya paketleniyor');
const EXTERNAL = ['sharp', '@resvg/resvg-js', 'pdfkit'];
const esbuild = path.join(ROOT, 'web/node_modules/.bin/esbuild');
run(esbuild, [path.join(ROOT, 'server/index.js'), '--bundle', '--platform=node', '--format=esm', '--target=node22', '--log-level=warning',
  ...EXTERNAL.map((x) => `--external:${x}`),
  '--banner:js=import { createRequire as __cr } from "node:module"; const require = __cr(import.meta.url);',
  `--outfile=${path.join(APP, 'server/index.js')}`]);
const ver = (name) => JSON.parse(fs.readFileSync(path.join(ROOT, 'node_modules', name, 'package.json'), 'utf8')).version;
fs.writeFileSync(path.join(APP, 'package.json'), JSON.stringify({ name: 'agent-cy', version, private: true, type: 'module', dependencies: Object.fromEntries(EXTERNAL.map((x) => [x, ver(x)])) }, null, 2));

step('Bağımlılıklar (Windows x64) kuruluyor');
run('npm', ['install', '--omit=dev', '--no-audit', '--no-fund', '--no-package-lock', '--ignore-scripts', '--os=win32', '--cpu=x64'], { cwd: APP });
for (const need of ['@img/sharp-win32-x64', '@resvg/resvg-js-win32-x64-msvc']) {
  if (!fs.existsSync(path.join(APP, 'node_modules', need))) throw new Error(`${need} kurulmadı`);
}
// Çalışmada gerekmeyen dosyalar (belgeler, tip tanımları, kaynak haritaları, WebAssembly yedeği)
fs.rmSync(path.join(APP, 'node_modules/@img/sharp-wasm32'), { recursive: true, force: true });
const prune = (d) => {
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    const p = path.join(d, e.name);
    if (e.isDirectory()) prune(p);
    else if (/\.(md|markdown|d\.ts|d\.mts|d\.cts|map|flow)$/i.test(e.name) || /\.ts$/.test(e.name)) fs.rmSync(p);
  }
};
prune(path.join(APP, 'node_modules'));

step(`Node ${NODE_VERSION} (win-x64) indiriliyor`);
const zipName = `node-v${NODE_VERSION}-win-x64.zip`;
const zipPath = path.join(CACHE, zipName);
if (!fs.existsSync(zipPath)) {
  const r = await fetch(`https://nodejs.org/dist/v${NODE_VERSION}/${zipName}`);
  if (!r.ok) throw new Error(`Node indirilemedi: ${r.status}`);
  fs.writeFileSync(zipPath, Buffer.from(await r.arrayBuffer()));
}
fs.mkdirSync(path.join(PKG, 'runtime'), { recursive: true });
run('unzip', ['-o', '-j', '-q', zipPath, `node-v${NODE_VERSION}-win-x64/node.exe`, `node-v${NODE_VERSION}-win-x64/LICENSE`, '-d', path.join(PKG, 'runtime')]);

step('Agent-cy.exe derleniyor');
const launcher = path.join(ROOT, 'desktop/launcher');
const env = { ...process.env, GOOS: 'windows', GOARCH: 'amd64', CGO_ENABLED: '0' };
run(GO, ['run', 'github.com/tc-hib/go-winres@v0.3.3', 'simply', '--arch', 'amd64', '--icon', path.join(ROOT, 'assets/marka/agent-cy-ikon.png'),
  '--manifest', 'gui', '--product-name', 'Agent-cy', '--file-description', 'Agent-cy', '--product-version', version, '--file-version', version,
  '--copyright', `© ${new Date().getFullYear()} Agent-cy`, '--original-filename', 'Agent-cy.exe'], { cwd: launcher, env: { ...process.env } });
run(GO, ['build', '-trimpath', '-ldflags', '-s -w -H=windowsgui', '-o', path.join(PKG, 'Agent-cy.exe'), '.'], { cwd: launcher, env });
for (const f of fs.readdirSync(launcher)) if (f.endsWith('.syso')) fs.rmSync(path.join(launcher, f));

fs.writeFileSync(path.join(PKG, 'OKUBENI.txt'), `Agent-cy ${version} · Windows
=============================

KURULUM
1. Bu zip'in tamamını bir klasöre çıkar (ör. Belgeler veya Masaüstü). Zip'in içinden çalıştırma.
2. "Agent-cy.exe" dosyasına çift tıkla. Küçük bir pencere açılır, birkaç saniye sonra tarayıcıda Agent-cy gelir.
3. İlk açılışta Ayarlar ekranından Claude API anahtarını gir.

Windows "bilinmeyen yayımcı" uyarısı verirse: "Ek bilgi" → "Yine de çalıştır".

KULLANIM
- Agent-cy kendi uygulama penceresinde açılır (adres çubuğu yok; Microsoft Edge'in uygulama modu, Windows 10/11'de hazır gelir).
- İlk açılışta Masaüstü'ne ve Başlat menüsüne "Agent-cy" kısayolu eklenir; görev çubuğuna sabitleyebilirsin.
- Program yalnızca bu bilgisayarda çalışır (http://127.0.0.1), internete açılmaz. Pencereyi kapatınca Agent-cy de kapanır
  (süren bir iş varsa iş bitince kapanır).
- Agent-cy zaten açıkken yeniden tıklarsan yeni bir pencere açılır.

VERİLER
- Bütün veriler: Belgeler\\Agent-cy
  - firmalar\\<Firma adı>\\  →  01 Logolar, 02 Marka Dosyası, 03 Görseller, 04 Ürünler, 05 Mockuplar,
    06 Örnek Tasarımlar, 07 Logo Stüdyosu, 08 Web Klon, 09 İşler, 10 Diğer
  - db.json (kayıtlar), agent-cy.log (son açılışın günlüğü)
- Programın yeni sürümünü kurarken eski klasörü silebilirsin; veriler Belgeler\\Agent-cy'de kalır.
- Farklı bir veri klasörü için AGENT_CY_DATA ortam değişkenini tanımla.

WEB KLON (CLAUDE CODE)
- "Hızlı kopya" ve "Claude ile yeniden kur" ek kurulum istemez.
- "Claude Code (arka planda)" için bilgisayarda Claude Code kurulu olmalı:
  https://claude.com/claude-code  (kurulduktan sonra Agent-cy'yi yeniden aç)

İÇERİK
- Agent-cy.exe   başlatıcı (uygulama)
- runtime\\       taşınabilir Node.js ${NODE_VERSION}
- app\\           Agent-cy uygulaması

© ${new Date().getFullYear()} Agent-cy. Tüm hakları saklıdır.
`.replace(/\n/g, '\r\n'));

step('Zip hazırlanıyor');
const zipOut = path.join(OUT, 'Agent-cy-Windows.zip');
fs.rmSync(zipOut, { force: true });
run('zip', ['-r', '-q', '-9', zipOut, 'Agent-cy'], { cwd: OUT });
console.log(`\n✓ ${zipOut} (${(fs.statSync(zipOut).size / 1048576).toFixed(1)} MB)`);
