/**
 * Pkg210 — Full-screen overlay shown while the app is biometric-locked.
 * Mounted once near the App root; renders nothing when unlocked.
 */
import { useEffect, useState } from 'react';
import { Lock, Fingerprint } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAppLock } from '@/hooks/useAppLock';

export default function AppLockGate() {
  const { enabled, isLocked, unlock } = useAppLock();
  const [busy, setBusy] = useState(false);
  const [autoTried, setAutoTried] = useState(false);

  // Auto-prompt biometric on lock (one attempt; user can retry with button)
  useEffect(() => {
    if (enabled && isLocked && !autoTried) {
      setAutoTried(true);
      setBusy(true);
      unlock().finally(() => setBusy(false));
    }
    if (!isLocked) setAutoTried(false);
  }, [enabled, isLocked, autoTried, unlock]);

  if (!enabled || !isLocked) return null;

  const onUnlock = async () => {
    setBusy(true);
    try { await unlock(); } finally { setBusy(false); }
  };

  return (
    <div
      className="fixed inset-0 z-[100000] flex flex-col items-center justify-center gap-6 bg-background/95 backdrop-blur-xl"
      role="dialog"
      aria-modal="true"
      aria-label="App locked"
    >
      <div className="flex h-20 w-20 items-center justify-center rounded-full bg-primary/15 text-primary">
        <Lock className="h-10 w-10" />
      </div>
      <div className="text-center">
        <h2 className="text-xl font-semibold text-foreground">MeriLive is locked</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Unlock with fingerprint, face, or screen lock to continue
        </p>
      </div>
      <Button onClick={onUnlock} disabled={busy} size="lg" className="gap-2">
        <Fingerprint className="h-5 w-5" />
        {busy ? 'Verifying…' : 'Unlock'}
      </Button>
    </div>
  );
}
