import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { useNativeImagePrefetch } from "@/hooks/useNativeImagePrefetch";
import { usePersistedCache } from "@/hooks/usePersistedCache";
import { NativePullToRefresh } from "@/components/common/NativePullToRefresh";
import { subscribeToTables } from "@/hooks/useUniversalRealtime";
import { useNavigate } from "react-router-dom";

import { ArrowLeft, Users, Gamepad2, Lock, Monitor, Mic, Search, Sparkles, RefreshCw, X, Hash, Diamond, ShieldAlert, ChevronRight, KeyRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import AvatarWithFrame from "@/components/common/AvatarWithFrame";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { PrewarmDiv } from "@/components/live/PrewarmDiv";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { BottomNavigation } from "@/components/layout/BottomNavigation";
import { LevelBadge } from "@/components/common/LevelBadge";
import { useFeatureLevelCheck } from "@/hooks/useFeatureLevelCheck";
import { recordClientError } from "@/utils/clientErrorLog";
import { normalizeProfileMediaUrl } from "@/utils/profileMediaUrl";
import { cdnAvatar } from "@/lib/cdnImage";
import { getRequiredDisplayLevel } from "@/utils/stableLevel";

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
  mood: string | null;
  description: string | null;
  welcome_message: string | null;
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
  const [refreshing, setRefreshing] = useState(false);
  const [initialLoadComplete, setInitialLoadComplete] = useState(hadRoomsCache);
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [activeTab, setActiveTab] = useState("all");
  const [selectedCountry, setSelectedCountry] = useState("all");
  const [searchQuery, setSearchQuery] = useState("");
  // PR-2.5: preview-before-enter dialog state for ALL rooms (Chamet/Bigo pattern).
  const [entryPreview, setEntryPreview] = useState<PartyRoom | null>(null);
  // PR-2.5: dedicated room-code quick-join dialog.
  const [roomCodeDialogOpen, setRoomCodeDialogOpen] = useState(false);
  const [roomCodeInput, setRoomCodeInput] = useState("");
  const [joiningByCode, setJoiningByCode] = useState(false);
  
  const fetchTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const fetchRoomsRef = useRef<() => Promise<void>>(() => Promise.resolve());
  const { checkFeatureAccess } = useFeatureLevelCheck();

  // Pkg360 NO-AUTO-REFRESH: increased debounce to prevent rapid list flashes
  const debouncedFetch = useCallback(() => {
    if (fetchTimeoutRef.current) {
      clearTimeout(fetchTimeoutRef.current);
    }
    fetchTimeoutRef.current = setTimeout(() => {
      void fetchRoomsRef.current();
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

  const fetchRooms = async () => {
    try {
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
              hostLevelMap.set(host.id, getRequiredDisplayLevel(host));
            }
          })
      );

      const roomsData = ((roomsRes.data || []) as any[])
        .filter(room => activeRoomIds.has(room.id))
        .map((room) => {
          const host = Array.isArray(room.host) ? room.host[0] : room.host;
          const resolvedHostLevel = host ? (hostLevelMap.get(host.id) ?? getRequiredDisplayLevel(host)) : 1;
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
    }
  };

  useEffect(() => {
    fetchRoomsRef.current = fetchRooms;
  });

  useEffect(() => {
    fetchCurrentUser();
    void fetchRoomsRef.current();

    // Universal realtime (debounced refetch for adds / participant changes).
    const unsubscribe = subscribeToTables(
      'discover-rooms',
      ['party_rooms', 'party_room_participants'],
      () => debouncedFetch()
    );

    // Instant-close: subscribe directly to party_rooms UPDATE so a host
    // ending their room removes the card immediately (no 1.5s debounce wait).
    const instantCloseChannel = supabase
      .channel(`discover-instant-close-${Math.random().toString(36).slice(2)}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'party_rooms' },
        (payload: any) => {
          const row = payload?.new;
          if (!row) return;
          if (row.is_active === false || row.ended_at) {
            setRooms((prev) => prev.filter((r) => r.id !== row.id));
          }
        }
      )
      .subscribe();

    return () => {
      unsubscribe();
      supabase.removeChannel(instantCloseChannel);
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

    if (room.entry_fee > 0 && (currentUser.profile?.diamonds || 0) < room.entry_fee) {
      toast.error("Insufficient Diamonds");
      return;
    }

    // Instant-join: navigate straight into the room (Bigo/Chamet pattern).
    // Removed pre-entry preview dialog per user request.
    navigate(`/party/${room.id}`);
  };

  const handleJoinFromPreview = () => {
    if (!entryPreview) return;
    const target = entryPreview.id;
    setEntryPreview(null);
    navigate(`/party/${target}`);
  };

  // PR-2.5: dedicated room-code quick-join (Bigo/Chamet style).
  const joinByRoomCode = async () => {
    const code = roomCodeInput.trim().toUpperCase();
    if (!code || code.length < 4) {
      toast.error("Enter a valid room code (4+ characters)");
      return;
    }
    setJoiningByCode(true);
    try {
      const { data, error } = await supabase
        .from('party_rooms')
        .select('*')
        .eq('room_code', code)
        .eq('is_active', true)
        .maybeSingle();
      if (error) throw error;
      if (!data) {
        toast.error("No active room found with that code");
        return;
      }
      // Fetch host profile
      const { data: host } = await supabase
        .from('profiles_public')
        .select('id, display_name, avatar_url, user_level, host_level, country_flag, country_code')
        .eq('id', data.host_id)
        .single();
      const room: PartyRoom = {
        ...data,
        host: host || null,
        current_participants: 0,
        is_private: !!data.password_hash,
      } as PartyRoom;
      setRoomCodeDialogOpen(false);
      setRoomCodeInput("");
      // Run same join flow (checks + preview)
      await joinRoom(room);
    } catch (e: any) {
      toast.error(e.message || "Failed to find room");
    } finally {
      setJoiningByCode(false);
    }
  };


  const filteredRooms = useMemo(() => {
    const list = rooms.filter(room => {
      // Country filter
      if (selectedCountry !== "all") {
        if (!room.host?.country_code || room.host.country_code !== selectedCountry) return false;
      }
      // Tab filter
      if (activeTab === "video" && room.room_type !== "video") return false;
      if (activeTab === "audio" && room.room_type !== "audio") return false;
      if (activeTab === "game" && room.room_type !== "game") return false;
      // Search filter (AND, not OR). PR-2.5: also match by room_code.
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const name = room.name?.toLowerCase() || "";
        const host = room.host?.display_name?.toLowerCase() || "";
        const code = room.room_code?.toLowerCase() || "";
        if (!name.includes(q) && !host.includes(q) && !code.includes(q)) return false;
      }
      return true;
    });
    // PR-2.5: when searching by code, exact matches float to top.
    const q = searchQuery.trim().toLowerCase();
    if (q && q.length >= 4) {
      return list.sort((a, b) => {
        const aExact = a.room_code?.toLowerCase() === q ? 1 : 0;
        const bExact = b.room_code?.toLowerCase() === q ? 1 : 0;
        if (aExact !== bExact) return bExact - aExact;
        return b.current_participants - a.current_participants;
      });
    }
    return list.sort((a, b) => b.current_participants - a.current_participants);
  }, [rooms, selectedCountry, activeTab, searchQuery]);


  // Pkg428 Phase-9 — native Glide prefetch for first-screen room host avatars.
  const nativePrefetchUrls = useMemo(
    () =>
      filteredRooms
        .slice(0, 24)
        .map((r) => {
          const a = r.host?.avatar_url;
          const full = a ? (normalizeProfileMediaUrl(a) || a) : null;
          // Prefetch the SAME CDN-resized URL the card renders, so cache hits.
          return full ? (cdnAvatar(full, 180, 80) || full) : null;
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
      crash: "🚀", dice: "🎯", toss_match: "⚖️", mines: "💎", hilo: "🂡", slots: "🎰", poker: "🃏",
    };
    return emojiMap[gameMode] || "🎮";
  };

  const getGameModeColor = (gameMode: string) => {
    const colorMap: Record<string, string> = {
      ludo: "from-info to-secondary", lucky28: "from-warning to-danger",
      wheel: "from-secondary to-primary", crash: "from-warning to-accent",
      dice: "from-danger to-primary", toss_match: "from-accent to-warning",
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
    <div data-page="discover" className="fixed inset-0 flex flex-col bg-background overflow-hidden">
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
                await fetchRooms();
                setRefreshing(false);
                toast.success("Rooms refreshed!");
              }}
            >
              <RefreshCw className={cn("w-4 h-4", refreshing && "animate-spin")} />
            </Button>
          </div>

          {/* Search + Room Code Quick-Join */}
          <div className="px-4 mt-1 flex items-center gap-2">
            <div
              className="relative flex-1 rounded-full"
              style={{
                background: 'rgba(255,255,255,0.18)',
                boxShadow: 'inset 0 2px 4px rgba(0,0,0,0.18), 0 1px 0 rgba(255,255,255,0.18)',
              }}
            >
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-on-dark-faint" />
              <Input
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search rooms, hosts, or code..."
                className="w-full pl-9 pr-8 h-9 bg-transparent border-transparent text-on-dark placeholder:text-on-dark-faint rounded-full text-sm focus-visible:ring-0 focus-visible:border-transparent"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery("")}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-on-dark-faint hover:text-on-dark"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
            <Button
              size="icon"
              className="rounded-full h-9 w-9 shrink-0 text-on-dark"
              style={{
                background: 'rgba(255,255,255,0.22)',
                boxShadow: '0 6px 14px -6px rgba(0,0,0,0.35), inset 0 1px 0 rgba(255,255,255,0.35)',
              }}
              onClick={() => setRoomCodeDialogOpen(true)}
              title="Join by room code"
            >
              <KeyRound className="w-4 h-4" />
            </Button>
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
      <NativePullToRefresh onRefresh={async () => { await fetchRooms(); }} className="flex-1 min-h-0 flex flex-col">
      <main className="flex-1 min-h-0 overflow-y-auto overscroll-contain px-3" style={{ WebkitOverflowScrolling: 'touch', paddingBottom: 'var(--content-bottom-padding)' }}>

        <div className="flex items-center justify-between mb-2 sticky top-0 bg-background/95 backdrop-blur-sm py-2 -mx-3 px-3 z-10">
          <h2 className="font-semibold text-sm text-display flex items-center gap-1.5">
            <Sparkles className="w-4 h-4 text-money" />
            Active Rooms
          </h2>
          <span className="text-xs text-muted-pro">{filteredRooms.length} rooms</span>
        </div>
        
        {filteredRooms.length === 0 ? (
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
                const hostLevel = getRequiredDisplayLevel(room.host);
                const hostAvatarFull = normalizeProfileMediaUrl(room.host?.avatar_url) || room.host?.avatar_url;
                // Card thumbnail is ~170×96 dp — CDN-resize to 360px to save 2G/3G bandwidth.
                // Same visual at 2× DPR, ~70% smaller download.
                const hostAvatar = hostAvatarFull
                  ? (cdnAvatar(hostAvatarFull, 180, 80) || hostAvatarFull)
                  : null;
                const gameEmoji = room.game_mode ? getGameModeEmoji(room.game_mode) : null;
                const gameColor = room.game_mode ? getGameModeColor(room.game_mode) : null;
                
                return (
                  <PrewarmDiv
                    key={room.id}
                    roomName={`party_${room.id}`}
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
                            <AvatarWithFrame
                              userId={room.host?.id}
                              src={hostAvatar || undefined}
                              name={room.host?.display_name || 'H'}
                              level={hostLevel}
                              size="xs"
                              showFrame={true}
                              showAnimation={false}
                            />
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

                      {/* Entry fee & room code */}
                      <div className="mt-1 flex items-center gap-1.5 flex-wrap">
                        {room.entry_fee > 0 && (
                          <Badge variant="outline" className="text-[9px] px-1 py-0 text-money border-accent/40">
                            <Diamond className="w-2.5 h-2.5 mr-0.5" />
                            {room.entry_fee}
                          </Badge>
                        )}
                        {room.room_code && (
                          <Badge variant="outline" className="text-[9px] px-1 py-0 text-info border-info/40">
                            <Hash className="w-2.5 h-2.5 mr-0.5" />
                            {room.room_code}
                          </Badge>
                        )}
                      </div>
                    </div>
                  </PrewarmDiv>
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

      {/* PR-2.5 — Rich preview-before-enter for ALL rooms (Chamet/Bigo pattern). */}
      <Dialog open={!!entryPreview} onOpenChange={(open) => { if (!open) setEntryPreview(null); }}>
        <DialogContent className="sm:max-w-sm p-0 overflow-hidden gap-0">
          {entryPreview && (
            <>
              {/* Hero image / background */}
              <div className="relative h-40">
                {(entryPreview.background_url || entryPreview.host?.avatar_url) ? (
                  <img
                    src={cdnAvatar(normalizeProfileMediaUrl(entryPreview.background_url || entryPreview.host?.avatar_url) || (entryPreview.background_url || entryPreview.host?.avatar_url) || '', 400, 82) || normalizeProfileMediaUrl(entryPreview.background_url || entryPreview.host?.avatar_url) || undefined}
                    alt=""
                    loading="eager"
                    decoding="sync"
                    // @ts-expect-error – fetchpriority is a standard HTML hint
                    fetchpriority="high"
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div className={cn("w-full h-full bg-gradient-to-br", getRoomTypeColor(entryPreview.room_type))} />
                )}
                <div className="absolute inset-0 bg-gradient-to-t from-background via-background/60 to-transparent" />
                
                {/* Top badges */}
                <div className="absolute top-3 left-3 right-3 flex items-center justify-between">
                  <Badge className={cn("border-0 text-on-dark text-[10px] bg-gradient-to-r", getRoomTypeColor(entryPreview.room_type))}>
                    {(() => { const Icon = getRoomTypeIcon(entryPreview.room_type); return <Icon className="w-3 h-3 mr-1" />; })()}
                    {entryPreview.room_type}
                  </Badge>
                  {entryPreview.is_private && (
                    <Badge variant="secondary" className="text-[10px] bg-card/90 backdrop-blur-sm">
                      <Lock className="w-3 h-3 mr-1" />
                      Private
                    </Badge>
                  )}
                </div>

                {/* Host avatar floating bottom-center */}
                <div className="absolute -bottom-7 left-1/2 -translate-x-1/2">
                  <div className="rounded-full p-[3px] bg-gradient-to-br from-secondary to-primary"
                    style={{ boxShadow: '0 8px 24px -6px rgba(79,70,229,0.45), inset 0 1px 0 rgba(255,255,255,0.4)' }}
                  >
                    <AvatarWithFrame
                      userId={entryPreview.host?.id}
                      src={cdnAvatar(normalizeProfileMediaUrl(entryPreview.host?.avatar_url) || entryPreview.host?.avatar_url || '', 64) || normalizeProfileMediaUrl(entryPreview.host?.avatar_url) || entryPreview.host?.avatar_url || undefined}
                      name={(entryPreview.host as any)?.display_name || "H"}
                      level={getRequiredDisplayLevel(entryPreview.host)}
                      size="lg"
                      showFrame={true}
                      showAnimation={true}
                    />
                  </div>
                </div>
              </div>

              {/* Body */}
              <div className="px-5 pt-9 pb-5">
                <div className="text-center mb-4">
                  <h3 className="font-bold text-base text-foreground truncate">{entryPreview.name}</h3>
                  <div className="flex items-center justify-center gap-1.5 mt-1 text-xs text-muted-foreground">
                    <span className="font-medium text-foreground">{entryPreview.host?.display_name || "Host"}</span>
                    {entryPreview.host?.country_flag && <span>{entryPreview.host.country_flag}</span>}
                    <LevelBadge level={getRequiredDisplayLevel(entryPreview.host)} size="sm" showIcon className="text-[9px] px-1 py-0" />
                  </div>
                </div>

                {/* Stats row */}
                <div className="flex items-center justify-center gap-4 mb-4">
                  <div className="flex items-center gap-1 text-xs text-muted-foreground bg-muted px-2.5 py-1 rounded-full">
                    <Users className="w-3.5 h-3.5" />
                    <span className="font-semibold text-foreground">{entryPreview.current_participants}</span>
                    <span>/ {entryPreview.max_participants ?? 0}</span>
                  </div>
                  {entryPreview.min_level > 1 && (
                    <div className="flex items-center gap-1 text-xs text-muted-foreground bg-muted px-2.5 py-1 rounded-full">
                      <ShieldAlert className="w-3.5 h-3.5 text-warning" />
                      <span>Min Lv.{entryPreview.min_level}</span>
                    </div>
                  )}
                  {entryPreview.room_code && (
                    <div className="flex items-center gap-1 text-xs text-muted-foreground bg-muted px-2.5 py-1 rounded-full">
                      <Hash className="w-3.5 h-3.5 text-info" />
                      <span className="font-mono">{entryPreview.room_code}</span>
                    </div>
                  )}
                </div>

                {/* Mood / description */}
                {(entryPreview.mood || entryPreview.description) && (
                  <div className="text-center text-xs text-muted-foreground mb-4 px-2">
                    {entryPreview.mood && <span className="font-medium text-foreground">{entryPreview.mood}</span>}
                    {entryPreview.mood && entryPreview.description && <span className="mx-1">·</span>}
                    {entryPreview.description}
                  </div>
                )}

                {/* Welcome message */}
                {entryPreview.welcome_message && (
                  <div className="rounded-lg bg-gradient-to-r from-primary/10 to-secondary/10 border border-primary/20 px-3 py-2 text-xs text-center text-foreground/80 mb-4">
                    {entryPreview.welcome_message}
                  </div>
                )}

                {/* Fee warning */}
                {entryPreview.entry_fee > 0 && (
 <div className="rounded-md bg-amber-500/10 border border-amber-500/30 px-3 py-2 text-xs text-amber-700 mb-4 text-center">
                    Entry fee <strong>{entryPreview.entry_fee} <Diamond className="w-3 h-3 inline -mt-0.5" /></strong> will be deducted.
                  </div>
                )}

                {/* Actions */}
                <div className="flex gap-2">
                  <Button variant="outline" className="flex-1 h-10 text-sm" onClick={() => setEntryPreview(null)}>
                    Cancel
                  </Button>
                  <Button
                    className="flex-1 h-10 text-sm bg-gradient-primary text-on-dark"
                    style={{ boxShadow: '0 8px 20px -8px rgba(79,70,229,0.55), inset 0 1px 0 rgba(255,255,255,0.35)' }}
                    onClick={handleJoinFromPreview}
                  >
                    {entryPreview.entry_fee > 0 ? (
                      <span className="flex items-center gap-1">
                        Pay {entryPreview.entry_fee} <Diamond className="w-3.5 h-3.5" /> & Join
                      </span>
                    ) : (
                      <span className="flex items-center gap-1">
                        Join Room <ChevronRight className="w-4 h-4" />
                      </span>
                    )}
                  </Button>
                </div>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* PR-2.5 — Room Code Quick-Join Dialog */}
      <Dialog open={roomCodeDialogOpen} onOpenChange={setRoomCodeDialogOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <KeyRound className="w-5 h-5 text-primary" />
              Join by Room Code
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-1">
            <div className="relative">
              <Hash className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                value={roomCodeInput}
                onChange={(e) => setRoomCodeInput(e.target.value.toUpperCase())}
                placeholder="Enter room code (e.g. A1B2C3)"
                className="pl-9 h-10 font-mono uppercase"
                maxLength={12}
                onKeyDown={(e) => { if (e.key === 'Enter') void joinByRoomCode(); }}
              />
            </div>
            <Button
              className="w-full h-10 bg-gradient-primary text-on-dark"
              disabled={joiningByCode || !roomCodeInput.trim()}
              onClick={() => void joinByRoomCode()}
            >
              {joiningByCode ? "Searching..." : "Join Room"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Discover;
