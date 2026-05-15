/**
 * MandatoryPermissionsGate
 * ------------------------
 * Full-screen, non-dismissable in-app permission prompt that mirrors what
 * other live-streaming apps (Bigo, Chamet, Tango) show on first launch.
 *
 * Behavior:
 *   - Shows ONLY on the native Android app, only when at least one required
 *     permission (Camera, Microphone, Notifications) is missing.
 *   - One big "Allow All" button → fires the native system dialog directly.
 *     The user never has to leave the app to grant permissions in the normal
 *     flow.
 *   - If — and only if — the user previously tapped "Don't ask again" so the
 *     system dialog can no longer appear, we surface an "Open Settings"
 *     button as a last-resort fallback. We auto re-check on app resume so
 *     the gate disappears the moment they grant access in Settings.
 *   - Cannot be skipped, swiped away, or back-button-dismissed.
 *
 * Location requirement is treated as OPTIONAL here (used only for geo
 * attribution); the gate does not block on it.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { Camera, Mic, Bell, Shield, Loader2, Settings as SettingsIcon } from 'lucide-react';
import {
  isNativeApp,
  checkPermissionStatus,
  requestAllPermissions,
  openNativeAppPermissionSettings,
  canRequestAgain,
} from '@/utils/nativePermissions';
import { permLog } from '@/utils/permissionDebugLog';

const REQUIRED_KEYS = ['camera', 'microphone', 'notifications'] as const;
type Status = { camera: boolean; microphone: boolean; location: boolean; notifications: boolean };

const allRequiredGranted = (s: Status) =>
  REQUIRED_KEYS.every((k) => s[k]);

export function MandatoryPermissionsGate() {
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<Status>({
    camera: false, microphone: false, location: false, notifications: false,
  });
  const [canPrompt, setCanPrompt] = useState<Status>({
    camera: true, microphone: true, location: true, notifications: true,
  });
  const mounted = useRef(true);

  const refresh = useCallback(async () => {
    const [s, c] = await Promise.all([checkPermissionStatus(), canRequestAgain()]);
    if (!mounted.current) return;
    setStatus(s);
    setCanPrompt(c);
    if (allRequiredGranted(s)) {
      setShow(false);
      try { localStorage.setItem('meri_permissions_granted', '1'); } catch { /* noop */ }
    } else {
      setShow(true);
    }
  }, []);

  useEffect(() => {
    mounted.current = true;
    if (!isNativeApp()) return;
    refresh();

    let removeResume: (() => void) | undefined;
    (async () => {
      try {
        const { App } = await import('@capacitor/app');
        const sub = await App.addListener('appStateChange', (st) => {
          if (st.isActive) refresh();
        });
        removeResume = () => sub.remove();
      } catch { /* noop */ }
    })();

    return () => {
      mounted.current = false;
      removeResume?.();
    };
  }, [refresh]);

  const handleAllow = useCallback(async () => {
    if (busy) return;
    setBusy(true);
    try {
      await requestAllPermissions();
    } finally {
      await refresh();
      if (mounted.current) setBusy(false);
    }
  }, [busy, refresh]);

  const handleOpenSettings = useCallback(async () => {
    await openNativeAppPermissionSettings();
  }, []);

  if (!isNativeApp() || !show) return null;

  // If the system dialog is no longer available for ALL still-missing
  // required permissions, the only path forward is App Settings.
  const missing = REQUIRED_KEYS.filter((k) => !status[k]);
  const allMissingPermanentlyDenied =
    missing.length > 0 && missing.every((k) => !canPrompt[k]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="perm-gate-title"
      className="fixed inset-0 z-[9999] flex items-center justify-center p-5"
      style={{
        background:
          'radial-gradient(circle at 30% 20%, #1a1145 0%, #0a0a1a 70%, #000 100%)',
      }}
      // Block all pointer interaction with the rest of the app
      onClick={(e) => e.stopPropagation()}
    >
      <div className="w-full max-w-sm rounded-3xl border border-white/10 bg-[#141432]/90 p-6 shadow-2xl backdrop-blur-xl">
        {/* Header */}
        <div className="mb-5 flex flex-col items-center text-center">
          <div className="mb-3 flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-indigo-500 to-fuchsia-500 shadow-lg">
            <Shield className="h-8 w-8 text-white" strokeWidth={2.2} />
          </div>
          <h2 id="perm-gate-title" className="text-xl font-bold text-white">
            Permissions Required
          </h2>
          <p className="mt-1 text-sm leading-relaxed text-white/70">
            meriLIVE needs the following to deliver live streams, video calls
            and real-time alerts.
          </p>
        </div>

        {/* Permission rows */}
        <div className="mb-5 space-y-2.5">
          <PermissionRow
            icon={<Camera className="h-5 w-5" />}
            label="Camera"
            description="Required to go live and join video calls."
            granted={status.camera}
          />
          <PermissionRow
            icon={<Mic className="h-5 w-5" />}
            label="Microphone"
            description="Required for voice during calls and party rooms."
            granted={status.microphone}
          />
          <PermissionRow
            icon={<Bell className="h-5 w-5" />}
            label="Notifications"
            description="Get notified about gifts, calls and follows."
            granted={status.notifications}
          />
        </div>

        {/* Action button(s) */}
        {allMissingPermanentlyDenied ? (
          <>
            <p className="mb-3 rounded-xl border border-amber-400/30 bg-amber-500/10 px-3 py-2 text-center text-xs text-amber-200">
              You previously chose "Don't ask again". Please enable the
              permissions in App Settings — the screen will close automatically
              once you return.
            </p>
            <button
              type="button"
              onClick={handleOpenSettings}
              className="flex h-12 w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-indigo-500 to-fuchsia-500 text-base font-semibold text-white shadow-lg active:scale-[0.98]"
            >
              <SettingsIcon className="h-5 w-5" />
              Open App Settings
            </button>
          </>
        ) : (
          <button
            type="button"
            disabled={busy}
            onClick={handleAllow}
            className="flex h-12 w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-indigo-500 to-fuchsia-500 text-base font-semibold text-white shadow-lg active:scale-[0.98] disabled:opacity-60"
          >
            {busy ? (
              <>
                <Loader2 className="h-5 w-5 animate-spin" />
                Requesting…
              </>
            ) : (
              'Allow All'
            )}
          </button>
        )}

        <p className="mt-3 text-center text-[11px] leading-relaxed text-white/40">
          You stay inside the app — system dialogs handle the actual grant.
        </p>
      </div>
    </div>
  );
}

function PermissionRow({
  icon, label, description, granted,
}: { icon: React.ReactNode; label: string; description: string; granted: boolean }) {
  return (
    <div className="flex items-start gap-3 rounded-2xl border border-white/5 bg-white/5 p-3">
      <div
        className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${
          granted
            ? 'bg-emerald-500/20 text-emerald-300'
            : 'bg-white/10 text-white/80'
        }`}
      >
        {icon}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-2">
          <p className="text-sm font-semibold text-white">{label}</p>
          <span
            className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${
              granted
                ? 'bg-emerald-500/20 text-emerald-300'
                : 'bg-white/10 text-white/60'
            }`}
          >
            {granted ? 'Granted' : 'Needed'}
          </span>
        </div>
        <p className="mt-0.5 text-xs leading-snug text-white/60">{description}</p>
      </div>
    </div>
  );
}

export default MandatoryPermissionsGate;
