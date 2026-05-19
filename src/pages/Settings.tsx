import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { isNativeApp } from "@/utils/nativeUtils";
import { 
  ArrowLeft, 
  ChevronRight, 
  Globe, 
  Ban, 
  Shield, 
  FileText, 
  Info, 
  Star, 
  Trash2, 
  Smartphone,
  Headphones,
  LogOut,
  Check,
  Bell,
  Camera,
  Mic,
  MapPin,
  UserX,
  AlertTriangle,
  Calendar,
  Users
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Switch } from "@/components/ui/switch";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { registerFCMToken } from "@/services/firebaseMessaging";
import { getAppInfo } from "@/utils/nativeUtils";
import { recordClientError } from "@/utils/clientErrorLog";
import {
  checkPermissionStatus,
  openNativeAppPermissionSettings,
  requestCameraPermission as requestNativeCameraPermission,
  requestLocationPermission as requestNativeLocationPermission,
  requestMicrophonePermission as requestNativeMicrophonePermission,
  requestNotificationPermission as requestNativeNotificationPermission,
} from "@/utils/nativePermissions";

// World languages - English names only (no native scripts)
const worldLanguages = [
  { code: "auto", name: "Automatic", displayName: "Automatic", flag: "🌍" },
  { code: "en", name: "English", displayName: "English", flag: "🇺🇸", countries: ["US", "GB", "AU", "CA"] },
  { code: "hi", name: "Hindi", displayName: "Hindi", flag: "🇮🇳", countries: ["IN"] },
  { code: "ar", name: "Arabic", displayName: "Arabic", flag: "🇸🇦", countries: ["SA", "AE", "QA", "KW", "OM", "BH", "EG"] },
  { code: "ur", name: "Urdu", displayName: "Urdu", flag: "🇵🇰", countries: ["PK"] },
  { code: "zh", name: "Chinese", displayName: "Chinese", flag: "🇨🇳", countries: ["CN", "TW", "HK", "SG"] },
  { code: "ja", name: "Japanese", displayName: "Japanese", flag: "🇯🇵", countries: ["JP"] },
  { code: "ko", name: "Korean", displayName: "Korean", flag: "🇰🇷", countries: ["KR"] },
  { code: "es", name: "Spanish", displayName: "Spanish", flag: "🇪🇸", countries: ["ES", "MX", "AR", "CO"] },
  { code: "fr", name: "French", displayName: "French", flag: "🇫🇷", countries: ["FR", "CA", "BE"] },
  { code: "de", name: "German", displayName: "German", flag: "🇩🇪", countries: ["DE", "AT", "CH"] },
  { code: "it", name: "Italian", displayName: "Italian", flag: "🇮🇹", countries: ["IT"] },
  { code: "pt", name: "Portuguese", displayName: "Portuguese", flag: "🇧🇷", countries: ["BR", "PT"] },
  { code: "ru", name: "Russian", displayName: "Russian", flag: "🇷🇺", countries: ["RU"] },
  { code: "tr", name: "Turkish", displayName: "Turkish", flag: "🇹🇷", countries: ["TR"] },
  { code: "th", name: "Thai", displayName: "Thai", flag: "🇹🇭", countries: ["TH"] },
  { code: "vi", name: "Vietnamese", displayName: "Vietnamese", flag: "🇻🇳", countries: ["VN"] },
  { code: "id", name: "Indonesian", displayName: "Indonesian", flag: "🇮🇩", countries: ["ID"] },
  { code: "ms", name: "Malay", displayName: "Malay", flag: "🇲🇾", countries: ["MY", "SG", "BN"] },
  { code: "tl", name: "Filipino", displayName: "Filipino", flag: "🇵🇭", countries: ["PH"] },
  { code: "ne", name: "Nepali", displayName: "Nepali", flag: "🇳🇵", countries: ["NP"] },
  { code: "si", name: "Sinhala", displayName: "Sinhala", flag: "🇱🇰", countries: ["LK"] },
  { code: "ta", name: "Tamil", displayName: "Tamil", flag: "🇮🇳", countries: ["IN", "LK", "SG"] },
  { code: "te", name: "Telugu", displayName: "Telugu", flag: "🇮🇳", countries: ["IN"] },
  { code: "ml", name: "Malayalam", displayName: "Malayalam", flag: "🇮🇳", countries: ["IN"] },
  { code: "mr", name: "Marathi", displayName: "Marathi", flag: "🇮🇳", countries: ["IN"] },
  { code: "gu", name: "Gujarati", displayName: "Gujarati", flag: "🇮🇳", countries: ["IN"] },
  { code: "pa", name: "Punjabi", displayName: "Punjabi", flag: "🇮🇳", countries: ["IN", "PK"] },
  { code: "nl", name: "Dutch", displayName: "Dutch", flag: "🇳🇱", countries: ["NL", "BE"] },
  { code: "pl", name: "Polish", displayName: "Polish", flag: "🇵🇱", countries: ["PL"] },
  { code: "uk", name: "Ukrainian", displayName: "Ukrainian", flag: "🇺🇦", countries: ["UA"] },
  { code: "ro", name: "Romanian", displayName: "Romanian", flag: "🇷🇴", countries: ["RO"] },
  { code: "el", name: "Greek", displayName: "Greek", flag: "🇬🇷", countries: ["GR"] },
  { code: "hu", name: "Hungarian", displayName: "Hungarian", flag: "🇭🇺", countries: ["HU"] },
  { code: "cs", name: "Czech", displayName: "Czech", flag: "🇨🇿", countries: ["CZ"] },
  { code: "sv", name: "Swedish", displayName: "Swedish", flag: "🇸🇪", countries: ["SE"] },
  { code: "da", name: "Danish", displayName: "Danish", flag: "🇩🇰", countries: ["DK"] },
  { code: "no", name: "Norwegian", displayName: "Norwegian", flag: "🇳🇴", countries: ["NO"] },
  { code: "fi", name: "Finnish", displayName: "Finnish", flag: "🇫🇮", countries: ["FI"] },
  { code: "he", name: "Hebrew", displayName: "Hebrew", flag: "🇮🇱", countries: ["IL"] },
  { code: "fa", name: "Persian", displayName: "Persian", flag: "🇮🇷", countries: ["IR"] },
  { code: "sw", name: "Swahili", displayName: "Swahili", flag: "🇰🇪", countries: ["KE", "TZ"] },
  { code: "am", name: "Amharic", displayName: "Amharic", flag: "🇪🇹", countries: ["ET"] },
];

type PermissionKey = 'notifications' | 'camera' | 'microphone' | 'location';

const DEFAULT_PERMISSIONS: Record<PermissionKey, boolean> = {
  notifications: false,
  camera: false,
  microphone: false,
  location: false,
};

const PERMISSION_CACHE_KEY = 'meri_settings_permissions_v1';

const readCachedPermissions = (): Record<PermissionKey, boolean> => {
  if (typeof window === 'undefined') return { ...DEFAULT_PERMISSIONS };
  try {
    return { ...DEFAULT_PERMISSIONS, ...JSON.parse(localStorage.getItem(PERMISSION_CACHE_KEY) || '{}') };
  } catch {
    return { ...DEFAULT_PERMISSIONS };
  }
};

const writeCachedPermissions = (next: Record<PermissionKey, boolean>) => {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(PERMISSION_CACHE_KEY, JSON.stringify(next));
  } catch {}
};

const Settings = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { t, i18n } = useTranslation();
  const [showLogoutDialog, setShowLogoutDialog] = useState(false);
  const [showLanguageDialog, setShowLanguageDialog] = useState(false);
  const [showPermissionsDialog, setShowPermissionsDialog] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [showDeleteConfirmDialog, setShowDeleteConfirmDialog] = useState(false);
  const [loading, setLoading] = useState(false);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [selectedLanguage, setSelectedLanguage] = useState("auto");
  const [detectedCountry, setDetectedCountry] = useState<string | null>(null);
  const [deletionInfo, setDeletionInfo] = useState<{
    deletionRequestedAt: string | null;
    deletionScheduledAt: string | null;
  } | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  
  // Permission states
  const [permissions, setPermissions] = useState<Record<PermissionKey, boolean>>(() => readCachedPermissions());

  const updatePermissions = useCallback((patch: Partial<Record<PermissionKey, boolean>>) => {
    setPermissions(prev => {
      const next = { ...prev, ...patch };
      writeCachedPermissions(next);
      return next;
    });
  }, []);

  const refreshPermissions = useCallback(async () => {
    try {
      const cachedPermissions = readCachedPermissions();
      const nextPermissions = { ...cachedPermissions };

      if (isNativeApp()) {
        Object.assign(nextPermissions, await checkPermissionStatus());
      } else {
        if ('Notification' in window) {
          nextPermissions.notifications = Notification.permission === 'granted';
        }
        if (navigator.permissions) {
          try {
            const camPerm = await navigator.permissions.query({ name: 'camera' as PermissionName });
            nextPermissions.camera = camPerm.state === 'granted';
          } catch {}
          try {
            const micPerm = await navigator.permissions.query({ name: 'microphone' as PermissionName });
            nextPermissions.microphone = micPerm.state === 'granted';
          } catch {}
          try {
            const locPerm = await navigator.permissions.query({ name: 'geolocation' as PermissionName });
            nextPermissions.location = locPerm.state === 'granted';
          } catch {}
        }
      }

      updatePermissions(nextPermissions);
    } catch (error) {
      console.error('Error checking permissions:', error);
      recordClientError({ label: "Settings.locPerm", message: error instanceof Error ? error.message : String(error) });
    }
  }, [updatePermissions]);
  
  // App version state
  const [appVersion, setAppVersion] = useState<{ version: string; build: string }>({ version: "1.0.0", build: "1" });

  // Fetch user and deletion info
  useEffect(() => {
    const fetchUserData = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        setUserId(user.id);
        const { data: profile } = await supabase
          .from("profiles")
          .select("deletion_requested_at, deletion_scheduled_at")
          .eq("id", user.id)
          .single();
        
        if (profile) {
          setDeletionInfo({
            deletionRequestedAt: profile.deletion_requested_at,
            deletionScheduledAt: profile.deletion_scheduled_at,
          });
        }
      }
    };
    fetchUserData();
  }, []);

  // Auto-detect language based on country
  useEffect(() => {
    const detectLanguage = async () => {
      try {
        // Check saved language first
        const savedLang = localStorage.getItem("meri_app_language");
        if (savedLang) {
          setSelectedLanguage(savedLang);
          return;
        }

        // Try multiple IP APIs for language detection
        let countryCode = null;

        // API 1: ipapi.co
        try {
          const response = await fetch("https://ipapi.co/json/", { signal: AbortSignal.timeout(4000) });
          if (response.ok) {
            const data = await response.json();
            if (data.country_code && !data.error) countryCode = data.country_code;
          }
        } catch (e) { /* fallback */ }

        // API 2: ipwho.is (if API 1 failed)
        if (!countryCode) {
          try {
            const response = await fetch("https://ipwho.is/", { signal: AbortSignal.timeout(4000) });
            if (response.ok) {
              const data = await response.json();
              if (data.success && data.country_code) countryCode = data.country_code;
            }
          } catch (e) { /* fallback */ }
        }

        // API 3: freeipapi.com
        if (!countryCode) {
          try {
            const response = await fetch("https://freeipapi.com/api/json", { signal: AbortSignal.timeout(4000) });
            if (response.ok) {
              const data = await response.json();
              if (data.countryCode) countryCode = data.countryCode;
            }
          } catch (e) { /* ignore */ }
        }

        if (countryCode) {
          setDetectedCountry(countryCode);
          const matchingLang = worldLanguages.find(
            lang => lang.countries?.includes(countryCode)
          );
          if (matchingLang) {
            setSelectedLanguage(matchingLang.code);
            localStorage.setItem("meri_app_language", matchingLang.code);
          }
        }
      } catch (error) {
        console.error("Language detection error:", error);
        recordClientError({ label: "Settings.matchingLang", message: error instanceof Error ? error.message : String(error) });
      }
    };

    detectLanguage();
  }, []);

  // Fetch native app version on mount
  useEffect(() => {
    const fetchAppVersion = async () => {
      try {
        const info = await getAppInfo();
        setAppVersion({ version: info.version, build: info.build });
        console.log('[Settings] App version:', info.version, 'Build:', info.build);
      } catch (error) {
        console.error('[Settings] Failed to get app version:', error);
        recordClientError({ label: "Settings.info", message: error instanceof Error ? error.message : String(error) });
      }
    };
    fetchAppVersion();
  }, []);

  const handleLanguageChange = (langCode: string) => {
    setSelectedLanguage(langCode);
    localStorage.setItem("meri_app_language", langCode);
    
    // Change i18n language
    const i18nLang = langCode === "auto" ? "en" : langCode;
    i18n.changeLanguage(i18nLang);
    
    setShowLanguageDialog(false);
    toast({
      title: t("settings.languageChanged"),
      description: worldLanguages.find(l => l.code === langCode)?.name || langCode,
    });
  };

  const getCurrentLanguageName = () => {
    const lang = worldLanguages.find(l => l.code === selectedLanguage);
    return lang ? `${lang.flag} ${lang.displayName}` : "Automatic";
  };

  // Check permission status on mount
  useEffect(() => {
    void refreshPermissions();
  }, [refreshPermissions]);

  useEffect(() => {
    if (showPermissionsDialog) void refreshPermissions();
  }, [showPermissionsDialog, refreshPermissions]);

  // Helpers ─────────────────────────────────────────────
  const isInIframe = typeof window !== 'undefined' && window.self !== window.top;
  const browserSettingsHint = (perm: string) =>
    `Tap the lock/info icon in the address bar → Site settings → ${perm} → Allow, then refresh.`;
  const nativeSettingsHint = (perm: string) =>
    `Open device Settings → Apps → MeriLive → Permissions → ${perm} → Allow.`;
  const openPermissionSettings = () => {
    void openNativeAppPermissionSettings().catch(() => undefined);
  };
  const registerNotificationToken = useCallback(() => {
    if (!userId) return;
    void registerFCMToken(userId).catch(error => {
      console.warn('[Settings] Notification token registration skipped:', error);
    });
  }, [userId]);

  // Request notification permission
  const requestNotificationPermission = async () => {
    console.log('[Settings] Requesting notification permission...');
    if (permissions.notifications) {
      toast({
        title: "Already Enabled",
        description: isNativeApp()
          ? "To disable, go to device Settings → Apps → MeriLive → Permissions."
          : "To disable, change it from your browser site settings.",
      });
      return;
    }
    try {
      if (isNativeApp()) {
        const granted = await requestNativeNotificationPermission();
        if (granted) {
          updatePermissions({ notifications: true });
          registerNotificationToken();
          toast({ title: "Notifications Enabled", description: "You will now receive push notifications." });
        } else {
          toast({ title: "Permission Denied", description: "Open device Settings → Apps → MeriLive → Notifications → Allow.", variant: "destructive" });
        }
        return;
      }

      if (!('Notification' in window)) {
        toast({ title: "Not Supported", description: "Notifications are not supported in this browser.", variant: "destructive" });
        return;
      }

      // Already denied — browser will NOT re-prompt; user must reset manually
      if (Notification.permission === 'denied') {
        toast({
          title: "Notifications Blocked",
          description: isInIframe
            ? "Open the app on your device or in a full browser tab to enable notifications."
            : browserSettingsHint('Notifications'),
          variant: "destructive",
        });
        return;
      }

      const permission = await Notification.requestPermission();
      updatePermissions({ notifications: permission === 'granted' });
      if (permission === 'granted') {
        registerNotificationToken();
        toast({ title: "Notifications Enabled", description: "You will now receive notifications." });
      } else {
        toast({ title: "Permission Denied", description: browserSettingsHint('Notifications'), variant: "destructive" });
      }
    } catch (error) {
      console.error('Notification permission error:', error);
      recordClientError({ label: "Settings.permission", message: error instanceof Error ? error.message : String(error) });
      toast({ title: "Error", description: "Failed to request notification permission.", variant: "destructive" });
    } finally {
      void refreshPermissions();
    }
  };

  // Request camera permission
  const requestCameraPermission = async () => {
    console.log('[Settings] Requesting camera permission...');
    if (permissions.camera) {
      toast({
        title: "Already Enabled",
        description: isNativeApp()
          ? "To disable, go to device Settings → Apps → MeriLive → Permissions → Camera."
          : "To disable, change it from your browser site settings.",
      });
      return;
    }

    if (!isNativeApp() && navigator.permissions) {
      try {
        const p = await navigator.permissions.query({ name: 'camera' as PermissionName });
        if (p.state === 'denied') {
          toast({
            title: "Camera Blocked",
            description: isInIframe
              ? "Open the app on your device or in a full browser tab to enable the camera."
              : browserSettingsHint('Camera'),
            variant: "destructive",
          });
          return;
        }
      } catch {}
    }

    try {
      if (isNativeApp()) {
        const granted = await requestNativeCameraPermission();
        if (granted) {
          updatePermissions({ camera: true });
          toast({ title: "Camera Enabled", description: "Camera access has been granted." });
        } else {
          toast({ title: "Camera Permission Needed", description: nativeSettingsHint('Camera'), variant: "destructive" });
        }
        return;
      }

      if (!navigator.mediaDevices?.getUserMedia) {
        toast({ title: "Not Supported", description: "Camera is not available in this browser.", variant: "destructive" });
        return;
      }
      const stream = await navigator.mediaDevices.getUserMedia({ video: true });
      stream.getTracks().forEach(track => track.stop());
      updatePermissions({ camera: true });
      toast({ title: "Camera Enabled", description: "Camera access has been granted." });
    } catch (error: any) {
      console.error('Camera permission error:', error);
      recordClientError({ label: "Settings.stream", message: error instanceof Error ? error.message : String(error) });
      const denied = error?.name === 'NotAllowedError' || error?.name === 'SecurityError';
      const notFound = error?.name === 'NotFoundError';
      if (notFound) {
        toast({ title: "No Camera Found", description: "No camera device detected on this device.", variant: "destructive" });
      } else if (denied) {
        toast({
          title: "Camera Permission Needed",
          description: isNativeApp()
            ? nativeSettingsHint('Camera')
            : (isInIframe ? "Open the app on your device or in a full browser tab to enable the camera." : browserSettingsHint('Camera')),
          variant: "destructive",
        });
      } else {
        toast({ title: "Error", description: "Failed to request camera permission.", variant: "destructive" });
      }
    } finally {
      void refreshPermissions();
    }
  };

  // Request microphone permission
  const requestMicrophonePermission = async () => {
    console.log('[Settings] Requesting microphone permission...');
    if (permissions.microphone) {
      toast({
        title: "Already Enabled",
        description: isNativeApp()
          ? "To disable, go to device Settings → Apps → MeriLive → Permissions → Microphone."
          : "To disable, change it from your browser site settings.",
      });
      return;
    }

    if (!isNativeApp() && navigator.permissions) {
      try {
        const p = await navigator.permissions.query({ name: 'microphone' as PermissionName });
        if (p.state === 'denied') {
          toast({
            title: "Microphone Blocked",
            description: isInIframe
              ? "Open the app on your device or in a full browser tab to enable the microphone."
              : browserSettingsHint('Microphone'),
            variant: "destructive",
          });
          return;
        }
      } catch {}
    }

    try {
      if (isNativeApp()) {
        const granted = await requestNativeMicrophonePermission();
        if (granted) {
          updatePermissions({ microphone: true });
          toast({ title: "Microphone Enabled", description: "Microphone access has been granted." });
        } else {
          toast({ title: "Microphone Blocked", description: nativeSettingsHint('Microphone'), variant: "destructive" });
        }
        return;
      }

      if (!navigator.mediaDevices?.getUserMedia) {
        toast({ title: "Not Supported", description: "Microphone is not available in this browser.", variant: "destructive" });
        return;
      }
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      stream.getTracks().forEach(track => track.stop());
      updatePermissions({ microphone: true });
      toast({ title: "Microphone Enabled", description: "Microphone access has been granted." });
    } catch (error: any) {
      console.error('Microphone permission error:', error);
      recordClientError({ label: "Settings.stream", message: error instanceof Error ? error.message : String(error) });
      const denied = error?.name === 'NotAllowedError' || error?.name === 'SecurityError';
      if (denied) {
        toast({
          title: "Microphone Blocked",
          description: isNativeApp()
            ? nativeSettingsHint('Microphone')
            : (isInIframe ? "Open the app on your device or in a full browser tab to enable the microphone." : browserSettingsHint('Microphone')),
          variant: "destructive",
        });
      } else {
        toast({ title: "Error", description: "Failed to request microphone permission.", variant: "destructive" });
      }
    } finally {
      void refreshPermissions();
    }
  };

  // Request location permission
  const requestLocationPermission = async () => {
    console.log('[Settings] Requesting location permission...');
    if (permissions.location) {
      toast({
        title: "Already Enabled",
        description: isNativeApp()
          ? "To disable, go to device Settings → Apps → MeriLive → Permissions → Location."
          : "To disable, change it from your browser site settings.",
      });
      return;
    }

    if (!isNativeApp() && navigator.permissions) {
      try {
        const p = await navigator.permissions.query({ name: 'geolocation' as PermissionName });
        if (p.state === 'denied') {
          toast({
            title: "Location Blocked",
            description: isInIframe
              ? "Open the app on your device or in a full browser tab to share location."
              : browserSettingsHint('Location'),
            variant: "destructive",
          });
          return;
        }
      } catch {}
    }

    try {
      if (isNativeApp()) {
        const granted = await requestNativeLocationPermission();
        if (granted) {
          updatePermissions({ location: true });
          toast({ title: "Location Enabled", description: "Location access has been granted." });
        } else {
          toast({ title: "Permission Denied", description: nativeSettingsHint('Location'), variant: "destructive" });
        }
        return;
      }

      if (!navigator.geolocation) {
        toast({ title: "Not Supported", description: "Location is not available in this browser.", variant: "destructive" });
        return;
      }

      await new Promise<void>((resolve) => {
        navigator.geolocation.getCurrentPosition(
          () => {
            updatePermissions({ location: true });
            toast({ title: "Location Enabled", description: "Location access has been granted." });
            resolve();
          },
          (error) => {
            console.error('[Settings] Location error:', error);
            recordClientError({ label: "Settings.result", message: error.message });
            toast({
              title: "Location Blocked",
              description: isInIframe
                ? "Open the app on your device or in a full browser tab to share location."
                : browserSettingsHint('Location'),
              variant: "destructive",
            });
            resolve();
          },
          { timeout: 10000, maximumAge: 60000 }
        );
      });
    } catch (error) {
      console.error('Location permission error:', error);
      recordClientError({ label: "Settings.result", message: error instanceof Error ? error.message : String(error) });
      toast({ title: "Error", description: "Failed to request location permission.", variant: "destructive" });
    } finally {
      void refreshPermissions();
    }
  };

  const handleLogout = async () => {
    // INSTANT logout — no awaits before navigating
    try {
      // Persistent flag so auto-recovery NEVER restores old account
      localStorage.setItem('meri_manual_logout', 'true');
      localStorage.removeItem('meri_device_account');
    } catch {}

    // Close dialog + navigate IMMEDIATELY
    setShowLogoutDialog(false);
    navigate("/auth", { replace: true });

    // Show success right away — cleanup happens in background
    toast({
      title: "Logged Out",
      description: "You have successfully logged out.",
    });

    // Fire-and-forget cleanup; do NOT block the UI
    void supabase.auth.signOut({ scope: 'local' }).catch(() => {});
    void import('@/utils/nativeSessionStorage')
      .then(({ clearNativeSession }) => clearNativeSession())
      .catch(() => {});
  };

  const handleClearCache = () => {
    const deviceAccount = localStorage.getItem("meri_device_account");
    const deviceId = localStorage.getItem("meri_device_id");
    const appLang = localStorage.getItem("meri_app_language");
    localStorage.clear();
    if (deviceAccount) localStorage.setItem("meri_device_account", deviceAccount);
    if (deviceId) localStorage.setItem("meri_device_id", deviceId);
    if (appLang) localStorage.setItem("meri_app_language", appLang);
    
    toast({
      title: "Cache Cleared",
      description: "App cache has been cleared successfully.",
    });
  };

  // Request account deletion
  const handleRequestDeletion = async () => {
    if (!userId) return;
    setDeleteLoading(true);
    try {
      const { error } = await supabase.rpc('request_account_deletion', {
        user_id_param: userId
      });
      
      if (error) throw error;
      
      const scheduledDate = new Date();
      scheduledDate.setDate(scheduledDate.getDate() + 30);
      
      setDeletionInfo({
        deletionRequestedAt: new Date().toISOString(),
        deletionScheduledAt: scheduledDate.toISOString(),
      });
      
      toast({
        title: "Account Deletion Scheduled",
        description: `Your account will be permanently deleted on ${scheduledDate.toLocaleDateString()}`,
      });
      
      setShowDeleteConfirmDialog(false);
      setShowDeleteDialog(false);
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to schedule deletion",
        variant: "destructive",
      });
    } finally {
      setDeleteLoading(false);
    }
  };

  // Cancel account deletion
  const handleCancelDeletion = async () => {
    if (!userId) return;
    setDeleteLoading(true);
    try {
      const { error } = await supabase.rpc('cancel_account_deletion', {
        user_id_param: userId
      });
      
      if (error) throw error;
      
      setDeletionInfo({
        deletionRequestedAt: null,
        deletionScheduledAt: null,
      });
      
      toast({
        title: "Deletion Cancelled",
        description: "Your account deletion has been cancelled.",
      });
      
      setShowDeleteDialog(false);
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to cancel deletion",
        variant: "destructive",
      });
    } finally {
      setDeleteLoading(false);
    }
  };

  const getDaysRemaining = () => {
    if (!deletionInfo?.deletionScheduledAt) return 0;
    const scheduled = new Date(deletionInfo.deletionScheduledAt);
    const now = new Date();
    const diff = scheduled.getTime() - now.getTime();
    return Math.max(0, Math.ceil(diff / (1000 * 60 * 60 * 24)));
  };

  const settingsItems = [
    {
      icon: Bell,
      label: t("settings.notifications"),
      value: permissions.notifications ? t("common.enabled") : t("settings.tapToEnable"),
      onClick: () => setShowPermissionsDialog(true),
    },
    {
      icon: Globe,
      label: t("settings.language"),
      value: getCurrentLanguageName(),
      onClick: () => setShowLanguageDialog(true),
    },
    {
      icon: Ban,
      label: "Blacklist",
      onClick: () => navigate("/settings/blacklist"),
    },
    {
      icon: Users,
      label: "User Management",
      onClick: () => navigate("/settings/user-management"),
    },
    {
      icon: Shield,
      label: t("settings.privacyPolicy"),
      onClick: () => navigate("/settings/privacy-policy"),
    },
    {
      icon: FileText,
      label: t("settings.userAgreement"),
      onClick: () => navigate("/settings/user-agreement"),
    },
    {
      icon: Info,
      label: t("settings.aboutUs"),
      onClick: () => navigate("/settings/about-us"),
    },
    // Rate & Clear Cache only for native apps
    ...(isNativeApp() ? [
      {
        icon: Star,
        label: t("settings.rateMeriLive"),
        onClick: () => {
          toast({
            title: t("settings.thankYou"),
            description: t("settings.appStoreReview"),
          });
        },
      },
      {
        icon: Trash2,
        label: t("settings.clearCache"),
        value: "0 KB",
        onClick: handleClearCache,
      },
    ] : []),
    {
      icon: Smartphone,
      label: t("settings.version"),
      value: `${appVersion.version} (${appVersion.build})`,
      showArrow: false,
    },
    {
      icon: Headphones,
      label: t("settings.customerService"),
      onClick: () => navigate("/settings/customer-service"),
    },
    {
      icon: UserX,
      label: t("settings.deleteAccount"),
      value: deletionInfo?.deletionScheduledAt ? t("settings.daysLeft", { count: getDaysRemaining() }) : undefined,
      onClick: () => setShowDeleteDialog(true),
      danger: true,
    },
  ];

  return (
    <div className="mobile-page bg-background">
      {/* Header */}
      <div className="mobile-header bg-background border-b">
        <div className="flex items-center h-14 px-4">
          <button 
            onClick={() => navigate(-1)}
            className="p-2 -ml-2 hover:bg-muted rounded-full transition-colors"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <h1 className="flex-1 text-center text-lg font-semibold pr-7">{t("settings.title")}</h1>
        </div>
      </div>

      {/* Scrollable Content */}
      <div className="mobile-page-scrollable">
      {/* Settings List */}
      <div className="divide-y">
        {settingsItems.map((item, index) => (
          <button
            key={index}
            onClick={item.onClick}
            className={`w-full flex items-center justify-between px-4 py-4 hover:bg-muted/50 transition-colors ${
              (item as any).danger ? 'text-destructive' : ''
            }`}
            disabled={!item.onClick}
          >
            <div className="flex items-center gap-3">
              <item.icon className={`w-5 h-5 ${(item as any).danger ? 'text-destructive' : 'text-muted-foreground'}`} />
              <span className={(item as any).danger ? 'text-destructive' : 'text-foreground'}>{item.label}</span>
            </div>
            <div className="flex items-center gap-2">
              {item.value && (
                <span className={`text-sm ${(item as any).danger ? 'text-destructive/70' : 'text-muted-foreground'}`}>{item.value}</span>
              )}
              {item.showArrow !== false && item.onClick && (
                <ChevronRight className={`w-5 h-5 ${(item as any).danger ? 'text-destructive' : 'text-muted-foreground'}`} />
              )}
            </div>
          </button>
        ))}
      </div>

      {/* Log Out Button */}
      <div className="mt-6 px-4">
        <Button
          variant="outline"
          onClick={() => setShowLogoutDialog(true)}
          className="w-full h-12 text-destructive border-destructive/30 hover:bg-destructive/10"
        >
          <LogOut className="w-5 h-5 mr-2" />
          {t("settings.logout")}
        </Button>
      </div>
      </div>

      {/* Language Selection Dialog - Premium Dark Theme */}
      <Dialog open={showLanguageDialog} onOpenChange={setShowLanguageDialog}>
        <DialogContent className="sm:max-w-md max-h-[80vh] bg-white border border-amber-200/40">
          <DialogHeader>
            <DialogTitle className="text-slate-800 text-center">{t("settings.selectLanguage")}</DialogTitle>
            <DialogDescription className="text-slate-700 text-center">
              {t("settings.chooseLanguage")}
            </DialogDescription>
          </DialogHeader>
          <ScrollArea className="h-[400px] pr-4">
            <div className="space-y-2">
              {worldLanguages.map((lang) => (
                <button
                  key={lang.code}
                  onClick={() => handleLanguageChange(lang.code)}
                  className={`w-full flex items-center justify-between px-4 py-3.5 rounded-xl transition-all ${
                    selectedLanguage === lang.code
                      ? "bg-gradient-to-r from-purple-100 to-pink-100 border border-purple-300 text-slate-800 shadow-sm"
                      : "bg-white hover:bg-amber-50/60 border border-amber-200/60 text-slate-800"
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <span className="text-2xl">{lang.flag}</span>
                    <div className="text-left">
                      <p className="font-semibold text-slate-800">{lang.displayName}</p>
                      <p className="text-xs text-slate-600">{lang.name}</p>
                    </div>
                  </div>
                  {selectedLanguage === lang.code && (
                    <div className="w-6 h-6 rounded-full bg-gradient-to-r from-purple-500 to-pink-500 flex items-center justify-center">
                      <Check className="w-4 h-4 text-slate-800" />
                    </div>
                  )}
                </button>
              ))}
            </div>
          </ScrollArea>
        </DialogContent>
      </Dialog>

      {/* Permissions Dialog - Premium Luxurious UI */}
      <Dialog open={showPermissionsDialog} onOpenChange={setShowPermissionsDialog}>
        <DialogContent className="sm:max-w-md bg-white border border-amber-200/40">
          <DialogHeader>
            <DialogTitle className="text-slate-800 text-center">{t("settings.notificationsPermissions")}</DialogTitle>
            <DialogDescription className="text-slate-700 text-center">
              {t("settings.managePermissions")}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-4">
            {isNativeApp() && (
              <button
                type="button"
                onClick={openPermissionSettings}
                className="w-full rounded-2xl border border-amber-200/40 bg-slate-50 p-3 text-left text-xs text-slate-500 active:scale-[0.98] transition-transform"
              >
                <p className="font-semibold text-slate-800 mb-1">App Permission Settings</p>
                <p>Open Android app settings if a permission was blocked before.</p>
              </button>
            )}
            {isInIframe && (
              <div className="rounded-2xl border border-amber-300/70 bg-amber-50 p-3 text-xs text-amber-900">
                <p className="font-semibold mb-1">⚠️ Preview Mode Limitation</p>
                <p className="text-amber-800/90 mb-2">
                  Camera, Microphone & Location can't be granted inside this preview frame. Open the app in a full browser tab or in the installed Android app to enable them.
                </p>
                <button
                  onClick={() => window.open(window.location.href, '_blank', 'noopener,noreferrer')}
                  className="w-full h-9 rounded-lg bg-gradient-to-r from-amber-500 to-orange-500 text-white text-xs font-semibold"
                >
                  Open in Full Tab
                </button>
              </div>
            )}
            {/* Notifications */}
          <button 
            onClick={() => requestNotificationPermission()}
            className="w-full flex items-center justify-between p-4 rounded-2xl bg-gradient-to-r from-white to-amber-50/60 border border-amber-200/40 cursor-pointer active:scale-[0.98] transition-transform"
          >
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-purple-600/30 to-pink-600/30 flex items-center justify-center border border-purple-500/20">
                  <Bell className="w-5 h-5 text-purple-400" />
                </div>
                <div>
                   <p className="font-semibold text-slate-800">{t("settings.pushNotifications")}</p>
                   <p className="text-xs text-slate-600">{t("settings.receiveAlerts")}</p>
                </div>
              </div>
            <div
              className={`relative w-14 h-8 rounded-full transition-all duration-300 pointer-events-none ${
                  permissions.notifications 
                    ? "bg-gradient-to-r from-purple-600 to-pink-600 shadow-lg shadow-purple-500/30" 
                    : "bg-slate-200 border border-amber-200/40"
                }`}
              >
        <div className={`absolute top-1 w-6 h-6 rounded-full bg-white shadow-md transition-all duration-300 pointer-events-none ${
                  permissions.notifications ? "left-7" : "left-1"
                }`} />
            </div>
          </button>

            {/* Camera */}
    <button 
      onClick={() => requestCameraPermission()}
      className="w-full flex items-center justify-between p-4 rounded-2xl bg-gradient-to-r from-white to-amber-50/60 border border-amber-200/40 cursor-pointer active:scale-[0.98] transition-transform"
    >
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-pink-600/30 to-rose-600/30 flex items-center justify-center border border-pink-500/20">
                  <Camera className="w-5 h-5 text-pink-400" />
                </div>
                <div>
                   <p className="font-semibold text-slate-800">{t("settings.cameraAccess")}</p>
                   <p className="text-xs text-slate-600">{t("settings.forLiveStreaming")}</p>
                </div>
              </div>
      <div
        className={`relative w-14 h-8 rounded-full transition-all duration-300 pointer-events-none ${
                  permissions.camera 
                    ? "bg-gradient-to-r from-pink-600 to-rose-600 shadow-lg shadow-pink-500/30" 
                    : "bg-slate-200 border border-amber-200/40"
                }`}
              >
        <div className={`absolute top-1 w-6 h-6 rounded-full bg-white shadow-md transition-all duration-300 pointer-events-none ${
                  permissions.camera ? "left-7" : "left-1"
                }`} />
      </div>
    </button>

            {/* Microphone */}
    <button 
      onClick={() => requestMicrophonePermission()}
      className="w-full flex items-center justify-between p-4 rounded-2xl bg-gradient-to-r from-white to-amber-50/60 border border-amber-200/40 cursor-pointer active:scale-[0.98] transition-transform"
    >
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-blue-600/30 to-cyan-600/30 flex items-center justify-center border border-blue-500/20">
                  <Mic className="w-5 h-5 text-blue-400" />
                </div>
                <div>
                   <p className="font-semibold text-slate-800">{t("settings.microphoneAccess")}</p>
                   <p className="text-xs text-slate-600">{t("settings.forAudioStreaming")}</p>
                </div>
              </div>
      <div
        className={`relative w-14 h-8 rounded-full transition-all duration-300 pointer-events-none ${
                  permissions.microphone 
                    ? "bg-gradient-to-r from-blue-600 to-cyan-600 shadow-lg shadow-blue-500/30" 
                    : "bg-slate-200 border border-amber-200/40"
                }`}
              >
        <div className={`absolute top-1 w-6 h-6 rounded-full bg-white shadow-md transition-all duration-300 pointer-events-none ${
                  permissions.microphone ? "left-7" : "left-1"
                }`} />
      </div>
    </button>

            {/* Location */}
    <button 
      onClick={() => requestLocationPermission()}
      className="w-full flex items-center justify-between p-4 rounded-2xl bg-gradient-to-r from-white to-amber-50/60 border border-amber-200/40 cursor-pointer active:scale-[0.98] transition-transform"
    >
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-green-600/30 to-emerald-600/30 flex items-center justify-center border border-green-500/20">
                  <MapPin className="w-5 h-5 text-green-400" />
                </div>
                <div>
                   <p className="font-semibold text-slate-800">{t("settings.locationAccess")}</p>
                   <p className="text-xs text-slate-600">{t("settings.showRegionFlag")}</p>
                </div>
              </div>
      <div
        className={`relative w-14 h-8 rounded-full transition-all duration-300 pointer-events-none ${
                  permissions.location 
                    ? "bg-gradient-to-r from-green-600 to-emerald-600 shadow-lg shadow-green-500/30" 
                    : "bg-slate-200 border border-amber-200/40"
                }`}
              >
        <div className={`absolute top-1 w-6 h-6 rounded-full bg-white shadow-md transition-all duration-300 pointer-events-none ${
                  permissions.location ? "left-7" : "left-1"
                }`} />
      </div>
    </button>
          </div>
          <DialogFooter>
            <Button 
              onClick={() => setShowPermissionsDialog(false)} 
              className="w-full h-12 rounded-xl bg-gradient-to-r from-purple-600 to-pink-600 hover:opacity-90 text-white font-semibold"
            >
              {t("common.done")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Logout Confirmation Dialog */}
      <Dialog open={showLogoutDialog} onOpenChange={setShowLogoutDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t("settings.logout")}?</DialogTitle>
            <DialogDescription>
              {t("settings.logoutConfirm")}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="flex gap-2 sm:gap-0">
            <Button
              variant="outline"
              onClick={() => setShowLogoutDialog(false)}
              className="flex-1"
            >
              {t("common.cancel")}
            </Button>
            <Button
              variant="destructive"
              onClick={handleLogout}
              disabled={loading}
              className="flex-1"
            >
              {loading ? t("common.pleaseWait") : t("settings.logout")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Account Dialog */}
      <Dialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-destructive">
              <AlertTriangle className="w-5 h-5" />
              Delete Account
            </DialogTitle>
            <DialogDescription>
              {deletionInfo?.deletionScheduledAt ? (
                <div className="space-y-3 mt-2">
                  <div className="p-3 rounded-lg bg-amber-50 border border-amber-200">
                    <div className="flex items-center gap-2 text-amber-700 mb-1">
                      <Calendar className="w-4 h-4" />
                      <span className="font-medium">Deletion Scheduled</span>
                    </div>
                    <p className="text-sm text-amber-600">
                      Your account will be permanently deleted on{" "}
                      <strong>{new Date(deletionInfo.deletionScheduledAt).toLocaleDateString()}</strong>
                    </p>
                    <p className="text-xs text-amber-500 mt-1">
                      {getDaysRemaining()} days remaining
                    </p>
                  </div>
                  <p className="text-sm">
                    You can cancel the deletion and keep your account if you change your mind.
                  </p>
                </div>
              ) : (
                <div className="space-y-3 mt-2">
                  <p>Are you sure you want to delete your account?</p>
                  <ul className="text-sm space-y-1 text-muted-foreground">
                    <li>• Your account will be scheduled for deletion</li>
                    <li>• After 30 days, it will be permanently removed</li>
                    <li>• All your data, coins, and earnings will be lost</li>
                    <li>• You can cancel deletion within 30 days</li>
                  </ul>
                </div>
              )}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="flex gap-2 sm:gap-0">
            <Button
              variant="outline"
              onClick={() => setShowDeleteDialog(false)}
              className="flex-1"
            >
              Close
            </Button>
            {deletionInfo?.deletionScheduledAt ? (
              <Button
                variant="default"
                onClick={handleCancelDeletion}
                disabled={deleteLoading}
                className="flex-1"
              >
                {deleteLoading ? "Cancelling..." : "Cancel Deletion"}
              </Button>
            ) : (
              <Button
                variant="destructive"
                onClick={() => setShowDeleteConfirmDialog(true)}
                className="flex-1"
              >
                Delete Account
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog open={showDeleteConfirmDialog} onOpenChange={setShowDeleteConfirmDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-destructive">Confirm Account Deletion</DialogTitle>
            <DialogDescription>
              <div className="space-y-3 mt-2">
                <div className="p-3 rounded-lg bg-destructive/10 border border-destructive/20">
                  <p className="text-sm text-destructive font-medium">
                    ⚠️ This action cannot be undone after 30 days!
                  </p>
                </div>
                <p className="text-sm">
                  Your account will be permanently deleted on{" "}
                   <strong>
                    {new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toLocaleDateString()}
                  </strong>
                </p>
              </div>
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="flex gap-2 sm:gap-0">
            <Button
              variant="outline"
              onClick={() => setShowDeleteConfirmDialog(false)}
              className="flex-1"
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleRequestDeletion}
              disabled={deleteLoading}
              className="flex-1"
            >
              {deleteLoading ? "Processing..." : "Confirm Delete"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Settings;
