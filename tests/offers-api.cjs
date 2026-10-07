const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const {stripTypeScriptTypes}=require('node:module');
const source=stripTypeScriptTypes(fs.readFileSync(require('node:path').join(__dirname,'../backend/radar-client-offers.ts'),'utf8'));
const now=new Date().toISOString();
const product={item_id:'MLB30144703',title:'Parafusadeira',rating_average:4.8,review_count:55863,active:true,rating_source:'desktop_browser_mercadolivre',rating_verified_at:now};
const alert={item_id:product.item_id,offer_item_id:'MLB7759444028',title:'Parafusadeira',observed_price:101.35,history_median_90d:150,history_min_90d:100,discount_vs_history_median_pct:32.43,observed_at:now,rating_average:4.8};
let handler,calls=[],testSource=false;
const context={URL,Response,Request,Date,Map,Set,Number,String,Math,Promise,console,Deno:{env:{get:key=>key==='SUPABASE_URL'?'https://test.invalid':'server-key'},serve:fn=>{handler=fn}},fetch:async(url)=>{
 const u=new URL(url);calls.push(u);
 if(u.pathname.endsWith('/radar_products')){assert.equal(u.searchParams.get('review_count'),'gte.30');assert.equal(u.searchParams.get('active'),'eq.true');return Response.json([{...product,rating_source:testSource?'controlled_coupon_test':product.rating_source}]);}
 if(u.pathname.endsWith('/radar_real_offer_alerts')){assert.equal(u.searchParams.get('item_id'),'in.(MLB30144703)');assert(Date.now()-Date.parse(u.searchParams.get('observed_at').slice(4))<86401000);return Response.json([alert]);}
 if(u.pathname.endsWith('/radar_price_history'))return Response.json([{item_id:product.item_id,observed_price:150,price_type:'current'},{item_id:product.item_id,observed_price:999,price_type:'original'}]);
 throw Error('Unexpected request: '+url);
}};
vm.createContext(context);vm.runInContext(source,context);
(async()=>{
 let r=await handler(new Request('https://test.invalid/functions/v1/radar-client-offers'));assert.equal(r.status,200);let j=await r.json();assert.equal(j.total,1);assert.equal(j.rows[0].price,101.35);assert.equal(j.rows[0].history_max_90d,150);assert.equal(j.rows[0].review_count,55863);assert.equal(j.rows[0].permalink,'https://produto.mercadolivre.com.br/MLB-7759444028-_');
 assert(calls[0].pathname.endsWith('/radar_products'));
 r=await handler(new Request('https://test.invalid/?max_price=100'));assert.equal((await r.json()).total,0);
 r=await handler(new Request('https://test.invalid/?min_discount=40'));assert.equal((await r.json()).total,0);
 testSource=true;r=await handler(new Request('https://test.invalid/'));assert.equal((await r.json()).total,0);
 console.log('PASS: eligible products selected before alert limit; default/explicit price; discount; exact listing link; crossed-out history ignored; synthetic data excluded.');
})().catch(e=>{console.error(e);process.exitCode=1});