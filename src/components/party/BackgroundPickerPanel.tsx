import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, Check, Sparkles, Lock, Diamond, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { getProxiedUrl } from "@/utils/r2ProxyUrl";

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
  isHost
}: BackgroundPickerPanelProps) {
  const [backgrounds, setBackgrounds] = useState<Background[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(currentBackgroundId || null);
  const [userDiamonds, setUserDiamonds] = useState(0);
  const [userLevel, setUserLevel] = useState(0);
  const [purchasedBgs, setPurchasedBgs] = useState<string[]>([]);
  const [updating, setUpdating] = useState(false);

  useEffect(() => {
    if (isOpen) {
      fetchBackgrounds();
      fetchUserData();
    }
  }, [isOpen]);

  useEffect(() => {
    setSelectedId(currentBackgroundId || null);
  }, [currentBackgroundId]);

  const fetchBackgrounds = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('party_room_backgrounds')
        .select('*')
        .eq('is_active', true)
        .not('image_url', 'is', null) // CRITICAL: Only backgrounds WITH image_url (no gradient-only)
        .order('display_order', { ascending: true });

      if (error) throw error;
      
      // Filter out any that have empty image_url strings
      const validBackgrounds = (data || []).filter(bg => bg.image_url && bg.image_url.trim() !== '');
      setBackgrounds(validBackgrounds);
    } catch (error) {
      console.error('Error fetching backgrounds:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchUserData = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      const { data } = await supabase
        .from('profiles')
        .select('coins, user_level')
        .eq('id', user.id)
        .single();
      
      if (data) {
        setUserDiamonds((data as any).coins || 0);
        setUserLevel((data as any).user_level || 0);
      }
      
      // Fetch purchased backgrounds
      const { data: purchasedData } = await (supabase
        .from('user_purchased_backgrounds' as any)
        .select('background_id')
        .eq('user_id', user.id)
        .eq('is_active', true) as any);
      
      if (purchasedData) {
        setPurchasedBgs(purchasedData.map((p: any) => p.background_id));
      }
    }
  };

  const handleSelect = async (bg: Background) => {
    if (!isHost) {
      toast.error("Only host can change background");
      return;
    }

    // Level gate
    const required = bg.min_level ?? 0;
    if (required > 0 && userLevel < required) {
      toast.error(`Requires Level ${required}+ (you are Level ${userLevel})`);
      return;
    }

    // Check if premium and not purchased
    if (bg.is_premium && !purchasedBgs.includes(bg.id)) {
      // Show purchase dialog
      if (userDiamonds < bg.price_diamonds) {
        toast.error(`Not enough diamonds! Need ${bg.price_diamonds} 💎`);
        return;
      }
      
      // TODO: Implement purchase flow
      toast.info(`Premium background - ${bg.price_diamonds} diamonds required`);
      return;
    }

    setUpdating(true);
    setSelectedId(bg.id);

    try {
      const { error } = await supabase
        .from('party_rooms')
        .update({ background_url: bg.image_url || null } as any)
        .eq('id', roomId);

      if (error) throw error;

      // Pkg81: LiveKit-only fanout — replaces `party-room-bg-${roomId}`
      // Supabase Realtime background_id listener. Host is the sole writer;
      // every participant receives within ~50ms via DataPacket, no extra
      // `party_room_backgrounds` round-trip needed (we pack the row).
      void import('@/lib/livekitPartyEventsSignaling').then(({ publishRoomStateChanged }) =>
        publishRoomStateChanged(roomId, {
          background: {
            id: bg.id,
            image_url: bg.image_url ?? null,
            gradient_css: (bg as any).gradient_css ?? null,
          },
          background_url: bg.image_url ?? null,
        })
      );

      onSelectBackground(bg);
      toast.success("Background updated!");
      onClose();
    } catch (error: any) {
      console.error('Error updating background:', error);
      toast.error(error?.message || "Failed to update background");
    } finally {
      setUpdating(false);
    }
  };

  const freeBackgrounds = backgrounds.filter(bg => !bg.is_premium);
  const premiumBackgrounds = backgrounds.filter(bg => bg.is_premium);

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.22, ease: [0.32, 0.72, 0, 1] }}
            className="fixed inset-0 bg-black/65 backdrop-blur-md z-50"
            onClick={onClose}
          />

          {/* Panel — Pkg164-parity dark glass sheet */}
          <motion.div
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={{ type: "spring", damping: 28, stiffness: 320 }}
            className="fixed bottom-0 left-0 right-0 z-50 rounded-t-[28px] overflow-hidden max-h-[82vh] border-t border-white/10 shadow-[0_-20px_60px_-10px_rgba(0,0,0,0.6)]"
            style={{
              background: 'linear-gradient(180deg, rgba(20,15,35,0.97) 0%, rgba(12,8,24,0.98) 100%)',
              backdropFilter: 'blur(24px)',
              WebkitBackdropFilter: 'blur(24px)',
            }}
          >
            {/* Aurora overlay */}
            <div
              className="pointer-events-none absolute inset-0 opacity-[0.35]"
              style={{
                background:
                  'radial-gradient(60% 40% at 15% 0%, rgba(34,211,238,0.20), transparent 70%), radial-gradient(50% 35% at 90% 10%, rgba(168,85,247,0.18), transparent 70%)',
              }}
            />

            {/* Header */}
            <div className="relative flex items-center justify-between px-5 pt-3 pb-3 border-b border-white/10">
              <div className="absolute top-2 left-1/2 -translate-x-1/2 h-1 w-10 rounded-full bg-white/25" />
              <div className="flex items-center gap-3 mt-2">
                <div
                  className="relative w-11 h-11 rounded-2xl flex items-center justify-center overflow-hidden"
                  style={{
                    background: 'linear-gradient(135deg, #22d3ee 0%, #3b82f6 100%)',
                    boxShadow: '0 6px 18px -4px rgba(59,130,246,0.55), inset 0 1px 0 rgba(255,255,255,0.35)',
                  }}
                >
                  <Sparkles className="w-5 h-5 text-white relative z-10" />
                  <div
                    className="absolute inset-0 pointer-events-none"
                    style={{
                      background: 'linear-gradient(115deg, transparent 40%, rgba(255,255,255,0.45) 50%, transparent 60%)',
                      animation: 'giftSendShine 3.2s ease-in-out infinite',
                    }}
                  />
                </div>
                <div>
                  <h3
                    className="text-lg font-bold leading-tight"
                    style={{
                      background: 'linear-gradient(90deg, #ffffff, #cffafe 60%, #67e8f9)',
                      WebkitBackgroundClip: 'text',
                      WebkitTextFillColor: 'transparent',
                      backgroundClip: 'text',
                    }}
                  >
                    Room Background
                  </h3>
                  <p className="text-[11px] text-white/55 mt-0.5">Choose a background theme</p>
                </div>
              </div>
              <button
                onClick={onClose}
                className="w-8 h-8 mt-2 rounded-full bg-white/10 hover:bg-white/20 border border-white/10 flex items-center justify-center"
              >
                <X className="w-4 h-4 text-white" />
              </button>
            </div>

            {/* Content */}
            <div
              className="overflow-y-auto max-h-[68vh] p-4 pb-safe relative"
              style={{ WebkitOverflowScrolling: 'touch', scrollBehavior: 'smooth' }}
            >
              {loading ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="w-8 h-8 animate-spin text-cyan-400" />
                </div>
              ) : (
                <>
                  {/* Free Backgrounds */}
                  <div className="mb-6">
                    <div className="flex items-center gap-2 mb-3">
                      <h4 className="text-xs font-semibold text-white/75 uppercase tracking-wider">Free Backgrounds</h4>
                      <div className="flex-1 h-px bg-gradient-to-r from-white/10 to-transparent" />
                    </div>
                    <div className="grid grid-cols-3 gap-2.5">
                      {freeBackgrounds.map((bg, idx) => {
                        const selected = selectedId === bg.id;
                        return (
                          <motion.button
                            key={bg.id}
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ type: 'spring', damping: 24, stiffness: 360, delay: Math.min(idx * 0.025, 0.18) }}
                            whileTap={{ scale: 0.96 }}
                            onClick={() => handleSelect(bg)}
                            disabled={updating || !isHost}
                            className={cn(
                              "relative aspect-[4/3] rounded-2xl overflow-hidden transition-all",
                              !isHost && "opacity-60"
                            )}
                            style={{
                              border: selected
                                ? '2px solid rgba(168,85,247,0.85)'
                                : '1px solid rgba(255,255,255,0.08)',
                              boxShadow: selected
                                ? '0 6px 22px -6px rgba(168,85,247,0.55), inset 0 1px 0 rgba(255,255,255,0.10)'
                                : 'inset 0 1px 0 rgba(255,255,255,0.06)',
                            }}
                          >
                            {/* Background Preview */}
                            {bg.image_url ? (
                              <img
                                src={getProxiedUrl(bg.image_url)}
                                alt={bg.name}
                                className="absolute inset-0 w-full h-full object-cover"
                              />
                            ) : (
                              <div className={cn("absolute inset-0", bg.gradient_css)} />
                            )}

                            {/* Edge vignette */}
                            <div
                              className="pointer-events-none absolute inset-0"
                              style={{
                                background:
                                  'radial-gradient(120% 90% at 50% 50%, transparent 58%, rgba(0,0,0,0.35) 100%)',
                              }}
                            />

                            {/* Level lock overlay */}
                            {(bg.min_level ?? 0) > 0 && userLevel < (bg.min_level ?? 0) && (
                              <div className="absolute inset-0 bg-black/60 backdrop-blur-[2px] flex flex-col items-center justify-center gap-1">
                                <Lock className="w-4 h-4 text-white" />
                                <span className="text-white text-[10px] font-bold">Lvl {bg.min_level}+</span>
                              </div>
                            )}

                            {selected && (
                              <>
                                <div
                                  className="absolute inset-0 pointer-events-none"
                                  style={{
                                    background: 'linear-gradient(115deg, transparent 42%, rgba(255,255,255,0.18) 50%, transparent 58%)',
                                    animation: 'giftSendShine 2.6s ease-in-out infinite',
                                  }}
                                />
                                <motion.div
                                  initial={{ scale: 0 }}
                                  animate={{ scale: 1 }}
                                  transition={{ type: 'spring', damping: 18, stiffness: 420 }}
                                  className="absolute top-1.5 right-1.5 w-5 h-5 rounded-full flex items-center justify-center"
                                  style={{
                                    background: 'linear-gradient(135deg, #a855f7 0%, #ec4899 100%)',
                                    boxShadow: '0 4px 12px -2px rgba(168,85,247,0.65), inset 0 1px 0 rgba(255,255,255,0.4)',
                                  }}
                                >
                                  <Check className="w-3 h-3 text-white" />
                                </motion.div>
                              </>
                            )}

                            {/* Label */}
                            <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 to-transparent px-2 py-1.5">
                              <span className="text-white text-[10px] font-medium">{bg.name}</span>
                            </div>
                          </motion.button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Premium Backgrounds */}
                  {premiumBackgrounds.length > 0 && (
                    <div>
                      <div className="flex items-center gap-2 mb-3">
                        <h4 className="text-xs font-semibold uppercase tracking-wider"
                          style={{
                            background: 'linear-gradient(90deg, #fde68a, #fbbf24)',
                            WebkitBackgroundClip: 'text',
                            WebkitTextFillColor: 'transparent',
                            backgroundClip: 'text',
                          }}
                        >
                          Premium Backgrounds
                        </h4>
                        <Sparkles className="w-3.5 h-3.5 text-amber-300" />
                        <div className="flex-1 h-px bg-gradient-to-r from-amber-400/30 to-transparent" />
                      </div>
                      <div className="grid grid-cols-3 gap-2.5">
                        {premiumBackgrounds.map((bg, idx) => {
                          const isPurchased = purchasedBgs.includes(bg.id);
                          const selected = selectedId === bg.id;

                          return (
                            <motion.button
                              key={bg.id}
                              initial={{ opacity: 0, y: 10 }}
                              animate={{ opacity: 1, y: 0 }}
                              transition={{ type: 'spring', damping: 24, stiffness: 360, delay: Math.min(idx * 0.025, 0.18) }}
                              whileTap={{ scale: 0.96 }}
                              onClick={() => handleSelect(bg)}
                              disabled={updating || !isHost}
                              className={cn(
                                "relative aspect-[4/3] rounded-2xl overflow-hidden transition-all",
                                !isHost && "opacity-60"
                              )}
                              style={{
                                border: selected
                                  ? '2px solid rgba(251,191,36,0.85)'
                                  : '1px solid rgba(251,191,36,0.18)',
                                boxShadow: selected
                                  ? '0 6px 22px -6px rgba(251,191,36,0.55), inset 0 1px 0 rgba(255,255,255,0.10)'
                                  : 'inset 0 1px 0 rgba(255,255,255,0.06)',
                              }}
                            >
                              {/* Background Preview */}
                              {bg.image_url ? (
                                <img
                                  src={getProxiedUrl(bg.image_url)}
                                  alt={bg.name}
                                  className="absolute inset-0 w-full h-full object-cover"
                                />
                              ) : (
                                <div className={cn("absolute inset-0", bg.gradient_css)} />
                              )}

                              {/* Edge vignette */}
                              <div
                                className="pointer-events-none absolute inset-0"
                                style={{
                                  background:
                                    'radial-gradient(120% 90% at 50% 50%, transparent 58%, rgba(0,0,0,0.35) 100%)',
                                }}
                              />

                              {/* Level lock overlay */}
                              {(bg.min_level ?? 0) > 0 && userLevel < (bg.min_level ?? 0) && (
                                <div className="absolute inset-0 bg-black/60 backdrop-blur-[2px] flex flex-col items-center justify-center gap-1 z-10">
                                  <Lock className="w-4 h-4 text-white" />
                                  <span className="text-white text-[10px] font-bold">Lvl {bg.min_level}+</span>
                                </div>
                              )}

                              {/* Premium Overlay */}
                              {!isPurchased && (
                                <div className="absolute inset-0 bg-black/35 flex items-center justify-center">
                                  <div
                                    className="flex items-center gap-1 px-2 py-1 rounded-full border border-amber-400/40"
                                    style={{
                                      background: 'linear-gradient(135deg, rgba(0,0,0,0.65), rgba(0,0,0,0.5))',
                                      boxShadow: '0 4px 12px -2px rgba(251,191,36,0.35), inset 0 1px 0 rgba(255,255,255,0.10)',
                                    }}
                                  >
                                    <Diamond className="w-3 h-3 text-cyan-300" />
                                    <span className="text-white text-[10px] font-bold tabular-nums">
                                      {bg.price_diamonds}
                                    </span>
                                  </div>
                                </div>
                              )}

                              {selected && (
                                <>
                                  <div
                                    className="absolute inset-0 pointer-events-none"
                                    style={{
                                      background: 'linear-gradient(115deg, transparent 42%, rgba(255,255,255,0.22) 50%, transparent 58%)',
                                      animation: 'giftSendShine 2.6s ease-in-out infinite',
                                    }}
                                  />
                                  <motion.div
                                    initial={{ scale: 0 }}
                                    animate={{ scale: 1 }}
                                    transition={{ type: 'spring', damping: 18, stiffness: 420 }}
                                    className="absolute top-1.5 right-1.5 w-5 h-5 rounded-full flex items-center justify-center"
                                    style={{
                                      background: 'linear-gradient(135deg, #fbbf24 0%, #f59e0b 100%)',
                                      boxShadow: '0 4px 12px -2px rgba(251,191,36,0.65), inset 0 1px 0 rgba(255,255,255,0.45)',
                                    }}
                                  >
                                    <Check className="w-3 h-3 text-white" />
                                  </motion.div>
                                </>
                              )}

                              {/* Premium badge */}
                              <div className="absolute top-1.5 left-1.5">
                                <Sparkles className="w-4 h-4 text-amber-300 drop-shadow-[0_2px_6px_rgba(251,191,36,0.6)]" />
                              </div>

                              {/* Label */}
                              <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 to-transparent px-2 py-1.5">
                                <span className="text-white text-[10px] font-medium">{bg.name}</span>
                              </div>
                            </motion.button>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}

export default BackgroundPickerPanel;
