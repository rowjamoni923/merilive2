import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const OLD_URL = Deno.env.get("OLD_SUPABASE_URL")!;
    const OLD_KEY = Deno.env.get("OLD_SUPABASE_SERVICE_ROLE_KEY")!;
    const NEW_URL = Deno.env.get("SUPABASE_URL")!;
    const NEW_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const oldClient = createClient(OLD_URL, OLD_KEY);
    const newClient = createClient(NEW_URL, NEW_KEY);

    const body = await req.json().catch(() => ({}));
    const { action, bucket, folder, max_files, offset } = body;

    if (action === "list_buckets") {
      const { data } = await oldClient.storage.listBuckets();
      return json({ buckets: data?.map(b => ({ id: b.id, public: b.public })) });
    }

    if (action === "list_files") {
      const { data } = await oldClient.storage.from(bucket).list(folder || "", { limit: 200, offset: offset || 0 });
      return json({ bucket, folder, files: data?.map(f => ({ name: f.name, id: f.id })) });
    }

    if (action === "sync_bucket") {
      if (!bucket) throw new Error("bucket required");
      const maxFiles = max_files || 50;

      // Ensure bucket exists
      await newClient.storage.createBucket(bucket, { public: true }).catch(() => {});

      let synced = 0, errors = 0, skipped = 0;
      const errorDetails: string[] = [];

      // Recursive sync function
      async function syncFolder(folderPath: string, depth: number) {
        if (synced + errors >= maxFiles || depth > 3) return;

        const { data: items } = await oldClient.storage.from(bucket).list(folderPath, { 
          limit: 200, offset: offset || 0 
        });
        if (!items) return;

        for (const item of items) {
          if (synced + errors >= maxFiles) return;

          if (!item.id) {
            // It's a folder
            const subPath = folderPath ? `${folderPath}/${item.name}` : item.name;
            await syncFolder(subPath, depth + 1);
            continue;
          }

          const filePath = folderPath ? `${folderPath}/${item.name}` : item.name;
          
          try {
            const { data: fileData, error: dlErr } = await oldClient.storage.from(bucket).download(filePath);
            if (dlErr || !fileData) { errors++; errorDetails.push(`DL:${filePath}`); continue; }

            const { error: ulErr } = await newClient.storage.from(bucket).upload(filePath, fileData, {
              upsert: true,
              contentType: fileData.type || "application/octet-stream",
            });

            if (ulErr) { errors++; errorDetails.push(`UL:${filePath}:${ulErr.message}`); }
            else { synced++; }
          } catch (e) {
            errors++;
            errorDetails.push(`${filePath}:${e.message}`);
          }
        }
      }

      await syncFolder(folder || "", 0);

      return json({ bucket, synced, errors, errorDetails: errorDetails.slice(0, 10) });
    }

    // Action: sync_all - sync all buckets sequentially, small batches
    if (action === "sync_all") {
      const maxPerBucket = max_files || 20;
      const { data: buckets } = await oldClient.storage.listBuckets();
      const results: Record<string, any> = {};

      for (const b of buckets || []) {
        await newClient.storage.createBucket(b.id, { public: b.public }).catch(() => {});

        let synced = 0, errors = 0;

        // Get root items
        const { data: items } = await oldClient.storage.from(b.id).list("", { limit: 100 });
        if (!items) { results[b.id] = { synced: 0, total: 0 }; continue; }

        // Sync files (not folders for speed)
        for (const item of items) {
          if (synced >= maxPerBucket) break;
          if (!item.id) continue; // skip folders

          try {
            const { data: fd } = await oldClient.storage.from(b.id).download(item.name);
            if (!fd) continue;
            const { error } = await newClient.storage.from(b.id).upload(item.name, fd, {
              upsert: true,
              contentType: fd.type || "application/octet-stream"
            });
            if (!error) synced++;
            else errors++;
          } catch { errors++; }
        }

        results[b.id] = { synced, errors, total_items: items.length };
      }

      return json({ results });
    }

    return json({ error: "action required: list_buckets | list_files | sync_bucket | sync_all" }, 400);
  } catch (error) {
    return json({ error: error.message }, 500);
  }
});

function json(data: any, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
      "Content-Type": "application/json" 
    },
  });
}
