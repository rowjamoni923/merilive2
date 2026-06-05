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
  return /^gifts\/[A-Za-z0-9._~!$&'()+,;=:@/-]+$/.test(path)
    && !path.includes("..")
    && !path.includes("\\")
    && !path.includes("\0")
    && !/[\s|\]]/.test(path);
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
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    // Pkg423: STREAM the storage object directly (no 302 redirect).
    // Why: a redirect forces the <video> element to do TWO CORS preflights
    // (proxy + storage). Under preload-flood (many VAP gifts in the panel)
    // the second preflight is often ERR_ABORTED, the texture upload fails,
    // and the next VAP gift never plays. Streaming = ONE response, one
    // CORS context, full Range/Accept-Ranges pass-through so WebGL
    // texture2D + <video> seeking both work reliably.

    const pathWithoutGiftsPrefix = path.replace(/^gifts\//, "");
    const candidateKeys = [
      pathWithoutGiftsPrefix,
      pathWithoutGiftsPrefix.replace(/\.json$/i, ".mp4"),
      `legacy-chat-media/${pathWithoutGiftsPrefix}`,
    ].filter((k, i, arr) => k && arr.indexOf(k) === i);

    // Forward Range header so the browser can seek/byte-range fetch.
    const range = req.headers.get("range");
    const upstreamHeaders: Record<string, string> = {
      apikey: SERVICE_ROLE,
      Authorization: `Bearer ${SERVICE_ROLE}`,
    };
    if (range) upstreamHeaders["Range"] = range;

    let upstream: Response | null = null;
    let foundKey = "";
    for (const key of candidateKeys) {
      const encodedKey = key.split("/").map(encodeURIComponent).join("/");
      // Use the authenticated storage endpoint so private/public both work,
      // and so we never depend on the bucket being public.
      const objectUrl = `${SUPABASE_URL}/storage/v1/object/gifts/${encodedKey}`;
      const resp = await fetch(objectUrl, { method: req.method, headers: upstreamHeaders });
      if (resp.ok || resp.status === 206) {
        upstream = resp;
        foundKey = key;
        break;
      }
      // Drain to free the connection.
      try { await resp.body?.cancel(); } catch { /* noop */ }
    }

    // Legacy fallback: chat-media bucket.
    if (!upstream) {
      const encodedKey = path.split("/").map(encodeURIComponent).join("/");
      const legacyUrl = `${SUPABASE_URL}/storage/v1/object/chat-media/${encodedKey}`;
      const resp = await fetch(legacyUrl, { method: req.method, headers: upstreamHeaders });
      if (resp.ok || resp.status === 206) {
        upstream = resp;
        foundKey = path;
      } else {
        try { await resp.body?.cancel(); } catch { /* noop */ }
      }
    }

    if (!upstream) {
      return new Response(JSON.stringify({ error: "Gift media not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const ext = (foundKey.split(".").pop() || "").toLowerCase().split(/[?#]/)[0];
    const contentType = usefulMimeType(upstream.headers.get("content-type")) || MIME[ext] || "application/octet-stream";

    const outHeaders: Record<string, string> = {
      ...corsHeaders,
      "Content-Type": contentType,
      "Cache-Control": "public, max-age=604800, immutable",
      "Accept-Ranges": "bytes",
    };
    const contentLength = upstream.headers.get("content-length");
    if (contentLength) outHeaders["Content-Length"] = contentLength;
    const contentRange = upstream.headers.get("content-range");
    if (contentRange) outHeaders["Content-Range"] = contentRange;

    return new Response(req.method === "HEAD" ? null : upstream.body, {
      status: upstream.status,
      headers: outHeaders,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Gift media proxy failed";
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
