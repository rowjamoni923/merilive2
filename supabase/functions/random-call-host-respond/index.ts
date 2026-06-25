// Random Call — host accept/reject/timeout reporter.
// Records consecutive-reject streak and applies 24h cooldown
// when the host hits the admin-configured threshold.

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
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const hostId = ud.user.id;

    const body = await req.json().catch(() => ({}));
    const action: string = body.action; // "accept" | "reject" | "timeout"
    const sessionId: string | undefined = body.session_id;

    if (!["accept", "reject", "timeout"].includes(action)) {
      return new Response(JSON.stringify({ error: "bad_action" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Validate the session belongs to this host and is still ringing (if provided)
    if (sessionId) {
      const { data: s } = await supabase
        .from("random_call_sessions")
        .select("id, host_id, status")
        .eq("id", sessionId)
        .maybeSingle();
      if (!s || s.host_id !== hostId) {
        return new Response(JSON.stringify({ error: "session_not_found" }), {
          status: 404,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (action !== "accept" && s.status === "ringing") {
        await supabase
          .from("random_call_sessions")
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
      p_host_id: hostId,
      p_reason: action,
    });

    return new Response(JSON.stringify({ ok: true, result: res }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: String((e as any)?.message ?? e) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
