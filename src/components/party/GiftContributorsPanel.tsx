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
import { getRequiredDisplayLevel } from "@/utils/stableLevel";

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
            diamond_amount,
            profiles:sender_id (
              id,
              display_name,
              avatar_url,
              user_level,
              host_level,
              max_user_level,
              gender,
              is_host,
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
          const hostBeans = Math.floor((tx.diamond_amount || 0) * hostCommissionPercent / 100);
          
          const existing = contributorMap.get(senderId);
          if (existing) {
            existing.totalBeans += hostBeans;
            existing.giftCount += 1;
          } else {
            contributorMap.set(senderId, {
              userId: senderId,
              displayName: profile.display_name || 'User',
              avatarUrl: profile.avatar_url,
              level: getRequiredDisplayLevel(profile),
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

    // Pkg183 LiveKit-Purist: pure optimistic in-memory delta on Pkg76
    // `livekit-gift-sent` DataPacket — NO refetch. Sender packs all metadata
    // (senderId/name/avatar/level/totalDiamonds) so we apply commission and
    // increment locally → 0ms leaderboard update for all viewers.
    const onLiveKitGift = (e: Event) => {
      const d = (e as CustomEvent<any>).detail;
      if (!d || d.scope !== 'party' || d.id !== roomId) return;
      const senderId = d.senderId;
      const diamonds = Number(d.totalDiamonds ?? ((d.giftDiamonds ?? 0) * (d.count ?? 1))) || 0;
      if (!senderId || diamonds <= 0) return;
      const hostBeans = Math.floor(diamonds * hostCommissionPercent / 100);
      setContributors((prev) => {
        const map = new Map(prev.map((c) => [c.userId, { ...c }]));
        const existing = map.get(senderId);
        if (existing) {
          existing.totalBeans += hostBeans;
          existing.giftCount += 1;
        } else {
          map.set(senderId, {
            userId: senderId,
            displayName: d.senderName || 'User',
            avatarUrl: d.senderAvatar,
            level: d.senderLevel || 1,
            totalBeans: hostBeans,
            giftCount: 1,
            frameId: undefined,
          });
        }
        return Array.from(map.values()).sort((a, b) => b.totalBeans - a.totalBeans);
      });
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
            transition={{ duration: 0.22, ease: [0.32, 0.72, 0, 1] }}
            className="fixed inset-0 z-[100] bg-black/65 backdrop-blur-md"
            onClick={onClose}
          />

          {/* Panel — Pkg164-parity dark glass sheet */}
          <motion.div
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={{ type: "spring", damping: 28, stiffness: 320 }}
            className="fixed bottom-0 left-0 right-0 z-[101] max-h-[78dvh] rounded-t-[28px] overflow-hidden border-t border-white/10 shadow-[0_-20px_60px_-10px_rgba(0,0,0,0.6)]"
            style={{
              background: 'linear-gradient(180deg, rgba(20,15,35,0.97) 0%, rgba(12,8,24,0.98) 100%)',
              backdropFilter: 'blur(24px)',
              WebkitBackdropFilter: 'blur(24px)',
            }}
          >
            {/* Aurora overlay */}
            <div
              className="pointer-events-none absolute inset-0 opacity-[0.35]"
              style={{
                background:
                  'radial-gradient(60% 40% at 15% 0%, rgba(168,85,247,0.22), transparent 70%), radial-gradient(50% 35% at 90% 10%, rgba(244,114,182,0.18), transparent 70%)',
              }}
            />

            {/* Header */}
            <div className="relative px-4 pt-3 pb-3 border-b border-white/10">
              <div className="mx-auto mb-2 h-1 w-10 rounded-full bg-white/25" />

              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <div
                    className="relative w-11 h-11 rounded-2xl flex items-center justify-center overflow-hidden"
                    style={{
                      background: 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)',
                      boxShadow: '0 6px 18px -4px rgba(245,158,11,0.55), inset 0 1px 0 rgba(255,255,255,0.35)',
                    }}
                  >
                    <Gift className="w-5 h-5 text-white relative z-10" />
                    <div
                      className="absolute inset-0 pointer-events-none"
                      style={{
                        background: 'linear-gradient(115deg, transparent 40%, rgba(255,255,255,0.45) 50%, transparent 60%)',
                        animation: 'giftSendShine 3.2s ease-in-out infinite',
                      }}
                    />
                  </div>
                  <div>
                    <h3
                      className="font-bold text-lg leading-tight"
                      style={{
                        background: 'linear-gradient(90deg, #ffffff, #fde68a 60%, #fbbf24)',
                        WebkitBackgroundClip: 'text',
                        WebkitTextFillColor: 'transparent',
                        backgroundClip: 'text',
                      }}
                    >
                      Top Contributors
                    </h3>
                    <p className="text-white/55 text-[11px]">Live ranking · this room</p>
                  </div>
                </div>

                <Button
                  variant="ghost"
                  size="icon"
                  onClick={onClose}
                  className="w-8 h-8 rounded-full bg-white/10 text-white hover:bg-white/20 border border-white/10"
                >
                  <X className="w-4 h-4" />
                </Button>
              </div>

              {/* Total Beans Summary */}
              <div
                className="mt-3 p-3 rounded-2xl border border-amber-400/25 relative overflow-hidden"
                style={{
                  background: 'linear-gradient(135deg, rgba(245,158,11,0.22) 0%, rgba(217,119,6,0.14) 100%)',
                  boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.08)',
                }}
              >
                <div className="flex items-center justify-between relative z-10">
                  <div className="flex items-center gap-1.5">
                    <TrendingUp className="w-3.5 h-3.5 text-amber-300" />
                    <span className="text-white/85 text-sm">Total Room Earnings</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <BeansIcon size={16} className="text-amber-300" />
                    <span className="text-amber-200 font-bold text-lg tabular-nums">{formatBeans(totalBeans)}</span>
                  </div>
                </div>
                <div
                  className="absolute inset-0 pointer-events-none"
                  style={{
                    background: 'linear-gradient(115deg, transparent 42%, rgba(255,255,255,0.18) 50%, transparent 58%)',
                    animation: 'giftSendShine 4s ease-in-out infinite',
                  }}
                />
              </div>
            </div>

            {/* Contributors List */}
            <ScrollArea className="max-h-[55dvh]">
              <div className="p-4 space-y-2 relative" style={{ WebkitOverflowScrolling: 'touch' }}>
                {loading ? (
                  <div className="flex items-center justify-center py-12">
                    <div className="w-8 h-8 border-2 border-amber-400/70 border-t-transparent rounded-full animate-spin" />
                  </div>
                ) : contributors.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-12 text-center">
                    <div className="w-16 h-16 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center mb-3">
                      <Gift className="w-8 h-8 text-white/30" />
                    </div>
                    <p className="text-white/70 text-sm font-medium">No gifts yet</p>
                    <p className="text-white/40 text-xs mt-1">Be the first to send a gift!</p>
                  </div>
                ) : (
                  contributors.map((contributor, index) => {
                    const rankBadge = getRankBadge(index);
                    const isTop = index < 3;
                    const isFirst = index === 0;

                    return (
                      <motion.button
                        key={contributor.userId}
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{
                          type: 'spring',
                          damping: 24,
                          stiffness: 360,
                          delay: Math.min(index * 0.04, 0.18),
                        }}
                        whileTap={{ scale: 0.985 }}
                        onClick={() => {
                          onClose();
                          navigate(`/profile/${contributor.userId}`);
                        }}
                        className="w-full flex items-center gap-3 p-3 rounded-2xl relative overflow-hidden transition-colors text-left"
                        style={{
                          background: isFirst
                            ? 'linear-gradient(135deg, rgba(251,191,36,0.18) 0%, rgba(168,85,247,0.10) 100%)'
                            : 'linear-gradient(135deg, rgba(255,255,255,0.05) 0%, rgba(255,255,255,0.02) 100%)',
                          border: isFirst
                            ? '1px solid rgba(251,191,36,0.35)'
                            : '1px solid rgba(255,255,255,0.06)',
                          boxShadow: isFirst
                            ? '0 6px 22px -8px rgba(251,191,36,0.35), inset 0 1px 0 rgba(255,255,255,0.06)'
                            : 'inset 0 1px 0 rgba(255,255,255,0.04)',
                        }}
                      >
                        {isFirst && (
                          <div
                            className="absolute inset-0 pointer-events-none"
                            style={{
                              background: 'linear-gradient(115deg, transparent 42%, rgba(255,255,255,0.14) 50%, transparent 58%)',
                              animation: 'giftSendShine 3.6s ease-in-out infinite',
                            }}
                          />
                        )}

                        {/* Rank */}
                        <div className="w-9 flex-shrink-0 flex items-center justify-center relative z-10">
                          {rankBadge ? (
                            <div
                              className={`w-8 h-8 rounded-full bg-gradient-to-br ${rankBadge.color} flex items-center justify-center`}
                              style={{
                                boxShadow: isFirst
                                  ? '0 4px 14px -2px rgba(251,191,36,0.55), inset 0 1px 0 rgba(255,255,255,0.4)'
                                  : '0 3px 10px -2px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.3)',
                              }}
                            >
                              <rankBadge.icon className="w-4 h-4 text-white" fill="white" />
                            </div>
                          ) : (
                            <span className="text-white/55 text-sm font-semibold tabular-nums">#{index + 1}</span>
                          )}
                        </div>

                        {/* Avatar */}
                        <div className="relative z-10">
                          <AvatarWithFrame
                            userId={contributor.userId}
                            src={contributor.avatarUrl}
                            name={contributor.displayName}
                            level={contributor.level}
                            size="sm"
                            showFrame={true}
                            frameId={contributor.frameId}
                          />
                        </div>

                        {/* Name & Level */}
                        <div className="flex-1 min-w-0 relative z-10">
                          <div className="flex items-center gap-1.5">
                            <span className="text-white font-semibold text-sm truncate">
                              {contributor.displayName}
                            </span>
                            <LevelBadge level={contributor.level} size="xs" />
                          </div>
                          <p className="text-white/50 text-[11px] mt-0.5">
                            {contributor.giftCount} gift{contributor.giftCount > 1 ? 's' : ''} sent
                          </p>
                        </div>

                        {/* Beans pill */}
                        <div
                          className="flex items-center gap-1 px-2.5 py-1.5 rounded-xl relative z-10"
                          style={{
                            background: isTop
                              ? 'linear-gradient(135deg, rgba(251,191,36,0.28) 0%, rgba(245,158,11,0.18) 100%)'
                              : 'linear-gradient(135deg, rgba(251,191,36,0.18) 0%, rgba(245,158,11,0.10) 100%)',
                            border: '1px solid rgba(251,191,36,0.30)',
                            boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.08)',
                          }}
                        >
                          <BeansIcon size={12} className="text-amber-300" />
                          <span className="text-amber-200 font-bold text-sm tabular-nums">
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
