// Pkg140 — Admin LiveKit Webhook Events Ops
//
// Read-only inspector for the `livekit_room_events` audit stream populated by
// the `livekit-webhook` function (Pkg97). Caps off the Pkg135-139 admin
// observability suite.
//
// Actions (admin-only via x-admin-access-token):
//   list_events  { roomName?, eventType?, participantIdentity?, limit?, beforeId? }
//   get_event    { eventId }
//   stats        { since? }   -> counts grouped by event in the window
//
// Read-only — no mutations. Kill-switch:
//   app_settings.livekit_signaling_enabled.webhook_events_ops === true
// (default OFF)
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-admin-access-token",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

type Action = "list_events" | "get_event" | "stats";
const ALLOWED: Action[] = ["list_events", "get_event", "stats"];

const MAX_LIMIT = 200;
const DEFAULT_LIMIT = 50;
const MAX_WINDOW_MS = 7 * 24 * 60 * 60 * 1000; // 7 days max stats window

async function validateAdminToken(
  token: string,
): Promise<{ ok: boolean; role?: "owner" | "sub_admin" }> {
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
    return data?.valid ? { ok: true, role: data.role } : { ok: false };
  } catch (e) {
    console.warn("[livekit-webhook-events-ops] admin validate failed:", e);
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
    return v?.webhook_events_ops === true;
  } catch {
    return false;
  }
}

function summarizeEvent(row: any) {
  return {
    id: row?.id ?? null,
    event: row?.event ?? null,
    roomName: row?.room_name ?? null,
    roomSid: row?.room_sid ?? null,
    participantIdentity: row?.participant_identity ?? null,
    participantSid: row?.participant_sid ?? null,
    trackSid: row?.track_sid ?? null,
    payload: row?.payload ?? null,
    createdAt: row?.created_at ?? null,
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json(405, { error: "method_not_allowed" });

  const adminClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  if (!(await killSwitchOn(adminClient))) {
    return json(403, { error: "webhook_events_ops_disabled" });
  }

  const adminToken = req.headers.get("x-admin-access-token") ?? "";
  if (!adminToken) return json(401, { error: "missing_admin_token" });
  const v = await validateAdminToken(adminToken);
  if (!v.ok) return json(401, { error: "invalid_admin_token" });

  const body = await req.json().catch(() => ({}));
  const action = String(body?.action ?? "") as Action;
  if (!ALLOWED.includes(action)) return json(400, { error: "invalid_action" });

  try {
    if (action === "list_events") {
      const roomName = body?.roomName ? String(body.roomName).trim() : "";
      const eventType = body?.eventType ? String(body.eventType).trim() : "";
      const participantIdentity = body?.participantIdentity
        ? String(body.participantIdentity).trim()
        : "";
      const limit = Math.min(
        Math.max(Number(body?.limit) || DEFAULT_LIMIT, 1),
        MAX_LIMIT,
      );
      const beforeId = body?.beforeId ? Number(body.beforeId) : null;

      let q = adminClient
        .from("livekit_room_events")
        .select("id, event, room_name, room_sid, participant_identity, participant_sid, track_sid, payload, created_at")
        .order("id", { ascending: false })
        .limit(limit);

      if (roomName) q = q.eq("room_name", roomName);
      if (eventType) q = q.eq("event", eventType);
      if (participantIdentity) q = q.eq("participant_identity", participantIdentity);
      if (beforeId && Number.isFinite(beforeId)) q = q.lt("id", beforeId);

      const { data, error } = await q;
      if (error) return json(500, { error: "db_error", message: error.message });
      const events = (data ?? []).map(summarizeEvent);
      const nextBeforeId = events.length === limit ? events[events.length - 1].id : null;
      return json(200, { events, nextBeforeId });
    }

    if (action === "get_event") {
      const eventId = Number(body?.eventId);
      if (!eventId || !Number.isFinite(eventId)) {
        return json(400, { error: "missing_event_id" });
      }
      const { data, error } = await adminClient
        .from("livekit_room_events")
        .select("id, event, room_name, room_sid, participant_identity, participant_sid, track_sid, payload, created_at")
        .eq("id", eventId)
        .maybeSingle();
      if (error) return json(500, { error: "db_error", message: error.message });
      if (!data) return json(404, { error: "event_not_found" });
      return json(200, { event: summarizeEvent(data) });
    }

    // stats
    const sinceMs = Number(body?.since);
    const window = sinceMs && Number.isFinite(sinceMs)
      ? Math.min(Math.max(sinceMs, 60_000), MAX_WINDOW_MS)
      : 24 * 60 * 60 * 1000;
    const sinceIso = new Date(Date.now() - window).toISOString();

    const { data, error } = await adminClient
      .from("livekit_room_events")
      .select("event")
      .gte("created_at", sinceIso)
      .limit(10_000);
    if (error) return json(500, { error: "db_error", message: error.message });

    const counts: Record<string, number> = {};
    for (const r of data ?? []) {
      const e = (r as any).event ?? "unknown";
      counts[e] = (counts[e] ?? 0) + 1;
    }
    return json(200, { windowMs: window, counts, total: (data ?? []).length });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return json(500, { error: "internal_error", message: msg });
  }
});
