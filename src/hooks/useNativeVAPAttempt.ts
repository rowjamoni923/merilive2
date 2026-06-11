/**
 * Pkg426 Phase-2 — Native VAP attempt hook.
 *
 * Additive bridge between the WebView VAP players (VAPPlayer.tsx /
 * EntryVAPPlayer.tsx) and the native Android NativeVAP plugin. Returns one
 * of three states:
 *
 *   'pending'  — attempting native play, render NOTHING (avoid double-decode)
 *   'active'   — native plugin owns the screen; WebView player should NOT mount
 *   'fallback' — native unavailable / disabled / failed → use existing WebView path
 *
 * The hook is intentionally cheap and ALWAYS resolves to 'fallback' on:
 *   - web preview / iOS
 *   - feature flag OFF
 *   - native plugin missing or returning ok:false within 3s
 *
 * It also lazy-loads the remote app_settings flag values once per session.
 */
import { useEffect, useRef, useState } from 'react';
import {
  isNativeVAPAvailable,
  tryNativeVAPPlay,
  stopNativeVAP,
} from '@/plugins/NativeVAP';
import {
  isNativeVAPFlagEnabled,
  setRemoteNativeVAPConfig,
} from '@/utils/vapNativeFlag';
import { getAppSetting } from '@/utils/appSettingsCache';

export type NativeVAPMode = 'pending' | 'active' | 'fallback';

let remoteLoaded = false;
let remoteLoading: Promise<void> | null = null;

function loadRemoteFlag(): Promise<void> {
  if (remoteLoaded) return Promise.resolve();
  if (remoteLoading) return remoteLoading;
  remoteLoading = (async () => {
    try {
      const [enabledRaw, pctRaw] = await Promise.all([
        getAppSetting<unknown>('vap_native_enabled'),
        getAppSetting<unknown>('vap_native_rollout_percent'),
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
      setRemoteNativeVAPConfig({
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

interface UseNativeVAPAttemptOpts {
  /** Caller can hard-disable (e.g. tiny inline previews). */
  enabled?: boolean;
  /** 0 = infinite, n = repeat count. Maps to native plugin `loop`. */
  loop?: number;
  /** Fires when native plugin emits vap:complete (last loop). */
  onComplete?: () => void;
  /** Fires when native plugin emits vap:error (after starting). */
  onError?: (err: Error) => void;
}

export function useNativeVAPAttempt(
  src: string | null | undefined,
  opts: UseNativeVAPAttemptOpts = {},
): NativeVAPMode {
  const { enabled = true, loop = 1 } = opts;
  // 🚨 First-play fix: default to 'fallback' (NOT 'pending') so the WebView
  // VAP <canvas>/<video> mounts and starts decoding from frame 0 on the very
  // first send. We only flip to 'active' AFTER the native plugin confirms
  // it has taken over (then the WebView path hides itself). This eliminates
  // the "first send shows nothing, second send works" symptom caused by the
  // old 'pending' gap (50-300ms with nothing rendered).
  const [mode, setMode] = useState<NativeVAPMode>('fallback');
  const onCompleteRef = useRef(opts.onComplete);
  const onErrorRef = useRef(opts.onError);

  useEffect(() => {
    onCompleteRef.current = opts.onComplete;
    onErrorRef.current = opts.onError;
  }, [opts.onComplete, opts.onError]);

  useEffect(() => {
    let cancelled = false;
    let listenerHandle: { remove: () => Promise<void> } | null = null;

    (async () => {
      if (!enabled || !src) return; // stay in 'fallback'

      // Cheap synchronous platform gate. If flag is OFF and we haven't loaded
      // the remote config yet, load it; if still OFF, stay in 'fallback'.
      if (!isNativeVAPFlagEnabled() && !remoteLoaded) {
        await loadRemoteFlag();
        if (cancelled) return;
      }
      if (!isNativeVAPFlagEnabled()) return;

      if (!(await isNativeVAPAvailable())) return;

      // Register listeners BEFORE play so we don't miss the complete event
      // on very short clips.
      try {
        const { default: NativeVAP } = await import('@/plugins/NativeVAP');
        listenerHandle = await NativeVAP.addListener(
          'vap:complete',
          (data) => {
            if (!cancelled && data?.url === src) {
              onCompleteRef.current?.();
            }
          },
        );
        await NativeVAP.addListener('vap:error', (data) => {
          if (!cancelled && data?.url === src) {
            onErrorRef.current?.(
              new Error(data.errorMsg || 'native vap error'),
            );
          }
        });
      } catch {
        /* listener attach failed — non-fatal */
      }

      const ok = await tryNativeVAPPlay({
        url: src,
        loop,
        fillScreen: true,
        scaleMode: 'fitCenter',
      });
      if (cancelled) return;
      // Only promote to 'active' on confirmed success. On failure, the
      // WebView path is ALREADY rendering (we started in 'fallback'), so
      // playback is uninterrupted.
      if (ok) setMode('active');
    })();

    return () => {
      cancelled = true;
      if (listenerHandle) {
        listenerHandle.remove().catch(() => {});
      }
      stopNativeVAP().catch(() => {});
    };
  }, [src, loop, enabled]);

  return mode;
}
