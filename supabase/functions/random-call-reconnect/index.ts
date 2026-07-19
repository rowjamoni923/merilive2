// Random / Private Call — reconnect (G4 grace window).
// Step 1: caller asks server to MARK the call as reconnecting + receives a one-time token.
// Step 2: after network heals, caller calls ATTEMPT with the token to rejoin
//         the same LiveKit room without resetting the billing clock.

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
    const token = (req.headers.get("Authorization") ?? "").replace("Bearer ", "");
    const { data: ud } = await supabase.auth.getUser(token);
    if (!ud?.user) {
      return new Response(JSON.stringify({ error: "unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json().catch(() => ({}));
    const action = String(body.action ?? "mark");
    const kind = String(body.kind ?? "private");
    const callId: string | undefined = body.call_id;
    const reconnectToken: string | undefined = body.token;

    // Admin-controlled default grace window (random_call_settings.reconnect_window_seconds).
    // Client-supplied grace_seconds is ignored to keep this as a single source of truth.
    let graceSeconds = 20;
    try {
      const { data: s } = await supabase
        .from("random_call_settings")
        .select("reconnect_window_seconds")
        .eq("id", 1)
        .maybeSingle();
      if (s?.reconnect_window_seconds) {
        graceSeconds = Math.max(5, Math.min(120, Number(s.reconnect_window_seconds)));
      }
    } catch (_) { /* fall back to default */ }

    if (!callId || !["private", "random"].includes(kind)) {
      return new Response(JSON.stringify({ error: "missing_fields" }), {
      });
    }

    if (action === "mark") {
      const { data, error } = await supabase.rpc("mark_call_reconnecting", {
        _kind: kind, _call_id: callId, _grace_seconds: graceSeconds,
      });
      if (error) throw error;
      return new Response(JSON.stringify(data), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (action === "attempt") {
      if (!reconnectToken) {
        return new Response(JSON.stringify({ error: "missing_token" }), {
        });
      }
      const { data, error } = await supabase.rpc("attempt_call_reconnect", {
      });
      if (error) throw error;
      return new Response(JSON.stringify(data), {
      });
    }
    return new Response(JSON.stringify({ error: "invalid_action" }), {
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: String((e as any)?.message ?? e) }), {
    });
  }
});
