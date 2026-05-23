/**
 * Pkg204 — Picture-in-Picture for host video (M1).
 *
 * Wraps the browser's standard Picture-in-Picture API
 * (`HTMLVideoElement.requestPictureInPicture`) plus the newer Document PiP
 * API (`documentPictureInPicture.requestWindow`) behind a tiny stable
 * surface so app code doesn't have to feature-detect.
 *
 * Standard video PiP is supported on:
 *  - Chrome / Edge (desktop + Android Chrome 105+)
 *  - Safari 13.1+ (desktop + iOS 14+)
 *  - NOT Firefox (uses a non-standard toggle)
 *
 * Document PiP (`window.documentPictureInPicture`) is Chrome 116+
 * desktop-only — useful when you want to PiP a richer UI later
 * (overlay + chat). For now this module focuses on video PiP.
 *
 * Pure DOM wrapper — no Supabase, no polling, $1400-rule safe.
 */

export type PiPMode = 'video' | 'document';

declare global {
  interface Document {
    pictureInPictureEnabled?: boolean;
    pictureInPictureElement?: Element | null;
    exitPictureInPicture?: () => Promise<void>;
  }
  interface HTMLVideoElement {
    requestPictureInPicture?: () => Promise<PictureInPictureWindow>;
    disablePictureInPicture?: boolean;
    webkitSupportsPresentationMode?: (mode: string) => boolean;
    webkitSetPresentationMode?: (mode: string) => void;
    webkitPresentationMode?: string;
  }
}

export function isVideoPiPSupported(): boolean {
  if (typeof document === 'undefined') return false;
  if (document.pictureInPictureEnabled === true) return true;
  // iOS Safari fallback (Picture-in-Picture presentation mode on <video>).
  try {
    const v = document.createElement('video');
    return typeof v.webkitSupportsPresentationMode === 'function';
  } catch {
    return false;
  }
}

export function isDocumentPiPSupported(): boolean {
  return (
    typeof window !== 'undefined' &&
    'documentPictureInPicture' in window &&
    !!(window as unknown as { documentPictureInPicture?: unknown }).documentPictureInPicture
  );
}

export function isAnyPiPSupported(): boolean {
  return isVideoPiPSupported() || isDocumentPiPSupported();
}

export function isInVideoPiP(videoEl?: HTMLVideoElement | null): boolean {
  if (typeof document === 'undefined') return false;
  if (videoEl && document.pictureInPictureElement === videoEl) return true;
  if (!videoEl && document.pictureInPictureElement) return true;
  if (videoEl?.webkitPresentationMode === 'picture-in-picture') return true;
  return false;
}

/**
 * Enter Picture-in-Picture for the given <video> element.
 * MUST be called from inside a user-gesture handler (click / tap).
 * Returns true on success.
 */
export async function enterVideoPiP(videoEl: HTMLVideoElement | null): Promise<boolean> {
  if (!videoEl) return false;
  if (videoEl.disablePictureInPicture) return false;

  // Standard API (Chrome / Edge / Safari desktop / Android Chrome).
  if (typeof videoEl.requestPictureInPicture === 'function') {
    try {
      await videoEl.requestPictureInPicture();
      return true;
    } catch (err) {
      console.warn('[livekitPictureInPicture] requestPictureInPicture failed', err);
    }
  }

  // iOS Safari fallback (presentation mode toggle).
  if (typeof videoEl.webkitSetPresentationMode === 'function') {
    try {
      videoEl.webkitSetPresentationMode('picture-in-picture');
      return videoEl.webkitPresentationMode === 'picture-in-picture';
    } catch (err) {
      console.warn('[livekitPictureInPicture] webkitSetPresentationMode failed', err);
    }
  }

  return false;
}

export async function exitVideoPiP(videoEl?: HTMLVideoElement | null): Promise<void> {
  if (typeof document === 'undefined') return;
  try {
    if (document.pictureInPictureElement && document.exitPictureInPicture) {
      await document.exitPictureInPicture();
      return;
    }
  } catch (err) {
    console.warn('[livekitPictureInPicture] exitPictureInPicture failed', err);
  }
  // iOS Safari fallback.
  if (videoEl && typeof videoEl.webkitSetPresentationMode === 'function') {
    try {
      videoEl.webkitSetPresentationMode('inline');
    } catch {
      /* ignore */
    }
  }
}

/**
 * Convenience toggle. Returns the new state (true if now in PiP).
 */
export async function toggleVideoPiP(videoEl: HTMLVideoElement | null): Promise<boolean> {
  if (!videoEl) return false;
  if (isInVideoPiP(videoEl)) {
    await exitVideoPiP(videoEl);
    return false;
  }
  return enterVideoPiP(videoEl);
}

/**
 * Subscribe to PiP enter/leave events on a specific video element. Returns
 * an unsubscribe function. Useful for keeping a button's icon in sync.
 */
export function onPiPChange(
  videoEl: HTMLVideoElement,
  cb: (inPiP: boolean) => void,
): () => void {
  const onEnter = () => cb(true);
  const onLeave = () => cb(false);
  videoEl.addEventListener('enterpictureinpicture', onEnter);
  videoEl.addEventListener('leavepictureinpicture', onLeave);
  // iOS Safari presentationmodechanged.
  const onPresentation = () => {
    cb(videoEl.webkitPresentationMode === 'picture-in-picture');
  };
  videoEl.addEventListener('webkitpresentationmodechanged' as never, onPresentation as never);
  return () => {
    videoEl.removeEventListener('enterpictureinpicture', onEnter);
    videoEl.removeEventListener('leavepictureinpicture', onLeave);
    videoEl.removeEventListener(
      'webkitpresentationmodechanged' as never,
      onPresentation as never,
    );
  };
}
