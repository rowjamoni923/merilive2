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
  Eye,
  Mic,
  MapPin,
  UserX,
  AlertTriangle,
  Calendar,
  Users,
  BarChart3,
  Wrench,
  type LucideIcon
} from "lucide-react";
import { useDevAccess } from "@/hooks/useDevAccess";
import { getConsent, setConsent, onConsentChange } from "@/lib/privacyConsent";
import { getDetectedCountry } from "@/utils/countryDetectionCache";
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
import { APP_VERSION, APP_BUILD } from "@/lib/version";
import { recordClientError } from "@/utils/clientErrorLog";
import {
  checkPermissionStatus,
  openNativeAppPermissionSettings,
  requestCameraPermission as requestNativeCameraPermission,
  requestLocationPermission as requestNativeLocationPermission,
  requestMicrophonePermission as requestNativeMicrophonePermission,
  requestNotificationPermission as requestNativeNotificationPermission,
} from "@/utils/nativePermissions";
// AutoRecordSettingsRow removed — Auto-record feature hidden from users app-wide.
import AppLockToggle from "@/components/settings/AppLockToggle";
import { prefetchByHref } from "@/utils/routePrefetch";


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

type SettingsItem = {
  icon: LucideIcon;
  label: string;
  value?: string;
  onClick?: () => void;
  prefetchPath?: string;
  showArrow?: boolean;
  danger?: boolean;
};

const getErrorMessage = (error: unknown, fallback: string) => (
  error instanceof Error ? error.message : fallback
);

const getErrorName = (error: unknown) => (
  error instanceof Error ? error.name : ""
);

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
  } catch (error) {
    console.warn('[Settings] Failed to cache permissions:', error);
  }
};

const Settings = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { t, i18n } = useTranslation();
  const { hasAccess: hasDevAccess } = useDevAccess();
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
  const [analyticsConsent, setAnalyticsConsent] = useState<"granted" | "denied" | null>(() => getConsent());
  const [blockedCount, setBlockedCount] = useState<number | null>(null);

  // Blocked users count — research: shows passively in trailing label so users
  // remember their block list exists and prompts cleanup (Bigo/Chamet pattern).
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) return;
      const { count } = await supabase
        .from("user_blocks")
        .select("*", { count: "exact", head: true })
        .eq("blocker_id", u.user.id);
      if (!cancelled) setBlockedCount(count ?? 0);
    })();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => onConsentChange((s) => setAnalyticsConsent(s)), []);
  
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
          } catch (error) {
            console.warn('[Settings] Camera permission status unavailable:', error);
          }
          try {
            const micPerm = await navigator.permissions.query({ name: 'microphone' as PermissionName });
            nextPermissions.microphone = micPerm.state === 'granted';
          } catch (error) {
            console.warn('[Settings] Microphone permission status unavailable:', error);
          }
          try {
            const locPerm = await navigator.permissions.query({ name: 'geolocation' as PermissionName });
            nextPermissions.location = locPerm.state === 'granted';
          } catch (error) {
            console.warn('[Settings] Location permission status unavailable:', error);
          }
        }
      }

      updatePermissions(nextPermissions);
    } catch (error) {
      console.error('Error checking permissions:', error);
      recordClientError({ label: "Settings.locPerm", message: error instanceof Error ? error.message : String(error) });
    }
  }, [updatePermissions]);
  
  // App version state
  const [appVersion, setAppVersion] = useState<{ version: string; build: string }>({ version: APP_VERSION, build: APP_BUILD });

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

        const data = await getDetectedCountry();
        const countryCode = typeof data?.countryCode === "string" ? data.countryCode : null;

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

    // Pkg222 / M17 — Mirror to Android per-app LocaleManager so the choice
    // also shows up under System Settings → Apps → MeriLive → Language and
    // survives across cold starts independent of the OS locale.
    import("@/plugins/AppLocale").then(({ AppLocale }) => {
      AppLocale.setAppLocale({ language: langCode === "auto" ? "" : langCode }).catch(() => {});
    });

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
      // Pkg365: If already enabled, open settings to allow the user to turn it OFF
      // as requested ("off-on work correctly").
      toast({
      });
      void openPermissionSettings();
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
          toast({ title: "Permission Needed", description: "Please enable notifications in App Settings.", variant: "destructive" });
          void openPermissionSettings();
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
      });
      void openPermissionSettings();
      return;
    }

    if (!isNativeApp() && navigator.permissions) {
      try {
        const p = await navigator.permissions.query({ name: 'camera' as PermissionName });
        if (p.state === 'denied') {
          toast({
              ? "Open the app on your device or in a full browser tab to enable the camera."
              : browserSettingsHint('Camera'),
          });
          return;
        }
      } catch (error) {
        console.warn('[Settings] Camera permission precheck unavailable:', error);
      }
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
    } catch (error: unknown) {
      console.error('Camera permission error:', error);
      recordClientError({ label: "Settings.stream", message: error instanceof Error ? error.message : String(error) });
      const errorName = getErrorName(error);
      const denied = errorName === 'NotAllowedError' || errorName === 'SecurityError';
      const notFound = errorName === 'NotFoundError';
      if (notFound) {
        toast({ title: "No Camera Found", description: "No camera device detected on this device.", variant: "destructive" });
      } else if (denied) {
        toast({
            ? nativeSettingsHint('Camera')
            : (isInIframe ? "Open the app on your device or in a full browser tab to enable the camera." : browserSettingsHint('Camera')),
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
      });
      void openPermissionSettings();
      return;
    }

    if (!isNativeApp() && navigator.permissions) {
      try {
        const p = await navigator.permissions.query({ name: 'microphone' as PermissionName });
        if (p.state === 'denied') {
          toast({
              ? "Open the app on your device or in a full browser tab to enable the microphone."
              : browserSettingsHint('Microphone'),
          });
          return;
        }
      } catch (error) {
        console.warn('[Settings] Microphone permission precheck unavailable:', error);
      }
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
    } catch (error: unknown) {
      console.error('Microphone permission error:', error);
      recordClientError({ label: "Settings.stream", message: error instanceof Error ? error.message : String(error) });
      const errorName = getErrorName(error);
      const denied = errorName === 'NotAllowedError' || errorName === 'SecurityError';
      if (denied) {
        toast({
            ? nativeSettingsHint('Microphone')
            : (isInIframe ? "Open the app on your device or in a full browser tab to enable the microphone." : browserSettingsHint('Microphone')),
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
      });
      void openPermissionSettings();
      return;
    }

    if (!isNativeApp() && navigator.permissions) {
      try {
        const p = await navigator.permissions.query({ name: 'geolocation' as PermissionName });
        if (p.state === 'denied') {
          toast({
              ? "Open the app on your device or in a full browser tab to share location."
              : browserSettingsHint('Location'),
          });
          return;
        }
      } catch (error) {
        console.warn('[Settings] Location permission precheck unavailable:', error);
      }
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
                ? "Open the app on your device or in a full browser tab to share location."
                : browserSettingsHint('Location'),
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
    } catch (error) {
      console.warn('[Settings] Failed to write logout marker:', error);
    }

    // Close dialog + navigate IMMEDIATELY
    setShowLogoutDialog(false);
    navigate("/auth", { replace: true });

    // Show success right away — cleanup happens in background
    toast({
    });

    // Fire-and-forget cleanup; do NOT block the UI
    void supabase.auth.signOut({ scope: 'local' }).catch(() => {});
    void import('@/utils/nativeSessionStorage')
      .then(({ clearNativeSession }) => clearNativeSession())
      .catch(() => {});
    // Phase 1C: also clear cached balance so the next account doesn't see
    // stale diamonds/beans from the previous session.
    void import('@/hooks/useUserBalance')
      .then(({ clearBalanceCache }) => clearBalanceCache())
      .catch(() => {});
  };

  const handleClearCache = () => {
    const removableLocalPrefixes = [
      "meri_profile_cache",
      "meri_level_cache",
      "meri_maintenance_mode_cache",
      "daily_login_popup_dismissed",
      "meri_sound_disabled",
    ];
    const removableSessionPrefixes = ["meri:instant-rest:", "meri:instant-rest-meta:"];

    try {
      Object.keys(localStorage).forEach((key) => {
        if (removableLocalPrefixes.some((prefix) => key.startsWith(prefix))) {
          localStorage.removeItem(key);
        }
      });
      Object.keys(sessionStorage).forEach((key) => {
        if (removableSessionPrefixes.some((prefix) => key.startsWith(prefix))) {
          sessionStorage.removeItem(key);
        }
      });
    } catch (error) {
      recordClientError({ label: "Settings.clearCache", message: error instanceof Error ? error.message : String(error) });
    }
    
    toast({
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
      });
      
      toast({
      });
      
      setShowDeleteConfirmDialog(false);
      setShowDeleteDialog(false);
    } catch (error: unknown) {
      toast({
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
        _user_id: userId
      });
      
      if (error) throw error;
      
      setDeletionInfo({
      });
      
      toast({
      });
      
      setShowDeleteDialog(false);
    } catch (error: unknown) {
      toast({
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

  const settingsItems: SettingsItem[] = [
    {
      icon: Bell,
      label: t("settings.notifications"),
      value: permissions.notifications ? t("common.enabled") : t("settings.tapToEnable"),
      onClick: () => setShowPermissionsDialog(true),
    },
    {
    },
    {
      prefetchPath: "/settings/blacklist",
    },
    {
    },
    {
    },
    {
    },
    {
    },
    {
    },
    // Rate & Clear Cache only for native apps
    ...(isNativeApp() ? [
      {
          toast({
          });
        },
      },
      {
      },
    ] : []),
    {
      showArrow: false,
    },
    {
    },
    // Developer Options — only visible to whitelisted dev emails (see src/config/devAccess.ts)
    ...(hasDevAccess ? [
      {
      },
    ] : []),
    {
      danger: true,
    },
  ];

  return (
    <div data-page="settings" className="mobile-page bg-background">
      {/* Header */}
      <div
        className="mobile-header bg-card/95 backdrop-blur-xl"
        style={{ boxShadow: '0 4px 14px -8px rgba(15,23,42,0.18), inset 0 -1px 0 hsl(var(--border))' }}
      >
        <div className="flex items-center h-14 px-4">
          <button
            onClick={() => navigate(-1)}
            className="h-9 w-9 -ml-1 rounded-full bg-card flex items-center justify-center transition-all hover:-translate-y-0.5 active:translate-y-0"
            style={{ boxShadow: '0 4px 10px -4px rgba(15,23,42,0.18), inset 0 1px 0 rgba(255,255,255,0.7), 0 0 0 1px hsl(var(--border))' }}
          >
            <ArrowLeft className="w-5 h-5 text-foreground" />
          </button>
          <h1
            className="flex-1 text-center text-lg font-bold pr-7 text-foreground tracking-tight"
            style={{ textShadow: '0 1px 0 rgba(255,255,255,0.6)' }}
          >
            {t("settings.title")}
          </h1>
        </div>
      </div>

      {/* Scrollable Content */}
      <div className="mobile-page-scrollable">
      {/* Settings List */}
      <div className="mx-3 my-3 rounded-2xl bg-card overflow-hidden divide-y divide-border"
        style={{ boxShadow: '0 12px 32px -16px rgba(15,23,42,0.22), 0 2px 6px -2px rgba(15,23,42,0.08), inset 0 1px 0 rgba(255,255,255,0.85)' }}
      >
        {/* Recording toggle hidden from UI per product decision — do not surface to users/hosts/agencies. */}
        {/* <AutoRecordSettingsRow /> */}

        {/* Pkg210 — biometric app lock */}
        {isNativeApp() && (
          <div className="px-4 py-3">
            <AppLockToggle />
          </div>
        )}

        {settingsItems.map((item, index) => {
          // Color-coded icon tile mapping
          const tileStyles: Record<string, { bg: string; fg: string; glow: string }> = {
            [t("settings.notifications")]: { bg: 'linear-gradient(135deg, #fef3c7, #fde68a)', fg: 'text-amber-700', glow: 'rgba(245,158,11,0.30)' },
            [t("settings.language")]: { bg: 'linear-gradient(135deg, #dbeafe, #bfdbfe)', fg: 'text-blue-700', glow: 'rgba(59,130,246,0.30)' },
            'Blacklist': { bg: 'linear-gradient(135deg, #fee2e2, #fecaca)', fg: 'text-red-700', glow: 'rgba(239,68,68,0.30)' },
            'User Management': { bg: 'linear-gradient(135deg, #ede9fe, #ddd6fe)', fg: 'text-violet-700', glow: 'rgba(139,92,246,0.30)' },
            [t("settings.privacyPolicy")]: { bg: 'linear-gradient(135deg, #d1fae5, #a7f3d0)', fg: 'text-emerald-700', glow: 'rgba(16,185,129,0.30)' },
            'Share usage data': { bg: 'linear-gradient(135deg, #cffafe, #a5f3fc)', fg: 'text-cyan-700', glow: 'rgba(6,182,212,0.30)' },
            [t("settings.userAgreement")]: { bg: 'linear-gradient(135deg, #e0e7ff, #c7d2fe)', fg: 'text-indigo-700', glow: 'rgba(99,102,241,0.30)' },
            [t("settings.aboutUs")]: { bg: 'linear-gradient(135deg, #f3e8ff, #e9d5ff)', fg: 'text-purple-700', glow: 'rgba(168,85,247,0.30)' },
            [t("settings.rateMeriLive")]: { bg: 'linear-gradient(135deg, #fef9c3, #fef08a)', fg: 'text-yellow-700', glow: 'rgba(234,179,8,0.30)' },
            [t("settings.clearCache")]: { bg: 'linear-gradient(135deg, #f1f5f9, #e2e8f0)', fg: 'text-slate-700', glow: 'rgba(100,116,139,0.30)' },
            [t("settings.version")]: { bg: 'linear-gradient(135deg, #f1f5f9, #e2e8f0)', fg: 'text-slate-600', glow: 'rgba(100,116,139,0.25)' },
            [t("settings.customerService")]: { bg: 'linear-gradient(135deg, #fce7f3, #fbcfe8)', fg: 'text-pink-700', glow: 'rgba(236,72,153,0.30)' },
          };
          const tile = tileStyles[item.label] ?? { bg: 'linear-gradient(135deg, #f1f5f9, #e2e8f0)', fg: 'text-slate-700', glow: 'rgba(100,116,139,0.25)' };

          // Detect On/Off + Days-left for premium badge styling
          const isOnOff = item.value === 'On' || item.value === 'Off';
          const isDanger = item.danger;

          return (
            <button
              key={index}
              onPointerDown={() => item.prefetchPath && prefetchByHref(item.prefetchPath)}
              onTouchStart={() => item.prefetchPath && prefetchByHref(item.prefetchPath)}
              onClick={item.onClick}
              className={`w-full flex items-center justify-between px-4 py-3.5 transition-all duration-200 hover:bg-muted/50 active:bg-muted active:scale-[0.995] ${
                isDanger ? 'text-destructive' : ''
              }`}
              disabled={!item.onClick}
            >
              <div className="flex items-center gap-3">
                <div
                  className="w-10 h-10 rounded-xl flex items-center justify-center"
                  style={{
                    background: isDanger ? 'linear-gradient(135deg, #fee2e2, #fecaca)' : tile.bg,
                    boxShadow: `0 4px 10px -4px ${isDanger ? 'rgba(239,68,68,0.35)' : tile.glow}, inset 0 1px 0 rgba(255,255,255,0.75), inset 0 -1px 0 rgba(15,23,42,0.04)`,
                  }}
                >
                  <item.icon className={`w-[18px] h-[18px] ${isDanger ? 'text-red-700' : tile.fg}`} strokeWidth={2.2} />
                </div>
                <span className={`font-medium ${isDanger ? 'text-destructive' : 'text-foreground'}`}>{item.label}</span>
              </div>
              <div className="flex items-center gap-2">
                {item.value && (
                  isOnOff ? (
                    <span
                      className="text-[11px] font-bold px-2.5 py-1 rounded-full"
                      style={
                        item.value === 'On'
                          ? {
                              color: '#065f46',
                            }
                          : {
                            }
                      }
                    >
                      {item.value}
                    </span>
                  ) : isDanger && item.value ? (
                    <span
                      className="text-[11px] font-bold px-2.5 py-1 rounded-full text-red-700"
                      style={{
                      }}
                    >
                      {item.value}
                    </span>
                  ) : (
                    <span className={`text-sm ${isDanger ? 'text-destructive/70' : 'text-muted-foreground'}`}>{item.value}</span>
                  )
                )}
                {item.showArrow !== false && item.onClick && (
                  <ChevronRight className={`w-5 h-5 ${isDanger ? 'text-destructive' : 'text-muted-foreground/60'}`} />
                )}
              </div>
            </button>
          );
        })}
      </div>

      {/* Log Out Button */}
      <div className="mt-6 px-4">
        <button
          onClick={() => setShowLogoutDialog(true)}
          className="w-full h-12 rounded-2xl font-semibold text-destructive flex items-center justify-center gap-2 transition-all duration-300 hover:-translate-y-0.5 active:scale-[0.98]"
          style={{
            border: '1px solid hsl(var(--destructive) / 0.3)',
          }}
        >
          <LogOut className="w-5 h-5" />
          {t("settings.logout")}
        </button>
      </div>
      </div>

      {/* Language Selection Dialog - Premium Dark Theme */}
      <Dialog open={showLanguageDialog} onOpenChange={setShowLanguageDialog}>
        <DialogContent className="sm:max-w-md max-h-[80vh] bg-background border border-border">
          <DialogHeader>
            <DialogTitle className="text-foreground text-center">{t("settings.selectLanguage")}</DialogTitle>
            <DialogDescription className="text-muted-foreground text-center">
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
                      ? "bg-primary/10 border border-primary/40 text-foreground shadow-sm"
                      : "bg-muted/40 hover:bg-muted/70 border border-border text-foreground"
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <span className="text-2xl">{lang.flag}</span>
                    <div className="text-left">
                      <p className="font-semibold text-foreground">{lang.displayName}</p>
                      <p className="text-xs text-muted-foreground">{lang.name}</p>
                    </div>
                  </div>
                  {selectedLanguage === lang.code && (
                    <div className="w-6 h-6 rounded-full bg-primary flex items-center justify-center">
                      <Check className="w-4 h-4 text-primary-foreground" />
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
        <DialogContent className="sm:max-w-md bg-background border border-border">
          <DialogHeader>
            <DialogTitle className="text-foreground text-center">{t("settings.notificationsPermissions")}</DialogTitle>
            <DialogDescription className="text-muted-foreground text-center">
              {t("settings.managePermissions")}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-4">
            {isNativeApp() && (
              <button
                type="button"
                onClick={openPermissionSettings}
                className="w-full rounded-2xl border border-border bg-muted/40 p-3 text-left text-xs text-muted-foreground active:scale-[0.98] transition-transform"
              >
                <p className="font-semibold text-foreground mb-1">App Permission Settings</p>
                <p>Open Android app settings if a permission was blocked before.</p>
              </button>
            )}
            {isInIframe && (
              <div className="rounded-2xl border border-border bg-muted p-3 text-xs text-foreground">
                <p className="font-semibold mb-1">⚠️ Preview Mode Limitation</p>
                <p className="mb-2 opacity-90">
                  Camera, Microphone & Location can't be granted inside this preview frame. Open the app in a full browser tab or in the installed Android app to enable them.
                </p>
                <button
                  onClick={() => window.open(window.location.href, '_blank', 'noopener,noreferrer')}
                  className="w-full h-9 rounded-lg bg-primary text-primary-foreground text-xs font-semibold"
                >
                  Open in Full Tab
                </button>
              </div>
            )}
            {/* Notifications */}
            <button
              onClick={() => requestNotificationPermission()}
              className="w-full flex items-center justify-between p-4 rounded-2xl bg-muted/40 hover:bg-muted/60 border border-border cursor-pointer active:scale-[0.98] transition-all"
            >
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center border border-primary/20">
                  <Bell className="w-5 h-5 text-primary" />
                </div>
                <div className="text-left">
                  <p className="font-semibold text-foreground">{t("settings.pushNotifications")}</p>
                  <p className="text-xs text-muted-foreground">{t("settings.receiveAlerts")}</p>
                </div>
              </div>
              <div
                className={`relative w-14 h-8 rounded-full transition-all duration-300 pointer-events-none ${
                  permissions.notifications
                    ? "bg-primary shadow-lg shadow-primary/30"
                    : "bg-muted border border-border"
                }`}
              >
                <div className={`absolute top-1 w-6 h-6 rounded-full bg-background shadow-md transition-all duration-300 pointer-events-none ${
                  permissions.notifications ? "left-7" : "left-1"
                }`} />
              </div>
            </button>

            {/* Camera */}
            <button
              onClick={() => requestCameraPermission()}
              className="w-full flex items-center justify-between p-4 rounded-2xl bg-muted/40 hover:bg-muted/60 border border-border cursor-pointer active:scale-[0.98] transition-all"
            >
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center border border-primary/20">
                  <Eye className="w-5 h-5 text-primary" />
                </div>
                <div className="text-left">
                  <p className="font-semibold text-foreground">{t("settings.cameraAccess")}</p>
                  <p className="text-xs text-muted-foreground">{t("settings.forLiveStreaming")}</p>
                </div>
              </div>
              <div
                className={`relative w-14 h-8 rounded-full transition-all duration-300 pointer-events-none ${
                  permissions.camera
                    ? "bg-primary shadow-lg shadow-primary/30"
                    : "bg-muted border border-border"
                }`}
              >
                <div className={`absolute top-1 w-6 h-6 rounded-full bg-background shadow-md transition-all duration-300 pointer-events-none ${
                  permissions.camera ? "left-7" : "left-1"
                }`} />
              </div>
            </button>

            {/* Microphone */}
            <button
              onClick={() => requestMicrophonePermission()}
              className="w-full flex items-center justify-between p-4 rounded-2xl bg-muted/40 hover:bg-muted/60 border border-border cursor-pointer active:scale-[0.98] transition-all"
            >
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center border border-primary/20">
                  <Mic className="w-5 h-5 text-primary" />
                </div>
                <div className="text-left">
                  <p className="font-semibold text-foreground">{t("settings.microphoneAccess")}</p>
                  <p className="text-xs text-muted-foreground">{t("settings.forAudioStreaming")}</p>
                </div>
              </div>
              <div
                className={`relative w-14 h-8 rounded-full transition-all duration-300 pointer-events-none ${
                  permissions.microphone
                    ? "bg-primary shadow-lg shadow-primary/30"
                    : "bg-muted border border-border"
                }`}
              >
                <div className={`absolute top-1 w-6 h-6 rounded-full bg-background shadow-md transition-all duration-300 pointer-events-none ${
                  permissions.microphone ? "left-7" : "left-1"
                }`} />
              </div>
            </button>

            {/* Location */}
            <button
              onClick={() => requestLocationPermission()}
              className="w-full flex items-center justify-between p-4 rounded-2xl bg-muted/40 hover:bg-muted/60 border border-border cursor-pointer active:scale-[0.98] transition-all"
            >
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center border border-primary/20">
                  <MapPin className="w-5 h-5 text-primary" />
                </div>
                <div className="text-left">
                  <p className="font-semibold text-foreground">{t("settings.locationAccess")}</p>
                  <p className="text-xs text-muted-foreground">{t("settings.showRegionFlag")}</p>
                </div>
              </div>
              <div
                className={`relative w-14 h-8 rounded-full transition-all duration-300 pointer-events-none ${
                  permissions.location
                    ? "bg-primary shadow-lg shadow-primary/30"
                    : "bg-muted border border-border"
                }`}
              >
                <div className={`absolute top-1 w-6 h-6 rounded-full bg-background shadow-md transition-all duration-300 pointer-events-none ${
                  permissions.location ? "left-7" : "left-1"
                }`} />
              </div>
            </button>
          </div>
          <DialogFooter>
            <Button
              onClick={() => setShowPermissionsDialog(false)}
              className="w-full h-12 rounded-xl font-semibold"
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
                  <div className="p-3 rounded-lg bg-muted border border-border">
                    <div className="flex items-center gap-2 text-foreground mb-1">
                      <Calendar className="w-4 h-4" />
                      <span className="font-medium">Deletion Scheduled</span>
                    </div>
                    <p className="text-sm text-muted-foreground">
                      Your account will be permanently deleted on{" "}
                      <strong>{new Date(deletionInfo.deletionScheduledAt).toLocaleDateString()}</strong>
                    </p>
                    <p className="text-xs text-muted-foreground mt-1">
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
                    <li>• All your data, diamonds, and earnings will be lost</li>
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
