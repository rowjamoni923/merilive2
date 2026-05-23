/**
 * BeautyFilterPanel — REMOVED (Pkg200 prep)
 *
 * পুরো বর্তমান beauty UI সরানো হইছে। GPUPixel-based panel আসছে।
 * এই stub শুধু existing imports কে compile-করতে দেয়; কোন UI render হয় না,
 * কোন CSS effect প্রয়োগ হয় না।
 */

export interface BeautySettings {
  smoothness: number;
  whitening: number;
  redness: number;
  sharpness: number;
  glow: number;
  warmth: number;
  eyeBright: number;
  skinTone: number;
  faceSlim: number;
  chinSlim: number;
  eyeEnlarge: number;
  noseNarrow: number;
  lipColor: number;
}

export const DEFAULT_BEAUTY: BeautySettings = {
  smoothness: 0, whitening: 0, redness: 0, sharpness: 0,
  glow: 0, warmth: 0, eyeBright: 0, skinTone: 50,
  faceSlim: 0, chinSlim: 0, eyeEnlarge: 0, noseNarrow: 0, lipColor: 0,
};

interface BeautyFilterPanelProps {
  open?: boolean;
  enabled?: boolean;
  onEnabledChange?: (v: boolean) => void;
  settings?: BeautySettings;
  onSettingsChange?: (s: BeautySettings) => void;
  onClose?: () => void;
  [key: string]: unknown;
}

export function BeautyFilterPanel(_props: BeautyFilterPanelProps) {
  return null;
}

export function generateBeautyCSS(_enabled: boolean, _settings: BeautySettings): string {
  return '';
}
