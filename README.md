# Ajans Stüdyosu

Yapay zekâ ajanlarından oluşan dijital ajans: markalar, ilham arşivi, Logo Stüdyosu, aylık sosyal medya planları, post / story / carousel tasarımları, ajan eğitimi ve token takibi. Web uygulamasıdır; kendi subdomaininde çalışır ve GitHub `main` dalına gelen her değişiklik siteye otomatik yüklenir.

## Neler var

| İhtiyaç | Programda |
|---|---|
| Subdomainde çalışma, GitHub'dan otomatik güncelleme | Railway (ya da Docker çalıştıran herhangi bir sunucu) `main` dalını izler; push → derleme → yayın |
| İlham görsellerinden prompt | **İlham arşivi**: yüklenen her görsel taranır; prompt, stil eki, negatif prompt, ışık, kompozisyon, palet çıkarılır. **Görsel stüdyosu** bu promptlarla marka uyumlu görsel üretir |
| Logo eskiz alanı, vektör + PNG, uygulama ikonu | Marka → **Logo Stüdyosu**: eskiz çiz ya da fotoğrafını yükle → konseptler → revizyon / varyasyon → final set (tek renk, beyaz, yatay, sembol) → 2 uygulama ikonu. SVG'lerde yazılar yola çevrilir; ZIP'te PNG boyutları ve favicon.ico var |
| Eğitilebilir ajanlar | Her çıktıda **Ajanı eğit**; geri bildirim kalıcı direktiflere çevrilir. **Ajan ekibi**'nden direktif ekle / sil, sistem promptunu düzenle |
| Marka uyumu | **Markayı Öğren** (logo, görseller, örnek tasarımlar, site → marka profili) ve **İlham Al** (arşivden ilham bağla). Yeni işte ikisi de açılıp kapatılabilir |
| Token görünürlüğü | İş sayfasında toplam ve adım adım token / maliyet; **Token ve maliyet** ekranında günlük, ajan, marka ve model kırılımı |
| Higgsfield, Clipdrop… | Ayarlar → Entegrasyonlar: Clipdrop, fal.ai (Flux), OpenAI, Gemini, Higgsfield. Ajan ekibi'nden ajanlara bağlanır |
| Yalnızca ilgili ajanlar | Her iş türünün kendi ajan listesi var; yeni işte istemediğin ajanı kapatırsın |
| Klasör çıktısı | İş → **Klasör (ZIP)** ya da yalnızca **Tasarımlar**: `tasarimlar/Post (1080x1350)/`, `Story (1080x1920)/`, `Carousel/<içerik>/slayt-NN.png`, SVG'ler, metinler, içerik takvimi (CSV) |
| Post ve Story | Yeni işte boyutları seç; her tasarım hepsinde üretilir. Sonradan "Başka boyutta da üret" |
| Carousel | Yeni işte carousel sayısı ve slayt sayısı; revizyon tüm slaytlara ya da tek slayta |

## Yayına alma (Railway)

1. [railway.com](https://railway.com) → **New Project → Deploy from GitHub repo** → bu repoyu seç. `railway.json` ve `Dockerfile` hazır; başka ayar gerekmez.
2. Servise **Volume** ekle, bağlama yolu: `/data` (markalar, görseller, işler burada kalır; deploy'larda silinmez).
3. **Variables**:
   - `APP_PASSWORD`: siteye giriş şifresi (zorunlu önerilir)
   - `SESSION_SECRET`: uzun rastgele bir metin
   - `ANTHROPIC_API_KEY`: Claude API anahtarı (ya da sitede Ayarlar'dan gir)
   - `PUBLIC_URL`: `https://ajans.alanadin.com` (Higgsfield videoları için)
   - İsteğe bağlı: `CLIPDROP_API_KEY`, `FAL_KEY`, `OPENAI_API_KEY`, `GEMINI_API_KEY`, `HF_API_KEY`, `HF_API_SECRET`
4. **Settings → Networking → Custom Domain**: `ajans.alanadin.com` yaz; Railway'in verdiği CNAME kaydını alan adının DNS'ine ekle.
5. Bundan sonra `main`'e gelen her commit otomatik yayınlanır. Sürüm ve commit Ayarlar → Genel'de görünür.

Docker çalıştıran başka bir sunucuda: `docker build -t ajans . && docker run -p 3000:3000 -v ajans-data:/data -e APP_PASSWORD=… ajans`.

## Geliştirme

```bash
npm install && npm run build   # sunucu bağımlılıkları + arayüz derlemesi
npm run dev                    # API: http://localhost:3000
npm run dev:web                # arayüz (Vite): http://localhost:5173
npm test                       # sahte Claude ile uçtan uca test
```

Gerçek API harcamadan denemek için: `node test/mock-claude.mjs 3999`, sonra Ayarlar → Claude → API adresi `http://localhost:3999`.

## Yapı

```
server/        Express API, orkestrasyon, logo, marka öğrenme, görsel motorları, dışa aktarma
web/           React arayüz (Vite)
agents/        15 ajanın talimatları (Markdown + frontmatter)
assets/fonts/  Tasarımlarda kullanılan 14 yazı tipi ailesi (OFL)
test/          Uçtan uca test ve sahte Claude sunucusu
```

Veriler `DATA_DIR` (varsayılan `./data`, sunucuda `/data`) altında: `db.json` + `assets/<marka>/…`. Ayarlar → Genel → **Yedeği indir** hepsini tek ZIP yapar.
