"use strict";
(async()=>{
 const API_PUSH="https://llgaeuvtrcpcvrcxkvpz.supabase.co/functions/v1/radar-client-push";
 const status=document.querySelector("#pushStatus"),enable=document.querySelector("#pushEnable"),settings=document.querySelector("#pushSettings");
 const TOKEN_KEY="radar.push.device.v1",PREFS_KEY="radar.push.preferences.v1";
 let registration,subscription,publicKey;
 function token(){
  let value=localStorage.getItem(TOKEN_KEY);
  if(!/^[a-f0-9]{64}$/.test(value||"")){value=[...crypto.getRandomValues(new Uint8Array(32))].map(b=>b.toString(16).padStart(2,"0")).join("");localStorage.setItem(TOKEN_KEY,value)}
  return value;
 }
 async function request(action,body,method="POST"){
  const access=action==="subscribe"?await window.mundoAuth?.getAccessToken?.():null;
  if(action==="subscribe"&&!access){window.mundoAuth?.requireLogin?.();throw new Error("Entre na sua conta para ativar os alertas.")}
  const r=await fetch(API_PUSH+"?action="+action,{method,headers:{"Content-Type":"application/json","x-device-token":token(),...(access?{"Authorization":"Bearer "+access}:{})},body:JSON.stringify(body),signal:AbortSignal.timeout(15000)});
  if(!r.ok)throw new Error(r.status===429?"Aguarde um minuto antes de testar novamente.":"Não foi possível concluir. Verifique a conexão e tente novamente.");
  return r.json();
 }
 function showSettings(){
  settings.classList.remove("hidden");
  let prefs={};try{prefs=JSON.parse(localStorage.getItem(PREFS_KEY)||"{}")||{}}catch{}
  settings.innerHTML='<p>Receba novas ofertas mesmo com o aplicativo fechado. Até um aviso por hora. A entrega depende da conexão e das permissões do aparelho.</p><form id="pushForm"><label>Produto ou marca para receber alertas<input id="pushQuery" required minlength="3" maxlength="100" placeholder="Ex.: parafusadeira"></label><label>Preço máximo em R$ (opcional)<input id="pushPrice" type="number" min="0.01" max="10000000" step="0.01" inputmode="decimal"></label><button>Salvar preferências</button></form><div class="toolbar"><button id="pushTest">Enviar notificação de teste</button><button id="pushDisable">Desativar neste aparelho</button></div>';
  document.querySelector("#pushQuery").value=prefs.query||"";
  document.querySelector("#pushPrice").value=prefs.max_price||"";
  document.querySelector("#pushForm").onsubmit=async e=>{
   e.preventDefault();const b=e.submitter;b.disabled=true;
   const prefs={query:document.querySelector("#pushQuery").value.trim(),max_price:document.querySelector("#pushPrice").value||null};
   try{if(!prefs.query||prefs.query.length<3)throw new Error("Escolha um produto ou marca para receber alertas específicos.");await request("subscribe",{subscription:subscription.toJSON(),...prefs});localStorage.setItem(PREFS_KEY,JSON.stringify(prefs));status.textContent="Preferências salvas. Você receberá novas ofertas que correspondam a elas."}catch(error){status.textContent=error.message}finally{b.disabled=false}
  };
  document.querySelector("#pushTest").onclick=async e=>{
   e.target.disabled=true;try{await request("test",{endpoint:subscription.endpoint});status.textContent="Notificação enviada. Confira os avisos deste aparelho."}catch(error){status.textContent=error.message}finally{e.target.disabled=false}
  };
  document.querySelector("#pushDisable").onclick=async e=>{
   e.target.disabled=true;try{await request("unsubscribe",{endpoint:subscription.endpoint},"DELETE");await subscription.unsubscribe();subscription=null;settings.classList.add("hidden");enable.classList.remove("hidden");status.textContent="Notificações desativadas neste aparelho."}catch(error){status.textContent=error.message}finally{e.target.disabled=false}
  };
 }
 if(!("serviceWorker"in navigator)||!("PushManager"in window)||!("Notification"in window)){
  status.textContent="Este navegador não oferece notificações para o Radar. No iPhone/iPad, instale o aplicativo pela Tela de Início e abra por seu ícone.";return;
 }
 try{
  const r=await fetch(API_PUSH+"?action=config",{signal:AbortSignal.timeout(15000)});if(!r.ok)throw new Error();publicKey=(await r.json()).publicKey;
  registration=await Promise.race([navigator.serviceWorker.ready,new Promise((_,reject)=>setTimeout(()=>reject(new Error()),15000))]);
  subscription=await registration.pushManager.getSubscription();
  if(subscription&&localStorage.getItem(TOKEN_KEY)){status.textContent="Notificações autorizadas neste aparelho.";showSettings()}
  else{enable.classList.remove("hidden");status.textContent="Ative para receber novas ofertas no celular, mesmo com o aplicativo fechado. Você pode filtrar produto e preço depois de ativar."}
 }catch{status.textContent="Não foi possível conectar o serviço de notificações. Verifique sua conexão e recarregue.";return}
 enable.onclick=async()=>{
  if(!await window.mundoAuth?.getAccessToken?.()){window.mundoAuth?.requireLogin?.();return}
  enable.disabled=true;let created=false;
  try{
   const hadToken=!!localStorage.getItem(TOKEN_KEY);
   token(); // Check storage before asking permission.
   if(Notification.permission==="denied"){status.textContent="Notificações bloqueadas. Permita os avisos do Radar nas configurações do navegador.";return}
   const permission=await Notification.requestPermission();if(permission!=="granted"){status.textContent="A ativação depende da sua permissão para notificações.";return}
   if(subscription&&!hadToken)await subscription.unsubscribe();
   subscription=await registration.pushManager.getSubscription();
   if(!subscription){const bytes=Uint8Array.from(atob(publicKey.replace(/-/g,"+").replace(/_/g,"/")),c=>c.charCodeAt(0));subscription=await registration.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:bytes});created=true}
   enable.classList.add("hidden");status.textContent="Permissão concedida. Escolha abaixo um produto ou marca e salve para ativar alertas personalizados.";showSettings();
  }catch(error){if(created&&subscription){await subscription.unsubscribe();subscription=null}status.textContent=error.message||"Não foi possível ativar as notificações."}finally{enable.disabled=false}
 };
})();
