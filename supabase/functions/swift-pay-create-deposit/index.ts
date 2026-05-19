// Swift Pay Gateway — Create Deposit
// User picks a diamond package + crypto currency → we call Swift Pay's
// /api/public/v1/deposit endpoint, write a `pending` swift_pay_topups row
// and return the on-chain pay_address + exact pay_amount the user must send.
// A separate polling edge function (swift-pay-poll-deposits) detects when
// the deposit is confirmed inside Swift Pay and credits diamonds to MeriLive.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const SWIFT_PAY_BASE_URL = "https://instant-harmony-flow.lovable.app";
const SWIFT_PAY_API_KEY = Deno.env.get("SWIFT_PAY_API_KEY") ?? "";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, x-client-platform, x-supabase-api-version, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function gatewayErrorMessage(body: any): string {
  return String(body?.error ?? body?.message ?? body?.raw ?? "gateway_error");
}

function isGatewayMinimumAmountError(message: string): boolean {
  const normalized = message.toLowerCase();
  return normalized.includes("less than minimal") || normalized.includes("less than minimum");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  try {
    if (!SWIFT_PAY_API_KEY) return json({ error: "gateway_not_configured" }, 500);

    // Authenticate the calling user via their Supabase JWT
    const authHeader = req.headers.get("Authorization") ?? "";
    if (!authHeader.startsWith("Bearer ")) return json({ error: "unauthorized" }, 401);

    const authedClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const {
      data: { user },
      error: userErr,
    } = await authedClient.auth.getUser();
    if (userErr || !user) return json({ error: "unauthorized" }, 401);

    const body = await req.json().catch(() => null) as
      | { package_id?: string; pay_currency?: string }
      | null;
    if (!body?.package_id || !body?.pay_currency) {
      return json({ error: "package_id and pay_currency are required" }, 400);
    }
    const payCurrency = String(body.pay_currency).toLowerCase().trim();
    if (!/^[a-z0-9_]{2,20}$/.test(payCurrency)) {
      return json({ error: "invalid pay_currency" }, 400);
    }

    const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Resolve the diamond package the user picked
    const { data: pkg, error: pkgErr } = await admin
      .from("coin_packages")
      .select("id, coins_amount, bonus_coins, price_usd, is_active")
      .eq("id", body.package_id)
      .maybeSingle();
    if (pkgErr || !pkg || !pkg.is_active) {
      return json({ error: "package_not_found" }, 404);
    }
    const totalCoins = (pkg.coins_amount ?? 0) + (pkg.bonus_coins ?? 0);
    const priceUsd = Number(pkg.price_usd);
    if (!Number.isFinite(priceUsd) || priceUsd <= 0) {
      return json({ error: "invalid_package_price" }, 500);
    }

    // Stable external_user_id so all of this user's deposits share one
    // Swift Pay sub-account (one balance ledger we can poll).
    const externalUserId = `merilive_${user.id}`;
    const idempotencyKey = crypto.randomUUID();

    // Call Swift Pay: create deposit
    const depositRes = await fetch(`${SWIFT_PAY_BASE_URL}/api/public/v1/deposit`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${SWIFT_PAY_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        external_user_id: externalUserId,
        display_name: user.email ?? user.id,
        amount_usd: priceUsd,
        pay_currency: payCurrency,
      }),
    });

    const depositText = await depositRes.text();
    let depositBody: any = null;
    try {
      depositBody = depositText ? JSON.parse(depositText) : null;
    } catch {
      depositBody = { raw: depositText };
    }

    if (!depositRes.ok) {
      const gatewayMessage = gatewayErrorMessage(depositBody);
      console.error("[swift-pay-create-deposit] gateway error", depositRes.status, depositBody);

      // NOWPayments rejects small packages before it can create an address. This is
      // an expected business validation, not an edge-function outage; return a
      // structured success transport response so the app shows a normal message
      // instead of Lovable/Supabase treating it as a 502 runtime failure.
      if (depositRes.status === 400 && isGatewayMinimumAmountError(gatewayMessage)) {
        return json({
          ok: false,
          error: "minimum_deposit_not_met",
          message: "This crypto network requires a larger deposit amount. Please choose a bigger diamond package and try again.",
          gateway_status: depositRes.status,
          details: depositBody,
        });
      }

      return json(
        {
          error: gatewayMessage,
          gateway_status: depositRes.status,
          details: depositBody,
        },
        502,
      );
    }

    // Persist pending top-up
    const { data: row, error: insErr } = await admin
      .from("swift_pay_topups")
      .insert({
        user_id: user.id,
        package_id: pkg.id,
        coins_amount: totalCoins,
        price_usd: priceUsd,
        pay_currency: payCurrency,
        pay_network: depositBody?.network ?? null,
        pay_address: depositBody?.pay_address ?? null,
        pay_amount: depositBody?.pay_amount ?? null,
        external_user_id: externalUserId,
        payment_id: depositBody?.payment_id ? String(depositBody.payment_id) : null,
        idempotency_key: idempotencyKey,
        expires_at: depositBody?.expires_at ?? null,
        raw_payload: depositBody,
        status: "pending",
      })
      .select("id, pay_address, pay_amount, pay_currency, pay_network, expires_at, status")
      .single();

    if (insErr || !row) {
      console.error("[swift-pay-create-deposit] insert failed", insErr);
      return json({ error: "persist_failed" }, 500);
    }

    return json({
      topup_id: row.id,
      pay_address: row.pay_address,
      pay_amount: row.pay_amount,
      pay_currency: row.pay_currency,
      network: row.pay_network,
      expires_at: row.expires_at,
      coins_amount: totalCoins,
      price_usd: priceUsd,
      status: row.status,
    });
  } catch (e) {
    console.error("[swift-pay-create-deposit] fatal", e);
    return json({ error: (e as Error).message ?? "unknown" }, 500);
  }
});
