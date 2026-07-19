import { useEffect, useRef, useState } from "react";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { InAppUpdate, type InstallStatus } from "@/plugins/InAppUpdate";
import { APP_UPDATE_DISMISSED_VERSION_KEY } from "@/hooks/useAppUpdate";

const DISMISS_KEY = APP_UPDATE_DISMISSED_VERSION_KEY;
const IMMEDIATE_THRESHOLD_DAYS = 14; // force immediate if 2+ weeks stale

/**
 * Pkg224 / M19 — In-App Update prompt.
 *
 * - On mount + on resume: check Play Store for an available update.
 * - If staleness >= 14 days and immediate flow is allowed → launch
 *   IMMEDIATE flow (blocking, OS-driven).
 * - Otherwise → toast offering FLEXIBLE flow (background download), and
 *   when DOWNLOADED prompt the user to restart via completeUpdate().
 * - Per-versionCode dismissal so we don't nag the same build twice.
 */
export function useInAppUpdate() {
  const { toast } = useToast();
  const startedRef = useRef(false);

  useEffect(() => {
    if (!InAppUpdate.isSupported()) return;
    let cancelled = false;

    const promptRestart = () => {
      toast({
        title: "Update ready",
        description: "Restart MeriLive to finish installing the latest version.",
        duration: 10000,
        action: (
          <Button size="sm" onClick={() => InAppUpdate.complete()}>
            Restart
          </Button>
        ) as any,
      });
    };

    const runCheck = async () => {
      const info = await InAppUpdate.check();
      if (cancelled || !info || !info.available) return;

      // Already downloaded from a previous session → just prompt restart.
      if (info.installStatus === "DOWNLOADED") {
        promptRestart();
        return;
      }

      const dismissedFor = Number(localStorage.getItem(DISMISS_KEY) || 0);
      const stale = info.stalenessDays >= IMMEDIATE_THRESHOLD_DAYS;

      if (stale && info.immediate && !startedRef.current) {
        startedRef.current = true;
        await InAppUpdate.start("immediate");
        return;
      }

      if (info.flexible && dismissedFor !== info.versionCode) {
        toast({
            <Button
              size="sm"
              onClick={async () => {
                startedRef.current = true;
                await InAppUpdate.start("flexible");
              }}
            >
              Update
            </Button>
          ) as any,
          onOpenChange: (open: boolean) => {
            if (!open) localStorage.setItem(DISMISS_KEY, String(info.versionCode));
          },
        } as any);
      }
    };

    const handle = InAppUpdate.addListener((e) => {
      const s = e.status as InstallStatus;
      if (s === "DOWNLOADED") promptRestart();
    });

    runCheck();
    // Pkg360 NO-AUTO-REFRESH: removed visibilitychange re-check.
    // Update check fires once on app start.

    return () => {
      cancelled = true;
      handle.then((h) => h.remove()).catch(() => {});
    };

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}
