import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { PageSkeleton } from "@/components/common/PageSkeleton";

import { ArrowLeft, Wrench, RotateCcw, ShieldAlert } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { useDevAccess } from "@/hooks/useDevAccess";
import {
  NATIVE_FLAG_META,
  NativeFlagKey,
  getAllNativeFlags,
  setNativeFlag,
  resetAllNativeFlags,
  subscribeNativeFlags,
} from "@/utils/nativeFlags";

/**
 * DeveloperOptions
 *
 * Hidden screen — visible ONLY to whitelisted developer emails
 * (see src/config/devAccess.ts).
 *
 * Provides toggles for native (Android) feature flags. All flags default
 * to OFF so toggling has no effect until the matching native module is
 * wired into the corresponding screen. Safe to ship — pure infra.
 */
export default function DeveloperOptions() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { hasAccess, loading } = useDevAccess();

  const [flags, setFlags] = useState<Record<NativeFlagKey, boolean>>(() =>
    getAllNativeFlags(),
  );

  // Stay in sync with cross-tab / programmatic changes
  useEffect(() => {
    const unsub = subscribeNativeFlags(() => setFlags(getAllNativeFlags()));
    return unsub;
  }, []);

  // Hard redirect for non-whitelisted accounts (defense-in-depth — Settings
  // already hides the entry, but a guessed URL must also be blocked).
  useEffect(() => {
    if (!loading && !hasAccess) {
      navigate("/", { replace: true });
    }
  }, [loading, hasAccess, navigate]);

  if (loading) {
    return <PageSkeleton className="mobile-page bg-background" rows={4} />;
  }


  if (!hasAccess) {
    // useEffect above will redirect; render nothing in the meantime.
    return null;
  }

  const handleToggle = (key: NativeFlagKey, next: boolean) => {
    setNativeFlag(key, next);
    setFlags((prev) => ({ ...prev, [key]: next }));
    toast({
      title: next ? "Flag enabled" : "Flag disabled",
      description: `${key} → ${next ? "ON" : "OFF"}`,
    });
  };

  const handleResetAll = () => {
    resetAllNativeFlags();
    setFlags(getAllNativeFlags());
    toast({
      title: "All flags reset",
      description: "Every native flag is now OFF (web mode).",
    });
  };

  return (
    <div className="mobile-page bg-background">
      {/* Header */}
      <div
        className="mobile-header bg-card/95 backdrop-blur-xl"
        style={{
          boxShadow:
            "0 4px 14px -8px rgba(15,23,42,0.18), inset 0 -1px 0 hsl(var(--border))",
        }}
      >
        <div className="flex items-center h-14 px-4">
          <button
            onClick={() => navigate(-1)}
            className="h-9 w-9 -ml-1 rounded-full bg-card flex items-center justify-center transition-all hover:-translate-y-0.5 active:translate-y-0"
            style={{
              boxShadow:
                "0 4px 10px -4px rgba(15,23,42,0.18), inset 0 1px 0 rgba(255,255,255,0.7), 0 0 0 1px hsl(var(--border))",
            }}
            aria-label="Back"
          >
            <ArrowLeft className="w-5 h-5 text-foreground" />
          </button>
          <div className="ml-3 flex items-center gap-2">
            <Wrench className="w-5 h-5 text-primary" />
            <h1 className="text-base font-semibold text-foreground">
              Developer Options
            </h1>
          </div>
        </div>
      </div>

      <div className="mobile-page-scrollable px-4 py-4 space-y-4">
        {/* Warning banner */}
        <div className="rounded-xl border border-border bg-card p-3 flex gap-3">
          <ShieldAlert className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" />
          <div className="text-xs text-muted-foreground leading-relaxed">
            <span className="text-foreground font-medium">
              Internal use only.
            </span>{" "}
            These flags switch parts of the app from the web stack to native
            (Android) implementations. Toggling a flag is safe — it has no
            effect until the matching native module ships. Defaults to all OFF.
          </div>
        </div>

        {/* Flag list */}
        <div className="rounded-xl border border-border bg-card divide-y divide-border overflow-hidden">
          {NATIVE_FLAG_META.filter(m => !m.hidden).map((meta) => {
            const value = flags[meta.key];
            return (
              <label
                key={meta.key}
                htmlFor={`flag-${meta.key}`}
                className="flex items-start gap-3 px-4 py-3.5 cursor-pointer active:bg-muted/40"
              >
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium text-foreground">
                    {meta.label}
                  </div>
                  <div className="text-xs text-muted-foreground mt-0.5 leading-relaxed">
                    {meta.description}
                  </div>
                </div>
                <Switch
                  id={`flag-${meta.key}`}
                  checked={value}
                  onCheckedChange={(v) => handleToggle(meta.key, v)}
                  className="mt-0.5"
                />
              </label>
            );
          })}
        </div>

        {/* Reset */}
        <Button
          variant="outline"
          className="w-full"
          onClick={handleResetAll}
        >
          <RotateCcw className="w-4 h-4 mr-2" />
          Reset all to default (OFF)
        </Button>

        <div className="text-[11px] text-muted-foreground text-center pt-2 pb-6">
          Build {`v${(import.meta as any).env?.MODE ?? "prod"}`} · flags stored
          per-device
        </div>
      </div>
    </div>
  );
}
