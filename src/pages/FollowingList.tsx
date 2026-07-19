import { useState, useEffect, useRef, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, Phone, Heart, Users, UserPlus, UserCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import AvatarWithFrame from "@/components/common/AvatarWithFrame";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { supabase } from "@/integrations/supabase/client";
import { BottomNavigation } from "@/components/layout/BottomNavigation";
import { useCall } from "@/components/call/CallContext";
import { toast } from "sonner";

import { Skeleton as SkeletonPrim } from "@/components/Skeleton";
import { recordClientError } from "@/utils/clientErrorLog";
import { subscribeToTables } from "@/hooks/useUniversalRealtime";

interface UserProfile {
  id: string;
  display_name: string | null;
  avatar_url: string | null;
  is_online: boolean | null;
  is_verified: boolean | null;
  is_host: boolean | null;
  country_flag: string | null;
}

interface FollowRecord {
  id: string;
  created_at: string;
  profile: UserProfile;
}

// Pkg335: map guard_followers_insert ERRCODE 22023 raises → friendly toasts.
const mapFollowError = (err: unknown): string => {
  const msg = err instanceof Error ? err.message : String(err ?? "");
  if (/cannot follow yourself/i.test(msg)) return "You can't follow yourself";
  if (/unavailable user/i.test(msg)) return "This user is no longer available";
  if (/blocked relationship/i.test(msg)) return "You can't follow due to a block";
  if (/follow rate limit/i.test(msg)) return "You're following too fast, please slow down";
  if (/duplicate key|unique/i.test(msg)) return "You already follow this user";
  return "Failed to follow";
};

// Pkg335 pass-2: map unfollow rate-limit error → friendly toast.
const mapUnfollowError = (err: unknown): string => {
  const msg = err instanceof Error ? err.message : String(err ?? "");
  if (/unfollow rate limit/i.test(msg)) return "You're unfollowing too fast, please slow down";
  return "Failed to unfollow";
};

// Pkg335 pass-2: page through Supabase 1000-row cap so power users with
// 1000+ following/followers aren't silently truncated.
const PAGE_SIZE = 1000;
async function fetchAllFollowRows(
  column: 'follower_id' | 'following_id',
  uid: string,
): Promise<Array<{ id: string; created_at: string; follower_id: string; following_id: string }>> {
  const all: Array<{ id: string; created_at: string; follower_id: string; following_id: string }> = [];
  let from = 0;
  // Hard safety cap: 20 pages = 20k rows. Anyone past that is abuse / not a real user.
  for (let i = 0; i < 20; i++) {
    const { data, error } = await supabase
      .from('followers')
      .select('id, created_at, follower_id, following_id')
      .eq(column, uid)
      .order('created_at', { ascending: false })
      .range(from, from + PAGE_SIZE - 1);
    if (error) throw error;
    const rows = data ?? [];
    all.push(...rows);
    if (rows.length < PAGE_SIZE) break;
    from += PAGE_SIZE;
  }
  return all;
}

const FollowingList = () => {
  const navigate = useNavigate();
  const { startCall } = useCall();
  const [activeTab, setActiveTab] = useState("/profile");
  const [currentTab, setCurrentTab] = useState("following");
  const [following, setFollowing] = useState<FollowRecord[]>([]);
  const [followers, setFollowers] = useState<FollowRecord[]>([]);
  const [friends, setFriends] = useState<FollowRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [userId, setUserId] = useState<string | null>(null);
  const [followingIds, setFollowingIds] = useState<Set<string>>(new Set());

  const cancelledRef = useRef(false);
  const userIdRef = useRef<string | null>(null);
  const refetchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const fetchData = useCallback(async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (cancelledRef.current) return;
      if (!user) {
        navigate('/auth');
        return;
      }
      userIdRef.current = user.id;
      setUserId(user.id);

      const [followingData, followersData] = await Promise.all([
        fetchAllFollowRows('follower_id', user.id),
        fetchAllFollowRows('following_id', user.id),
      ]);

      if (cancelledRef.current) return;

      const followingUserIds = followingData?.map(f => f.following_id) || [];
      const followerUserIds = followersData?.map(f => f.follower_id) || [];
      const allUserIds = [...new Set([...followingUserIds, ...followerUserIds])];

      const followingSet = new Set(followingUserIds);
      setFollowingIds(followingSet);

      if (allUserIds.length > 0) {
        const { data: profiles, error: profilesError } = await supabase
          .from('profiles_public')
          .select('id, display_name, avatar_url, is_online, is_verified, is_host, country_flag')
          .in('id', allUserIds);

        if (profilesError) throw profilesError;
        if (cancelledRef.current) return;

        const profilesMap = new Map(profiles?.map(p => [p.id, p]) || []);

        const followingWithProfiles: FollowRecord[] = followingData?.map(f => ({
          id: f.id,
          created_at: f.created_at,
          profile: profilesMap.get(f.following_id) as UserProfile
        })).filter(f => f.profile) || [];

        const followersWithProfiles: FollowRecord[] = followersData?.map(f => ({
          id: f.id,
          created_at: f.created_at,
          profile: profilesMap.get(f.follower_id) as UserProfile
        })).filter(f => f.profile) || [];

        const followerIdsSet = new Set(followerUserIds);
        const friendsWithProfiles = followingWithProfiles.filter(f => followerIdsSet.has(f.profile.id));

        setFollowing(followingWithProfiles);
        setFollowers(followersWithProfiles);
        setFriends(friendsWithProfiles);
      } else {
        setFollowing([]);
        setFollowers([]);
        setFriends([]);
      }
    } catch (error) {
      if (cancelledRef.current) return;
      console.error('Error fetching follow data:', error);
      recordClientError({ label: "FollowingList.fetchData", message: error instanceof Error ? error.message : String(error) });
      toast.error("Failed to load data");
    } finally {
      if (!cancelledRef.current) setLoading(false);
    }
  }, [navigate]);

  const scheduleRefetch = useCallback(() => {
    if (refetchTimerRef.current) clearTimeout(refetchTimerRef.current);
    refetchTimerRef.current = setTimeout(() => {
      refetchTimerRef.current = null;
      void fetchData();
    }, 400);
  }, [fetchData]);

  useEffect(() => {
    cancelledRef.current = false;
    void fetchData();

    // Realtime is scoped to follower graph changes; profile edit pushes arrive
    // through app-sync/admin-table-update instead of a broad profiles fanout.
    const unsub = subscribeToTables('following-list', ['followers'], (table, _event, payload) => {
      const uid = userIdRef.current;
      if (!uid) return;
      if (table === 'followers') {
        const row = payload as { follower_id?: string; following_id?: string } | null;
        if (!row) return;
        if (row.follower_id === uid || row.following_id === uid) scheduleRefetch();
      }
    });

    return () => {
      cancelledRef.current = true;
      if (refetchTimerRef.current) { clearTimeout(refetchTimerRef.current); refetchTimerRef.current = null; }
      unsub();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleUnfollow = async (followId: string, profileId: string) => {
    if (!userIdRef.current) return;
    try {
      const { error } = await supabase
        .from('followers')
        .delete()
        .eq('id', followId)
        .eq('follower_id', userIdRef.current); // defense-in-depth (RLS already enforces)

      if (error) throw error;

      setFollowing(prev => prev.filter(f => f.id !== followId));
      setFriends(prev => prev.filter(f => f.profile.id !== profileId));
      setFollowingIds(prev => {
        const newSet = new Set(prev);
        newSet.delete(profileId);
        return newSet;
      });
      toast.success("Unfollowed");
    } catch (error) {
      console.error('Unfollow error:', error);
      recordClientError({ label: "FollowingList.handleUnfollow", message: error instanceof Error ? error.message : String(error) });
      toast.error(mapUnfollowError(error));
    }
  };

  const handleFollow = async (profileId: string) => {
    if (!userId) return;
    if (profileId === userId) { toast.error("You can't follow yourself"); return; }

    try {
      const { data, error } = await supabase
        .from('followers')
        .insert({ follower_id: userId, following_id: profileId })
        .select()
        .single();

      if (error) throw error;

      const followerRecord = followers.find(f => f.profile.id === profileId);
      if (followerRecord) {
        const newFollowRecord: FollowRecord = {
          id: data.id,
          created_at: data.created_at || new Date().toISOString(),
          profile: followerRecord.profile
        };
        setFollowing(prev => [newFollowRecord, ...prev]);
        setFriends(prev => [newFollowRecord, ...prev]);
      }

      setFollowingIds(prev => {
        const newSet = new Set(prev);
        newSet.add(profileId);
        return newSet;
      });

      toast.success("Followed");
    } catch (error) {
      console.error('Follow error:', error);
      recordClientError({ label: "FollowingList.handleFollow", message: error instanceof Error ? error.message : String(error) });
      toast.error(mapFollowError(error));
    }
  };

  const handleCall = async (hostId: string) => {
    try {
      await startCall(hostId);
    } catch (error) {
      console.error('Call error:', error);
      recordClientError({ label: "FollowingList.handleCall", message: error instanceof Error ? error.message : String(error) });
      toast.error("Failed to start call");
    }
  };

  const renderUserCard = (record: FollowRecord, showFollowBack: boolean = false) => {
    const { profile } = record;
    const isFollowingUser = followingIds.has(profile.id);

    return (
      <div
        key={record.id}
        className="group flex items-center gap-3 p-3.5 rounded-2xl bg-gradient-to-br from-card via-card to-card/90 border border-border/60 transition-all duration-300 hover:-translate-y-0.5 active:scale-[0.99]"
        style={{
          boxShadow:
            '0 8px 24px -12px rgba(168,85,247,0.18), 0 2px 6px -2px rgba(0,0,0,0.06), inset 0 1px 0 rgba(255,255,255,0.5)',
        }}
      >
        {/* Avatar */}
        <div
          className="relative cursor-pointer shrink-0"
          onClick={() => navigate(`/profile/${profile.id}`)}
        >
          <div
            className="absolute -inset-0.5 rounded-full bg-gradient-to-br from-purple-400 via-fuchsia-400 to-pink-400 opacity-70 blur-[2px] group-hover:opacity-100 transition-opacity"
            aria-hidden
          />
          <AvatarWithFrame
            userId={profile.id}
            src={profile.avatar_url || undefined}
            name={profile.display_name || '?'}
            level={1}
            size="sm"
            showFrame={true}
            showAnimation={false}
          />
          {profile.is_online && (
            <div
              className="absolute bottom-0 right-0 w-4 h-4 bg-gradient-to-br from-green-400 to-emerald-500 rounded-full border-2 border-card"
              style={{ boxShadow: '0 0 8px rgba(16,185,129,0.6)' }}
            />
          )}
          {profile.is_verified && (
            <div className="absolute -bottom-1 -right-1 w-5 h-5 bg-gradient-to-br from-sky-400 to-blue-500 rounded-full flex items-center justify-center border-2 border-card shadow-md">
              <svg className="w-2.5 h-2.5 text-white" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
              </svg>
            </div>
          )}
        </div>

        {/* Info */}
        <div
          className="flex-1 min-w-0 cursor-pointer"
          onClick={() => navigate(`/profile/${profile.id}`)}
        >
          <div className="flex items-center gap-2">
            <p className="font-semibold truncate text-foreground">{profile.display_name || 'User'}</p>
            {profile.is_host && (
              <span
                className="text-[10px] font-bold uppercase tracking-wide bg-gradient-to-r from-pink-500 to-rose-500 text-white px-2 py-0.5 rounded-full shadow-sm"
                style={{ boxShadow: '0 2px 6px -1px rgba(236,72,153,0.5), inset 0 1px 0 rgba(255,255,255,0.3)' }}
              >
                Host
              </span>
            )}
          </div>
          <p className="text-xs text-muted-foreground mt-0.5 flex items-center gap-1.5">
            <span>{profile.country_flag}</span>
            <span
 className={`inline-flex items-center gap-1 ${profile.is_online ? 'text-emerald-600 font-medium' : ''}`}
            >
              {profile.is_online && <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />}
              {profile.is_online ? 'Online now' : 'Offline'}
            </span>
          </p>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-2 shrink-0">
          {profile.is_host && profile.is_online && (
            <Button
              size="icon"
              className="w-10 h-10 rounded-full bg-gradient-to-br from-emerald-400 via-green-500 to-emerald-600 text-white border-0 transition-all hover:-translate-y-0.5 active:scale-95"
              style={{
                boxShadow:
                  '0 6px 16px -4px rgba(16,185,129,0.55), inset 0 1px 0 rgba(255,255,255,0.4), inset 0 -2px 4px rgba(0,0,0,0.15)',
              }}
              onClick={() => handleCall(profile.id)}
            >
              <Phone className="w-4 h-4" />
            </Button>
          )}

          {showFollowBack && !isFollowingUser ? (
            <Button
              size="sm"
              className="bg-gradient-to-r from-purple-500 via-fuchsia-500 to-pink-500 text-white border-0 rounded-full px-4 font-semibold transition-all hover:-translate-y-0.5 active:scale-95"
              style={{
                boxShadow:
                  '0 6px 16px -4px rgba(168,85,247,0.5), inset 0 1px 0 rgba(255,255,255,0.35), inset 0 -2px 4px rgba(0,0,0,0.12)',
              }}
              onClick={() => handleFollow(profile.id)}
            >
              <UserPlus className="w-4 h-4 mr-1" />
              Follow
            </Button>
          ) : isFollowingUser ? (
            <Button
              size="sm"
              variant="outline"
              className="rounded-full px-4 font-medium border-border/80 bg-background/60 backdrop-blur hover:bg-muted transition-all active:scale-95"
              onClick={() => {
                const followRecord = following.find(f => f.profile.id === profile.id);
                if (followRecord) handleUnfollow(followRecord.id, profile.id);
              }}
            >
              <UserCheck className="w-4 h-4 mr-1 text-emerald-500" />
              Following
            </Button>
          ) : null}
        </div>
      </div>
    );
  };

  const renderEmptyState = (type: string) => (
    <div className="relative text-center py-16">
      <div
        className="absolute inset-x-0 top-4 mx-auto w-40 h-40 rounded-full bg-gradient-to-br from-purple-400/30 via-fuchsia-400/20 to-pink-400/30 blur-3xl"
        aria-hidden
      />
      <div
 className="relative w-20 h-20 mx-auto mb-5 rounded-2xl bg-gradient-to-br from-purple-100 via-fuchsia-50 to-pink-100 border border-border flex items-center justify-center"
        style={{
          boxShadow:
            '0 10px 24px -10px rgba(168,85,247,0.35), inset 0 1px 0 rgba(255,255,255,0.6), inset 0 -2px 4px rgba(168,85,247,0.1)',
        }}
      >
        {type === 'following' ? (
          <Heart className="w-9 h-9 text-purple-500" />
        ) : type === 'friends' ? (
          <Users className="w-9 h-9 text-pink-500" />
        ) : (
          <UserPlus className="w-9 h-9 text-fuchsia-500" />
        )}
      </div>
      <h3 className="relative text-lg font-bold mb-2 text-foreground">
        {type === 'following' ? 'Not following anyone yet' :
         type === 'friends' ? 'No friends yet' :
         'No followers yet'}
      </h3>
      <p className="relative text-muted-foreground text-sm max-w-xs mx-auto">
        {type === 'following' ? 'Discover and follow hosts you like!' :
         type === 'friends' ? 'Friends are people you follow who also follow you back.' :
         'Share your profile to get more followers!'}
      </p>
      {type === 'following' && (
        <Button
          className="relative mt-5 bg-gradient-to-r from-purple-500 via-fuchsia-500 to-pink-500 text-white border-0 rounded-full px-6 py-2.5 font-semibold transition-all hover:-translate-y-0.5 active:scale-95"
          style={{
            boxShadow:
              '0 10px 24px -8px rgba(168,85,247,0.55), inset 0 1px 0 rgba(255,255,255,0.35), inset 0 -2px 4px rgba(0,0,0,0.12)',
          }}
          onClick={() => navigate('/discover')}
        >
          Discover Hosts
        </Button>
      )}
    </div>
  );

  const countBadge = (n: number, gradient: string) => (
    <span
      className={`ml-1.5 text-[10px] font-bold text-white px-1.5 py-0.5 rounded-full bg-gradient-to-r ${gradient}`}
      style={{ boxShadow: '0 2px 5px -1px rgba(0,0,0,0.25), inset 0 1px 0 rgba(255,255,255,0.35)' }}
    >
      {n}
    </span>
  );

  return (
 <div data-page="following" className="mobile-page bg-gradient-to-b from-purple-50/40 via-background to-background ">
      {/* Premium gradient header */}
      <header className="sticky top-0 z-40 safe-area-top">
        <div
          className="relative bg-gradient-to-r from-purple-600 via-fuchsia-600 to-pink-500 text-white"
          style={{ boxShadow: '0 8px 24px -8px rgba(168,85,247,0.45)' }}
        >
          <div
            className="absolute inset-0 opacity-30"
            style={{
              background:
                'radial-gradient(circle at 20% 0%, rgba(255,255,255,0.35), transparent 60%), radial-gradient(circle at 90% 100%, rgba(236,72,153,0.4), transparent 60%)',
            }}
            aria-hidden
          />
          <div className="relative px-4 py-3.5 flex items-center gap-3">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => navigate(-1)}
              className="w-10 h-10 rounded-full bg-white/15 backdrop-blur-xl text-white hover:bg-white/25 border-0 transition-all hover:-translate-y-0.5 active:scale-95"
              style={{ boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.25), 0 4px 10px -4px rgba(0,0,0,0.25)' }}
            >
              <ArrowLeft className="w-5 h-5" />
            </Button>
            <h1
              className="text-xl font-bold tracking-tight"
              style={{ textShadow: '0 2px 6px rgba(0,0,0,0.25)' }}
            >
              Following & Friends
            </h1>
          </div>
        </div>
      </header>

      <main className="mobile-page-scrollable px-4 py-4">
        {loading ? (
          <div className="divide-y divide-border/60" aria-busy="true">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="flex items-center gap-3 p-3">
                <SkeletonPrim className="w-12 h-12 rounded-full" />
                <div className="flex-1 space-y-2">
                  <SkeletonPrim className="h-3.5 w-1/3" />
                  <SkeletonPrim className="h-3 w-1/2" />
                </div>
                <SkeletonPrim className="h-8 w-20 rounded-full" />
              </div>
            ))}
          </div>
        ) : (
          <Tabs value={currentTab} onValueChange={setCurrentTab} className="w-full">
            {/* Sunken-track premium tabs */}
            <TabsList
              className="grid w-full grid-cols-3 mb-5 h-12 p-1 rounded-2xl bg-muted/60 border border-border/60"
              style={{ boxShadow: 'inset 0 2px 6px rgba(0,0,0,0.08), inset 0 -1px 0 rgba(255,255,255,0.4)' }}
            >
              <TabsTrigger
                value="following"
                className="rounded-xl font-semibold data-[state=active]:bg-gradient-to-br data-[state=active]:from-purple-500 data-[state=active]:via-fuchsia-500 data-[state=active]:to-pink-500 data-[state=active]:text-white data-[state=active]:shadow-md transition-all"
              >
                Following
                {following.length > 0 && countBadge(following.length, 'from-purple-600 to-fuchsia-600')}
              </TabsTrigger>
              <TabsTrigger
                value="followers"
                className="rounded-xl font-semibold data-[state=active]:bg-gradient-to-br data-[state=active]:from-fuchsia-500 data-[state=active]:via-pink-500 data-[state=active]:to-rose-500 data-[state=active]:text-white data-[state=active]:shadow-md transition-all"
              >
                Followers
                {followers.length > 0 && countBadge(followers.length, 'from-fuchsia-600 to-pink-600')}
              </TabsTrigger>
              <TabsTrigger
                value="friends"
                className="rounded-xl font-semibold data-[state=active]:bg-gradient-to-br data-[state=active]:from-pink-500 data-[state=active]:via-rose-500 data-[state=active]:to-orange-400 data-[state=active]:text-white data-[state=active]:shadow-md transition-all"
              >
                Friends
                {friends.length > 0 && countBadge(friends.length, 'from-pink-600 to-rose-600')}
              </TabsTrigger>
            </TabsList>

            <TabsContent value="following" className="space-y-3 animate-fade-in">
              {following.length === 0 ? (
                renderEmptyState('following')
              ) : (
                following.map(record => renderUserCard(record, false))
              )}
            </TabsContent>

            <TabsContent value="followers" className="space-y-3 animate-fade-in">
              {followers.length === 0 ? (
                renderEmptyState('followers')
              ) : (
                followers.map(record => renderUserCard(record, true))
              )}
            </TabsContent>

            <TabsContent value="friends" className="space-y-3 animate-fade-in">
              {friends.length === 0 ? (
                renderEmptyState('friends')
              ) : (
                friends.map(record => renderUserCard(record, false))
              )}
            </TabsContent>
          </Tabs>
        )}
      </main>

      <BottomNavigation activeTab={activeTab} onTabChange={(path) => {
        setActiveTab(path);
        navigate(path);
      }} />
    </div>
  );
};

export default FollowingList;
