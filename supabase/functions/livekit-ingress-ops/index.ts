// Pkg137 — Admin LiveKit Ingress Ops
//
// Read-only inspection + safe delete of LiveKit ingress jobs (Pkg109 RTMP/WHIP,
// Pkg115 SIP inbound trunks/dispatch rules ride separate APIs).
//
// Actions (admin-only via x-admin-access-token):
//   list_ingress {roomName?}         → IngressClient.listIngress(...)
//   get_ingress  {ingressId}         → single ingress
//   delete_ingress {ingressId}       → IngressClient.deleteIngress(id)
//
// Kill-switch: app_settings.livekit_signaling_enabled.ingress_ops === true (default OFF)
import { createClient } from "npm:@supabase/supabase-js@2";
import { IngressClient } from "npm:livekit-server-sdk@2.9.4";

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

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

type Action = "list_ingress" | "get_ingress" | "delete_ingress";
const ALLOWED: Action[] = ["list_ingress", "get_ingress", "delete_ingress"];

async function validateAdminToken(
  token: string,
): Promise<{ ok: boolean; role?: "owner" | "sub_admin" }> {
  try {
    const res = await fetch(
      `${SUPABASE_URL}/functions/v1/validate-admin-token`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          apikey: SUPABASE_ANON_KEY,
          Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
        },
        body: JSON.stringify({ token, action: "validate" }),
      },
    );
    if (!res.ok) return { ok: false };
    const data = await res.json().catch(() => ({}));
    return data?.valid ? { ok: true, role: data.role } : { ok: false };
  } catch (e) {
    console.warn("[livekit-ingress-ops] admin validate failed:", e);
    return { ok: false };
  }
}

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
    return v?.ingress_ops === true;
  } catch {
    return false;
  }
}

async function audit(
  admin: ReturnType<typeof createClient>,
  row: {
    role: string;
    action: string;
    ingressId?: string;
    roomName?: string;
    resultCount?: number;
    error?: string;
  },
) {
  try {
    await admin.from("livekit_ingress_ops_log").insert({
      actor_admin_role: row.role,
      action: row.action,
      ingress_id: row.ingressId ?? null,
      room_name: row.roomName ?? null,
      result_count: row.resultCount ?? null,
      error: row.error ?? null,
    });
  } catch (e) {
    console.warn("[livekit-ingress-ops] audit insert failed:", e);
  }
}

function summarize(i: any) {
  return {
    ingressId: i?.ingressId ?? null,
    name: i?.name ?? null,
    streamKey: i?.streamKey ? "•••" + String(i.streamKey).slice(-4) : null,
    url: i?.url ?? null,
    inputType: i?.inputType ?? null,
    roomName: i?.roomName ?? null,
    participantIdentity: i?.participantIdentity ?? null,
    participantName: i?.participantName ?? null,
    reusable: i?.reusable ?? null,
    state: i?.state
      ? {
          status: i.state.status ?? null,
          error: i.state.error ?? null,
          startedAt: i.state.startedAt ? Number(i.state.startedAt) : null,
          endedAt: i.state.endedAt ? Number(i.state.endedAt) : null,
          resourceId: i.state.resourceId ?? null,
        }
      : null,
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
    return json(403, { error: "ingress_ops_disabled" });
  }

  const adminToken = req.headers.get("x-admin-access-token") ?? "";
  if (!adminToken) return json(401, { error: "missing_admin_token" });
  const v = await validateAdminToken(adminToken);
  if (!v.ok) return json(401, { error: "invalid_admin_token" });
  const role = v.role ?? "sub_admin";

  const body = await req.json().catch(() => ({}));
  const action = String(body?.action ?? "") as Action;
  const ingressId = body?.ingressId ? String(body.ingressId).trim() : "";
  const roomName = body?.roomName ? String(body.roomName).trim() : "";

  if (!ALLOWED.includes(action)) {
    await audit(adminClient, { role, action: String(action), error: "invalid_action" });
    return json(400, { error: "invalid_action" });
  }
  if ((action === "get_ingress" || action === "delete_ingress") && !ingressId) {
    await audit(adminClient, { role, action, error: "missing_ingress_id" });
    return json(400, { error: "missing_ingress_id" });
  }

  const svc = new IngressClient(LIVEKIT_URL, LIVEKIT_API_KEY, LIVEKIT_API_SECRET);

  try {
    if (action === "list_ingress") {
      const list = await svc.listIngress(roomName ? ({ roomName } as any) : undefined);
      const out = (list ?? []).map(summarize);
      await audit(adminClient, { role, action, roomName: roomName || undefined, resultCount: out.length });
      return json(200, { ingress: out });
    }

    if (action === "get_ingress") {
      const list = await svc.listIngress({ ingressId } as any);
      const one = (list ?? [])[0] ?? null;
      await audit(adminClient, {
        role,
        action,
        ingressId,
        roomName: one?.roomName ?? undefined,
        resultCount: one ? 1 : 0,
      });
      return json(200, { ingress: one ? summarize(one) : null });
    }

    // delete_ingress
    await svc.deleteIngress(ingressId);
    await audit(adminClient, { role, action, ingressId, resultCount: 1 });
    return json(200, { ok: true });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await audit(adminClient, {
      role,
      action,
      ingressId: ingressId || undefined,
      roomName: roomName || undefined,
      error: msg.slice(0, 500),
    });
    return json(500, { error: "livekit_error", message: msg });
  }
});
