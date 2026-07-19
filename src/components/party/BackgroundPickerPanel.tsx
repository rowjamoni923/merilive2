import { useState, useEffect, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, Check, Sparkles, Lock, Loader2, ImageOff, Crown, ShieldAlert, RotateCcw } from "lucide-react";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { getProxiedUrl } from "@/utils/r2ProxyUrl";
import Diamond3DIcon from "@/components/common/Diamond3DIcon";

interface Background {
  id: string;
  name: string;
  image_url?: string;
  gradient_css?: string;
  category: string;
  price_diamonds: number;
  is_premium: boolean;
  min_level?: number;
}

interface BackgroundPickerPanelProps {
  isOpen: boolean;
  onClose: () => void;
  roomId: string;
  currentBackgroundId?: string;
  onSelectBackground: (background: Background | null) => void;
  isHost: boolean;
}

export function BackgroundPickerPanel({
  isOpen,
  onClose,
  roomId,
  currentBackgroundId,
  onSelectBackground,
  isHost,
}: BackgroundPickerPanelProps) {
  const [backgrounds, setBackgrounds] = useState<Background[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(currentBackgroundId || null);
  const [userDiamonds, setUserDiamonds] = useState(0);
  const [userLevel, setUserLevel] = useState(0);
  const [purchasedBgs, setPurchasedBgs] = useState<string[]>([]);
  const [updating, setUpdating] = useState(false);
  const [confirmBg, setConfirmBg] = useState<Background | null>(null);
  const [purchasing, setPurchasing] = useState(false);

  useEffect(() => {
    if (isOpen) {
      void fetchBackgrounds();
      void fetchUserData();
    }
  }, [isOpen]);

  useEffect(() => {
    setSelectedId(currentBackgroundId || null);
  }, [currentBackgroundId]);

  const fetchBackgrounds = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("party_room_backgrounds")
        .select("*")
        .eq("is_active", true)
        .not("image_url", "is", null)
        .order("display_order", { ascending: true });
      if (error) throw error;
      const valid = (data || []).filter((bg: any) => bg.image_url && bg.image_url.trim() !== "");
      setBackgrounds(valid as Background[]);
    } catch (error) {
      console.error("Error fetching backgrounds:", error);
    } finally {
      setLoading(false);
    }
  };

  const fetchUserData = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const { data } = await supabase
      .from("profiles")
      .select("diamonds, user_level")
      .eq("id", user.id)
      .single();
    if (data) {
      setUserDiamonds((data as any).diamonds || 0);
      setUserLevel((data as any).user_level || 0);
    }
    const { data: purchasedData } = await (supabase
      .from("user_purchased_backgrounds" as any)
      .select("background_id")
      .eq("user_id", user.id)
      .eq("is_active", true) as any);
    if (purchasedData) setPurchasedBgs(purchasedData.map((p: any) => p.background_id));
  };

  const applyBackground = async (bg: Background | null) => {
    setUpdating(true);
    if (bg) setSelectedId(bg.id);
    try {
      const { error } = await supabase
        .from("party_rooms")
        .update({ background_url: bg?.image_url || null } as any)
        .eq("id", roomId);
      if (error) throw error;

      void import("@/lib/livekitPartyEventsSignaling").then(({ publishRoomStateChanged }) =>
        publishRoomStateChanged(roomId, {
          background: bg
            ? {
                id: bg.id,
                image_url: bg.image_url ?? null,
                gradient_css: (bg as any).gradient_css ?? null,
              }
            : null,
          background_url: bg?.image_url ?? null,
        }),
      );

      onSelectBackground(bg);
      toast.success(bg ? "Background updated" : "Reset to default");
      onClose();
    } catch (error: any) {
      console.error("Error updating background:", error);
      toast.error(error?.message || "Failed to update background");
    } finally {
      setUpdating(false);
    }
  };

  const handleSelect = (bg: Background) => {
    if (!isHost) {
      toast.error("Only the host can change the background");
      return;
    }
    const required = bg.min_level ?? 0;
    if (required > 0 && userLevel < required) {
      toast.error(`Requires Level ${required}+ (you are Level ${userLevel})`);
      return;
    }
    if (bg.is_premium && !purchasedBgs.includes(bg.id)) {
      setConfirmBg(bg);
      return;
    }
    void applyBackground(bg);
  };

  const handleConfirmPurchase = async () => {
    if (!confirmBg) return;
    if (userDiamonds < confirmBg.price_diamonds) {
      toast.error(`Need ${confirmBg.price_diamonds.toLocaleString()} diamonds`);
      return;
    }
    setPurchasing(true);
    try {
      const { data, error } = await (supabase as any).rpc("purchase_party_background", {
        _background_id: confirmBg.id,
      });
      if (error) throw error;
      const result = data as any;
      if (!result?.success) throw new Error(result?.error || "Purchase failed");

      const newBalance = Number(result.new_balance ?? userDiamonds - (result.price_paid ?? confirmBg.price_diamonds));
      setUserDiamonds(Number.isFinite(newBalance) ? newBalance : userDiamonds - confirmBg.price_diamonds);
      setPurchasedBgs((prev) => [...prev, confirmBg.id]);
      toast.success(`Unlocked ${confirmBg.name}`);
      const bg = confirmBg;
      setConfirmBg(null);
      await applyBackground(bg);
    } catch (error: any) {
      console.error("Purchase error:", error);
      toast.error(error?.message || "Purchase failed");
    } finally {
      setPurchasing(false);
    }
  };

  const { freeBackgrounds, premiumBackgrounds } = useMemo(() => {
    return {
      freeBackgrounds: backgrounds.filter((bg) => !bg.is_premium),
      premiumBackgrounds: backgrounds.filter((bg) => bg.is_premium),
    };
  }, [backgrounds]);

  const renderBgTile = (bg: Background, accent: "violet" | "amber") => {
    const selected = selectedId === bg.id;
    const isLocked = (bg.min_level ?? 0) > 0 && userLevel < (bg.min_level ?? 0);
    const isPremiumLocked = bg.is_premium && !purchasedBgs.includes(bg.id);
    const isOwned = bg.is_premium && purchasedBgs.includes(bg.id);
    const tone = accent === "amber"
      ? { ring: "rgba(251,191,36,0.85)", glow: "rgba(251,191,36,0.55)", base: "rgba(251,191,36,0.18)" }
      : { ring: "rgba(168,85,247,0.85)", glow: "rgba(168,85,247,0.55)", base: "rgba(255,255,255,0.08)" };

    return (
      <motion.button
        key={bg.id}
        whileTap={{ scale: 0.96 }}
        onClick={() => handleSelect(bg)}
        disabled={updating || !isHost}
        className={cn(
          "relative aspect-[4/3] rounded-2xl overflow-hidden transition-all",
          !isHost && "opacity-60 cursor-not-allowed",
        )}
        style={{
          border: selected ? `2px solid ${tone.ring}` : `1px solid ${tone.base}`,
          boxShadow: selected
            ? `0 6px 22px -6px ${tone.glow}, inset 0 1px 0 rgba(255,255,255,0.10)`
            : "inset 0 1px 0 rgba(255,255,255,0.06)",
        }}
      >
        {bg.image_url ? (
          <img
            src={getProxiedUrl(bg.image_url)}
            alt={bg.name}
            loading="lazy"
            decoding="async"
            className="absolute inset-0 w-full h-full object-cover"
            onError={(e) => {
              (e.currentTarget as HTMLImageElement).style.display = "none";
            }}
          />
        ) : (
          <div className={cn("absolute inset-0", bg.gradient_css)} />
        )}

        <div
          className="pointer-events-none absolute inset-0"
          style={{
          }}
        />

        {isLocked && (
          <div className="absolute inset-0 bg-black/65 backdrop-blur-[2px] flex flex-col items-center justify-center gap-1 z-10">
            <Lock className="w-4 h-4 text-white" />
            <span className="text-white text-[10px] font-bold">Lvl {bg.min_level}+</span>
          </div>
        )}

        {isPremiumLocked && !isLocked && (
          <div className="absolute inset-0 bg-black/40 flex items-center justify-center">
            <div
              className="flex items-center gap-1 px-2 py-1 rounded-full border border-amber-400/40"
              style={{
              }}
            >
              <Diamond3DIcon size={12} />
              <span className="text-white text-[10px] font-bold tabular-nums">
                {bg.price_diamonds.toLocaleString()}
              </span>
            </div>
          </div>
        )}

        {selected && (
          <>
            <div
              className="absolute inset-0 pointer-events-none"
              style={{
                animation: "giftSendShine 2.6s ease-in-out infinite",
              }}
            />
            <motion.div
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ type: "spring", damping: 18, stiffness: 420 }}
              className="absolute top-1.5 right-1.5 w-5 h-5 rounded-full flex items-center justify-center z-10"
              style={{
                background:
                  accent === "amber"
                    ? "linear-gradient(135deg, #fbbf24 0%, #f59e0b 100%)"
                    : "linear-gradient(135deg, #a855f7 0%, #ec4899 100%)",
              }}
            >
              <Check className="w-3 h-3 text-white" strokeWidth={3} />
            </motion.div>
          </>
        )}

        {bg.is_premium && (
          <div className="absolute top-1.5 left-1.5">
            <Crown className="w-3.5 h-3.5 text-amber-300 drop-shadow-[0_2px_6px_rgba(251,191,36,0.6)]" />
          </div>
        )}

        {isOwned && !selected && (
          <div
            className="absolute top-1.5 right-1.5 px-1.5 py-0.5 rounded-full text-[8px] font-bold text-emerald-50"
            style={{
            }}
          >
            OWNED
          </div>
        )}

        <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/85 via-black/40 to-transparent px-2 py-1.5">
          <span className="text-white text-[10px] font-semibold truncate block">{bg.name}</span>
        </div>
      </motion.button>
    );
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.22, ease: [0.32, 0.72, 0, 1] }}
            className="fixed inset-0 bg-black/65 backdrop-blur-md z-50"
            onClick={onClose}
          />

          <motion.div
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={{ type: "spring", damping: 28, stiffness: 320 }}
            className="fixed bottom-0 left-0 right-0 z-50 rounded-t-[28px] overflow-hidden max-h-[85dvh] border-t border-white/10 shadow-[0_-20px_60px_-10px_rgba(0,0,0,0.6)] flex flex-col"
            style={{
              backdropFilter: "blur(24px)",
              WebkitBackdropFilter: "blur(24px)",
            }}
          >
            <div
              className="pointer-events-none absolute inset-0 opacity-[0.35]"
              style={{
                background:
                  "radial-gradient(60% 40% at 15% 0%, rgba(34,211,238,0.20), transparent 70%), radial-gradient(50% 35% at 90% 10%, rgba(168,85,247,0.18), transparent 70%)",
              }}
            />

            {/* Header */}
            <div className="relative flex items-center justify-between px-5 pt-4 pb-3 border-b border-white/10 shrink-0">
              <div className="absolute top-2 left-1/2 -translate-x-1/2 h-1 w-10 rounded-full bg-white/25" />
              <div className="flex items-center gap-3 mt-1 min-w-0">
                <div
                  className="relative w-11 h-11 rounded-2xl flex items-center justify-center overflow-hidden shrink-0"
                  style={{
                  }}
                >
                  <Sparkles className="w-5 h-5 text-white relative z-10" />
                  <div
                    className="absolute inset-0 pointer-events-none"
                    style={{
                      background:
                        "linear-gradient(115deg, transparent 40%, rgba(255,255,255,0.45) 50%, transparent 60%)",
                    }}
                  />
                </div>
                <div className="min-w-0">
                  <h3
                    className="text-lg font-bold leading-tight truncate"
                    style={{
                      WebkitBackgroundClip: "text",
                      WebkitTextFillColor: "transparent",
                      backgroundClip: "text",
                    }}
                  >
                    Room Background
                  </h3>
                  <p className="text-[11px] text-white/55 mt-0.5 truncate">
                    {isHost ? "Set the vibe for your room" : "Only the host can change this"}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2 mt-1 shrink-0">
                <div
                  className="hidden xs:flex items-center gap-1.5 px-2.5 py-1.5 rounded-full"
                  style={{
                  }}
                >
                  <Diamond3DIcon size={12} />
                  <span className="text-white text-xs font-bold tabular-nums">
                    {userDiamonds.toLocaleString()}
                  </span>
                </div>
                <button
                  onClick={onClose}
                  className="w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 border border-white/10 flex items-center justify-center transition-colors"
                  aria-label="Close"
                >
                  <X className="w-4 h-4 text-white" />
                </button>
              </div>
            </div>

            {/* Non-host banner */}
            {!isHost && (
              <div className="relative px-4 py-2.5 border-b border-white/5 shrink-0">
                <div
                  className="flex items-center gap-2 px-3 py-2 rounded-xl"
                  style={{
                  }}
                >
                  <ShieldAlert className="w-4 h-4 text-amber-300 shrink-0" />
                  <span className="text-amber-100/90 text-[11px]">
                    Only the room host can change the background.
                  </span>
                </div>
              </div>
            )}

            {/* Content */}
            <div
              className="overflow-y-auto flex-1 p-4 pb-safe relative"
              style={{ WebkitOverflowScrolling: "touch", scrollBehavior: "smooth" }}
            >
              {loading ? (
                <div className="space-y-6">
                  {[0, 1].map((s) => (
                    <div key={s}>
                      <div className="h-3 w-24 rounded bg-white/10 mb-3 animate-pulse" />
                      <div className="grid grid-cols-3 gap-2.5">
                        {Array.from({ length: 6 }).map((_, i) => (
                          <div
                            key={i}
                            className="aspect-[4/3] rounded-2xl bg-white/[0.06] border border-white/5 animate-pulse"
                          />
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              ) : backgrounds.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-16 text-center">
                  <div
                    className="w-16 h-16 rounded-2xl flex items-center justify-center mb-3"
                    style={{
                    }}
                  >
                    <ImageOff className="w-7 h-7 text-white/40" />
                  </div>
                  <p className="text-white/80 text-sm font-semibold">No backgrounds available</p>
                  <p className="text-white/50 text-xs mt-1">Check back soon — new themes drop weekly</p>
                </div>
              ) : (
                <>
                  {/* Reset to default */}
                  {isHost && (
                    <button
                      onClick={() => void applyBackground(null)}
                      disabled={updating || !currentBackgroundId}
                      className={cn(
                        "w-full mb-5 flex items-center justify-center gap-2 px-4 py-2.5 rounded-full text-xs font-semibold transition-all",
                        "border border-white/10 text-white/85 hover:text-white",
                        "disabled:opacity-40 disabled:cursor-not-allowed",
                      )}
                      style={{
                        background:
                          "linear-gradient(135deg, rgba(255,255,255,0.08), rgba(255,255,255,0.03))",
                      }}
                    >
                      <RotateCcw className="w-3.5 h-3.5" />
                      Reset to default
                    </button>
                  )}

                  {/* Free */}
                  {freeBackgrounds.length > 0 && (
                    <div className="mb-6">
                      <div className="flex items-center gap-2 mb-3">
                        <h4 className="text-[11px] font-semibold text-white/75 uppercase tracking-wider">
                          Free Backgrounds
                        </h4>
                        <span className="text-[10px] text-white/40 tabular-nums">
                          {freeBackgrounds.length}
                        </span>
                        <div className="flex-1 h-px bg-gradient-to-r from-white/10 to-transparent" />
                      </div>
                      <div className="grid grid-cols-3 gap-2.5">
                        {freeBackgrounds.map((bg) => renderBgTile(bg, "violet"))}
                      </div>
                    </div>
                  )}

                  {/* Premium */}
                  {premiumBackgrounds.length > 0 && (
                    <div>
                      <div className="flex items-center gap-2 mb-3">
                        <h4
                          className="text-[11px] font-semibold uppercase tracking-wider"
                          style={{
                          }}
                        >
                          Premium Backgrounds
                        </h4>
                        <Crown className="w-3.5 h-3.5 text-amber-300" />
                        <span className="text-[10px] text-amber-200/50 tabular-nums">
                          {premiumBackgrounds.length}
                        </span>
                        <div className="flex-1 h-px bg-gradient-to-r from-amber-400/30 to-transparent" />
                      </div>
                      <div className="grid grid-cols-3 gap-2.5">
                        {premiumBackgrounds.map((bg) => renderBgTile(bg, "amber"))}
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>

            {/* Updating overlay */}
            {updating && (
              <div className="absolute inset-0 bg-black/40 backdrop-blur-[2px] flex items-center justify-center z-20 pointer-events-none">
                <div className="flex items-center gap-2 px-4 py-2 rounded-full bg-white/10 border border-white/15">
                  <Loader2 className="w-4 h-4 animate-spin text-cyan-300" />
                  <span className="text-white text-xs font-medium">Applying…</span>
                </div>
              </div>
            )}
          </motion.div>

          {/* Purchase confirmation */}
          <AnimatePresence>
            {confirmBg && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="fixed inset-0 z-[60] bg-black/75 backdrop-blur-md flex items-end sm:items-center justify-center p-4"
                onClick={() => !purchasing && setConfirmBg(null)}
              >
                <motion.div
                  initial={{ y: 40, opacity: 0, scale: 0.96 }}
                  animate={{ y: 0, opacity: 1, scale: 1 }}
                  exit={{ y: 40, opacity: 0, scale: 0.96 }}
                  transition={{ type: "spring", damping: 26, stiffness: 320 }}
                  className="w-full max-w-sm rounded-3xl overflow-hidden border border-white/10"
                  style={{
                  }}
                  onClick={(e) => e.stopPropagation()}
                >
                  <div className="relative aspect-[4/3] overflow-hidden">
                    {confirmBg.image_url ? (
                      <img loading="lazy" decoding="async"
                        src={getProxiedUrl(confirmBg.image_url)}
                        alt={confirmBg.name}
                        className="absolute inset-0 w-full h-full object-cover"
 />
                    ) : (
                      <div className={cn("absolute inset-0", confirmBg.gradient_css)} />
                    )}
                    <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/20 to-transparent" />
                    <div className="absolute top-3 left-3 flex items-center gap-1.5 px-2 py-1 rounded-full bg-black/45 border border-amber-300/40 backdrop-blur-sm">
                      <Crown className="w-3 h-3 text-amber-300" />
                      <span className="text-amber-100 text-[10px] font-bold tracking-wider uppercase">
                        Premium
                      </span>
                    </div>
                    <button
                      onClick={() => !purchasing && setConfirmBg(null)}
                      className="absolute top-3 right-3 w-8 h-8 rounded-full bg-black/45 hover:bg-black/65 border border-white/15 flex items-center justify-center backdrop-blur-sm"
                      aria-label="Close"
                    >
                      <X className="w-4 h-4 text-white" />
                    </button>
                    <div className="absolute bottom-3 left-4 right-4">
                      <h3 className="text-white text-lg font-bold drop-shadow">{confirmBg.name}</h3>
                    </div>
                  </div>

                  <div className="p-5 space-y-4">
                    <div className="grid grid-cols-2 gap-2.5">
                      <div
                        className="rounded-xl p-3 text-center"
                        style={{
                        }}
                      >
                        <p className="text-white/55 text-[10px] uppercase tracking-wider mb-1">Price</p>
                        <div className="flex items-center justify-center gap-1.5">
                          <Diamond3DIcon size={14} />
                          <span className="text-amber-200 font-bold tabular-nums">
                            {confirmBg.price_diamonds.toLocaleString()}
                          </span>
                        </div>
                      </div>
                      <div
                        className="rounded-xl p-3 text-center"
                        style={{
                        }}
                      >
                        <p className="text-white/55 text-[10px] uppercase tracking-wider mb-1">Balance</p>
                        <div className="flex items-center justify-center gap-1.5">
                          <Diamond3DIcon size={14} />
                          <span
                            className={cn(
                              "font-bold tabular-nums",
                              userDiamonds >= confirmBg.price_diamonds ? "text-emerald-300" : "text-red-300",
                            )}
                          >
                            {userDiamonds.toLocaleString()}
                          </span>
                        </div>
                      </div>
                    </div>

                    <p className="text-white/60 text-[11px] text-center leading-relaxed">
                      One-time unlock. This background stays yours forever.
                    </p>

                    {userDiamonds < confirmBg.price_diamonds ? (
                      <button
                        onClick={() => {
                          setConfirmBg(null);
                          onClose();
                          window.location.href = "/recharge";
                        }}
                        className="w-full py-3 rounded-full font-bold text-white transition-all active:scale-95"
                        style={{
                          boxShadow:
                            "0 12px 28px -8px rgba(245,158,11,0.55), inset 0 1px 0 rgba(255,255,255,0.30)",
                        }}
                      >
                        Recharge Diamonds
                      </button>
                    ) : (
                      <button
                        onClick={handleConfirmPurchase}
                        disabled={purchasing}
                        className="w-full py-3 rounded-full font-bold text-white transition-all active:scale-95 disabled:opacity-60"
                        style={{
                          boxShadow:
                            "0 14px 32px -8px rgba(168,85,247,0.60), inset 0 1px 0 rgba(255,255,255,0.25)",
                        }}
                      >
                        {purchasing ? (
                          <span className="flex items-center justify-center gap-2">
                            <Loader2 className="w-4 h-4 animate-spin" />
                            Unlocking…
                          </span>
                        ) : (
                          <span className="flex items-center justify-center gap-2">
                            <Diamond3DIcon size={14} />
                            Unlock & Apply
                          </span>
                        )}
                      </button>
                    )}

                    <button
                      onClick={() => !purchasing && setConfirmBg(null)}
                      disabled={purchasing}
                      className="w-full py-2 text-white/55 text-xs font-medium hover:text-white/80 transition-colors disabled:opacity-40"
                    >
                      Maybe later
                    </button>
                  </div>
                </motion.div>
              </motion.div>
            )}
          </AnimatePresence>
        </>
      )}
    </AnimatePresence>
  );
}

export default BackgroundPickerPanel;
