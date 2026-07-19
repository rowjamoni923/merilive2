import { useState, useEffect, type ImgHTMLAttributes } from "react";
import { useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { Capacitor } from "@capacitor/core";
import { Mail, User, X, Check, Sparkles, Lock, Eye, EyeOff, Phone, MessageCircle, ChevronDown, Search, Loader2 } from "lucide-react";
 import { Rocket3DIcon } from "@/components/ui/Rocket3DIcon";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import AvatarWithFrame from "@/components/common/AvatarWithFrame";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useBrandingRealtime } from "@/hooks/useAdminSettingsRealtime";
import { getPersistentDeviceId, getDeviceIdSync } from "@/utils/persistentDeviceId";
import { getSessionFromNative } from "@/utils/nativeSessionStorage";
import { useBruteForceProtection } from "@/hooks/useBruteForceProtection";
// Geolocation helpers are loaded lazily — they're a 600+ line module with
// country/IP detection that's only needed AFTER the user submits, so we keep
// them out of the initial Auth bundle for a faster first paint.
const loadGeolocation = () => import("@/hooks/useGeolocation");
import { COUNTRY_CODES } from "@/data/countryCodes";
import { triggerLegacyProfileSync } from "@/utils/legacyProfileSync";
import { recordClientError } from "@/utils/clientErrorLog";
import { getDetectedCountry } from "@/utils/countryDetectionCache";

type Gender = "male" | "female" | null;
type AuthStep = "gender" | "name" | "email" | "login" | "otp_verify" | "email_otp" | "email_gender" | "email_password" | "phone_input" | "phone_otp" | "phone_password" | null;

type AuthBranding = {
  background_type: 'image' | 'video' | 'gif' | 'gradient';
  background_url: string;
};

interface DeviceAccount {
  deviceId: string;
  email: string;
  password: string;
  displayName: string;
  avatarUrl: string | null;
  gender: Gender;
}

interface LastUser {
  email: string;
  displayName: string;
  avatarUrl: string | null;
}

// Generate unique device ID - NOW USES PERSISTENT NATIVE ID
// This ID survives app uninstalls because it uses hardware-based UUID on native
const generateDeviceId = async (): Promise<string> => {
  return await getPersistentDeviceId();
};

// Recover account by device ID — returns a single-use exchange token that
// the device-session-recover edge function will trade for a real Supabase
// session. NO password ever leaves the server.
const recoverAccountByDevice = async (deviceId: string): Promise<{
  userId: string;
  displayName: string;
  avatarUrl: string | null;
  gender: string | null;
  isHost: boolean;
  exchangeToken: string;
} | null> => {
  try {
    const { data, error } = await supabase.rpc('recover_session_by_device', {
      p_device_id: deviceId,
    });

    if (error || !data || data.length === 0) return null;

    const account: any = data[0];
    if (!account?.exchange_token) return null;
    return {
      userId: account.user_id,
      displayName: account.display_name || 'User',
      avatarUrl: account.avatar_url,
      gender: account.gender,
      isHost: account.is_host || false,
      exchangeToken: account.exchange_token,
    };
  } catch (error) {
    console.error('Error checking device account:', error);
    recordClientError({ label: "Auth.account", message: error instanceof Error ? error.message : String(error) });
    return null;
  }
};

// Exchange the device token for a real Supabase session (sets session locally).
const completeDeviceRecovery = async (deviceId: string, exchangeToken: string): Promise<boolean> => {
  try {
    const { data, error } = await supabase.functions.invoke('device-session-recover', {
      body: { device_id: deviceId, exchange_token: exchangeToken },
    });
    if (error || !data?.success || !data?.access_token || !data?.refresh_token) {
      console.warn('[Auth] device-session-recover failed', error || data);
      return false;
    }
    const { error: setError } = await supabase.auth.setSession({
      access_token: data.access_token,
      refresh_token: data.refresh_token,
    });
    if (setError) {
      console.error('[Auth] setSession after recovery failed', setError);
      return false;
    }
    return true;
  } catch (err) {
    console.error('[Auth] completeDeviceRecovery error', err);
    return false;
  }
};

// Helper function to navigate to return URL or home
const getReturnUrl = (): string => {
  const returnTo = localStorage.getItem('meri_return_to');
  if (returnTo) {
    localStorage.removeItem('meri_return_to');
    // Skip encrypted values (🔐 prefix from encryptedStorage) and invalid URLs
    if (returnTo.startsWith('🔐') || !returnTo.startsWith('/') || returnTo.startsWith('/auth')) {
      return '/';
    }
    return returnTo;
  }
  return '/';
};

// Detect slow networks (Save-Data, 2g/3g, downlink<1.5 Mbps).
// On such networks we skip heavy hero media (e.g. multi-MB GIF / video)
// and let the CSS gradient stand alone — keeps Auth screen usable on 3G.
const isSlowNetwork = (): boolean => {
  if (typeof navigator === 'undefined') return false;
  const c: any = (navigator as any).connection || (navigator as any).mozConnection || (navigator as any).webkitConnection;
  if (!c) return false;
  if (c.saveData) return true;
  if (typeof c.effectiveType === 'string' && /^(slow-2g|2g|3g)$/.test(c.effectiveType)) return true;
  if (typeof c.downlink === 'number' && c.downlink > 0 && c.downlink < 1.5) return true;
  return false;
};

const AuthBackground = ({ branding }: { branding: AuthBranding }) => {
  // INSTANT BACKGROUND: branding is read from localStorage cache + a
  // <link rel="preload" fetchpriority="high"> is injected at module load by
  // useBrandingRealtime, so the asset starts downloading before React even
  // mounts. We render it immediately (no opacity gate, no fade-in, no
  // slow-network skip — user mandate: ZERO delay, always show).
  const [mediaFailed, setMediaFailed] = useState(false);
  const showMedia = Boolean(branding.background_url && !mediaFailed);

  useEffect(() => {
    setMediaFailed(false);
  }, [branding.background_url, branding.background_type]);

  const mediaStyle: React.CSSProperties = {
    width: '100%',
    height: '100%',
    minWidth: '100%',
    minHeight: '100%',
    display: 'block',
    objectFit: 'cover',
    objectPosition: 'center center',
    imageRendering: 'high-quality' as React.CSSProperties['imageRendering'],
    transform: 'translateZ(0)',
    backfaceVisibility: 'hidden',
    WebkitBackfaceVisibility: 'hidden',
    filter: 'contrast(1.06) saturate(1.12) brightness(1.02)',
    willChange: 'transform',
  };

  // Build HD URL via Supabase image transform CDN.
  // For GIFs we MUST keep the original URL (transform endpoint flattens animation).
  const isGif = branding.background_type === 'gif' || /\.gif(\?|$)/i.test(branding.background_url || '');
  const buildHdUrl = (url: string, width: number, quality = 90): string => {
    if (!url) return url;
    try {
      if (isGif) return url; // never transform animated GIFs
      if (url.includes('/storage/v1/object/public/')) {
        const transformed = url.replace('/storage/v1/object/public/', '/storage/v1/render/image/public/');
        const sep = transformed.includes('?') ? '&' : '?';
        return `${transformed}${sep}width=${width}&quality=${quality}&resize=cover`;
      }
      return url;
    } catch {
      return url;
    }
  };

  const dpr = typeof window !== 'undefined' ? Math.min(window.devicePixelRatio || 1, 3) : 2;
  const baseW = typeof window !== 'undefined' ? window.innerWidth : 480;
  const targetWidth = Math.min(2160, Math.ceil(baseW * dpr));

  // For GIFs: single src only (multi-width srcSet of identical URLs is wasted bytes).
  // For static images: real responsive srcSet across transform CDN widths.
  const hdSrc = showMedia ? buildHdUrl(branding.background_url, targetWidth, 92) : '';
  const hdSrcSet = showMedia && !isGif
    ? [720, 1080, 1440, 1920, 2160]
        .map((w) => `${buildHdUrl(branding.background_url, w, 90)} ${w}w`)
        .join(', ')
    : undefined;

  return (
    <>
      <div
        className="absolute inset-0"
        style={{
          background: 'linear-gradient(135deg, #0f0c29 0%, #302b63 40%, #24243e 70%, #0f0c29 100%)',
        }}
      />
      {showMedia && branding.background_type === 'video' ? (
        <video
          src={branding.background_url}
          className="absolute inset-0 w-full h-full object-cover"
          autoPlay
          muted
          loop
          playsInline
         
          disablePictureInPicture
          onError={() => setMediaFailed(true)}
          ref={(el) => { if (el) el.playbackRate = 0.6; }}
          style={mediaStyle}
        />
      ) : showMedia && (branding.background_type === 'image' || branding.background_type === 'gif') ? (
        <img loading="eager" decoding="async"
          src={hdSrc}
          srcSet={hdSrcSet}
          sizes={hdSrcSet ? '100vw' : undefined}
          alt="MeriLive background"
          className="absolute inset-0 w-full h-full object-cover"
         
          {...({ fetchpriority: "high" } as ImgHTMLAttributes<HTMLImageElement>)}
          onError={() => setMediaFailed(true)}
          style={mediaStyle}
        />
      ) : null}
    </>
  );
};

const Auth = () => {
  const navigate = useNavigate();
  const location = useLocation();
  
  // Helper to navigate after successful auth
  const navigateAfterAuth = () => {
    const returnUrl = getReturnUrl();
    // Prevent navigating back to auth pages (causes 404)
    if (returnUrl.startsWith('/auth')) {
      navigate('/');
    } else {
      navigate(returnUrl);
    }
  };
  
  const [searchParams] = useSearchParams();
  const { toast } = useToast();
  const { checkBeforeLogin, recordAttempt, lockoutInfo } = useBruteForceProtection();
  const [loading, setLoading] = useState(false);
  const [pendingBtn, setPendingBtn] = useState<null | 'start' | 'phone' | 'email'>(null);
  const [agreed, setAgreed] = useState(false);
  const [authStep, setAuthStep] = useState<AuthStep>(null);
  const [selectedGender, setSelectedGender] = useState<Gender>(null);
  const [lastUser, setLastUser] = useState<LastUser | null>(null);
  const [deviceAccount, setDeviceAccount] = useState<DeviceAccount | null>(null);
  const [isEmailFlow, setIsEmailFlow] = useState(false);
  useEffect(() => {
    const isActiveAuthRoute = location.pathname.startsWith('/auth');
    document.body.classList.toggle('auth-native-route', isActiveAuthRoute);
    return () => {
      if (isActiveAuthRoute) document.body.classList.remove('auth-native-route');
    };
  }, [location.pathname]);
  useEffect(() => {
    if (!pendingBtn) return;
    // Clear spinner as soon as we leave the landing buttons or after a safety timeout
    if (authStep !== null) { setPendingBtn(null); return; }
    const t = setTimeout(() => setPendingBtn(null), 3500);
    return () => clearTimeout(t);
  }, [pendingBtn, authStep]);
  
  // Email auth state
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  
  // OTP verification state
  const [otpCode, setOtpCode] = useState("");
  const [expectedOtpCode, setExpectedOtpCode] = useState("");
  const [otpLoading, setOtpLoading] = useState(false);
  const [pendingUserId, setPendingUserId] = useState<string | null>(null);
  const [emailVerified, setEmailVerified] = useState(false);
  const [emailVerifiedToken, setEmailVerifiedToken] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [confirmPassword, setConfirmPassword] = useState("");
  
  // Phone auth state
  const [phoneNumber, setPhoneNumber] = useState("");
  const [phoneOtpCode, setPhoneOtpCode] = useState("");
  const [phoneVerifiedToken, setPhoneVerifiedToken] = useState("");
  const [phoneOtpLoading, setPhoneOtpLoading] = useState(false);
  const [selectedCountryCode, setSelectedCountryCode] = useState(COUNTRY_CODES[0]?.code ?? "+1");
  const [showCountryPicker, setShowCountryPicker] = useState(false);
  const [countrySearch, setCountrySearch] = useState("");

  // Phase 1 Auth audit (2026-06-09): industry-standard 60s resend countdown.
  // Shared across email-login OTP, email-signup OTP, and WhatsApp phone OTP.
  const [resendCountdown, setResendCountdown] = useState(0);
  useEffect(() => {
    if (resendCountdown <= 0) return;
    const id = setInterval(() => setResendCountdown((s) => (s > 0 ? s - 1 : 0)), 1000);
    return () => clearInterval(id);
  }, [resendCountdown]);
  const startResendCountdown = () => setResendCountdown(60);

  const getFunctionErrorMessage = async (error: any, fallback: string) => {
    const mapEmailCode = (code?: string) => {
      switch (code) {
        case "EMAIL_DOMAIN_NOT_VERIFIED":
          return "Email delivery is still activating for MeriLive. Please try again after setup finishes.";
        case "EMAIL_SENDER_DOMAIN_NOT_READY":
          return "Email sender setup is not ready yet. Please try again shortly.";
        case "EMAIL_SERVICE_AUTH_FAILED":
          return "Email service is being refreshed. Please try again shortly.";
        case "EMAIL_DELIVERY_FAILED":
          return "Unable to send the verification code right now. Please try again in a moment.";
        default:
          return "";
      }
    };

    const mappedDirect = mapEmailCode(error?.code);
    if (mappedDirect) return mappedDirect;

    try {
      const response = error?.context;
      if (response && typeof response.json === "function") {
        const payload = await response.json();
        const mapped = mapEmailCode(payload?.code);
        if (mapped) return mapped;

        return payload?.error || payload?.detail || payload?.message || fallback;
      }
    } catch (parseError) {
      console.warn("[Auth] Failed to parse function error:", parseError);
    }

    return error?.message || fallback;
  };

  const isExpiredOtpMessage = (message: unknown) => /expired|not found|new code|one-time token|invalid/i.test(String(message || ""));

  // Auto-detect user's country for default country code
  useEffect(() => {
    const detectUserCountry = async () => {
      try {
        const data = await getDetectedCountry();
        if (data?.countryCode) {
          const detected = COUNTRY_CODES.find(c => c.country === data.countryCode.toUpperCase());
          if (detected) {
            setSelectedCountryCode(detected.code);
            return;
          }
        }
      } catch (e) {
        console.log('[Auth] Country auto-detect failed, using fallback');
      }
      setSelectedCountryCode("+1");
    };
    detectUserCountry();
  }, []);

  // Branding settings - REALTIME
  const { branding: realtimeBranding } = useBrandingRealtime();
  
  const branding = realtimeBranding ? {
    logo_text_primary: realtimeBranding.logo_text_primary ?? '',
    logo_text_secondary: realtimeBranding.logo_text_secondary ?? '',
    tagline: realtimeBranding.tagline ?? '',
    background_type: (realtimeBranding.background_type || 'gradient') as 'image' | 'video' | 'gif' | 'gradient',
    background_url: realtimeBranding.background_url ?? '',
    logo_image_url: realtimeBranding.logo_image_url
  } : {
    logo_text_primary: 'meri',
    logo_text_secondary: 'LIVE',
    tagline: 'Connect • Chat • Share',
    background_type: 'gradient' as const,
    background_url: '',
    logo_image_url: null
  };

  // Capture link attribution from URL. Invitation refs and agency codes must stay separate.
  useEffect(() => {
    const ref = searchParams.get("ref");
    const agencyCode = searchParams.get("agency") || searchParams.get("agency_code") || searchParams.get("code");
    const subagent = searchParams.get("subagent");
    
    if (ref) {
      localStorage.setItem("meri_pending_invitation_ref", ref);
    }

    if (agencyCode) {
      localStorage.setItem("meri_pending_referral", agencyCode.trim().toUpperCase());
    }
    
    // Store sub-agent code for after signup
    if (subagent) {
      localStorage.setItem("meri_pending_subagent", subagent);
    }
  }, [searchParams]);

  // Track user invitation after signup
  const trackUserInvitation = async (newUserId: string) => {
    try {
      const inviterRef = localStorage.getItem("meri_pending_invitation_ref");
      if (!inviterRef) return;
      localStorage.removeItem("meri_pending_invitation_ref");

      // Pkg317: server-side attribution (RLS no longer allows direct invitee insert)
      const { data, error } = await supabase.rpc('record_invitation', {
        _inviter_app_uid: inviterRef,
      } as any);
      if (error) throw error;
      const result = data as any;
      if (!result?.success) {
        console.log('[Invitation] Not recorded:', result?.error);
        return;
      }
      console.log('[Invitation] Tracked for new user', newUserId);
    } catch (error) {
      console.error('[Invitation] Error tracking invitation:', error);
      recordClientError({ label: "Auth.inviterRef", message: error instanceof Error ? error.message : String(error) });
    }
  };


  // Load device account and last user from localStorage
  useEffect(() => {
    const savedDeviceAccount = localStorage.getItem("meri_device_account");
    if (savedDeviceAccount) {
      try {
        const account = JSON.parse(savedDeviceAccount);
        setDeviceAccount(account);
      } catch (e) {
        localStorage.removeItem("meri_device_account");
      }
    }

    const savedUser = localStorage.getItem("meri_last_user");
    if (savedUser) {
      try {
        setLastUser(JSON.parse(savedUser));
      } catch (e) {
        localStorage.removeItem("meri_last_user");
      }
    }
  }, []);

  // 🚀 SESSION CHECK on page load — only check active Supabase session
  // NO auto-login from localStorage or device recovery on page load
  useEffect(() => {
    const checkExistingSession = async () => {
      let recoveryTimeout: ReturnType<typeof setTimeout> | null = null;
      try {
        const timeoutPromise = new Promise<never>((_, reject) => {
          // Phase 1 Auth audit (2026-06-09): tightened from 4500ms → 2000ms.
          // Play Console flags TTID ≥ 5000ms; competitors target < 2000ms cold.
          // The full-screen "Restoring your session…" loader was blocking UI up to 4.5s.
          recoveryTimeout = setTimeout(() => reject(new Error('auth_session_check_timeout')), 2000);
        });
        // Only check if user already has an active Supabase session
        const { data: { session } } = await Promise.race([
          supabase.auth.getSession(),
          timeoutPromise,
        ]);
        if (session?.user) {
          // Verify user still exists in profiles
          const { data: profile } = await supabase
            .from('profiles')
            .select('id')
            .eq('id', session.user.id)
            .maybeSingle();
          
          if (profile) {
            console.log('[Auth] ✅ Active session found with valid profile, redirecting');
            navigateAfterAuth();
            return;
          } else {
            // 🛡️ CRITICAL FIX: Profile missing → DO NOT sign out!
            // New signups may not have profile row yet (trigger lag).
            // Trigger sync/recovery instead, then redirect.
            console.log('[Auth] ⚠️ Session found but profile missing, attempting recovery (NOT signing out)');
            try {
              await triggerLegacyProfileSync(session.user.id, { force: true });
            } catch (syncErr) {
              console.warn('[Auth] Profile recovery sync failed:', syncErr);
            }
            // Redirect anyway — Profile.tsx has its own self-heal that creates the row
            navigateAfterAuth();
            return;
          }
        }

        // Clear any stale localStorage credentials — don't auto-login from them
        localStorage.removeItem("meri_device_account");
        localStorage.removeItem("meri_device_id");

        console.log('[Auth] No valid session — showing auth UI');
      } catch (err) {
        console.error('[Auth] Session check error:', err);
        recordClientError({ label: "Auth.checkExistingSession", message: err instanceof Error ? err.message : String(err) });
      } finally {
        if (recoveryTimeout) clearTimeout(recoveryTimeout);
      }
    };

    checkExistingSession();
  }, []);

  // Handle pending registration after OAuth callback
  useEffect(() => {
    const handlePendingRegistration = async () => {
      const pendingData = localStorage.getItem("meri_pending_registration");
      if (!pendingData) return;

      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;

        const pending = JSON.parse(pendingData);
        localStorage.removeItem("meri_pending_registration");

        // Wait for profile row and gender/host mapping to be fully ready before redirecting
        const isHost = pending.gender === "female";
        await ensureProfileReady(
          user.id,
          {
            gender: pending.gender,
            display_name: pending.displayName,
          },
          { requireHost: isHost }
        );
        if (pending.gender) {
          localStorage.setItem(`gender_selected_${user.id}`, 'true');
        }

        await joinPendingAgencyAfterSignup(user.id, isHost);

        // Track user invitation
        await trackUserInvitation(user.id);

        // Check for pending sub-agent registration - redirect to sub-agent onboarding
        const pendingSubagent = localStorage.getItem("meri_pending_subagent");
        if (pendingSubagent) {
          localStorage.removeItem("meri_pending_subagent");
          toast({
            title: "Welcome!",
            description: `Account created as ${pending.displayName}! Continue your sub-agent setup.`,
          });
          navigate(`/become-sub-agent?agency=${pendingSubagent}`);
          return;
        }

        toast({
          title: "Welcome!",
          description: `Account created as ${pending.displayName}!`,
        });
        navigateAfterAuth();
      } catch (error) {
        console.error("Error completing registration:", error);
        recordClientError({ label: "Auth.pendingSubagent", message: error instanceof Error ? error.message : String(error) });
      }
    };

    handlePendingRegistration();
  }, []);

  // Google Sign-In removed - using only Start button and Email/Password

  const handleStartClick = () => {
    if (!agreed) {
      toast({
        title: "Accept Terms",
        description: "Please agree to User Agreement and Privacy Policy to continue.",
        variant: "destructive",
      });
      return;
    }

    // Native apps commit the next UI surface immediately. Device/session
    // recovery is useful, but it must never hold the touch frame hostage.
    setIsEmailFlow(false);
    setAuthStep("gender");
    localStorage.removeItem('meri_manual_logout');

    void (async () => {
      try {
      // Check if already logged in
      const { data: { session } } = await supabase.auth.getSession();
      if (session?.user) {
        console.log('[Auth] Already logged in, redirecting');
        navigateAfterAuth();
        return;
      }

      // STEP 1: Try to recover existing account for this device
      console.log('[Auth] Start button clicked — checking device for existing account');
      const deviceId = await generateDeviceId();
      const existingForDevice = await recoverAccountByDevice(deviceId);

      if (existingForDevice) {
        console.log('[Auth] Existing device account found — exchanging device token for session');
        const recovered = await completeDeviceRecovery(deviceId, existingForDevice.exchangeToken);
        if (recovered) {
          await ensureProfileReady(
            existingForDevice.userId,
            {
              display_name: existingForDevice.displayName,
              device_id: deviceId,
              gender: existingForDevice.gender || undefined,
            },
            { requireHost: existingForDevice.gender === 'female' }
          );
          localStorage.setItem("meri_device_id", deviceId);
          localStorage.setItem("meri_device_account", JSON.stringify({
            deviceId,
            userId: existingForDevice.userId,
            displayName: existingForDevice.displayName,
            avatarUrl: existingForDevice.avatarUrl,
            gender: existingForDevice.gender as Gender,
          }));
          toast({
            title: "🎉 Welcome Back!",
            description: `Logged in as ${existingForDevice.displayName}`,
          });
          navigateAfterAuth();
          return;
        }
        console.warn('[Auth] Device recovery failed, falling back to registration');
      }

    } catch (error) {
      console.error("Start click error:", error);
      recordClientError({ label: "Auth.handleStartClick", message: error instanceof Error ? error.message : String(error) });
      // Keep the already-open registration sheet; background recovery failure
      // should not show a blocking error on a fresh start tap.
    }
    })();
  };

  const handleLastUserLogin = () => {
    if (!agreed) {
      toast({
        title: "Accept Terms",
        description: "Please agree to User Agreement and Privacy Policy to continue.",
        variant: "destructive",
      });
      return;
    }
    if (lastUser) {
      setEmail(lastUser.email);
      setAuthStep("login");
    }
  };

  const handleLoginAuth = async () => {
    if (!email || !password) {
      toast({
        title: "Error",
        description: "Please enter email and password",
        variant: "destructive",
      });
      return;
    }

    // Brute force check
    const canProceed = await checkBeforeLogin(email);
    if (!canProceed) return;

    setLoading(true);
    try {
      const normalizedEmail = email.trim().toLowerCase();
      setEmail(normalizedEmail);

      let { error } = await supabase.auth.signInWithPassword({
        email: normalizedEmail,
        password,
      });

      if (error) {
        await recordAttempt(normalizedEmail, false);
        throw error;
      }
      await recordAttempt(normalizedEmail, true);
      
      // Sync profile from legacy project before routing so old account data is available instantly
      await triggerLegacyProfileSync((await supabase.auth.getUser()).data.user?.id);
      
      toast({
        title: "Welcome!",
        description: "Logged in successfully.",
      });
      navigateAfterAuth();
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Login failed",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const clearLastUser = () => {
    localStorage.removeItem("meri_last_user");
    setLastUser(null);
  };

  const handleGenderSelect = (gender: Gender) => {
    setSelectedGender(gender);
    // If email flow, go to email form after gender
    if (isEmailFlow) {
      setAuthStep("email");
    }
    // For Start flow, gender is selected inline in the combined form — no navigation needed
  };

  // Instant IP-based country detection on registration — SERVER-SIDE for accuracy
  const detectAndSaveLocation = async (userId: string) => {
    try {
      console.log('[Auth] Detecting country via SERVER-SIDE edge function for new user:', userId);
      
      // Try server-side detection first (uses real user IP, not proxy)
      let countryCode = '';
      let city = '';
      let region = '';
      let ip = '';

      try {
        const serverResult = await getDetectedCountry();
        if (serverResult?.countryCode) {
          countryCode = serverResult.countryCode;
          city = serverResult.city || '';
          region = serverResult.region || '';
          ip = serverResult.ip || '';
          console.log('[Auth] ✅ Server-side detection:', countryCode, city);
        } else {
          console.log('[Auth] Server-side detection failed, trying client-side fallback');
        }
      } catch (e) {
        console.log('[Auth] Edge function call failed, trying client-side fallback');
      }

      // Fallback to client-side only if server-side fails
      const geo = await loadGeolocation();
      if (!countryCode) {
        const ipResult = await geo.detectCountryViaIP();
        if (!ipResult) {
          console.log('[Auth] ALL detection methods failed - country will be null');
          return;
        }
        countryCode = ipResult.countryCode;
        city = ipResult.city || '';
        region = ipResult.region || '';
        ip = ipResult.ip || '';
        console.log('[Auth] Client-side fallback detection:', countryCode);
      }

      const countryFlag = geo.getCountryFlag(countryCode);
      const countryName = geo.countryNamesEnglish[countryCode] || "Unknown";

      const deviceInfo = {
        userAgent: navigator.userAgent,
        platform: navigator.platform || '',
        language: navigator.language || '',
        screenWidth: window.screen?.width || 0,
        screenHeight: window.screen?.height || 0,
        deviceMemory: (navigator as any).deviceMemory || null,
        hardwareConcurrency: navigator.hardwareConcurrency || null,
      };

      await supabase
        .from("profiles")
        .update({
          country_code: countryCode,
          country_name: countryName,
          country_flag: countryFlag,
          city: city || null,
          region: region || null,
          registration_ip: ip || null,
          last_login_ip: ip || null,
          registration_device_info: deviceInfo,
          last_login_device_info: deviceInfo,
          registration_user_agent: navigator.userAgent,
          last_login_device: navigator.userAgent,
        })
        .eq("id", userId);

      console.log('[Auth] ✅ Country LOCKED via server-side:', countryCode, countryName, countryFlag);

      // Auto-set app language based on detected country (only if not already set by user)
      const savedLang = localStorage.getItem("meri_app_language");
      if (!savedLang || savedLang === "auto") {
        const countryToLang: Record<string, string> = {
          BD: "en", IN: "hi", PK: "ur", NP: "ne", LK: "si",
          SA: "ar", AE: "ar", QA: "ar", KW: "ar", OM: "ar", BH: "ar", EG: "ar",
          US: "en", GB: "en", AU: "en", CA: "en",
          CN: "zh", TW: "zh", HK: "zh", JP: "ja", KR: "ko",
          PH: "tl", ID: "id", MY: "ms", TH: "th", VN: "vi",
          TR: "tr", RU: "ru", BR: "pt", PT: "pt",
          FR: "fr", DE: "de", ES: "es", IT: "it",
          IR: "fa", IL: "he", KE: "sw", TZ: "sw",
        };
        const langCode = countryToLang[countryCode] || "en";
        localStorage.setItem("meri_app_language", langCode);
        // Dynamic import to avoid circular dependency
        const i18n = (await import("@/i18n")).default;
        i18n.changeLanguage(langCode);
        console.log('[Auth] 🌐 Language auto-set to:', langCode, 'for country:', countryCode);
      }
    } catch (err) {
      console.error('[Auth] Location detection error:', err);
      recordClientError({ label: "Auth.i18n", message: err instanceof Error ? err.message : String(err) });
    }
  };

  const ensureProfileReady = async (
    userId: string,
    patch: Record<string, unknown>,
    options: { requireHost?: boolean; maxAttempts?: number } = {}
  ) => {
    // Strip server-protected columns (profiles triggers raise on direct mutation of these).
    // is_verified / is_host / host_status / host_level / coins / beans / diamonds / total_*
    // / registration_ip / last_login_ip / device_id / is_banned / is_blocked / is_deleted /
    // agency_id / call_rate_per_minute / is_face_verified can only be touched via SECDEF RPCs.
    // gender/host mapping is finalized through finalize_signup_profile; direct client
    // gender rewrites are blocked once the trigger has stored an initial value.
    const PROTECTED_PROFILE_FIELDS = new Set([
      'is_verified', 'is_host', 'is_face_verified', 'host_status', 'host_level',
      'diamonds', 'beans', 'diamonds', 'beans_balance', 'total_earnings', 'pending_earnings',
      'weekly_earnings', 'total_recharged', 'registration_ip', 'last_login_ip',
      'device_id', 'is_banned', 'is_blocked', 'is_deleted', 'blocked_reason',
      'agency_id', 'call_rate_per_minute', 'gender',
    ]);
    const cleanPatch = Object.fromEntries(
      Object.entries(patch).filter(([key, value]) => value !== undefined && !PROTECTED_PROFILE_FIELDS.has(key))
    );
    const maxAttempts = options.maxAttempts ?? 8;

    const finalizeViaServer = async () => {
      const selectedPatchGender = typeof patch.gender === 'string' ? patch.gender : null;
      const selectedPatchName = typeof patch.display_name === 'string' ? patch.display_name : null;
      const selectedPatchDevice = typeof patch.device_id === 'string' ? patch.device_id : null;

      if (!selectedPatchGender && !selectedPatchName && !selectedPatchDevice) return null;

      try {
        const { data: authData } = await supabase.auth.getUser();
        if (authData.user?.id !== userId) return null;

        const { data, error } = await supabase.rpc('finalize_signup_profile' as any, {
          _display_name: selectedPatchName,
          _gender: selectedPatchGender,
          _device_id: selectedPatchDevice,
        });

        if (error) {
          console.warn('[Auth] finalize_signup_profile failed:', error);
          return null;
        }

        const row = Array.isArray(data) ? data[0] : data;
        return row || null;
      } catch (error) {
        console.warn('[Auth] finalize signup exception:', error);
        return null;
      }
    };

    const finalized = await finalizeViaServer();
    if (finalized) {
      const genderReady = !("gender" in patch) || finalized.gender === patch.gender;
      const nameReady = !("display_name" in patch) || finalized.display_name === patch.display_name;
      const hostReady = !options.requireHost || finalized.is_host === true;
      if (genderReady && nameReady && hostReady) return finalized;
    }

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      try {
        const { data: profile } = await supabase
          .from("profiles")
          .select("id, gender, display_name, is_host")
          .eq("id", userId)
          .maybeSingle();

        if (profile) {
          const { error: updateError } = await supabase
            .from("profiles")
            .update(cleanPatch)
            .eq("id", userId);

          if (updateError) {
            console.warn(`[Auth] ensureProfileReady update attempt ${attempt + 1} failed:`, updateError);
          }

          const { data: refreshedProfile } = await supabase
            .from("profiles")
            .select("id, gender, display_name, is_host")
            .eq("id", userId)
            .maybeSingle();

          const genderReady = !("gender" in cleanPatch) || refreshedProfile?.gender === cleanPatch.gender;
          const nameReady = !("display_name" in cleanPatch) || refreshedProfile?.display_name === cleanPatch.display_name;
          const hostReady = !options.requireHost || refreshedProfile?.is_host === true;

          if (refreshedProfile && genderReady && nameReady && hostReady) {
            return refreshedProfile;
          }
        } else if (attempt >= 2) {
          try {
            await triggerLegacyProfileSync(userId, { force: true });
          } catch (syncError) {
            console.warn('[Auth] ensureProfileReady sync failed:', syncError);
          }
        }

        if (!profile && attempt === 4) {
          try {
            const { data: authData } = await supabase.auth.getUser();
            const authUser = authData.user;
            if (authUser?.id === userId) {
              const patchDisplayName = typeof cleanPatch.display_name === 'string' ? cleanPatch.display_name : null;
              const patchEmail = typeof cleanPatch.email === 'string' ? cleanPatch.email : authUser.email ?? null;
              const fallbackDisplayName = patchDisplayName || authUser.user_metadata?.full_name || authUser.user_metadata?.name || (patchEmail && !patchEmail.includes('@meri.local') ? patchEmail.split('@')[0] : null) || `User${Math.random().toString(36).slice(2, 8)}`;
              const avatarUrl = authUser.user_metadata?.avatar_url || authUser.user_metadata?.picture || null;
              const username = patchEmail && !patchEmail.includes('@meri.local') ? patchEmail.split('@')[0] : null;
              const appUid = String(Math.floor(1000000000 + Math.random() * 9000000000));

              const { error: insertError } = await supabase
                .from("profiles")
                .insert({
                  id: userId,
                  display_name: fallbackDisplayName,
                  username,
                  avatar_url: avatarUrl,
                  app_uid: appUid,
                  last_seen: new Date().toISOString(),
                  ...cleanPatch,
                });

              if (insertError) {
                console.warn('[Auth] ensureProfileReady fallback insert failed:', insertError);
              }
            }
          } catch (fallbackError) {
            console.warn('[Auth] ensureProfileReady fallback creation failed:', fallbackError);
          }
        }
      } catch (profileError) {
        console.warn(`[Auth] ensureProfileReady attempt ${attempt + 1} exception:`, profileError);
      }

      await new Promise((resolve) => setTimeout(resolve, 250 + attempt * 150));
    }

    return null;
  };

  const joinAgencyAfterSignup = async (userId: string, code: string) => {
    try {
      const normalizedCode = code.trim().toUpperCase();
      const { data } = await supabase.rpc('join_agency', {
        _host_id: userId,
        _agency_code: normalizedCode,
        _joined_via: 'agency_link'
      });
      return data;
    } catch (error) {
      console.error("Error joining agency:", error);
      recordClientError({ label: "Auth.normalizedCode", message: error instanceof Error ? error.message : String(error) });
      return false;
    }
  };

  const joinPendingAgencyAfterSignup = async (userId: string, isHost: boolean) => {
    const pendingReferral = localStorage.getItem("meri_pending_referral");
    if (!pendingReferral) return;
    localStorage.removeItem("meri_pending_referral");
    if (isHost) {
      await joinAgencyAfterSignup(userId, pendingReferral);
    }
  };

  // Device-based registration (Start button) - Always uses deterministic guest credentials
  // CRITICAL: Never use signInAnonymously() - it breaks device recovery
  const handleDeviceRegistration = async () => {
    // Registration allowed on all platforms (native + web preview)

    if (!displayName.trim()) {
      toast({
        title: "Error",
        description: "Please enter your name",
        variant: "destructive",
      });
      return;
    }

    setLoading(true);
    const deviceId = await generateDeviceId();
    console.log('[Auth] Registering new device:', deviceId);
    
    try {
      // SAFETY CHECK: Prevent duplicate accounts for same device
      const existingForDevice = await recoverAccountByDevice(deviceId);
      if (existingForDevice) {
        console.log('[Auth] SAFETY: Device already has account, recovering instead of creating new');
        const recovered = await completeDeviceRecovery(deviceId, existingForDevice.exchangeToken);
        if (recovered) {
          await ensureProfileReady(
            existingForDevice.userId,
            {
              display_name: existingForDevice.displayName,
              device_id: deviceId,
              gender: existingForDevice.gender || selectedGender || undefined,
            },
            { requireHost: (existingForDevice.gender || selectedGender) === 'female' }
          );
          localStorage.setItem("meri_device_account", JSON.stringify({
            deviceId,
            userId: existingForDevice.userId,
            displayName: existingForDevice.displayName,
            avatarUrl: existingForDevice.avatarUrl,
            gender: existingForDevice.gender as Gender,
          }));
          localStorage.setItem("meri_device_id", deviceId);
          toast({ title: "🎉 Account Recovered!", description: `Welcome back, ${existingForDevice.displayName}!` });
          navigateAfterAuth();
          return;
        }
      }
      
      // ALWAYS use deterministic guest credentials so recover_session_by_device works
      const guestEmail = `guest_${deviceId}@meri.local`;
      const guestPassword = `meri_${deviceId}_secure`;
      
      // Step 1: Try signing up with deterministic credentials
      const { data, error } = await supabase.auth.signUp({
        email: guestEmail,
        password: guestPassword,
        options: {
          data: {
            full_name: displayName,
            display_name: displayName,
            is_guest: true,
            device_id: deviceId,
            gender: selectedGender,
            selected_gender: selectedGender,
            account_type: selectedGender === 'female' ? 'host' : 'user',
            profile_type: selectedGender === 'female' ? 'host' : 'user',
          },
        },
      });

      let userId: string | null = null;

      if (error) {
        // Signup failed — most likely email already exists for this device
        // (orphan auth user, password drifted, or partial recovery state).
        // Try: signin → if fail, force-sync credentials → signin again.
        console.log('[Auth] Signup failed, trying signin:', error.message);
        let { data: signInData, error: signInError } = await supabase.auth.signInWithPassword({
          email: guestEmail,
          password: guestPassword,
        });

        if (signInError) {
          console.log('[Auth] Signin failed too, force-syncing guest credentials and retrying');
          try {
            await supabase.functions.invoke('convert-anonymous-to-guest', { body: { deviceId } });
          } catch (e) { /* ignore — retry signin anyway */ }
          const retry = await supabase.auth.signInWithPassword({
            email: guestEmail,
            password: guestPassword,
          });
          signInData = retry.data;
          signInError = retry.error;
        }

        if (signInError) {
          console.error('[Auth] Guest signin still failing after credential sync:', signInError.message);
          recordClientError({ label: "Auth.guestPassword", message: String(signInError.message ?? "unknown") });
          toast({
            title: "Couldn't create account",
            description: "Please try again in a moment.",
            variant: "destructive",
          });
          return;
        }

        userId = signInData.user?.id || null;

        // Update profile name if signing into existing account
        if (userId) {
          await supabase
            .from("profiles")
            .update({ 
              display_name: displayName,
              device_id: deviceId,
            })
            .eq("id", userId);
        }
      } else {
        userId = data.user?.id || null;
      }

      // Ensure profile row, gender, and female→host conversion are fully ready before redirect
      if (userId) {
        const readyProfile = await ensureProfileReady(
          userId,
          {
            display_name: displayName,
            device_id: deviceId,
            gender: selectedGender || undefined,
          },
          { requireHost: selectedGender === 'female' }
        );

        if (!readyProfile) {
          throw new Error('Profile setup is still processing. Please try again.');
        }

        // Save device account with credentials for future recovery
        localStorage.setItem("meri_device_account", JSON.stringify({
          deviceId,
          email: guestEmail,
          password: guestPassword,
          displayName,
          avatarUrl: null,
          gender: selectedGender,
        }));
        
        // Save device ID for recovery
        localStorage.setItem("meri_device_id", deviceId);

        // Mark gender as selected so GenderSelectionModal won't show
        if (selectedGender) {
          localStorage.setItem(`gender_selected_${userId}`, 'true');
        }

        // Instant country detection (non-blocking, never throws)
        try { detectAndSaveLocation(userId); } catch (e) { console.warn('[Auth] location detect failed:', e); }

        // Track invitation if user came via referral link (non-blocking)
        try { await trackUserInvitation(userId); } catch (e) { console.warn('[Auth] invitation track failed:', e); }

        try { await joinPendingAgencyAfterSignup(userId, selectedGender === 'female'); } catch (e) { console.warn('[Auth] agency join failed:', e); }

        if (selectedGender === 'female') {
          toast({
            title: "🎉 Congratulations!",
            description: "Your host account is ready! Complete face verification to go live.",
          });
        } else {
          toast({
            title: "🎉 Welcome!",
            description: `${displayName}, your account is ready!`,
          });
        }
        
        navigateAfterAuth();
      }

    } catch (error: any) {
      console.error("Registration error:", error);
      recordClientError({ label: "Auth.pendingReferral", message: error instanceof Error ? error.message : String(error) });
      toast({
        title: "Error",
        description: error?.message || "Account setup failed. Please try again.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  // NEW Email Flow - Step 1: Send OTP (optimistic / instant UI)
  const handleSendEmailOtp = async () => {
    const normalizedEmail = email.trim().toLowerCase();

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(normalizedEmail)) {
      toast({
        title: "Error",
        description: "Please enter a valid email address",
        variant: "destructive",
      });
      return;
    }

    // INSTANT UI: move to OTP screen immediately, send in the background.
    setEmail(normalizedEmail);
    setAuthStep("email_otp");
    startResendCountdown();
    toast({
      title: "📧 Sending Verification Code",
      description: `Code is being sent to ${normalizedEmail}. Check your inbox in a few seconds.`,
    });

    // Fire-and-forget background send + abuse gate
    (async () => {
      try {
        const canProceed = await checkBeforeLogin(`otp:${normalizedEmail}`);
        if (!canProceed) return;

        const { data, error } = await supabase.functions.invoke("send-email-otp", {
          body: { email: normalizedEmail, purpose: "login" },
        });

        if (error) throw error;
        if (data && data.success === false) {
          throw Object.assign(new Error(data.error || "Failed to send verification code"), { code: data.code });
        }

        await recordAttempt(`otp:${normalizedEmail}`, false);
      } catch (error: any) {
        console.error("Email OTP error:", error);
        recordClientError({ label: "Auth.handleSendEmailOtp", message: error instanceof Error ? error.message : String(error) });
        await recordAttempt(`otp:${normalizedEmail}`, false);
        const errorMessage = await getFunctionErrorMessage(error, "Failed to send verification code");
        if (error?.code === "EMAIL_DOMAIN_NOT_VERIFIED" || error?.code === "EMAIL_SENDER_DOMAIN_NOT_READY") {
          setAuthStep((current) => current === "email_otp" ? "email" : current);
          setResendCountdown(0);
        }
        toast({
          title: "Error",
          description: errorMessage,
          variant: "destructive",
        });
      }
    })();
  };

  // NEW Email Flow - Step 2: Verify OTP via custom edge function and sign in
  const handleVerifyEmailOtp = async () => {
    if (!otpCode || otpCode.length !== 6) {
      toast({
        title: "Error",
        description: "Please enter 6-digit verification code",
        variant: "destructive",
      });
      return;
    }

    const normalizedEmail = email.trim().toLowerCase();
    setEmail(normalizedEmail);

    setOtpLoading(true);
    try {
      // Verify the OTP via our custom function
      const { data: verifyData, error: verifyError } = await supabase.functions.invoke(
        "verify-email-otp",
        { body: { email: normalizedEmail, otp: otpCode, purpose: "login" } }
      );

      if (verifyError) {
        throw new Error(await getFunctionErrorMessage(verifyError, "Invalid verification code"));
      }
      if (!verifyData?.success || !verifyData?.verified_token) {
        throw new Error(verifyData?.error || "Invalid verification code");
      }
      setEmailVerifiedToken(verifyData.verified_token);

      const { data: signInData, error: signInError } = await supabase.functions.invoke(
        "otp-direct-signin",
        { body: { email: normalizedEmail, verified_token: verifyData.verified_token } }
      );

      if (signInError) {
        throw new Error(await getFunctionErrorMessage(signInError, "Failed to complete sign-in"));
      }
      if (signInData?.exists === false || signInData?.error === "User not found") {
        setEmailVerified(true);
        setPassword("");
        setConfirmPassword("");
        setAuthStep("email_password");
        toast({
          title: "✅ Email Verified!",
          description: "Now set your name and password to create your account.",
        });
        return;
      }
      if (!signInData?.success || !signInData?.access_token) {
        throw new Error(signInData?.error || "Failed to complete sign-in");
      }

      // Set the session in the Supabase client
      const { error: setErr } = await supabase.auth.setSession({
        access_token: signInData.access_token,
        refresh_token: signInData.refresh_token,
      });
      if (setErr) throw setErr;

      const { data: { user: verifiedUser } } = await supabase.auth.getUser();
      if (!verifiedUser) throw new Error("Sign-in completed but user not found");

      const fallbackDisplayName =
        verifiedUser.user_metadata?.full_name ||
        verifiedUser.user_metadata?.name ||
        normalizedEmail.split("@")[0] ||
        "User";

      // INSTANT LOGIN: navigate immediately, run profile readiness in background.
      // App-mount runLegacyProfileSync + profile self-healing handles any gaps.
      localStorage.setItem("meri_last_user", JSON.stringify({
        email: normalizedEmail,
        displayName: fallbackDisplayName,
        avatarUrl: null,
      }));
      localStorage.removeItem("meri_manual_logout");

      toast({
        title: "✅ Welcome!",
        description: "Login successful.",
      });
      resetAuthState();
      navigateAfterAuth();

      // Background — do not block UI
      void ensureProfileReady(
        verifiedUser.id,
        {
          email: normalizedEmail,
          display_name: fallbackDisplayName,
          is_verified: true,
        },
        { requireHost: false }
      ).then((readyProfile) => {
        if (readyProfile?.display_name && readyProfile.display_name !== fallbackDisplayName) {
          try {
            localStorage.setItem("meri_last_user", JSON.stringify({
              email: normalizedEmail,
              displayName: readyProfile.display_name,
              avatarUrl: (readyProfile as any).avatar_url || null,
            }));
          } catch {}
        }
      }).catch((e) => {
        console.warn("[Auth] background profile sync failed:", e);
      });
    } catch (error: any) {
      console.error("Email OTP verify error:", error);
      recordClientError({ label: "Auth.readyProfile", message: error instanceof Error ? error.message : String(error) });
      if (isExpiredOtpMessage(error?.message)) setOtpCode("");
      toast({
        title: "Invalid Code",
        description: error.message || "Invalid verification code",
        variant: "destructive",
      });
    } finally {
      setOtpLoading(false);
    }
  };

  // NEW Email Flow - Step 4: Create account with password
  const handleCreateEmailAccount = async () => {
    // Registration allowed on all platforms (native + web preview)

    if (!emailVerified) {
      toast({
        title: "Verify Email",
        description: "Please verify your email code before creating an account.",
        variant: "destructive",
      });
      setAuthStep("email");
      return;
    }

    if (!displayName.trim()) {
      toast({
        title: "Error",
        description: "Please enter your name",
        variant: "destructive",
      });
      return;
    }

    if (password.length < 6) {
      toast({
        title: "Error",
        description: "Password must be at least 6 characters",
        variant: "destructive",
      });
      return;
    }

    if (password !== confirmPassword) {
      toast({
        title: "Error",
        description: "Passwords do not match",
        variant: "destructive",
      });
      return;
    }

    setLoading(true);
    const deviceId = await generateDeviceId();
    
    try {
      // Check if this device already has an account
      const existingForDevice = await recoverAccountByDevice(deviceId);
      if (existingForDevice) {
        toast({
          title: "⚠️ Account Already Exists",
          description: `This device already has an account (${existingForDevice.displayName}). One device can only have one account.`,
          variant: "destructive",
        });
        setLoading(false);
        return;
      }

      if (!emailVerifiedToken) {
        toast({ title: "Verify Email", description: "Please request a fresh code and verify again.", variant: "destructive" });
        setAuthStep("email_otp");
        return;
      }

      const { data: signInData, error: signInError } = await supabase.functions.invoke("otp-direct-signin", {
        body: {
          email,
          verified_token: emailVerifiedToken,
          mode: "create",
          password,
          display_name: displayName,
          device_id: deviceId,
          gender: selectedGender,
        },
      });

      if (signInError) throw new Error(await getFunctionErrorMessage(signInError, "Failed to create account"));
      if (!signInData?.success || !signInData?.access_token || !signInData?.refresh_token) {
        throw new Error(signInData?.error || "Failed to create account");
      }

      const { error: setErr } = await supabase.auth.setSession({
        access_token: signInData.access_token,
        refresh_token: signInData.refresh_token,
      });
      if (setErr) throw setErr;

      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const readyProfile = await ensureProfileReady(
          user.id,
          {
            display_name: displayName,
            is_verified: true,
            email: email,
            device_id: deviceId,
            gender: selectedGender || undefined,
          },
          { requireHost: selectedGender === 'female' }
        );

        if (!readyProfile) {
          throw new Error('Profile setup is still processing. Please try again.');
        }

        if (selectedGender) localStorage.setItem(`gender_selected_${user.id}`, 'true');

        // Instant country detection (non-blocking)
        detectAndSaveLocation(user.id);

        await joinPendingAgencyAfterSignup(user.id, selectedGender === 'female');

        // Save last user info
        localStorage.setItem("meri_last_user", JSON.stringify({
          email,
          displayName,
          avatarUrl: null,
        }));

        toast({
          title: "🎉 Welcome to MeriLive!",
          description: "Your account has been created successfully!",
        });
        
        // Clear state and navigate
        resetAuthState();
        navigateAfterAuth();
      }
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to create account",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  // Helper to reset auth state
  const resetAuthState = () => {
    setAuthStep(null);
    setSelectedGender(null);
    setEmail("");
    setPassword("");
    setConfirmPassword("");
    setDisplayName("");
    setOtpCode("");
    setExpectedOtpCode("");
    setPendingUserId(null);
    setEmailVerified(false);
    setIsEmailFlow(false);
    setPhoneNumber("");
    setPhoneOtpCode("");
  };

  const filteredCountryCodes = COUNTRY_CODES.filter(c =>
    c.name.toLowerCase().includes(countrySearch.toLowerCase()) ||
    c.code.includes(countrySearch)
  );

  const selectedCountry = COUNTRY_CODES.find(c => c.code === selectedCountryCode) || COUNTRY_CODES[0];

  const getPhoneIdentity = () => {
    const nationalNumber = phoneNumber.replace(/\D/g, "").replace(/^0+/, "");
    const countryDigits = selectedCountryCode.replace(/\D/g, "");
    const phoneDigits = `${countryDigits}${nationalNumber}`;
    return {
      phoneDigits,
      displayPhone: phoneDigits ? `+${phoneDigits}` : "",
      phoneEmail: `phone_${phoneDigits}@meri.local`,
    };
  };

  // Phone Flow - Step 1: Send WhatsApp OTP
  const handleSendPhoneOtp = async () => {
    const { phoneDigits, displayPhone } = getPhoneIdentity();
    if (!phoneDigits || phoneDigits.length < 7) {
      toast({
        title: "Error",
        description: "Please enter a valid phone number",
        variant: "destructive",
      });
      return;
    }

    setAuthStep("phone_otp");
    startResendCountdown();
    toast({
      title: "📱 Sending WhatsApp Code",
      description: `Code is being sent to ${displayPhone}.`,
    });

    void (async () => {
    try {
      // Brute-force / abuse gate — shared namespace prevents OTP spam
      const canProceed = await checkBeforeLogin(`otp:${phoneDigits}`);
      if (!canProceed) return;

      const { data, error } = await supabase.functions.invoke('send-whatsapp-otp', {
        body: { phone_number: displayPhone, action: "send" }
      });

      if (error) throw error;
      if (!data?.success) {
        await recordAttempt(`otp:${phoneDigits}`, false);
        toast({
          title: "Error",
          description: data?.error || "Failed to send OTP",
          variant: "destructive",
        });
        return;
      }

      await recordAttempt(`otp:${phoneDigits}`, false);
      toast({
        title: "📱 WhatsApp OTP Sent!",
        description: `Verification code sent to ${displayPhone} via WhatsApp`,
      });
    } catch (error: any) {
      recordClientError({ label: "Auth.handleSendPhoneOtp", message: error instanceof Error ? error.message : String(error) });
      await recordAttempt(`otp:${phoneDigits}`, false);
      toast({
        title: "Error",
        description: error.message || "Failed to send WhatsApp OTP",
        variant: "destructive",
      });
    }
    })();
  };

  // Phone Flow - Step 2: Verify WhatsApp OTP
  const handleVerifyPhoneOtp = async () => {
    if (!phoneOtpCode || phoneOtpCode.length !== 6) {
      toast({
        title: "Error",
        description: "Please enter the 6-digit code",
        variant: "destructive",
      });
      return;
    }

    setPhoneOtpLoading(true);
    try {
      const { phoneDigits, displayPhone, phoneEmail } = getPhoneIdentity();
      const { data, error } = await supabase.functions.invoke('send-whatsapp-otp', {
        body: { phone_number: displayPhone, action: "verify", otp: phoneOtpCode }
      });

      if (error) throw error;
      if (!data?.verified || !data?.verified_token) {
        if (isExpiredOtpMessage(data?.error)) setPhoneOtpCode("");
        toast({
          title: "Invalid Code",
          description: data?.error || "The verification code is incorrect",
          variant: "destructive",
        });
        return;
      }
      setPhoneVerifiedToken(data.verified_token);

      // OTP verified — check if account already exists
      // Check if account already exists for this phone number
      let existingProfile: any = null;
      try {
        const { data } = await (supabase as any)
          .from("profiles")
          .select("id, display_name")
          .eq("phone_number", phoneDigits)
          .maybeSingle();
        existingProfile = data;
      } catch {}

      if (existingProfile) {
        // Existing account found — auto-login via edge function
        const { data: signInResult, error: signInError } = await supabase.functions.invoke('otp-direct-signin', {
          body: { email: phoneEmail, channel: "phone", identifier: phoneDigits, verified_token: data.verified_token }
        });

        if (!signInError && signInResult?.access_token && signInResult?.refresh_token) {
          await supabase.auth.setSession({
            access_token: signInResult.access_token,
            refresh_token: signInResult.refresh_token,
          });

          localStorage.removeItem('meri_manual_logout');
          toast({
            title: "✅ Welcome Back!",
            description: `Logged in as ${existingProfile.display_name || displayPhone}`,
          });
          resetAuthState();
          navigateAfterAuth();
          return;
        }
      }

      // No existing account — proceed to create new account
      toast({
        title: "✅ Phone Verified!",
        description: "Now set your name and password to create your account.",
      });
      setAuthStep("phone_password");
    } catch (error: any) {
      if (isExpiredOtpMessage(error?.message)) setPhoneOtpCode("");
      toast({
        title: "Error",
        description: error.message || "Verification failed",
        variant: "destructive",
      });
    } finally {
      setPhoneOtpLoading(false);
    }
  };

  // Phone Flow - Step 3: Create account after phone verification
  const handleCreatePhoneAccount = async () => {
    if (!displayName.trim()) {
      toast({ title: "Error", description: "Please enter your name", variant: "destructive" });
      return;
    }
    if (password.length < 6) {
      toast({ title: "Error", description: "Password must be at least 6 characters", variant: "destructive" });
      return;
    }
    if (password !== confirmPassword) {
      toast({ title: "Error", description: "Passwords do not match", variant: "destructive" });
      return;
    }

    setLoading(true);
    const deviceId = await generateDeviceId();
    const { phoneDigits, phoneEmail } = getPhoneIdentity();

    try {
      const { data, error } = await supabase.auth.signUp({
        email: phoneEmail,
        password,
        options: {
          data: {
            full_name: displayName,
            display_name: displayName,
            phone_number: phoneDigits,
            device_id: deviceId,
            phone_verified: true,
            phone_dial_code: selectedCountry?.code || null,
            country_code: selectedCountry?.country || null,
            country_name: selectedCountry?.name || null,
            country_flag: selectedCountry?.flag || null,
            gender: selectedGender,
            selected_gender: selectedGender,
            account_type: selectedGender === 'female' ? 'host' : 'user',
            profile_type: selectedGender === 'female' ? 'host' : 'user',
          },
        },
      });

      if (error) {
        if (error.message?.includes("already registered")) {
          // Try login
          const { error: loginError } = await supabase.auth.signInWithPassword({
            email: phoneEmail,
            password,
          });
          if (loginError) {
            toast({ title: "Account Exists", description: "This phone is already registered with a different password.", variant: "destructive" });
            return;
          }
          localStorage.removeItem('meri_manual_logout');
          toast({ title: "✅ Welcome Back!", description: "Logged in successfully!" });
          resetAuthState();
          navigateAfterAuth();
          return;
        }
        throw error;
      }

      if (data.user) {
        const readyProfile = await ensureProfileReady(
          data.user.id,
          {
            display_name: displayName,
            phone_number: phoneDigits,
            phone_verified: true,
            device_id: deviceId,
            is_verified: true,
            gender: selectedGender || undefined,
            country_code: selectedCountry?.country || undefined,
            country_name: selectedCountry?.name || undefined,
            country_flag: selectedCountry?.flag || undefined,
          },
          { requireHost: selectedGender === 'female' }
        );

        if (!readyProfile) {
          throw new Error('Profile setup is still processing. Please try again.');
        }

        if (selectedGender) {
          localStorage.setItem(`gender_selected_${data.user.id}`, 'true');
        }

        detectAndSaveLocation(data.user.id);
        await trackUserInvitation(data.user.id);
        await joinPendingAgencyAfterSignup(data.user.id, selectedGender === 'female');

        localStorage.setItem("meri_last_user", JSON.stringify({
          email: phoneEmail,
          displayName,
          avatarUrl: null,
        }));

        toast({ title: "🎉 Welcome to MeriLive!", description: "Your account has been created!" });
        resetAuthState();
        navigateAfterAuth();
      }
    } catch (error: any) {
      toast({ title: "Error", description: error.message || "Failed to create account", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  // Resend WhatsApp OTP — rate-limited via brute-force gate
  const handleResendPhoneOtp = async () => {
    const { phoneDigits, displayPhone } = getPhoneIdentity();

    const canProceed = await checkBeforeLogin(`otp:${phoneDigits}`);
    if (!canProceed) return;

    setPhoneOtpLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('send-whatsapp-otp', {
        body: { phone_number: displayPhone, action: "send" }
      });
      if (error) throw error;
      await recordAttempt(`otp:${phoneDigits}`, false);
      toast({ title: "Code Resent", description: `New code sent to ${displayPhone} via WhatsApp` });
      startResendCountdown();
    } catch (error: any) {
      recordClientError({ label: "Auth.handleResendPhoneOtp", message: error instanceof Error ? error.message : String(error) });
      await recordAttempt(`otp:${phoneDigits}`, false);
      toast({ title: "Error", description: "Failed to resend. Please wait a moment.", variant: "destructive" });
    } finally {
      setPhoneOtpLoading(false);
    }
  };

  // Resend OTP for new email flow — rate-limited via brute-force gate
  const handleResendEmailOtp = async () => {
    const normalizedEmail = email.trim().toLowerCase();
    if (!normalizedEmail) return;

    const canProceed = await checkBeforeLogin(`otp:${normalizedEmail}`);
    if (!canProceed) return;

    setOtpLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("send-email-otp", {
        body: { email: normalizedEmail, purpose: "login" },
      });

      if (error) throw error;
      if (data && data.success === false) {
        throw Object.assign(new Error(data.error || "Failed to resend code"), { code: data.code });
      }

      await recordAttempt(`otp:${normalizedEmail}`, false);
      toast({
        title: "Code Resent",
        description: `A new verification code has been sent to ${normalizedEmail}`,
      });
      startResendCountdown();
    } catch (error: any) {
      recordClientError({ label: "Auth.handleResendEmailOtp", message: error instanceof Error ? error.message : String(error) });
      await recordAttempt(`otp:${normalizedEmail}`, false);
      const errorMessage = await getFunctionErrorMessage(error, "Failed to resend code. Please try again.");
      toast({
        title: "Error",
        description: errorMessage,
        variant: "destructive",
      });
    } finally {
      setOtpLoading(false);
    }
  };

  // LEGACY: Email-based registration (keeping for backwards compatibility)
  const handleEmailAuth = async () => {
    if (!email || !password || !displayName) {
      toast({
        title: "Error",
        description: "Please fill in all fields",
        variant: "destructive",
      });
      return;
    }

    if (password.length < 6) {
      toast({
        title: "Error",
        description: "Password must be at least 6 characters",
        variant: "destructive",
      });
      return;
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      toast({
        title: "Error",
        description: "Please enter a valid email address",
        variant: "destructive",
      });
      return;
    }

    setLoading(true);
    try {

      // Generate OTP code
      const verificationCode = Math.floor(100000 + Math.random() * 900000).toString();
      setExpectedOtpCode(verificationCode);
      
      // Send confirmation email via edge function - DO NOT create account yet
      const { data: emailResult, error: emailError } = await supabase.functions.invoke('send-signup-confirmation', {
        body: {
          email,
          displayName,
          verificationCode,
        }
      });
      
      if (emailError) {
        console.error("Email sending error:", emailError);
        recordClientError({ label: "Auth.verificationCode", message: emailError instanceof Error ? emailError.message : String(emailError) });
        toast({
          title: "Error",
          description: "Failed to send verification code. Please try again.",
          variant: "destructive",
        });
        setLoading(false);
        return;
      }

      toast({
        title: "📧 Verification Code Sent",
        description: `Check your email at ${email} for the 6-digit verification code.`,
      });
      
      // Show OTP verification step - account will be created AFTER verification
      setAuthStep("otp_verify");
      startResendCountdown();
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to send verification code",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  // Verify OTP code - THEN create account
  const handleVerifyOtp = async () => {
    if (!otpCode || otpCode.length !== 6) {
      toast({
        title: "Error",
        description: "Please enter 6-digit verification code",
        variant: "destructive",
      });
      return;
    }

    setOtpLoading(true);
    try {
      if (otpCode === expectedOtpCode) {
        // 🛡️ PERMANENT BAN GUARD — block signup if device/IP/face is on the urgent ban list
        try {
          const { getPersistentDeviceId } = await import('@/utils/persistentDeviceId');
          const deviceId = await getPersistentDeviceId();
          const { data: eligibility } = await supabase.rpc('check_signup_eligibility', {
            _device_id: deviceId,
            _ip_address: null,
            _face_hash: null,
          });
          const result = eligibility as { eligible?: boolean; reason?: string } | null;
          if (result && result.eligible === false) {
            toast({
              title: "🚫 Signup Blocked",
              description: result.reason || "This device has been permanently banned. Please contact support.",
              variant: "destructive",
            });
            setOtpLoading(false);
            return;
          }
        } catch (eligErr) {
          console.warn('[Auth] Signup eligibility check failed (non-fatal)', eligErr);
        }

        // OTP verified successfully - NOW create the account
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            data: {
              full_name: displayName,
              display_name: displayName,
              gender: selectedGender,
              selected_gender: selectedGender,
              account_type: selectedGender === 'female' ? 'host' : 'user',
              profile_type: selectedGender === 'female' ? 'host' : 'user',
              email_confirmed: true,
            },
          },
        });

        if (error) {
          // If user already exists, try to login
          if (error.message?.includes("already registered")) {
            const { error: loginError } = await supabase.auth.signInWithPassword({
              email,
              password,
            });
            
            if (loginError) {
              toast({
                title: "Error",
                description: "This email is already registered with a different password.",
                variant: "destructive",
              });
              setOtpLoading(false);
              return;
            }
            
            toast({
              title: "Welcome Back!",
              description: "Logged in successfully!",
            });
            navigateAfterAuth();
            return;
          }
          
          throw error;
        }

        if (data.user) {
          const isHost = selectedGender === "female";
          const readyProfile = await ensureProfileReady(
            data.user.id,
            {
              gender: selectedGender,
              display_name: displayName,
              email: email,
            },
            { requireHost: isHost }
          );

          if (!readyProfile) {
            throw new Error('Profile setup is still processing. Please try again.');
          }

          if (selectedGender) {
            localStorage.setItem(`gender_selected_${data.user.id}`, 'true');
          }

          await joinPendingAgencyAfterSignup(data.user.id, isHost);

          // Track user invitation
          await trackUserInvitation(data.user.id);

          // Save last user info
          localStorage.setItem("meri_last_user", JSON.stringify({
            email,
            displayName,
            avatarUrl: null,
          }));
        }

        toast({
          title: "🎉 Welcome to MeriLive!",
          description: "Your account has been created successfully!",
        });
        
        // Clear state and navigate
        setAuthStep(null);
        setSelectedGender(null);
        setEmail("");
        setPassword("");
        setDisplayName("");
        setOtpCode("");
        setExpectedOtpCode("");
        setPendingUserId(null);
        
        navigateAfterAuth();
      } else {
        toast({
          title: "Invalid Code",
          description: "The verification code is incorrect. Please try again.",
          variant: "destructive",
        });
      }
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Verification failed",
        variant: "destructive",
      });
    } finally {
      setOtpLoading(false);
    }
  };

  // Resend OTP
  const handleResendOtp = async () => {
    setOtpLoading(true);
    try {
      const verificationCode = Math.floor(100000 + Math.random() * 900000).toString();
      setExpectedOtpCode(verificationCode);
      
      await supabase.functions.invoke('send-signup-confirmation', {
        body: {
          email,
          displayName,
          verificationCode,
        }
      });
      
      toast({
        title: "Code Resent",
        description: `A new verification code has been sent to ${email}`,
      });
      startResendCountdown();
    } catch (error: any) {
      toast({
        title: "Error",
        description: "Failed to resend code. Please try again.",
        variant: "destructive",
      });
    } finally {
      setOtpLoading(false);
    }
  };

  const handleGmailClick = () => {
    if (!agreed) {
      toast({
        title: "Accept Terms",
        description: "Please agree to User Agreement and Privacy Policy to continue.",
        variant: "destructive",
      });
      return;
    }
    // For Gmail, we need to select gender first, then show email form
    setAuthStep("gender");
    // Mark that we're doing email registration
    setIsEmailFlow(true);
  };

  const closeDialog = () => {
    setAuthStep(null);
    setSelectedGender(null);
    setIsEmailFlow(false);
  };

  return (
    <div className="fixed inset-0 overflow-hidden">
      {/* Background - Video, Image, or Premium Gradient */}
      <AuthBackground branding={branding} />
      {(!branding.background_url || branding.background_type === 'gradient') && (
        <div className="absolute inset-0">
          {/* Animated glow orbs */}
          <div className="absolute top-1/4 left-1/4 w-64 h-64 rounded-full opacity-20" style={{
            background: 'radial-gradient(circle, #9b87f5 0%, transparent 70%)',
            filter: 'blur(60px)',
            animation: 'pulse 4s ease-in-out infinite',
          }} />
          <div className="absolute bottom-1/3 right-1/4 w-48 h-48 rounded-full opacity-15" style={{
            background: 'radial-gradient(circle, #f472b6 0%, transparent 70%)',
            filter: 'blur(50px)',
            animation: 'pulse 5s ease-in-out infinite 1s',
          }} />
          <div className="absolute top-2/3 left-1/2 w-56 h-56 rounded-full opacity-10" style={{
            background: 'radial-gradient(circle, #60a5fa 0%, transparent 70%)',
            filter: 'blur(55px)',
            animation: 'pulse 6s ease-in-out infinite 2s',
          }} />
        </div>
      )}
      <div className="absolute inset-0 bg-gradient-to-b from-black/10 via-transparent to-black/20 pointer-events-none" />

      {/* Content */}
      <div className="relative z-10 h-full min-h-0 overflow-y-auto overflow-x-hidden" style={{ WebkitOverflowScrolling: 'touch' }}>
        <div className="min-h-full flex flex-col justify-end gap-2 px-5 pt-4 pb-14 safe-area-top safe-area-bottom">
        {/* Auth Buttons */}
        <div className="space-y-2 pb-2">
          {/* Latest Login - Only show if user previously logged in */}
          {lastUser && (
            <div className="relative">
              <button
                onClick={handleLastUserLogin}
                className="w-full flex items-center gap-3 p-3 bg-white/90 backdrop-blur-sm rounded-2xl shadow-lg hover:bg-white transition-all"
              >
                <AvatarWithFrame
                  userId={(lastUser as any).userId}
                  src={lastUser.avatarUrl || undefined}
                  name={lastUser.displayName || "U"}
                  level={1}
                  size="sm"
                  showFrame={true}
                  showAnimation={false}
                />
                <div className="flex-1 text-left">
                  <p className="font-semibold text-foreground">{lastUser.displayName || "User"}</p>
                  <p className="text-xs text-muted-foreground">{lastUser.email}</p>
                </div>
  <Badge className="bg-amber-500 text-white border-0 px-2 py-0.5 text-xs"> {/* dark-ok */}
                  Continue
                </Badge>
              </button>
              <button
                onClick={clearLastUser}
                aria-label="Remove saved account"
  className="absolute -top-2 -right-2 w-6 h-6 bg-rose-500 text-white rounded-full flex items-center justify-center shadow-md hover:bg-rose-600 transition-colors" /* dark-ok */
              >
                <X className="w-3 h-3" />
              </button>
            </div>
          )}

          {/* Start Button - Premium Mobile Design */}
          <Button
            onClick={() => { setPendingBtn('start'); handleStartClick(); }}
            data-auth-action="true"
  className="w-full h-10 rounded-2xl bg-gradient-to-r from-purple-600 via-fuchsia-500 to-pink-500 hover:from-purple-700 hover:via-fuchsia-600 hover:to-pink-600 text-white text-sm font-bold shadow-[0_6px_24px_-6px_rgba(168,85,247,0.5)] border border-purple-400/30 transition-opacity duration-75 active:opacity-90 backdrop-blur-md" /* dark-ok */
          >
            <span className="flex items-center gap-2">
              {pendingBtn === 'start' ? (
                <Loader2 className="w-5 h-5 animate-spin text-amber-300 drop-shadow-[0_0_6px_rgba(251,191,36,0.8)]" />
              ) : (
                <Rocket3DIcon className="w-5 h-5" />
              )}
              <span className="drop-shadow-lg tracking-wide">Get Started</span>
            </span>
          </Button>

          {/* Phone Number Button */}
          <Button
            onClick={() => {
              if (!agreed) {
                toast({
                  title: "Accept Terms",
                  description: "Please agree to User Agreement and Privacy Policy to continue.",
                  variant: "destructive",
                });
                return;
              }
              setPendingBtn('phone');
              setPhoneNumber("");
              setPhoneOtpCode("");
              setAuthStep("phone_input");
            }}
            data-auth-action="true"
  className="w-full h-10 rounded-2xl bg-gradient-to-r from-green-500 via-emerald-500 to-green-600 hover:from-green-600 hover:via-emerald-600 hover:to-green-700 text-white text-sm font-semibold shadow-[0_6px_24px_-6px_rgba(16,185,129,0.4)] border border-green-400/30 transition-opacity duration-75 active:opacity-90 backdrop-blur-md" /* dark-ok */
          >
            {pendingBtn === 'phone' ? (
              <Loader2 className="w-5 h-5 mr-2 animate-spin text-amber-300 drop-shadow-[0_0_6px_rgba(251,191,36,0.8)]" />
            ) : (
              <Phone className="w-5 h-5 mr-2" />
            )}
            <span>Continue with Phone</span>
          </Button>

          {/* Email Login/Signup Button */}
          <Button
            onClick={() => {
              if (!agreed) {
                toast({
                  title: "Accept Terms",
                  description: "Please agree to User Agreement and Privacy Policy to continue.",
                  variant: "destructive",
                });
                return;
              }
              setPendingBtn('email');
              // Start new email flow - first step is email input
              setIsEmailFlow(true);
              setEmail("");
              setAuthStep("email");
            }}
            data-auth-action="true"
  className="w-full h-10 rounded-2xl bg-gradient-to-r from-indigo-700 via-blue-600 to-sky-600 hover:from-indigo-800 hover:via-blue-700 hover:to-sky-700 text-white text-sm font-semibold shadow-[0_6px_24px_-6px_rgba(37,99,235,0.55)] border border-indigo-400/30 transition-opacity duration-75 active:opacity-90 backdrop-blur-md" /* dark-ok */
          >
            {pendingBtn === 'email' ? (
              <Loader2 className="w-5 h-5 mr-2 animate-spin text-amber-300 drop-shadow-[0_0_6px_rgba(251,191,36,0.8)]" />
            ) : (
              <Mail className="w-5 h-5 mr-2 text-white" />
            )}
            <span className="drop-shadow-md tracking-wide">Continue with Email</span>
          </Button>


          {/* Terms agreement */}
          <button
            onClick={() => setAgreed(!agreed)}
            className={`
              w-full mt-1 py-2 px-3 rounded-xl flex items-center justify-center gap-2
              transition-all duration-300 backdrop-blur-md
              ${agreed 
                ? 'bg-gradient-to-r from-emerald-500/20 to-teal-500/20 border border-emerald-400/40 shadow-[0_0_20px_-5px_rgba(16,185,129,0.3)]' 
                : 'bg-white/5 border border-white/15 hover:border-white/25'
              }
            `}
          >
            <div className={`
              w-4 h-4 rounded-md flex items-center justify-center transition-all duration-300
              ${agreed 
                ? 'bg-gradient-to-br from-emerald-400 to-teal-500 shadow-lg' 
                : 'bg-white/10 border border-white/30'
              }
            `}>
              {agreed && (
                <Check className="w-3 h-3 text-white" /> /* dark-ok */
              )}
            </div>
            <span className={`text-[10px] leading-tight transition-colors tracking-wide ${agreed ? 'text-white/95' : 'text-white/70'}`}> {/* dark-ok */}
              I agree to the{' '}
              <span className="underline decoration-white/40">Terms of Service</span>
              {' & '}
              <span className="underline decoration-white/40">Privacy Policy</span>
              {' • 18+'}
            </span>
          </button>
        </div>
      </div>

      {/* Gender + Name Combined Dialog (Start flow & Email flow) */}
      {authStep === "gender" && (
      <Dialog open={authStep === "gender"} onOpenChange={() => closeDialog()}>
        <DialogContent className="max-w-[90vw] sm:max-w-sm mx-auto p-0 border-0 rounded-3xl overflow-visible bg-transparent shadow-2xl shadow-pink-900/30">
          <div className="absolute inset-0 rounded-3xl bg-gradient-to-br from-pink-500/40 via-rose-500/30 to-amber-500/40 animate-[spin_8s_linear_infinite] blur-[1px]" style={{ padding: '1px' }} />
          <div className="relative rounded-3xl bg-gradient-to-b from-[#FFFBF2] via-[#FAF5EA] to-[#F5EFDF] p-6">
            <div className="absolute top-0 left-1/2 -translate-x-1/2 w-40 h-40 bg-pink-500/15 rounded-full blur-3xl pointer-events-none" />

            <DialogHeader className="relative z-10">
              <div className="flex justify-center mb-3">
                <div className="w-16 h-16 rounded-full bg-gradient-to-br from-pink-500 via-rose-500 to-amber-500 flex items-center justify-center shadow-lg shadow-pink-500/30 ring-2 ring-white/40">
                  <Sparkles className="w-8 h-8 text-white drop-shadow" />
                </div>
              </div>
              <DialogTitle className="text-center text-2xl font-bold tracking-tight bg-gradient-to-r from-pink-700 via-rose-600 to-amber-600 bg-clip-text text-transparent">Welcome aboard</DialogTitle>
              <DialogDescription className="text-slate-600 text-center text-sm mt-1">
                Tell us your name and select your gender to continue
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-5 pt-4 relative z-10">
              {/* Name Input */}
              <div>
                <label className="text-slate-700 text-xs font-semibold mb-1.5 block">Your Name</label>
                <div className="relative">
                  <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                  <Input
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                    placeholder="Enter your name"
                    className="pl-10 h-11 bg-white border-slate-200 text-slate-900 placeholder:text-slate-400 rounded-xl focus:border-pink-400 focus:ring-1 focus:ring-pink-400"
                    maxLength={30}
                    autoFocus
                  />
                </div>
              </div>

              {/* Gender Selection */}
              <div className="grid grid-cols-2 gap-3">
                {/* Male */}
                <button
                  onClick={() => setSelectedGender("male")}
                  className={`relative p-4 rounded-2xl border-2 transition-all ${
                    selectedGender === "male"
                      ? "border-blue-500 bg-blue-50 shadow-md shadow-blue-500/20"
                      : "border-slate-200 bg-white hover:border-blue-300"
                  }`}
                >
                  <div className="flex flex-col items-center gap-2">
                    <div className={`w-14 h-14 rounded-full bg-gradient-to-br from-blue-100 to-cyan-100 flex items-center justify-center text-3xl ${
                      selectedGender === "male" ? "ring-2 ring-blue-500" : ""
                    }`}>
                      👨
                    </div>
                    <span className={`font-semibold text-sm ${
                      selectedGender === "male" ? "text-blue-700" : "text-slate-800"
                    }`}>Male</span>
                    <span className="text-[10px] text-slate-500">User Account</span>
                  </div>
                  {selectedGender === "male" && (
                    <div className="absolute -top-2 -right-2 w-6 h-6 rounded-full bg-blue-500 flex items-center justify-center shadow-md">
                      <Check className="w-4 h-4 text-white" />
                    </div>
                  )}
                </button>

                {/* Female */}
                <button
                  onClick={() => setSelectedGender("female")}
                  className={`relative p-4 rounded-2xl border-2 transition-all ${
                    selectedGender === "female"
                      ? "border-pink-500 bg-pink-50 shadow-md shadow-pink-500/20"
                      : "border-slate-200 bg-white hover:border-pink-300"
                  }`}
                >
                  <div className="flex flex-col items-center gap-2">
                    <div className={`w-14 h-14 rounded-full bg-gradient-to-br from-pink-100 to-rose-100 flex items-center justify-center text-3xl ${
                      selectedGender === "female" ? "ring-2 ring-pink-500" : ""
                    }`}>
                      👩
                    </div>
                    <span className={`font-semibold text-sm ${
                      selectedGender === "female" ? "text-pink-700" : "text-slate-800"
                    }`}>Female</span>
                    <div className="flex items-center gap-1">
                      <span className="text-[10px] text-amber-700 font-semibold">👑 Host Account</span>
                    </div>
                  </div>
                  {selectedGender === "female" && (
                    <div className="absolute -top-2 -right-2 w-6 h-6 rounded-full bg-pink-500 flex items-center justify-center shadow-md">
                      <Check className="w-4 h-4 text-white" />
                    </div>
                  )}
                </button>
              </div>

              {/* Female host notice */}
              {selectedGender === "female" && (
                <div className="p-3 rounded-xl bg-gradient-to-r from-pink-50 to-rose-50 border border-pink-200">
                  <p className="text-pink-800 text-xs text-center font-medium">
                    👑 Selecting Female will automatically convert your account to a Host account
                  </p>
                </div>
              )}

              {/* Get Started / Continue Button */}
              <Button
                onClick={() => {
                  if (isEmailFlow) {
                    handleGenderSelect(selectedGender);
                  } else {
                    handleDeviceRegistration();
                  }
                }}
                disabled={loading || !displayName.trim() || !selectedGender}
 className="w-full h-12 rounded-2xl bg-gradient-to-r from-pink-600 via-rose-500 to-pink-600 hover:from-pink-500 hover:via-rose-400 hover:to-pink-500 text-white font-bold text-base disabled:opacity-40 shadow-lg shadow-pink-600/25 transition-all duration-300 hover:shadow-xl hover:scale-[1.02] active:scale-[0.98]"
              >
                <Sparkles className="w-5 h-5 mr-2" />
                {isEmailFlow ? "Continue" : "Get Started"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
      )}

      {/* Name Entry Dialog kept for backward compat but redirects to gender */}
      {authStep === "name" && (
      <Dialog open={authStep === "name"} onOpenChange={() => { setAuthStep("gender"); }}>
        <DialogContent className="max-w-sm mx-auto bg-gradient-to-br from-[#FFFBF2] via-[#FAF5EA] to-[#F5EFDF] border-amber-200/70">
          <DialogHeader>
            <DialogTitle className="text-slate-800 text-center text-xl font-bold">Enter Your Name</DialogTitle>
            <DialogDescription className="text-slate-600 text-center">
              This will be your display name
            </DialogDescription>
          </DialogHeader>
        </DialogContent>
      </Dialog>
      )}

      {/* NEW Email Flow - Step 1: Email Input - ULTRA PREMIUM */}
      {authStep === "email" && (
      <Dialog open={authStep === "email"} onOpenChange={() => resetAuthState()}>
        <DialogContent className="max-w-[90vw] sm:max-w-sm mx-auto p-0 border-0 rounded-3xl overflow-visible bg-transparent shadow-2xl shadow-purple-900/40">
          {/* Animated gradient border */}
          <div className="absolute inset-0 rounded-3xl bg-gradient-to-br from-pink-500/40 via-purple-500/30 to-cyan-500/40 animate-[spin_8s_linear_infinite] blur-[1px]" style={{ padding: '1px' }} />
          <div className="relative rounded-3xl bg-gradient-to-br from-[#FFFBF2] via-[#FAF5EA] to-[#F5EFDF] backdrop-blur-xl p-6">
            {/* Decorative orbs */}
            <div className="absolute top-0 left-1/2 -translate-x-1/2 w-40 h-40 bg-purple-600/15 rounded-full blur-3xl pointer-events-none" />
            <div className="absolute bottom-0 right-0 w-32 h-32 bg-pink-600/10 rounded-full blur-3xl pointer-events-none" />
            
            {/* Close button handled by DialogContent */}

            <DialogHeader className="relative z-10">
              <div className="flex justify-center mb-5">
                <div className="relative">
                  <div className="absolute inset-0 bg-gradient-to-br from-pink-500 to-purple-600 rounded-full blur-lg opacity-60 animate-pulse" />
                  <div className="relative w-20 h-20 rounded-full bg-gradient-to-br from-pink-500 via-purple-500 to-violet-600 flex items-center justify-center shadow-lg shadow-purple-500/30 ring-2 ring-white/10">
 <Mail className="w-9 h-9 text-white drop-shadow-lg" />
                  </div>
                </div>
              </div>
 <DialogTitle className="text-center text-2xl font-bold tracking-tight bg-gradient-to-r from-pink-700 via-rose-600 to-pink-700 bg-clip-text text-transparent">
                Enter Your Email
              </DialogTitle>
              <DialogDescription className="text-slate-600 text-center text-sm mt-1">
                We'll send a verification code to your email
              </DialogDescription>
            </DialogHeader>
            
            <div className="py-5 space-y-5 relative z-10">
              <div className="relative group">
                <div className="absolute -inset-[1px] rounded-2xl bg-gradient-to-r from-pink-500/50 via-purple-500/50 to-pink-500/50 opacity-60 group-focus-within:opacity-100 transition-opacity blur-[0.5px]" />
                <div className="relative flex items-center bg-white border border-amber-200/70 rounded-2xl overflow-hidden">
                  <div className="pl-4 pr-2">
                    <span className="text-purple-400/70 text-lg font-light select-none">@</span>
                  </div>
                  <Input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="your@email.com"
                    className="h-14 bg-transparent border-0 text-slate-900 font-semibold tracking-wide placeholder:text-slate-500 placeholder:font-normal placeholder:tracking-normal rounded-2xl text-base focus-visible:ring-0 focus-visible:ring-offset-0"
                    autoFocus
                    inputMode="email"
                    autoComplete="email"
                    autoCapitalize="off"
                    autoCorrect="off"
                    spellCheck={false}
                    enterKeyHint="send"
                    onKeyDown={(e) => { if (e.key === 'Enter' && email.trim() && !loading) { e.preventDefault(); handleSendEmailOtp(); } }}
                  />

                </div>
              </div>
              
              <Button
                onClick={handleSendEmailOtp}
                disabled={loading || !email.trim()}
 className="w-full h-14 bg-gradient-to-r from-pink-600 via-rose-500 to-pink-600 hover:from-pink-500 hover:via-rose-400 hover:to-pink-500 text-white font-bold rounded-2xl text-base shadow-lg shadow-pink-600/25 transition-all duration-300 hover:shadow-xl hover:shadow-pink-500/30 hover:scale-[1.02] active:scale-[0.98] disabled:opacity-40 disabled:hover:scale-100"
              >
                <Mail className="w-5 h-5 mr-2.5" />
                Send Verification Code
              </Button>

              <div className="text-center pt-1">
                <button
                  onClick={() => {
                    setIsEmailFlow(false);
                    setAuthStep("login");
                  }}
                  className="text-slate-500 text-sm hover:text-slate-700 transition-colors"
                >
                  Already have an account? <span className="text-pink-400 font-semibold hover:text-pink-300">Login</span>
                </button>
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>
      )}

      {/* NEW Email Flow - Step 2: OTP Verification - ULTRA PREMIUM */}
      {authStep === "email_otp" && (
      <Dialog open={authStep === "email_otp"} onOpenChange={() => resetAuthState()}>
        <DialogContent className="max-w-[92vw] sm:max-w-[400px] mx-auto p-0 border-0 rounded-2xl overflow-hidden bg-white shadow-2xl shadow-slate-900/20">
          <div className="relative px-7 pt-8 pb-7">
            {/* Subtle top accent line */}
            <div className="absolute top-0 left-0 right-0 h-[3px] bg-gradient-to-r from-emerald-500 via-teal-500 to-emerald-500" />

            <DialogHeader>
              <div className="flex justify-center mb-5">
                <div className="w-14 h-14 rounded-2xl bg-emerald-50 flex items-center justify-center ring-1 ring-emerald-100">
                  <Lock className="w-6 h-6 text-emerald-600" strokeWidth={2.25} />
                </div>
              </div>
              <DialogTitle className="text-slate-900 text-center text-[20px] font-semibold tracking-tight">
                Verify your email
              </DialogTitle>
              <DialogDescription className="text-slate-500 text-center text-[13px] mt-1.5 leading-relaxed">
                Enter the 6-digit code we sent to
                <br />
                <span className="text-slate-900 font-medium">{email}</span>
              </DialogDescription>
             </DialogHeader>

             {/* Spam folder notice */}
             <div className="mt-4 flex items-start gap-2 rounded-lg bg-amber-50 border border-amber-200 px-3 py-2.5">
               <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.25" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4 text-amber-600 mt-0.5 shrink-0"><path d="M12 9v4"/><path d="M12 17h.01"/><path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/></svg>
               <p className="text-[12px] leading-snug text-amber-900">
                 Can't find the email? Please check your <span className="font-semibold">Spam</span> or <span className="font-semibold">Promotions</span> folder and mark it as <span className="font-semibold">"Not spam"</span>.
               </p>
             </div>

            <div className="pt-7 space-y-5">
              {/* OTP Input — separated slots */}
              <div className="flex justify-center">
                <InputOTP
                  maxLength={6}
                  value={otpCode}
                  onChange={(value) => setOtpCode(value.replace(/\D/g, '').slice(0, 6))}
                  autoFocus
                  inputMode="numeric"
                  pattern="[0-9]*"
                >
                  <InputOTPGroup className="gap-2">
                    {[0,1,2,3,4,5].map((i) => (
                      <InputOTPSlot
                        key={i}
                        index={i}
                        className="h-12 w-10 sm:h-13 sm:w-11 text-lg font-semibold text-slate-900 bg-slate-50 border border-slate-200 rounded-lg first:rounded-l-lg last:rounded-r-lg data-[active=true]:ring-2 data-[active=true]:ring-emerald-500/30 data-[active=true]:border-emerald-500 data-[active=true]:bg-white transition-all"
                      />
                    ))}
                  </InputOTPGroup>
                </InputOTP>
              </div>

              {/* Verify Button */}
              <Button
                onClick={handleVerifyEmailOtp}
                disabled={otpLoading || otpCode.length !== 6}
                className="w-full h-12 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold rounded-xl text-[15px] shadow-sm transition-colors disabled:bg-slate-200 disabled:text-slate-400"
              >
                {otpLoading ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  "Verify"
                )}
              </Button>

              {/* Resend */}
              <div className="text-center">
                <button
                  onClick={handleResendEmailOtp}
                  disabled={otpLoading || resendCountdown > 0}
                  className="text-[13px] text-slate-500 hover:text-slate-900 transition-colors disabled:hover:text-slate-500"
                >
                  Didn't receive it?{" "}
                  <span className={resendCountdown > 0 ? "text-slate-400" : "text-emerald-600 font-medium"}>
                    {resendCountdown > 0 ? `Resend in ${resendCountdown}s` : "Resend code"}
                  </span>
                </button>
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>
      )}

      {/* Gender selection removed - will be shown on Home page after login */}

      {/* NEW Email Flow - Step 4: Name & Password - ULTRA PREMIUM */}
      {authStep === "email_password" && (
      <Dialog open={authStep === "email_password"} onOpenChange={() => resetAuthState()}>
        <DialogContent className="max-w-[90vw] sm:max-w-sm mx-auto p-0 border-0 rounded-3xl overflow-visible bg-transparent shadow-2xl shadow-violet-900/40">
          <div className="absolute inset-0 rounded-3xl bg-gradient-to-br from-violet-500/40 via-pink-500/30 to-purple-500/40 animate-[spin_8s_linear_infinite] blur-[1px]" style={{ padding: '1px' }} />
          <div className="relative rounded-3xl bg-gradient-to-br from-[#FFFBF2] via-[#FAF5F2] to-[#FFFBF2] backdrop-blur-xl p-6">
            <div className="absolute top-0 left-1/2 -translate-x-1/2 w-40 h-40 bg-violet-600/12 rounded-full blur-3xl pointer-events-none" />
            {/* Close button handled by DialogContent */}

            <DialogHeader className="relative z-10">
              <div className="flex justify-center mb-5">
                <div className="relative">
                  <div className="absolute inset-0 bg-gradient-to-br from-purple-500 to-pink-600 rounded-full blur-lg opacity-50 animate-pulse" />
                  <div className="relative w-20 h-20 rounded-full bg-gradient-to-br from-violet-500 via-purple-500 to-pink-500 flex items-center justify-center shadow-lg shadow-purple-500/30 ring-2 ring-white/10">
 <User className="w-9 h-9 text-slate-900 drop-shadow-lg" />
                  </div>
                </div>
              </div>
 <DialogTitle className="text-white text-center text-2xl font-bold tracking-tight bg-gradient-to-r from-pink-600 via-rose-500 to-pink-600 bg-clip-text text-transparent">Complete Your Profile</DialogTitle>
              <DialogDescription className="text-slate-600 text-center text-sm mt-1">Set your name and password</DialogDescription>
            </DialogHeader>
            
            <div className="py-5 space-y-4 relative z-10">
              <div className="relative group">
                <div className="absolute -inset-[1px] rounded-2xl bg-gradient-to-r from-purple-500/40 to-pink-500/40 opacity-60 group-focus-within:opacity-100 transition-opacity blur-[0.5px]" />
                <div className="relative flex items-center bg-white border border-amber-200/70 rounded-2xl overflow-hidden">
                  <div className="pl-4 pr-2"><User className="w-5 h-5 text-purple-400/70" /></div>
                  <Input value={displayName} onChange={(e) => setDisplayName(e.target.value)} placeholder="Your name" className="h-13 bg-transparent border-0 text-slate-800 placeholder:text-slate-400 rounded-2xl focus-visible:ring-0 focus-visible:ring-offset-0" autoFocus autoComplete="name" autoCapitalize="words" enterKeyHint="next" />
                </div>
              </div>

              <div className="relative group">
                <div className="absolute -inset-[1px] rounded-2xl bg-gradient-to-r from-purple-500/40 to-pink-500/40 opacity-60 group-focus-within:opacity-100 transition-opacity blur-[0.5px]" />
                <div className="relative flex items-center bg-white border border-amber-200/70 rounded-2xl overflow-hidden">
                  <div className="pl-4 pr-2"><Lock className="w-5 h-5 text-purple-400/70" /></div>
                  <Input type={showPassword ? "text" : "password"} value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Password (min 6 characters)" className="h-13 bg-transparent border-0 text-slate-800 placeholder:text-slate-400 rounded-2xl pr-10 focus-visible:ring-0 focus-visible:ring-offset-0" autoComplete="new-password" enterKeyHint="next" />
                  <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-600 transition-colors">
                    {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                  </button>
                </div>
              </div>

              <div className="relative group">
                <div className="absolute -inset-[1px] rounded-2xl bg-gradient-to-r from-purple-500/40 to-pink-500/40 opacity-60 group-focus-within:opacity-100 transition-opacity blur-[0.5px]" />
                <div className="relative flex items-center bg-white border border-amber-200/70 rounded-2xl overflow-hidden">
                  <div className="pl-4 pr-2"><Lock className="w-5 h-5 text-purple-400/70" /></div>
                  <Input type={showPassword ? "text" : "password"} value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} placeholder="Confirm password" className="h-13 bg-transparent border-0 text-slate-800 placeholder:text-slate-400 rounded-2xl focus-visible:ring-0 focus-visible:ring-offset-0" autoComplete="new-password" enterKeyHint="go" />
                </div>
              </div>
              
 <Button onClick={handleCreateEmailAccount} disabled={loading || !displayName.trim() || !password.trim() || !confirmPassword.trim()} className="w-full h-14 bg-gradient-to-r from-violet-600 via-purple-500 to-pink-500 hover:from-violet-500 hover:via-purple-400 hover:to-pink-400 text-slate-900 font-bold rounded-2xl text-base shadow-lg shadow-purple-600/25 transition-all duration-300 hover:shadow-xl hover:scale-[1.02] active:scale-[0.98] disabled:opacity-40 disabled:hover:scale-100">
                <span className="mr-2">🚀</span>
                Create Account
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
      )}

      {/* OTP Verification Dialog - ULTRA PREMIUM */}
      {authStep === "otp_verify" && (
      <Dialog open={authStep === "otp_verify"} onOpenChange={() => closeDialog()}>
        <DialogContent className="max-w-[90vw] sm:max-w-sm mx-auto p-0 border-0 rounded-3xl overflow-visible bg-transparent shadow-2xl shadow-pink-900/30">
          <div className="absolute inset-0 rounded-3xl bg-gradient-to-br from-pink-500/40 via-violet-500/30 to-pink-500/40 animate-[spin_8s_linear_infinite] blur-[1px]" style={{ padding: '1px' }} />
          <div className="relative rounded-3xl bg-gradient-to-br from-[#FFFBF2] via-[#FAF5F2] to-[#FFFBF2] backdrop-blur-xl p-6">
            <div className="absolute top-0 left-1/2 -translate-x-1/2 w-40 h-40 bg-pink-600/12 rounded-full blur-3xl pointer-events-none" />
            {/* Close button handled by DialogContent */}

            <DialogHeader className="relative z-10">
              <div className="flex justify-center mb-5">
                <div className="relative">
                  <div className="absolute inset-0 rounded-full blur-2xl opacity-60 animate-pulse bg-gradient-to-br from-pink-500/50 via-purple-500/40 to-orange-400/30" />
                  <div className="relative w-24 h-24 rounded-full overflow-hidden ring-2 ring-pink-500/40 shadow-2xl shadow-pink-500/30">
                    <img loading="lazy" decoding="async" src="/images/merilive-logo.png" alt="MeriLive" className="w-full h-full object-cover" />
                  </div>
                </div>
              </div>
 <DialogTitle className="text-white text-center text-2xl font-bold tracking-tight bg-gradient-to-r from-pink-600 via-rose-500 to-pink-600 bg-clip-text text-transparent">Verify Your Email</DialogTitle>
              <DialogDescription className="text-slate-600 text-center text-sm mt-1">Enter the 6-digit code sent to <span className="text-pink-400 font-medium">{email}</span></DialogDescription>
            </DialogHeader>

            {/* Spam folder notice */}
            <div className="relative z-10 mt-4 flex items-start gap-2 rounded-xl bg-amber-50 border border-amber-200 px-3 py-2.5">
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.25" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4 text-amber-600 mt-0.5 shrink-0"><path d="M12 9v4"/><path d="M12 17h.01"/><path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/></svg>
              <p className="text-[12px] leading-snug text-amber-900">
                Can't find the email? Please check your <span className="font-semibold">Spam</span> or <span className="font-semibold">Promotions</span> folder and mark it as <span className="font-semibold">"Not spam"</span>.
              </p>
            </div>
            
            <div className="py-5 space-y-6 relative z-10">
              <div className="flex justify-center">
                <div className="relative group">
                  <div className="absolute -inset-[1px] rounded-2xl bg-gradient-to-r from-pink-500/50 via-purple-500/50 to-pink-500/50 opacity-60 group-focus-within:opacity-100 transition-opacity blur-[0.5px]" />
                  <Input type="text" value={otpCode} onChange={(e) => { const value = e.target.value.replace(/\D/g, '').slice(0, 6); setOtpCode(value); }} placeholder="000000" maxLength={6} className="relative h-16 w-52 text-center text-3xl font-bold tracking-[0.5em] bg-white border border-amber-200/70 text-slate-800 placeholder:text-slate-300 rounded-2xl focus-visible:ring-0 focus-visible:ring-offset-0" autoFocus inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]*" enterKeyHint="done" />
                </div>
              </div>
              
 <Button onClick={handleVerifyOtp} disabled={otpLoading || otpCode.length !== 6} className="w-full h-14 bg-gradient-to-r from-emerald-600 via-green-500 to-emerald-600 hover:from-emerald-500 hover:via-green-400 hover:to-emerald-500 text-white font-bold rounded-2xl text-base shadow-lg shadow-emerald-600/25 transition-all duration-300 hover:shadow-xl hover:scale-[1.02] active:scale-[0.98] disabled:opacity-40 disabled:hover:scale-100">
                <Check className="w-5 h-5 mr-2.5" />
                Verify & Continue
              </Button>
              
              <div className="text-center space-y-2">
                <p className="text-slate-500 text-sm">Didn't receive the code?</p>
                <button onClick={handleResendOtp} disabled={otpLoading || resendCountdown > 0} className="text-pink-400 text-sm font-semibold hover:text-pink-300 transition-all disabled:opacity-40 hover:underline underline-offset-4">
                  {resendCountdown > 0 ? `Resend in ${resendCountdown}s` : "Resend Code"}
                </button>
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>
      )}

      {/* Login Dialog - ULTRA PREMIUM */}
      {authStep === "login" && (
      <Dialog open={authStep === "login"} onOpenChange={() => resetAuthState()}>
        <DialogContent className="max-w-[90vw] sm:max-w-sm mx-auto p-0 border-0 rounded-3xl overflow-visible bg-transparent shadow-2xl shadow-indigo-900/30">
          <div className="absolute inset-0 rounded-3xl bg-gradient-to-br from-indigo-500/40 via-purple-500/30 to-pink-500/40 animate-[spin_8s_linear_infinite] blur-[1px]" style={{ padding: '1px' }} />
          <div className="relative rounded-3xl bg-gradient-to-br from-[#FFFBF2] via-[#F5F5FA] to-[#FFFBF2] backdrop-blur-xl p-6">
            <div className="absolute top-0 left-1/2 -translate-x-1/2 w-40 h-40 bg-indigo-600/12 rounded-full blur-3xl pointer-events-none" />
            {/* Close button handled by DialogContent */}

            <DialogHeader className="relative z-10">
 <DialogTitle className="text-center text-2xl font-bold tracking-tight bg-gradient-to-r from-indigo-700 via-purple-600 to-indigo-700 bg-clip-text text-transparent">Welcome Back</DialogTitle>
              <DialogDescription className="text-slate-600 text-center text-sm mt-1">Login to your account</DialogDescription>
            </DialogHeader>
            
            <div className="py-5 space-y-4 relative z-10">
              <div className="relative group">
                <div className="absolute -inset-[1px] rounded-2xl bg-gradient-to-r from-indigo-500/40 to-purple-500/40 opacity-60 group-focus-within:opacity-100 transition-opacity blur-[0.5px]" />
                <div className="relative flex items-center bg-white border border-amber-200/70 rounded-2xl overflow-hidden">
                  <div className="pl-4 pr-2"><Mail className="w-5 h-5 text-indigo-400/70" /></div>
                  <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Email address" className="h-13 bg-transparent border-0 text-slate-900 font-semibold tracking-wide placeholder:text-slate-500 placeholder:font-normal placeholder:tracking-normal rounded-2xl focus-visible:ring-0 focus-visible:ring-offset-0" inputMode="email" autoComplete="email" autoCapitalize="off" autoCorrect="off" spellCheck={false} enterKeyHint="next" />
                </div>
              </div>
              
              <div className="relative group">
                <div className="absolute -inset-[1px] rounded-2xl bg-gradient-to-r from-indigo-500/40 to-purple-500/40 opacity-60 group-focus-within:opacity-100 transition-opacity blur-[0.5px]" />
                <div className="relative flex items-center bg-white border border-amber-200/70 rounded-2xl overflow-hidden">
                  <div className="pl-4 pr-2"><Lock className="w-5 h-5 text-indigo-400/70" /></div>
                  <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Password" className="h-13 bg-transparent border-0 text-slate-900 font-semibold tracking-wide placeholder:text-slate-500 placeholder:font-normal placeholder:tracking-normal rounded-2xl focus-visible:ring-0 focus-visible:ring-offset-0" autoComplete="current-password" enterKeyHint="go" onKeyDown={(e) => { if (e.key === 'Enter' && email.trim() && password.trim() && !loading) { e.preventDefault(); handleLoginAuth(); } }} />

                </div>
              </div>
              
 <Button onClick={handleLoginAuth} disabled={loading || !email.trim() || !password.trim()} className="w-full h-14 bg-gradient-to-r from-pink-600 via-rose-500 to-pink-600 hover:from-pink-500 hover:via-rose-400 hover:to-pink-500 text-white font-bold rounded-2xl text-base shadow-lg shadow-pink-600/25 transition-all duration-300 hover:shadow-xl hover:scale-[1.02] active:scale-[0.98] disabled:opacity-60 disabled:saturate-100 disabled:hover:scale-100 disabled:cursor-not-allowed">
                Login
              </Button>
              
              <div className="text-center pt-1">
                <button onClick={() => { setIsEmailFlow(true); setEmail(""); setAuthStep("email"); }} className="text-slate-500 text-sm hover:text-slate-700 transition-colors">
                  Don't have an account? <span className="text-pink-400 font-semibold hover:text-pink-300">Sign Up</span>
                </button>
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>
      )}

      {/* Phone Number Input Dialog */}
      {authStep === "phone_input" && (
      <Dialog open={authStep === "phone_input"} onOpenChange={() => resetAuthState()}>
        <DialogContent className="max-w-[90vw] sm:max-w-sm mx-auto p-0 border-0 rounded-3xl overflow-visible bg-transparent shadow-2xl shadow-green-900/40">
          <div className="absolute inset-0 rounded-3xl bg-gradient-to-br from-green-500/40 via-emerald-500/30 to-teal-500/40 animate-[spin_8s_linear_infinite] blur-[1px]" style={{ padding: '1px' }} />
          <div className="relative rounded-3xl bg-gradient-to-br from-[#FFFBF2] via-[#F5FBF6] to-[#FFFBF2] backdrop-blur-xl p-6">
            <div className="absolute top-0 left-1/2 -translate-x-1/2 w-40 h-40 bg-green-600/15 rounded-full blur-3xl pointer-events-none" />
            <div className="absolute bottom-0 right-0 w-32 h-32 bg-emerald-600/10 rounded-full blur-3xl pointer-events-none" />

            <DialogHeader className="relative z-10">
              <div className="flex justify-center mb-5">
                <div className="relative">
                  <div className="absolute inset-0 bg-gradient-to-br from-green-500 to-emerald-600 rounded-full blur-lg opacity-60 animate-pulse" />
                  <div className="relative w-20 h-20 rounded-full bg-gradient-to-br from-green-500 via-emerald-500 to-teal-500 flex items-center justify-center shadow-lg shadow-green-500/30 ring-2 ring-white/10">
 <Phone className="w-9 h-9 text-white drop-shadow-lg" />
                  </div>
                </div>
              </div>
 <DialogTitle className="text-center text-2xl font-bold tracking-tight bg-gradient-to-r from-emerald-700 via-green-600 to-emerald-700 bg-clip-text text-transparent">
                Enter Phone Number
              </DialogTitle>
              <DialogDescription className="text-slate-600 text-center text-sm mt-1">
                We'll send a verification code via WhatsApp
              </DialogDescription>
            </DialogHeader>

            <div className="py-5 space-y-5 relative z-10">
              {/* Country Code + Phone Number */}
              <div className="space-y-3">
                {/* Country Code Selector */}
                <div className="relative">
                  <button
                    type="button"
                    onClick={() => setShowCountryPicker(!showCountryPicker)}
 className="w-full h-14 flex items-center justify-between px-4 bg-white border border-amber-200/70 rounded-2xl border border-slate-200/10 hover:border-green-500/40 transition-colors"
                  >
                    <div className="flex items-center gap-3">
                      <span className="text-2xl">{selectedCountry.flag}</span>
                      <span className="text-slate-900 font-bold tracking-tight">{selectedCountry.code}</span>
                      <span className="text-slate-700 text-sm font-medium">{selectedCountry.name}</span>
                    </div>
                    <ChevronDown className={`w-5 h-5 text-slate-500 transition-transform ${showCountryPicker ? 'rotate-180' : ''}`} />
                  </button>

                  {/* Country Dropdown */}
                  {showCountryPicker && (
 <div className="absolute top-full left-0 right-0 mt-2 bg-white border border-slate-200 rounded-2xl shadow-2xl shadow-slate-900/15 z-50 max-h-64 overflow-hidden">
 <div className="p-2 border-b border-slate-200">
                        <div className="flex items-center bg-slate-50 border border-slate-200 rounded-xl px-3">
                          <Search className="w-4 h-4 text-slate-500" />
                          <input
                            type="text"
                            value={countrySearch}
                            onChange={(e) => setCountrySearch(e.target.value)}
                            placeholder="Search country..."
                            className="w-full h-10 bg-transparent border-0 text-slate-800 text-sm placeholder:text-slate-400 outline-none px-2"
                            autoFocus
                          />
                        </div>
                      </div>
                      <div className="overflow-y-auto max-h-48">
                        {filteredCountryCodes.map((country) => (
                          <button
                            key={country.code}
                            type="button"
                            onClick={() => {
                              setSelectedCountryCode(country.code);
                              setShowCountryPicker(false);
                              setCountrySearch("");
                            }}
                            className={`w-full flex items-center gap-3 px-4 py-3 hover:bg-emerald-50 transition-colors ${
                              selectedCountryCode === country.code ? 'bg-emerald-100' : ''
                            }`}
                          >
                            <span className="text-xl">{country.flag}</span>
                            <span className="text-slate-700 text-sm flex-1 text-left">{country.name}</span>
                            <span className="text-emerald-700 text-sm font-mono">{country.code}</span>
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                {/* Phone Number Input */}
                <div className="relative group">
                  <div className="absolute -inset-[1px] rounded-2xl bg-gradient-to-r from-green-500/50 via-emerald-500/50 to-green-500/50 opacity-60 group-focus-within:opacity-100 transition-opacity blur-[0.5px]" />
                  <div className="relative flex items-center bg-white border border-amber-200/70 rounded-2xl overflow-hidden">
                    <div className="pl-4 pr-3 flex items-center gap-1.5 border-r border-slate-200">
                      <span className="text-lg">{selectedCountry.flag}</span>
                      <span className="text-emerald-800 font-bold text-sm tracking-tight">{selectedCountryCode}</span>
                    </div>
                    <Input
                      type="tel"
                      value={phoneNumber}
                      onChange={(e) => {
                        const value = e.target.value.replace(/[^\d\s]/g, '');
                        setPhoneNumber(value);
                      }}
                      placeholder="1XXXXXXXXX"
                      className="h-14 bg-transparent border-0 text-slate-900 font-semibold tracking-wide placeholder:text-slate-500 placeholder:font-normal placeholder:tracking-normal rounded-2xl text-base focus-visible:ring-0 focus-visible:ring-offset-0"
                      autoFocus={!showCountryPicker}
                      inputMode="tel"
                      autoComplete="tel-national"
                      pattern="[0-9 ]*"
                      enterKeyHint="send"
                      onKeyDown={(e) => { if (e.key === 'Enter' && phoneNumber.trim() && !loading) { e.preventDefault(); handleSendPhoneOtp(); } }}
                    />

                  </div>
                </div>
              </div>

              {/* WhatsApp info badge */}
              <div className="flex items-center gap-2 px-3 py-2.5 rounded-xl bg-emerald-50 border border-emerald-200">
                <MessageCircle className="w-4 h-4 text-emerald-600 flex-shrink-0" />
                <p className="text-emerald-800 text-xs">
                  Verification code will be sent via <span className="font-bold text-emerald-900">WhatsApp</span>
                </p>
              </div>

              <Button
                onClick={handleSendPhoneOtp}
                disabled={loading || !phoneNumber.trim()}
 className="w-full h-14 bg-gradient-to-r from-green-600 via-emerald-500 to-green-600 hover:from-green-500 hover:via-emerald-400 hover:to-green-500 text-white font-bold rounded-2xl text-base shadow-lg shadow-green-600/25 transition-all duration-300 hover:shadow-xl hover:shadow-green-500/30 hover:scale-[1.02] active:scale-[0.98] disabled:opacity-40 disabled:hover:scale-100"
              >
                <MessageCircle className="w-5 h-5 mr-2.5" />
                Send WhatsApp Code
              </Button>

              <div className="text-center pt-1">
                <button
                  onClick={() => { setIsEmailFlow(true); setEmail(""); setAuthStep("email"); }}
                  className="text-slate-600 text-sm hover:text-slate-800 transition-colors"
                >
                  Use email instead? <span className="text-emerald-700 font-semibold hover:text-emerald-800">Email Sign Up</span>
                </button>
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>
      )}

      {/* Phone OTP Verification Dialog */}
      {authStep === "phone_otp" && (
      <Dialog open={authStep === "phone_otp"} onOpenChange={() => resetAuthState()}>
        <DialogContent className="max-w-[90vw] sm:max-w-sm mx-auto p-0 border-0 rounded-3xl overflow-visible bg-transparent shadow-2xl shadow-green-900/30">
          <div className="absolute inset-0 rounded-3xl bg-gradient-to-br from-green-500/40 via-teal-500/30 to-emerald-500/40 animate-[spin_8s_linear_infinite] blur-[1px]" style={{ padding: '1px' }} />
          <div className="relative rounded-3xl bg-gradient-to-br from-[#FFFBF2] via-[#F5FBF6] to-[#FFFBF2] backdrop-blur-xl p-6">
            <div className="absolute top-0 left-1/2 -translate-x-1/2 w-40 h-40 bg-green-600/12 rounded-full blur-3xl pointer-events-none" />

            <DialogHeader className="relative z-10">
              <div className="flex justify-center mb-5">
                <div className="relative">
                  <div className="absolute inset-0 bg-gradient-to-br from-green-500 to-teal-600 rounded-full blur-lg opacity-50 animate-pulse" />
                  <div className="relative w-20 h-20 rounded-full bg-gradient-to-br from-green-500 via-emerald-500 to-teal-500 flex items-center justify-center shadow-lg shadow-green-500/30 ring-2 ring-white/10">
 <Lock className="w-9 h-9 text-white drop-shadow-lg" />
                  </div>
                </div>
              </div>
 <DialogTitle className="text-center text-2xl font-bold tracking-tight bg-gradient-to-r from-emerald-700 via-teal-600 to-emerald-700 bg-clip-text text-transparent">
                WhatsApp Verification
              </DialogTitle>
              <DialogDescription className="text-slate-600 text-center text-sm mt-1">
                6-digit code sent to <span className="text-emerald-700 font-semibold">{selectedCountryCode} {phoneNumber}</span> via WhatsApp
              </DialogDescription>
            </DialogHeader>

            <div className="py-5 space-y-6 relative z-10">
              <div className="flex justify-center">
                <div className="relative group">
                  <div className="absolute -inset-[1px] rounded-2xl bg-gradient-to-r from-green-500/50 via-teal-500/50 to-green-500/50 opacity-60 group-focus-within:opacity-100 transition-opacity blur-[0.5px]" />
                  <Input
                    type="text"
                    value={phoneOtpCode}
                    onChange={(e) => {
                      const value = e.target.value.replace(/\D/g, '').slice(0, 6);
                      setPhoneOtpCode(value);
                    }}
                    placeholder="000000"
                    maxLength={6}
                    className="relative h-16 w-52 text-center text-3xl font-bold tracking-[0.5em] bg-white border border-amber-200/70 text-slate-800 placeholder:text-slate-300 rounded-2xl focus-visible:ring-0 focus-visible:ring-offset-0"
                    autoFocus
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    pattern="[0-9]*"
                    enterKeyHint="done"
                  />
                </div>
              </div>

              <Button
                onClick={handleVerifyPhoneOtp}
                disabled={phoneOtpLoading || phoneOtpCode.length !== 6}
 className="w-full h-14 bg-gradient-to-r from-green-600 via-emerald-500 to-green-600 hover:from-green-500 hover:via-emerald-400 hover:to-green-500 text-white font-bold rounded-2xl text-base shadow-lg shadow-green-600/25 transition-all duration-300 hover:shadow-xl hover:shadow-green-500/30 hover:scale-[1.02] active:scale-[0.98] disabled:opacity-40 disabled:hover:scale-100"
              >
                <Check className="w-5 h-5 mr-2.5" />
                Verify Code
              </Button>

              <div className="text-center space-y-2">
                <p className="text-slate-600 text-sm">Didn't receive the code?</p>
                <button
                  onClick={handleResendPhoneOtp}
                  disabled={phoneOtpLoading || resendCountdown > 0}
                  className="text-emerald-700 text-sm font-semibold hover:text-emerald-800 transition-all disabled:opacity-40 hover:underline underline-offset-4"
                >
                  {resendCountdown > 0 ? `Resend in ${resendCountdown}s` : "Resend WhatsApp Code"}
                </button>
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>
      )}

      {/* Phone Flow - Name & Password (after phone verification) */}
      {authStep === "phone_password" && (
      <Dialog open={authStep === "phone_password"} onOpenChange={() => resetAuthState()}>
        <DialogContent className="max-w-[90vw] sm:max-w-sm mx-auto p-0 border-0 rounded-3xl overflow-visible bg-transparent shadow-2xl shadow-green-900/40">
          <div className="absolute inset-0 rounded-3xl bg-gradient-to-br from-green-500/40 via-emerald-500/30 to-teal-500/40 animate-[spin_8s_linear_infinite] blur-[1px]" style={{ padding: '1px' }} />
          <div className="relative rounded-3xl bg-gradient-to-br from-[#FFFBF2] via-[#F5FBF6] to-[#FFFBF2] backdrop-blur-xl p-6">
            <div className="absolute top-0 left-1/2 -translate-x-1/2 w-40 h-40 bg-green-600/12 rounded-full blur-3xl pointer-events-none" />

            <DialogHeader className="relative z-10">
              <div className="flex justify-center mb-5">
                <div className="relative">
                  <div className="absolute inset-0 bg-gradient-to-br from-green-500 to-emerald-600 rounded-full blur-lg opacity-50 animate-pulse" />
                  <div className="relative w-20 h-20 rounded-full bg-gradient-to-br from-green-500 via-emerald-500 to-teal-500 flex items-center justify-center shadow-lg shadow-green-500/30 ring-2 ring-white/10">
 <User className="w-9 h-9 text-white drop-shadow-lg" />
                  </div>
                </div>
              </div>
 <DialogTitle className="text-center text-2xl font-bold tracking-tight bg-gradient-to-r from-emerald-700 via-green-600 to-emerald-700 bg-clip-text text-transparent">Complete Your Profile</DialogTitle>
              <DialogDescription className="text-slate-600 text-center text-sm mt-1">Set your name and password</DialogDescription>
            </DialogHeader>

            <div className="py-5 space-y-4 relative z-10">
              <div className="relative group">
                <div className="absolute -inset-[1px] rounded-2xl bg-gradient-to-r from-green-500/40 to-emerald-500/40 opacity-60 group-focus-within:opacity-100 transition-opacity blur-[0.5px]" />
                <div className="relative flex items-center bg-white border border-amber-200/70 rounded-2xl overflow-hidden">
                  <div className="pl-4 pr-2"><User className="w-5 h-5 text-green-400/70" /></div>
                  <Input value={displayName} onChange={(e) => setDisplayName(e.target.value)} placeholder="Your name" className="h-13 bg-transparent border-0 text-slate-800 placeholder:text-slate-400 rounded-2xl focus-visible:ring-0 focus-visible:ring-offset-0" autoFocus autoComplete="name" autoCapitalize="words" enterKeyHint="next" />
                </div>
              </div>

              <div className="relative group">
                <div className="absolute -inset-[1px] rounded-2xl bg-gradient-to-r from-green-500/40 to-emerald-500/40 opacity-60 group-focus-within:opacity-100 transition-opacity blur-[0.5px]" />
                <div className="relative flex items-center bg-white border border-amber-200/70 rounded-2xl overflow-hidden">
                  <div className="pl-4 pr-2"><Lock className="w-5 h-5 text-green-400/70" /></div>
                  <Input type={showPassword ? "text" : "password"} value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Password (min 6 characters)" className="h-13 bg-transparent border-0 text-slate-800 placeholder:text-slate-400 rounded-2xl pr-10 focus-visible:ring-0 focus-visible:ring-offset-0" autoComplete="new-password" enterKeyHint="next" />
                  <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-600 transition-colors">
                    {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                  </button>
                </div>
              </div>

              <div className="relative group">
                <div className="absolute -inset-[1px] rounded-2xl bg-gradient-to-r from-green-500/40 to-emerald-500/40 opacity-60 group-focus-within:opacity-100 transition-opacity blur-[0.5px]" />
                <div className="relative flex items-center bg-white border border-amber-200/70 rounded-2xl overflow-hidden">
                  <div className="pl-4 pr-2"><Lock className="w-5 h-5 text-green-400/70" /></div>
                  <Input type={showPassword ? "text" : "password"} value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} placeholder="Confirm password" className="h-13 bg-transparent border-0 text-slate-800 placeholder:text-slate-400 rounded-2xl focus-visible:ring-0 focus-visible:ring-offset-0" autoComplete="new-password" enterKeyHint="go" />
                </div>
              </div>

 <Button onClick={handleCreatePhoneAccount} disabled={loading || !displayName.trim() || !password.trim() || !confirmPassword.trim()} className="w-full h-14 bg-gradient-to-r from-green-600 via-emerald-500 to-teal-500 hover:from-green-500 hover:via-emerald-400 hover:to-teal-400 text-white font-bold rounded-2xl text-base shadow-lg shadow-green-600/25 transition-all duration-300 hover:shadow-xl hover:scale-[1.02] active:scale-[0.98] disabled:opacity-40 disabled:hover:scale-100">
                <span className="mr-2">🚀</span>
                Create Account
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
      )}
      </div>
    </div>
  );
};


export default Auth;
