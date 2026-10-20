# Agent-cy: çalışma notları

- Arayüz ve bütün metinler Türkçe. Kullanıcı Alperen; açıklamalar sade Türkçe.
- Sunucu: `server/` (Node 22, ESM, Express 4). Arayüz: `web/` (React 18 + Vite). `npm run build` arayüzü `web/dist`'e derler, sunucu onu sunar.
- Yayın: `main` dalı → Railway (Dockerfile) otomatik deploy. Veriler kalıcı diskte (`/data`); kod değişikliği veriye dokunmaz. Veri yapısı değişirse `store.js` → `init` / `migrateCompany` içinde geriye uyumlu göç yaz.
- Claude çağrıları yalnızca `server/claude.js` → `call()` üzerinden; kullanım (token, maliyet) orada günlüğe yazılır. Bir işe ait çağrıda `addUsage(job, r.usage, step)` unutulmasın.
- İş türleri ve her türde çalışacak ajanlar: `server/jobTypes.js`. Ajan talimatları: `agents/*.md`.
- Tasarım ölçüleri `FORMATS` (jobTypes.js); dışa aktarma klasörleri `server/export.js`.
- Değişiklikten sonra `npm run build && npm test` (sahte Claude ile uçtan uca) geçmeli.
