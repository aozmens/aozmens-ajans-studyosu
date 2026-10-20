// Müşterinin renk ve yazı tipi seçim sayfası (şifresiz, imzalı bağlantı). Müşteri hazır kartelalardan birini ya da
// kendi renklerini, bir yazı tipi eşleşmesini seçer; seçim markaya "müşterinin seçimi" olarak kaydedilir.
import * as render from './render.js';
import { PALETTES, FONT_PAIRS } from './palettes.js';

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

export function page(c, { logoUrl, agencyName, token }) {
  const fonts = render.fonts();
  const faces = fonts.map((f) => f.faces.filter((x) => [400, 700, 800].includes(x.weight) || f.faces.length === 1).map((x) => `@font-face{font-family:'${f.family}';font-weight:${x.weight};src:url(/fonts/${x.file}) format('truetype');font-display:swap}`).join('')).join('');
  const brand = (c.palette || []).map((p) => p.hex);
  const data = { palettes: [...(brand.length ? [['Mevcut marka renkleri', brand]] : []), ...PALETTES], pairs: FONT_PAIRS, current: { palette: brand, heading: c.fontHeading || '', body: c.fontBody || '' } };
  return `<!doctype html>
<html lang="tr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(c.name)} · Renk ve yazı tipi seçimi</title>
<style>${faces}
:root{--ink:#16161c;--muted:#6b6b76;--line:#e6e6ec;--bg:#f7f7f9;--card:#fff;--acc:#5b4cf0}
@media (prefers-color-scheme:dark){:root{--ink:#f2f2f5;--muted:#a0a0ab;--line:#2c2c35;--bg:#111115;--card:#1a1a20}}
*{box-sizing:border-box}body{margin:0;font-family:Inter,system-ui,sans-serif;background:var(--bg);color:var(--ink)}
.wrap{max-width:980px;margin:0 auto;padding:28px 16px 120px}
header{display:flex;gap:16px;align-items:center;margin-bottom:22px}header img{width:64px;height:64px;object-fit:contain;border-radius:14px;background:#fff;border:1px solid var(--line)}
h1{font-size:24px;margin:0}h2{font-size:16px;margin:28px 0 10px}.muted{color:var(--muted);font-size:14px}
.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(170px,1fr));gap:10px}
.card{background:var(--card);border:1px solid var(--line);border-radius:14px;padding:12px;cursor:pointer;text-align:left;font:inherit;color:inherit}
.card.on{outline:2px solid var(--acc);outline-offset:1px}
.sw{display:flex;height:34px;border-radius:8px;overflow:hidden;margin-bottom:8px;border:1px solid var(--line)}.sw span{flex:1}
.custom{display:flex;gap:8px;flex-wrap:wrap;align-items:center}.custom input[type=color]{width:44px;height:44px;border:1px solid var(--line);border-radius:10px;padding:2px;background:var(--card)}
.pair b{display:block;font-size:22px;line-height:1.1;margin-bottom:4px}.pair span{font-size:13px;color:var(--muted)}
textarea{width:100%;min-height:80px;border-radius:12px;border:1px solid var(--line);background:var(--card);color:var(--ink);padding:10px;font:inherit}
.bar{position:fixed;left:0;right:0;bottom:0;background:var(--card);border-top:1px solid var(--line);padding:12px 16px}
.bar .in{max-width:980px;margin:0 auto;display:flex;gap:12px;align-items:center;justify-content:space-between;flex-wrap:wrap}
button.main{background:var(--acc);color:#fff;border:0;border-radius:12px;padding:12px 20px;font:600 15px Inter,sans-serif;cursor:pointer}
button.ghost{background:none;border:1px solid var(--line);border-radius:10px;padding:8px 12px;color:inherit;cursor:pointer;font:inherit}
.ok{background:#e8f7ee;color:#11612f;border-radius:12px;padding:14px;margin-top:16px;display:none}
</style></head><body><div class="wrap">
<header>${logoUrl ? `<img src="${esc(logoUrl)}" alt="">` : ''}<div><h1>${esc(c.name)}</h1><div class="muted">${esc(agencyName)} sizin için hazırlıyor. Markanızın renklerini ve yazı tiplerini seçin.</div></div></header>
<h2>1. Renk kartelası</h2><div class="muted" style="margin-bottom:10px">Hazır bir kartela seçin ya da aşağıdan kendi renklerinizi belirleyin.</div>
<div class="grid" id="pal"></div>
<h2>Kendi renkleriniz</h2><div class="custom" id="custom"></div>
<h2>2. Yazı tipleri</h2><div class="grid" id="pairs"></div>
<h2>3. Notunuz (isteğe bağlı)</h2><textarea id="note" placeholder="ör. Ana renk lacivert olsun, turuncu vurgu istemiyoruz"></textarea>
<div class="ok" id="ok">Teşekkürler, seçiminiz ajansa iletildi.</div>
</div>
<div class="bar"><div class="in"><span class="muted" id="sum"></span><button class="main" id="send">Seçimi gönder</button></div></div>
<script>
const D=${JSON.stringify(data).replace(/</g, '\\u003c')};
let colors=[...D.current.palette];let pair=[D.current.heading,D.current.body];
const $=(id)=>document.getElementById(id);
function same(a,b){return a.length===b.length&&a.every((x,i)=>x.toUpperCase()===b[i].toUpperCase())}
function draw(){
 $('pal').innerHTML=D.palettes.map(([n,l],i)=>'<button class="card'+(same(colors,l)?' on':'')+'" data-i="'+i+'"><div class="sw">'+l.map(h=>'<span style="background:'+h+'"></span>').join('')+'</div><b style="font-size:14px">'+n+'</b></button>').join('');
 $('custom').innerHTML=colors.map((h,i)=>'<span style="display:inline-flex;flex-direction:column;align-items:center;gap:4px"><input type="color" value="'+(h.length===7?h:'#000000')+'" data-c="'+i+'"><button class="ghost" data-x="'+i+'" style="padding:2px 8px;font-size:12px">sil</button></span>').join('')+(colors.length<6?'<button class="ghost" id="add">+ Renk ekle</button>':'');
 $('pairs').innerHTML=D.pairs.map(([h,b],i)=>'<button class="card pair'+(pair[0]===h&&pair[1]===b?' on':'')+'" data-p="'+i+'"><b style="font-family:\\''+h+'\\';font-weight:800">'+h+'</b><span style="font-family:\\''+b+'\\'">'+b+' · Gövde metni böyle görünür.</span></button>').join('');
 $('sum').textContent=(colors.length?colors.join(' '):'Renk seçilmedi')+' · '+(pair[0]?pair[0]+' + '+pair[1]:'Yazı tipi seçilmedi');
}
document.addEventListener('click',(e)=>{const t=e.target.closest('[data-i],[data-p],[data-x],#add');if(!t)return;
 if(t.dataset.i)colors=[...D.palettes[+t.dataset.i][1]];
 if(t.dataset.p)pair=[...D.pairs[+t.dataset.p]];
 if(t.dataset.x)colors.splice(+t.dataset.x,1);
 if(t.id==='add')colors.push('#888888');
 draw();});
document.addEventListener('input',(e)=>{if(e.target.dataset.c){colors[+e.target.dataset.c]=e.target.value.toUpperCase();$('sum').textContent=colors.join(' ')}});
document.addEventListener('change',(e)=>{if(e.target.dataset.c)draw()});
$('send').onclick=async()=>{const r=await fetch(location.pathname,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({palette:colors,fontHeading:pair[0],fontBody:pair[1],note:$('note').value})});
 if(r.ok){$('ok').style.display='block';$('ok').scrollIntoView({behavior:'smooth'})}else alert('Gönderilemedi, bağlantının süresi dolmuş olabilir.')};
draw();
</script></body></html>`;
}
