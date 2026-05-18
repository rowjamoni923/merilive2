/**
 * App version — bump on each release.
 * Shown in splash screen and Settings → About on web.
 *
 * On native Android/iOS, splash + Settings read the LIVE installed version
 * via Capacitor App.getInfo() (which mirrors android/app/build.gradle
 * versionName). This constant is the web fallback only — keep it in sync
 * with android/app/build.gradle so web and native display the same number.
 */
export const APP_VERSION = '1.0.1';
export const APP_BUILD = '40';

