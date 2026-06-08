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

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
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

    // 2) Bill each in parallel (DB-level lock prevents races)
    const results = await Promise.allSettled(
      callIds.map((id) => admin.rpc("bill_call_minute", { p_call_id: id })),
    );

    let billed = 0;
    let skipped = 0;
    let ended = 0;
    let failed = 0;
    const details: Array<Record<string, unknown>> = [];

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
      if (payload?.billed) {
        billed++;
      } else if (payload?.call_ended) {
        ended++;
      } else {
        skipped++;
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
