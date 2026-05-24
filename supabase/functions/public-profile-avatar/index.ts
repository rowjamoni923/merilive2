import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
};

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const admin = createClient(supabaseUrl, serviceKey);

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

    const dl = await admin.storage.from("face-verification").download(key);
    if (dl.error || !dl.data) {
      return new Response(JSON.stringify({ error: dl.error?.message ?? "not-found", key }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const ext = (key.split(".").pop() || "jpg").toLowerCase();
    const contentType = dl.data.type
      || (ext === "png" ? "image/png"
        : ext === "webp" ? "image/webp"
        : ext === "mp4" ? "video/mp4"
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
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : String(e) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
