/**
 * Service-worker update prompt (Pkg B pass-3).
 *
 * Pairs with /firebase-messaging-sw.js (which no longer auto-skipWaiting).
 *
 * When a new SW is detected in the `waiting` state we show a sonner toast.
 * On user-confirm we postMessage SKIP_WAITING to the waiting worker, wait for
 * `controllerchange` (= new SW now controls the page), and then reload so the
 * user gets a fresh JS/CSS bundle that matches the new SW's cache.
 */
import { toast } from 'sonner';

let installed = false;
let reloading = false;

function promptForReload(waiting: ServiceWorker) {
  // De-dupe if the same prompt is already on screen
  toast('New version available', {
    id: 'sw-update-prompt',
    description: 'Reload to get the latest update.',
    duration: Infinity,
    action: {
      label: 'Reload',
      onClick: () => {
        try {
          waiting.postMessage({ type: 'SKIP_WAITING' });
        } catch {
          // If postMessage fails (e.g., worker died), just reload — the next
          // page load will pick up the new SW via its own install path.
          window.location.reload();
        }
      },
    },
  });
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

  // Single global handler: when the active SW changes, the new one has taken
  // control — reload exactly once so cached chunks match.
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (reloading) return;
    reloading = true;
    try { window.location.reload(); } catch {}
  });

  // Wire any registrations that already exist…
  navigator.serviceWorker.getRegistrations().then((regs) => {
    regs.forEach(wireRegistration);
  }).catch(() => {});

  // …and any that register later (FCM/image-cache call register() lazily).
  navigator.serviceWorker.ready.then((reg) => {
    wireRegistration(reg);
    // Light hourly poll for backend updates while the tab stays open.
    try {
      setInterval(() => { reg.update().catch(() => {}); }, 60 * 60 * 1000);
    } catch {}
  }).catch(() => {});
}
