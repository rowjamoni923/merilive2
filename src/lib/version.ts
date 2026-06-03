/**
 * App version — AUTO-SYNCED from android/app/build.gradle at build time.
 *
 * Single source of truth: android/app/build.gradle
 *   versionName  → APP_VERSION  (e.g. "1.0.1")
 *   versionCode  → APP_BUILD    (e.g. "40")
 *
 * Bump the Android version once and the web/splash/Settings all update
 * automatically on next build. On native, Capacitor App.getInfo() reads
 * the LIVE installed value and overrides these constants.
 */
declare const __ANDROID_VERSION_NAME__: string;
declare const __ANDROID_VERSION_CODE__: string;

export const APP_VERSION: string =
  typeof __ANDROID_VERSION_NAME__ !== 'undefined' ? __ANDROID_VERSION_NAME__ : '1.0.0';
export const APP_BUILD: string =
  typeof __ANDROID_VERSION_CODE__ !== 'undefined' ? __ANDROID_VERSION_CODE__ : '1';
