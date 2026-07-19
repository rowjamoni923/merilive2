/**
 * Native Session Storage
 * 
 * On native Android/iOS, WebView localStorage can be cleared by the OS
 * when the app is killed or memory is reclaimed. This utility uses
 * Capacitor Preferences (native key-value storage) to persist the
 * Supabase session so users stay logged in until they manually log out.
 */
import { Capacitor } from '@capacitor/core';

const SESSION_KEY = 'meri_supabase_session';
const IS_NATIVE = Capacitor.isNativePlatform();

interface StoredSession {
  access_token: string;
  refresh_token: string;
  expires_at?: number;
}

/**
 * Save session tokens to native storage (only on native platforms)
 */
export const saveSessionToNative = async (session: {
  access_token: string;
  refresh_token: string;
  expires_at?: number;
}): Promise<void> => {
  if (!IS_NATIVE) return;

  try {
    const { Preferences } = await import('@capacitor/preferences');
    const data: StoredSession = {
    };
    await Preferences.set({
      key: SESSION_KEY,
      value: JSON.stringify(data),
    });
    console.log('[NativeSession] ✅ Session saved to native storage');
  } catch (error) {
    console.error('[NativeSession] Failed to save session:', error);
  }
};

/**
 * Restore session tokens from native storage
 */
export const getSessionFromNative = async (): Promise<StoredSession | null> => {
  if (!IS_NATIVE) return null;

  try {
    const { Preferences } = await import('@capacitor/preferences');
    const { value } = await Preferences.get({ key: SESSION_KEY });
    if (!value) return null;

    const data = JSON.parse(value) as StoredSession;
    console.log('[NativeSession] 📦 Session restored from native storage');
    return data;
  } catch (error) {
    console.error('[NativeSession] Failed to restore session:', error);
    return null;
  }
};

/**
 * Clear session from native storage (call on manual logout)
 */
export const clearNativeSession = async (): Promise<void> => {
  if (!IS_NATIVE) return;

  try {
    const { Preferences } = await import('@capacitor/preferences');
    await Preferences.remove({ key: SESSION_KEY });
    console.log('[NativeSession] 🗑️ Session cleared from native storage');
  } catch (error) {
    console.error('[NativeSession] Failed to clear session:', error);
  }
};
