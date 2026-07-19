// Pkg138 — Admin LiveKit SIP Ops
//
// Read+delete inspection of LiveKit SIP trunks (inbound/outbound) and dispatch
// rules. Companion to Pkg135/136/137. Create stays in feature-owned edge fns
// (livekit-sip-inbound / Pkg110 livekit-sip).
//
// Actions (admin-only via x-admin-token admin session):
//   list_inbound_trunks
//   list_outbound_trunks
//   list_dispatch_rules
//   delete_inbound_trunk  {sipTrunkId}
//   delete_outbound_trunk {sipTrunkId}
//   delete_dispatch_rule  {sipDispatchRuleId}
//
// Kill-switch: app_settings.livekit_signaling_enabled.sip_ops === true (default OFF)
import { createClient } from "npm:@supabase/supabase-js@2";
import { SipClient } from "npm:livekit-server-sdk@2.9.4";
import { requireAdminSession } from "../_shared/adminAuth.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-admin-access-token, x-admin-token",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const LIVEKIT_URL_RAW = Deno.env.get("LIVEKIT_URL") ?? "";
// LiveKit server SDK needs an HTTP(S) URL; our env is wss:// for the client.
const LIVEKIT_URL = LIVEKIT_URL_RAW.replace(/^wss:\/\//, "https://").replace(/^ws:\/\//, "http://");
const LIVEKIT_API_KEY = Deno.env.get("LIVEKIT_API_KEY") ?? "";
const LIVEKIT_API_SECRET = Deno.env.get("LIVEKIT_API_SECRET") ?? "";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

type Action =
  | "list_inbound_trunks"
  | "list_outbound_trunks"
  | "list_dispatch_rules"
  | "delete_inbound_trunk"
  | "delete_outbound_trunk"
  | "delete_dispatch_rule";

const ALLOWED: Action[] = [
  "list_inbound_trunks",
  "list_outbound_trunks",
  "list_dispatch_rules",
  "delete_inbound_trunk",
  "delete_outbound_trunk",
  "delete_dispatch_rule",
];

async function killSwitchOn(admin: ReturnType<typeof createClient>): Promise<boolean> {
  try {
    const { data } = await admin
      .from("app_settings")
      .select("setting_value")
      .eq("setting_key", "livekit_signaling_enabled")
      .maybeSingle();
    const raw = (data?.setting_value ?? "").toString().trim();
    if (!raw) return false;
    const v = JSON.parse(raw);
    return v?.sip_ops === true;
  } catch {
    return false;
  }
}

async function audit(
  admin: ReturnType<typeof createClient>,
  row: {
    role: string;
    action: string;
    targetId?: string;
    resultCount?: number;
    error?: string;
  },
) {
  try {
    await admin.from("livekit_sip_ops_log").insert({
      actor_admin_role: row.role,
      action: row.action,
      target_id: row.targetId ?? null,
      result_count: row.resultCount ?? null,
      error: row.error ?? null,
    });
  } catch (e) {
    console.warn("[livekit-sip-ops] audit insert failed:", e);
  }
}

const maskPhone = (n: unknown): string | null => {
  if (!n) return null;
  const s = String(n);
  return s.length <= 4 ? "•••" : `${s.slice(0, 2)}•••${s.slice(-2)}`;
};

function summarizeInboundTrunk(t: any) {
  return {
    sipTrunkId: t?.sipTrunkId ?? null,
    name: t?.name ?? null,
    metadata: t?.metadata ?? null,
    numbers: Array.isArray(t?.numbers) ? t.numbers.map(maskPhone) : [],
    allowedAddresses: Array.isArray(t?.allowedAddresses) ? t.allowedAddresses : [],
    allowedNumbers: Array.isArray(t?.allowedNumbers)
      ? t.allowedNumbers.map(maskPhone)
      : [],
    // auth credentials intentionally omitted
    authUsername: t?.authUsername ? "•••" : null,
    authPassword: t?.authPassword ? "•••" : null,
  };
}

function summarizeOutboundTrunk(t: any) {
  return {
    sipTrunkId: t?.sipTrunkId ?? null,
    name: t?.name ?? null,
    metadata: t?.metadata ?? null,
    address: t?.address ?? null,
    transport: t?.transport ?? null,
    numbers: Array.isArray(t?.numbers) ? t.numbers.map(maskPhone) : [],
    authUsername: t?.authUsername ? "•••" : null,
    authPassword: t?.authPassword ? "•••" : null,
  };
}

function summarizeDispatchRule(r: any) {
  return {
    sipDispatchRuleId: r?.sipDispatchRuleId ?? null,
    name: r?.name ?? null,
    metadata: r?.metadata ?? null,
    trunkIds: Array.isArray(r?.trunkIds) ? r.trunkIds : [],
    hidePhoneNumber: r?.hidePhoneNumber ?? null,
    rule: r?.rule ?? null,
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json(405, { error: "method_not_allowed" });

  if (!LIVEKIT_URL || !LIVEKIT_API_KEY || !LIVEKIT_API_SECRET) {
    return json(500, { error: "livekit_not_configured" });
  }

  const adminClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  if (!(await killSwitchOn(adminClient))) {
    return json(403, { error: "sip_ops_disabled" });
  }

  const adminAuth = await requireAdminSession(req, adminClient);
  if (!adminAuth.ok) return json(adminAuth.status, { error: adminAuth.error });
  const role = adminAuth.admin.role === "owner" ? "owner" : "sub_admin";

  const body = await req.json().catch(() => ({}));
  const action = String(body?.action ?? "") as Action;
  const sipTrunkId = body?.sipTrunkId ? String(body.sipTrunkId).trim() : "";
  const sipDispatchRuleId = body?.sipDispatchRuleId
    ? String(body.sipDispatchRuleId).trim()
    : "";

  if (!ALLOWED.includes(action)) {
    await audit(adminClient, { role, action: String(action), error: "invalid_action" });
    return json(400, { error: "invalid_action" });
  }
  if (
    (action === "delete_inbound_trunk" || action === "delete_outbound_trunk") &&
    !sipTrunkId
  ) {
    await audit(adminClient, { role, action, error: "missing_sip_trunk_id" });
    return json(400, { error: "missing_sip_trunk_id" });
  }
  if (action === "delete_dispatch_rule" && !sipDispatchRuleId) {
    await audit(adminClient, { role, action, error: "missing_sip_dispatch_rule_id" });
    return json(400, { error: "missing_sip_dispatch_rule_id" });
  }

  const sip = new SipClient(LIVEKIT_URL, LIVEKIT_API_KEY, LIVEKIT_API_SECRET);

  try {
    if (action === "list_inbound_trunks") {
      const list: any[] = (await (sip as any).listSipInboundTrunk?.()) ?? [];
      const out = list.map(summarizeInboundTrunk);
      await audit(adminClient, { role, action, resultCount: out.length });
      return json(200, { trunks: out });
    }
    if (action === "list_outbound_trunks") {
      const list: any[] = (await (sip as any).listSipOutboundTrunk?.()) ?? [];
      const out = list.map(summarizeOutboundTrunk);
      await audit(adminClient, { role, action, resultCount: out.length });
      return json(200, { trunks: out });
    }
    if (action === "list_dispatch_rules") {
      const list: any[] = (await (sip as any).listSipDispatchRule?.()) ?? [];
      const out = list.map(summarizeDispatchRule);
      await audit(adminClient, { role, action, resultCount: out.length });
      return json(200, { rules: out });
    }
    if (action === "delete_inbound_trunk") {
      await (sip as any).deleteSipTrunk(sipTrunkId);
      await audit(adminClient, { role, action, targetId: sipTrunkId, resultCount: 1 });
      return json(200, { ok: true });
    }
    if (action === "delete_outbound_trunk") {
      await (sip as any).deleteSipTrunk(sipTrunkId);
      await audit(adminClient, { role, action, targetId: sipTrunkId, resultCount: 1 });
      return json(200, { ok: true });
    }
    // delete_dispatch_rule
    await (sip as any).deleteSipDispatchRule(sipDispatchRuleId);
    await audit(adminClient, {
      role,
      action,
      targetId: sipDispatchRuleId,
      resultCount: 1,
    });
    return json(200, { ok: true });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await audit(adminClient, {
      role,
      action,
      error: msg.slice(0, 500),
    });
    return json(500, { error: "livekit_error", message: msg });
  }
});
