// AI Chat Moderator endpoint (called by Python LiveKit agent worker on VPS)
//
// Flow:
//   1. Python agent receives chat message from LiveKit data channel.
//   2. Agent POSTs { message, user_id, room_name, room_kind } here with x-moderator-token.
//   3. We call Lovable AI Gateway with structured tool-calling → action+reason+severity.
//   4. If action != allow, we enforce via LiveKit RoomService SDK (mute / kick).
//   5. Everything is logged to chat_moderation_logs + livekit_moderation_log.
//
// Auth: shared secret header `x-moderator-token` === Deno.env MODERATOR_AGENT_TOKEN.
// Kill-switch: live_moderation_settings.ai_moderator_config.enabled === true.

import { createClient } from "npm:@supabase/supabase-js@2";
import { RoomServiceClient } from "npm:livekit-server-sdk@2.9.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-moderator-token",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY") ?? "";
const MODERATOR_AGENT_TOKEN = Deno.env.get("MODERATOR_AGENT_TOKEN") ?? "";
const LIVEKIT_URL = Deno.env.get("LIVEKIT_URL") ?? "";
const LIVEKIT_API_KEY = Deno.env.get("LIVEKIT_API_KEY") ?? "";
const LIVEKIT_API_SECRET = Deno.env.get("LIVEKIT_API_SECRET") ?? "";

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

type Action = "allow" | "warn" | "mute" | "kick";

interface RequestBody {
  message: string;
  user_id?: string | null;
  participant_identity: string;
  room_name: string;
  room_kind?: "live" | "party" | "call" | string;
  message_id?: string | null;
}

interface ClassifyResult {
  action: Action;
  severity: number; // 0..100
  reason: string;
  categories: string[];
}

const TOOL_DEF = {
  type: "function",
  function: {
    name: "classify_message",
    description:
      "Classify a single live-stream chat message and choose an action.",
    parameters: {
      type: "object",
      properties: {
        action: {
          type: "string",
          enum: ["allow", "warn", "mute", "kick"],
        },
        severity: {
          type: "integer",
          description: "0 (clean) to 100 (extreme).",
        },
        reason: {
          type: "string",
          description: "Short explanation (max 140 chars) shown in audit log.",
        },
        categories: {
          type: "array",
          items: {
            type: "string",
            enum: [
              "clean",
              "profanity",
              "harassment",
              "hate",
              "sexual",
              "solicitation",
              "contact_info",
              "spam",
              "scam",
              "threat",
              "doxxing",
              "csam_hint",
              "other",
            ],
          },
        },
      },
      required: ["action", "severity", "reason", "categories"],
      additionalProperties: false,
    },
  },
} as const;

async function classify(
  systemPrompt: string,
  model: string,
  message: string,
): Promise<ClassifyResult> {
  const resp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${LOVABLE_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: `Chat message:\n"""${message}"""` },
      ],
      tools: [TOOL_DEF],
      tool_choice: { type: "function", function: { name: "classify_message" } },
    }),
  });

  if (!resp.ok) {
    const errText = await resp.text().catch(() => "");
    throw new Error(`AI gateway ${resp.status}: ${errText.slice(0, 200)}`);
  }

  const data = await resp.json();
  const call = data?.choices?.[0]?.message?.tool_calls?.[0];
  if (!call?.function?.arguments) {
    return { action: "allow", severity: 0, reason: "no tool call", categories: ["other"] };
  }
  const parsed = JSON.parse(call.function.arguments) as ClassifyResult;
  return parsed;
}

async function enforce(
  action: Action,
  roomName: string,
  identity: string,
  reason: string,
  muteDurationSec: number,
) {
  if (!LIVEKIT_URL || !LIVEKIT_API_KEY || !LIVEKIT_API_SECRET) {
    throw new Error("LIVEKIT env not configured");
  }
  const svc = new RoomServiceClient(LIVEKIT_URL, LIVEKIT_API_KEY, LIVEKIT_API_SECRET);

  if (action === "kick") {
    await svc.removeParticipant(roomName, identity);
    return { enforced: "kick" };
  }

  if (action === "mute") {
    // Mute all audio tracks for that participant.
    const p = await svc.getParticipant(roomName, identity).catch(() => null);
    if (p?.tracks) {
      for (const t of p.tracks) {
        if (t.source === 1 /* MICROPHONE */ || t.type === 0 /* AUDIO */) {
          await svc.mutePublishedTrack(roomName, identity, t.sid, true).catch(() => {});
        }
      }
    }
    // Schedule auto-unmute via metadata note (best-effort; the Python agent or app may re-allow).
    await svc
      .updateParticipant(roomName, identity, JSON.stringify({
        ai_muted_until: Date.now() + muteDurationSec * 1000,
        ai_mute_reason: reason.slice(0, 120),
      }))
      .catch(() => {});
    return { enforced: "mute", duration_sec: muteDurationSec };
  }

  // warn / allow → no LiveKit action.
  return { enforced: action };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json(405, { error: "method not allowed" });

  const token = req.headers.get("x-moderator-token") ?? "";
  if (!MODERATOR_AGENT_TOKEN || token !== MODERATOR_AGENT_TOKEN) {
    return json(401, { error: "invalid moderator token" });
  }

  let body: RequestBody;
  try {
    body = await req.json();
  } catch {
    return json(400, { error: "invalid json" });
  }

  if (!body?.message || !body?.room_name || !body?.participant_identity) {
    return json(400, { error: "message, room_name, participant_identity required" });
  }

  const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  // Load config (kill-switch + prompt + model + thresholds).
  const { data: cfgRow } = await sb
    .from("live_moderation_settings")
    .select("setting_value, is_active")
    .eq("setting_key", "ai_moderator_config")
    .maybeSingle();

  const cfg = (cfgRow?.setting_value ?? {}) as Record<string, unknown>;
  const enabled = cfgRow?.is_active && cfg?.enabled === true;
  if (!enabled) {
    return json(200, { action: "allow", reason: "ai_moderator disabled", skipped: true });
  }

  const model = (cfg.model as string) || "google/gemini-3-flash-preview";
  const systemPrompt = (cfg.system_prompt as string) || "You are a chat moderator.";
  const muteSec = Number(cfg.mute_duration_sec ?? 300);

  // Classify.
  let result: ClassifyResult;
  try {
    result = await classify(systemPrompt, model, body.message);
  } catch (e) {
    console.error("[ai-moderator] classify failed:", e);
    return json(502, { error: "ai_gateway_failed", detail: String(e) });
  }

  // Log to chat_moderation_logs (audit).
  await sb
    .from("chat_moderation_logs")
    .insert({
      message_id: body.message_id ?? null,
      user_id: body.user_id ?? null,
      violation_type: result.categories?.join(",") || "other",
      original_content: body.message.slice(0, 1000),
      action_taken: result.action,
    })
    .then((r) => {
      if (r.error) console.warn("[ai-moderator] log insert err:", r.error.message);
    });

  // Enforce if needed.
  let enforcement: unknown = { enforced: result.action };
  if (result.action === "mute" || result.action === "kick") {
    try {
      enforcement = await enforce(
        result.action,
        body.room_name,
        body.participant_identity,
        result.reason,
        muteSec,
      );
      await sb.from("livekit_moderation_log").insert({
        admin_token_role: "ai_agent",
        actor_type: "ai_agent",
        room_name: body.room_name,
        participant_identity: body.participant_identity,
        action: result.action === "kick" ? "kick_participant" : "mute_participant_audio",
        reason: `[AI] ${result.reason}`,
        success: true,
        request_payload: {
          severity: result.severity,
          categories: result.categories,
          room_kind: body.room_kind ?? null,
        },
      });
    } catch (e) {
      console.error("[ai-moderator] enforce failed:", e);
      enforcement = { enforced: "failed", error: String(e) };
      await sb.from("livekit_moderation_log").insert({
        admin_token_role: "ai_agent",
        actor_type: "ai_agent",
        room_name: body.room_name,
        participant_identity: body.participant_identity,
        action: result.action === "kick" ? "kick_participant" : "mute_participant_audio",
        reason: `[AI] ${result.reason}`,
        success: false,
        error_message: String(e),
      });
    }
  }

  return json(200, {
    action: result.action,
    severity: result.severity,
    reason: result.reason,
    categories: result.categories,
    enforcement,
  });
});
