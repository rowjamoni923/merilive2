/**
 * GiftComboTracker — Chamet/Bigo-style edge combo counter.
 *
 * Listens to `livekit-gift-sent` window events for the given (scope, id) room
 * and maintains per-sender+gift lanes. Each lane keeps incrementing while
 * gifts of the same type arrive from the same sender within `COMBO_WINDOW_MS`.
 * After idle timeout, the lane auto-dismisses.
 *
 * Industry-locked numbers (Chamet/Bigo/ZEGOCLOUD teardowns 2024-2026):
 *  - Combo window: 4000 ms (3-5s range; 4s = sweet spot)
 *  - Max simultaneous lanes: 3 (vertical stack, right edge)
 *  - Newer lanes push older off
 *  - Counter is purely presentational — server is source of truth
 *
 * Wired ON TOP of existing FlyingGiftAnimation. No suppression of fullscreen
 * (that is a separate UX call). This component only adds the missing edge
 * combo counter UI that was previously dead code (GiftComboDisplay).
 */

import { useEffect, useRef, useState } from "react";
import { GiftComboDisplay } from "./GiftComboDisplay";
import type { GiftSentDetail, GiftScope } from "@/lib/livekitGiftSignaling";

const COMBO_WINDOW_MS = 4000;
const MAX_LANES = 3;

interface ComboLane {
  id: string;            // sender+gift key
  senderId: string;
  senderName: string;
  senderAvatar?: string;
  senderLevel: number;
  receiverName: string;
  giftName: string;
  giftEmoji: string;
  giftIcon?: string;
  count: number;
  totalValue: number;
  lastAt: number;
  timer: ReturnType<typeof setTimeout> | null;
}

interface Props {
  scope: GiftScope;
  id: string;
  receiverName?: string;
}

export const GiftComboTracker = ({ scope, id, receiverName = "Host" }: Props) => {
  const lanesRef = useRef<Map<string, ComboLane>>(new Map());
  const [lanes, setLanes] = useState<ComboLane[]>([]);

  const flushLanes = () => {
    const arr = Array.from(lanesRef.current.values())
      .sort((a, b) => b.lastAt - a.lastAt)
      .slice(0, MAX_LANES);
    setLanes(arr);
  };

  useEffect(() => {
    const onGift = (ev: Event) => {
      const data = (ev as CustomEvent<GiftSentDetail>).detail;
      if (!data || data.scope !== scope || data.id !== id) return;
      if (!data.senderId || !data.giftName) return;

      const key = `${data.senderId}|${data.giftName}`;
      const now = Date.now();
      const existing = lanesRef.current.get(key);
      const addCount = Math.max(1, Number(data.count) || 1);
      const unitCoins = Math.max(0, Number(data.giftCoins) || 0);

      if (existing && now - existing.lastAt < COMBO_WINDOW_MS) {
        if (existing.timer) clearTimeout(existing.timer);
        existing.count += addCount;
        existing.totalValue += unitCoins * addCount;
        existing.lastAt = now;
        existing.timer = setTimeout(() => {
          lanesRef.current.delete(key);
          flushLanes();
        }, COMBO_WINDOW_MS);
      } else {
        if (existing?.timer) clearTimeout(existing.timer);
        const lane: ComboLane = {
          id: `${key}|${now}`,
          senderId: data.senderId,
          senderName: data.senderName || "User",
          senderAvatar: data.senderAvatar,
          senderLevel: Number((data as any).senderLevel) || 1,
          receiverName,
          giftName: data.giftName,
          giftEmoji: (data as any).giftIcon || "🎁",
          giftIcon: data.giftIconUrl || undefined,
          count: addCount,
          totalValue: unitCoins * addCount,
          lastAt: now,
          timer: null,
        };
        lane.timer = setTimeout(() => {
          lanesRef.current.delete(key);
          flushLanes();
        }, COMBO_WINDOW_MS);
        lanesRef.current.set(key, lane);
      }
      flushLanes();
    };

    window.addEventListener("livekit-gift-sent", onGift);
    return () => {
      window.removeEventListener("livekit-gift-sent", onGift);
      // Clear timers on unmount
      for (const lane of lanesRef.current.values()) {
        if (lane.timer) clearTimeout(lane.timer);
      }
      lanesRef.current.clear();
    };
  }, [scope, id, receiverName]);

  if (lanes.length === 0) return null;

  return (
    <div
      className="pointer-events-none fixed right-2 z-[60] flex flex-col gap-2"
      style={{
        bottom: "calc(env(safe-area-inset-bottom) + 7rem)",
      }}
    >
      {lanes.map((lane) => (
        <GiftComboDisplay
          key={lane.id}
          combo={{
            receiverName: lane.receiverName,
          }}
        />
      ))}
    </div>
  );
};

export default GiftComboTracker;
