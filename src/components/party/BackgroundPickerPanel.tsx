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
        .update({ background_id: bg.id } as any)
        .eq('id', roomId);

      if (error) throw error;

      onSelectBackground(bg);
      toast.success("Background updated!");
      onClose();
    } catch (error) {
      console.error('Error updating background:', error);
      toast.error("Failed to update background");
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
            className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50"
            onClick={onClose}
          />

          {/* Panel */}
          <motion.div
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={{ type: "spring", damping: 25, stiffness: 300 }}
            className="fixed bottom-0 left-0 right-0 z-50 bg-white rounded-t-3xl overflow-hidden max-h-[80vh]"
          >
            {/* Header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-cyan-400 to-blue-500 flex items-center justify-center">
                  <Sparkles className="w-5 h-5 text-white" />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-gray-900">Room Background</h3>
                  <p className="text-xs text-gray-500">Choose a background theme</p>
                </div>
              </div>
              <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-full">
                <X className="w-5 h-5 text-gray-500" />
              </button>
            </div>

            {/* Content */}
            <div className="overflow-y-auto max-h-[65vh] p-4 pb-safe">
              {loading ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="w-8 h-8 animate-spin text-purple-500" />
                </div>
              ) : (
                <>
                  {/* Free Backgrounds */}
                  <div className="mb-6">
                    <h4 className="text-sm font-semibold text-gray-700 mb-3">Free Backgrounds</h4>
                    <div className="grid grid-cols-3 gap-3">
                      {freeBackgrounds.map((bg) => (
                        <motion.button
                          key={bg.id}
                          whileTap={{ scale: 0.95 }}
                          onClick={() => handleSelect(bg)}
                          disabled={updating || !isHost}
                          className={cn(
                            "relative aspect-[4/3] rounded-xl overflow-hidden border-2 transition-all",
                            selectedId === bg.id
                              ? "border-purple-500 ring-2 ring-purple-500/30 shadow-lg"
                              : "border-transparent hover:border-gray-300",
                            !isHost && "opacity-60"
                          )}
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

                          {/* Selected check */}
                          {selectedId === bg.id && (
                            <motion.div
                              initial={{ scale: 0 }}
                              animate={{ scale: 1 }}
                              className="absolute top-1.5 right-1.5 w-5 h-5 bg-purple-500 rounded-full flex items-center justify-center shadow-lg"
                            >
                              <Check className="w-3 h-3 text-white" />
                            </motion.div>
                          )}

                          {/* Label */}
                          <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/70 to-transparent px-2 py-1.5">
                            <span className="text-white text-[10px] font-medium">{bg.name}</span>
                          </div>
                        </motion.button>
                      ))}
                    </div>
                  </div>

                  {/* Premium Backgrounds */}
                  {premiumBackgrounds.length > 0 && (
                    <div>
                      <div className="flex items-center gap-2 mb-3">
                        <h4 className="text-sm font-semibold text-gray-700">Premium Backgrounds</h4>
                        <Sparkles className="w-4 h-4 text-amber-500" />
                      </div>
                      <div className="grid grid-cols-3 gap-3">
                        {premiumBackgrounds.map((bg) => {
                          const isPurchased = purchasedBgs.includes(bg.id);
                          
                          return (
                            <motion.button
                              key={bg.id}
                              whileTap={{ scale: 0.95 }}
                              onClick={() => handleSelect(bg)}
                              disabled={updating || !isHost}
                              className={cn(
                                "relative aspect-[4/3] rounded-xl overflow-hidden border-2 transition-all",
                                selectedId === bg.id
                                  ? "border-amber-500 ring-2 ring-amber-500/30 shadow-lg"
                                  : "border-transparent hover:border-gray-300",
                                !isHost && "opacity-60"
                              )}
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

                              {/* Premium Overlay */}
                              {!isPurchased && (
                                <div className="absolute inset-0 bg-black/30 flex items-center justify-center">
                                  <div className="flex items-center gap-1 px-2 py-1 bg-black/50 rounded-full">
                                    <Diamond className="w-3 h-3 text-cyan-400" />
                                    <span className="text-white text-[10px] font-bold">
                                      {bg.price_diamonds}
                                    </span>
                                  </div>
                                </div>
                              )}

                              {/* Selected check */}
                              {selectedId === bg.id && (
                                <motion.div
                                  initial={{ scale: 0 }}
                                  animate={{ scale: 1 }}
                                  className="absolute top-1.5 right-1.5 w-5 h-5 bg-amber-500 rounded-full flex items-center justify-center shadow-lg"
                                >
                                  <Check className="w-3 h-3 text-white" />
                                </motion.div>
                              )}

                              {/* Premium badge */}
                              <div className="absolute top-1.5 left-1.5">
                                <Sparkles className="w-4 h-4 text-amber-400 drop-shadow-lg" />
                              </div>

                              {/* Label */}
                              <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/70 to-transparent px-2 py-1.5">
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
