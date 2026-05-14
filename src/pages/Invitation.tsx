import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, Share2, Trophy, Medal, Crown, Sparkles, Star, TrendingUp, Users, Flame, Gift, Copy, CheckCircle } from "lucide-react";
import { LoadingSpinner } from "@/components/common/LoadingSpinner";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { motion } from "framer-motion";
import defaultBanner from "@/assets/invitation-banner.jpg";
import { recordClientError } from "@/utils/clientErrorLog";

interface LeaderboardEntry {
  rank: number;
  user_id: string;
  display_name: string;
  avatar_url: string | null;
  total_invites: number;
  beans_earned: number;
}

interface InvitationTier {
  id: string;
  tier_name: string;
  min_invites: number;
  max_invites: number | null;
  reward_beans: number | null;
  reward_coins: number | null;
  bonus_percentage: number | null;
  badge_color: string;
  is_active: boolean;
}

const TIER_ICONS: Record<string, string> = {
  'Bronze': '🥉',
  'Silver': '🥈',
  'Gold': '🥇',
  'Platinum': '💎',
  'Diamond': '👑',
  'Legend': '🔥',
};

interface InvitedUser {
  id: string;
  display_name: string;
  avatar_url: string | null;
  created_at: string;
}

const Invitation = () => {
  const navigate = useNavigate();
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [invitationTiers, setInvitationTiers] = useState<InvitationTier[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [myRank, setMyRank] = useState<LeaderboardEntry | null>(null);
  const [shareLink, setShareLink] = useState("");
  const [myInviteCount, setMyInviteCount] = useState(0);
  const [copied, setCopied] = useState(false);
  const [bannerUrl, setBannerUrl] = useState<string>(defaultBanner);
  const [myInvitedUsers, setMyInvitedUsers] = useState<InvitedUser[]>([]);
  const [claimedTierIds, setClaimedTierIds] = useState<Set<string>>(new Set());
  const [claimingTierId, setClaimingTierId] = useState<string | null>(null);

  useEffect(() => {
    fetchData();
    fetchTiers();
    fetchBanner();
    fetchClaimedTiers();
    
    const inviteChannel = supabase
      .channel('invitation-realtime-sync')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'user_invitations' }, () => {
        fetchData();
      })
      .subscribe();

    const tiersChannel = supabase
      .channel('invitation-tiers-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'invitation_reward_tiers' }, () => {
        fetchTiers();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(inviteChannel);
      supabase.removeChannel(tiersChannel);
    };
  }, []);

  const fetchClaimedTiers = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data } = await supabase
        .from('invitation_reward_claims')
        .select('invitation_id')
        .eq('claimed_by', user.id);
      if (data) {
        setClaimedTierIds(new Set(data.map(c => c.invitation_id)));
      }
    } catch (error) {
      console.error('Error fetching claims:', error);
      recordClientError({ label: "Invitation.fetchClaimedTiers", message: error instanceof Error ? error.message : String(error) });
    }
  };

  const claimTierReward = async (tier: InvitationTier) => {
    try {
      setClaimingTierId(tier.id);
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        toast.error('Please login first');
        return;
      }

      // Check eligibility
      if (myInviteCount < tier.min_invites) {
        toast.error(`Need at least ${tier.min_invites} invites to claim this tier`);
        return;
      }

      // Server-driven secure claim — only tier_id is sent, all amounts/eligibility verified server-side
      const { data, error } = await supabase.rpc('claim_invitation_reward', {
        _tier_id: tier.id,
      } as any);

      if (error) throw error;

      const result = data as any;
      if (!result?.success) {
        toast.error(result?.error || 'Failed to claim reward');
        return;
      }

      const coinsAwarded = Number(result?.coins ?? 0);
      const beansAwarded = Number(result?.beans ?? 0);
      const parts: string[] = [];
      if (coinsAwarded > 0) parts.push(`+${coinsAwarded.toLocaleString()} 🪙 Coins`);
      if (beansAwarded > 0) parts.push(`+${beansAwarded.toLocaleString()} 🌱 Beans`);

      toast.success(`🎉 ${tier.tier_name} Reward Claimed! ${parts.join(' & ')}`);
      setClaimedTierIds(prev => new Set([...prev, tier.id]));
    } catch (error: any) {
      console.error('Error claiming reward:', error);
      recordClientError({ label: "Invitation.parts", message: error instanceof Error ? error.message : String(error) });
      toast.error('Failed to claim reward');
    } finally {
      setClaimingTierId(null);
    }
  };

  const fetchBanner = async () => {
    try {
      const { data } = await supabase
        .from('app_settings')
        .select('setting_value')
        .eq('setting_key', 'invitation_banner_url')
        .maybeSingle();
      if (data?.setting_value) {
        const url = typeof data.setting_value === 'string' ? data.setting_value : (data.setting_value as any)?.url || '';
        if (url) setBannerUrl(url);
      }
    } catch (error) {
      console.error('Error fetching banner:', error);
      recordClientError({ label: "Invitation.url", message: error instanceof Error ? error.message : String(error) });
    }
  };

  const fetchTiers = async () => {
    try {
      const { data, error } = await supabase
        .from('invitation_reward_tiers')
        .select('*')
        .eq('is_active', true)
        .order('display_order');
      if (error) throw error;
      setInvitationTiers(data || []);
    } catch (error) {
      console.error('Error fetching tiers:', error);
      recordClientError({ label: "Invitation.fetchTiers", message: error instanceof Error ? error.message : String(error) });
    }
  };

  const fetchData = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      setCurrentUser(user);

      if (user) {
        const { data: profile } = await supabase
          .from('profiles')
          .select('app_uid')
          .eq('id', user.id)
          .maybeSingle();

        if (profile?.app_uid) {
          const { generateInvitationLink } = await import('@/utils/shareLinks');
          setShareLink(generateInvitationLink(profile.app_uid));
        }
      }

      const { data: inviteData, error } = await supabase
        .from('user_invitations')
        .select('inviter_id')
        .eq('status', 'verified');

      if (!error && inviteData) {
        const inviterStats: Record<string, { count: number; beans: number }> = {};
        inviteData.forEach((inv) => {
          if (!inviterStats[inv.inviter_id]) {
            inviterStats[inv.inviter_id] = { count: 0, beans: 0 };
          }
          inviterStats[inv.inviter_id].count += 1;
        });

        const inviterIds = Object.keys(inviterStats);
        if (inviterIds.length > 0) {
          const { data: profiles } = await supabase
            .from('profiles_public')
            .select('id, display_name, avatar_url')
            .in('id', inviterIds);

          if (profiles) {
            const leaderboardData: LeaderboardEntry[] = profiles
              .map((p) => ({
                rank: 0,
                user_id: p.id,
                display_name: p.display_name || 'User',
                avatar_url: p.avatar_url,
                total_invites: inviterStats[p.id]?.count || 0,
                beans_earned: inviterStats[p.id]?.beans || 0,
              }))
              .sort((a, b) => b.total_invites - a.total_invites)
              .slice(0, 100)
              .map((entry, index) => ({ ...entry, rank: index + 1 }));

            setLeaderboard(leaderboardData);

            if (user) {
              const userEntry = leaderboardData.find((e) => e.user_id === user.id);
              setMyRank(userEntry || null);
              setMyInviteCount(userEntry?.total_invites || 0);
            }
          }
        } else if (user) {
          setMyInviteCount(0);
        }
      }

      // Fetch my invited users list
      if (user) {
        const { data: myInvites } = await supabase
          .from('user_invitations')
          .select('invitee_id, created_at')
          .eq('inviter_id', user.id)
          .eq('status', 'verified')
          .order('created_at', { ascending: false });

        if (myInvites && myInvites.length > 0) {
          const invitedIds = myInvites.map(i => i.invitee_id).filter(Boolean);
          const { data: invitedProfiles } = await supabase
            .from('profiles_public')
            .select('id, display_name, avatar_url')
            .in('id', invitedIds);

          if (invitedProfiles) {
            const profileMap = new Map(invitedProfiles.map(p => [p.id, p]));
            const invitedList: InvitedUser[] = myInvites
              .map(inv => {
                const profile = profileMap.get(inv.invitee_id!);
                return profile ? {
                  id: profile.id,
                  display_name: profile.display_name || 'User',
                  avatar_url: profile.avatar_url,
                  created_at: inv.created_at,
                } : null;
              })
              .filter(Boolean) as InvitedUser[];
            setMyInvitedUsers(invitedList);
            // Update invite count from actual data
            setMyInviteCount(invitedList.length);
          }
        }
      }
    } catch (error) {
      console.error('Error fetching data:', error);
      recordClientError({ label: "Invitation.profile", message: error instanceof Error ? error.message : String(error) });
    } finally {
      setLoading(false);
    }
  };

  const handleShare = async () => {
    if (navigator.share) {
      try {
        await navigator.share({
          title: '🎁 Join MeriLive & Get Rewards!',
          text: `🌟 Download MeriLive and sign up using my exclusive link to get amazing rewards! Don't download from Play Store directly - use THIS link so we both earn rewards! 👇`,
          url: shareLink
        });
      } catch (err) {
        copyLink();
      }
    } else {
      copyLink();
    }
  };

  const copyLink = () => {
    navigator.clipboard.writeText(shareLink);
    setCopied(true);
    toast.success("Link copied!");
    setTimeout(() => setCopied(false), 2000);
  };

  const getRankIcon = (rank: number) => {
    if (rank === 1) return <Crown className="w-5 h-5 text-yellow-400" />;
    if (rank === 2) return <Medal className="w-5 h-5 text-slate-700" />;
    if (rank === 3) return <Medal className="w-5 h-5 text-amber-600" />;
    return null;
  };

  if (loading) {
    return <LoadingSpinner fullScreen />;
  }

  return (
    <div className="fixed inset-0 flex flex-col bg-gradient-to-b from-[#FFFBF2] via-[#FAF5EA] to-[#F5EFDF] overflow-hidden">
      {/* Header */}
      <header className="flex-shrink-0 z-40 border-b border-amber-200/60 bg-white/85 backdrop-blur-xl shadow-sm">
        <div className="flex items-center gap-3 px-4 py-3 safe-area-top">
          <Button variant="ghost" size="icon" onClick={() => navigate(-1)} className="text-slate-700 hover:text-slate-900 hover:bg-amber-50 w-9 h-9 rounded-full">
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-amber-400 to-orange-500 flex items-center justify-center shadow-lg shadow-amber-500/30">
              <Trophy className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="text-slate-900 font-bold text-base leading-tight">Share Leaderboard</h1>
              <p className="text-slate-500 text-[10px]">Share to climb the ranks!</p>
            </div>
          </div>
        </div>
      </header>

      <div className="flex-1 overflow-y-auto overscroll-contain" style={{ WebkitOverflowScrolling: 'touch', paddingBottom: 'var(--content-bottom-padding)' }}>
      <div className="p-4 space-y-5">
        {/* Ultra-Premium Luxury Banner */}
        <motion.div
          initial={{ y: -20, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          className="relative rounded-2xl overflow-hidden shadow-2xl shadow-purple-500/30"
        >
          <img src={bannerUrl} alt="Invite Friends & Earn Rewards" className="w-full h-auto min-h-[120px] object-cover" />
          {/* Premium overlay effects */}
          <div className="absolute inset-0 bg-gradient-to-t from-amber-100/20 via-transparent to-transparent" />
          <div className="absolute inset-0 bg-gradient-to-r from-amber-500/10 via-transparent to-purple-500/10" />
          <div className="absolute inset-0 border border-amber-400/20 rounded-2xl" />
          {/* Animated shimmer */}
          <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/8 to-transparent animate-shimmer" />
          {/* Golden corner accents */}
          <div className="absolute top-0 left-0 w-8 h-8 border-t-2 border-l-2 border-amber-400/50 rounded-tl-2xl" />
          <div className="absolute top-0 right-0 w-8 h-8 border-t-2 border-r-2 border-amber-400/50 rounded-tr-2xl" />
          <div className="absolute bottom-0 left-0 w-8 h-8 border-b-2 border-l-2 border-amber-400/50 rounded-bl-2xl" />
          <div className="absolute bottom-0 right-0 w-8 h-8 border-b-2 border-r-2 border-amber-400/50 rounded-br-2xl" />
        </motion.div>

        {/* Share Card */}
        <motion.div
          initial={{ y: 20, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ delay: 0.1 }}
          className="relative overflow-hidden rounded-2xl bg-white border border-amber-200/70 shadow-lg shadow-amber-900/5"
        >
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_0%,rgba(168,85,247,0.08),transparent_70%)]" />
          <div className="relative p-5">
            <div className="flex items-center justify-center gap-2 mb-3">
              <Sparkles className="w-5 h-5 text-amber-500 animate-pulse" />
              <span className="text-slate-900 font-bold text-lg tracking-wide">Share & Win!</span>
              <Sparkles className="w-5 h-5 text-amber-500 animate-pulse" />
            </div>
            <p className="text-slate-600 text-sm text-center mb-4">
              Share your link. More signups, higher rank!
            </p>
            <div className="flex gap-2">
              <Button
                onClick={handleShare}
                className="flex-1 bg-gradient-to-r from-fuchsia-600 to-violet-600 hover:from-fuchsia-500 hover:to-violet-500 text-white font-bold py-5 rounded-xl shadow-lg shadow-purple-500/25"
              >
                <Share2 className="w-4 h-4 mr-2" />
                Share Link
              </Button>
              <Button
                onClick={copyLink}
                variant="outline"
                className="border-amber-200/70 bg-amber-50/50 text-slate-800 hover:bg-amber-100 py-5 rounded-xl px-4"
              >
                {copied ? <CheckCircle className="w-4 h-4 text-emerald-600" /> : <Copy className="w-4 h-4" />}
              </Button>
            </div>
          </div>
        </motion.div>

        {/* Reward Tiers */}
        {invitationTiers.length > 0 && (
          <motion.div
            initial={{ y: 20, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ delay: 0.15 }}
            className="rounded-2xl overflow-hidden bg-white border border-amber-200/70 shadow-lg shadow-amber-900/5"
          >
            <div className="flex items-center gap-2 px-5 pt-5 pb-3 border-b border-amber-100">
              <Gift className="w-5 h-5 text-amber-500" />
              <h3 className="text-slate-900 font-bold text-base">Reward Tiers</h3>
            </div>
            
            <div className="px-4 pb-4 space-y-2.5">
              {invitationTiers.map((tier, index) => {
                const isAchieved = myInviteCount >= tier.min_invites;
                const isCurrent = myInviteCount >= tier.min_invites && 
                  (tier.max_invites === null || myInviteCount <= tier.max_invites);
                const tierIcon = TIER_ICONS[tier.tier_name] || '🏆';
                
                return (
                  <motion.div
                    key={tier.id}
                    initial={{ x: -20, opacity: 0 }}
                    animate={{ x: 0, opacity: 1 }}
                    transition={{ delay: 0.05 * index }}
                    className="relative rounded-xl overflow-hidden"
                    style={{
                      background: isCurrent
                        ? 'linear-gradient(135deg, rgba(168,85,247,0.12), rgba(236,72,153,0.10))'
                        : isAchieved
                          ? 'linear-gradient(135deg, rgba(34,197,94,0.10), rgba(16,185,129,0.06))'
                          : 'linear-gradient(135deg, #ffffff, rgba(255,251,240,0.95))',
                      border: isCurrent
                        ? '1px solid rgba(168,85,247,0.45)'
                        : isAchieved
                          ? '1px solid rgba(34,197,94,0.35)'
                          : '1px solid rgba(218,180,90,0.35)',
                    }}
                  >
                    {/* Shimmer for current tier */}
                    {isCurrent && (
                      <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/5 to-transparent animate-shimmer" />
                    )}
                    
                    <div className="relative flex items-center gap-3 p-3.5">
                      {/* Tier Badge */}
                      <div 
                        className="w-12 h-12 rounded-xl flex items-center justify-center shadow-lg shrink-0 text-2xl"
                        style={{ 
                          backgroundColor: tier.badge_color,
                          boxShadow: `0 4px 15px ${tier.badge_color}40`
                        }}
                      >
                        {tierIcon}
                      </div>
                      
                      {/* Tier Info */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="text-slate-800 font-bold text-sm">{tier.tier_name}</p>
                          {isCurrent && (
                            <span className="px-2 py-0.5 bg-gradient-to-r from-fuchsia-600 to-violet-600 text-white text-[9px] font-bold rounded-full uppercase tracking-wider">
                              Current
                            </span>
                          )}
                          {isAchieved && !isCurrent && (
                            <span className="px-2 py-0.5 bg-green-500/80 text-slate-800 text-[9px] font-bold rounded-full">
                              ✓ Done
                            </span>
                          )}
                        </div>
                        <p className="text-slate-600 text-xs mt-0.5">
                          {tier.min_invites}{tier.max_invites ? `-${tier.max_invites}` : '+'} Invites
                        </p>
                      </div>
                      
                      {/* Rewards & Claim */}
                      <div className="flex flex-col gap-1 shrink-0 items-end">
                        {claimedTierIds.has(tier.id) ? (
                          <span className="text-[10px] font-bold bg-green-100 text-green-700 border border-green-300 px-3 py-1.5 rounded-lg text-center">
                            ✓ Claimed
                          </span>
                        ) : isAchieved ? (
                          <Button
                            size="sm"
                            onClick={() => claimTierReward(tier)}
                            disabled={claimingTierId === tier.id}
                            className="h-7 px-3 text-[10px] font-bold bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-400 hover:to-orange-400 text-white border-0 rounded-lg shadow-lg shadow-amber-500/30 animate-pulse"
                          >
                            {claimingTierId === tier.id ? '...' : '🎁 Claim'}
                          </Button>
                        ) : (
                          <div className="flex flex-col gap-1">
                            <span className="text-[10px] font-semibold bg-amber-100 text-amber-700 border border-amber-300 px-2 py-0.5 rounded-md text-center">
                              +{(tier.reward_beans ?? 0).toLocaleString('en-US')} Beans
                            </span>
                            <span className="text-[10px] font-semibold bg-violet-100 text-violet-700 border border-violet-300 px-2 py-0.5 rounded-md text-center">
                              +{(tier.reward_coins ?? 0).toLocaleString('en-US')} Coins
                            </span>
                          </div>
                        )}
                      </div>
                    </div>
                  </motion.div>
                );
              })}
            </div>
          </motion.div>
        )}

        {/* My Rank */}
        {myRank && (
          <motion.div
            initial={{ scale: 0.95, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="rounded-2xl p-4 bg-gradient-to-br from-violet-50 via-white to-fuchsia-50 border border-violet-200/70 shadow-lg shadow-violet-900/5"
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-amber-400 to-orange-500 flex items-center justify-center text-white font-bold text-lg shadow-lg shadow-amber-500/30">
                  #{myRank.rank}
                </div>
                <div>
                  <p className="text-slate-900 font-bold text-sm">Your Rank</p>
                  <p className="text-slate-500 text-xs">{myRank.total_invites} Invites</p>
                </div>
              </div>
              <div className="text-right">
                <p className="text-amber-600 font-bold">+{myRank.beans_earned}</p>
                <p className="text-slate-500 text-[10px]">Beans Earned</p>
              </div>
            </div>
          </motion.div>
        )}

        {/* My Invited Friends */}
        {currentUser && (
          <motion.div
            initial={{ y: 20, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ delay: 0.25 }}
            className="rounded-2xl overflow-hidden bg-white border border-amber-200/70 shadow-lg shadow-amber-900/5"
          >
            <div className="flex items-center justify-between px-5 pt-5 pb-3 border-b border-amber-100">
              <div className="flex items-center gap-2">
                <Users className="w-5 h-5 text-violet-500" />
                <h3 className="text-slate-900 font-bold text-base">My Invites</h3>
              </div>
              <span className="text-xs text-slate-600 bg-amber-50 border border-amber-200/70 px-2.5 py-1 rounded-full font-medium">
                {myInvitedUsers.length} people
              </span>
            </div>

            <div className="px-4 pt-3 pb-4 space-y-1.5 max-h-60 overflow-y-auto">
              {myInvitedUsers.length > 0 ? (
                myInvitedUsers.map((user, index) => (
                  <motion.div
                    key={user.id}
                    initial={{ x: -20, opacity: 0 }}
                    animate={{ x: 0, opacity: 1 }}
                    transition={{ delay: 0.03 * index }}
                    className="flex items-center gap-3 p-2.5 rounded-xl bg-amber-50/40 border border-amber-100"
                  >
                    <div className="w-9 h-9 rounded-full overflow-hidden bg-gradient-to-br from-violet-100 to-fuchsia-100 flex items-center justify-center shrink-0 border border-violet-200/60">
                      {user.avatar_url ? (
                        <img src={user.avatar_url} alt="" className="w-full h-full object-cover" />
                      ) : (
                        <span className="text-violet-700 font-bold text-sm">{user.display_name[0]}</span>
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-slate-900 text-sm font-medium truncate">{user.display_name}</p>
                      <p className="text-slate-500 text-[10px]">
                        Joined {new Date(user.created_at).toLocaleDateString()}
                      </p>
                    </div>
                    <div className="w-6 h-6 rounded-full bg-emerald-100 border border-emerald-200 flex items-center justify-center shrink-0">
                      <CheckCircle className="w-3.5 h-3.5 text-emerald-600" />
                    </div>
                  </motion.div>
                ))
              ) : (
                <div className="text-center py-8">
                  <Users className="w-10 h-10 text-slate-300 mx-auto mb-2" />
                  <p className="text-slate-600 text-sm">No invites yet</p>
                  <p className="text-slate-400 text-xs mt-1">Share your link to start inviting!</p>
                </div>
              )}
            </div>
          </motion.div>
        )}

        {/* Top 3 Podium */}
        {leaderboard.length >= 3 && (
          <motion.div
            initial={{ y: 30, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ delay: 0.2 }}
            className="flex items-end justify-center gap-3 py-4"
          >
            {/* 2nd Place */}
            <motion.div initial={{ y: 50 }} animate={{ y: 0 }} transition={{ delay: 0.3 }} className="flex flex-col items-center">
              <div className="relative">
                <div className="w-16 h-16 rounded-full p-0.5 shadow-lg" style={{ background: 'linear-gradient(135deg, #94a3b8, #e2e8f0)' }}>
                  <div className="w-full h-full rounded-full overflow-hidden bg-slate-200 flex items-center justify-center">
                    {leaderboard[1]?.avatar_url ? (
                      <img src={leaderboard[1].avatar_url} alt="" className="w-full h-full object-cover" />
                    ) : (
                      <span className="text-slate-800 font-bold text-lg">{(leaderboard[1]?.display_name || 'U')[0]}</span>
                    )}
                  </div>
                </div>
                <div className="absolute -bottom-1.5 left-1/2 -translate-x-1/2 w-7 h-7 rounded-full bg-gradient-to-b from-gray-300 to-gray-400 flex items-center justify-center text-white text-xs font-bold shadow-md">2</div>
              </div>
              <p className="text-slate-500 text-[10px] font-medium mt-3 truncate max-w-16 text-center">{leaderboard[1]?.display_name}</p>
              <div className="bg-gradient-to-t from-gray-400/50 to-gray-300/30 w-20 h-14 rounded-t-lg flex items-center justify-center mt-1">
                <p className="text-slate-800 font-bold text-sm">{leaderboard[1]?.total_invites}</p>
              </div>
            </motion.div>

            {/* 1st Place */}
            <motion.div initial={{ y: 50 }} animate={{ y: 0 }} transition={{ delay: 0.2 }} className="flex flex-col items-center -mt-6">
              <Crown className="w-7 h-7 text-yellow-400 mb-1.5 animate-bounce" />
              <div className="relative">
                <div className="w-20 h-20 rounded-full p-0.5 shadow-[0_0_25px_rgba(251,191,36,0.4)]" style={{ background: 'linear-gradient(135deg, #fbbf24, #f59e0b)' }}>
                  <div className="w-full h-full rounded-full overflow-hidden bg-amber-900 flex items-center justify-center">
                    {leaderboard[0]?.avatar_url ? (
                      <img src={leaderboard[0].avatar_url} alt="" className="w-full h-full object-cover" />
                    ) : (
                      <span className="text-amber-200 font-bold text-xl">{(leaderboard[0]?.display_name || 'U')[0]}</span>
                    )}
                  </div>
                </div>
                <div className="absolute -bottom-1.5 left-1/2 -translate-x-1/2 w-7 h-7 rounded-full bg-gradient-to-b from-yellow-400 to-amber-500 flex items-center justify-center text-white text-xs font-bold shadow-md">1</div>
              </div>
              <p className="text-amber-300 text-[10px] font-bold mt-3 truncate max-w-20 text-center">{leaderboard[0]?.display_name}</p>
              <div className="bg-gradient-to-t from-amber-500/50 to-yellow-400/30 w-24 h-20 rounded-t-lg flex items-center justify-center mt-1">
                <p className="text-slate-800 font-bold">{leaderboard[0]?.total_invites}</p>
              </div>
            </motion.div>

            {/* 3rd Place */}
            <motion.div initial={{ y: 50 }} animate={{ y: 0 }} transition={{ delay: 0.4 }} className="flex flex-col items-center">
              <div className="relative">
                <div className="w-16 h-16 rounded-full p-0.5 shadow-lg" style={{ background: 'linear-gradient(135deg, #d97706, #b45309)' }}>
                  <div className="w-full h-full rounded-full overflow-hidden bg-amber-900 flex items-center justify-center">
                    {leaderboard[2]?.avatar_url ? (
                      <img src={leaderboard[2].avatar_url} alt="" className="w-full h-full object-cover" />
                    ) : (
                      <span className="text-amber-200 font-bold text-lg">{(leaderboard[2]?.display_name || 'U')[0]}</span>
                    )}
                  </div>
                </div>
                <div className="absolute -bottom-1.5 left-1/2 -translate-x-1/2 w-7 h-7 rounded-full bg-gradient-to-b from-amber-600 to-orange-700 flex items-center justify-center text-white text-xs font-bold shadow-md">3</div>
              </div>
              <p className="text-slate-500 text-[10px] font-medium mt-3 truncate max-w-16 text-center">{leaderboard[2]?.display_name}</p>
              <div className="bg-gradient-to-t from-amber-600/50 to-orange-500/30 w-20 h-10 rounded-t-lg flex items-center justify-center mt-1">
                <p className="text-slate-800 font-bold text-sm">{leaderboard[2]?.total_invites}</p>
              </div>
            </motion.div>
          </motion.div>
        )}

        {/* Leaderboard List */}
        <motion.div
          initial={{ y: 30, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ delay: 0.3 }}
          className="rounded-2xl overflow-hidden bg-white border border-amber-200/70 shadow-lg shadow-amber-900/5"
        >
          <div className="flex items-center gap-2 px-5 pt-5 pb-3 border-b border-amber-100">
            <Flame className="w-5 h-5 text-orange-500" />
            <h3 className="text-slate-900 font-bold text-base">Top 100 Leaderboard</h3>
          </div>

          <div className="px-4 pt-3 pb-4 space-y-1.5 max-h-96 overflow-y-auto">
            {leaderboard.slice(3).map((entry, index) => (
              <motion.div
                key={entry.user_id}
                initial={{ x: -20, opacity: 0 }}
                animate={{ x: 0, opacity: 1 }}
                transition={{ delay: 0.03 * (index % 10) }}
                className={`flex items-center gap-2.5 p-2.5 rounded-xl transition-all border ${
                  entry.user_id === currentUser?.id
                    ? 'bg-gradient-to-r from-violet-50 to-fuchsia-50 border-violet-200/70'
                    : 'bg-amber-50/40 border-amber-100'
                }`}
              >
                <div className={`w-8 h-8 rounded-lg flex items-center justify-center font-bold text-xs ${
                  entry.rank <= 10
                    ? 'bg-gradient-to-br from-fuchsia-600 to-violet-600 text-white shadow-md shadow-purple-500/20'
                    : 'bg-amber-100 text-amber-800'
                }`}>
                  {entry.rank}
                </div>

                <div className="w-9 h-9 rounded-full overflow-hidden bg-gradient-to-br from-violet-100 to-fuchsia-100 flex items-center justify-center shrink-0 border border-violet-200/60">
                  {entry.avatar_url ? (
                    <img src={entry.avatar_url} alt="" className="w-full h-full object-cover" />
                  ) : (
                    <span className="text-violet-700 font-bold text-sm">{entry.display_name[0]}</span>
                  )}
                </div>

                <div className="flex-1 min-w-0">
                  <p className="text-slate-900 text-sm font-medium truncate">{entry.display_name}</p>
                  <p className="text-slate-500 text-[10px]">{entry.total_invites} invites</p>
                </div>

                <div className="text-right shrink-0">
                  <p className="text-amber-600 font-bold text-xs">+{entry.beans_earned}</p>
                  <p className="text-slate-400 text-[9px]">Beans</p>
                </div>
              </motion.div>
            ))}

            {leaderboard.length === 0 && (
              <div className="text-center py-12">
                <Trophy className="w-14 h-14 text-slate-300 mx-auto mb-3" />
                <p className="text-slate-600 font-medium">No leaders yet</p>
                <p className="text-slate-400 text-sm mt-1">Share to be first!</p>
              </div>
            )}
          </div>
        </motion.div>

        {/* Stats Footer */}
        <motion.div
          initial={{ y: 20, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ delay: 0.4 }}
          className="grid grid-cols-2 gap-3"
        >
          <div className="rounded-xl p-4 text-center bg-white border border-amber-200/70 shadow-sm">
            <Star className="w-7 h-7 text-amber-500 mx-auto mb-1.5" />
            <p className="text-xl font-bold text-slate-900">{leaderboard.length}</p>
            <p className="text-slate-500 text-xs">Participants</p>
          </div>
          <div className="rounded-xl p-4 text-center bg-white border border-violet-200/70 shadow-sm">
            <Users className="w-7 h-7 text-violet-500 mx-auto mb-1.5" />
            <p className="text-xl font-bold text-slate-900">
              {leaderboard.reduce((sum, e) => sum + e.total_invites, 0)}
            </p>
            <p className="text-slate-500 text-xs">Total Invites</p>
          </div>
        </motion.div>
      </div>
      </div>
    </div>
  );
};

export default Invitation;
