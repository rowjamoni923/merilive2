import { useState, useEffect, useCallback, useRef } from "react";
import { getSessionCache, setSessionCache } from "@/hooks/useSessionCache";
import { NativePullToRefresh } from "@/components/common/NativePullToRefresh";
import { subscribeToTables } from "@/hooks/useUniversalRealtime";
import { useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { 
  ArrowLeft, 
  Users, 
  Gamepad2, 
  Lock, 
  Monitor,
  Mic,
  Search,
  Sparkles,
  RefreshCw,
  Globe
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
  
  const [lastUpdate, setLastUpdate] = useState<Date>(new Date());
  const fetchTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const { checkFeatureAccess } = useFeatureLevelCheck();

  // Debounced fetch to prevent too many calls - reduced delay for faster response
  const debouncedFetch = useCallback(() => {
    if (fetchTimeoutRef.current) {
      clearTimeout(fetchTimeoutRef.current);
    }
    fetchTimeoutRef.current = setTimeout(() => {
      fetchRooms(false);
    }, 100);
  }, []);

  useEffect(() => {
    fetchCurrentUser();
    fetchRooms(true); // Initial load with loading indicator

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
          .select(`*, host:profiles!party_rooms_host_id_fkey(id, display_name, avatar_url, user_level, host_level, country_flag, country_code, is_online, is_host, gender, total_recharged, total_earnings, weekly_earnings, max_user_level)`)
          .eq('is_active', true)
          .gte('created_at', twoHoursAgo),
      ]);

      if (participantsRes.error) throw participantsRes.error;
      if (roomsRes.error) throw roomsRes.error;

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
        setLastUpdate(new Date());
        return;
      }

      const roomsData = await Promise.all(
        ((roomsRes.data || []) as any[])
          .filter(room => activeRoomIds.has(room.id))
          .map(async (room) => {
            const host = Array.isArray(room.host) ? room.host[0] : room.host;
            const resolvedHostLevel = host
              ? (await import('@/utils/levelResolver')).resolveLevelFromTiers({
                  id: host.id,
                  user_level: host.user_level,
                  host_level: host.host_level,
                  is_host: host.is_host,
                  gender: host.gender,
                  total_recharged: host.total_recharged,
                  total_earnings: host.total_earnings,
                  weekly_earnings: host.weekly_earnings,
                  max_user_level: host.max_user_level,
                }).then(result => result.level).catch(() => host.host_level || host.user_level || 1)
              : 1;

            return {
              ...room,
              host: host ? { ...host, user_level: resolvedHostLevel } : null,
              current_participants: roomParticipantCounts.get(room.id) || 1,
            };
          })
      );

      const visibleRooms = roomsData
        .filter(room => room.current_participants >= 1)
        .sort((a, b) => b.current_participants - a.current_participants);

      setRooms(visibleRooms);
      setSessionCache('discover-rooms', visibleRooms);
      setLastUpdate(new Date());
    } catch (error) {
      console.error('Error fetching rooms:', error);
    } finally {
      if (!initialLoadComplete) {
        setInitialLoadComplete(true);
      }
      setLoading(false);
    }
  };

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
      toast.error("Insufficient coins");
      return;
    }

    navigate(`/party/${room.id}`);
  };

  const filteredRooms = rooms.filter(room => {
    // Country filter
    if (selectedCountry !== "all") {
      if (!room.host?.country_code || room.host.country_code !== selectedCountry) return false;
    }
    // Search filter
    if (searchQuery) {
      return room.name.toLowerCase().includes(searchQuery.toLowerCase());
    }
    // Tab filter
    if (activeTab === "all") return true;
    if (activeTab === "video") return room.room_type === "video";
    if (activeTab === "audio") return room.room_type === "audio";
    if (activeTab === "game") return room.room_type === "game";
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
      case "video": return "from-green-500 to-emerald-600";
      case "audio": return "from-blue-500 to-cyan-600";
      case "game": return "from-pink-500 to-rose-600";
      default: return "from-gray-500 to-gray-600";
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
      ludo: "from-blue-500 to-purple-600", lucky28: "from-orange-500 to-red-600",
      wheel: "from-violet-500 to-purple-600", crash: "from-yellow-500 to-amber-600",
      dice: "from-rose-500 to-pink-600", coinflip: "from-amber-500 to-yellow-600",
      mines: "from-cyan-500 to-blue-600", hilo: "from-emerald-500 to-green-600",
      slots: "from-fuchsia-500 to-pink-600", poker: "from-green-500 to-teal-600",
      quiz: "from-green-500 to-teal-600",
    };
    return colorMap[gameMode] || "from-purple-500 to-pink-600";
  };

  const handleTabChange = (path: string) => {
    navigate(path);
  };

  return (
    <div className="fixed inset-0 flex flex-col bg-background overflow-y-auto overflow-x-hidden">
      {/* Header */}
      <div className="bg-gradient-to-r from-purple-600 via-pink-500 to-purple-600 pb-5">
        <header className="safe-area-top">
          <div className="flex items-center justify-between px-4 py-2">
            <Button
              variant="ghost"
              size="icon"
              className="rounded-full text-white hover:bg-white/20 h-8 w-8"
              onClick={() => navigate(-1)}
            >
              <ArrowLeft className="w-5 h-5" />
            </Button>
            <h1 className="text-lg font-bold text-white">Party Rooms</h1>
            <Button
              variant="ghost"
              size="icon"
              className="rounded-full text-white hover:bg-white/20 h-8 w-8"
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
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/50" />
              <Input
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search rooms..."
                className="w-full pl-9 h-9 bg-white/20 border-white/30 text-white placeholder:text-white/50 rounded-full text-sm"
              />
            </div>
          </div>
        </header>
      </div>


      {/* Tabs */}
      <div className="px-3 mb-3 -mt-3 pt-3">
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="w-full bg-card/80 backdrop-blur-sm rounded-full p-0.5 shadow-sm border border-border h-9">
            <TabsTrigger value="all" className="flex-1 rounded-full h-8 text-xs data-[state=active]:bg-gradient-to-r data-[state=active]:from-purple-500 data-[state=active]:to-pink-500 data-[state=active]:text-white">
              All
            </TabsTrigger>
            <TabsTrigger value="video" className="flex-1 rounded-full h-8 text-xs data-[state=active]:bg-gradient-to-r data-[state=active]:from-green-500 data-[state=active]:to-emerald-500 data-[state=active]:text-white">
              <Monitor className="w-3 h-3 mr-1" />
              Video
            </TabsTrigger>
            <TabsTrigger value="audio" className="flex-1 rounded-full h-8 text-xs data-[state=active]:bg-gradient-to-r data-[state=active]:from-blue-500 data-[state=active]:to-cyan-500 data-[state=active]:text-white">
              <Mic className="w-3 h-3 mr-1" />
              Audio
            </TabsTrigger>
            <TabsTrigger value="game" className="flex-1 rounded-full h-8 text-xs data-[state=active]:bg-gradient-to-r data-[state=active]:from-pink-500 data-[state=active]:to-rose-500 data-[state=active]:text-white">
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
                "flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium transition-all whitespace-nowrap shrink-0",
                selectedCountry === country.code
                  ? "bg-gradient-to-r from-pink-500 to-purple-500 text-white shadow-lg"
                  : "bg-white/10 text-muted-foreground hover:bg-white/20 hover:text-foreground"
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
          <h2 className="font-semibold text-sm text-foreground flex items-center gap-1.5">
            <Sparkles className="w-4 h-4 text-amber-500" />
            Active Rooms
          </h2>
          <span className="text-xs text-muted-foreground">{filteredRooms.length} rooms</span>
        </div>
        
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <div className="w-8 h-8 border-3 border-purple-500 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : filteredRooms.length === 0 ? (
          <div 
            className="flex flex-col items-center justify-center py-16 bg-gradient-to-b from-card to-background rounded-2xl shadow-sm border border-border min-h-[50vh]"
          >
            {/* Static Icon */}
            <div className="relative mb-6">
              <div className="w-20 h-20 rounded-full bg-gradient-to-br from-purple-500/20 via-pink-500/20 to-blue-500/20 flex items-center justify-center border border-white/10">
                <Gamepad2 className="w-10 h-10 text-purple-400" />
              </div>
            </div>
            
            <h3 className="text-lg font-semibold text-foreground mb-2 relative z-10">No Active Rooms</h3>
            <p className="text-sm text-muted-foreground text-center max-w-[200px] relative z-10">Rooms will appear when hosts start streaming!</p>
            
            <div className="mt-6 w-24 h-0.5 bg-gradient-to-r from-transparent via-purple-500/40 to-transparent rounded-full animate-pulse" />
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
                    className="relative rounded-xl overflow-hidden bg-card shadow cursor-pointer active:scale-[0.98] transition-transform border border-border"
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
                      <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/30 to-black/40" />
                      
                      {/* Room type badge & participant count */}
                      <div className="absolute top-1.5 left-1.5 right-1.5 flex items-center justify-between">
                        <Badge className={cn("border-0 text-white text-[10px] px-1.5 py-0.5 bg-gradient-to-r", getRoomTypeColor(room.room_type))}>
                          <TypeIcon className="w-2.5 h-2.5 mr-0.5" />
                          {room.room_type}
                        </Badge>
                        <div className="flex items-center gap-0.5 bg-black/60 backdrop-blur-sm px-1.5 py-0.5 rounded-full">
                          <Users className="w-2.5 h-2.5 text-white" />
                          <span className="text-[10px] text-white font-medium">{room.current_participants}</span>
                        </div>
                      </div>

                      {/* Game Mode Emoji - Show if game is running */}
                      {gameEmoji && (
                        <div className="absolute bottom-1.5 left-1.5">
                          <div className={cn(
                            "w-8 h-8 rounded-lg flex items-center justify-center text-lg shadow-lg border border-white/20 bg-gradient-to-br",
                            gameColor
                          )}>
                            {gameEmoji}
                          </div>
                        </div>
                      )}

                      {/* Lock icon */}
                      {room.is_private && (
                        <div className="absolute bottom-1.5 right-1.5">
                          <div className="w-5 h-5 rounded-full bg-black/60 backdrop-blur-sm flex items-center justify-center">
                            <Lock className="w-2.5 h-2.5 text-yellow-400" />
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Room info with host avatar */}
                    <div className="p-2 bg-card">
                      {/* Room name */}
                      <h3 className="font-semibold text-foreground truncate text-xs mb-1.5">{room.name}</h3>
                      
                      {/* Host info - avatar + level badge on right */}
                      <div className="flex items-center gap-1.5">
                        {/* Small Avatar with level frame */}
                        <div className="relative flex-shrink-0">
                          <div className={cn(
                            "rounded-full p-0.5 bg-gradient-to-br",
                            hostLevel >= 40 ? "from-red-400 to-orange-500" :
                            hostLevel >= 20 ? "from-amber-400 to-yellow-500" :
                            hostLevel >= 10 ? "from-purple-400 to-pink-500" :
                            hostLevel >= 5 ? "from-blue-400 to-cyan-500" :
                            "from-gray-400 to-gray-500"
                          )}>
                            <Avatar className="w-6 h-6 border border-background">
                              <AvatarImage src={hostAvatar || undefined} />
                              <AvatarFallback className="bg-gradient-to-br from-purple-400 to-pink-400 text-white text-[8px]">
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
                          <Badge variant="outline" className="text-[9px] px-1 py-0 text-amber-500 border-amber-500/30">
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
