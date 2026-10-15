// agents/*.md dosyalarını yükler. Kullanıcının programdan yaptığı talimat düzenlemeleri veritabanında durur,
// orijinal dosya (GitHub'daki) bozulmaz.
import fs from 'node:fs';
import path from 'node:path';
import * as store from './store.js';

export const LABELS = {
  'ajans-yoneticisi': 'Ajans Yöneticisi',
  'musteri-temsilcisi': 'Müşteri Temsilcisi',
  'proje-yoneticisi': 'Proje Yöneticisi',
  'dijital-pazarlama-stratejisti': 'Dijital Pazarlama Stratejisti',
  'performans-pazarlama-uzmani': 'Performans Pazarlama Uzmanı',
  'seo-uzmani': 'SEO Uzmanı',
  'sosyal-medya-uzmani': 'Sosyal Medya Uzmanı',
  'icerik-yazari': 'İçerik Yazarı',
  'kreatif-direktor': 'Kreatif Direktör',
  'grafik-tasarimci': 'Grafik Tasarımcı',
  'video-editor': 'Video Editör',
  'ui-ux-tasarimci': 'UI/UX Tasarımcı',
  'frontend-gelistirici': 'Front-end Geliştirici',
  'backend-gelistirici': 'Back-end Geliştirici',
  'veri-analitik-uzmani': 'Veri ve Analitik Uzmanı',
};

export const GROUPS = [
  ['Yönetim', ['ajans-yoneticisi', 'musteri-temsilcisi', 'proje-yoneticisi']],
  ['Strateji ve pazarlama', ['dijital-pazarlama-stratejisti', 'performans-pazarlama-uzmani', 'sosyal-medya-uzmani', 'seo-uzmani', 'veri-analitik-uzmani']],
  ['Kreatif', ['kreatif-direktor', 'icerik-yazari', 'grafik-tasarimci', 'video-editor']],
  ['Ürün ve teknoloji', ['ui-ux-tasarimci', 'frontend-gelistirici', 'backend-gelistirici']],
];

let originals = {};

function parse(text) {
  const m = /^---\n([\s\S]*?)\n---\n?([\s\S]*)$/.exec(text.replace(/\r\n/g, '\n'));
  if (!m) return { meta: {}, body: text };
  const meta = {};
  for (const line of m[1].split('\n')) {
    const i = line.indexOf(':');
    if (i > 0) meta[line.slice(0, i).trim()] = line.slice(i + 1).trim();
  }
  return { meta, body: m[2].trim() };
}

export function init(dir) {
  originals = {};
  for (const f of fs.readdirSync(dir).filter((x) => x.endsWith('.md'))) {
    const { meta, body } = parse(fs.readFileSync(path.join(dir, f), 'utf8'));
    const name = meta.name || f.replace(/\.md$/, '');
    originals[name] = { name, description: meta.description || '', body };
  }
}

export function get(name) {
  const o = originals[name];
  if (!o) return null;
  const ov = store.agentOverrides()[name];
  return { name, label: LABELS[name] || name, description: o.description, original: o.body, prompt: ov || o.body, edited: !!ov };
}

export function list() {
  return Object.keys(originals)
    .map(get)
    .sort((a, b) => (a.name === 'ajans-yoneticisi' ? -1 : b.name === 'ajans-yoneticisi' ? 1 : a.label.localeCompare(b.label, 'tr')));
}

export const names = () => Object.keys(originals);
