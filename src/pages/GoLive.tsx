import { useState, useRef, useEffect, useLayoutEffect, useCallback } from "react";

import { useNavigate } from "react-router-dom";
import { X, RotateCcw, Grid3X3, Camera, AlertCircle, Wand2, Smile, Sparkles, Share2, Eye, Users, Zap, Star, Gift, Heart, Gamepad2, MapPin, Mic, ArrowLeft, CheckCircle, ShieldAlert, ScanFace, UserPlus, Check, LayoutGrid, Settings, Lock, Ban } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useLiveKitClient } from "@/hooks/useLiveKitClient";
import { useScreenLock } from "@/hooks/useScreenLock";
import { useNativeAudioFocus } from "@/hooks/useNativeAudioFocus";
import { LiveKitVideoPlayer } from "@/components/live/LiveKitVideoPlayer";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { motion, AnimatePresence } from "framer-motion";
import { Badge } from "@/components/ui/badge";
import { LiveGameSelector } from "@/components/games/LiveGameSelector";
import { ProfessionalGameOverlay } from "@/components/party/ProfessionalGameOverlay";
import { useSound } from "@/hooks/useSound";
import { Capacitor } from "@capacitor/core";
import { ChametFaceVerificationModal, ChametSettingsPanel, ChametLiveMoreMenu } from "@/components/live/ChametStyleGoLive";
import PreJoinDevicesDialog from "@/components/livekit/PreJoinDevicesDialog";
import { Sliders } from "lucide-react";
import BeansIcon from "@/components/common/BeansIcon";
import { BeautyFilterPanel, BeautySettings, generateBeautyCSS } from "@/components/live/BeautyFilterPanel";
import StickerOverlay from "@/components/live/StickerOverlay";
import { StickerPanel } from "@/components/live/StickerPanel";
import { useBeautyState } from "@/hooks/useBeautyState";
import { useNativeCameraPermission } from "@/hooks/useNativeCameraPermission";
import { useFeatureLevelCheck } from "@/hooks/useFeatureLevelCheck";
import { useRealtimeLevelProgress } from "@/hooks/useRealtimeLevel";
import { trackTaskProgress } from "@/hooks/useTaskProgress";
import { clearPreparedHostPreviewStream, setPreparedHostPreviewStream } from "@/features/live/hostPreviewSession";
import { hardenVideoElementForNative } from "@/utils/videoNativeHardening";
import { hydrateProfileVerificationState } from "@/utils/profileVerification";
import { recordClientError } from "@/utils/clientErrorLog";
import { LevelLockModal } from "@/components/level/LevelLockModal";
import { runPreflightProbe } from "@/lib/livekitPreflightProbe";
import { claimAndroidWebViewCameraForStream, releaseAndroidWebViewCamera } from "@/lib/androidCameraHandoff";
import { useProCamera } from "@/camera/useProCamera";

const GO_LIVE_PROFILE_FIELDS = "id, display_name, avatar_url, user_level, host_level, max_user_level, is_host, host_status, gender, is_face_verified, face_verification_status, face_verification_image";

const isApprovedLiveHost = (profile?: {
  is_host?: boolean | null;
  host_status?: string | null;
  gender?: string | null;
  is_face_verified?: boolean | null;
}) => {
  // POLICY: Both male and female can go live. Face verification is MANDATORY for everyone.
  // Approved female hosts retain their host_status flow; other face-verified users can also stream.
  if (!profile?.is_face_verified) return false;
  // Approved female host path (host_status='approved')
  if (Boolean(profile?.is_host) && String(profile?.host_status ?? '').toLowerCase() === 'approved') {
    return true;
  }
  // Any other face-verified user (male or female) can also go live
  return true;
};



const GoLive = () => {
  const navigate = useNavigate();
  // Pkg443 Phase-3: keep host's screen awake on the pre-live setup screen.
  useScreenLock(true);
  // Pkg444 Phase-5: politely pause Spotify/YouTube while host previews/streams.
  useNativeAudioFocus({ enabled: true, intent: 'media' });
  const videoRef = useRef<HTMLVideoElement>(null);
  const [title, setTitle] = useState("");
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [isStarting, setIsStarting] = useState(false);
  // Pkg157: pre-join "Checking connection…" probe state.
  const [isProbing, setIsProbing] = useState(false);
  const [facingMode, setFacingMode] = useState<"user" | "environment">("user");
  const [useLiveKit, setUseLiveKit] = useState(false);
  const [showGrid, setShowGrid] = useState(false);
  const streamRef = useRef<MediaStream | null>(null);
  const preservePreviewForLiveRef = useRef(false);

  useEffect(() => {
    streamRef.current = stream;
  }, [stream]);
  // Native camera permission hook
  const { getCameraStream, requestCameraPermission } = useNativeCameraPermission();
  
  // Feature level check hook
  const { checkFeatureAccess, isLoading: featureLevelLoading } = useFeatureLevelCheck();
  const [showLevelRestricted, setShowLevelRestricted] = useState(false);
  const [requiredLevel, setRequiredLevel] = useState(0);
  
  const [showGamePanel, setShowGamePanel] = useState(false);
  
  // Chamet-style UI states
  const [showChametFaceVerification, setShowChametFaceVerification] = useState(false);
  const [showSettingsPanel, setShowSettingsPanel] = useState(false);
  const [showPreJoinDevices, setShowPreJoinDevices] = useState(false);
  const [showMoreMenu, setShowMoreMenu] = useState(false);
  const [mirrorMode, setMirrorMode] = useState(true);
  const [isMicEnabled, setIsMicEnabled] = useState(true);
  const [previewHasFrame, setPreviewHasFrame] = useState(false);
  const [nativePreviewActive, setNativePreviewActive] = useState(false);
  const nativePreviewStartInFlightRef = useRef(false);

  const applyNativePreviewTransparency = useCallback((active: boolean) => {
    if (typeof document === 'undefined') return;
    // Pkg428 — keep face-camera-active class (preview-specific) alongside
    // the shared native-media-active class. Both must be cleared on exit.
    document.documentElement.classList.toggle('native-face-camera-active', active);
    document.body.classList.toggle('native-face-camera-active', active);
    document.documentElement.classList.toggle('native-media-active', active);
    document.body.classList.toggle('native-media-active', active);
  }, []);

  // Pkg428 — synchronous cleanup before next route paints. Prevents the
  // "kalo flash" on home when exiting GoLive while native preview was on.
  useLayoutEffect(() => {
    return () => {
      try {
        document.documentElement.classList.remove('native-face-camera-active', 'native-media-active');
        document.body.classList.remove('native-face-camera-active', 'native-media-active');
      } catch { /* noop */ }
    };
  }, []);


  // ===== UNIFIED native beauty Camera + Beauty Hook =====
  const {
    isNativeAndroid,
    openBeautyPanel,
    toggleSticker,
    showBeautyPanel,
    setShowBeautyPanel,
    stickerActive,
    activeSticker,
    beautyEnabled,
    beautySettings,
    handleBeautySettingsChange,
    handleBeautyEnabledChange,
    handleStickerChange,
  } = useBeautyState();

  useEffect(() => {
    if (!isNativeAndroid) return;
    applyNativePreviewTransparency(nativePreviewActive);
    return () => applyNativePreviewTransparency(false);
  }, [isNativeAndroid, nativePreviewActive, applyNativePreviewTransparency]);



  // Wrapper: start native camera with permission check
  const startNativePreview = useCallback(async () => {
    // Streaming/live preview must use WebRTC/LiveKit camera only. The
    // NativeCamera CameraX plugin is reserved for Face Verification; opening
    // it here creates the exact Camera2 ownership race that produces ColorOS
    // white screens and `handleResized abandoned` surfaces during handoff.
    return false;
  }, []);

  const stopNativePreview = useCallback(async () => {
    applyNativePreviewTransparency(false);
    setNativePreviewActive(false);
  }, [applyNativePreviewTransparency]);

  const openBeautyStudio = useCallback(async () => {
    // Always open the panel — works on web (CSS/MediaPipe) and on Android
    // (with optional native native beauty enhancement when bridge is available).
    setShowBeautyPanel(true);
    if (isNativeAndroid) {
      void openBeautyPanel().catch(() => { /* native optional */ });
    }
  }, [isNativeAndroid, openBeautyPanel, setShowBeautyPanel]);

  const [showStickerPanel, setShowStickerPanel] = useState(false);

  const openStickerPanel = useCallback(() => {
    setShowStickerPanel(true);
  }, []);

  // Apply CSS beauty filter for web preview (also as fallback when native native beauty fails)
  const beautyCSS = (isNativeAndroid && nativePreviewActive) ? "" : generateBeautyCSS(beautyEnabled, beautySettings);

  const markPreviewReady = useCallback(() => {
    const videoEl = videoRef.current;
    if (!videoEl || videoEl.readyState < 2 || videoEl.videoWidth <= 0 || videoEl.videoHeight <= 0) return;
    setPreviewHasFrame(true);
  }, []);

  const attachWebPreviewStream = useCallback((mediaStream: MediaStream) => {
    const videoEl = videoRef.current;
    if (!videoEl) return;

    // Pkg-audit Bug B: single play path. Previously two `play()` calls (one
    // from onloadedmetadata, one from rAF) raced against each other and on
    // Android WebView caused the second play to interrupt the first → blank.
    const currentStream = videoEl.srcObject as MediaStream | null;
    const sameStream = currentStream === mediaStream;

    if (!sameStream) {
      setPreviewHasFrame(false);
    }
    hardenVideoElementForNative(videoEl, { muted: true });
    if (!sameStream) {
      videoEl.srcObject = mediaStream;
    }

    const ready = () => {
      if (videoEl.readyState >= 2 && videoEl.videoWidth > 0 && videoEl.videoHeight > 0) {
        setPreviewHasFrame(true);
      }
    };

    const tryPlay = () => {
      if (!videoEl) return;
      if (!videoEl.paused) { ready(); return; }
      videoEl.play().then(ready).catch((e) => {
        console.log('[GoLive] preview play deferred:', e?.message || e);
      });
    };

    videoEl.onloadedmetadata = tryPlay;
    videoEl.oncanplay = tryPlay;
    videoEl.onplaying = ready;
    tryPlay();

    // Safety net: if no frame event fires, reveal once the underlying track
    // confirms it's live.
    window.setTimeout(() => {
      const hasLiveTrack = mediaStream.getVideoTracks().some((t) => t.readyState === 'live');
      if (hasLiveTrack) ready();
    }, 1400);
  }, []);

  const [userProfile, setUserProfile] = useState<{
    id: string;
    display_name: string;
    avatar_url: string | null;
    user_level: number;
    host_level: number;
    is_host: boolean;
    host_status?: string | null;
    gender: string | null;
    is_face_verified?: boolean;
    face_verification_image?: string | null;
  } | null>(null);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const { level: resolvedUserLevel, loading: resolvedLevelLoading } = useRealtimeLevelProgress(currentUserId);
  const [isLoading, setIsLoading] = useState(true);
  const [showProfileError, setShowProfileError] = useState(false);
  const [showFaceVerificationRequired, setShowFaceVerificationRequired] = useState(false);
  const [showAgencyRequired, setShowAgencyRequired] = useState(false);
  const [showVerifiedAvatarRequired, setShowVerifiedAvatarRequired] = useState(false);
  const [permissionsGranted, setPermissionsGranted] = useState({
    camera: false,
    microphone: false,
    location: false,
  });
  const [showPermissionPrompt, setShowPermissionPrompt] = useState(false);
  const [userLocation, setUserLocation] = useState<{ city: string; country: string; flag: string } | null>(null);
  
  // Live ban state
  const [isBanned, setIsBanned] = useState(false);
  const [banEndTime, setBanEndTime] = useState<Date | null>(null);
  const [banReason, setBanReason] = useState("");
  const [banCountdown, setBanCountdown] = useState({ hours: 0, minutes: 0, seconds: 0 });
  const banIntervalRef = useRef<NodeJS.Timeout | null>(null);
  
  // Sound hook
  const { playSound } = useSound();

  // Check feature level access when user profile is loaded
  useEffect(() => {
    if (userProfile && !featureLevelLoading && !resolvedLevelLoading) {
      const isHost = isApprovedLiveHost(userProfile);
      // Use highest known level — never block a user whose stored level already qualifies
      const currentLevel = Math.max(
        Number(resolvedUserLevel) || 0,
        Number(userProfile.user_level) || 0,
        Number(userProfile.host_level) || 0,
        Number((userProfile as any).max_user_level) || 0,
      );
      const result = checkFeatureAccess('go_live', currentLevel, isHost);

      if (!result.canAccess) {
        setRequiredLevel(result.requiredLevel);
        setShowLevelRestricted(true);
      } else {
        setShowLevelRestricted(false);
      }
    }
  }, [userProfile, featureLevelLoading, resolvedLevelLoading, resolvedUserLevel, checkFeatureAccess]);

  const loadUserProfile = useCallback(async (userId: string) => {
    const { data: profile, error } = await supabase
      .from("profiles")
      .select(GO_LIVE_PROFILE_FIELDS)
      .eq("id", userId)
      .single();

    if (error) throw error;
    if (!profile) return profile;

    return hydrateProfileVerificationState(profile);
  }, []);

  const refreshUserProfile = useCallback(async (userId?: string | null) => {
    const targetUserId = userId || currentUserId;
    if (!targetUserId) return userProfile;

    try {
      const profile = await loadUserProfile(targetUserId);
      setUserProfile(profile);
      return profile;
    } catch (error) {
      console.error('[GoLive] Failed to refresh verification state:', error);
      recordClientError({ label: "GoLive.profile", message: error instanceof Error ? error.message : String(error) });
      return userProfile;
    }
  }, [currentUserId, loadUserProfile, userProfile]);

  // Check live ban status on mount and start countdown
  useEffect(() => {
    if (!userProfile?.id) return;

    const checkBanStatus = async () => {
      const { data: banned } = await supabase.rpc('is_user_live_banned', {
        p_user_id: userProfile.id,
      });

      if (banned) {
        const { data: banData } = await supabase.rpc('get_user_live_ban', {
          p_user_id: userProfile.id,
        });
        const banInfo = banData?.[0];
        if (banInfo) {
          setIsBanned(true);
          setBanEndTime(banInfo.ban_end ? new Date(banInfo.ban_end) : null);
          setBanReason(banInfo.ban_reason || 'Policy violation');
        }
      } else {
        setIsBanned(false);
        setBanEndTime(null);
        setBanReason("");
      }
    };

    checkBanStatus();

    const syncBanStatus = (event?: Event) => {
      const table = (event as CustomEvent | undefined)?.detail?.table;
      if (!table || table === 'live_bans') void checkBanStatus();
    };
    window.addEventListener('admin-table-update', syncBanStatus);

    return () => {
      window.removeEventListener('admin-table-update', syncBanStatus);
    };
  }, [userProfile?.id]);

  // Live countdown timer - updates every second
  useEffect(() => {
    if (!isBanned || !banEndTime) {
      if (banIntervalRef.current) clearInterval(banIntervalRef.current);
      return;
    }

    const updateCountdown = () => {
      const now = new Date();
      const diff = banEndTime.getTime() - now.getTime();

      if (diff <= 0) {
        setIsBanned(false);
        setBanEndTime(null);
        setBanReason("");
        setBanCountdown({ hours: 0, minutes: 0, seconds: 0 });
        if (banIntervalRef.current) clearInterval(banIntervalRef.current);
        toast.success("✅ Your ban has ended! You can now go live.");
        return;
      }

      const hours = Math.floor(diff / (1000 * 60 * 60));
      const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
      const seconds = Math.floor((diff % (1000 * 60)) / 1000);
      setBanCountdown({ hours, minutes, seconds });
    };

    updateCountdown();
    banIntervalRef.current = setInterval(updateCountdown, 1000); // guard-ok: countdown timer only, no fetch/realtime/database work

    return () => {
      if (banIntervalRef.current) clearInterval(banIntervalRef.current);
    };
  }, [isBanned, banEndTime]);

  // Handle back button
  const handleBack = async () => {
    // Pkg-fix: if a native camera start is currently in-flight, wait briefly so
    // we don't tear down state mid-init (which leaves CameraX in an inconsistent
    // state and produces a white preview on re-entry).
    if (nativePreviewStartInFlightRef.current) {
      const deadline = Date.now() + 1500;
      while (nativePreviewStartInFlightRef.current && Date.now() < deadline) {
        await new Promise(r => setTimeout(r, 50));
      }
    }
    clearPreparedHostPreviewStream();
    await stopNativePreview();
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
      releaseAndroidWebViewCamera('golive:back');
    }
    // Pkg-fix: null srcObject so the WebView doesn't keep painting the last
    // (now-stopped) frame as a frozen native-controls overlay on re-entry.
    if (videoRef.current) {
      try { videoRef.current.pause(); } catch { /* ignore */ }
      try { videoRef.current.srcObject = null; } catch { /* ignore */ }
      try { videoRef.current.removeAttribute('src'); videoRef.current.load(); } catch { /* ignore */ }
    }
    navigate(-1);
  };

  // Pkg416/Pkg418: claim the single shared camera slot for streaming. If
  // Face Verification currently holds it, acquire() throws and we HARD
  // BLOCK every camera-start path (handleAllowPermissions early-return)
  // and bounce the host out so two pipelines never race for /dev/video0.
  const proCamera = useProCamera('live-stream', true);
  const proCameraReadyRef = useRef<boolean>(false);
  const proCameraErrorRef = useRef<boolean>(false);
  useEffect(() => {
    proCameraReadyRef.current = proCamera.ready;
    proCameraErrorRef.current = !!proCamera.error;
    if (proCamera.error) {
      toast.error('Camera is busy. Finish Face Verification and try again.');
      // Hard bail: leave GoLive so user can't sit on a stuck white screen.
      const t = setTimeout(() => { try { navigate(-1); } catch { /* ignore */ } }, 1500);
      return () => clearTimeout(t);
    }
  }, [proCamera.error, proCamera.ready, navigate]);

  // LiveKit client hook
  const {
    isLoading: livekitLoading,
    localVideoTrack,
    leaveChannel,
    switchCamera: livekitSwitchCamera,
  } = useLiveKitClient({
    onError: (error) => {
      console.error('LiveKit error:', error);
      recordClientError({ label: "GoLive.handleBack", message: error instanceof Error ? error.message : String(error) });
      toast.error(`LiveKit error: ${error.message}`);
    },
  });

  useEffect(() => {
    setPreviewHasFrame(false);
  }, [stream, useLiveKit, localVideoTrack]);

  // Fetch user profile on mount - camera starts ONLY on user action (Allow button)
  useEffect(() => {
    let isMounted = true;
    
    const initializeGoLive = async () => {
      // Fetch profile first
      const { getCachedUser } = await import('@/utils/cachedAuth');
      const user = await getCachedUser();
      
      if (!user) {
        if (isMounted) {
          toast.error("Please login");
          navigate("/auth");
        }
        return;
      }

      const profile = await loadUserProfile(user.id);
      
      if (isMounted) {
        setCurrentUserId(user.id);
        if (profile) setUserProfile(profile);
        setIsLoading(false);
      }

        // Camera must start from a real tap/click. Auto-starting from mount can
        // make browsers/WebViews ignore the later Allow action, so always show
        // the explicit permission button here.
        if (!useLiveKit && isMounted) setShowPermissionPrompt(true);
    };
    
    initializeGoLive();

    return () => {
      isMounted = false;
      if (preservePreviewForLiveRef.current) return;
      clearPreparedHostPreviewStream();
      if (isNativeAndroid) {
        void stopNativePreview();
      }
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop());
        streamRef.current = null;
        releaseAndroidWebViewCamera('golive:unmount');
      }
      // Pkg-fix: clear video element srcObject on unmount so a stale stopped
      // stream never leaves a "play" icon ghost in the WebView paint cache.
      if (videoRef.current) {
        try { videoRef.current.pause(); } catch { /* ignore */ }
        try { videoRef.current.srcObject = null; } catch { /* ignore */ }
      }
    };
  }, [navigate, useLiveKit, isNativeAndroid, getCameraStream, startNativePreview, stopNativePreview, attachWebPreviewStream, loadUserProfile]);

  useEffect(() => {
    if (!currentUserId) return;

    const syncVerificationState = () => {
      void refreshUserProfile(currentUserId);
    };

    const handleAdminUpdate = (event: Event) => {
      const table = (event as CustomEvent).detail?.table;
      if (table === 'profiles' || table === 'face_verification_submissions' || table === 'host_applications') syncVerificationState();
    };
    window.addEventListener('admin-table-update', handleAdminUpdate);

    return () => {
      window.removeEventListener('admin-table-update', handleAdminUpdate);
    };
  }, [currentUserId, refreshUserProfile]);

  // Function to actually request permissions when user clicks Allow
  const handleAllowPermissions = async () => {
    // Pkg418 hard gate: never start ANY camera path while ProCamera arbiter
    // says verification family holds the slot (or hasn't granted us yet).
    if (proCameraErrorRef.current || !proCameraReadyRef.current) {
      toast.error('Camera is busy. Finish Face Verification and try again.');
      return;
    }
    setShowPermissionPrompt(false);

    if (isNativeAndroid) {
      try {
        const permission = await requestCameraPermission({ includeMicrophone: true });
        if (!permission.granted) throw new Error(permission.error || 'Camera permission denied.');
        setPermissionsGranted(prev => ({ ...prev, camera: true, microphone: true }));
        playSound('notification');
        return;
      } catch (error: any) {
        console.error("[GoLive] Native camera/mic permission error:", error?.name, error?.message || error);
        recordClientError({ label: "GoLive.nativePermission", message: error instanceof Error ? error.message : String(error) });
        setShowPermissionPrompt(true);
        toast.error(error?.message || "Camera Access Failed - Please allow camera access in your device settings and restart the app.");
        return;
      }
    }

    // Browser/Android WebView permission must be requested by the same user
    // tap. Do not run native probes, timeout waits, or a second permission
    // check before getUserMedia — that loses the browser gesture context.
    try {
      const mediaStream = await getCameraStream(true);
      if (!mediaStream) throw new Error('Failed to get camera stream');
      setPermissionsGranted(prev => ({ ...prev, camera: true, microphone: true }));
      setStream(mediaStream);
      setFacingMode('user');
      attachWebPreviewStream(mediaStream);
      playSound('notification');
      return;
    } catch (error: any) {
      console.error("[GoLive] Camera/Mic access error:", error?.name, error?.message || error);
      recordClientError({ label: "GoLive.mediaStream", message: error instanceof Error ? error.message : String(error) });
      setShowPermissionPrompt(true);
      toast.error(error?.message || "Camera Access Failed - Please allow camera access in your device settings and restart the app.");
      return;
    }
  };

  const handleCameraSwitch = async () => {
    try {
      if (isNativeAndroid) return;

      // Pkg-audit Bug C: only stop the VIDEO tracks on camera flip — keep
      // the microphone track alive so the host's audio doesn't go silent
      // (Android WebView won't re-grant mic without a fresh user gesture).
      if (stream) {
        stream.getVideoTracks().forEach((track) => track.stop());
        releaseAndroidWebViewCamera('golive:switch-camera');
      }


      const newFacingMode = facingMode === 'user' ? 'environment' : 'user';

      console.log('[GoLive] Switching camera to:', newFacingMode);

      // Progressive fallback for camera switch
      let mediaStream: MediaStream | null = null;
      const constraints = [
        {
          video: {
            facingMode: newFacingMode,
            width: { min: 1280, ideal: 1920, max: 1920 },
            height: { min: 720, ideal: 1080, max: 1080 },
            frameRate: { min: 24, ideal: 30, max: 30 },
            aspectRatio: { ideal: 16 / 9 },
          },
          audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true }
        },
        { video: { facingMode: newFacingMode, width: { ideal: 1280 }, height: { ideal: 720 } }, audio: true },
        { video: { facingMode: newFacingMode }, audio: true },
        { video: true, audio: true }
      ];

      for (const constraint of constraints) {
        try {
          mediaStream = await claimAndroidWebViewCameraForStream(
            () => navigator.mediaDevices.getUserMedia(constraint),
            'golive:switch-camera-new-stream',
          );
          break;
        } catch {
          continue;
        }
      }

      if (!mediaStream) return;

      setStream(mediaStream);
      setFacingMode(newFacingMode);

      attachWebPreviewStream(mediaStream);
    } catch (error) {
      console.error("Camera switch error:", error);
      recordClientError({ label: "GoLive.constraints", message: error instanceof Error ? error.message : String(error) });
    }
  };

  const switchCamera = () => {
    if (useLiveKit && localVideoTrack) {
      livekitSwitchCamera();
    } else {
      handleCameraSwitch();
    }
  };


  const handleGoLive = async () => {
    if (isStarting || isProbing || livekitLoading) return;

    const effectiveProfile = await refreshUserProfile();
    const resolvedProfile = effectiveProfile || userProfile;
    const isHost = isApprovedLiveHost(resolvedProfile);

    // Check if user has profile photo - show modal instead of toast
    if (!resolvedProfile?.avatar_url) {
      setShowProfileError(true);
      return;
    }

    // Approved hosts can go live directly; regular users still need face verification.
    if (!isHost && !resolvedProfile?.is_face_verified) {
      setShowFaceVerificationRequired(true);
      return;
    }

    const nativePermissionsReady = isNativeAndroid && permissionsGranted.camera && permissionsGranted.microphone;
    if (!nativePermissionsReady && !streamRef.current?.getVideoTracks().some((track) => track.readyState === 'live')) {
      setShowPermissionPrompt(true);
      toast.error('Please allow camera and microphone first.');
      return;
    }

    // Pkg157: brief pre-join connection probe (1.5s budget) — Chamet/Bigo parity.
    // Shows "Checking connection…" overlay so the tap feels responsive while
    // we measure RTT; warns on poor network but never blocks Go Live.
    setIsProbing(true);
    try {
      const probe = await runPreflightProbe();
      if (probe.quality === 'poor') {
        toast.warning('Weak network detected — video may start in low quality.');
      }
    } catch { /* probe never throws, just in case */ }
    setIsProbing(false);

    setIsStarting(true);

    try {
      const { getCachedUser } = await import('@/utils/cachedAuth');
      let user = await getCachedUser();
      if (!user) {
        const { data: authData } = await supabase.auth.getUser();
        user = authData.user ?? null;
      }
      if (!user) {
        setIsStarting(false);
        toast.error("Please login");
        navigate("/auth");
        return;
      }

      // 🚫 Check if user is live banned before allowing stream
      const { data: isBanned } = await supabase.rpc('is_user_live_banned', {
        p_user_id: user.id,
      });

      if (isBanned) {
        const { data: banData } = await supabase.rpc('get_user_live_ban', {
          p_user_id: user.id,
        });

        const banInfo = banData?.[0];
        const banEnd = banInfo?.ban_end ? new Date(banInfo.ban_end) : null;
        const remainingHours = banEnd ? Math.max(0, Math.ceil((banEnd.getTime() - Date.now()) / (1000 * 60 * 60))) : null;
        const reason = banInfo?.ban_reason || 'Policy violation';

        toast.error(
          `🚫 Your live has been banned!\n\nReason: ${reason}\nRemaining: ${remainingHours === null ? 'Permanent' : (remainingHours > 24 ? Math.ceil(remainingHours / 24) + ' days' : remainingHours + ' hours')}`,
          { duration: 8000 }
        );
        setIsStarting(false);
        return;
      }

      // Create live stream record through the server RPC so title moderation,
      // host eligibility, one-active-stream cleanup, privacy defaults, and
      // server-managed counters all stay in one DB-controlled path. Do not
      // directly patch stream_viewers/live_streams here: those fields are
      // guarded and the trusted RPC closes stale host sessions safely.
      const streamTitle = title.trim() || `${userProfile?.display_name || 'User'}'s Live`;

      const { data: startResult, error } = await supabase.rpc('start_live_stream', {
        p_title: streamTitle,
        p_thumbnail_url: null,
        p_display_name: userProfile?.display_name || 'User',
        p_category_id: null,
        p_live_privacy: 'public',
        p_password: null,
      });
      if (error) throw error;

      const parsedStart = startResult as any;
      if (!parsedStart?.success || !parsedStart?.stream?.id) {
        throw new Error(parsedStart?.reason || parsedStart?.error || 'Failed to start live stream');
      }

      const liveStream = parsedStart.stream;

      // Track first live task progress (non-blocking)
      trackTaskProgress('first_live');

      // Handoff policy:
      // - Web preview: preserve same MediaStream for zero-gap transition
      // - Native native beauty preview: release camera BEFORE entering LiveStream to avoid Android camera resource crash
      if (isNativeAndroid) {
        preservePreviewForLiveRef.current = false;
        clearPreparedHostPreviewStream({ stopTracks: true });
        if (streamRef.current) {
          streamRef.current.getTracks().forEach(track => track.stop());
          streamRef.current = null;
          setStream(null);
        }
        await stopNativePreview();
      } else {
        // Preserve the real WebView camera stream on Android when native preview
        // was unavailable/no-op. If native LiveKit is disabled or falls back to
        // web publishing, LiveStream can publish this already-user-approved track
        // instead of trying getUserMedia again outside the tap gesture.
        preservePreviewForLiveRef.current = true;
        if (streamRef.current) {
          setPreparedHostPreviewStream(streamRef.current);
        } else {
          clearPreparedHostPreviewStream();
        }
      }

      // Navigate IMMEDIATELY - don't wait for anything else
      // LiveStream page will handle LiveKit connection in background
      navigate(`/live/${liveStream.id}`, { 
        state: { 
          isHost: true,
          title: title.trim(),
          hostInfo: userProfile ? {
            id: userProfile.id,
            name: userProfile.display_name || 'Host',
            avatar: userProfile.avatar_url || '',
            level: Number(userProfile.host_level || userProfile.user_level || 1),
            gender: userProfile.gender || 'female',
          } : undefined,
        } 
      });
    } catch (error) {
      const rawMessage = error instanceof Error
        ? error.message
        : typeof error === 'string'
          ? error
          : (error as any)?.message || (error as any)?.details || (error as any)?.hint || 'Failed to start live stream';
      const message = String(rawMessage).includes('ban_expires_at')
        ? 'Live ban check was out of sync. Please try Go Live again.'
        : String(rawMessage);
      console.error("Error starting live:", error);
      recordClientError({ label: "GoLive.createStreamPromise", message });
      toast.error(message || "Failed to start live stream");
      setIsStarting(false);
    }
  };

  const goToEditProfile = async () => {
    clearPreparedHostPreviewStream();
    await stopNativePreview();
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
    navigate("/edit-profile");
  };


  // Don't show loading spinner - camera should start immediately
  // Only block if truly loading profile AND camera hasn't started
  if (isLoading && !stream) {
    return (
      <div className="fixed inset-0 bg-gradient-to-br from-slate-950 via-purple-950 to-slate-950 z-50 flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-white/20 border-t-white rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className={cn(
      "room-viewport z-50 flex flex-col overflow-hidden",
      // Pkg415: on native Android keep the shell transparent even while
      // CameraX is starting — otherwise bg-black overlays the TextureView
      // for ~120ms causing a black/white flash before the camera shows.
      isNativeAndroid ? "bg-transparent" : "bg-black"
    )} data-room-shell>
      {/* Safe Area Padding - Universal Mobile Support */}
      <style>{`
        .go-live-container {
          padding-top: max(env(safe-area-inset-top, 0px), var(--min-top-inset, 20px));
          padding-bottom: max(env(safe-area-inset-bottom, 0px), var(--min-bottom-inset, 0px), 16px);
          padding-left: env(safe-area-inset-left, 0px);
          padding-right: env(safe-area-inset-right, 0px);
        }
      `}</style>
      
      {/* Subtle Gradient Overlay */}
      <div className="absolute inset-0 pointer-events-none bg-gradient-to-b from-black/40 via-transparent to-black/60 z-[5]" />
      
      {/* Chamet-Style Header with Co-Host Slot */}
      <motion.div 
        initial={{ y: -30, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ delay: 0.1, type: "spring", stiffness: 120 }}
        className="absolute top-0 left-0 right-0 z-20 go-live-container"
      >
        {/* Host Avatar Row with Co-Host Slot */}
        <div className="px-4 pt-4 flex items-start gap-3">
          {/* Main Host Avatar with Verified Badge */}
          <motion.button 
            onClick={goToEditProfile}
            className="relative flex-shrink-0"
            whileTap={{ scale: 0.95 }}
          >
            <div
              className="w-20 h-24 rounded-2xl overflow-hidden relative"
              style={{
                boxShadow: '0 0 0 2px rgba(236,72,153,0.65), 0 8px 22px -6px rgba(236,72,153,0.55), inset 0 1px 0 rgba(255,255,255,0.15)',
              }}
            >
              {userProfile?.avatar_url ? (
                <img loading="lazy" decoding="async" 
                  src={userProfile.avatar_url} 
                  alt={userProfile.display_name || "User"} 
                  className="w-full h-full object-contain" />
              ) : (
                <div className="w-full h-full bg-gradient-to-br from-purple-600 to-pink-600 flex items-center justify-center">
                  <Camera className="w-8 h-8 text-white" />
                </div>
              )}
              <div
                className="pointer-events-none absolute inset-0"
                style={{
                  background: 'linear-gradient(115deg, transparent 42%, rgba(255,255,255,0.22) 50%, transparent 58%)',
                  animation: 'giftSendShine 3.6s ease-in-out infinite',
                }}
              />
            </div>
            {/* Verified Badge at Bottom */}
            {userProfile?.is_face_verified ? (
              <div
                className="absolute -bottom-1 left-1/2 -translate-x-1/2 rounded-md px-2 py-0.5 flex items-center gap-1"
                style={{
                  background: 'linear-gradient(135deg, #ec4899 0%, #a855f7 100%)',
                  boxShadow: '0 4px 12px -2px rgba(168,85,247,0.55), inset 0 1px 0 rgba(255,255,255,0.35)',
                }}
              >
                <Check className="w-3 h-3 text-white" />
              </div>
            ) : (
              <motion.button
                onClick={() => setShowChametFaceVerification(true)}
                className="absolute -bottom-1 left-1/2 -translate-x-1/2 rounded-md px-2 py-0.5 flex items-center gap-1"
                style={{
                  background: 'linear-gradient(135deg, #ef4444 0%, #f97316 100%)',
                  boxShadow: '0 4px 12px -2px rgba(239,68,68,0.55), inset 0 1px 0 rgba(255,255,255,0.30)',
                }}
                animate={{ scale: [1, 1.05, 1] }}
                transition={{ repeat: Infinity, duration: 1.5 }}
              >
                <AlertCircle className="w-3 h-3 text-white" />
              </motion.button>
            )}
          </motion.button>
          
          {/* Face Verification Slot - Only for face verification */}
          <motion.button
            whileTap={{ scale: 0.95 }}
            onClick={() => {
              if (!userProfile?.is_face_verified) {
                navigate('/face-verification');
              } else {
                toast.success("Face Verification Complete ✓");
              }
            }}
            className={`w-20 h-24 rounded-xl backdrop-blur-sm border-2 border-dashed flex flex-col items-center justify-center gap-1 ${
              userProfile?.is_face_verified 
                ? 'bg-green-500/20 border-green-500/50' 
                : 'bg-gray-800/50 border-red-500/50'
            }`}
          >
            <div className={`w-10 h-10 rounded-full flex items-center justify-center ${
              userProfile?.is_face_verified 
                ? 'bg-green-500/30' 
                : 'bg-red-500/20'
            }`}>
              {userProfile?.is_face_verified ? (
                <Check className="w-5 h-5 text-green-400" />
              ) : (
                <div className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
              )}
            </div>
            <span className={`text-[10px] ${userProfile?.is_face_verified ? 'text-green-400' : 'text-red-400'}`}>
              {userProfile?.is_face_verified ? 'Verified' : 'Verify'}
            </span>
          </motion.button>

          {/* Close Button */}
          <motion.button
            onClick={handleBack}
            whileTap={{ scale: 0.88 }}
            className="absolute right-4 top-4 w-10 h-10 rounded-full flex items-center justify-center border border-white/15"
            style={{
              background: 'rgba(0,0,0,0.45)',
              backdropFilter: 'blur(14px)',
              WebkitBackdropFilter: 'blur(14px)',
              boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.08)',
            }}
          >
            <X className="w-5 h-5 text-white" />
          </motion.button>
        </div>
        
        {/* Host Info Badge Row */}
        <div className="px-4 mt-2">
          <div
            className="inline-flex items-center gap-2 rounded-full px-3 py-1.5 border border-white/10"
            style={{
              background: 'linear-gradient(135deg, rgba(0,0,0,0.55), rgba(0,0,0,0.35))',
              backdropFilter: 'blur(14px)',
              WebkitBackdropFilter: 'blur(14px)',
              boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.08)',
            }}
          >
            <span className="text-white text-sm font-semibold">
              {userProfile?.display_name || "Your Name"} {userLocation?.flag || "🌍"}
            </span>
          </div>
          <div className="flex items-center gap-1 mt-1.5">
            <BeansIcon size={16} />
            <span className="text-amber-300 text-sm font-semibold tabular-nums">0</span>
          </div>
        </div>
        
      </motion.div>

      {/* Camera View - Full Screen Horizontal */}
      <div className={cn(
        "absolute inset-0 overflow-hidden flex items-center justify-center",
        // Android native preview is a TextureView behind the WebView; never
        // use the light-theme muted background here because it is visually the
        // same white screen the user reported while CameraX warms up.
        isNativeAndroid ? "bg-transparent" : "bg-black"
      )}>
        {useLiveKit && localVideoTrack ? (
          <LiveKitVideoPlayer
            videoTrack={localVideoTrack}
            mirror={facingMode === 'user'}
            fit="cover"
            className="w-full h-full"
          />
        ) : (
          <div className="relative w-full h-full camera-locked">
            {isNativeAndroid && nativePreviewActive ? (
              <div className="absolute inset-0 pointer-events-none" />
            ) : (
              <>
                {/* Video element — must remain in DOM for WebGL texture source */}
                <video 
                  ref={videoRef}
                  autoPlay
                  playsInline
                  muted
                  controls={false}
                  disablePictureInPicture
                  disableRemotePlayback
                  controlsList="nodownload nofullscreen noremoteplayback noplaybackrate"
                  poster=""
                  onLoadedMetadata={markPreviewReady}
                  onCanPlay={markPreviewReady}
                  onCanPlayThrough={markPreviewReady}
                  onLoadedData={markPreviewReady}
                  onPlaying={markPreviewReady}
                  // @ts-ignore - vendor-specific attributes for Android
                  x5-video-player-type="h5"
                  x5-video-player-fullscreen="false"
                  x5-video-orientation="portrait"
                  x5-playsinline="true"
                  webkit-playsinline="true"
                  x-webkit-airplay="deny"
                  className="absolute inset-0 w-full h-full object-cover pointer-events-none"
                  style={{
                    transform: facingMode === 'user' ? 'scaleX(-1)' : 'none',
                    filter: beautyCSS || undefined,
                    WebkitAppearance: 'none',
                  }}/>
                <div
                  className="absolute inset-0 pointer-events-none"
                  style={{
                    backgroundColor: previewHasFrame ? 'transparent' : '#000',
                    transition: 'background-color 200ms ease',
                  }}
                />
              </>
            )}
          </div>
        )}

        {/* Grid Overlay for better framing */}
        {showGrid && (
          <div className="absolute inset-0 pointer-events-none">
            <div className="absolute left-1/3 top-0 bottom-0 w-px bg-white/30" />
            <div className="absolute left-2/3 top-0 bottom-0 w-px bg-white/30" />
            <div className="absolute top-1/3 left-0 right-0 h-px bg-white/30" />
            <div className="absolute top-2/3 left-0 right-0 h-px bg-white/30" />
          </div>
        )}

      </div>

      {/* Profile Photo Error Modal */}
      <AnimatePresence>
        {showProfileError && (
          <motion.div
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <motion.div
              className="bg-gradient-to-b from-purple-900 to-purple-950 rounded-3xl p-6 max-w-sm w-full border border-white/20"
              initial={{ scale: 0.9, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.9, y: 20 }}
            >
              <div className="flex flex-col items-center text-center">
                <div className="w-20 h-20 rounded-full bg-red-500/20 flex items-center justify-center mb-4">
                  <Camera className="w-10 h-10 text-red-400" />
                </div>
                <h3 className="text-xl font-bold text-white mb-2">
                  Profile Photo Required!
                </h3>
                <p className="text-white/70 mb-6">
                  Please upload a profile photo to start your live stream.
                </p>
                <div className="flex gap-3 w-full">
                  <Button
                    variant="outline"
                    className="flex-1 rounded-full border-white/20 text-white"
                    onClick={() => setShowProfileError(false)}
                  >
                    Cancel
                  </Button>
                  <Button
                    className="flex-1 rounded-full bg-gradient-to-r from-pink-500 to-purple-600"
                    onClick={goToEditProfile}
                  >
                    Upload Photo
                  </Button>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Face Verification Required Modal for Hosts */}
      <AnimatePresence>
        {showFaceVerificationRequired && (
          <motion.div
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <motion.div
              className="bg-gradient-to-b from-pink-900/90 to-purple-950 rounded-3xl p-6 max-w-sm w-full border border-pink-500/30 shadow-2xl"
              initial={{ scale: 0.9, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.9, y: 20 }}
            >
              <div className="flex flex-col items-center text-center">
                {/* Icon with animation */}
                <motion.div 
                  className="relative mb-5"
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  transition={{ type: "spring", stiffness: 200, delay: 0.1 }}
                >
                  <div className="w-24 h-24 rounded-full bg-gradient-to-br from-pink-500/20 to-purple-500/20 flex items-center justify-center">
                    <div className="w-16 h-16 rounded-full bg-gradient-to-br from-pink-500 to-purple-600 flex items-center justify-center">
                      <ScanFace className="w-8 h-8 text-white" />
                    </div>
                  </div>
                  <motion.div
                    animate={{ scale: [1, 1.2, 1] }}
                    transition={{ repeat: Infinity, duration: 1.5 }}
                    className="absolute -top-1 -right-1 w-8 h-8 rounded-full bg-gradient-to-br from-orange-400 to-red-500 flex items-center justify-center border-2 border-purple-950"
                  >
                    <ShieldAlert className="w-4 h-4 text-white" />
                  </motion.div>
                </motion.div>

                {/* Title */}
                <h3 className="text-xl font-bold text-white mb-2">
                  Face Verification Required!
                </h3>
                
                {/* Description */}
                <p className="text-white/70 text-sm mb-2">
                  You need to complete face verification to start live streaming.
                </p>
                
                {/* Important Notice */}
                <div className="w-full p-3 rounded-xl bg-pink-500/10 border border-pink-500/20 mb-5">
                  <p className="text-pink-300 text-xs">
                    <span className="font-semibold">Important:</span> You must verify with your own photo. Photos of others will not be accepted. The same rules apply to everyone.
                  </p>
                </div>

                {/* Feature highlights */}
                <div className="w-full space-y-2 mb-5">
                  <div className="flex items-center gap-2 p-2 rounded-lg bg-white/5">
                    <CheckCircle className="w-4 h-4 text-green-400" />
                    <span className="text-white/80 text-xs">Safe and Confidential</span>
                  </div>
                  <div className="flex items-center gap-2 p-2 rounded-lg bg-white/5">
                    <CheckCircle className="w-4 h-4 text-green-400" />
                    <span className="text-white/80 text-xs">Complete in One Minute</span>
                  </div>
                  <div className="flex items-center gap-2 p-2 rounded-lg bg-white/5">
                    <CheckCircle className="w-4 h-4 text-green-400" />
                    <span className="text-white/80 text-xs">Get Verified Badge</span>
                  </div>
                </div>

                {/* Buttons */}
                <div className="flex gap-3 w-full">
                  <Button
                    variant="outline"
                    className="flex-1 rounded-full border-white/20 text-white hover:bg-white/10"
                    onClick={() => setShowFaceVerificationRequired(false)}
                  >
                    Later
                  </Button>
                  <Button
                    className="flex-1 rounded-full bg-gradient-to-r from-pink-500 to-purple-600 hover:from-pink-600 hover:to-purple-700 text-white font-bold"
                    onClick={() => {
                      if (stream) {
                        stream.getTracks().forEach(track => track.stop());
                      }
                      navigate("/face-verification");
                    }}
                  >
                    <ScanFace className="w-4 h-4 mr-2" />
                    Verify Now
                  </Button>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Agency Required Modal */}
      <AnimatePresence>
        {showAgencyRequired && (
          <motion.div
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <motion.div
              className="bg-gradient-to-b from-slate-900 to-slate-950 rounded-3xl p-6 max-w-sm w-full border border-amber-500/30 shadow-2xl"
              initial={{ scale: 0.9, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.9, y: 20 }}
            >
              <div className="flex flex-col items-center text-center">
                <div className="w-16 h-16 rounded-full bg-gradient-to-br from-amber-500/20 to-orange-500/20 flex items-center justify-center mb-4 border border-amber-500/30">
                  <Users className="w-8 h-8 text-amber-400" />
                </div>
                <h3 className="text-white text-xl font-bold mb-2">Agency Required</h3>
                <p className="text-white/60 text-sm mb-6">
                  You must join an agency before going live. Please join an agency first to start streaming.
                </p>
                <div className="flex gap-3 w-full">
                  <Button
                    variant="outline"
                    className="flex-1 rounded-full border-white/20 text-white hover:bg-white/10"
                    onClick={() => setShowAgencyRequired(false)}
                  >
                    Later
                  </Button>
                  <Button
                    className="flex-1 rounded-full bg-gradient-to-r from-amber-500 to-orange-500 text-white font-bold"
                    onClick={() => {
                      if (stream) {
                        stream.getTracks().forEach(track => track.stop());
                      }
                      navigate("/join-agency");
                    }}
                  >
                    <UserPlus className="w-4 h-4 mr-2" />
                    Join Agency
                  </Button>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Verified Avatar Required Modal */}
      <AnimatePresence>
        {showVerifiedAvatarRequired && (
          <motion.div
            className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/90"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <motion.div
              className="bg-gradient-to-b from-slate-900 to-slate-950 rounded-3xl p-6 max-w-sm w-full border border-orange-500/30 shadow-2xl"
              initial={{ scale: 0.9, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.9, y: 20 }}
            >
              <div className="flex flex-col items-center text-center">
                {/* Icon */}
                <motion.div className="relative mb-5">
                  <div className="w-24 h-24 rounded-full bg-gradient-to-br from-orange-500/20 to-red-500/20 flex items-center justify-center">
                    <div className="w-16 h-16 rounded-full bg-gradient-to-br from-orange-500 to-red-500 flex items-center justify-center">
                      <Camera className="w-8 h-8 text-white" />
                    </div>
                  </div>
                  <motion.div
                    animate={{ scale: [1, 1.2, 1] }}
                    transition={{ repeat: Infinity, duration: 1.5 }}
                    className="absolute -top-1 -right-1 w-8 h-8 rounded-full bg-gradient-to-br from-red-400 to-red-600 flex items-center justify-center border-2 border-purple-950"
                  >
                    <X className="w-4 h-4 text-white" />
                  </motion.div>
                </motion.div>

                {/* Title */}
                <h3 className="text-xl font-bold text-white mb-2">
                  Set Your Real Photo!
                </h3>
                
                {/* Description */}
                <p className="text-white/70 text-sm mb-2">
                  Please set your verified face photo as your profile picture. Then tap Go Live.
                </p>
                
                {/* Important Notice */}
                <div className="w-full p-3 rounded-xl bg-red-500/10 border border-red-500/20 mb-5">
                  <p className="text-red-300 text-xs">
                    <span className="font-semibold">⚠️ Important:</span> You can only go live with the photo you used for face verification. Other photos are not allowed.
                  </p>
                </div>

                {/* Buttons */}
                <div className="flex gap-3 w-full">
                  <Button
                    variant="outline"
                    className="flex-1 rounded-full border-white/20 text-white hover:bg-white/10"
                    onClick={() => setShowVerifiedAvatarRequired(false)}
                  >
                    Cancel
                  </Button>
                  <Button
                    className="flex-1 rounded-full bg-gradient-to-r from-orange-500 to-red-600 hover:from-orange-600 hover:to-red-700 text-white font-bold"
                    onClick={async () => {
                      // Auto-set avatar to verified face image
                      if (userProfile?.face_verification_image) {
                        try {
                          await supabase
                            .from('profiles') // guard-ok: owner-only self avatar update, not a cross-user read
                            .update({ avatar_url: userProfile.face_verification_image })
                            .eq('id', userProfile.id);
                          
                          setUserProfile(prev => prev ? {
                            ...prev,
                            avatar_url: prev.face_verification_image || prev.avatar_url
                          } : null);
                          
                          setShowVerifiedAvatarRequired(false);
                          toast.success("Profile photo updated!");
                        } catch {
                          toast.error("Update failed");
                        }
                      }
                    }}
                  >
                    <Camera className="w-4 h-4 mr-2" />
                    Update Photo
                  </Button>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Permission Prompt Modal */}
      <AnimatePresence>
        {showPermissionPrompt && (
          <motion.div
            className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/90"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <motion.div
              className="bg-gradient-to-b from-slate-900 to-slate-950 rounded-3xl p-6 max-w-sm w-full border border-white/20 shadow-2xl"
              initial={{ scale: 0.9, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.9, y: 20 }}
            >
              <div className="flex flex-col items-center text-center">
                {/* Icon */}
                <div className="relative mb-6">
                  <div className="w-24 h-24 rounded-full bg-gradient-to-br from-pink-500/20 to-purple-500/20 flex items-center justify-center">
                    <div className="w-16 h-16 rounded-full bg-gradient-to-br from-pink-500 to-purple-600 flex items-center justify-center">
                      <Camera className="w-8 h-8 text-white" />
                    </div>
                  </div>
                  <motion.div
                    animate={{ scale: [1, 1.2, 1] }}
                    transition={{ repeat: Infinity, duration: 2 }}
                    className="absolute -bottom-1 -right-1 w-8 h-8 rounded-full bg-gradient-to-br from-green-400 to-green-600 flex items-center justify-center border-2 border-slate-900"
                  >
                    <Mic className="w-4 h-4 text-white" />
                  </motion.div>
                </div>

                {/* Title */}
                <h3 className="text-xl font-bold text-white mb-2">
                  Allow Permissions
                </h3>
                
                {/* Description */}
                <p className="text-white/70 text-sm mb-6">
                  MeriLive needs access to your camera and microphone to start a live stream.
                </p>

                {/* Permission List */}
                <div className="w-full space-y-3 mb-6">
                  <div className="flex items-center gap-3 p-3 rounded-xl bg-white/5 border border-white/10">
                    <div className="w-10 h-10 rounded-full bg-pink-500/20 flex items-center justify-center">
                      <Camera className="w-5 h-5 text-pink-400" />
                    </div>
                    <div className="text-left flex-1">
                      <p className="text-white text-sm font-medium">Camera</p>
                      <p className="text-white/50 text-xs">For video streaming</p>
                    </div>
                    <CheckCircle className="w-5 h-5 text-green-400" />
                  </div>

                  <div className="flex items-center gap-3 p-3 rounded-xl bg-white/5 border border-white/10">
                    <div className="w-10 h-10 rounded-full bg-blue-500/20 flex items-center justify-center">
                      <Mic className="w-5 h-5 text-blue-400" />
                    </div>
                    <div className="text-left flex-1">
                      <p className="text-white text-sm font-medium">Microphone</p>
                      <p className="text-white/50 text-xs">For audio streaming</p>
                    </div>
                    <CheckCircle className="w-5 h-5 text-green-400" />
                  </div>

                  <div className="flex items-center gap-3 p-3 rounded-xl bg-white/5 border border-white/10">
                    <div className="w-10 h-10 rounded-full bg-green-500/20 flex items-center justify-center">
                      <MapPin className="w-5 h-5 text-green-400" />
                    </div>
                    <div className="text-left flex-1">
                      <p className="text-white text-sm font-medium">Location</p>
                      <p className="text-white/50 text-xs">Show your country flag</p>
                    </div>
                    <CheckCircle className="w-5 h-5 text-green-400" />
                  </div>
                </div>

                {/* Buttons */}
                <div className="flex gap-3 w-full">
                  <Button
                    variant="outline"
                    className="flex-1 rounded-full border-white/20 text-white hover:bg-white/10"
                    onClick={handleBack}
                  >
                    Cancel
                  </Button>
                  <Button
                    className="flex-1 rounded-full bg-gradient-to-r from-green-500 to-emerald-600 hover:from-green-600 hover:to-emerald-700 text-white font-bold"
                    onClick={handleAllowPermissions}
                  >
                    Allow
                  </Button>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Chamet-Style Bottom Controls */}
      <motion.div
        initial={{ y: 50, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ delay: 0.2, type: "spring", stiffness: 120 }}
        className="absolute bottom-0 left-0 right-0 z-20"
        style={{ paddingBottom: 'max(env(safe-area-inset-bottom, 0px), 24px)' }}
      >
        {/* Background Gradient for Visibility */}
        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/40 to-transparent pointer-events-none" />

        {/* Quick Action Bar — Beauty & Sticker */}
        <div className="relative flex items-center justify-center gap-6 px-6 mb-4">
          {/* Beauty */}
          <motion.button
            whileTap={{ scale: 0.9 }}
            onClick={() => {
              void openBeautyStudio();
            }}
            className="flex flex-col items-center gap-1 touch-manipulation"
          >
            <div
              className="w-14 h-14 rounded-full flex items-center justify-center border-2 transition-all relative overflow-hidden"
              style={
                beautyEnabled
                  ? {
                      background: 'linear-gradient(135deg, rgba(236,72,153,0.45) 0%, rgba(168,85,247,0.40) 100%)',
                      borderColor: 'rgba(244,114,182,0.65)',
                      boxShadow: '0 6px 18px -4px rgba(236,72,153,0.55), inset 0 1px 0 rgba(255,255,255,0.20)',
                    }
                  : {
                      background: 'linear-gradient(135deg, rgba(255,255,255,0.12), rgba(255,255,255,0.06))',
                      borderColor: 'rgba(255,255,255,0.20)',
                      backdropFilter: 'blur(12px)',
                      WebkitBackdropFilter: 'blur(12px)',
                      boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.10)',
                    }
              }
            >
              <Sparkles className={cn("w-6 h-6 relative z-10", beautyEnabled ? "text-pink-200" : "text-white/75")} />
              {beautyEnabled && (
                <div
                  className="absolute inset-0 pointer-events-none"
                  style={{
                    background: 'linear-gradient(115deg, transparent 42%, rgba(255,255,255,0.25) 50%, transparent 58%)',
                    animation: 'giftSendShine 2.8s ease-in-out infinite',
                  }}
                />
              )}
            </div>
            <span className={cn("text-[11px] font-semibold", beautyEnabled ? "text-pink-200" : "text-white/55")}>Beauty</span>
          </motion.button>

          {/* Sticker — Opens Beauty Panel Stickers Tab */}
          <motion.button
            whileTap={{ scale: 0.9 }}
            onClick={openStickerPanel}
            className="flex flex-col items-center gap-1 touch-manipulation"
          >
            <div
              className="w-14 h-14 rounded-full flex items-center justify-center border-2 transition-all relative overflow-hidden"
              style={
                stickerActive
                  ? {
                      background: 'linear-gradient(135deg, rgba(245,158,11,0.45) 0%, rgba(249,115,22,0.40) 100%)',
                      borderColor: 'rgba(251,191,36,0.65)',
                      boxShadow: '0 6px 18px -4px rgba(245,158,11,0.55), inset 0 1px 0 rgba(255,255,255,0.20)',
                    }
                  : {
                      background: 'linear-gradient(135deg, rgba(255,255,255,0.12), rgba(255,255,255,0.06))',
                      borderColor: 'rgba(255,255,255,0.20)',
                      backdropFilter: 'blur(12px)',
                      WebkitBackdropFilter: 'blur(12px)',
                      boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.10)',
                    }
              }
            >
              <Smile className={cn("w-6 h-6 relative z-10", stickerActive ? "text-amber-200" : "text-white/75")} />
              {stickerActive && (
                <div
                  className="absolute inset-0 pointer-events-none"
                  style={{
                    background: 'linear-gradient(115deg, transparent 42%, rgba(255,255,255,0.25) 50%, transparent 58%)',
                    animation: 'giftSendShine 2.8s ease-in-out infinite',
                  }}
                />
              )}
            </div>
            <span className={cn("text-[11px] font-semibold", stickerActive ? "text-amber-200" : "text-white/55")}>Sticker</span>
          </motion.button>

          {/* Settings (small) */}
          <motion.button
            whileTap={{ scale: 0.9 }}
            onClick={() => setShowSettingsPanel(true)}
            className="flex flex-col items-center gap-1 touch-manipulation"
          >
            <div
              className="w-14 h-14 rounded-full border-2 border-white/20 flex items-center justify-center"
              style={{
                background: 'linear-gradient(135deg, rgba(255,255,255,0.12), rgba(255,255,255,0.06))',
                backdropFilter: 'blur(12px)',
                WebkitBackdropFilter: 'blur(12px)',
                boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.10)',
              }}
            >
              <Settings className="w-6 h-6 text-white/75" />
            </div>
            <span className="text-[11px] text-white/55 font-semibold">More</span>
          </motion.button>

        </div>

        {/* Go Live Button - Chamet Style */}
        <div className="relative px-4">
          <motion.button
            whileTap={{ scale: 0.97 }}
            onClick={handleGoLive}
            disabled={isStarting || isProbing || livekitLoading}
            className={cn(
              "w-full relative overflow-hidden rounded-full touch-manipulation py-4",
              (isStarting || isProbing || livekitLoading) && "opacity-70"
            )}
            style={{
              background: 'linear-gradient(95deg, #f472b6 0%, #ec4899 50%, #f97316 100%)',
              boxShadow: '0 10px 28px -8px rgba(236,72,153,0.65), 0 4px 12px -2px rgba(249,115,22,0.45), inset 0 1px 0 rgba(255,255,255,0.30)',
              animation: 'giftSendBreathe 2.4s ease-in-out infinite',
            }}
          >
            <motion.div
              animate={{ x: ["-100%", "200%"] }}
              transition={{ repeat: Infinity, duration: 2, ease: "linear" }}
              className="absolute inset-0 bg-gradient-to-r from-transparent via-white/30 to-transparent skew-x-12"
            />
            <span className="relative text-white text-lg font-bold tracking-wide drop-shadow-[0_1px_2px_rgba(0,0,0,0.25)]">
              {isProbing ? "Checking connection..." : (isStarting || livekitLoading) ? "Starting..." : "Go Live"}
            </span>
          </motion.button>
        </div>
      </motion.div>

      {/* Chamet Face Verification Modal */}
      <AnimatePresence>
        {showChametFaceVerification && (
          <ChametFaceVerificationModal
            isOpen={showChametFaceVerification}
            onClose={() => setShowChametFaceVerification(false)}
            onStartVerification={() => {
              if (stream) {
                stream.getTracks().forEach(track => track.stop());
              }
              navigate("/face-verification");
            }}
          />
        )}
      </AnimatePresence>

      {/* Chamet Settings Panel */}
      <AnimatePresence>
        {showSettingsPanel && (
          <ChametSettingsPanel
            isOpen={showSettingsPanel}
            onClose={() => setShowSettingsPanel(false)}
            mirrorMode={mirrorMode}
            onMirrorToggle={() => setMirrorMode(!mirrorMode)}
            isFrontCamera={facingMode === 'user'}
            onCameraSwitch={switchCamera}
            isMicEnabled={isMicEnabled}
            onMicToggle={() => setIsMicEnabled(!isMicEnabled)}
            onStickerClick={() => {
              setShowSettingsPanel(false);
              openStickerPanel();
            }}
            onBeautyClick={() => {
              setShowSettingsPanel(false);
              void openBeautyStudio();
            }}
          />
        )}
      </AnimatePresence>

      {/* Pkg144: Pre-join device picker */}
      <PreJoinDevicesDialog open={showPreJoinDevices} onOpenChange={setShowPreJoinDevices} />



      {/* Chamet More Menu */}
      <AnimatePresence>
        {showMoreMenu && (
          <ChametLiveMoreMenu
            isOpen={showMoreMenu}
            onClose={() => setShowMoreMenu(false)}
            onPKClick={() => toast.info("PK Battle coming soon!")}
            onGiftClick={() => toast.info("Gifts feature for live!")}
            onMessagesClick={() => navigate('/chat')}
            onShareClick={async () => {
              // Extract stream ID from current URL path (e.g., /live/abc123)
              const currentPath = window.location.pathname;
              const streamIdMatch = currentPath.match(/\/live\/([^\/]+)/);
              const currentStreamId = streamIdMatch?.[1] || '';
              
              const { generateLiveStreamLink, shareLink } = await import('@/utils/shareLinks');
              const link = generateLiveStreamLink(currentStreamId);
              await shareLink(link, { title: 'My Live Stream', text: 'Join my live stream!' });
            }}
            onTasksClick={() => navigate('/tasks')}
            onTopUpClick={() => navigate('/recharge')}
            onMusicClick={() => toast.info("Music player coming soon!")}
            onSettingsClick={() => {
              setShowMoreMenu(false);
              setShowSettingsPanel(true);
            }}
            messageCount={0}
          />
        )}
      </AnimatePresence>

      {/* native beauty stickers are handled natively on Android — no web panel needed */}

      {/* Right Side Quick Actions - Removed */}

      {/* Game Panel Preview */}
      <LiveGameSelector
        isOpen={showGamePanel}
        onClose={() => setShowGamePanel(false)}
      />

      {/* Level Restriction Modal — premium shared component */}
      <LevelLockModal
        open={showLevelRestricted}
        onClose={() => navigate(-1)}
        featureName="Go Live"
        requiredLevel={requiredLevel}
        currentLevel={
          (userProfile?.is_host || userProfile?.gender === 'female')
            ? (userProfile?.host_level || 0)
            : (userProfile?.user_level || 0)
        }
        isHost={Boolean(userProfile?.is_host) || userProfile?.gender === 'female'}
      />

      {/* Live Ban Overlay with Countdown */}
      <AnimatePresence>
        {isBanned && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[60] bg-black/90 backdrop-blur-md flex items-center justify-center p-6"
          >
            <motion.div
              initial={{ scale: 0.8, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.8, opacity: 0 }}
              className="w-full max-w-sm"
            >
              <div className="flex flex-col items-center text-center">
                {/* Ban Icon */}
                <div className="w-24 h-24 rounded-full bg-gradient-to-br from-red-500/30 to-red-900/30 border-2 border-red-500/50 flex items-center justify-center mb-5 animate-pulse">
                  <Ban className="w-12 h-12 text-red-400" />
                </div>

                <h3 className="text-xl font-bold text-white mb-2">🚫 Live Banned</h3>
                <p className="text-slate-400 text-sm mb-5">
                  Reason: <span className="text-red-400 font-semibold">{banReason}</span>
                </p>

                {/* Countdown Timer */}
                <div className="bg-slate-900/80 border border-red-500/30 rounded-2xl p-5 w-full mb-5">
                  <p className="text-white/50 text-xs mb-3 uppercase tracking-wider">Time Remaining</p>
                  <div className="flex items-center justify-center gap-3">
                    {/* Hours */}
                    <div className="flex flex-col items-center">
                      <div className="w-16 h-16 bg-red-500/10 border border-red-500/30 rounded-xl flex items-center justify-center">
                        <span className="text-2xl font-bold text-red-400 font-mono">
                          {String(banCountdown.hours).padStart(2, '0')}
                        </span>
                      </div>
                      <span className="text-[10px] text-white/40 mt-1">Hours</span>
                    </div>
                    <span className="text-red-400 text-xl font-bold animate-pulse">:</span>
                    {/* Minutes */}
                    <div className="flex flex-col items-center">
                      <div className="w-16 h-16 bg-red-500/10 border border-red-500/30 rounded-xl flex items-center justify-center">
                        <span className="text-2xl font-bold text-red-400 font-mono">
                          {String(banCountdown.minutes).padStart(2, '0')}
                        </span>
                      </div>
                      <span className="text-[10px] text-white/40 mt-1">Minutes</span>
                    </div>
                    <span className="text-red-400 text-xl font-bold animate-pulse">:</span>
                    {/* Seconds */}
                    <div className="flex flex-col items-center">
                      <div className="w-16 h-16 bg-red-500/10 border border-red-500/30 rounded-xl flex items-center justify-center">
                        <span className="text-2xl font-bold text-red-400 font-mono">
                          {String(banCountdown.seconds).padStart(2, '0')}
                        </span>
                      </div>
                      <span className="text-[10px] text-white/40 mt-1">Seconds</span>
                    </div>
                  </div>
                </div>

                <p className="text-white/30 text-xs mb-5">
                  Auto-unbanned when time expires
                </p>

                <Button
                  variant="outline"
                  onClick={() => navigate(-1)}
                  className="w-full border-slate-700 text-white/70"
                >
                  <ArrowLeft className="w-4 h-4 mr-2" />
                  Go Back
                </Button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Beauty Filter Panel (Beauty Only) */}
      <BeautyFilterPanel
        isOpen={showBeautyPanel}
        onClose={() => setShowBeautyPanel(false)}
        settings={beautySettings}
        enabled={beautyEnabled}
        onSettingsChange={handleBeautySettingsChange}
        onEnabledChange={handleBeautyEnabledChange}
      />

      {/* Separate Sticker Panel */}
      <StickerPanel
        isOpen={showStickerPanel}
        onClose={() => setShowStickerPanel(false)}
        activeSticker={activeSticker}
        onStickerChange={handleStickerChange}
      />

      {/* Face-tracked Sticker Overlay */}
      <StickerOverlay stickerName={activeSticker} onDismiss={() => handleStickerChange(null)} />

      {/* Pkg157: Pre-join connection warmup overlay (Chamet/Bigo parity) */}
      <AnimatePresence>
        {(isProbing || isStarting) && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18 }}
            className="fixed inset-0 z-[80] flex items-center justify-center bg-black/55 backdrop-blur-[2px] pointer-events-none"
          >
            <div className="flex flex-col items-center gap-3 px-6 py-5 rounded-2xl bg-black/60 border border-white/10 shadow-2xl">
              <div className="relative h-10 w-10">
                <div className="absolute inset-0 rounded-full border-2 border-white/15" />
                <div className="absolute inset-0 rounded-full border-2 border-t-primary border-r-primary/60 border-b-transparent border-l-transparent animate-spin" />
              </div>
              <div className="text-white text-sm font-medium tracking-wide">
                {isProbing ? 'Checking connection…' : 'Going live…'}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default GoLive;
