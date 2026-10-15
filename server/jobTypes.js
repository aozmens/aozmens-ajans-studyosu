// Hazır iş türleri. "agents": bu işte çalışabilecek ajanlar (yalnızca bunlar plana girer; ilgisiz ajanlar çalışmaz).
// "hint": yöneticiye önerilen akış. "fallback": plan okunamazsa kullanılacak yedek plan.
export const JOB_TYPES = {
  'sosyal-medya-aylik': {
    label: 'Aylık sosyal medya içerik planı + tasarımlar',
    icon: 'calendar', desc: 'Takvim, metinler ve tüm tasarımlar',
    designs: true, postCount: 16,
    agents: ['musteri-temsilcisi', 'dijital-pazarlama-stratejisti', 'kreatif-direktor', 'sosyal-medya-uzmani', 'icerik-yazari'],
    hint: 'musteri-temsilcisi (brif) → dijital-pazarlama-stratejisti (sosyal medya stratejisi ve içerik sütunları) → kreatif-direktor (konsept, görsel dil, renk ve tipografi) → sosyal-medya-uzmani (gün gün aylık içerik takvimi: tarih, saat, platform, format, konu, görsel fikri) → icerik-yazari (her gönderinin paylaşım metni ve hashtagleri).',
    fallback: [
      { ajan: 'musteri-temsilcisi', baslik: 'Brif', gorev: 'Firma bilgileri ve müşteri isteklerinden yapılandırılmış bir sosyal medya brifi hazırla: amaç, hedef kitle, ton, kısıtlar, başarı ölçütleri.' },
      { ajan: 'dijital-pazarlama-stratejisti', baslik: 'Sosyal medya stratejisi', gorev: 'Brife göre aylık sosyal medya stratejisi hazırla: hedefler, KPI, içerik sütunları ve oranları, platform rolleri, paylaşım sıklığı.' },
      { ajan: 'kreatif-direktor', baslik: 'Konsept ve görsel dil', gorev: 'Ay boyunca kullanılacak kreatif konsepti, ana mesajı ve görsel dili belirle: renk paleti (HEX), tipografi, kompozisyon kuralları, görsel öğeler, yapılacaklar ve yapılmayacaklar.' },
      { ajan: 'sosyal-medya-uzmani', baslik: 'Aylık içerik takvimi', gorev: 'Strateji ve konsepte göre gün gün aylık içerik takvimini tablo olarak hazırla: tarih, gün, saat, platform, format, içerik sütunu, konu, görsel fikri, paylaşım metni, hashtagler.' },
    ],
  },
  'tasarim': {
    label: 'Hızlı tasarım (post, story, carousel)',
    icon: 'image', desc: 'Birkaç tasarım; plan ve strateji olmadan',
    designs: true, postCount: 3, quick: true,
    agents: ['kreatif-direktor', 'icerik-yazari'],
    hint: 'Kısa iş: gerekiyorsa kreatif-direktor (görsel yön) → icerik-yazari (görsel üstü metinler). Çoğu zaman tek adım yeterli.',
    fallback: [
      { ajan: 'kreatif-direktor', baslik: 'Görsel yön', gorev: 'Talebe göre tasarımların görsel yönünü kısaca belirle: ana mesaj, kompozisyon, renk ve tipografi kararları.' },
    ],
  },
  'reklam-kampanyasi': {
    label: 'Reklam kampanyası (strateji + reklam görselleri)',
    icon: 'megaphone', desc: 'Strateji, metin ve reklam görselleri',
    designs: true, postCount: 6,
    agents: ['musteri-temsilcisi', 'dijital-pazarlama-stratejisti', 'kreatif-direktor', 'performans-pazarlama-uzmani', 'icerik-yazari', 'veri-analitik-uzmani'],
    hint: 'musteri-temsilcisi (brif) → dijital-pazarlama-stratejisti (kampanya stratejisi) → kreatif-direktor (konsept) → performans-pazarlama-uzmani (kampanya kurulumu, bütçe dağılımı, hedefleme) → icerik-yazari (reklam metinleri) → veri-analitik-uzmani (ölçümleme planı).',
    fallback: [
      { ajan: 'dijital-pazarlama-stratejisti', baslik: 'Kampanya stratejisi', gorev: 'Kampanya hedefi, hedef kitle, kanal karışımı, bütçe dağılımı ve KPI içeren bir kampanya stratejisi hazırla.' },
      { ajan: 'kreatif-direktor', baslik: 'Kampanya konsepti', gorev: 'Kampanyanın ana fikri, sloganı ve görsel dilini belirle.' },
      { ajan: 'performans-pazarlama-uzmani', baslik: 'Reklam kurulumu', gorev: 'Meta ve Google Ads için kampanya yapısı, hedefleme, bütçe ve reklam metinlerini hazırla.' },
    ],
  },
  'video': {
    label: 'Reels / video içerikleri',
    icon: 'play', desc: 'Senaryo, storyboard ve video promptları',
    designs: false,
    agents: ['kreatif-direktor', 'video-editor', 'icerik-yazari', 'sosyal-medya-uzmani'],
    hint: 'kreatif-direktor (fikir) → video-editor (saniye saniye storyboard, AI video promptları) → icerik-yazari (altyazı ve caption).',
    fallback: [
      { ajan: 'video-editor', baslik: 'Storyboard', gorev: 'Talebe göre kısa video senaryoları ve saniye saniye storyboard hazırla; her sahne için AI video promptu yaz.' },
    ],
  },
  'seo': {
    label: 'SEO denetimi ve içerik planı',
    icon: 'trending', desc: 'Denetim, anahtar kelime ve içerik planı',
    designs: false,
    agents: ['seo-uzmani', 'icerik-yazari', 'veri-analitik-uzmani'],
    hint: 'seo-uzmani (site denetimi, anahtar kelime araştırması) → icerik-yazari (blog içerik planı ve örnek yazı) → veri-analitik-uzmani (takip planı).',
    fallback: [
      { ajan: 'seo-uzmani', baslik: 'SEO denetimi', gorev: 'Web sitesi metnine ve firma bilgilerine göre teknik ve içerik SEO denetimi, anahtar kelime önerileri ve öncelikli aksiyon listesi hazırla.' },
      { ajan: 'icerik-yazari', baslik: 'İçerik planı', gorev: 'SEO önerilerine göre 3 aylık blog içerik planı ve bir örnek blog yazısı hazırla.' },
    ],
  },
  'marka-kimligi': {
    label: 'Marka kimliği (konumlandırma, ses, görsel yön)',
    icon: 'pen', desc: 'Konsept, palet, slogan; logo için Logo Stüdyosu',
    designs: false,
    agents: ['musteri-temsilcisi', 'kreatif-direktor', 'icerik-yazari', 'dijital-pazarlama-stratejisti'],
    hint: 'musteri-temsilcisi (brif) → kreatif-direktor (marka konumlandırması, kişilik, görsel kimlik yönleri) → icerik-yazari (slogan ve marka sesi).',
    fallback: [
      { ajan: 'kreatif-direktor', baslik: 'Görsel kimlik yönleri', gorev: 'Marka kişiliği, 3 alternatif görsel kimlik yönü, renk paleti ve tipografi önerisi hazırla.' },
      { ajan: 'icerik-yazari', baslik: 'Marka sesi', gorev: 'Slogan alternatifleri ve marka sesi rehberi hazırla.' },
    ],
  },
  'web-sitesi': {
    label: 'Web sitesi / landing page',
    icon: 'code', desc: 'Yapı, metinler ve sayfa kodu',
    designs: false,
    agents: ['musteri-temsilcisi', 'ui-ux-tasarimci', 'icerik-yazari', 'frontend-gelistirici', 'seo-uzmani', 'backend-gelistirici'],
    hint: 'musteri-temsilcisi (brif) → ui-ux-tasarimci (site haritası, wireframe) → icerik-yazari (sayfa metinleri) → frontend-gelistirici (HTML/CSS kodu) → seo-uzmani (SEO kontrol).',
    fallback: [
      { ajan: 'ui-ux-tasarimci', baslik: 'Wireframe', gorev: 'Site haritası ve ana sayfa wireframe tarifi hazırla.' },
      { ajan: 'icerik-yazari', baslik: 'Sayfa metinleri', gorev: 'Ana sayfa ve önemli sayfaların metinlerini yaz.' },
      { ajan: 'frontend-gelistirici', baslik: 'Landing page kodu', gorev: 'Tek dosyalık, mobil uyumlu bir landing page HTML/CSS kodu yaz.' },
    ],
  },
  'serbest': {
    label: 'Serbest iş (yönetici planlasın)',
    icon: 'message', desc: 'İsteğini yaz, yönetici planlasın',
    designs: false,
    agents: null, // hepsi
    hint: 'İşin niteliğine göre gerekli ajanları seç; küçük işlerde tek ajan yeterli olabilir.',
    fallback: [
      { ajan: 'musteri-temsilcisi', baslik: 'Brif ve öneri', gorev: 'Talebi analiz et, brif ve uygulanabilir bir öneri hazırla.' },
    ],
  },
};

// Tasarım ölçüleri (format anahtarı → piksel)
export const FORMATS = {
  post: { label: 'Post (4:5)', w: 1080, h: 1350 },
  kare: { label: 'Kare (1:1)', w: 1080, h: 1080 },
  story: { label: 'Story / Reels (9:16)', w: 1080, h: 1920 },
  linkedin: { label: 'LinkedIn (1:1)', w: 1200, h: 1200 },
  yatay: { label: 'Yatay (1.91:1)', w: 1200, h: 628 },
};
