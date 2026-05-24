import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { requireAdminSession } from "../_shared/adminAuth.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-admin-token, x-client-platform, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
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

const replaceLegacyGiftUrl = (value: string | null | undefined, path: string, publicUrl: string, supabaseUrl: string) => {
  if (!value) return value ?? null;
  const encodedPath = path.split("/").map(encodeURIComponent).join("/");
  return value
    .replace(`${supabaseUrl}/storage/v1/object/public/chat-media/${path}`, publicUrl)
    .replace(`${supabaseUrl}/storage/v1/object/public/chat-media/${encodedPath}`, publicUrl)
    .replace(`${supabaseUrl}/functions/v1/public-gift-media/${path}`, publicUrl)
    .replace(`${supabaseUrl}/functions/v1/public-gift-media/${encodedPath}`, publicUrl);
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const supabase = createClient(
      supabaseUrl,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      { auth: { autoRefreshToken: false, persistSession: false } },
    );

    const auth = await requireAdminSession(req, supabase, { sectionKey: "gifts", requireEdit: true });
    if (!auth.ok) {
      return new Response(JSON.stringify({ error: auth.error }), {
        status: auth.status,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: legacyObjects, error: listError } = await supabase.storage
      .from("chat-media")
      .list("gifts", { limit: 1000, sortBy: { column: "name", order: "asc" } });

    if (listError) throw listError;

    const moved: Array<{ from: string; to: string; publicUrl: string }> = [];
    const failed: Array<{ path: string; error: string }> = [];

    for (const object of legacyObjects || []) {
      if (!object.name || object.name === ".emptyFolderPlaceholder") continue;
      const sourcePath = `gifts/${object.name}`;
      const targetPath = `legacy-chat-media/${object.name}`;

      try {
        const { data: file, error: downloadError } = await supabase.storage.from("chat-media").download(sourcePath);
        if (downloadError || !file) throw downloadError || new Error("Download failed");

        const ext = (object.name.split(".").pop() || "").toLowerCase();
        const contentType = usefulMimeType(file.type) || MIME[ext] || "application/octet-stream";
        const { error: uploadError } = await supabase.storage.from("gifts").upload(targetPath, file, {
          upsert: true,
          contentType,
          cacheControl: "31536000",
        });
        if (uploadError) throw uploadError;

        const { data: publicData } = supabase.storage.from("gifts").getPublicUrl(targetPath);
        moved.push({ from: sourcePath, to: targetPath, publicUrl: publicData.publicUrl });
      } catch (error) {
        failed.push({ path: sourcePath, error: error instanceof Error ? error.message : "Unknown migration error" });
      }
    }

    const { data: gifts, error: giftsError } = await supabase
      .from("gifts")
      .select("id, icon_url, animation_url, sound_url");
    if (giftsError) throw giftsError;

    let updatedRows = 0;
    for (const gift of gifts || []) {
      let iconUrl = gift.icon_url as string | null;
      let animationUrl = gift.animation_url as string | null;
      let soundUrl = gift.sound_url as string | null;

      for (const item of moved) {
        iconUrl = replaceLegacyGiftUrl(iconUrl, item.from, item.publicUrl, supabaseUrl);
        animationUrl = replaceLegacyGiftUrl(animationUrl, item.from, item.publicUrl, supabaseUrl);
        soundUrl = replaceLegacyGiftUrl(soundUrl, item.from, item.publicUrl, supabaseUrl);
      }

      if (iconUrl !== gift.icon_url || animationUrl !== gift.animation_url || soundUrl !== gift.sound_url) {
        const { error: updateError } = await supabase
          .from("gifts")
          .update({ icon_url: iconUrl, animation_url: animationUrl, sound_url: soundUrl })
          .eq("id", gift.id);
        if (updateError) throw updateError;
        updatedRows += 1;
      }
    }

    await supabase.from("admin_logs").insert({
      admin_id: auth.admin.id,
      action_type: "gift_media_public_bucket_migration",
      target_type: "storage",
      details: { moved_count: moved.length, failed_count: failed.length, updated_gifts: updatedRows },
    }).then(() => undefined, () => undefined);

    return new Response(JSON.stringify({ success: true, moved_count: moved.length, failed_count: failed.length, updated_gifts: updatedRows, failed }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : "Migration failed" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});