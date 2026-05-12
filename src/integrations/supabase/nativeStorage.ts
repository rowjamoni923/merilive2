/**
 * Hybrid auth storage for Supabase client.
 *
 * On native (Capacitor Android / iOS) the WebView's localStorage can be
 * wiped by the OS when the app is killed or memory is reclaimed, which
 * causes the user to be signed out on next launch. We mirror every
 * Supabase auth write into Capacitor Preferences (Android EncryptedSharedPreferences
 * / iOS Keychain) so the session survives until the user manually signs out
 * or signs in on another device.
 *
 * On web we fall back to plain localStorage.
 */
import { Capacitor } from "@capacitor/core";

const IS_NATIVE = (() => {
  try {
    return Capacitor.isNativePlatform();
  } catch {
    return false;
  }
})();

// In-memory mirror so synchronous reads from supabase-js don't miss data
// while the async Preferences read is in flight.
const memCache = new Map<string, string>();

let prefsModulePromise: Promise<typeof import("@capacitor/preferences")> | null = null;
const getPrefs = () => {
  if (!IS_NATIVE) return null;
  if (!prefsModulePromise) {
    prefsModulePromise = import("@capacitor/preferences").catch((e) => {
      console.warn("[supabase-storage] Failed to load Capacitor Preferences:", e);
      throw e;
    });
  }
  return prefsModulePromise;
};

// Eagerly hydrate the in-memory cache from native storage on app boot
// so the first synchronous getItem() call after launch already returns
// the persisted Supabase session.
const hydrationPromise: Promise<void> = (async () => {
  if (!IS_NATIVE) return;
  try {
    const mod = await getPrefs();
    if (!mod) return;
    const { keys } = await mod.Preferences.keys();
    const supaKeys = keys.filter((k) => k.startsWith("sb-"));
    await Promise.all(
      supaKeys.map(async (k) => {
        try {
          const { value } = await mod.Preferences.get({ key: k });
          if (value != null) {
            memCache.set(k, value);
            try {
              window.localStorage.setItem(k, value);
            } catch {
              /* ignore */
            }
          }
        } catch {
          /* ignore single-key errors */
        }
      })
    );
    console.log(`[supabase-storage] Hydrated ${supaKeys.length} key(s) from native storage`);
  } catch (e) {
    console.warn("[supabase-storage] Hydration failed:", e);
  }
})();

export const waitForNativeAuthHydration = () => hydrationPromise;

const writeNative = (key: string, value: string) => {
  const mod = getPrefs();
  if (!mod) return;
  void mod.then(({ Preferences }) =>
    Preferences.set({ key, value }).catch((e) =>
      console.warn(`[supabase-storage] set ${key} failed:`, e)
    )
  );
};

const removeNative = (key: string) => {
  const mod = getPrefs();
  if (!mod) return;
  void mod.then(({ Preferences }) =>
    Preferences.remove({ key }).catch((e) =>
      console.warn(`[supabase-storage] remove ${key} failed:`, e)
    )
  );
};

/**
 * Supabase auth requires a synchronous Storage-like interface. We satisfy that
 * by reading from localStorage / in-memory cache synchronously, while
 * asynchronously mirroring writes into Capacitor Preferences on native.
 */
export const supabaseAuthStorage: Storage = {
  get length() {
    try {
      return window.localStorage.length;
    } catch {
      return memCache.size;
    }
  },
  clear() {
    try {
      window.localStorage.clear();
    } catch {
      /* ignore */
    }
    if (IS_NATIVE) {
      const mod = getPrefs();
      if (mod) {
        void mod.then(({ Preferences }) => Preferences.clear().catch(() => {}));
      }
    }
    memCache.clear();
  },
  key(index: number) {
    try {
      return window.localStorage.key(index);
    } catch {
      return Array.from(memCache.keys())[index] ?? null;
    }
  },
  getItem(key: string) {
    try {
      const v = window.localStorage.getItem(key);
      if (v != null) return v;
    } catch {
      /* ignore */
    }
    return memCache.get(key) ?? null;
  },
  setItem(key: string, value: string) {
    try {
      window.localStorage.setItem(key, value);
    } catch {
      /* ignore */
    }
    memCache.set(key, value);
    if (IS_NATIVE && key.startsWith("sb-")) {
      writeNative(key, value);
    }
  },
  removeItem(key: string) {
    try {
      window.localStorage.removeItem(key);
    } catch {
      /* ignore */
    }
    memCache.delete(key);
    if (IS_NATIVE && key.startsWith("sb-")) {
      removeNative(key);
    }
  },
};
