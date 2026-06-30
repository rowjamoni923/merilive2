// ============================================================================
// Multi-provider OTP email orchestrator (RACE MODE)
// ----------------------------------------------------------------------------
// Fires Resend + Brevo + Gmail SMTP in PARALLEL. First success wins; losers
// are cancelled/ignored. Per-provider hard timeout. Near-100% delivery even
// if one or two providers are down/slow/rate-limited.
//
// Priority order (when admin chooses sequential mode in future):
//   1. Resend     — merilive.com verified, best deliverability
//   2. Brevo      — already connected, 300/day free
//   3. Gmail SMTP — last-resort fallback
// ============================================================================
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import nodemailer from "npm:nodemailer@6.9.12";

export interface SendOtpEmailArgs {
  to: string;
  otp: string;
  purpose: string;
  expiryMinutes?: number;
  idempotencyKey?: string;
}

type ProviderName = "resend" | "brevo" | "gmail-smtp";

type SendOtpEmailResult = {
  success: boolean;
  error?: string;
  code?: string;
  status?: number;
  provider?: ProviderName;
  raceResults?: Record<string, { ok: boolean; ms: number; error?: string }>;
};

// ---- Per-provider hard timeout (ms) — slow provider কে wait করব না --------
const PROVIDER_TIMEOUT_MS = 4000;

// ---------------------------------------------------------------------------
// Gmail SMTP transporter (pooled)
// ---------------------------------------------------------------------------
let cachedGmailTransporter: any = null;
function getGmailTransporter() {
  if (cachedGmailTransporter) return cachedGmailTransporter;
  const gmailUser = (Deno.env.get("GMAIL_USER") ?? "").trim();
  const gmailPass = (Deno.env.get("GMAIL_APP_PASSWORD") ?? "").replace(/\s+/g, "");
  if (!gmailUser || !gmailPass) return null;
  cachedGmailTransporter = nodemailer.createTransport({
    host: "smtp.gmail.com",
    port: 465,
    secure: true,
    auth: { user: gmailUser, pass: gmailPass },
    pool: true,
    maxConnections: 2,
    maxMessages: 50,
  });
  return cachedGmailTransporter;
}

// ---------------------------------------------------------------------------
// HTML / copy helpers
// ---------------------------------------------------------------------------
function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function purposeLabel(purpose: string): string {
  switch (purpose) {
    case "login": return "Sign-In Verification";
    case "register":
    case "account_signup": return "Account Sign Up";
    case "account_email": return "Email Verification";
    case "reset":
    case "password_reset": return "Password Reset";
    case "admin":
    case "admin_login":
    case "admin_2fa":
    case "two_factor": return "Admin Verification";
    case "admin_forgot":
    case "admin_password_reset": return "Admin Password Reset";
    case "agency":
    case "agency_signup": return "Agency Sign Up";
    case "sub_agency_signup": return "Sub-Agency Sign Up";
    default: return "Identity Verification";
  }
}

function buildOtpHtml(otp: string, purpose: string, expiryMinutes: number): string {
  const safeOtp = escapeHtml(otp);
  const safeLabel = escapeHtml(purposeLabel(purpose));
  const digits = safeOtp.split("").map((digit) => `
    <td style="width:42px;height:48px;text-align:center;border:1px solid #ead78f;border-radius:12px;background:#fff8dc;font-size:26px;font-weight:800;color:#111827;font-family:Arial,Helvetica,sans-serif;">${digit}</td>
  `).join('<td style="width:8px"></td>');

  return `<!doctype html>
  <html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
  <body style="margin:0;padding:0;background:#ffffff;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;color:#111827;">
    <div style="max-width:560px;margin:0 auto;padding:32px 16px;">
      <div style="border:1px solid #ece6d3;border-radius:20px;overflow:hidden;box-shadow:0 8px 32px rgba(15,12,41,.08);">
        <div style="background:#111827;padding:30px 24px;text-align:center;">
          <div style="font-size:28px;font-weight:800;letter-spacing:4px;color:#ffffff;line-height:1;">MERI<span style="color:#f5d472;">LIVE</span></div>
          <div style="margin-top:10px;font-size:11px;font-weight:700;letter-spacing:3px;color:#c9b079;text-transform:uppercase;">Premium Live Streaming</div>
        </div>
        <div style="padding:32px 28px;background:#ffffff;">
          <div style="display:inline-block;margin-bottom:14px;padding:6px 14px;border:1px solid #f0d97a;border-radius:999px;background:#fff7d6;color:#7a5a16;font-size:11px;font-weight:800;letter-spacing:2px;text-transform:uppercase;">${safeLabel}</div>
          <h1 style="margin:6px 0 12px;font-size:24px;line-height:1.25;color:#111827;">Your Verification Code</h1>
          <p style="margin:0 0 24px;font-size:15px;line-height:1.6;color:#4b5563;">Hello, use the code below to complete your MeriLive verification.</p>
          <table role="presentation" style="margin:8px 0 18px;width:100%;background:#fffdf3;border-radius:16px;padding:18px 8px;"><tr>${digits}</tr></table>
          <p style="margin:0 0 18px;font-size:14px;color:#6b7280;">This code expires in <strong>${expiryMinutes} minutes</strong>.</p>
          <div style="border-left:4px solid #f5d472;background:#fffbeb;padding:14px 16px;border-radius:12px;">
            <p style="margin:0 0 6px;font-weight:800;color:#111827;font-size:13px;">Security Notice</p>
            <p style="margin:0;color:#4b5563;font-size:13px;line-height:1.5;">MeriLive staff will never ask for this code. If you did not request it, you can safely ignore this email.</p>
          </div>
        </div>
      </div>
    </div>
  </body></html>`;
}

function parseSender(raw: string, fallbackEmail: string): { name: string; email: string } {
  const match = raw.match(/^(.+?)\s*<([^>]+)>$/);
  if (match) return { name: match[1].trim(), email: match[2].trim() };
  if (raw.includes("@")) return { name: "MeriLive", email: raw };
  return { name: "MeriLive", email: fallbackEmail };
}

// ---------------------------------------------------------------------------
// Provider: Resend  (via Lovable connector gateway)
// ---------------------------------------------------------------------------
async function sendOtpViaResend(args: SendOtpEmailArgs, subject: string, html: string, text: string, signal: AbortSignal): Promise<void> {
  const lovableKey = (Deno.env.get("LOVABLE_API_KEY") ?? "").trim();
  const resendKey = (Deno.env.get("RESEND_API_KEY") ?? "").trim();
  if (!lovableKey || !resendKey) throw new Error("RESEND_NOT_CONFIGURED");

  const fromRaw = (Deno.env.get("RESEND_FROM_EMAIL") ?? "MeriLive Security <noreply@merilive.com>").trim();
  const sender = parseSender(fromRaw, "noreply@merilive.com");

  const resp = await fetch("https://connector-gateway.lovable.dev/resend/emails", {
    method: "POST",
    signal,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${lovableKey}`,
      "X-Connection-Api-Key": resendKey,
    },
    body: JSON.stringify({
      from: `${sender.name} <${sender.email}>`,
      to: [args.to],
      subject,
      html,
      text,
      headers: {
        "Auto-Submitted": "auto-generated",
        Precedence: "transactional",
      },
    }),
  });

  if (!resp.ok) {
    const body = await resp.text().catch(() => "");
    throw new Error(`RESEND_HTTP_${resp.status}:${body.slice(0, 200)}`);
  }
}

// ---------------------------------------------------------------------------
// Provider: Brevo (direct API)
// ---------------------------------------------------------------------------
async function sendOtpViaBrevo(args: SendOtpEmailArgs, subject: string, html: string, text: string, signal: AbortSignal): Promise<void> {
  const brevoKey = (Deno.env.get("BREVO_API_KEY") ?? "").trim();
  const fromRaw = (Deno.env.get("BREVO_FROM_EMAIL") ?? "").trim();
  if (!brevoKey || !fromRaw) throw new Error("BREVO_NOT_CONFIGURED");
  const sender = parseSender(fromRaw, "noreply@merilive.com");

  const resp = await fetch("https://api.brevo.com/v3/smtp/email", {
    method: "POST",
    signal,
    headers: {
      "Content-Type": "application/json",
      "api-key": brevoKey,
      Accept: "application/json",
    },
    body: JSON.stringify({
      sender,
      to: [{ email: args.to }],
      subject,
      htmlContent: html,
      textContent: text,
      headers: { "Auto-Submitted": "auto-generated", Precedence: "transactional" },
    }),
  });

  if (!resp.ok) {
    const body = await resp.text().catch(() => "");
    throw new Error(`BREVO_HTTP_${resp.status}:${body.slice(0, 200)}`);
  }
}

// ---------------------------------------------------------------------------
// Provider: Gmail SMTP
// ---------------------------------------------------------------------------
async function sendOtpViaGmail(args: SendOtpEmailArgs, subject: string, html: string, text: string): Promise<void> {
  const transporter = getGmailTransporter();
  const gmailUser = (Deno.env.get("GMAIL_USER") ?? "").trim();
  if (!transporter || !gmailUser) throw new Error("GMAIL_NOT_CONFIGURED");

  await transporter.sendMail({
    from: `MeriLive Security <${gmailUser}>`,
    to: args.to,
    replyTo: gmailUser,
    subject,
    text,
    html,
    headers: { "Auto-Submitted": "auto-generated", Precedence: "transactional" },
  });
}

// ---------------------------------------------------------------------------
// Admin config loader — single source of truth from otp_provider_config table
// ---------------------------------------------------------------------------
type ProviderConfigRow = {
  provider: string;
  enabled: boolean;
  priority: number;
  daily_quota: number | null;
  daily_sent: number;
  last_reset_date: string;
};

type OrchestratorSettings = { mode: "race" | "sequential"; per_provider_timeout_ms: number };

async function loadAdminConfig(supabase: any): Promise<{
  providers: Record<string, ProviderConfigRow>;
  settings: OrchestratorSettings;
}> {
  const defaults: OrchestratorSettings = { mode: "race", per_provider_timeout_ms: 4000 };
  try {
    const [cfgRes, setRes] = await Promise.all([
      supabase.from("otp_provider_config").select("*"),
      supabase.from("otp_orchestrator_settings").select("*").maybeSingle(),
    ]);
    const providers: Record<string, ProviderConfigRow> = {};
    for (const row of (cfgRes.data ?? []) as ProviderConfigRow[]) {
      // Reset counter if day rolled over (in-memory; DB updated by RPC on increment)
      const today = new Date().toISOString().slice(0, 10);
      if (row.last_reset_date !== today) row.daily_sent = 0;
      providers[row.provider] = row;
    }
    const settings: OrchestratorSettings = setRes.data
      ? { mode: setRes.data.mode, per_provider_timeout_ms: setRes.data.per_provider_timeout_ms }
      : defaults;
    return { providers, settings };
  } catch (_e) {
    return { providers: {}, settings: defaults };
  }
}

function providerEligible(name: string, cfg: Record<string, ProviderConfigRow>): boolean {
  const row = cfg[name];
  if (!row) return true; // No admin row yet → allow (backward compat)
  if (!row.enabled) return false;
  if (row.daily_quota != null && row.daily_sent >= row.daily_quota) return false;
  return true;
}

// ---------------------------------------------------------------------------
// Race runner — wraps a provider with timeout + telemetry
// ---------------------------------------------------------------------------
function runProvider(
  name: ProviderName,
  fn: (signal: AbortSignal) => Promise<void>,
  controller: AbortController,
  telemetry: Record<string, { ok: boolean; ms: number; error?: string }>,
  timeoutMs: number,
): Promise<ProviderName> {
  const started = Date.now();
  const timer = setTimeout(() => controller.abort(`${name}_TIMEOUT`), timeoutMs);

  return fn(controller.signal)
    .then(() => {
      clearTimeout(timer);
      telemetry[name] = { ok: true, ms: Date.now() - started };
      return name;
    })
    .catch((e) => {
      clearTimeout(timer);
      const err = e instanceof Error ? e.message : String(e);
      telemetry[name] = { ok: false, ms: Date.now() - started, error: err };
      throw e;
    });
}

// ---------------------------------------------------------------------------
// MAIN
// ---------------------------------------------------------------------------
export async function sendOtpEmail(args: SendOtpEmailArgs): Promise<SendOtpEmailResult> {
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceKey) {
    return { success: false, error: "Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY" };
  }
  const supabase = createClient(supabaseUrl, serviceKey);

  // OTP emails bypass suppression (auth-critical).
  try {
    await supabase.from("suppressed_emails").delete().eq("email", args.to.toLowerCase());
  } catch (_e) { /* non-fatal */ }

  // Admin-controlled config
  const { providers: cfg, settings } = await loadAdminConfig(supabase);
  const timeoutMs = settings.per_provider_timeout_ms || PROVIDER_TIMEOUT_MS;

  const expiryMinutes = args.expiryMinutes ?? 5;
  const subject = `Your MeriLive ${purposeLabel(args.purpose)} code`;
  const text = `Your MeriLive verification code is: ${args.otp}\n\nThis code expires in ${expiryMinutes} minutes. MeriLive staff will never ask for this code.`;
  const html = buildOtpHtml(args.otp, args.purpose, expiryMinutes);
  const messageId = args.idempotencyKey ?? crypto.randomUUID();
  const telemetry: Record<string, { ok: boolean; ms: number; error?: string }> = {};

  // Build candidate list — respect admin enable/quota + env-var presence
  type Candidate = {
    name: ProviderName;
    dbKey: string;
    priority: number;
    run: (sig: AbortSignal) => Promise<void>;
    ctl: AbortController;
  };
  const all: Candidate[] = [];

  if (Deno.env.get("RESEND_API_KEY") && Deno.env.get("LOVABLE_API_KEY") && providerEligible("resend", cfg)) {
    all.push({
      name: "resend", dbKey: "resend",
      priority: cfg["resend"]?.priority ?? 1,
      run: (sig) => sendOtpViaResend(args, subject, html, text, sig),
      ctl: new AbortController(),
    });
  }
  if (Deno.env.get("BREVO_API_KEY") && Deno.env.get("BREVO_FROM_EMAIL") && providerEligible("brevo", cfg)) {
    all.push({
      name: "brevo", dbKey: "brevo",
      priority: cfg["brevo"]?.priority ?? 2,
      run: (sig) => sendOtpViaBrevo(args, subject, html, text, sig),
      ctl: new AbortController(),
    });
  }
  if (Deno.env.get("GMAIL_USER") && Deno.env.get("GMAIL_APP_PASSWORD") && providerEligible("gmail", cfg)) {
    all.push({
      name: "gmail-smtp", dbKey: "gmail",
      priority: cfg["gmail"]?.priority ?? 3,
      run: (_sig) => sendOtpViaGmail(args, subject, html, text),
      ctl: new AbortController(),
    });
  }

  all.sort((a, b) => a.priority - b.priority);

  if (all.length === 0) {
    return { success: false, error: "No eligible OTP provider (check admin panel / quotas / env)", code: "NO_PROVIDER", status: 503 };
  }

  // Log pending entry once for the whole attempt.
  try {
    await supabase.from("email_send_log").insert({
      message_id: messageId,
      template_name: "otp-code",
      recipient_email: args.to,
      status: "pending",
      metadata: { providers: all.map((c) => c.name), mode: settings.mode },
    });
  } catch (_e) { /* non-fatal */ }

  const finalize = async (winner: ProviderName, dbKey: string) => {
    try { await supabase.rpc("increment_otp_provider_sent", { _provider: dbKey }); } catch (_e) {}
    try {
      await supabase.from("email_send_log").insert({
        message_id: messageId, template_name: "otp-code", recipient_email: args.to,
        status: "sent", metadata: { provider: winner, mode: settings.mode, race: telemetry },
      });
    } catch (_e) {}
    console.log(`[sendOtpEmail] WINNER=${winner} mode=${settings.mode} race=${JSON.stringify(telemetry)}`);
  };

  // ---- SEQUENTIAL MODE: try in priority order, stop at first success ------
  if (settings.mode === "sequential") {
    for (const c of all) {
      try {
        await runProvider(c.name, c.run, c.ctl, telemetry, timeoutMs);
        await finalize(c.name, c.dbKey);
        return { success: true, provider: c.name, raceResults: telemetry };
      } catch (_e) { /* try next */ }
    }
    // All failed
  } else {
    // ---- RACE MODE: parallel, first success wins -------------------------
    const promises = all.map((c) => runProvider(c.name, c.run, c.ctl, telemetry, timeoutMs)
      .then((winnerName) => ({ winnerName, dbKey: c.dbKey })));
    try {
      const winner = await Promise.any(promises);
      // Cancel losers
      for (const c of all) c.ctl.abort("WINNER_DECIDED");
      await finalize(winner.winnerName, winner.dbKey);
      return { success: true, provider: winner.winnerName, raceResults: telemetry };
    } catch (_aggErr) {
      // fallthrough to all-failed handler
    }
  }

  // ---- ALL FAILED -----------------------------------------------------------
  const errMsg = `All providers failed: ${JSON.stringify(telemetry)}`;
  console.error("[sendOtpEmail] " + errMsg);
  try {
    await supabase.from("email_send_log").insert({
      message_id: messageId, template_name: "otp-code", recipient_email: args.to,
      status: "failed", error_message: "ALL_PROVIDERS_FAILED",
      metadata: { mode: settings.mode, race: telemetry },
    });
  } catch (_e) {}
  return { success: false, error: errMsg, code: "ALL_PROVIDERS_FAILED", status: 503, raceResults: telemetry };
}
