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
      throw new Error("Missing environment variables");
    }

    const oldClient = createClient(OLD_URL, OLD_KEY);
    const newClient = createClient(NEW_URL, NEW_KEY);

    const { bucket, path_prefix, limit: reqLimit } = await req.json().catch(() => ({}));

    // If specific bucket requested, sync only that bucket
    const bucketsToSync = bucket ? [bucket] : null;

    // Get all buckets from old project
    const { data: oldBuckets, error: bucketsError } = await oldClient.storage.listBuckets();
    if (bucketsError) throw new Error(`Failed to list old buckets: ${bucketsError.message}`);

    const targetBuckets = bucketsToSync 
      ? oldBuckets?.filter(b => bucketsToSync.includes(b.id)) 
      : oldBuckets;

    const results: Record<string, { synced: number; errors: number; skipped: number; errorDetails: string[] }> = {};
    const fileLimit = reqLimit || 1000;

    for (const b of targetBuckets || []) {
      results[b.id] = { synced: 0, errors: 0, skipped: 0, errorDetails: [] };

      // Ensure bucket exists in new project
      const { error: createErr } = await newClient.storage.createBucket(b.id, {
        public: b.public,
      });
      if (createErr && !createErr.message.includes("already exists")) {
        results[b.id].errorDetails.push(`Bucket create error: ${createErr.message}`);
        continue;
      }

      // List files in old bucket
      const prefix = path_prefix || "";
      const { data: files, error: listError } = await oldClient.storage
        .from(b.id)
        .list(prefix, { limit: fileLimit, sortBy: { column: "name", order: "asc" } });

      if (listError) {
        results[b.id].errorDetails.push(`List error: ${listError.message}`);
        continue;
      }

      if (!files || files.length === 0) continue;

      for (const file of files) {
        if (!file.name || file.id === null) {
          // It's a folder, list recursively
          const folderPath = prefix ? `${prefix}/${file.name}` : file.name;
          const { data: subFiles } = await oldClient.storage
            .from(b.id)
            .list(folderPath, { limit: fileLimit });

          if (subFiles) {
            for (const subFile of subFiles) {
              if (!subFile.name || subFile.id === null) continue;
              const filePath = `${folderPath}/${subFile.name}`;
              const result = await syncFile(oldClient, newClient, b.id, filePath);
              if (result === "synced") results[b.id].synced++;
              else if (result === "skipped") results[b.id].skipped++;
              else {
                results[b.id].errors++;
                results[b.id].errorDetails.push(result);
              }
            }
          }
          continue;
        }

        const filePath = prefix ? `${prefix}/${file.name}` : file.name;
        const result = await syncFile(oldClient, newClient, b.id, filePath);
        if (result === "synced") results[b.id].synced++;
        else if (result === "skipped") results[b.id].skipped++;
        else {
          results[b.id].errors++;
          results[b.id].errorDetails.push(result);
        }
      }
    }

    return new Response(JSON.stringify({ success: true, results }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

async function syncFile(
  oldClient: any,
  newClient: any,
  bucketId: string,
  filePath: string
): Promise<string> {
  try {
    // Check if file already exists in new bucket
    const { data: existingFile } = await newClient.storage
      .from(bucketId)
      .list(filePath.split("/").slice(0, -1).join("/") || "", {
        search: filePath.split("/").pop(),
      });

    if (existingFile && existingFile.length > 0) {
      const found = existingFile.find((f: any) => f.name === filePath.split("/").pop());
      if (found) return "skipped";
    }

    // Download from old
    const { data: fileData, error: downloadError } = await oldClient.storage
      .from(bucketId)
      .download(filePath);

    if (downloadError) return `Download error ${filePath}: ${downloadError.message}`;
    if (!fileData) return `No data for ${filePath}`;

    // Upload to new
    const { error: uploadError } = await newClient.storage
      .from(bucketId)
      .upload(filePath, fileData, {
        upsert: true,
        contentType: fileData.type || "application/octet-stream",
      });

    if (uploadError) return `Upload error ${filePath}: ${uploadError.message}`;

    return "synced";
  } catch (e) {
    return `Error ${filePath}: ${e.message}`;
  }
}
