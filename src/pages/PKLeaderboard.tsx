import { useState, useEffect, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { ArrowLeft, Trophy, Crown, Medal, Award, Gem, Clock, Users, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Session } from "@supabase/supabase-js";
import { recordClientError } from "@/utils/clientErrorLog";

interface Competition {
  id: string;
  title: string;
  description: string | null;
  banner_image_url: string | null;
  start_date: string;
  end_date: string;
  status: string;
  competition_type: string;
}

interface Participant {
  id: string;
  user_id: string;
  score: number;
  rank_position: number | null;
  profile?: {
    display_name: string | null;
    avatar_url: string | null;
    uid: string | null;
    app_uid: string | null;
  };
}

interface RewardTier {
  rank_from: number;
  rank_to: number;
  reward_diamonds: number;
  reward_beans: number;
  reward_coins: number;
}

const PKLeaderboard = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [competition, setCompetition] = useState<Competition | null>(null);
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [rewards, setRewards] = useState<RewardTier[]>([]);
  const [loading, setLoading] = useState(true);
  const [myRank, setMyRank] = useState<number | null>(null);
  const [timeLeft, setTimeLeft] = useState("");

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      setCurrentUserId(data?.user?.id || null);
    });
  }, []);

  const fetchData = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    try {
      // Fetch competition
      const { data: comp } = await supabase
        .from("pk_competitions")
        .select("*")
        .eq("id", id)
        .single();
      if (comp) setCompetition(comp as Competition);

      // Fetch participants with profiles
      const { data: parts } = await supabase
        .from("pk_participants")
        .select("id, user_id, score, rank_position")
        .eq("competition_id", id)
        .order("score", { ascending: false })
        .limit(50);

      // Filter out demo/admin IDs
      const EXCLUDED_IDS = [
        "6888e618-ae45-4bbb-bbd2-6834fc0f9ff9", // big boss
        "ab155d31-96d4-4a42-855d-b2c090ba0339", // Bd Admin
        "251cbe57-e46b-41c0-bfb5-4cfcad9d6499", // b
      ];
      const filteredParts = (parts || []).filter(p => !EXCLUDED_IDS.includes(p.user_id));

      if (filteredParts.length > 0) {
        // Fetch profiles for participants
        const userIds = filteredParts.map(p => p.user_id);
        const { data: profiles } = await supabase
          .from("profiles")
          .select("id, display_name, avatar_url, app_uid")
          .in("id", userIds);

        const profileMap = new Map((profiles || []).map((p: any) => [p.id, p]));
        const enriched = filteredParts.map((p, idx) => ({
          ...p,
          rank_position: idx + 1,
          profile: profileMap.get(p.user_id) || null,
        }));
        setParticipants(enriched as unknown as Participant[]);

        // Find my rank
        if (currentUserId) {
          const myEntry = enriched.find(p => p.user_id === currentUserId);
          setMyRank(myEntry ? myEntry.rank_position : null);
        }
      } else {
        setParticipants([]);
      }

      // Fetch rewards
      const { data: rwds } = await supabase
        .from("pk_competition_rewards")
        .select("rank_from, rank_to, reward_diamonds, reward_beans, reward_coins")
        .eq("competition_id", id)
        .eq("is_active", true)
        .order("rank_from");
      setRewards((rwds as RewardTier[]) || []);
    } catch (err) {
      console.error("Error fetching PK data:", err);
      recordClientError({ label: "PKLeaderboard.myEntry", message: err instanceof Error ? err.message : String(err) });
    } finally {
      setLoading(false);
    }
  }, [id, currentUserId]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Countdown timer
  useEffect(() => {
    if (!competition) return;
    const timer = setInterval(() => {
      const now = new Date().getTime();
      const end = new Date(competition.end_date).getTime();
      const diff = end - now;
      if (diff <= 0) {
        setTimeLeft("Ended");
        clearInterval(timer);
        return;
      }
      const days = Math.floor(diff / (1000 * 60 * 60 * 24));
      const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
      const mins = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
      const secs = Math.floor((diff % (1000 * 60)) / 1000);
      setTimeLeft(`${days}d ${hours}h ${mins}m ${secs}s`);
    }, 1000);
    return () => clearInterval(timer);
  }, [competition]);

  const getPositionStyle = (rank: number) => {
    switch (rank) {
      case 1: return "bg-gradient-to-r from-yellow-500/30 to-amber-500/20 border-yellow-500/50";
      case 2: return "bg-gradient-to-r from-gray-400/20 to-gray-300/10 border-gray-400/40";
      case 3: return "bg-gradient-to-r from-orange-500/20 to-amber-600/10 border-orange-500/40";
      default: return "bg-card/50 border-border";
    }
  };

  const getPositionIcon = (rank: number) => {
    switch (rank) {
      case 1: return <Crown className="w-5 h-5 text-yellow-400" />;
      case 2: return <Medal className="w-5 h-5 text-slate-500" />;
      case 3: return <Award className="w-5 h-5 text-orange-400" />;
      default: return <span className="text-xs font-bold text-muted-foreground">#{rank}</span>;
    }
  };

  const getRewardForRank = (rank: number): RewardTier | null => {
    return rewards.find(r => rank >= r.rank_from && rank <= r.rank_to) || null;
  };

  const formatNumber = (num: number): string => {
    if (num >= 1000000) return `${(num / 1000000).toFixed(1)}M`;
    if (num >= 1000) return `${(num / 1000).toFixed(0)}K`;
    return num.toString();
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <RefreshCw className="w-8 h-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!competition) {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center gap-4 p-4">
        <Trophy className="w-16 h-16 text-muted-foreground/30" />
        <p className="text-muted-foreground">Competition not found</p>
        <Button variant="outline" onClick={() => navigate(-1)}>Go Back</Button>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 flex flex-col bg-background overflow-hidden">
      {/* Header */}
      <div className="flex-shrink-0 bg-gradient-to-br from-red-600 via-pink-600 to-purple-700 p-4 pb-6 relative overflow-hidden safe-area-top">
        <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNDAiIGhlaWdodD0iNDAiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+PGNpcmNsZSBjeD0iMjAiIGN5PSIyMCIgcj0iMSIgZmlsbD0icmdiYSgyNTUsMjU1LDI1NSwwLjEpIi8+PC9zdmc+')] opacity-30" />
        
        <div className="relative z-10">
          <div className="flex items-center gap-3 mb-3">
            <Button variant="ghost" size="icon" onClick={() => navigate(-1)} className="text-slate-800 hover:bg-white/10">
              <ArrowLeft className="w-5 h-5" />
            </Button>
            <div className="flex-1">
              <h1 className="text-lg font-bold text-slate-800">{competition.title}</h1>
              {competition.description && (
                <p className="text-slate-600 text-xs">{competition.description}</p>
              )}
            </div>
          </div>

          {/* Timer & Stats */}
          <div className="flex items-center gap-4 mt-2">
            <div className="flex items-center gap-1.5 bg-white/15 backdrop-blur-sm rounded-full px-3 py-1.5">
              <Clock className="w-3.5 h-3.5 text-slate-800" />
              <span className="text-slate-800 text-xs font-medium">{timeLeft}</span>
            </div>
            <div className="flex items-center gap-1.5 bg-white/15 backdrop-blur-sm rounded-full px-3 py-1.5">
              <Users className="w-3.5 h-3.5 text-slate-800" />
              <span className="text-slate-800 text-xs font-medium">{participants.length} participants</span>
            </div>
          </div>

          {/* My Rank */}
          {myRank && (
            <div className="mt-3 bg-white/15 backdrop-blur-sm rounded-lg p-3 flex items-center gap-3">
              <Trophy className="w-5 h-5 text-yellow-300" />
              <div>
                <p className="text-slate-800 text-xs">Your Rank</p>
                <p className="text-slate-800 text-lg font-bold">#{myRank}</p>
              </div>
              {getRewardForRank(myRank) && (
                <div className="ml-auto text-right">
                  <p className="text-slate-500 text-[10px]">Prize</p>
                  <p className="text-yellow-300 text-sm font-bold">
                    {formatNumber(getRewardForRank(myRank)!.reward_diamonds)} 💎
                  </p>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto overscroll-contain" style={{ WebkitOverflowScrolling: 'touch', paddingBottom: 'var(--content-bottom-padding)' }}>
      {/* Reward Tiers */}
      {rewards.length > 0 && (
        <div className="px-4 mt-4">
          <h3 className="text-foreground text-sm font-semibold mb-2 flex items-center gap-2">
            <Gem className="w-4 h-4 text-cyan-400" /> Rewards
          </h3>
          <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-hide">
            {rewards.map((r, i) => (
              <div key={i} className="flex-shrink-0 bg-card border border-border rounded-lg p-3 min-w-[120px] text-center">
                <p className="text-xs text-muted-foreground mb-1">
                  {r.rank_from === r.rank_to ? `#${r.rank_from}` : `#${r.rank_from}-${r.rank_to}`}
                </p>
                <div className="space-y-0.5">
                  {r.reward_diamonds > 0 && (
                    <p className="text-xs font-bold text-cyan-400">{formatNumber(r.reward_diamonds)} 💎</p>
                  )}
                  {r.reward_beans > 0 && (
                    <p className="text-xs font-bold text-green-400">{formatNumber(r.reward_beans)} Beans</p>
                  )}
                  {r.reward_coins > 0 && (
                    <p className="text-xs font-bold text-yellow-400">{formatNumber(r.reward_coins)} 💰</p>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Leaderboard */}
      <div className="px-4 mt-4">
        <h3 className="text-foreground text-sm font-semibold mb-3 flex items-center gap-2">
          <Trophy className="w-4 h-4 text-yellow-500" /> Rankings
        </h3>

        {participants.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground">
            <Users className="w-12 h-12 mx-auto mb-3 opacity-30" />
            <p className="text-sm">No participants yet</p>
            <p className="text-xs text-muted-foreground/60">Be the first to join!</p>
          </div>
        ) : (
          <div className="space-y-2">
            {participants.map((p) => {
              const rank = p.rank_position || 0;
              const reward = getRewardForRank(rank);
              const isMe = currentUserId === p.user_id;
              return (
                <div
                  key={p.id}
                  className={`flex items-center gap-3 p-3 rounded-xl border transition-all ${getPositionStyle(rank)} ${isMe ? 'ring-2 ring-primary' : ''}`}
                >
                  <div className="w-8 h-8 flex items-center justify-center">
                    {getPositionIcon(rank)}
                  </div>

                  <div className="w-10 h-10 rounded-full bg-muted overflow-hidden flex-shrink-0">
                    {p.profile?.avatar_url ? (
                      <img src={p.profile.avatar_url} alt="" className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full bg-gradient-to-br from-primary/30 to-primary/10 flex items-center justify-center text-xs font-bold text-primary">
                        {(p.profile?.display_name || "?")[0]}
                      </div>
                    )}
                  </div>

                  <div className="flex-1 min-w-0">
                    <p className="text-foreground text-sm font-medium truncate">
                      {p.profile?.app_uid || p.profile?.display_name || "Unknown"}
                      {isMe && <span className="text-primary text-xs ml-1">(You)</span>}
                    </p>
                    <p className="text-muted-foreground text-xs">
                      Score: {formatNumber(p.score)}
                    </p>
                  </div>

                  {reward && (
                    <div className="text-right flex-shrink-0">
                      {reward.reward_diamonds > 0 && (
                        <p className="text-xs font-bold text-cyan-400">{formatNumber(reward.reward_diamonds)} 💎</p>
                      )}
                      {reward.reward_beans > 0 && (
                        <p className="text-[10px] text-green-400">{formatNumber(reward.reward_beans)} Beans</p>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
      </div>
    </div>
  );
};

export default PKLeaderboard;
