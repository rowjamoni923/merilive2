// Pkg342: This one-off migration tool has no callers anywhere in the
// codebase and previously ran with zero authentication while holding
// service-role credentials — any anon could trigger bulk storage
// rewrites between payment-proofs <-> payment-logos buckets. Neutered.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-admin-token",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
};

serve((req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  return new Response(
    JSON.stringify({
      success: false,
      error: "gone",
      message:
        "migrate-helper-payment-logos has been retired. Trigger storage migrations from a one-off SQL migration instead.",
    }),
    { status: 410, headers: { ...corsHeaders, "Content-Type": "application/json" } },
  );
});
