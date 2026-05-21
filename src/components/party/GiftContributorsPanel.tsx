import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, Gift, TrendingUp, Crown, Star } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { supabase } from "@/integrations/supabase/client";
import AvatarWithFrame from "@/components/common/AvatarWithFrame";
import BeansIcon from "@/components/common/BeansIcon";
import { LevelBadge } from "@/components/common/LevelBadge";
import { useNavigate } from "react-router-dom";

interface GiftContributor {
  userId: string;
  displayName: string;
  avatarUrl?: string;
  level: number;
  totalBeans: number;
  giftCount: number;
  frameId?: string;
}

interface GiftContributorsPanelProps {
  isOpen: boolean;
  onClose: () => void;
  roomId: string;
  totalBeans: number;
}

export function GiftContributorsPanel({
  isOpen,
  onClose,
  roomId,
  totalBeans
}: GiftContributorsPanelProps) {
  const navigate = useNavigate();
  const [contributors, setContributors] = useState<GiftContributor[]>([]);
  const [loading, setLoading] = useState(true);
  const [hostCommissionPercent, setHostCommissionPercent] = useState<number>(55);

  // ✅ REAL-TIME: Fetch and subscribe to host commission rate
  useEffect(() => {
    const fetchCommissionRate = async () => {
      const { data } = await supabase
        .from('app_settings')
        .select('setting_value')
        .eq('setting_key', 'gift_commission')
        .maybeSingle();
      
      if (data?.setting_value) {
        const settings = data.setting_value as any;
        if (settings.host_percent !== undefined) {
          setHostCommissionPercent(settings.host_percent);
        } else if (settings.company_percent !== undefined) {
          setHostCommissionPercent(100 - settings.company_percent);
        }
      }
    };
    fetchCommissionRate();
    
    // Pkg83: admin commission rate sync via Pkg37 admin-table-update window
    // event (replaces static-named `gift-contributors-commission-realtime`
    // Supabase channel which violated Pkg62 G3 + LiveKit-Purist Policy).
    const onAdminUpdate = (e: Event) => {
      const detail = (e as CustomEvent<{ table?: string }>).detail;
      if (detail?.table === 'app_settings') fetchCommissionRate();
    };
    window.addEventListener('admin-table-update', onAdminUpdate as EventListener);
    return () => {
      window.removeEventListener('admin-table-update', onAdminUpdate as EventListener);
    };
  }, []);

  // Fetch gift contributors for this room
  useEffect(() => {
    if (!isOpen || !roomId) return;

    const fetchContributors = async () => {
      setLoading(true);
      try {
        // Get all gift transactions for this party room
        const { data, error } = await supabase
          .from('gift_transactions')
          .select(`
            sender_id,
            coin_amount,
            profiles:sender_id (
              id,
              display_name,
              avatar_url,
              user_level,
              frame_id
            )
          `)
          .eq('party_room_id', roomId)
          .order('created_at', { ascending: false });

        if (error) {
          console.error('[GiftContributors] Error fetching:', error);
          setLoading(false);
          return;
        }

        // Aggregate by sender - apply commission rate to show host's actual beans
        const contributorMap = new Map<string, GiftContributor>();
        
        data?.forEach((tx: any) => {
          const senderId = tx.sender_id;
          const profile = tx.profiles;
          
          if (!senderId || !profile) return;
          
          // Calculate host beans (commission applied)
          const hostBeans = Math.floor((tx.coin_amount || 0) * hostCommissionPercent / 100);
          
          const existing = contributorMap.get(senderId);
          if (existing) {
            existing.totalBeans += hostBeans;
            existing.giftCount += 1;
          } else {
            contributorMap.set(senderId, {
              userId: senderId,
              displayName: profile.display_name || 'User',
              avatarUrl: profile.avatar_url,
              level: profile.user_level || 1,
              totalBeans: hostBeans,
              giftCount: 1,
              frameId: profile.frame_id
            });
          }
        });

        // Sort by total beans (descending)
        const sorted = Array.from(contributorMap.values())
          .sort((a, b) => b.totalBeans - a.totalBeans);

        setContributors(sorted);
      } catch (err) {
        console.error('[GiftContributors] Exception:', err);
      }
      setLoading(false);
    };

    fetchContributors();

    // Pkg83 LiveKit-Purist: refetch on Pkg76 `livekit-gift-sent` window event
    // (party scope, this roomId only). REPLACES `gift-contributors-${roomId}`
    // postgres_changes channel — LiveKit DataPacket is sole instant signal.
    const onLiveKitGift = (e: Event) => {
      const detail = (e as CustomEvent<{ scope?: string; id?: string }>).detail;
      if (!detail || detail.scope !== 'party' || detail.id !== roomId) return;
      fetchContributors();
    };
    window.addEventListener('livekit-gift-sent', onLiveKitGift as EventListener);
    return () => {
      window.removeEventListener('livekit-gift-sent', onLiveKitGift as EventListener);
    };
  }, [isOpen, roomId, hostCommissionPercent]);

  const formatBeans = (num: number) => {
    if (num >= 1000000) return `${(num / 1000000).toFixed(1)}M`;
    if (num >= 1000) return `${(num / 1000).toFixed(1)}K`;
    return num.toLocaleString();
  };

  // Get rank badge based on position
  const getRankBadge = (index: number) => {
    if (index === 0) return { icon: Crown, color: 'from-yellow-400 to-amber-500', text: '#1' };
    if (index === 1) return { icon: Star, color: 'from-gray-300 to-gray-400', text: '#2' };
    if (index === 2) return { icon: Star, color: 'from-amber-600 to-orange-700', text: '#3' };
    return null;
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] bg-black/60 backdrop-blur-sm"
            onClick={onClose}
          />
          
          {/* Panel - Bottom Sheet Style */}
          <motion.div
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={{ type: "spring", damping: 25, stiffness: 300 }}
            className="fixed bottom-0 left-0 right-0 z-[101] max-h-[70vh] rounded-t-3xl overflow-hidden"
            style={{
              background: 'linear-gradient(180deg, rgba(30,20,60,0.98) 0%, rgba(10,5,30,0.99) 100%)'
            }}
          >
            {/* Header */}
            <div className="relative px-4 pt-4 pb-3 border-b border-white/10">
              {/* Drag Handle */}
              <div className="absolute top-2 left-1/2 -translate-x-1/2 w-10 h-1 rounded-full bg-white/30" />
              
              <div className="flex items-center justify-between mt-2">
                <div className="flex items-center gap-2">
                  <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-yellow-500 to-amber-600 flex items-center justify-center">
                    <Gift className="w-5 h-5 text-white" />
                  </div>
                  <div>
                    <h3 className="text-white font-bold text-lg">Gift Contributors</h3>
                    <p className="text-white/60 text-xs">Top supporters in this room</p>
                  </div>
                </div>
                
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={onClose}
                  className="w-8 h-8 rounded-full bg-white/10 text-white hover:bg-white/20"
                >
                  <X className="w-4 h-4" />
                </Button>
              </div>
              
              {/* Total Beans Summary */}
              <div className="mt-3 p-3 rounded-xl bg-gradient-to-r from-yellow-500/20 to-amber-500/20 border border-yellow-500/30">
                <div className="flex items-center justify-between">
                  <span className="text-white/80 text-sm">Total Room Earnings</span>
                  <div className="flex items-center gap-1.5">
                    <BeansIcon size={16} className="text-yellow-400" />
                    <span className="text-yellow-400 font-bold text-lg">{formatBeans(totalBeans)}</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Contributors List */}
            <ScrollArea className="max-h-[50vh]">
              <div className="p-4 space-y-2">
                {loading ? (
                  <div className="flex items-center justify-center py-10">
                    <div className="w-8 h-8 border-2 border-purple-500 border-t-transparent rounded-full animate-spin" />
                  </div>
                ) : contributors.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-10 text-center">
                    <div className="w-16 h-16 rounded-full bg-white/5 flex items-center justify-center mb-3">
                      <Gift className="w-8 h-8 text-white/30" />
                    </div>
                    <p className="text-white/60 text-sm">No gifts yet</p>
                    <p className="text-white/40 text-xs mt-1">Be the first to send a gift!</p>
                  </div>
                ) : (
                  contributors.map((contributor, index) => {
                    const rankBadge = getRankBadge(index);
                    
                    return (
                      <motion.button
                        key={contributor.userId}
                        initial={{ opacity: 0, x: -20 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: index * 0.05 }}
                        onClick={() => {
                          onClose();
                          navigate(`/profile/${contributor.userId}`);
                        }}
                        className="w-full flex items-center gap-3 p-3 rounded-xl bg-white/5 hover:bg-white/10 transition-colors border border-white/5"
                      >
                        {/* Rank */}
                        <div className="w-8 flex-shrink-0 text-center">
                          {rankBadge ? (
                            <div className={`w-7 h-7 rounded-full bg-gradient-to-br ${rankBadge.color} flex items-center justify-center`}>
                              <rankBadge.icon className="w-4 h-4 text-white" fill="white" />
                            </div>
                          ) : (
                            <span className="text-white/50 text-sm font-medium">#{index + 1}</span>
                          )}
                        </div>
                        
                        {/* Avatar */}
                        <AvatarWithFrame
                          userId={contributor.userId}
                          src={contributor.avatarUrl}
                          name={contributor.displayName}
                          level={contributor.level}
                          size="sm"
                          showFrame={true}
                          frameId={contributor.frameId}
                        />
                        
                        {/* Name & Level */}
                        <div className="flex-1 min-w-0 text-left">
                          <div className="flex items-center gap-1.5">
                            <span className="text-white font-medium text-sm truncate">
                              {contributor.displayName}
                            </span>
                            <LevelBadge level={contributor.level} size="xs" />
                          </div>
                          <p className="text-white/50 text-xs">
                            {contributor.giftCount} gift{contributor.giftCount > 1 ? 's' : ''} sent
                          </p>
                        </div>
                        
                        {/* Beans */}
                        <div className="flex items-center gap-1 px-2 py-1 rounded-lg bg-yellow-500/20">
                          <BeansIcon size={12} className="text-yellow-400" />
                          <span className="text-yellow-400 font-bold text-sm">
                            {formatBeans(contributor.totalBeans)}
                          </span>
                        </div>
                      </motion.button>
                    );
                  })
                )}
              </div>
            </ScrollArea>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}

export default GiftContributorsPanel;
