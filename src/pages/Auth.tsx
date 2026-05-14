import { useState, useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Capacitor } from "@capacitor/core";
import { Mail, User, Heart, X, Building2, Check, Sparkles, Lock, Eye, EyeOff, Phone, MessageCircle, ChevronDown, Search, Gift, CheckCircle } from "lucide-react";
 import { Rocket3DIcon } from "@/components/ui/Rocket3DIcon";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useBrandingRealtime } from "@/hooks/useAdminSettingsRealtime";
import { getPersistentDeviceId, getDeviceIdSync } from "@/utils/persistentDeviceId";
import { getSessionFromNative } from "@/utils/nativeSessionStorage";
import { useBruteForceProtection } from "@/hooks/useBruteForceProtection";
import { detectCountryViaIP, getCountryFlag, countryNamesEnglish } from "@/hooks/useGeolocation";
import { COUNTRY_CODES } from "@/data/countryCodes";
import { triggerLegacyProfileSync } from "@/utils/legacyProfileSync";
import { recordClientError } from "@/utils/clientErrorLog";

type Gender = "male" | "female" | null;
type AuthStep = "gender" | "name" | "email" | "login" | "agency_code" | "otp_verify" | "email_otp" | "email_gender" | "email_password" | "phone_input" | "phone_otp" | "phone_password" | null;

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

interface AgencyInfo {
  id: string;
  name: string;
  level: string;
  total_hosts: number;
}

// Generate unique device ID - NOW USES PERSISTENT NATIVE ID
// This ID survives app uninstalls because it uses hardware-based UUID on native
const generateDeviceId = async (): Promise<string> => {
  return await getPersistentDeviceId();
};

// Recover account by device ID - returns credentials for automatic login
const recoverAccountByDevice = async (deviceId: string): Promise<{
  userId: string;
  displayName: string;
  avatarUrl: string | null;
  gender: string | null;
  isHost: boolean;
  recoveryEmail: string;
  recoveryPassword: string;
} | null> => {
  try {
    const { data, error } = await supabase.rpc('recover_session_by_device', { 
      p_device_id: deviceId
    });
    
    if (error || !data || data.length === 0) return null;
    
    const account = data[0];
    return {
      userId: account.user_id,
      displayName: account.display_name || 'User',
      avatarUrl: account.avatar_url,
      gender: account.gender,
      isHost: account.is_host || false,
      recoveryEmail: account.recovery_email,
      recoveryPassword: account.recovery_password,
    };
  } catch (error) {
    console.error('Error checking device account:', error);
    recordClientError({ label: "Auth.account", message: error instanceof Error ? error.message : String(error) });
    return null;
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

const AuthBackground = ({ branding }: { branding: AuthBranding }) => {
  // INSTANT BACKGROUND: branding is read from localStorage cache + preloaded
  // via useBrandingRealtime on module load, so the asset is already in the
  // browser cache. We render it immediately (no opacity gate, no fade-in).
  // The gradient sits behind as a 0-cost fallback in case the asset is missing.
  const [mediaFailed, setMediaFailed] = useState(false);
  const showMedia = Boolean(branding.background_url && !mediaFailed);

  useEffect(() => {
    setMediaFailed(false);
  }, [branding.background_url, branding.background_type]);

  const mediaStyle: React.CSSProperties = {
    imageRendering: 'high-quality' as React.CSSProperties['imageRendering'],
    transform: 'translateZ(0)',
    backfaceVisibility: 'hidden',
    WebkitBackfaceVisibility: 'hidden',
    filter: 'contrast(1.06) saturate(1.12) brightness(1.02)',
    willChange: 'transform',
  };

  // Build HD URL via Supabase image transform CDN (auto-upscales delivery, sharper on high DPR screens).
  // Falls back to original URL for non-Supabase hosts or GIFs (which the transform endpoint flattens).
  const buildHdUrl = (url: string, width: number, quality = 90): string => {
    if (!url) return url;
    try {
      // Skip transforms for animated GIFs to preserve animation
      if (branding.background_type === 'gif' || /\.gif(\?|$)/i.test(url)) return url;
      // Supabase Storage public URL → render/image/public for on-the-fly resize + AVIF/WebP
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

  // Device pixel ratio aware: phones at 3x DPR get true ~1080-1440 source for crisp rendering
  const dpr = typeof window !== 'undefined' ? Math.min(window.devicePixelRatio || 1, 3) : 2;
  const baseW = typeof window !== 'undefined' ? window.innerWidth : 480;
  const targetWidth = Math.min(2160, Math.ceil(baseW * dpr));

  const hdSrc = showMedia ? buildHdUrl(branding.background_url, targetWidth, 92) : '';
  const hdSrcSet = showMedia
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
          preload="auto"
          disablePictureInPicture
          onError={() => setMediaFailed(true)}
          ref={(el) => { if (el) el.playbackRate = 0.6; }}
          style={mediaStyle}
        />
      ) : showMedia && (branding.background_type === 'image' || branding.background_type === 'gif') ? (
        <img
          src={hdSrc}
          srcSet={hdSrcSet}
          sizes="100vw"
          alt="MeriLive background"
          className="absolute inset-0 w-full h-full object-cover"
          decoding="async"
          loading="eager"
          fetchPriority="high"
          onError={() => setMediaFailed(true)}
          style={mediaStyle}
        />
      ) : null}
    </>
  );
};

const Auth = () => {
  const navigate = useNavigate();
  
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
  const [agreed, setAgreed] = useState(false);
  const [authStep, setAuthStep] = useState<AuthStep>(null);
  const [selectedGender, setSelectedGender] = useState<Gender>(null);
  const [lastUser, setLastUser] = useState<LastUser | null>(null);
  const [deviceAccount, setDeviceAccount] = useState<DeviceAccount | null>(null);
  const [isEmailFlow, setIsEmailFlow] = useState(false);
  const [isAutoRecovering, setIsAutoRecovering] = useState(false);
  const [showReferralInput, setShowReferralInput] = useState(false);
  const [manualReferralCode, setManualReferralCode] = useState("");
  
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
  const [showPassword, setShowPassword] = useState(false);
  const [confirmPassword, setConfirmPassword] = useState("");
  
  // Phone auth state
  const [phoneNumber, setPhoneNumber] = useState("");
  const [phoneOtpCode, setPhoneOtpCode] = useState("");
  const [phoneOtpLoading, setPhoneOtpLoading] = useState(false);
  const [selectedCountryCode, setSelectedCountryCode] = useState("");
  const [showCountryPicker, setShowCountryPicker] = useState(false);
  const [countrySearch, setCountrySearch] = useState("");

  const getFunctionErrorMessage = async (error: any, fallback: string) => {
    try {
      const response = error?.context;
      if (response && typeof response.json === "function") {
        const payload = await response.json();
        if (payload?.code === "EMAIL_DELIVERY_FAILED") {
          return "Unable to send the verification code right now. Please try again in a moment.";
        }

        return payload?.error || payload?.detail || payload?.message || fallback;
      }
    } catch (parseError) {
      console.warn("[Auth] Failed to parse function error:", parseError);
    }

    return error?.message || fallback;
  };

  // Auto-detect user's country for default country code
  useEffect(() => {
    const detectUserCountry = async () => {
      try {
        const { data, error } = await supabase.functions.invoke('detect-country');
        if (!error && data?.countryCode) {
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

  // Agency referral state
  const [referralCode, setReferralCode] = useState<string | null>(null);
  const [agencyInfo, setAgencyInfo] = useState<AgencyInfo | null>(null);
  const [manualAgencyCode, setManualAgencyCode] = useState("");
  const [showAgencySuccess, setShowAgencySuccess] = useState(false);

  // Branding settings - REALTIME
  const { branding: realtimeBranding, loading: brandingLoading } = useBrandingRealtime();
  
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

  // Check for agency referral or sub-agent in URL
  useEffect(() => {
    const ref = searchParams.get("ref");
    const subagent = searchParams.get("subagent");
    
    if (ref) {
      setReferralCode(ref);
      // Fetch agency info
      fetchAgencyInfo(ref);
      // Store as potential user invitation ref (for male users)
      localStorage.setItem("meri_pending_invitation_ref", ref);
      // Also store as agency referral (for female/host users to auto-join)
      localStorage.setItem("meri_pending_referral", ref);
    }
    
    // Store sub-agent code for after signup
    if (subagent) {
      localStorage.setItem("meri_pending_subagent", subagent);
    }
  }, [searchParams]);

  const fetchAgencyInfo = async (code: string) => {
    try {
      const normalizedCode = code.trim().toUpperCase();
      const { data, error } = await supabase.rpc('get_agency_by_code', { agency_code: normalizedCode });
      if (data && data.length > 0) {
        setAgencyInfo(data[0] as AgencyInfo);
      }
    } catch (error) {
      console.error("Error fetching agency:", error);
      recordClientError({ label: "Auth.normalizedCode", message: error instanceof Error ? error.message : String(error) });
    }
  };

  // Track user invitation after signup
  const trackUserInvitation = async (newUserId: string) => {
    try {
      const inviterRef = localStorage.getItem("meri_pending_invitation_ref");
      if (!inviterRef) return;
      localStorage.removeItem("meri_pending_invitation_ref");

      // Look up inviter by app_uid
      const { data: inviter } = await supabase
        .from('profiles')
        .select('id')
        .eq('app_uid', inviterRef)
        .maybeSingle();

      if (!inviter || inviter.id === newUserId) return; // Don't self-invite

      // Check if already tracked
      const { data: existing } = await supabase
        .from('user_invitations')
        .select('id')
        .eq('inviter_id', inviter.id)
        .eq('invitee_id', newUserId)
        .maybeSingle();

      if (existing) return; // Already tracked

      // Insert invitation record
      await supabase
        .from('user_invitations')
        .insert({
          inviter_id: inviter.id,
          invitee_id: newUserId,
          invitation_code: inviterRef,
          status: 'verified',
        });

      console.log('[Invitation] Tracked: inviter', inviter.id, '-> new user', newUserId);
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
      setIsAutoRecovering(true);
      let recoveryTimeout: ReturnType<typeof setTimeout> | null = null;
      try {
        const timeoutPromise = new Promise<never>((_, reject) => {
          recoveryTimeout = setTimeout(() => reject(new Error('auth_session_check_timeout')), 4500);
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
        setIsAutoRecovering(false);
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

        // Join agency if referral code exists
        if (pending.referralCode && isHost) {
          await joinAgencyAfterSignup(user.id, pending.referralCode);
        }

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

  const handleStartClick = async () => {
    if (!agreed) {
      toast({
        title: "Accept Terms",
        description: "Please agree to User Agreement and Privacy Policy to continue.",
        variant: "destructive",
      });
      return;
    }

    setLoading(true);
    localStorage.removeItem('meri_manual_logout');
    
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
        console.log('[Auth] Existing device account found, auto-login');
        const guestEmail = existingForDevice.recoveryEmail;
        const guestPassword = existingForDevice.recoveryPassword;

        // Try conversion (anonymous → guest) if applicable, ignore failure
        try {
          await supabase.functions.invoke('convert-anonymous-to-guest', { body: { deviceId } });
        } catch (e) { /* ignore */ }

        const { error: signInError } = await supabase.auth.signInWithPassword({
          email: guestEmail,
          password: guestPassword,
        });

        if (!signInError) {
          await ensureProfileReady(
            existingForDevice.userId,
            {
              display_name: existingForDevice.displayName,
              device_id: deviceId,
              gender: existingForDevice.gender || undefined,
            },
            { requireHost: existingForDevice.gender === 'female' }
          );
          localStorage.setItem("meri_device_account", JSON.stringify({
            deviceId,
            email: guestEmail,
            password: guestPassword,
            displayName: existingForDevice.displayName,
            avatarUrl: existingForDevice.avatarUrl,
            gender: existingForDevice.gender as Gender,
          }));
          localStorage.setItem("meri_device_id", deviceId);
          toast({
            title: "🎉 Welcome Back!",
            description: `Logged in as ${existingForDevice.displayName}`,
          });
          navigateAfterAuth();
          return;
        }
        console.warn('[Auth] Device recovery sign-in failed, falling back to registration:', signInError.message);
      }

      // STEP 2: No existing account → proceed to registration form
      setIsEmailFlow(false);
      setAuthStep("gender");

    } catch (error) {
      console.error("Start click error:", error);
      recordClientError({ label: "Auth.handleStartClick", message: error instanceof Error ? error.message : String(error) });
      toast({
        title: "Error",
        description: "Something went wrong. Please try again.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
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

      if (error?.message === "Invalid login credentials") {
        const { data: syncResult, error: syncError } = await supabase.functions.invoke("admin-sync-auth", {
          body: { email: normalizedEmail, password },
        });

        if (syncError) {
          console.error("[Auth] legacy auth sync failed:", syncError);
          recordClientError({ label: "Auth.normalizedEmail", message: syncError instanceof Error ? syncError.message : String(syncError) });
        }

        if (syncResult?.success) {
          const retry = await supabase.auth.signInWithPassword({
            email: normalizedEmail,
            password,
          });
          error = retry.error;
        } else if (syncResult?.reason === "weak_password") {
          throw new Error(syncResult.error || "Password too weak. Please choose a stronger password.");
        }
      }

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
        const { data: serverResult, error: serverError } = await supabase.functions.invoke('detect-country');
        if (!serverError && serverResult?.countryCode) {
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
      if (!countryCode) {
        const ipResult = await detectCountryViaIP();
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

      const countryFlag = getCountryFlag(countryCode);
      const countryName = countryNamesEnglish[countryCode] || "Unknown";

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
    const cleanPatch = Object.fromEntries(
      Object.entries(patch).filter(([, value]) => value !== undefined)
    );
    const maxAttempts = options.maxAttempts ?? 8;

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
          // Note: requireHost is intentionally ignored — female accounts only become is_host=true
          // after manual face verification approval (see business/female-host-auto-conversion-v3).
          // Waiting for is_host to flip during signup will always time out and break name persistence.
          const hostReady = true;

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
        _joined_via: referralCode ? 'link' : 'invitation'
      });
      return data;
    } catch (error) {
      console.error("Error joining agency:", error);
      recordClientError({ label: "Auth.normalizedCode", message: error instanceof Error ? error.message : String(error) });
      return false;
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
        const guestEmail = existingForDevice.recoveryEmail;
        const guestPassword = existingForDevice.recoveryPassword;
        
        // Try conversion first (for anonymous accounts)
        try {
          await supabase.functions.invoke('convert-anonymous-to-guest', { body: { deviceId } });
        } catch (e) { /* ignore */ }
        
        const { error } = await supabase.auth.signInWithPassword({ email: guestEmail, password: guestPassword });
        if (!error) {
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
            email: guestEmail,
            password: guestPassword,
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
            is_guest: true,
            device_id: deviceId,
          },
        },
      });

      let userId: string | null = null;

      if (error) {
        // If signup fails (email already exists), try signing in instead
        console.log('[Auth] Signup failed, trying signin:', error.message);
        const { data: signInData, error: signInError } = await supabase.auth.signInWithPassword({
          email: guestEmail,
          password: guestPassword,
        });
        
        if (signInError) {
          console.error('[Auth] Both signup and signin failed:', signInError.message);
          recordClientError({ label: "Auth.guestPassword", message: String(signInError.message ?? "unknown") });
          // Fallback to email registration
          toast({
            title: "Information Required",
            description: "Please register with Email",
          });
          setIsEmailFlow(true);
          setAuthStep("email");
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

        // Instant country detection (non-blocking)
        detectAndSaveLocation(userId);

        // Track invitation if user came via referral link
        await trackUserInvitation(userId);

        // Join agency if referral code exists (for hosts)
        const pendingReferral = localStorage.getItem("meri_pending_referral");
        if (pendingReferral) {
          await joinAgencyAfterSignup(userId, pendingReferral);
          localStorage.removeItem("meri_pending_referral");
        }

        if (selectedGender === 'female') {
          toast({
            title: "🎉 Congratulations!",
            description: "Your account is ready!",
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
        description: "Registration failed. Please try with Email.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  // Handle manual agency code submission
  const handleJoinAgencyManually = async () => {
    if (!manualAgencyCode.trim()) {
      toast({
        title: "Error",
        description: "Please enter agency code",
        variant: "destructive",
      });
      return;
    }

    setLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        navigateAfterAuth();
        return;
      }

      const joined = await joinAgencyAfterSignup(user.id, manualAgencyCode.trim().toUpperCase());
      
      if (joined) {
        toast({
          title: "Success!",
          description: "Successfully joined the agency!",
        });
        navigateAfterAuth();
      } else {
        toast({
          title: "Error",
          description: "Invalid agency code or already in an agency",
          variant: "destructive",
        });
      }
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to join agency",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const skipAgencyJoin = () => {
    toast({
      title: "Join Later",
      description: "You can join an agency from your profile later",
    });
    navigateAfterAuth();
  };

  // NEW Email Flow - Step 1: Send OTP using Supabase Auth email OTP
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

    setEmail(normalizedEmail);
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("send-email-otp", {
        body: { email: normalizedEmail, purpose: "login" },
      });

      if (error) throw error;
      if (data && data.success === false) {
        throw new Error(data.error || "Failed to send verification code");
      }

      toast({
        title: "📧 Verification Code Sent",
        description: `Check your email at ${normalizedEmail} for the 6-digit verification code.`,
      });

      setAuthStep("email_otp");
    } catch (error: any) {
      console.error("Email OTP error:", error);
      recordClientError({ label: "Auth.emailRegex", message: error instanceof Error ? error.message : String(error) });
      const errorMessage = await getFunctionErrorMessage(error, "Failed to send verification code");
      toast({
        title: "Error",
        description: errorMessage,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
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
      if (!verifyData?.success) {
        throw new Error(verifyData?.error || "Invalid verification code");
      }

      const { data: signInData, error: signInError } = await supabase.functions.invoke(
        "otp-direct-signin",
        { body: { email: normalizedEmail, otp_verified: true } }
      );

      if (signInError) {
        throw new Error(await getFunctionErrorMessage(signInError, "Failed to complete sign-in"));
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

      const readyProfile = await ensureProfileReady(
        verifiedUser.id,
        {
          email: normalizedEmail,
          display_name: fallbackDisplayName,
          is_verified: true,
        },
        { requireHost: false }
      );

      localStorage.setItem("meri_last_user", JSON.stringify({
        email: normalizedEmail,
        displayName: readyProfile?.display_name || fallbackDisplayName,
        avatarUrl: null,
      }));

      localStorage.removeItem("meri_manual_logout");
      toast({
        title: "✅ Welcome!",
        description: "Email verified and login completed successfully.",
      });
      resetAuthState();
      navigateAfterAuth();
    } catch (error: any) {
      console.error("Email OTP verify error:", error);
      recordClientError({ label: "Auth.readyProfile", message: error instanceof Error ? error.message : String(error) });
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

      // Create account
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: {
            full_name: displayName,
            gender: selectedGender,
            email_confirmed: true,
            device_id: deviceId,
          },
        },
      });

      if (error) {
        // If user already exists, try to login
        if (error.message?.includes("already registered")) {
          toast({
            title: "Account Exists",
            description: "This email is already registered. Please login.",
            variant: "destructive",
          });
          setAuthStep("login");
          setIsEmailFlow(false);
          return;
        }
        throw error;
      }

      if (data.user) {
        const readyProfile = await ensureProfileReady(
          data.user.id,
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

        if (selectedGender) {
          localStorage.setItem(`gender_selected_${data.user.id}`, 'true');
        }

        // Instant country detection (non-blocking)
        detectAndSaveLocation(data.user.id);

        // Note: Agency join will happen after gender selection on home page

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

  // Phone Flow - Step 1: Send WhatsApp OTP
  const handleSendPhoneOtp = async () => {
    const cleanPhone = phoneNumber.replace(/[\s\-\(\)]/g, "");
    if (!cleanPhone || cleanPhone.length < 6) {
      toast({
        title: "Error",
        description: "Please enter a valid phone number",
        variant: "destructive",
      });
      return;
    }

    const fullPhone = selectedCountryCode + cleanPhone;

    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('send-whatsapp-otp', {
        body: { phone_number: fullPhone, action: "send" }
      });

      if (error) throw error;
      if (!data?.success) {
        toast({
          title: "Error",
          description: data?.error || "Failed to send OTP",
          variant: "destructive",
        });
        return;
      }

      toast({
        title: "📱 WhatsApp OTP Sent!",
        description: `Verification code sent to ${fullPhone} via WhatsApp`,
      });
      setAuthStep("phone_otp");
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to send WhatsApp OTP",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
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
      const cleanPhone = phoneNumber.replace(/[\s\-\(\)]/g, "");
      const fullPhone = selectedCountryCode + cleanPhone;
      const { data, error } = await supabase.functions.invoke('send-whatsapp-otp', {
        body: { phone_number: fullPhone, action: "verify", otp: phoneOtpCode }
      });

      if (error) throw error;
      if (!data?.verified) {
        toast({
          title: "Invalid Code",
          description: data?.error || "The verification code is incorrect",
          variant: "destructive",
        });
        return;
      }

      // OTP verified — check if account already exists
      const phoneEmail = `phone_${fullPhone}@meri.local`;
      
      // Check if account already exists for this phone number
      let existingProfile: any = null;
      try {
        const { data } = await (supabase as any)
          .from("profiles")
          .select("id, display_name")
          .eq("phone_number", fullPhone)
          .maybeSingle();
        existingProfile = data;
      } catch {}

      if (existingProfile) {
        // Existing account found — auto-login via edge function
        const { data: signInResult, error: signInError } = await supabase.functions.invoke('otp-direct-signin', {
          body: { email: phoneEmail }
        });

        if (!signInError && signInResult?.session) {
          await supabase.auth.setSession({
            access_token: signInResult.session.access_token,
            refresh_token: signInResult.session.refresh_token,
          });

          localStorage.removeItem('meri_manual_logout');
          toast({
            title: "✅ Welcome Back!",
            description: `Logged in as ${existingProfile.display_name || fullPhone}`,
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
    const cleanPhone = phoneNumber.replace(/[\s\-\(\)]/g, "");
    const fullPhone = selectedCountryCode + cleanPhone;
    const phoneEmail = `phone_${fullPhone}@meri.local`;

    try {
      const { data, error } = await supabase.auth.signUp({
        email: phoneEmail,
        password,
        options: {
          data: {
            full_name: displayName,
            phone_number: cleanPhone,
            device_id: deviceId,
            phone_verified: true,
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
            phone_number: fullPhone,
            phone_verified: true,
            device_id: deviceId,
            is_verified: true,
            gender: selectedGender || undefined,
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

  // Resend WhatsApp OTP
  const handleResendPhoneOtp = async () => {
    setPhoneOtpLoading(true);
    try {
      const cleanPhone = phoneNumber.replace(/[\s\-\(\)]/g, "");
      const fullPhone = selectedCountryCode + cleanPhone;
      const { data, error } = await supabase.functions.invoke('send-whatsapp-otp', {
        body: { phone_number: fullPhone, action: "send" }
      });
      if (error) throw error;
      toast({ title: "Code Resent", description: `New code sent to ${fullPhone} via WhatsApp` });
    } catch {
      toast({ title: "Error", description: "Failed to resend. Please wait 60 seconds.", variant: "destructive" });
    } finally {
      setPhoneOtpLoading(false);
    }
  };

  // Resend OTP for new email flow using custom edge function
  const handleResendEmailOtp = async () => {
    setOtpLoading(true);
    try {
      const normalizedEmail = email.trim().toLowerCase();
      const { data, error } = await supabase.functions.invoke("send-email-otp", {
        body: { email: normalizedEmail, purpose: "login" },
      });

      if (error) throw error;
      if (data && data.success === false) {
        throw new Error(data.error || "Failed to resend code");
      }

      toast({
        title: "Code Resent",
        description: `A new verification code has been sent to ${normalizedEmail}`,
      });
    } catch (error: any) {
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
              gender: selectedGender,
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

          // Join agency if referral code exists
          if (referralCode && isHost) {
            await joinAgencyAfterSignup(data.user.id, referralCode);
          }

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

  // Show loading screen during auto-recovery
  if (isAutoRecovering) {
    return (
        <div className="fixed inset-0 overflow-hidden">
        <AuthBackground branding={branding} />
        <div className="absolute inset-0 bg-gradient-to-b from-black/20 via-transparent to-black/50" />
        <div className="relative z-10 min-h-screen flex flex-col items-center justify-center gap-4">
          <div className="w-10 h-10 border-3 border-white/30 border-t-white rounded-full animate-spin" />
          <p className="text-white/80 text-sm font-medium animate-pulse">Recovering your account...</p>
        </div>
      </div>
    );
  }

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
      <div className="absolute inset-0 bg-gradient-to-b from-black/20 via-transparent to-black/50" />

      {/* Content */}
      <div className="relative z-10 h-full min-h-0 overflow-y-auto overflow-x-hidden" style={{ WebkitOverflowScrolling: 'touch' }}>
        <div className="min-h-full flex flex-col justify-between p-6 safe-area-top safe-area-bottom">
        {/* Logo */}
        <div className="pt-8 flex flex-col items-center">
          {branding.logo_image_url ? (
            <img 
              src={branding.logo_image_url} 
              alt="Logo" 
              className="w-40 h-40 object-contain"
              onError={(e) => {
                (e.target as HTMLImageElement).onerror = null;
                (e.target as HTMLImageElement).src = '/logo.png';
              }}
            />
          ) : (
            <>
              <div className="relative">
               {/* Premium MERI text with metallic shine effect */}
               <h1 
                 className="text-7xl font-black text-transparent bg-clip-text bg-gradient-to-b from-white via-pink-200 to-pink-400 text-center tracking-wide"
                 style={{ 
                   fontFamily: "'Pacifico', cursive",
                   WebkitTextStroke: '0.5px rgba(255, 255, 255, 0.2)',
                 }}
               >
                   {branding.logo_text_primary}
                 </h1>
                </div>
             
             {/* LIVE badge with elegant underline */}
             <div className="flex items-center gap-3 mt-1">
               <div className="h-px w-10 bg-gradient-to-r from-transparent via-white/60 to-transparent" />
               <h2 
                 className="text-3xl font-bold text-white uppercase"
                 style={{ 
                   fontFamily: "'Montserrat', sans-serif",
                   letterSpacing: '0.5em',
                 }}
               >
                  {branding.logo_text_secondary}
                </h2>
               <div className="h-px w-10 bg-gradient-to-r from-transparent via-white/60 to-transparent" />
              </div>
            </>
          )}
        </div>

          {/* Agency Referral Banner */}
          {agencyInfo && (
            <div className="mb-4 p-4 bg-gradient-to-r from-purple-500/90 to-pink-500/90 backdrop-blur-sm rounded-2xl shadow-lg">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-full bg-white/20 flex items-center justify-center">
                  <Building2 className="w-6 h-6 text-white" />
                </div>
                <div className="flex-1">
                  <p className="text-white/80 text-xs">You are invited by</p>
                  <p className="text-white font-bold">{agencyInfo.name}</p>
                  <div className="flex items-center gap-2 mt-1">
                    <Badge className="bg-white/20 text-white text-[10px]">{agencyInfo.level}</Badge>
                    <span className="text-white/70 text-xs">{agencyInfo.total_hosts} hosts</span>
                  </div>
                </div>
                <Sparkles className="w-5 h-5 text-yellow-300 animate-pulse" />
              </div>
            </div>
          )}

        {/* Auth Buttons */}
        <div className="space-y-3 pb-6">
          {/* Latest Login - Only show if user previously logged in */}
          {lastUser && (
            <div className="relative">
              <button
                onClick={handleLastUserLogin}
                className="w-full flex items-center gap-3 p-3 bg-white/90 backdrop-blur-sm rounded-2xl shadow-lg hover:bg-white transition-all"
              >
                <Avatar className="w-12 h-12 border-2 border-amber-400">
                  <AvatarImage src={lastUser.avatarUrl || undefined} />
                  <AvatarFallback className="bg-gradient-to-br from-amber-400 to-orange-500 text-white">
                    {lastUser.displayName?.charAt(0) || "U"}
                  </AvatarFallback>
                </Avatar>
                <div className="flex-1 text-left">
                  <p className="font-semibold text-foreground">{lastUser.displayName || "User"}</p>
                  <p className="text-xs text-muted-foreground">{lastUser.email}</p>
                </div>
                <Badge className="bg-amber-500 text-white border-0 px-2 py-0.5 text-xs">
                  Latest Login
                </Badge>
              </button>
              <button
                onClick={clearLastUser}
                className="absolute -top-2 -right-2 w-6 h-6 bg-red-500 text-white rounded-full flex items-center justify-center shadow-md hover:bg-red-600 transition-colors"
              >
                <X className="w-3 h-3" />
              </button>
            </div>
          )}

          {/* Start Button - Premium Mobile Design */}
          <Button
            onClick={handleStartClick}
            className="w-full h-11 rounded-2xl bg-gradient-to-r from-purple-600 via-fuchsia-500 to-pink-500 hover:from-purple-700 hover:via-fuchsia-600 hover:to-pink-600 text-white text-sm font-bold shadow-[0_6px_24px_-6px_rgba(168,85,247,0.5)] border border-purple-400/30 transition-all duration-300 active:scale-[0.98] backdrop-blur-md"
            disabled={loading}
          >
            {loading ? (
              <div className="w-5 h-5 border-2 border-white/40 border-t-white rounded-full animate-spin" />
            ) : (
              <span className="flex items-center gap-2">
                <Rocket3DIcon className="w-5 h-5" />
                <span className="drop-shadow-lg tracking-wide">Start</span>
              </span>
            )}
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
              setPhoneNumber("");
              setPhoneOtpCode("");
              setAuthStep("phone_input");
            }}
            className="w-full h-11 rounded-2xl bg-gradient-to-r from-green-500 via-emerald-500 to-green-600 hover:from-green-600 hover:via-emerald-600 hover:to-green-700 text-white text-sm font-semibold shadow-[0_6px_24px_-6px_rgba(16,185,129,0.4)] border border-green-400/30 transition-all duration-300 active:scale-[0.98] backdrop-blur-md"
          >
            <Phone className="w-5 h-5 mr-2" />
            <span>Phone Number</span>
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
              // Start new email flow - first step is email input
              setIsEmailFlow(true);
              setEmail("");
              setAuthStep("email");
            }}
            className="w-full h-11 rounded-2xl bg-gradient-to-r from-white via-gray-50 to-white hover:from-gray-50 hover:via-white hover:to-gray-50 text-gray-700 text-sm font-semibold shadow-[0_6px_24px_-6px_rgba(255,255,255,0.3)] border border-white/60 transition-all duration-300 active:scale-[0.98] backdrop-blur-md"
          >
            <Mail className="w-5 h-5 mr-2 text-gray-600" />
            <span>Email</span>
          </Button>


          {/* Referral Code Entry */}
          {!referralCode && (
            <div className="mt-1">
              {!showReferralInput ? (
                <button
                  onClick={() => setShowReferralInput(true)}
                  className="w-full text-center text-white/50 hover:text-white/80 text-[11px] py-1.5 transition-colors"
                >
                  🎁 Have a referral code? Tap here
                </button>
              ) : (
                <div className="flex gap-2 items-center">
                  <div className="relative flex-1">
                    <Gift className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-amber-400/70" />
                    <Input
                      value={manualReferralCode}
                      onChange={(e) => setManualReferralCode(e.target.value.toUpperCase())}
                      placeholder="Enter referral code"
                      className="pl-9 h-10 bg-white/10 border-amber-400/30 text-white placeholder:text-white/30 rounded-xl text-sm font-mono tracking-wider"
                    />
                  </div>
                  <Button
                    onClick={() => {
                      if (manualReferralCode.trim()) {
                        const code = manualReferralCode.trim().toUpperCase();
                        localStorage.setItem("meri_pending_invitation_ref", code);
                        // If it looks like an agency code, also save as pending referral
                        // so female users auto-join the agency after signup
                        if (code.startsWith("AG") || code.length >= 6) {
                          localStorage.setItem("meri_pending_referral", code);
                        }
                        setReferralCode(code);
                        fetchAgencyInfo(code);
                        toast({ title: "✅ Code saved!", description: "Female → joins agency as host. Male → invitation reward." });
                        setShowReferralInput(false);
                      }
                    }}
                    size="sm"
                    className="h-10 px-4 bg-amber-500 hover:bg-amber-600 text-white rounded-xl"
                  >
                    Apply
                  </Button>
                </div>
              )}
            </div>
          )}

          {/* Referral code applied indicator */}
          {referralCode && !agencyInfo && (
            <div className="flex items-center justify-center gap-2 py-1.5 px-3 bg-green-500/15 border border-green-400/30 rounded-xl">
              <CheckCircle className="w-3.5 h-3.5 text-green-400" />
              <span className="text-green-300 text-[11px] font-medium">Referral: {referralCode}</span>
            </div>
          )}

          {/* Compact Luxurious Agreement */}
          <button
            onClick={() => setAgreed(!agreed)}
            className={`
              w-full mt-1 py-2 px-3 rounded-xl flex items-center justify-center gap-2
              transition-all duration-300 backdrop-blur-md
              ${agreed 
                ? 'bg-gradient-to-r from-emerald-500/20 to-teal-500/20 border border-emerald-400/40 shadow-[0_0_20px_-5px_rgba(16,185,129,0.3)]' 
                : 'bg-white/5 border border-white/10 hover:border-white/20'
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
                <Check className="w-3 h-3 text-white" />
              )}
            </div>
            <span className={`text-[10px] leading-tight transition-colors ${agreed ? 'text-white/90' : 'text-white/50'}`}>
              <span className="underline decoration-white/30">Terms</span>
              {" & "}
              <span className="underline decoration-white/30">Privacy</span>
              {" • 18+"}
            </span>
          </button>
        </div>
      </div>

      {/* Gender + Name Combined Dialog (Start flow & Email flow) */}
      <Dialog open={authStep === "gender"} onOpenChange={() => closeDialog()}>
        <DialogContent className="max-w-sm mx-auto bg-gradient-to-b from-[#FFFBF2] via-[#FAF5EA] to-[#F5EFDF] border-amber-200/70 p-6">
          <DialogHeader>
            <div className="flex justify-center mb-3">
              <div className="w-16 h-16 rounded-full bg-gradient-to-br from-pink-100 to-rose-100 border border-pink-200/70 flex items-center justify-center shadow-md shadow-pink-500/20">
                <Sparkles className="w-8 h-8 text-pink-500" />
              </div>
            </div>
            <DialogTitle className="text-slate-800 text-center text-2xl font-bold">Welcome! 🎉</DialogTitle>
            <DialogDescription className="text-slate-600 text-center text-sm">
              Enter your name & select gender
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-5 pt-2">
            {/* Name Input */}
            <div>
              <label className="text-slate-700 text-xs font-semibold mb-1.5 block">Your Name</label>
              <div className="relative">
                <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <Input
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  placeholder="Enter your name"
                  className="pl-10 h-11 bg-white border-amber-200/70 text-slate-800 placeholder:text-slate-400 rounded-xl focus:border-pink-400 focus:ring-1 focus:ring-pink-400"
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
                    : "border-amber-200/60 bg-white hover:border-amber-300"
                }`}
              >
                <div className="flex flex-col items-center gap-2">
                  <div className={`w-14 h-14 rounded-full bg-gradient-to-br from-blue-100 to-cyan-100 flex items-center justify-center text-3xl ${
                    selectedGender === "male" ? "ring-2 ring-blue-500" : ""
                  }`}>
                    👨
                  </div>
                  <span className={`font-semibold text-sm ${
                    selectedGender === "male" ? "text-blue-600" : "text-slate-700"
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
                    : "border-amber-200/60 bg-white hover:border-amber-300"
                }`}
              >
                <div className="flex flex-col items-center gap-2">
                  <div className={`w-14 h-14 rounded-full bg-gradient-to-br from-pink-100 to-rose-100 flex items-center justify-center text-3xl ${
                    selectedGender === "female" ? "ring-2 ring-pink-500" : ""
                  }`}>
                    👩
                  </div>
                  <span className={`font-semibold text-sm ${
                    selectedGender === "female" ? "text-pink-600" : "text-slate-700"
                  }`}>Female</span>
                  <div className="flex items-center gap-1">
                    <span className="text-[10px] text-amber-600 font-semibold">👑 Host Account</span>
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
              <div className="p-3 rounded-xl bg-gradient-to-r from-pink-50 to-rose-50 border border-pink-200/70">
                <p className="text-pink-700 text-xs text-center font-medium">
                  👑 Selecting Female will automatically convert your account to a Host account!
                </p>
              </div>
            )}

            {/* Get Started / Continue Button */}
            <Button
              onClick={() => {
                if (isEmailFlow) {
                  // Email flow: go to email input
                  handleGenderSelect(selectedGender);
                } else {
                  // Start flow: directly register device
                  handleDeviceRegistration();
                }
              }}
              disabled={loading || !displayName.trim() || !selectedGender}
              className="w-full h-12 rounded-full bg-gradient-to-r from-pink-500 to-rose-500 hover:from-pink-600 hover:to-rose-600 text-white font-bold text-base disabled:opacity-50 shadow-lg shadow-pink-500/30"
            >
              {loading ? (
                <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
              ) : (
                <>
                  <Sparkles className="w-5 h-5 mr-2" />
                  {isEmailFlow ? "Continue" : "Get Started"}
                </>
              )}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Name Entry Dialog kept for backward compat but redirects to gender */}
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

      {/* NEW Email Flow - Step 1: Email Input - ULTRA PREMIUM */}
      <Dialog open={authStep === "email"} onOpenChange={() => resetAuthState()}>
        <DialogContent className="max-w-[90vw] sm:max-w-sm mx-auto p-0 border-0 rounded-3xl overflow-visible bg-transparent shadow-2xl shadow-purple-900/40">
          {/* Animated gradient border */}
          <div className="absolute inset-0 rounded-3xl bg-gradient-to-br from-pink-500/40 via-purple-500/30 to-cyan-500/40 animate-[spin_8s_linear_infinite] blur-[1px]" style={{ padding: '1px' }} />
          <div className="relative rounded-3xl bg-gradient-to-br from-[#0d0d1a] via-[#1a1035] to-[#0d0d1a] backdrop-blur-xl p-6">
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
              <DialogTitle className="text-white text-center text-2xl font-bold tracking-tight bg-gradient-to-r from-white via-purple-100 to-white bg-clip-text text-transparent">
                Enter Your Email
              </DialogTitle>
              <DialogDescription className="text-white/50 text-center text-sm mt-1">
                We'll send a verification code to your email
              </DialogDescription>
            </DialogHeader>
            
            <div className="py-5 space-y-5 relative z-10">
              <div className="relative group">
                <div className="absolute -inset-[1px] rounded-2xl bg-gradient-to-r from-pink-500/50 via-purple-500/50 to-pink-500/50 opacity-60 group-focus-within:opacity-100 transition-opacity blur-[0.5px]" />
                <div className="relative flex items-center bg-white/[0.06] rounded-2xl overflow-hidden">
                  <div className="pl-4 pr-2">
                    <span className="text-purple-400/70 text-lg font-light select-none">@</span>
                  </div>
                  <Input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="your@email.com"
                    className="h-14 bg-transparent border-0 text-white placeholder:text-white/30 rounded-2xl text-base focus-visible:ring-0 focus-visible:ring-offset-0"
                    autoFocus
                  />
                </div>
              </div>
              
              <Button
                onClick={handleSendEmailOtp}
                disabled={loading || !email.trim()}
                className="w-full h-14 bg-gradient-to-r from-pink-600 via-rose-500 to-pink-600 hover:from-pink-500 hover:via-rose-400 hover:to-pink-500 text-white font-bold rounded-2xl text-base shadow-lg shadow-pink-600/25 transition-all duration-300 hover:shadow-xl hover:shadow-pink-500/30 hover:scale-[1.02] active:scale-[0.98] disabled:opacity-40 disabled:hover:scale-100"
              >
                {loading ? (
                  <div className="w-6 h-6 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                ) : (
                  <>
                    <Mail className="w-5 h-5 mr-2.5" />
                    Send Verification Code
                  </>
                )}
              </Button>

              <div className="text-center pt-1">
                <button
                  onClick={() => {
                    setIsEmailFlow(false);
                    setAuthStep("login");
                  }}
                  className="text-white/40 text-sm hover:text-white/70 transition-colors"
                >
                  Already have an account? <span className="text-pink-400 font-semibold hover:text-pink-300">Login</span>
                </button>
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* NEW Email Flow - Step 2: OTP Verification - ULTRA PREMIUM */}
      <Dialog open={authStep === "email_otp"} onOpenChange={() => resetAuthState()}>
        <DialogContent className="max-w-[90vw] sm:max-w-sm mx-auto p-0 border-0 rounded-3xl overflow-visible bg-transparent shadow-2xl shadow-emerald-900/30">
          {/* Animated gradient border */}
          <div className="absolute inset-0 rounded-3xl bg-gradient-to-br from-emerald-500/40 via-cyan-500/30 to-green-500/40 animate-[spin_8s_linear_infinite] blur-[1px]" style={{ padding: '1px' }} />
          <div className="relative rounded-3xl bg-gradient-to-br from-[#0d0d1a] via-[#0a1a15] to-[#0d0d1a] backdrop-blur-xl p-6">
            {/* Decorative orbs */}
            <div className="absolute top-0 left-1/2 -translate-x-1/2 w-40 h-40 bg-emerald-600/12 rounded-full blur-3xl pointer-events-none" />
            <div className="absolute bottom-0 right-0 w-32 h-32 bg-cyan-600/8 rounded-full blur-3xl pointer-events-none" />
            
            {/* Close button handled by DialogContent */}

            <DialogHeader className="relative z-10">
              <div className="flex justify-center mb-5">
                <div className="relative">
                  <div className="absolute inset-0 bg-gradient-to-br from-emerald-500 to-cyan-600 rounded-full blur-lg opacity-50 animate-pulse" />
                  <div className="relative w-20 h-20 rounded-full bg-gradient-to-br from-emerald-500 via-green-500 to-cyan-500 flex items-center justify-center shadow-lg shadow-emerald-500/30 ring-2 ring-white/10">
                    <Lock className="w-9 h-9 text-white drop-shadow-lg" />
                  </div>
                </div>
              </div>
              <DialogTitle className="text-white text-center text-2xl font-bold tracking-tight bg-gradient-to-r from-white via-emerald-100 to-white bg-clip-text text-transparent">
                Enter Verification Code
              </DialogTitle>
              <DialogDescription className="text-white/50 text-center text-sm mt-1">
                6-digit code sent to <span className="text-emerald-400 font-medium">{email}</span>
              </DialogDescription>
            </DialogHeader>
            
            <div className="py-5 space-y-6 relative z-10">
              {/* OTP Input - Premium styled */}
              <div className="flex justify-center">
                <div className="relative group">
                  <div className="absolute -inset-[1px] rounded-2xl bg-gradient-to-r from-emerald-500/50 via-cyan-500/50 to-emerald-500/50 opacity-60 group-focus-within:opacity-100 transition-opacity blur-[0.5px]" />
                  <Input
                    type="text"
                    value={otpCode}
                    onChange={(e) => {
                      const value = e.target.value.replace(/\D/g, '').slice(0, 6);
                      setOtpCode(value);
                    }}
                    placeholder="000000"
                    maxLength={6}
                    className="relative h-16 w-52 text-center text-3xl font-bold tracking-[0.5em] bg-white/[0.06] border-0 text-white placeholder:text-white/20 rounded-2xl focus-visible:ring-0 focus-visible:ring-offset-0"
                    autoFocus
                  />
                </div>
              </div>
              
              {/* Verify Button */}
              <Button
                onClick={handleVerifyEmailOtp}
                disabled={otpLoading || otpCode.length !== 6}
                className="w-full h-14 bg-gradient-to-r from-emerald-600 via-green-500 to-emerald-600 hover:from-emerald-500 hover:via-green-400 hover:to-emerald-500 text-white font-bold rounded-2xl text-base shadow-lg shadow-emerald-600/25 transition-all duration-300 hover:shadow-xl hover:shadow-emerald-500/30 hover:scale-[1.02] active:scale-[0.98] disabled:opacity-40 disabled:hover:scale-100"
              >
                {otpLoading ? (
                  <div className="w-6 h-6 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                ) : (
                  <>
                    <Check className="w-5 h-5 mr-2.5" />
                    Verify Code
                  </>
                )}
              </Button>
              
              {/* Resend Code */}
              <div className="text-center space-y-2">
                <p className="text-white/35 text-sm">Didn't receive the code?</p>
                <button
                  onClick={handleResendEmailOtp}
                  disabled={otpLoading}
                  className="text-emerald-400 text-sm font-semibold hover:text-emerald-300 transition-all disabled:opacity-40 hover:underline underline-offset-4"
                >
                  Resend Code
                </button>
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Gender selection removed - will be shown on Home page after login */}

      {/* NEW Email Flow - Step 4: Name & Password - ULTRA PREMIUM */}
      <Dialog open={authStep === "email_password"} onOpenChange={() => resetAuthState()}>
        <DialogContent className="max-w-[90vw] sm:max-w-sm mx-auto p-0 border-0 rounded-3xl overflow-visible bg-transparent shadow-2xl shadow-violet-900/40">
          <div className="absolute inset-0 rounded-3xl bg-gradient-to-br from-violet-500/40 via-pink-500/30 to-purple-500/40 animate-[spin_8s_linear_infinite] blur-[1px]" style={{ padding: '1px' }} />
          <div className="relative rounded-3xl bg-gradient-to-br from-[#0d0d1a] via-[#1a1025] to-[#0d0d1a] backdrop-blur-xl p-6">
            <div className="absolute top-0 left-1/2 -translate-x-1/2 w-40 h-40 bg-violet-600/12 rounded-full blur-3xl pointer-events-none" />
            {/* Close button handled by DialogContent */}

            <DialogHeader className="relative z-10">
              <div className="flex justify-center mb-5">
                <div className="relative">
                  <div className="absolute inset-0 bg-gradient-to-br from-purple-500 to-pink-600 rounded-full blur-lg opacity-50 animate-pulse" />
                  <div className="relative w-20 h-20 rounded-full bg-gradient-to-br from-violet-500 via-purple-500 to-pink-500 flex items-center justify-center shadow-lg shadow-purple-500/30 ring-2 ring-white/10">
                    <User className="w-9 h-9 text-white drop-shadow-lg" />
                  </div>
                </div>
              </div>
              <DialogTitle className="text-white text-center text-2xl font-bold tracking-tight bg-gradient-to-r from-white via-purple-100 to-white bg-clip-text text-transparent">Complete Your Profile</DialogTitle>
              <DialogDescription className="text-white/50 text-center text-sm mt-1">Set your name and password</DialogDescription>
            </DialogHeader>
            
            <div className="py-5 space-y-4 relative z-10">
              <div className="relative group">
                <div className="absolute -inset-[1px] rounded-2xl bg-gradient-to-r from-purple-500/40 to-pink-500/40 opacity-60 group-focus-within:opacity-100 transition-opacity blur-[0.5px]" />
                <div className="relative flex items-center bg-white/[0.06] rounded-2xl overflow-hidden">
                  <div className="pl-4 pr-2"><User className="w-5 h-5 text-purple-400/70" /></div>
                  <Input value={displayName} onChange={(e) => setDisplayName(e.target.value)} placeholder="Your name" className="h-13 bg-transparent border-0 text-white placeholder:text-white/30 rounded-2xl focus-visible:ring-0 focus-visible:ring-offset-0" autoFocus />
                </div>
              </div>

              <div className="relative group">
                <div className="absolute -inset-[1px] rounded-2xl bg-gradient-to-r from-purple-500/40 to-pink-500/40 opacity-60 group-focus-within:opacity-100 transition-opacity blur-[0.5px]" />
                <div className="relative flex items-center bg-white/[0.06] rounded-2xl overflow-hidden">
                  <div className="pl-4 pr-2"><Lock className="w-5 h-5 text-purple-400/70" /></div>
                  <Input type={showPassword ? "text" : "password"} value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Password (min 6 characters)" className="h-13 bg-transparent border-0 text-white placeholder:text-white/30 rounded-2xl pr-10 focus-visible:ring-0 focus-visible:ring-offset-0" />
                  <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-3 top-1/2 -translate-y-1/2 text-white/30 hover:text-white/60 transition-colors">
                    {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                  </button>
                </div>
              </div>

              <div className="relative group">
                <div className="absolute -inset-[1px] rounded-2xl bg-gradient-to-r from-purple-500/40 to-pink-500/40 opacity-60 group-focus-within:opacity-100 transition-opacity blur-[0.5px]" />
                <div className="relative flex items-center bg-white/[0.06] rounded-2xl overflow-hidden">
                  <div className="pl-4 pr-2"><Lock className="w-5 h-5 text-purple-400/70" /></div>
                  <Input type={showPassword ? "text" : "password"} value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} placeholder="Confirm password" className="h-13 bg-transparent border-0 text-white placeholder:text-white/30 rounded-2xl focus-visible:ring-0 focus-visible:ring-offset-0" />
                </div>
              </div>
              
              <Button onClick={handleCreateEmailAccount} disabled={loading || !displayName.trim() || !password.trim() || !confirmPassword.trim()} className="w-full h-14 bg-gradient-to-r from-violet-600 via-purple-500 to-pink-500 hover:from-violet-500 hover:via-purple-400 hover:to-pink-400 text-white font-bold rounded-2xl text-base shadow-lg shadow-purple-600/25 transition-all duration-300 hover:shadow-xl hover:scale-[1.02] active:scale-[0.98] disabled:opacity-40 disabled:hover:scale-100">
                {loading ? (
                  <div className="w-6 h-6 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                ) : (
                  <>
                    <span className="mr-2">🚀</span>
                    Create Account
                  </>
                )}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* OTP Verification Dialog - ULTRA PREMIUM */}
      <Dialog open={authStep === "otp_verify"} onOpenChange={() => closeDialog()}>
        <DialogContent className="max-w-[90vw] sm:max-w-sm mx-auto p-0 border-0 rounded-3xl overflow-visible bg-transparent shadow-2xl shadow-pink-900/30">
          <div className="absolute inset-0 rounded-3xl bg-gradient-to-br from-pink-500/40 via-violet-500/30 to-pink-500/40 animate-[spin_8s_linear_infinite] blur-[1px]" style={{ padding: '1px' }} />
          <div className="relative rounded-3xl bg-gradient-to-br from-[#0d0d1a] via-[#1a1025] to-[#0d0d1a] backdrop-blur-xl p-6">
            <div className="absolute top-0 left-1/2 -translate-x-1/2 w-40 h-40 bg-pink-600/12 rounded-full blur-3xl pointer-events-none" />
            {/* Close button handled by DialogContent */}

            <DialogHeader className="relative z-10">
              <div className="flex justify-center mb-5">
                <div className="relative">
                  <div className="absolute inset-0 rounded-full blur-2xl opacity-60 animate-pulse bg-gradient-to-br from-pink-500/50 via-purple-500/40 to-orange-400/30" />
                  <div className="relative w-24 h-24 rounded-full overflow-hidden ring-2 ring-pink-500/40 shadow-2xl shadow-pink-500/30">
                    <img src="/images/merilive-logo.png" alt="MeriLive" className="w-full h-full object-cover" />
                  </div>
                </div>
              </div>
              <DialogTitle className="text-white text-center text-2xl font-bold tracking-tight bg-gradient-to-r from-white via-pink-100 to-white bg-clip-text text-transparent">Verify Your Email</DialogTitle>
              <DialogDescription className="text-white/50 text-center text-sm mt-1">Enter the 6-digit code sent to <span className="text-pink-400 font-medium">{email}</span></DialogDescription>
            </DialogHeader>
            
            <div className="py-5 space-y-6 relative z-10">
              <div className="flex justify-center">
                <div className="relative group">
                  <div className="absolute -inset-[1px] rounded-2xl bg-gradient-to-r from-pink-500/50 via-purple-500/50 to-pink-500/50 opacity-60 group-focus-within:opacity-100 transition-opacity blur-[0.5px]" />
                  <Input type="text" value={otpCode} onChange={(e) => { const value = e.target.value.replace(/\D/g, '').slice(0, 6); setOtpCode(value); }} placeholder="000000" maxLength={6} className="relative h-16 w-52 text-center text-3xl font-bold tracking-[0.5em] bg-white/[0.06] border-0 text-white placeholder:text-white/20 rounded-2xl focus-visible:ring-0 focus-visible:ring-offset-0" autoFocus />
                </div>
              </div>
              
              <Button onClick={handleVerifyOtp} disabled={otpLoading || otpCode.length !== 6} className="w-full h-14 bg-gradient-to-r from-emerald-600 via-green-500 to-emerald-600 hover:from-emerald-500 hover:via-green-400 hover:to-emerald-500 text-white font-bold rounded-2xl text-base shadow-lg shadow-emerald-600/25 transition-all duration-300 hover:shadow-xl hover:scale-[1.02] active:scale-[0.98] disabled:opacity-40 disabled:hover:scale-100">
                {otpLoading ? (
                  <div className="w-6 h-6 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                ) : (
                  <>
                    <Check className="w-5 h-5 mr-2.5" />
                    Verify & Continue
                  </>
                )}
              </Button>
              
              <div className="text-center space-y-2">
                <p className="text-white/35 text-sm">Didn't receive the code?</p>
                <button onClick={handleResendOtp} disabled={otpLoading} className="text-pink-400 text-sm font-semibold hover:text-pink-300 transition-all disabled:opacity-40 hover:underline underline-offset-4">Resend Code</button>
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Login Dialog - ULTRA PREMIUM */}
      <Dialog open={authStep === "login"} onOpenChange={() => resetAuthState()}>
        <DialogContent className="max-w-[90vw] sm:max-w-sm mx-auto p-0 border-0 rounded-3xl overflow-visible bg-transparent shadow-2xl shadow-indigo-900/30">
          <div className="absolute inset-0 rounded-3xl bg-gradient-to-br from-indigo-500/40 via-purple-500/30 to-pink-500/40 animate-[spin_8s_linear_infinite] blur-[1px]" style={{ padding: '1px' }} />
          <div className="relative rounded-3xl bg-gradient-to-br from-[#0d0d1a] via-[#12102a] to-[#0d0d1a] backdrop-blur-xl p-6">
            <div className="absolute top-0 left-1/2 -translate-x-1/2 w-40 h-40 bg-indigo-600/12 rounded-full blur-3xl pointer-events-none" />
            {/* Close button handled by DialogContent */}

            <DialogHeader className="relative z-10">
              <DialogTitle className="text-white text-center text-2xl font-bold tracking-tight bg-gradient-to-r from-white via-indigo-100 to-white bg-clip-text text-transparent">Welcome Back</DialogTitle>
              <DialogDescription className="text-white/50 text-center text-sm mt-1">Login to your account</DialogDescription>
            </DialogHeader>
            
            <div className="py-5 space-y-4 relative z-10">
              <div className="relative group">
                <div className="absolute -inset-[1px] rounded-2xl bg-gradient-to-r from-indigo-500/40 to-purple-500/40 opacity-60 group-focus-within:opacity-100 transition-opacity blur-[0.5px]" />
                <div className="relative flex items-center bg-white/[0.06] rounded-2xl overflow-hidden">
                  <div className="pl-4 pr-2"><Mail className="w-5 h-5 text-indigo-400/70" /></div>
                  <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Email address" className="h-13 bg-transparent border-0 text-white placeholder:text-white/30 rounded-2xl focus-visible:ring-0 focus-visible:ring-offset-0" />
                </div>
              </div>
              
              <div className="relative group">
                <div className="absolute -inset-[1px] rounded-2xl bg-gradient-to-r from-indigo-500/40 to-purple-500/40 opacity-60 group-focus-within:opacity-100 transition-opacity blur-[0.5px]" />
                <div className="relative flex items-center bg-white/[0.06] rounded-2xl overflow-hidden">
                  <div className="pl-4 pr-2"><Lock className="w-5 h-5 text-indigo-400/70" /></div>
                  <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Password" className="h-13 bg-transparent border-0 text-white placeholder:text-white/30 rounded-2xl focus-visible:ring-0 focus-visible:ring-offset-0" />
                </div>
              </div>
              
              <Button onClick={handleLoginAuth} disabled={loading || !email.trim() || !password.trim()} className="w-full h-14 bg-gradient-to-r from-pink-600 via-rose-500 to-pink-600 hover:from-pink-500 hover:via-rose-400 hover:to-pink-500 text-white font-bold rounded-2xl text-base shadow-lg shadow-pink-600/25 transition-all duration-300 hover:shadow-xl hover:scale-[1.02] active:scale-[0.98] disabled:opacity-40 disabled:hover:scale-100">
                {loading ? (
                  <div className="w-6 h-6 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                ) : (
                  "Login"
                )}
              </Button>
              
              <div className="text-center pt-1">
                <button onClick={() => { setIsEmailFlow(true); setEmail(""); setAuthStep("email"); }} className="text-white/40 text-sm hover:text-white/70 transition-colors">
                  Don't have an account? <span className="text-pink-400 font-semibold hover:text-pink-300">Sign Up</span>
                </button>
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Phone Number Input Dialog */}
      <Dialog open={authStep === "phone_input"} onOpenChange={() => resetAuthState()}>
        <DialogContent className="max-w-[90vw] sm:max-w-sm mx-auto p-0 border-0 rounded-3xl overflow-visible bg-transparent shadow-2xl shadow-green-900/40">
          <div className="absolute inset-0 rounded-3xl bg-gradient-to-br from-green-500/40 via-emerald-500/30 to-teal-500/40 animate-[spin_8s_linear_infinite] blur-[1px]" style={{ padding: '1px' }} />
          <div className="relative rounded-3xl bg-gradient-to-br from-[#0d0d1a] via-[#0a1a12] to-[#0d0d1a] backdrop-blur-xl p-6">
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
              <DialogTitle className="text-white text-center text-2xl font-bold tracking-tight bg-gradient-to-r from-white via-green-100 to-white bg-clip-text text-transparent">
                Enter Phone Number
              </DialogTitle>
              <DialogDescription className="text-white/50 text-center text-sm mt-1">
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
                    className="w-full h-14 flex items-center justify-between px-4 bg-white/[0.06] rounded-2xl border border-white/10 hover:border-green-500/40 transition-colors"
                  >
                    <div className="flex items-center gap-3">
                      <span className="text-2xl">{selectedCountry.flag}</span>
                      <span className="text-white font-semibold">{selectedCountry.code}</span>
                      <span className="text-white/40 text-sm">{selectedCountry.name}</span>
                    </div>
                    <ChevronDown className={`w-5 h-5 text-white/40 transition-transform ${showCountryPicker ? 'rotate-180' : ''}`} />
                  </button>

                  {/* Country Dropdown */}
                  {showCountryPicker && (
                    <div className="absolute top-full left-0 right-0 mt-2 bg-[#1a1a2e] border border-white/10 rounded-2xl shadow-2xl shadow-black/50 z-50 max-h-64 overflow-hidden">
                      <div className="p-2 border-b border-white/10">
                        <div className="flex items-center bg-white/[0.06] rounded-xl px-3">
                          <Search className="w-4 h-4 text-white/30" />
                          <input
                            type="text"
                            value={countrySearch}
                            onChange={(e) => setCountrySearch(e.target.value)}
                            placeholder="Search country..."
                            className="w-full h-10 bg-transparent border-0 text-white text-sm placeholder:text-white/30 outline-none px-2"
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
                            className={`w-full flex items-center gap-3 px-4 py-3 hover:bg-white/[0.08] transition-colors ${
                              selectedCountryCode === country.code ? 'bg-green-500/10' : ''
                            }`}
                          >
                            <span className="text-xl">{country.flag}</span>
                            <span className="text-white/80 text-sm flex-1 text-left">{country.name}</span>
                            <span className="text-green-400/70 text-sm font-mono">{country.code}</span>
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                {/* Phone Number Input */}
                <div className="relative group">
                  <div className="absolute -inset-[1px] rounded-2xl bg-gradient-to-r from-green-500/50 via-emerald-500/50 to-green-500/50 opacity-60 group-focus-within:opacity-100 transition-opacity blur-[0.5px]" />
                  <div className="relative flex items-center bg-white/[0.06] rounded-2xl overflow-hidden">
                    <div className="pl-4 pr-2 flex items-center gap-1.5 border-r border-white/10">
                      <span className="text-lg">{selectedCountry.flag}</span>
                      <span className="text-green-400 font-semibold text-sm">{selectedCountryCode}</span>
                    </div>
                    <Input
                      type="tel"
                      value={phoneNumber}
                      onChange={(e) => {
                        const value = e.target.value.replace(/[^\d\s]/g, '');
                        setPhoneNumber(value);
                      }}
                      placeholder="1XXXXXXXXX"
                      className="h-14 bg-transparent border-0 text-white placeholder:text-white/30 rounded-2xl text-base focus-visible:ring-0 focus-visible:ring-offset-0"
                      autoFocus={!showCountryPicker}
                    />
                  </div>
                </div>
              </div>

              {/* WhatsApp info badge */}
              <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-green-500/10 border border-green-500/20">
                <MessageCircle className="w-4 h-4 text-green-400 flex-shrink-0" />
                <p className="text-green-300/80 text-xs">
                  Verification code will be sent via <span className="font-bold text-green-300">WhatsApp</span>
                </p>
              </div>

              <Button
                onClick={handleSendPhoneOtp}
                disabled={loading || !phoneNumber.trim()}
                className="w-full h-14 bg-gradient-to-r from-green-600 via-emerald-500 to-green-600 hover:from-green-500 hover:via-emerald-400 hover:to-green-500 text-white font-bold rounded-2xl text-base shadow-lg shadow-green-600/25 transition-all duration-300 hover:shadow-xl hover:shadow-green-500/30 hover:scale-[1.02] active:scale-[0.98] disabled:opacity-40 disabled:hover:scale-100"
              >
                {loading ? (
                  <div className="w-6 h-6 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                ) : (
                  <>
                    <MessageCircle className="w-5 h-5 mr-2.5" />
                    Send WhatsApp Code
                  </>
                )}
              </Button>

              <div className="text-center pt-1">
                <button
                  onClick={() => { setIsEmailFlow(true); setEmail(""); setAuthStep("email"); }}
                  className="text-white/40 text-sm hover:text-white/70 transition-colors"
                >
                  Use email instead? <span className="text-green-400 font-semibold hover:text-green-300">Email Sign Up</span>
                </button>
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Phone OTP Verification Dialog */}
      <Dialog open={authStep === "phone_otp"} onOpenChange={() => resetAuthState()}>
        <DialogContent className="max-w-[90vw] sm:max-w-sm mx-auto p-0 border-0 rounded-3xl overflow-visible bg-transparent shadow-2xl shadow-green-900/30">
          <div className="absolute inset-0 rounded-3xl bg-gradient-to-br from-green-500/40 via-teal-500/30 to-emerald-500/40 animate-[spin_8s_linear_infinite] blur-[1px]" style={{ padding: '1px' }} />
          <div className="relative rounded-3xl bg-gradient-to-br from-[#0d0d1a] via-[#0a1a12] to-[#0d0d1a] backdrop-blur-xl p-6">
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
              <DialogTitle className="text-white text-center text-2xl font-bold tracking-tight bg-gradient-to-r from-white via-green-100 to-white bg-clip-text text-transparent">
                WhatsApp Verification
              </DialogTitle>
              <DialogDescription className="text-white/50 text-center text-sm mt-1">
                6-digit code sent to <span className="text-green-400 font-medium">{selectedCountryCode} {phoneNumber}</span> via WhatsApp
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
                    className="relative h-16 w-52 text-center text-3xl font-bold tracking-[0.5em] bg-white/[0.06] border-0 text-white placeholder:text-white/20 rounded-2xl focus-visible:ring-0 focus-visible:ring-offset-0"
                    autoFocus
                  />
                </div>
              </div>

              <Button
                onClick={handleVerifyPhoneOtp}
                disabled={phoneOtpLoading || phoneOtpCode.length !== 6}
                className="w-full h-14 bg-gradient-to-r from-green-600 via-emerald-500 to-green-600 hover:from-green-500 hover:via-emerald-400 hover:to-green-500 text-white font-bold rounded-2xl text-base shadow-lg shadow-green-600/25 transition-all duration-300 hover:shadow-xl hover:shadow-green-500/30 hover:scale-[1.02] active:scale-[0.98] disabled:opacity-40 disabled:hover:scale-100"
              >
                {phoneOtpLoading ? (
                  <div className="w-6 h-6 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                ) : (
                  <>
                    <Check className="w-5 h-5 mr-2.5" />
                    Verify Code
                  </>
                )}
              </Button>

              <div className="text-center space-y-2">
                <p className="text-white/35 text-sm">Didn't receive the code?</p>
                <button
                  onClick={handleResendPhoneOtp}
                  disabled={phoneOtpLoading}
                  className="text-green-400 text-sm font-semibold hover:text-green-300 transition-all disabled:opacity-40 hover:underline underline-offset-4"
                >
                  Resend WhatsApp Code
                </button>
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Phone Flow - Name & Password (after phone verification) */}
      <Dialog open={authStep === "phone_password"} onOpenChange={() => resetAuthState()}>
        <DialogContent className="max-w-[90vw] sm:max-w-sm mx-auto p-0 border-0 rounded-3xl overflow-visible bg-transparent shadow-2xl shadow-green-900/40">
          <div className="absolute inset-0 rounded-3xl bg-gradient-to-br from-green-500/40 via-emerald-500/30 to-teal-500/40 animate-[spin_8s_linear_infinite] blur-[1px]" style={{ padding: '1px' }} />
          <div className="relative rounded-3xl bg-gradient-to-br from-[#0d0d1a] via-[#0a1a12] to-[#0d0d1a] backdrop-blur-xl p-6">
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
              <DialogTitle className="text-white text-center text-2xl font-bold tracking-tight bg-gradient-to-r from-white via-green-100 to-white bg-clip-text text-transparent">Complete Your Profile</DialogTitle>
              <DialogDescription className="text-white/50 text-center text-sm mt-1">Set your name and password</DialogDescription>
            </DialogHeader>

            <div className="py-5 space-y-4 relative z-10">
              <div className="relative group">
                <div className="absolute -inset-[1px] rounded-2xl bg-gradient-to-r from-green-500/40 to-emerald-500/40 opacity-60 group-focus-within:opacity-100 transition-opacity blur-[0.5px]" />
                <div className="relative flex items-center bg-white/[0.06] rounded-2xl overflow-hidden">
                  <div className="pl-4 pr-2"><User className="w-5 h-5 text-green-400/70" /></div>
                  <Input value={displayName} onChange={(e) => setDisplayName(e.target.value)} placeholder="Your name" className="h-13 bg-transparent border-0 text-white placeholder:text-white/30 rounded-2xl focus-visible:ring-0 focus-visible:ring-offset-0" autoFocus />
                </div>
              </div>

              <div className="relative group">
                <div className="absolute -inset-[1px] rounded-2xl bg-gradient-to-r from-green-500/40 to-emerald-500/40 opacity-60 group-focus-within:opacity-100 transition-opacity blur-[0.5px]" />
                <div className="relative flex items-center bg-white/[0.06] rounded-2xl overflow-hidden">
                  <div className="pl-4 pr-2"><Lock className="w-5 h-5 text-green-400/70" /></div>
                  <Input type={showPassword ? "text" : "password"} value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Password (min 6 characters)" className="h-13 bg-transparent border-0 text-white placeholder:text-white/30 rounded-2xl pr-10 focus-visible:ring-0 focus-visible:ring-offset-0" />
                  <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-3 top-1/2 -translate-y-1/2 text-white/30 hover:text-white/60 transition-colors">
                    {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                  </button>
                </div>
              </div>

              <div className="relative group">
                <div className="absolute -inset-[1px] rounded-2xl bg-gradient-to-r from-green-500/40 to-emerald-500/40 opacity-60 group-focus-within:opacity-100 transition-opacity blur-[0.5px]" />
                <div className="relative flex items-center bg-white/[0.06] rounded-2xl overflow-hidden">
                  <div className="pl-4 pr-2"><Lock className="w-5 h-5 text-green-400/70" /></div>
                  <Input type={showPassword ? "text" : "password"} value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} placeholder="Confirm password" className="h-13 bg-transparent border-0 text-white placeholder:text-white/30 rounded-2xl focus-visible:ring-0 focus-visible:ring-offset-0" />
                </div>
              </div>

              <Button onClick={handleCreatePhoneAccount} disabled={loading || !displayName.trim() || !password.trim() || !confirmPassword.trim()} className="w-full h-14 bg-gradient-to-r from-green-600 via-emerald-500 to-teal-500 hover:from-green-500 hover:via-emerald-400 hover:to-teal-400 text-white font-bold rounded-2xl text-base shadow-lg shadow-green-600/25 transition-all duration-300 hover:shadow-xl hover:scale-[1.02] active:scale-[0.98] disabled:opacity-40 disabled:hover:scale-100">
                {loading ? (
                  <div className="w-6 h-6 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                ) : (
                  <>
                    <span className="mr-2">🚀</span>
                    Create Account
                  </>
                )}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
      </div>
    </div>
  );
};


export default Auth;
