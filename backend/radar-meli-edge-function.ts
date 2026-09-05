// Radar de Oferta Real — backend seguro para OAuth Mercado Livre
// Destinado a uma Edge Function (ex.: Supabase Edge Functions).
// NUNCA coloque MELI_CLIENT_SECRET no GitHub ou no JavaScript do navegador.

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const CLIENT_ID = "3411921791590842";
const REDIRECT_URI = "https://marcianomarcossoliveira2-gif.github.io/radar-oferta-real/callback.html";
const FRONTEND_ORIGIN = "https://marcianomarcossoliveira2-gif.github.io";
const TOKEN_URL = "https://api.mercadolibre.com/oauth/token";

const cors = {
  "Access-Control-Allow-Origin": FRONTEND_ORIGIN,
  "Access-Control-Allow-Headers": "content-type",
  "Access-Control-Allow-Methods": "POST,OPTIONS",
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
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  const origin = req.headers.get("origin");
  if (origin && origin !== FRONTEND_ORIGIN) return json({ error: "origin_not_allowed" }, 403);

  const secret = Deno.env.get("MELI_CLIENT_SECRET");
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRole = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!secret || !supabaseUrl || !serviceRole) return json({ error: "server_not_configured" }, 503);

  const body = await req.json().catch(() => ({}));
  const code = String(body.code || "");
  if (!code) return json({ error: "missing_code" }, 400);

  const form = new URLSearchParams({
    grant_type: "authorization_code",
    client_id: CLIENT_ID,
    client_secret: secret,
    code,
    redirect_uri: REDIRECT_URI,
  });

  const tokenRes = await fetch(TOKEN_URL, {
    method: "POST",
    headers: {
      "accept": "application/json",
      "content-type": "application/x-www-form-urlencoded",
    },
    body: form,
  });

  const token = await tokenRes.json();
  if (!tokenRes.ok) return json({ error: "token_exchange_failed", detail: token?.error || "unknown" }, 400);

  // O token fica somente no banco do servidor. Nunca é devolvido ao navegador.
  const db = createClient(supabaseUrl, serviceRole, { auth: { persistSession: false } });
  const expiresAt = new Date(Date.now() + Number(token.expires_in || 21600) * 1000).toISOString();
  const { error } = await db.from("radar_meli_tokens").upsert({
    user_id: Number(token.user_id),
    access_token: token.access_token,
    refresh_token: token.refresh_token || null,
    token_type: token.token_type || "Bearer",
    scope: token.scope || null,
    expires_at: expiresAt,
    updated_at: new Date().toISOString(),
  }, { onConflict: "user_id" });

  if (error) return json({ error: "token_storage_failed" }, 500);
  return json({ ok: true, connected: true });
});
