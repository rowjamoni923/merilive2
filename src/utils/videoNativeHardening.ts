interface NativeVideoHardeningOptions {
  muted?: boolean;
}

/**
 * Enforces an inline-only, no-native-overlay video surface for Android/iOS WebViews.
 * v2.0 — Adds MutationObserver to continuously kill injected controls,
 * ShadowRoot piercing, and periodic attribute enforcement.
 */
export const hardenVideoElementForNative = (
  videoEl: HTMLVideoElement,
  options: NativeVideoHardeningOptions = {}
) => {
  const muted = options.muted ?? true;

  // Ensure idempotency when hardening is applied multiple times.
  const existingCleanup = (videoEl as any).__hardenCleanup;
  if (typeof existingCleanup === 'function') {
    existingCleanup();
  }

  // === Core attributes ===
  videoEl.autoplay = true;
  videoEl.playsInline = true;
  videoEl.muted = muted;
  videoEl.defaultMuted = muted;
  videoEl.controls = false;
  videoEl.preload = 'auto';
  videoEl.disablePictureInPicture = true;

  // === Vendor attributes ===
  const vendorAttrs: Record<string, string> = {
    autoplay: '',
    playsinline: 'true',
    'webkit-playsinline': 'true',
    'x5-playsinline': 'true',
    'x5-video-player-type': 'h5',
    'x5-video-player-fullscreen': 'false',
    'x5-video-orientation': 'portrait',
    'x-webkit-airplay': 'deny',
    disablePictureInPicture: 'true',
    disableRemotePlayback: 'true',
    controlsList: 'nodownload nofullscreen noremoteplayback noplaybackrate',
  };

  // Android WebView autoplay compatibility: requires muted ATTR (not only property).
  if (muted) {
    vendorAttrs.muted = '';
  }

  for (const [key, value] of Object.entries(vendorAttrs)) {
    videoEl.setAttribute(key, value);
  }

  // === Remove dangerous attributes ===
  videoEl.removeAttribute('controls');
  videoEl.removeAttribute('poster');

  // === Style lock ===
  videoEl.style.pointerEvents = 'none';
  videoEl.style.touchAction = 'none';
  videoEl.style.webkitAppearance = 'none';
  videoEl.style.backgroundColor = 'transparent';

  // === Hide-until-first-frame ===
  // Keep the video element invisible (but laid out) until a real frame paints.
  // This prevents Android WebView's native play-icon from flashing without
  // painting any solid colour overlay (no black, no shield).
  videoEl.style.transition = 'opacity 120ms linear';
  videoEl.style.opacity = '0';
  const revealOnFrame = () => { videoEl.style.opacity = '1'; };
  const safe = videoEl as HTMLVideoElement & {
    requestVideoFrameCallback?: (cb: () => void) => number;
  };
  if (typeof safe.requestVideoFrameCallback === 'function') {
    try { safe.requestVideoFrameCallback(revealOnFrame); } catch { /* noop */ }
  }
  videoEl.addEventListener('playing', revealOnFrame, { once: true });
  videoEl.addEventListener('loadeddata', () => {
    if (videoEl.readyState >= 2) revealOnFrame();
  }, { once: true });


  // === ShadowRoot piercing — kill controls inside shadow DOM ===
  killShadowControls(videoEl);

  // === MutationObserver — continuously prevent controls re-injection ===
  const observer = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      // If 'controls' attribute gets added back, remove it
      if (mutation.type === 'attributes' && mutation.attributeName === 'controls') {
        videoEl.removeAttribute('controls');
        videoEl.controls = false;
      }
      // If child nodes added (injected overlays), hide them
      if (mutation.type === 'childList') {
        mutation.addedNodes.forEach((node) => {
          if (node instanceof HTMLElement) {
            node.style.display = 'none';
            node.style.opacity = '0';
            node.style.pointerEvents = 'none';
            node.style.visibility = 'hidden';
          }
        });
      }
    }
  });

  observer.observe(videoEl, {
    attributes: true,
    attributeFilter: ['controls', 'poster'],
    childList: true,
    subtree: true,
  });

  // === Lightweight post-attach enforcement passes ===
  const enforcePasses = [0, 120, 600].map((delay) =>
    setTimeout(() => {
      if (!videoEl.isConnected) return;
      videoEl.controls = false;
      videoEl.removeAttribute('controls');
      videoEl.removeAttribute('poster');
      killShadowControls(videoEl);
    }, delay)
  );

  // Store cleanup references on the element
  (videoEl as any).__hardenCleanup = () => {
    enforcePasses.forEach(clearTimeout);
    observer.disconnect();
  };
};

/**
 * Attempt to hide controls injected inside video element's shadow root.
 * Android WebView sometimes creates shadow DOM media controls.
 */
function killShadowControls(videoEl: HTMLVideoElement) {
  try {
    const shadow = (videoEl as any).shadowRoot;
    if (shadow) {
      const allChildren = shadow.querySelectorAll('*');
      allChildren.forEach((child: HTMLElement) => {
        child.style.display = 'none';
        child.style.opacity = '0';
        child.style.visibility = 'hidden';
        child.style.width = '0';
        child.style.height = '0';
        child.style.position = 'absolute';
        child.style.pointerEvents = 'none';
      });
    }
  } catch {
    // Shadow root may not be accessible — that's fine
  }
}

/**
 * Clean up hardening listeners when video element is removed.
 */
export const cleanupVideoHardening = (videoEl: HTMLVideoElement) => {
  try {
    const cleanup = (videoEl as any).__hardenCleanup;
    if (typeof cleanup === 'function') cleanup();
  } catch {
    // ignore
  }
};
