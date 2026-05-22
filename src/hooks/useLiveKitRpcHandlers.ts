/**
 * Pkg120: Concrete RPC method handlers for call / live / party rooms.
 *
 * Registers `mute_me` and `kick_request` handlers on the Room bound to
 * scope:id via Pkg120 auto-registration. Emits window events so UI layers
 * can react without importing LiveKit internals.
 */
import { useEffect } from "react";
import { registerRpcMethod } from "@/lib/livekitRpc";
import type { RpcScope } from "@/lib/livekitRpc";

export function useLiveKitRpcHandlers(
  scope: RpcScope,
  id: string | null | undefined,
) {
  useEffect(() => {
    if (!id) return;

    // Handler: host asks participant to mute themselves.
    // Payload is ignored; the receiver simply knows they should mute.
    const disposeMute = registerRpcMethod(scope, id, "mute_me", async (ctx) => {
      window.dispatchEvent(
        new CustomEvent("livekit-rpc-mute-me", {
          detail: {
            scope,
            id,
            callerIdentity: ctx.callerIdentity,
            payload: ctx.payload,
          },
        }),
      );
      return JSON.stringify({ ok: true, ack: "mute_me_received" });
    });

    // Handler: viewer asks host to kick a specific participant.
    // Payload: JSON { targetIdentity, reason? }
    const disposeKick = registerRpcMethod(scope, id, "kick_request", async (ctx) => {
      let payloadObj: any = {};
      try {
        payloadObj = JSON.parse(ctx.payload || "{}");
      } catch {
        /* ignore */
      }
      window.dispatchEvent(
        new CustomEvent("livekit-rpc-kick-request", {
          detail: {
            scope,
            id,
            callerIdentity: ctx.callerIdentity,
            targetIdentity: payloadObj.targetIdentity || null,
            reason: payloadObj.reason || null,
          },
        }),
      );
      return JSON.stringify({ ok: true, ack: "kick_request_received" });
    });

    // Handler: seat approval ack in party rooms.
    // Payload: JSON { seatIndex }
    const disposeSeat = registerRpcMethod(scope, id, "approve_seat", async (ctx) => {
      let payloadObj: any = {};
      try {
        payloadObj = JSON.parse(ctx.payload || "{}");
      } catch {
        /* ignore */
      }
      window.dispatchEvent(
        new CustomEvent("livekit-rpc-approve-seat", {
          detail: {
            scope,
            id,
            callerIdentity: ctx.callerIdentity,
            seatIndex: payloadObj.seatIndex ?? null,
          },
        }),
      );
      return JSON.stringify({ ok: true, ack: "approve_seat_received" });
    });

    return () => {
      disposeMute();
      disposeKick();
      disposeSeat();
    };
  }, [scope, id]);
}
