import React, { useRef, useEffect, useState, useCallback } from 'react';
import { cn } from '@/lib/utils';
import { normalizePublicMediaUrl } from '@/lib/cdnImage';
import { normalizeGiftMediaUrl } from '@/utils/giftMediaUrl';
import { detectVapLayout, isLikelyVapCompositeSize } from '@/utils/vapDetection';
import { hardenVideoElementForNative, cleanupVideoHardening } from '@/utils/videoNativeHardening';

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
}

interface VAPPlayerProps {
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
  const layout = detectVapLayout(video);
  if (layout === 'alpha-top' || layout === 'alpha-bottom') {
    // Top-Bottom Stacked
    // If layout is alpha-top, then Alpha is in [0, 0, 1, 0.5] and RGB is in [0, 0.5, 1, 0.5]
    if (layout === 'alpha-top') return { rgbRect: [0, 0.5, 1, 0.5], alphaRect: [0, 0, 1, 0.5] };
    // If layout is alpha-bottom, then RGB is in [0, 0, 1, 0.5] and Alpha is in [0, 0.5, 1, 0.5]
    return { rgbRect: [0, 0, 1, 0.5], alphaRect: [0, 0.5, 1, 0.5] };
  }
  // Side-by-Side
  // If layout is alpha-left, then Alpha is in [0, 0, 0.5, 1] and RGB is in [0.5, 0, 0.5, 1]
  if (layout === 'alpha-left') return { rgbRect: [0.5, 0, 0.5, 1], alphaRect: [0, 0, 0.5, 1] };
  // If layout is alpha-right, then RGB is in [0, 0, 0.5, 1] and Alpha is in [0.5, 0, 0.5, 1]
  return { rgbRect: [0, 0, 0.5, 1], alphaRect: [0.5, 0, 0.5, 1] };
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
  const glRef = useRef<WebGLRenderingContext | null>(null);
  const animationRef = useRef<number | null>(null);
  const mountedRef = useRef(true);
  const initializedRef = useRef(false);
  const [config, setConfig] = useState<VAPConfig | null>(null);
  const [configReady, setConfigReady] = useState(false);
  const [webglPainted, setWebglPainted] = useState(false);

  const onLoadRef = useRef(onLoad);
  const onCompleteRef = useRef(onComplete);
  const onErrorRef = useRef(onError);

  useEffect(() => {
    onLoadRef.current = onLoad;
    onCompleteRef.current = onComplete;
    onErrorRef.current = onError;
  }, [onLoad, onComplete, onError]);

  useEffect(() => {
    mountedRef.current = true;
    return () => { 
      mountedRef.current = false;
      if (videoRef.current) cleanupVideoHardening(videoRef.current);
    };
  }, []);

  // Fetch config if available
  useEffect(() => {
    let cancelled = false;
    setConfigReady(false);

    const fetchConfig = async () => {
      try {
        const path = resolvedConfigSrc || resolvedSrc.replace(/\.(mp4|webm)$/i, '.json');
        const res = await fetch(path);
        if (res.ok) {
          const data = await res.json();
          if (!cancelled) setConfig(data.info || data);
        }
      } catch (e) {
        if (!cancelled) setConfig(null);
      } finally {
        if (!cancelled) setConfigReady(true);
      }
    };

    fetchConfig();
    return () => { cancelled = true; };
  }, [resolvedSrc, resolvedConfigSrc]);

  const createShaders = (gl: WebGLRenderingContext) => {
    const vs = `
      attribute vec2 a_position;
      attribute vec2 a_texCoord;
      varying vec2 v_texCoord;
      void main() {
        gl_Position = vec4(a_position, 0.0, 1.0);
        v_texCoord = a_texCoord;
      }
    `;

    const fs = `
      precision highp float;
      varying vec2 v_texCoord;
      uniform sampler2D u_texture;
      uniform vec4 u_rgbRect;
      uniform vec4 u_alphaRect;
      void main() {
        vec2 rgbCoord = vec2(u_rgbRect.x + v_texCoord.x * u_rgbRect.z, u_rgbRect.y + v_texCoord.y * u_rgbRect.w);
        vec2 alphaCoord = vec2(u_alphaRect.x + v_texCoord.x * u_alphaRect.z, u_alphaRect.y + v_texCoord.y * u_alphaRect.w);
        vec4 rgbColor = texture2D(u_texture, rgbCoord);
        vec4 alphaColor = texture2D(u_texture, alphaCoord);
        float alphaValue = max(alphaColor.r, max(alphaColor.g, alphaColor.b));
        // Use premultiplied alpha for cleaner transparency on all browsers
        gl_FragColor = vec4(rgbColor.rgb * alphaValue, alphaValue);
      }
    `;

    const createShader = (source: string, type: number) => {
      const shader = gl.createShader(type)!;
      gl.shaderSource(shader, source);
      gl.compileShader(shader);
      if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
        console.error('[VAPPlayer] Shader compile error:', gl.getShaderInfoLog(shader));
      }
      return shader;
    };

    const program = gl.createProgram()!;
    gl.attachShader(program, createShader(vs, gl.VERTEX_SHADER));
    gl.attachShader(program, createShader(fs, gl.FRAGMENT_SHADER));
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      console.error('[VAPPlayer] Program link error:', gl.getProgramInfoLog(program));
    }
    return program;
  };

  const render = useCallback(() => {
    if (!mountedRef.current) return;
    const gl = glRef.current;
    const v = videoRef.current;
    const canvas = canvasRef.current;
    if (!gl || !v || !canvas) return;

    if (v.readyState >= 2) {
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, v);
      gl.viewport(0, 0, canvas.width, canvas.height);
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.drawArrays(gl.TRIANGLES, 0, 6);
      if (!webglPainted) setWebglPainted(true);
    }

    if (!v.ended || loop) {
      if ((v as any).requestVideoFrameCallback) {
        animationRef.current = (v as any).requestVideoFrameCallback(render);
      } else {
        animationRef.current = requestAnimationFrame(render);
      }
    }
  }, [loop, webglPainted]);

  const init = useCallback(async (video: HTMLVideoElement) => {
    if (initializedRef.current || !video.videoWidth) return;
    initializedRef.current = true;

    const canvas = canvasRef.current;
    if (!canvas) return;

    // Use premultipliedAlpha: true as we handle it in the shader for professional look
    const gl = canvas.getContext('webgl', { 
      alpha: true, 
      premultipliedAlpha: true,
      antialias: true,
      preserveDrawingBuffer: false
    });

    if (!gl) {
      onErrorRef.current?.(new Error('WebGL not supported'));
      return;
    }
    glRef.current = gl;

    const program = createShaders(gl);
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
    if (config) {
      rgbRect = [config.rgbFrame[0]/video.videoWidth, config.rgbFrame[1]/video.videoHeight, config.rgbFrame[2]/video.videoWidth, config.rgbFrame[3]/video.videoHeight];
      alphaRect = [config.aFrame[0]/video.videoWidth, config.aFrame[1]/video.videoHeight, config.aFrame[2]/video.videoWidth, config.aFrame[3]/video.videoHeight];
      canvas.width = config.w;
      canvas.height = config.h;
    } else {
      const { rgbRect: r, alphaRect: a } = getAutoVapRects(video);
      rgbRect = r; alphaRect = a;
      const layout = detectVapLayout(video);
      const isVertical = layout === 'alpha-top' || layout === 'alpha-bottom';
      canvas.width = isVertical ? video.videoWidth : video.videoWidth / 2;
      canvas.height = isVertical ? video.videoHeight / 2 : video.videoHeight;
    }

    gl.uniform4fv(gl.getUniformLocation(program, 'u_rgbRect'), rgbRect);
    gl.uniform4fv(gl.getUniformLocation(program, 'u_alphaRect'), alphaRect);
    gl.clearColor(0, 0, 0, 0);

    // Play video
    if (autoPlay) {
      hardenVideoElementForNative(video, { muted: muted || !!soundUrl });
      try {
        if (!muted && soundUrl) {
          const { playSoundUrl } = await import('@/utils/soundPlayer');
          playSoundUrl(soundUrl, { volume, loop });
        }
        await video.play();
      } catch (e) {
        // Fallback to muted if unmuted fails
        video.muted = true;
        await video.play().catch(() => {});
      }
    }

    render();
    onLoadRef.current?.();
  }, [config, autoPlay, muted, volume, loop, soundUrl, render]);

  useEffect(() => {
    if (configReady && videoRef.current && videoRef.current.videoWidth) {
      init(videoRef.current);
    }
  }, [configReady, init]);

  useEffect(() => {
    return () => {
      if (animationRef.current) {
        if (videoRef.current && (videoRef.current as any).cancelVideoFrameCallback) {
          (videoRef.current as any).cancelVideoFrameCallback(animationRef.current);
        } else {
          cancelAnimationFrame(animationRef.current);
        }
      }
      if (glRef.current) {
        const gl = glRef.current;
        const ext = gl.getExtension('WEBGL_lose_context');
        if (ext) ext.loseContext();
      }
    };
  }, []);

  return (
    <div className={cn("relative flex items-center justify-center overflow-hidden w-full h-full", className)}>
      <video
        ref={videoRef}
        src={resolvedSrc}
        preload="auto"
        playsInline
        crossOrigin="anonymous"
        className="absolute opacity-0 pointer-events-none"
        onLoadedData={(e) => init(e.currentTarget)}
        onEnded={() => !loop && onCompleteRef.current?.()}
      />
      <canvas 
        ref={canvasRef} 
        className="w-full h-full object-contain pointer-events-none"
        style={{ 
          opacity: webglPainted ? 1 : 0,
          transition: 'opacity 0.2s ease-in'
        }}
      />
    </div>
  );
};

export default VAPPlayer;