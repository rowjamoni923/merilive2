import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    );

    const { profiles } = await req.json();
    
    if (!profiles || !Array.isArray(profiles)) {
      throw new Error("profiles array required");
    }

    console.log(`Importing ${profiles.length} profiles...`);

    // Insert in batches of 50
    const batchSize = 50;
    let success = 0;
    let errors = 0;
    const errorMessages: string[] = [];

    for (let i = 0; i < profiles.length; i += batchSize) {
      const batch = profiles.slice(i, i + batchSize);
      const { error } = await supabase
        .from("profiles")
        .upsert(batch, { onConflict: "id" });

      if (error) {
        console.error(`Batch ${i / batchSize} error:`, error.message);
        errorMessages.push(`Batch ${i / batchSize}: ${error.message}`);
        errors += batch.length;
      } else {
        success += batch.length;
      }
    }

    return new Response(
      JSON.stringify({ success: true, imported: success, errors, errorMessages: errorMessages.slice(0, 5) }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("Error:", err);
    return new Response(
      JSON.stringify({ error: err.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
