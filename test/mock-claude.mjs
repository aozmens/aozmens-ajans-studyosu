// Test için sahte Claude sunucusu (Messages API akış biçiminde yanıt verir).
// Kullanım: node test/mock-claude.mjs 3999  → Ayarlar'da API adresi http://localhost:3999
import http from 'node:http';

const svg = (w, h, title) => `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#101820"/><stop offset="1" stop-color="#2b3a55"/></linearGradient></defs><rect width="${w}" height="${h}" fill="url(#g)"/><text x="80" y="${Math.round(h * 0.4)}" font-family="Montserrat" font-weight="800" font-size="88" fill="#fff">${title}</text><text x="80" y="${Math.round(h * 0.4) + 70}" font-family="Inter" font-weight="300" font-size="36" fill="#cfd6e4">Şık, güçlü, ölçülü · ğüşiöç</text><image href="{{LOGO}}" x="${w - 260}" y="60" width="180" height="90"/></svg>`;

function reply(text) {
  const t = text;
  if (/Görevin: iş planı/.test(t)) {
    return 'Kısa değerlendirme: brif ve konsept yeterli.\n```json\n{"ozet":"Test planı","varsayimlar":["test"],"adimlar":[{"ajan":"musteri-temsilcisi","baslik":"Brif","gorev":"Brif yaz"},{"ajan":"kreatif-direktor","baslik":"Konsept","gorev":"Konsept yaz"},{"ajan":"seo-uzmani","baslik":"İlgisiz","gorev":"Olmamalı"}]}\n```';
  }
  if (/tasarlanacak içerik listesi/.test(t)) {
    return '```json\n[{"no":1,"tarih":"2026-11-02","gun":"Pazartesi","yayin_saati":"19:00","platform":"Instagram","format":"post","konu":"Lansman","gorsel_baslik":"Yeni Sezon","aciklama":"Merhaba","hashtagler":["#test"],"ai_gorsel_prompt":"coffee cup on marble"},{"no":2,"tarih":"2026-11-04","platform":"Instagram","format":"carousel","konu":"İpuçları","gorsel_baslik":"3 İpucu","slaytlar":[{"baslik":"3 İpucu","metin":"Kaydır"},{"baslik":"Bir","metin":"Su"},{"baslik":"Son","metin":"Takip et"}],"ai_gorsel_prompt":""}]\n```';
  }
  if (/Görevin: eskizi tara/.test(t)) {
    return '```json\n{"okuma":"Daire içinde bir fincan.","sorular":[{"id":"stil","soru":"Hangi stil?","secenekler":["Minimal","Holografik","Geometrik"],"coklu":false},{"id":"yazi","soru":"Yazı karakteri?","secenekler":["Serif","Sans"],"coklu":false}]}\n```';
  }
  if (/Logo SVG kuralları/.test(t) || /logo setini/.test(t) || /uygulama ikonu/i.test(t)) {
    const one = (i) => `### Konsept ${i}: Deneme ${i}\nGerekçe: Basit daire ve yazı.\n<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1000 1000" width="1000" height="1000"><circle cx="500" cy="400" r="200" fill="#C8102E"/><text x="500" y="800" text-anchor="middle" font-family="Montserrat" font-weight="800" font-size="120" letter-spacing="4" fill="#111">KAHVE ${i}</text></svg>`;
    return [1, 2, 3, 4].map(one).join('\n\n');
  }
  if (/SVG üretim kuralları/.test(t)) {
    const m = /width="(\d+)" height="(\d+)" viewBox/.exec(t);
    return svg(m ? +m[1] : 1080, m ? +m[2] : 1350, 'Yeni Sezon');
  }
  if (/Kalite kontrolü/.test(t)) return svg(1080, 1350, 'Kalite');
  if (/öğren\n|Görevin: öğren/.test(t)) return '```json\n{"firma":["Logo sağ üstte"],"ajanlar":{"grafik-tasarimci":["Başlık 6 kelimeyi geçmesin"]}}\n```';
  if (/Eğitilecek ajan/.test(t)) return '```json\n{"direktifler":["Yalnızca istenen kodu yaz; kullanılmayan yardımcı fonksiyon ekleme."],"yerine":[]}\n```';
  if (/ilham görselini tara/.test(t)) return '```json\n{"prompt":"moody cinematic product shot","styleSuffix":"cinematic moody lighting, 85mm","negative":"blurry","medium":"fotoğraf","style":"sinematik","lighting":"yan ışık","composition":"merkez","mood":"gizemli","palette":["#111111","#C8102E"],"tags":["kahve"]}\n```';
  if (/görsel üretim modeline gidecek tek bir/.test(t)) return '```json\n{"prompt":"a cup of coffee, cinematic","negative":"","aciklama":"birleştirdim"}\n```';
  if (/Bağlantı tamam/.test(t)) return 'Bağlantı tamam';
  return '## Çıktı\nBu bir test çıktısıdır.\n\n- madde 1\n- madde 2';
}

const flat = (content) => (typeof content === 'string' ? content : (content || []).map((b) => b.text || '').join('\n'));

http.createServer((req, res) => {
  let body = '';
  req.on('data', (c) => (body += c));
  req.on('end', () => {
    const j = JSON.parse(body || '{}');
    const last = j.messages?.[j.messages.length - 1];
    const sys = flat(j.system);
    const text = reply(sys + '\n' + flat(last?.content));
    res.writeHead(200, { 'content-type': 'text/event-stream' });
    const ev = (type, data) => res.write(`event: ${type}\ndata: ${JSON.stringify({ type, ...data })}\n\n`);
    ev('message_start', { message: { id: 'msg_test', type: 'message', role: 'assistant', model: j.model, content: [], stop_reason: null, usage: { input_tokens: 1200, output_tokens: 1, cache_read_input_tokens: 300, cache_creation_input_tokens: 0 } } });
    ev('content_block_start', { index: 0, content_block: { type: 'text', text: '' } });
    for (let i = 0; i < text.length; i += 400) ev('content_block_delta', { index: 0, delta: { type: 'text_delta', text: text.slice(i, i + 400) } });
    ev('content_block_stop', { index: 0 });
    ev('message_delta', { delta: { stop_reason: 'end_turn' }, usage: { output_tokens: Math.ceil(text.length / 3) } });
    ev('message_stop', {});
    res.end();
  });
}).listen(+process.argv[2] || 3999);
