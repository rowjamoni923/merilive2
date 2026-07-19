/**
 * call-billing-tick
 * Phase 3B Step 2 — Server-side per-minute billing cron worker.
 * Invoked by pg_cron every 60s (cron.schedule). Also callable manually
 * by service_role for debugging.
 *
 * Flow:
 *   1. Fetch billable call IDs via get_billable_call_ids() RPC
 *   2. For each, call bill_call_minute(id) RPC
 *   3. Aggregate results, return summary
 *
 * Safety:
 *   - bill_call_minute is idempotent (UNIQUE(call_id, minute_number))
 *   - Uses FOR UPDATE SKIP LOCKED so overlapping ticks never double-charge
 *   - Auto-ends call on insufficient balance
 */
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

// Constant-time string compare so a timing oracle can't enumerate the secret.
function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  // Honest-private-call fix (BE-P0-1): verify_jwt is false so pg_cron can hit
  // this without minting a JWT. That means an anonymous POST can otherwise
  // trigger a full billing pass against all live calls. Require the caller to
  // present the service-role bearer (which pg_cron already sends) OR an
  // explicit CRON_SECRET header.
  const auth = req.headers.get("authorization") ?? "";
  const cronSecretHeader = req.headers.get("x-cron-secret") ?? "";
  const cronSecretEnv = Deno.env.get("CRON_SECRET") ?? "";
  const authorized =
    (auth.startsWith("Bearer ") && safeEqual(auth.slice(7), SERVICE_ROLE_KEY)) ||
    (cronSecretEnv.length > 0 && safeEqual(cronSecretHeader, cronSecretEnv));
  if (!authorized) {
    return new Response(
      JSON.stringify({ ok: false, error: "unauthorized" }),
      { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }

  const startedAt = Date.now();
  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  try {
    // 1) Find billable calls
    const { data: billable, error: listErr } = await admin.rpc("get_billable_call_ids");

    if (listErr) {
      console.error("[billing-tick] get_billable_call_ids failed:", listErr);
      return new Response(
        JSON.stringify({ ok: false, error: listErr.message }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const callIds: string[] = (billable ?? [])
      .map((r: { call_id?: string }) => r?.call_id)
      .filter((x: unknown): x is string => typeof x === "string" && x.length > 0);

    if (callIds.length === 0) {
      return new Response(
        JSON.stringify({ ok: true, billed: 0, skipped: 0, ended: 0, took_ms: Date.now() - startedAt }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // 2) Bill each in parallel (DB-level lock prevents races).
    //    Phase 2 #7: per-call 10s timeout so one stuck row can't starve the
    //    whole tick pass (function ceiling is ~150s; without this a DB lock
    //    contention on a single row drops every concurrent call's minute).
    const BILL_TIMEOUT_MS = 10_000;
    const billOne = (id: string) => {
      let timer: ReturnType<typeof setTimeout> | undefined;
      const timeout = new Promise<{ data: null; error: { message: string } }>((resolve) => {
        timer = setTimeout(
          () => resolve({ data: null, error: { message: `timeout_${BILL_TIMEOUT_MS}ms` } }),
          BILL_TIMEOUT_MS,
        );
      });
      const rpc = admin.rpc("bill_call_minute", { p_call_id: id })
        .then((r) => { if (timer) clearTimeout(timer); return r; });
      return Promise.race([rpc, timeout]);
    };
    const results = await Promise.allSettled(callIds.map(billOne));

    let billed = 0;
    let skipped = 0;
    let ended = 0;
    let failed = 0;
    let signalled = 0;
    const details: Array<Record<string, unknown>> = [];

    // Phase 3 Step 3 — Realtime signals for low-balance + force-end.
    // Channel convention: call_signaling:<call_id>
    const signals: Array<{ topic: string; event: string; payload: Record<string, unknown> }> = [];

    for (let i = 0; i < results.length; i++) {
      const r = results[i];
      const callId = callIds[i];
      if (r.status === "rejected") {
        failed++;
        console.error("[billing-tick] rpc rejected", callId, r.reason);
        details.push({ call_id: callId, error: String(r.reason) });
        continue;
      }
      const { data, error } = r.value;
      if (error) {
        failed++;
        console.error("[billing-tick] rpc error", callId, error);
        details.push({ call_id: callId, error: error.message });
        continue;
      }
      const payload = data as { billed?: boolean; reason?: string; call_ended?: boolean } | null;

      if (payload?.call_ended) {
        ended++;
        signals.push({
          topic: `call_signaling:${callId}`,
          event: "signal",
          payload: {
            action: "force_end",
            reason: payload?.reason ?? "insufficient_balance",
            call_id: callId,
            ts: Date.now(),
          },
        });
        continue;
      }

      if (payload?.billed) {
        billed++;
        // Compute remaining minutes for viewer to broadcast low-balance warning
        const { data: callRow } = await admin
          .from("private_calls")
          .select("caller_id,viewer_rate_per_min")
          .eq("id", callId)
          .maybeSingle();
        if (callRow?.caller_id && callRow?.viewer_rate_per_min) {
          const { data: prof } = await admin
            .from("profiles")
            .select("diamonds")
            .eq("id", callRow.caller_id)
            .maybeSingle();
          const coins = Number(prof?.diamonds ?? 0);
          const rate = Number(callRow.viewer_rate_per_min);
          const remainingMinutes = rate > 0 ? Math.floor(coins / rate) : 0;
          // Industry pattern: pre-warn at 2 min, critical at 1 min.
          if (remainingMinutes <= 2) {
            signals.push({
              topic: `call_signaling:${callId}`,
              event: "signal",
              payload: {
                action: "low_balance",
                remaining_minutes: remainingMinutes,
                remaining_seconds: remainingMinutes * 60,
                severity: remainingMinutes <= 1 ? "critical" : "warning",
                call_id: callId,
                ts: Date.now(),
              },
            });
          }
        }
      } else {
        skipped++;
      }
    }

    // 3) Stateless broadcast via Supabase Realtime HTTP API
    if (signals.length > 0) {
      try {
        const resp = await fetch(`${SUPABASE_URL}/realtime/v1/api/broadcast`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            apikey: SERVICE_ROLE_KEY,
            Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
          },
          body: JSON.stringify({ messages: signals }),
        });
        if (resp.ok) {
          signalled = signals.length;
        } else {
          console.error("[billing-tick] broadcast failed", resp.status, await resp.text());
        }
      } catch (e) {
        console.error("[billing-tick] broadcast threw", e);
      }
    }

    return new Response(
      JSON.stringify({
        ok: true,
        candidates: callIds.length,
        billed,
        skipped,
        ended,
        failed,
        signalled,
        took_ms: Date.now() - startedAt,
        details: failed > 0 ? details : undefined,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    console.error("[billing-tick] uncaught", e);
    return new Response(
      JSON.stringify({ ok: false, error: e instanceof Error ? e.message : String(e) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
