import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { 
  X, 
  Heart, 
  MessageCircle, 
  UserPlus, 
  Gift, 
  Crown, 
  Phone,
  Ban,
  Flag,
  MoreHorizontal,
  Sparkles,
  Check,
  UserCheck,
  ExternalLink
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import AvatarWithFrame from "@/components/common/AvatarWithFrame";
import { ProfileData, UnifiedProfileCardProps } from "./types";

// Floating particles for premium effect
const FloatingParticles = () => {
  const particles = Array.from({ length: 12 }, (_, i) => ({
    id: i,
    x: Math.random() * 100,
    y: Math.random() * 100,
    duration: Math.random() * 3 + 2,
    delay: Math.random() * 2,
    emoji: ['✨', '💫', '⭐'][Math.floor(Math.random() * 3)]
  }));

  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none">
      {particles.map((particle) => (
        <motion.div
          key={particle.id}
          className="absolute text-xs opacity-60"
          style={{ left: `${particle.x}%`, top: `${particle.y}%` }}
          animate={{
            y: [0, -20, 0],
            opacity: [0, 0.6, 0],
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

// Level-based gradient for border
const getLevelGradient = (level: number) => {
  if (level >= 70) return "from-yellow-400 via-amber-500 to-orange-500";
  if (level >= 50) return "from-purple-500 via-pink-500 to-rose-500";
  if (level >= 30) return "from-cyan-400 via-blue-500 to-indigo-500";
  return "from-emerald-400 via-teal-500 to-cyan-500";
};

export const UnifiedProfileCard = ({
  profile,
  isOpen,
  onClose,
  onFollow,
  onMessage,
  onGift,
  onCall,
  onBlock,
  onReport,
  onViewFullProfile,
  context = 'live',
  currentUserId,
}: UnifiedProfileCardProps) => {
  const [isFollowing, setIsFollowing] = useState(profile?.isFollowing || false);
  const [showMoreActions, setShowMoreActions] = useState(false);

  useEffect(() => {
    if (profile) {
      setIsFollowing(profile.isFollowing || false);
    }
  }, [profile]);

  if (!profile) return null;

  const handleFollow = () => {
    setIsFollowing(!isFollowing);
    onFollow?.(profile.id);
  };

  const level = profile.level || 1;
  const isHost = profile.isHost || false;
  const isSelf = currentUserId === profile.id;

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Premium Backdrop */}
          <motion.div
            className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
          >
            <FloatingParticles />
          </motion.div>

          {/* Card */}
          <motion.div
            className="fixed bottom-0 left-0 right-0 z-50 mx-auto max-w-md"
            initial={{ y: "100%", scale: 0.95 }}
            animate={{ y: 0, scale: 1 }}
            exit={{ y: "100%", scale: 0.95 }}
            transition={{ type: "spring", damping: 28, stiffness: 350 }}
          >
            <div className="relative">
              {/* Premium border glow */}
              <motion.div 
                className={cn(
                  "absolute -inset-[2px] rounded-t-[28px] bg-gradient-to-br",
                  getLevelGradient(level)
                )}
                animate={{
                  backgroundPosition: ["0% 50%", "100% 50%", "0% 50%"],
                }}
                transition={{ duration: 3, repeat: Infinity }}
                style={{ backgroundSize: "200% 200%" }}
              />

              {/* Main card content */}
              <div className="relative bg-gradient-to-b from-slate-900/98 via-slate-900 to-slate-950 rounded-t-[26px] overflow-hidden">
                
                {/* Handle Bar */}
                <div className="flex justify-center py-3">
                  <div className="w-12 h-1.5 bg-white/20 rounded-full" />
                </div>

                {/* Close Button */}
                <Button
                  variant="ghost"
                  size="icon"
                  className="absolute top-3 right-3 rounded-full bg-white/10 hover:bg-white/20 text-white w-8 h-8"
                  onClick={onClose}
                >
                  <X className="w-4 h-4" />
                </Button>

                {/* Profile Header */}
                <div className="px-5 pb-4">
                  <motion.div
                    className="flex items-start gap-4"
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.1 }}
                  >
                    {/* Avatar with Frame */}
                    <motion.div
                      className="relative cursor-pointer flex-shrink-0"
                      onClick={() => onViewFullProfile?.(profile.id)}
                      whileHover={{ scale: 1.02 }}
                      whileTap={{ scale: 0.98 }}
                    >
                      <AvatarWithFrame
                        userId={profile.id}
                        src={profile.avatar}
                        name={profile.name}
                        level={level}
                        frameId={profile.frameId}
                        size="lg"
                        showAnimation={true}
                      />
                      
                      {/* VIP Crown */}
                      {profile.isVIP && (
                        <motion.div
                          className="absolute -top-1 -right-1 w-7 h-7 bg-gradient-to-br from-amber-400 to-orange-500 rounded-full flex items-center justify-center shadow-lg"
                          initial={{ scale: 0 }}
                          animate={{ scale: 1 }}
                          transition={{ delay: 0.2, type: "spring" }}
                        >
                          <Crown className="w-4 h-4 text-white" />
                        </motion.div>
                      )}

                      {/* Verified Badge */}
                      {profile.isVerified && (
                        <motion.div
                          className="absolute -bottom-0.5 -right-0.5 w-5 h-5 bg-blue-500 rounded-full flex items-center justify-center border-2 border-slate-900"
                          initial={{ scale: 0 }}
                          animate={{ scale: 1 }}
                          transition={{ delay: 0.25, type: "spring" }}
                        >
                          <Check className="w-3 h-3 text-white" />
                        </motion.div>
                      )}
                    </motion.div>

                    {/* Info */}
                    <div className="flex-1 min-w-0 pt-1">
                      <div className="flex items-center gap-2 mb-1">
                        <h3 className="text-lg font-bold text-white truncate">{profile.name}</h3>
                        {profile.countryFlag && (
                          <span className="text-base flex-shrink-0">{profile.countryFlag}</span>
                        )}
                      </div>
                      
                      {profile.uid && (
                        <p className="text-[11px] text-slate-400 mb-2">ID: {profile.uid}</p>
                      )}

                      {/* Badges */}
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <Badge 
                          className={cn(
                            "text-white border-0 text-[10px] px-2 py-0.5 font-bold",
                            level >= 70 ? "bg-gradient-to-r from-amber-400 to-orange-500" :
                            level >= 50 ? "bg-gradient-to-r from-purple-500 to-pink-500" :
                            level >= 30 ? "bg-gradient-to-r from-blue-500 to-cyan-500" :
                            "bg-gradient-to-r from-emerald-500 to-teal-500"
                          )}
                        >
                          <Sparkles className="w-2.5 h-2.5 mr-0.5" />
                          Lv.{level}
                        </Badge>
                        
                        {profile.isVIP && (
                          <Badge className="bg-gradient-to-r from-amber-400 to-orange-500 text-white border-0 text-[10px] px-2 py-0.5 font-bold">
                            <Crown className="w-2.5 h-2.5 mr-0.5" />
                            VIP
                          </Badge>
                        )}

                        {isHost && (
                          <Badge className="bg-gradient-to-r from-pink-500 to-rose-500 text-white border-0 text-[10px] px-2 py-0.5 font-bold">
                            Host
                          </Badge>
                        )}
                      </div>

                      {/* Bio */}
                      {profile.bio && (
                        <p className="text-slate-400 text-xs mt-2 line-clamp-2">{profile.bio}</p>
                      )}
                    </div>
                  </motion.div>
                </div>

                {/* Stats Row */}
                <motion.div
                  className="mx-4 px-3 py-3 rounded-xl bg-white/5 border border-white/10"
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.15 }}
                >
                  <div className="grid grid-cols-4 gap-2">
                    <div className="text-center">
                      <div className="text-base font-bold text-white">
                        {(profile.followers || 0).toLocaleString()}
                      </div>
                      <div className="text-[10px] text-slate-400">Followers</div>
                    </div>
                    <div className="text-center">
                      <div className="text-base font-bold text-white">
                        {profile.following || 0}
                      </div>
                      <div className="text-[10px] text-slate-400">Following</div>
                    </div>
                    <div className="text-center">
                      <div className="flex items-center justify-center gap-0.5">
                        <span className="text-xs">🪙</span>
                        <span className="text-base font-bold text-white">
                          {((profile.diamonds || 0) / 1000).toFixed(0)}K
                        </span>
                      </div>
                      <div className="text-[10px] text-slate-400">Diamonds</div>
                    </div>
                    <div className="text-center">
                      <div className="flex items-center justify-center gap-0.5">
                        <Gift className="w-3 h-3 text-pink-400" />
                        <span className="text-base font-bold text-white">
                          {profile.totalGiftsSent || 0}
                        </span>
                      </div>
                      <div className="text-[10px] text-slate-400">Gifts</div>
                    </div>
                  </div>
                </motion.div>

                {/* Action Buttons - Different for Host vs User */}
                <motion.div
                  className="p-4 space-y-2.5"
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.2 }}
                >
                  {!isSelf && (
                    <>
                      {/* Primary Actions Row */}
                      <div className="flex gap-2">
                        {/* Follow Button - Always shown for non-self */}
                        <Button
                          onClick={handleFollow}
                          className={cn(
                            "flex-1 rounded-xl h-11 font-bold transition-all text-sm",
                            isFollowing
                              ? "bg-slate-700 text-white hover:bg-slate-600"
                              : "bg-gradient-to-r from-pink-500 to-rose-500 text-white shadow-lg shadow-pink-500/30 hover:shadow-xl"
                          )}
                        >
                          {isFollowing ? (
                            <>
                              <UserCheck className="w-4 h-4 mr-1.5" />
                              Following
                            </>
                          ) : (
                            <>
                              <Heart className="w-4 h-4 mr-1.5" />
                              Follow
                            </>
                          )}
                        </Button>

                        {/* Message Button */}
                        <Button
                          onClick={() => onMessage?.(profile.id)}
                          className="flex-1 rounded-xl h-11 font-bold text-sm bg-slate-700 text-white hover:bg-slate-600"
                        >
                          <MessageCircle className="w-4 h-4 mr-1.5" />
                          Message
                        </Button>
                      </div>

                      {/* Secondary Actions - Show Call & Gift for HOST only */}
                      {isHost && (
                        <div className="flex gap-2">
                          <Button
                            onClick={() => onCall?.(profile.id)}
                            className="flex-1 rounded-xl h-10 font-bold text-sm bg-gradient-to-r from-green-500 to-emerald-500 text-white shadow-lg shadow-green-500/30"
                          >
                            <Phone className="w-4 h-4 mr-1.5" />
                            Call
                          </Button>
                          <Button
                            onClick={() => onGift?.(profile.id)}
                            className="flex-1 rounded-xl h-10 font-bold text-sm bg-gradient-to-r from-purple-500 to-pink-500 text-white shadow-lg shadow-purple-500/30"
                          >
                            <Gift className="w-4 h-4 mr-1.5" />
                            Send Gift
                          </Button>
                        </div>
                      )}

                      {/* More Actions Toggle */}
                      <div className="flex gap-2">
                        <Button
                          variant="ghost"
                          onClick={() => onViewFullProfile?.(profile.id)}
                          className="flex-1 rounded-xl h-9 text-xs bg-white/5 hover:bg-white/10 text-slate-300"
                        >
                          <ExternalLink className="w-3.5 h-3.5 mr-1.5" />
                          View Profile
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => setShowMoreActions(!showMoreActions)}
                          className="rounded-xl h-9 w-9 bg-white/5 hover:bg-white/10 text-slate-300"
                        >
                          <MoreHorizontal className="w-4 h-4" />
                        </Button>
                      </div>

                      {/* More Actions Dropdown */}
                      <AnimatePresence>
                        {showMoreActions && (
                          <motion.div
                            initial={{ height: 0, opacity: 0 }}
                            animate={{ height: "auto", opacity: 1 }}
                            exit={{ height: 0, opacity: 0 }}
                            className="overflow-hidden"
                          >
                            <div className="flex gap-2 pt-1">
                              <Button
                                variant="ghost"
                                onClick={() => {
                                  onBlock?.(profile.id);
                                  onClose();
                                }}
                                className="flex-1 rounded-xl h-9 text-xs bg-red-500/10 hover:bg-red-500/20 text-red-400"
                              >
                                <Ban className="w-3.5 h-3.5 mr-1.5" />
                                Block
                              </Button>
                              <Button
                                variant="ghost"
                                onClick={() => {
                                  onReport?.(profile.id);
                                  onClose();
                                }}
                                className="flex-1 rounded-xl h-9 text-xs bg-orange-500/10 hover:bg-orange-500/20 text-orange-400"
                              >
                                <Flag className="w-3.5 h-3.5 mr-1.5" />
                                Report
                              </Button>
                            </div>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </>
                  )}

                  {/* Self Profile - Just View Profile */}
                  {isSelf && (
                    <Button
                      onClick={() => onViewFullProfile?.(profile.id)}
                      className="w-full rounded-xl h-11 font-bold text-sm bg-gradient-to-r from-primary to-purple-500 text-white"
                    >
                      <ExternalLink className="w-4 h-4 mr-1.5" />
                      View My Profile
                    </Button>
                  )}
                </motion.div>

                {/* Safe Area */}
                <div className="h-6 safe-area-bottom" />
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
};

export default UnifiedProfileCard;
