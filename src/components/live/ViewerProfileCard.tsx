import { useState } from "react";
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
  MoreHorizontal
} from "lucide-react";
import AvatarWithFrame from "@/components/common/AvatarWithFrame";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

export interface ViewerProfile {
  id: string;
  name: string;
  avatar: string;
  level?: number;
  diamonds?: number;
  isFollowing?: boolean;
  isVIP?: boolean;
  totalGiftsSent?: number;
  country?: string;
  countryFlag?: string;
  bio?: string;
}

interface ViewerProfileCardProps {
  viewer: ViewerProfile | null;
  isOpen: boolean;
  onClose: () => void;
  onFollow?: (viewerId: string) => void;
  onMessage?: (viewerId: string) => void;
  onGift?: (viewerId: string) => void;
  onCall?: (viewerId: string) => void;
  onBlock?: (viewerId: string) => void;
  onReport?: (viewerId: string) => void;
}

export const ViewerProfileCard = ({
  viewer,
  isOpen,
  onClose,
  onFollow,
  onMessage,
  onGift,
  onCall,
  onBlock,
  onReport,
}: ViewerProfileCardProps) => {
  const [isFollowing, setIsFollowing] = useState(viewer?.isFollowing || false);
  const [showMoreActions, setShowMoreActions] = useState(false);

  if (!viewer) return null;

  const handleFollow = () => {
    setIsFollowing(!isFollowing);
    onFollow?.(viewer.id);
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            className="fixed inset-0 bg-black/70 z-50"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
          />

          {/* Card */}
          <motion.div
            className="fixed bottom-0 left-0 right-0 z-50 mx-auto max-w-lg"
            initial={{ y: "100%", opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: "100%", opacity: 0 }}
            transition={{ type: "spring", damping: 25, stiffness: 300 }}
          >
            <div className="bg-gradient-to-b from-background/98 to-background rounded-t-3xl border-t border-white/10 overflow-hidden shadow-2xl">
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
              <div className="px-6 pb-4">
                <div className="flex items-center gap-4">
                  {/* Avatar */}
                  <motion.div
                    initial={{ scale: 0.8, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    transition={{ delay: 0.1 }}
                    className="relative"
                  >
                    <AvatarWithFrame
                      userId={viewer.id}
                      src={viewer.avatar}
                      name={viewer.name}
                      level={viewer.level || 1}
                      size="lg"
                      showAnimation={true}
                    />
                    {viewer.isVIP && (
                      <div className="absolute -bottom-1 -right-1 w-7 h-7 bg-gradient-to-br from-amber-400 to-orange-500 rounded-full flex items-center justify-center border-2 border-background">
                        <Crown className="w-4 h-4 text-white" />
                      </div>
                    )}
                  </motion.div>

                  {/* Info */}
                  <motion.div
                    className="flex-1"
                    initial={{ x: 20, opacity: 0 }}
                    animate={{ x: 0, opacity: 1 }}
                    transition={{ delay: 0.15 }}
                  >
                    <div className="flex items-center gap-2 mb-1">
                      <h3 className="text-xl font-bold text-foreground">{viewer.name}</h3>
                      {viewer.countryFlag && (
                        <span className="text-lg">{viewer.countryFlag}</span>
                      )}
                    </div>
                    
                    <div className="flex items-center gap-2 flex-wrap">
                      {viewer.level && (
                        <Badge className="bg-gradient-to-r from-purple-500 to-indigo-500 text-white border-0 text-xs px-2 py-0.5">
                          <Star className="w-3 h-3 mr-1" />
                          Lv.{viewer.level}
                        </Badge>
                      )}
                      {viewer.isVIP && (
                        <Badge className="bg-gradient-to-r from-amber-400 to-orange-500 text-white border-0 text-xs px-2 py-0.5">
                          <Crown className="w-3 h-3 mr-1" />
                          VIP
                        </Badge>
                      )}
                    </div>

                    {viewer.bio && (
                      <p className="text-muted-foreground text-sm mt-2 line-clamp-2">
                        {viewer.bio}
                      </p>
                    )}
                  </motion.div>
                </div>
              </div>

              {/* Stats Row */}
              <motion.div
                className="px-6 py-4 bg-muted/30 border-y border-white/5"
                initial={{ y: 20, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                transition={{ delay: 0.2 }}
              >
                <div className="flex justify-around">
                  <div className="text-center">
                    <div className="flex items-center justify-center gap-1 mb-1">
                      <span className="text-lg">💎</span>
                      <span className="text-xl font-bold text-foreground">
                        {(viewer.diamonds || 0).toLocaleString()}
                      </span>
                    </div>
                    <span className="text-xs text-muted-foreground">Diamonds</span>
                  </div>
                  <div className="w-px bg-white/10" />
                  <div className="text-center">
                    <div className="flex items-center justify-center gap-1 mb-1">
                      <Gift className="w-4 h-4 text-pink-500" />
                      <span className="text-xl font-bold text-foreground">
                        {viewer.totalGiftsSent || 0}
                      </span>
                    </div>
                    <span className="text-xs text-muted-foreground">Gifts</span>
                  </div>
                  <div className="w-px bg-white/10" />
                  <div className="text-center">
                    <div className="flex items-center justify-center gap-1 mb-1">
                      <Star className="w-4 h-4 text-amber-400" />
                      <span className="text-xl font-bold text-foreground">
                        {viewer.level || 1}
                      </span>
                    </div>
                    <span className="text-xs text-muted-foreground">Level</span>
                  </div>
                </div>
              </motion.div>

              {/* Action Buttons */}
              <motion.div
                className="p-6 space-y-3"
                initial={{ y: 20, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                transition={{ delay: 0.25 }}
              >
                {/* Primary Actions Row */}
                <div className="flex gap-3">
                  <Button
                    onClick={handleFollow}
                    className={cn(
                      "flex-1 rounded-xl h-12 font-bold transition-all",
                      isFollowing
                        ? "bg-muted text-foreground hover:bg-muted/80"
                        : "bg-gradient-to-r from-primary to-pink-500 text-white shadow-lg shadow-primary/30 hover:shadow-xl"
                    )}
                  >
                    {isFollowing ? (
                      <>
                        <Heart className="w-5 h-5 mr-2 fill-pink-500 text-pink-500" />
                        Following
                      </>
                    ) : (
                      <>
                        <UserPlus className="w-5 h-5 mr-2" />
                        Follow
                      </>
                    )}
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => onMessage?.(viewer.id)}
                    className="flex-1 rounded-xl h-12 font-bold border-white/20 hover:bg-white/10"
                  >
                    <MessageCircle className="w-5 h-5 mr-2" />
                    Message
                  </Button>
                </div>

                {/* Secondary Actions Row */}
                <div className="flex gap-2">
                  <Button
                    variant="ghost"
                    onClick={() => onGift?.(viewer.id)}
                    className="flex-1 rounded-xl h-11 bg-gradient-to-r from-pink-500/20 to-purple-500/20 hover:from-pink-500/30 hover:to-purple-500/30 text-foreground"
                  >
                    <Gift className="w-4 h-4 mr-2 text-pink-500" />
                    Send Gift
                  </Button>
                  <Button
                    variant="ghost"
                    onClick={() => onCall?.(viewer.id)}
                    className="flex-1 rounded-xl h-11 bg-green-500/20 hover:bg-green-500/30 text-foreground"
                  >
                    <Phone className="w-4 h-4 mr-2 text-green-500" />
                    Call
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => setShowMoreActions(!showMoreActions)}
                    className="rounded-xl h-11 w-11 bg-white/5 hover:bg-white/10"
                  >
                    <MoreHorizontal className="w-5 h-5" />
                  </Button>
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
                        <Button
                          variant="ghost"
                          onClick={() => {
                            onBlock?.(viewer.id);
                            onClose();
                          }}
                          className="flex-1 rounded-xl h-10 bg-red-500/10 hover:bg-red-500/20 text-red-500"
                        >
                          <Ban className="w-4 h-4 mr-2" />
                          Block
                        </Button>
                        <Button
                          variant="ghost"
                          onClick={() => {
                            onReport?.(viewer.id);
                            onClose();
                          }}
                          className="flex-1 rounded-xl h-10 bg-orange-500/10 hover:bg-orange-500/20 text-orange-500"
                        >
                          <Flag className="w-4 h-4 mr-2" />
                          Report
                        </Button>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </motion.div>

              {/* Safe Area */}
              <div className="h-6 safe-area-bottom" />
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
};
