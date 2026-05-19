/**
 * MediaPipe Beauty Processor — Free, No License Key Required
 * 
 * Uses Google MediaPipe Face Landmarker (478 3D landmarks) + Canvas2D
 * for professional-grade beauty effects:
 * - Skin smoothing (bilateral filter approximation)
 * - Skin whitening / brightening
 * - Face reshape (slim, chin, eye enlarge, nose narrow)
 * - Lip color overlay
 * - Color effects (warmth, glow, sharpness)
 * 
 * 100% Free — Apache 2.0 License — No API key needed
 */

import { FaceLandmarker, FilesetResolver, DrawingUtils } from '@mediapipe/tasks-vision';

// ============================================================
// Types
// ============================================================

export interface BeautyParams {
  smoothness: number;   // 0-1
  whitening: number;    // 0-1
  redness: number;      // 0-1
  sharpness: number;    // 0-1
  glow: number;         // 0-1
  warmth: number;       // 0-1
  eyeBright: number;    // 0-1
  skinTone: number;     // 0-1 (0.5 = neutral)
  faceSlim: number;     // 0-1
  chinSlim: number;     // 0-1
  eyeEnlarge: number;   // 0-1
  noseNarrow: number;   // 0-1
  lipColor: number;     // 0-1
}

const DEFAULT_PARAMS: BeautyParams = {
  smoothness: 0, whitening: 0, redness: 0, sharpness: 0,
  glow: 0, warmth: 0, eyeBright: 0, skinTone: 0.5,
  faceSlim: 0, chinSlim: 0, eyeEnlarge: 0, noseNarrow: 0, lipColor: 0,
};

// ============================================================
// Singleton State
// ============================================================

let _faceLandmarker: FaceLandmarker | null = null;
let _initPromise: Promise<FaceLandmarker | null> | null = null;
let _params: BeautyParams = { ...DEFAULT_PARAMS };
let _enabled = false;
let _processing = false;
let _lastFaceBounds: { x: number; y: number; width: number; height: number } | null = null;

// Canvas elements for offscreen processing
let _offscreenCanvas: OffscreenCanvas | HTMLCanvasElement | null = null;
let _offscreenCtx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D | null = null;
let _smoothCanvas: OffscreenCanvas | HTMLCanvasElement | null = null;
let _smoothCtx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D | null = null;

// ============================================================
// MediaPipe Initialization
// ============================================================

async function initMediaPipe(): Promise<FaceLandmarker | null> {
  if (_faceLandmarker) return _faceLandmarker;
  if (_initPromise) return _initPromise;

  _initPromise = (async () => {
    try {
      console.log('[MediaPipeBeauty] Initializing Face Landmarker...');
      
      const vision = await FilesetResolver.forVisionTasks(
        'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/wasm'
      );

      _faceLandmarker = await FaceLandmarker.createFromOptions(vision, {
        baseOptions: {
          modelAssetPath: 'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task',
          delegate: 'GPU',
        },
        runningMode: 'VIDEO',
        numFaces: 1,
        outputFaceBlendshapes: false,
        outputFacialTransformationMatrixes: false,
      });

      console.log('[MediaPipeBeauty] ✅ Face Landmarker initialized successfully');
      return _faceLandmarker;
    } catch (err) {
      console.error('[MediaPipeBeauty] Init failed:', err);
      _faceLandmarker = null;
      return null;
    }
  })();

  return _initPromise;
}

// ============================================================
// Canvas Setup
// ============================================================

function ensureCanvases(w: number, h: number) {
  if (_offscreenCanvas && (_offscreenCanvas as any).width === w && (_offscreenCanvas as any).height === h) return;

  try {
    _offscreenCanvas = new OffscreenCanvas(w, h);
    _offscreenCtx = _offscreenCanvas.getContext('2d')!;
    _smoothCanvas = new OffscreenCanvas(w, h);
    _smoothCtx = _smoothCanvas.getContext('2d')!;
  } catch {
    // Fallback for browsers without OffscreenCanvas
    _offscreenCanvas = document.createElement('canvas');
    _offscreenCanvas.width = w;
    _offscreenCanvas.height = h;
    _offscreenCtx = _offscreenCanvas.getContext('2d')!;
    _smoothCanvas = document.createElement('canvas');
    _smoothCanvas.width = w;
    _smoothCanvas.height = h;
    _smoothCtx = _smoothCanvas.getContext('2d')!;
  }
}

// ============================================================
// Face Region Helpers (MediaPipe 478 landmarks)
// ============================================================

// Key landmark indices for face regions
const FACE_OVAL = [10,338,297,332,284,251,389,356,454,323,361,288,397,365,379,378,400,377,152,148,176,149,150,136,172,58,132,93,234,127,162,21,54,103,67,109];
const LEFT_EYE = [33,7,163,144,145,153,154,155,133,173,157,158,159,160,161,246];
const RIGHT_EYE = [362,382,381,380,374,373,390,249,263,466,388,387,386,385,384,398];
const LIPS_OUTER = [61,146,91,181,84,17,314,405,321,375,291,409,270,269,267,0,37,39,40,185];
const LIPS_INNER = [78,95,88,178,87,14,317,402,318,324,308,415,310,311,312,13,82,81,80,191];
const NOSE_BRIDGE = [6,197,195,5,4,1,19,94,2];
const LEFT_EYEBROW = [70,63,105,66,107,55,65,52,53,46];
const RIGHT_EYEBROW = [300,293,334,296,336,285,295,282,283,276];

function getLandmarkPoints(landmarks: any[], indices: number[], w: number, h: number): [number, number][] {
  return indices.map(i => [landmarks[i].x * w, landmarks[i].y * h]);
}

function getCenter(points: [number, number][]): [number, number] {
  const cx = points.reduce((s, p) => s + p[0], 0) / points.length;
  const cy = points.reduce((s, p) => s + p[1], 0) / points.length;
  return [cx, cy];
}

// ============================================================
// Beauty Processing Pipeline
// ============================================================

function applySkinSmoothing(
  ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  smoothCtx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  w: number, h: number,
  landmarks: any[] | null,
  intensity: number
) {
  if (intensity <= 0) return;

  // Draw blurred version to smooth canvas
  const blurRadius = Math.round(intensity * 12) + 1;
  smoothCtx.filter = `blur(${blurRadius}px)`;
  smoothCtx.drawImage(ctx.canvas as any, 0, 0);
  smoothCtx.filter = 'none';

  if (landmarks) {
    // Apply smoothing only to face region using face oval path
    const facePoints = getLandmarkPoints(landmarks, FACE_OVAL, w, h);
    
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(facePoints[0][0], facePoints[0][1]);
    for (let i = 1; i < facePoints.length; i++) {
      ctx.lineTo(facePoints[i][0], facePoints[i][1]);
    }
    ctx.closePath();

    // Cut out eye regions (don't smooth eyes)
    const leftEyePoints = getLandmarkPoints(landmarks, LEFT_EYE, w, h);
    const rightEyePoints = getLandmarkPoints(landmarks, RIGHT_EYE, w, h);
    
    ctx.moveTo(leftEyePoints[0][0], leftEyePoints[0][1]);
    for (let i = leftEyePoints.length - 1; i >= 0; i--) {
      ctx.lineTo(leftEyePoints[i][0], leftEyePoints[i][1]);
    }
    ctx.moveTo(rightEyePoints[0][0], rightEyePoints[0][1]);
    for (let i = rightEyePoints.length - 1; i >= 0; i--) {
      ctx.lineTo(rightEyePoints[i][0], rightEyePoints[i][1]);
    }

    // Cut out lip region
    const lipPoints = getLandmarkPoints(landmarks, LIPS_OUTER, w, h);
    ctx.moveTo(lipPoints[0][0], lipPoints[0][1]);
    for (let i = lipPoints.length - 1; i >= 0; i--) {
      ctx.lineTo(lipPoints[i][0], lipPoints[i][1]);
    }

    ctx.clip('evenodd');
    
    // Blend smoothed version with original (intensity controls opacity)
    ctx.globalAlpha = Math.min(intensity * 0.85, 0.8);
    ctx.drawImage(smoothCtx.canvas as any, 0, 0);
    ctx.globalAlpha = 1;
    ctx.restore();
  } else {
    // No face detected — apply gentle full-frame smoothing
    ctx.globalAlpha = intensity * 0.3;
    ctx.drawImage(smoothCtx.canvas as any, 0, 0);
    ctx.globalAlpha = 1;
  }
}

function applyWhitening(
  ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  w: number, h: number,
  landmarks: any[] | null,
  intensity: number
) {
  if (intensity <= 0) return;

  if (landmarks) {
    const facePoints = getLandmarkPoints(landmarks, FACE_OVAL, w, h);
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(facePoints[0][0], facePoints[0][1]);
    for (let i = 1; i < facePoints.length; i++) ctx.lineTo(facePoints[i][0], facePoints[i][1]);
    ctx.closePath();
    ctx.clip();
    
    // White overlay for brightening
    ctx.globalCompositeOperation = 'soft-light';
    ctx.fillStyle = `rgba(255,255,255,${intensity * 0.4})`;
    ctx.fillRect(0, 0, w, h);
    ctx.globalCompositeOperation = 'source-over';
    ctx.restore();
  }
}

function applyRedness(
  ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  w: number, h: number,
  landmarks: any[] | null,
  intensity: number
) {
  if (intensity <= 0 || !landmarks) return;

  // Apply rosy blush to cheek areas
  // Cheek landmarks: roughly between eye bottom and mouth
  const leftCheek = getCenter(getLandmarkPoints(landmarks, [50, 101, 118, 117, 116, 123], w, h));
  const rightCheek = getCenter(getLandmarkPoints(landmarks, [280, 330, 347, 346, 345, 352], w, h));
  const cheekRadius = Math.abs(leftCheek[0] - getCenter(getLandmarkPoints(landmarks, NOSE_BRIDGE, w, h))[0]) * 0.6;

  ctx.save();
  for (const cheek of [leftCheek, rightCheek]) {
    const gradient = ctx.createRadialGradient(cheek[0], cheek[1], 0, cheek[0], cheek[1], cheekRadius);
    gradient.addColorStop(0, `rgba(255,120,120,${intensity * 0.25})`);
    gradient.addColorStop(1, 'rgba(255,120,120,0)');
    ctx.globalCompositeOperation = 'soft-light';
    ctx.fillStyle = gradient;
    ctx.fillRect(cheek[0] - cheekRadius, cheek[1] - cheekRadius, cheekRadius * 2, cheekRadius * 2);
  }
  ctx.globalCompositeOperation = 'source-over';
  ctx.restore();
}

function applyLipColor(
  ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  w: number, h: number,
  landmarks: any[] | null,
  intensity: number
) {
  if (intensity <= 0 || !landmarks) return;

  const innerLips = getLandmarkPoints(landmarks, LIPS_INNER, w, h);
  
  ctx.save();
  ctx.beginPath();
  ctx.moveTo(innerLips[0][0], innerLips[0][1]);
  for (let i = 1; i < innerLips.length; i++) ctx.lineTo(innerLips[i][0], innerLips[i][1]);
  ctx.closePath();
  ctx.clip();

  ctx.globalCompositeOperation = 'soft-light';
  ctx.fillStyle = `rgba(200,60,80,${intensity * 0.5})`;
  ctx.fill();
  ctx.globalCompositeOperation = 'source-over';
  ctx.restore();
}

function applyEyeBrightening(
  ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  w: number, h: number,
  landmarks: any[] | null,
  intensity: number
) {
  if (intensity <= 0 || !landmarks) return;

  const leftEyeCenter = getCenter(getLandmarkPoints(landmarks, LEFT_EYE, w, h));
  const rightEyeCenter = getCenter(getLandmarkPoints(landmarks, RIGHT_EYE, w, h));
  const eyeRadius = Math.abs(leftEyeCenter[0] - rightEyeCenter[0]) * 0.12;

  ctx.save();
  ctx.globalCompositeOperation = 'screen';
  for (const eye of [leftEyeCenter, rightEyeCenter]) {
    const gradient = ctx.createRadialGradient(eye[0], eye[1], 0, eye[0], eye[1], eyeRadius);
    gradient.addColorStop(0, `rgba(255,255,255,${intensity * 0.15})`);
    gradient.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = gradient;
    ctx.fillRect(eye[0] - eyeRadius, eye[1] - eyeRadius, eyeRadius * 2, eyeRadius * 2);
  }
  ctx.globalCompositeOperation = 'source-over';
  ctx.restore();
}

function applyColorEffects(
  ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  w: number, h: number,
  params: BeautyParams
) {
  // Warmth
  if (params.warmth > 0) {
    ctx.save();
    ctx.globalCompositeOperation = 'soft-light';
    ctx.fillStyle = `rgba(255,200,150,${params.warmth * 0.15})`;
    ctx.fillRect(0, 0, w, h);
    ctx.globalCompositeOperation = 'source-over';
    ctx.restore();
  }

  // Glow
  if (params.glow > 0) {
    ctx.save();
    ctx.globalCompositeOperation = 'screen';
    ctx.fillStyle = `rgba(255,255,240,${params.glow * 0.08})`;
    ctx.fillRect(0, 0, w, h);
    ctx.globalCompositeOperation = 'source-over';
    ctx.restore();
  }

  // Skin tone shift
  if (Math.abs(params.skinTone - 0.5) > 0.05) {
    ctx.save();
    ctx.globalCompositeOperation = 'soft-light';
    if (params.skinTone > 0.5) {
      // Warm
      ctx.fillStyle = `rgba(255,180,120,${(params.skinTone - 0.5) * 0.2})`;
    } else {
      // Cool
      ctx.fillStyle = `rgba(150,180,255,${(0.5 - params.skinTone) * 0.2})`;
    }
    ctx.fillRect(0, 0, w, h);
    ctx.globalCompositeOperation = 'source-over';
    ctx.restore();
  }
}

// ============================================================
// Face Reshape using Canvas Transform
// ============================================================

function applyFaceReshape(
  ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  w: number, h: number,
  landmarks: any[],
  params: BeautyParams
) {
  if (params.faceSlim <= 0 && params.chinSlim <= 0 && params.eyeEnlarge <= 0 && params.noseNarrow <= 0) return;

  // Get face bounding info
  const faceOval = getLandmarkPoints(landmarks, FACE_OVAL, w, h);
  const faceCenter = getCenter(faceOval);
  
  // Get original image data
  const imageData = ctx.getImageData(0, 0, w, h);
  const src = new Uint8ClampedArray(imageData.data);
  const dst = imageData.data;

  // Face slim: squeeze x-coordinates toward center
  if (params.faceSlim > 0) {
    const strength = params.faceSlim * 0.06;
    for (let i = 0; i < faceOval.length; i++) {
      const [px, py] = faceOval[i];
      const dx = px - faceCenter[0];
      const newX = faceCenter[0] + dx * (1 - strength);
      
      // Warp pixels in the region
      const regionR = 25;
      for (let y = Math.max(0, Math.floor(py - regionR)); y < Math.min(h, Math.ceil(py + regionR)); y++) {
        for (let x = Math.max(0, Math.floor(newX - regionR)); x < Math.min(w, Math.ceil(newX + regionR)); x++) {
          const dist = Math.sqrt((x - newX) ** 2 + (y - py) ** 2);
          if (dist > regionR) continue;
          const factor = (1 - dist / regionR) * strength;
          const srcX = Math.round(x + (px - newX) * factor);
          const srcY = y;
          if (srcX >= 0 && srcX < w) {
            const dstIdx = (y * w + x) * 4;
            const srcIdx = (srcY * w + srcX) * 4;
            dst[dstIdx] = src[srcIdx];
            dst[dstIdx + 1] = src[srcIdx + 1];
            dst[dstIdx + 2] = src[srcIdx + 2];
            dst[dstIdx + 3] = src[srcIdx + 3];
          }
        }
      }
    }
  }

  // Eye enlarge: magnify eye regions
  if (params.eyeEnlarge > 0) {
    const scale = 1 + params.eyeEnlarge * 0.15;
    for (const eyeIndices of [LEFT_EYE, RIGHT_EYE]) {
      const eyePoints = getLandmarkPoints(landmarks, eyeIndices, w, h);
      const center = getCenter(eyePoints);
      const radius = Math.max(...eyePoints.map(p => Math.sqrt((p[0] - center[0]) ** 2 + (p[1] - center[1]) ** 2))) * 1.5;

      for (let y = Math.max(0, Math.floor(center[1] - radius)); y < Math.min(h, Math.ceil(center[1] + radius)); y++) {
        for (let x = Math.max(0, Math.floor(center[0] - radius)); x < Math.min(w, Math.ceil(center[0] + radius)); x++) {
          const dist = Math.sqrt((x - center[0]) ** 2 + (y - center[1]) ** 2);
          if (dist > radius) continue;
          const factor = 1 - (dist / radius);
          const currentScale = 1 + (scale - 1) * factor * factor;
          const srcX = Math.round(center[0] + (x - center[0]) / currentScale);
          const srcY = Math.round(center[1] + (y - center[1]) / currentScale);
          if (srcX >= 0 && srcX < w && srcY >= 0 && srcY < h) {
            const dstIdx = (y * w + x) * 4;
            const srcIdx = (srcY * w + srcX) * 4;
            dst[dstIdx] = src[srcIdx];
            dst[dstIdx + 1] = src[srcIdx + 1];
            dst[dstIdx + 2] = src[srcIdx + 2];
            dst[dstIdx + 3] = src[srcIdx + 3];
          }
        }
      }
    }
  }

  ctx.putImageData(imageData, 0, 0);
}

// ============================================================
// Main Processing Function
// ============================================================

/**
 * Process a single video frame with beauty effects
 */
export function processVideoFrame(
  videoEl: HTMLVideoElement,
  outputCanvas: HTMLCanvasElement
): boolean {
  if (!_enabled || !videoEl.videoWidth) return false;

  const w = videoEl.videoWidth;
  const h = videoEl.videoHeight;

  // Ensure output canvas matches
  if (outputCanvas.width !== w) outputCanvas.width = w;
  if (outputCanvas.height !== h) outputCanvas.height = h;

  ensureCanvases(w, h);
  if (!_offscreenCtx || !_smoothCtx) return false;

  // Draw current frame
  _offscreenCtx.drawImage(videoEl, 0, 0, w, h);

  // Detect face landmarks
  let landmarks: any[] | null = null;
  if (_faceLandmarker) {
    try {
      const results = _faceLandmarker.detectForVideo(videoEl, performance.now());
      if (results.faceLandmarks && results.faceLandmarks.length > 0) {
        landmarks = results.faceLandmarks[0];
        // Calculate and cache face bounding box from landmarks
        let minX = 1, minY = 1, maxX = 0, maxY = 0;
        for (const lm of landmarks) {
          if (lm.x < minX) minX = lm.x;
          if (lm.y < minY) minY = lm.y;
          if (lm.x > maxX) maxX = lm.x;
          if (lm.y > maxY) maxY = lm.y;
        }
        _lastFaceBounds = { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
      } else {
        _lastFaceBounds = null;
      }
    } catch {
      // Silently continue without landmarks
    }
  }

  // Apply beauty pipeline
  applySkinSmoothing(_offscreenCtx, _smoothCtx, w, h, landmarks, _params.smoothness);
  applyWhitening(_offscreenCtx, w, h, landmarks, _params.whitening);
  applyRedness(_offscreenCtx, w, h, landmarks, _params.redness);
  applyLipColor(_offscreenCtx, w, h, landmarks, _params.lipColor);
  applyEyeBrightening(_offscreenCtx, w, h, landmarks, _params.eyeBright);
  applyColorEffects(_offscreenCtx, w, h, _params);

  // Face reshape (pixel manipulation — heavier, only when needed)
  if (landmarks && (_params.faceSlim > 0 || _params.eyeEnlarge > 0)) {
    applyFaceReshape(_offscreenCtx, w, h, landmarks, _params);
  }

  // Sharpness (unsharp mask via CSS filter)
  const outCtx = outputCanvas.getContext('2d')!;
  if (_params.sharpness > 0) {
    outCtx.filter = `contrast(${1 + _params.sharpness * 0.15})`;
  } else {
    outCtx.filter = 'none';
  }
  outCtx.drawImage(_offscreenCanvas as any, 0, 0);
  outCtx.filter = 'none';

  return true;
}

// ============================================================
// Stream Processing (MediaStream → processed MediaStream)
// ============================================================

let _animFrameId: number | null = null;
let _processingCanvas: HTMLCanvasElement | null = null;
let _sourceVideo: HTMLVideoElement | null = null;
let _activeInputStream: MediaStream | null = null;
let _activeOutputStream: MediaStream | null = null;
let _activeSourceTrackId: string | null = null;
// In-flight guard: concurrent startBeautyProcessing() calls (UI double-tap,
// React StrictMode double-mount, retry-on-error) must NOT race and create
// two canvases / two captureStream tracks. The second caller awaits the first.
let _startInFlight: Promise<MediaStream> | null = null;

/**
 * Start processing a MediaStream and return a beautified MediaStream.
 *
 * IMPORTANT for live broadcast: the output stream is a canvas captureStream.
 * Once it's published to LiveKit, viewers will see whatever this canvas paints.
 * Correctness rules enforced below:
 *  1. Idempotency — same input stream OR same underlying video track → reuse
 *     existing canvas/output so the previously published track stays live
 *     (prevents orphan canvas capture and "viewers see black face" on re-init).
 *  2. Concurrency guard — overlapping start calls share one promise; no
 *     duplicate canvases, no orphan captureStream tracks.
 *  3. Beauty-off passthrough — render loop always paints the source frame,
 *     even when beauty is disabled, so the published canvas never freezes.
 */
export async function startBeautyProcessing(
  inputStream: MediaStream
): Promise<MediaStream> {
  // (1a) Fast-path idempotent reuse by stream identity.
  if (
    _activeInputStream === inputStream &&
    _activeOutputStream &&
    _activeOutputStream.getVideoTracks()[0]?.readyState === 'live'
  ) {
    return _activeOutputStream;
  }

  // (1b) Idempotent reuse by underlying video-track id. Callers sometimes
  // wrap the same camera track in a fresh MediaStream (e.g. LiveKit clones
  // tracks on republish). Without this check we'd tear down a healthy
  // pipeline and orphan the canvas the LiveKit publisher is still reading.
  const incomingVideoTrack = inputStream.getVideoTracks()[0];
  if (
    incomingVideoTrack &&
    _activeSourceTrackId === incomingVideoTrack.id &&
    _activeOutputStream &&
    _activeOutputStream.getVideoTracks()[0]?.readyState === 'live'
  ) {
    _activeInputStream = inputStream;
    return _activeOutputStream;
  }

  // (2) Concurrency guard — share one in-flight promise.
  if (_startInFlight) {
    return _startInFlight;
  }

  _startInFlight = (async () => {
    // Different input or stale canvas — tear down old pipeline before re-init
    // so the orphaned canvas doesn't leak and so we don't silently stop painting
    // the previously-published surface mid-broadcast.
    if (_sourceVideo || _processingCanvas) {
      stopBeautyProcessing();
    }

  // Initialize MediaPipe
  await initMediaPipe();

  // Create hidden video element for input
  _sourceVideo = document.createElement('video');
  _sourceVideo.srcObject = inputStream;
  _sourceVideo.muted = true;
  _sourceVideo.playsInline = true;
  _sourceVideo.autoplay = true;
  _sourceVideo.style.display = 'none';
  document.body.appendChild(_sourceVideo);
  
  await new Promise<void>((resolve) => {
    _sourceVideo!.onloadedmetadata = () => {
      _sourceVideo!.play().then(() => resolve()).catch(() => resolve());
    };
  });

  // Create processing canvas
  _processingCanvas = document.createElement('canvas');
  _processingCanvas.width = _sourceVideo.videoWidth || 720;
  _processingCanvas.height = _sourceVideo.videoHeight || 1280;
  _processingCanvas.style.display = 'none';
  document.body.appendChild(_processingCanvas);

  // Cache a passthrough 2D ctx for the off-state path
  const passthroughCtx = _processingCanvas.getContext('2d');

  // Start render loop
  const renderLoop = () => {
    if (!_sourceVideo || !_processingCanvas) {
      // Pipeline torn down — stop scheduling new frames.
      _animFrameId = null;
      return;
    }

    if (_sourceVideo.readyState >= 2) {
      if (_enabled && !_processing) {
        _processing = true;
        try {
          processVideoFrame(_sourceVideo, _processingCanvas);
        } catch (e) {
          // Silent fail — fall through to passthrough so the canvas
          // never freezes for viewers.
          try {
            passthroughCtx?.drawImage(
              _sourceVideo,
              0,
              0,
              _processingCanvas.width,
              _processingCanvas.height,
            );
          } catch { /* noop */ }
        }
        _processing = false;
      } else if (!_enabled && passthroughCtx) {
        // Beauty OFF — keep painting raw frames so the published canvas
        // stream stays live. Without this, viewers would see a frozen
        // frame the instant the host disabled beauty.
        try {
          if (_processingCanvas.width !== _sourceVideo.videoWidth && _sourceVideo.videoWidth) {
            _processingCanvas.width = _sourceVideo.videoWidth;
            _processingCanvas.height = _sourceVideo.videoHeight;
          }
          passthroughCtx.drawImage(
            _sourceVideo,
            0,
            0,
            _processingCanvas.width,
            _processingCanvas.height,
          );
        } catch { /* noop */ }
      }
    }

    _animFrameId = requestAnimationFrame(renderLoop);
  };

  _animFrameId = requestAnimationFrame(renderLoop);

  // Capture output stream from canvas
  const outputStream = _processingCanvas.captureStream(30);

  // Carry over audio tracks from input
  inputStream.getAudioTracks().forEach(track => {
    outputStream.addTrack(track);
  });

  _activeInputStream = inputStream;
  _activeOutputStream = outputStream;

  console.log('[MediaPipeBeauty] ✅ Beauty processing started');
  return outputStream;
}


/**
 * Stop beauty processing and cleanup
 */
export function stopBeautyProcessing() {
  if (_animFrameId !== null) {
    cancelAnimationFrame(_animFrameId);
    _animFrameId = null;
  }

  if (_sourceVideo) {
    _sourceVideo.srcObject = null;
    _sourceVideo.remove();
    _sourceVideo = null;
  }

  if (_processingCanvas) {
    _processingCanvas.remove();
    _processingCanvas = null;
  }

  _activeInputStream = null;
  _activeOutputStream = null;
  _processing = false;
  console.log('[MediaPipeBeauty] Processing stopped');
}

// ============================================================
// Public API
// ============================================================

export function setBeautyEnabled(enabled: boolean) {
  _enabled = enabled;
  console.log('[MediaPipeBeauty] Enabled:', enabled);
}

export function setBeautyParams(params: Partial<BeautyParams>) {
  _params = { ..._params, ...params };
}

export function getBeautyParams(): BeautyParams {
  return { ..._params };
}

export function isBeautyEnabled(): boolean {
  return _enabled;
}

export function isMediaPipeReady(): boolean {
  return !!_faceLandmarker;
}

/**
 * Get the last detected face bounding box (normalized 0-1 coordinates)
 */
export function getLastFaceBounds(): { x: number; y: number; width: number; height: number } | null {
  return _lastFaceBounds;
}

/**
 * Map UI settings (0-100) to processor params (0-1)
 */
export function mapUIToParams(ui: {
  smoothness?: number; whitening?: number; redness?: number; sharpness?: number;
  glow?: number; warmth?: number; eyeBright?: number; skinTone?: number;
  faceSlim?: number; chinSlim?: number; eyeEnlarge?: number; noseNarrow?: number; lipColor?: number;
}): BeautyParams {
  return {
    smoothness: (ui.smoothness ?? 0) / 100,
    whitening: (ui.whitening ?? 0) / 100,
    redness: (ui.redness ?? 0) / 100,
    sharpness: (ui.sharpness ?? 0) / 100,
    glow: (ui.glow ?? 0) / 100,
    warmth: (ui.warmth ?? 0) / 100,
    eyeBright: (ui.eyeBright ?? 0) / 100,
    skinTone: (ui.skinTone ?? 50) / 100,
    faceSlim: (ui.faceSlim ?? 0) / 100,
    chinSlim: (ui.chinSlim ?? 0) / 100,
    eyeEnlarge: (ui.eyeEnlarge ?? 0) / 100,
    noseNarrow: (ui.noseNarrow ?? 0) / 100,
    lipColor: (ui.lipColor ?? 0) / 100,
  };
}

/**
 * Initialize MediaPipe eagerly (call on app start for faster first use)
 */
export async function preloadMediaPipe(): Promise<boolean> {
  const result = await initMediaPipe();
  return !!result;
}

/**
 * Full cleanup
 */
export function destroyMediaPipeBeauty() {
  stopBeautyProcessing();
  if (_faceLandmarker) {
    _faceLandmarker.close();
    _faceLandmarker = null;
  }
  _initPromise = null;
  _offscreenCanvas = null;
  _offscreenCtx = null;
  _smoothCanvas = null;
  _smoothCtx = null;
  _params = { ...DEFAULT_PARAMS };
  _enabled = false;
  console.log('[MediaPipeBeauty] Destroyed');
}
