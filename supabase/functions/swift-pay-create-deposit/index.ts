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
      | {
          package_id?: string;
          pay_currency?: string;
          target?: "user_diamond" | "helper_wallet";
          helper_id?: string;
          custom_coins?: number;
          custom_price_usd?: number;
        }
      | null;
    if (!body?.pay_currency) {
      return json({ error: "pay_currency is required" }, 400);
    }
    const payCurrency = String(body.pay_currency).toLowerCase().trim();
    if (!/^[a-z0-9_]{2,20}$/.test(payCurrency)) {
      return json({ error: "invalid pay_currency" }, 400);
    }

    const target = body.target === "helper_wallet" ? "helper_wallet" : "user_diamond";
    const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    let totalCoins = 0;
    let priceUsd = 0;
    let packageId: string | null = null;
    let targetHelperId: string | null = null;
    let externalUserId = `merilive_${user.id}`;

    if (target === "helper_wallet") {
      if (!body.helper_id || !body.custom_coins || !body.custom_price_usd) {
        return json({ error: "helper_id, custom_coins, custom_price_usd are required" }, 400);
      }
      const { data: helper, error: hErr } = await admin
        .from("topup_helpers")
        .select("id, user_id, is_active")
        .eq("id", body.helper_id)
        .maybeSingle();
      if (hErr || !helper) return json({ error: "helper_not_found" }, 404);
      if (helper.user_id !== user.id) return json({ error: "forbidden" }, 403);
      if (helper.is_active === false) return json({ error: "helper_inactive" }, 400);

      totalCoins = Math.floor(Number(body.custom_coins));
      priceUsd = Number(body.custom_price_usd);
      if (!Number.isFinite(totalCoins) || totalCoins <= 0) return json({ error: "invalid_custom_coins" }, 400);
      if (!Number.isFinite(priceUsd) || priceUsd <= 0) return json({ error: "invalid_custom_price_usd" }, 400);
      targetHelperId = helper.id;
      // Isolated Swift Pay sub-account per helper
      externalUserId = `merilive_helper_${helper.id}`;
    } else {
      // user_diamond — either a package OR a custom amount (e.g. helper-application fee)
      if (body.package_id) {
        const { data: pkg, error: pkgErr } = await admin
          .from("coin_packages")
          .select("id, coins_amount, bonus_coins, price_usd, is_active")
          .eq("id", body.package_id)
          .maybeSingle();
        if (pkgErr || !pkg || !pkg.is_active) {
          return json({ error: "package_not_found" }, 404);
        }
        totalCoins = (pkg.coins_amount ?? 0) + (pkg.bonus_coins ?? 0);
        priceUsd = Number(pkg.price_usd);
        if (!Number.isFinite(priceUsd) || priceUsd <= 0) {
          return json({ error: "invalid_package_price" }, 500);
        }
        packageId = pkg.id;
      } else if (body.custom_coins && body.custom_price_usd) {
        totalCoins = Math.floor(Number(body.custom_coins));
        priceUsd = Number(body.custom_price_usd);
        if (!Number.isFinite(totalCoins) || totalCoins <= 0) return json({ error: "invalid_custom_coins" }, 400);
        if (!Number.isFinite(priceUsd) || priceUsd <= 0) return json({ error: "invalid_custom_price_usd" }, 400);

        // SERVER-SIDE FLOOR — Swift Pay's on-chain auto-verification has a hard
        // minimum (the helper-application crypto flow). Even if a tampered
        // client posts $1, the gateway will reject and we'd leak a pending row.
        // Read the floor from app_settings.swift_pay_crypto_min_usd (jsonb
        // { "min_usd": 100 } or raw number), default 100. Applies to the
        // user_diamond custom path (helper-application upgrade fee).
        let minUsd = 100;
        try {
          const { data: setting } = await admin
            .from("app_settings")
            .select("setting_value")
            .eq("setting_key", "swift_pay_crypto_min_usd")
            .maybeSingle();
          const raw = setting?.setting_value as unknown;
          const parsed = typeof raw === "number"
            ? raw
            : typeof raw === "string"
              ? Number(raw)
              : (raw && typeof raw === "object" && "min_usd" in (raw as Record<string, unknown>))
                ? Number((raw as Record<string, unknown>).min_usd)
                : NaN;
          if (Number.isFinite(parsed) && parsed > 0) minUsd = parsed;
        } catch {
          // ignore — fall back to default 100
        }
        if (priceUsd < minUsd) {
          return json({
            error: "below_minimum",
            min_usd: minUsd,
            message: `Minimum crypto payment is $${minUsd}. Please choose a higher amount.`,
          }, 400);
        }
      } else {
        return json({ error: "package_id or (custom_coins + custom_price_usd) required" }, 400);
      }
    }

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

      if (isGatewayMinimumAmountError(gatewayMessage)) {
        return json({
          ok: false,
          error: "minimum_deposit_not_met",
          fallback: true,
          message: "This crypto network requires a larger deposit amount. Please choose a bigger amount and try again.",
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

    const { data: row, error: insErr } = await admin
      .from("swift_pay_topups")
      .insert({
        user_id: user.id,
        package_id: packageId,
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
        target_type: target,
        target_helper_id: targetHelperId,
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
