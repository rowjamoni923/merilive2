// Google Play Billing health diagnostic.
// Validates: (1) service account JSON parses, (2) OAuth2 token mints,
// (3) Google Play Developer API is reachable, (4) diamond_packages products
// resolve correctly via get_google_play_product_info.
// Admin-only (caller must be is_admin()).

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const PACKAGE_NAME = "com.merilive.app";

async function getAccessToken(sa: any): Promise<string> {
  const header = { alg: "RS256", typ: "JWT" };
  const now = Math.floor(Date.now() / 1000);
  const claim = {
    iss: sa.client_email,
    scope: "https://www.googleapis.com/auth/androidpublisher",
    aud: sa.token_uri,
    exp: now + 3600,
    iat: now,
  };
  const enc = (o: any) =>
    btoa(String.fromCharCode(...new TextEncoder().encode(JSON.stringify(o))))
      .replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  const signInput = `${enc(header)}.${enc(claim)}`;
  const pem = sa.private_key
    .replace("-----BEGIN PRIVATE KEY-----", "")
    .replace("-----END PRIVATE KEY-----", "")
    .replace(/\n/g, "");
  const key = await crypto.subtle.importKey(
    "pkcs8",
    Uint8Array.from(atob(pem), (c) => c.charCodeAt(0)),
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5",
    key,
    new TextEncoder().encode(signInput),
  );
  const sigB64 = btoa(String.fromCharCode(...new Uint8Array(sig)))
    .replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  const jwt = `${signInput}.${sigB64}`;
  const r = await fetch(sa.token_uri, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body:
      `grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=${jwt}`,
  });
  if (!r.ok) throw new Error(`token_exchange_${r.status}_${await r.text()}`);
  return (await r.json()).access_token;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }
  const result: any = {
    timestamp: new Date().toISOString(),
    packageName: PACKAGE_NAME,
    checks: {},
  };
  try {
    const auth = req.headers.get("Authorization");
    if (!auth?.startsWith("Bearer ")) {
      return new Response(
        JSON.stringify({ success: false, error: "Unauthorized" }),
        {
          status: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }
    const supa = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: auth } } },
    );
    const { data: { user } } = await supa.auth.getUser();
    if (!user) {
      return new Response(
        JSON.stringify({ success: false, error: "Invalid token" }),
        {
          status: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }
    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );
    const { data: isAdmin } = await admin.rpc("has_role", {
      _user_id: user.id,
      _role: "admin",
    });
    if (!isAdmin) {
      return new Response(
        JSON.stringify({ success: false, error: "Admin only" }),
        {
          status: 403,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    // 1. Secret present + parseable
    const raw = Deno.env.get("GOOGLE_SERVICE_ACCOUNT_JSON");
    if (!raw) {
      result.checks.serviceAccount = {
        ok: false,
        error: "GOOGLE_SERVICE_ACCOUNT_JSON not set",
      };
      return new Response(JSON.stringify({ success: false, result }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    let sa: any;
    try {
      sa = JSON.parse(raw);
      result.checks.serviceAccount = {
        ok: true,
        clientEmail: sa.client_email,
        projectId: sa.project_id,
      };
    } catch (e) {
      result.checks.serviceAccount = {
        ok: false,
        error: `JSON parse: ${String(e)}`,
      };
      return new Response(JSON.stringify({ success: false, result }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 2. OAuth token mint
    let accessToken = "";
    try {
      accessToken = await getAccessToken(sa);
      result.checks.oauthToken = {
        ok: true,
        tokenPrefix: accessToken.slice(0, 12) + "...",
      };
    } catch (e) {
      result.checks.oauthToken = { ok: false, error: String(e) };
      return new Response(JSON.stringify({ success: false, result }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 3. Hit the Google Play Developer API with a clearly-invalid token.
    // Healthy auth => Google replies 400/404 with a structured body.
    // Bad auth/scope => 401/403.
    const probe = await fetch(
      `https://androidpublisher.googleapis.com/androidpublisher/v3/applications/${PACKAGE_NAME}/purchases/products/diamonds_7000_v2/tokens/health_check_probe_token`,
      { headers: { Authorization: `Bearer ${accessToken}` } },
    );
    const probeBody = await probe.text();
    result.checks.googlePlayApi = {
      ok: probe.status !== 401 && probe.status !== 403,
      status: probe.status,
      bodyPreview: probeBody.slice(0, 400),
    };

    // 4. diamond_packages products resolve via lookup RPC
    const { data: pkgs } = await admin
      .from("diamond_packages")
      .select("product_id, diamonds_amount, bonus_diamonds, price_usd, is_active")
      .eq("is_active", true)
      .order("price_usd");
    const productChecks: any[] = [];
    for (const p of pkgs || []) {
      const { data: info, error: infoErr } = await admin.rpc(
        "get_google_play_product_info",
        { _product_id: p.product_id },
      );
      productChecks.push({
        productId: p.product_id,
        priceUsd: p.price_usd,
        resolved: !!info?.diamonds,
        diamonds: info?.diamonds,
        error: infoErr?.message,
      });
    }
    result.checks.products = {
      ok: productChecks.every((p) => p.resolved),
      total: productChecks.length,
      items: productChecks,
    };

    // 5. Recent recharge_transactions snapshot
    const { count: totalRecharges } = await admin
      .from("recharge_transactions")
      .select("*", { count: "exact", head: true })
      .eq("payment_method", "google_play");
    const { data: lastFive } = await admin
      .from("recharge_transactions")
      .select(
        "id, user_id, google_product_id, diamonds_received, status, created_at",
      )
      .eq("payment_method", "google_play")
      .order("created_at", { ascending: false })
      .limit(5);
    result.checks.recentActivity = {
      totalGooglePlayRecharges: totalRecharges || 0,
      lastFive: lastFive || [],
    };

    const allOk = result.checks.serviceAccount.ok &&
      result.checks.oauthToken.ok &&
      result.checks.googlePlayApi.ok &&
      result.checks.products.ok;
    return new Response(JSON.stringify({ success: allOk, result }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("[google-play-health] error", e);
    result.error = e instanceof Error ? e.message : String(e);
    return new Response(JSON.stringify({ success: false, result }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
