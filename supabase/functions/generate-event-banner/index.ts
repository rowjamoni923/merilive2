// Generate premium 3D event banners on demand via Lovable AI Gateway (Nano Banana)
// Saves PNG to `banners` storage bucket and returns the public URL.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-admin-token",
};

const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY")!;
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const BUCKET = "banners";

function slug(s: string) {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
    .slice(0, 48);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const { eventName, customPrompt, style } = await req.json();
    if (!eventName || typeof eventName !== "string") {
      return new Response(JSON.stringify({ error: "eventName required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const eventTitle = String(eventName).trim().slice(0, 80);
    const styleClause = (style && String(style).trim()) ||
      "Ultra-premium luxurious 3D rendered marketing banner, midnight indigo and royal gold palette, deep cinematic lighting, glossy reflections, rich volumetric glow, sparkles, floating diamonds and crystals, depth of field, octane render quality. Bold ornate 3D typography centered, premium gold + indigo gradient with rim light. 16:9 aspect ratio, no watermarks, no logos, no extra text besides the title.";
    const prompt = (customPrompt && String(customPrompt).trim()) ||
      `Premium 3D marketing banner for a live-streaming social entertainment app. Event title (must be the only readable text, rendered in bold 3D luxury typography, perfectly spelled): ${eventTitle}. ${styleClause}`;

    // Call Lovable AI Gateway - Nano Banana image generation
    const aiRes = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
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
    const dataUrl: string | undefined =
      aiJson?.choices?.[0]?.message?.images?.[0]?.image_url?.url;
    if (!dataUrl?.startsWith("data:image")) {
      return new Response(JSON.stringify({ error: "No image returned" }), {
        status: 502,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const base64 = dataUrl.split(",")[1];
    const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));

    const supa = createClient(SUPABASE_URL, SERVICE_ROLE);
    const path = `ai-events/${slug(eventName)}-${Date.now()}.png`;
    const { error: upErr } = await supa.storage
      .from(BUCKET)
      .upload(path, bytes, { contentType: "image/png", upsert: false });
    if (upErr) throw upErr;

    const { data: pub } = supa.storage.from(BUCKET).getPublicUrl(path);
    return new Response(
      JSON.stringify({ url: pub.publicUrl, path, eventName }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e?.message || String(e) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
