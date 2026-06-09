/**
 * Pkg82d + R6a: FCM-only PK invite delivery with random-match race hardening.
 *
 * kinds:
 *   direct_invite        — challenger → single opponent
 *   random_invite        — challenger → eligible live female hosts (broadcast, sessionId-tagged)
 *   random_accept        — acceptor   → original challenger (passes invite_session_id through)
 *   random_battle_ready  — challenger → winning acceptor with battleId (kills 3.6s poll)
 *   random_taken         — challenger → losing acceptors of same session ("match taken")
 *   random_cancel        — challenger → all original recipients ("host cancelled")
 *   accept               — opponent   → challenger (direct invite accepted)
 *   decline              — opponent   → challenger (direct invite declined)
 */
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-client-platform",
};

interface Body {
  kind:
    | "direct_invite"
    | "random_invite"
    | "random_accept"
    | "random_battle_ready"
    | "random_taken"
    | "random_cancel"
    | "accept"
    | "decline";
  battleId?: string;
  toUserId?: string;
  fromUserId: string;
  fromName?: string;
  fromAvatar?: string;
  fromLevel?: number;
  fromStreamId?: string;
  toStreamId?: string;
  inviteSessionId?: string;
  winnerUserId?: string; // for random_taken
}

const RANDOM_INVITE_COOLDOWN_MS = 30_000;

serve(async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const token = authHeader.replace("Bearer ", "");
    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData, error: userErr } = await userClient.auth.getUser(token);
    if (userErr || !userData?.user?.id) {
      return new Response(JSON.stringify({ error: "Invalid session" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = (await req.json()) as Body;
    if (!body.kind || !body.fromUserId) {
      return new Response(JSON.stringify({ error: "kind and fromUserId required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (userData.user.id !== body.fromUserId) {
      return new Response(JSON.stringify({ error: "fromUserId mismatch" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const admin = createClient(supabaseUrl, serviceKey);

    // Resolve sender display fields from profiles if missing
    let fromName = body.fromName?.trim() || "Host";
    let fromAvatar = body.fromAvatar?.trim() || "";
    let fromLevel = body.fromLevel || 1;
    if (!body.fromName || !body.fromAvatar) {
      const { data: prof } = await admin
        .from("profiles")
        .select("display_name, avatar_url, user_level")
        .eq("id", body.fromUserId)
        .maybeSingle();
      if (prof?.display_name) fromName = String(prof.display_name);
      if (prof?.avatar_url) fromAvatar = String(prof.avatar_url ?? "");
      if (prof?.user_level) fromLevel = Number(prof.user_level) || 1;
    }

    const baseData: Record<string, unknown> = {
      battleId: body.battleId ?? null,
      fromUserId: body.fromUserId,
      fromName,
      fromAvatar,
      fromLevel,
      fromStreamId: body.fromStreamId ?? null,
      toStreamId: body.toStreamId ?? null,
      ts: Date.now(),
    };

    type Row = { user_id: string; type: string; title: string; message: string; data: any };
    const rows: Row[] = [];

    if (body.kind === "direct_invite") {
      if (!body.toUserId || !body.battleId) {
        return jsonErr("toUserId and battleId required", 400);
      }
      rows.push({
        user_id: body.toUserId,
        type: "pk_invite",
        title: "PK Battle Invite",
        message: `${fromName} wants to PK with you`,
        data: baseData,
      });

    } else if (body.kind === "random_invite") {
      // R6a: generate session id + filter ineligible hosts
      const sessionId = crypto.randomUUID();
      baseData.invite_session_id = sessionId;

      // 1) All currently-live female hosts (excluding sender)
      const { data: streams } = await admin
        .from("live_streams")
        .select("host_id, profiles!live_streams_host_id_fkey(gender)")
        .eq("is_active", true)
        .neq("host_id", body.fromUserId);
      let hostIds = ((streams ?? []) as any[])
        .filter((s) => s.profiles?.gender === "female")
        .map((s) => s.host_id as string);

      if (hostIds.length === 0) {
        return jsonOk({ delivered: 0, sessionId });
      }

      // 2) Exclude hosts currently in an active/pending PK battle
      const { data: busyBattles } = await admin
        .from("pk_battles")
        .select("challenger_id, opponent_id, status")
        .in("status", ["pending", "accepted", "active"])
        .or(
          `challenger_id.in.(${hostIds.join(",")}),opponent_id.in.(${hostIds.join(",")})`
        );
      const busy = new Set<string>();
      for (const b of (busyBattles ?? []) as any[]) {
        if (b.challenger_id) busy.add(b.challenger_id);
        if (b.opponent_id) busy.add(b.opponent_id);
      }
      hostIds = hostIds.filter((id) => !busy.has(id));

      // 3) Exclude hosts who received a pk_random_invite within the last 30s (cooldown)
      const cutoffIso = new Date(Date.now() - RANDOM_INVITE_COOLDOWN_MS).toISOString();
      const { data: recent } = await admin
        .from("notifications")
        .select("user_id")
        .eq("type", "pk_random_invite")
        .gte("created_at", cutoffIso)
        .in("user_id", hostIds);
      const recentSet = new Set<string>(((recent ?? []) as any[]).map((r) => r.user_id as string));
      hostIds = hostIds.filter((id) => !recentSet.has(id));

      for (const uid of hostIds) {
        rows.push({
          user_id: uid,
          type: "pk_random_invite",
          title: "Random PK Battle",
          message: `${fromName} is looking for a PK opponent`,
          data: baseData,
        });
      }

      const { error: insErr } = rows.length
        ? await admin.from("notifications").insert(rows)
        : { error: null };
      if (insErr) {
        console.error("[pk-invite-deliver] random_invite insert failed:", insErr);
        return jsonErr(insErr.message, 500);
      }
      return jsonOk({ delivered: rows.length, sessionId });

    } else if (body.kind === "random_accept") {
      if (!body.toUserId) return jsonErr("toUserId required", 400);
      const data = { ...baseData };
      if (body.inviteSessionId) data.invite_session_id = body.inviteSessionId;
      rows.push({
        user_id: body.toUserId,
        type: "pk_random_accepted",
        title: "PK Accepted",
        message: `${fromName} accepted your random PK`,
        data,
      });

    } else if (body.kind === "random_battle_ready") {
      if (!body.toUserId || !body.battleId) {
        return jsonErr("toUserId and battleId required", 400);
      }
      const data = { ...baseData };
      if (body.inviteSessionId) data.invite_session_id = body.inviteSessionId;
      rows.push({
        user_id: body.toUserId,
        type: "pk_random_battle_ready",
        title: "PK Battle Ready",
        message: `Battle vs ${fromName} is starting`,
        data,
      });

    } else if (body.kind === "random_taken") {
      if (!body.inviteSessionId) return jsonErr("inviteSessionId required", 400);
      // Find all original recipients of this session and notify everyone EXCEPT winner
      const { data: recipients } = await admin
        .from("notifications")
        .select("user_id, data")
        .eq("type", "pk_random_invite")
        .filter("data->>invite_session_id", "eq", body.inviteSessionId);
      const winnerId = body.winnerUserId ?? null;
      const seen = new Set<string>();
      for (const r of (recipients ?? []) as any[]) {
        const uid = r.user_id as string;
        if (!uid || uid === winnerId || seen.has(uid)) continue;
        seen.add(uid);
        rows.push({
          user_id: uid,
          type: "pk_random_taken",
          title: "Match Taken",
          message: "Another host accepted the PK first",
          data: { ...baseData, invite_session_id: body.inviteSessionId, winnerUserId: winnerId },
        });
      }

    } else if (body.kind === "random_cancel") {
      if (!body.inviteSessionId) return jsonErr("inviteSessionId required", 400);
      const { data: recipients } = await admin
        .from("notifications")
        .select("user_id")
        .eq("type", "pk_random_invite")
        .filter("data->>invite_session_id", "eq", body.inviteSessionId);
      const seen = new Set<string>();
      for (const r of (recipients ?? []) as any[]) {
        const uid = r.user_id as string;
        if (!uid || seen.has(uid)) continue;
        seen.add(uid);
        rows.push({
          user_id: uid,
          type: "pk_random_cancelled",
          title: "Request Cancelled",
          message: `${fromName} cancelled the PK request`,
          data: { ...baseData, invite_session_id: body.inviteSessionId },
        });
      }

    } else if (body.kind === "accept" || body.kind === "decline") {
      if (!body.toUserId || !body.battleId) {
        return jsonErr("toUserId and battleId required", 400);
      }
      rows.push({
        user_id: body.toUserId,
        type: body.kind === "accept" ? "pk_invite_accepted" : "pk_invite_declined",
        title: body.kind === "accept" ? "PK Accepted" : "PK Declined",
        message:
          body.kind === "accept"
            ? `${fromName} accepted your PK request`
            : `${fromName} declined your PK request`,
        data: baseData,
      });

    } else {
      return jsonErr("unknown kind", 400);
    }

    if (rows.length === 0) {
      return jsonOk({ delivered: 0 });
    }

    const { error: insErr } = await admin.from("notifications").insert(rows);
    if (insErr) {
      console.error("[pk-invite-deliver] insert failed:", insErr);
      return jsonErr(insErr.message, 500);
    }

    return jsonOk({ delivered: rows.length });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    console.error("[pk-invite-deliver]", e);
    return jsonErr(msg, 500);
  }
});

function jsonOk(payload: Record<string, unknown>) {
  return new Response(JSON.stringify({ ok: true, ...payload }), {
    status: 200,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
function jsonErr(error: string, status: number) {
  return new Response(JSON.stringify({ ok: false, error }), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
