/**
 * CameraPausedOverlay — Phase 2C UI surface.
 *
 * Renders an opaque "Camera paused" card over the live/private-call viewport
 * when the app is in the background AND `pauseCameraOnBackground` is on (the
 * native plugin will have muted the publisher track). The overlay disappears
 * as soon as the process returns to foreground — the native side resumes the
 * track inside the same ~700 ms debounce window.
 *
 * Pure presentational component: state comes from `useRtcLifecycle`. Safe to
 * mount on web/iOS — `foreground` stays true so the overlay never appears.
 */
import { useEffect, useState } from 'react';
import { VideoOff } from 'lucide-react';
import { useRtcLifecycle } from '@/hooks/useRtcLifecycle';
import { cn } from '@/lib/utils';

export interface CameraPausedOverlayProps {
  /**
   * Set false on broadcast surfaces where the camera intentionally keeps
   * streaming while backgrounded (Live host). Default true (Private Call).
   */
  pauseOnBackground?: boolean;
  className?: string;
  /** Optional label override — keep strings English (project rule). */
  label?: string;
  hint?: string;
}

export function CameraPausedOverlay({
  pauseOnBackground = true,
  className,
  label = 'Camera paused',
  hint = 'Return to the app to resume.',
}: CameraPausedOverlayProps) {
  const { foreground, hasBackgrounded } = useRtcLifecycle();
  const shouldShow = pauseOnBackground && !foreground && hasBackgrounded;

  // Avoid hydration flash: only render the DOM node when needed.
  const [mounted, setMounted] = useState(shouldShow);
  useEffect(() => {
    if (shouldShow) setMounted(true);
    else {
      const id = window.setTimeout(() => setMounted(false), 200);
      return () => window.clearTimeout(id);
    }
  }, [shouldShow]);

  if (!mounted) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className={cn(
        'pointer-events-none absolute inset-0 z-40 flex items-center justify-center',
        'bg-background/90 backdrop-blur-sm transition-opacity duration-200',
        shouldShow ? 'opacity-100' : 'opacity-0',
        className,
      )}
    >
      <div className="flex flex-col items-center gap-3 px-6 text-center">
        <div className="rounded-full bg-muted p-4">
          <VideoOff className="h-7 w-7 text-muted-foreground" aria-hidden />
        </div>
        <div className="space-y-1">
          <p className="text-base font-semibold text-foreground">{label}</p>
          <p className="text-xs text-muted-foreground">{hint}</p>
        </div>
      </div>
    </div>
  );
}

export default CameraPausedOverlay;
