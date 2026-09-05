// Radar de Oferta Real — consulta segura de item/preço/avaliações no Mercado Livre
// Este arquivo é código-fonte para Edge Function. Tokens ficam somente no servidor.

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const API = "https://api.mercadolibre.com";

Deno.serve(async (req: Request) => {
  if (req.method !== "GET") return Response.json({ error: "method_not_allowed" }, { status: 405 });

  const u = new URL(req.url);
  const itemId = (u.searchParams.get("item_id") || "").trim().toUpperCase();
  if (!/^MLB\d{6,15}$/.test(itemId)) return Response.json({ error: "invalid_item_id" }, { status: 400 });

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRole = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceRole) return Response.json({ error: "server_not_configured" }, { status: 503 });

  const db = createClient(supabaseUrl, serviceRole, { auth: { persistSession: false } });
  const { data: tokenRow } = await db
    .from("radar_meli_tokens")
    .select("access_token,expires_at")
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!tokenRow?.access_token) return Response.json({ error: "meli_not_connected" }, { status: 503 });
  if (tokenRow.expires_at && new Date(tokenRow.expires_at).getTime() <= Date.now()) {
    return Response.json({ error: "meli_token_expired", reconnect_required: true }, { status: 401 });
  }

  const headers = {
    Authorization: `Bearer ${tokenRow.access_token}`,
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
  if (!item) return Response.json({ error: "item_lookup_failed", status: itemRes.status }, { status: 502 });

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

  return Response.json({
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
    source_status: {
      item: itemRes.status,
      prices: priceRes.status,
      reviews: reviewRes.status,
    },
  });
});
