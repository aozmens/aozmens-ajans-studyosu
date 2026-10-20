// Dışa aktarma: iş klasörü (ZIP) — metinler, içerik takvimi (CSV), tasarımlar boyut klasörlerinde PNG + SVG.
import fs from 'node:fs';
import path from 'node:path';
import { zipSync, strToU8 } from 'fflate';
import * as store from './store.js';
import * as render from './render.js';
import { FORMATS } from './jobTypes.js';

// Dosya adları için ASCII: Türkçe harfler sadeleştirilir (her sistemde sorunsuz açılsın)
const TR = { ç: 'c', Ç: 'c', ğ: 'g', Ğ: 'g', ı: 'i', I: 'i', İ: 'i', ö: 'o', Ö: 'o', ş: 's', Ş: 's', ü: 'u', Ü: 'u' };
export const slug = (s, n = 50) => String(s || '').replace(/[çÇğĞıIİöÖşŞüÜ]/g, (c) => TR[c]).toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, n);
export const safeName = (s) => (String(s || '').replace(/[<>:"/\\|?*\u0000-\u001f]/g, '_').trim().slice(0, 120) || 'dosya');

export function zip(rootName, files) {
  const tree = {};
  for (const [name, data] of Object.entries(files)) tree[`${safeName(rootName)}/${name}`] = typeof data === 'string' ? strToU8(data) : new Uint8Array(data);
  return Buffer.from(zipSync(tree, { level: 6 }));
}

const FOLDER = { post: 'Post (1080x1350)', kare: 'Kare (1080x1080)', story: 'Story (1080x1920)', linkedin: 'LinkedIn (1200x1200)', yatay: 'Yatay (1200x628)' };

export function designBaseName(d) {
  return `${String(d.no).padStart(2, '0')}_${d.tarih || ''}_${slug(d.platform, 20)}_${slug(d.gorsel_baslik || d.konu, 40)}`.replace(/_+/g, '_').replace(/_$/, '');
}

export function calendarCsv(job) {
  const tools = [...new Set(job.designs.flatMap((d) => Object.keys(d.arac_promptlari || {})))];
  const head = ['No', 'Tarih', 'Gün', 'Saat', 'Platform', 'Format', 'Boyutlar', 'Konu', 'Görsel başlık', 'Görsel alt metin', 'CTA', 'Paylaşım metni', 'Hashtagler', 'Görsel fikri', 'Carousel slaytları', 'AI görsel promptu', ...tools.map((t) => `${t} promptu`)];
  const rows = job.designs.map((d) => [
    d.no, d.tarih, d.gun, d.yayin_saati, d.platform, d.format, (d.variants || []).map((v) => `${v.width}x${v.height}`).join(' + '),
    d.konu, d.gorsel_baslik, d.gorsel_alt_metin, d.cta, d.aciklama, (d.hashtagler || []).join(' '), d.gorsel_fikri,
    (d.slaytlar || []).map((s, i) => `${i + 1}) ${s.baslik || ''}: ${s.metin || ''}`).join(' | '),
    d.ai_gorsel_prompt, ...tools.map((t) => d.arac_promptlari?.[t] || ''),
  ]);
  const cell = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  return '﻿' + [head, ...rows].map((r) => r.map(cell).join(';')).join('\r\n');
}

// only: 'designs' ise yalnızca tasarımlar
export function jobFiles(job, { only, png = true, svg = true } = {}) {
  const company = store.getCompany(job.companyId);
  const files = {};
  const warnings = [];
  if (only !== 'designs') {
    let n = 0;
    for (const s of job.steps) {
      if (s.status !== 'done' || !s.output || !['agent', 'followup'].includes(s.kind)) continue;
      n++;
      files[`metinler/${String(n).padStart(2, '0')}-${slug(s.agentLabel, 30)}-${slug(s.title, 40)}.md`] = `# ${s.title}\n\n_${s.agentLabel} · ${company?.name || ''} · ${job.title}_\n\n${s.output}\n`;
    }
    if (job.designs.length) files['icerik-takvimi.csv'] = calendarCsv(job);
    const u = job.usage || {};
    files['OZET.md'] = `# ${job.title}\n\n- Marka: ${company?.name || '-'}\n- Tarih: ${new Date(job.createdAt).toLocaleString('tr-TR')}\n- Tasarım: ${job.designs.length}\n- Token: ${u.input || 0} girdi · ${u.output || 0} çıktı · ${u.cacheRead || 0} önbellek okuma · ${u.cacheWrite || 0} önbellek yazma\n- Yaklaşık maliyet: $${((u.cost || 0) + (u.imageCost || 0)).toFixed(3)} (Claude $${(u.cost || 0).toFixed(3)} + görsel motoru $${(u.imageCost || 0).toFixed(3)})\n`;
  }
  for (const d of job.designs) {
    const base = designBaseName(d);
    for (const v of d.variants || []) {
      const folder = d.kind === 'carousel' ? `tasarimlar/Carousel/${base}${d.variants.length > 1 ? `/${FOLDER[v.key] || v.key}` : ''}` : `tasarimlar/${FOLDER[v.key] || v.key}`;
      v.frames.forEach((f, i) => {
        if (!f.svg) return;
        const name = d.kind === 'carousel' ? `slayt-${String(i + 1).padStart(2, '0')}` : base;
        try {
          const fin = render.finalize(f.svg, company);
          if (png) files[`${folder}/${name}.png`] = render.cachedPng(fin, v.width);
          if (svg) files[`${folder}/svg/${name}.svg`] = render.finalize(f.svg, company, { embedFonts: true });
        } catch (e) {
          warnings.push(`#${d.no} ${v.key}: ${e.message}`);
        }
      });
    }
    if (d.kind === 'carousel' && d.aciklama) files[`tasarimlar/Carousel/${base}/paylasim-metni.txt`] = `${d.aciklama}\n\n${(d.hashtagler || []).join(' ')}\n`;
    for (const fid of new Set(Object.values(d.aiImages || {}))) {
      const f = company?.files.find((x) => x.id === fid);
      if (f) try { files[`ai-gorseller/${base}.${f.file.split('.').pop()}`] = fs.readFileSync(store.assetPath(company.id, f.file)); } catch {}
    }
  }
  if (warnings.length) files['UYARILAR.txt'] = warnings.join('\n');
  return { name: `${company?.name || 'Marka'} - ${job.title}`, files };
}

export const formatLabel = (k) => FORMATS[k]?.label || k;

// Bitmiş işi markanın klasörüne yazar: "09 İşler/2026-11-02 Kasım sosyal medya/…" (PNG tasarımlar, metinler, takvim)
export function writeJobFolder(job) {
  const company = store.getCompany(job.companyId);
  if (!company) return null;
  const { files } = jobFiles(job, { svg: false });
  const rel = `${store.FOLDERS.jobs}/${store.safeName(`${job.createdAt.slice(0, 10)} ${job.title}`, 70)}`;
  const dir = store.assetDir(company.id, rel);
  for (const [name, data] of Object.entries(files)) {
    const p = path.join(dir, ...name.split('/'));
    fs.mkdirSync(path.dirname(p), { recursive: true });
    fs.writeFileSync(p, data);
  }
  const bb = job.brandBookId && company.brandBooks?.find((b) => b.id === job.brandBookId);
  if (bb) try { fs.copyFileSync(store.assetPath(company.id, bb.file), path.join(dir, path.basename(bb.file))); } catch {}
  return rel;
}

// Firma klasörünün tamamı (ZIP için): "Firma adı/01 Logolar/…" — türetilmiş kopyalar (.kopyalar) hariç
export function companyFolderFiles(cid) {
  const c = store.getCompany(cid);
  if (!c) throw new Error('Marka bulunamadı');
  const root = store.ownerDir(cid);
  const out = {};
  const walk = (d, rel) => {
    if (!fs.existsSync(d)) return;
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      if (e.name === '.kopyalar') continue;
      if (e.isDirectory()) walk(path.join(d, e.name), `${rel}${e.name}/`);
      else out[`${rel}${e.name}`] = fs.readFileSync(path.join(d, e.name));
    }
  };
  walk(root, '');
  return { name: c.folder || c.name, files: out };
}

// Klasör ağacı (arayüzde göstermek için): her alt klasördeki dosya sayısı ve boyutu
export function companyTree(cid) {
  const c = store.getCompany(cid);
  const root = store.ownerDir(cid);
  const folders = Object.values(store.FOLDERS).map((name) => {
    const d = path.join(root, name);
    const items = [];
    const walk = (dd, rel) => {
      if (!fs.existsSync(dd)) return;
      for (const e of fs.readdirSync(dd, { withFileTypes: true })) {
        if (e.name === '.kopyalar') continue;
        const p = path.join(dd, e.name);
        if (e.isDirectory()) walk(p, `${rel}${e.name}/`);
        else { const st = fs.statSync(p); items.push({ path: `${rel}${e.name}`, size: st.size, at: st.mtime.toISOString(), url: store.assetUrl(cid, `${name}/${rel}${e.name}`) }); }
      }
    };
    walk(d, '');
    items.sort((a, b) => b.at.localeCompare(a.at));
    return { name, count: items.length, size: items.reduce((n, x) => n + x.size, 0), items: items.slice(0, 200) };
  });
  return { root: path.resolve(root), folder: c?.folder, folders };
}
