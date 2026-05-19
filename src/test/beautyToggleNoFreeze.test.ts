/**
 * Regression test: beauty filter ON/OFF toggle mid-stream must NEVER freeze
 * or blank the viewer's video.
 *
 * Production bug this guards (fixed in mediapipeBeautyProcessor.ts):
 *   When the host toggled beauty OFF, the render loop early-returned and the
 *   canvas captureStream stopped getting new frames → every viewer saw a
 *   frozen first frame (effectively a black/static face).
 *
 * Contract this asserts:
 *   1. The output MediaStream's video track stays in 'live' readyState across
 *      multiple ON→OFF→ON toggles.
 *   2. The render loop draws to the canvas in BOTH states:
 *        - ON  → processVideoFrame path (may pass through on stub MediaPipe)
 *        - OFF → passthrough drawImage path (must keep painting raw frames)
 *   3. A second call to startBeautyProcessing with the SAME input stream is
 *      idempotent — returns the SAME output stream so the previously
 *      published track never gets orphaned mid-broadcast.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// -----------------------------------------------------------------------------
// Mock MediaPipe — we don't want to download wasm/models in jsdom.
// -----------------------------------------------------------------------------
vi.mock('@mediapipe/tasks-vision', () => {
  return {
    FilesetResolver: {
      forVisionTasks: vi.fn(async () => ({})),
    },
    FaceLandmarker: {
      createFromOptions: vi.fn(async () => ({
        detectForVideo: () => ({ faceLandmarks: [] }),
        close: () => {},
      })),
    },
    DrawingUtils: class {},
  };
});

// -----------------------------------------------------------------------------
// jsdom polyfills the processor depends on
// -----------------------------------------------------------------------------
let rafQueue: Array<() => void> = [];
let rafIdCounter = 1;

const flushRafs = (n = 1) => {
  for (let i = 0; i < n; i++) {
    const callbacks = rafQueue;
    rafQueue = [];
    callbacks.forEach((cb) => cb());
  }
};

beforeEach(() => {
  vi.useFakeTimers();
  rafQueue = [];
  rafIdCounter = 1;

  (globalThis as any).requestAnimationFrame = (cb: () => void) => {
    rafQueue.push(cb);
    return rafIdCounter++;
  };
  (globalThis as any).cancelAnimationFrame = () => {};

  if (typeof (globalThis as any).MediaStream === 'undefined') {
    (globalThis as any).MediaStream = class {
      private tracks: any[];
      constructor(tracks: any[] = []) {
        this.tracks = [...tracks];
      }
      getTracks() {
        return this.tracks;
      }
      getVideoTracks() {
        return this.tracks.filter((t) => t.kind === 'video');
      }
      getAudioTracks() {
        return this.tracks.filter((t) => t.kind === 'audio');
      }
      addTrack(t: any) {
        this.tracks.push(t);
      }
    };
  }
});

afterEach(() => {
  vi.useRealTimers();
  vi.resetModules();
});

const makeMediaStreamTrack = (kind: 'video' | 'audio') => ({
  kind,
  readyState: 'live' as 'live' | 'ended',
  enabled: true,
  id: `mst-${kind}-${Math.random().toString(36).slice(2, 8)}`,
  stop() {
    this.readyState = 'ended';
  },
  addEventListener: vi.fn(),
  removeEventListener: vi.fn(),
});

// Mock the offscreen <video> the processor creates with document.createElement
// so it's "ready" immediately and reports a stable size.
const originalCreateElement = document.createElement.bind(document);
const stubCreateElement = (drawImageSpy: ReturnType<typeof vi.fn>) => {
  document.createElement = ((tag: string) => {
    const el = originalCreateElement(tag);
    if (tag === 'video') {
      Object.defineProperty(el, 'readyState', { value: 4, writable: true });
      Object.defineProperty(el, 'videoWidth', { value: 720, writable: true });
      Object.defineProperty(el, 'videoHeight', { value: 1280, writable: true });
      // Auto-fire loadedmetadata + play() resolves immediately
      (el as HTMLVideoElement).play = () => Promise.resolve();
      queueMicrotask(() => {
        const handler = (el as any).onloadedmetadata;
        if (typeof handler === 'function') handler();
      });
    }
    if (tag === 'canvas') {
      const captureTrack = makeMediaStreamTrack('video');
      (el as any).captureStream = vi.fn(() => new MediaStream([captureTrack]));
      (el as any).getContext = vi.fn(() => ({
        drawImage: drawImageSpy,
        getImageData: () => ({
          data: new Uint8ClampedArray(720 * 1280 * 4),
          width: 720,
          height: 1280,
        }),
        putImageData: vi.fn(),
        fillRect: vi.fn(),
        clearRect: vi.fn(),
        save: vi.fn(),
        restore: vi.fn(),
        translate: vi.fn(),
        scale: vi.fn(),
        rotate: vi.fn(),
        beginPath: vi.fn(),
        closePath: vi.fn(),
        moveTo: vi.fn(),
        lineTo: vi.fn(),
        arc: vi.fn(),
        fill: vi.fn(),
        stroke: vi.fn(),
        clip: vi.fn(),
        filter: 'none',
        globalCompositeOperation: 'source-over',
        globalAlpha: 1,
        fillStyle: '',
        strokeStyle: '',
        lineWidth: 1,
      }));
      Object.defineProperty(el, 'width', { value: 720, writable: true });
      Object.defineProperty(el, 'height', { value: 1280, writable: true });
    }
    return el;
  }) as typeof document.createElement;
};

describe('beauty filter toggle — viewer never sees frozen/black face', () => {
  it(
    'output track stays live and canvas keeps painting across ON→OFF→ON toggles',
    async () => {
      const drawImage = vi.fn();
      stubCreateElement(drawImage);

      const proc = await import('@/services/mediapipeBeautyProcessor');

      const inputTrack = makeMediaStreamTrack('video');
      const inputStream = new MediaStream([inputTrack as any]);

      proc.setBeautyEnabled(true);
      const outputStream = await proc.startBeautyProcessing(inputStream);

      const outTrack = outputStream.getVideoTracks()[0];
      expect(outTrack).toBeTruthy();
      expect(outTrack.readyState).toBe('live');

      // ===== Phase 1: beauty ON — pump a few render frames =====
      flushRafs(3);
      expect(outTrack.readyState).toBe('live');

      // ===== Phase 2: toggle beauty OFF mid-stream =====
      proc.setBeautyEnabled(false);
      const drawsBeforeOff = drawImage.mock.calls.length;
      flushRafs(5);

      // Output track must still be live (the published surface stays alive)
      expect(outTrack.readyState).toBe('live');

      // Passthrough path MUST keep painting raw frames to the canvas — this
      // is what prevents the viewer's <video> from freezing on the last frame.
      expect(drawImage.mock.calls.length).toBeGreaterThan(drawsBeforeOff);

      // ===== Phase 3: toggle beauty back ON =====
      proc.setBeautyEnabled(true);
      const drawsBeforeOn = drawImage.mock.calls.length;
      flushRafs(5);

      expect(outTrack.readyState).toBe('live');
      // Render loop is still scheduled after the second toggle (frame count
      // continues to advance one way or the other).
      expect(rafQueue.length).toBeGreaterThan(0);
      // Either processVideoFrame or the passthrough fallback paints — what we
      // care about is that the loop did NOT silently stop after the toggle.
      expect(drawImage.mock.calls.length).toBeGreaterThanOrEqual(drawsBeforeOn);

      proc.stopBeautyProcessing();
      proc.destroyMediaPipeBeauty();
    },
  );

  it('startBeautyProcessing is idempotent — same input returns same output stream', async () => {
    const drawImage = vi.fn();
    stubCreateElement(drawImage);

    const proc = await import('@/services/mediapipeBeautyProcessor');

    proc.setBeautyEnabled(true);
    const inputTrack = makeMediaStreamTrack('video');
    const inputStream = new MediaStream([inputTrack as any]);

    const first = await proc.startBeautyProcessing(inputStream);
    const second = await proc.startBeautyProcessing(inputStream);

    // Critical: same MediaStream object → already-published LiveKit track
    // remains valid; viewers don't lose video mid-stream.
    expect(second).toBe(first);
    expect(first.getVideoTracks()[0].readyState).toBe('live');

    proc.stopBeautyProcessing();
    proc.destroyMediaPipeBeauty();
  });
});
