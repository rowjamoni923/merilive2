import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-client-platform, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const payload = await req.json();
    const email = typeof payload?.email === "string" ? payload.email.trim().toLowerCase() : "";
    const verifiedToken = typeof payload?.verified_token === "string" ? payload.verified_token : "";
    const channel = payload?.channel === "phone" ? "phone" : "email";
    const tokenIdentifier = channel === "phone"
      ? String(payload?.identifier || "").replace(/[\s\-\(\)]/g, "").replace(/^\+/, "")
      : email;

    if (!email || !verifiedToken || !tokenIdentifier) {
      return new Response(
        JSON.stringify({ success: false, error: "Email and verified OTP token required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
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
      return new Response(
        JSON.stringify({ success: false, error: "OTP verification expired. Please request a new code." }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const { data: linkData, error: linkError } = await supabaseAdmin.auth.admin.generateLink({
      type: "magiclink",
      email,
    });
    if (linkError && /not found|User not found/i.test(linkError.message || "")) {
      return new Response(
        JSON.stringify({ success: false, exists: false, error: "User not found" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
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

    await supabaseAdmin
      .from("otp_exchange_tokens")
      .update({ is_used: true, used_at: new Date().toISOString() })
      .eq("id", tokenRow.id);

    return new Response(
      JSON.stringify({
        success: true,
        exists: true,
        access_token: verifiedData.session.access_token,
        refresh_token: verifiedData.session.refresh_token,
        token_type: verifiedData.session.token_type ?? "bearer",
        expires_in: verifiedData.session.expires_in,
        user: { id: verifiedData.user?.id, email: verifiedData.user?.email },
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (error: any) {
    console.error("OTP direct sign-in error:", error);
    return new Response(
      JSON.stringify({ success: false, error: error?.message || "Internal server error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});