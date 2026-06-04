/**
 * Pkg425 — PAG (Portable Animated Graphics) player.
 *
 * Tencent's professional animation format used by Chamet 2025+, MICO, TikTok.
 * Successor to VAP. WebAssembly-powered, supports alpha + 60fps + designer time.
 *
 * Plays at the EXACT designer-authored duration (frames ÷ fps × 1000ms).
 * No hard-coded timers. `onComplete` fires on native end-of-animation.
 */

import React, { useEffect, useRef, useState } from 'react';
import { cn } from '@/lib/utils';

interface PAGPlayerProps {
  src: string;
  className?: string;
  loop?: boolean;
  autoPlay?: boolean;
  muted?: boolean;
  volume?: number;
  soundUrl?: string | null;
  onLoad?: () => void;
  onComplete?: () => void;
  onError?: (err: Error) => void;
}

let pagModulePromise: Promise<any> | null = null;
const loadPAG = () => {
  if (!pagModulePromise) {
    pagModulePromise = import('libpag').then((mod) => {
      const PAGInit = (mod as any).PAGInit || (mod as any).default?.PAGInit;
      if (!PAGInit) throw new Error('libpag PAGInit export missing');
      // CDN wasm URL (libpag publishes it on jsdelivr)
      return PAGInit({
        locateFile: (file: string) =>
          `https://cdn.jsdelivr.net/npm/libpag@4.5.70/lib/${file}`,
      });
    });
  }
  return pagModulePromise;
};

const PAGPlayer: React.FC<PAGPlayerProps> = ({
  src,
  className,
  loop = true,
  autoPlay = true,
  muted = true,
  volume = 0.8,
  soundUrl = null,
  onLoad,
  onComplete,
  onError,
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const playerRef = useRef<any>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    let pagFile: any = null;
    let pagSurface: any = null;
    let pagPlayer: any = null;

    (async () => {
      try {
        const PAG = await loadPAG();
        if (cancelled || !canvasRef.current) return;

        const resp = await fetch(src);
        if (!resp.ok) throw new Error(`PAG fetch ${resp.status}`);
        const buf = await resp.arrayBuffer();
        if (cancelled) return;

        pagFile = await PAG.PAGFile.load(buf);
        if (cancelled || !pagFile) throw new Error('PAG decode failed');

        const canvas = canvasRef.current;
        if (!canvas) return;
        const dpr = window.devicePixelRatio || 1;
        canvas.width = pagFile.width() * dpr;
        canvas.height = pagFile.height() * dpr;

        pagSurface = PAG.PAGSurface.fromCanvas(canvas);
        pagPlayer = new PAG.PAGPlayer();
        pagPlayer.setSurface(pagSurface);
        pagPlayer.setComposition(pagFile);

        playerRef.current = pagPlayer;
        setReady(true);
        onLoad?.();

        if (autoPlay) {
          if (!muted && soundUrl) {
            console.log('[PAGPlayer] 🔊 Playing sound:', soundUrl.split('/').pop());
            const { playSoundUrl } = await import('@/utils/soundPlayer');
            playSoundUrl(soundUrl, { volume, loop, maxConcurrent: 2 });
          }

          const duration = pagFile.duration(); // microseconds
          const startTs = performance.now();
          const tick = () => {
            if (cancelled || !playerRef.current) return;
            const elapsedUs = (performance.now() - startTs) * 1000;
            let progress = elapsedUs / duration;
            if (progress >= 1) {
              if (loop) {
                progress = progress - Math.floor(progress);
              } else {
                pagPlayer.setProgress(1);
                pagPlayer.flush();
                onComplete?.();
                return;
              }
            }
            pagPlayer.setProgress(progress);
            pagPlayer.flush();
            requestAnimationFrame(tick);
          };
          requestAnimationFrame(tick);
        }
      } catch (err) {
        if (!cancelled) onError?.(err as Error);
      }
    })();

    return () => {
      cancelled = true;
      try { pagPlayer?.destroy?.(); } catch {}
      try { pagSurface?.destroy?.(); } catch {}
      try { pagFile?.destroy?.(); } catch {}
      playerRef.current = null;
    };
  }, [src, loop, autoPlay]);

  return (
    <canvas
      ref={canvasRef}
      className={cn('w-full h-full object-contain', !ready && 'opacity-0', className)}
    />
  );
};

export default PAGPlayer;
