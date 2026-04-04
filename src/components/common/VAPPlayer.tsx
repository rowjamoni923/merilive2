import React, { useRef, useEffect, useState, useCallback } from 'react';
import { cn } from '@/lib/utils';

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
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const glRef = useRef<WebGLRenderingContext | null>(null);
  const animationRef = useRef<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [config, setConfig] = useState<VAPConfig | null>(null);

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
    if (configSrc) {
      fetch(configSrc)
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
      const jsonPath = src.replace(/\.(mp4|webm)$/i, '.json');
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
  }, [src, configSrc]);

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
      precision mediump float;
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
        vec4 rgbColor = texture2D(u_texture, rgbCoord);
        
        // Sample Alpha from right portion (grayscale)
        vec2 alphaCoord = vec2(
          u_alphaRect.x + v_texCoord.x * u_alphaRect.z,
          u_alphaRect.y + v_texCoord.y * u_alphaRect.w
        );
        vec4 alphaColor = texture2D(u_texture, alphaCoord);
        
        // Use the luminance of alpha region as alpha value
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

    const gl = canvas.getContext('webgl', {
      alpha: true,
      premultipliedAlpha: false,
      preserveDrawingBuffer: false,
    });

    if (!gl) {
      setError('WebGL not supported');
      onError?.(new Error('WebGL not supported'));
      return;
    }

    glRef.current = gl;

    const program = createShaders(gl);
    if (!program) {
      setError('Shader compilation failed');
      onError?.(new Error('Shader compilation failed'));
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

    // Create texture
    const texture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);

    // Calculate normalized coordinates
    const videoWidth = video.videoWidth;
    const videoHeight = video.videoHeight;

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
      // Auto-detect: assume side-by-side (RGB left, Alpha right)
      rgbRect = [0, 0, 0.5, 1];
      alphaRect = [0.5, 0, 0.5, 1];
      
      canvas.width = videoWidth / 2;
      canvas.height = videoHeight;
    }

    const rgbRectLocation = gl.getUniformLocation(program, 'u_rgbRect');
    const alphaRectLocation = gl.getUniformLocation(program, 'u_alphaRect');

    gl.uniform4fv(rgbRectLocation, rgbRect);
    gl.uniform4fv(alphaRectLocation, alphaRect);

    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

    // Render loop
    const render = () => {
      if (!video.paused && !video.ended) {
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, video);
        gl.viewport(0, 0, canvas.width, canvas.height);
        gl.clearColor(0, 0, 0, 0);
        gl.clear(gl.COLOR_BUFFER_BIT);
        gl.drawArrays(gl.TRIANGLES, 0, 6);
      }
      animationRef.current = requestAnimationFrame(render);
    };

    render();
    setLoading(false);
    onLoad?.();

  }, [createShaders, onLoad, onError]);

  // Initialize video and WebGL
  useEffect(() => {
    if (!src) return;

    const video = document.createElement('video');
    video.crossOrigin = 'anonymous';
    video.playsInline = true;
    video.muted = muted;
    video.volume = volume;
    video.loop = loop;
    video.preload = 'auto';

    videoRef.current = video;

    video.onloadedmetadata = () => {
      initWebGL(video, config);
    };

    video.onended = () => {
      if (!loop) {
        onComplete?.();
      }
    };

    video.onerror = () => {
      setError('Video load failed');
      setLoading(false);
      onError?.(new Error('Video load failed'));
    };

    video.src = src;

    if (autoPlay) {
      video.play().catch(err => {
        console.warn('[VAPPlayer] Autoplay blocked:', err);
      });
    }

    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
      video.pause();
      video.src = '';
      videoRef.current = null;
    };
  }, [src, config, loop, autoPlay, muted, volume, initWebGL, onComplete, onError]);

  if (error) {
    return (
      <div className={cn("flex items-center justify-center bg-black/20 rounded-lg", className)}>
        <span className="text-xs text-red-400">VAP Error</span>
      </div>
    );
  }

  return (
    <div className={cn("relative", className)}>
      {loading && (
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="w-6 h-6 border-2 border-white/30 border-t-white rounded-full animate-spin" />
        </div>
      )}
      <canvas
        ref={canvasRef}
        className={cn("w-full h-full object-contain", loading && "opacity-0")}
        style={{ 
          display: 'block',
          background: 'transparent',
        }}
      />
    </div>
  );
};

export default VAPPlayer;
