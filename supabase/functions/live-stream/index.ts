// ============================================================================
// Pkg322 (Live Streaming deep audit) — function deprecated & neutered.
//
// This legacy edge function was a parallel ingress path into `live_streams`
// that competed with the canonical `start_live_stream` / `end_live_stream`
// RPCs (which run all Pkg279 validation: live-ban check, host-approval check,
// title/profanity rules, single-active-stream-per-host uniqueness).
//
// It also exposed a completely unauthenticated WebSocket relay that any caller
// could use to broadcast fake `chat` / `gift` / `like` / `viewer-count` events
// for ANY streamId — pure spoof surface.
//
// No client in the codebase calls this function. Both REST endpoints
// (`/start-stream`, `/end-stream`, `/active-streams`) are superseded by RPCs.
// The WebSocket signaling is superseded by LiveKit data-channels + Supabase
// Realtime on `live_streams` / `stream_viewers`.
//
// We keep the function file (and route) so old mobile builds get a clean
// 410 Gone instead of a runtime error, and so removing the function doesn't
// break already-deployed agency staff scripts. New code MUST NOT call it.
// ============================================================================

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-client-platform, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

const GONE_BODY = JSON.stringify({
  error: "gone",
  message:
    "The 'live-stream' edge function has been retired (Pkg322). " +
    "Use the start_live_stream / end_live_stream RPCs and LiveKit + Supabase Realtime for signaling.",
});

Deno.serve((req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  // Reject WebSocket upgrades too — the old signaling relay is no longer trusted.
  const upgrade = req.headers.get("upgrade") || "";
  if (upgrade.toLowerCase() === "websocket") {
    return new Response("gone", { status: 410, headers: corsHeaders });
  }

  return new Response(GONE_BODY, {
    status: 410,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
