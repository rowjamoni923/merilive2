// Generate premium 3D event banners on demand via Lovable AI Gateway (Nano Banana)
// Saves PNG to `banners` storage bucket and returns the public URL.
// Supports exact output dimensions via server-side resize/crop (ImageScript).
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { decode, Image } from "https://deno.land/x/imagescript@1.2.17/mod.ts";
import { requireAdminSession } from "../_shared/adminAuth.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-admin-token",
};

const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY")!;
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const BUCKET = "banners";

// Whitelisted output size presets (admin-curated). Pixel-exact via cover-crop.
const SIZE_PRESETS: Record<string, { w: number; h: number; aspect: string; label: string }> = {
  "banner_16_9_1920": { w: 1920, h: 1080, aspect: "16:9", label: "Hero Banner 1920×1080" },
  "banner_16_9_1280": { w: 1280, h: 720,  aspect: "16:9", label: "Standard Banner 1280×720" },
  "square_1080":      { w: 1080, h: 1080, aspect: "1:1",  label: "Square 1080×1080" },
  "story_1080":       { w: 1080, h: 1920, aspect: "9:16", label: "Story / Reel 1080×1920" },
  "portrait_4_5":     { w: 1080, h: 1350, aspect: "4:5",  label: "Portrait 1080×1350" },
  "wide_3_2":         { w: 1500, h: 1000, aspect: "3:2",  label: "Wide 1500×1000" },
  "push_thumb":       { w: 512,  h: 512,  aspect: "1:1",  label: "Push Thumbnail 512×512" },
};

function slug(s: string) {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "").slice(0, 48);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const supa = createClient(SUPABASE_URL, SERVICE_ROLE);
    const gate = await requireAdminSession(req, supa, { sectionKey: "banners", requireEdit: true });
    if (!gate.ok) {
      return new Response(JSON.stringify({ error: gate.error }), {
        status: gate.status,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json();
    const { eventName, customPrompt, style, sizeKey } = body ?? {};
    if (!eventName || typeof eventName !== "string") {
      return new Response(JSON.stringify({ error: "eventName required" }), {
      });
    }

    const preset = SIZE_PRESETS[sizeKey as string] ?? SIZE_PRESETS["banner_16_9_1920"];
    const eventTitle = String(eventName).trim().slice(0, 80);

    const styleClause = (style && String(style).trim()) ||
      `Ultra-premium luxurious 3D rendered marketing banner, midnight indigo and royal gold palette, deep cinematic lighting, glossy reflections, rich volumetric glow, sparkles, floating diamonds and crystals, depth of field, octane render quality. Bold ornate 3D typography centered, premium gold + indigo gradient with rim light. ${preset.aspect} aspect ratio, no watermarks, no logos, no extra text besides the title.`;
    const prompt = (customPrompt && String(customPrompt).trim()) ||
      `Premium 3D marketing banner for a live-streaming social entertainment app. Event title (must be the only readable text, rendered in bold 3D luxury typography, perfectly spelled): ${eventTitle}. ${styleClause} Final composition must fill a ${preset.w}x${preset.h} pixel canvas (${preset.aspect}).`;

    const aiRes = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      body: JSON.stringify({
        model: "google/gemini-2.5-flash-image",
        messages: [{ role: "user", content: prompt }],
        modalities: ["image", "text"],
      }),
    });

    if (!aiRes.ok) {
      const t = await aiRes.text();
      return new Response(
        JSON.stringify({ error: `AI gateway ${aiRes.status}: ${t.slice(0, 400)}` }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const aiJson = await aiRes.json();
    const dataUrl: string | undefined = aiJson?.choices?.[0]?.message?.images?.[0]?.image_url?.url;
    if (!dataUrl?.startsWith("data:image")) {
      return new Response(JSON.stringify({ error: "No image returned" }), {
      });
    }

    const base64 = dataUrl.split(",")[1];
    const rawBytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));

    // Cover-crop resize to exact preset dimensions
    let outBytes = rawBytes;
    try {
      const img = await decode(rawBytes);
      if (img instanceof Image) {
        const srcW = img.width, srcH = img.height;
        const targetRatio = preset.w / preset.h;
        const srcRatio = srcW / srcH;
        let cropW = srcW, cropH = srcH, cropX = 0, cropY = 0;
        if (srcRatio > targetRatio) {
          cropW = Math.round(srcH * targetRatio);
          cropX = Math.round((srcW - cropW) / 2);
        } else if (srcRatio < targetRatio) {
          cropH = Math.round(srcW / targetRatio);
          cropY = Math.round((srcH - cropH) / 2);
        }
        img.crop(cropX, cropY, cropW, cropH);
        img.resize(preset.w, preset.h);
        outBytes = await img.encode();
      }
    } catch (resizeErr) {
      console.warn("[generate-event-banner] resize failed, using original", resizeErr);
    }

    const path = `ai-events/${slug(eventName)}-${preset.w}x${preset.h}-${Date.now()}.png`;
    const { error: upErr } = await supa.storage
      .from(BUCKET)
      .upload(path, outBytes, { contentType: "image/png", upsert: false });
    if (upErr) throw upErr;

    const { data: pub } = supa.storage.from(BUCKET).getPublicUrl(path);
    return new Response(
      JSON.stringify({
        url: pub.publicUrl,
        path,
        eventName,
        size: { width: preset.w, height: preset.h, aspect: preset.aspect, key: sizeKey ?? "banner_16_9_1920", label: preset.label },
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e?.message || String(e) }), {
    });
  }
});
