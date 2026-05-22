// Pkg110: LiveKit SIP dial-out — adds a phone-number participant to a LiveKit room.
// Auth: Supabase JWT. Host-only: caller must own the live_streams row matching room_name.
// Body: { action: 'dial', streamId, phoneNumber, participantName? }
//       { action: 'hangup', sipParticipantId, roomName }
// Returns dial: { sipParticipantId, sipCallId, logId }
//
// Requires LiveKit Cloud SIP outbound trunk pre-configured. Env:
//   LIVEKIT_SIP_TRUNK_ID  — outbound SIP trunk id (e.g. ST_xxxxx)
// Kill-switch: app_settings.livekit_signaling_enabled.sip === true
import { createClient } from "npm:@supabase/supabase-js@2";
import { SipClient, RoomServiceClient } from "npm:livekit-server-sdk@2.9.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-client-platform",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const LIVEKIT_URL = Deno.env.get("LIVEKIT_URL") ?? "";
const LIVEKIT_API_KEY = Deno.env.get("LIVEKIT_API_KEY") ?? "";
const LIVEKIT_API_SECRET = Deno.env.get("LIVEKIT_API_SECRET") ?? "";
const LIVEKIT_SIP_TRUNK_ID = Deno.env.get("LIVEKIT_SIP_TRUNK_ID") ?? "";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

const httpUrl = LIVEKIT_URL.replace(/^wss:\/\//, "https://").replace(/^ws:\/\//, "http://");

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

// E.164 sanity: + then 8-15 digits
const PHONE_RE = /^\+[1-9]\d{7,14}$/;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json(401, { error: "missing_authorization" });

    const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData } = await userClient.auth.getUser();
    const userId = userData.user?.id;
    if (!userId) return json(401, { error: "unauthorized" });

    const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Kill-switch
    const { data: setting } = await admin
      .from("app_settings")
      .select("setting_value")
      .eq("setting_key", "livekit_signaling_enabled")
      .maybeSingle();
    let sipEnabled = false;
    try {
      const v = setting?.setting_value ? JSON.parse(setting.setting_value) : {};
      sipEnabled = v?.sip === true;
    } catch { sipEnabled = false; }
    if (!sipEnabled) return json(403, { error: "sip_disabled" });

    const body = await req.json().catch(() => ({}));
    const action = body?.action as string | undefined;

    if (action === "dial") {
      const { streamId, phoneNumber, participantName } = body as {
        streamId?: string; phoneNumber?: string; participantName?: string;
      };
      if (!streamId || !phoneNumber) return json(400, { error: "streamId_and_phoneNumber_required" });
      if (!PHONE_RE.test(phoneNumber)) return json(400, { error: "invalid_phone_number_format" });
      if (!LIVEKIT_SIP_TRUNK_ID) return json(500, { error: "sip_trunk_not_configured" });

      const { data: stream, error: streamErr } = await admin
        .from("live_streams")
        .select("id, host_id, room_name, is_active")
        .eq("id", streamId)
        .maybeSingle();
      if (streamErr || !stream) return json(404, { error: "stream_not_found" });
      if (stream.host_id !== userId) return json(403, { error: "not_stream_host" });
      if (!stream.is_active) return json(409, { error: "stream_not_active" });

      const roomName = stream.room_name ?? `live_${streamId}`;
      const sipIdentity = `sip_${phoneNumber.replace(/\D/g, "")}_${Date.now()}`;

      // Audit row first — captures attempts even if LiveKit fails
      const { data: logRow } = await admin.from("sip_call_log").insert({
        initiator_id: userId,
        stream_id: streamId,
        room_name: roomName,
        phone_number: phoneNumber,
        status: "initiated",
      }).select("id").single();

      try {
        const sip = new SipClient(httpUrl, LIVEKIT_API_KEY, LIVEKIT_API_SECRET);
        const info = await sip.createSipParticipant(
          LIVEKIT_SIP_TRUNK_ID,
          phoneNumber,
          roomName,
          {
            participantIdentity: sipIdentity,
            participantName: participantName ?? `Phone ${phoneNumber.slice(-4)}`,
            playDialtone: true,
          },
        );

        await admin.from("sip_call_log").update({
          sip_participant_id: info.participantId ?? sipIdentity,
          sip_call_id: info.sipCallId ?? null,
          status: "dialing",
        }).eq("id", logRow?.id);

        return json(200, {
          sipParticipantId: info.participantId ?? sipIdentity,
          sipCallId: info.sipCallId ?? null,
          logId: logRow?.id ?? null,
        });
      } catch (e) {
        const msg = (e as Error).message ?? "sip_dial_failed";
        await admin.from("sip_call_log").update({
          status: "failed", error: msg, ended_at: new Date().toISOString(),
        }).eq("id", logRow?.id);
        console.error("[Pkg110] dial failed:", msg);
        return json(502, { error: "sip_dial_failed", detail: msg });
      }
    }

    if (action === "hangup") {
      const { sipParticipantId, roomName } = body as {
        sipParticipantId?: string; roomName?: string;
      };
      if (!sipParticipantId || !roomName) return json(400, { error: "sipParticipantId_and_roomName_required" });

      // Verify initiator owns most recent log row for this participant
      const { data: logRow } = await admin
        .from("sip_call_log")
        .select("id, initiator_id")
        .eq("sip_participant_id", sipParticipantId)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (logRow && logRow.initiator_id !== userId) {
        return json(403, { error: "not_call_initiator" });
      }

      try {
        const rs = new RoomServiceClient(httpUrl, LIVEKIT_API_KEY, LIVEKIT_API_SECRET);
        await rs.removeParticipant(roomName, sipParticipantId);
      } catch (e) {
        console.warn("[Pkg110] removeParticipant failed (continuing):", (e as Error).message);
      }

      if (logRow?.id) {
        await admin.from("sip_call_log").update({
          status: "ended", ended_at: new Date().toISOString(),
        }).eq("id", logRow.id);
      }
      return json(200, { ok: true });
    }

    return json(400, { error: "unknown_action" });
  } catch (e) {
    console.error("livekit-sip error:", e);
    return json(500, { error: (e as Error).message ?? "internal_error" });
  }
});
