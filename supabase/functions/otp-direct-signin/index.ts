import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-client-platform, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function normalizePhoneIdentifier(value: unknown): string {
  return String(value || "").replace(/[\s\-\(\)]/g, "").replace(/^\+/, "");
}

async function consumeExchangeToken(supabaseAdmin: any, tokenId: string): Promise<boolean> {
  const { data, error } = await supabaseAdmin
    .from("otp_exchange_tokens")
    .update({ is_used: true, used_at: new Date().toISOString() })
    .eq("id", tokenId)
    .eq("is_used", false)
    .select("id")
    .maybeSingle();
  if (error) throw error;
  return Boolean(data?.id);
}

async function createMagicSession(supabaseAdmin: any, email: string) {
  const { data: linkData, error: linkError } = await supabaseAdmin.auth.admin.generateLink({
    type: "magiclink",
    email,
  });
  if (linkError) throw linkError;

  const tokenHashFromLink = linkData?.properties?.hashed_token;
  if (!tokenHashFromLink) throw new Error("Failed to create sign-in token");

  const { data: verifiedData, error: verifyError } = await supabaseAdmin.auth.verifyOtp({
    token_hash: tokenHashFromLink,
  });
  if (verifyError || !verifiedData?.session) {
    throw verifyError || new Error("Failed to create session");
  }
  return verifiedData;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ success: false, error: "Method not allowed" }, 405);

  try {
    const payload = await req.json();
    const email = typeof payload?.email === "string" ? payload.email.trim().toLowerCase() : "";
    const verifiedToken = typeof payload?.verified_token === "string" ? payload.verified_token : "";
    const password = typeof payload?.password === "string" ? payload.password : "";
    const displayName = typeof payload?.display_name === "string" ? payload.display_name.trim().slice(0, 80) : "";
    const deviceId = typeof payload?.device_id === "string" ? payload.device_id.trim().slice(0, 160) : "";
    const gender = ["male", "female"].includes(String(payload?.gender || "").toLowerCase())
      ? String(payload.gender).toLowerCase()
      : null;
    const mode = payload?.mode === "create" ? "create" : "signin";
    const channel = payload?.channel === "phone" ? "phone" : "email";
    const tokenIdentifier = channel === "phone"
      ? normalizePhoneIdentifier(payload?.identifier)
      : email;

    if (!email || !verifiedToken || !tokenIdentifier || verifiedToken.length > 128) {
      return json({ success: false, error: "Email and verified OTP token required" }, 400);
    }
    if (channel === "email" && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return json({ success: false, error: "Invalid email" }, 400);
    }
    if (channel === "phone") {
      if (!/^\d{7,15}$/.test(tokenIdentifier)) {
        return json({ success: false, error: "Invalid phone identifier" }, 400);
      }
      const expectedPhoneEmail = `phone_${tokenIdentifier}@meri.local`;
      if (email !== expectedPhoneEmail) {
        return json({ success: false, error: "OTP token does not match this account" }, 403);
      }
    }

    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      { auth: { autoRefreshToken: false, persistSession: false } },
    );

    let consumedTokenId: string | null = null;
    const consumeVerifiedToken = async () => {
      const { data, error } = await supabaseAdmin.rpc("consume_otp_exchange_token", {
        p_verified_token: verifiedToken,
        p_identifier: tokenIdentifier,
        p_channel: channel,
        p_purpose: "login",
      });
      if (error) throw error;
      consumedTokenId = typeof data === "string" ? data : null;
      if (!consumedTokenId) {
        return json({ success: false, error: "OTP verification expired. Please request a new code." }, 401);
      }
      return null;
    };

    const profilePatch: Record<string, unknown> = {
      display_name: displayName || undefined,
      device_id: deviceId || undefined,
      gender: gender || undefined,
      is_verified: true,
    };

    if (mode === "create") {
      const tokenResponse = await consumeVerifiedToken();
      if (tokenResponse) return tokenResponse;

      if (password.length < 6) return json({ success: false, error: "Password must be at least 6 characters" }, 400);
      if (!displayName) return json({ success: false, error: "Display name is required" }, 400);

      const metadata: Record<string, unknown> = {
        full_name: displayName,
      };
      if (channel === "phone") {
        metadata.phone_number = tokenIdentifier;
        metadata.phone_verified = true;
        profilePatch.phone_number = tokenIdentifier;
        profilePatch.phone_verified = true;
      } else {
        metadata.email_confirmed = true;
        profilePatch.email = email;
      }
      if (gender) {
        metadata.gender = gender;
        metadata.selected_gender = gender;
        metadata.account_type = gender === "female" ? "host" : "user";
        metadata.profile_type = gender === "female" ? "host" : "user";
      }

      const { data: created, error: createError } = await supabaseAdmin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: metadata,
      });
      if (createError) {
        const msg = String(createError.message || "");
        if (!/already|registered|exists/i.test(msg)) throw createError;
      }

      const userId = created?.user?.id;
      if (userId) {
        await supabaseAdmin.from("profiles").upsert({ id: userId, ...profilePatch }, { onConflict: "id" });
      }
    }

    const { data: linkData, error: linkError } = await supabaseAdmin.auth.admin.generateLink({
      type: "magiclink",
      email,
    });
    if (linkError && /not found|User not found/i.test(linkError.message || "")) {
      return json({ success: false, exists: false, error: "User not found" }, 200);
    }
    if (linkError) throw linkError;

    if (!consumedTokenId) {
      const tokenResponse = await consumeVerifiedToken();
      if (tokenResponse) return tokenResponse;
    }

    const tokenHashFromLink = linkData?.properties?.hashed_token;
    if (!tokenHashFromLink) throw new Error("Failed to create sign-in token");

    const { data: verifiedData, error: verifyError } = await supabaseAdmin.auth.verifyOtp({
      token_hash: tokenHashFromLink,
    });
    if (verifyError || !verifiedData?.session) {
      throw verifyError || new Error("Failed to create session");
    }

    return json(
      {
        success: true,
        exists: true,
        access_token: verifiedData.session.access_token,
        refresh_token: verifiedData.session.refresh_token,
        token_type: verifiedData.session.token_type ?? "bearer",
        expires_in: verifiedData.session.expires_in,
        user: { id: verifiedData.user?.id, email: verifiedData.user?.email },
      },
      200,
    );
  } catch (error: any) {
    console.error("OTP direct sign-in error:", error);
    return json({ success: false, error: "Internal server error" }, 500);
  }
});