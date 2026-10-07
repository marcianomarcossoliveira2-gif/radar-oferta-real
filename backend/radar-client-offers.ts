
const base = Deno.env.get("SUPABASE_URL")!;
const secret = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const allowed = new Set([
  "https://ofertas.marcianomarcoss.com.br",
  "https://marcianomarcossoliveira2-gif.github.io"
]);

function cors(req: Request) {
  const origin = req.headers.get("origin") || "";
  const ok = allowed.has(origin);
  return {
    "Access-Control-Allow-Origin": ok ? origin : "https://ofertas.marcianomarcoss.com.br",
    "Vary": "Origin",
    "Access-Control-Allow-Headers": "content-type",
    "Access-Control-Allow-Methods": "GET,OPTIONS",
    "Cache-Control": "public, max-age=60, stale-while-revalidate=120",
    "Content-Type": "application/json; charset=utf-8",
  };
}
function out(req: Request, data: unknown, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: cors(req) });
}
async function query(table: string, params: Record<string,string>) {
  const u = new URL(base + "/rest/v1/" + table);
  for (const [k,v] of Object.entries(params)) u.searchParams.set(k,v);
  const r = await fetch(u, { headers: { apikey: secret, Authorization: "Bearer " + secret }});
  if (!r.ok) throw new Error("db");
  return await r.json();
}
const num = (v:any) => v == null || v === "" ? null : Number(v);
const safeInt = (v:string|null,d:number,min:number,max:number) => {
  if (v == null || v.trim() === "") return d;
  const n = Number(v); return Number.isFinite(n) ? Math.max(min,Math.min(max,Math.trunc(n))) : d;
};
const safeNum = (v:string|null,d:number,min:number,max:number) => {
  if (v == null || v.trim() === "") return d;
  const n = Number(v); return Number.isFinite(n) ? Math.max(min,Math.min(max,n)) : d;
};
const validId = (s:any) => typeof s === "string" && /^MLB\d{5,20}$/.test(s);

Deno.serve(async (req: Request) => {
  try {
    if (req.method === "OPTIONS") return new Response(null,{status:204,headers:cors(req)});
    if (req.method !== "GET") return out(req,{error:"method_not_allowed"},405);
    const origin = req.headers.get("origin");
    if (origin && !allowed.has(origin)) return out(req,{error:"origin_not_allowed"},403);

    const u = new URL(req.url);
    const q = (u.searchParams.get("q") || "").replace(/[^\p{L}\p{N} ._-]/gu,"").trim().slice(0,100);
    const minDiscount = safeNum(u.searchParams.get("min_discount"),0,0,100);
    const maxPrice = safeNum(u.searchParams.get("max_price"),10000000,0,10000000);
    const couponOnly = u.searchParams.get("coupon")==="true";
    const officialOnly = u.searchParams.get("official")==="true";
    const page = safeInt(u.searchParams.get("page"),0,0,100);
    const pageSize = 24;

    // Select eligible products before limiting alerts; unrelated recent rows
    // must not hide products whose buyer reviews have been verified.
    const products = (await query("radar_products",{
      select:"item_id,title,category_id,permalink,thumbnail,rating_average,review_count,active,updated_at,rating_source,rating_verified_at",
      review_count:"gte.30",
      rating_average:"gte.4.5",
      active:"eq.true",
      order:"rating_verified_at.desc.nullslast",
      limit:"1000"
    })).filter((p:any)=>validId(p.item_id) && p.rating_verified_at && !/test|mock|synthetic/i.test(p.rating_source||""));
    if (!products.length) return out(req,{rows:[],total:0,updated_at:new Date().toISOString()});
    const pm = new Map(products.map((p:any)=>[p.item_id,p]));
    const latest = new Map<string,any>();
    for (let offset=0; offset<products.length; offset+=50) {
      const ids=products.slice(offset,offset+50).map((p:any)=>p.item_id);
      const alerts = await query("radar_real_offer_alerts",{
        select:"id,item_id,offer_item_id,title,observed_price,history_median_90d,history_min_90d,discount_vs_history_median_pct,observed_at,rating_average,sold_quantity,affiliate_url,affiliate_offer_item_id,affiliate_verified,affiliate_price_verified,affiliate_landing_price,coupon_code,coupon_discount,coupon_final_price,coupon_eligibility,official_store_id",
        item_id:"in.("+ids.join(",")+")",
        observed_price:"gt.0",
        history_median_90d:"gt.0",
        observed_at:"gte."+new Date(Date.now()-24*60*60*1000).toISOString(),
        order:"observed_at.desc",
        limit:"1000",
        ...(q ? {title:"ilike.*"+q+"*"} : {})
      });
      for (const a of alerts) if (validId(a.item_id) && !latest.has(a.item_id)) latest.set(a.item_id,a);
    }

    let rows = [...latest.values()].map((a:any)=>{
      const p:any = pm.get(a.item_id)||{};
      return {
        item_id:a.item_id,
        offer_item_id:a.offer_item_id,
        title:a.title||p.title||"Produto",
        category_id:p.category_id||null,
        price:num(a.observed_price),
        history_min_90d:num(a.history_min_90d),
        history_median_90d:num(a.history_median_90d),
        discount_pct:num(a.discount_vs_history_median_pct)||0,
        rating:num(a.rating_average ?? p.rating_average),
        review_count:Number(p.review_count||0),
        sold_quantity:a.sold_quantity == null ? null : Number(a.sold_quantity),
        coupon_code:a.coupon_code||null,
        coupon_discount:num(a.coupon_discount),
        coupon_final_price:num(a.coupon_final_price),
        coupon_eligibility:a.coupon_eligibility||null,
        official_store:!!a.official_store_id,
        affiliate_url:a.affiliate_verified && a.affiliate_price_verified && a.affiliate_offer_item_id===a.offer_item_id && Math.abs(Number(a.affiliate_landing_price)-Number(a.observed_price))<=0.01 ? (a.affiliate_url||null) : null,
        affiliate_price_verified:!!a.affiliate_price_verified,
        affiliate_landing_price:num(a.affiliate_landing_price),
        permalink:validId(a.offer_item_id) ? "https://produto.mercadolivre.com.br/MLB-"+a.offer_item_id.slice(3)+"-_" : null,
        thumbnail:p.thumbnail||null,
        observed_at:a.observed_at
      };
    });

    rows = rows.filter((r:any)=>
      (r.rating ?? 0) >= 4.5 &&
      r.review_count >= 30 &&
      r.price <= maxPrice &&
      r.discount_pct >= minDiscount &&
      (!couponOnly || !!r.coupon_code) &&
      (!officialOnly || r.official_store)
    );

    rows.sort((a:any,b:any)=> b.discount_pct-a.discount_pct || new Date(b.observed_at).getTime()-new Date(a.observed_at).getTime());
    const total = rows.length;
    rows = rows.slice(page*pageSize,page*pageSize+pageSize);

    const pageIds = rows.map((r:any)=>r.item_id);
    if (pageIds.length) {
      const hist = await query("radar_price_history",{
        select:"item_id,observed_price,price_type,observed_at",
        item_id:"in.("+pageIds.join(",")+")",
        observed_at:"gte."+new Date(Date.now()-90*86400000).toISOString(),
        observed_price:"gt.0",
        order:"observed_at.desc",
        limit:"5000"
      });
      const maxima = new Map<string,number>();
      for (const h of hist) {
        if (/original|riscado|list_price/i.test(h.price_type||"")) continue;
        const v=Number(h.observed_price);
        if (!Number.isFinite(v)) continue;
        if (!maxima.has(h.item_id) || v>(maxima.get(h.item_id) as number)) maxima.set(h.item_id,v);
      }
      rows = rows.map((r:any)=>({...r,history_max_90d:maxima.get(r.item_id)??null}));
    }

    await Promise.all(rows.map(async (r:any)=>{
      if (r.affiliate_url || r.permalink || !validId(r.offer_item_id)) return;
      try {
        const x=await fetch("https://api.mercadolibre.com/items/"+r.offer_item_id,{headers:{"Accept":"application/json"}});
        if (!x.ok) return;
        const j=await x.json();
        if (typeof j.permalink==="string" && /^https:\/\/.+mercadolivre\.com\.br\//.test(j.permalink)) r.permalink=j.permalink;
      } catch {}
    }));

    return out(req,{rows,total,updated_at:new Date().toISOString(),rules:{min_rating:4.5,min_reviews:30,ignored_price_types:["original","riscado","list_price"]}});
  } catch {
    return out(req,{error:"radar_unavailable"},503);
  }
});
