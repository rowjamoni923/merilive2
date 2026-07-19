// Pkg97: LiveKit Server Webhook → Supabase
//
// Receives every LiveKit server event (room_started, room_finished,
// participant_joined, participant_left, track_published, egress_*).
//
// 1. Verifies the LiveKit-signed JWT in the Authorization header using our
//    API key + secret (so only LiveKit can post here).
// 2. Inserts every event into `livekit_room_events` for audit.
// 3. On `room_finished`, calls `auto_close_room_from_livekit(room_name)` —
//    this is the **server-side truth** that closes orphan live streams,
//    party rooms, and private calls when a host's app crashes.
//
// Configure once in the LiveKit dashboard / livekit.yaml:
//   webhook:
//     api_key: <LIVEKIT_API_KEY>
//     urls:
//       - https://<project-ref>.supabase.co/functions/v1/livekit-webhook
//
// No client ever calls this. verify_jwt is OFF (LiveKit signs its own JWT).

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { WebhookReceiver } from "npm:livekit-server-sdk@2.9.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, content-type",
};

const LIVEKIT_API_KEY = Deno.env.get("LIVEKIT_API_KEY") ?? "";
const LIVEKIT_API_SECRET = Deno.env.get("LIVEKIT_API_SECRET") ?? "";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

const receiver = new WebhookReceiver(LIVEKIT_API_KEY, LIVEKIT_API_SECRET);
const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  if (req.method !== "POST") {
    return new Response("method_not_allowed", { status: 405, headers: corsHeaders });
  }

  const authHeader = req.headers.get("Authorization") ?? "";
  const body = await req.text();

  let event: any;
  try {
    // Verifies HMAC of body using our API secret. Throws on mismatch.
    event = await receiver.receive(body, authHeader, true);
  } catch (e) {
    console.error("[livekit-webhook] verify failed:", (e as Error)?.message);
    return new Response("unauthorized", { status: 401, headers: corsHeaders });
  }

  const eventType: string = event?.event ?? "unknown";
  const room = event?.room ?? {};
  const participant = event?.participant ?? null;
  const track = event?.track ?? null;
  const egress = event?.egressInfo ?? null;
  const ingress = event?.ingressInfo ?? null;

  const roomName: string | null = room?.name ?? null;

  try {
    await admin.from("livekit_room_events").insert({
      event: eventType,
      room_name: roomName,
      room_sid: room?.sid ?? null,
      participant_identity: participant?.identity ?? null,
      participant_sid: participant?.sid ?? null,
      track_sid: track?.sid ?? null,
      payload: {
        room: room ?? null,
        participant: participant ?? null,
        track: track ?? null,
        egressInfo: egress ?? null,
        ingressInfo: ingress ?? null,
        createdAt: event?.createdAt ?? null,
        id: event?.id ?? null,
      },
    });
  } catch (e) {
    console.error("[livekit-webhook] insert failed:", (e as Error)?.message);
  }

  // Auto-close orphan rooms (the whole reason this webhook exists).
  if (eventType === "room_finished" && roomName) {
    try {
      const { data, error } = await admin.rpc("auto_close_room_from_livekit", {
        _room_name: roomName,
      });
      if (error) {
        console.error("[livekit-webhook] auto_close error:", error.message);
      } else if (data && data.length > 0) {
        console.log("[livekit-webhook] auto-closed:", JSON.stringify(data));
      }
    } catch (e) {
      console.error("[livekit-webhook] auto_close throw:", (e as Error)?.message);
    }
  }

  // Phase 2 #6: stamp left_at on viewer / party participant rows immediately
  // when LiveKit reports a participant_left. Without this, viewer counts stay
  // inflated until the background stale-sweep cron (minutes of lag) — Chamet
  // standard is <5s. Pure additive: room_finished still cleans up orphans.
  if (eventType === "participant_left" && roomName && participant?.identity) {
    try {
      const { data, error } = await admin.rpc("mark_livekit_participant_left", {
        _identity: String(participant.identity),
      });
      if (error) {
        console.error("[livekit-webhook] mark_left error:", error.message);
      } else if (data && data.length > 0) {
        console.log("[livekit-webhook] marked-left:", JSON.stringify(data));
      }
    } catch (e) {
      console.error("[livekit-webhook] mark_left throw:", (e as Error)?.message);
    }
  }

  // Phase 1A: Flip live_streams.status 'starting' → 'live' the moment the host
  // actually joins the LiveKit room. Without this, the row sits in 'starting'
  // forever (or until cleanup_stale closes it after 3min stale). Idempotent —
  // the RPC only updates when host_id matches the participant identity.
  if (eventType === "participant_joined" && roomName && participant?.identity
      && /^live_[0-9a-f-]{36}$/i.test(roomName)) {
    try {
      const { data, error } = await admin.rpc("mark_live_stream_live", {
      });
      if (error) {
        console.error("[livekit-webhook] mark_live error:", error.message);
      } else if (data === true) {
        console.log("[livekit-webhook] live_streams → live:", roomName);
      }
    } catch (e) {
      console.error("[livekit-webhook] mark_live throw:", (e as Error)?.message);
    }
  }

  // Pkg112: Finalize stream_recordings rows on egress lifecycle events.
  // LiveKit EgressInfo status enum (string in webhook payload):
  //   EGRESS_STARTING / EGRESS_ACTIVE / EGRESS_ENDING / EGRESS_COMPLETE / EGRESS_FAILED / EGRESS_ABORTED / EGRESS_LIMIT_REACHED
  if (egress && egress.egressId &&
      (eventType === "egress_started" || eventType === "egress_updated" || eventType === "egress_ended")) {
    try {
      const rawStatus: string = (egress.status ?? "").toString();
      const statusMap: Record<string, string> = {
        EGRESS_STARTING: "starting",
        EGRESS_ACTIVE: "active",
        EGRESS_ENDING: "ending",
        EGRESS_COMPLETE: "completed",
        EGRESS_FAILED: "failed",
        EGRESS_ABORTED: "aborted",
        EGRESS_LIMIT_REACHED: "limit_reached",
      };
      const mappedStatus = statusMap[rawStatus] ?? rawStatus.toLowerCase().replace(/^egress_/, "") ?? "unknown";
      const isTerminal = ["completed", "failed", "aborted", "limit_reached"].includes(mappedStatus);

      // Pull first file result (room composite uses single MP4 file output).
      const file = Array.isArray(egress.fileResults) && egress.fileResults.length > 0
        ? egress.fileResults[0]
        : (egress.file ?? null);

      // Duration is nanoseconds (string in proto JSON). Size is bytes (string).
      let durationSeconds: number | null = null;
      if (file?.duration != null) {
        const dn = Number(file.duration);
        if (Number.isFinite(dn) && dn > 0) durationSeconds = Math.round(dn / 1_000_000_000);
      }
      let sizeBytes: number | null = null;
      if (file?.size != null) {
        const sn = Number(file.size);
        if (Number.isFinite(sn) && sn >= 0) sizeBytes = sn;
      }
      const fileUrl: string | null = file?.location ?? file?.filename ?? null;

      // Pkg126: HLS segmented output reports playlists via `segmentResults`.
      const segment = Array.isArray(egress.segmentResults) && egress.segmentResults.length > 0
        ? egress.segmentResults[0]
        : null;
      let playlistUrl: string | null = null;
      if (segment) {
        playlistUrl = segment.playlistLocation ?? segment.playlistName ?? null;
        if (durationSeconds == null && segment.duration != null) {
          const dn = Number(segment.duration);
          if (Number.isFinite(dn) && dn > 0) durationSeconds = Math.round(dn / 1_000_000_000);
        }
        if (sizeBytes == null && segment.size != null) {
          const sn = Number(segment.size);
          if (Number.isFinite(sn) && sn >= 0) sizeBytes = sn;
        }
      }

      const recUpdate: Record<string, unknown> = { status: mappedStatus };
      if (fileUrl) recUpdate.file_url = fileUrl;
      if (playlistUrl) recUpdate.playlist_url = playlistUrl;
      if (durationSeconds != null) recUpdate.duration_seconds = durationSeconds;
      if (sizeBytes != null) recUpdate.size_bytes = sizeBytes;
      if (egress.error) recUpdate.error = String(egress.error);
      if (isTerminal) recUpdate.ended_at = new Date().toISOString();

      const { data: recRow, error: recErr } = await admin
        .from("stream_recordings")
        .update(recUpdate)
        .eq("egress_id", egress.egressId)
        .select("id, stream_id, format")
        .maybeSingle();
      if (recErr) {
        console.error("[livekit-webhook] stream_recordings update error:", recErr.message);
      }

      if (recRow?.stream_id) {
        const isHls = recRow.format === "hls" || !!playlistUrl;
        const streamUpdate: Record<string, unknown> = isHls
          ? { hls_status: mappedStatus }
          : { recording_status: mappedStatus };
        if (isHls && playlistUrl) streamUpdate.hls_playlist_url = playlistUrl;
        if (!isHls && fileUrl) streamUpdate.recording_url = fileUrl;
        // Clear egress id on terminal so host can re-record.
        if (isTerminal) {
          streamUpdate[isHls ? "hls_egress_id" : "egress_id"] = null;
        }
        await admin.from("live_streams").update(streamUpdate).eq("id", recRow.stream_id);
      }

      // Pkg113: same payload may belong to a track_recordings row instead.
      // No-op when egress_id matches no row in this table.
      try {
        const { error: trErr } = await admin
          .from("track_recordings")
          .update(recUpdate)
          .eq("egress_id", egress.egressId);
        if (trErr) {
          console.error("[livekit-webhook] track_recordings update error:", trErr.message);
        }
      } catch (e) {
        console.error("[livekit-webhook] track_recordings finalize throw:", (e as Error)?.message);
      }
    } catch (e) {
      console.error("[livekit-webhook] egress finalize throw:", (e as Error)?.message);
    }
  }


  return new Response(JSON.stringify({ ok: true, event: eventType }), {
    status: 200,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
