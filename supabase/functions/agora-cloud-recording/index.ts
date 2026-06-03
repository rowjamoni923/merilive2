// Pkg345 — Neutered.
//
// This Agora Cloud Recording edge function was deployed with ZERO authentication
// and exposed a service-role Supabase client + start/stop/query/list endpoints
// against the host's Agora account. Any anonymous caller could:
//   • start recording on any active live stream (Agora cost-DoS),
//   • stop/query recordings,
//   • list recording history.
//
// A repo-wide grep confirms ZERO callers from the React app and ZERO DB triggers
// reference this function. The project now uses LiveKit egress (livekit-auto-record
// + livekit-stream-egress + livekit-track-egress) for all recording.
//
// Returns 410 Gone permanently. Do not re-enable without proper admin auth.

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

Deno.serve((req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  return new Response(
    JSON.stringify({
      error: "gone",
      message:
        "agora-cloud-recording was removed in Pkg345 (orphan, unauthenticated). Use the LiveKit egress edge functions instead.",
    }),
    { status: 410, headers: { ...corsHeaders, "Content-Type": "application/json" } },
  );
});
