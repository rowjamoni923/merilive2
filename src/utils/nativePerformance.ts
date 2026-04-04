/**
 * Native Performance Engine v1.0
 * GPU acceleration hints, frame scheduling, and WebView performance tuning
 * for native-like smoothness in Capacitor apps.
 */

// === GPU ACCELERATION HINTS ===
export function enableGPUAcceleration(element: HTMLElement) {
  element.style.willChange = 'transform';
  element.style.transform = 'translateZ(0)';
  element.style.backfaceVisibility = 'hidden';
  (element.style as any).webkitBackfaceVisibility = 'hidden';
}

export function disableGPUAcceleration(element: HTMLElement) {
  element.style.willChange = 'auto';
  element.style.transform = '';
  element.style.backfaceVisibility = '';
}

// === FRAME SCHEDULER ===
// Ensures animations run at 60fps by batching DOM reads/writes
type FrameCallback = () => void;
const readQueue: FrameCallback[] = [];
const writeQueue: FrameCallback[] = [];
let frameScheduled = false;

function processFrame() {
  // Batch reads first
  const reads = readQueue.splice(0);
  reads.forEach(fn => { try { fn(); } catch {} });
  
  // Then batch writes
  const writes = writeQueue.splice(0);
  writes.forEach(fn => { try { fn(); } catch {} });
  
  frameScheduled = false;
  if (readQueue.length || writeQueue.length) scheduleFrame();
}

function scheduleFrame() {
  if (frameScheduled) return;
  frameScheduled = true;
  requestAnimationFrame(processFrame);
}

export function scheduleRead(fn: FrameCallback) {
  readQueue.push(fn);
  scheduleFrame();
}

export function scheduleWrite(fn: FrameCallback) {
  writeQueue.push(fn);
  scheduleFrame();
}

// === SCROLL PERFORMANCE ===
export function enablePassiveScrolling(container: HTMLElement) {
  container.style.overscrollBehavior = 'contain';
  (container.style as any).webkitOverflowScrolling = 'touch';
  (container.style as any).scrollBehavior = 'smooth';
  container.style.touchAction = 'pan-y';
}

// === INTERSECTION OBSERVER POOL ===
// Reusable observers to avoid creating too many
const observerPool = new Map<string, IntersectionObserver>();

export function getSharedObserver(
  key: string, 
  callback: IntersectionObserverCallback,
  options?: IntersectionObserverInit
): IntersectionObserver {
  if (!observerPool.has(key)) {
    observerPool.set(key, new IntersectionObserver(callback, options));
  }
  return observerPool.get(key)!;
}

// === IMAGE LAZY LOADING ===
export function lazyLoadImage(img: HTMLImageElement, src: string) {
  if ('loading' in HTMLImageElement.prototype) {
    img.loading = 'lazy';
    img.src = src;
  } else {
    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) {
        img.src = src;
        observer.disconnect();
      }
    }, { rootMargin: '200px' });
    observer.observe(img);
  }
}

// === DEBOUNCED RESIZE ===
export function onResize(callback: () => void, delay = 100) {
  let timer: ReturnType<typeof setTimeout>;
  const handler = () => {
    clearTimeout(timer);
    timer = setTimeout(callback, delay);
  };
  window.addEventListener('resize', handler, { passive: true });
  return () => window.removeEventListener('resize', handler);
}

// === NATIVE-LIKE MOMENTUM SCROLLING ===
export function enableMomentumScroll(el: HTMLElement) {
  el.style.overflowY = 'auto';
  (el.style as any).webkitOverflowScrolling = 'touch';
  el.style.overscrollBehaviorY = 'contain';
  // Prevent rubber-band effect leaking to parent
  el.addEventListener('touchstart', () => {}, { passive: true });
}

// === REDUCE MOTION CHECK ===
export function prefersReducedMotion(): boolean {
  return window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches ?? false;
}

// === WEBVIEW PERFORMANCE INIT ===
// Call once on app startup for global performance tuning
export function initWebViewPerformance() {
  // Disable text size adjustment (prevents Android WebView auto-resize)
  (document.body.style as any).textSizeAdjust = '100%';
  (document.body.style as any).webkitTextSizeAdjust = '100%';
  
  // Optimize font rendering
  document.body.style.textRendering = 'optimizeSpeed';
  (document.body.style as any).webkitFontSmoothing = 'antialiased';
  
  // Disable long-press context menu on mobile
  document.addEventListener('contextmenu', (e) => {
    if ((e.target as HTMLElement)?.tagName !== 'INPUT' && (e.target as HTMLElement)?.tagName !== 'TEXTAREA') {
      e.preventDefault();
    }
  });
  
  // Optimize touch response — remove 300ms delay
  const viewport = document.querySelector('meta[name="viewport"]');
  if (viewport) {
    const content = viewport.getAttribute('content') || '';
    if (!content.includes('touch-action')) {
      viewport.setAttribute('content', content + ', touch-action=manipulation');
    }
  }

  console.log('[NativePerf] ✅ WebView performance initialized');
}

// === MEMORY MANAGEMENT ===
export function cleanupOffscreenImages(container: HTMLElement) {
  const images = container.querySelectorAll('img[data-src]');
  const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      const img = entry.target as HTMLImageElement;
      if (entry.isIntersecting) {
        img.src = img.dataset.src || '';
      } else {
        // Release memory for off-screen images
        img.src = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';
      }
    });
  }, { rootMargin: '300px' });
  
  images.forEach(img => observer.observe(img));
  return () => observer.disconnect();
}

// === ANIMATION FRAME THROTTLE ===
export function throttleToFrame<T extends (...args: any[]) => void>(fn: T): T {
  let frameId: number | null = null;
  return ((...args: any[]) => {
    if (frameId !== null) return;
    frameId = requestAnimationFrame(() => {
      fn(...args);
      frameId = null;
    });
  }) as unknown as T;
}
