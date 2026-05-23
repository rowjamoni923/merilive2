/**
 * Pkg235 — M29 App hibernation safety hook.
 *
 * Runs once on app start. If the OS reports that MeriLive is subject to
 * auto-reset / hibernation (Android 11+), surface a single toast at most
 * every 30 days inviting the user to disable it. Tapping the toast opens
 * the OS settings screen.
 *
 * No-op on web/iOS. Throttled via localStorage.
 */
import { useEffect } from 'react';
import { toast } from 'sonner';
import {
  getHibernationStatus,
  openHibernationSettings,
  isHibernationSupported,
  recentlyPrompted,
  markPrompted,
} from '@/plugins/Hibernation';

export function useHibernationCheck() {
  useEffect(() => {
    if (!isHibernationSupported()) return;
    if (recentlyPrompted()) return;

    // Defer 6s so we don't race against splash / first paint / auth restore.
    const timer = setTimeout(async () => {
      try {
        const { shouldPrompt } = await getHibernationStatus();
        if (!shouldPrompt) return;
        markPrompted();
        toast.message('Stay connected to MeriLive', {
          description:
            "Disable auto-reset so you never miss calls or messages, even if you don't open the app for a while.",
          duration: 12000,
          action: {
            label: 'Open settings',
            onClick: () => { void openHibernationSettings(); },
          },
        });
      } catch {
        // best-effort, swallow
      }
    }, 6000);

    return () => clearTimeout(timer);
  }, []);
}
