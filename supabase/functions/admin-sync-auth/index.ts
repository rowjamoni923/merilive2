import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

/**
 * Admin Sync Auth - Current Server Only
 * 
 * Creates auth accounts for admin users that exist in admin_users table
 * but don't have a corresponding auth account yet.
 * All data comes from the CURRENT database only - no legacy server dependency.
 */
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { email, password } = await req.json();

    if (!email || !password) {
      return new Response(
        JSON.stringify({ error: "Email and password are required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const normalizedEmail = email.trim().toLowerCase();

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const adminClient = createClient(supabaseUrl, supabaseServiceKey);

    // 1. Check if this email exists in admin_users
    const { data: adminUser, error: adminError } = await adminClient
      .from("admin_users")
      .select("id, user_id, email, display_name, role, is_active")
      .ilike("email", normalizedEmail)
      .eq("is_active", true)
      .maybeSingle();

    if (adminError) {
      console.error("[admin-sync-auth] Failed reading admin_users:", adminError);
    }

    if (!adminUser) {
      console.log("[admin-sync-auth] Email not found in admin_users:", normalizedEmail);
      return new Response(
        JSON.stringify({ success: false, reason: "not_found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 2. Check if auth account already exists
    let existingUserId: string | null = null;
    const perPage = 200;
    let page = 1;

    while (true) {
      const { data: listData, error: listError } = await adminClient.auth.admin.listUsers({ page, perPage });
      if (listError) {
        console.error("[admin-sync-auth] listUsers error:", listError);
        break;
      }
      const users = listData?.users ?? [];
      const matched = users.find((u) => u.email?.toLowerCase() === normalizedEmail);
      if (matched) {
        existingUserId = matched.id;
        break;
      }
      if (users.length < perPage) break;
      page++;
    }

    if (existingUserId) {
      // Auth account exists — link user_id if needed
      if (adminUser && !adminUser.user_id) {
        await adminClient
          .from("admin_users")
          .update({ user_id: existingUserId })
          .ilike("email", normalizedEmail);
        console.log(`[admin-sync-auth] Linked user_id for: ${normalizedEmail}`);
      }

      // Try to update password for existing account
      const { error: updateAuthError } = await adminClient.auth.admin.updateUserById(existingUserId, {
        password,
        email_confirm: true,
        user_metadata: {
          full_name: adminUser.display_name || "",
          name: adminUser.display_name || "",
        },
      });

      if (updateAuthError) {
        console.error("[admin-sync-auth] Failed to update auth user:", updateAuthError);
        return new Response(
          JSON.stringify({ success: false, reason: "update_failed", error: updateAuthError.message }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      console.log(`[admin-sync-auth] Password synced for: ${normalizedEmail}`);
      return new Response(
        JSON.stringify({ success: true, action: "password_synced", user_id: existingUserId }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    } else {
      // No auth account — create one
      const { data: newUser, error: createError } = await adminClient.auth.admin.createUser({
        email: normalizedEmail,
        password,
        email_confirm: true,
        user_metadata: {
          full_name: adminUser.display_name || "",
          name: adminUser.display_name || "",
        },
      });

      if (createError) {
        console.error("[admin-sync-auth] Failed to create user:", createError);
        return new Response(
          JSON.stringify({ success: false, reason: "create_failed", error: createError.message }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Link user_id in admin_users
      if (newUser?.user) {
        await adminClient
          .from("admin_users")
          .update({ user_id: newUser.user.id })
          .ilike("email", normalizedEmail);
      }

      console.log(`[admin-sync-auth] ✅ Created new auth account for: ${normalizedEmail}`);
      return new Response(
        JSON.stringify({ success: true, action: "account_created" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
  } catch (err) {
    console.error("[admin-sync-auth] Error:", err);
    return new Response(
      JSON.stringify({ error: "Internal server error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
