import { useState, useRef, useEffect, useCallback } from "react";

import { useNavigate } from "react-router-dom";
import { X, RotateCcw, Grid3X3, Camera, AlertCircle, Wand2, Smile, Sparkles, Share2, Eye, Users, Zap, Star, Gift, Heart, Gamepad2, MapPin, Mic, ArrowLeft, CheckCircle, ShieldAlert, ScanFace, UserPlus, Check, LayoutGrid, Settings, Lock, Ban } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAgoraClient } from "@/hooks/useAgoraClient";
import { AgoraVideoPlayer } from "@/components/live/AgoraVideoPlayer";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { motion, AnimatePresence } from "framer-motion";
import { Badge } from "@/components/ui/badge";
import { LiveGameSelector } from "@/components/games/LiveGameSelector";
import { ProfessionalGameOverlay } from "@/components/party/ProfessionalGameOverlay";
import { useSound } from "@/hooks/useSound";
import { Capacitor } from "@capacitor/core";
import { ChametFaceVerificationModal, ChametSettingsPanel, ChametLiveMoreMenu } from "@/components/live/ChametStyleGoLive";
import BeansIcon from "@/components/common/BeansIcon";
import { BeautyFilterPanel, BeautySettings, generateBeautyCSS } from "@/components/live/BeautyFilterPanel";
import { useDeepARBeauty } from "@/hooks/useDeepARBeauty";
import { useNativeCameraPermission } from "@/hooks/useNativeCameraPermission";
import { useFeatureLevelCheck } from "@/hooks/useFeatureLevelCheck";
import { trackTaskProgress } from "@/hooks/useTaskProgress";
import { clearPreparedHostPreviewStream, setPreparedHostPreviewStream } from "@/features/live/hostPreviewSession";
import { hardenVideoElementForNative } from "@/utils/videoNativeHardening";

const isApprovedLiveHost = (profile?: {
  is_host?: boolean | null;
  host_status?: string | null;
  gender?: string | null;
}) => {
  const normalizedGender = String(profile?.gender ?? '').toLowerCase();
  return Boolean(profile?.is_host) || String(profile?.host_status ?? '').toLowerCase() === 'approved' || normalizedGender === 'female';
};


const GoLive = () => {
  const navigate = useNavigate();
  const videoRef = useRef<HTMLVideoElement>(null);
  const [title, setTitle] = useState("");
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [isStarting, setIsStarting] = useState(false);
  const [facingMode, setFacingMode] = useState<"user" | "environment">("user");
  const [useAgora, setUseAgora] = useState(false);
  const [showGrid, setShowGrid] = useState(false);
  const streamRef = useRef<MediaStream | null>(null);
  const preservePreviewForLiveRef = useRef(false);

  useEffect(() => {
    streamRef.current = stream;
  }, [stream]);
  // Native camera permission hook
  const { getCameraStream, requestCameraPermission, checkPermissionStatus } = useNativeCameraPermission();
  
  // Feature level check hook
  const { checkFeatureAccess, isLoading: featureLevelLoading } = useFeatureLevelCheck();
  const [showLevelRestricted, setShowLevelRestricted] = useState(false);
  const [requiredLevel, setRequiredLevel] = useState(0);
  
  const [showGamePanel, setShowGamePanel] = useState(false);
  
  // Chamet-style UI states
  const [showChametFaceVerification, setShowChametFaceVerification] = useState(false);
  const [showSettingsPanel, setShowSettingsPanel] = useState(false);
  const [showMoreMenu, setShowMoreMenu] = useState(false);
  const [mirrorMode, setMirrorMode] = useState(true);
  const [isMicEnabled, setIsMicEnabled] = useState(true);
  const [previewHasFrame, setPreviewHasFrame] = useState(false);
  const [nativePreviewActive, setNativePreviewActive] = useState(false);
  const nativePreviewStartInFlightRef = useRef(false);

  // ===== UNIFIED DeepAR Camera + Beauty Hook =====
  const {
    isNativeAndroid,
    startNativeCamera,
    stopNativeCamera,
    openBeautyPanel,
    toggleSticker,
    switchNativeCamera,
    facingMode: nativeFacingMode,
    getLastError,
    showBeautyPanel,
    setShowBeautyPanel,
    stickerActive,
    beautyEnabled,
    beautySettings,
    handleBeautySettingsChange,
    handleBeautyEnabledChange,
  } = useDeepARBeauty();



  // Wrapper: start native camera with permission check
  const startNativeDeepARPreview = useCallback(async () => {
    if (!isNativeAndroid) return false;
    if (nativePreviewActive) return true;

    if (nativePreviewStartInFlightRef.current) {
      console.log('[GoLive] Native preview start already in progress');
      return false;
    }

    nativePreviewStartInFlightRef.current = true;
    try {
      const permission = await requestCameraPermission();
      if (!permission.granted) {
        toast.error(permission.error || "Camera permission is required");
        return false;
      }

      // Prevent dual camera ownership (web + native) before native start
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => track.stop());
        streamRef.current = null;
        setStream(null);
      }

      // Keep delay very short for instant startup
      await new Promise((resolve) => setTimeout(resolve, 120));

      const started = await startNativeCamera();
      if (started) {
        setNativePreviewActive(true);
        setShowPermissionPrompt(false);
        setFacingMode('user');
        setPermissionsGranted(prev => ({ ...prev, camera: true, microphone: true }));
      }
      return started;
    } finally {
      nativePreviewStartInFlightRef.current = false;
    }
  }, [isNativeAndroid, nativePreviewActive, requestCameraPermission, startNativeCamera]);

  const stopNativeDeepARPreview = useCallback(async () => {
    await stopNativeCamera();
    setNativePreviewActive(false);
  }, [stopNativeCamera]);

  const openBeautyStudio = useCallback(async () => {
    if (isNativeAndroid) {
      const ok = await openBeautyPanel();
      if (!ok) toast.error("DeepAR Beauty failed to initialize");
    } else {
      // On web: just open the panel — Tencent SDK handles beauty
      setShowBeautyPanel(true);
    }
  }, [isNativeAndroid, openBeautyPanel]);

  const toggleNativeStickerPanel = useCallback(async () => {
    if (!isNativeAndroid) {
      toast.info("AR Stickers are available in the Android app only");
      return;
    }
    await toggleSticker();
  }, [isNativeAndroid, toggleSticker]);

  // Apply CSS beauty filter for web preview (also as fallback when native DeepAR fails)
  const beautyCSS = (isNativeAndroid && nativePreviewActive) ? "" : generateBeautyCSS(beautyEnabled, beautySettings);

  const markPreviewReady = useCallback(() => {
    setPreviewHasFrame(true);
  }, []);

  const attachWebPreviewStream = useCallback((mediaStream: MediaStream) => {
    const videoEl = videoRef.current;
    if (!videoEl) return;

    setPreviewHasFrame(false);
    hardenVideoElementForNative(videoEl, { muted: true });
    videoEl.srcObject = mediaStream;

    const ready = () => setPreviewHasFrame(true);

    videoEl.onloadedmetadata = () => {
      ready();
      videoEl.play().catch((e) => console.log('[GoLive] Video play error:', e));
    };

    requestAnimationFrame(() => {
      videoEl.play().then(ready).catch(() => {});
    });

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
    if (userProfile && !featureLevelLoading) {
      const isHost = isApprovedLiveHost(userProfile);
      const currentLevel = isHost ? userProfile.host_level : userProfile.user_level;
      const result = checkFeatureAccess('go_live', currentLevel, isHost);
      
      if (!result.canAccess) {
        setRequiredLevel(result.requiredLevel);
        setShowLevelRestricted(true);
      }
    }
  }, [userProfile, featureLevelLoading, checkFeatureAccess]);

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
        if (banInfo?.ban_end) {
          setIsBanned(true);
          setBanEndTime(new Date(banInfo.ban_end));
          setBanReason(banInfo.ban_reason || 'Policy violation');
        }
      } else {
        setIsBanned(false);
        setBanEndTime(null);
        setBanReason("");
      }
    };

    checkBanStatus();

    // Listen for live_bans changes in real-time
    const channel = supabase
      .channel('golive-ban-check')
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'live_bans',
      }, () => {
        checkBanStatus();
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
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
    banIntervalRef.current = setInterval(updateCountdown, 1000);

    return () => {
      if (banIntervalRef.current) clearInterval(banIntervalRef.current);
    };
  }, [isBanned, banEndTime]);

  // Handle back button
  const handleBack = async () => {
    clearPreparedHostPreviewStream();
    await stopNativeDeepARPreview();
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
    navigate(-1);
  };

  // Agora client hook
  const {
    isLoading: agoraLoading,
    localVideoTrack,
    leaveChannel,
    switchCamera: agoraSwitchCamera,
  } = useAgoraClient({
    onError: (error) => {
      console.error('Agora error:', error);
      toast.error(`Agora error: ${error.message}`);
    },
  });

  useEffect(() => {
    setPreviewHasFrame(false);
  }, [stream, useAgora, localVideoTrack]);

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
      
      const { data: profile } = await supabase
        .from("profiles")
        .select("id, display_name, avatar_url, user_level, host_level, is_host, host_status, gender, is_face_verified, face_verification_image")
        .eq("id", user.id)
        .single();
      
      if (isMounted) {
        if (profile) setUserProfile(profile);
        setIsLoading(false);
      }

      // Check if permission is ALREADY granted (cached) — only then auto-start
      if (!useAgora && isMounted) {
        const permissionState = await checkPermissionStatus();
        if (permissionState === 'granted') {
          // Permission already granted from a previous session — safe to auto-start
          console.log('[GoLive] Permission already granted, auto-starting camera');
          try {
            if (isNativeAndroid) {
              const started = await startNativeDeepARPreview();
              if (isMounted) {
                setPermissionsGranted(prev => ({ ...prev, camera: true, microphone: true }));
                if (!started) {
                  const fallbackStream = await getCameraStream(true);
                  if (fallbackStream && isMounted) {
                    setStream(fallbackStream);
                    attachWebPreviewStream(fallbackStream);
                  }
                }
              }
            } else {
              const mediaStream = await getCameraStream(true);
              if (isMounted && mediaStream) {
                setStream(mediaStream);
                setPermissionsGranted(prev => ({ ...prev, camera: true, microphone: true }));
                attachWebPreviewStream(mediaStream);
              }
            }
          } catch (err: any) {
            console.warn('[GoLive] Auto-start camera failed:', err?.message);
            if (isMounted) setShowPermissionPrompt(true);
          }
        } else {
          // Not yet granted — show permission prompt, wait for user click
          if (isMounted) setShowPermissionPrompt(true);
        }
      }
    };
    
    initializeGoLive();

    return () => {
      isMounted = false;
      if (preservePreviewForLiveRef.current) return;
      clearPreparedHostPreviewStream();
      if (isNativeAndroid) {
        void stopNativeDeepARPreview();
      }
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop());
        streamRef.current = null;
      }
    };
  }, [navigate, useAgora, isNativeAndroid, getCameraStream, checkPermissionStatus, startNativeDeepARPreview, stopNativeDeepARPreview, attachWebPreviewStream]);

  // Function to actually request permissions when user clicks Allow
  const handleAllowPermissions = async () => {
    setShowPermissionPrompt(false);

    // Native fast-path: try DeepAR first, then web camera fallback
    if (isNativeAndroid) {
      const started = await startNativeDeepARPreview();
      if (started) {
        playSound('notification');
        return;
      }

      // DeepAR failed → try web camera before giving up
      try {
        const fallbackStream = await getCameraStream(true);
        if (fallbackStream) {
          setStream(fallbackStream);
          setPermissionsGranted(prev => ({ ...prev, camera: true, microphone: true }));
          attachWebPreviewStream(fallbackStream);
          playSound('notification');
          return;
        }
      } catch { /* fallthrough */ }

      setShowPermissionPrompt(true);
      toast.error('Camera failed to start. Please check permissions in Settings.');
      return;
    }
    
    // 1. Request Location Permission first
    try {
      console.log('[GoLive] Requesting location permission...');
      
      // First try IP-based location with multiple fallbacks (no permission needed)
      let ipDetected = false;
      
      // Try ipapi.co first
      try {
        const ipLocationResponse = await fetch("https://ipapi.co/json/", { signal: AbortSignal.timeout(4000) });
        if (ipLocationResponse.ok) {
          const ipData = await ipLocationResponse.json();
          if (!ipData.error && ipData.country_code) {
            const countryCode = ipData.country_code;
            const flag = countryCode.toUpperCase().split("").map((c: string) => 
              String.fromCodePoint(127397 + c.charCodeAt(0))
            ).join("");
            setUserLocation({ city: ipData.city || "", country: ipData.country_name || "", flag });
            setPermissionsGranted(prev => ({ ...prev, location: true }));
            ipDetected = true;
            console.log('[GoLive] IP location detected (ipapi):', ipData.city, ipData.country_name);
          }
        }
      } catch (e) { console.log('[GoLive] ipapi.co failed'); }

      // Fallback: ipwho.is
      if (!ipDetected) {
        try {
          const res = await fetch("https://ipwho.is/", { signal: AbortSignal.timeout(4000) });
          if (res.ok) {
            const data = await res.json();
            if (data.success && data.country_code) {
              const flag = data.country_code.toUpperCase().split("").map((c: string) => 
                String.fromCodePoint(127397 + c.charCodeAt(0))
              ).join("");
              setUserLocation({ city: data.city || "", country: data.country || "", flag });
              setPermissionsGranted(prev => ({ ...prev, location: true }));
              ipDetected = true;
              console.log('[GoLive] IP location detected (ipwho.is):', data.city, data.country);
            }
          }
        } catch (e) { console.log('[GoLive] ipwho.is failed'); }
      }

      // Fallback: freeipapi.com
      if (!ipDetected) {
        try {
          const res = await fetch("https://freeipapi.com/api/json", { signal: AbortSignal.timeout(4000) });
          if (res.ok) {
            const data = await res.json();
            if (data.countryCode) {
              const flag = data.countryCode.toUpperCase().split("").map((c: string) => 
                String.fromCodePoint(127397 + c.charCodeAt(0))
              ).join("");
              setUserLocation({ city: data.cityName || "", country: data.countryName || "", flag });
              setPermissionsGranted(prev => ({ ...prev, location: true }));
              ipDetected = true;
              console.log('[GoLive] IP location detected (freeipapi):', data.cityName, data.countryName);
            }
          }
        } catch (e) { console.log('[GoLive] All IP APIs failed'); }
      }
      
      // Also request browser geolocation permission
      if ("geolocation" in navigator) {
        navigator.geolocation.getCurrentPosition(
          async (position) => {
            console.log('[GoLive] Browser geolocation granted');
            setPermissionsGranted(prev => ({ ...prev, location: true }));
            
            // Get more accurate location
            try {
              const { latitude, longitude } = position.coords;
              const geoResponse = await fetch(
                `https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${latitude}&longitude=${longitude}&localityLanguage=en`
              );
              const geoData = await geoResponse.json();
              
              const countryCode = geoData.countryCode || "";
              const flag = countryCode.toUpperCase().split("").map((c: string) => 
                String.fromCodePoint(127397 + c.charCodeAt(0))
              ).join("");
              
              setUserLocation({
                city: geoData.city || geoData.locality || "",
                country: geoData.countryName || "",
                flag: flag,
              });
            } catch (e) {
              console.log('[GoLive] Reverse geocoding failed:', e);
            }
          },
          (error) => {
            console.log('[GoLive] Browser geolocation denied or failed:', error.message);
            // Still mark as "granted" if IP location worked
          },
          { timeout: 10000, enableHighAccuracy: false }
        );
      }
    } catch (error) {
      console.error('[GoLive] Location error:', error);
    }

    // 2. Request Camera & Microphone Permission with native API first
    try {
      console.log('[GoLive] Requesting camera and microphone permissions via native API...');

      if (isNativeAndroid) {
        const started = await startNativeDeepARPreview();
        if (started) {
          playSound('notification');
          return;
        }
        // ═══ FALLBACK: Native failed → web camera ═══
        console.warn('[GoLive] Native camera failed in permission flow, trying web fallback');
        setNativePreviewActive(false);
        try {
          const fallbackStream = await getCameraStream(true);
          if (fallbackStream) {
            setStream(fallbackStream);
            setPermissionsGranted(prev => ({ ...prev, camera: true, microphone: true }));
            setShowPermissionPrompt(false);
            attachWebPreviewStream(fallbackStream);
            toast.info('Using standard camera (Beauty Studio unavailable)');
            playSound('notification');
            return;
          }
        } catch { /* fallthrough */ }
        // Don't re-show permission prompt — permissions ARE granted, just camera failed
        toast.error('Camera failed to start. Please restart the app.');
        return;
      }

      // Request permission using native Capacitor API first
      const permResult = await requestCameraPermission();
      if (!permResult.granted) {
        console.error('[GoLive] Native camera permission denied:', permResult.error);
        toast.error(permResult.error || "Camera Access Failed - Please allow camera access in your device settings.");
        return;
      }

      // Get camera stream with progressive fallback
      const mediaStream = await getCameraStream(true);

      if (!mediaStream) {
        throw new Error('Failed to get camera stream');
      }

      console.log('[GoLive] Camera & Mic access granted, tracks:', mediaStream.getTracks().length);

      setPermissionsGranted(prev => ({ ...prev, camera: true, microphone: true }));
      setStream(mediaStream);
      setFacingMode('user');

      // Play success sound
      playSound('notification');

      attachWebPreviewStream(mediaStream);
    } catch (error: any) {
      console.error("[GoLive] Camera/Mic access error:", error.name, error.message);
      toast.error(error.message || "Camera Access Failed - Please allow camera access in your device settings and restart the app.");
    }
  };

  const startCamera = async () => {
    try {
      if (isNativeAndroid) {
        await stopNativeDeepARPreview();
        const started = await startNativeDeepARPreview();
        if (!started) {
          throw new Error(getLastError() || 'Native camera access failed');
        }
        return;
      }

      if (stream) {
        stream.getTracks().forEach(track => track.stop());
      }

      console.log('[GoLive] Requesting camera via native API...');

      // Request permission using native API first
      const permResult = await requestCameraPermission();
      if (!permResult.granted) {
        console.error('[GoLive] Camera permission denied');
        return;
      }

      // Get camera stream with progressive fallback
      const mediaStream = await getCameraStream(true);

      if (!mediaStream) throw new Error('Camera access failed');

      console.log('[GoLive] Camera access granted, tracks:', mediaStream.getTracks().length);

      setStream(mediaStream);
      setFacingMode('user');

      attachWebPreviewStream(mediaStream);
    } catch (error: any) {
      console.error("[GoLive] Camera access error:", error);
    }
  };

  const handleCameraSwitch = async () => {
    try {
      if (isNativeAndroid && nativePreviewActive) {
        await switchNativeCamera();
        setFacingMode(nativeFacingMode);
        return;
      }

      if (stream) {
        stream.getTracks().forEach(track => track.stop());
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
          mediaStream = await navigator.mediaDevices.getUserMedia(constraint);
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
    }
  };

  const switchCamera = () => {
    if (useAgora && localVideoTrack) {
      agoraSwitchCamera();
    } else {
      handleCameraSwitch();
    }
  };


  const handleGoLive = async () => {
    if (isStarting || agoraLoading) return;

    const isHost = isApprovedLiveHost(userProfile);

    // Check if user has profile photo - show modal instead of toast
    if (!userProfile?.avatar_url) {
      setShowProfileError(true);
      return;
    }

    // Approved hosts can go live directly; regular users still need face verification.
    if (!isHost && !userProfile?.is_face_verified) {
      setShowFaceVerificationRequired(true);
      return;
    }

    if (isNativeAndroid && !nativePreviewActive) {
      const started = await startNativeDeepARPreview();
      if (!started) {
        // Fallback: try web camera instead of blocking Go Live
        console.warn('[GoLive] Native camera failed on Go Live, trying web camera fallback');
        try {
          const fallbackStream = await getCameraStream(true);
          if (fallbackStream) {
            setStream(fallbackStream);
            attachWebPreviewStream(fallbackStream);
            setPermissionsGranted(prev => ({ ...prev, camera: true, microphone: true }));
          } else {
            toast.error('Camera failed to start. Please allow camera permission and retry.');
            return;
          }
        } catch {
          toast.error('Camera failed to start. Please allow camera permission and retry.');
          return;
        }
      }
    }

    setIsStarting(true);

    try {
      const { getCachedUser } = await import('@/utils/cachedAuth');
      const user = await getCachedUser();
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
        const remainingHours = banInfo?.remaining_hours || 0;
        const reason = banInfo?.ban_reason || 'Policy violation';

        toast.error(
          `🚫 Your live has been banned!\n\nReason: ${reason}\nRemaining: ${remainingHours > 24 ? Math.ceil(remainingHours / 24) + ' days' : Math.ceil(remainingHours) + ' hours'}`,
          { duration: 8000 }
        );
        setIsStarting(false);
        return;
      }

      // Emergency cleanup: close any stale active stream for this host before creating a new one
      const nowIso = new Date().toISOString();
      const { data: staleStreams } = await supabase
        .from("live_streams")
        .select("id")
        .eq("host_id", user.id)
        .eq("is_active", true);

      if (staleStreams && staleStreams.length > 0) {
        const staleIds = staleStreams.map((s) => s.id);

        await Promise.all([
          supabase
            .from("stream_viewers")
            .update({ left_at: nowIso })
            .in("stream_id", staleIds)
            .is("left_at", null),
          supabase
            .from("live_streams")
            .update({ is_active: false, ended_at: nowIso, viewer_count: 0 })
            .in("id", staleIds),
        ]);
      }

      // Create live stream record and prefetch Agora token IN PARALLEL for instant connection
      const streamTitle = title.trim() || `${userProfile?.display_name || 'User'}'s Live`;
      
      // Start creating stream record
      const createStreamPromise = supabase
        .from("live_streams")
        .insert({
          host_id: user.id,
          title: streamTitle,
          is_active: true,
          started_at: new Date().toISOString(),
          viewer_count: 0,
          total_coins_earned: 0
        })
        .select()
        .single();

      // Wait for stream creation (we need the ID for navigation)
      const { data: liveStream, error } = await createStreamPromise;
      if (error) throw error;

      // Track first live task progress (non-blocking)
      trackTaskProgress('first_live');

      // Handoff policy:
      // - Web preview: preserve same MediaStream for zero-gap transition
      // - Native DeepAR preview: release camera BEFORE entering LiveStream to avoid Android camera resource crash
      if (isNativeAndroid) {
        preservePreviewForLiveRef.current = false;
        clearPreparedHostPreviewStream();
        if (nativePreviewActive) {
          await stopNativeDeepARPreview();
          await new Promise((resolve) => setTimeout(resolve, 800));
        }
      } else {
        preservePreviewForLiveRef.current = true;
        if (streamRef.current) {
          setPreparedHostPreviewStream(streamRef.current);
        } else {
          clearPreparedHostPreviewStream();
        }
      }

      // Navigate IMMEDIATELY - don't wait for anything else
      // LiveStream page will handle Agora connection in background
      navigate(`/live/${liveStream.id}`, { 
        state: { 
          isHost: true,
          title: title.trim(),
        } 
      });
    } catch (error) {
      console.error("Error starting live:", error);
      toast.error("Failed to start live stream");
      setIsStarting(false);
    }
  };

  const goToEditProfile = async () => {
    clearPreparedHostPreviewStream();
    await stopNativeDeepARPreview();
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
      isNativeAndroid && nativePreviewActive ? "bg-transparent" : "bg-black"
    )}>
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
            <div className="w-20 h-24 rounded-xl overflow-hidden ring-2 ring-pink-500/60 shadow-lg">
              {userProfile?.avatar_url ? (
                <img 
                  src={userProfile.avatar_url} 
                  alt={userProfile.display_name || "User"} 
                  className="w-full h-full object-cover"
                />
              ) : (
                <div className="w-full h-full bg-gradient-to-br from-purple-600 to-pink-600 flex items-center justify-center">
                  <Camera className="w-8 h-8 text-white" />
                </div>
              )}
            </div>
            {/* Verified Badge at Bottom */}
            {userProfile?.is_face_verified ? (
              <div className="absolute -bottom-1 left-1/2 -translate-x-1/2 bg-gradient-to-r from-pink-500 to-purple-500 rounded-md px-2 py-0.5 flex items-center gap-1">
                <Check className="w-3 h-3 text-white" />
              </div>
            ) : (
              <motion.button
                onClick={() => setShowChametFaceVerification(true)}
                className="absolute -bottom-1 left-1/2 -translate-x-1/2 bg-gradient-to-r from-red-500 to-orange-500 rounded-md px-2 py-0.5 flex items-center gap-1"
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
                : 'bg-gray-700/50'
            }`}>
              {userProfile?.is_face_verified ? (
                <Check className="w-5 h-5 text-green-400" />
              ) : (
                <ScanFace className="w-5 h-5 text-red-400" />
              )}
            </div>
            <span className={`text-[10px] ${userProfile?.is_face_verified ? 'text-green-400' : 'text-red-400'}`}>
              {userProfile?.is_face_verified ? 'Verified' : 'Verify'}
            </span>
          </motion.button>

          {/* Close Button */}
          <motion.button
            onClick={handleBack}
            whileTap={{ scale: 0.9 }}
            className="absolute right-4 top-4 w-10 h-10 rounded-full bg-black/40 backdrop-blur-sm flex items-center justify-center"
          >
            <X className="w-5 h-5 text-white" />
          </motion.button>
        </div>
        
        {/* Host Info Badge Row */}
        <div className="px-4 mt-2">
          <div className="inline-flex items-center gap-2 bg-black/40 backdrop-blur-sm rounded-full px-3 py-1.5">
            <span className="text-white text-sm font-semibold">
              {userProfile?.display_name || "Your Name"} {userLocation?.flag || "🌍"}
            </span>
            <span className="text-yellow-400 text-xs">
              ??? ⭐
            </span>
          </div>
          <div className="flex items-center gap-1 mt-1">
            <BeansIcon size={16} />
            <span className="text-amber-300 text-sm">0</span>
          </div>
        </div>
        
        {/* Viewer Count Badge */}
        <div className="absolute left-4 top-36">
          <div className="flex items-center gap-1 bg-pink-500/80 backdrop-blur-sm rounded-full px-2 py-0.5">
            <Users className="w-3 h-3 text-white" />
            <span className="text-white text-xs font-medium">0/1</span>
          </div>
        </div>
      </motion.div>

      {/* Camera View - Full Screen Horizontal */}
      <div className={cn(
        "absolute inset-0 overflow-hidden flex items-center justify-center",
        isNativeAndroid && nativePreviewActive ? "bg-transparent" : "bg-muted"
      )}>
        {useAgora && localVideoTrack ? (
          <AgoraVideoPlayer
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
                  }}
                />
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
                            .from('profiles')
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
            <div className={cn(
              "w-14 h-14 rounded-full flex items-center justify-center border-2 transition-all",
              beautyEnabled 
                ? "bg-gradient-to-br from-pink-500/40 to-purple-500/40 border-pink-400/60 shadow-lg shadow-pink-500/30"
                : "bg-white/10 border-white/20"
            )}>
              <Sparkles className={cn("w-6 h-6", beautyEnabled ? "text-pink-300" : "text-white/70")} />
            </div>
            <span className={cn("text-[11px] font-semibold", beautyEnabled ? "text-pink-300" : "text-white/50")}>Beauty</span>
          </motion.button>

          {/* Sticker — DeepAR native AR effects (Android only) */}
          <motion.button
            whileTap={{ scale: 0.9 }}
            onClick={() => {
              void toggleNativeStickerPanel();
            }}
            className="flex flex-col items-center gap-1 touch-manipulation"
          >
            <div className={cn(
              "w-14 h-14 rounded-full flex items-center justify-center border-2 transition-all",
              stickerActive
                ? "bg-gradient-to-br from-amber-500/40 to-orange-500/40 border-amber-400/60 shadow-lg shadow-amber-500/30"
                : "bg-white/10 border-white/20"
            )}>
              <Smile className={cn("w-6 h-6", stickerActive ? "text-amber-300" : "text-white/70")} />
            </div>
            <span className={cn("text-[11px] font-semibold", stickerActive ? "text-amber-300" : "text-white/50")}>Sticker</span>
          </motion.button>

          {/* Settings (small) */}
          <motion.button
            whileTap={{ scale: 0.9 }}
            onClick={() => setShowSettingsPanel(true)}
            className="flex flex-col items-center gap-1 touch-manipulation"
          >
            <div className="w-14 h-14 rounded-full bg-white/10 border-2 border-white/20 flex items-center justify-center">
              <Settings className="w-6 h-6 text-white/70" />
            </div>
            <span className="text-[11px] text-white/50 font-semibold">More</span>
          </motion.button>
        </div>

        {/* Go Live Button - Chamet Style */}
        <div className="relative px-4">
          <motion.button
            whileTap={{ scale: 0.97 }}
            onClick={handleGoLive}
            disabled={isStarting || agoraLoading}
            className={cn(
              "w-full relative overflow-hidden rounded-full touch-manipulation py-4",
              (isStarting || agoraLoading) && "opacity-70"
            )}
            style={{
              background: 'linear-gradient(to right, #f472b6, #ec4899, #f97316)'
            }}
          >
            <motion.div
              animate={{ x: ["-100%", "200%"] }}
              transition={{ repeat: Infinity, duration: 2, ease: "linear" }}
              className="absolute inset-0 bg-gradient-to-r from-transparent via-white/25 to-transparent skew-x-12"
            />
            <span className="relative text-white text-lg font-bold tracking-wide">
              {isStarting ? "Starting..." : agoraLoading ? "Starting..." : "Go Live"}
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
              void toggleNativeStickerPanel();
            }}
            onBeautyClick={() => {
              setShowSettingsPanel(false);
              void openBeautyStudio();
            }}
          />
        )}
      </AnimatePresence>

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

      {/* DeepAR stickers are handled natively on Android — no web panel needed */}

      {/* Right Side Quick Actions - Removed */}

      {/* Game Panel Preview */}
      <LiveGameSelector
        isOpen={showGamePanel}
        onClose={() => setShowGamePanel(false)}
      />

      {/* Level Restriction Modal */}
      <AnimatePresence>
        {showLevelRestricted && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4"
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="bg-gradient-to-br from-slate-900 to-slate-800 rounded-3xl p-6 max-w-sm w-full border border-red-500/30 shadow-2xl"
            >
              <div className="flex flex-col items-center text-center">
                <div className="w-20 h-20 rounded-full bg-gradient-to-br from-red-500/20 to-orange-500/20 flex items-center justify-center mb-4">
                  <Lock className="w-10 h-10 text-red-400" />
                </div>
                <h3 className="text-xl font-bold text-white mb-2">Level Required</h3>
                <p className="text-slate-400 mb-4">
                  You need to reach <span className="text-amber-400 font-bold">Level {requiredLevel}</span> to start live streaming.
                </p>
                <p className="text-sm text-slate-500 mb-6">
                  Your current level: <span className="text-primary font-semibold">
                    {userProfile?.is_host || userProfile?.gender === 'female' 
                      ? userProfile?.host_level || 0 
                      : userProfile?.user_level || 0}
                  </span>
                </p>
                <div className="flex gap-3 w-full">
                  <Button
                    variant="outline"
                    onClick={() => navigate(-1)}
                    className="flex-1"
                  >
                    Go Back
                  </Button>
                  <Button
                    onClick={() => navigate('/level')}
                    className="flex-1 bg-gradient-to-r from-amber-500 to-orange-500"
                  >
                    Level Up
                  </Button>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

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

      {/* Beauty Filter Panel */}
      <BeautyFilterPanel
        isOpen={showBeautyPanel}
        onClose={() => setShowBeautyPanel(false)}
        settings={beautySettings}
        enabled={beautyEnabled}
        onSettingsChange={handleBeautySettingsChange}
        onEnabledChange={handleBeautyEnabledChange}
      />
    </div>
  );
};

export default GoLive;
