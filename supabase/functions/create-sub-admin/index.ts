import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { requireAdminSession } from "../_shared/adminAuth.ts";

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

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  try {
    console.log("[create-sub-admin] Starting request...");
    
    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      { auth: { autoRefreshToken: false, persistSession: false } }
    );

    // Verify the requesting admin session is an approved owner device.
    const auth = await requireAdminSession(req, supabaseAdmin, { ownerOnly: true });
    if (!auth.ok) {
      console.error("[create-sub-admin] Owner admin session rejected:", auth.error);
      return json({ error: auth.error }, auth.status);
    }
    const requestingAdmin = auth.admin;

    console.log("[create-sub-admin] Requesting admin:", requestingAdmin.id);

    const body = await req.json().catch(() => ({}));
    const { email, password, display_name, sections_access }: CreateSubAdminRequest = body;

    const normalizedEmail = typeof email === "string" ? email.trim().toLowerCase() : "";
    const safeDisplayName = typeof display_name === "string" ? display_name.trim().slice(0, 80) : normalizedEmail.split("@")[0];
    const requestedSections = Array.isArray(sections_access)
      ? Array.from(new Set(sections_access.filter((id) => typeof id === "string" && uuidRegex.test(id)))).slice(0, 200)
      : [];

    console.log("[create-sub-admin] Creating sub-admin for email:", normalizedEmail);

    // Validate input
    if (!normalizedEmail || normalizedEmail.length > 254 || !emailRegex.test(normalizedEmail)) {
      return json({ error: "Please enter a valid email" }, 400);
    }

    if (typeof password !== "string" || password.length < 8 || password.length > 128) {
      return json({ error: "Password must be 8-128 characters" }, 400);
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
      return json({ error: "An admin with this email already exists" }, 400);
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
          return json({ error: "Failed to find existing user" }, 500);
        }

        if (!existingUser) {
          console.error("[create-sub-admin] Existing user not found in paginated lookup:", normalizedEmail);
          return json({ error: "User already exists but could not be found in auth lookup" }, 400);
        }

        userId = existingUser.id;
        console.log("[create-sub-admin] Found existing auth user:", userId);
      } else {
        console.error("[create-sub-admin] Error creating user:", createError.message);
        return json({ error: createError.message }, 400);
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
        display_name: safeDisplayName || normalizedEmail.split('@')[0],
        role: "sub_admin",
        is_active: true,
        invited_by: requestingAdmin.user_id,
        accepted_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (adminError) {
      console.error("[create-sub-admin] Error creating admin record:", adminError.message);
      return json({ error: "Failed to create admin record" }, 400);
    }

    const { data: passwordResult, error: passwordError } = await supabaseAdmin.rpc("service_set_admin_password", {
      _admin_user_id: adminUser.id,
      _new_password: password,
    });
    if (passwordError || !(passwordResult as any)?.success) {
      console.error("[create-sub-admin] Error setting admin password:", passwordError?.message || (passwordResult as any)?.error);
      await supabaseAdmin.from("admin_users").delete().eq("id", adminUser.id);
      return json({ error: "Failed to set admin password" }, 500);
    }

    console.log("[create-sub-admin] Admin record created:", adminUser.id);

    // Add section permissions
    if (requestedSections.length > 0) {
      console.log("[create-sub-admin] Adding permissions for sections:", requestedSections.length);

      const { data: validSections, error: sectionError } = await supabaseAdmin
        .from("admin_sections")
        .select("id")
        .in("id", requestedSections)
        .eq("is_active", true);
      if (sectionError) {
        console.error("[create-sub-admin] Section validation error:", sectionError.message);
      }
      const validSectionIds = new Set((validSections || []).map((s: any) => s.id));
      
      const permissions = requestedSections.filter((sectionId) => validSectionIds.has(sectionId)).map(sectionId => ({
        admin_user_id: adminUser.id,
        section_id: sectionId,
        can_view: true,
        can_edit: true,
        can_delete: false,
        granted_by: requestingAdmin.user_id,
      }));

      const { error: permError } = permissions.length > 0
        ? await supabaseAdmin.from("admin_section_permissions").insert(permissions)
        : { error: null } as any;

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
      return json({ error: 'Admin token secret not configured on server' }, 500);
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

    return json(
      {
        success: true,
        admin_user: {
          id: adminUser.id,
          user_id: adminUser.user_id,
          email: adminUser.email,
          display_name: adminUser.display_name,
          role: adminUser.role,
          is_active: adminUser.is_active,
          invited_at: adminUser.invited_at,
          accepted_at: adminUser.accepted_at,
          last_login_at: adminUser.last_login_at,
        },
        login_link: loginLink,
        message: "Sub-admin created successfully"
      },
      200,
    );

  } catch (error: unknown) {
    console.error("[create-sub-admin] Unexpected error:", error);
    return json({ error: "Server error" }, 500);
  }
});