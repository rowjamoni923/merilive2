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
 * Bulk Create Auth Accounts
 * 
 * Iterates through ALL profiles that have a device_id but no corresponding auth.users entry,
 * and creates deterministic auth accounts for them.
 * 
 * Credential formula (matches recover_session_by_device RPC):
 *   email: guest_{device_id}@meri.local
 *   password: meri_{device_id}_secure
 * 
 * This restores login capability for all ~6000 migrated accounts.
 */
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const adminClient = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const auth = await requireAdminSession(req, adminClient, { ownerOnly: true });
    if (!auth.ok) return json({ error: auth.error }, auth.status);

    // Optional: pass batch_size and offset for chunked processing
    let body: any = {};
    try {
      body = await req.json();
    } catch {}
    
    const batchSize = Math.min(Math.max(Number(body.batch_size) || 200, 1), 500);
    const startOffset = Math.max(Number(body.offset) || 0, 0);
    const dryRun = body.dry_run === true;

    // 1. Get profiles with device_id
    const { data: profiles, error: fetchError } = await adminClient
      .from("profiles")
      .select("id, device_id, display_name, gender, avatar_url, app_uid, email")
      .not("device_id", "is", null)
      .eq("is_deleted", false)
      .eq("is_banned", false)
      .eq("is_blocked", false)
      .order("created_at", { ascending: true })
      .range(startOffset, startOffset + batchSize - 1);

    if (fetchError) {
      console.error("[bulk-create-auth] Fetch profiles error:", fetchError);
      throw fetchError;
    }

    if (!profiles || profiles.length === 0) {
      return new Response(
        JSON.stringify({ success: true, message: "No more profiles to process", created: 0, skipped: 0, errors: 0 }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 2. Get existing auth users' emails to avoid duplicates
    // We'll check per-user instead of bulk listing (more reliable)
    
    let created = 0;
    let skipped = 0;
    let errors = 0;
    const errorDetails: string[] = [];

    for (const profile of profiles) {
      const deviceId = profile.device_id;
      if (!deviceId || !/^device_[A-Za-z0-9_:-]{6,128}$/.test(deviceId)) {
        skipped++;
        continue;
      }

      const { data: bannedDevice } = await adminClient
        .from("banned_devices")
        .select("id")
        .eq("device_id", deviceId)
        .eq("is_active", true)
        .or(`is_permanent.eq.true,expires_at.is.null,expires_at.gt.${new Date().toISOString()}`)
        .maybeSingle();
      if (bannedDevice?.id) {
        skipped++;
        continue;
      }

      // Deterministic credentials matching recover_session_by_device
      const guestEmail = `guest_${deviceId}@meri.local`;
      const guestPassword = `meri_${deviceId}_secure`;

      if (dryRun) {
        created++;
        continue;
      }

      try {
        // Try to create auth user with the profile's existing UUID as the auth user ID
        const { data: newUser, error: createError } = await adminClient.auth.admin.createUser({
          email: guestEmail,
          password: guestPassword,
          email_confirm: true,
          user_metadata: {
            full_name: profile.display_name || "User",
            gender: profile.gender || null,
            device_id: deviceId,
            app_uid: profile.app_uid || null,
          },
        });

        if (createError) {
          if (createError.message?.includes("already been registered") || createError.message?.includes("already exists")) {
            // Auth account already exists for this email — link it
            skipped++;
            
            // Update profile email field for future lookups
            await adminClient
              .from("profiles")
              .update({ email: guestEmail })
              .eq("id", profile.id);
          } else {
            errors++;
            errorDetails.push(`${profile.id}: ${createError.message}`);
          }
          continue;
        }

        if (newUser?.user) {
          // Update the profile to store the email and link to the new auth user
          // IMPORTANT: The profile.id and newUser.user.id might differ
          // We need to either:
          // a) Update the profile's id to match auth user id, or
          // b) Create a new profile entry for the new auth user
          
          // Since profiles already have data, we'll update the email on the existing profile
          // and create a mapping
          await adminClient
            .from("profiles")
            .update({ email: guestEmail })
            .eq("id", profile.id);
          
          // If the auth user ID differs from profile ID, we need to handle this
          if (newUser.user.id !== profile.id) {
            // Copy profile data to the new auth user's profile entry
            // The trigger should auto-create a basic profile; we upsert our data
            const { error: upsertError } = await adminClient
              .from("profiles")
              .upsert({
                id: newUser.user.id,
                display_name: profile.display_name,
                avatar_url: profile.avatar_url,
              }, { onConflict: "id" });
            
            if (upsertError) {
              console.warn(`[bulk-create-auth] Profile upsert warning for ${profile.id}:`, upsertError.message);
            }
          }

          created++;
        }
      } catch (e: any) {
        errors++;
        errorDetails.push(`${profile.id}: ${e.message}`);
      }
    }

    console.log(`[bulk-create-auth] ✅ Batch done by owner ${auth.admin.id}: created=${created}, skipped=${skipped}, errors=${errors}, offset=${startOffset}`);

    return new Response(
      JSON.stringify({
        success: true,
        created,
        skipped,
        errors,
        error_details: errorDetails.slice(0, 20),
        processed: profiles.length,
        next_offset: startOffset + batchSize,
        has_more: profiles.length === batchSize,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err: any) {
    console.error("[bulk-create-auth] Error:", err);
    return new Response(
      JSON.stringify({ error: err.message || "Internal server error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});