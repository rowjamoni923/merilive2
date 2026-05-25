import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { requireAdminSession } from "../_shared/adminAuth.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-admin-token, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

interface UpdateSubAdminRequest {
  admin_user_id: string;
  action: "update_password" | "toggle_block" | "delete";
  new_password?: string;
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  try {
    console.log("[update-sub-admin] Starting request...");
    
    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      { auth: { autoRefreshToken: false, persistSession: false } }
    );

    // Verify the requesting admin session is an approved owner device.
    const auth = await requireAdminSession(req, supabaseAdmin, { ownerOnly: true });
    if (!auth.ok) {
      console.error("[update-sub-admin] Owner admin session rejected:", auth.error);
      return json({ error: auth.error }, auth.status);
    }
    const requestingAdmin = auth.admin;

    console.log("[update-sub-admin] Requesting admin:", requestingAdmin.id);

    const body = await req.json().catch(() => ({}));
    const { admin_user_id, action, new_password }: UpdateSubAdminRequest = body;

    console.log("[update-sub-admin] Action:", action, "for admin_user_id:", admin_user_id);

    if (!admin_user_id || !uuidRegex.test(admin_user_id)) {
      return json({ error: "Valid admin_user_id is required" }, 400);
    }
    if (!["update_password", "toggle_block", "delete"].includes(action)) {
      return json({ error: "Unknown action" }, 400);
    }

    // Get the admin user
    const { data: adminUser, error: fetchError } = await supabaseAdmin
      .from("admin_users")
      .select("*")
      .eq("id", admin_user_id)
      .single();

    if (fetchError || !adminUser) {
      console.error("[update-sub-admin] Admin user not found:", fetchError?.message);
      return json({ error: "Admin not found" }, 404);
    }

    // Cannot modify owner
    if (adminUser.role === "owner") {
      console.error("[update-sub-admin] Cannot modify owner account");
      return json({ error: "Owner account cannot be modified" }, 403);
    }

    let result: Record<string, unknown> = { success: true };

    switch (action) {
      case "update_password":
        console.log("[update-sub-admin] Updating password...");
        
        if (typeof new_password !== "string" || new_password.length < 8 || new_password.length > 128) {
          return json({ error: "Password must be 8-128 characters" }, 400);
        }

        const { data: passwordResult, error: passwordError } = await supabaseAdmin.rpc("service_set_admin_password", {
          _admin_user_id: adminUser.id,
          _new_password: new_password,
        });
        if (passwordError || !(passwordResult as any)?.success) {
          console.error("[update-sub-admin] Password update error:", passwordError?.message || (passwordResult as any)?.error);
          return json({ error: (passwordResult as any)?.error || "Failed to update password" }, 400);
        }
        console.log("[update-sub-admin] Password updated successfully");
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
          return json({ error: "Failed to change status" }, 400);
        }

        if (!newStatus) {
          await supabaseAdmin.from("admin_sessions").delete().eq("admin_user_id", admin_user_id);
        }

        console.log("[update-sub-admin] Block status toggled:", newStatus ? "unblocked" : "blocked");
        result.message = newStatus ? "Sub-admin unblocked" : "Sub-admin blocked";
        result.is_active = newStatus;
        break;

      case "delete":
        console.log("[update-sub-admin] Deleting sub-admin...");

        await supabaseAdmin.from("admin_sessions").delete().eq("admin_user_id", admin_user_id);

        // Delete admin user record (cascade will delete permissions)
        const { error: deleteError } = await supabaseAdmin
          .from("admin_users")
          .delete()
          .eq("id", admin_user_id);

        if (deleteError) {
          console.error("[update-sub-admin] DB delete error:", deleteError.message);
          return json({ error: "Failed to delete sub-admin" }, 400);
        }

        console.log("[update-sub-admin] Sub-admin deleted successfully");
        result.message = "Sub-admin deleted successfully";
        break;

      default:
        return json({ error: "Unknown action" }, 400);
    }

    return json(result, 200);

  } catch (error: unknown) {
    console.error("[update-sub-admin] Unexpected error:", error);
    return json({ error: "Server error" }, 500);
  }
});