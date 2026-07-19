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

const decodePathSafely = (value: string) => {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
};

const extractGiftPath = (value: string) => {
  const cleaned = decodePathSafely(value).trim().replace(/^\[?Gift:\s*/i, "");
  const embeddedProxyMatch = cleaned.match(/(?:public-gift-media|chat-media)\/(gifts\/[^\s|\]]+)/i);
  if (embeddedProxyMatch?.[1]) return decodePathSafely(embeddedProxyMatch[1]);

  const plainGiftMatch = cleaned.match(/^(gifts\/[^\s|\]]+)/i);
  if (plainGiftMatch?.[1]) return decodePathSafely(plainGiftMatch[1]);

  const firstToken = (cleaned.match(/https?:\/{1,2}[^\s|\]]+/i)?.[0] || cleaned).split(/[\s|\]]/)[0].replace(/^\/+/, "");
  const normalizedToken = firstToken.replace(/^https:\/([^/])/i, "https://$1").replace(/^http:\/([^/])/i, "http://$1");

  try {
    const parsed = new URL(normalizedToken);
    const proxyMatch = parsed.pathname.match(/\/functions\/v1\/public-gift-media\/(gifts\/[^\s|\]]+)/i);
    if (proxyMatch?.[1]) return decodePathSafely(proxyMatch[1]);
    const chatMatch = parsed.pathname.match(/\/storage\/v1\/object\/public\/chat-media\/(gifts\/[^\s|\]]+)/i);
    if (chatMatch?.[1]) return decodePathSafely(chatMatch[1]);
    const publicGiftMatch = parsed.pathname.match(/\/storage\/v1\/object\/public\/gifts\/(legacy-chat-media\/[^\s|\]]+)/i);
    if (publicGiftMatch?.[1]) return `gifts/${decodePathSafely(publicGiftMatch[1].replace(/^legacy-chat-media\//, ""))}`;
  } catch {
    // Not a full URL; validate as a plain storage key below.
  }

  return firstToken;
};

const isValidGiftPath = (path: string) => {
  // Must live under gifts/, no traversal, no null/backslash/whitespace/control
  // chars, no URL separators. Allow any other printable character (incl. %,
  // unicode, brackets) so legitimate uploaded filenames aren't rejected.
  if (!path.startsWith("gifts/")) return false;
  if (path.includes("..") || path.includes("\\") || path.includes("\0")) return false;
  if (/[\s?#]/.test(path)) return false;
  // eslint-disable-next-line no-control-regex
  if (/[\x00-\x1f\x7f]/.test(path)) return false;
  return true;
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
    const marker = "/public-gift-media/";
    const markerIndex = url.pathname.indexOf(marker);
    const rawPath = markerIndex >= 0 ? url.pathname.slice(markerIndex + marker.length) : "";
    const queryPath = String(url.searchParams.get("path") || "");
    const path = extractGiftPath(rawPath || queryPath);

    if (!path || !isValidGiftPath(path)) {
      return new Response(JSON.stringify({ error: "Invalid gift media path" }), {
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { auth: { persistSession: false } },
    );

    const publicGiftPath = `legacy-chat-media/${path.replace(/^gifts\//, "")}`;
    const publicGiftUrl = `${Deno.env.get("SUPABASE_URL")}/storage/v1/object/public/gifts/${publicGiftPath.split("/").map(encodeURIComponent).join("/")}`;

    // Prefer the real public gifts bucket first. If the asset has already been
    // copied there, redirect viewers to Supabase Storage CDN instead of proxying
    // the bytes through this Edge Function on every request.
    const existingPublic = await supabase.storage.from("gifts").download(publicGiftPath);
    if (existingPublic.data && !existingPublic.error) {
      return new Response(null, {
          ...corsHeaders,
          "Location": publicGiftUrl,
          "Cache-Control": "public, max-age=604800, immutable",
          "X-Gift-Public-Url": publicGiftUrl,
        },
      });
    }

    const { data, error } = await supabase.storage.from("chat-media").download(path);
    if (error || !data) {
      return new Response(JSON.stringify({ error: "Gift media not found" }), {
      });
    }

    const ext = (path.split(".").pop() || "").toLowerCase().split(/[?#]/)[0];
    const contentType = usefulMimeType(data.type) || MIME[ext] || "application/octet-stream";
    const body = req.method === "HEAD" ? null : data;

    // Lazy-copy old chat-media/gifts assets into the real public gifts bucket,
    // then redirect this same request to the public CDN. If another request won
    // the race and uploaded first, duplicate errors are harmless; redirect still works.
    if (data.size > 0) {
      const uploadResult = await supabase.storage.from("gifts").upload(publicGiftPath, data, {
        upsert: false,
        contentType,
        cacheControl: "31536000",
      });
      if (!uploadResult.error || /already exists|duplicate/i.test(uploadResult.error.message || "")) {
        return new Response(null, {
            ...corsHeaders,
            "Location": publicGiftUrl,
            "Cache-Control": "public, max-age=604800, immutable",
            "X-Gift-Public-Url": publicGiftUrl,
          },
        });
      }
    }

    return new Response(body, {
        ...corsHeaders,
        "Content-Type": contentType,
        "Content-Length": String(data.size),
        "Cache-Control": "public, max-age=604800, immutable",
        "Accept-Ranges": "bytes",
        "X-Gift-Public-Url": publicGiftUrl,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Gift media proxy failed";
    return new Response(JSON.stringify({ error: message }), {
    });
  }
});
