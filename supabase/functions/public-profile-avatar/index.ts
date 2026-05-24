import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
};

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const admin = createClient(supabaseUrl, serviceKey);

const json = (body: unknown, status: number) => new Response(JSON.stringify(body), {
  status,
  headers: { ...corsHeaders, "Content-Type": "application/json" },
});

// Public proxy that serves PROFILE PHOTOS originally uploaded into the
// PRIVATE face-verification bucket (historical bug). We download via
// service role and stream back, so every viewer can render the avatar.
// Path: /public-profile-avatar/<userId>/<rest...>
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const url = new URL(req.url);
    const idx = url.pathname.indexOf("/public-profile-avatar/");
    if (idx === -1) return new Response("Not Found", { status: 404, headers: corsHeaders });
    const key = decodeURIComponent(url.pathname.slice(idx + "/public-profile-avatar/".length));
    if (!key || key.includes("..")) {
      return new Response("Bad key", { status: 400, headers: corsHeaders });
    }

    const { data: allowed, error: allowError } = await admin.rpc("is_public_profile_media_key", { _key: key });
    if (allowError || allowed !== true) {
      if (allowError) console.error("[public-profile-avatar] allow-list rpc failed", allowError.message);
      else console.warn("[public-profile-avatar] blocked unpublished key", key);
      return json({ error: "not-public-profile-media", key }, 403);
    }

    const dl = await admin.storage.from("face-verification").download(key);
    if (dl.error || !dl.data) {
      return json({ error: dl.error?.message ?? "not-found", key }, 404);
    }

    const ext = (key.split(".").pop() || "jpg").toLowerCase();
    const contentType = dl.data.type
      || (ext === "png" ? "image/png"
        : ext === "webp" ? "image/webp"
        : ext === "gif" ? "image/gif"
        : ext === "avif" ? "image/avif"
        : ext === "mp4" ? "video/mp4"
        : ext === "webm" ? "video/webm"
        : ext === "mov" || ext === "qt" ? "video/quicktime"
        : "image/jpeg");

    return new Response(dl.data, {
      status: 200,
      headers: {
        ...corsHeaders,
        "Content-Type": contentType,
        "Cache-Control": "public, max-age=86400, s-maxage=86400, immutable",
      },
    });
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : String(e) }, 500);
  }
});
