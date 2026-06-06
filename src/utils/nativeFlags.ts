/**
 * Native feature-flag store.
 *
 * Lets the development team enable/disable native (Android) implementations
 * of various app surfaces WITHOUT rebuilding. Flags live in localStorage so
 * they survive reloads and are per-device.
 *
 * SAFETY MODEL
 * ------------
 * - All flags default to FALSE → the app behaves exactly like today (web mode).
 * - Toggling a flag has NO EFFECT until the corresponding native module is
 *   wired into the relevant screen. This file is a control surface only.
 * - Flags are read-on-demand; consumers should also subscribe to changes if
 *   they need live updates.
 * - Reset-to-default wipes every flag.
 *
 * Adding a new flag: add its key to NATIVE_FLAG_KEYS below. Everything else
 * (UI, storage, subscribe) picks it up automatically.
 */

export const NATIVE_FLAG_KEYS = [
  "nativeImageLoader",
  "nativeFeed",
  "nativeChatUI",
  "nativeReelsPlayer",
  "nativeStorage",
  "webSocketBridge",
  "nativeRouterShell",
  "videoPrecache",
] as const;

export type NativeFlagKey = (typeof NATIVE_FLAG_KEYS)[number];

export interface NativeFlagMeta {
  key: NativeFlagKey;
  label: string;
  description: string;
}

/** Human-readable metadata for the Developer Options UI. */
export const NATIVE_FLAG_META: ReadonlyArray<NativeFlagMeta> = [
  {
    key: "nativeImageLoader",
    label: "Native Image Loader",
    description:
      "Use Android's native image pipeline (Glide/Coil) instead of <img>. Lower memory, faster decode.",
  },
  {
    key: "nativeFeed",
    label: "Native Feed",
    description:
      "Render the home feed with a native RecyclerView. Smoother scrolling, less JS work.",
  },
  {
    key: "nativeChatUI",
    label: "Native Chat UI",
    description:
      "Use a native chat list + composer. Faster keyboard handling and message rendering.",
  },
  {
    key: "nativeReelsPlayer",
    label: "Native Reels Player",
    description:
      "Use ExoPlayer for reels. Better preload, lower battery, no white-flash.",
  },
  {
    key: "nativeStorage",
    label: "Native Storage",
    description:
      "Move localStorage/IndexedDB caches to native MMKV. Faster cold-start reads.",
  },
  {
    key: "webSocketBridge",
    label: "Native WebSocket Bridge",
    description:
      "Route Supabase Realtime through a native OkHttp WebSocket. Survives Doze mode better.",
  },
  {
    key: "nativeRouterShell",
    label: "Native Router Shell",
    description:
      "Wrap React routes in a native Activity shell with hardware back-button handling.",
  },
  {
    key: "videoPrecache",
    label: "Native Video Pre-cache",
    description:
      "Warm the next 3 reels into ExoPlayer's 256 MB disk cache so swiping shows the first frame instantly (no buffering spinner).",
  },
];

const STORAGE_PREFIX = "merilive-native-flag:";
const EVENT_NAME = "merilive:native-flag-changed";

function storageKey(key: NativeFlagKey): string {
  return STORAGE_PREFIX + key;
}

function safeRead(key: NativeFlagKey): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.localStorage.getItem(storageKey(key)) === "1";
  } catch {
    return false;
  }
}

function safeWrite(key: NativeFlagKey, value: boolean): void {
  if (typeof window === "undefined") return;
  try {
    if (value) {
      window.localStorage.setItem(storageKey(key), "1");
    } else {
      window.localStorage.removeItem(storageKey(key));
    }
    window.dispatchEvent(
      new CustomEvent(EVENT_NAME, { detail: { key, value } }),
    );
  } catch {
    /* quota / private mode — silent no-op */
  }
}

/** Read a single flag (defaults to false). */
export function getNativeFlag(key: NativeFlagKey): boolean {
  return safeRead(key);
}

/** Write a single flag. */
export function setNativeFlag(key: NativeFlagKey, value: boolean): void {
  safeWrite(key, value);
}

/** Read all flags as a record. */
export function getAllNativeFlags(): Record<NativeFlagKey, boolean> {
  const out = {} as Record<NativeFlagKey, boolean>;
  for (const k of NATIVE_FLAG_KEYS) out[k] = safeRead(k);
  return out;
}

/** Reset every flag to false. */
export function resetAllNativeFlags(): void {
  for (const k of NATIVE_FLAG_KEYS) safeWrite(k, false);
}

/**
 * Subscribe to any flag change. Returns an unsubscribe function.
 * Fires for both same-tab writes and cross-tab storage events.
 */
export function subscribeNativeFlags(
  listener: (key: NativeFlagKey, value: boolean) => void,
): () => void {
  if (typeof window === "undefined") return () => {};

  const onCustom = (e: Event) => {
    const detail = (e as CustomEvent).detail as
      | { key: NativeFlagKey; value: boolean }
      | undefined;
    if (detail) listener(detail.key, detail.value);
  };

  const onStorage = (e: StorageEvent) => {
    if (!e.key || !e.key.startsWith(STORAGE_PREFIX)) return;
    const k = e.key.slice(STORAGE_PREFIX.length) as NativeFlagKey;
    if ((NATIVE_FLAG_KEYS as ReadonlyArray<string>).includes(k)) {
      listener(k, e.newValue === "1");
    }
  };

  window.addEventListener(EVENT_NAME, onCustom);
  window.addEventListener("storage", onStorage);
  return () => {
    window.removeEventListener(EVENT_NAME, onCustom);
    window.removeEventListener("storage", onStorage);
  };
}
