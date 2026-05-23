# AI Chat Moderator — LiveKit Agent Worker
#
# Runs on the user's VPS (same box that runs livekit.merilive.xyz) as a
# `systemd` service. Connects to LiveKit as an agent worker, auto-dispatches
# itself into every live/party room, listens to chat data packets, and POSTs
# each message to the Supabase edge function `ai-moderator` which does the
# actual AI classification + enforcement (mute / kick).
#
# This worker is intentionally THIN — all rules live in Supabase
# (`live_moderation_settings.ai_moderator_config`) so admins can toggle the
# moderator on/off and re-tune the prompt without redeploying the worker.
#
# Required env (see .env.example):
#   LIVEKIT_URL                wss://livekit.merilive.xyz
#   LIVEKIT_API_KEY            (same as Supabase secret)
#   LIVEKIT_API_SECRET         (same as Supabase secret)
#   SUPABASE_FUNCTIONS_URL     https://<ref>.supabase.co/functions/v1
#   SUPABASE_ANON_KEY          publishable / anon key (for Authorization header)
#   MODERATOR_AGENT_TOKEN      shared secret with edge fn (x-moderator-token)
#
# Tested with: livekit-agents>=0.12.0  python>=3.11

import asyncio
import json
import logging
import os
from typing import Any

import aiohttp
from livekit import agents, rtc
from livekit.agents import AutoSubscribe, JobContext, WorkerOptions, cli

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s | %(message)s")
log = logging.getLogger("ai-moderator")

SUPABASE_FUNCTIONS_URL = os.environ["SUPABASE_FUNCTIONS_URL"].rstrip("/")
SUPABASE_ANON_KEY = os.environ["SUPABASE_ANON_KEY"]
MODERATOR_AGENT_TOKEN = os.environ["MODERATOR_AGENT_TOKEN"]

# Chat topic used by the React app (src/lib/livekitChat*.ts). Matches the
# topic the host/viewer/party publishers use when sending a chat message.
CHAT_TOPICS = {"chat", "chat.message", "lk.chat"}


def _decode_packet(payload: bytes) -> dict[str, Any] | None:
    try:
        obj = json.loads(payload.decode("utf-8"))
        if isinstance(obj, dict):
            return obj
    except Exception:
        return None
    return None


def _extract_text(obj: dict[str, Any]) -> str | None:
    # Try common shapes used in the app.
    for k in ("message", "text", "content", "body"):
        v = obj.get(k)
        if isinstance(v, str) and v.strip():
            return v.strip()
    return None


def _extract_user_id(participant: rtc.RemoteParticipant, obj: dict[str, Any]) -> str | None:
    v = obj.get("user_id") or obj.get("uid") or obj.get("sender_id")
    if isinstance(v, str) and v:
        return v
    # Identity format the app uses is typically `<uuid>` or `<uuid>:<suffix>`.
    ident = participant.identity or ""
    return ident.split(":", 1)[0] or None


def _room_kind(room_name: str) -> str:
    if room_name.startswith("party_"):
        return "party"
    if room_name.startswith("call_"):
        return "call"
    if room_name.startswith("live_"):
        return "live"
    return "unknown"


async def _send_to_moderator(session: aiohttp.ClientSession, payload: dict[str, Any]) -> None:
    url = f"{SUPABASE_FUNCTIONS_URL}/ai-moderator"
    headers = {
        "Content-Type": "application/json",
        "Authorization": f"Bearer {SUPABASE_ANON_KEY}",
        "x-moderator-token": MODERATOR_AGENT_TOKEN,
    }
    try:
        async with session.post(url, headers=headers, json=payload, timeout=15) as r:
            data = await r.json(content_type=None)
            if r.status != 200:
                log.warning("moderator non-200 %s: %s", r.status, data)
                return
            action = data.get("action", "allow")
            if action != "allow":
                log.info(
                    "ENFORCED action=%s identity=%s room=%s reason=%s",
                    action,
                    payload["participant_identity"],
                    payload["room_name"],
                    data.get("reason"),
                )
    except Exception as e:
        log.exception("moderator call failed: %s", e)


async def entrypoint(ctx: JobContext) -> None:
    log.info("agent joining room=%s", ctx.room.name)

    # Audio-only subscribe is cheapest; we don't need video.
    await ctx.connect(auto_subscribe=AutoSubscribe.AUDIO_ONLY)

    session = aiohttp.ClientSession()
    room_name = ctx.room.name
    room_kind = _room_kind(room_name)

    @ctx.room.on("data_received")
    def on_data(pkt: rtc.DataPacket):  # noqa: ANN001
        try:
            topic = (pkt.topic or "").lower()
            if topic and topic not in CHAT_TOPICS and "chat" not in topic:
                return  # not a chat packet

            obj = _decode_packet(pkt.data)
            if not obj:
                return

            # Heuristic: if shape looks like gift/seat/system event, skip.
            evt_type = (obj.get("type") or obj.get("event") or "").lower()
            if evt_type and evt_type not in {"chat", "message", "chat_message"}:
                return

            text = _extract_text(obj)
            if not text or len(text) < 1:
                return

            participant = pkt.participant
            if not isinstance(participant, rtc.RemoteParticipant):
                return

            payload = {
                "message": text[:1000],
                "user_id": _extract_user_id(participant, obj),
                "participant_identity": participant.identity,
                "room_name": room_name,
                "room_kind": room_kind,
                "message_id": obj.get("id") or obj.get("message_id"),
            }
            asyncio.create_task(_send_to_moderator(session, payload))
        except Exception as e:
            log.exception("on_data failed: %s", e)

    @ctx.room.on("disconnected")
    def on_disconnect(*_a):  # noqa: ANN001
        asyncio.create_task(session.close())

    # Idle loop — agent stays in room until LiveKit disconnects it.
    while ctx.room.connection_state != rtc.ConnectionState.CONN_DISCONNECTED:
        await asyncio.sleep(5)


if __name__ == "__main__":
    cli.run_app(
        WorkerOptions(
            entrypoint_fnc=entrypoint,
            # Auto-dispatch into every room. LiveKit server will spawn one
            # worker job per active room.
            agent_name="ai-chat-moderator",
        ),
    )
