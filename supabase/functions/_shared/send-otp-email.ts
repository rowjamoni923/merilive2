// Shared helper: send OTP via Lovable Email infrastructure
// Replaces direct Gmail SMTP — uses send-transactional-email + queue (unlimited).
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

export interface SendOtpEmailArgs {
  to: string;
  otp: string;
  purpose: "login" | "register" | "reset" | "verify" | "password_reset" | "admin" | "two_factor" | "agency";
  expiryMinutes?: number;
  idempotencyKey?: string;
}

export async function sendOtpEmail(args: SendOtpEmailArgs): Promise<{ success: boolean; error?: string }> {
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceKey) {
    return { success: false, error: "Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY" };
  }

  const supabase = createClient(supabaseUrl, serviceKey);
  const idempotencyKey = args.idempotencyKey ?? `otp-${args.purpose}-${args.to.toLowerCase()}-${args.otp}`;

  // OTP emails should bypass any prior unsubscribe (auth-critical).
  // Clear suppression for this address before sending.
  try {
    await supabase
      .from("suppressed_emails")
      .delete()
      .eq("email", args.to.toLowerCase());
  } catch (_e) {
    // non-fatal
  }

  // Call send-transactional-email directly via fetch with explicit
  // service-role Authorization. functions.invoke can mangle the JWT
  // header in cross-function calls (UNAUTHORIZED_INVALID_JWT_FORMAT).
  try {
    const resp = await fetch(`${supabaseUrl}/functions/v1/send-transactional-email`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${serviceKey}`,
        apikey: serviceKey,
      },
      body: JSON.stringify({
        templateName: "otp-code",
        recipientEmail: args.to,
        idempotencyKey,
        templateData: {
          otp: args.otp,
          purpose: args.purpose,
          expiryMinutes: args.expiryMinutes ?? 5,
        },
      }),
    });

    const text = await resp.text();
    let data: any = null;
    try { data = text ? JSON.parse(text) : null; } catch { /* non-json */ }

    if (!resp.ok) {
      console.error("[sendOtpEmail] HTTP", resp.status, text);
      return { success: false, error: data?.error || `HTTP ${resp.status}: ${text}` };
    }
    if (data && data.error) {
      console.error("[sendOtpEmail] response error:", data.error);
      return { success: false, error: data.error };
    }
    return { success: true };
  } catch (e) {
    console.error("[sendOtpEmail] fetch error:", e);
    return { success: false, error: e instanceof Error ? e.message : String(e) };
  }
}
