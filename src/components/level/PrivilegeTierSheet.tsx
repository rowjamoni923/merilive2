import { useEffect, useMemo, useRef, useState } from "react";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Lock, Check, Sparkles } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import { SmartImage } from "@/components/ui/smart-image";
import { motion } from "framer-motion";

export interface PrivilegeTier {
  id: string;
  privilege_type: string;
  unlock_level: number;
  name: string;
  description: string | null;
  animation_url: string | null;
  preview_url: string | null;
  icon_bg_color: string | null;
  icon_color: string | null;
  is_active: boolean;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  categoryType: string;
  categoryName: string;
  categoryDescription?: string;
  currentLevel: number;
}

const PrivilegeTierSheet = ({
  open,
  onOpenChange,
  categoryType,
  categoryName,
  categoryDescription,
  currentLevel,
}: Props) => {
  const [tiers, setTiers] = useState<PrivilegeTier[]>([]);
  const [loading, setLoading] = useState(false);
  const currentRowRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    const fetchTiers = async () => {
      setLoading(true);
      const { data, error } = await (supabase as any)
        .from("level_privilege_tiers")
        .select("id, privilege_type, unlock_level, name, description, animation_url, preview_url, icon_bg_color, icon_color, is_active")
        .eq("privilege_type", categoryType)
        .eq("is_active", true)
        .order("unlock_level", { ascending: true });
      if (cancelled) return;
      if (error) {
        console.error("[PrivilegeTierSheet] fetch error", error);
        setTiers([]);
      } else {
        setTiers((data as PrivilegeTier[]) || []);
      }
      setLoading(false);
    };
    fetchTiers();
    return () => {
      cancelled = true;
    };
  }, [open, categoryType]);

  // Auto-scroll to highest unlocked tier
  useEffect(() => {
    if (!open || loading) return;
    const t = setTimeout(() => {
      currentRowRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 150);
    return () => clearTimeout(t);
  }, [open, loading, tiers, currentLevel]);

  const highestUnlocked = useMemo(() => {
    const unlocked = tiers.filter((t) => t.unlock_level <= currentLevel);
    if (unlocked.length === 0) return null;
    return unlocked[unlocked.length - 1];
  }, [tiers, currentLevel]);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="bottom"
        className="h-[90vh] rounded-t-3xl p-0 overflow-hidden bg-gradient-to-b from-white via-amber-50 to-white border-t border-amber-100"
      >
        <SheetHeader className="px-5 pt-5 pb-3 text-left">
          <SheetTitle className="text-lg font-bold text-slate-800 flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-amber-500" />
            {categoryName}
          </SheetTitle>
          {categoryDescription && (
            <SheetDescription className="text-slate-500 text-sm">
              {categoryDescription}
            </SheetDescription>
          )}
          <div className="text-xs text-slate-500 mt-1">
            Your level: <span className="font-semibold text-slate-700">Lv{currentLevel}</span>
            {tiers.length > 0 && (
              <>
                {" "}· {tiers.filter((t) => t.unlock_level <= currentLevel).length}/{tiers.length} unlocked
              </>
            )}
          </div>
        </SheetHeader>

        <div className="px-5 pb-8 overflow-y-auto h-[calc(90vh-110px)] overscroll-contain" style={{ WebkitOverflowScrolling: "touch" }}>
          {loading ? (
            <div className="space-y-3 mt-2">
              {[...Array(5)].map((_, i) => (
                <div key={i} className="h-24 rounded-2xl bg-slate-100 animate-pulse" />
              ))}
            </div>
          ) : tiers.length === 0 ? (
            <div className="text-center py-16 text-slate-500">
              <Lock className="w-10 h-10 mx-auto mb-3 text-slate-300" />
              <p className="font-medium text-slate-600">No tiers available yet</p>
              <p className="text-sm mt-1">Check back soon — new tiers are added regularly.</p>
            </div>
          ) : (
            <div className="space-y-3 mt-2">
              {tiers.map((tier) => {
                const isUnlocked = tier.unlock_level <= currentLevel;
                const isHighest = highestUnlocked?.id === tier.id;
                const bg = tier.icon_bg_color || "#FEE2E2";
                const fg = tier.icon_color || "#EF4444";
                return (
                  <motion.div
                    key={tier.id}
                    ref={isHighest ? currentRowRef : undefined}
                    initial={{ opacity: 0, y: 12 }}
                    animate={{ opacity: 1, y: 0 }}
                    className={cn(
                      "rounded-2xl border p-3 flex items-center gap-3 transition-all",
                      isUnlocked
                        ? "bg-white border-amber-200 shadow-sm"
                        : "bg-slate-50 border-slate-200 opacity-80",
                      isHighest && "ring-2 ring-amber-400 ring-offset-1",
                    )}
                  >
                    {/* Level badge */}
                    <div
                      className="w-14 h-14 rounded-xl flex flex-col items-center justify-center shrink-0 text-white text-xs font-bold"
                      style={{ background: `linear-gradient(135deg, ${bg}, ${fg})` }}
                    >
                      <span className="text-[10px] opacity-90">LV</span>
                      <span className="text-lg leading-none">{tier.unlock_level}</span>
                    </div>

                    {/* Preview */}
                    <div className="w-16 h-16 rounded-xl bg-slate-100 border border-slate-200 flex items-center justify-center overflow-hidden shrink-0">
                      {tier.preview_url ? (
                        <SmartImage
                          src={tier.preview_url}
                          alt={tier.name}
                          className={cn(
                            "w-full h-full object-cover",
                            !isUnlocked && "grayscale opacity-70",
                          )}
                          fallbackSrc="/placeholder.svg"
                        />
                      ) : (
                        <Sparkles className={cn("w-7 h-7", isUnlocked ? "text-amber-500" : "text-slate-400")} />
                      )}
                    </div>

                    {/* Info */}
                    <div className="flex-1 min-w-0">
                      <div className="font-semibold text-slate-800 truncate">{tier.name}</div>
                      {tier.description && (
                        <div className="text-xs text-slate-500 line-clamp-2 mt-0.5">{tier.description}</div>
                      )}
                      <div className="mt-1.5">
                        {isUnlocked ? (
                          <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded-full">
                            <Check className="w-3 h-3" /> Unlocked
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-xs font-medium text-slate-600 bg-slate-200 px-2 py-0.5 rounded-full">
                            <Lock className="w-3 h-3" /> Reach Lv{tier.unlock_level} to unlock
                          </span>
                        )}
                      </div>
                    </div>
                  </motion.div>
                );
              })}
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
};

export default PrivilegeTierSheet;
