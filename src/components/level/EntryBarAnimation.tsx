import { motion, AnimatePresence } from "framer-motion";
import { useState, useEffect, useRef } from "react";
import { LevelBadge, InlineLevelBadge } from "@/components/common/LevelBadge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { supabase } from "@/integrations/supabase/client";
import { getEquippedPrivilegesForUser } from "@/hooks/useUserPrivileges";
import EntryAnimationFrame from "@/components/entry/EntryAnimationFrame";
import { playSoundUrl, playSynthSequence } from "@/utils/soundPlayer";
import { isNativeEntryPipelineActive } from "@/utils/nativeAnimRuntime";
import { getRequiredDisplayLevel } from "@/utils/stableLevel";

interface UserInfo {
  displayName: string;
  avatarUrl?: string;
  level: number;
}

interface EntryBarAnimationProps {
  userId: string;
  userInfo?: UserInfo;
  onComplete?: () => void;
  showDuration?: number;
  position?: 'top' | 'center' | 'bottom';
}

interface EntryBarData {
  animation_url: string;
  animation_type: string;
  sound_url?: string;
}

// Sound effect player — Pkg422: routed through the shared AudioContext
// + URL player. Previously created a fresh `new AudioContext()` per entry
// which hit the iOS 6-context cap on busy streams and killed all audio.
const playEntrySound = async (level: number, customSoundUrl?: string) => {
  if (customSoundUrl) {
    playSoundUrl(customSoundUrl, { volume: 0.5 });
    return;
  }
  // Level-based synthesized fallback on the shared limiter bus
  if (level >= 40) {
    playSynthSequence([
      { freq: 880, toFreq: 1320, duration: 0.1, gain: 0.3, type: 'sine' },
      { freq: 1320, toFreq: 660, startOffset: 0.1, duration: 0.3, gain: 0.25, type: 'sine' },
    ]);
  } else if (level >= 20) {
    playSynthSequence([
      { freq: 660, toFreq: 880, duration: 0.25, gain: 0.2, type: 'triangle' },
    ]);
  } else if (level >= 10) {
    playSynthSequence([
      { freq: 440, duration: 0.15, gain: 0.15, type: 'sine' },
    ]);
  }
};


// Get gradient color based on level
const getBarGradient = (level: number) => {
  if (level >= 50) return 'from-amber-500 via-yellow-400 to-orange-500';
  if (level >= 40) return 'from-purple-500 via-pink-500 to-rose-500';
  if (level >= 30) return 'from-cyan-500 via-blue-500 to-indigo-500';
  if (level >= 20) return 'from-green-500 via-emerald-500 to-teal-500';
  if (level >= 10) return 'from-violet-500 via-purple-500 to-fuchsia-500';
  return 'from-pink-500 via-rose-500 to-red-500';
};

// Default Entry Bar Component
const DefaultEntryBar = ({ user }: { user: UserInfo }) => {
  const gradient = getBarGradient(user.level);
  
  return (
    <motion.div
      initial={{ x: '-100%', opacity: 0 }}
      animate={{ x: 0, opacity: 1 }}
      exit={{ x: '100%', opacity: 0 }}
      transition={{ 
        type: "spring", 
        damping: 20, 
        stiffness: 100,
        duration: 0.6
      }}
      className="relative w-full"
    >
      {/* Glow effect */}
      <div className={`absolute inset-0 bg-gradient-to-r ${gradient} blur-xl opacity-50`} />
      
      {/* Main bar */}
      <div className={`relative flex items-center gap-4 px-6 py-3 bg-gradient-to-r ${gradient} rounded-2xl border border-white/30 shadow-2xl`}>
        {/* Sparkle effects */}
        {[...Array(6)].map((_, i) => (
          <motion.div
            key={i}
            className="absolute w-1.5 h-1.5 bg-white rounded-full"
            style={{
              left: `${15 + i * 15}%`,
              top: i % 2 === 0 ? '10%' : '80%',
            }}
            animate={{
              opacity: [0, 1, 0],
              scale: [0.5, 1.5, 0.5],
            }}
            transition={{
              duration: 1,
              delay: i * 0.15,
              repeat: Infinity,
            }}
          />
        ))}

        {/* Speed lines */}
        {[...Array(3)].map((_, i) => (
          <motion.div
            key={i}
            className="absolute h-[2px] bg-gradient-to-r from-white/80 to-transparent rounded-full"
            style={{
              width: `${30 + i * 20}px`,
              left: '-50px',
              top: `${30 + i * 20}%`,
            }}
            animate={{ x: [0, 400] }}
            transition={{
              duration: 0.5,
              delay: i * 0.1,
              repeat: Infinity,
              repeatDelay: 1.5,
            }}
          />
        ))}

        {/* Avatar with frame */}
        <motion.div
          animate={{ scale: [1, 1.05, 1] }}
          transition={{ duration: 1, repeat: Infinity }}
        >
          <Avatar className="w-12 h-12 border-2 border-white/50 shadow-lg">
            <AvatarImage src={user.avatarUrl} />
            <AvatarFallback className="bg-white/20 text-white font-bold">
              {user.displayName[0]}
            </AvatarFallback>
          </Avatar>
        </motion.div>

        {/* User info */}
        <div className="flex-1 flex flex-col gap-0.5">
          <div className="flex items-center gap-2">
            <LevelBadge level={user.level} size="sm" animated />
            <motion.span 
              className="text-white font-bold text-lg drop-shadow-lg"
              animate={{ opacity: [0.9, 1, 0.9] }}
              transition={{ duration: 1.5, repeat: Infinity }}
            >
              {user.displayName}
            </motion.span>
          </div>
          <span className="text-white/80 text-xs">entered the room ✨</span>
        </div>

        {/* Decorative element */}
        <motion.div
          className="text-2xl"
          animate={{ 
            rotate: [0, 15, -15, 0],
            scale: [1, 1.2, 1]
          }}
          transition={{ duration: 1.5, repeat: Infinity }}
        >
          {user.level >= 40 ? '👑' : user.level >= 30 ? '⭐' : user.level >= 20 ? '💎' : '✨'}
        </motion.div>
      </div>
    </motion.div>
  );
};

// VIP Entry Bar with custom animation (supports SVGA, Lottie, GIF, MP4)
const VIPEntryBar = ({ user, animationUrl }: { user: UserInfo; animationUrl?: string }) => {
  // Check if animation URL exists
  const hasAnimation = animationUrl && animationUrl.startsWith('http');
  // SVGA can engrave avatar/name INSIDE the timeline. Detect so we can hide
  // the HTML overlay and rely on the in-animation slots — that's what makes
  // the name look "carved into" the animation (Chamet/BIGO parity).
  const isSvgaTemplate = !!hasAnimation && /\.svga(?:$|[?#])/i.test(animationUrl || '');
  const [animReady, setAnimReady] = useState(false);

  return (
    <motion.div
      initial={{ scale: 0.5, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      exit={{ scale: 0.5, opacity: 0 }}
      transition={{ type: "spring", damping: 15 }}
      className="relative w-full"
    >
      {/* Background animation layer — supports all formats via EntryAnimationFrame.
          For SVGA templates we inject the user's avatar/name/level INSIDE
          the timeline so the HTML overlay is not needed. */}
      {hasAnimation && (
        <div className="absolute inset-0 flex items-center justify-center overflow-hidden rounded-2xl">
          <EntryAnimationFrame
            src={animationUrl}
            size="fill"
            className="object-cover"
            loop
            center={false}
            onLoad={() => setAnimReady(true)}
            dynamicAvatarUrl={user.avatarUrl ?? null}
            dynamicUserName={user.displayName ?? null}
            dynamicUserLevel={user.level ?? null}
          />
        </div>
      )}

      {/* HTML overlay — only shown when the animation has NO engraved slots
          (non-SVGA templates) or while the SVGA is still loading. For SVGA
          we wait for `onLoad` and then fade the HTML overlay OUT so the
          engraved version takes over without a flash of duplicate text. */}
      <motion.div
        className={`relative flex items-center gap-4 px-6 py-4 rounded-2xl border-2 shadow-[0_0_40px_rgba(251,191,36,0.5)] ${
          hasAnimation
            ? 'bg-gradient-to-r from-amber-500/70 via-yellow-400/70 to-orange-500/70 border-yellow-300/50'
            : 'bg-gradient-to-r from-amber-500/90 via-yellow-400/90 to-orange-500/90 border-yellow-300'
        }`}
        initial={{ opacity: isSvgaTemplate ? 0 : 1 }}
        animate={{ opacity: isSvgaTemplate ? (animReady ? 0 : 0) : 1 }}
        transition={{ duration: 0.25 }}
        style={{ pointerEvents: 'none' }}
      >
        {/* Crown icon */}
        <motion.div
          className="absolute -top-6 left-1/2 -translate-x-1/2 text-3xl"
          animate={{ y: [-2, 2, -2] }}
          transition={{ duration: 1, repeat: Infinity }}
        >
          👑
        </motion.div>

        {/* Avatar */}
        <Avatar className="w-14 h-14 border-3 border-yellow-300 shadow-xl">
          <AvatarImage src={user.avatarUrl} />
          <AvatarFallback className="bg-amber-400 text-white font-bold text-xl">
            {user.displayName[0]}
          </AvatarFallback>
        </Avatar>

        {/* Info */}
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <LevelBadge level={user.level} size="md" showIcon animated />
            <span className="text-amber-900 font-black text-xl drop-shadow-sm">
              {user.displayName}
            </span>
          </div>
          <motion.span
            className="text-amber-800 text-sm font-semibold"
            animate={{ opacity: [0.7, 1, 0.7] }}
            transition={{ duration: 1, repeat: Infinity }}
          >
            🔥 VIP has arrived!
          </motion.span>
        </div>

        {/* Particles */}
        {[...Array(8)].map((_, i) => (
          <motion.div
            key={i}
            className="absolute w-2 h-2 rounded-full bg-yellow-300"
            style={{
              left: `${10 + i * 12}%`,
              top: i % 2 === 0 ? '-10px' : 'calc(100% + 10px)',
            }}
            animate={{
              y: i % 2 === 0 ? [-10, 10] : [10, -10],
              opacity: [0, 1, 0],
              scale: [0.5, 1.5, 0.5],
            }}
            transition={{
              duration: 1.2,
              delay: i * 0.1,
              repeat: Infinity,
            }}
          />
        ))}
      </motion.div>
    </motion.div>
  );
};

// Main Entry Bar Animation Component
const EntryBarAnimation = ({ 
  userId, 
  userInfo, 
  onComplete, 
  showDuration = 3500,
  position = 'center'
}: EntryBarAnimationProps) => {
  // Pkg438 Phase C: suppress WebView render when native entry pipeline is live.
  const skipForNative = isNativeEntryPipelineActive();
  const completedRef = useRef(false);

  const [isVisible, setIsVisible] = useState(true);
  const [user, setUser] = useState<UserInfo | null>(userInfo || null);
  const [customEntryBar, setCustomEntryBar] = useState<EntryBarData | null>(null);
  const soundPlayedRef = useRef(false);

  useEffect(() => {
    if (skipForNative && !completedRef.current) {
      completedRef.current = true;
      try { onComplete?.(); } catch { /* ignore */ }
    }
  }, [skipForNative, onComplete]);

  useEffect(() => {
    const fetchData = async () => {
      // Fetch user info if not provided
      if (!userInfo) {
        const { data: profile } = await supabase
          .from('profiles')
          .select('display_name, avatar_url, user_level, host_level, max_user_level, gender, is_host')
          .eq('id', userId)
          .single();
        
        if (profile) {
          setUser({
            displayName: profile.display_name || 'User',
            avatarUrl: profile.avatar_url || undefined,
            level: getRequiredDisplayLevel(profile)
          });
        }
      }

      // Check for VIP tier entry animation first
      const { data: vipSub } = await supabase
        .from('user_vip_subscriptions')
        .select('tier_id')
        .eq('user_id', userId)
        .eq('is_active', true)
        .gte('end_date', new Date().toISOString())
        .maybeSingle();

      if (vipSub?.tier_id) {
        const { data: tier } = await supabase
          .from('vip_tiers')
          .select('entry_animation_url')
          .eq('id', vipSub.tier_id)
          .eq('is_active', true)
          .maybeSingle();
        
        if (tier?.entry_animation_url) {
          setCustomEntryBar({
            animation_url: tier.entry_animation_url,
            animation_type: 'vip',
          });
          return;
        }
      }

      // Check for custom entry bar from shop or level privileges
      const privileges = await getEquippedPrivilegesForUser(userId);
      if (privileges?.entry_bar?.animation_url) {
        setCustomEntryBar({
          animation_url: privileges.entry_bar.animation_url,
          animation_type: 'custom',
        });
      } else {
        // Check level_privileges table
        const userLevel = userInfo?.level || 1;
        const { data: levelPrivilege } = await supabase
          .from('level_privileges')
          .select('animation_url, preview_url')
          .eq('privilege_type', 'entry_bar')
          .lte('unlock_level', userLevel)
          .eq('is_active', true)
          .order('unlock_level', { ascending: false })
          .limit(1)
          .maybeSingle();

        if (levelPrivilege?.animation_url) {
          setCustomEntryBar({
            animation_url: levelPrivilege.animation_url,
            animation_type: 'level',
          });
        }
      }
    };

    fetchData();
  }, [userId, userInfo]);

  // Play sound once
  useEffect(() => {
    if (user && !soundPlayedRef.current) {
      soundPlayedRef.current = true;
      playEntrySound(user.level);
    }
  }, [user]);

  // Auto hide after duration
  useEffect(() => {
    const timer = setTimeout(() => {
      setIsVisible(false);
      onComplete?.();
    }, showDuration);

    return () => clearTimeout(timer);
  }, [showDuration, onComplete]);

  if (!user || !isVisible) return null;

  const positionClasses = {
    top: 'top-20',
    center: 'top-1/3',
    bottom: 'bottom-32',
  };

  if (skipForNative) return null;

  return (
    <AnimatePresence>
      {isVisible && (
        <motion.div 
          className={`fixed left-4 right-4 ${positionClasses[position]} z-50`}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
        >
          {user.level >= 30 && customEntryBar?.animation_url ? (
            <VIPEntryBar user={user} animationUrl={customEntryBar.animation_url} />
          ) : (
            <DefaultEntryBar user={user} />
          )}
        </motion.div>
      )}
    </AnimatePresence>
  );
};

export default EntryBarAnimation;
