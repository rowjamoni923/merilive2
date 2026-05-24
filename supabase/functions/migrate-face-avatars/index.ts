import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-admin-token",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const adminToken = req.headers.get("x-admin-token");
  const expected = Deno.env.get("ADMIN_INTERNAL_TOKEN") ?? Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!adminToken || adminToken !== expected) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const admin = createClient(supabaseUrl, serviceKey);

  const { data: rows, error } = await admin
    .from("profiles")
    .select("id, avatar_url")
    .ilike("avatar_url", "%storage/v1/object/public/face-verification/%");

  if (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const results: Array<Record<string, unknown>> = [];

  for (const row of rows ?? []) {
    const url: string = row.avatar_url ?? "";
    const m = url.match(/\/storage\/v1\/object\/public\/face-verification\/(.+)$/);
    if (!m) {
      results.push({ id: row.id, skipped: "no-match" });
      continue;
    }
    const srcKey = decodeURIComponent(m[1]);
    const ext = srcKey.split(".").pop() || "jpg";
    const destKey = `${row.id}/face-verified-${Date.now()}.${ext}`;

    try {
      const dl = await admin.storage.from("face-verification").download(srcKey);
      if (dl.error || !dl.data) {
        results.push({ id: row.id, error: dl.error?.message ?? "download-failed", srcKey });
        continue;
      }
      const up = await admin.storage.from("avatars").upload(destKey, dl.data, {
        upsert: true,
        contentType: dl.data.type || "image/jpeg",
      });
      if (up.error) {
        results.push({ id: row.id, error: up.error.message, srcKey });
        continue;
      }
      const { data: pub } = admin.storage.from("avatars").getPublicUrl(destKey);
      const upd = await admin.from("profiles").update({ avatar_url: pub.publicUrl }).eq("id", row.id);
      if (upd.error) {
        results.push({ id: row.id, error: upd.error.message });
        continue;
      }
      results.push({ id: row.id, ok: true, newUrl: pub.publicUrl });
    } catch (e) {
      results.push({ id: row.id, error: e instanceof Error ? e.message : String(e) });
    }
  }

  return new Response(
    JSON.stringify({
      total: rows?.length ?? 0,
      ok: results.filter((r) => r.ok).length,
      failed: results.filter((r) => r.error).length,
      results,
    }),
    { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
  );
});
