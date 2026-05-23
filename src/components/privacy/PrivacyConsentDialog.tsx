import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Shield } from "lucide-react";
import { getConsent, setConsent } from "@/lib/privacyConsent";

/**
 * Pkg223 / M18 — First-launch privacy consent.
 * Shows once when the user has never answered. Choice is persisted
 * via privacyConsent helpers; native Firebase Analytics + Crashlytics
 * collection follows automatically.
 */
export function PrivacyConsentDialog() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => {
      if (getConsent() === null) setOpen(true);
    }, 1200);
    return () => clearTimeout(t);
  }, []);

  const decide = (state: "granted" | "denied") => {
    setConsent(state);
    setOpen(false);
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && decide("denied")}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <div className="mx-auto mb-2 flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
            <Shield className="h-6 w-6 text-primary" />
          </div>
          <DialogTitle className="text-center">Help us improve MeriLive</DialogTitle>
          <DialogDescription className="text-center">
            Share anonymous usage and crash data so we can make the app faster
            and more stable. You can change this anytime in Settings → Privacy.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter className="flex-col gap-2 sm:flex-col">
          <Button className="w-full" onClick={() => decide("granted")}>
            Allow
          </Button>
          <Button variant="ghost" className="w-full" onClick={() => decide("denied")}>
            No thanks
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default PrivacyConsentDialog;
