// DEPRECATED — Pkg328 single-device hardening.
//
// This function previously accepted an arbitrary { userId, deviceId } payload
// with NO authentication and used the service role to overwrite
// `profiles.device_id` for any account. That made it a one-line account
// hijack / mass-overwrite tool. There are no remaining callers in the app
// (web client, native client, or other Edge Functions) — the device id is
// written via the regular profile-update path which is guarded server-side
// by `protect_sensitive_profile_columns`.
//
// The endpoint now returns 410 Gone for every request so that any leftover
// caller fails loudly instead of silently mutating data.

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-client-platform, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

Deno.serve((req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  return new Response(
    JSON.stringify({
      error: "gone",
      message:
        "link-device-to-account has been removed. Device id is written through the regular profile update flow.",
    }),
    {
      status: 410,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    },
  );
});
