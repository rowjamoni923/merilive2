import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

/**
 * Admin Sync Auth - Current Server Only (Admin + Regular Users)
 * 
 * Creates auth accounts for users that exist in admin_users OR profiles table
 * but don't have a corresponding auth account yet on the current server.
 * All data comes from the CURRENT database only.
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

    // 1. Check if this email exists in admin_users (admin flow)
    const { data: adminUser, error: adminError } = await adminClient
      .from("admin_users")
      .select("id, user_id, email, display_name, role, is_active")
      .ilike("email", normalizedEmail)
      .eq("is_active", true)
      .maybeSingle();

    if (adminError) {
      console.error("[admin-sync-auth] Failed reading admin_users:", adminError);
    }

    // 2. If not admin, check profiles table by email
    let profileUser: any = null;
    if (!adminUser) {
      const { data: profileByEmail } = await adminClient
        .from("profiles")
        .select("id, display_name, device_id, gender, avatar_url, app_uid, email")
        .eq("email", normalizedEmail)
        .maybeSingle();
      
      if (profileByEmail) {
        profileUser = profileByEmail;
      } else {
        // Check if this is a deterministic guest email (guest_{deviceId}@meri.local)
        const guestMatch = normalizedEmail.match(/^guest_(.+)@meri\.local$/);
        if (guestMatch) {
          const deviceId = guestMatch[1];
          const { data: profileByDevice } = await adminClient
            .from("profiles")
            .select("id, display_name, device_id, gender, avatar_url, app_uid, email")
            .eq("device_id", deviceId)
            .maybeSingle();
          
          if (profileByDevice) {
            profileUser = profileByDevice;
          }
        }
        
        // Check if this is a phone email (phone_{number}@meri.local)
        if (!profileUser) {
          const phoneMatch = normalizedEmail.match(/^phone_(.+)@meri\.local$/);
          if (phoneMatch) {
            const phoneNumber = phoneMatch[1];
            const { data: profileByPhone } = await adminClient
              .from("profiles")
              .select("id, display_name, device_id, gender, avatar_url, app_uid, email, phone_number")
              .eq("phone_number", phoneNumber)
              .maybeSingle();
            
            if (profileByPhone) {
              profileUser = profileByPhone;
            }
          }
        }
      }
    }

    if (!adminUser && !profileUser) {
      console.log("[admin-sync-auth] Email not found in admin_users or profiles:", normalizedEmail);
      return new Response(
        JSON.stringify({ success: false, reason: "not_found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Determine display name and metadata
    const displayName = adminUser?.display_name || profileUser?.display_name || "";
    const userGender = profileUser?.gender || null;
    const userDeviceId = profileUser?.device_id || null;

    // 3. Check if auth account already exists
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
      // Auth account exists — link user_id if needed (admin flow)
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
          full_name: displayName,
          name: displayName,
          gender: userGender,
          device_id: userDeviceId,
        },
      });

      if (updateAuthError) {
        console.error("[admin-sync-auth] Failed to update auth user:", updateAuthError);
        const msg = (updateAuthError.message || "").toLowerCase();
        const isWeak = msg.includes("weak") || msg.includes("pwned") || msg.includes("known to be");
        return new Response(
          JSON.stringify({
            success: false,
            reason: isWeak ? "weak_password" : "update_failed",
            error: isWeak
              ? "This password is too common or has appeared in known data leaks. Please choose a stronger password (mix of uppercase, lowercase, numbers, and symbols)."
              : updateAuthError.message,
          }),
          { status: isWeak ? 400 : 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
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
          full_name: displayName,
          name: displayName,
          gender: userGender,
          device_id: userDeviceId,
        },
      });

      if (createError) {
        console.error("[admin-sync-auth] Failed to create user:", createError);
        const msg = (createError.message || "").toLowerCase();
        const isWeak = msg.includes("weak") || msg.includes("pwned") || msg.includes("known to be");
        return new Response(
          JSON.stringify({
            success: false,
            reason: isWeak ? "weak_password" : "create_failed",
            error: isWeak
              ? "This password is too common or has appeared in known data leaks. Please choose a stronger password (mix of uppercase, lowercase, numbers, and symbols)."
              : createError.message,
          }),
          { status: isWeak ? 400 : 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Link user_id in admin_users
      if (newUser?.user && adminUser) {
        await adminClient
          .from("admin_users")
          .update({ user_id: newUser.user.id })
          .ilike("email", normalizedEmail);
      }

      // Link to profile if this was a regular user
      if (newUser?.user && profileUser) {
        await adminClient
          .from("profiles")
          .update({ email: normalizedEmail })
          .eq("id", profileUser.id);
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
