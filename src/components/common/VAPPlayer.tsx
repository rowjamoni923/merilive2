import React, { useRef, useEffect, useState, useCallback } from 'react';
import { cn } from '@/lib/utils';
import { normalizePublicMediaUrl } from '@/lib/cdnImage';
import { normalizeGiftMediaUrl } from '@/utils/giftMediaUrl';
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
  // Professional VAP gifts (like the uploaded HHI file: 1500×1334) need the
  // WebGL alpha pass. Falling back just because the source is ~2MP crops the
  // RGB half and loses transparency, which makes full-screen gifts look broken.
  // Only bypass WebGL for truly extreme assets on very weak devices.
  return pixels >= 6_000_000 || (coarsePointer && cores <= 2 && pixels >= 3_000_000);
};

/**
 * VAP (Video Animation Player) Component
 * Plays transparent video animations using alpha channel blending
 * Format originally developed by Tencent for efficient gift animations
 * 
 * How it works:
 * 1. VAP videos contain RGB and Alpha data side by side in a single video
 * 2. The alpha channel is stored as grayscale in a separate region
 * 3. WebGL shader combines RGB with Alpha to create transparency
 */
const VAPPlayer: React.FC<VAPPlayerProps> = ({
  src,
  configSrc,
  className,
  loop = true,
  autoPlay = true,
  muted = false,
  volume = 0.7,
  onLoad,
  onError,
  onComplete,
}) => {
  const resolvedSrc = React.useMemo(() => normalizeGiftMediaUrl(src) || normalizePublicMediaUrl(src) || src, [src]);
  const resolvedConfigSrc = React.useMemo(() => normalizeGiftMediaUrl(configSrc || '') || normalizePublicMediaUrl(configSrc || '') || configSrc, [configSrc]);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const glRef = useRef<WebGLRenderingContext | null>(null);
  const animationRef = useRef<number | null>(null);
  const frameCallbackModeRef = useRef<'raf' | 'rvfc'>('raf');
  const lastVideoTimeRef = useRef<number>(-1);
  const initializedRef = useRef(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [config, setConfig] = useState<VAPConfig | null>(null);
  const [fallbackCrop, setFallbackCrop] = useState<[number, number, number, number]>([0.5, 0, 0.5, 1]);
  const [useVideoFallback, setUseVideoFallback] = useState(false);
  const webglPaintedRef = useRef(false);
  const completedRef = useRef(false);
  const useVideoFallbackRef = useRef(false);

  // Pkg326 — ref-wrap callbacks (declared early so initWebGL/useEffect can read them).
  const onLoadRef = useRef(onLoad);
  const onErrorRef = useRef(onError);
  const onCompleteRef = useRef(onComplete);
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
  }, [volume, resolvedSrc]);

  // Default config for standard VAP format
  const defaultConfig: VAPConfig = {
    v: 2,
    f: 60,
    w: 400,
    h: 400,
    fps: 30,
    videoW: 800,
    videoH: 400,
    aFrame: [400, 0, 400, 400],  // Alpha on right half
    rgbFrame: [0, 0, 400, 400],   // RGB on left half
    isVapx: 0,
    orien: 0,
  };

  // Load config
  useEffect(() => {
    if (resolvedConfigSrc) {
      fetch(resolvedConfigSrc)
        .then(res => res.json())
        .then(data => {
          setConfig(data.info || data);
        })
        .catch(err => {
          console.warn('[VAPPlayer] Config load failed, using defaults:', err);
          setConfig(defaultConfig);
        });
    } else {
      // Try to load config from same path with .json extension
      const jsonPath = resolvedSrc.replace(/\.(mp4|webm)$/i, '.json');
      fetch(jsonPath)
        .then(res => {
          if (!res.ok) throw new Error('Config not found');
          return res.json();
        })
        .then(data => {
          setConfig(data.info || data);
        })
        .catch(() => {
          // Use auto-detect for standard side-by-side format
          setConfig(null); // Will use auto-detection
        });
    }
  }, [resolvedSrc, resolvedConfigSrc]);

  // WebGL shader for alpha blending
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

    const fragmentShaderSource = `
      precision highp float;
      varying vec2 v_texCoord;
      uniform sampler2D u_texture;
      uniform vec4 u_rgbRect;   // x, y, width, height (normalized)
      uniform vec4 u_alphaRect; // x, y, width, height (normalized)
      
      void main() {
        // Sample RGB from left portion
        vec2 rgbCoord = vec2(
          u_rgbRect.x + v_texCoord.x * u_rgbRect.z,
          u_rgbRect.y + v_texCoord.y * u_rgbRect.w
        );
        // Professional VAP 1500x1334 assets often have compression bleed at the
        // center seam. Inset sampling slightly to stay away from the border.
        float edgeInset = 0.0005; 
        rgbCoord.x = clamp(rgbCoord.x, u_rgbRect.x + edgeInset, u_rgbRect.x + u_rgbRect.z - edgeInset);
        vec4 rgbColor = texture2D(u_texture, rgbCoord);
        
        // Sample Alpha from right portion (grayscale)
        vec2 alphaCoord = vec2(
          u_alphaRect.x + v_texCoord.x * u_alphaRect.z,
          u_alphaRect.y + v_texCoord.y * u_alphaRect.w
        );
        alphaCoord.x = clamp(alphaCoord.x, u_alphaRect.x + edgeInset, u_alphaRect.x + u_alphaRect.z - edgeInset);
        vec4 alphaColor = texture2D(u_texture, alphaCoord);
        
        // White matte = visible, black matte = transparent.
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

    const vertexShader = compileShader(vertexShaderSource, gl.VERTEX_SHADER);
    const fragmentShader = compileShader(fragmentShaderSource, gl.FRAGMENT_SHADER);

    if (!vertexShader || !fragmentShader) return null;

    const program = gl.createProgram();
    if (!program) return null;

    gl.attachShader(program, vertexShader);
    gl.attachShader(program, fragmentShader);
    gl.linkProgram(program);

    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      console.error('[VAPPlayer] Program link error:', gl.getProgramInfoLog(program));
      return null;
    }

    return program;
  }, []);

  // Initialize WebGL
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
      antialias: false,
      depth: false,
      stencil: false,
      premultipliedAlpha: false,
      preserveDrawingBuffer: false,
      powerPreference: 'high-performance',
    });

    if (!gl) {
      console.warn('[VAPPlayer] WebGL not supported; using video fallback');
      const { rgbRect } = getAutoVapRects(video);
      setFallbackCrop(rgbRect as [number, number, number, number]);
      setUseVideoFallback(true);
      setLoading(false);
      onLoadRef.current?.();
      return;
    }

    glRef.current = gl;

    const program = createShaders(gl);
    if (!program) {
      console.warn('[VAPPlayer] Shader compilation failed; using video fallback');
      const { rgbRect } = getAutoVapRects(video);
      setFallbackCrop(rgbRect as [number, number, number, number]);
      setUseVideoFallback(true);
      setLoading(false);
      onLoadRef.current?.();
      return;
    }

    gl.useProgram(program);

    // Set up geometry (full-screen quad)
    const positions = new Float32Array([
      -1, -1,  1, -1,  -1, 1,
      -1, 1,   1, -1,   1, 1,
    ]);
    const texCoords = new Float32Array([
      0, 1,  1, 1,  0, 0,
      0, 0,  1, 1,  1, 0,
    ]);

    const positionBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, positions, gl.STATIC_DRAW);

    const positionLocation = gl.getAttribLocation(program, 'a_position');
    gl.enableVertexAttribArray(positionLocation);
    gl.vertexAttribPointer(positionLocation, 2, gl.FLOAT, false, 0, 0);

    const texCoordBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, texCoordBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, texCoords, gl.STATIC_DRAW);

    const texCoordLocation = gl.getAttribLocation(program, 'a_texCoord');
    gl.enableVertexAttribArray(texCoordLocation);
    gl.vertexAttribPointer(texCoordLocation, 2, gl.FLOAT, false, 0, 0);

    const videoWidth = video.videoWidth;
    const videoHeight = video.videoHeight;

    const texture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);

    // Pre-allocate texture for performance optimization
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, videoWidth, videoHeight, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);

    let rgbRect: number[], alphaRect: number[];

    if (cfg) {
      // Use config values
      rgbRect = [
        cfg.rgbFrame[0] / videoWidth,
        cfg.rgbFrame[1] / videoHeight,
        cfg.rgbFrame[2] / videoWidth,
        cfg.rgbFrame[3] / videoHeight,
      ];
      alphaRect = [
        cfg.aFrame[0] / videoWidth,
        cfg.aFrame[1] / videoHeight,
        cfg.aFrame[2] / videoWidth,
        cfg.aFrame[3] / videoHeight,
      ];
      
      canvas.width = cfg.w;
      canvas.height = cfg.h;
    } else {
      ({ rgbRect, alphaRect } = getAutoVapRects(video));
      
      canvas.width = videoWidth / 2;
      canvas.height = videoHeight;
    }

    setFallbackCrop(rgbRect as [number, number, number, number]);

    const rgbRectLocation = gl.getUniformLocation(program, 'u_rgbRect');
    const alphaRectLocation = gl.getUniformLocation(program, 'u_alphaRect');

    gl.uniform4fv(rgbRectLocation, rgbRect);
    gl.uniform4fv(alphaRectLocation, alphaRect);

    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

    // Render loop — keep RAF-ticking until the video actually produces frames.
    const render = () => {
      if (useVideoFallbackRef.current || !mountedRef.current) return;
      
      const video = videoRef.current;
      if (!video) return;

      const playing = !video.paused && !video.ended && video.readyState >= 2;
      
      // Optimization: only upload texture if the video frame actually changed.
      // This saves significant CPU/GPU on mobile when RAF runs at 120Hz but video is 30fps.
      if (playing && video.currentTime !== lastVideoTimeRef.current) {
        try {
          lastVideoTimeRef.current = video.currentTime;
          gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, gl.RGBA, gl.UNSIGNED_BYTE, video);
          gl.viewport(0, 0, canvas.width, canvas.height);
          gl.clearColor(0, 0, 0, 0);
          gl.clear(gl.COLOR_BUFFER_BIT);
          gl.drawArrays(gl.TRIANGLES, 0, 6);
          webglPaintedRef.current = true;
        } catch (err) {
          console.warn('[VAPPlayer] WebGL video texture failed; using cropped video fallback:', err);
          setUseVideoFallback(true);
          return;
        }
      }

      // If video has ended and no loop, stop the loop.
      if (video.ended && !loop) {
        animationRef.current = null;
        return;
      }

      const frameVideo = video as VideoFrameCallbackVideo;
      if (typeof frameVideo.requestVideoFrameCallback === 'function') {
        frameCallbackModeRef.current = 'rvfc';
        animationRef.current = frameVideo.requestVideoFrameCallback(render);
      } else {
        frameCallbackModeRef.current = 'raf';
        animationRef.current = requestAnimationFrame(render);
      }
    };

    // Kick autoplay (with muted retry)
    if (autoPlay) {
      const playAttempt = async () => {
        try {
          // Pre-unlock audio context for professional playback
          await ensureAudioUnlocked();
          
          if (!mountedRef.current || !videoRef.current) return;
          const v = videoRef.current;
          
          v.muted = muted;
          v.volume = Math.max(0, Math.min(1, volume));
          
          await v.play();
          console.log('[VAPPlayer] 🔊 Playing with audio');
        } catch (err) {
          console.warn('[VAPPlayer] Play with audio failed, retrying muted...', err);
          if (videoRef.current && !videoRef.current.muted) {
            videoRef.current.muted = true;
            try {
              await videoRef.current.play();
            } catch (retryErr) {
              console.error('[VAPPlayer] Muted playback also failed:', retryErr);
            }
          }
        }
      };
      playAttempt();
    }

    render();
    setLoading(false);
    onLoadRef.current?.();
  }, [autoPlay, createShaders, muted, volume, loop]);



  const handleVideoReady = useCallback((video: HTMLVideoElement) => {
    if (initializedRef.current) return;
    if (resolvedConfigSrc && !config) return;
    if (!video.videoWidth || !video.videoHeight) return;
    initializedRef.current = true;

    // Pkg424 — When the file is NOT a side-by-side composite (e.g. professional
    // portrait VAP MP4s like 1500×1624 with alpha in an embedded `data` track),
    // WebGL splitting would crop half the video. Play it as a plain full-frame
    // MP4 instead so the animation renders correctly full-screen.
    const isComposite = !!config || isLikelyVapCompositeSize(video.videoWidth, video.videoHeight);
    if (!isComposite) {
      setFallbackCrop([0, 0, 1, 1]);
      setUseVideoFallback(true);
      setLoading(false);
      webglPaintedRef.current = true;
      onLoadRef.current?.();
      return;
    }

    initWebGL(video, config);
    window.setTimeout(() => {
      if (!webglPaintedRef.current && !useVideoFallbackRef.current && video.readyState >= 2 && !video.paused) {
        // Only log if we are actually attempting to play but nothing has painted.
        console.warn('[VAPPlayer] WebGL first frame is still pending; keeping alpha-composite renderer active');
      }
    }, 5000);
  }, [config, initWebGL, resolvedConfigSrc]);

  const handleEnded = useCallback(() => {
    if (loop || completedRef.current) return;
    completedRef.current = true;
    onCompleteRef.current?.();
  }, [loop]);

  const handleVideoError = useCallback(() => {
    setError('Video load failed');
    setLoading(false);
    onErrorRef.current?.(new Error('Video load failed'));
  }, []);

  useEffect(() => {
    webglPaintedRef.current = false;
    initializedRef.current = false;
    completedRef.current = false;
    setUseVideoFallback(false);
    setLoading(true);
    setError(null);
    return () => {
      const id = animationRef.current;
      if (id !== null) {
        if (frameCallbackModeRef.current === 'rvfc') {
          try { (videoRef.current as VideoFrameCallbackVideo | null)?.cancelVideoFrameCallback?.(id); } catch { /* noop */ }
        } else {
          cancelAnimationFrame(id);
        }
      }
      animationRef.current = null;
      try { glRef.current?.getExtension('WEBGL_lose_context')?.loseContext(); } catch { /* noop */ }
      glRef.current = null;
    };
  }, [resolvedSrc]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video || video.readyState < 2) return;
    initializedRef.current = false;
    webglPaintedRef.current = false;
    handleVideoReady(video);
  }, [config, handleVideoReady]);

  if (error) {
    return (
      <div className={cn("bg-transparent", className)} aria-hidden="true" />
    );
  }

  const cropXPercent = -(fallbackCrop[0] / fallbackCrop[2]) * 100;
  const cropYPercent = -(fallbackCrop[1] / fallbackCrop[3]) * 100;
  const cropWidthPercent = (1 / fallbackCrop[2]) * 100;
  const cropHeightPercent = (1 / fallbackCrop[3]) * 100;

  return (
    <div className={cn("relative overflow-hidden", className)}>
      {loading && (
        <div className="absolute inset-0 bg-transparent" aria-hidden="true" />
      )}
      <video
        ref={videoRef}
        src={resolvedSrc}
        crossOrigin="anonymous"
        playsInline
        muted={muted}
        loop={loop}
        preload={autoPlay ? "auto" : "metadata"}
        autoPlay={autoPlay}
        controls={false}
        controlsList="nodownload nofullscreen noremoteplayback noplaybackrate"
        disablePictureInPicture
        disableRemotePlayback
        data-animation="true"
        data-decorative="true"
        className={cn(
          "absolute pointer-events-none",
          useVideoFallback ? "opacity-100" : "opacity-0"
        )}
        style={{
          left: `${cropXPercent}%`,
          top: `${cropYPercent}%`,
          width: `${cropWidthPercent}%`,
          height: `${cropHeightPercent}%`,
          objectFit: 'fill',
        }}
        onLoadedData={(e) => handleVideoReady(e.currentTarget)}
        onCanPlay={(e) => {
          const v = e.currentTarget;
          if (autoPlay && v.paused) {
            v.volume = Math.max(0, Math.min(1, volume));
            v.play().catch((err) => {
              if (!v.muted) {
                v.muted = true;
                v.play().catch(() => console.warn('[VAPPlayer] Autoplay blocked:', err));
              } else {
                console.warn('[VAPPlayer] Autoplay blocked:', err);
              }
            });
          }
        }}
        onEnded={handleEnded}
        onError={handleVideoError}
      />
      <canvas
        ref={canvasRef}
        className={cn("w-full h-full object-contain", (loading || useVideoFallback) && "opacity-0")}
        style={{ 
          display: 'block',
          background: 'transparent',
        }}
      />
    </div>
  );
};

export default VAPPlayer;
