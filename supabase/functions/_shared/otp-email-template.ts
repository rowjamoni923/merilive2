// Shared luxurious premium OTP email template
// Used by ALL OTP-sending edge functions for consistent branding.
// Designed for maximum Gmail/inbox compatibility (table-based, inline styles).

export type OtpPurpose =
  | "login"
  | "register"
  | "reset"
  | "verify"
  | "admin"
  | "agency"
  | "password_reset"
  | "two_factor";

export interface OtpEmailOptions {
  otp: string;
  purpose?: OtpPurpose | string;
  expiryMinutes?: number;
  brandName?: string;
  logoUrl?: string;
}

function purposeLabel(p?: string): string {
  switch (p) {
    case "login": return "Sign-In Verification";
    case "register": return "Account Verification";
    case "reset":
    case "password_reset": return "Password Reset";
    case "admin":
    case "two_factor": return "Admin Verification";
    case "agency": return "Agency Verification";
    case "verify":
    default: return "Identity Verification";
  }
}

export function buildOtpEmailSubject(purpose?: string): string {
  const label = purposeLabel(purpose);
  return `[MeriLive] ${label} Code`;
}

export function buildOtpEmailHTML(opts: OtpEmailOptions): string {
  const otp = String(opts.otp || "").trim();
  const expiry = opts.expiryMinutes ?? 5;
  const brand = opts.brandName ?? "MeriLive";
  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "https://ayjdlvuurscxucatbbah.supabase.co";
  const logoUrl = opts.logoUrl ?? `${supabaseUrl}/storage/v1/object/public/app-assets/merilive-logo.png`;
  const label = purposeLabel(opts.purpose);

  // 6 separate digit cells — luxurious gold-on-dark cards
  const digitCells = otp.split("").map((d) => `
    <td align="center" valign="middle" style="width:48px;height:60px;background:#11122a;background-image:linear-gradient(160deg,#1a1740 0%,#0d0b24 100%);border:1px solid #3a2d6b;border-radius:12px;box-shadow:inset 0 1px 0 rgba(255,255,255,0.06);">
      <span style="display:inline-block;font-size:30px;font-weight:800;color:#f5d472;font-family:'Georgia','Times New Roman',serif;letter-spacing:0;line-height:60px;text-shadow:0 2px 8px rgba(245,212,114,0.35);">${d}</span>
    </td>`).join('<td style="width:8px;font-size:0;line-height:0;">&nbsp;</td>');

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="x-apple-disable-message-reformatting">
<title>${label} — ${brand}</title>
</head>
<body style="margin:0;padding:0;background:#f4f1ec;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;">
<div style="display:none;font-size:1px;color:#f4f1ec;line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden;">Your ${brand} ${label.toLowerCase()} code is ${otp}. Expires in ${expiry} minutes.</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#f4f1ec;padding:32px 12px;">
<tr><td align="center">
<table role="presentation" width="520" cellpadding="0" cellspacing="0" border="0" style="max-width:520px;width:100%;background:#0b0a1f;border-radius:20px;overflow:hidden;box-shadow:0 20px 60px rgba(15,12,41,0.25);">

  <!-- HEADER: Royal gradient with gold accent -->
  <tr><td style="background:#0b0a1f;background-image:linear-gradient(135deg,#1a0b3d 0%,#0b0a1f 55%,#0d0820 100%);padding:36px 32px 28px 32px;text-align:center;border-bottom:1px solid rgba(245,212,114,0.18);">
    <img src="${logoUrl}" alt="${brand}" width="64" height="64" style="display:inline-block;width:64px;height:64px;border-radius:14px;border:1px solid rgba(245,212,114,0.25);" />
    <div style="margin:14px 0 0 0;">
      <span style="font-size:24px;font-weight:700;letter-spacing:3px;color:#ffffff;font-family:'Georgia',serif;">MERI</span><span style="font-size:24px;font-weight:700;letter-spacing:3px;color:#f5d472;font-family:'Georgia',serif;">LIVE</span>
    </div>
    <div style="margin:10px auto 0;width:48px;height:2px;background:linear-gradient(90deg,transparent,#f5d472,transparent);"></div>
    <div style="margin:14px 0 0 0;font-size:11px;font-weight:600;letter-spacing:4px;text-transform:uppercase;color:#c9b079;">${label}</div>
  </td></tr>

  <!-- BODY -->
  <tr><td style="background:#10102b;padding:36px 36px 28px 36px;">
    <p style="margin:0 0 8px 0;font-size:16px;font-weight:600;color:#eef0ff;">Hello,</p>
    <p style="margin:0 0 28px 0;font-size:14px;line-height:1.6;color:#a9aac8;">Use the verification code below to complete your ${label.toLowerCase()}. For your security, never share this code with anyone.</p>

    <!-- OTP card -->
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 24px 0;">
      <tr><td align="center" style="background:#0a0820;background-image:linear-gradient(145deg,#171138 0%,#0a0820 100%);border:1px solid rgba(245,212,114,0.22);border-radius:16px;padding:28px 16px;">
        <div style="font-size:11px;font-weight:600;color:#f5d472;letter-spacing:4px;text-transform:uppercase;margin:0 0 18px 0;">Your Verification Code</div>
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" align="center" style="margin:0 auto;">
          <tr>${digitCells}</tr>
        </table>
        <div style="margin:18px 0 0 0;font-size:12px;color:#7e7fa8;letter-spacing:1px;">Expires in ${expiry} minutes</div>
      </td></tr>
    </table>

    <!-- Security note -->
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
      <tr><td style="background:rgba(245,212,114,0.06);border-left:3px solid #f5d472;border-radius:8px;padding:14px 16px;">
        <p style="margin:0;font-size:12px;line-height:1.6;color:#c9c9e0;">
          <strong style="color:#f5d472;">Security tip:</strong> ${brand} staff will never ask for this code. If you didn't request it, please ignore this email.
        </p>
      </td></tr>
    </table>
  </td></tr>

  <!-- FOOTER -->
  <tr><td style="background:#080718;padding:22px 32px;text-align:center;border-top:1px solid rgba(245,212,114,0.1);">
    <div style="margin:0 0 6px 0;font-size:11px;color:#5d5e7e;">This is an automated message — please do not reply.</div>
    <div style="margin:0;font-size:11px;color:#42435c;letter-spacing:1px;">&copy; ${new Date().getFullYear()} ${brand} &middot; All Rights Reserved</div>
  </td></tr>

</table>
</td></tr>
</table>
</body>
</html>`;
}

export function buildOtpEmailText(opts: OtpEmailOptions): string {
  const brand = opts.brandName ?? "MeriLive";
  const expiry = opts.expiryMinutes ?? 5;
  const label = purposeLabel(opts.purpose);
  return `${brand} — ${label}

Your verification code: ${opts.otp}

This code expires in ${expiry} minutes.
For your security, never share this code with anyone. ${brand} staff will never ask for it.

If you didn't request this code, you can safely ignore this email.

© ${new Date().getFullYear()} ${brand}`;
}
