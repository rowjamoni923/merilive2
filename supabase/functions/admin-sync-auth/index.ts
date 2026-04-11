import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

/**
 * Admin Sync Auth
 * 
 * When an admin user exists in admin_users table but has NO auth account,
 * this function creates a new Supabase Auth account with the given password.
 * 
 * If auth account already exists, it does NOT change the password.
 * Password changes should only happen through:
 * 1. "Forgot Password" flow (send-password-otp)
 * 2. Admin panel reset (admin-reset-user-password)
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
    const oldSupabaseUrlRaw = (Deno.env.get("OLD_SUPABASE_URL") || "").trim();
    const oldSupabaseKey = (Deno.env.get("OLD_SUPABASE_SERVICE_ROLE_KEY") || "").trim();
    const oldSupabaseAnonKey = (Deno.env.get("OLD_SUPABASE_ANON_KEY") || "").trim();
    const oldSupabaseUrl = oldSupabaseUrlRaw && !oldSupabaseUrlRaw.startsWith("http")
      ? `https://${oldSupabaseUrlRaw}`
      : oldSupabaseUrlRaw;
    const oldClient = oldSupabaseUrl && oldSupabaseKey
      ? createClient(oldSupabaseUrl, oldSupabaseKey)
      : null;
    const oldAuthClient = oldSupabaseUrl && oldSupabaseAnonKey
      ? createClient(oldSupabaseUrl, oldSupabaseAnonKey)
      : null;

    // 1. Check if this email exists in current admin_users and is active
    const { data: adminUser, error: adminError } = await adminClient
      .from("admin_users")
      .select("id, user_id, email, display_name, role, is_active")
      .ilike("email", normalizedEmail)
      .eq("is_active", true)
      .maybeSingle();

    const legacyIdentity = await findLegacyIdentity(oldClient, normalizedEmail);
    const legacyAuthUser = await findLegacyAuthUser(oldClient, normalizedEmail);
    const legacyCredentialsValid = legacyAuthUser
      ? await verifyLegacyCredentials(oldAuthClient, normalizedEmail, password)
      : false;

    if (adminError) {
      console.error("[admin-sync-auth] Failed reading admin_users:", adminError);
    }

    if (!adminUser && !legacyIdentity && !legacyAuthUser) {
      console.log("[admin-sync-auth] Email not found in admin_users or legacy source:", normalizedEmail);
      return new Response(
        JSON.stringify({ success: false, reason: "not_found_in_legacy" }),
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
      // Auth account exists — only sync password if old credentials were verified against legacy auth
      if (adminUser && !adminUser.user_id) {
        await adminClient
          .from("admin_users")
          .update({ user_id: existingUserId })
          .ilike("email", normalizedEmail);
        console.log(`[admin-sync-auth] Linked user_id for: ${normalizedEmail}`);
      }

      if (legacyAuthUser && !legacyCredentialsValid) {
        return new Response(
          JSON.stringify({ success: false, reason: "invalid_legacy_credentials", message: "Legacy password verification failed" }),
          { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      if (!legacyAuthUser) {
        console.log(`[admin-sync-auth] Auth account already exists for: ${normalizedEmail} — no legacy auth account to verify against`);
        return new Response(
          JSON.stringify({ success: false, reason: "account_exists", message: "Use Forgot Password or contact admin to reset" }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const { error: updateAuthError } = await adminClient.auth.admin.updateUserById(existingUserId, {
        password,
        email_confirm: true,
        user_metadata: {
          full_name: legacyIdentity?.displayName || adminUser?.display_name || "",
          name: legacyIdentity?.displayName || adminUser?.display_name || "",
        },
      });

      if (updateAuthError) {
        console.error("[admin-sync-auth] Failed to sync existing auth user password:", updateAuthError);
        return new Response(
          JSON.stringify({ success: false, reason: "password_sync_failed", error: updateAuthError.message }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      console.log(`[admin-sync-auth] Auth account already exists for: ${normalizedEmail} — password synced`);
      return new Response(
        JSON.stringify({ success: true, action: "password_synced", user_id: existingUserId }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    } else {
      // No auth account — create one with the given password
      if (legacyAuthUser && !legacyCredentialsValid) {
        return new Response(
          JSON.stringify({ success: false, reason: "invalid_legacy_credentials", message: "Legacy password verification failed" }),
          { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const { data: newUser, error: createError } = await adminClient.auth.admin.createUser({
        email: normalizedEmail,
        password,
        email_confirm: true,
        user_metadata: {
          full_name: legacyIdentity?.displayName || adminUser?.display_name || "",
          name: legacyIdentity?.displayName || adminUser?.display_name || "",
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
      if (newUser?.user && adminUser) {
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

async function findLegacyIdentity(oldClient: ReturnType<typeof createClient> | null, email: string) {
  if (!oldClient) return null;

  try {
    const { data: legacyProfile } = await oldClient
      .from("profiles")
      .select("id, email, display_name, username")
      .ilike("email", email)
      .maybeSingle();

    if (legacyProfile) {
      return {
        id: legacyProfile.id,
        displayName: legacyProfile.display_name || legacyProfile.username || email.split("@")[0],
        source: "legacy_profile",
      };
    }
  } catch (error) {
    console.warn("[admin-sync-auth] Legacy profile lookup failed:", error);
  }

  try {
    const { data: legacyAdmin } = await oldClient
      .from("admin_users")
      .select("id, email, display_name")
      .ilike("email", email)
      .maybeSingle();

    if (legacyAdmin) {
      return {
        id: legacyAdmin.id,
        displayName: legacyAdmin.display_name || email.split("@")[0],
        source: "legacy_admin",
      };
    }
  } catch (error) {
    console.warn("[admin-sync-auth] Legacy admin lookup failed:", error);
  }

  try {
    let page = 1;
    const perPage = 200;

    while (true) {
      const { data, error } = await oldClient.auth.admin.listUsers({ page, perPage });
      if (error) break;

      const users = data?.users ?? [];
      const matched = users.find((user) => user.email?.toLowerCase() === email);
      if (matched) {
        return {
          id: matched.id,
          displayName: matched.user_metadata?.full_name || matched.user_metadata?.name || email.split("@")[0],
          source: "legacy_auth",
        };
      }

      if (users.length < perPage) break;
      page += 1;
    }
  } catch (error) {
    console.warn("[admin-sync-auth] Legacy auth lookup failed:", error);
  }

  return null;
}

async function findLegacyAuthUser(oldClient: ReturnType<typeof createClient> | null, email: string) {
  if (!oldClient) return null;

  try {
    let page = 1;
    const perPage = 200;

    while (true) {
      const { data, error } = await oldClient.auth.admin.listUsers({ page, perPage });
      if (error) break;

      const users = data?.users ?? [];
      const matched = users.find((user) => user.email?.toLowerCase() === email);
      if (matched) {
        return matched;
      }

      if (users.length < perPage) break;
      page += 1;
    }
  } catch (error) {
    console.warn("[admin-sync-auth] Legacy auth user lookup failed:", error);
  }

  return null;
}

async function verifyLegacyCredentials(oldAuthClient: ReturnType<typeof createClient> | null, email: string, password: string) {
  if (!oldAuthClient) return false;

  try {
    const { data, error } = await oldAuthClient.auth.signInWithPassword({ email, password });
    if (error || !data?.session) {
      return false;
    }

    await oldAuthClient.auth.signOut();
    return true;
  } catch (error) {
    console.warn("[admin-sync-auth] Legacy credential verification failed:", error);
    return false;
  }
}
