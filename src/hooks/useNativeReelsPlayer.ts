/**
 * Pkg427 — Native Reels Player hook.
 *
 * Wires Reels.tsx to the native Android ExoPlayer plugin behind the
 * `reelsNativeFlag` gate. Returns an `active` flag the caller uses to
 * (a) hide the WebView <video> element (revealing the native surface
 * beneath the transparent WebView), and (b) route togglePlay / toggleMute
 * to the native plugin instead of the HTMLVideoElement.
 *
 * Mirrors the Pkg426 useNativeVAPAttempt pattern. ADDITIVE — when the
 * flag is OFF or the plugin is unavailable, `active` stays false and
 * Reels.tsx renders unchanged.
 */
import { useEffect, useRef, useState } from 'react';
import {
  isNativeReelsPlayerAvailable,
  tryNativeReelsPlay,
  tryNativeReelsPrefetch,
  disposeNativeReels,
} from '@/plugins/NativeReelsPlayer';
import NativeReelsPlayer from '@/plugins/NativeReelsPlayer';
import {
  isNativeReelsFlagEnabled,
  setRemoteNativeReelsConfig,
} from '@/utils/reelsNativeFlag';
import { getAppSetting } from '@/utils/appSettingsCache';

let remoteLoaded = false;
let remoteLoading: Promise<void> | null = null;

function loadRemoteFlag(): Promise<void> {
  if (remoteLoaded) return Promise.resolve();
  if (remoteLoading) return remoteLoading;
  remoteLoading = (async () => {
    try {
      const [enabledRaw, pctRaw] = await Promise.all([
        getAppSetting<unknown>('reels_native_enabled'),
        getAppSetting<unknown>('reels_native_rollout_percent'),
      ]);
      const enabled =
        enabledRaw === true ||
        enabledRaw === 'true' ||
        enabledRaw === 1 ||
        (typeof enabledRaw === 'object' &&
          enabledRaw !== null &&
          (enabledRaw as { value?: unknown }).value === true);
      const pctNum =
        typeof pctRaw === 'number'
          ? pctRaw
          : typeof pctRaw === 'string'
          ? Number(pctRaw)
          : typeof pctRaw === 'object' && pctRaw !== null
          ? Number((pctRaw as { value?: unknown }).value)
          : NaN;
      setRemoteNativeReelsConfig({
        enabled,
        rolloutPercent: Number.isFinite(pctNum) ? pctNum : null,
      });
    } catch {
      /* best-effort */
    } finally {
      remoteLoaded = true;
      remoteLoading = null;
    }
  })();
  return remoteLoading;
}

interface UseNativeReelsOpts {
  url: string | null | undefined;
  muted: boolean;
  /** Caller can hard-disable (e.g. when modal/sheet covers the reel). */
  enabled?: boolean;
  /** URLs to warm into the disk cache for instant next-reel transition. */
  prefetchUrls?: string[];
}

interface UseNativeReelsReturn {
  /** True when native ExoPlayer owns the screen. Hide <video> when true. */
  active: boolean;
  /** True while we're still negotiating (avoid flash). */
  initializing: boolean;
  /** Imperative controls — safe no-ops when `active` is false. */
  play: () => Promise<void>;
  pause: () => Promise<void>;
  setMuted: (m: boolean) => Promise<void>;
  seek: (positionMs: number) => Promise<void>;
}

export function useNativeReelsPlayer(
  opts: UseNativeReelsOpts,
): UseNativeReelsReturn {
  const { url, muted, enabled = true, prefetchUrls } = opts;
  const [active, setActive] = useState(false);
  const [initializing, setInitializing] = useState(true);
  const lastUrlRef = useRef<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      if (!enabled || !url) {
        if (!cancelled) {
          setActive(false);
          setInitializing(false);
        }
        return;
      }

      // Lazy-load remote flag once per session.
      if (!isNativeReelsFlagEnabled() && !remoteLoaded) {
        await loadRemoteFlag();
        if (cancelled) return;
      }
      if (!isNativeReelsFlagEnabled()) {
        if (!cancelled) {
          setActive(false);
          setInitializing(false);
        }
        return;
      }

      if (!(await isNativeReelsPlayerAvailable())) {
        if (!cancelled) {
          setActive(false);
          setInitializing(false);
        }
        return;
      }

      setInitializing(true);
      const ok = await tryNativeReelsPlay({
        url,
        muted,
        loop: true,
        autoplay: true,
      });
      if (cancelled) return;
      setActive(ok);
      setInitializing(false);
      if (ok) lastUrlRef.current = url;
    })();

    return () => {
      cancelled = true;
    };
  }, [url, enabled]);

  // Mute toggle without re-loading the source.
  useEffect(() => {
    if (!active) return;
    NativeReelsPlayer.setMuted({ muted }).catch(() => {});
  }, [muted, active]);

  // Best-effort warmup for the next/prev reel so the upcoming swipe
  // skips the cold network fetch entirely.
  useEffect(() => {
    if (!active || !prefetchUrls?.length) return;
    prefetchUrls.forEach((u) => {
      if (u && u !== url) tryNativeReelsPrefetch(u).catch(() => {});
    });
  }, [active, prefetchUrls?.join('|'), url]);

  // Release the native player when the hook unmounts (user leaves /reels).
  useEffect(() => {
    return () => {
      disposeNativeReels().catch(() => {});
    };
  }, []);

  return {
    active,
    initializing,
    play: async () => {
      if (!active) return;
      try {
        await NativeReelsPlayer.resume();
      } catch {
        /* ignore */
      }
    },
    pause: async () => {
      if (!active) return;
      try {
        await NativeReelsPlayer.pause();
      } catch {
        /* ignore */
      }
    },
    setMuted: async (m: boolean) => {
      if (!active) return;
      try {
        await NativeReelsPlayer.setMuted({ muted: m });
      } catch {
        /* ignore */
      }
    },
    seek: async (positionMs: number) => {
      if (!active) return;
      try {
        await NativeReelsPlayer.seek({ positionMs });
      } catch {
        /* ignore */
      }
    },
  };
}
