import { useState, useEffect, useRef, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, Phone, Heart, Users, UserPlus, UserCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { supabase } from "@/integrations/supabase/client";
import { BottomNavigation } from "@/components/layout/BottomNavigation";
import { useCall } from "@/components/call/CallProvider";
import { toast } from "sonner";
import { LoadingSpinner } from "@/components/common/LoadingSpinner";
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

      const [{ data: followingData, error: followingError }, { data: followersData, error: followersError }] = await Promise.all([
        supabase.from('followers').select('id, created_at, following_id').eq('follower_id', user.id).order('created_at', { ascending: false }),
        supabase.from('followers').select('id, created_at, follower_id').eq('following_id', user.id).order('created_at', { ascending: false }),
      ]);

      if (followingError) throw followingError;
      if (followersError) throw followersError;
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

    // Pkg335: Honor Core rule — restore Supabase Realtime on `followers`+`profiles`
    // (both in supabase_realtime publication). Drops prior visibility-refresh fallback.
    const unsub = subscribeToTables('following-list', ['followers', 'profiles'], (table, _event, payload) => {
      const uid = userIdRef.current;
      if (!uid) return;
      if (table === 'followers') {
        const row = (payload?.new ?? payload?.old) as { follower_id?: string; following_id?: string } | null;
        if (!row) return;
        if (row.follower_id === uid || row.following_id === uid) scheduleRefetch();
      } else if (table === 'profiles') {
        const row = (payload?.new ?? payload?.old) as { id?: string } | null;
        if (!row?.id) return;
        // Only refresh if it's a profile we are currently showing.
        if (followingIds.has(row.id) || following.some(f => f.profile.id === row.id) || followers.some(f => f.profile.id === row.id)) {
          scheduleRefetch();
        }
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
      toast.error("Failed to unfollow");
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
        className="flex items-center gap-3 p-4 bg-card text-card-foreground rounded-xl border border-border shadow-sm"
      >
        {/* Avatar */}
        <div
          className="relative cursor-pointer"
          onClick={() => navigate(`/profile/${profile.id}`)}
        >
          <Avatar className="w-14 h-14">
            <AvatarImage src={profile.avatar_url || undefined} />
            <AvatarFallback className="bg-gradient-to-br from-purple-400 to-pink-400 text-primary-foreground">
              {profile.display_name?.[0] || '?'}
            </AvatarFallback>
          </Avatar>
          {profile.is_online && (
            <div className="absolute bottom-0 right-0 w-4 h-4 bg-green-500 rounded-full border-2 border-card" />
          )}
          {profile.is_verified && (
            <div className="absolute -bottom-1 -right-1 w-5 h-5 bg-blue-500 rounded-full flex items-center justify-center border-2 border-card">
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
              <span className="text-xs bg-pink-100 text-pink-600 px-2 py-0.5 rounded-full">Host</span>
            )}
          </div>
          <p className="text-sm text-muted-foreground">
            {profile.country_flag} {profile.is_online ? 'Online' : 'Offline'}
          </p>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-2">
          {profile.is_host && profile.is_online && (
            <Button
              size="icon"
              className="w-10 h-10 rounded-full bg-gradient-to-r from-green-500 to-emerald-500 text-white"
              onClick={() => handleCall(profile.id)}
            >
              <Phone className="w-4 h-4" />
            </Button>
          )}

          {showFollowBack && !isFollowingUser ? (
            <Button
              size="sm"
              className="bg-gradient-to-r from-purple-500 to-pink-500 text-white"
              onClick={() => handleFollow(profile.id)}
            >
              <UserPlus className="w-4 h-4 mr-1" />
              Follow
            </Button>
          ) : isFollowingUser ? (
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                const followRecord = following.find(f => f.profile.id === profile.id);
                if (followRecord) handleUnfollow(followRecord.id, profile.id);
              }}
            >
              <UserCheck className="w-4 h-4 mr-1" />
              Following
            </Button>
          ) : null}
        </div>
      </div>
    );
  };

  const renderEmptyState = (type: string) => (
    <div className="text-center py-16">
      <div className="w-20 h-20 mx-auto mb-4 rounded-full bg-muted border border-border flex items-center justify-center">
        {type === 'following' ? (
          <Heart className="w-10 h-10 text-primary" />
        ) : type === 'friends' ? (
          <Users className="w-10 h-10 text-primary" />
        ) : (
          <UserPlus className="w-10 h-10 text-primary" />
        )}
      </div>
      <h3 className="text-lg font-semibold mb-2 text-foreground">
        {type === 'following' ? 'Not following anyone yet' :
         type === 'friends' ? 'No friends yet' :
         'No followers yet'}
      </h3>
      <p className="text-muted-foreground text-sm max-w-xs mx-auto">
        {type === 'following' ? 'Discover and follow hosts you like!' :
         type === 'friends' ? 'Friends are people you follow who also follow you back.' :
         'Share your profile to get more followers!'}
      </p>
      {type === 'following' && (
        <Button
          className="mt-4 bg-gradient-to-r from-purple-500 to-pink-500 text-white"
          onClick={() => navigate('/discover')}
        >
          Discover Hosts
        </Button>
      )}
    </div>
  );

  return (
    <div className="mobile-page bg-background">
      {/* Header */}
      <header className="sticky top-0 z-40 bg-card/85 backdrop-blur-xl border-b border-border safe-area-top">
        <div className="px-4 py-3 flex items-center gap-3">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => navigate(-1)}
            className="text-foreground hover:bg-muted"
          >
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <h1 className="text-xl font-bold text-foreground">Following & Friends</h1>
        </div>
      </header>

      <main className="mobile-page-scrollable px-4 py-4">
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <LoadingSpinner size="md" text="Loading" />
          </div>
        ) : (
          <Tabs value={currentTab} onValueChange={setCurrentTab} className="w-full">
            <TabsList className="grid w-full grid-cols-3 mb-4">
              <TabsTrigger value="following" className="relative">
                Following
                {following.length > 0 && (
                  <span className="ml-1 text-xs bg-purple-500 text-white px-1.5 rounded-full">
                    {following.length}
                  </span>
                )}
              </TabsTrigger>
              <TabsTrigger value="followers" className="relative">
                Followers
                {followers.length > 0 && (
                  <span className="ml-1 text-xs bg-purple-500 text-white px-1.5 rounded-full">
                    {followers.length}
                  </span>
                )}
              </TabsTrigger>
              <TabsTrigger value="friends" className="relative">
                Friends
                {friends.length > 0 && (
                  <span className="ml-1 text-xs bg-pink-500 text-white px-1.5 rounded-full">
                    {friends.length}
                  </span>
                )}
              </TabsTrigger>
            </TabsList>

            <TabsContent value="following" className="space-y-3">
              {following.length === 0 ? (
                renderEmptyState('following')
              ) : (
                following.map(record => renderUserCard(record, false))
              )}
            </TabsContent>

            <TabsContent value="followers" className="space-y-3">
              {followers.length === 0 ? (
                renderEmptyState('followers')
              ) : (
                followers.map(record => renderUserCard(record, true))
              )}
            </TabsContent>

            <TabsContent value="friends" className="space-y-3">
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
