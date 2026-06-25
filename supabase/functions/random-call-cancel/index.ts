// Random Call — cancel / leave queue
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
    if (!ud?.user) return new Response(JSON.stringify({ error: "unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    const body = await req.json().catch(() => ({}));
    const queueId: string | undefined = body.queue_id;
    const broadcastId: string | undefined = body.broadcast_id;

    if (broadcastId) {
      await supabase
        .from("random_call_broadcasts")
        .update({ status: "cancelled", updated_at: new Date().toISOString() })
        .eq("id", broadcastId)
        .eq("caller_id", ud.user.id)
        .eq("status", "pending");
      // Tell every host listener to dismiss the ringer
      try {
        const ch = supabase.channel(`broadcast-${broadcastId}`);
        await ch.send({
          type: "broadcast",
          event: "random_broadcast_taken",
          payload: { broadcast_id: broadcastId, cancelled: true },
        });
      } catch (_) {}
    }

    if (queueId) {
      await supabase
        .from("random_call_queue")
        .update({ status: "cancelled", updated_at: new Date().toISOString() })
        .eq("id", queueId)
        .eq("user_id", ud.user.id)
        .eq("status", "waiting");
    } else if (!broadcastId) {
      await supabase
        .from("random_call_queue")
        .update({ status: "cancelled", updated_at: new Date().toISOString() })
        .eq("user_id", ud.user.id)
        .eq("status", "waiting");
    }

    return new Response(JSON.stringify({ ok: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e?.message ?? e) }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
