/**
 * Pkg152 — Host publish-layer (simulcast) picker UI.
 *
 * Phase 3 #10. Lets the host choose Low / Medium / High / Ultra tier for the
 * camera publish stack. 📱 Portrait 9:16 aspect is enforced inside the presets
 * — this UI cannot change aspect, only resolution & layer count.
 *
 * Takes effect on the NEXT live start (LiveKit publishDefaults bake at Room
 * construction). The dialog surfaces that clearly.
 */
import { memo, useCallback, useEffect, useState } from "react";
import { Layers } from "lucide-react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import {
  PUBLISH_LAYER_PRESETS,
  PUBLISH_LAYER_TIERS,
  getPublishLayerTier,
  setPublishLayerTier,
  type PublishLayerTier,
} from "@/lib/livekitPublishLayers";

export interface PublishLayersDialogProps {
  open: boolean;
  onClose: () => void;
}

export const PublishLayersDialog = memo(function PublishLayersDialog({
  open,
  onClose,
}: PublishLayersDialogProps) {
  const [tier, setTier] = useState<PublishLayerTier>(() => getPublishLayerTier());

  useEffect(() => {
    if (open) setTier(getPublishLayerTier());
  }, [open]);

  const pick = useCallback(
    (next: PublishLayerTier) => {
      if (next === tier) return;
      setPublishLayerTier(next);
      setTier(next);
      toast.success(
        `Publish quality set to ${PUBLISH_LAYER_PRESETS[next].label}. Takes effect on your next live.`,
      );
    },
    [tier],
  );

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <Layers className="w-5 h-5 text-violet-500" />
            Publish quality
          </DialogTitle>
        </DialogHeader>

        <p className="text-xs text-muted-foreground -mt-2">
          Choose how many camera layers your phone uploads. Lower tiers save
          data &amp; battery. Vertical 9:16 portrait stays the same.
        </p>

        <div className="flex flex-col gap-2 mt-2">
          {PUBLISH_LAYER_TIERS.map((t) => {
            const cfg = PUBLISH_LAYER_PRESETS[t];
            const active = tier === t;
            const layerCount = 1 + cfg.simulcastLayers.length;
            return (
              <button
                key={t}
                type="button"
                onClick={() => pick(t)}
                aria-pressed={active}
                className={cn(
                  "text-left rounded-xl border p-3 transition active:scale-[0.99]",
                  active
                    ? "border-violet-400 bg-violet-500/10 ring-1 ring-violet-400/50"
                    : "border-border bg-muted/30 hover:bg-muted/50",
                )}
              >
                <div className="flex items-center justify-between">
                  <span className="text-sm font-semibold">{cfg.label}</span>
                  <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
                    {cfg.resolution.width}×{cfg.resolution.height} ·{" "}
                    {layerCount} layer{layerCount > 1 ? "s" : ""}
                  </span>
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  {cfg.description}
                </p>
              </button>
            );
          })}
        </div>

        <p className="text-[11px] text-muted-foreground mt-3">
          Note: Changes apply the next time you go live.
        </p>
      </DialogContent>
    </Dialog>
  );
});
