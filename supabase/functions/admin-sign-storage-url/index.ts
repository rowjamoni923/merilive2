import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-admin-token, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const DENIED_BUCKETS = new Set(["system", "vault"]);

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const adminToken = req.headers.get("x-admin-token");
    if (!adminToken || adminToken.length < 16) {
      return new Response(JSON.stringify({ success: false, error: "Admin session required" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { data: sessionRow } = await supabase
      .from("admin_sessions")
      .select("admin_user_id")
      .eq("session_token", adminToken)
      .gt("expires_at", new Date().toISOString())
      .maybeSingle();

    if (!sessionRow?.admin_user_id) {
      return new Response(JSON.stringify({ success: false, error: "Invalid admin session" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: adminUser } = await supabase
      .from("admin_users")
      .select("id")
      .eq("id", sessionRow.admin_user_id)
      .eq("is_active", true)
      .maybeSingle();

    if (!adminUser) {
      return new Response(JSON.stringify({ success: false, error: "Admin access required" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json().catch(() => ({}));
    const bucket = String(body.bucket || "").trim();
    const path = String(body.path || "").replace(/^\/+/, "");
    const expiresIn = Math.min(Math.max(Number(body.expiresIn || 3600), 60), 3600);

    if (!bucket || DENIED_BUCKETS.has(bucket) || !path || path.includes("..")) {
      return new Response(JSON.stringify({ success: false, error: "Invalid storage path" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: bucketRow } = await supabase
      .schema("storage")
      .from("buckets")
      .select("id")
      .eq("id", bucket)
      .maybeSingle();

    if (!bucketRow) {
      return new Response(JSON.stringify({ success: false, error: "Bucket not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data, error } = await supabase.storage.from(bucket).createSignedUrl(path, expiresIn);
    if (error || !data?.signedUrl) {
      return new Response(JSON.stringify({ success: false, error: error?.message || "Failed to sign URL" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const ext = (path.split(".").pop() || "").toLowerCase().split(/[?#]/)[0];
    const MIME: Record<string, string> = {
      mp4: "video/mp4", m4v: "video/mp4", mov: "video/quicktime", qt: "video/quicktime",
      webm: "video/webm", ogv: "video/ogg", ogg: "video/ogg",
      mkv: "video/x-matroska", avi: "video/x-msvideo",
      "3gp": "video/3gpp", "3gpp": "video/3gpp", "3g2": "video/3gpp2",
      mpg: "video/mpeg", mpeg: "video/mpeg", hevc: "video/mp4", ts: "video/mp2t",
      m3u8: "application/vnd.apple.mpegurl", mpd: "application/dash+xml",
      jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", gif: "image/gif",
      webp: "image/webp", avif: "image/avif", svg: "image/svg+xml", bmp: "image/bmp",
      heic: "image/heic", heif: "image/heif",
      mp3: "audio/mpeg", wav: "audio/wav", aac: "audio/aac", flac: "audio/flac", m4a: "audio/mp4",
      pdf: "application/pdf",
    };
    const contentType = MIME[ext];

    // Best-effort: backfill stored mimetype so storage serves the correct Content-Type header.
    if (contentType) {
      try {
        await supabase
          .schema("storage")
          .from("objects")
          .update({ metadata: { mimetype: contentType } as any })
          .eq("bucket_id", bucket)
          .eq("name", path)
          .or("metadata->>mimetype.is.null,metadata->>mimetype.eq.application/octet-stream,metadata->>mimetype.eq.application/json");
      } catch (_) { /* non-fatal */ }
    }

    return new Response(JSON.stringify({ success: true, signedUrl: data.signedUrl, contentType: contentType || null }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    return new Response(JSON.stringify({ success: false, error: error instanceof Error ? error.message : "Unknown error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
