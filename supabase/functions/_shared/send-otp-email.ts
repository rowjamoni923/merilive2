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

  const { data, error } = await supabase.functions.invoke("send-transactional-email", {
    body: {
      templateName: "otp-code",
      recipientEmail: args.to,
      idempotencyKey,
      templateData: {
        otp: args.otp,
        purpose: args.purpose,
        expiryMinutes: args.expiryMinutes ?? 5,
      },
    },
  });

  if (error) {
    console.error("[sendOtpEmail] invoke error:", error);
    return { success: false, error: error.message || String(error) };
  }
  if (data && (data as any).error) {
    console.error("[sendOtpEmail] response error:", (data as any).error);
    return { success: false, error: (data as any).error };
  }
  return { success: true };
}
