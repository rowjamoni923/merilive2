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

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ success: false, error: "Method not allowed" }, 405);

  try {
    const payload = await req.json();
    const email = typeof payload?.email === "string" ? payload.email.trim().toLowerCase() : "";
    const verifiedToken = typeof payload?.verified_token === "string" ? payload.verified_token : "";
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

    const tokenHash = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifiedToken));
    const tokenHashHex = Array.from(new Uint8Array(tokenHash)).map((b) => b.toString(16).padStart(2, "0")).join("");

    const { data: tokenRow, error: tokenError } = await supabaseAdmin
      .from("otp_exchange_tokens")
      .select("id, identifier, channel, purpose")
      .eq("token_hash", tokenHashHex)
      .eq("identifier", tokenIdentifier)
      .eq("channel", channel)
      .eq("purpose", "login")
      .eq("is_used", false)
      .gt("expires_at", new Date().toISOString())
      .maybeSingle();

    if (tokenError) throw tokenError;
    if (!tokenRow) {
      return json({ success: false, error: "OTP verification expired. Please request a new code." }, 401);
    }

    const { data: linkData, error: linkError } = await supabaseAdmin.auth.admin.generateLink({
      type: "magiclink",
      email,
    });
    if (linkError && /not found|User not found/i.test(linkError.message || "")) {
      return json({ success: false, exists: false, error: "User not found" }, 200);
    }
    if (linkError) throw linkError;

    const tokenHashFromLink = linkData?.properties?.hashed_token;
    if (!tokenHashFromLink) throw new Error("Failed to create sign-in token");

    const { data: verifiedData, error: verifyError } = await supabaseAdmin.auth.verifyOtp({
      type: "magiclink",
      token_hash: tokenHashFromLink,
    });
    if (verifyError || !verifiedData?.session) {
      throw verifyError || new Error("Failed to create session");
    }

    const { data: consumedToken, error: consumeError } = await supabaseAdmin
      .from("otp_exchange_tokens")
      .update({ is_used: true, used_at: new Date().toISOString() })
      .eq("id", tokenRow.id)
      .eq("is_used", false)
      .select("id")
      .maybeSingle();
    if (consumeError) throw consumeError;
    if (!consumedToken) {
      return json({ success: false, error: "OTP verification expired. Please request a new code." }, 401);
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