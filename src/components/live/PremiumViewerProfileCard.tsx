import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { 
  X, 
  Heart, 
  MessageCircle, 
  UserPlus, 
  Gift, 
  Crown, 
  Star,
  Phone,
  Ban,
  Flag,
  MoreHorizontal,
  Sparkles,
  Diamond,
  Zap,
  Flame,
  Check,
  UserCheck,
  Shield
} from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import AvatarWithFrame from "@/components/common/AvatarWithFrame";

export interface ViewerProfile {
  id: string;
  name: string;
  avatar: string;
  level?: number;
  coins?: number;
  beans?: number;
  isFollowing?: boolean;
  isVIP?: boolean;
  isVerified?: boolean;
  totalGiftsSent?: number;
  totalGiftsReceived?: number;
  followers?: number;
  following?: number;
  country?: string;
  countryFlag?: string;
  bio?: string;
  uid?: string;
}

interface PremiumViewerProfileCardProps {
  viewer: ViewerProfile | null;
  isOpen: boolean;
  onClose: () => void;
  onFollow?: (viewerId: string) => void;
  onMessage?: (viewerId: string) => void;
  onGift?: (viewerId: string) => void;
  onCall?: (viewerId: string) => void;
  onBlock?: (viewerId: string) => void;
  onReport?: (viewerId: string) => void;
  onViewProfile?: (viewerId: string) => void;
  /** Pkg130 — host-only: open LiveKit moderation sheet for this viewer. */
  onModerate?: (viewerId: string) => void;
}

// Floating particles for background effect
const FloatingParticles = () => {
  const particles = Array.from({ length: 20 }, (_, i) => ({
    id: i,
    x: Math.random() * 100,
    y: Math.random() * 100,
    size: Math.random() * 4 + 2,
    duration: Math.random() * 3 + 2,
    delay: Math.random() * 2,
    emoji: ['✨', '💫', '⭐', '🌟', '💎'][Math.floor(Math.random() * 5)]
  }));

  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none">
      {particles.map((particle) => (
        <motion.div
          key={particle.id}
          className="absolute text-xs"
          style={{ left: `${particle.x}%`, top: `${particle.y}%` }}
          animate={{
            y: [0, -30, 0],
            opacity: [0, 1, 0],
            scale: [0.5, 1, 0.5],
          }}
          transition={{
            duration: particle.duration,
            delay: particle.delay,
            repeat: Infinity,
            ease: "easeInOut",
          }}
        >
          {particle.emoji}
        </motion.div>
      ))}
    </div>
  );
};

// Premium border animation
const PremiumBorder = ({ level }: { level: number }) => {
  const getGradient = () => {
    if (level >= 70) return "from-yellow-300 via-amber-400 to-orange-500";
    if (level >= 50) return "from-purple-400 via-pink-500 to-rose-500";
    if (level >= 30) return "from-cyan-400 via-blue-500 to-indigo-500";
    return "from-emerald-400 via-teal-500 to-cyan-500";
  };

  return (
    <motion.div
      className={cn(
        "absolute inset-0 rounded-t-[32px] bg-gradient-to-br",
        getGradient()
      )}
      animate={{
        backgroundPosition: ["0% 50%", "100% 50%", "0% 50%"],
      }}
      transition={{ duration: 3, repeat: Infinity }}
      style={{ backgroundSize: "200% 200%" }}
    />
  );
};

export const PremiumViewerProfileCard = ({
  viewer,
  isOpen,
  onClose,
  onFollow,
  onMessage,
  onGift,
  onCall,
  onBlock,
  onReport,
  onViewProfile,
  onModerate,
}: PremiumViewerProfileCardProps) => {
  const [isFollowing, setIsFollowing] = useState(viewer?.isFollowing || false);
  const [showMoreActions, setShowMoreActions] = useState(false);
  const [imageLoaded, setImageLoaded] = useState(false);

  useEffect(() => {
    if (viewer) {
      setIsFollowing(viewer.isFollowing || false);
    }
  }, [viewer]);

  if (!viewer) return null;

  const handleFollow = () => {
    setIsFollowing(!isFollowing);
    onFollow?.(viewer.id);
  };

  const level = viewer.level || 1;

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Premium Backdrop with blur */}
          <motion.div
            className="fixed inset-0 z-50"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
          >
            {/* Animated gradient background */}
            <motion.div 
              className="absolute inset-0 bg-gradient-to-b from-black/40 via-black/70 to-black/90 backdrop-blur-md"
              animate={{
                background: [
                  "radial-gradient(circle at 30% 50%, rgba(139, 92, 246, 0.15) 0%, transparent 50%), radial-gradient(circle at 70% 50%, rgba(236, 72, 153, 0.15) 0%, transparent 50%), linear-gradient(to bottom, rgba(0,0,0,0.4), rgba(0,0,0,0.9))",
                  "radial-gradient(circle at 70% 50%, rgba(139, 92, 246, 0.15) 0%, transparent 50%), radial-gradient(circle at 30% 50%, rgba(236, 72, 153, 0.15) 0%, transparent 50%), linear-gradient(to bottom, rgba(0,0,0,0.4), rgba(0,0,0,0.9))",
                ],
              }}
              transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
            />
            <FloatingParticles />
          </motion.div>

          {/* Premium Card */}
          <motion.div
            className="fixed bottom-0 left-0 right-0 z-50 mx-auto max-w-md"
            initial={{ y: "100%", scale: 0.9, opacity: 0 }}
            animate={{ y: 0, scale: 1, opacity: 1 }}
            exit={{ y: "100%", scale: 0.9, opacity: 0 }}
            transition={{ 
              type: "spring", 
              damping: 25, 
              stiffness: 300,
              mass: 0.8
            }}
          >
            <div className="relative">
              {/* Premium border glow */}
              <div className="absolute -inset-[2px] rounded-t-[34px] overflow-hidden">
                <PremiumBorder level={level} />
              </div>

              {/* Main card content */}
              <div className="relative bg-gradient-to-b from-background/98 via-background to-background backdrop-blur-xl rounded-t-[32px] overflow-hidden">
                {/* Sparkle overlay */}
                <motion.div
                  className="absolute inset-0 pointer-events-none"
                  style={{
                    background: "linear-gradient(135deg, transparent 30%, rgba(255,255,255,0.05) 50%, transparent 70%)",
                    backgroundSize: "200% 200%",
                  }}
                  animate={{
                    backgroundPosition: ["0% 0%", "100% 100%", "0% 0%"],
                  }}
                  transition={{ duration: 3, repeat: Infinity, ease: "linear" }}
                />

                {/* Handle Bar */}
                <motion.div 
                  className="flex justify-center py-3"
                  initial={{ opacity: 0, y: -10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.1 }}
                >
                  <div className="w-14 h-1.5 bg-gradient-to-r from-primary/30 via-primary to-primary/30 rounded-full" />
                </motion.div>

                {/* Close Button */}
                <motion.div
                  initial={{ opacity: 0, scale: 0 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ delay: 0.15, type: "spring" }}
                >
                  <Button
                    variant="ghost"
                    size="icon"
                    className="absolute top-3 right-3 rounded-full bg-white/10 hover:bg-white/20 text-white w-9 h-9 backdrop-blur-sm border border-white/10"
                    onClick={onClose}
                  >
                    <X className="w-4 h-4" />
                  </Button>
                </motion.div>

                {/* Profile Header with 3D Avatar */}
                <div className="px-6 pb-4 relative">
                  <motion.div
                    className="flex flex-col items-center"
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.1 }}
                  >
                    {/* Premium 3D Avatar */}
                    <motion.div
                      initial={{ scale: 0.5, opacity: 0 }}
                      animate={{ scale: 1, opacity: 1 }}
                      transition={{ 
                        delay: 0.15, 
                        type: "spring",
                        stiffness: 260,
                        damping: 20
                      }}
                      className="relative mb-3"
                      onClick={() => onViewProfile?.(viewer.id)}
                    >
                      <AvatarWithFrame 
                        userId={viewer.id}
                        level={level} 
                        size="xl"
                        src={viewer.avatar}
                        name={viewer.name}
                        showFrame={true}
                        showAnimation={true}
                      />

                      {/* VIP Crown Badge */}
                      {viewer.isVIP && (
                        <motion.div
                          className="absolute -top-2 -right-2 w-10 h-10"
                          initial={{ scale: 0, rotate: -45 }}
                          animate={{ scale: 1, rotate: 0 }}
                          transition={{ delay: 0.3, type: "spring" }}
                        >
                          <div className="relative w-full h-full">
                            <motion.div
                              className="absolute inset-0 bg-gradient-to-br from-amber-400 to-orange-500 rounded-full"
                              animate={{
                                boxShadow: [
                                  "0 0 10px rgba(251, 191, 36, 0.5)",
                                  "0 0 20px rgba(251, 191, 36, 0.8)",
                                  "0 0 10px rgba(251, 191, 36, 0.5)",
                                ],
                              }}
                              transition={{ duration: 1.5, repeat: Infinity }}
                            />
                            <div className="absolute inset-0 flex items-center justify-center">
                              <Crown className="w-5 h-5 text-white drop-shadow-lg" />
                            </div>
                          </div>
                        </motion.div>
                      )}

                      {/* Verified Badge */}
                      {viewer.isVerified && (
                        <motion.div
                          className="absolute -bottom-1 -right-1 w-7 h-7 bg-gradient-to-br from-blue-400 to-blue-600 rounded-full flex items-center justify-center border-2 border-background"
                          initial={{ scale: 0 }}
                          animate={{ scale: 1 }}
                          transition={{ delay: 0.35, type: "spring" }}
                        >
                          <Check className="w-4 h-4 text-white" />
                        </motion.div>
                      )}
                    </motion.div>

                    {/* Name and UID */}
                    <motion.div
                      className="text-center"
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 0.2 }}
                    >
                      <div className="flex items-center justify-center gap-2 mb-1">
                        <h3 className="text-xl font-bold text-foreground">{viewer.name}</h3>
                        {viewer.countryFlag && (
                          <span className="text-lg">{viewer.countryFlag}</span>
                        )}
                      </div>
                      
                      {viewer.uid && (
                        <p className="text-xs text-muted-foreground mb-2">
                          ID: {viewer.uid}
                        </p>
                      )}

                      {/* Level and VIP badges */}
                      <div className="flex items-center justify-center gap-2 flex-wrap">
                        <motion.div
                          initial={{ scale: 0 }}
                          animate={{ scale: 1 }}
                          transition={{ delay: 0.25, type: "spring" }}
                        >
                          <Badge 
                            className={cn(
                              "text-white border-0 text-xs px-3 py-1 font-bold",
                              level >= 70 ? "bg-gradient-to-r from-amber-400 via-yellow-500 to-amber-400" :
                              level >= 50 ? "bg-gradient-to-r from-purple-500 to-pink-500" :
                              level >= 30 ? "bg-gradient-to-r from-blue-500 to-cyan-500" :
                              "bg-gradient-to-r from-emerald-500 to-teal-500"
                            )}
                          >
                            <Sparkles className="w-3 h-3 mr-1" />
                            Lv.{level}
                          </Badge>
                        </motion.div>
                        
                        {viewer.isVIP && (
                          <motion.div
                            initial={{ scale: 0 }}
                            animate={{ scale: 1 }}
                            transition={{ delay: 0.3, type: "spring" }}
                          >
                            <Badge className="bg-gradient-to-r from-amber-400 to-orange-500 text-white border-0 text-xs px-3 py-1 font-bold">
                              <Crown className="w-3 h-3 mr-1" />
                              VIP
                            </Badge>
                          </motion.div>
                        )}
                      </div>

                      {/* Bio */}
                      {viewer.bio && (
                        <motion.p
                          className="text-muted-foreground text-sm mt-3 line-clamp-2 max-w-xs mx-auto"
                          initial={{ opacity: 0 }}
                          animate={{ opacity: 1 }}
                          transition={{ delay: 0.35 }}
                        >
                          {viewer.bio}
                        </motion.p>
                      )}
                    </motion.div>
                  </motion.div>
                </div>

                {/* Premium Stats Row */}
                <motion.div
                  className="px-4 py-4 mx-4 rounded-2xl bg-gradient-to-r from-muted/50 via-muted/30 to-muted/50 border border-white/5"
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.25 }}
                >
                  <div className="grid grid-cols-4 gap-2">
                    {/* Followers */}
                    <motion.div 
                      className="text-center"
                      whileHover={{ scale: 1.05 }}
                    >
                      <div className="flex items-center justify-center gap-1 mb-1">
                        <motion.span 
                          className="text-lg font-bold text-foreground"
                          initial={{ opacity: 0, scale: 0.5 }}
                          animate={{ opacity: 1, scale: 1 }}
                          transition={{ delay: 0.3 }}
                        >
                          {(viewer.followers || 0).toLocaleString()}
                        </motion.span>
                      </div>
                      <span className="text-xs text-muted-foreground">Followers</span>
                    </motion.div>

                    {/* Following */}
                    <motion.div 
                      className="text-center"
                      whileHover={{ scale: 1.05 }}
                    >
                      <div className="flex items-center justify-center gap-1 mb-1">
                        <motion.span 
                          className="text-lg font-bold text-foreground"
                          initial={{ opacity: 0, scale: 0.5 }}
                          animate={{ opacity: 1, scale: 1 }}
                          transition={{ delay: 0.35 }}
                        >
                          {viewer.following || 0}
                        </motion.span>
                      </div>
                      <span className="text-xs text-muted-foreground">Following</span>
                    </motion.div>

                    {/* Coins */}
                    <motion.div 
                      className="text-center"
                      whileHover={{ scale: 1.05 }}
                    >
                      <div className="flex items-center justify-center gap-1 mb-1">
                        <span className="text-sm">💎</span>
                        <motion.span 
                          className="text-lg font-bold text-foreground"
                          initial={{ opacity: 0, scale: 0.5 }}
                          animate={{ opacity: 1, scale: 1 }}
                          transition={{ delay: 0.4 }}
                        >
                          {((viewer.diamonds || 0) / 1000).toFixed(0)}K
                        </motion.span>
                      </div>
                      <span className="text-xs text-muted-foreground">Diamonds</span>
                    </motion.div>

                    {/* Gifts */}
                    <motion.div 
                      className="text-center"
                      whileHover={{ scale: 1.05 }}
                    >
                      <div className="flex items-center justify-center gap-1 mb-1">
                        <Gift className="w-4 h-4 text-pink-500" />
                        <motion.span 
                          className="text-lg font-bold text-foreground"
                          initial={{ opacity: 0, scale: 0.5 }}
                          animate={{ opacity: 1, scale: 1 }}
                          transition={{ delay: 0.45 }}
                        >
                          {viewer.totalGiftsSent || 0}
                        </motion.span>
                      </div>
                      <span className="text-xs text-muted-foreground">Gifts</span>
                    </motion.div>
                  </div>
                </motion.div>

                {/* Action Buttons */}
                <motion.div
                  className="p-6 space-y-3"
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.3 }}
                >
                  {/* Primary Actions Row */}
                  <div className="flex gap-3">
                    <motion.div className="flex-1" whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}>
                      <Button
                        onClick={handleFollow}
                        className={cn(
                          "w-full rounded-xl h-12 font-bold transition-all relative overflow-hidden",
                          isFollowing
                            ? "bg-muted text-foreground hover:bg-muted/80"
                            : "bg-gradient-to-r from-primary via-pink-500 to-purple-500 text-white shadow-lg"
                        )}
                      >
                        {!isFollowing && (
                          <motion.div
                            className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent"
                            animate={{ x: ["-100%", "100%"] }}
                            transition={{ duration: 2, repeat: Infinity, repeatDelay: 1 }}
                          />
                        )}
                        <span className="relative z-10 flex items-center justify-center">
                          {isFollowing ? (
                            <>
                              <UserCheck className="w-5 h-5 mr-2" />
                              Following
                            </>
                          ) : (
                            <>
                              <UserPlus className="w-5 h-5 mr-2" />
                              Follow
                            </>
                          )}
                        </span>
                      </Button>
                    </motion.div>
                    
                    <motion.div className="flex-1" whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}>
                      <Button
                        variant="outline"
                        onClick={() => onMessage?.(viewer.id)}
                        className="w-full rounded-xl h-12 font-bold border-white/20 hover:bg-white/10 backdrop-blur-sm"
                      >
                        <MessageCircle className="w-5 h-5 mr-2" />
                        Message
                      </Button>
                    </motion.div>
                  </div>

                  {/* Secondary Actions Row - Premium Style */}
                  <div className="flex gap-2">
                    <motion.div className="flex-1" whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}>
                      <Button
                        variant="ghost"
                        onClick={() => onGift?.(viewer.id)}
                        className="w-full rounded-xl h-11 bg-gradient-to-r from-pink-500/20 to-purple-500/20 hover:from-pink-500/30 hover:to-purple-500/30 text-foreground relative overflow-hidden"
                      >
                        <motion.div
                          className="absolute inset-0"
                          animate={{
                            background: [
                              "radial-gradient(circle at 0% 50%, rgba(236, 72, 153, 0.2) 0%, transparent 50%)",
                              "radial-gradient(circle at 100% 50%, rgba(236, 72, 153, 0.2) 0%, transparent 50%)",
                              "radial-gradient(circle at 0% 50%, rgba(236, 72, 153, 0.2) 0%, transparent 50%)",
                            ],
                          }}
                          transition={{ duration: 3, repeat: Infinity }}
                        />
                        <Gift className="w-4 h-4 mr-2 text-pink-500 relative z-10" />
                        <span className="relative z-10">Send Gift</span>
                      </Button>
                    </motion.div>
                    
                    <motion.div className="flex-1" whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}>
                      <Button
                        variant="ghost"
                        onClick={() => onCall?.(viewer.id)}
                        className="w-full rounded-xl h-11 bg-green-500/20 hover:bg-green-500/30 text-foreground"
                      >
                        <Phone className="w-4 h-4 mr-2 text-green-500" />
                        Call
                      </Button>
                    </motion.div>
                    
                    <motion.div whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => setShowMoreActions(!showMoreActions)}
                        className="rounded-xl h-11 w-11 bg-white/5 hover:bg-white/10"
                      >
                        <MoreHorizontal className="w-5 h-5" />
                      </Button>
                    </motion.div>
                  </div>

                  {/* More Actions */}
                  <AnimatePresence>
                    {showMoreActions && (
                      <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: "auto", opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        className="overflow-hidden"
                      >
                        <div className="flex gap-2 pt-2">
                          <motion.div className="flex-1" whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}>
                            <Button
                              variant="ghost"
                              onClick={() => {
                                onBlock?.(viewer.id);
                                onClose();
                              }}
                              className="w-full rounded-xl h-10 bg-red-500/10 hover:bg-red-500/20 text-red-500"
                            >
                              <Ban className="w-4 h-4 mr-2" />
                              Block
                            </Button>
                          </motion.div>
                          
                          <motion.div className="flex-1" whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}>
                            <Button
                              variant="ghost"
                              onClick={() => {
                                onReport?.(viewer.id);
                                onClose();
                              }}
                              className="w-full rounded-xl h-10 bg-orange-500/10 hover:bg-orange-500/20 text-orange-500"
                            >
                              <Flag className="w-4 h-4 mr-2" />
                              Report
                            </Button>
                          </motion.div>
                        </div>
                        {onModerate && (
                          <motion.div className="pt-2" whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}>
                            <Button
                              variant="ghost"
                              onClick={() => {
                                onModerate(viewer.id);
                                onClose();
                              }}
                              className="w-full rounded-xl h-10 bg-indigo-500/10 hover:bg-indigo-500/20 text-indigo-500"
                            >
                              <Shield className="w-4 h-4 mr-2" />
                              Moderate (Promote / Demote / Mute / Kick)
                            </Button>
                          </motion.div>
                        )}
                      </motion.div>
                    )}
                  </AnimatePresence>
                </motion.div>

                {/* Safe Area */}
                <div className="h-8 safe-area-bottom" />
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
};
