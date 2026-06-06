export type NativeFlagKey =
  | 'imageNative'
  | 'reelsNative'
  | 'chatUINative'
  | 'socketNative'
  | 'feedNative'
  | 'routerShellNative'
  | 'videoPrecache'
  | 'pipCall'
  | 'giftPanelNative';

export interface NativeFlagMeta {
  key: NativeFlagKey;
  label: string;
  description: string;
}

export const NATIVE_FLAG_META: NativeFlagMeta[] = [
  {
    key: 'imageNative',
    label: 'Native Image Loader',
    description: 'Use Glide (Android) for optimized image loading and prefetching.',
  },
  {
    key: 'reelsNative',
    label: 'Native Reels Player',
    description: 'Use ExoPlayer (Android) for smooth, high-fps video scrolling.',
  },
  {
    key: 'chatUINative',
    label: 'Native Chat UI',
    description: 'Use native RecyclerView for ultra-smooth 60fps chat lists.',
  },
  {
    key: 'socketNative',
    label: 'Native WebSocket',
    description: 'Use OkHttp native transport for resilient real-time connections.',
  },
  {
    key: 'feedNative',
    label: 'Native Feed Grid',
    description: 'Use native RecyclerView for high-performance home/discover feeds.',
  },
  {
    key: 'routerShellNative',
    label: 'Native Router Shell',
    description: 'Use native system navigation bars and overlays.',
  },
  {
    key: 'videoPrecache',
    label: 'Native Video Pre-cache',
    description: 'Pre-warm video buffers in the background to eliminate loading icons.',
  },
  {
    key: 'pipCall',
    label: 'Native PiP Call',
    description: 'Enable Picture-in-Picture floating window during active calls.',
  },
  {
    key: 'giftPanelNative',
    label: 'Native Gift Panel',
    description: 'Use Material BottomSheet for buttery smooth gift selecting.',
  },
];

export type NativeFlags = Record<NativeFlagKey, boolean>;

const STORAGE_PREFIX = 'native-flag:';

export const getNativeFlag = (key: NativeFlagKey): boolean => {
  try {
    return localStorage.getItem(STORAGE_PREFIX + key) === 'on';
  } catch {
    return false;
  }
};

export const setNativeFlag = (key: NativeFlagKey, enabled: boolean): void => {
  try {
    localStorage.setItem(STORAGE_PREFIX + key, enabled ? 'on' : 'off');
    window.dispatchEvent(new Event('native-flags-changed'));
  } catch { /* noop */ }
};

export const getAllNativeFlags = (): NativeFlags => {
  const out: Partial<NativeFlags> = {};
  NATIVE_FLAG_META.forEach((m) => {
    out[m.key] = getNativeFlag(m.key);
  });
  return out as NativeFlags;
};

export const resetAllNativeFlags = (): void => {
  NATIVE_FLAG_META.forEach((m) => {
    setNativeFlag(m.key, false);
  });
};

export const subscribeNativeFlags = (cb: () => void): () => void => {
  window.addEventListener('native-flags-changed', cb);
  return () => window.removeEventListener('native-flags-changed', cb);
};
