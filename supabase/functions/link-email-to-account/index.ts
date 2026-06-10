// Link email + password to an existing (often anonymous/guest) Supabase auth user
// WITHOUT triggering Supabase's built-in "Confirm your new email" flow.
// Flow: client first calls send-email-otp (purpose="verify"), then this function
// with the 6-digit OTP. We verify the OTP, then use admin.updateUserById with
// email_confirm:true so no email is sent.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, x-client-platform, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return json({ success: false, error: "Unauthorized" }, 401);
    }

    const body = await req.json().catch(() => ({}));
    const email = String(body.email || "").trim().toLowerCase();
    const password = String(body.password || "");
    const otp = String(body.otp || "");

    if (!email || !password || !otp) {
      return json({ success: false, error: "Email, password and OTP are required" }, 400);
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return json({ success: false, error: "Invalid email format" }, 400);
    }
    if (password.length < 8) {
      return json({ success: false, error: "Password must be at least 8 characters" }, 400);
    }
    if (!/^\d{6}$/.test(otp)) {
      return json({ success: false, error: "Invalid OTP format" }, 400);
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    // 1) Resolve the calling user from their JWT
    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData, error: userErr } = await userClient.auth.getUser();
    if (userErr || !userData?.user) {
      return json({ success: false, error: "Invalid session" }, 401);
    }
    const userId = userData.user.id;

    const admin = createClient(supabaseUrl, serviceKey);

    // 2) Make sure no other account already owns this email
    const { data: existing } = await admin
      .from("profiles")
      .select("id")
      .ilike("email", email)
      .neq("id", userId)
      .maybeSingle();
    if (existing) {
      return json({ success: false, error: "This email is already linked to another account" }, 409);
    }

    // 3) Verify the OTP (same table/contract as verify-email-otp)
    const { data: otpRecord, error: otpErr } = await admin
      .from("email_otps")
      .select("*")
      .eq("email", email)
      .eq("purpose", "verify")
      .eq("is_used", false)
      .gt("expires_at", new Date().toISOString())
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (otpErr) {
      console.error("[link-email-to-account] OTP fetch error:", otpErr);
      return json({ success: false, error: "Verification failed" }, 500);
    }
    if (!otpRecord) {
      return json({ success: false, error: "OTP expired or not found. Please request a new one." }, 400);
    }
    if (otpRecord.attempts >= 5) {
      await admin.from("email_otps").update({ is_used: true }).eq("id", otpRecord.id);
      return json({ success: false, error: "Too many failed attempts. Please request a new OTP." }, 429);
    }
    if (String(otpRecord.otp_code) !== otp) {
      await admin
        .from("email_otps")
        .update({ attempts: (otpRecord.attempts ?? 0) + 1 })
        .eq("id", otpRecord.id);
      return json({ success: false, error: "Incorrect code. Please try again." }, 400);
    }

    // 4) Mark OTP used
    await admin
      .from("email_otps")
      .update({ is_used: true, verified_at: new Date().toISOString() })
      .eq("id", otpRecord.id);

    // 5) Admin-update the user: set email pre-confirmed AND password — no email is sent.
    const { error: updErr } = await admin.auth.admin.updateUserById(userId, {
      email,
      password,
      email_confirm: true,
    });
    if (updErr) {
      console.error("[link-email-to-account] admin.updateUserById error:", updErr);
      const msg = (updErr.message || "").toLowerCase();
      if (msg.includes("already") || msg.includes("registered") || msg.includes("exists")) {
        return json({ success: false, error: "This email is already in use" }, 409);
      }
      return json({ success: false, error: updErr.message || "Failed to link email" }, 500);
    }

    // 6) Mirror email on profiles row (best-effort)
    await admin.from("profiles").update({ email }).eq("id", userId);

    return json({ success: true, message: "Email linked successfully" });
  } catch (e) {
    console.error("[link-email-to-account] Unhandled error:", e);
    return json({ success: false, error: "Unexpected error" }, 500);
  }
});
