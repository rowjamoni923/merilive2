/**
 * Pkg210 — Listen for Android 14+ screenshot events and warn the user.
 * (Recording itself is already blocked globally by FLAG_SECURE on MainActivity,
 *  so this fires only for the few system paths Android still allows.)
 */
import { useEffect } from 'react';
import { Capacitor } from '@capacitor/core';
import { toast } from 'sonner';
import { ScreenCaptureDetector } from '@/plugins/ScreenCaptureDetector';

export default function ScreenshotDetectionBridge() {
  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;
    let remove: (() => void) | undefined;
    let mounted = true;
    (async () => {
      try {
        const res = await ScreenCaptureDetector.start();
        if (!mounted || !res.supported) return;
        const sub = await ScreenCaptureDetector.addListener('screenshot-detected', () => {
          toast.warning('Screenshot detected. Sharing private content is against our policy.');
        });
        remove = () => sub.remove();
      } catch {}
    })();
    return () => {
      mounted = false;
      remove?.();
      ScreenCaptureDetector.stop().catch(() => {});
    };
  }, []);
  return null;
}
