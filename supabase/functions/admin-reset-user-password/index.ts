import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

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

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!supabaseUrl || !serviceKey) {
      console.error("[admin-reset-user-password] Missing env");
      return json({ error: "Server configuration error" }, 500);
    }
    const adminClient = createClient(supabaseUrl, serviceKey);

    // ── Admin session validation via x-admin-token (matches adminSupabase client)
    const adminToken = req.headers.get("x-admin-token");
    if (!adminToken) {
      return json({ error: "Admin session required" }, 401);
    }

    const { data: sessionRow, error: sessionErr } = await adminClient
      .from("admin_sessions")
      .select("admin_user_id, expires_at")
      .eq("session_token", adminToken)
      .gt("expires_at", new Date().toISOString())
      .maybeSingle();

    if (sessionErr) {
      console.error("[admin-reset-user-password] session lookup failed:", sessionErr);
      return json({ error: "Admin session lookup failed" }, 500);
    }
    if (!sessionRow?.admin_user_id) {
      return json({ error: "Admin session expired" }, 401);
    }

    const { data: adminUser, error: adminErr } = await adminClient
      .from("admin_users")
      .select("id, role, is_active")
      .eq("id", sessionRow.admin_user_id)
      .maybeSingle();

    if (adminErr || !adminUser || !adminUser.is_active) {
      return json({ error: "Admin access required" }, 403);
    }

    // ── Body
    let body: any = {};
    try {
      body = await req.json();
    } catch {
      return json({ error: "Invalid JSON body" }, 400);
    }
    const user_id = body?.user_id;
    if (!user_id || typeof user_id !== "string") {
      return json({ error: "user_id is required" }, 400);
    }

    // ── Generate temp password
    const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";
    let tempPassword = "Temp@";
    for (let i = 0; i < 8; i++) {
      tempPassword += chars.charAt(Math.floor(Math.random() * chars.length));
    }

    // ── Reset password
    const { error: updateError } = await adminClient.auth.admin.updateUserById(user_id, {
      password: tempPassword,
    });
    if (updateError) {
      console.error("[admin-reset-user-password] Update failed:", updateError);
      return json({ error: "Failed to reset password: " + updateError.message }, 500);
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
