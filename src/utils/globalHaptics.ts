/**
 * Global UI-tap haptics — DISABLED.
 *
 * Previously this installed a document-wide pointerdown listener that fired a
 * vibration on every button / link / role=button tap. Users reported that the
 * device buzzed randomly on routine UI interaction. Per product decision the
 * device should only vibrate for incoming push notifications, new chat
 * messages, and incoming calls (ringtone) — all of which trigger haptics
 * explicitly through their own code paths (firebaseMessaging, useCallSignaling,
 * etc.) and are unaffected by this change.
 *
 * Kept as a no-op export so existing import sites (main.tsx) keep compiling.
 */
export function installGlobalHaptics() {
  // intentionally no-op
}

