import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-admin-token, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

interface UpdateSubAdminRequest {
  admin_user_id: string;
  action: "update_password" | "toggle_block" | "delete";
  new_password?: string;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    console.log("[update-sub-admin] Starting request...");
    
    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      { auth: { autoRefreshToken: false, persistSession: false } }
    );

    // Verify the requesting admin session is an owner
    const adminToken = req.headers.get("x-admin-token");
    if (!adminToken || adminToken.length < 16) {
      console.error("[update-sub-admin] No admin session token");
      return new Response(
        JSON.stringify({ error: "Admin session required" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { data: sessionRow } = await supabaseAdmin
      .from("admin_sessions")
      .select("admin_user_id, expires_at")
      .eq("session_token", adminToken)
      .gt("expires_at", new Date().toISOString())
      .maybeSingle();
    const { data: requestingAdmin } = sessionRow?.admin_user_id
      ? await supabaseAdmin.from("admin_users").select("id, role, is_active").eq("id", sessionRow.admin_user_id).maybeSingle()
      : { data: null } as any;

    if (!requestingAdmin?.is_active || requestingAdmin.role !== "owner") {
      console.error("[update-sub-admin] Requesting admin is not owner");
      return new Response(
        JSON.stringify({ error: "Only Owners can manage sub-admins" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log("[update-sub-admin] Requesting admin:", requestingAdmin.id);

    const body = await req.json();
    const { admin_user_id, action, new_password }: UpdateSubAdminRequest = body;

    console.log("[update-sub-admin] Action:", action, "for admin_user_id:", admin_user_id);

    if (!admin_user_id) {
      return new Response(
        JSON.stringify({ error: "admin_user_id is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Get the admin user
    const { data: adminUser, error: fetchError } = await supabaseAdmin
      .from("admin_users")
      .select("*")
      .eq("id", admin_user_id)
      .single();

    if (fetchError || !adminUser) {
      console.error("[update-sub-admin] Admin user not found:", fetchError?.message);
      return new Response(
        JSON.stringify({ error: "Admin not found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Cannot modify owner
    if (adminUser.role === "owner") {
      console.error("[update-sub-admin] Cannot modify owner account");
      return new Response(
        JSON.stringify({ error: "Owner account cannot be modified" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    let result: Record<string, unknown> = { success: true };

    switch (action) {
      case "update_password":
        console.log("[update-sub-admin] Updating password...");
        
        if (!new_password || new_password.length < 6) {
          return new Response(
          JSON.stringify({ error: "Password must be at least 6 characters" }),
            { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        if (adminUser.user_id) {
          const { error: updateError } = await supabaseAdmin.auth.admin.updateUserById(
            adminUser.user_id,
            { password: new_password }
          );

          if (updateError) {
            console.error("[update-sub-admin] Password update error:", updateError.message);
            return new Response(
              JSON.stringify({ error: "Failed to update password: " + updateError.message }),
              { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
            );
          }
          console.log("[update-sub-admin] Password updated successfully");
        } else {
          return new Response(
            JSON.stringify({ error: "This admin has no user_id" }),
            { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
        result.message = "Password changed successfully";
        break;

      case "toggle_block":
        console.log("[update-sub-admin] Toggling block status...");
        
        const newStatus = !adminUser.is_active;
        
        const { error: blockError } = await supabaseAdmin
          .from("admin_users")
          .update({ is_active: newStatus })
          .eq("id", admin_user_id);

        if (blockError) {
          console.error("[update-sub-admin] Block toggle error:", blockError.message);
          return new Response(
            JSON.stringify({ error: "Failed to change status" }),
            { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        // Also disable/enable the auth user
        if (adminUser.user_id) {
          const { error: banError } = await supabaseAdmin.auth.admin.updateUserById(
            adminUser.user_id,
            { ban_duration: newStatus ? "none" : "876000h" } // ~100 years if blocked
          );
          
          if (banError) {
            console.error("[update-sub-admin] Auth ban error:", banError.message);
            // Don't fail completely, DB status is already updated
          }
        }

        console.log("[update-sub-admin] Block status toggled:", newStatus ? "unblocked" : "blocked");
        result.message = newStatus ? "Sub-admin unblocked" : "Sub-admin blocked";
        result.is_active = newStatus;
        break;

      case "delete":
        console.log("[update-sub-admin] Deleting sub-admin...");
        
        // Delete auth user first
        if (adminUser.user_id) {
          const { error: deleteAuthError } = await supabaseAdmin.auth.admin.deleteUser(adminUser.user_id);
          if (deleteAuthError) {
            console.error("[update-sub-admin] Auth delete error:", deleteAuthError.message);
            // Continue with DB delete anyway
          }
        }

        // Delete admin user record (cascade will delete permissions)
        const { error: deleteError } = await supabaseAdmin
          .from("admin_users")
          .delete()
          .eq("id", admin_user_id);

        if (deleteError) {
          console.error("[update-sub-admin] DB delete error:", deleteError.message);
          return new Response(
            JSON.stringify({ error: "Failed to delete sub-admin" }),
            { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        console.log("[update-sub-admin] Sub-admin deleted successfully");
        result.message = "Sub-admin deleted successfully";
        break;

      default:
        return new Response(
          JSON.stringify({ error: "Unknown action" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
    }

    return new Response(
      JSON.stringify(result),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error: unknown) {
    console.error("[update-sub-admin] Unexpected error:", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return new Response(
      JSON.stringify({ error: "Server error: " + message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});