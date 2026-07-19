import { useState, useEffect } from "react";
import { 
  Building2,
  Loader2,
  CheckCircle2,
  AlertCircle,
  Sparkles,
  Download,
  PartyPopper,
  Link as LinkIcon,
  Crown,
  User,
  Search,
  Mail,
  Phone,
  Bell,
  Timer
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  InputOTP,
  InputOTPGroup,
  InputOTPSlot,
} from "@/components/ui/input-otp";
import { supabase } from "@/integrations/supabase/client";
import { PLAY_STORE_URL, APK_DOWNLOAD_URL } from "@/utils/shareLinks";
import meriliveLogo from "@/assets/merilive-logo.png";
import googlePlayBadge from "@/assets/google-play-badge.svg";
import { useEnableBrowserPageInteraction } from "@/hooks/useEnableBrowserPageInteraction";

interface BrowserAgencyFormProps {
  parentAgencyCode: string;
}

interface ParentAgency {
  id: string;
  name: string;
  level: string;
  logo_url: string | null;
}

interface UserProfile {
  id: string;
  display_name: string | null;
  avatar_url: string | null;
  username: string | null;
  app_uid: string | null;
  is_host: boolean | null;
}

type FormState = 'form' | 'submitting' | 'success' | 'error';

const BrowserAgencyForm = ({ parentAgencyCode }: BrowserAgencyFormProps) => {
  useEnableBrowserPageInteraction();
  const [formState, setFormState] = useState<FormState>('form');
  const [errorMessage, setErrorMessage] = useState<string>("");
  
  const [formData, setFormData] = useState({
    agencyName: "",
    userId: "",
    email: "",
    phone: ""
  });
  
  const [parentAgency, setParentAgency] = useState<ParentAgency | null>(null);
  const [loadingParent, setLoadingParent] = useState(true);
  const [createdAgencyCode, setCreatedAgencyCode] = useState<string>("");

  // User lookup
  const [searchingUser, setSearchingUser] = useState(false);
  const [foundUser, setFoundUser] = useState<UserProfile | null>(null);
  const [userNotFound, setUserNotFound] = useState(false);

  // App verification
  const [appCode, setAppCode] = useState("");
  const [appVerifiedToken, setAppVerifiedToken] = useState("");
  const [appVerified, setAppVerified] = useState(false);
  const [sendingAppCode, setSendingAppCode] = useState(false);
  const [appCodeSent, setAppCodeSent] = useState(false);
  const [appCodeTimer, setAppCodeTimer] = useState(0);

  // Email verification
  const [emailOtp, setEmailOtp] = useState("");
  const [emailVerifiedToken, setEmailVerifiedToken] = useState("");
  const [emailOtpSent, setEmailOtpSent] = useState(false);
  const [emailVerified, setEmailVerified] = useState(false);
  const [sendingEmailOtp, setSendingEmailOtp] = useState(false);
  const [emailOtpTimer, setEmailOtpTimer] = useState(0);
  const [verifyingEmailOtp, setVerifyingEmailOtp] = useState(false);

  // Fetch parent agency details
  useEffect(() => {
    const fetchParentAgency = async () => {
      setLoadingParent(true);
      try {
        // Use agencies_public view (no RLS) so anon/browser users can see agency info
        const normalizedCode = parentAgencyCode.trim().toUpperCase();
        const { data, error } = await supabase
          .from('agencies_public')
          .select('id, name, level, logo_url')
          .eq('agency_code', normalizedCode)
          .maybeSingle();

        if (!data && !error) {
          // Try fuzzy match (0↔O confusion)
          const fuzzyCode = normalizedCode.replace(/O/g, '0').replace(/I/g, '1').replace(/L/g, '1');
          const { data: fuzzyData } = await supabase
            .from('agencies_public')
            .select('id, name, level, logo_url, agency_code')
            .limit(50);
          
          const match = fuzzyData?.find(a => 
            a.agency_code.replace(/O/g, '0').replace(/I/g, '1').replace(/L/g, '1') === fuzzyCode
          );
          
          if (match) {
            setParentAgency({
              id: match.id,
              name: match.name,
              level: match.level,
              logo_url: match.logo_url || null
            });
          }
        } else if (data) {
          setParentAgency({
            id: data.id,
            name: data.name,
            level: data.level,
            logo_url: data.logo_url || null
          });
        }
      } catch (error) {
        console.error('[BrowserAgencyForm] Error fetching parent:', error);
      }
      setLoadingParent(false);
    };

    fetchParentAgency();
  }, [parentAgencyCode]);

  // Timer countdown for app code
  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (appCodeTimer > 0) {
      interval = setInterval(() => {
        setAppCodeTimer(prev => prev - 1);
      }, 1000);
    }
    return () => clearInterval(interval);
  }, [appCodeTimer]);

  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (emailOtpTimer > 0) interval = setInterval(() => setEmailOtpTimer(prev => prev - 1), 1000);
    return () => clearInterval(interval);
  }, [emailOtpTimer]);

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
        return payload?.error || payload?.message || fallback;
      }
    } catch {}
    return error?.message || fallback;
  };

  // Search user by App UID
  const searchUserById = async () => {
    if (!formData.userId.trim()) {
      setErrorMessage("Please enter your App UID (e.g., LV1234567890)");
      return;
    }

    setSearchingUser(true);
    setUserNotFound(false);
    setFoundUser(null);
    setErrorMessage("");

    try {
      const { data, error } = await supabase.rpc('search_user_by_app_uid', {
        _app_uid: formData.userId.trim().toUpperCase()
      });

      if (data && data.length > 0) {
        const user = data[0];
        
        // Check if user is already in an agency
        const { data: profileData } = await supabase
          .from("profiles")
          .select("agency_id, is_agency_owner")
          .eq("id", user.id)
          .maybeSingle();
        
        if (profileData?.agency_id) {
          setErrorMessage("This user is already part of another agency.");
          setUserNotFound(true);
          return;
        }
        
        if (profileData?.is_agency_owner) {
          setErrorMessage("This user already owns an agency.");
          setUserNotFound(true);
          return;
        }
        
        setFoundUser({
          id: user.id,
          display_name: user.display_name,
          avatar_url: user.avatar_url,
          username: user.username,
          app_uid: user.app_uid,
          is_host: user.is_host
        });
      } else {
        setUserNotFound(true);
        setErrorMessage("User not found. Please enter a valid App UID.");
      }
    } catch (error) {
      console.error('Search error:', error);
      setUserNotFound(true);
      setErrorMessage("Failed to search user. Please try again.");
    } finally {
      setSearchingUser(false);
    }
  };

  // Send app verification code via in-app notification
  const sendAppVerificationCode = async () => {
    if (!foundUser) {
      setErrorMessage("Please find a user first");
      return;
    }

    setSendingAppCode(true);
    setErrorMessage("");
    setAppCode("");
    setAppVerified(false);
    setAppVerifiedToken("");

    try {
      const { data, error } = await supabase.functions.invoke('agency-app-otp', {
        body: {
          action: 'send',
          userId: foundUser.id,
          purpose: 'sub_agency_verification',
          context: parentAgencyCode
        }
      });

      if (error) throw new Error(await getFunctionErrorMessage(error, "Failed to send verification code"));
      if (!data?.success) throw new Error(data?.error || "Failed to send verification code");

      setAppCodeSent(true);
      setAppCodeTimer(300);
    } catch (error: any) {
      console.error('App notification error:', error);
      setErrorMessage(error.message || "Failed to send verification code");
    } finally {
      setSendingAppCode(false);
    }
  };

  // Verify app code
  const verifyAppCode = async () => {
    if (appCodeTimer <= 0) {
      setErrorMessage("Code expired. Please resend the verification code.");
      return;
    }
    try {
      const { data, error } = await supabase.functions.invoke('agency-app-otp', {
        body: { action: 'verify', userId: foundUser?.id, code: appCode, purpose: 'sub_agency_verification' }
      });
      if (error) throw new Error(await getFunctionErrorMessage(error, "Verification failed"));
      if (!data?.success || !data?.verified_token) throw new Error(data?.error || "Verification failed");
      setAppVerified(true);
      setAppVerifiedToken(data.verified_token);
      setErrorMessage("");
    } catch (error: any) {
      setErrorMessage(error.message || "Wrong code. Please enter the correct code.");
    }
  };

  // Validate email format
  const isValidEmail = (email: string) => {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  };

  // Validate phone format
  const isValidPhone = (phone: string) => {
    return /^[0-9+\-\s]{10,15}$/.test(phone.replace(/\s/g, ''));
  };

  const sendEmailOtp = async () => {
    const normalizedEmail = formData.email.trim().toLowerCase();
    if (!isValidEmail(normalizedEmail)) {
      setErrorMessage("Please enter a valid email address");
      return;
    }
    setSendingEmailOtp(true);
    setErrorMessage("");
    try {
      const { data, error } = await supabase.functions.invoke('send-email-otp', {
        body: { email: normalizedEmail, purpose: 'verify', context: 'sub_agency_signup' }
      });
      if (error) throw new Error(await getFunctionErrorMessage(error, "Failed to send email OTP"));
      if (!data?.success) throw Object.assign(new Error(data?.error || "Failed to send email OTP"), { code: data?.code });
      setEmailOtpSent(true);
      setEmailOtpTimer(300);
      setEmailOtp("");
      setEmailVerified(false);
      setEmailVerifiedToken("");
    } catch (error: any) {
      setErrorMessage(await getFunctionErrorMessage(error, "Failed to send email OTP"));
    } finally {
      setSendingEmailOtp(false);
    }
  };

  const verifyEmailOtp = async () => {
    if (emailOtp.length !== 6) return;
    setVerifyingEmailOtp(true);
    setErrorMessage("");
    try {
      const { data, error } = await supabase.functions.invoke('verify-email-otp', {
        body: { email: formData.email.trim().toLowerCase(), otp: emailOtp, purpose: 'verify' }
      });
      if (error) throw new Error(await getFunctionErrorMessage(error, "Email OTP verification failed"));
      if (!data?.success || !data?.verified_token) throw new Error(data?.error || "Email OTP verification failed");
      setEmailVerified(true);
      setEmailVerifiedToken(data.verified_token);
    } catch (error: any) {
      setErrorMessage(error.message || "Email OTP verification failed");
    } finally {
      setVerifyingEmailOtp(false);
    }
  };

  const handleSubmit = async () => {
    // Validation
    if (!formData.agencyName.trim()) {
      setErrorMessage("Please enter agency name");
      return;
    }
    if (!appVerified || !appVerifiedToken) {
      setErrorMessage("Please complete in-app OTP verification first");
      return;
    }
    // Email is optional; only validate format and OTP if user provided one
    if (formData.email.trim() && !isValidEmail(formData.email)) {
      setErrorMessage("Please enter a valid email address (or leave it blank)");
      return;
    }
    if (formData.email.trim() && (!emailVerified || !emailVerifiedToken)) {
      setErrorMessage("You entered an email — please verify the email OTP, or clear the email field to skip");
      return;
    }
    if (!formData.phone.trim() || !isValidPhone(formData.phone)) {
      setErrorMessage("Please enter a valid phone number");
      return;
    }
    if (!parentAgency) {
      setErrorMessage("Parent agency not found");
      return;
    }

    setFormState('submitting');
    setErrorMessage("");

    try {
      // Call edge function to create agency (bypasses RLS)
      const { data, error } = await supabase.functions.invoke('create-sub-agency-browser', {
        body: {
          name: formData.agencyName.trim(),
          userId: foundUser?.id,
          email: formData.email.trim() || null,
          emailVerifiedToken: formData.email.trim() ? emailVerifiedToken : null,
          appVerifiedToken,
          phone: formData.phone.trim(),
          parentAgencyCode: parentAgencyCode
        }
      });

      if (error) {
        throw error;
      }

      if (data?.error) {
        throw new Error(data.error);
      }

      // Store pending agency claim info
      const pendingClaim = {
        agencyId: data.agency.id,
        agencyCode: data.agency.code,
        agencyName: data.agency.name,
        userId: foundUser?.id,
        email: formData.email.trim(),
        phone: formData.phone.trim(),
        parentAgencyId: parentAgency.id,
        parentAgencyCode: parentAgencyCode,
        createdAt: new Date().toISOString()
      };
      
      localStorage.setItem("meri_pending_agency_claim", JSON.stringify(pendingClaim));
      
      // Also store for deferred deep linking
      localStorage.setItem("meri_pending_deep_link", JSON.stringify({
        path: `/agency-dashboard`,
        timestamp: Date.now()
      }));

      setCreatedAgencyCode(data.agency.code);
      setFormState('success');

    } catch (error: any) {
      console.error('[BrowserAgencyForm] Submit error:', error);
      setErrorMessage(error.message || "Something went wrong. Please try again.");
      setFormState('error');
    }
  };

  // Loading parent agency
  if (loadingParent) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-[#0a0a14] via-[#12102a] to-[#1a0f2e] flex flex-col items-center justify-center p-6">
        <img loading="lazy" decoding="async" src={meriliveLogo} alt="MeriLive" className="w-20 h-20 mb-4 animate-pulse" />
        <Loader2 className="w-8 h-8 text-white animate-spin" />
        <p className="text-white/70 text-sm mt-3 font-medium">Loading...</p>
      </div>
    );
  }

  // Parent agency not found
  if (!parentAgency) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-[#1a0a0a] via-[#2a1010] to-[#1a0a0a] flex flex-col items-center justify-center p-6">
        <img loading="lazy" decoding="async" src={meriliveLogo} alt="MeriLive" className="w-20 h-20 mb-4" />
        <AlertCircle className="w-12 h-12 text-white mb-4" />
        <h1 className="text-xl font-bold text-white mb-2">Agency Not Found</h1>
        <p className="text-white/75 text-center text-sm">
          No agency found with code "{parentAgencyCode}".
        </p>
        <Button
          onClick={() => window.location.href = PLAY_STORE_URL}
          className="mt-6 bg-white text-danger-700 hover:bg-white/90"
        >
          <Download className="w-4 h-4 mr-2" />
          Download App
        </Button>
      </div>
    );
  }

  // Success state
  if (formState === 'success') {
    return (
      <div className="min-h-screen bg-gradient-to-br from-[#0a1a14] via-[#10261c] to-[#0a1a14] flex flex-col items-center justify-center p-6">
        <div
          className="rounded-[28px] p-8 max-w-sm w-full text-center"
          style={{
            background: 'linear-gradient(180deg,rgba(255,255,255,0.10) 0%,rgba(255,255,255,0.04) 100%)',
            backdropFilter: 'blur(24px)',
            WebkitBackdropFilter: 'blur(24px)',
            border: '1px solid rgba(255,255,255,0.18)',
            boxShadow: '0 30px 60px -20px rgba(16,38,28,0.6), inset 0 1px 0 rgba(255,255,255,0.18)',
          }}
        >
          <div
            className="w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-4"
            style={{
              background: 'linear-gradient(135deg,#34d399,#10b981)',
              boxShadow: '0 14px 30px -8px rgba(16,185,129,0.55), inset 0 1px 0 rgba(255,255,255,0.4)',
            }}
          >
            <PartyPopper className="w-10 h-10 text-white drop-shadow" />
          </div>

          <h1 className="text-2xl font-black text-white mb-2 tracking-tight" style={{ textShadow: '0 2px 8px rgba(0,0,0,0.4)' }}>
            🎉 Congratulations!
          </h1>
          <p className="text-white/85 mb-4 font-medium">
            Your sub-agency has been created successfully!
          </p>

          <div
            className="rounded-2xl p-4 mb-6"
            style={{
              background: 'rgba(255,255,255,0.10)',
              border: '1px solid rgba(255,255,255,0.15)',
              boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.18)',
            }}
          >
            <p className="text-white/60 text-[10px] mb-1 uppercase tracking-[0.15em] font-bold">Your Agency Code</p>
            <p className="text-2xl font-mono font-black text-white tracking-wider" style={{ textShadow: '0 1px 8px rgba(52,211,153,0.5)' }}>{createdAgencyCode}</p>
          </div>

          <div className="bg-warning-500/20 rounded-2xl p-3 mb-6 border border-warning-400/30">
            <p className="text-warning-100 text-sm font-medium">
              ⚠️ Open the app to access your agency dashboard.
            </p>
          </div>

          <div className="space-y-3">
            <Button
              onClick={() => window.location.href = PLAY_STORE_URL}
              className="w-full h-12 text-white font-bold rounded-2xl active:scale-[0.98] transition-transform"
              style={{
                background: 'linear-gradient(180deg,#34d399 0%,#10b981 60%,#047857 100%)',
                boxShadow: '0 10px 24px -6px rgba(16,185,129,0.55), inset 0 1px 0 rgba(255,255,255,0.35), inset 0 -1.5px 0 rgba(0,0,0,0.2)',
                textShadow: '0 1px 0 rgba(0,0,0,0.25)',
              }}
            >
              <Download className="w-5 h-5 mr-2" />
              Download from Play Store
            </Button>

            <Button
              onClick={() => window.location.href = APK_DOWNLOAD_URL}
              variant="outline"
              className="w-full h-11 border-white/25 bg-white/5 text-white hover:bg-white/15 hover:text-white rounded-2xl font-semibold"
            >
              Direct APK Download
            </Button>
          </div>
        </div>
      </div>
    );
  }


  // Form state
  return (
    <div className="min-h-[100dvh] bg-gradient-to-br from-[#0a0a14] via-[#12102a] to-[#1a0f2e] py-6 px-4 safe-area-inset overflow-x-hidden">
      <div className="max-w-md mx-auto">
        {/* Header */}
        <div className="text-center mb-6">
          <img loading="lazy" decoding="async" src={meriliveLogo} alt="MeriLive" className="w-16 h-16 mx-auto mb-3 drop-shadow-[0_8px_24px_rgba(124,58,237,0.45)]" />
          <h1 className="text-2xl font-black text-white tracking-tight" style={{ textShadow: '0 2px 12px rgba(0,0,0,0.5)' }}>Create Sub-Agency</h1>
          <p className="text-white/70 text-sm mt-1 font-medium">Fill the form and start your agency</p>
        </div>

        {/* Parent Agency Info */}
        <div
          className="rounded-3xl p-4 mb-5"
          style={{
            background: 'linear-gradient(180deg,rgba(255,255,255,0.10) 0%,rgba(255,255,255,0.04) 100%)',
            backdropFilter: 'blur(20px)',
            WebkitBackdropFilter: 'blur(20px)',
            border: '1px solid rgba(255,255,255,0.16)',
            boxShadow: '0 14px 30px -10px rgba(0,0,0,0.45), inset 0 1px 0 rgba(255,255,255,0.18)',
          }}
        >
            <div className="flex items-center gap-3">
              <div
                className="w-12 h-12 rounded-2xl flex items-center justify-center"
                style={{
                  background: 'linear-gradient(135deg,#7c3aed,#4f46e5)',
                  boxShadow: '0 8px 20px -4px rgba(124,58,237,0.55), inset 0 1px 0 rgba(255,255,255,0.3)',
                }}
              >
                <LinkIcon className="w-6 h-6 text-white drop-shadow" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-white/65 text-[10px] uppercase tracking-[0.15em] font-bold">Parent Agency</p>
                <p className="text-white font-bold truncate">{parentAgency.name}</p>
                <div className="flex items-center gap-2 mt-1">
                  <Badge className="bg-brand-500/30 text-brand-100 text-[10px] border border-brand-400/40 font-bold">
                    {parentAgency.level}
                  </Badge>
                  <span className="text-white/70 text-xs font-mono font-bold">{parentAgencyCode}</span>
                </div>
              </div>
              <a
                href={PLAY_STORE_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="shrink-0"
              >
                <img loading="lazy" decoding="async"
                  src={googlePlayBadge}
                  alt="Get it on Google Play"
                  className="w-[120px] h-auto rounded-lg hover:opacity-90 transition-opacity" />
              </a>
            </div>
            <p className="text-brand-200 text-xs mt-3 font-semibold">
              ✨ Join this agency as a Sub-Agent
            </p>
        </div>

        {/* Premium Form Card */}
        <div
          className="bg-white rounded-3xl p-5"
          style={{ boxShadow: '0 30px 60px -20px rgba(0,0,0,0.5), 0 8px 24px -8px rgba(124,58,237,0.25), inset 0 1px 0 rgba(255,255,255,0.7)' }}
        >
          <div className="space-y-5">
            {/* Agency Name */}
            <div>
              <Label className="text-sm font-semibold flex items-center gap-2 text-gray-800">
                <Building2 className="w-4 h-4 text-brand-600" />
                Agency Name <span className="text-danger-500">*</span>
              </Label>
              <Input
                placeholder="e.g., Team Victory"
                value={formData.agencyName}
                onChange={(e) => setFormData(prev => ({ ...prev, agencyName: e.target.value }))}
                className="mt-1.5"
                maxLength={50}
              />
            </div>

            {/* Divider */}
            <div className="border-t border-gray-200" />

            {/* App UID Section */}
            <div className="space-y-3">
              <Label className="text-sm font-semibold flex items-center gap-2 text-gray-800">
                <User className="w-4 h-4 text-brand-600" />
                App UID - Verification <span className="text-danger-500">*</span>
              </Label>
              
              <div className="flex items-center gap-2">
                <Input
                  placeholder="LV1234567890"
                  value={formData.userId}
                  onChange={(e) => {
                    setFormData(prev => ({ ...prev, userId: e.target.value.toUpperCase() }));
                    setFoundUser(null);
                    setUserNotFound(false);
                    setAppVerified(false);
                    setAppCodeSent(false);
                    setAppCode("");
                    setErrorMessage("");
                  }}
                  className="flex-1"
                  disabled={appVerified}
                />
                <Button
                  variant="outline"
                  onClick={searchUserById}
                  disabled={searchingUser || appVerified}
                  className="shrink-0"
                >
                  {searchingUser ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Search className="w-4 h-4" />
                  )}
                </Button>
              </div>

              {/* Found User Display */}
              {foundUser && (
                <div className="p-3 bg-success-50 border border-success-200 rounded-xl">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-success-200 rounded-full flex items-center justify-center text-success-700 font-bold">
                      {foundUser.display_name?.charAt(0) || "U"}
                    </div>
                    <div className="flex-1">
                      <p className="font-semibold text-success-800">
                        {foundUser.display_name || "Unknown User"}
                      </p>
                      <p className="text-xs text-success-600">{foundUser.app_uid}</p>
                    </div>
                    {appVerified ? (
                      <Badge className="bg-success-500 text-white">✓ Verified</Badge>
                    ) : (
                      <CheckCircle2 className="w-5 h-5 text-success-500" />
                    )}
                  </div>
                </div>
              )}

              {userNotFound && (
                <div className="p-3 bg-danger-50 border border-danger-200 rounded-xl flex items-center gap-2 text-danger-600">
                  <AlertCircle className="w-5 h-5" />
                  <span className="text-sm">User not found or not eligible</span>
                </div>
              )}

              {/* App OTP Section */}
              {foundUser && !appVerified && (
                <div className="bg-brand-50 rounded-xl p-4 border border-brand-200 space-y-3">
                  <div className="flex items-center gap-2 text-brand-700">
                    <Bell className="w-4 h-4" />
                    <span className="font-medium text-sm">App Notification Verification</span>
                  </div>
                  
                  {!appCodeSent ? (
                    <Button
                      onClick={sendAppVerificationCode}
                      disabled={sendingAppCode}
                      className="w-full bg-brand-600 hover:bg-brand-700"
                    >
                      {sendingAppCode ? (
                        <>
                          <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                          Sending...
                        </>
                      ) : (
                        <>
                          <Bell className="w-4 h-4 mr-2" />
                          Send Verification Code
                        </>
                      )}
                    </Button>
                  ) : (
                    <div className="space-y-3">
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-brand-600">Enter code from app notification</span>
                        {appCodeTimer > 0 ? (
                          <span className="flex items-center gap-1 text-warning-600">
                            <Timer className="w-3 h-3" />
                            {appCodeTimer}s
                          </span>
                        ) : (
                          <Button
                            variant="link"
                            size="sm"
                            onClick={sendAppVerificationCode}
                            disabled={sendingAppCode}
                            className="text-brand-600 p-0 h-auto"
                          >
                            Resend
                          </Button>
                        )}
                      </div>
                      
                      <InputOTP
                        maxLength={6}
                        value={appCode}
                        onChange={(value) => setAppCode(value)}
                      >
                        <InputOTPGroup className="gap-2 justify-center w-full">
                          {[0,1,2,3,4,5].map(i => <InputOTPSlot key={i} index={i} className="w-10 h-12 text-lg rounded-lg bg-white text-gray-900 border-gray-300" />)}
                        </InputOTPGroup>
                      </InputOTP>
                      
                      <Button
                        onClick={verifyAppCode}
                        disabled={appCode.length !== 6}
                        className="w-full bg-success-600 hover:bg-success-700"
                      >
                        <CheckCircle2 className="w-4 h-4 mr-2" />
                        Verify Code
                      </Button>
                    </div>
                  )}
                </div>
              )}

              {/* Verified Badge */}
              {appVerified && (
                <div className="p-3 bg-success-50 border border-success-200 rounded-xl flex items-center gap-2 text-success-700">
                  <CheckCircle2 className="w-5 h-5" />
                  <span className="font-medium">App verification completed!</span>
                </div>
              )}
            </div>

            {/* Divider */}
            <div className="border-t border-gray-200" />

            {/* Gmail */}
            <div>
              <Label className="text-sm font-semibold flex items-center gap-2 text-gray-800">
                <Mail className="w-4 h-4 text-brand-600" />
                Email Address <span className="text-gray-400 text-xs">(Optional)</span>
              </Label>
              <Input
                type="email"
                placeholder="example@gmail.com"
                value={formData.email}
                onChange={(e) => {
                  setFormData(prev => ({ ...prev, email: e.target.value }));
                  setEmailVerified(false);
                  setEmailVerifiedToken("");
                  setEmailOtpSent(false);
                  setEmailOtp("");
                }}
                className="mt-1.5"
                disabled={emailVerified}
              />
              {formData.email && !isValidEmail(formData.email) && (
                <p className="text-xs text-danger-500 mt-1">Please enter a valid email</p>
              )}
              {formData.email && isValidEmail(formData.email) && (
                <p className="text-xs text-success-500 mt-1">✓ Valid email</p>
              )}
              {formData.email && isValidEmail(formData.email) && !emailVerified && (
                <div className="mt-3 rounded-xl border border-brand-200 bg-brand-50 p-3 space-y-3">
                  {!emailOtpSent ? (
                    <Button onClick={sendEmailOtp} disabled={sendingEmailOtp} className="w-full bg-brand-600 hover:bg-brand-700">
                      {sendingEmailOtp ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Mail className="w-4 h-4 mr-2" />}
                      Send Email OTP
                    </Button>
                  ) : (
                    <>
                      <div className="flex items-center justify-between text-sm text-brand-700">
                        <span>Enter the 6-digit email code</span>
                        <span className="flex items-center gap-1 text-warning-600"><Timer className="w-3 h-3" />{Math.floor(emailOtpTimer / 60)}:{(emailOtpTimer % 60).toString().padStart(2, '0')}</span>
                      </div>
                      <InputOTP maxLength={6} value={emailOtp} onChange={setEmailOtp}>
                        <InputOTPGroup className="justify-center w-full">
                          {[0,1,2,3,4,5].map(i => <InputOTPSlot key={i} index={i} className="w-11 h-11 bg-white text-gray-900 border-gray-300" />)}
                        </InputOTPGroup>
                      </InputOTP>
                      <Button onClick={verifyEmailOtp} disabled={emailOtp.length !== 6 || verifyingEmailOtp || emailOtpTimer <= 0} className="w-full bg-success-600 hover:bg-success-700">
                        {verifyingEmailOtp ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <CheckCircle2 className="w-4 h-4 mr-2" />}
                        Verify Email OTP
                      </Button>
                    </>
                  )}
                </div>
              )}
              {emailVerified && (
                <div className="mt-2 p-3 bg-success-50 border border-success-200 rounded-xl flex items-center gap-2 text-success-700">
                  <CheckCircle2 className="w-5 h-5" />
                  <span className="font-medium">Email verified!</span>
                </div>
              )}
            </div>

            {/* Phone */}
            <div>
              <Label className="text-sm font-semibold flex items-center gap-2 text-gray-800">
                <Phone className="w-4 h-4 text-brand-600" />
                Phone Number <span className="text-danger-500">*</span>
              </Label>
              <Input
                type="tel"
                placeholder="01XXXXXXXXX"
                value={formData.phone}
                onChange={(e) => setFormData(prev => ({ ...prev, phone: e.target.value.replace(/[^0-9+]/g, "") }))}
                className="mt-1.5"
                maxLength={15}
              />
              {formData.phone && !isValidPhone(formData.phone) && (
                <p className="text-xs text-danger-500 mt-1">Please enter a valid phone number</p>
              )}
              {formData.phone && isValidPhone(formData.phone) && (
                <p className="text-xs text-success-500 mt-1">✓ Valid phone number</p>
              )}
            </div>

            {/* Error Message */}
            {errorMessage && (
              <div className="bg-danger-50 border border-danger-200 rounded-lg p-3 flex items-center gap-2">
                <AlertCircle className="w-4 h-4 text-danger-500 shrink-0" />
                <p className="text-sm text-danger-600">{errorMessage}</p>
              </div>
            )}

            {/* Submit Button */}
            <Button
              onClick={handleSubmit}
              disabled={formState === 'submitting' || !appVerified || !emailVerified}
              className="w-full h-12 bg-gradient-to-r from-brand-600 to-info-600 hover:from-brand-700 hover:to-info-700 text-white font-semibold rounded-xl mt-2"
            >
              {formState === 'submitting' ? (
                <>
                  <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                  Creating...
                </>
              ) : (
                <>
                  <Building2 className="w-5 h-5 mr-2" />
                  Create Sub-Agency
                </>
              )}
            </Button>
          </div>
        </div>

        {/* Benefits */}
        <div className="bg-white/10 backdrop-blur-sm rounded-2xl p-4 border border-white/15 mt-5">
          <h3 className="text-white font-semibold flex items-center gap-2 mb-3">
            <Crown className="w-5 h-5 text-warning-400" />
            Agency Benefits
          </h3>
          <ul className="space-y-2">
            <li className="flex items-center gap-2 text-slate-700 text-sm">
              <CheckCircle2 className="w-4 h-4 text-success-400 shrink-0" />
              <span>4-20% commission from host earnings</span>
            </li>
            <li className="flex items-center gap-2 text-slate-700 text-sm">
              <CheckCircle2 className="w-4 h-4 text-success-400 shrink-0" />
              <span>Unlimited hosts under your agency</span>
            </li>
            <li className="flex items-center gap-2 text-slate-700 text-sm">
              <CheckCircle2 className="w-4 h-4 text-success-400 shrink-0" />
              <span>Agency dashboard & analytics</span>
            </li>
            <li className="flex items-center gap-2 text-slate-700 text-sm">
              <CheckCircle2 className="w-4 h-4 text-success-400 shrink-0" />
              <span>Weekly automatic payments</span>
            </li>
          </ul>
        </div>
      </div>
    </div>
  );
};

export default BrowserAgencyForm;
