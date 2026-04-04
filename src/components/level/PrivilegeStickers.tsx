import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { supabase } from "@/integrations/supabase/client";
import { getEquippedPrivilegesForUser } from "@/hooks/useUserPrivileges";
import { Lock, Sparkles } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import Lottie from "lottie-react";

interface Sticker {
  id: string;
  name: string;
  preview_url: string | null;
  animation_url: string | null;
  animation_file_url?: string | null;
  unlock_level: number;
  category: string;
  is_premium: boolean;
  sound_url?: string | null;
}

interface PrivilegeStickersProps {
  userId: string;
  userLevel: number;
  onSelectSticker: (sticker: Sticker) => void;
  selectedCategory?: string;
}

// Play sticker sound
const playStickerSound = async (soundUrl?: string | null) => {
  if (!soundUrl) return;
  try {
    const audio = new Audio(soundUrl);
    audio.volume = 0.5;
    await audio.play();
  } catch (error) {
    console.log('[Sticker] Sound error:', error);
  }
};

// Sticker categories
const stickerCategories = [
  { id: 'all', name: 'All', icon: '🎨' },
  { id: 'vip', name: 'VIP', icon: '👑' },
  { id: 'love', name: 'Love', icon: '❤️' },
  { id: 'cute', name: 'Cute', icon: '🥰' },
  { id: 'fun', name: 'Fun', icon: '😄' },
  { id: 'special', name: 'Special', icon: '✨' },
];

// Single sticker display component
const StickerItem = ({ 
  sticker, 
  isUnlocked, 
  onSelect 
}: { 
  sticker: Sticker; 
  isUnlocked: boolean;
  onSelect: () => void;
}) => {
  const [lottieData, setLottieData] = useState<object | null>(null);
  const animationUrl = sticker.animation_file_url || sticker.animation_url;
  const isLottie = animationUrl?.endsWith('.json');

  useEffect(() => {
    if (isLottie && animationUrl) {
      fetch(animationUrl)
        .then(res => res.json())
        .then(data => setLottieData(data))
        .catch(() => {});
    }
  }, [animationUrl, isLottie]);

  const handleClick = () => {
    if (!isUnlocked) {
      toast.error(`Unlock at Level ${sticker.unlock_level}!`);
      return;
    }
    playStickerSound(sticker.sound_url);
    onSelect();
  };

  return (
    <motion.button
      whileHover={isUnlocked ? { scale: 1.1 } : undefined}
      whileTap={isUnlocked ? { scale: 0.95 } : undefined}
      onClick={handleClick}
      className={`relative aspect-square rounded-xl flex items-center justify-center p-2 transition-all ${
        isUnlocked 
          ? 'bg-white/10 hover:bg-white/20 border border-white/20' 
          : 'bg-black/20 opacity-50 cursor-not-allowed'
      }`}
    >
      {/* Lock overlay */}
      {!isUnlocked && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/40 rounded-xl z-10">
          <div className="text-center">
            <Lock className="w-4 h-4 text-white/60 mx-auto" />
            <span className="text-[10px] text-white/60">Lv.{sticker.unlock_level}</span>
          </div>
        </div>
      )}

      {/* Sticker content */}
      {isLottie && lottieData ? (
        <Lottie 
          animationData={lottieData} 
          loop={true}
          className="w-full h-full"
        />
      ) : sticker.preview_url ? (
        <img 
          src={sticker.preview_url} 
          alt={sticker.name}
          className="w-full h-full object-contain"
        />
      ) : animationUrl ? (
        <img 
          src={animationUrl} 
          alt={sticker.name}
          className="w-full h-full object-contain"
        />
      ) : (
        <div className="text-4xl">{sticker.name}</div>
      )}

      {/* Premium badge */}
      {sticker.is_premium && isUnlocked && (
        <div className="absolute -top-1 -right-1 w-4 h-4 bg-gradient-to-r from-amber-400 to-orange-500 rounded-full flex items-center justify-center">
          <Sparkles className="w-2.5 h-2.5 text-white" />
        </div>
      )}
    </motion.button>
  );
};

// Sticker send animation overlay
export const StickerSendAnimation = ({ 
  sticker, 
  senderName, 
  onComplete 
}: { 
  sticker: Sticker; 
  senderName: string;
  onComplete: () => void;
}) => {
  const [lottieData, setLottieData] = useState<object | null>(null);
  const animationUrl = sticker.animation_file_url || sticker.animation_url;
  const isLottie = animationUrl?.endsWith('.json');

  useEffect(() => {
    if (isLottie && animationUrl) {
      fetch(animationUrl)
        .then(res => res.json())
        .then(data => setLottieData(data))
        .catch(() => {});
    }

    // Auto complete
    const timer = setTimeout(onComplete, 2500);
    return () => clearTimeout(timer);
  }, [animationUrl, isLottie, onComplete]);

  return (
    <motion.div
      initial={{ scale: 0, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      exit={{ scale: 2, opacity: 0 }}
      transition={{ type: "spring", damping: 15 }}
      className="fixed inset-0 z-50 flex items-center justify-center pointer-events-none"
    >
      <div className="relative">
        {/* Background glow */}
        <motion.div
          className="absolute inset-0 bg-gradient-to-r from-purple-500/30 via-pink-500/30 to-orange-500/30 blur-3xl"
          animate={{ scale: [1, 1.5, 1] }}
          transition={{ duration: 1.5, repeat: Infinity }}
        />

        {/* Sticker */}
        <motion.div
          className="relative w-40 h-40"
          animate={{ 
            y: [0, -20, 0],
            rotate: [-5, 5, -5]
          }}
          transition={{ duration: 1, repeat: Infinity }}
        >
          {isLottie && lottieData ? (
            <Lottie animationData={lottieData} loop={true} />
          ) : animationUrl || sticker.preview_url ? (
            <img 
              src={animationUrl || sticker.preview_url || ''} 
              alt={sticker.name}
              className="w-full h-full object-contain"
            />
          ) : null}
        </motion.div>

        {/* Sender info */}
        <motion.div
          initial={{ y: 20, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ delay: 0.3 }}
          className="absolute -bottom-8 left-1/2 -translate-x-1/2 whitespace-nowrap"
        >
          <span className="px-4 py-2 rounded-full bg-black/60 text-white text-sm font-medium">
            {senderName} sent {sticker.name}
          </span>
        </motion.div>

        {/* Particles */}
        {[...Array(12)].map((_, i) => (
          <motion.div
            key={i}
            className="absolute w-3 h-3 rounded-full"
            style={{
              backgroundColor: ['#FFD700', '#FF6B6B', '#A855F7', '#4ECDC4'][i % 4],
              left: '50%',
              top: '50%',
            }}
            animate={{
              x: [0, Math.cos(i * 30 * Math.PI / 180) * 100],
              y: [0, Math.sin(i * 30 * Math.PI / 180) * 100],
              opacity: [1, 0],
              scale: [0.5, 1.5],
            }}
            transition={{
              duration: 1,
              delay: 0.2,
              repeat: Infinity,
              repeatDelay: 1,
            }}
          />
        ))}
      </div>
    </motion.div>
  );
};

// Main Sticker Panel Component
const PrivilegeStickers = ({ 
  userId, 
  userLevel, 
  onSelectSticker,
  selectedCategory = 'all'
}: PrivilegeStickersProps) => {
  const [stickers, setStickers] = useState<Sticker[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeCategory, setActiveCategory] = useState(selectedCategory);
  const [equippedStickers, setEquippedStickers] = useState<string[]>([]);

  useEffect(() => {
    fetchStickers();
  }, [userId]);

  const fetchStickers = async () => {
    try {
      // Fetch level privilege stickers
      const { data: levelStickers } = await supabase
        .from('level_privileges')
        .select('*')
        .eq('privilege_type', 'privilege_sticker')
        .eq('is_active', true)
        .order('unlock_level');

      // Fetch shop stickers
      const { data: shopStickers } = await supabase
        .from('shop_items')
        .select('*')
        .eq('category', 'privilege_sticker')
        .eq('is_active', true)
        .order('display_order');

      // Get user's purchased stickers
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const { data: purchases } = await supabase
          .from('user_purchases')
          .select('item_id')
          .eq('user_id', user.id)
          .eq('is_active', true);

        if (purchases) {
          setEquippedStickers(purchases.map(p => p.item_id));
        }
      }

      const allStickers: Sticker[] = [];

      // Add level stickers
      if (levelStickers) {
        levelStickers.forEach(s => {
          allStickers.push({
            id: s.id,
            name: s.name,
            preview_url: s.preview_url,
            animation_url: s.animation_url,
            unlock_level: s.unlock_level,
            category: 'vip',
            is_premium: true,
          });
        });
      }

      // Add shop stickers
      if (shopStickers) {
        shopStickers.forEach(s => {
          allStickers.push({
            id: s.id,
            name: s.name,
            preview_url: s.preview_url,
            animation_url: s.animation_url,
            animation_file_url: s.animation_file_url,
            unlock_level: s.min_level || 1,
            category: 'special',
            is_premium: s.is_premium || false,
          });
        });
      }

      setStickers(allStickers);
    } catch (error) {
      console.error('Error fetching stickers:', error);
    } finally {
      setLoading(false);
    }
  };

  const isUnlocked = (sticker: Sticker) => {
    // Check if unlocked by level
    if (userLevel >= sticker.unlock_level) return true;
    // Check if purchased from shop
    if (equippedStickers.includes(sticker.id)) return true;
    return false;
  };

  const filteredStickers = activeCategory === 'all' 
    ? stickers 
    : stickers.filter(s => s.category === activeCategory);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-40">
        <motion.div
          animate={{ rotate: 360 }}
          transition={{ repeat: Infinity, duration: 1, ease: "linear" }}
          className="w-8 h-8 border-2 border-purple-400 border-t-transparent rounded-full"
        />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Category tabs */}
      <ScrollArea className="w-full">
        <div className="flex gap-2 pb-2">
          {stickerCategories.map((cat) => (
            <Button
              key={cat.id}
              variant="ghost"
              size="sm"
              onClick={() => setActiveCategory(cat.id)}
              className={`flex items-center gap-1.5 rounded-full shrink-0 ${
                activeCategory === cat.id
                  ? 'bg-purple-500 text-white'
                  : 'bg-white/10 text-white/70 hover:bg-white/20'
              }`}
            >
              <span>{cat.icon}</span>
              <span>{cat.name}</span>
            </Button>
          ))}
        </div>
      </ScrollArea>

      {/* Stickers grid */}
      <div className="grid grid-cols-5 gap-2">
        <AnimatePresence mode="popLayout">
          {filteredStickers.map((sticker, index) => (
            <motion.div
              key={sticker.id}
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.8 }}
              transition={{ delay: index * 0.03 }}
            >
              <StickerItem
                sticker={sticker}
                isUnlocked={isUnlocked(sticker)}
                onSelect={() => onSelectSticker(sticker)}
              />
            </motion.div>
          ))}
        </AnimatePresence>
      </div>

      {filteredStickers.length === 0 && (
        <div className="text-center py-8">
          <p className="text-white/40">No stickers in this category</p>
        </div>
      )}
    </div>
  );
};

export default PrivilegeStickers;
