/**
 * Pkg82d: FCM-only PK invite delivery.
 * Replaces the 3 Supabase Realtime channels (pk_incoming_${userId},
 * pk_random_match broadcast, pk_battle_${battleId} postgres_changes) for
 * cross-host PK signaling. Inserts notification rows; the master
 * `trigger_push_on_notification` DB trigger (Pkg32) fans out FCM pushes,
 * and `useNotifications` (whitelisted realtime sub) bridges to a
 * `window 'pk-notification'` event for in-app handling.
 *
 * kinds:
 *   direct_invite   — challenger → single opponent (battleId already exists)
 *   random_invite   — challenger → all live female hosts (broadcast)
 *   random_accept   — acceptor   → original challenger
 *   accept          — opponent   → challenger (direct invite accepted)
 *   decline         — opponent   → challenger (direct invite declined)
 */
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-client-platform",
};

interface Body {
  kind: "direct_invite" | "random_invite" | "random_accept" | "accept" | "decline";
  battleId?: string;
  toUserId?: string;
  fromUserId: string;
  fromName?: string;
  fromAvatar?: string;
  fromLevel?: number;
  fromStreamId?: string;
  toStreamId?: string;
}

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

    const baseData = {
      battleId: body.battleId ?? null,
      fromUserId: body.fromUserId,
      fromName,
      fromAvatar,
      fromLevel,
      fromStreamId: body.fromStreamId ?? null,
      toStreamId: body.toStreamId ?? null,
      ts: Date.now(),
    };

    const rows: Array<{ user_id: string; type: string; title: string; message: string; data: any }> = [];

    if (body.kind === "direct_invite") {
      if (!body.toUserId || !body.battleId) {
        return new Response(JSON.stringify({ error: "toUserId and battleId required" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      rows.push({
        user_id: body.toUserId,
        type: "pk_invite",
        title: "PK Battle Invite",
        message: `${fromName} wants to PK with you`,
        data: baseData,
      });
    } else if (body.kind === "random_invite") {
      // Fan out to every currently-live female host except sender
      const { data: streams } = await admin
        .from("live_streams")
        .select("host_id, id, profiles!live_streams_host_id_fkey(gender)")
        .eq("is_active", true)
        .neq("host_id", body.fromUserId);
      const hostIds = ((streams ?? []) as any[])
        .filter((s) => s.profiles?.gender === "female")
        .map((s) => s.host_id as string);
      for (const uid of hostIds) {
        rows.push({
          user_id: uid,
          type: "pk_random_invite",
          title: "Random PK Battle",
          message: `${fromName} is looking for a PK opponent`,
          data: baseData,
        });
      }
    } else if (body.kind === "random_accept") {
      if (!body.toUserId) {
        return new Response(JSON.stringify({ error: "toUserId required" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      rows.push({
        user_id: body.toUserId,
        type: "pk_random_accepted",
        title: "PK Accepted",
        message: `${fromName} accepted your random PK`,
        data: baseData,
      });
    } else if (body.kind === "accept" || body.kind === "decline") {
      if (!body.toUserId || !body.battleId) {
        return new Response(JSON.stringify({ error: "toUserId and battleId required" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
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
      return new Response(JSON.stringify({ error: "unknown kind" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (rows.length === 0) {
      return new Response(JSON.stringify({ ok: true, delivered: 0 }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { error: insErr } = await admin.from("notifications").insert(rows);
    if (insErr) {
      console.error("[pk-invite-deliver] insert failed:", insErr);
      return new Response(JSON.stringify({ error: insErr.message }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ ok: true, delivered: rows.length }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    console.error("[pk-invite-deliver]", e);
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
