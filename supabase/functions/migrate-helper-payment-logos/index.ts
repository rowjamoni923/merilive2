// One-time migration: copy all `payment-logo-*` files from the private
// `payment-proofs` bucket into the public `payment-logos` bucket, then
// rewrite stored URLs on helper_country_payment_methods so they actually
// render on the recharge page.
//
// Safe to re-run: it skips files that already exist at the target.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  const stats = { listed: 0, copied: 0, skipped: 0, urlsUpdated: 0, errors: [] as string[] };

  // 1) List all `payment-logo-*` files currently sitting in payment-proofs metadata.
  //    We read from storage.objects (server side) via SQL because storage.list()
  //    won't show them after our earlier metadata-flip fixed by previous migration.
  const { data: rows, error: listErr } = await supabase
    .from("storage_objects_view") // optional view — fallback below
    .select("name")
    .like("name", "payment-logo-%");

  let names: string[] = [];
  if (listErr || !rows) {
    // Fallback: list from the bucket directly
    const { data: dirData } = await supabase.storage
      .from("payment-proofs")
      .list("", { limit: 1000, search: "payment-logo-" });
    names = (dirData || []).map((f) => f.name);
  } else {
    names = rows.map((r: any) => r.name);
  }

  stats.listed = names.length;

  for (const name of names) {
    try {
      // Skip if already at destination
      const { data: existing } = await supabase.storage
        .from("payment-logos")
        .list("", { limit: 1, search: name });
      if (existing && existing.some((f) => f.name === name)) {
        stats.skipped++;
        continue;
      }

      const { data: file, error: dlErr } = await supabase.storage
        .from("payment-proofs")
        .download(name);
      if (dlErr || !file) {
        stats.errors.push(`download ${name}: ${dlErr?.message || "no file"}`);
        continue;
      }

      const { error: upErr } = await supabase.storage
        .from("payment-logos")
        .upload(name, file, { upsert: true, contentType: file.type || "image/png" });
      if (upErr) {
        stats.errors.push(`upload ${name}: ${upErr.message}`);
        continue;
      }
      stats.copied++;
    } catch (e: any) {
      stats.errors.push(`${name}: ${e.message}`);
    }
  }

  // 2) Rewrite stored URLs to point at the public bucket.
  const { data: updRows, error: updErr } = await supabase.rpc(
    "rewrite_helper_payment_logo_urls"
  );
  if (updErr) stats.errors.push(`rewrite urls: ${updErr.message}`);
  else stats.urlsUpdated = (updRows as number) || 0;

  return new Response(JSON.stringify(stats, null, 2), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
