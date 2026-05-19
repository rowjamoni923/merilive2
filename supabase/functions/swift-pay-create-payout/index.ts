// Swift Pay Gateway — Create Payout (Agency auto-withdrawal)
// Called after a foreign agency requests withdrawal via "binance" / "crypto_auto".
// Initiates an on-chain payout from Swift Pay's treasury to the agency's wallet
// and stamps the agency_withdrawals row with the gateway payment_id + status.
//
// Idempotent: caller passes withdrawal_id; we short-circuit if already initiated.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const SWIFT_PAY_BASE_URL = "https://instant-harmony-flow.lovable.app";
const SWIFT_PAY_API_KEY = Deno.env.get("SWIFT_PAY_API_KEY") ?? "";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, x-client-platform, x-supabase-api-version, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(b: unknown, s = 200) {
  return new Response(JSON.stringify(b), {
    status: s,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  try {
    if (!SWIFT_PAY_API_KEY) return json({ error: "gateway_not_configured" }, 500);

    const authHeader = req.headers.get("Authorization") ?? "";
    if (!authHeader.startsWith("Bearer ")) return json({ error: "unauthorized" }, 401);

    const authed = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: uerr } = await authed.auth.getUser();
    if (uerr || !user) return json({ error: "unauthorized" }, 401);

    const body = await req.json().catch(() => null) as
      | {
          withdrawal_id?: string;
          pay_currency?: string;
          pay_address?: string;
          pay_network?: string;
        }
      | null;
    if (!body?.withdrawal_id || !body?.pay_address) {
      return json({ error: "withdrawal_id and pay_address are required" }, 400);
    }

    // 🔒 FINANCIAL HARDENING — withdrawals are USDT ONLY.
    // Reject anything else even if the client tampers with the request.
    const ALLOWED_CURRENCIES = new Set(["usdttrc20", "usdtbep20", "usdterc20"]);
    const payCurrency = String(body.pay_currency ?? "usdttrc20").toLowerCase().trim();
    if (!ALLOWED_CURRENCIES.has(payCurrency)) {
      return json({ error: "only USDT withdrawals are supported" }, 400);
    }
    const payNetwork = body.pay_network ??
      (payCurrency === "usdtbep20" ? "BEP20" : payCurrency === "usdterc20" ? "ERC20" : "TRC20");

    // Basic wallet address sanity (alphanumeric, 20–100 chars — same rule as the client)
    const payAddress = String(body.pay_address).trim();
    if (!/^[a-zA-Z0-9]{20,100}$/.test(payAddress)) {
      return json({ error: "invalid_pay_address" }, 400);
    }

    const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Load withdrawal + verify owner
    const { data: w, error: werr } = await admin
      .from("agency_withdrawals")
      .select("id, agency_id, status, payment_details, net_amount_money, agencies!inner(owner_id, name)")
      .eq("id", body.withdrawal_id)
      .maybeSingle();
    if (werr || !w) return json({ error: "withdrawal_not_found" }, 404);
    if ((w as any).agencies.owner_id !== user.id) return json({ error: "forbidden" }, 403);

    // Idempotency
    const existing = (w.payment_details as any)?.swift_pay_payout;
    if (existing?.payment_id) {
      return json({ ok: true, already_initiated: true, payment_id: existing.payment_id });
    }

    const netUsd = Number(w.net_amount_money);
    if (!Number.isFinite(netUsd) || netUsd <= 0) {
      return json({ error: "invalid_net_amount" }, 400);
    }

    const externalUserId = `merilive_agency_${w.agency_id}`;

    // 🔒 IDEMPOTENCY HEADER — prevents accidental double-payouts even if
    // the function is invoked twice for the same withdrawal in parallel.
    const idemKey = `withdrawal_${w.id}`;

    // Call Swift Pay payout
    const payoutRes = await fetch(`${SWIFT_PAY_BASE_URL}/api/public/v1/payout`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${SWIFT_PAY_API_KEY}`,
        "Content-Type": "application/json",
        "Idempotency-Key": idemKey,
      },
      body: JSON.stringify({
        external_user_id: externalUserId,
        display_name: (w as any).agencies.name,
        amount_usd: netUsd,
        pay_currency: payCurrency,
        pay_address: payAddress,
        pay_network: payNetwork,
        reference: idemKey,
      }),
    });
    const txt = await payoutRes.text();
    let parsed: any = null;
    try { parsed = txt ? JSON.parse(txt) : null; } catch { parsed = { raw: txt }; }

    if (!payoutRes.ok) {
      console.error("[swift-pay-create-payout] gateway error", payoutRes.status, parsed);
      // Stamp the failure but don't roll back the withdrawal (admin can retry / process manually)
      await admin.from("agency_withdrawals").update({
        payment_details: { ...(w.payment_details as any), swift_pay_payout: { error: parsed, status: "failed", at: new Date().toISOString() } },
      }).eq("id", w.id);
      return json({ error: parsed?.error ?? "gateway_error", details: parsed }, 502);
    }

    const paymentId = parsed?.payment_id ? String(parsed.payment_id) : null;
    const status = parsed?.status ?? "processing";

    await admin.from("agency_withdrawals").update({
      status: status === "completed" ? "approved" : "pending",
      payment_details: {
        ...(w.payment_details as any),
        swift_pay_payout: {
          payment_id: paymentId,
          status,
          pay_currency: payCurrency,
          pay_address: payAddress,
          pay_network: payNetwork,
          amount_usd: netUsd,
          raw: parsed,
          at: new Date().toISOString(),
        },
      },
    }).eq("id", w.id);

    return json({ ok: true, payment_id: paymentId, status });
  } catch (e) {
    console.error("[swift-pay-create-payout] fatal", e);
    return json({ error: (e as Error).message ?? "unknown" }, 500);
  }
});
