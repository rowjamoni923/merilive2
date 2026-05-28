import { useState, useEffect, Suspense, lazy } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { InlineLevelBadge, LevelBadge } from "@/components/common/LevelBadge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { supabase } from "@/integrations/supabase/client";
import FixedAnimationFrame from "@/components/common/FixedAnimationFrame";

interface EntranceUser {
  id: string;
  displayName: string;
  avatarUrl?: string;
  level: number;
  vipTier?: number;
  customEntryUrl?: string;
}

interface RoomEntranceNotificationProps {
  users: EntranceUser[];
  onComplete?: (userId: string) => void;
  position?: 'bottom' | 'center';
}

// Fetch VIP tier entry animation for a user
const fetchVIPEntryAnimation = async (userId: string): Promise<string | null> => {
  try {
    // First check user_vip_subscriptions for active VIP
    const { data: subscription } = await supabase
      .from('user_vip_subscriptions')
      .select('tier_id')
      .eq('user_id', userId)
      .eq('is_active', true)
      .gte('end_date', new Date().toISOString())
      .maybeSingle();

    if (subscription?.tier_id) {
      const { data: tier } = await supabase
        .from('vip_tiers')
        .select('entry_animation_url')
        .eq('id', subscription.tier_id)
        .eq('is_active', true)
        .maybeSingle();
      
      if (tier?.entry_animation_url) return tier.entry_animation_url;
    }

    // Check equipped entrance from profile
    const { data: profile } = await supabase
      .from('profiles')
      .select('equipped_entrance_id')
      .eq('id', userId)
      .maybeSingle();

    if (profile?.equipped_entrance_id) {
      // Try shop items first
      const { data: shopItem } = await supabase
        .from('shop_items')
        .select('animation_url')
        .eq('id', profile.equipped_entrance_id)
        .maybeSingle();
      
      if (shopItem?.animation_url) return shopItem.animation_url;

      // Try level privileges
      const { data: privilege } = await supabase
        .from('level_privileges')
        .select('animation_url')
        .eq('id', profile.equipped_entrance_id)
        .maybeSingle();

      if (privilege?.animation_url) return privilege.animation_url;
    }

    return null;
  } catch (error) {
    console.error('[RoomEntrance] Error fetching VIP animation:', error);
    return null;
  }
};

// Compact entrance notification that shows in chat area
export const RoomEntranceNotification = ({ 
  users, 
  onComplete,
  position = 'bottom' 
}: RoomEntranceNotificationProps) => {
  const [currentUser, setCurrentUser] = useState<EntranceUser | null>(null);
  const [queue, setQueue] = useState<EntranceUser[]>([]);
  const [entryAnimationUrl, setEntryAnimationUrl] = useState<string | null>(null);

  useEffect(() => {
    if (users.length > 0) {
      setQueue(prev => [...prev, ...users.filter(u => !prev.find(p => p.id === u.id))]);
    }
  }, [users]);

  useEffect(() => {
    if (queue.length > 0 && !currentUser) {
      const nextUser = queue[0];
      setCurrentUser(nextUser);
      setQueue(prev => prev.slice(1));
      
      // Fetch VIP entry animation for this user
      if (nextUser.customEntryUrl) {
        setEntryAnimationUrl(nextUser.customEntryUrl);
      } else {
        fetchVIPEntryAnimation(nextUser.id).then(url => {
          setEntryAnimationUrl(url);
        });
      }
    }
  }, [queue, currentUser]);

  useEffect(() => {
    if (currentUser) {
      const timer = setTimeout(() => {
        onComplete?.(currentUser.id);
        setCurrentUser(null);
        setEntryAnimationUrl(null);
      }, entryAnimationUrl ? 4000 : 3000);
      return () => clearTimeout(timer);
    }
  }, [currentUser, onComplete, entryAnimationUrl]);

  if (!currentUser) return null;

  // Custom VIP entry animation (SVGA, Lottie, etc.)
  if (entryAnimationUrl) {
    return (
      <CustomEntranceNotification 
        user={currentUser} 
        animationUrl={entryAnimationUrl} 
      />
    );
  }

  // VIP entrance with vehicle for high levels (no custom animation)
  if (currentUser.level >= 20) {
    return <VIPEntranceNotification user={currentUser} />;
  }

  // Standard entrance notification — premium glass pill (Pkg173)
  return (
    <AnimatePresence>
      <motion.div
        initial={{ x: -220, opacity: 0, scale: 0.94 }}
        animate={{ x: 0, opacity: 1, scale: 1 }}
        exit={{ x: 220, opacity: 0, scale: 0.94 }}
        transition={{ type: 'spring', damping: 24, stiffness: 280 }}
        className={`
          relative overflow-hidden flex items-center gap-2 pl-2 pr-3.5 py-1.5 rounded-full
          border border-white/15
          ${position === 'center' ? 'fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-50' : ''}
        `}
        style={{
          background:
            'linear-gradient(135deg, rgba(168,85,247,0.78) 0%, rgba(217,70,239,0.78) 50%, rgba(236,72,153,0.78) 100%)',
          backdropFilter: 'blur(14px) saturate(140%)',
          WebkitBackdropFilter: 'blur(14px) saturate(140%)',
          boxShadow:
            '0 10px 28px -10px rgba(236,72,153,0.55), 0 4px 14px -6px rgba(168,85,247,0.5), inset 0 1px 0 rgba(255,255,255,0.22)',
        }}
      >
        <span
          aria-hidden
          className="pointer-events-none absolute inset-0 rounded-full"
          style={{
            background:
              'linear-gradient(115deg, transparent 30%, rgba(255,255,255,0.35) 50%, transparent 70%)',
            animation: 'giftSendShine 3s ease-in-out infinite',
            mixBlendMode: 'overlay',
          }}
        />
        <InlineLevelBadge level={currentUser.level} />
        <motion.span
          className="relative text-white font-bold text-sm truncate max-w-[140px] drop-shadow-[0_1px_2px_rgba(0,0,0,0.35)]"
          animate={{
            textShadow: [
              '0 0 6px rgba(255,255,255,0)',
              '0 0 12px rgba(255,255,255,0.6)',
              '0 0 6px rgba(255,255,255,0)',
            ],
          }}
          transition={{ duration: 1.6, repeat: Infinity }}
        >
          {currentUser.displayName}
        </motion.span>
        <span className="relative text-white/85 text-xs font-medium">entered the room</span>
      </motion.div>
    </AnimatePresence>
  );
};

// Custom VIP Entry with uploaded animation (SVGA, Lottie, GIF, MP4)
const CustomEntranceNotification = ({ user, animationUrl }: { user: EntranceUser; animationUrl: string }) => {
  return (
    <AnimatePresence>
      <motion.div
        initial={{ scale: 0.5, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.5, opacity: 0 }}
        transition={{ type: "spring", damping: 15 }}
        className="fixed inset-0 z-50 flex items-center justify-center pointer-events-none"
      >
        {/* Full-screen animation layer */}
        <div className="absolute inset-0 flex items-center justify-center">
          <FixedAnimationFrame
            src={animationUrl}
            width="100%"
            height="100%"
            className="max-w-md max-h-96 object-contain"
            loop={false}
            muted={false}
            center={false}
          />
        </div>

        {/* User info overlay */}
        <motion.div
          initial={{ y: 50, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ delay: 0.3, type: 'spring', damping: 22, stiffness: 280 }}
          className="absolute bottom-20 left-1/2 -translate-x-1/2"
        >
          <div
            className="relative overflow-hidden flex items-center gap-3 px-5 py-2.5 rounded-2xl border border-amber-200/60"
            style={{
              background:
                'linear-gradient(135deg, rgba(251,191,36,0.95) 0%, rgba(250,204,21,0.95) 50%, rgba(249,115,22,0.95) 100%)',
              boxShadow:
                '0 18px 40px -12px rgba(245,158,11,0.65), 0 6px 18px -6px rgba(249,115,22,0.55), inset 0 1px 0 rgba(255,255,255,0.45)',
            }}
          >
            <span
              aria-hidden
              className="pointer-events-none absolute inset-0 rounded-2xl"
              style={{
                background:
                  'linear-gradient(115deg, transparent 30%, rgba(255,255,255,0.45) 50%, transparent 70%)',
                animation: 'giftSendShine 3.4s ease-in-out infinite',
                mixBlendMode: 'overlay',
              }}
            />
            <Avatar className="relative w-12 h-12 border-2 border-yellow-200 shadow-[0_0_18px_rgba(251,191,36,0.7)]">
              <AvatarImage src={user.avatarUrl} />
              <AvatarFallback className="bg-amber-400 text-white font-bold">
                {user.displayName[0]}
              </AvatarFallback>
            </Avatar>
            <div className="relative flex flex-col">
              <div className="flex items-center gap-2">
                <LevelBadge level={user.level} size="sm" animated />
                <span className="text-amber-950 font-black text-lg drop-shadow-[0_1px_1px_rgba(255,255,255,0.45)]">
                  {user.displayName}
                </span>
              </div>
              <span className="text-amber-900 text-xs font-semibold tracking-wide">👑 VIP Entrance</span>
            </div>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
};

// VIP entrance with vehicle animation — Pkg173 polish
const VIPEntranceNotification = ({ user }: { user: EntranceUser }) => {
  const getVehicle = (level: number) => {
    if (level >= 50)
      return {
        emoji: '🚀',
        gradient:
          'linear-gradient(135deg, rgba(251,191,36,0.95) 0%, rgba(250,204,21,0.95) 50%, rgba(249,115,22,0.95) 100%)',
        glow: 'rgba(251,191,36,0.6)',
      };
    if (level >= 40)
      return {
        emoji: '✈️',
        gradient:
          'linear-gradient(135deg, rgba(168,85,247,0.95) 0%, rgba(217,70,239,0.95) 50%, rgba(236,72,153,0.95) 100%)',
        glow: 'rgba(217,70,239,0.6)',
      };
    if (level >= 30)
      return {
        emoji: '🏎️',
        gradient:
          'linear-gradient(135deg, rgba(239,68,68,0.95) 0%, rgba(249,115,22,0.95) 100%)',
        glow: 'rgba(239,68,68,0.6)',
      };
    return {
      emoji: '🏍️',
      gradient:
        'linear-gradient(135deg, rgba(139,92,246,0.95) 0%, rgba(168,85,247,0.95) 100%)',
      glow: 'rgba(168,85,247,0.6)',
    };
  };

  const vehicle = getVehicle(user.level);

  return (
    <AnimatePresence>
      <motion.div
        initial={{ x: -300, opacity: 0 }}
        animate={{ x: 0, opacity: 1 }}
        exit={{ x: 300, opacity: 0 }}
        transition={{ type: 'spring', damping: 22, stiffness: 140 }}
        className="relative"
      >
        {/* Speed lines */}
        {[...Array(6)].map((_, i) => (
          <motion.div
            key={i}
            className="absolute h-[2px] bg-gradient-to-r from-white/60 to-transparent rounded-full"
            style={{
              left: -50 - i * 22,
              top: `${36 + i * 5}%`,
              width: 32 + Math.random() * 32,
            }}
            animate={{ opacity: [0, 1, 0], x: [0, 30, 60] }}
            transition={{ duration: 0.4, delay: i * 0.05, repeat: 3 }}
          />
        ))}

        <motion.div
          className="relative overflow-hidden flex items-center gap-3 px-4 py-2.5 rounded-2xl border border-white/25"
          style={{
            background: vehicle.gradient,
            backdropFilter: 'blur(10px) saturate(140%)',
            WebkitBackdropFilter: 'blur(10px) saturate(140%)',
          }}
          animate={{
            boxShadow: [
              `0 10px 28px -10px ${vehicle.glow}, 0 4px 14px -6px rgba(0,0,0,0.3), inset 0 1px 0 rgba(255,255,255,0.28)`,
              `0 18px 44px -10px ${vehicle.glow}, 0 8px 22px -6px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.4)`,
              `0 10px 28px -10px ${vehicle.glow}, 0 4px 14px -6px rgba(0,0,0,0.3), inset 0 1px 0 rgba(255,255,255,0.28)`,
            ],
          }}
          transition={{ duration: 1.4, repeat: Infinity }}
        >
          <span
            aria-hidden
            className="pointer-events-none absolute inset-0 rounded-2xl"
            style={{
              background:
                'linear-gradient(115deg, transparent 30%, rgba(255,255,255,0.4) 50%, transparent 70%)',
              animation: 'giftSendShine 2.8s ease-in-out infinite',
              mixBlendMode: 'overlay',
            }}
          />
          <motion.span
            className="relative text-2xl drop-shadow-[0_2px_4px_rgba(0,0,0,0.35)]"
            animate={{ rotate: [-6, 6, -6], y: [-2, 2, -2] }}
            transition={{ duration: 0.35, repeat: Infinity }}
          >
            {vehicle.emoji}
          </motion.span>

          <LevelBadge level={user.level} size="sm" />

          <div className="relative flex flex-col">
            <motion.span
              className="text-white font-black text-sm"
              style={{ textShadow: '0 2px 8px rgba(0,0,0,0.45)' }}
            >
              {user.displayName}
            </motion.span>
            <span className="text-white/85 text-xs font-semibold tracking-wide">🔥 VIP Entrance</span>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
};

// Simple inline entrance message for chat — Pkg173 glass polish
export const InlineEntranceMessage = ({ user }: { user: EntranceUser }) => (
  <motion.div
    initial={{ x: -100, opacity: 0, scale: 0.96 }}
    animate={{ x: 0, opacity: 1, scale: 1 }}
    transition={{ type: 'spring', damping: 24, stiffness: 320 }}
    className="relative overflow-hidden flex items-center gap-1.5 py-1 pl-1.5 pr-2.5 rounded-full w-fit border border-white/10"
    style={{
      background:
        'linear-gradient(135deg, rgba(168,85,247,0.32) 0%, rgba(236,72,153,0.32) 100%)',
      backdropFilter: 'blur(10px)',
      WebkitBackdropFilter: 'blur(10px)',
      boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.12)',
    }}
  >
    <InlineLevelBadge level={user.level} />
    <span className="relative text-white font-semibold text-xs truncate max-w-[120px]">{user.displayName}</span>
    <span className="relative text-white/70 text-xs">entered</span>
  </motion.div>
);

export default RoomEntranceNotification;
