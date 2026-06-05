import React, { useRef, useEffect, useState, useCallback } from 'react';
import { cn } from '@/lib/utils';
import { normalizePublicMediaUrl } from '@/lib/cdnImage';
import { normalizeGiftMediaUrl } from '@/utils/giftMediaUrl';
import { ensureAudioUnlocked } from '@/utils/audioUnlock';
import { detectVapSideBySideLayout, isLikelyVapCompositeSize } from '@/utils/vapDetection';

interface VAPConfig {
  v: number;           // version
  f: number;           // total frames
  w: number;           // width
  h: number;           // height
  fps: number;         // frames per second
  videoW: number;      // video width (includes alpha channel)
  videoH: number;      // video height
  aFrame: number[];    // alpha frame position [x, y, w, h]
  rgbFrame: number[];  // RGB frame position [x, y, w, h]
  isVapx: number;      // is vapx format
  orien: number;       // orientation
}

interface VAPPlayerProps {
  src: string;                    // URL to the MP4 video file
  configSrc?: string;             // URL to the JSON config (optional if embedded)
  className?: string;
  loop?: boolean;
  autoPlay?: boolean;
  muted?: boolean;
  volume?: number;
  onLoad?: () => void;
  onError?: (error: Error) => void;
  onComplete?: () => void;
  soundUrl?: string | null;
  /** Pkg: Professional dynamic data replacement (SVGA/VAP/PAG) */
  dynamicData?: any;
}

type VideoFrameCallbackVideo = HTMLVideoElement & {
  requestVideoFrameCallback?: (callback: () => void) => number;
  cancelVideoFrameCallback?: (handle: number) => void;
};

const getAutoVapRects = (video: HTMLVideoElement) => {
  const layout = detectVapSideBySideLayout(video) || 'alpha-right';
  return layout === 'alpha-left'
    ? { rgbRect: [0.5, 0, 0.5, 1], alphaRect: [0, 0, 0.5, 1] }
    : { rgbRect: [0, 0, 0.5, 1], alphaRect: [0.5, 0, 0.5, 1] };
};

const shouldUsePerformanceVideoFallback = (video: HTMLVideoElement, cfg: VAPConfig | null): boolean => {
  if (cfg) return false;
  const pixels = video.videoWidth * video.videoHeight;
  const coarsePointer = typeof window !== 'undefined' && window.matchMedia?.('(pointer: coarse)').matches;
  const cores = typeof navigator !== 'undefined' ? navigator.hardwareConcurrency || 4 : 4;
  return pixels >= 6_000_000 || (coarsePointer && cores <= 2 && pixels >= 3_000_000);
};

const VAPPlayer: React.FC<VAPPlayerProps> = ({
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
  const resolvedConfigSrc = React.useMemo(() => normalizeGiftMediaUrl(configSrc || '') || normalizePublicMediaUrl(configSrc || '') || configSrc, [configSrc]);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const mountedRef = useRef(true);
  const glRef = useRef<WebGLRenderingContext | null>(null);
  const animationRef = useRef<number | null>(null);
  const frameCallbackModeRef = useRef<'raf' | 'rvfc'>('raf');
  const lastVideoTimeRef = useRef<number>(-1);
  const initializedRef = useRef(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [config, setConfig] = useState<VAPConfig | null>(null);
  const [configReady, setConfigReady] = useState(false);
  const [fallbackCrop, setFallbackCrop] = useState<[number, number, number, number]>([0.5, 0, 0.5, 1]);
  const [useVideoFallback, setUseVideoFallback] = useState(false);
  const [webglPainted, setWebglPainted] = useState(false);
  const webglPaintedRef = useRef(false);
  const completedRef = useRef(false);
  const useVideoFallbackRef = useRef(false);
  const completionTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const webglFallbackTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
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
    initializedRef.current = false;
    completedRef.current = false;
    webglPaintedRef.current = false;
    lastVideoTimeRef.current = -1;
    setWebglPainted(false);
    setUseVideoFallback(false);
    setLoading(true);
    setError(null);
    if (completionTimerRef.current) clearTimeout(completionTimerRef.current);
    if (webglFallbackTimerRef.current) clearTimeout(webglFallbackTimerRef.current);
  }, [resolvedSrc, resolvedConfigSrc]);
  
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    video.volume = Math.max(0, Math.min(1, volume));
    video.muted = muted;
  }, [volume, muted, resolvedSrc]);

  useEffect(() => {
    // Pkg: Use a cached fetch for VAP configs to ensure instant load on repeat sends
    const jsonPath = resolvedConfigSrc || (/\.(mp4|webm)(\?|#|$)/i.test(resolvedSrc)
      ? resolvedSrc.replace(/\.(mp4|webm)(?=\?|#|$)/i, '.json')
      : '');
    setConfigReady(false);
    if (!jsonPath) {
      setConfig(null);
      setConfigReady(true);
      return;
    }
    
    const fetchConfig = async () => {
      try {
        const res = await fetch(jsonPath);
        if (res.ok) {
          const contentType = res.headers.get('content-type') || '';
          if (!contentType.includes('json')) {
            if (mountedRef.current) setConfig(null);
            return;
          }
          const data = await res.json();
          if (mountedRef.current) {
            const nextConfig = data.info || data;
            if (nextConfig?.rgbFrame && nextConfig?.aFrame) setConfig(nextConfig);
            else setConfig(null);
          }
        } else {
          if (mountedRef.current) setConfig(null);
        }
      } catch {
        if (mountedRef.current) setConfig(null);
      } finally {
        if (mountedRef.current) setConfigReady(true);
      }
    };

    fetchConfig();
  }, [resolvedSrc, resolvedConfigSrc]);

  const createShaders = useCallback((gl: WebGLRenderingContext) => {
    const vertexShaderSource = `
      precision highp float;
      attribute vec2 a_position;
      attribute vec2 a_texCoord;
      varying vec2 v_texCoord;
      void main() {
        gl_Position = vec4(a_position, 0.0, 1.0);
        v_texCoord = a_texCoord;
      }
    `;

    const fragmentShaderSource = `
      precision highp float;
      varying vec2 v_texCoord;
      uniform sampler2D u_texture;
      uniform vec4 u_rgbRect;
      uniform vec4 u_alphaRect;
      void main() {
        // High-precision HD sampling.
        // We use a negligible inset (0.00005) to maintain maximum sharpness
        // while preventing sub-pixel sampling bleed between channels.
        float edgeInset = 0.00005; 
        
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
        
        // Output premultiplied alpha for professional-grade blending.
        // Alpha is derived from the R channel (standard for VAP).
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
        console.error('[VAPPlayer] Shader compile error:', gl.getShaderInfoLog(shader));
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
      setWebglPainted(true);
      onLoadRef.current?.();
      return;
    }

    const gl = canvas.getContext('webgl', {
      alpha: true,
      antialias: true, // Enable antialiasing for smoother edges
      depth: false,
      stencil: false,
      premultipliedAlpha: true, // Switched to true for professional blending
      preserveDrawingBuffer: false,
      powerPreference: 'high-performance',
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
    const dpr = window.devicePixelRatio || 1;

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
    if (webglFallbackTimerRef.current) clearTimeout(webglFallbackTimerRef.current);
    webglFallbackTimerRef.current = setTimeout(() => {
      if (!mountedRef.current || webglPaintedRef.current || useVideoFallbackRef.current) return;
      console.warn('[VAPPlayer] WebGL did not paint quickly; showing RGB video fallback:', src.split('/').pop());
      setUseVideoFallback(true);
      setLoading(false);
      onLoadRef.current?.();
    }, 900);
    gl.uniform4fv(gl.getUniformLocation(program, 'u_rgbRect'), rgbRect);
    gl.uniform4fv(gl.getUniformLocation(program, 'u_alphaRect'), alphaRect);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

    const render = () => {
      if (useVideoFallbackRef.current || !mountedRef.current) return;
      const v = videoRef.current;
      if (!v) return;

      if (!v.ended && v.readyState >= 2 && v.videoWidth > 0 && (v.currentTime !== lastVideoTimeRef.current || !webglPaintedRef.current)) {
        try {
          lastVideoTimeRef.current = v.currentTime;
          gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, v);
          gl.viewport(0, 0, canvas.width, canvas.height);
          gl.clear(gl.COLOR_BUFFER_BIT);
          gl.drawArrays(gl.TRIANGLES, 0, 6);
          if (!webglPaintedRef.current) {
            webglPaintedRef.current = true;
            if (webglFallbackTimerRef.current) {
              clearTimeout(webglFallbackTimerRef.current);
              webglFallbackTimerRef.current = null;
            }
            setWebglPainted(true);
          }
        } catch (e) {
          console.warn('[VAPPlayer] WebGL render error, falling back:', e);
          setUseVideoFallback(true);
          return;
        }
      }

      // Safety: If video is playing but canvas isn't painted yet, force paint check
      if (v.currentTime > 0 && !webglPaintedRef.current && !v.paused) {
        webglPaintedRef.current = true;
        if (webglFallbackTimerRef.current) {
          clearTimeout(webglFallbackTimerRef.current);
          webglFallbackTimerRef.current = null;
        }
        setWebglPainted(true);
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
          // Pkg: Don't wait forever for audio unlock; gifts must show even if silent.
          await Promise.race([
            ensureAudioUnlocked(),
            new Promise(resolve => setTimeout(resolve, 1000))
          ]);
          if (!mountedRef.current || !videoRef.current) return;
          
          if (!muted && soundUrl) {
            console.log('[VAPPlayer] 🔊 Playing separate sound:', soundUrl.split('/').pop());
            const { playSoundUrl } = await import('@/utils/soundPlayer');
            // If we have a soundUrl, we mute the video to prevent doubling
            videoRef.current.muted = true;
            soundHandleRef.current = playSoundUrl(soundUrl, { 
              volume: volume, 
              loop, 
              maxConcurrent: 2 
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
  }, [autoPlay, createShaders, muted, volume, loop, src]);

  const handleVideoReady = useCallback((video: HTMLVideoElement) => {
    if (initializedRef.current || !video.videoWidth || !configReady) return;
    initializedRef.current = true;
    const isComposite = !!config || isLikelyVapCompositeSize(video.videoWidth, video.videoHeight);
    
    // Pkg-fix: Add safety completion timer for non-looping VAP
    // If the video ended event doesn't fire, we force completion after duration + 1s.
    if (!loop) {
      if (completionTimerRef.current) clearTimeout(completionTimerRef.current);
      const fallbackMs = Number.isFinite(video.duration) && video.duration > 0
        ? Math.min(Math.max(video.duration * 1000 + 1200, 4000), 65000)
        : 12000;
      completionTimerRef.current = setTimeout(() => {
        if (mountedRef.current && !completedRef.current) {
          console.warn('[VAPPlayer] ⚠️ Safety timer triggered for', src.split('/').pop());
          completedRef.current = true;
          onCompleteRef.current?.();
        }
      }, fallbackMs);
    }

    if (!isComposite) {
      setFallbackCrop([0, 0, 1, 1]);
      setUseVideoFallback(true);
      setLoading(false);
      onLoadRef.current?.();
      return;
    }
    initWebGL(video, config);
  }, [config, configReady, initWebGL, loop, src]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video || initializedRef.current || !configReady || !video.videoWidth) return;
    handleVideoReady(video);
  }, [configReady, handleVideoReady]);

  useEffect(() => {
    return () => {
      if (completionTimerRef.current) clearTimeout(completionTimerRef.current);
      if (webglFallbackTimerRef.current) clearTimeout(webglFallbackTimerRef.current);
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

  const fallbackStyle: React.CSSProperties = useVideoFallback ? {
    position: 'absolute',
    top: `${-(fallbackCrop[1] / Math.max(fallbackCrop[3], 0.0001)) * 100}%`,
    left: `${-(fallbackCrop[0] / Math.max(fallbackCrop[2], 0.0001)) * 100}%`,
    width: `${(1 / Math.max(fallbackCrop[2], 0.0001)) * 100}%`,
    height: `${(1 / Math.max(fallbackCrop[3], 0.0001)) * 100}%`,
    maxWidth: 'none',
    maxHeight: 'none',
    objectFit: 'fill',
  } : {};

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
        className={cn(
          "absolute opacity-0 pointer-events-none", 
          useVideoFallback && "opacity-100",
          className?.includes('fixed') || className?.includes('w-screen') ? "w-full h-full object-fill" : ""
        )}
        style={fallbackStyle}
        onLoadedData={(e) => handleVideoReady(e.currentTarget)}
        onEnded={() => !loop && onCompleteRef.current?.()}
        onError={() => { setLoading(false); onErrorRef.current?.(new Error('Load failed')); }}
      />
      {!useVideoFallback && (
        <canvas 
          ref={canvasRef} 
          className={cn(
            "w-full h-full pointer-events-none",
            className?.includes('fixed') || className?.includes('w-screen') ? "object-fill" : "object-contain"
          )}
          style={{ opacity: webglPainted ? 1 : 0 }}
        />
      )}
    </div>
  );
};

export default VAPPlayer;