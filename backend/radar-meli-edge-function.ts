// Radar de Oferta Real — OAuth Mercado Livre no servidor
// NUNCA coloque MELI_CLIENT_SECRET, access_token, refresh_token ou service-role no GitHub/browser.

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const CLIENT_ID = "3411921791590842";
const REDIRECT_URI = "https://llgaeuvtrcpcvrcxkvpz.supabase.co/functions/v1/radar-meli-oauth";
const TOKEN_URL = "https://api.mercadolibre.com/oauth/token";
const BACK_TO_RADAR = "https://marcianomarcossoliveira2-gif.github.io/radar-oferta-real/";

function html(title: string, msg: string, ok = true) {
  return new Response(`<!doctype html><html lang="pt-BR"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title><body style="font-family:system-ui;background:#f3f4f6;display:grid;place-items:center;min-height:100vh;margin:0"><main style="background:white;padding:28px;border-radius:18px;max-width:560px;box-shadow:0 4px 18px #00000014"><h1>Radar de Oferta Real</h1><p style="font-weight:800;color:${ok ? '#166534' : '#92400e'}">${title}</p><p>${msg}</p><a href="${BACK_TO_RADAR}" style="display:inline-block;margin-top:10px;background:#111827;color:white;text-decoration:none;padding:12px 16px;border-radius:10px;font-weight:700">Voltar ao Radar</a></main></body></html>`, {
    status: 200,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

Deno.serve(async (req: Request) => {
  if (req.method !== "GET") return new Response("Method Not Allowed", { status: 405 });

  const u = new URL(req.url);
  const code = u.searchParams.get("code");
  const oauthError = u.searchParams.get("error");
  if (oauthError) return html("Autorização não concluída", u.searchParams.get("error_description") || oauthError, false);
  if (!code) return html("Aguardando autorização", "Abra a autorização pelo Mercado Livre para conectar sua conta.", false);

  const secret = Deno.env.get("MELI_CLIENT_SECRET");
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRole = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!secret || !supabaseUrl || !serviceRole) return html("Servidor ainda não configurado", "Falta uma configuração segura no servidor.", false);

  const form = new URLSearchParams({
    grant_type: "authorization_code",
    client_id: CLIENT_ID,
    client_secret: secret,
    code,
    redirect_uri: REDIRECT_URI,
  });

  const tokenRes = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { accept: "application/json", "content-type": "application/x-www-form-urlencoded" },
    body: form,
  });
  const token = await tokenRes.json();
  if (!tokenRes.ok) return html("Falha ao conectar", `O Mercado Livre recusou a troca do código. Detalhe: ${String(token?.error || "unknown")}`, false);

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

  if (error) return html("Falha ao salvar conexão", "O token foi recebido, mas não foi possível armazená-lo com segurança.", false);
  return html("Mercado Livre conectado com sucesso! ✓", "A credencial foi armazenada somente no servidor seguro. O Radar já pode usar a API do Mercado Livre.", true);
});
