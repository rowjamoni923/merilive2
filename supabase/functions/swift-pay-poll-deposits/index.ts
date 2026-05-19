// Swift Pay Gateway — Poll Deposits
// For every still-pending swift_pay_topups row, query the Swift Pay balance
// endpoint for that external_user_id. When the user's Swift Pay balance has
// risen by at least the expected amount, atomically credit the matching
// MeriLive diamond package via safe_credit_diamonds() and mark the topup
// 'credited'. Fully idempotent — safe_credit_diamonds will short-circuit on
// duplicate payment_reference, and the per-row status flips to 'credited'
// before the next poll touches it.
//
// Call this on a schedule (cron / pg_cron) every 30–60 seconds, or invoke
// directly from the client after the user reports having paid.

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

// Allow client (user) to poll only their own topup; cron/admin can poll all.
async function resolveScope(req: Request) {
  const url = new URL(req.url);
  const topupId = url.searchParams.get("topup_id");
  const authHeader = req.headers.get("Authorization") ?? "";
  if (authHeader.startsWith("Bearer ")) {
    const c = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data } = await c.auth.getUser();
    if (data.user) return { userId: data.user.id, topupId };
  }
  return { userId: null as string | null, topupId };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST" && req.method !== "GET") {
    return json({ error: "method_not_allowed" }, 405);
  }
  if (!SWIFT_PAY_API_KEY) return json({ error: "gateway_not_configured" }, 500);

  const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
  const { userId, topupId } = await resolveScope(req);

  // Build the candidate list
  let query = admin
    .from("swift_pay_topups")
    .select("id, user_id, external_user_id, coins_amount, price_usd, payment_id, status, target_type, target_helper_id, created_at")
    .in("status", ["pending", "paid"])
    .order("created_at", { ascending: true })
    .limit(50);

  if (topupId) query = query.eq("id", topupId);
  else if (userId) query = query.eq("user_id", userId);

  const { data: pending, error: pErr } = await query;
  if (pErr) return json({ error: pErr.message }, 500);
  if (!pending || pending.length === 0) return json({ checked: 0, credited: 0 });

  const balanceCache = new Map<string, { balance: number; total_deposited: number }>();
  let credited = 0;
  const results: any[] = [];

  for (const row of pending) {
    try {
      let bal = balanceCache.get(row.external_user_id);
      if (!bal) {
        const balRes = await fetch(
          `${SWIFT_PAY_BASE_URL}/api/public/v1/balance?external_user_id=${encodeURIComponent(row.external_user_id)}`,
          { headers: { Authorization: `Bearer ${SWIFT_PAY_API_KEY}` } },
        );
        const balText = await balRes.text();
        let balBody: any = null;
        try { balBody = balText ? JSON.parse(balText) : null; } catch { balBody = null; }
        if (!balRes.ok || !balBody) {
          await admin.from("swift_pay_topups").update({
            last_polled_at: new Date().toISOString(),
          }).eq("id", row.id);
          results.push({ id: row.id, skipped: "balance_unavailable", status: balRes.status });
          continue;
        }
        bal = {
          balance: Number(balBody.balance ?? 0),
          total_deposited: Number(balBody.total_deposited ?? 0),
        };
        balanceCache.set(row.external_user_id, bal);
      }

      const expectedUsd = Number(row.price_usd);
      // Scope prior sum by external_user_id (uniquely identifies Swift Pay sub-account
      // — separate sub-account per user-diamonds vs per-helper-wallet).
      const { data: prior } = await admin
        .from("swift_pay_topups")
        .select("price_usd, status")
        .eq("external_user_id", row.external_user_id)
        .neq("id", row.id);
      const usedUsd = (prior ?? [])
        .filter((p: any) => ["paid", "credited"].includes(p.status))
        .reduce((s: number, p: any) => s + Number(p.price_usd || 0), 0);

      const isPaid = bal.total_deposited >= usedUsd + expectedUsd - 0.01;
      if (!isPaid) {
        await admin.from("swift_pay_topups").update({
          last_polled_at: new Date().toISOString(),
        }).eq("id", row.id);
        results.push({ id: row.id, waiting: true, balance: bal.total_deposited, needed: usedUsd + expectedUsd });
        continue;
      }

      // Mark paid first (idempotency anchor)
      await admin.from("swift_pay_topups").update({
        status: "paid",
        paid_at: new Date().toISOString(),
        last_polled_at: new Date().toISOString(),
      }).eq("id", row.id).eq("status", "pending");

      // Route credit by target_type
      const targetType = (row as any).target_type ?? "user_diamond";
      let creditErr: any = null;
      let creditRes: any = null;

      if (targetType === "helper_wallet" && (row as any).target_helper_id) {
        const { data, error } = await admin.rpc("credit_helper_wallet_from_swift_pay", {
          p_helper_id: (row as any).target_helper_id,
          p_diamonds: row.coins_amount,
          p_topup_id: row.id,
        });
        creditErr = error;
        creditRes = data;
      } else {
        const { data, error } = await admin.rpc("safe_credit_diamonds", {
          p_user_id: row.user_id,
          p_amount: row.coins_amount,
          p_gateway: "swift_pay",
          p_order_id: row.id,
          p_transaction_id: row.payment_id ?? row.id,
          p_amount_usd: expectedUsd,
          p_metadata: { source: "swift_pay_gateway", external_user_id: row.external_user_id },
        });
        creditErr = error;
        creditRes = data;
      }

      if (creditErr) {
        await admin.from("swift_pay_topups").update({
          status: "failed",
          error_message: creditErr.message,
        }).eq("id", row.id);
        results.push({ id: row.id, error: creditErr.message });
        continue;
      }

      await admin.from("swift_pay_topups").update({
        status: "credited",
        credited_at: new Date().toISOString(),
      }).eq("id", row.id);

      credited++;
      results.push({ id: row.id, credited: true, coins: row.coins_amount, target: targetType, result: creditRes });
    } catch (e) {
      console.error("[swift-pay-poll-deposits] row error", row.id, e);
      results.push({ id: row.id, error: (e as Error).message });
    }
  }

  return json({ checked: pending.length, credited, results });
});
