// Pkg136 — Admin LiveKit Egress Ops
//
// Actions (admin-only via x-admin-token admin session):
//   list_egress {roomName?, active?}  → EgressClient.listEgress(...)
//   get_egress {egressId}             → single egress (via listEgress({egressId}))
//   update_layout {egressId, layout}  → EgressClient.updateLayout(egressId, layout)
//
// Read-only inspection + safe layout mutation for active room-composite jobs.
// Stop/cancel stays in livekit-egress / livekit-hls-egress / livekit-stream-egress.
// Kill-switch: app_settings.livekit_signaling_enabled.egress_ops === true (default OFF)
import { createClient } from "npm:@supabase/supabase-js@2";
import { EgressClient } from "npm:livekit-server-sdk@2.9.4";
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

type Action = "list_egress" | "get_egress" | "update_layout";
const ALLOWED: Action[] = ["list_egress", "get_egress", "update_layout"];

// Whitelist matches LiveKit RoomCompositeEgressRequest.layout supported values.
const ALLOWED_LAYOUTS = new Set([
  "speaker",
  "speaker-dark",
  "speaker-light",
  "grid",
  "grid-dark",
  "grid-light",
  "single-speaker",
  "single-speaker-dark",
  "single-speaker-light",
]);

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
    return v?.egress_ops === true;
  } catch {
    return false;
  }
}

async function audit(
  admin: ReturnType<typeof createClient>,
  row: {
    role: string;
    action: string;
    egressId?: string;
    roomName?: string;
    layout?: string;
    resultCount?: number;
    error?: string;
  },
) {
  try {
    await admin.from("livekit_egress_ops_log").insert({
      actor_admin_role: row.role,
      action: row.action,
      egress_id: row.egressId ?? null,
      room_name: row.roomName ?? null,
      layout: row.layout ?? null,
      result_count: row.resultCount ?? null,
      error: row.error ?? null,
    });
  } catch (e) {
    console.warn("[livekit-egress-ops] audit insert failed:", e);
  }
}

function summarizeEgress(e: any) {
  return {
    egressId: e?.egressId ?? null,
    roomName: e?.roomName ?? null,
    status: e?.status ?? null,
    startedAt: e?.startedAt ? Number(e.startedAt) : null,
    updatedAt: e?.updatedAt ? Number(e.updatedAt) : null,
    endedAt: e?.endedAt ? Number(e.endedAt) : null,
    error: e?.error ?? null,
    fileResults: Array.isArray(e?.fileResults)
      ? e.fileResults.map((f: any) => ({
          location: f?.location ?? null,
          size: f?.size ? Number(f.size) : null,
          duration: f?.duration ? Number(f.duration) : null,
        }))
      : [],
    streamResults: Array.isArray(e?.streamResults)
      ? e.streamResults.map((s: any) => ({
          url: s?.url ?? null,
        }))
      : [],
    segmentResults: Array.isArray(e?.segmentResults)
      ? e.segmentResults.map((s: any) => ({
          playlistName: s?.playlistName ?? null,
          playlistLocation: s?.playlistLocation ?? null,
          segmentCount: s?.segmentCount ? Number(s.segmentCount) : null,
        }))
      : [],
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
    return json(403, { error: "egress_ops_disabled" });
  }

  const adminAuth = await requireAdminSession(req, adminClient);
  if (!adminAuth.ok) return json(adminAuth.status, { error: adminAuth.error });
  const role = adminAuth.admin.role === "owner" ? "owner" : "sub_admin";

  const body = await req.json().catch(() => ({}));
  const action = String(body?.action ?? "") as Action;
  const egressId = body?.egressId ? String(body.egressId).trim() : "";
  const roomName = body?.roomName ? String(body.roomName).trim() : "";
  const active = body?.active === true;
  const layout = body?.layout ? String(body.layout).trim() : "";

  if (!ALLOWED.includes(action)) {
    await audit(adminClient, { role, action: String(action), error: "invalid_action" });
    return json(400, { error: "invalid_action" });
  }
  if ((action === "get_egress" || action === "update_layout") && !egressId) {
    await audit(adminClient, { role, action, error: "missing_egress_id" });
    return json(400, { error: "missing_egress_id" });
  }
  if (action === "update_layout") {
    if (!layout) {
      await audit(adminClient, { role, action, egressId, error: "missing_layout" });
      return json(400, { error: "missing_layout" });
    }
    if (!ALLOWED_LAYOUTS.has(layout)) {
      await audit(adminClient, { role, action, egressId, layout, error: "invalid_layout" });
      return json(400, { error: "invalid_layout" });
    }
  }

  const svc = new EgressClient(LIVEKIT_URL, LIVEKIT_API_KEY, LIVEKIT_API_SECRET);

  try {
    if (action === "list_egress") {
      const opts: any = {};
      if (roomName) opts.roomName = roomName;
      if (active) opts.active = true;
      const list = await svc.listEgress(Object.keys(opts).length ? opts : undefined);
      const out = (list ?? []).map(summarizeEgress);
      await audit(adminClient, { role, action, roomName: roomName || undefined, resultCount: out.length });
      return json(200, { egress: out });
    }

    if (action === "get_egress") {
      const list = await svc.listEgress({ egressId } as any);
      const one = (list ?? [])[0] ?? null;
      await audit(adminClient, {
        role,
        action,
        egressId,
        roomName: one?.roomName ?? undefined,
        resultCount: one ? 1 : 0,
      });
      return json(200, { egress: one ? summarizeEgress(one) : null });
    }

    // update_layout
    await svc.updateLayout(egressId, layout);
    const list = await svc.listEgress({ egressId } as any).catch(() => [] as any[]);
    const one = (list ?? [])[0] ?? null;
    await audit(adminClient, {
      role,
      action,
      egressId,
      layout,
    });
    return json(200, { ok: true, egress: one ? summarizeEgress(one) : null });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await audit(adminClient, {
      role,
      action,
      egressId: egressId || undefined,
      layout: layout || undefined,
      error: msg.slice(0, 500),
    });
    return json(500, { error: "livekit_error", message: msg });
  }
});
