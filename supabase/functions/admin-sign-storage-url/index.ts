import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-admin-token, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
  "Access-Control-Expose-Headers": "content-type, content-length, cache-control",
  "Access-Control-Max-Age": "86400",
};

const DENIED_BUCKETS = new Set(["system", "vault"]);
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

const usefulMimeType = (type?: string | null) => {
  const clean = (type || "").split(";")[0].trim().toLowerCase();
  return clean && clean !== "application/octet-stream" && clean !== "application/json" ? clean : "";
};

// Magic-byte sniff for the formats the face-verification flow actually emits.
// Returns "" when bytes don't match anything we trust.
const sniffMimeFromBytes = (bytes: Uint8Array): string => {
  if (bytes.length < 12) return "";
  // JPEG: FF D8 FF
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "image/jpeg";
  // PNG: 89 50 4E 47 0D 0A 1A 0A
  if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) return "image/png";
  // GIF
  if (bytes[0] === 0x47 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x38) return "image/gif";
  // RIFF....WEBP
  if (bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46 &&
      bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50) return "image/webp";
  // ISO BMFF (mp4/mov/heic): "....ftyp...."
  if (bytes[4] === 0x66 && bytes[5] === 0x74 && bytes[6] === 0x79 && bytes[7] === 0x70) {
    const brand = String.fromCharCode(bytes[8], bytes[9], bytes[10], bytes[11]).toLowerCase();
    if (brand.startsWith("qt")) return "video/quicktime";
    if (brand === "heic" || brand === "heix" || brand === "mif1") return "image/heic";
    return "video/mp4";
  }
  // EBML (webm/mkv): 1A 45 DF A3
  if (bytes[0] === 0x1a && bytes[1] === 0x45 && bytes[2] === 0xdf && bytes[3] === 0xa3) return "video/webm";
  // %PDF
  if (bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46) return "application/pdf";
  return "";
};

// Hard fallback for face bucket — when neither metadata, nor extension, nor
// sniff yields anything, default angle stills to JPG and recordings to MP4.
const faceBucketFallback = (bucket: string, path: string): string => {
  if (bucket !== "face-verification" && bucket !== "host-verification") return "";
  const lower = path.toLowerCase();
  if (lower.includes("/face-videos/") || lower.includes("/liveness/") || lower.includes("/video/") || lower.includes("/videos/")) return "video/mp4";
  if (lower.includes("/face-angles/") || lower.includes("/host-photos/") || lower.includes("/profile/") || lower.includes("/selfie")) return "image/jpeg";
  return "";
};

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

    const ext = (path.split(".").pop() || "").toLowerCase().split(/[?#]/)[0];
    const extensionContentType = MIME[ext];
    const { data: objectRow } = await supabase
      .schema("storage")
      .from("objects")
      .select("metadata")
      .eq("bucket_id", bucket)
      .eq("name", path)
      .maybeSingle();
    const storedContentType = usefulMimeType((objectRow?.metadata as Record<string, unknown> | null)?.mimetype as string | undefined);
    const contentType = storedContentType || extensionContentType;

    const extFallback = faceBucketFallback(bucket, path);

    if (String(body.mode || "").trim().toLowerCase() === "download") {
      const { data: fileBlob, error: downloadError } = await supabase.storage.from(bucket).download(path);
      if (downloadError || !fileBlob) {
        return new Response(JSON.stringify({ success: false, error: downloadError?.message || "Failed to download media" }), {
          status: 404,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Sniff actual magic bytes — most trustworthy source of truth.
      const head = new Uint8Array(await fileBlob.slice(0, 16).arrayBuffer().catch(() => new ArrayBuffer(0)));
      const sniffed = sniffMimeFromBytes(head);
      const resolvedType = sniffed
        || storedContentType
        || extensionContentType
        || usefulMimeType(fileBlob.type)
        || extFallback
        || "application/octet-stream";

      return new Response(fileBlob, {
        headers: {
          ...corsHeaders,
          "Content-Type": resolvedType,
          "Cache-Control": "private, max-age=120",
        },
      });
    }

    const { data, error } = await supabase.storage.from(bucket).createSignedUrl(path, expiresIn);
    if (error || !data?.signedUrl) {
      return new Response(JSON.stringify({ success: false, error: error?.message || "Failed to sign URL" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Backfill stored mimetype non-destructively so storage serves correct Content-Type next time.
    const backfillType = extensionContentType || extFallback;
    if (backfillType && !storedContentType) {
      try {
        const existingMeta = (objectRow?.metadata as Record<string, unknown> | null) || {};
        await supabase
          .schema("storage")
          .from("objects")
          .update({ metadata: { ...existingMeta, mimetype: backfillType } as any })
          .eq("bucket_id", bucket)
          .eq("name", path);
      } catch (_) { /* non-fatal */ }
    }

    return new Response(JSON.stringify({ success: true, signedUrl: data.signedUrl, contentType: contentType || extFallback || null }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    return new Response(JSON.stringify({ success: false, error: error instanceof Error ? error.message : "Unknown error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
