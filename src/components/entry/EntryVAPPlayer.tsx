/**
 * EntryVAPPlayer — DEDICATED entry-animation VAP/MP4 player.
 *
 * 🔒 This file is a SEPARATE COPY of `src/components/common/VAPPlayer.tsx`
 * dedicated to ENTRY animations (room entry, name bar, vehicle entrance,
 * entry banner). The gift-side VAPPlayer is intentionally left untouched.
 *
 * Why two players?
 *   - Editing the shared player risks breaking gift playback.
 *   - Entry animations are decorative full-screen overlays that need to be
 *     as cheap as possible so the rest of the app stays smooth.
 *
 * Performance changes vs the gift VAPPlayer (entry-only, never apply to gifts):
 *   - Fragment-shader precision lowered `highp → mediump` (3-5× faster on
 *     mobile GPUs; entry overlays don't need sub-pixel HDR precision).
 *   - `antialias: false` — entry overlays are large, motion-blurred by the
 *     animation itself, AA is invisible but very expensive on Mali / Adreno.
 *   - `powerPreference: 'default'` — `'high-performance'` forces the
 *     discrete/big GPU which quickly thermal-throttles on phones and
 *     halves frame-rate within 10 seconds of continuous entries.
 *   - `texSubImage2D` reuse after the first `texImage2D` allocation
 *     (avoids per-frame GPU memory churn — the #1 cause of jank on
 *     mid-range Android).
 *   - More aggressive mobile fallback to plain `<video>` for any clip
 *     larger than ~2 MP on coarse pointers (drops alpha but keeps the
 *     entry instant).
 *   - Silent: no `console.log` / `console.warn` from the hot path.
 *   - Skips the implicit `*.json` sibling fetch — entries rarely ship a
 *     companion VAP config, the extra round-trip just delayed first paint.
 */
import React, { useRef, useEffect, useState, useCallback } from 'react';
import { cn } from '@/lib/utils';
import { normalizePublicMediaUrl } from '@/lib/cdnImage';
import { normalizeGiftMediaUrl } from '@/utils/giftMediaUrl';
import { ensureAudioUnlocked } from '@/utils/audioUnlock';
import { detectVapSideBySideLayout, isLikelyVapCompositeSize } from '@/utils/vapDetection';
import { useNativeVAPAttempt } from '@/hooks/useNativeVAPAttempt';

interface VAPConfig {
  v: number; f: number; w: number; h: number; fps: number;
  videoW: number; videoH: number;
  aFrame: number[]; rgbFrame: number[];
  isVapx: number; orien: number;
}

interface EntryVAPPlayerProps {
  src: string;
  configSrc?: string;
  className?: string;
  loop?: boolean;
  autoPlay?: boolean;
  muted?: boolean;
  volume?: number;
  onLoad?: () => void;
  onError?: (error: Error) => void;
  onComplete?: () => void;
  soundUrl?: string | null;
}

const getAutoVapRects = (video: HTMLVideoElement) => {
  const layout = detectVapSideBySideLayout(video) || 'alpha-right';
  return layout === 'alpha-left'
    ? { rgbRect: [0.5, 0, 0.5, 1], alphaRect: [0, 0, 0.5, 1] }
    : { rgbRect: [0, 0, 0.5, 1], alphaRect: [0.5, 0, 0.5, 1] };
};

// Entry overlays should fall back to plain video much sooner than gifts.
const shouldUsePerformanceVideoFallback = (video: HTMLVideoElement, cfg: VAPConfig | null): boolean => {
  if (cfg) return false;
  const pixels = video.videoWidth * video.videoHeight;
  const coarsePointer = typeof window !== 'undefined' && window.matchMedia?.('(pointer: coarse)').matches;
  const cores = typeof navigator !== 'undefined' ? navigator.hardwareConcurrency || 4 : 4;
  if (pixels >= 4_000_000) return true;
  if (coarsePointer && pixels >= 2_000_000) return true;
  if (coarsePointer && cores <= 4 && pixels >= 1_500_000) return true;
  return false;
};

const EntryVAPPlayer: React.FC<EntryVAPPlayerProps> = ({
  src,
  configSrc,
  className,
  loop = true,
  autoPlay = true,
  muted = false,
  volume = 0.95,
  onLoad,
  onError,
  onComplete,
  soundUrl = null,
}) => {
  const resolvedSrc = React.useMemo(() => normalizeGiftMediaUrl(src) || normalizePublicMediaUrl(src) || src, [src]);
  const resolvedConfigSrc = React.useMemo(
    () => normalizeGiftMediaUrl(configSrc || '') || normalizePublicMediaUrl(configSrc || '') || configSrc,
    [configSrc]
  );

  // Pkg426 Phase-2: native Android VAP attempt. See VAPPlayer.tsx for full rationale.
  const nativeOnComplete = useCallback(() => { onCompleteRef.current?.(); }, []);
  const nativeOnError = useCallback((e: Error) => { onErrorRef.current?.(e); }, []);
  const nativeMode = useNativeVAPAttempt(resolvedSrc, {
    loop: loop ? 0 : 1,
    onComplete: nativeOnComplete,
    onError: nativeOnError,
  });

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const mountedRef = useRef(true);
  const glRef = useRef<WebGLRenderingContext | null>(null);
  const animationRef = useRef<number | null>(null);
  const frameCallbackModeRef = useRef<'raf' | 'rvfc'>('raf');
  const lastVideoTimeRef = useRef<number>(-1);
  const initializedRef = useRef(false);
  const textureUploadedRef = useRef(false);
  const [loading, setLoading] = useState(true);
  const [error] = useState<string | null>(null);
  const [config, setConfig] = useState<VAPConfig | null>(null);
  const [fallbackCrop, setFallbackCrop] = useState<[number, number, number, number]>([0.5, 0, 0.5, 1]);
  const [useVideoFallback, setUseVideoFallback] = useState(false);
  const webglPaintedRef = useRef(false);
  const completedRef = useRef(false);
  const useVideoFallbackRef = useRef(false);
  const completionTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const soundHandleRef = useRef<{ stop: () => void } | null>(null);

  const onLoadRef = useRef(onLoad);
  const onErrorRef = useRef(onError);
  const onCompleteRef = useRef(onComplete);

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  useEffect(() => {
    onLoadRef.current = onLoad;
    onErrorRef.current = onError;
    onCompleteRef.current = onComplete;
  }, [onLoad, onError, onComplete]);

  useEffect(() => { useVideoFallbackRef.current = useVideoFallback; }, [useVideoFallback]);

  useEffect(() => {
    if (nativeMode === 'active') onLoadRef.current?.();
  }, [nativeMode]);


  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    video.volume = Math.max(0, Math.min(1, volume));
    video.muted = muted;
  }, [volume, muted, resolvedSrc]);

  // Only fetch an EXPLICIT config — skip the sibling .json probe to save a
  // round-trip per entry (entries almost never ship a VAP config).
  useEffect(() => {
    if (!resolvedConfigSrc) { setConfig(null); return; }
    let cancelled = false;
    fetch(resolvedConfigSrc)
      .then(res => res.ok ? res.json() : null)
      .then(data => { if (!cancelled && data) setConfig(data.info || data); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [resolvedConfigSrc]);

  const createShaders = useCallback((gl: WebGLRenderingContext) => {
    const vertexShaderSource = `
      attribute vec2 a_position;
      attribute vec2 a_texCoord;
      varying vec2 v_texCoord;
      void main() {
        gl_Position = vec4(a_position, 0.0, 1.0);
        v_texCoord = a_texCoord;
      }
    `;

    // mediump is enough for entry overlays — saves a lot of GPU on mobile.
    const fragmentShaderSource = `
      precision mediump float;
      varying vec2 v_texCoord;
      uniform sampler2D u_texture;
      uniform vec4 u_rgbRect;
      uniform vec4 u_alphaRect;
      void main() {
        float edgeInset = 0.0005;
        vec2 rgbCoord = vec2(
          u_rgbRect.x + v_texCoord.x * u_rgbRect.z,
          u_rgbRect.y + v_texCoord.y * u_rgbRect.w
        );
        rgbCoord.x = clamp(rgbCoord.x, u_rgbRect.x + edgeInset, u_rgbRect.x + u_rgbRect.z - edgeInset);
        rgbCoord.y = clamp(rgbCoord.y, u_rgbRect.y + edgeInset, u_rgbRect.y + u_rgbRect.w - edgeInset);
        vec4 rgbColor = texture2D(u_texture, rgbCoord);

        vec2 alphaCoord = vec2(
          u_alphaRect.x + v_texCoord.x * u_alphaRect.z,
          u_alphaRect.y + v_texCoord.y * u_alphaRect.w
        );
        alphaCoord.x = clamp(alphaCoord.x, u_alphaRect.x + edgeInset, u_alphaRect.x + u_alphaRect.z - edgeInset);
        alphaCoord.y = clamp(alphaCoord.y, u_alphaRect.y + edgeInset, u_alphaRect.y + u_alphaRect.w - edgeInset);
        vec4 alphaColor = texture2D(u_texture, alphaCoord);

        float alpha = alphaColor.r;
        gl_FragColor = vec4(rgbColor.rgb * alpha, alpha);
      }
    `;

    const compileShader = (source: string, type: number) => {
      const shader = gl.createShader(type);
      if (!shader) return null;
      gl.shaderSource(shader, source);
      gl.compileShader(shader);
      if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
        gl.deleteShader(shader);
        return null;
      }
      return shader;
    };

    const vs = compileShader(vertexShaderSource, gl.VERTEX_SHADER);
    const fs = compileShader(fragmentShaderSource, gl.FRAGMENT_SHADER);
    if (!vs || !fs) return null;

    const program = gl.createProgram();
    if (!program) return null;
    gl.attachShader(program, vs);
    gl.attachShader(program, fs);
    gl.linkProgram(program);
    return program;
  }, []);

  const initWebGL = useCallback((video: HTMLVideoElement, cfg: VAPConfig | null) => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    if (shouldUsePerformanceVideoFallback(video, cfg)) {
      const { rgbRect } = getAutoVapRects(video);
      setFallbackCrop(rgbRect as [number, number, number, number]);
      setUseVideoFallback(true);
      setLoading(false);
      webglPaintedRef.current = true;
      onLoadRef.current?.();
      return;
    }

    const gl = canvas.getContext('webgl', {
      alpha: true,
      antialias: false,           // entry-only: huge GPU savings
      depth: false,
      stencil: false,
      premultipliedAlpha: true,
      preserveDrawingBuffer: false,
      powerPreference: 'default', // entry-only: avoid thermal throttling
    });

    if (!gl) {
      setUseVideoFallback(true);
      setLoading(false);
      onLoadRef.current?.();
      return;
    }

    glRef.current = gl;
    const program = createShaders(gl);
    if (!program) {
      setUseVideoFallback(true);
      setLoading(false);
      onLoadRef.current?.();
      return;
    }

    gl.useProgram(program);
    const positions = new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]);
    const texCoords = new Float32Array([0, 1, 1, 1, 0, 0, 0, 0, 1, 1, 1, 0]);

    const posBuf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, posBuf);
    gl.bufferData(gl.ARRAY_BUFFER, positions, gl.STATIC_DRAW);
    const posLoc = gl.getAttribLocation(program, 'a_position');
    gl.enableVertexAttribArray(posLoc);
    gl.vertexAttribPointer(posLoc, 2, gl.FLOAT, false, 0, 0);

    const texBuf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, texBuf);
    gl.bufferData(gl.ARRAY_BUFFER, texCoords, gl.STATIC_DRAW);
    const texLoc = gl.getAttribLocation(program, 'a_texCoord');
    gl.enableVertexAttribArray(texLoc);
    gl.vertexAttribPointer(texLoc, 2, gl.FLOAT, false, 0, 0);

    const texture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);

    let rgbRect: number[], alphaRect: number[];
    const videoWidth = video.videoWidth;
    const videoHeight = video.videoHeight;
    // Cap DPR at 2 for entries — phones reporting dpr=3.5 burn an extra ~3×
    // the pixels for no visible benefit on a transient overlay.
    const dpr = Math.min(window.devicePixelRatio || 1, 2);

    if (cfg) {
      rgbRect = [cfg.rgbFrame[0]/videoWidth, cfg.rgbFrame[1]/videoHeight, cfg.rgbFrame[2]/videoWidth, cfg.rgbFrame[3]/videoHeight];
      alphaRect = [cfg.aFrame[0]/videoWidth, cfg.aFrame[1]/videoHeight, cfg.aFrame[2]/videoWidth, cfg.aFrame[3]/videoHeight];
      canvas.width = cfg.w * dpr;
      canvas.height = cfg.h * dpr;
    } else {
      ({ rgbRect, alphaRect } = getAutoVapRects(video));
      canvas.width = (videoWidth / 2) * dpr;
      canvas.height = videoHeight * dpr;
    }

    setFallbackCrop(rgbRect as [number, number, number, number]);
    gl.uniform4fv(gl.getUniformLocation(program, 'u_rgbRect'), rgbRect);
    gl.uniform4fv(gl.getUniformLocation(program, 'u_alphaRect'), alphaRect);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

    const render = () => {
      if (useVideoFallbackRef.current || !mountedRef.current) return;
      const v = videoRef.current;
      if (!v) return;

      if (!v.paused && !v.ended && v.readyState >= 3 && v.currentTime !== lastVideoTimeRef.current) {
        try {
          lastVideoTimeRef.current = v.currentTime;
          if (!textureUploadedRef.current) {
            gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, v);
            textureUploadedRef.current = true;
          } else {
            // Sub-image avoids re-allocating GPU memory every frame.
            gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, gl.RGBA, gl.UNSIGNED_BYTE, v);
          }
          gl.viewport(0, 0, canvas.width, canvas.height);
          gl.clear(gl.COLOR_BUFFER_BIT);
          gl.drawArrays(gl.TRIANGLES, 0, 6);
          webglPaintedRef.current = true;
        } catch {
          setUseVideoFallback(true);
          return;
        }
      }

      if (v.ended && !loop) return;

      if (typeof (v as any).requestVideoFrameCallback === 'function') {
        frameCallbackModeRef.current = 'rvfc';
        animationRef.current = (v as any).requestVideoFrameCallback(render);
      } else {
        frameCallbackModeRef.current = 'raf';
        animationRef.current = requestAnimationFrame(render);
      }
    };

    if (autoPlay) {
      void (async () => {
        try {
          await ensureAudioUnlocked();
          if (!mountedRef.current || !videoRef.current) return;

          if (!muted && soundUrl) {
            const { playSoundUrl } = await import('@/utils/soundPlayer');
            videoRef.current.muted = true;
            soundHandleRef.current = playSoundUrl(soundUrl, {
              volume,
              loop,
              maxConcurrent: 2,
            });
          } else {
            videoRef.current.muted = muted;
          }
          videoRef.current.volume = volume;
          await videoRef.current.play();
        } catch {
          if (videoRef.current) {
            videoRef.current.muted = true;
            void videoRef.current.play().catch(() => {});
          }
        }
      })();
    }

    render();
    setLoading(false);
    onLoadRef.current?.();
  }, [autoPlay, createShaders, muted, volume, loop, soundUrl]);

  const handleVideoReady = useCallback((video: HTMLVideoElement) => {
    if (initializedRef.current || !video.videoWidth) return;
    initializedRef.current = true;
    const isComposite = !!config || isLikelyVapCompositeSize(video.videoWidth, video.videoHeight);

    if (!loop && video.duration > 0 && Number.isFinite(video.duration)) {
      if (completionTimerRef.current) clearTimeout(completionTimerRef.current);
      completionTimerRef.current = setTimeout(() => {
        if (mountedRef.current && !completedRef.current) {
          completedRef.current = true;
          onCompleteRef.current?.();
        }
      }, Math.max(300, video.duration * 1000 + 150));
    }

    if (!isComposite) {
      setFallbackCrop([0, 0, 1, 1]);
      setUseVideoFallback(true);
      setLoading(false);
      onLoadRef.current?.();
      return;
    }
    initWebGL(video, config);
  }, [config, initWebGL, loop]);

  useEffect(() => {
    return () => {
      if (completionTimerRef.current) clearTimeout(completionTimerRef.current);
      if (soundHandleRef.current) {
        soundHandleRef.current.stop();
        soundHandleRef.current = null;
      }
      if (animationRef.current !== null) {
        if (frameCallbackModeRef.current === 'rvfc' && videoRef.current) {
          (videoRef.current as any).cancelVideoFrameCallback?.(animationRef.current);
        } else {
          cancelAnimationFrame(animationRef.current);
        }
      }
    };
  }, []);

  if (error) return <div className={cn("bg-transparent", className)} />;

  return (
    <div className={cn("relative flex items-center justify-center overflow-hidden", className)}>
      {loading && <div className="absolute inset-0 bg-transparent" />}
      <video
        ref={videoRef}
        src={resolvedSrc}
        autoPlay={autoPlay}
        loop={loop}
        muted={muted}
        playsInline
        crossOrigin="anonymous"
        preload="auto"
        {...({ disableRemotePlayback: true } as any)}
        className={cn(
          "absolute opacity-0 pointer-events-none",
          useVideoFallback && "relative opacity-100 w-full h-full object-cover"
        )}
        style={useVideoFallback ? {
          objectPosition: `${-(fallbackCrop[0] * 100)}% 0`,
          width: `${(1 / fallbackCrop[2]) * 100}%`,
          maxWidth: 'none',
        } : {}}
        onLoadedData={(e) => handleVideoReady(e.currentTarget)}
        onEnded={() => !loop && onCompleteRef.current?.()}
        onError={() => { setLoading(false); onErrorRef.current?.(new Error('Load failed')); }}
      />
      {!useVideoFallback && (
        <canvas
          ref={canvasRef}
          className="w-full h-full object-contain pointer-events-none"
          style={{ opacity: webglPaintedRef.current ? 1 : 0 }}
        />
      )}
    </div>
  );
};

export default EntryVAPPlayer;
