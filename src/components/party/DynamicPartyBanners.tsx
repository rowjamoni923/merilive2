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
    <div className="absolute right-3 bottom-32 flex flex-col gap-2.5 z-30">
      {banners.map((banner, index) => {
        const isPulseType =
          banner.banner_type === 'city_pk' || banner.banner_type === 'daily_star';
        return (
          <motion.button
            key={banner.id}
            initial={{ opacity: 0, x: 60, scale: 0.92 }}
            animate={{ opacity: 1, x: 0, scale: 1 }}
            transition={{
              type: 'spring',
              damping: 24,
              stiffness: 320,
              delay: Math.min(index * 0.08, 0.24),
            }}
            whileHover={{ scale: 1.06, y: -1 }}
            whileTap={{ scale: 0.94 }}
            onClick={() => handleBannerClick(banner)}
            className="relative overflow-hidden rounded-2xl"
            style={{
              boxShadow: `0 10px 28px -10px ${banner.gradient_from}99, 0 4px 14px -6px ${banner.gradient_to}80, inset 0 1px 0 rgba(255,255,255,0.18)`,
              animation: isPulseType ? 'giftSendBreathe 2.4s ease-in-out infinite' : undefined,
            }}
          >
            {/* Gradient Border */}
            <div
              className="p-[1.5px] rounded-2xl"
              style={{
                background: `linear-gradient(135deg, ${banner.gradient_from}, ${banner.gradient_to})`,
              }}
            >
              {/* Inner Content */}
              <div
                className="relative rounded-[14px] px-3 py-2 overflow-hidden"
                style={{
                  backdropFilter: 'blur(10px) saturate(140%)',
                  WebkitBackdropFilter: 'blur(10px) saturate(140%)',
                }}
              >
                {/* Aurora overlay */}
                <span
                  aria-hidden
                  className="pointer-events-none absolute inset-0 rounded-[14px]"
                  style={{
                    background:
                      'radial-gradient(120% 80% at 0% 0%, rgba(255,255,255,0.22), transparent 55%), radial-gradient(120% 80% at 100% 100%, rgba(0,0,0,0.18), transparent 55%)',
                  }}
                />
                {/* Shine sweep */}
                <span
                  aria-hidden
                  className="pointer-events-none absolute inset-0 rounded-[14px]"
                  style={{
                    background:
                      'linear-gradient(115deg, transparent 30%, rgba(255,255,255,0.32) 50%, transparent 70%)',
                    mixBlendMode: 'overlay',
                  }}
                />

                {/* Sparkle Animation for Big Win type */}
                {banner.banner_type === 'big_win' && (
                  <motion.div
                    animate={{ rotate: [0, 12, -12, 0], scale: [1, 1.15, 1] }}
                    transition={{ duration: 2, repeat: Infinity }}
                    className="absolute top-1 right-1 z-10 drop-shadow-[0_0_6px_rgba(253,224,71,0.85)]"
                  >
                    <Sparkles className="w-4 h-4 text-yellow-300" />
                  </motion.div>
                )}

                {/* Trophy Animation for PK type */}
                {banner.banner_type === 'city_pk' && (
                  <motion.div
                    animate={{ y: [0, -2.5, 0], rotate: [-4, 4, -4] }}
                    transition={{ duration: 1.2, repeat: Infinity }}
                    className="absolute top-1 left-1 z-10 drop-shadow-[0_0_6px_rgba(251,191,36,0.85)]"
                  >
                    <Trophy className="w-4 h-4 text-amber-300" />
                  </motion.div>
                )}

                {/* Star Animation for Daily Star type */}
                {banner.banner_type === 'daily_star' && (
                  <motion.div
                    animate={{ rotate: [0, 360] }}
                    transition={{ duration: 4, repeat: Infinity, ease: 'linear' }}
                    className="absolute top-1 left-1 z-10 drop-shadow-[0_0_6px_rgba(250,204,21,0.85)]"
                  >
                    <Star className="w-4 h-4 text-yellow-300 fill-yellow-300" />
                  </motion.div>
                )}

                <div className="relative z-10 flex flex-col items-center">
                  <span className="text-[10px] font-bold text-white/95 tracking-wider drop-shadow-[0_1px_2px_rgba(0,0,0,0.35)]">
                    {banner.title}
                  </span>
                  {banner.amount > 0 && (
                    <div className="flex items-center gap-1">
                      <span className="text-sm drop-shadow-[0_1px_2px_rgba(0,0,0,0.4)]">
                        {banner.icon_emoji}
                      </span>
                      <span className="text-sm font-extrabold text-white tabular-nums drop-shadow-[0_1px_2px_rgba(0,0,0,0.45)]">
                        {formatAmount(banner.amount)}
                      </span>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Pulse Border for Active Events */}
            {isPulseType && (
              <motion.div
                className="absolute inset-0 border-2 rounded-2xl pointer-events-none"
                style={{ borderColor: `${banner.gradient_from}99` }}
                animate={{ opacity: [0.45, 1, 0.45], scale: [1, 1.025, 1] }}
                transition={{ duration: 1.6, repeat: Infinity }}
              />
            )}
          </motion.button>
        );
      })}
    </div>
  );
}

export default DynamicPartyBanners;
