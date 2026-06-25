// Random Call — host accept/reject/timeout reporter.
// Supports both legacy (session_id) and Chamet-style broadcast (broadcast_id) flows.
// - On broadcast accept: atomic claim_random_broadcast → first host wins;
//   losers receive 'already_taken'. Winner is announced to caller + losers.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );
    const token = (req.headers.get("Authorization") ?? "").replace("Bearer ", "");
    const { data: ud } = await supabase.auth.getUser(token);
    if (!ud?.user) {
      return new Response(JSON.stringify({ error: "unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const hostId = ud.user.id;

    const body = await req.json().catch(() => ({}));
    const action: string = body.action; // accept | reject | timeout
    const sessionId: string | undefined = body.session_id;
    const broadcastId: string | undefined = body.broadcast_id;

    if (!["accept", "reject", "timeout"].includes(action)) {
      return new Response(JSON.stringify({ error: "bad_action" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ====== BROADCAST PATH (Chamet-style first-wins) ======
    if (broadcastId) {
      if (action === "accept") {
        const { data: claim } = await supabase.rpc("claim_random_broadcast", {
          p_broadcast_id: broadcastId, p_host_id: hostId,
        });
        const result: any = claim ?? {};

        if (result.ok) {
          // Tell caller a host was matched
          try {
            const callerCh = supabase.channel(`user-${result.caller_id}`);
            await callerCh.send({
              type: "broadcast",
              event: "random_broadcast_matched",
              payload: {
                broadcast_id: broadcastId,
                session_id: result.session_id,
                room: result.room,
                host_id: hostId,
                coin_rate_per_min: result.coin_rate_per_min,
                free_trial_seconds: result.free_trial_seconds,
                min_billable_seconds: result.min_billable_seconds,
              },
            });
          } catch (_) {}

          // Tell every host channel "this ring is taken" (loser dismissal)
          try {
            const ch = supabase.channel(`broadcast-${broadcastId}`);
            await ch.send({
              type: "broadcast",
              event: "random_broadcast_taken",
              payload: { broadcast_id: broadcastId, winner_id: hostId },
            });
          } catch (_) {}

          return new Response(JSON.stringify({ ok: true, ...result }), {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
        // Loser path — don't penalize reject streak
        return new Response(JSON.stringify({ ok: false, reason: result.reason ?? "already_taken" }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      // reject/timeout on broadcast: do NOT count as streak (host just didn't pick up
      // the first; many hosts are pinged simultaneously). Silent no-op.
      return new Response(JSON.stringify({ ok: true, ignored: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ====== LEGACY SESSION PATH ======
    if (sessionId) {
      const { data: s } = await supabase
        .from("random_call_sessions")
        .select("id, host_id, status")
        .eq("id", sessionId)
        .maybeSingle();
      if (!s || s.host_id !== hostId) {
        return new Response(JSON.stringify({ error: "session_not_found" }), {
          status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (action !== "accept" && s.status === "ringing") {
        await supabase.from("random_call_sessions")
          .update({ status: "declined", ended_at: new Date().toISOString(), settled: true })
          .eq("id", sessionId);
      }
    }

    if (action === "accept") {
      await supabase.rpc("host_random_on_accept", { p_host_id: hostId });
      return new Response(JSON.stringify({ ok: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: res } = await supabase.rpc("host_random_on_reject", {
      p_host_id: hostId, p_reason: action,
    });
    return new Response(JSON.stringify({ ok: true, result: res }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: String((e as any)?.message ?? e) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
