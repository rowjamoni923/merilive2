// Pkg343 — Neutered. This orphan admin tool had ZERO authentication and would
// set arbitrary topup_helpers.wallet_balance via service-role on any anon POST,
// effectively minting unlimited diamonds. No callers exist anywhere in the
// codebase. Permanently disabled.

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve((req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  return new Response(
    JSON.stringify({
      error: "gone",
      message: "fix-helper-balance has been permanently disabled (Pkg343). Use the Helper admin panel.",
    }),
    { status: 410, headers: { ...corsHeaders, "Content-Type": "application/json" } },
  );
});
