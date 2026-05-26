/* Pkg B pass-2: this SW is deprecated.
 * The unified service worker now lives at /firebase-messaging-sw.js.
 * If any old client is still registered here, self-destruct so the new SW takes over.
 */
self.addEventListener('install', function() { self.skipWaiting(); });
self.addEventListener('activate', function(event) {
  event.waitUntil((async function () {
    try {
      const reg = await self.registration.unregister();
      if (reg) {
        // Zero-refresh policy: unregister this deprecated worker silently.
        // Do NOT navigate clients; that looked like random app auto-reloads.
      }
    } catch (e) {}
  })());
});
