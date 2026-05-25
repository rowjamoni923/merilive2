import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { requireAdminSession } from "../_shared/adminAuth.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-admin-token, x-client-platform, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

/**
 * Force Reset Guest Password
 * 
 * When a guest user's password doesn't match the deterministic formula,
 * this function resets it using the Admin API to restore access.
 */
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const auth = await requireAdminSession(req, supabase, { sectionKey: "user-management", requireEdit: true });
    if (!auth.ok) return json({ error: auth.error }, auth.status);

    const { deviceId } = await req.json();

    if (typeof deviceId !== "string" || !/^device_[A-Za-z0-9_:-]{6,128}$/.test(deviceId)) {
      return json({ error: "Valid deviceId is required" }, 400);
    }

    // Find profile with this device_id
    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("id, display_name")
      .eq("device_id", deviceId)
      .eq("is_deleted", false)
      .eq("is_banned", false)
      .eq("is_blocked", false)
      .maybeSingle();

    if (profileError || !profile) {
      return json({ success: false, reason: "no_profile_found" });
    }

    const { data: bannedDevice } = await supabase
      .from("banned_devices")
      .select("id")
      .eq("device_id", deviceId)
      .eq("is_active", true)
      .or(`is_permanent.eq.true,expires_at.is.null,expires_at.gt.${new Date().toISOString()}`)
      .maybeSingle();
    if (bannedDevice?.id) return json({ success: false, reason: "device_banned" }, 403);

    // Deterministic credentials
    const guestEmail = `guest_${deviceId}@meri.local`;
    const guestPassword = `meri_${deviceId}_secure`;

    // Force update auth user with correct email + password
    const { error: updateError } = await supabase.auth.admin.updateUserById(
      profile.id,
      {
        email: guestEmail,
        password: guestPassword,
        email_confirm: true,
      }
    );

    if (updateError) {
      console.error("[force-reset-guest-password] Update failed:", updateError);
      return json({ success: false, reason: "update_failed", error: updateError.message }, 500);
    }

    console.log(`[force-reset-guest-password] ✅ Reset password for user ${profile.id} by admin ${auth.admin.id}`);

    return json({ success: true, userId: profile.id });
  } catch (err) {
    console.error("Error:", err);
    return json({ error: "Internal server error" }, 500);
  }
});
