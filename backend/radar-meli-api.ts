// Radar de Oferta Real — consulta segura de item/preço/avaliações no Mercado Livre
// Tokens e refresh token ficam somente no servidor.

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const API = "https://api.mercadolibre.com";
const CLIENT_ID = "3411921791590842";
const FRONTEND_ORIGIN = "https://marcianomarcossoliveira2-gif.github.io";

const cors = {
  "Access-Control-Allow-Origin": FRONTEND_ORIGIN,
  "Access-Control-Allow-Headers": "content-type",
  "Access-Control-Allow-Methods": "GET,OPTIONS",
  "Vary": "Origin",
};

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...cors, "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "GET") return json({ error: "method_not_allowed" }, 405);

  const origin = req.headers.get("origin");
  if (origin && origin !== FRONTEND_ORIGIN) return json({ error: "origin_not_allowed" }, 403);

  const u = new URL(req.url);
  const itemId = (u.searchParams.get("item_id") || "").trim().toUpperCase();
  if (!/^MLB\d{6,15}$/.test(itemId)) return json({ error: "invalid_item_id" }, 400);

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRole = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const clientSecret = Deno.env.get("MELI_CLIENT_SECRET");
  if (!supabaseUrl || !serviceRole || !clientSecret) return json({ error: "server_not_configured" }, 503);

  const db = createClient(supabaseUrl, serviceRole, { auth: { persistSession: false } });
  const { data: tokenRow, error: tokenReadError } = await db
    .from("radar_meli_tokens")
    .select("user_id,access_token,refresh_token,token_type,scope,expires_at,updated_at")
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (tokenReadError || !tokenRow?.access_token) return json({ error: "meli_not_connected" }, 503);

  let accessToken = tokenRow.access_token as string;
  const expiresMs = tokenRow.expires_at ? new Date(tokenRow.expires_at).getTime() : 0;
  const shouldRefresh = !expiresMs || expiresMs <= Date.now() + 5 * 60 * 1000;

  if (shouldRefresh) {
    if (!tokenRow.refresh_token) return json({ error: "meli_refresh_token_missing", reconnect_required: true }, 401);

    const form = new URLSearchParams({
      grant_type: "refresh_token",
      client_id: CLIENT_ID,
      client_secret: clientSecret,
      refresh_token: tokenRow.refresh_token,
    });

    const refreshRes = await fetch(`${API}/oauth/token`, {
      method: "POST",
      headers: { "accept": "application/json", "content-type": "application/x-www-form-urlencoded" },
      body: form,
    });
    const refreshed = await refreshRes.json().catch(() => null);
    if (!refreshRes.ok || !refreshed?.access_token) {
      return json({ error: "meli_refresh_failed", reconnect_required: true, status: refreshRes.status }, 401);
    }

    accessToken = refreshed.access_token;
    const expiresAt = new Date(Date.now() + Number(refreshed.expires_in || 21600) * 1000).toISOString();
    const { error: saveRefreshError } = await db.from("radar_meli_tokens").upsert({
      user_id: Number(refreshed.user_id || tokenRow.user_id),
      access_token: refreshed.access_token,
      refresh_token: refreshed.refresh_token || tokenRow.refresh_token,
      token_type: refreshed.token_type || tokenRow.token_type || "Bearer",
      scope: refreshed.scope || tokenRow.scope || null,
      expires_at: expiresAt,
      updated_at: new Date().toISOString(),
    }, { onConflict: "user_id" });
    if (saveRefreshError) return json({ error: "meli_refresh_storage_failed" }, 500);
  }

  const headers = {
    Authorization: `Bearer ${accessToken}`,
    "show-all-prices": "true",
  };

  const [itemRes, priceRes, reviewRes] = await Promise.all([
    fetch(`${API}/items/bulk?ids=${encodeURIComponent(itemId)}&attributes=body.id,body.title,body.category_id,body.permalink,body.thumbnail,body.status`, { headers }),
    fetch(`${API}/items/${encodeURIComponent(itemId)}/prices`, { headers }),
    fetch(`${API}/reviews/item/${encodeURIComponent(itemId)}`, { headers }),
  ]);

  const itemPayload = await itemRes.json().catch(() => null);
  const pricePayload = await priceRes.json().catch(() => null);
  const reviewPayload = await reviewRes.json().catch(() => null);

  const bulk = Array.isArray(itemPayload) ? itemPayload[0] : null;
  const item = bulk?.body || null;
  if (!item) return json({ error: "item_lookup_failed", status: itemRes.status, source_status: { item: itemRes.status, prices: priceRes.status, reviews: reviewRes.status } }, 502);

  const prices = Array.isArray(pricePayload?.prices) ? pricePayload.prices : [];
  const eligible = prices.filter((p: any) => {
    const restrictions = Array.isArray(p?.conditions?.context_restrictions) ? p.conditions.context_restrictions : [];
    const minQty = Number(p?.conditions?.min_purchase_unit || 0);
    return Number.isFinite(Number(p?.amount)) && Number(p.amount) > 0 && minQty <= 1 && !restrictions.includes("user_type_business");
  });

  const promotion = eligible.filter((p: any) => p.type === "promotion").sort((a: any, b: any) => Number(a.amount) - Number(b.amount))[0] || null;
  const standard = eligible.filter((p: any) => p.type === "standard").sort((a: any, b: any) => Number(a.amount) - Number(b.amount))[0] || null;
  const chosen = promotion || standard || null;

  const ratingAverage = Number(reviewPayload?.rating_average ?? 0) || null;
  const reviewCount = Number(reviewPayload?.paging?.total ?? 0) || 0;
  const now = new Date().toISOString();

  const { error: productSaveError } = await db.from("radar_products").upsert({
    item_id: itemId,
    title: item.title ?? null,
    category_id: item.category_id ?? null,
    permalink: item.permalink ?? null,
    thumbnail: item.thumbnail ?? null,
    rating_average: ratingAverage,
    review_count: reviewCount,
    active: item.status === "active",
    updated_at: now,
  }, { onConflict: "item_id" });

  if (!productSaveError && chosen) {
    await db.from("radar_price_history").insert({
      item_id: itemId,
      observed_price: Number(chosen.amount),
      currency_id: chosen.currency_id || "BRL",
      price_type: chosen.type || null,
      observed_at: now,
      source: "mercadolivre_api",
    });
  }

  const { data: hist } = await db
    .from("radar_price_history")
    .select("observed_price,observed_at")
    .eq("item_id", itemId)
    .gte("observed_at", new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString())
    .order("observed_at", { ascending: true })
    .limit(1000);

  const values = (hist || []).map((h: any) => Number(h.observed_price)).filter((v: number) => Number.isFinite(v) && v > 0).sort((a: number,b: number)=>a-b);
  const median = values.length ? (values.length % 2 ? values[(values.length-1)/2] : (values[values.length/2-1] + values[values.length/2]) / 2) : null;
  const min90 = values.length ? values[0] : null;

  return json({
    ok: true,
    item: {
      id: itemId,
      title: item.title ?? null,
      category_id: item.category_id ?? null,
      permalink: item.permalink ?? null,
      thumbnail: item.thumbnail ?? null,
      active: item.status === "active",
    },
    rating: {
      average: ratingAverage,
      count: reviewCount,
      passes: !!ratingAverage && ratingAverage >= 4.5 && reviewCount >= 30,
    },
    price: chosen ? {
      amount: Number(chosen.amount),
      currency_id: chosen.currency_id || "BRL",
      type: chosen.type || null,
    } : null,
    history90d: {
      observations: values.length,
      median,
      min: min90,
      enough_for_claim: values.length >= 14,
    },
    stored: !productSaveError,
    source_status: {
      item: itemRes.status,
      prices: priceRes.status,
      reviews: reviewRes.status,
    },
  });
});