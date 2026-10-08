import {createClient} from "https://esm.sh/@supabase/supabase-js@2.57.0";
const client=createClient("https://llgaeuvtrcpcvrcxkvpz.supabase.co","sb_publishable_wjLehqy8cAwaJZo-TScrqA_aWY6FTjO",{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true}});
const $$=s=>document.querySelector(s),money=v=>Number(v).toLocaleString("pt-BR",{style:"currency",currency:"BRL"});
let wanted="price",session=null;
window.mundoAuth={getAccessToken:async()=> (await client.auth.getSession()).data.session?.access_token||null,requireLogin:()=>enter("alerts")};
const panel=$$("#pricePanel"),authPanel=$$("#loginPanel"),msg=$$("#priceMessage");
const say=t=>{msg.textContent=t;msg.hidden=!t};
const escapeHtml=s=>String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
async function refreshAuth(){const {data}=await client.auth.getSession();session=data.session;$$("#loginState").textContent=session?"Conectado":"Conta necessária";$$("#logoutBtn").hidden=!session;if(session&&wanted==="price"){authPanel.hidden=true;panel.hidden=false;}return session}
async function enter(view){wanted=view;document.querySelectorAll("#offersPanel,#favoritesPanel,#alertsPanel").forEach(p=>p.classList.add("hidden"));panel.hidden=true;authPanel.hidden=true;
if(!await refreshAuth()){authPanel.hidden=false;$$("#loginExplanation").textContent=view==="alerts"?"Entre para ativar notificações personalizadas.":"Entre para usar o Confere Preço e salvar seus interesses.";return}
if(view==="price"){panel.hidden=false;return}
const alerts=$$("#alertsPanel");alerts.classList.remove("hidden");say("");}
document.querySelectorAll('[data-view="price"]').forEach(b=>b.addEventListener("click",()=>enter("price")));
document.querySelectorAll('[data-view="alerts"]').forEach(b=>b.addEventListener("click",e=>{e.stopImmediatePropagation();enter("alerts")},true));
$$("#skipLogin").onclick=()=>{$$("#loginPanel").hidden=true;$$("#offersPanel").classList.remove("hidden")};
$$("#emailLogin").onsubmit=async e=>{e.preventDefault();const email=$$("#loginEmail").value.trim();const {error}=await client.auth.signInWithOtp({email,options:{emailRedirectTo:location.origin+location.pathname}});$$("#loginFeedback").textContent=error?"Não foi possível enviar o acesso: "+error.message:"Confira seu e-mail para entrar.";};
$$("#googleLogin").onclick=async()=>{const {error}=await client.auth.signInWithOAuth({provider:"google",options:{redirectTo:location.origin+location.pathname}});if(error)$$("#loginFeedback").textContent=error.message};
$$("#logoutBtn").onclick=async()=>{await client.auth.signOut();session=null;enter("price")};
$$("#priceSearch").onsubmit=async e=>{e.preventDefault();if(!await refreshAuth()){enter("price");return}
const query=$$("#priceQuery").value.trim();if(query.length<3)return say("Digite pelo menos 3 caracteres.");
say("Conferindo ofertas e registrando seu interesse...");$$("#priceResults").replaceChildren();
try{const response=await fetch("https://llgaeuvtrcpcvrcxkvpz.supabase.co/functions/v1/radar-price-check",{method:"POST",headers:{"Content-Type":"application/json","apikey":"sb_publishable_wjLehqy8cAwaJZo-TScrqA_aWY6FTjO","Authorization":"Bearer "+session.access_token},body:JSON.stringify({query})});const j=await response.json();if(!response.ok)throw Error(j.error||"Falha de consulta");const rows=j.rows||[];say(rows.length?rows.length+" oferta(s) verificada(s) na base atual. Seu interesse foi registrado.":"Nenhuma oferta verificada na base recente. Seu interesse foi registrado para análise.");$$("#priceResults").innerHTML=rows.map((o,i)=>{const url=typeof o.affiliate_url==="string"&&o.affiliate_url.startsWith("https://")?o.affiliate_url:null;const coupon=o.coupon_code?"Cupom: "+o.coupon_code:o.coupon_final_price?"Cupom aplicado":"Cupom não confirmado";const valid=Number.isFinite(Number(o.coupon_final_price))&&Number(o.coupon_final_price)>0;return '<article class="price-result"><strong>'+(i+1)+'ª opção · '+escapeHtml(o.title)+'</strong><div class="price-result-amount">'+money(valid?o.coupon_final_price:o.price)+'</div><div>'+escapeHtml(coupon)+'</div><div>★ '+escapeHtml(o.rating??"n/d")+' · '+escapeHtml(o.review_count??0)+' avaliações</div>'+(url?'<a class="cta" href="'+escapeHtml(url)+'" rel="noopener noreferrer" target="_blank">Ver oferta de afiliado</a>':'<span>Link de afiliado em validação</span>')+'</article>'}).join("")}catch(err){say("Não foi possível consultar: "+err.message)}};
client.auth.onAuthStateChange(()=>{refreshAuth().catch(()=>{})});refreshAuth();

document.querySelectorAll('[data-view="offers"],[data-view="favorites"]').forEach(b=>b.addEventListener("click",()=>{panel.hidden=true;authPanel.hidden=true;wanted="offers"},true));
