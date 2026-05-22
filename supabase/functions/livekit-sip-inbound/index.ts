// Pkg115: LiveKit SIP Inbound — admin-managed PSTN → room routing.
//
// Admin creates a SIP trunk (mapping a phone number / DID to LiveKit) and a
// dispatch rule that drops every incoming call into a target room.
//
// Auth: x-admin-access-token header (validated via validate-admin-token edge fn).
// Body: { action: 'create_trunk', name, numbers[] }
//       { action: 'create_route', name, trunkId, numbers[], roomName?, roomPrefix?, ruleType, participantIdentityPrefix? }
//       { action: 'list_routes' }
//       { action: 'delete_route', routeId }
//       { action: 'set_enabled', routeId, enabled }
//
// Kill-switch: app_settings.livekit_signaling_enabled.sip_inbound === true
import { createClient } from "npm:@supabase/supabase-js@2";
import { SipClient } from "npm:livekit-server-sdk@2.9.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-admin-access-token",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const LIVEKIT_URL = Deno.env.get("LIVEKIT_URL") ?? "";
const LIVEKIT_API_KEY = Deno.env.get("LIVEKIT_API_KEY") ?? "";
const LIVEKIT_API_SECRET = Deno.env.get("LIVEKIT_API_SECRET") ?? "";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

const httpUrl = LIVEKIT_URL.replace(/^wss:\/\//, "https://").replace(/^ws:\/\//, "http://");

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

async function validateAdminToken(token: string) {
  try {
    const res = await fetch(`${SUPABASE_URL}/functions/v1/validate-admin-token`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
      },
      body: JSON.stringify({ token, action: "validate" }),
    });
    if (!res.ok) return { ok: false };
    const data = await res.json().catch(() => ({}));
    return data?.valid ? { ok: true as const, role: data.role as string } : { ok: false as const };
  } catch (e) {
    console.warn("[Pkg115] admin validate failed:", e);
    return { ok: false as const };
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json(405, { error: "method_not_allowed" });

  if (!LIVEKIT_URL || !LIVEKIT_API_KEY || !LIVEKIT_API_SECRET) {
    return json(500, { error: "livekit_not_configured" });
  }

  const adminToken = req.headers.get("x-admin-access-token");
  if (!adminToken) return json(401, { error: "missing_admin_token" });
  const auth = await validateAdminToken(adminToken);
  if (!auth.ok) return json(401, { error: "invalid_admin_token" });

  const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  // Kill-switch
  const { data: setting } = await admin
    .from("app_settings")
    .select("setting_value")
    .eq("setting_key", "livekit_signaling_enabled")
    .maybeSingle();
  let enabled = false;
  try {
    const v = setting?.setting_value ? JSON.parse(setting.setting_value) : {};
    enabled = v?.sip_inbound === true;
  } catch { enabled = false; }
  if (!enabled) return json(403, { error: "sip_inbound_disabled" });

  const body = await req.json().catch(() => ({}));
  const action = body?.action as string | undefined;

  const sip = new SipClient(httpUrl, LIVEKIT_API_KEY, LIVEKIT_API_SECRET);

  try {
    if (action === "create_trunk") {
      const { name, numbers } = body as { name?: string; numbers?: string[] };
      if (!name || !Array.isArray(numbers) || numbers.length === 0) {
        return json(400, { error: "name_and_numbers_required" });
      }
      // deno-lint-ignore no-explicit-any
      const trunk: any = await (sip as any).createSipInboundTrunk(name, numbers);
      return json(200, { trunkId: trunk?.sipTrunkId ?? trunk?.id ?? null });
    }

    if (action === "create_route") {
      const {
        name, trunkId, numbers, roomName, roomPrefix,
        ruleType, participantIdentityPrefix,
      } = body as {
        name?: string;
        trunkId?: string;
        numbers?: string[];
        roomName?: string;
        roomPrefix?: string;
        ruleType?: "direct" | "individual";
        participantIdentityPrefix?: string;
      };
      if (!name) return json(400, { error: "name_required" });
      const finalRuleType = ruleType ?? (roomName ? "direct" : "individual");
      if (finalRuleType === "direct" && !roomName) {
        return json(400, { error: "roomName_required_for_direct" });
      }
      if (finalRuleType === "individual" && !roomPrefix) {
        return json(400, { error: "roomPrefix_required_for_individual" });
      }

      // Build dispatch rule (LiveKit SDK shape).
      const rule = finalRuleType === "direct"
        ? { type: "direct" as const, roomName: roomName! }
        : { type: "individual" as const, roomPrefix: roomPrefix! };

      // deno-lint-ignore no-explicit-any
      let dispatch: any = null;
      try {
        // deno-lint-ignore no-explicit-any
        dispatch = await (sip as any).createSipDispatchRule(rule, {
          name,
          trunkIds: trunkId ? [trunkId] : undefined,
          hidePhoneNumber: false,
        });
      } catch (e) {
        const msg = (e as Error).message ?? "dispatch_create_failed";
        console.error("[Pkg115] createSipDispatchRule failed:", msg);
        return json(502, { error: "dispatch_create_failed", detail: msg });
      }

      const { data: row, error: insErr } = await admin
        .from("sip_inbound_routes")
        .insert({
          name,
          trunk_id: trunkId ?? null,
          dispatch_rule_id: dispatch?.sipDispatchRuleId ?? dispatch?.id ?? null,
          phone_numbers: Array.isArray(numbers) ? numbers : [],
          room_name: finalRuleType === "direct" ? roomName : null,
          room_prefix: finalRuleType === "individual" ? roomPrefix : null,
          rule_type: finalRuleType,
          participant_identity_prefix: participantIdentityPrefix ?? "sip_",
          enabled: true,
          config: dispatch ?? {},
        })
        .select("id, dispatch_rule_id")
        .single();
      if (insErr) {
        console.error("[Pkg115] route insert failed:", insErr.message);
        return json(500, { error: "route_insert_failed", detail: insErr.message });
      }
      return json(200, { routeId: row.id, dispatchRuleId: row.dispatch_rule_id });
    }

    if (action === "list_routes") {
      const { data, error } = await admin
        .from("sip_inbound_routes")
        .select("id, name, trunk_id, dispatch_rule_id, phone_numbers, room_name, room_prefix, rule_type, participant_identity_prefix, enabled, created_at")
        .order("created_at", { ascending: false })
        .limit(100);
      if (error) return json(500, { error: error.message });
      return json(200, { routes: data ?? [] });
    }

    if (action === "delete_route") {
      const { routeId } = body as { routeId?: string };
      if (!routeId) return json(400, { error: "routeId_required" });

      const { data: route } = await admin
        .from("sip_inbound_routes")
        .select("dispatch_rule_id")
        .eq("id", routeId)
        .maybeSingle();
      if (route?.dispatch_rule_id) {
        try {
          // deno-lint-ignore no-explicit-any
          await (sip as any).deleteSipDispatchRule(route.dispatch_rule_id);
        } catch (e) {
          console.warn("[Pkg115] deleteSipDispatchRule warn:", (e as Error).message);
        }
      }
      await admin.from("sip_inbound_routes").delete().eq("id", routeId);
      return json(200, { ok: true });
    }

    if (action === "set_enabled") {
      const { routeId, enabled: en } = body as { routeId?: string; enabled?: boolean };
      if (!routeId || typeof en !== "boolean") return json(400, { error: "routeId_and_enabled_required" });
      await admin
        .from("sip_inbound_routes")
        .update({ enabled: en, updated_at: new Date().toISOString() })
        .eq("id", routeId);
      return json(200, { ok: true });
    }

    return json(400, { error: "unknown_action" });
  } catch (e) {
    console.error("livekit-sip-inbound error:", e);
    return json(500, { error: (e as Error).message ?? "internal_error" });
  }
});
