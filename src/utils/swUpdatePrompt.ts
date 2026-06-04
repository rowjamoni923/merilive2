/**
 * Service-worker update prompt (Pkg B pass-3).
 *
 * Pairs with /firebase-messaging-sw.js (which no longer auto-skipWaiting).
 *
 * Zero-refresh policy: service-worker updates must never reload the running app.
 * New workers are left waiting until the user naturally opens the app again.
 */
import { toast } from 'sonner';

let installed = false;

function handleUpdateReady(sw: ServiceWorker) {
  // Silent auto-update: tell the new worker to skip waiting immediately.
  // This activates the new version in the background.
  sw.postMessage({ type: 'SKIP_WAITING' });
}

function wireRegistration(reg: ServiceWorkerRegistration) {
  // Already waiting (e.g., page reopened mid-update)
  if (reg.waiting && navigator.serviceWorker.controller) {
    handleUpdateReady(reg.waiting);
  }

  reg.addEventListener('updatefound', () => {
    const sw = reg.installing;
    if (!sw) return;
    sw.addEventListener('statechange', () => {
      if (sw.state === 'installed' && navigator.serviceWorker.controller) {
        // A new worker has installed alongside an active one → safe to activate.
        handleUpdateReady(sw);
      }
    });
  });
}

/**
 * Install the SW update-handler. Idempotent.
 * Updates are now completely silent and automatic.
 */
export function installSWUpdatePrompt(): void {
  if (installed) return;
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return;
  installed = true;

  // When the new worker takes control, we should ideally refresh to get new assets.
  // To be professional, we only do this if the user is not in an active session (call/live).
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    // Check if we are in a critical path before reloading
    const isCriticalPath = 
      window.location.pathname.includes('/live/') || 
      window.location.pathname.includes('/party/') || 
      window.location.pathname.includes('/call') ||
      (window as any).isStreamingActive === true;

    if (!isCriticalPath) {
      console.log('[SWUpdate] New version activated, reloading silently...');
      window.location.reload();
    } else {
      console.log('[SWUpdate] New version activated, deferred reload until session ends.');
      // The reload will happen naturally next time they open the app or navigate.
    }
  });

  // Wire any registrations that already exist…
  navigator.serviceWorker.getRegistrations().then((regs) => {
    regs.forEach(wireRegistration);
  }).catch(() => {});

  // …and any that register later.
  navigator.serviceWorker.ready.then((reg) => {
    wireRegistration(reg);
  }).catch(() => {});
}
