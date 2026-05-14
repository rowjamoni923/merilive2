import { useState, useRef, useEffect, useCallback } from "react";

import { useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { 
  X, 
  Radio, 
  Mic, 
  Gamepad2, 
  Wand2, 
  Smile, 
  Sofa, 
  Crown,
  Sparkles,
  Check,
  Lock
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import AvatarWithFrame from "@/components/common/AvatarWithFrame";
import { GameSelectionModal } from "@/components/party/GameSelectionModal";
import { ChametStyleSettingsPanel } from "@/components/party/ChametStyleSettingsPanel";
import { EmojiPicker } from "@/components/chat/EmojiPicker";
import { useNativeCameraPermission } from "@/hooks/useNativeCameraPermission";
import { useFeatureLevelCheck } from "@/hooks/useFeatureLevelCheck";
import { useRealtimeLevelProgress } from "@/hooks/useRealtimeLevel";
import { resolveLevelFromTiers } from "@/utils/levelResolver";
import { setPreparedHostPreviewStream } from "@/features/live/hostPreviewSession";
import { recordClientError } from "@/utils/clientErrorLog";
import { LevelLockModal } from "@/components/level/LevelLockModal";

type PartyMode = "video" | "audio" | "game";

const isEligiblePartyHost = (profile?: {
  is_host?: boolean | null;
  host_status?: string | null;
  gender?: string | null;
}) => {
  const normalizedGender = String(profile?.gender ?? "").toLowerCase();
  return Boolean(profile?.is_host) || String(profile?.host_status ?? "").toLowerCase() === "approved" || normalizedGender === "female";
};

// Shooting Star Component
const ShootingStar = ({ delay = 0 }: { delay: number }) => (
  <motion.div
    className="absolute w-1 h-1 bg-white rounded-full"
    style={{
      top: `${Math.random() * 30}%`,
      left: `${Math.random() * 100}%`,
    }}
    initial={{ opacity: 0, x: 0, y: 0 }}
    animate={{
      opacity: [0, 1, 0],
      x: [0, 100],
      y: [0, 100],
    }}
    transition={{
      duration: 1.5,
      delay: delay,
      repeat: Infinity,
      repeatDelay: Math.random() * 5 + 3,
    }}
  >
    <div className="absolute w-20 h-0.5 bg-gradient-to-r from-white to-transparent -left-20 top-0" />
  </motion.div>
);

const CreateParty = () => {
  const navigate = useNavigate();
  const videoRef = useRef<HTMLVideoElement>(null);
  const [mode, setMode] = useState<PartyMode>("video");
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [selectedGame, setSelectedGame] = useState<string | null>(null);
  const [showGameSelection, setShowGameSelection] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [isMicEnabled, setIsMicEnabled] = useState(true);
  const [isVideoEnabled, setIsVideoEnabled] = useState(true);
  const [cameraReady, setCameraReady] = useState(false);
  const [facingMode, setFacingMode] = useState<"user" | "environment">("user");
  const [games, setGames] = useState<{id: string; name: string; emoji: string; color: string; logoUrl?: string}[]>([]);
  const [showSettingsPanel, setShowSettingsPanel] = useState(false);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [isMirrorMode, setIsMirrorMode] = useState(true);
  const preserveStreamRef = useRef(false);
  
  // Feature level check
  const { checkFeatureAccess, isLoading: featureLevelLoading } = useFeatureLevelCheck();
  const { level: resolvedUserLevel, loading: resolvedLevelLoading } = useRealtimeLevelProgress(currentUser?.id ?? null);
  const [showLevelRestricted, setShowLevelRestricted] = useState(false);
  const [requiredLevel, setRequiredLevel] = useState(0);

  // Native camera permission hook for proper Android handling
  const { getCameraStream, requestCameraPermission } = useNativeCameraPermission();

  // Seat configurations
  const seatConfig = {
    video: 4, // 2x2 grid
    audio: 10, // 2 rows of 5
    game: 4 // 2x2 grid
  };
  
  // Check feature level access when user is loaded
  useEffect(() => {
    if (currentUser?.profile && !featureLevelLoading && !resolvedLevelLoading) {
      const profile: any = currentUser.profile;
      const isHost = isEligiblePartyHost(profile);
      const currentLevel = Math.max(
        Number(resolvedUserLevel) || 0,
        Number(profile.user_level) || 0,
        Number(profile.host_level) || 0,
        Number(profile.max_user_level) || 0,
      );
      const result = checkFeatureAccess('create_party', currentLevel, isHost);

      if (!result.canAccess) {
        setRequiredLevel(result.requiredLevel);
        setShowLevelRestricted(true);
      } else {
        setShowLevelRestricted(false);
      }
    }
  }, [currentUser, featureLevelLoading, resolvedLevelLoading, resolvedUserLevel, checkFeatureAccess]);

  // Start camera with native permission handling
  const startCameraInstant = useCallback(async (videoMode: boolean) => {
    try {
      if (videoMode) {
        // Request native camera permission first
        const permResult = await requestCameraPermission();
        if (!permResult.granted) {
          toast.error(permResult.error || "Camera permission required");
          return;
        }
        
        // Use native camera stream with progressive fallback
        const mediaStream = await getCameraStream(true); // Include audio
        if (mediaStream) {
          setStream(mediaStream);
          
          if (videoRef.current) {
            videoRef.current.srcObject = mediaStream;
            videoRef.current.play().then(() => setCameraReady(true)).catch(() => {});
          }
        }
      } else {
        // Audio only mode
        const constraints: MediaStreamConstraints = { 
          audio: { echoCancellation: true, noiseSuppression: true } 
        };
        const mediaStream = await navigator.mediaDevices.getUserMedia(constraints);
        setStream(mediaStream);
      }
    } catch (error: any) {
      console.error("Media access error:", error);
      recordClientError({ label: "CreateParty.mediaStream", message: error instanceof Error ? error.message : String(error) });
      toast.error(error.message || "Camera access failed");
    }
  }, [getCameraStream, requestCameraPermission]);

  // Initialize everything in parallel on mount
  useEffect(() => {
    let isMounted = true;
    
    // Only show base games on Create Party page (not new casino games like Roulette, Ferris Wheel, Teen Patti)
    // New games only appear inside Party Room game selector
    const ALLOWED_CREATE_PARTY_GAMES = ['lucky_28', 'aviator', 'plinko', 'dragon_tiger', 'andar_bahar', 'crash'];

    const initParty = async () => {
      // Run user fetch, games fetch, and camera start in parallel
      const [userData, gamesData] = await Promise.all([
        (async () => {
          const { data: { user } } = await supabase.auth.getUser();
          if (user) {
            const { data: profile } = await supabase
              .from('profiles')
              .select('display_name, avatar_url, frame_id, user_level, host_level, gender, is_host, host_status')
              .eq('id', user.id)
              .single();
            return { ...user, profile };
          }
          return null;
        })(),
        supabase
          .from('game_settings')
          .select('game_id, game_name, game_emoji, game_color, logo_url')
          .eq('is_active', true)
          .in('game_id', ALLOWED_CREATE_PARTY_GAMES)
          .order('display_order', { ascending: true }),
        startCameraInstant(mode !== "audio")
      ]);
      
      if (!isMounted) return;
      
      if (userData) setCurrentUser(userData);
      
      if (!gamesData.error && gamesData.data) {
        setGames(gamesData.data.map(game => ({
          id: game.game_id,
          name: game.game_name,
          emoji: game.game_emoji,
          color: game.game_color,
          logoUrl: game.logo_url
        })));
      }
    };
    
    initParty();

    return () => {
      isMounted = false;
      // Only stop tracks if we're NOT preserving for party room handoff
      if (!preserveStreamRef.current && stream) {
        stream.getTracks().forEach(track => track.stop());
      }
    };
  }, []);

  // Handle mode changes - switch camera/audio
  useEffect(() => {
    if (stream) {
      const hasVideo = stream.getVideoTracks().length > 0;
      const needsVideo = mode === "video" || mode === "game";
      
      if (needsVideo !== hasVideo) {
        stream.getTracks().forEach(track => track.stop());
        startCameraInstant(needsVideo);
      }
    }
  }, [mode]);
  const handleCreateParty = async () => {
    // Re-check level restriction before creating
    if (showLevelRestricted) {
      toast.error(`Level ${requiredLevel} required to create a party`);
      return;
    }

    if (mode === "game" && !selectedGame) {
      toast.error("Please select a game first");
      setShowGameSelection(true);
      return;
    }

    setIsCreating(true);

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        toast.error("Please login to create a party");
        navigate("/auth");
        return;
      }

      // Server-side level check
      const { data: profile } = await supabase
        .from("profiles")
        .select("user_level, host_level, is_host, host_status, gender, total_recharged, total_earnings, weekly_earnings, max_user_level")
        .eq("id", user.id)
        .single();

      if (profile) {
        const isHost = isEligiblePartyHost(profile);
        const resolvedLevel = await resolveLevelFromTiers({ id: user.id, ...profile });
        const currentLevel = Math.max(
          Number(resolvedLevel.level) || 0,
          Number((profile as any).user_level) || 0,
          Number((profile as any).host_level) || 0,
          Number((profile as any).max_user_level) || 0,
        );
        const result = checkFeatureAccess('create_party', currentLevel, isHost);
        if (!result.canAccess) {
          setRequiredLevel(result.requiredLevel);
          setShowLevelRestricted(true);
          setIsCreating(false);
          return;
        }
      }

      const { data: profileData } = await supabase
        .from("profiles")
        .select("display_name")
        .eq("id", user.id)
        .single();

      const roomCode = Math.random().toString(36).substring(2, 8).toUpperCase();
      const defaultName = `${profileData?.display_name || 'User'}'s Party`;

      const { data: partyRoom, error } = await supabase
        .from("party_rooms")
        .insert({
          host_id: user.id,
          name: defaultName,
          room_type: mode,
          room_code: roomCode,
          is_active: true,
          max_participants: seatConfig[mode],
          total_seats: seatConfig[mode]
        })
        .select()
        .single();

      if (error) throw error;

      // Preserve the camera stream for seamless handoff to PartyRoom
      if (stream) {
        preserveStreamRef.current = true;
        setPreparedHostPreviewStream(stream);
      }

      navigate(`/party/${partyRoom.id}`);
    } catch (error) {
      console.error("Error creating party:", error);
      recordClientError({ label: "CreateParty.defaultName", message: error instanceof Error ? error.message : String(error) });
      toast.error("Failed to create party");
    } finally {
      setIsCreating(false);
    }
  };

  const handleClose = () => {
    try {
      if (stream) {
        stream.getTracks().forEach(track => {
          track.stop();
        });
        setStream(null);
      }
    } catch (e) {
      console.error("Error stopping tracks:", e);
      recordClientError({ label: "CreateParty.handleClose", message: e instanceof Error ? e.message : String(e) });
    }
    navigate("/party-rooms");
  };

  const handleModeChange = (newMode: PartyMode) => {
    setMode(newMode);
    if (newMode === "game" && !selectedGame) {
      setShowGameSelection(true);
    }
  };

  const getModeIcon = () => {
    switch (mode) {
      case "video": return Radio;
      case "audio": return Mic;
      case "game": return Gamepad2;
    }
  };

  const ModeIcon = getModeIcon();

  // Empty Seat Component
  const EmptySeat = ({ className }: { className?: string }) => (
    <div className={cn(
      "rounded-2xl bg-purple-800/40 backdrop-blur-sm flex items-center justify-center border border-purple-500/20",
      className
    )}>
      <div className="w-12 h-12 rounded-full bg-purple-700/50 flex items-center justify-center">
        <Sofa className="w-6 h-6 text-purple-300/60" />
      </div>
    </div>
  );

  // Host Video Cell
  const HostVideoCell = ({ className }: { className?: string }) => (
    <div className={cn(
      "relative rounded-2xl overflow-hidden bg-purple-800/40 border border-purple-500/30",
      className
    )}>
      {stream && isVideoEnabled ? (
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted
          className={cn(
            "w-full h-full object-cover",
            facingMode === "user" && "scale-x-[-1]"
          )}
        />
      ) : (
        <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-purple-700/50 to-orange-50">
          <AvatarWithFrame
            userId={currentUser?.id}
            src={currentUser?.profile?.avatar_url}
            name={currentUser?.profile?.display_name}
            level={currentUser?.profile?.user_level || currentUser?.profile?.host_level || 1}
            isHost={currentUser?.profile?.is_host || currentUser?.profile?.gender === 'female'}
            size="md"
            showAnimation={true}
            showGlow={true}
          />
        </div>
      )}
    </div>
  );

  // Host Audio Seat (Circular with avatar)
  const HostAudioSeat = () => (
    <div className="relative flex flex-col items-center">
      {/* Mic indicator ring */}
      <motion.div
        className="absolute inset-0 rounded-full border-2 border-green-400"
        animate={{ scale: [1, 1.1, 1], opacity: [0.5, 0.2, 0.5] }}
        transition={{ repeat: Infinity, duration: 1.5 }}
        style={{ width: 72, height: 72, margin: 'auto' }}
      />
      <div className="relative">
        <AvatarWithFrame
          userId={currentUser?.id}
          src={currentUser?.profile?.avatar_url}
          name={currentUser?.profile?.display_name}
          level={currentUser?.profile?.user_level || currentUser?.profile?.host_level || 1}
          isHost={currentUser?.profile?.is_host || currentUser?.profile?.gender === 'female'}
          size="md"
          showAnimation={true}
          showGlow={true}
        />
        {/* Mic badge */}
        <div className="absolute -bottom-1 -right-1 w-6 h-6 rounded-full bg-green-500 flex items-center justify-center border-2 border-amber-200/60">
          <Mic className="w-3 h-3 text-white" />
        </div>
      </div>
    </div>
  );

  // Empty Audio Seat (Circular)
  const EmptyAudioSeat = () => (
    <div className="w-14 h-14 rounded-full bg-purple-700/40 backdrop-blur-sm flex items-center justify-center border border-purple-500/30">
      <Sofa className="w-6 h-6 text-purple-300/50" />
    </div>
  );

  return (
    <div className="fixed inset-0 z-50 flex flex-col overflow-hidden">
      {/* Background - Starry Purple Gradient */}
      <div 
        className="absolute inset-0"
        style={{
          background: 'linear-gradient(180deg, #7c3aed 0%, #8b5cf6 15%, #a78bfa 35%, #c4b5fd 55%, #ddd6fe 75%, #818cf8 100%)'
        }}
      />

      {/* Starry Overlay */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        {/* Static stars */}
        {[...Array(50)].map((_, i) => (
          <div
            key={`star-${i}`}
            className="absolute w-1 h-1 bg-white/60 rounded-full"
            style={{
              top: `${Math.random() * 100}%`,
              left: `${Math.random() * 100}%`,
              animation: `twinkle ${1 + Math.random() * 2}s ease-in-out infinite`,
              animationDelay: `${Math.random() * 2}s`
            }}
          />
        ))}
        
        {/* Bigger sparkle stars */}
        {[...Array(15)].map((_, i) => (
          <motion.div
            key={`sparkle-${i}`}
            className="absolute"
            style={{
              top: `${Math.random() * 80}%`,
              left: `${Math.random() * 100}%`,
            }}
            animate={{ 
              scale: [0.5, 1, 0.5], 
              opacity: [0.3, 0.8, 0.3] 
            }}
            transition={{ 
              repeat: Infinity, 
              duration: 2 + Math.random() * 2,
              delay: Math.random() * 2
            }}
          >
            <Sparkles className="w-3 h-3 text-slate-600" />
          </motion.div>
        ))}

        {/* Shooting stars */}
        <ShootingStar delay={0} />
        <ShootingStar delay={3} />
        <ShootingStar delay={6} />
        <ShootingStar delay={9} />
      </div>

      {/* Cloud/Mist effect at bottom */}
      <div 
        className="absolute bottom-0 left-0 right-0 h-40 pointer-events-none"
        style={{
          background: 'linear-gradient(to top, rgba(255,255,255,0.2) 0%, transparent 100%)'
        }}
      />

      {/* Header */}
      <header className="relative z-10 px-4 pt-4 pb-2 safe-area-top flex items-center justify-between">
        {/* Host Avatar with Check */}
        <div className="relative">
          <AvatarWithFrame
            userId={currentUser?.id}
            src={currentUser?.profile?.avatar_url}
            name={currentUser?.profile?.display_name}
            level={currentUser?.profile?.user_level || currentUser?.profile?.host_level || 1}
            isHost={currentUser?.profile?.is_host || currentUser?.profile?.gender === 'female'}
            size="md"
            showAnimation={true}
            showGlow={true}
          />
          {/* Check badge */}
          <div className="absolute -bottom-1 -right-1 w-7 h-7 rounded-lg bg-gradient-to-br from-green-400 to-emerald-500 flex items-center justify-center border-2 border-white shadow-lg">
            <Check className="w-4 h-4 text-white" strokeWidth={3} />
          </div>
        </div>

        {/* Close Button */}
        <Button
          variant="ghost"
          size="icon"
          className="w-12 h-12 rounded-full bg-white/80 text-white backdrop-blur-md hover:bg-gray-700/50"
          onClick={handleClose}
        >
          <X className="w-6 h-6" />
        </Button>
      </header>

      {/* Campaign Banner */}
      

      {/* Main Content - Seat Grid */}
      <main className="relative z-10 flex-1 flex flex-col items-center justify-center px-4 pb-4">
        {mode === "audio" ? (
          /* AUDIO MODE - Premium 2 rows of 5 seats */
          <div className="w-full max-w-sm space-y-6">
            {/* Room Label */}
            <motion.div 
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              className="flex items-center justify-center gap-2"
            >
              <div className="h-px flex-1 bg-gradient-to-r from-transparent via-purple-300/40 to-transparent" />
              <span className="text-slate-600 text-xs font-medium tracking-wider uppercase flex items-center gap-1.5">
                <Mic className="w-3.5 h-3.5 text-green-400" />
                Audio Party
              </span>
              <div className="h-px flex-1 bg-gradient-to-r from-transparent via-purple-300/40 to-transparent" />
            </motion.div>

            {/* First Row - Host + 4 seats with glow */}
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              className="flex justify-center items-center gap-4 p-4 rounded-2xl bg-white/5 backdrop-blur-md border border-amber-200/60"
            >
              <HostAudioSeat />
              {[...Array(4)].map((_, i) => (
                <motion.div key={`row1-${i}`} initial={{ opacity: 0, scale: 0 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: 0.1 + i * 0.05 }}>
                  <EmptyAudioSeat />
                </motion.div>
              ))}
            </motion.div>
            
            {/* Second Row - 5 seats */}
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: 0.15 }}
              className="flex justify-center items-center gap-4 p-4 rounded-2xl bg-white/5 backdrop-blur-md border border-amber-200/60"
            >
              {[...Array(5)].map((_, i) => (
                <motion.div key={`row2-${i}`} initial={{ opacity: 0, scale: 0 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: 0.2 + i * 0.05 }}>
                  <EmptyAudioSeat />
                </motion.div>
              ))}
            </motion.div>
          </div>
        ) : mode === "video" ? (
          /* VIDEO MODE - Premium 2x2 grid */
          <div className="w-full max-w-sm space-y-4">
            {/* Room Label */}
            <motion.div 
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              className="flex items-center justify-center gap-2"
            >
              <div className="h-px flex-1 bg-gradient-to-r from-transparent via-purple-300/40 to-transparent" />
              <span className="text-slate-600 text-xs font-medium tracking-wider uppercase flex items-center gap-1.5">
                <Radio className="w-3.5 h-3.5 text-blue-400" />
                Video Party
              </span>
              <div className="h-px flex-1 bg-gradient-to-r from-transparent via-purple-300/40 to-transparent" />
            </motion.div>

            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              className="grid grid-cols-2 gap-2.5 aspect-square p-3 rounded-2xl bg-white/5 backdrop-blur-md border border-amber-200/60 shadow-2xl"
            >
              {/* Host Video */}
              <HostVideoCell className="aspect-square rounded-xl shadow-lg" />
              
              {/* Empty Seats with staggered animation */}
              {[...Array(3)].map((_, i) => (
                <motion.div key={i} initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: 0.1 + i * 0.08 }}>
                  <EmptySeat className="aspect-square" />
                </motion.div>
              ))}
            </motion.div>
          </div>
        ) : (
          /* GAME MODE - Premium 2x2 grid with game selection */
          <div className="w-full max-w-sm space-y-4">
            {/* Room Label */}
            <motion.div 
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              className="flex items-center justify-center gap-2"
            >
              <div className="h-px flex-1 bg-gradient-to-r from-transparent via-purple-300/40 to-transparent" />
              <span className="text-slate-600 text-xs font-medium tracking-wider uppercase flex items-center gap-1.5">
                <Gamepad2 className="w-3.5 h-3.5 text-orange-400" />
                Game Party
              </span>
              <div className="h-px flex-1 bg-gradient-to-r from-transparent via-purple-300/40 to-transparent" />
            </motion.div>

            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              className="grid grid-cols-2 gap-2.5 aspect-square p-3 rounded-2xl bg-white/5 backdrop-blur-md border border-amber-200/60 shadow-2xl"
            >
              {/* Host Video */}
              <HostVideoCell className="aspect-square rounded-xl shadow-lg" />
              
              {/* Empty Seats */}
              {[...Array(3)].map((_, i) => (
                <motion.div key={i} initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: 0.1 + i * 0.08 }}>
                  <EmptySeat className="aspect-square" />
                </motion.div>
              ))}
            </motion.div>
            
            {/* Game Selection - No background, bigger logos */}
            <motion.div 
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2 }}
              className="flex gap-3 overflow-x-auto pb-2 px-1"
            >
              {games.slice(0, 4).map((game, i) => (
                <motion.button
                  key={game.id}
                  initial={{ opacity: 0, scale: 0.8 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ delay: 0.25 + i * 0.06 }}
                  whileTap={{ scale: 0.92 }}
                  onClick={() => setSelectedGame(game.id)}
                  className={cn(
                    "flex-shrink-0 flex flex-col items-center gap-2 p-3 rounded-2xl transition-all",
                    selectedGame === game.id 
                      ? "bg-purple-500/30 ring-2 ring-purple-400 shadow-lg shadow-purple-500/20" 
                      : "bg-white/10 backdrop-blur-sm border border-amber-200/60"
                  )}
                >
                  <div className="w-20 h-20 rounded-xl flex items-center justify-center overflow-hidden">
                    {game.logoUrl ? (
                      <img src={game.logoUrl} alt={game.name} className="w-full h-full rounded-xl object-cover" />
                    ) : (
                      <span className="text-5xl">{game.emoji}</span>
                    )}
                  </div>
                  <span className="text-white text-xs font-semibold">{game.name}</span>
                </motion.button>
              ))}
            </motion.div>
          </div>
        )}
      </main>

      {/* Bottom Controls */}
      <div className="relative z-10 px-4 pb-6 safe-area-bottom space-y-4">
        {/* Action Row */}
        <div className="flex items-center justify-center gap-4">
          {/* Effects Button */}
          <motion.button
            whileTap={{ scale: 0.9 }}
            onClick={() => setShowSettingsPanel(true)}
            className="w-12 h-12 rounded-full bg-white/10 backdrop-blur-sm flex items-center justify-center border border-amber-200/60"
          >
            <Wand2 className="w-7 h-7 text-white" />
          </motion.button>

          {/* Let's Party Button */}
          <motion.button
            whileTap={{ scale: 0.95 }}
            onClick={handleCreateParty}
            disabled={isCreating || (mode === "game" && !selectedGame)}
            className="flex items-center gap-3 px-8 py-4 rounded-full bg-gradient-to-r from-purple-500 to-purple-600 text-white font-bold text-lg shadow-xl disabled:opacity-50"
          >
            <ModeIcon className="w-6 h-6" />
            <span>{isCreating ? "Creating..." : "Let's Party"}</span>
          </motion.button>

          {/* Emoji Button */}
          <motion.button
            whileTap={{ scale: 0.9 }}
            onClick={() => setShowEmojiPicker(true)}
            className="w-12 h-12 rounded-full bg-white/10 backdrop-blur-sm flex items-center justify-center border border-amber-200/60"
          >
            <Smile className="w-7 h-7 text-white" />
          </motion.button>
        </div>

        {/* Mode Tabs */}
        <div className="flex justify-center items-center gap-8">
          {[
            { id: "video", label: "Video" },
            { id: "audio", label: "Audio" },
            { id: "game", label: "Game" },
          ].map((item) => {
            const isActive = mode === item.id;
            return (
              <motion.button
                key={item.id}
                whileTap={{ scale: 0.95 }}
                onClick={() => handleModeChange(item.id as PartyMode)}
                className="relative"
              >
                <span className={cn(
                  "text-lg font-semibold transition-colors",
                  isActive ? "text-white" : "text-slate-500"
                )}>
                  {item.label}
                </span>
                {isActive && (
                  <motion.div
                    layoutId="modeIndicator"
                    className="absolute -bottom-1 left-0 right-0 h-0.5 bg-white rounded-full"
                  />
                )}
              </motion.button>
            );
          })}
        </div>
      </div>

      {/* Game Selection Modal */}
      <GameSelectionModal
        isOpen={showGameSelection}
        onClose={() => setShowGameSelection(false)}
        onSelectGame={(gameId) => {
          setSelectedGame(gameId);
          setShowGameSelection(false);
        }}
        selectedGame={selectedGame}
      />

      {/* Settings Panel (Effects, Beauty, Stickers) */}
      <ChametStyleSettingsPanel
        isOpen={showSettingsPanel}
        onClose={() => setShowSettingsPanel(false)}
        isCameraOn={isVideoEnabled}
        onCameraToggle={() => {
          if (stream) {
            stream.getVideoTracks().forEach(track => {
              track.enabled = !isVideoEnabled;
            });
            setIsVideoEnabled(!isVideoEnabled);
          }
        }}
        isMicOn={isMicEnabled}
        onMicToggle={() => {
          if (stream) {
            stream.getAudioTracks().forEach(track => {
              track.enabled = !isMicEnabled;
            });
            setIsMicEnabled(!isMicEnabled);
          }
        }}
        isMirrorMode={isMirrorMode}
        onMirrorModeToggle={() => setIsMirrorMode(!isMirrorMode)}
        isFrontCamera={facingMode === "user"}
        onSwitchCamera={async () => {
          if (stream) {
            stream.getTracks().forEach(track => track.stop());
            const newFacingMode = facingMode === "user" ? "environment" : "user";
            setFacingMode(newFacingMode);
            try {
              const newStream = await navigator.mediaDevices.getUserMedia({
                video: { facingMode: newFacingMode },
                audio: true
              });
              setStream(newStream);
              if (videoRef.current) {
              }
            } catch (error) {
              console.error("Camera switch error:", error);
              recordClientError({ label: "CreateParty.newStream", message: error instanceof Error ? error.message : String(error) });
            }
          }
        }}
        onBeautyClick={() => toast.info("Beauty filters coming soon!")}
        onStickerClick={() => toast.info("Stickers coming soon!")}
      />

      {/* Emoji Picker */}
      <AnimatePresence>
        {showEmojiPicker && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[60] flex items-end justify-center bg-white/80 backdrop-blur-sm"
            onClick={() => setShowEmojiPicker(false)}
          >
            <motion.div
              initial={{ y: 300 }}
              animate={{ y: 0 }}
              exit={{ y: 300 }}
              className="w-full max-w-md bg-card rounded-t-3xl p-4"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="w-12 h-1 bg-muted-foreground/30 rounded-full mx-auto mb-4" />
              <h3 className="text-lg font-semibold text-foreground mb-4 text-center">Select Emoji</h3>
              <EmojiPicker 
                isOpen={true}
                onClose={() => setShowEmojiPicker(false)}
                onSelect={(emoji) => {
                  toast.success(`${emoji} selected!`);
                  setShowEmojiPicker(false);
                }} 
              />
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Level Restriction Modal — premium shared component */}
      <LevelLockModal
        open={showLevelRestricted}
        onClose={() => navigate(-1)}
        featureName="Create Party"
        requiredLevel={requiredLevel}
        currentLevel={
          (currentUser?.profile?.is_host || currentUser?.profile?.gender === 'female')
            ? (currentUser?.profile?.host_level || 0)
            : (currentUser?.profile?.user_level || 0)
        }
        isHost={Boolean(currentUser?.profile?.is_host) || currentUser?.profile?.gender === 'female'}
      />

      {/* Twinkle Animation Style */}
      <style>{`
        @keyframes twinkle {
          0%, 100% { opacity: 0.3; transform: scale(0.8); }
          50% { opacity: 1; transform: scale(1.2); }
        }
      `}</style>
    </div>
  );
};

export default CreateParty;
