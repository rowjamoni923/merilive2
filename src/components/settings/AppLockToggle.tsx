/**
 * Pkg210 — Settings row: biometric app lock toggle.
 * Drop into Settings.tsx wherever convenient.
 */
import { useEffect, useState } from 'react';
import { Fingerprint } from 'lucide-react';
import { Switch } from '@/components/ui/switch';
import { toast } from 'sonner';
import { BiometricAuth, BiometricAvailability } from '@/plugins/BiometricAuth';
import { useAppLock } from '@/hooks/useAppLock';

export default function AppLockToggle() {
  const { enabled, toggle } = useAppLock();
  const [avail, setAvail] = useState<BiometricAvailability | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    BiometricAuth.isAvailable().then(setAvail).catch(() => setAvail(null));
  }, []);

  const onChange = async (next: boolean) => {
    if (!avail?.available) {
      toast.error(
        avail?.reason === 'none_enrolled'
          ? 'No fingerprint/face/PIN set up on this device'
          : 'Biometric unlock is not available on this device',
      );
      return;
    }
    setBusy(true);
    const ok = await toggle(next);
    setBusy(false);
    if (!ok) toast.error('Verification failed');
    else toast.success(next ? 'App Lock enabled' : 'App Lock disabled');
  };

  return (
    <div className="flex items-center justify-between rounded-lg bg-card/50 p-4">
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10 text-primary">
          <Fingerprint className="h-5 w-5" />
        </div>
        <div>
          <p className="text-sm font-medium text-foreground">App Lock</p>
          <p className="text-xs text-muted-foreground">
            Require fingerprint, face, or PIN to open the app
          </p>
        </div>
      </div>
      <Switch checked={enabled} onCheckedChange={onChange} disabled={busy} />
    </div>
  );
}
