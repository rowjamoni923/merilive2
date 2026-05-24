import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-admin-token, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

interface CreateSubAdminRequest {
  email: string;
  password: string;
  display_name: string;
  sections_access: string[]; // Array of section IDs
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    console.log("[create-sub-admin] Starting request...");
    
    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      { auth: { autoRefreshToken: false, persistSession: false } }
    );

    // Verify the requesting admin session is an owner
    const adminToken = req.headers.get("x-admin-token");
    if (!adminToken || adminToken.length < 16) {
      console.error("[create-sub-admin] No admin session token");
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
      ? await supabaseAdmin.from("admin_users").select("id, user_id, role, is_active").eq("id", sessionRow.admin_user_id).maybeSingle()
      : { data: null } as any;

    if (!requestingAdmin?.is_active || requestingAdmin.role !== "owner") {
      console.error("[create-sub-admin] Requesting admin is not owner");
      return new Response(
        JSON.stringify({ error: "Only Owners can create sub-admins" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log("[create-sub-admin] Requesting admin:", requestingAdmin.id);

    const body = await req.json();
    const { email, password, display_name, sections_access }: CreateSubAdminRequest = body;

    const normalizedEmail = email?.trim().toLowerCase();

    console.log("[create-sub-admin] Creating sub-admin for email:", normalizedEmail);

    // Validate input
    if (!normalizedEmail || !normalizedEmail.includes("@")) {
      return new Response(
        JSON.stringify({ error: "Please enter a valid email" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!password || password.length < 8) {
      return new Response(
        JSON.stringify({ error: "Password must be at least 8 characters" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const findExistingAuthUserByEmail = async (targetEmail: string) => {
      const perPage = 1000;
      const maxPages = 20;

      for (let page = 1; page <= maxPages; page++) {
        const { data, error } = await supabaseAdmin.auth.admin.listUsers({ page, perPage });

        if (error) {
          return { user: null, error };
        }

        const foundUser = data.users.find(
          (u) => u.email?.trim().toLowerCase() === targetEmail
        );

        if (foundUser) {
          return { user: foundUser, error: null };
        }

        if (data.users.length < perPage) {
          break;
        }
      }

      return { user: null, error: null };
    };

    // Check if admin already exists
    const { data: existingAdmin } = await supabaseAdmin
      .from("admin_users")
      .select("id")
      .eq("email", normalizedEmail)
      .maybeSingle();

    if (existingAdmin) {
      console.error("[create-sub-admin] Admin already exists for email:", normalizedEmail);
      return new Response(
        JSON.stringify({ error: "An admin with this email already exists" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Create or find auth user
    console.log("[create-sub-admin] Creating/finding auth user...");
    let userId: string;

    const { data: newUser, error: createError } = await supabaseAdmin.auth.admin.createUser({
      email: normalizedEmail,
      password,
      email_confirm: true,
      user_metadata: { display_name, is_sub_admin: true }
    });

    if (createError) {
      const lowerCreateError = createError.message.toLowerCase();
      const isAlreadyRegistered =
        lowerCreateError.includes("already been registered") ||
        lowerCreateError.includes("already registered") ||
        lowerCreateError.includes("email address has already");

      // If user already exists, find and reuse that user (search all pages)
      if (isAlreadyRegistered) {
        console.log("[create-sub-admin] User already exists, finding existing user...");

        const { user: existingUser, error: listError } = await findExistingAuthUserByEmail(normalizedEmail);

        if (listError) {
          console.error("[create-sub-admin] Error listing users:", listError.message);
          return new Response(
            JSON.stringify({ error: "Failed to find existing user" }),
            { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        if (!existingUser) {
          console.error("[create-sub-admin] Existing user not found in paginated lookup:", normalizedEmail);
          return new Response(
            JSON.stringify({ error: "User already exists but could not be found in auth lookup" }),
            { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        userId = existingUser.id;
        console.log("[create-sub-admin] Found existing auth user:", userId);
      } else {
        console.error("[create-sub-admin] Error creating user:", createError.message);
        return new Response(
          JSON.stringify({ error: createError.message }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    } else {
      userId = newUser.user.id;
      console.log("[create-sub-admin] New auth user created:", userId);
    }

    // Create admin_users record
    const { data: adminUser, error: adminError } = await supabaseAdmin
      .from("admin_users")
      .insert({
        user_id: userId,
        email: normalizedEmail,
        display_name: display_name || normalizedEmail.split('@')[0],
        role: "sub_admin",
        is_active: true,
        invited_by: requestingAdmin.user_id,
        accepted_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (adminError) {
      console.error("[create-sub-admin] Error creating admin record:", adminError.message);
      return new Response(
        JSON.stringify({ error: "Failed to create admin record: " + adminError.message }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { data: passwordResult, error: passwordError } = await supabaseAdmin.rpc("service_set_admin_password", {
      _admin_user_id: adminUser.id,
      _new_password: password,
    });
    if (passwordError || !(passwordResult as any)?.success) {
      console.error("[create-sub-admin] Error setting admin password:", passwordError?.message || (passwordResult as any)?.error);
      await supabaseAdmin.from("admin_users").delete().eq("id", adminUser.id);
      return new Response(
        JSON.stringify({ error: "Failed to set admin password" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log("[create-sub-admin] Admin record created:", adminUser.id);

    // Add section permissions
    if (sections_access && sections_access.length > 0) {
      console.log("[create-sub-admin] Adding permissions for sections:", sections_access);
      
      const permissions = sections_access.map(sectionId => ({
        admin_user_id: adminUser.id,
        section_id: sectionId,
        can_view: true,
        can_edit: true,
        can_delete: false,
        granted_by: requestingAdmin.user_id,
      }));

      const { error: permError } = await supabaseAdmin
        .from("admin_section_permissions")
        .insert(permissions);

      if (permError) {
        console.error("[create-sub-admin] Error adding permissions:", permError.message);
        // Don't fail completely, admin is created but without permissions
      } else {
        console.log("[create-sub-admin] Permissions added successfully");
      }
    }

    // Generate luxurious year-aware sub-admin token
    // Format: gala-noir-onyx-<YEAR>-prism-<8-hex>
    const BASE_SECRET =
      Deno.env.get('ADMIN_TOKEN_BASE_SECRET') ||
      Deno.env.get('ADMIN_OWNER_TOKEN');
    if (!BASE_SECRET || BASE_SECRET.length < 16) {
      console.error('[create-sub-admin] ADMIN_TOKEN_BASE_SECRET missing or too short — refusing to mint sub-admin login link');
      return new Response(
        JSON.stringify({ error: 'Admin token secret not configured on server' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    const year = new Date().getUTCFullYear();
    const enc = new TextEncoder();
    const cryptoKey = await crypto.subtle.importKey(
      'raw',
      enc.encode(BASE_SECRET),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign']
    );
    const sig = await crypto.subtle.sign('HMAC', cryptoKey, enc.encode(`sub_admin:${year}`));
    const subHash = Array.from(new Uint8Array(sig))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('')
      .slice(0, 8);
    const subAdminToken = `gala-noir-onyx-${year}-prism-${subHash}`;
    const loginLink = `https://merilive.com/admin/auth?access=${subAdminToken}&email=${encodeURIComponent(normalizedEmail)}`;

    console.log("[create-sub-admin] Sub-admin created successfully!");

    return new Response(
      JSON.stringify({
        success: true,
        admin_user: adminUser,
        login_link: loginLink,
        message: "Sub-admin created successfully"
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error: unknown) {
    console.error("[create-sub-admin] Unexpected error:", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return new Response(
      JSON.stringify({ error: "Server error: " + message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});