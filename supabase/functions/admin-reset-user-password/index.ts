import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { requireAdminSession } from "../_shared/adminAuth.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-admin-token, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function generateTempPassword(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789!@#$%^&*";
  const bytes = new Uint8Array(14);
  crypto.getRandomValues(bytes);
  return "Temp@" + Array.from(bytes, (b) => chars[b % chars.length]).join("");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!supabaseUrl || !serviceKey) {
      console.error("[admin-reset-user-password] Missing env");
      return json({ error: "Server configuration error" }, 500);
    }
    const adminClient = createClient(supabaseUrl, serviceKey);

    const auth = await requireAdminSession(req, adminClient, { sectionKey: "user-management", requireEdit: true });
    if (!auth.ok) return json({ error: auth.error }, auth.status);
    const adminUser = auth.admin;

    // ── Body
    let body: any = {};
    try {
      body = await req.json();
    } catch {
      return json({ error: "Invalid JSON body" }, 400);
    }
    const user_id = typeof body?.user_id === "string" ? body.user_id.trim() : "";
    if (!uuidRegex.test(user_id)) {
      return json({ error: "Valid user_id is required" }, 400);
    }

    const { data: targetAdmin } = await adminClient
      .from("admin_users")
      .select("id")
      .eq("user_id", user_id)
      .maybeSingle();
    if (targetAdmin?.id) {
      return json({ error: "Admin accounts cannot be reset from user tools" }, 403);
    }

    // ── Generate temp password
    const tempPassword = generateTempPassword();

    // ── Reset password
    const { error: updateError } = await adminClient.auth.admin.updateUserById(user_id, {
      password: tempPassword,
    });
    if (updateError) {
      console.error("[admin-reset-user-password] Update failed:", updateError);
      return json({ error: "Failed to reset password" }, 500);
    }

    // ── Best-effort audit log
    try {
      const { data: profile } = await adminClient
        .from("profiles")
        .select("display_name, app_uid")
        .eq("id", user_id)
        .maybeSingle();
      console.log(
        `[admin-reset-user-password] ✅ Reset for ${profile?.display_name || user_id} by admin ${adminUser.id}`,
      );
    } catch (e) {
      console.warn("[admin-reset-user-password] audit log skipped:", e);
    }

    return json({
      success: true,
      temp_password: tempPassword,
      message: "Password reset successful",
    });
  } catch (err: any) {
    console.error("[admin-reset-user-password] Unhandled:", err);
    return json({ error: err?.message || "Internal server error" }, 500);
  }
});
