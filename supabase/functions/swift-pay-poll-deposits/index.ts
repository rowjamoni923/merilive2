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
const MIN_POLL_GAP_MS = 120_000;

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
  let topupId = url.searchParams.get("topup_id");
  if (!topupId && (req.method === "POST" || req.method === "PUT")) {
    try {
      const body = await req.clone().json();
      const bodyTopupId = body?.topup_id ?? body?.topupId;
      if (typeof bodyTopupId === "string" && bodyTopupId.trim()) {
        topupId = bodyTopupId.trim();
      }
    } catch {
      // No JSON body is fine for scheduled/admin polling.
    }
  }
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
  const nowIso = new Date().toISOString();
  const pollBeforeIso = new Date(Date.now() - MIN_POLL_GAP_MS).toISOString();

  // Build the candidate list
  // Include `expired` rows from the last 30 days so late on-chain confirmations
  // (BTC/USDT-ERC20 can take many hours) still get credited automatically.
  const recoveryCutoffIso = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
  let query = admin
    .from("swift_pay_topups")
    .select("id, user_id, external_user_id, diamonds_amount, price_usd, payment_id, status, target_type, target_helper_id, helper_application_intent, campaign_id, created_at, last_polled_at, raw_payload")
    .in("status", ["pending", "paid", "expired"])
    .gte("created_at", recoveryCutoffIso)
    .order("created_at", { ascending: true })
    .limit(100);

  if (topupId) query = query.eq("id", topupId);
  else if (userId) query = query.eq("user_id", userId);
  else query = query.or(`last_polled_at.is.null,last_polled_at.lt.${pollBeforeIso}`);

  const { data: pending, error: pErr } = await query;
  if (pErr) return json({ error: pErr.message }, 500);
  if (!pending || pending.length === 0) return json({ checked: 0, credited: 0 });


  const balanceCache = new Map<string, { balance: number; total_deposited: number; status_code: number }>();
  const priorPaidUsdCache = new Map<string, number>();
  const touchPollIds: string[] = [];
  const snapshotUpdates: Array<{ id: string; snapshot: any }> = [];
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
          touchPollIds.push(row.id);
          snapshotUpdates.push({
            id: row.id,
            snapshot: { checked_at: nowIso, status_code: balRes.status, error: (balText || "no_body").slice(0, 300) },
          });
          results.push({ id: row.id, skipped: "balance_unavailable", status: balRes.status });
          continue;
        }
        bal = {
          balance: Number(balBody.balance ?? 0),
          total_deposited: Number(balBody.total_deposited ?? 0),
          status_code: balRes.status,
        };
        balanceCache.set(row.external_user_id, bal);
      }

      const expectedUsd = Number(row.price_usd);
      // Scope prior sum by external_user_id (uniquely identifies Swift Pay sub-account
      // — separate sub-account per user-diamonds vs per-helper-wallet).
      let usedUsd = priorPaidUsdCache.get(row.external_user_id);
      if (usedUsd === undefined) {
        const { data: prior } = await admin
          .from("swift_pay_topups")
          .select("price_usd, status")
          .eq("external_user_id", row.external_user_id)
          .in("status", ["paid", "credited"]);
        usedUsd = (prior ?? []).reduce((s: number, p: any) => s + Number(p.price_usd || 0), 0);
        if (["paid", "credited"].includes(row.status)) usedUsd = Math.max(0, usedUsd - expectedUsd);
        priorPaidUsdCache.set(row.external_user_id, usedUsd);
      }

      const neededTotal = usedUsd + expectedUsd;
      const isPaid = bal.total_deposited >= neededTotal - 0.01;
      const snapshot = {
        checked_at: nowIso,
        expected_usd: expectedUsd,
        prior_used_usd: usedUsd,
        needed_total_usd: neededTotal,
        shortfall_usd: Math.max(0, neededTotal - bal.total_deposited),
      };
      if (!isPaid) {
        touchPollIds.push(row.id);
        snapshotUpdates.push({ id: row.id, snapshot });
        results.push({ id: row.id, waiting: true, balance: bal.total_deposited, needed: neededTotal });
        continue;
      }
      snapshotUpdates.push({ id: row.id, snapshot: { ...snapshot, matched: true } });


      // Mark paid first (idempotency anchor) — accept transition from any
      // non-credited status (pending / paid / expired-but-actually-paid).
      await admin.from("swift_pay_topups").update({
        status: "paid",
        paid_at: nowIso,
        last_polled_at: nowIso,
        error_message: null,
      }).eq("id", row.id).neq("status", "credited");

      // Route credit by target_type
      const targetType = (row as any).target_type ?? "user_diamond";
      let creditErr: any = null;
      let creditRes: any = null;

      // Bug #2: credit-time campaign re-validation. Industry anchor = payment-confirm time, not init time.
      // If the campaign expired/became ineligible between init and credit, credit only the BASE diamonds
      // (skip bonus_diamonds) so the user still receives their paid value without an unearned bonus.
      let creditDiamonds = row.diamonds_amount;
      let campaignReeval: any = null;
      if ((row as any).campaign_id && targetType === "user_diamond") {
        const { data: vRes } = await admin.rpc("validate_campaign_for_user", {
          p_user_id: row.user_id,
          p_campaign_id: (row as any).campaign_id,
        });
        const v = vRes as any;
        // "already_redeemed" is OK here — it's THIS topup's own row written by the trigger on a prior retry.
        if (v && v.ok === false && v.reason !== "campaign_already_redeemed") {
          const baseDiamonds = Number(v.base_diamonds ?? row.diamonds_amount);
          creditDiamonds = Math.max(0, baseDiamonds);
          campaignReeval = { stripped_bonus: true, reason: v.reason, base_diamonds: creditDiamonds, original_diamonds: row.diamonds_amount };
          console.warn("[swift-pay-poll-deposits] campaign no longer eligible at credit time", row.id, v.reason);
          // Detach campaign_id so the post-credit trigger does not mark it redeemed.
          await admin.from("swift_pay_topups").update({ campaign_id: null }).eq("id", row.id);
        }
      }


      if (targetType === "helper_wallet" && (row as any).target_helper_id) {
        const { data, error } = await admin.rpc("credit_helper_wallet_from_swift_pay", {
          p_helper_id: (row as any).target_helper_id,
          p_diamonds: creditDiamonds,
          p_topup_id: row.id,
        });
        creditErr = error;
        creditRes = data;
      } else {
        const { data, error } = await admin.rpc("safe_credit_diamonds", {
          p_amount: creditDiamonds,
          p_gateway: "swift_pay",
          p_order_id: row.id,
          p_transaction_id: row.payment_id ?? row.id,
          p_amount_usd: expectedUsd,
          p_metadata: { source: "swift_pay_gateway", external_user_id: row.external_user_id, campaign_reeval: campaignReeval },
        });
        creditErr = error;
        creditRes = data;
      }

      if (creditErr) {
        await admin.from("swift_pay_topups").update({
        }).eq("id", row.id);
        results.push({ id: row.id, error: creditErr.message });
        continue;
      }

      await admin.from("swift_pay_topups").update({
        credited_at: nowIso,
      }).eq("id", row.id);
      priorPaidUsdCache.set(row.external_user_id, usedUsd + expectedUsd);

      // Pkg433: if the user opened a helper-upgrade flow and stashed intent on the
      // topup row, auto-grant the Trader Wallet right now — even if the user closed
      // the app right after paying. RPC is idempotent on payment_transaction_id.
      let autoGrantResult: any = null;
      if (targetType === "user_diamond" && (row as any).helper_application_intent) {
        try {
          const { data: grantData, error: grantErr } = await admin.rpc(
            "auto_grant_helper_from_crypto_payment" as any,
            { _topup_id: row.id },
          );
          autoGrantResult = grantErr ? { error: grantErr.message } : grantData;
          if (grantErr) console.error("[swift-pay-poll-deposits] auto-grant error", row.id, grantErr);
        } catch (ge) {
          console.error("[swift-pay-poll-deposits] auto-grant throw", row.id, ge);
        }
      }

      credited++;
      results.push({ id: row.id, credited: true, diamonds: creditDiamonds, target: targetType, result: creditRes, auto_grant: autoGrantResult, campaign_reeval: campaignReeval });
    } catch (e) {
      console.error("[swift-pay-poll-deposits] row error", row.id, e);
      results.push({ id: row.id, error: (e as Error).message });
    }

  }

  if (touchPollIds.length > 0) {
    await admin.from("swift_pay_topups").update({ last_polled_at: nowIso }).in("id", touchPollIds);
  }
  // Per-row forensic snapshot writes
  for (const s of snapshotUpdates) {
    await admin
      .from("swift_pay_topups")
      .update({ last_poll_snapshot: s.snapshot })
      .eq("id", s.id);
  }
  // Bump poll_attempts atomically (best-effort via RPC; safe if RPC missing)
  if (snapshotUpdates.length > 0) {
    try {
      await admin.rpc("increment_swift_pay_poll_attempts" as any, { p_ids: snapshotUpdates.map(s => s.id) });
    } catch { /* rpc optional */ }
  }

  return json({ checked: pending.length, credited, results });
});
