import { useState, useEffect, useCallback, useRef } from "react";
import { getSessionCache, setSessionCache } from "@/hooks/useSessionCache";
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
  const [rooms, setRooms] = useState<PartyRoom[]>(() => getSessionCache<PartyRoom[]>('discover-rooms') ?? []);
  const [loading, setLoading] = useState(() => !getSessionCache('discover-rooms'));
  const [refreshing, setRefreshing] = useState(false);
  const [initialLoadComplete, setInitialLoadComplete] = useState(() => !!getSessionCache('discover-rooms'));
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [activeTab, setActiveTab] = useState("all");
  const [selectedCountry, setSelectedCountry] = useState("all");
  const [searchQuery, setSearchQuery] = useState("");
  
  const fetchTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const fetchRoomsRef = useRef<(isInitialLoad?: boolean) => Promise<void>>(() => Promise.resolve());
  const { checkFeatureAccess } = useFeatureLevelCheck();

  // Debounced fetch to prevent too many calls - reduced delay for faster response
  const debouncedFetch = useCallback(() => {
    if (fetchTimeoutRef.current) {
      clearTimeout(fetchTimeoutRef.current);
    }
    fetchTimeoutRef.current = setTimeout(() => {
      void fetchRoomsRef.current(false);
    }, 100);
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
      
      const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
      
      const [participantsRes, roomsRes] = await Promise.all([
        supabase
          .from('party_room_participants')
          .select('room_id, user_id, role, joined_at')
          .is('left_at', null)
          .gte('joined_at', twoHoursAgo),
        supabase
          .from('party_rooms')
          .select(`*`)
          .eq('is_active', true)
          .gte('created_at', twoHoursAgo),
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
      const roomsWithHost = new Set<string>();
      
      activeParticipants.forEach(p => {
        const count = roomParticipantCounts.get(p.room_id) || 0;
        roomParticipantCounts.set(p.room_id, count + 1);
        if (p.role === 'host') roomsWithHost.add(p.room_id);
      });

      const activeRoomIds = new Set(
        (roomsRes.data || [])
          .filter((room: any) => room.is_active)
          .filter((room: any) => {
            const participantCount = roomParticipantCounts.get(room.id) || 0;
            return participantCount > 0 || roomsWithHost.has(room.id);
          })
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
            current_participants: roomParticipantCounts.get(room.id) || 1,
          };
        });

      const visibleRooms = roomsData
        .filter(room => room.current_participants >= 1)
        .sort((a, b) => b.current_participants - a.current_participants);

      setRooms(visibleRooms);
      setSessionCache('discover-rooms', visibleRooms);
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
      <div className="bg-gradient-primary pb-5">
        <header className="safe-area-top">
          <div className="flex items-center justify-between px-4 py-2">
            <Button
              variant="ghost"
              size="icon"
              className="rounded-full text-on-dark hover:bg-primary-foreground/20 h-8 w-8"
              onClick={() => navigate(-1)}
            >
              <ArrowLeft className="w-5 h-5" />
            </Button>
            <h1 className="text-lg font-bold text-on-dark">Party Rooms</h1>
            <Button
              variant="ghost"
              size="icon"
              className="rounded-full text-on-dark hover:bg-primary-foreground/20 h-8 w-8"
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
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-on-dark-faint" />
              <Input
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search rooms or hosts..."
                className="w-full pl-9 h-9 bg-primary-foreground/20 border-primary-foreground/30 text-on-dark placeholder:text-on-dark-faint rounded-full text-sm"
              />
            </div>
          </div>
        </header>
      </div>


      {/* Tabs */}
      <div className="px-3 mb-3 -mt-3 pt-3">
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="w-full bg-muted rounded-full p-0.5 border border-border h-9">
            <TabsTrigger value="all" className="flex-1 rounded-full h-8 text-xs text-muted-foreground data-[state=active]:bg-gradient-primary data-[state=active]:text-on-dark">
              All
            </TabsTrigger>
            <TabsTrigger value="video" className="flex-1 rounded-full h-8 text-xs text-muted-foreground data-[state=active]:bg-success data-[state=active]:text-on-dark">
              <Monitor className="w-3 h-3 mr-1" />
              Video
            </TabsTrigger>
            <TabsTrigger value="audio" className="flex-1 rounded-full h-8 text-xs text-muted-foreground data-[state=active]:bg-info data-[state=active]:text-on-dark">
              <Mic className="w-3 h-3 mr-1" />
              Audio
            </TabsTrigger>
            <TabsTrigger value="game" className="flex-1 rounded-full h-8 text-xs text-muted-foreground data-[state=active]:bg-primary data-[state=active]:text-on-dark">
              <Gamepad2 className="w-3 h-3 mr-1" />
              Game
            </TabsTrigger>
          </TabsList>
        </Tabs>

        {/* Country Filter */}
        <div className="mt-2 flex gap-1.5 overflow-x-auto pb-1 scrollbar-hide">
          {partyCountries.map((country) => (
            <button
              key={country.code}
              onClick={() => setSelectedCountry(country.code)}
              className={cn(
                "flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium transition-all whitespace-nowrap shrink-0 border",
                selectedCountry === country.code
                  ? "bg-gradient-primary text-on-dark border-transparent shadow-md shadow-brand/20"
                  : "bg-card text-foreground border-border hover:border-muted-foreground/30"
              )}
            >
              <span className="text-sm">{country.flag}</span>
              <span>{country.name}</span>
            </button>
          ))}
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
            className="flex flex-col items-center justify-center py-16 bg-card rounded-2xl shadow-sm border border-border min-h-[50vh]"
          >
            {/* Static Icon */}
            <div className="relative mb-6">
              <div className="w-20 h-20 rounded-full bg-gradient-primary flex items-center justify-center border border-border/50">
                <Gamepad2 className="w-10 h-10 text-on-dark" />
              </div>
            </div>
            
            <h3 className="text-lg font-semibold text-display mb-2 relative z-10">No Active Rooms</h3>
            <p className="text-sm text-muted-pro text-center max-w-[200px] relative z-10">Rooms will appear when hosts start streaming!</p>
            
            <div className="mt-6 w-24 h-0.5 bg-gradient-to-r from-transparent via-primary/40 to-transparent rounded-full animate-pulse" />
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-2">
            <>
              {filteredRooms.map((room, index) => {
                const TypeIcon = getRoomTypeIcon(room.room_type);
                const hostLevel = room.host?.user_level || 1;
                const hostAvatar = room.host?.avatar_url;
                const gameEmoji = room.game_mode ? getGameModeEmoji(room.game_mode) : null;
                const gameColor = room.game_mode ? getGameModeColor(room.game_mode) : null;
                
                return (
                  <div
                    key={room.id}
                    onClick={() => joinRoom(room)}
                    className="relative rounded-xl overflow-hidden bg-card cursor-pointer active:scale-[0.98] transition-transform border border-border shadow-sm"
                    style={{ contain: 'layout style paint' }}
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
                        <Badge className={cn("border-0 text-on-dark text-[10px] px-1.5 py-0.5 bg-gradient-to-r", getRoomTypeColor(room.room_type))}>
                          <TypeIcon className="w-2.5 h-2.5 mr-0.5" />
                          {room.room_type}
                        </Badge>
                        <div className="flex items-center gap-0.5 bg-card/85 backdrop-blur-sm px-1.5 py-0.5 rounded-full border border-border/60">
                          <Users className="w-2.5 h-2.5 text-heading" />
                          <span className="text-[10px] text-heading font-medium">{room.current_participants}</span>
                        </div>
                      </div>

                      {/* Game Mode Emoji - Show if game is running */}
                      {gameEmoji && (
                        <div className="absolute bottom-1.5 left-1.5">
                          <div className={cn(
                            "w-8 h-8 rounded-lg flex items-center justify-center text-lg shadow-lg border border-accent/40 bg-gradient-to-br",
                            gameColor
                          )}>
                            {gameEmoji}
                          </div>
                        </div>
                      )}

                      {/* Lock icon */}
                      {room.is_private && (
                        <div className="absolute bottom-1.5 right-1.5">
                          <div className="w-5 h-5 rounded-full bg-card/85 backdrop-blur-sm flex items-center justify-center border border-border/60">
                            <Lock className="w-2.5 h-2.5 text-money" />
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
                          <div className={cn(
                            "rounded-full p-0.5 bg-gradient-to-br",
                            hostLevel >= 40 ? "from-danger to-warning" :
                            hostLevel >= 20 ? "from-warning to-accent" :
                            hostLevel >= 10 ? "from-secondary to-primary" :
                            hostLevel >= 5 ? "from-info to-primary" :
                            "from-muted-foreground to-muted-foreground/70"
                          )}>
                            <Avatar className="w-6 h-6 border border-card">
                              <AvatarImage src={hostAvatar || undefined} />
                              <AvatarFallback className="bg-gradient-primary text-on-dark text-[8px]">
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
