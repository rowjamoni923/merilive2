import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

  // Validate the caller is an active admin (via their JWT)
  const authHeader = req.headers.get("Authorization") || "";
  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: userData } = await userClient.auth.getUser();
  const callerId = userData?.user?.id;
  if (!callerId) {
    return new Response(JSON.stringify({ error: "Unauthorized: login required" }), {
      status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const admin = createClient(supabaseUrl, serviceKey);
  const { data: adminRow } = await admin
    .from("admin_users")
    .select("id, is_active")
    .eq("user_id", callerId)
    .eq("is_active", true)
    .maybeSingle();

  if (!adminRow) {
    return new Response(JSON.stringify({ error: "Forbidden: admin only" }), {
    });
  }

  const { data: rows, error } = await admin
    .from("profiles")
    .select("id, avatar_url")
    .ilike("avatar_url", "%storage/v1/object/public/face-verification/%");

  if (error) {
    return new Response(JSON.stringify({ error: error.message }), {
    });
  }

  const results: Array<Record<string, unknown>> = [];
  for (const row of rows ?? []) {
    const url: string = row.avatar_url ?? "";
    const m = url.match(/\/storage\/v1\/object\/public\/face-verification\/(.+)$/);
    if (!m) { results.push({ id: row.id, skipped: "no-match" }); continue; }
    const srcKey = decodeURIComponent(m[1]);
    const ext = (srcKey.split(".").pop() || "jpg").toLowerCase();
    const destKey = `${row.id}/face-verified-${Date.now()}.${ext}`;

    try {
      const dl = await admin.storage.from("face-verification").download(srcKey);
      if (dl.error || !dl.data) { results.push({ id: row.id, error: dl.error?.message ?? "download-failed", srcKey }); continue; }
      const up = await admin.storage.from("avatars").upload(destKey, dl.data, {
        upsert: true,
        contentType: dl.data.type || (ext === "png" ? "image/png" : ext === "webp" ? "image/webp" : "image/jpeg"),
      });
      if (up.error) { results.push({ id: row.id, error: up.error.message, srcKey }); continue; }
      const newUrl = admin.storage.from("avatars").getPublicUrl(destKey).data.publicUrl;
      const upd = await admin.from("profiles").update({ avatar_url: newUrl }).eq("id", row.id);
      if (upd.error) { results.push({ id: row.id, error: upd.error.message }); continue; }
      results.push({ id: row.id, ok: true, newUrl });
    } catch (e) {
      results.push({ id: row.id, error: e instanceof Error ? e.message : String(e) });
    }
  }

  return new Response(JSON.stringify({
    total: rows?.length ?? 0,
    ok: results.filter((r) => r.ok).length,
    failed: results.filter((r) => r.error).length,
    results,
  }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
});
