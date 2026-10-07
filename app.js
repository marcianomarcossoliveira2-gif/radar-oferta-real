const LOCAL_IMAGES={"https://http2.mlstatic.com/D_NQ_NP_981459-MLA117136184907_092026-F.jpg":"images/MLB30144703-a21c1ed1c4.webp","https://http2.mlstatic.com/D_NQ_NP_707426-MLU72340464209_102023-F.jpg":"images/MLB19802405-a4f1802ab5.webp","https://http2.mlstatic.com/D_NQ_NP_835659-MLA116548375638_092026-F.jpg":"images/MLB50181290-fe4475bb76.webp","https://http2.mlstatic.com/D_NQ_NP_715678-MLU78765136521_082024-F.jpg":"images/MLB39962085-7563b69464.webp","https://http2.mlstatic.com/D_NQ_NP_681126-MLA115545993062_082026-F.jpg":"images/MLB25371983-9956128aa0.webp","https://http2.mlstatic.com/D_NQ_NP_894333-MLA115546000124_082026-F.jpg":"images/MLB47944518-2aa277f269.webp"};
const API="https://llgaeuvtrcpcvrcxkvpz.supabase.co/functions/v1/radar-client-offers";
const $=s=>document.querySelector(s);
const cards=$("#cards"),q=$("#q"),category=$("#category"),days=$("#days"),discount=$("#discount"),maxPrice=$("#maxPrice"),coupon=$("#coupon"),official=$("#official"),count=$("#count"),statusEl=$("#status");
let offers=[],timer=null,requestId=0,loadState="loading",activeController;
const money=v=>v==null||!Number.isFinite(Number(v))?"—":Number(v).toLocaleString("pt-BR",{style:"currency",currency:"BRL"});
const esc=s=>String(s??"").replace(/[&<>"\']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","\'":"&#39;"}[c]));
function categoryOf(o){const id=String(o.category_id||"").toUpperCase(),t=String(o.title||"").toLowerCase();if(/TOOLS|DRILLS|SCREW|SAWS|GRINDERS|WRENCH|TOOL/.test(id)||/furadeira|parafusadeira|serra|esmerilhadeira|ferramenta|chave/.test(t))return"Ferramentas";if(/CELLPHONES|HEADPHONES|GAMEPADS|COMPUT|ELECTRON|CHARGERS/.test(id)||/celular|fone|controle|power bank|notebook|smartphone|bluetooth|starlink/.test(t))return"Tecnologia";if(/VEHICLE|AUTOMOT|CAR_/.test(id)||/automot|vonixx|carro|shampoo/.test(t))return"Automotivo";return"Outros";}
function images(o){const a=[o.thumbnail,o.image_url,o.imageUrl,o.image,o.photo_url,o.photo,o.product_image,o.picture];if(Array.isArray(o.images))a.push(o.images[0]);if(Array.isArray(o.pictures)&&o.pictures[0])a.push(o.pictures[0].secure_url||o.pictures[0].url);return [...new Set(a.filter(x=>typeof x==="string"&&/^https?:\/\//.test(x)).flatMap(url=>LOCAL_IMAGES[url]?[LOCAL_IMAGES[url],url]:[url]))];}
function safeUrl(value){try{const u=new URL(value);return u.protocol==="https:"&&!u.username&&!u.password?u.href:""}catch{return ""}}
function linkOf(o){return safeUrl(o.affiliate_url)}
function attachImages(){
 document.querySelectorAll("img[data-images]").forEach(img=>{
  let list=[];try{list=JSON.parse(img.dataset.images||"[]")}catch{}
  let i=0;
  img.onerror=()=>{if(list[++i])img.src=list[i];else{const p=img.closest(".photo-wrap");if(p)p.innerHTML='<div class="placeholder" role="img" aria-label="Foto indisponível">📦<small>Foto indisponível</small></div>'}};
  if(img.complete&&!img.naturalWidth)img.onerror();
 });
}
function renderOffers(){const cat=category.value;const data=offers.filter(o=>!cat||categoryOf(o)===cat);let out="";if(data.length){for(const [index,o] of data.entries()){const catName=categoryOf(o),imgs=images(o),url=linkOf(o),disc=Number(o.discount_pct||0);let secondary="Preço atual monitorado";if(o.coupon_final_price&&Number(o.coupon_final_price)<Number(o.price))secondary="Com cupom "+money(o.coupon_final_price);else if(o.affiliate_landing_price&&o.affiliate_price_verified)secondary="Preço validado no link "+money(o.affiliate_landing_price);const facts=[o.rating?"★ "+Number(o.rating).toFixed(1):"",o.review_count?Number(o.review_count).toLocaleString("pt-BR")+" avaliações":"",o.sold_quantity?Number(o.sold_quantity).toLocaleString("pt-BR")+" vendidos":"",o.official_store?"Loja oficial":""].filter(Boolean).join(" · ");out+='<article class="card"><div class="photo-wrap"'+(url?' data-url="'+esc(url)+'"':"")+'>'+(imgs.length?'<img src="'+esc(imgs[0])+'" alt="'+esc(o.title)+'" loading="'+(index<2?"eager":"lazy")+'" fetchpriority="'+(index<2?"high":"auto")+'" decoding="async" width="600" height="600" referrerpolicy="no-referrer" data-images=\''+esc(JSON.stringify(imgs))+'\'>':'<div class="placeholder">📦</div>')+'</div><div class="body"><span class="tag">'+esc(catName)+'</span><div class="title">'+esc(o.title)+'</div><div class="price">'+money(o.price)+'</div><div class="subprice">'+esc(secondary)+'</div>'+(facts?'<div class="facts">'+esc(facts)+'</div>':"")+'<div class="metrics"><div class="metric"><b>'+money(o.history_min_90d)+'</b><span>Mínima 90d</span></div><div class="metric"><b>'+money(o.history_median_90d)+'</b><span>Mediana 90d</span></div><div class="metric"><b>'+money(o.history_max_90d)+'</b><span>Máxima 90d</span></div></div><div class="below '+(disc>0?"":"neutral")+'">'+(disc>0?disc.toFixed(1)+"% abaixo da mediana de 90 dias":"Sem desconto relevante sobre a mediana")+'</div>'+(o.coupon_code?'<div class="couponline">Cupom: '+esc(o.coupon_code)+'</div>':"")+(url?'<div class="offer-actions"><a class="cta" href="'+esc(url)+'" target="_blank" rel="noopener noreferrer">Ver oferta</a><button class="share" type="button" data-share="'+esc(offerId(o))+'"><span aria-hidden="true">↗</span> Compartilhar</button></div>':'<span class="cta disabled">Link afiliado em validação</span>')+'<button class="favorite" data-favorite="'+esc(offerId(o))+'" aria-pressed="'+favorites.some(f=>f.id===offerId(o))+'">'+(favorites.some(f=>f.id===offerId(o))?'♥ Salvo nos favoritos':'♡ Salvar favorito')+'</button></div></article>';}}else out='<div class="empty"><strong>Nenhuma oferta encontrada com esses filtros.</strong><br><small>O Radar mostra apenas produtos com avaliação mínima 4,5★ e pelo menos 30 avaliações.</small></div>';cards.innerHTML=out;count.textContent=data.length+" oferta"+(data.length===1?"":"s")+" validada"+(data.length===1?"":"s");attachImages();document.querySelectorAll(".photo-wrap[data-url]").forEach(el=>el.onclick=()=>window.open(el.dataset.url,"_blank","noopener,noreferrer"));}

const FAVORITES_KEY="radar.favorites.v1";
let favorites=readFavorites(),view="offers",installPrompt;
function offerId(o){return String(o.item_id||o.product_id||o.offer_item_id||linkOf(o)||o.title)}
function readFavorites(){try{const v=JSON.parse(localStorage.getItem(FAVORITES_KEY)||"[]");return Array.isArray(v)?v.filter(f=>f&&typeof f.id==="string"&&typeof f.title==="string").slice(0,200):[]}catch{return []}}
function notice(text){$("#message").textContent=text;$("#message").classList.toggle("hidden",!text)}
async function shareOffer(o){
  const url=linkOf(o);if(!url)return notice("Esta oferta ainda não tem link validado para compartilhar.");
  const disc=Number(o.discount_pct||0);
  const parts=["🔥 "+o.title,"💰 Preço: "+money(o.price),disc>0?"📉 "+disc.toFixed(1)+"% abaixo da mediana de 90 dias":"","🔗 "+url];
  if(o.coupon_code)parts.splice(3,0,"🎟️ Cupom: "+o.coupon_code);
  const text=parts.filter(Boolean).join("\n");
  const src=images(o)[0]||"";
  try{
    if(src&&navigator.share&&navigator.canShare){
      const imageUrl=new URL(src,location.href).href;
      const response=await fetch(imageUrl,{cache:"no-store"});
      if(response.ok){
        const blob=await response.blob();
        if(blob.type.startsWith("image/")){
          const ext=blob.type.includes("png")?"png":blob.type.includes("webp")?"webp":"jpg";
          const file=new File([blob],"oferta-"+offerId(o)+"."+ext,{type:blob.type});
          const payload={title:o.title,text,files:[file]};
          if(navigator.canShare(payload)){await navigator.share(payload);return}
        }
      }
    }
    if(navigator.share){await navigator.share({title:o.title,text,url});return}
    await navigator.clipboard.writeText(text);notice("Oferta completa copiada para compartilhar.");
  }catch(e){
    if(e&&e.name==="AbortError")return;
    try{
      if(navigator.share){await navigator.share({title:o.title,text,url});return}
      await navigator.clipboard.writeText(text);notice("Oferta copiada para compartilhar.");
    }catch{notice("Não foi possível abrir o compartilhamento neste navegador.")}
  }
}
function render(){
  if(loadState==="ready")renderOffers();
  else{
    count.textContent=loadState==="loading"?"Buscando ofertas reais…":"Ofertas indisponíveis";
    cards.innerHTML='<div class="empty">'+(loadState==="loading"?"Consultando ofertas…":"Não foi possível consultar os preços. Verifique sua conexão e toque em Atualizar ofertas.")+'</div>';
  }
  $("#favoriteCards").innerHTML=favorites.length?favorites.map(f=>{
    const o=loadState==="ready"&&offers.find(o=>offerId(o)===f.id);
    const url=o&&linkOf(o);
    return '<article class="card"><div class="body"><h3 class="title">'+esc(f.title)+'</h3>'+(o?'<div class="price">'+money(o.price)+'</div>'+(url?'<a class="cta" href="'+esc(url)+'" target="_blank" rel="noopener noreferrer">Ver oferta</a>':""):'<p class="muted">'+(loadState==="ready"?"Fora da lista atual de ofertas elegíveis. Preço indisponível.":"Conecte-se e atualize as ofertas para conferir o preço.")+'</p>')+'<button class="favorite" data-favorite="'+esc(f.id)+'">Remover dos favoritos</button></div></article>';
  }).join(""):'<div class="empty">Você ainda não salvou favoritos. Toque em Salvar favorito em uma oferta.</div>';
}
async function load(){
  const id=++requestId;activeController?.abort();const controller=new AbortController();activeController=controller;
  const timeout=setTimeout(()=>controller.abort(),20000);
  loadState="loading";offers=[];render();statusEl.className="status";statusEl.textContent="● Atualizando";
  const p=new URLSearchParams();
  if(q.value.trim())p.set("q",q.value.trim());
  p.set("days",days.value||"1");
  p.set("min_discount",discount.value||"0");
  if(maxPrice.value)p.set("max_price",maxPrice.value);
  if(coupon.checked)p.set("coupon","true");
  if(official.checked)p.set("official","true");
  try{
    let rows=[],total=0;
    for(let page=0;page<21;page++){
      p.set("page",String(page));
      const r=await fetch(API+"?"+p,{headers:{Accept:"application/json"},cache:"no-store",signal:controller.signal});
      if(!r.ok)throw new Error("HTTP "+r.status);
      const j=await r.json();if(!Array.isArray(j.rows))throw new Error("Resposta inválida");
      rows.push(...j.rows);total=Number(j.total)||rows.length;
      if(rows.length>=total||j.rows.length===0)break;
    }
    if(id!==requestId)return;
    offers=rows;loadState="ready";statusEl.className="status ok";statusEl.textContent="● Atualizado";
  }catch{
    if(id!==requestId)return;
    offers=[];loadState="error";statusEl.className="status err";statusEl.textContent=navigator.onLine?"● Indisponível":"● Sem conexão";
  }finally{clearTimeout(timeout);if(id===requestId)render()}
}
$("#filtersBtn").onclick=()=>{const hidden=$("#filters").classList.toggle("hidden");$("#filtersBtn").setAttribute("aria-expanded",String(!hidden))};
q.addEventListener("input",()=>{clearTimeout(timer);timer=setTimeout(load,350)});
[days,discount,maxPrice,coupon,official].forEach(el=>el.addEventListener("change",load));
category.addEventListener("change",render);
$("#refreshBtn").onclick=load;
document.querySelectorAll("[data-view]").forEach(button=>button.onclick=()=>{
  view=button.dataset.view;
  for(const name of ["offers","favorites","alerts"])$("#"+name+"Panel").classList.toggle("hidden",name!==view);
  document.querySelectorAll("[data-view]").forEach(b=>{b.classList.toggle("active",b===button);if(b===button)b.setAttribute("aria-current","page");else b.removeAttribute("aria-current")});
  if(view==="favorites"){
    q.value="";category.value="";days.value="1";discount.value="0";maxPrice.value="";coupon.checked=false;official.checked=false;load();
  }else render();
});
document.addEventListener("click",event=>{
  const share=event.target.closest("[data-share]");if(share){const o=offers.find(o=>offerId(o)===share.dataset.share);if(o)shareOffer(o);return}
  const b=event.target.closest("[data-favorite]");if(!b)return;
  const id=b.dataset.favorite,existing=favorites.some(f=>f.id===id),o=offers.find(o=>offerId(o)===id);
  if(!existing&&!o)return;
  if(!existing&&favorites.length>=200){notice("Limite de 200 favoritos neste navegador.");return}
  const next=existing?favorites.filter(f=>f.id!==id):[...favorites,{id,title:o.title}];
  try{localStorage.setItem(FAVORITES_KEY,JSON.stringify(next));favorites=next;notice(existing?"Favorito removido.":"Favorito salvo neste navegador.");render()}
  catch{notice("Não foi possível salvar. Verifique o armazenamento permitido neste navegador.")}
});
window.addEventListener("beforeinstallprompt",event=>{event.preventDefault();installPrompt=event});
$("#installBtn").onclick=async()=>{
  if(!installPrompt){$("#installHelp").classList.toggle("hidden");return}
  const prompt=installPrompt;installPrompt=null;
  try{await prompt.prompt();await prompt.userChoice}catch{$("#installHelp").classList.remove("hidden")}
};
function installed(){$("#installBtn").classList.add("hidden");$("#installHelp").classList.add("hidden")}
if(window.matchMedia("(display-mode: standalone)").matches||navigator.standalone)installed();
window.addEventListener("appinstalled",installed);
window.addEventListener("online",load);
window.addEventListener("offline",()=>{activeController?.abort();offers=[];loadState="error";statusEl.className="status err";statusEl.textContent="● Sem conexão";render()});
window.addEventListener("storage",event=>{if(event.key===FAVORITES_KEY){favorites=readFavorites();render()}});
load();
if("serviceWorker"in navigator)window.addEventListener("load",()=>navigator.serviceWorker.register("sw.js",{updateViaCache:"none"}).catch(()=>notice("O modo offline não está disponível neste navegador.")));