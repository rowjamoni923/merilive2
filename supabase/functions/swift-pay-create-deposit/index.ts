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

// SwiftPay currently enables ONLY these 4 networks (verified via gateway probe).
// Anything else triggers "currency not enabled". Keep this list in sync with
// the gateway's enabled set.
const SUPPORTED_CURRENCIES = new Set<string>(["usdtbsc", "usdterc20", "usdttrc20", "btc"]);

function gatewayErrorMessage(body: any): string {
  return String(body?.error ?? body?.message ?? body?.details?.error ?? body?.details?.message ?? body?.raw ?? "gateway_error");
}

function isGatewayFallbackError(message: string): boolean {
  const normalized = message.toLowerCase();
  return (
    normalized.includes("currency not enabled") ||
    normalized.includes("currency is not enabled") ||
    normalized.includes("not enabled") ||
    normalized.includes("not supported") ||
    normalized.includes("unsupported currency") ||
    normalized.includes("disabled")
  );
}

function isGatewayMinimumAmountError(message: string): boolean {
  const normalized = message.toLowerCase();
  return (
    normalized.includes("less than minimal") ||
    normalized.includes("less than minimum") ||
    normalized.includes("amount too low") ||
    normalized.includes("minimum required") ||
    normalized.includes("below minimum") ||
    normalized.includes("too small")
  );
}


function roundUsd(value: number): number {
  return Number(value.toFixed(2));
}

function getHelperPackageLevel(pkg: { display_order?: number | null; description?: string | null }, index: number): number {
  const descriptionMatch = String(pkg.description ?? "").match(/level\s*(\d+)/i);
  return Number(pkg.display_order || (descriptionMatch ? Number(descriptionMatch[1]) : index + 1));
}

async function resolveBestDiamondsPerUsd(admin: ReturnType<typeof createClient>): Promise<number | null> {
  const { data } = await admin
    .from("coin_packages")
    .select("coins_amount, bonus_coins, price_usd")
    .eq("is_active", true);
  const best = Math.max(
    ...((data ?? []) as Array<{ coins_amount?: number; bonus_coins?: number; price_usd?: number }>).map((p) =>
      (Number(p.coins_amount ?? 0) + Number(p.bonus_coins ?? 0)) / Math.max(Number(p.price_usd ?? 0), 0.01),
    ),
  );
  return Number.isFinite(best) && best > 0 ? Math.floor(best) : null;
}

async function resolveSwiftPayMinUsd(admin: ReturnType<typeof createClient>): Promise<number> {
  let minUsd = 0.50;
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
  return minUsd;
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
          /** "helper_application" (default, $100 floor) | "campaign" (no floor — campaign recharge mirrors My Diamond package flow) */
          purpose?: "helper_application" | "campaign";
          /** When purpose=campaign, the campaign id being redeemed (server validates dedup). */
          campaign_id?: string;
          /** Pkg433: stash helper-application context so the cron can auto-grant the Trader Wallet
           *  even if the user closes the app right after paying. Shape:
           *  { selected_level, contact_whatsapp, contact_telegram, reason, payroll_requested } */
          helper_application_intent?: {
            selected_level?: number;
            contact_whatsapp?: string | null;
            contact_telegram?: string | null;
            reason?: string | null;
            payroll_requested?: boolean;
          };
        }
      | null;


    if (!body?.pay_currency) {
      return json({ error: "pay_currency is required" }, 400);
    }
    const payCurrency = String(body.pay_currency).toLowerCase().trim();
    if (!/^[a-z0-9_]{2,20}$/.test(payCurrency)) {
      return json({ error: "invalid pay_currency" }, 400);
    }
    if (!SUPPORTED_CURRENCIES.has(payCurrency)) {
      return json({
        ok: false,
        error: "currency_not_enabled",
        fallback: true,
        message: `${payCurrency} is not enabled on the gateway. Supported: ${[...SUPPORTED_CURRENCIES].join(", ")}.`,
      });
    }


    const target = body.target === "helper_wallet" ? "helper_wallet" : "user_diamond";
    const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    let totalCoins = 0;
    let priceUsd = 0;
    let packageId: string | null = null;
    let targetHelperId: string | null = null;
    let campaignId: string | null = null;
    let externalUserId = `merilive_${user.id}`;
    let firstRechargeMeta: { applied: boolean; bonus_coins: number; base_coins: number; package_bonus_available: number } | null = null;

    if (target === "helper_wallet") {
      if (!body.helper_id || !body.custom_coins) {
        return json({ error: "helper_id and custom_coins are required" }, 400);
      }
      const { data: helper, error: hErr } = await admin
        .from("topup_helpers")
        .select("id, user_id, is_active, trader_level")
        .eq("id", body.helper_id)
        .maybeSingle();
      if (hErr || !helper) return json({ error: "helper_not_found" }, 404);
      if (helper.user_id !== user.id) return json({ error: "forbidden" }, 403);
      if (helper.is_active === false) return json({ error: "helper_inactive" }, 400);

      totalCoins = Math.floor(Number(body.custom_coins));
      if (!Number.isFinite(totalCoins) || totalCoins <= 0) return json({ error: "invalid_custom_coins" }, 400);
      const { data: pricingRows, error: pricingErr } = await admin
        .from("helper_diamond_packages")
        .select("diamond_amount, price_usd, display_order, description, is_active")
        .eq("is_active", true)
        .order("display_order", { ascending: true });
      if (pricingErr || !pricingRows?.length) return json({ error: "helper_pricing_not_configured" }, 500);
      const level = Number(helper.trader_level || 1);
      const pricing = (pricingRows as any[]).find((pkg, index) => getHelperPackageLevel(pkg, index) === level) ?? pricingRows[0];
      const diamondUnit = Number((pricing as any).diamond_amount ?? 0);
      const usdUnit = Number((pricing as any).price_usd ?? 0);
      if (!Number.isFinite(diamondUnit) || diamondUnit <= 0 || !Number.isFinite(usdUnit) || usdUnit <= 0) {
        return json({ error: "invalid_helper_pricing" }, 500);
      }
      priceUsd = roundUsd((totalCoins / diamondUnit) * usdUnit);
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
        const baseCoins = Number(pkg.coins_amount ?? 0);
        const packageBonus = Number(pkg.bonus_coins ?? 0);

        // First-recharge dedup: only include package bonus_coins if user
        // has NO prior first_recharge_claims row. Prevents leaking the
        // welcome bonus on every subsequent Swift Pay recharge.
        let firstRechargeApplied = false;
        let appliedBonus = 0;
        if (packageBonus > 0) {
          const { data: priorClaim } = await admin
            .from("first_recharge_claims")
            .select("id")
            .eq("user_id", user.id)
            .limit(1)
            .maybeSingle();
          if (!priorClaim) {
            firstRechargeApplied = true;
            appliedBonus = packageBonus;
          }
        }

        totalCoins = baseCoins + appliedBonus;
        priceUsd = Number(pkg.price_usd);
        if (!Number.isFinite(priceUsd) || priceUsd <= 0) {
          return json({ error: "invalid_package_price" }, 500);
        }
        packageId = pkg.id;

        // Stash first-recharge intent into the deposit body so it lands in
        // raw_payload and the poll worker can insert first_recharge_claims
        // atomically with the credit.
        (depositBody as any).__first_recharge = {
          applied: firstRechargeApplied,
          bonus_coins: appliedBonus,
          base_coins: baseCoins,
          package_bonus_available: packageBonus,
        };
      } else if (body.custom_coins && body.custom_price_usd) {
        const requestedCoins = Math.floor(Number(body.custom_coins));
        const requestedUsd = Number(body.custom_price_usd);
        if (!Number.isFinite(requestedCoins) || requestedCoins <= 0) return json({ error: "invalid_custom_coins" }, 400);
        if (!Number.isFinite(requestedUsd) || requestedUsd <= 0) return json({ error: "invalid_custom_price_usd" }, 400);

        if (body.purpose === "campaign") {
          const { data: campaigns, error: cErr } = await admin
            .from("recharge_campaigns")
            .select("id, diamonds_amount, bonus_diamonds, original_price_usd, offer_price_usd, is_active, schedule_start, schedule_end, priority, is_first_recharge_only")
            .eq("is_active", true)
            .order("priority", { ascending: false });
          if (cErr) return json({ error: "campaign_lookup_failed" }, 500);
          const now = Date.now();
          const matches = (campaigns ?? []).filter((c: any) => {
            const startsOk = !c.schedule_start || new Date(c.schedule_start).getTime() <= now;
            const endsOk = !c.schedule_end || new Date(c.schedule_end).getTime() >= now;
            const campaignCoins = Number(c.diamonds_amount ?? 0) + Number(c.bonus_diamonds ?? 0);
            const campaignUsd = Number(c.offer_price_usd ?? c.original_price_usd ?? 0);
            return startsOk && endsOk && campaignCoins === requestedCoins && Math.abs(campaignUsd - requestedUsd) <= 0.01;
          });
          // If client passed an explicit campaign_id prefer that, otherwise take the highest-priority match.
          const match = body.campaign_id
            ? matches.find((c: any) => c.id === body.campaign_id) ?? null
            : matches[0] ?? null;
          if (!match) return json({ error: "invalid_campaign_offer" }, 400);

          // Bug #2: server-side dedup — first-recharge-only + already-redeemed checks
          const { data: vRes, error: vErr } = await admin.rpc("validate_campaign_for_user", {
            p_user_id: user.id,
            p_campaign_id: (match as any).id,
          });
          if (vErr) {
            console.error("[swift-pay-create-deposit] campaign validate error", vErr);
            return json({ error: "campaign_validate_failed" }, 500);
          }
          const v = vRes as any;
          if (!v?.ok) {
            return json({ error: "campaign_not_eligible", reason: v?.reason ?? "unknown" }, 400);
          }

          totalCoins = requestedCoins;
          priceUsd = roundUsd(Number((match as any).offer_price_usd ?? (match as any).original_price_usd));
          campaignId = (match as any).id;
        } else {
          const minUsd = await resolveSwiftPayMinUsd(admin);
          const rate = await resolveBestDiamondsPerUsd(admin);
          if (!rate) return json({ error: "diamond_rate_not_configured" }, 500);
          totalCoins = Math.floor(requestedUsd * rate);
          priceUsd = roundUsd(requestedUsd);
          if (requestedCoins !== totalCoins) return json({ error: "invalid_custom_coin_amount" }, 400);
          if (priceUsd < minUsd) {
            return json({
              error: "below_minimum",
              min_usd: minUsd,
              message: `Minimum crypto payment is $${minUsd}. Please choose a higher amount.`,
            }, 400);
          }
        }
      } else {
        return json({ error: "package_id or (custom_coins + custom_price_usd) required" }, 400);
      }

    }

    const idempotencyKey = crypto.randomUUID();

    console.log(`[swift-pay-create-deposit] requesting ${payCurrency} for ${priceUsd} USD (user: ${user.id})`);

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
      console.error(`[swift-pay-create-deposit] gateway error for ${payCurrency}:`, depositRes.status, gatewayMessage, depositBody);

      if (isGatewayMinimumAmountError(gatewayMessage) || isGatewayMinimumAmountError(String(depositBody?.details ?? ""))) {
        // Parse "Minimum required is approximately $X.XX" out of details
        const detailsStr = String(depositBody?.details ?? gatewayMessage ?? "");
        const minMatch = detailsStr.match(/\$\s*([0-9]+(?:\.[0-9]+)?)/);
        const parsedMin = minMatch ? Number(minMatch[1]) : null;
        return json({
          ok: false,
          error: "minimum_deposit_not_met",
          fallback: true,
          currency: payCurrency,
          min_required_usd: parsedMin,
          message: parsedMin
            ? `${payCurrency.toUpperCase()} requires at least $${parsedMin.toFixed(2)}. Choose a larger amount or a different network.`
            : `${payCurrency.toUpperCase()} requires a larger deposit. Choose a bigger amount or a different network.`,
          gateway_status: depositRes.status,
          details: depositBody,
        });
      }


      if (isGatewayFallbackError(gatewayMessage)) {
        return json({
          ok: false,
          error: "currency_not_enabled",
          fallback: true,
          message: gatewayMessage,
          gateway_status: depositRes.status,
          details: depositBody,
        });
      }

      return json(
        {
          ok: false,
          fallback: true,
          error: gatewayMessage,
          gateway_status: depositRes.status,
          details: depositBody,
        },
        200,
      );
    }


    // Pkg433: sanitise + persist helper-application intent for cron-side auto-grant.
    let intentPayload: Record<string, unknown> | null = null;
    if (body.helper_application_intent && typeof body.helper_application_intent === "object" && target === "user_diamond") {
      const i = body.helper_application_intent;
      const lvl = Number(i.selected_level);
      intentPayload = {
        selected_level: Number.isFinite(lvl) && lvl >= 1 && lvl <= 5 ? Math.floor(lvl) : 1,
        contact_whatsapp: typeof i.contact_whatsapp === "string" ? i.contact_whatsapp.slice(0, 120) : null,
        contact_telegram: typeof i.contact_telegram === "string" ? i.contact_telegram.slice(0, 120) : null,
        reason: typeof i.reason === "string" ? i.reason.slice(0, 1000) : null,
        payroll_requested: Boolean(i.payroll_requested),
      };
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
        campaign_id: campaignId,
        helper_application_intent: intentPayload,
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
    const message = (e as Error).message ?? "unknown";
    if (isGatewayFallbackError(message)) {
      return json({ ok: false, error: "currency_not_enabled", fallback: true, message, details: { error: message } });
    }
    return json({ error: message }, 500);
  }
});
