// Random Call — post-call rating (G5).
// Client posts { session_id, stars (1-5), tags[], comment? }.
// Server validates participant + duration >= 10s then inserts; trigger
// updates the ratee's profile.random_match_avg_rating automatically.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const ALLOWED_TAGS = new Set([
  "friendly", "clear_video", "fun", "polite",
  "boring", "no_video", "rude", "inappropriate",
]);

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
    const sessionId: string | undefined = body.session_id;
    const stars: number = Math.max(1, Math.min(5, Math.floor(Number(body.stars ?? 0))));
    const tagsRaw: string[] = Array.isArray(body.tags) ? body.tags.slice(0, 6) : [];
    const tags = tagsRaw.filter((t) => typeof t === "string" && ALLOWED_TAGS.has(t));
    const comment: string | null = typeof body.comment === "string" ? body.comment.slice(0, 280) : null;

    if (!sessionId || !stars) {
      return new Response(JSON.stringify({ error: "missing_fields" }), {
      });
    }

    // Look up session + verify participant + duration
    const { data: sess } = await supabase
      .from("random_call_sessions")
      .select("caller_id, host_id, duration_seconds, settled")
      .eq("id", sessionId)
      .single();

    if (!sess) {
      return new Response(JSON.stringify({ error: "session_not_found" }), {
      });
    }

    const me = ud.user.id;
    if (sess.caller_id !== me && sess.host_id !== me) {
      return new Response(JSON.stringify({ error: "not_participant" }), {
      });
    }
    if ((sess.duration_seconds ?? 0) < 10) {
      return new Response(JSON.stringify({ error: "call_too_short" }), {
      });
    }
    const ratee = me === sess.caller_id ? sess.host_id : sess.caller_id;

    const { error: insErr } = await supabase
      .from("random_call_ratings")
      .insert({ session_id: sessionId, rater_id: me, ratee_id: ratee, stars, tags, comment });

    if (insErr && !String(insErr.message).includes("duplicate")) {
      return new Response(JSON.stringify({ error: insErr.message }), {
      });
    }
    return new Response(JSON.stringify({ ok: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: String((e as any)?.message ?? e) }), {
    });
  }
});
