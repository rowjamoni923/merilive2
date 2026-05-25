// ⛔ Neutered — replaced by the 3-API pipeline in `face-verification-analyze`
// (AWS Rekognition multi-angle + external liveness provider + duplicate-face
// provider). This single-shot DetectFaces endpoint produced inconsistent
// male/female detection because it relied on ONE frame and no cross-checks.
// Per product owner mandate (Pkg357), all face verification must go through
// the 3-API pipeline. Any leftover client caller will receive 410 Gone.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve((req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }
  return new Response(
    JSON.stringify({
      error: "gone",
      message:
        "auto-face-verify has been removed. Use face-verification-analyze (the 3-API pipeline) instead.",
    }),
    {
      status: 410,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    },
  );
});
