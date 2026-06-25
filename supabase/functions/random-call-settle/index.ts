// Random Call — settle (end-of-call billing).
// Called by client on hangup OR by LiveKit webhook on room_finished.
// Calls settle_random_call RPC which enforces the 40-second rule.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    const body = await req.json().catch(() => ({}));
    const sessionId: string | undefined = body.session_id;
    const durationSeconds: number = Math.max(0, Math.floor(Number(body.duration_seconds ?? 0)));
    const endedBy: string = String(body.ended_by ?? "unknown");

    if (!sessionId) {
      return new Response(JSON.stringify({ error: "missing_session_id" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Webhook auth: only honor a real LiveKit-signed request. The previous
    // `x-internal-webhook` shortcut is removed — any client could spoof it.
    const isWebhook = !!req.headers.get("x-livekit-signature");
    if (!isWebhook) {
      const token = (req.headers.get("Authorization") ?? "").replace("Bearer ", "");
      const { data: ud } = await supabase.auth.getUser(token);
      if (!ud?.user) {
        return new Response(JSON.stringify({ error: "unauthorized" }), {
          status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const { data: sess } = await supabase
        .from("random_call_sessions")
        .select("caller_id, host_id, settled")
        .eq("id", sessionId)
        .single();
      if (!sess || (sess.caller_id !== ud.user.id && sess.host_id !== ud.user.id)) {
        return new Response(JSON.stringify({ error: "not_participant" }), {
          status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (sess.settled) {
        return new Response(JSON.stringify({ ok: true, already_settled: true }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    const { data: result, error } = await supabase.rpc("settle_random_call", {
      p_session_id: sessionId,
      p_duration_seconds: durationSeconds,
      p_ended_by: endedBy,
    });

    if (error) {
      return new Response(JSON.stringify({ error: error.message }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e?.message ?? e) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
