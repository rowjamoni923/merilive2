import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, HEAD, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, range, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
  "Access-Control-Expose-Headers": "content-type, content-length, cache-control, accept-ranges, content-range",
};

const MIME: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  webp: "image/webp",
  gif: "image/gif",
  svg: "image/svg+xml",
  svga: "application/octet-stream",
  json: "application/json",
  mp4: "video/mp4",
  webm: "video/webm",
  mov: "video/quicktime",
  m4v: "video/mp4",
  mp3: "audio/mpeg",
  wav: "audio/wav",
  ogg: "audio/ogg",
  m4a: "audio/mp4",
};

const usefulMimeType = (value?: string | null) => {
  const clean = (value || "").split(";")[0].trim().toLowerCase();
  return clean && clean !== "application/octet-stream" ? clean : "";
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "GET" && req.method !== "HEAD") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const url = new URL(req.url);
    const rawPath = decodeURIComponent(url.pathname.split("/public-gift-media/")[1] || "").replace(/^\/+/, "");
    const queryPath = String(url.searchParams.get("path") || "").replace(/^\/+/, "");
    const path = (rawPath || queryPath).trim();

    if (!path || path.includes("..") || path.includes("\\0") || !path.startsWith("gifts/")) {
      return new Response(JSON.stringify({ error: "Invalid gift media path" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { auth: { persistSession: false } },
    );

    const { data, error } = await supabase.storage.from("chat-media").download(path);
    if (error || !data) {
      return new Response(JSON.stringify({ error: "Gift media not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const ext = (path.split(".").pop() || "").toLowerCase().split(/[?#]/)[0];
    const contentType = usefulMimeType(data.type) || MIME[ext] || "application/octet-stream";
    const body = req.method === "HEAD" ? null : data;

    return new Response(body, {
      status: 200,
      headers: {
        ...corsHeaders,
        "Content-Type": contentType,
        "Content-Length": String(data.size),
        "Cache-Control": "public, max-age=604800, immutable",
        "Accept-Ranges": "bytes",
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Gift media proxy failed";
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
