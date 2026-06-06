import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { useNativeImagePrefetch } from "@/hooks/useNativeImagePrefetch";
import { usePersistedCache } from "@/hooks/usePersistedCache";
import { NativePullToRefresh } from "@/components/common/NativePullToRefresh";
import { subscribeToTables } from "@/hooks/useUniversalRealtime";
import { useNavigate } from "react-router-dom";

import { 
  ArrowLeft, 
  Users, 
  Gamepad2, 
  Lock, 
  Monitor,
  Mic,
  Search,
  Sparkles,
  RefreshCw
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { BottomNavigation } from "@/components/layout/BottomNavigation";
import { LevelBadge } from "@/components/common/LevelBadge";
import { useFeatureLevelCheck } from "@/hooks/useFeatureLevelCheck";
import { recordClientError } from "@/utils/clientErrorLog";
import { normalizeProfileMediaUrl } from "@/utils/profileMediaUrl";

interface PartyRoom {
  id: string;
  name: string;
  room_type: string;
  game_mode: string | null;
  background_url: string | null;
  entry_fee: number;
  min_level: number;
  max_participants: number;
  current_participants: number;
  is_private: boolean;
  room_code: string;
  host: {
    id: string;
    display_name: string | null;
    avatar_url: string | null;
    user_level: number;
    host_level: number | null;
    country_flag: string | null;
    country_code: string | null;
  } | null;
}

const partyCountries = [
  { code: "all", name: "All", flag: "🌍" },
  { code: "BD", name: "Bangladesh", flag: "🇧🇩" },
  { code: "IN", name: "India", flag: "🇮🇳" },
  { code: "PK", name: "Pakistan", flag: "🇵🇰" },
  { code: "NP", name: "Nepal", flag: "🇳🇵" },
  { code: "PH", name: "Philippines", flag: "🇵🇭" },
  { code: "ID", name: "Indonesia", flag: "🇮🇩" },
];

const Discover = () => {
  const navigate = useNavigate();
  const [rooms, setRooms, hadRoomsCache] = usePersistedCache<PartyRoom[]>('discover:rooms', []);
  const [loading, setLoading] = useState(!hadRoomsCache);
  const [refreshing, setRefreshing] = useState(false);
  const [initialLoadComplete, setInitialLoadComplete] = useState(hadRoomsCache);
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [activeTab, setActiveTab] = useState("all");
  const [selectedCountry, setSelectedCountry] = useState("all");
  const [searchQuery, setSearchQuery] = useState("");
  
  const fetchTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const fetchRoomsRef = useRef<(isInitialLoad?: boolean) => Promise<void>>(() => Promise.resolve());
  const { checkFeatureAccess } = useFeatureLevelCheck();

  // Pkg360 NO-AUTO-REFRESH: increased debounce to prevent rapid list flashes
  const debouncedFetch = useCallback(() => {
    if (fetchTimeoutRef.current) {
      clearTimeout(fetchTimeoutRef.current);
    }
    fetchTimeoutRef.current = setTimeout(() => {
      void fetchRoomsRef.current(false);
    }, 1500); // 1.5s debounce for smooth room list updates
  }, []);

  const fetchCurrentUser = async () => {
    const { getCachedUser } = await import('@/utils/cachedAuth');
    const user = await getCachedUser();
    if (user) {
      const { data: profile } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', user.id)
        .single();
      setCurrentUser({ ...user, profile });
    }
  };

  const fetchRooms = async (isInitialLoad = false) => {
    try {
      if (isInitialLoad && !initialLoadComplete) {
        setLoading(true);
      }
      
      const [participantsRes, roomsRes] = await Promise.all([
        supabase
          .from('party_room_participants')
          .select('room_id, user_id, role, joined_at')
          .is('left_at', null),
        supabase
          .from('party_rooms')
          .select(`*`)
          .eq('is_active', true),
      ]);

      if (participantsRes.error) throw participantsRes.error;
      if (roomsRes.error) throw roomsRes.error;

      // Fetch host profiles via profiles_public (RLS-safe)
      const hostIds = Array.from(new Set((roomsRes.data || []).map((r: any) => r.host_id).filter(Boolean)));
      let hostMap: Record<string, any> = {};
      if (hostIds.length > 0) {
        const { data: hosts } = await supabase
          .from('profiles_public')
          .select('id, display_name, avatar_url, user_level, host_level, country_flag, country_code, is_online, is_host, gender, total_earnings, weekly_earnings, max_user_level')
          .in('id', hostIds);
        (hosts || []).forEach((h: any) => { hostMap[h.id] = h; });
      }
      // Stitch host into room rows for downstream code
      (roomsRes.data || []).forEach((room: any) => {
        room.host = hostMap[room.host_id] || null;
      });

      const activeParticipants = participantsRes.data || [];
      const roomParticipantCounts = new Map<string, number>();
      
      activeParticipants.forEach(p => {
        const count = roomParticipantCounts.get(p.room_id) || 0;
        roomParticipantCounts.set(p.room_id, count + 1);
      });

      const activeRoomIds = new Set(
        (roomsRes.data || [])
          .filter((room: any) => room.is_active)
          .map((room: any) => room.id)
      );

      if (activeRoomIds.size === 0) {
        setRooms([]);
        setLoading(false);
        return;
      }

      // Resolve host levels once per host (no N+1 dynamic imports)
      const { resolveLevelFromTiers } = await import('@/utils/levelResolver');
      const hostLevelMap = new Map<string, number>();
      await Promise.all(
        Array.from(new Set((roomsRes.data || [])
          .filter((r: any) => activeRoomIds.has(r.id) && r.host)
          .map((r: any) => r.host as any)
          .filter(Boolean)))
          .map(async (host: any) => {
            try {
              const res = await resolveLevelFromTiers({
                id: host.id,
                user_level: host.user_level,
                host_level: host.host_level,
                is_host: host.is_host,
                gender: host.gender,
                total_recharged: host.total_recharged,
                total_earnings: host.total_earnings,
                weekly_earnings: host.weekly_earnings,
                max_user_level: host.max_user_level,
              });
              hostLevelMap.set(host.id, res.level);
            } catch {
              hostLevelMap.set(host.id, host.host_level || host.user_level || 1);
            }
          })
      );

      const roomsData = ((roomsRes.data || []) as any[])
        .filter(room => activeRoomIds.has(room.id))
        .map((room) => {
          const host = Array.isArray(room.host) ? room.host[0] : room.host;
          const resolvedHostLevel = host ? (hostLevelMap.get(host.id) ?? (host.host_level || host.user_level || 1)) : 1;
          return {
            ...room,
            host: host ? { ...host, user_level: resolvedHostLevel } : null,
            current_participants: Math.max(roomParticipantCounts.get(room.id) || 0, room.active_seats || 0, 1),
          };
        });

      const visibleRooms = roomsData
        .filter(room => room.current_participants >= 1)
        .sort((a, b) => b.current_participants - a.current_participants);

      setRooms(visibleRooms);
    } catch (error) {
      console.error('Error fetching rooms:', error);
      recordClientError({ label: "Discover.visibleRooms", message: error instanceof Error ? error.message : String(error) });
    } finally {
      if (!initialLoadComplete) {
        setInitialLoadComplete(true);
      }
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchRoomsRef.current = fetchRooms;
  });

  useEffect(() => {
    fetchCurrentUser();
    void fetchRoomsRef.current(true); // Initial load with loading indicator

    // Use universal realtime system instead of manual channels
    const unsubscribe = subscribeToTables(
      `discover-rooms-${Date.now()}`,
      ['party_rooms', 'party_room_participants'],
      () => debouncedFetch()
    );

    return () => {
      unsubscribe();
      if (fetchTimeoutRef.current) {
        clearTimeout(fetchTimeoutRef.current);
      }
    };
  }, [debouncedFetch]);

  const joinRoom = async (room: PartyRoom) => {
    if (!currentUser) {
      toast.error("Please login first");
      navigate('/auth');
      return;
    }

    const profile = currentUser.profile;
    
    // ✅ USE RESOLVED LEVEL - same as everywhere else
    const { resolveLevelFromTiers } = await import('@/utils/levelResolver');
    const resolved = await resolveLevelFromTiers({ id: currentUser.id, ...profile });
    const isFemaleHost = resolved.isFemaleHost;
    const userLevel = resolved.level;
    
    // ✅ GLOBAL LEVEL CHECK from admin panel (feature_level_requirements)
    const featureResult = checkFeatureAccess('join_party', userLevel, isFemaleHost);
    if (!featureResult.canAccess) {
      toast.error(`Level ${featureResult.requiredLevel} required! Your current level: ${featureResult.currentLevel}`);
      return;
    }
    
    // Per-room level check (set by room host)
    if (room.min_level > userLevel) {
      toast.error(`Minimum level ${room.min_level} required! Your level: ${userLevel}`);
      return;
    }

    if (room.entry_fee > 0 && (currentUser.profile?.coins || 0) < room.entry_fee) {
      toast.error("Insufficient Diamonds");
      return;
    }

    navigate(`/party/${room.id}`);
  };

  const filteredRooms = rooms.filter(room => {
    // Country filter
    if (selectedCountry !== "all") {
      if (!room.host?.country_code || room.host.country_code !== selectedCountry) return false;
    }
    // Tab filter
    if (activeTab === "video" && room.room_type !== "video") return false;
    if (activeTab === "audio" && room.room_type !== "audio") return false;
    if (activeTab === "game" && room.room_type !== "game") return false;
    // Search filter (AND, not OR)
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const name = room.name?.toLowerCase() || "";
      const host = room.host?.display_name?.toLowerCase() || "";
      if (!name.includes(q) && !host.includes(q)) return false;
    }
    return true;
  });

  // Pkg428 Phase-9 — native Glide prefetch for first-screen room host avatars.
  const nativePrefetchUrls = useMemo(
    () =>
      filteredRooms
        .slice(0, 24)
        .map((r) => {
          const a = r.host?.avatar_url;
          return a ? normalizeProfileMediaUrl(a) || a : null;
        })
        .filter((u): u is string => !!u),
    [filteredRooms]
  );
  useNativeImagePrefetch(nativePrefetchUrls);

  const getRoomTypeIcon = (type: string) => {
    switch (type) {
      case "video": return Monitor;
      case "audio": return Mic;
      case "game": return Gamepad2;
      default: return Mic;
    }
  };

  const getRoomTypeColor = (type: string) => {
    switch (type) {
      case "video": return "from-success to-success/80";
      case "audio": return "from-info to-info/80";
      case "game": return "from-primary to-secondary";
      default: return "from-muted-foreground to-muted-foreground/80";
    }
  };

  const getGameModeEmoji = (gameMode: string) => {
    const emojiMap: Record<string, string> = {
      ludo: "🎲", lucky28: "🎲", spin: "🎡", wheel: "🎡", quiz: "🧠",
      music: "🎵", love: "❤️", lucky: "⭐", truth_dare: "🎯", karaoke: "🎤",
      crash: "🚀", dice: "🎯", coinflip: "🪙", mines: "💎", hilo: "🂡", slots: "🎰", poker: "🃏",
    };
    return emojiMap[gameMode] || "🎮";
  };

  const getGameModeColor = (gameMode: string) => {
    const colorMap: Record<string, string> = {
      ludo: "from-info to-secondary", lucky28: "from-warning to-danger",
      wheel: "from-secondary to-primary", crash: "from-warning to-accent",
      dice: "from-danger to-primary", coinflip: "from-accent to-warning",
      mines: "from-info to-primary", hilo: "from-success to-success/80",
      slots: "from-secondary to-primary", poker: "from-success to-info",
      quiz: "from-success to-info",
    };
    return colorMap[gameMode] || "from-secondary to-primary";
  };

  const handleTabChange = (path: string) => {
    navigate(path);
  };

  return (
    <div className="fixed inset-0 flex flex-col bg-background overflow-y-auto overflow-x-hidden">
      {/* Header */}
      <div
        className="bg-gradient-primary pb-5 relative"
        style={{ boxShadow: '0 10px 24px -12px rgba(79,70,229,0.45)' }}
      >
        <header className="safe-area-top">
          <div className="flex items-center justify-between px-4 py-2">
            <Button
              variant="ghost"
              size="icon"
              className="rounded-full text-on-dark h-9 w-9 transition-all hover:-translate-y-0.5 active:translate-y-0"
              style={{
                background: 'rgba(255,255,255,0.14)',
                boxShadow: '0 6px 14px -6px rgba(0,0,0,0.35), inset 0 1px 0 rgba(255,255,255,0.35)',
              }}
              onClick={() => navigate(-1)}
            >
              <ArrowLeft className="w-5 h-5" />
            </Button>
            <h1
              className="text-lg font-bold text-on-dark tracking-tight"
              style={{ textShadow: '0 2px 6px rgba(0,0,0,0.28)' }}
            >
              Party Rooms
            </h1>
            <Button
              variant="ghost"
              size="icon"
              className="rounded-full text-on-dark h-9 w-9 transition-all hover:-translate-y-0.5 active:translate-y-0"
              style={{
                background: 'rgba(255,255,255,0.14)',
                boxShadow: '0 6px 14px -6px rgba(0,0,0,0.35), inset 0 1px 0 rgba(255,255,255,0.35)',
              }}
              disabled={refreshing}
              onClick={async () => {
                setRefreshing(true);
                await fetchRooms(false);
                setRefreshing(false);
                toast.success("Rooms refreshed!");
              }}
            >
              <RefreshCw className={cn("w-4 h-4", refreshing && "animate-spin")} />
            </Button>
          </div>

          {/* Search */}
          <div className="px-4 mt-1">
            <div
              className="relative rounded-full"
              style={{
                background: 'rgba(255,255,255,0.18)',
                boxShadow: 'inset 0 2px 4px rgba(0,0,0,0.18), 0 1px 0 rgba(255,255,255,0.18)',
              }}
            >
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-on-dark-faint" />
              <Input
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search rooms or hosts..."
                className="w-full pl-9 h-9 bg-transparent border-transparent text-on-dark placeholder:text-on-dark-faint rounded-full text-sm focus-visible:ring-0 focus-visible:border-transparent"
              />
            </div>
          </div>
        </header>
      </div>


      {/* Tabs */}
      <div className="px-3 mb-3 -mt-3 pt-3">
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList
            className="w-full rounded-full p-1 h-10 border-0"
            style={{
              background: 'hsl(var(--muted))',
              boxShadow: 'inset 0 2px 4px rgba(0,0,0,0.08), inset 0 -1px 0 rgba(255,255,255,0.6)',
            }}
          >
            <TabsTrigger
              value="all"
              className="flex-1 rounded-full h-8 text-xs font-semibold text-muted-foreground transition-all data-[state=active]:bg-gradient-primary data-[state=active]:text-on-dark data-[state=active]:shadow-[0_6px_14px_-6px_rgba(79,70,229,0.55),inset_0_1px_0_rgba(255,255,255,0.35)]"
            >
              All
            </TabsTrigger>
            <TabsTrigger
              value="video"
              className="flex-1 rounded-full h-8 text-xs font-semibold text-muted-foreground transition-all data-[state=active]:bg-success data-[state=active]:text-on-dark data-[state=active]:shadow-[0_6px_14px_-6px_rgba(16,185,129,0.55),inset_0_1px_0_rgba(255,255,255,0.35)]"
            >
              <Monitor className="w-3 h-3 mr-1" />
              Video
            </TabsTrigger>
            <TabsTrigger
              value="audio"
              className="flex-1 rounded-full h-8 text-xs font-semibold text-muted-foreground transition-all data-[state=active]:bg-info data-[state=active]:text-on-dark data-[state=active]:shadow-[0_6px_14px_-6px_rgba(59,130,246,0.55),inset_0_1px_0_rgba(255,255,255,0.35)]"
            >
              <Mic className="w-3 h-3 mr-1" />
              Audio
            </TabsTrigger>
            <TabsTrigger
              value="game"
              className="flex-1 rounded-full h-8 text-xs font-semibold text-muted-foreground transition-all data-[state=active]:bg-primary data-[state=active]:text-on-dark data-[state=active]:shadow-[0_6px_14px_-6px_rgba(79,70,229,0.55),inset_0_1px_0_rgba(255,255,255,0.35)]"
            >
              <Gamepad2 className="w-3 h-3 mr-1" />
              Game
            </TabsTrigger>
          </TabsList>
        </Tabs>

        {/* Country Filter */}
        <div className="mt-2 flex gap-1.5 overflow-x-auto pb-1 scrollbar-hide">
          {partyCountries.map((country) => {
            const active = selectedCountry === country.code;
            return (
              <button
                key={country.code}
                onClick={() => setSelectedCountry(country.code)}
                className={cn(
                  "flex items-center gap-1 px-3 py-1.5 rounded-full text-xs font-semibold transition-all whitespace-nowrap shrink-0",
                  active
                    ? "bg-gradient-primary text-on-dark -translate-y-px"
                    : "bg-card text-foreground hover:-translate-y-px"
                )}
                style={
                  active
                    ? { boxShadow: '0 8px 16px -6px rgba(79,70,229,0.5), inset 0 1px 0 rgba(255,255,255,0.35)' }
                    : { boxShadow: '0 2px 6px -2px rgba(15,23,42,0.12), inset 0 1px 0 rgba(255,255,255,0.6), 0 0 0 1px hsl(var(--border))' }
                }
              >
                <span className="text-sm">{country.flag}</span>
                <span>{country.name}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Scrollable Room List */}
      <NativePullToRefresh onRefresh={async () => { await fetchRooms(false); }} className="flex-1">
      <main className="h-full overflow-y-auto overscroll-contain px-3" style={{ WebkitOverflowScrolling: 'touch', paddingBottom: 'var(--content-bottom-padding)' }}>
        <div className="flex items-center justify-between mb-2 sticky top-0 bg-background/95 backdrop-blur-sm py-2 -mx-3 px-3 z-10">
          <h2 className="font-semibold text-sm text-display flex items-center gap-1.5">
            <Sparkles className="w-4 h-4 text-money" />
            Active Rooms
          </h2>
          <span className="text-xs text-muted-pro">{filteredRooms.length} rooms</span>
        </div>
        
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <div className="w-8 h-8 border-[3px] border-primary border-t-transparent rounded-full animate-spin" />
          </div>
        ) : filteredRooms.length === 0 ? (
          <div
            className="flex flex-col items-center justify-center py-16 bg-card rounded-2xl min-h-[50vh]"
            style={{ boxShadow: '0 10px 30px -16px rgba(15,23,42,0.18), inset 0 1px 0 rgba(255,255,255,0.8)' }}
          >
            <div className="relative mb-6">
              <div
                className="w-20 h-20 rounded-full bg-gradient-primary flex items-center justify-center"
                style={{ boxShadow: '0 18px 36px -14px rgba(79,70,229,0.55), inset 0 2px 0 rgba(255,255,255,0.35), inset 0 -3px 0 rgba(0,0,0,0.18)' }}
              >
                <Gamepad2 className="w-10 h-10 text-on-dark" />
              </div>
            </div>

            <h3 className="text-lg font-semibold text-display mb-2 relative z-10">No Active Rooms</h3>
            <p className="text-sm text-muted-pro text-center max-w-[220px] relative z-10">Rooms will appear when hosts start streaming!</p>

            <div className="mt-6 w-24 h-0.5 bg-gradient-to-r from-transparent via-primary/40 to-transparent rounded-full animate-pulse" />
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-2">
            <>
              {filteredRooms.map((room, index) => {
                const TypeIcon = getRoomTypeIcon(room.room_type);
                const hostLevel = room.host?.user_level || 1;
                const hostAvatar = normalizeProfileMediaUrl(room.host?.avatar_url) || room.host?.avatar_url;
                const gameEmoji = room.game_mode ? getGameModeEmoji(room.game_mode) : null;
                const gameColor = room.game_mode ? getGameModeColor(room.game_mode) : null;
                
                return (
                  <div
                    key={room.id}
                    onClick={() => joinRoom(room)}
                    className="relative rounded-2xl overflow-hidden bg-card cursor-pointer transition-all hover:-translate-y-0.5 active:scale-[0.98]"
                    style={{
                      contain: 'layout style paint',
                      boxShadow:
                        hostLevel >= 40
                          ? '0 12px 24px -10px rgba(244,63,94,0.45), 0 2px 6px -2px rgba(15,23,42,0.18), inset 0 1px 0 rgba(255,255,255,0.85)'
                          : hostLevel >= 20
                          ? '0 10px 22px -10px rgba(245,158,11,0.45), 0 2px 6px -2px rgba(15,23,42,0.16), inset 0 1px 0 rgba(255,255,255,0.85)'
                          : '0 6px 16px -8px rgba(15,23,42,0.22), 0 1px 3px -1px rgba(15,23,42,0.12), inset 0 1px 0 rgba(255,255,255,0.7)',
                    }}
                  >
                    {/* Background - Use host avatar or gradient */}
                    <div 
                      className="h-24 relative"
                      style={hostAvatar ? { 
                        backgroundImage: `url(${hostAvatar})`, 
                        backgroundSize: 'cover',
                        backgroundPosition: 'center' 
                      } : {}}
                    >
                      {!hostAvatar && (
                        <div className={cn("absolute inset-0 bg-gradient-to-br", getRoomTypeColor(room.room_type))} />
                      )}
                      
                      {/* Dark overlay */}
                      <div className="absolute inset-0 bg-gradient-to-t from-background/95 via-background/55 to-transparent" />
                      
                      {/* Room type badge & participant count */}
                      <div className="absolute top-1.5 left-1.5 right-1.5 flex items-center justify-between">
                        <Badge
                          className={cn("border-0 text-on-dark text-[10px] px-1.5 py-0.5 bg-gradient-to-r font-semibold", getRoomTypeColor(room.room_type))}
                          style={{ boxShadow: '0 4px 10px -4px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.4)' }}
                        >
                          <TypeIcon className="w-2.5 h-2.5 mr-0.5" />
                          {room.room_type}
                        </Badge>
                        <div
                          className="flex items-center gap-0.5 bg-card/90 backdrop-blur-sm px-1.5 py-0.5 rounded-full"
                          style={{ boxShadow: '0 3px 8px -3px rgba(0,0,0,0.35), inset 0 1px 0 rgba(255,255,255,0.7)' }}
                        >
                          <Users className="w-2.5 h-2.5 text-heading" />
                          <span className="text-[10px] text-heading font-semibold">{room.current_participants}</span>
                        </div>
                      </div>

                      {/* Game Mode Emoji - Show if game is running */}
                      {gameEmoji && (
                        <div className="absolute bottom-1.5 left-1.5">
                          <div
                            className={cn(
                              "w-9 h-9 rounded-xl flex items-center justify-center text-lg bg-gradient-to-br",
                              gameColor
                            )}
                            style={{ boxShadow: '0 8px 18px -6px rgba(0,0,0,0.45), inset 0 1px 0 rgba(255,255,255,0.45), inset 0 -2px 0 rgba(0,0,0,0.15)' }}
                          >
                            {gameEmoji}
                          </div>
                        </div>
                      )}

                      {/* Lock icon */}
                      {room.is_private && (
                        <div className="absolute bottom-1.5 right-1.5">
                          <div
                            className="w-6 h-6 rounded-full bg-card/95 backdrop-blur-sm flex items-center justify-center"
                            style={{ boxShadow: '0 4px 10px -3px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.7)' }}
                          >
                            <Lock className="w-3 h-3 text-money" />
                          </div>
                        </div>
                      )}
                    </div>


                    {/* Room info with host avatar */}
                    <div className="p-2 bg-card">
                      {/* Room name */}
                      <h3 className="font-semibold text-display truncate text-xs mb-1.5">{room.name}</h3>
                      
                      {/* Host info - avatar + level badge on right */}
                      <div className="flex items-center gap-1.5">
                        {/* Small Avatar with level frame */}
                        <div className="relative flex-shrink-0">
                          <div
                            className={cn(
                              "rounded-full p-0.5 bg-gradient-to-br",
                              hostLevel >= 40 ? "from-danger to-warning" :
                              hostLevel >= 20 ? "from-warning to-accent" :
                              hostLevel >= 10 ? "from-secondary to-primary" :
                              hostLevel >= 5 ? "from-info to-primary" :
                              "from-muted-foreground to-muted-foreground/70"
                            )}
                            style={{
                              boxShadow:
                                hostLevel >= 20
                                  ? '0 4px 10px -3px rgba(245,158,11,0.5), inset 0 1px 0 rgba(255,255,255,0.4)'
                                  : '0 2px 6px -2px rgba(15,23,42,0.25), inset 0 1px 0 rgba(255,255,255,0.4)',
                            }}
                          >
                            <Avatar className="w-7 h-7 border-2 border-card">
                              <AvatarImage src={hostAvatar || undefined} />
                              <AvatarFallback className="bg-gradient-primary text-on-dark text-[9px]">
                                {room.host?.display_name?.charAt(0) || 'H'}
                              </AvatarFallback>
                            </Avatar>
                          </div>
                        </div>
                        
                        {/* Level badge - on right of avatar */}
                        <LevelBadge 
                          level={hostLevel} 
                          size="sm" 
                          showIcon={true}
                          className="text-[9px] px-1.5 py-0.5"
                        />
                        
                        {/* Country flag */}
                        {room.host?.country_flag && (
                          <span className="text-xs ml-auto">{room.host.country_flag}</span>
                        )}
                      </div>

                      {/* Entry fee if any */}
                      {room.entry_fee > 0 && (
                        <div className="mt-1">
                          <Badge variant="outline" className="text-[9px] px-1 py-0 text-money border-accent/40">
                            💰 {room.entry_fee}
                          </Badge>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </>
          </div>
        )}
      </main>
      </NativePullToRefresh>

      <BottomNavigation 
        activeTab="/discover" 
        onTabChange={handleTabChange} 
      />
    </div>
  );
};

export default Discover;
