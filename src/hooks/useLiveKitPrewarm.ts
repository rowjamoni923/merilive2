/**
 * useLiveKitPrewarm — Phase 2 of instant-entry architecture.
 *
 * Observes an element and pre-warms the named LiveKit room (DNS + TLS only)
 * when it enters the viewport. Cancels on unmount.
 *
 * Usage:
 *   const ref = useLiveKitPrewarm(`live_${streamId}`);
 *   return <div ref={ref}>…</div>;
 */
import { useEffect, useRef } from "react";
import { warmLiveKitRoom, cancelLiveKitWarmup } from "@/services/livekitWarmup";

export function useLiveKitPrewarm<T extends Element = HTMLDivElement>(
  roomName: string | null | undefined,
): React.RefObject<T> {
  const ref = useRef<T>(null);

  useEffect(() => {
    if (!roomName) return;
    const el = ref.current;
    if (!el) return;

    // No IntersectionObserver (older WebViews) → warm immediately.
    if (typeof IntersectionObserver === "undefined") {
      warmLiveKitRoom(roomName);
      return () => cancelLiveKitWarmup(roomName);
    }

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            warmLiveKitRoom(roomName);
            // One-shot: once warmed, no need to observe further. Auto-discard
            // is handled by the warmup service.
            observer.disconnect();
            break;
          }
        }
      },
      { rootMargin: "200px", threshold: 0.01 },
    );

    observer.observe(el);

    return () => {
      observer.disconnect();
      // Don't cancel here — user may tap a near-miss tile right after
      // scroll. Auto-discard timer in the service handles cleanup.
    };
  }, [roomName]);

  return ref;
}
