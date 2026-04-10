import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const OLD_URL = Deno.env.get("OLD_SUPABASE_URL");
    const OLD_KEY = Deno.env.get("OLD_SUPABASE_SERVICE_ROLE_KEY");
    const NEW_URL = Deno.env.get("SUPABASE_URL");
    const NEW_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!OLD_URL || !OLD_KEY || !NEW_URL || !NEW_KEY) {
      throw new Error("Missing env vars. Have: " + 
        `OLD_URL=${!!OLD_URL}, OLD_KEY=${!!OLD_KEY}, NEW_URL=${!!NEW_URL}, NEW_KEY=${!!NEW_KEY}`);
    }

    const oldClient = createClient(OLD_URL, OLD_KEY);
    const newClient = createClient(NEW_URL, NEW_KEY);

    const body = await req.json().catch(() => ({}));
    const { action, bucket, folder, batch_size } = body;

    // Action: list_buckets - just list what's in old project
    if (action === "list_buckets") {
      const { data, error } = await oldClient.storage.listBuckets();
      if (error) throw error;
      return jsonResponse({ buckets: data?.map(b => ({ id: b.id, name: b.name, public: b.public })) });
    }

    // Action: list_files - list files in a specific bucket
    if (action === "list_files") {
      if (!bucket) throw new Error("bucket required");
      const { data, error } = await oldClient.storage.from(bucket).list(folder || "", { limit: 200 });
      if (error) throw error;
      return jsonResponse({ bucket, files: data });
    }

    // Action: sync_bucket - sync a single bucket, small batch
    if (action === "sync_bucket") {
      if (!bucket) throw new Error("bucket required");
      const limit = batch_size || 20;

      // Ensure bucket exists
      await newClient.storage.createBucket(bucket, { public: true }).catch(() => {});

      // List files
      const { data: files, error } = await oldClient.storage.from(bucket).list(folder || "", { 
        limit, 
        sortBy: { column: "name", order: "asc" } 
      });
      if (error) throw error;

      let synced = 0, errors = 0, skipped = 0;
      const errorDetails: string[] = [];

      for (const file of files || []) {
        // Skip folders (metadata-only entries)
        if (!file.id) {
          // It's a folder - skip, user should call with folder param
          skipped++;
          continue;
        }

        const filePath = folder ? `${folder}/${file.name}` : file.name;

        try {
          // Download from old
          const { data: fileData, error: dlErr } = await oldClient.storage.from(bucket).download(filePath);
          if (dlErr || !fileData) {
            errors++;
            errorDetails.push(`DL: ${filePath} - ${dlErr?.message}`);
            continue;
          }

          // Upload to new  
          const { error: ulErr } = await newClient.storage.from(bucket).upload(filePath, fileData, {
            upsert: true,
            contentType: fileData.type || "application/octet-stream",
          });

          if (ulErr) {
            errors++;
            errorDetails.push(`UL: ${filePath} - ${ulErr.message}`);
          } else {
            synced++;
          }
        } catch (e) {
          errors++;
          errorDetails.push(`${filePath}: ${e.message}`);
        }
      }

      return jsonResponse({ 
        bucket, folder: folder || "/", 
        synced, errors, skipped, 
        total_listed: files?.length || 0,
        errorDetails: errorDetails.slice(0, 10)
      });
    }

    return jsonResponse({ error: "Use action: list_buckets | list_files | sync_bucket" }, 400);
  } catch (error) {
    return jsonResponse({ error: error.message }, 500);
  }
});

function jsonResponse(data: any, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
