import { useState, useRef, useEffect, useLayoutEffect, useCallback, useMemo } from "react";

import { useNavigate } from "react-router-dom";
import { usePartySessionOptional } from "@/features/party-session";
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import AvatarWithFrame from "@/components/common/AvatarWithFrame";
import { GameSelectionModal } from "@/components/party/GameSelectionModal";
import { ChametStyleSettingsPanel } from "@/components/party/ChametStyleSettingsPanel";
import { EmojiPicker } from "@/components/chat/EmojiPicker";
import { useNativeCameraPermission } from "@/hooks/useNativeCameraPermission";
import { requestMicrophonePermission } from "@/utils/nativePermissions";
import { isNativeAndroidApp } from "@/utils/nativeUtils";
import { useFeatureLevelCheck } from "@/hooks/useFeatureLevelCheck";
import { useRealtimeLevelProgress } from "@/hooks/useRealtimeLevel";
import { resolveLevelFromTiers } from "@/utils/levelResolver";
import { setPreparedHostPreviewStream } from "@/features/live/hostPreviewSession";
import {
  adoptCameraSession,
  type CameraSessionHandle,
} from "@/lib/persistentCameraSession";
import { recordClientError } from "@/utils/clientErrorLog";
import { LevelLockModal } from "@/components/level/LevelLockModal";
import { getProxiedUrl } from "@/utils/r2ProxyUrl";
import { claimAndroidWebViewCameraForStream, releaseAndroidWebViewCamera } from "@/lib/androidCameraHandoff";
import { nativeLiveKitController } from "@/lib/nativeLiveKitController";
import { useProCamera } from "@/camera/useProCamera";
import * as ProCameraEngine from "@/camera/ProCameraEngine";
import { NativeVideoView } from "@/components/NativeVideoView";
import { clearNativeMediaSurface } from "@/utils/nativeMediaSurface";
import { getRequiredDisplayLevel } from "@/utils/stableLevel";
import { enforcePermanentCameraLock } from "@/utils/cameraLock";
import { buildPortraitVideoConstraint } from "@/utils/portraitCameraConstraints";
import { maybeUpgradeToWidestCamera } from "@/utils/widestCamera";

type PartyMode = "video" | "audio" | "game";

const isEligiblePartyHost = (profile?: {
  is_host?: boolean | null;
  host_status?: string | null;
  gender?: string | null;
}) => {
  const normalizedGender = String(profile?.gender ?? "").toLowerCase();
  return Boolean(profile?.is_host) || String(profile?.host_status ?? "").toLowerCase() === "approved" || normalizedGender === "female";
};

// Shooting Star Component — PR-2.4: position/repeatDelay frozen via useMemo
// (was re-randomized on EVERY parent render → unnecessary motion thrash).
const ShootingStar = ({ delay = 0 }: { delay: number }) => {
  const stable = useMemo(() => ({
    top: `${Math.random() * 30}%`,
    left: `${Math.random() * 100}%`,
    repeatDelay: Math.random() * 5 + 3,
  }), []);
  return (
    <motion.div
      className="absolute w-1 h-1 bg-white rounded-full"
      style={{ top: stable.top, left: stable.left }}
      initial={{ opacity: 0, x: 0, y: 0 }}
      animate={{ opacity: [0, 1, 0], x: [0, 100], y: [0, 100] }}
      transition={{
        duration: 1.5,
        delay,
        repeat: Infinity,
        repeatDelay: stable.repeatDelay,
      }}
    >
      <div className="absolute w-20 h-0.5 bg-gradient-to-r from-white to-transparent -left-20 top-0" />
    </motion.div>
  );
};

const CreateParty = () => {
  const navigate = useNavigate();
  // Delivery 2: when rendered inside <PartySessionProvider>, swap to the
  // InRoomPhase via local state instead of `navigate(/party/:id)` so the
  // native LiveKit prejoin preview is never torn down.
  const partySession = usePartySessionOptional();
  const videoRef = useRef<HTMLVideoElement>(null);
  const [mode, setMode] = useState<PartyMode>("video");
  const [stream, setStream] = useState<MediaStream | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [selectedGame, setSelectedGame] = useState<string | null>(null);
  const [showGameSelection, setShowGameSelection] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [isMicEnabled, setIsMicEnabled] = useState(true);
  const [isVideoEnabled, setIsVideoEnabled] = useState(true);
  const [isEnablingMedia, setIsEnablingMedia] = useState(false);
  const [cameraReady, setCameraReady] = useState(false);
  const [facingMode, setFacingMode] = useState<"user" | "environment">("user");
  const [games, setGames] = useState<{id: string; name: string; emoji: string; color: string; logoUrl?: string}[]>([]);
  const [showSettingsPanel, setShowSettingsPanel] = useState(false);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [isMirrorMode, setIsMirrorMode] = useState(true);
  const [nativePreviewActive, setNativePreviewActive] = useState(false);
  const nativePartyPreviewStartPromiseRef = useRef<Promise<boolean> | null>(null);
  // Party rooms are always public (industry standard — Chamet/Bigo/Poppo).
  // Entry fee remains as an optional gate; password gating fully removed.
  const [showRoomLockSheet, setShowRoomLockSheet] = useState(false);
  const [roomEntryFee, setRoomEntryFee] = useState<number>(0);
  const preserveStreamRef = useRef(false);
  // Pkg-shirt Phase-A: register the web getUserMedia stream into the global
  // persistentCameraSession (mirror of GoLive). This back-stops the brief
  // unmount→mount window when CreatePhase swaps to InRoomPhase — without it
  // the stream is only held by streamRef which dies on unmount, so PartyRoom's
  // consumePreparedHostPreviewStream() can race with track stop. Audio-only
  // mode does not adopt (the audio-only constraint key would mismatch a later
  // video-mode acquire and force a re-getUserMedia).
  const cameraHandleRef = useRef<CameraSessionHandle | null>(null);
  const isNativeAndroid = isNativeAndroidApp();
  useEffect(() => {
    streamRef.current = stream;
  }, [stream]);
  
  // Feature level check
  const { checkFeatureAccess, isLoading: featureLevelLoading } = useFeatureLevelCheck();
  const { level: resolvedUserLevel, loading: resolvedLevelLoading } = useRealtimeLevelProgress(currentUser?.id ?? null);
  const [showLevelRestricted, setShowLevelRestricted] = useState(false);
  const [requiredLevel, setRequiredLevel] = useState(0);

  // Native camera permission hook for proper Android handling
  const { getCameraStream, requestCameraPermission } = useNativeCameraPermission();

  // Pkg-PartyGAP-1 — Acquire the streaming-family slot in ProCameraEngine
  // for the selected party mode (video/game). Audio party never opens the
  // camera, so we keep the hook enabled=false there. The arbiter is
  // ref-counted, so this slot is shared safely with the prejoin Capacitor
  // plugin / LiveKit publisher when we hand off into the party room.
  const partyCameraOwner: 'video-party' | 'game-party' =
    mode === 'game' ? 'game-party' : 'video-party';
  const proCamera = useProCamera(partyCameraOwner, mode !== 'audio');

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
      if (isNativeAndroid) {
        let nativeReady = false;
        if (videoMode) {
          if (ProCameraEngine.currentFamily() === 'verification') {
            toast.error('Camera is busy. Close other camera screens and try again.');
            setCameraReady(false);
            return;
          }
          const permission = await requestCameraPermission({ includeMicrophone: true });
          if (!permission.granted) throw new Error(permission.error || "Camera permission denied.");
          // Pro single-camera lifecycle (Chamet/Bigo): start the native
          // LiveKit prejoin camera NOW so PartyRoom can reuse the SAME
          // LocalVideoTrack via promotePreviewToSession — no Camera2
          // re-open between Create Party → Party Room.
          try {
            const previewScope = nativeLiveKitController.getPreviewScope();
            const activeScope = nativeLiveKitController.getActiveScope();
            const started = previewScope === 'party' || activeScope === 'party'
              ? true
              : await (nativePartyPreviewStartPromiseRef.current ??= nativeLiveKitController
                  .startLocalPreview({
                    lens: 'front',
                    resolution: '1080p',
                    mirror: true,
                    roomScope: 'party',
                    boundedOnly: true,
                  })
                  .finally(() => {
                    nativePartyPreviewStartPromiseRef.current = null;
                  }));
            setNativePreviewActive(started);
            nativeReady = started;
          } catch (e) {
            console.warn('[CreateParty] native prejoin preview failed (non-fatal):', e);
            setNativePreviewActive(false);
          }
        } else {
          await nativeLiveKitController.stopLocalPreview().catch(() => {});
          const micGranted = await requestMicrophonePermission();
          if (!micGranted) throw new Error("Microphone permission denied.");
          setNativePreviewActive(false);
          nativeReady = true;
        }
        setCameraReady(nativeReady);
        return;
      }

      if (videoMode) {
        // Browser preview only. Android native app returns above and never
        // opens WebView getUserMedia for party media setup.
        // Pkg-PartyGAP-1 (post-2026-06-14): the ProCameraEngine arbiter is
        // now a STUB (single LiveKit camera path), so `isHeldBy` always
        // returns false and would falsely block every web preview. We
        // keep the `proCamera.ready` check only — it's the real signal.
        if (!proCamera.ready) {
          toast.error('Camera is busy. Close other camera screens and try again.');
          return;
        }
        const mediaStream = await getCameraStream(true); // Include audio
        if (mediaStream) {
          // Pkg-shirt Phase-A: register into global persistent camera session
          // BEFORE setState so the swap to PartyRoom is back-stopped.
          try {
            cameraHandleRef.current?.release();
            cameraHandleRef.current = adoptCameraSession(mediaStream, {
              video: true,
              audio: true,
            });
          } catch (e) {
            console.warn('[CreateParty] adoptCameraSession failed (non-fatal):', e);
          }
          setStream(mediaStream);
          // Pkg-fix: do NOT set srcObject here — the sync useEffect below
          // attaches stream → video element whenever either changes. Setting
          // it twice causes a mute-flip on Android WebView → blank preview.
        }
      } else {
        // Audio only mode — no camera; ProCameraEngine slot already released
        // by useProCamera(..., enabled=false) when mode flipped to 'audio'.
        releaseAndroidWebViewCamera('create-party:audio-only');
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
  }, [getCameraStream, isNativeAndroid, proCamera.ready, partyCameraOwner, requestCameraPermission]);

  useLayoutEffect(() => {
    if (!isNativeAndroid) return;
    // Phase 1 (Camera Rebuild Plan, 2026-06-14): party scope renders the
    // camera into per-seat TextureView overlays placed ABOVE the WebView
    // (Bigo/Chamet pattern), so the WebView body MUST stay opaque — the
    // purple seat-tile background and empty seats need to remain visible.
    // Therefore we do NOT call `setNativeMediaSurface(true)` here. Any
    // legacy transparent body class is cleared so we never inherit a stale
    // transparent surface from a previous Live/Party session.
    clearNativeMediaSurface();
    return () => {
      if (preserveStreamRef.current) return;
      clearNativeMediaSurface();
    };
  }, [isNativeAndroid, nativePreviewActive]);

  // Initialize everything in parallel on mount
  useEffect(() => {
    let isMounted = true;
    
    // Only show base games on Create Party page (not new casino games like Roulette, Ferris Wheel, Teen Patti)
    // New games only appear inside Party Room game selector
    const ALLOWED_CREATE_PARTY_GAMES = ['lucky_28', 'aviator', 'plinko', 'dragon_tiger', 'andar_bahar', 'crash'];

    const initParty = async () => {
      // Run data loading only. Camera/mic must start from an explicit tap so
      // browsers keep the permission request inside the user gesture.
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
          .order('display_order', { ascending: true })
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
      if (!preserveStreamRef.current && streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop());
        streamRef.current = null;
        releaseAndroidWebViewCamera('create-party:unmount');
      }
      // Pkg-shirt Phase-A: always release our adopted handle, but the global
      // session keeps the tracks alive until refcount hits 0. When the user
      // tapped Create, PartySessionProvider holds another refcount during
      // inRoom phase → tracks survive the swap. When the user backed out,
      // PartyRoom never mounts → refcount drops to 0 → next caller can
      // dispose via disposeCameraSessionIfIdle().
      cameraHandleRef.current?.release();
      cameraHandleRef.current = null;
      // Native prejoin preview: keep alive if PartyRoom will reuse it
      // (preserveStreamRef === true means user tapped Create). Otherwise
      // user backed out → release Camera2 immediately.
      if (isNativeAndroid && !preserveStreamRef.current) {
        nativeLiveKitController.stopLocalPreview().catch(() => {});
        setNativePreviewActive(false);
        clearNativeMediaSurface();
      }
    };
  }, [isNativeAndroid]);

  // Sync stream → video element whenever either changes (video element may
  // mount AFTER startCameraInstant set srcObject on a null ref → preview blank).
  // FIX: also re-attach when the element itself mounts/unmounts by reading
  // the ref inside a layout-effect style cleanup cycle.
  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    if (stream && isVideoEnabled) {
      if (v.srcObject !== stream) {
        v.srcObject = stream;
      }
      const playPromise = v.play();
      if (playPromise !== undefined) {
        playPromise
          .then(() => setCameraReady(true))
          .catch(() => {
            // Autoplay blocked or transient error — still mark ready so
            // the video tile becomes visible. User can tap to wake it.
            setCameraReady(true);
          });
      } else {
        setCameraReady(true);
      }
      // Safety-net: if play() hangs (some WebView implementations),
      // force cameraReady after 2.5s so the UI is never stuck blank.
      const forceReadyTimer = setTimeout(() => setCameraReady(true), 2500);
      return () => clearTimeout(forceReadyTimer);
    } else {
      try { v.srcObject = null; } catch {}
    }
  }, [stream, isVideoEnabled, mode]);

  // Camera/audio switches are handled inside the tab click so browser
  // permission stays tied to a user gesture.
  const handleEnableMedia = async () => {
    if (isEnablingMedia) return;
    setIsEnablingMedia(true);
    setCameraReady(false);
    try {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => track.stop());
        releaseAndroidWebViewCamera('create-party:enable-media-retry');
        setStream(null);
      }
      await startCameraInstant(mode !== "audio");
    } finally {
      setIsEnablingMedia(false);
    }
  };

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

    const nativeMediaReady = isNativeAndroid && cameraReady;
    const webMediaReady = streamRef.current?.getTracks().some((track) => track.readyState === 'live');
    if (!nativeMediaReady && !webMediaReady) {
      toast.error(mode === "audio" ? "Please enable microphone first" : "Please enable camera and microphone first");
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

      const defaultName = `${profileData?.display_name || 'User'}'s Party`;

      const { data: partyRoomId, error } = await supabase.rpc('create_party_room', {
        p_name: defaultName,
        p_room_type: mode,
        p_game_mode: mode === 'game' ? selectedGame : null,
        p_password: null,
        p_entry_fee: Math.max(0, Math.floor(Number(roomEntryFee) || 0)),
      });

      if (error) throw error;
      if (!partyRoomId) throw new Error('Party room was not created');

      // Seamless handoff: browser preserves MediaStream; native Android keeps
      // the LiveKit prejoin preview alive so PartyRoom promotes the same
      // Camera2 LocalVideoTrack instead of stopping/reopening the camera.
      if (isNativeAndroid && mode !== 'audio') {
        preserveStreamRef.current = true;
        releaseAndroidWebViewCamera('create-party:native-preview-handoff');
      } else if (!isNativeAndroid && stream) {
        preserveStreamRef.current = true;
        setPreparedHostPreviewStream(stream);
      } else {
        releaseAndroidWebViewCamera('create-party:no-stream-handoff');
      }

      if (partySession) {
        partySession.goToInRoom(partyRoomId, mode);
      } else {
        navigate(`/party/${partyRoomId}`);
      }
    } catch (error) {
      console.error("Error creating party:", error);
      recordClientError({ label: "CreateParty.defaultName", message: error instanceof Error ? error.message : String(error) });
      toast.error("Failed to create party");
    } finally {
      setIsCreating(false);
    }
  };

  const handleClose = () => {
    // Tear down the visible native camera surface + native TextureView
    // FIRST (fire-and-forget, no await) so the camera disappears on the
    // same frame as the tap. Previously stopLocalPreview ran only inside
    // the background IIFE — the native surface stayed visible for a beat
    // and users felt the X button needed a second click.
    if (isNativeAndroid) {
      try { clearNativeMediaSurface(); } catch { /* ignore */ }
      setNativePreviewActive(false);
      try { void nativeLiveKitController.stopLocalPreview(); } catch { /* ignore */ }
    }
    if (streamRef.current) {
      try {
        streamRef.current.getTracks().forEach(track => track.stop());
        releaseAndroidWebViewCamera('create-party:close');
      } catch { /* ignore */ }
      streamRef.current = null;
      setStream(null);
    }
    navigate("/party-rooms");
  };


  const handleModeChange = async (newMode: PartyMode) => {
    const previousMode = mode;
    setMode(newMode);
    if (newMode === "game" && !selectedGame) {
      setShowGameSelection(true);
    }
    if (isNativeAndroid) {
      setCameraReady(false);
      await startCameraInstant(newMode !== "audio");
      return;
    }
    if (!streamRef.current) return;

    const previousNeedsVideo = previousMode === "video" || previousMode === "game";
    const nextNeedsVideo = newMode === "video" || newMode === "game";
    if (previousNeedsVideo !== nextNeedsVideo) {
      setCameraReady(false);
      streamRef.current.getTracks().forEach((track) => track.stop());
      releaseAndroidWebViewCamera('create-party:mode-change');
      setStream(null);
      await startCameraInstant(nextNeedsVideo);
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

  // Host Video Cell — ALWAYS renders the video element so the ref is in the
  // DOM before the stream→video useEffect fires. Visibility is CSS-driven.
  const HostVideoCell = ({ className }: { className?: string }) => {
    const showNativeVideo = isNativeAndroid && nativePreviewActive && isVideoEnabled && cameraReady && mode !== "audio";
    const hasStream = !!stream && isVideoEnabled;
    const showVideo = showNativeVideo || (hasStream && cameraReady);
    return (
      <div className={cn(
        "relative rounded-2xl overflow-hidden bg-purple-800/40 border border-purple-500/30",
        className
      )}>
        {/* Avatar fallback — visible only when video is NOT ready */}
        <div className={cn(
          "absolute inset-0 flex items-center justify-center bg-gradient-to-br from-purple-700/50 to-orange-50 z-10 transition-opacity duration-200",
          showVideo ? "opacity-0 pointer-events-none" : "opacity-100"
        )}>
          <AvatarWithFrame
            userId={currentUser?.id}
            src={currentUser?.profile?.avatar_url}
            name={currentUser?.profile?.display_name}
            level={getRequiredDisplayLevel(currentUser?.profile)}
            isHost={currentUser?.profile?.is_host || currentUser?.profile?.gender === "female"}
            size="md"
            showAnimation={true}
            showGlow={true}
          />
        </div>
        {/* Native preview overlay (Android native app only) */}
        {showNativeVideo && (
          <NativeVideoView
            kind="local"
            mirror={facingMode === "user"}
            className="absolute inset-0 w-full h-full z-20"
          />
        )}
        {!isNativeAndroid && (
          <video
            key={stream?.id || 'no-stream'}
            ref={videoRef}
            autoPlay
            playsInline
            muted
            controls={false}
            disablePictureInPicture
            disableRemotePlayback
            controlsList="nodownload nofullscreen noremoteplayback noplaybackrate"
            poster=""
            // @ts-ignore
            x5-video-player-type="h5"
            webkit-playsinline="true"
            className={cn(
              "absolute inset-0 w-full h-full object-cover bg-transparent transition-opacity duration-200 z-20",
              showVideo ? "opacity-100" : "opacity-0",
              facingMode === "user" && "scale-x-[-1]"
            )}
            style={{ pointerEvents: 'none', WebkitTouchCallout: 'none', WebkitAppearance: 'none' } as React.CSSProperties}
          />
        )}
      </div>
    );
  };


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
          level={getRequiredDisplayLevel(currentUser?.profile)}
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

  const mediaReady = isNativeAndroid ? cameraReady : !!stream?.getTracks().some((track) => track.readyState === 'live');

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
            level={getRequiredDisplayLevel(currentUser?.profile)}
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
        <button
          type="button"
          onClick={handleClose}
          aria-label="Close"
          className="group relative w-11 h-11 rounded-full bg-black/30 backdrop-blur-xl border border-white/15 text-white/90 flex items-center justify-center shadow-[0_4px_20px_rgba(0,0,0,0.25)] transition-all duration-200 hover:bg-black/45 hover:border-white/25 hover:text-white active:scale-95 focus:outline-none focus:ring-2 focus:ring-white/30"
        >
          <X className="w-5 h-5" strokeWidth={2.5} />
        </button>
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
              <span
                className="text-white/90 text-xs font-semibold tracking-wider uppercase flex items-center gap-1.5"
                style={{ textShadow: "0 1px 3px rgba(0,0,0,0.45)" }}
              >
                <Mic className="w-3.5 h-3.5 text-emerald-300 drop-shadow-[0_0_4px_rgba(110,231,183,0.7)]" />
                Audio Party
              </span>
              <div className="h-px flex-1 bg-gradient-to-r from-transparent via-white/40 to-transparent" />
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
              <span
                className="text-white/90 text-xs font-semibold tracking-wider uppercase flex items-center gap-1.5"
                style={{ textShadow: "0 1px 3px rgba(0,0,0,0.45)" }}
              >
                <Radio className="w-3.5 h-3.5 text-sky-300 drop-shadow-[0_0_4px_rgba(125,211,252,0.7)]" />
                Video Party
              </span>
              <div className="h-px flex-1 bg-gradient-to-r from-transparent via-white/40 to-transparent" />
            </motion.div>

            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              className="grid grid-cols-2 gap-2.5 aspect-[3/4] p-3 rounded-2xl bg-white/5 backdrop-blur-md border border-amber-200/60 shadow-2xl"
            >
              {/* Host Video */}
              <HostVideoCell className="aspect-[3/4] rounded-xl shadow-lg" />
              
              {/* Empty Seats with staggered animation */}
              {[...Array(3)].map((_, i) => (
                <motion.div key={i} initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: 0.1 + i * 0.08 }}>
                  <EmptySeat className="aspect-[3/4]" />
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
              <span
                className="text-white/90 text-xs font-semibold tracking-wider uppercase flex items-center gap-1.5"
                style={{ textShadow: "0 1px 3px rgba(0,0,0,0.45)" }}
              >
                <Gamepad2 className="w-3.5 h-3.5 text-amber-300 drop-shadow-[0_0_4px_rgba(252,211,77,0.7)]" />
                Game Party
              </span>
              <div className="h-px flex-1 bg-gradient-to-r from-transparent via-white/40 to-transparent" />
            </motion.div>

            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              className="grid grid-cols-2 gap-2.5 aspect-[3/4] p-3 rounded-2xl bg-white/5 backdrop-blur-md border border-amber-200/60 shadow-2xl"
            >
              {/* Host Video */}
              <HostVideoCell className="aspect-[3/4] rounded-xl shadow-lg" />
              
              {/* Empty Seats */}
              {[...Array(3)].map((_, i) => (
                <motion.div key={i} initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: 0.1 + i * 0.08 }}>
                  <EmptySeat className="aspect-[3/4]" />
                </motion.div>
              ))}
            </motion.div>
            
            {/* Game Selection - logo only */}
            <motion.div 
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2 }}
              className="grid grid-cols-3 gap-3 px-1"
            >
              {games.slice(0, 6).map((game, i) => (
                <motion.button
                  key={game.id}
                  initial={{ opacity: 0, scale: 0.8 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ delay: 0.25 + i * 0.06 }}
                  whileTap={{ scale: 0.92 }}
                  onClick={() => setSelectedGame(game.id)}
                  className={cn(
                    "min-w-0 aspect-square flex items-center justify-center p-1.5 rounded-2xl transition-all",
                    selectedGame === game.id 
                      ? "bg-purple-500/30 ring-2 ring-purple-400 shadow-lg shadow-purple-500/20" 
                      : "bg-white/10 backdrop-blur-sm border border-amber-200/60"
                  )}
                >
                  <div className="w-full h-full rounded-xl flex items-center justify-center overflow-hidden">
                    {game.logoUrl ? (
                      <img loading="lazy" decoding="async" src={getProxiedUrl(game.logoUrl)} alt={game.name} className="w-full h-full rounded-xl object-contain" draggable={false} />
                    ) : (
                      <span className="text-6xl">{game.emoji}</span>
                    )}
                  </div>
                </motion.button>
              ))}
            </motion.div>
          </div>
        )}
      </main>

      {/* Bottom Controls */}
      <div className="relative z-10 px-4 pb-6 safe-area-bottom space-y-4">
        {!mediaReady && (
          <motion.button
            whileTap={{ scale: 0.95 }}
            onClick={handleEnableMedia}
            disabled={isEnablingMedia}
            className="w-full flex items-center justify-center gap-2 px-5 py-3 rounded-full bg-white/15 backdrop-blur-sm border border-amber-200/60 text-white font-bold disabled:opacity-60"
          >
            <ModeIcon className="w-5 h-5" />
            <span>{isEnablingMedia ? "Starting..." : mode === "audio" ? "Enable Microphone" : "Enable Camera"}</span>
          </motion.button>
        )}

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

          {/* Entry Fee Button (password gating removed — all party rooms are public) */}
          <motion.button
            whileTap={{ scale: 0.9 }}
            onClick={() => setShowRoomLockSheet(true)}
            className={cn(
              "w-12 h-12 rounded-full bg-white/10 backdrop-blur-sm flex items-center justify-center border border-amber-200/60 relative",
              roomEntryFee > 0 && "ring-2 ring-amber-300/80"
            )}
            aria-label="Entry fee"
          >
            <Lock className="w-6 h-6 text-white" />
            {roomEntryFee > 0 && (
              <span className="absolute -top-1 -right-1 w-3 h-3 rounded-full bg-amber-300 border border-purple-900" />
            )}
          </motion.button>

          {/* Let's Party Button */}
          <motion.button
            whileTap={{ scale: 0.95 }}
            onClick={handleCreateParty}
            disabled={isCreating || (mode === "game" && !selectedGame)}
            className="flex items-center gap-3 px-8 py-4 rounded-full bg-gradient-to-r from-pink-500 via-fuchsia-500 to-orange-400 text-white font-bold text-lg shadow-xl shadow-fuchsia-500/40 ring-2 ring-white/30 disabled:opacity-50"
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
                onClick={() => void handleModeChange(item.id as PartyMode)}
                className="relative"
              >
                <span
                  className={cn(
                    "text-lg font-semibold transition-colors",
                    isActive ? "text-white" : "text-white/55"
                  )}
                  style={{ textShadow: isActive ? "0 1px 4px rgba(0,0,0,0.5)" : undefined }}
                >
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

      {/* Entry Fee Sheet (party rooms are always public — no password) */}
      <Dialog open={showRoomLockSheet} onOpenChange={setShowRoomLockSheet}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Entry Fee</DialogTitle>
            <DialogDescription>
              Optionally charge an entry fee in coins. The room stays public for everyone.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label htmlFor="room-entry-fee">Entry fee (coins)</Label>
              <Input
                id="room-entry-fee"
                type="number"
                inputMode="numeric"
                min={0}
                max={100000}
                step={10}
                placeholder="0 = free entry"
                value={roomEntryFee || ''}
                onChange={(e) => {
                  const v = Number(e.target.value);
                  setRoomEntryFee(Number.isFinite(v) ? Math.max(0, Math.min(100000, Math.floor(v))) : 0);
                }}
              />
              <p className="text-xs text-muted-foreground">Viewers pay this from their coin balance to join.</p>
            </div>
          </div>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              variant="ghost"
              onClick={() => { setRoomEntryFee(0); setShowRoomLockSheet(false); }}
            >
              Clear
            </Button>
            <Button onClick={() => setShowRoomLockSheet(false)}>Done</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>



      {/* Settings Panel (Effects, Beauty, Stickers) */}
      <ChametStyleSettingsPanel
        isOpen={showSettingsPanel}
        onClose={() => setShowSettingsPanel(false)}
        isCameraOn={isVideoEnabled}
        onCameraToggle={() => {
          if (isNativeAndroid) {
            const next = !isVideoEnabled;
            setIsVideoEnabled(next);
            if (next && mode !== "audio") {
              void startCameraInstant(true);
            } else {
              void nativeLiveKitController.setCameraEnabled(false).then(() => {
                setNativePreviewActive(false);
                clearNativeMediaSurface();
              });
            }
            return;
          }
          if (stream) {
            stream.getVideoTracks().forEach(track => {
              track.enabled = !isVideoEnabled;
            });
            setIsVideoEnabled(!isVideoEnabled);
          }
        }}
        isMicOn={isMicEnabled}
        onMicToggle={() => {
          if (isNativeAndroid) {
            setIsMicEnabled(!isMicEnabled);
            return;
          }
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
          if (isNativeAndroid) {
            setFacingMode((prev) => prev === "user" ? "environment" : "user");
            toast.info("Camera will switch inside the party room.");
            return;
          }
          if (stream) {
            // Post-2026-06-14: ProCameraEngine arbiter stubbed → `isHeldBy`
            // always false and would falsely block the flip. Trust
            // `proCamera.ready` only (single LiveKit camera path).
            if (!proCamera.ready) {
              toast.error('Camera is busy. Close other camera screens and try again.');
              return;
            }
            stream.getTracks().forEach(track => track.stop());
            releaseAndroidWebViewCamera('create-party:switch-camera');
            const newFacingMode = facingMode === "user" ? "environment" : "user";
            setFacingMode(newFacingMode);
            try {
              const claimedStream = await claimAndroidWebViewCameraForStream(
                () => navigator.mediaDevices.getUserMedia({
                  video: buildPortraitVideoConstraint({ facingMode: newFacingMode, width: 720, height: 960, frameRate: 30 }),
                  audio: true
                }),
                'create-party:switch-camera-new-stream',
              );
              const newStream = await maybeUpgradeToWidestCamera(claimedStream, newFacingMode, 'create-party:switch-camera');
              await enforcePermanentCameraLock(newStream, 'create-party:switch-camera');
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
