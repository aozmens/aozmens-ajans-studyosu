// Dışa aktarma: iş klasörü (ZIP) — metinler, içerik takvimi (CSV), tasarımlar boyut klasörlerinde PNG + SVG.
import fs from 'node:fs';
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
