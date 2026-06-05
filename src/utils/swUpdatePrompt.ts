/**
 * Service-worker update prompt (Pkg B pass-3).
 *
 * Pairs with /firebase-messaging-sw.js (which no longer auto-skipWaiting).
 *
 * Zero-refresh policy: service-worker updates must never reload the running app.
 * New workers are left waiting until the user naturally opens the app again.
 */
// Zero-noise policy: no toast/banner — new SW silently waits and activates
// the next time the app is opened. UI keeps updating live via realtime.

let installed = false;

function promptForReload(_waiting: ServiceWorker) {
  // Intentionally silent — do NOT show any "new version" banner to users.
  // The waiting worker will take over on next natural app open.
}

function wireRegistration(reg: ServiceWorkerRegistration) {
  // Already waiting (e.g., page reopened mid-update)
  if (reg.waiting && navigator.serviceWorker.controller) {
    promptForReload(reg.waiting);
  }

  reg.addEventListener('updatefound', () => {
    const sw = reg.installing;
    if (!sw) return;
    sw.addEventListener('statechange', () => {
      if (sw.state === 'installed' && navigator.serviceWorker.controller) {
        // A new worker has installed alongside an active one → safe to prompt.
        promptForReload(sw);
      }
    });
  });
}

/**
 * Install the SW update-prompt listener. Idempotent.
 * Safe to call after any registration (boot, FCM, image-cache warm).
 */
export function installSWUpdatePrompt(): void {
  if (installed) return;
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return;
  installed = true;

  // Zero-refresh policy: never reload on service-worker controller changes.
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    console.log('[SWUpdate] Controller changed — auto reload disabled');
  });

  // Wire any registrations that already exist…
  navigator.serviceWorker.getRegistrations().then((regs) => {
    regs.forEach(wireRegistration);
  }).catch(() => {});

  // …and any that register later (FCM/image-cache call register() lazily).
  navigator.serviceWorker.ready.then((reg) => {
    wireRegistration(reg);
    // Zero-refresh policy: no periodic service-worker update polling.
  }).catch(() => {});
}
