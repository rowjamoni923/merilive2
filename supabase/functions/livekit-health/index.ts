// Diagnostic: verifies LIVEKIT_URL + LIVEKIT_API_KEY + LIVEKIT_API_SECRET
// by minting a server token and calling ListRooms on the LiveKit server.
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { AccessToken, RoomServiceClient } from "npm:livekit-server-sdk@2.9.4";

const LIVEKIT_URL = Deno.env.get("LIVEKIT_URL") ?? "";
const LIVEKIT_API_KEY = Deno.env.get("LIVEKIT_API_KEY") ?? "";
const LIVEKIT_API_SECRET = Deno.env.get("LIVEKIT_API_SECRET") ?? "";

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body, null, 2), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

function wsToHttps(url: string) {
  return url.replace(/^wss:\/\//, "https://").replace(/^ws:\/\//, "http://");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const report: Record<string, unknown> = {
    env: {
      LIVEKIT_URL_present: !!LIVEKIT_URL,
      LIVEKIT_URL_value: LIVEKIT_URL || null,
      LIVEKIT_API_KEY_present: !!LIVEKIT_API_KEY,
      LIVEKIT_API_KEY_prefix: LIVEKIT_API_KEY ? LIVEKIT_API_KEY.slice(0, 4) + "…" : null,
      LIVEKIT_API_KEY_length: LIVEKIT_API_KEY.length,
      LIVEKIT_API_SECRET_present: !!LIVEKIT_API_SECRET,
      LIVEKIT_API_SECRET_length: LIVEKIT_API_SECRET.length,
    },
  };

  if (!LIVEKIT_URL || !LIVEKIT_API_KEY || !LIVEKIT_API_SECRET) {
    report.ok = false;
    report.error = "Missing one or more LiveKit secrets";
    return json(500, report);
  }

  // 1) Verify we can mint a JWT
  try {
    const at = new AccessToken(LIVEKIT_API_KEY, LIVEKIT_API_SECRET, {
      identity: "healthcheck-bot",
      ttl: 60,
    });
    at.addGrant({ room: "healthcheck", roomJoin: true, canPublish: false, canSubscribe: true });
    const token = await at.toJwt();
    report.mintToken = { ok: true, length: token.length, sample: token.slice(0, 24) + "…" };
  } catch (e) {
    report.mintToken = { ok: false, error: String((e as Error)?.message ?? e) };
    report.ok = false;
    return json(500, report);
  }

  // 2) HTTPS reachability of the LiveKit server (root path)
  const httpUrl = wsToHttps(LIVEKIT_URL);
  try {
    const t0 = Date.now();
    const r = await fetch(httpUrl, { method: "GET" });
    const body = await r.text();
    report.httpsReach = {
      ok: r.ok || r.status === 200 || r.status === 404,
      status: r.status,
      ms: Date.now() - t0,
      body: body.slice(0, 200),
    };
  } catch (e) {
    report.httpsReach = { ok: false, error: String((e as Error)?.message ?? e) };
  }

  // 3) Call LiveKit Server API (ListRooms) using API key/secret — this actually validates creds
  try {
    const svc = new RoomServiceClient(httpUrl, LIVEKIT_API_KEY, LIVEKIT_API_SECRET);
    const t0 = Date.now();
    const rooms = await svc.listRooms();
    report.listRooms = {
      ok: true,
      ms: Date.now() - t0,
      count: rooms.length,
      sample: rooms.slice(0, 3).map((r: any) => ({ name: r.name, numParticipants: r.numParticipants })),
    };
  } catch (e) {
    report.listRooms = {
      ok: false,
      error: String((e as Error)?.message ?? e),
      hint: "If 401 → API key/secret mismatch with livekit.yaml. If timeout → server unreachable.",
    };
  }

  // 4) Create + delete a throwaway room (full write test)
  try {
    const svc = new RoomServiceClient(httpUrl, LIVEKIT_API_KEY, LIVEKIT_API_SECRET);
    const roomName = `healthcheck-${Date.now()}`;
    const created = await svc.createRoom({ name: roomName, emptyTimeout: 30, maxParticipants: 2 });
    await svc.deleteRoom(roomName);
    report.createDeleteRoom = { ok: true, name: created.name, sid: created.sid };
  } catch (e) {
    report.createDeleteRoom = { ok: false, error: String((e as Error)?.message ?? e) };
  }

  const allOk =
    (report.mintToken as any)?.ok &&
    (report.httpsReach as any)?.ok &&
    (report.listRooms as any)?.ok &&
    (report.createDeleteRoom as any)?.ok;
  report.ok = !!allOk;

  return json(allOk ? 200 : 500, report);
});
