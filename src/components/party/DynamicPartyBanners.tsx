import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { Sparkles, Trophy, Star, Gamepad2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";

interface PartyBanner {
  id: string;
  banner_type: string;
  title: string;
  subtitle: string | null;
  amount: number;
  icon_emoji: string;
  gradient_from: string;
  gradient_to: string;
  link_type: string | null;
  link_url: string | null;
  display_order: number;
}

interface DynamicPartyBannersProps {
  roomType: 'audio' | 'video' | 'game';
  onBannerClick?: (banner: PartyBanner) => void;
  onOpenGames?: () => void;
}

export function DynamicPartyBanners({ roomType, onBannerClick, onOpenGames }: DynamicPartyBannersProps) {
  const navigate = useNavigate();
  const [banners, setBanners] = useState<PartyBanner[]>([]);

  useEffect(() => {
    fetchBanners();
  }, [roomType]);

  const fetchBanners = async () => {
    try {
      const { data, error } = await supabase
        .from('party_room_banners')
        .select('*')
        .eq('is_active', true)
        .contains('room_types', [roomType])
        .order('display_order', { ascending: true });

      if (error) throw error;
      setBanners(data || []);
    } catch (error) {
      console.error('Error fetching banners:', error);
    }
  };

  const formatAmount = (num: number) => {
    if (num >= 1000000) return `${(num / 1000000).toFixed(2)}M`;
    if (num >= 1000) return `${(num / 1000).toFixed(0)}K`;
    return num.toLocaleString();
  };

  const handleBannerClick = (banner: PartyBanner) => {
    // Call parent handler if provided
    if (onBannerClick) {
      onBannerClick(banner);
    }

    // Handle different banner types with navigation
    switch (banner.link_type) {
      case 'game':
        if (onOpenGames) {
          onOpenGames();
        } else {
          toast.info("🎮 Games Panel", { description: "Opening games..." });
        }
        break;
      case 'pk_battle':
        toast.info("⚔️ City PK Battle", { description: "PK Battle feature coming soon!" });
        break;
      case 'event':
        navigate('/leaderboard');
        break;
      case 'url':
        if (banner.link_url) {
          import('@/utils/inAppNavigation').then(({ openInApp }) => openInApp(banner.link_url!, { useOverlay: true }));
        }
        break;
      default:
        toast.info(`${banner.icon_emoji} ${banner.title}`, { description: banner.subtitle || "Feature coming soon!" });
    }
  };

  if (banners.length === 0) return null;

  return (
    <div className="absolute right-3 bottom-32 flex flex-col gap-2 z-30">
      {banners.map((banner, index) => (
        <motion.button
          key={banner.id}
          initial={{ opacity: 0, x: 50 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: index * 0.1 }}
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
          onClick={() => handleBannerClick(banner)}
          className="relative overflow-hidden rounded-xl shadow-2xl"
        >
          {/* Gradient Border */}
          <div 
            className="p-[2px] rounded-xl"
            style={{
              background: `linear-gradient(to right, ${banner.gradient_from}, ${banner.gradient_to})`
            }}
          >
            {/* Inner Content */}
            <div 
              className="backdrop-blur-sm rounded-xl px-3 py-2"
              style={{
                background: `linear-gradient(to right, ${banner.gradient_from}E6, ${banner.gradient_to}E6)`
              }}
            >
              {/* Sparkle Animation for Big Win type */}
              {banner.banner_type === 'big_win' && (
                <motion.div
                  animate={{ 
                    rotate: [0, 10, -10, 0],
                    scale: [1, 1.1, 1]
                  }}
                  transition={{ duration: 2, repeat: Infinity }}
                  className="absolute top-1 right-1"
                >
                  <Sparkles className="w-4 h-4 text-yellow-300" />
                </motion.div>
              )}

              {/* Trophy Animation for PK type */}
              {banner.banner_type === 'city_pk' && (
                <motion.div
                  animate={{ y: [0, -2, 0] }}
                  transition={{ duration: 1, repeat: Infinity }}
                  className="absolute top-1 left-1"
                >
                  <Trophy className="w-4 h-4 text-amber-400" />
                </motion.div>
              )}

              {/* Star Animation for Daily Star type */}
              {banner.banner_type === 'daily_star' && (
                <motion.div
                  animate={{ rotate: [0, 360] }}
                  transition={{ duration: 4, repeat: Infinity, ease: "linear" }}
                  className="absolute top-1 left-1"
                >
                  <Star className="w-4 h-4 text-yellow-400 fill-yellow-400" />
                </motion.div>
              )}

              <div className="flex flex-col items-center">
                <span className="text-[10px] font-bold text-white/90 tracking-wider">
                  {banner.title}
                </span>
                {banner.amount > 0 && (
                  <div className="flex items-center gap-1">
                    <span className="text-sm">{banner.icon_emoji}</span>
                    <span className="text-sm font-bold text-white">
                      {formatAmount(banner.amount)}
                    </span>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Shimmer Effect */}
          <motion.div
            className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent"
            animate={{ x: ['-100%', '200%'] }}
            transition={{ duration: 2, repeat: Infinity, repeatDelay: 1 }}
          />

          {/* Pulse Border for Active Events */}
          {(banner.banner_type === 'city_pk' || banner.banner_type === 'daily_star') && (
            <motion.div
              className="absolute inset-0 border-2 rounded-xl pointer-events-none"
              style={{ borderColor: `${banner.gradient_from}80` }}
              animate={{ opacity: [0.5, 1, 0.5], scale: [1, 1.02, 1] }}
              transition={{ duration: 1.5, repeat: Infinity }}
            />
          )}
        </motion.button>
      ))}
    </div>
  );
}

export default DynamicPartyBanners;
