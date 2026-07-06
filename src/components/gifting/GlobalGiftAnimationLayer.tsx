import FullScreenGiftAnimation from "@/components/level/FullScreenGiftAnimation";
import {
  useCurrentFullScreenGift,
  completeCurrentFullScreenGift,
} from "@/hooks/useGlobalFullScreenGift";
import { isNativeGiftPipelineActive } from "@/utils/nativeAnimRuntime";

/**
 * Mount ONCE at App root. Drains the global full-screen gift queue.
 *
 *   - Skipped entirely when the Android native gift pipeline is active
 *     (NativeGiftAnimationPlugin owns playback there — no double play).
 *   - Any gift-capable surface can enqueue via `enqueueFullScreenGift(...)`.
 */
export function GlobalGiftAnimationLayer() {
  const job = useCurrentFullScreenGift();
  if (!job) return null;
  if (isNativeGiftPipelineActive()) return null;

  return (
    <FullScreenGiftAnimation
      gift={job.gift}
      senderName={job.senderName}
      senderAvatar={job.senderAvatar}
      senderLevel={job.senderLevel}
      receiverName={job.receiverName}
      receiverAvatar={job.receiverAvatar}
      receiverLevel={job.receiverLevel}
      quantity={job.quantity}
      onComplete={() => completeCurrentFullScreenGift(job.id)}
    />
  );
}

export default GlobalGiftAnimationLayer;
