/**
 * Camera rebuild 2026-06-14: native beauty engine removed.
 * Filename kept for backwards compatibility with existing admin routes.
 */
import { AlertTriangle, Sparkles } from "lucide-react";
import { Switch } from "@/components/ui/switch";

export default function AdminTencentBeautySettings() {
  return (
    <div className="space-y-6 p-2">
      <div className="rounded-2xl border border-border bg-card p-5">
        <div className="flex items-center gap-3 mb-2">
          <div className="w-10 h-10 rounded-xl bg-primary/15 text-primary flex items-center justify-center">
            <Sparkles className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-base font-semibold text-foreground">
              Beauty Engine
            </h2>
            <p className="text-xs text-muted-foreground">
              Disabled to protect single-camera stability
            </p>
          </div>
        </div>
        <div className="flex items-start gap-2 rounded-lg bg-amber-500/10 text-amber-700 dark:text-amber-300 text-[11px] p-2">
          <AlertTriangle className="w-3.5 h-3.5 mt-[2px] shrink-0" />
          <span>Native beauty was removed from the APK. Live, party, and private call now use only the LiveKit camera path.</span>
        </div>
      </div>

      <div className="rounded-2xl border border-border bg-card p-5">
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1">
            <h3 className="text-sm font-semibold text-foreground mb-1">
              Broadcast Beauty Injection (Pkg201)
            </h3>
            <p className="text-xs text-muted-foreground mb-2">
              When ON, the beauty filter is applied to the outgoing live
              video so viewers also see the processed face — not just the
              host. When OFF (default), beauty is preview-only.
            </p>
            <div className="flex items-start gap-2 rounded-lg bg-amber-500/10 text-amber-700 dark:text-amber-300 text-[11px] p-2">
              <AlertTriangle className="w-3.5 h-3.5 mt-[2px] shrink-0" />
              <span>
                Test on a single device first. If you see black frames or
                stutter, toggle OFF — broadcast falls back to raw camera
                instantly with no restart.
              </span>
            </div>
          </div>
          <Switch checked={false} disabled />
        </div>
      </div>
    </div>
  );
}
