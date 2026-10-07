import webpush from "npm:web-push@3.6.7";
const base=Deno.env.get("SUPABASE_URL")!,secret=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const origin="https://ofertas.marcianomarcoss.com.br";
const headers={"Access-Control-Allow-Origin":origin,"Access-Control-Allow-Headers":"content-type,x-device-token","Access-Control-Allow-Methods":"GET,POST,DELETE,OPTIONS","Content-Type":"application/json","Cache-Control":"no-store","Vary":"Origin"};
const out=(data:unknown,status=200)=>new Response(JSON.stringify(data),{status,headers});
async function hash(value:string){return [...new Uint8Array(await crypto.subtle.digest("SHA-256",new TextEncoder().encode(value)))].map(x=>x.toString(16).padStart(2,"0")).join("")}
async function db(table:string,params:Record<string,string>={},method="GET",body?:unknown){
 const url=new URL(base+"/rest/v1/"+table);for(const [k,v]of Object.entries(params))url.searchParams.set(k,v);
 const response=await fetch(url,{method,headers:{apikey:secret,Authorization:"Bearer "+secret,"Content-Type":"application/json",Prefer:"return=representation"},body:body===undefined?undefined:JSON.stringify(body),signal:AbortSignal.timeout(10000)});
 if(!response.ok)throw new Error("db_"+response.status);
 return response.status===204?[]:await response.json();
}
function endpointOK(endpoint:string){
 try{const u=new URL(endpoint);return u.protocol==="https:"&&!u.port&&!u.username&&!u.password&&u.href.length<2048&&(u.hostname==="fcm.googleapis.com"||u.hostname==="updates.push.services.mozilla.com"||u.hostname==="web.push.apple.com"||/^[a-z0-9.-]+\.notify\.windows\.com$/.test(u.hostname))}catch{return false}
}
function keyOK(value:unknown,length:number){try{return typeof value==="string"&&/^[A-Za-z0-9_-]+={0,2}$/.test(value)&&atob(value.replace(/-/g,"+").replace(/_/g,"/")).length===length}catch{return false}}
async function send(subscription:any,config:any,payload:unknown){
 if(!endpointOK(subscription.endpoint))throw new Error("invalid_endpoint");
 const details=webpush.generateRequestDetails(subscription,JSON.stringify(payload),{TTL:3600,vapidDetails:{subject:origin,publicKey:config.public_key,privateKey:config.private_key}});
 const response=await fetch(details.endpoint,{method:"POST",headers:details.headers,body:details.body,redirect:"error",signal:AbortSignal.timeout(8000)});
 if(!response.ok){const error:any=new Error("push_failed");error.status=response.status;throw error}
}
const norm=(s:unknown)=>String(s||"").normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase();
async function dispatch(config:any){
 const now=new Date().toISOString();
 const lease=await db("radar_push_config",{id:"eq.1",dispatch_locked_until:"lt."+now},"PATCH",{dispatch_locked_until:new Date(Date.now()+120000).toISOString()});
 if(!lease.length)return out({busy:true});
 try{
  const subscriptions=await db("radar_push_subscriptions",{enabled:"eq.true",order:"last_checked_at.asc",limit:"40"});
  if(!subscriptions.length)return out({checked:0,sent:0});
  const rows:any[]=[];
  for(let page=0;page<21;page++){
   const response=await fetch(base+"/functions/v1/radar-client-offers?max_price=10000000&page="+page,{signal:AbortSignal.timeout(15000)});
   if(!response.ok)throw new Error("offers_unavailable");
   const data=await response.json();if(!Array.isArray(data.rows))throw new Error("offers_invalid");rows.push(...data.rows);
   if(!data.rows.length||rows.length>=Number(data.total||rows.length))break;
  }
  let sent=0,failed=0;
  for(let offset=0;offset<subscriptions.length;offset+=5)await Promise.all(subscriptions.slice(offset,offset+5).map(async(s:any)=>{
   await db("radar_push_subscriptions",{endpoint_hash:"eq."+s.endpoint_hash},"PATCH",{last_checked_at:now});
   if(s.last_sent_at&&Date.now()-Date.parse(s.last_sent_at)<3600000)return;
   const candidates=rows.filter(o=>Number(o.rating)>=4.5&&Number(o.review_count)>=30&&Number(o.price)>0&&Date.parse(o.observed_at)>Date.parse(s.created_at)&&Date.now()-Date.parse(o.observed_at)<86400000&&(!s.max_price||Number(o.price)<=Number(s.max_price))&&norm(s.query).split(/\s+/).every(w=>norm(o.title).includes(w)));
   for(const o of candidates){
    const key=await hash(String(o.item_id)+":"+String(o.price)+":"+new Date(o.observed_at).toISOString().slice(0,10));
    if((await db("radar_push_deliveries",{endpoint_hash:"eq."+s.endpoint_hash,offer_key:"eq."+key,select:"offer_key"})).length)continue;
    // Reserve before send: retries cannot duplicate an uncertain delivery.
    await db("radar_push_deliveries",{},"POST",{endpoint_hash:s.endpoint_hash,offer_key:key});
    try{await send(s.subscription,config,{title:"Oferta no Radar",body:String(o.title).slice(0,140)+" — "+Number(o.price).toLocaleString("pt-BR",{style:"currency",currency:"BRL"}),tag:"radar-ofertas"});sent++;await db("radar_push_subscriptions",{endpoint_hash:"eq."+s.endpoint_hash},"PATCH",{last_sent_at:now})}
    catch(e){failed++;if([404,410].includes((e as any).status))await db("radar_push_subscriptions",{endpoint_hash:"eq."+s.endpoint_hash},"PATCH",{enabled:false})}
    break;
   }
  }));
  return out({checked:subscriptions.length,sent,failed});
 }finally{await db("radar_push_config",{id:"eq.1"},"PATCH",{dispatch_locked_until:"1970-01-01T00:00:00Z"})}
}
Deno.serve(async req=>{
 try{
  if(req.method==="OPTIONS")return new Response(null,{status:204,headers});
  const config=(await db("radar_push_config",{id:"eq.1"}))[0];if(!config)return out({error:"not_configured"},503);
  const action=new URL(req.url).searchParams.get("action")||"config";
  if(action==="dispatch"){
   if(req.method!=="POST"||await hash(req.headers.get("Authorization")||"")!==await hash("Bearer "+config.dispatch_token))return out({error:"unauthorized"},401);
   return await dispatch(config);
  }
  if(req.headers.get("Origin")!==origin)return out({error:"origin_not_allowed"},403);
  if(req.method==="GET"&&action==="config")return out({publicKey:config.public_key});
  if(!["POST","DELETE"].includes(req.method))return out({error:"method_not_allowed"},405);
  const token=req.headers.get("x-device-token")||"";if(!/^[a-f0-9]{64}$/.test(token))return out({error:"device_token_required"},401);
  const text=await req.text();if(text.length>6000)return out({error:"body_too_large"},413);
  const body=JSON.parse(text),endpoint=body.subscription?.endpoint||body.endpoint;
  if(typeof endpoint!=="string"||!endpointOK(endpoint))return out({error:"invalid_endpoint"},400);
  const endpointHash=await hash(endpoint),tokenHash=await hash(token);
  const existing=(await db("radar_push_subscriptions",{endpoint_hash:"eq."+endpointHash}))[0];
  if(existing&&existing.token_hash!==tokenHash)return out({error:"device_not_owned"},403);
  if(action==="test"){
   if(!existing||!existing.enabled)return out({error:"subscription_required"},404);
   if(existing.last_sent_at&&Date.now()-Date.parse(existing.last_sent_at)<60000)return out({error:"wait_one_minute"},429);
   await db("radar_push_subscriptions",{endpoint_hash:"eq."+endpointHash},"PATCH",{last_sent_at:new Date().toISOString()});
   await send(existing.subscription,config,{title:"Radar conectado",body:"As notificações deste aparelho estão ativadas.",tag:"radar-test"});
   return out({sent:true});
  }
  if(req.method==="DELETE"){
   await db("radar_push_subscriptions",{endpoint_hash:"eq."+endpointHash},"DELETE");return out({deleted:true});
  }
  if(action!=="subscribe")return out({error:"unknown_action"},400);
  const subscription=body.subscription;
  if(!keyOK(subscription?.keys?.p256dh,65)||!keyOK(subscription?.keys?.auth,16))return out({error:"invalid_keys"},400);
  const query=typeof body.query==="string"?body.query.trim().slice(0,100):"";
  const maxPrice=body.max_price==null||body.max_price===""?null:Number(body.max_price);
  if(maxPrice!==null&&(!Number.isFinite(maxPrice)||maxPrice<=0||maxPrice>10000000))return out({error:"invalid_price"},400);
  const values={subscription:{endpoint,keys:{p256dh:subscription.keys.p256dh,auth:subscription.keys.auth}},query,max_price:maxPrice,enabled:true};
  if(existing)await db("radar_push_subscriptions",{endpoint_hash:"eq."+endpointHash},"PATCH",values);
  else await db("radar_push_subscriptions",{},"POST",{...values,endpoint_hash:endpointHash,token_hash:tokenHash});
  return out({subscribed:true});
 }catch{return out({error:"push_unavailable"},503)}
});

