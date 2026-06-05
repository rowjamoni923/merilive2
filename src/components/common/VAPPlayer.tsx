import React, { useRef, useEffect, useState, useCallback } from 'react';
import { cn } from '@/lib/utils';
import { normalizePublicMediaUrl } from '@/lib/cdnImage';
import { normalizeGiftMediaUrl } from '@/utils/giftMediaUrl';
import { ensureAudioUnlocked } from '@/utils/audioUnlock';
import { detectVapLayout, isLikelyVapCompositeSize, type VapLayout } from '@/utils/vapDetection';
import { hardenVideoElementForNative } from '@/utils/videoNativeHardening';
import { observeSharedElement } from '@/utils/nativePerformance';

let activeVapCount = 0;
const MAX_ACTIVE_VAPS = 3;

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
  isVapx?: number;     // is vapx format
  orien?: number;      // orientation
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
}

type VideoFrameCallbackVideo = HTMLVideoElement & {
  requestVideoFrameCallback?: (callback: () => void) => number;
  cancelVideoFrameCallback?: (handle: number) => void;
};

const getAutoVapRects = (video: HTMLVideoElement) => {
  const layout = detectVapLayout(video) || 'alpha-right';
  switch (layout) {
    case 'alpha-left': return { rgbRect: [0.5, 0, 0.5, 1], alphaRect: [0, 0, 0.5, 1] };
    case 'alpha-right': return { rgbRect: [0, 0, 0.5, 1], alphaRect: [0.5, 0, 0.5, 1] };
    case 'alpha-top': return { rgbRect: [0, 0.5, 1, 0.5], alphaRect: [0, 0, 1, 0.5] };
    case 'alpha-bottom': return { rgbRect: [0, 0, 1, 0.5], alphaRect: [0, 0.5, 1, 0.5] };
    default: return { rgbRect: [0, 0, 0.5, 1], alphaRect: [0.5, 0, 0.5, 1] };
  }
};

const shouldUsePerformanceVideoFallback = (video: HTMLVideoElement, cfg: VAPConfig | null): boolean => {
  if (cfg) return false;
  const pixels = video.videoWidth * video.videoHeight;
  const coarsePointer = typeof window !== 'undefined' && window.matchMedia?.('(pointer: coarse)').matches;
  const cores = typeof navigator !== 'undefined' ? navigator.hardwareConcurrency || 4 : 4;
  return pixels >= 10_000_000 || (coarsePointer && cores <= 2 && pixels >= 5_000_000);
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
  const containerRef = useRef<HTMLDivElement>(null);
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
  const [fallbackCrop, setFallbackCrop] = useState<[number, number, number, number]>([0, 0, 0.5, 1]);
  const [useVideoFallback, setUseVideoFallback] = useState(false);
  const [webglPainted, setWebglPainted] = useState(false);
  const [isVisible, setIsVisible] = useState(true);
  const isVisibleRef = useRef(true);
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

  // Use Shared Intersection Observer for performance
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    
    return observeSharedElement('vap-player', el, (entry) => {
      const visible = entry.isIntersecting;
      setIsVisible(visible);
      isVisibleRef.current = visible;
      
      // If became visible and we were rendering, ensure we resume
      if (visible && videoRef.current && !videoRef.current.paused && !animationRef.current) {
        // The render loop will restart via the video event listeners or manual trigger
      }
    });
  }, []);

  useEffect(() => {
    activeVapCount++;
    return () => {
      activeVapCount = Math.max(0, activeVapCount - 1);
    };
  }, []);

  useEffect(() => {
    onLoadRef.current = onLoad;
    onErrorRef.current = onError;
    onCompleteRef.current = onComplete;
  }, [onLoad, onError, onComplete]);

  useEffect(() => { useVideoFallbackRef.current = useVideoFallback; }, [useVideoFallback]);
  
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    video.volume = Math.max(0, Math.min(1, volume));
    video.muted = muted;
  }, [volume, muted, resolvedSrc]);

  useEffect(() => {
    let cancelled = false;
    initializedRef.current = false;
    completedRef.current = false;
    lastVideoTimeRef.current = -1;
    webglPaintedRef.current = false;
    useVideoFallbackRef.current = false;
    setConfig(null);
    setConfigReady(false);
    setError(null);
    setLoading(true);
    setWebglPainted(false);
    setUseVideoFallback(false);

    if (resolvedConfigSrc) {
      fetch(resolvedConfigSrc)
        .then(res => res.json())
        .then(data => {
          if (cancelled) return;
          const configData = data.info || data;
          // Validate required properties to avoid crashes
          if (configData && configData.rgbFrame && configData.aFrame) {
            setConfig(configData);
          } else {
            console.warn('[VAPPlayer] Invalid config object:', configData);
            setConfig(null);
          }
        })
        .catch(err => {
          console.warn('[VAPPlayer] Config load failed, using defaults:', err);
          setConfig(null);
        })
        .finally(() => {
          if (!cancelled) setConfigReady(true);
        });
    } else {
      const jsonPath = resolvedSrc.replace(/\.(mp4|webm)$/i, '.json');
      fetch(jsonPath)
        .then(res => res.ok ? res.json() : Promise.reject())
        .then(data => {
          if (cancelled) return;
          const configData = data.info || data;
          if (configData && configData.rgbFrame && configData.aFrame) {
            setConfig(configData);
          } else {
            setConfig(null);
          }
        })
        .catch(() => setConfig(null))
        .finally(() => {
          if (!cancelled) setConfigReady(true);
        });
    }

    return () => { cancelled = true; };
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
        
        // Tencent VAP official shader outputs straight RGBA:
        //   vec4(rgbColor.r, rgbColor.g, rgbColor.b, alphaColor.r)
        // Do NOT premultiply rgb here. Canvas/WebGL compositing handles alpha;
        // multiplying again makes dark VAP gifts almost invisible.
        // Alpha is derived from the R channel (standard for VAP).
        float alpha = alphaColor.r;
        gl_FragColor = vec4(rgbColor.rgb, alpha);
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

    if (shouldUsePerformanceVideoFallback(video, cfg) || activeVapCount > MAX_ACTIVE_VAPS) {
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
      premultipliedAlpha: false, // Tencent VAP uses straight-alpha output
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
      canvas.width = cfg.w; 
      canvas.height = cfg.h;
      // Force container to be full screen if specified or in full-screen contexts
      if (className?.includes('fixed') || className?.includes('absolute inset-0')) {
        canvas.style.width = '100vw';
        canvas.style.height = '100vh';
        canvas.style.objectFit = 'contain';
      }

    } else {
      const layout = detectVapLayout(video) || 'alpha-right';
      ({ rgbRect, alphaRect } = getAutoVapRects(video));
      const isVertical = layout === 'alpha-top' || layout === 'alpha-bottom';
      canvas.width = (isVertical ? videoWidth : videoWidth / 2); 
      canvas.height = (isVertical ? videoHeight / 2 : videoHeight);
      
      // Force container to be full screen if it's an overlay
      if (className?.includes('fixed') || className?.includes('absolute inset-0')) {
        canvas.style.width = '100vw';
        canvas.style.height = '100vh';
        canvas.style.objectFit = 'contain';
      }

    }

    setFallbackCrop(rgbRect as [number, number, number, number]);
    gl.uniform4fv(gl.getUniformLocation(program, 'u_rgbRect'), rgbRect);
    gl.uniform4fv(gl.getUniformLocation(program, 'u_alphaRect'), alphaRect);
    // Render one VAP frame into the canvas; the browser will composite the
    // canvas over the page. Internal WebGL blending would premultiply/darken
    // Tencent VAP frames a second time, so keep it disabled here.
    gl.disable(gl.BLEND);

    const render = () => {
      if (useVideoFallbackRef.current || !mountedRef.current || !isVisibleRef.current) return;
      const v = videoRef.current;
      if (!v) return;

      if (!v.paused && !v.ended && v.readyState >= 2 && v.currentTime !== lastVideoTimeRef.current) {
        try {
          lastVideoTimeRef.current = v.currentTime;
          gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, v);
          gl.viewport(0, 0, canvas.width, canvas.height);
          gl.clear(gl.COLOR_BUFFER_BIT);
          gl.drawArrays(gl.TRIANGLES, 0, 6);
          if (!webglPaintedRef.current) {
            webglPaintedRef.current = true;
            setWebglPainted(true);
          }
        } catch (e) {
          setUseVideoFallback(true);
          return;
        }
      }

      if (v.ended && !loop) return;

      const frameVideo = v as VideoFrameCallbackVideo;
      if (typeof frameVideo.requestVideoFrameCallback === 'function') {
        frameCallbackModeRef.current = 'rvfc';
        animationRef.current = frameVideo.requestVideoFrameCallback(render);
      } else {
        frameCallbackModeRef.current = 'raf';
        animationRef.current = requestAnimationFrame(render);
      }
    };

    if (autoPlay) {
      void (async () => {
        try {
          const v = videoRef.current;
          if (!v || !mountedRef.current) return;

          const needsUnlock = !muted || !!soundUrl;
          if (needsUnlock) {
            // Only wait for unlock if we actually need to play sound
            await ensureAudioUnlocked();
          }

          if (!mountedRef.current || !videoRef.current) return;
          
          if (!muted && soundUrl) {
            console.log('[VAPPlayer] 🔊 Playing separate sound:', soundUrl.split('/').pop());
            const { playSoundUrl } = await import('@/utils/soundPlayer');
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
          try {
            await videoRef.current.play();
          } catch (playErr) {
            console.warn('[VAPPlayer] Autoplay blocked, retrying muted:', playErr);
            videoRef.current.muted = true;
            await videoRef.current.play().catch(() => {});
          }
        } catch (err) {
          console.error('[VAPPlayer] Play sequence failed:', err);
        }
      })();
    }

    render();
    setLoading(false);
    onLoadRef.current?.();
  }, [autoPlay, createShaders, muted, volume, loop, soundUrl]);

  const handleVideoReady = useCallback((video: HTMLVideoElement) => {
    if (resolvedConfigSrc && !configReady) return;
    if (initializedRef.current || !video.videoWidth) return;
    
    // Harden video for mobile autoplay / inline play
    hardenVideoElementForNative(video, { muted: video.muted });
    
    initializedRef.current = true;
    const isComposite = !!config || isLikelyVapCompositeSize(video.videoWidth, video.videoHeight);
    
    // Safety completion timer for non-looping VAP
    if (!loop && video.duration > 0) {
      if (completionTimerRef.current) clearTimeout(completionTimerRef.current);
      completionTimerRef.current = setTimeout(() => {
        if (mountedRef.current && !completedRef.current) {
          console.warn('[VAPPlayer] ⚠️ Safety timer triggered for', src.split('/').pop());
          completedRef.current = true;
          onCompleteRef.current?.();
        }
      }, (video.duration * 1000) + 1500); // 1.5s padding
    }

    if (!isComposite) {
      console.log('[VAPPlayer] Not a composite VAP, using native video fallback');
      setFallbackCrop([0, 0, 1, 1]);
      setUseVideoFallback(true);
      setLoading(false);
      onLoadRef.current?.();
      return;
    }
    initWebGL(video, config);
  }, [config, configReady, initWebGL, loop, resolvedConfigSrc, src]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !configReady || initializedRef.current || !video.videoWidth) return;
    handleVideoReady(video);
  }, [configReady, config, handleVideoReady]);

  useEffect(() => {
    const cleanupVideo = videoRef.current as VideoFrameCallbackVideo | null;
    return () => {
      if (completionTimerRef.current) clearTimeout(completionTimerRef.current);
      if (soundHandleRef.current) {
        soundHandleRef.current.stop();
        soundHandleRef.current = null;
      }
      if (animationRef.current !== null) {
        if (frameCallbackModeRef.current === 'rvfc' && cleanupVideo) {
          cleanupVideo.cancelVideoFrameCallback?.(animationRef.current);
        } else {
          cancelAnimationFrame(animationRef.current);
        }
      }
    };
  }, []);

  if (error) return <div className={cn("bg-transparent", className)} />;

  return (
    <div ref={containerRef} className={cn("relative flex items-center justify-center overflow-hidden", className)}>
      {loading && <div className="absolute inset-0 bg-transparent" />}
      <video
        ref={videoRef}
        src={resolvedSrc}
        autoPlay={autoPlay}
        loop={loop}
        muted={muted}
        preload="auto"
        playsInline
        crossOrigin="anonymous"
        className={cn("absolute opacity-0 pointer-events-none", useVideoFallback && "relative opacity-100 w-full h-full object-cover")}
        style={useVideoFallback ? {
          objectPosition: `${-(fallbackCrop[0] * 100 / (1 - fallbackCrop[2] || 1))}% ${-(fallbackCrop[1] * 100 / (1 - fallbackCrop[3] || 1))}%`,
          width: `${(1 / (fallbackCrop[2] || 0.5)) * 100}%`,
          height: `${(1 / (fallbackCrop[3] || 1)) * 100}%`,
          maxWidth: 'none',
          maxHeight: 'none'
        } : {}}
        onLoadedData={(e) => handleVideoReady(e.currentTarget)}
        onEnded={() => !loop && onCompleteRef.current?.()}
        onError={() => { setLoading(false); onErrorRef.current?.(new Error('Load failed')); }}
      />
      {!useVideoFallback && (
        <canvas 
          ref={canvasRef} 
          className="w-full h-full object-contain pointer-events-none"
          style={{ opacity: webglPainted ? 1 : 0 }}
        />
      )}
    </div>
  );
};

export default VAPPlayer;