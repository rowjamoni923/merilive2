import { registerPlugin } from '@capacitor/core';

/**
 * Pkg440 — ImageCropper
 *
 * Native Android image cropper backed by Yalantis UCrop.
 * Aspect-locked, pinch-zoom, rotate, optional circular preview.
 * Web fallback: returns the source unchanged (no native cropper).
 */
export interface ImageCropperCropOptions {
  /**
   * Source image. Accepts:
   * - file:// or content:// URI
   * - absolute filesystem path
   * - data:image/...;base64,XXXX
   */
  sourceUri: string;
  /** Aspect-ratio numerator (default 1). Ignored when freeStyle=true. */
  aspectX?: number;
  /** Aspect-ratio denominator (default 1). */
  aspectY?: number;
  /** Max output width in px (default 1080). */
  maxWidth?: number;
  /** Max output height in px (default 1080). */
  maxHeight?: number;
  /** JPEG quality 1..100 (default 90). Ignored for png. */
  quality?: number;
  /** Output format (default 'jpeg'). */
  format?: 'jpeg' | 'png';
  /** Allow user to drag any aspect ratio (default false = locked). */
  freeStyle?: boolean;
  /** Circular preview mask (avatar UX). Output is still rectangular. */
  circular?: boolean;
}

export interface ImageCropperCropResult {
  /** Base64 (no data URI prefix). Empty when cancelled=true. */
  base64: string;
  mime: string;
  width: number;
  height: number;
  sizeBytes: number;
  /** True when user cancelled the cropper. */
  cancelled: boolean;
}

export interface ImageCropperPlugin {
  crop(opts: ImageCropperCropOptions): Promise<ImageCropperCropResult>;
}

export const ImageCropper = registerPlugin<ImageCropperPlugin>('ImageCropper', {
  web: () => ({
    async crop(opts: ImageCropperCropOptions): Promise<ImageCropperCropResult> {
      // Web fallback: no native cropper available — return source unchanged.
      // Callers should detect cancelled=false + width=-1 and fall back to <canvas> crop.
      const src = opts?.sourceUri ?? '';
      let base64 = '';
      let mime = opts?.format === 'png' ? 'image/png' : 'image/jpeg';
      if (src.startsWith('data:')) {
        const comma = src.indexOf(',');
        if (comma > 0) {
          base64 = src.substring(comma + 1);
          const m = /^data:([^;]+);/.exec(src);
          if (m) mime = m[1];
        }
      }
      return {
        base64,
        mime,
        width: -1,
        height: -1,
        sizeBytes: base64 ? Math.floor(base64.length * 0.75) : 0,
        cancelled: false,
      };
    },
  }),
});
