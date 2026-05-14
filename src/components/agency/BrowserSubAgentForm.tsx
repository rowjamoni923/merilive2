import { useState, useEffect } from "react";
import { 
  Building2,
  Loader2,
  CheckCircle2,
  AlertCircle,
  Sparkles,
  Download,
  PartyPopper,
  User,
  Phone,
  Crown,
  Users,
  ArrowRight,
  Search,
  Mail,
  Bell,
  Timer,
  Link as LinkIcon
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

interface BrowserSubAgentFormProps {
  agencyCode: string;
}

interface Agency {
  id: string;
  name: string;
  level: string;
  logo_url: string | null;
  agency_code: string;
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

/**
 * Browser-based Sub-Agent Registration Form
 * 
 * Full verification system matching BrowserAgencyForm:
 * 1. App UID search & verification
 * 2. In-app OTP verification
 * 3. Email + Phone collection
 * 4. Parent agency code prominently displayed
 */
const BrowserSubAgentForm = ({ agencyCode }: BrowserSubAgentFormProps) => {
  useEnableBrowserPageInteraction();
  const [formState, setFormState] = useState<FormState>('form');
  const [errorMessage, setErrorMessage] = useState<string>("");
  
  const [formData, setFormData] = useState({
    userId: "",
    name: "",
    email: "",
    phone: ""
  });
  
  const [agency, setAgency] = useState<Agency | null>(null);
  const [loadingAgency, setLoadingAgency] = useState(true);

  // User lookup
  const [searchingUser, setSearchingUser] = useState(false);
  const [foundUser, setFoundUser] = useState<UserProfile | null>(null);
  const [userNotFound, setUserNotFound] = useState(false);

  // App verification
  const [appCode, setAppCode] = useState("");
  const [generatedAppCode, setGeneratedAppCode] = useState("");
  const [appVerified, setAppVerified] = useState(false);
  const [sendingAppCode, setSendingAppCode] = useState(false);
  const [appCodeSent, setAppCodeSent] = useState(false);
  const [appCodeTimer, setAppCodeTimer] = useState(0);

  // Fetch agency details
  useEffect(() => {
    const fetchAgency = async () => {
      setLoadingAgency(true);
      try {
        const normalizedCode = agencyCode.trim().toUpperCase();
        const { data, error } = await supabase
          .from('agencies_public')
          .select('id, name, level, logo_url, agency_code')
          .eq('agency_code', normalizedCode)
          .maybeSingle();
        
        if (!data && !error) {
          // Fuzzy match (0↔O, 1↔I confusion)
          const fuzzyCode = normalizedCode.replace(/O/g, '0').replace(/I/g, '1').replace(/L/g, '1');
          const { data: fuzzyData } = await supabase
            .from('agencies_public')
            .select('id, name, level, logo_url, agency_code')
            .limit(50);
          
          const match = fuzzyData?.find(a => 
            a.agency_code.replace(/O/g, '0').replace(/I/g, '1').replace(/L/g, '1') === fuzzyCode
          );
          
          if (match) {
            setAgency({
              id: match.id,
              name: match.name,
              level: match.level || 'A1',
              logo_url: match.logo_url || null,
              agency_code: match.agency_code
            });
          }
        } else if (data) {
          setAgency({
            id: data.id,
            name: data.name,
            level: data.level || 'A1',
            logo_url: data.logo_url || null,
            agency_code: data.agency_code
          });
        }
      } catch (error) {
        console.error('[BrowserSubAgentForm] Error fetching agency:', error);
      }
      setLoadingAgency(false);
    };

    fetchAgency();
  }, [agencyCode]);

  // Timer countdown
  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (appCodeTimer > 0) {
      interval = setInterval(() => {
        setAppCodeTimer(prev => prev - 1);
      }, 1000);
    }
    return () => clearInterval(interval);
  }, [appCodeTimer]);

  const generateVerificationCode = () => {
    return Math.floor(1000 + Math.random() * 9000).toString();
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
        
        // Check if user already owns an agency (they can still be a sub-agent)
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

  // Send app verification code
  const sendAppVerificationCode = async () => {
    if (!foundUser) {
      setErrorMessage("Please find a user first");
      return;
    }

    setSendingAppCode(true);
    setErrorMessage("");
    const code = generateVerificationCode();
    setGeneratedAppCode(code);

    try {
      const { error } = await supabase.functions.invoke('send-app-notification', {
        body: {
          userId: foundUser.id,
          templateKey: 'agency_verification_code',
          variables: {
            code: code,
            agency_name: agency?.name || 'Sub-Agent Registration'
          },
          type: 'agency_verification'
        }
      });

      if (error) throw error;

      setAppCodeSent(true);
      setAppCodeTimer(60);
    } catch (error: any) {
      console.error('App notification error:', error);
      setErrorMessage(error.message || "Failed to send verification code");
    } finally {
      setSendingAppCode(false);
    }
  };

  const verifyAppCode = () => {
    if (appCodeTimer <= 0) {
      setErrorMessage("Code expired. Please resend the verification code.");
      return;
    }
    
    if (appCode === generatedAppCode) {
      setAppVerified(true);
      setErrorMessage("");
    } else {
      setErrorMessage("Wrong code. Please enter the correct code.");
    }
  };

  const isValidEmail = (email: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  const isValidPhone = (phone: string) => /^[0-9+\-\s]{10,15}$/.test(phone.replace(/\s/g, ''));

  const handleSubmit = async () => {
    if (!appVerified) {
      setErrorMessage("Please complete app verification first");
      return;
    }
    if (!formData.name.trim()) {
      setErrorMessage("Please enter your name");
      return;
    }
    if (!formData.email.trim() || !isValidEmail(formData.email)) {
      setErrorMessage("Please enter a valid email address");
      return;
    }
    if (!formData.phone.trim() || !isValidPhone(formData.phone)) {
      setErrorMessage("Please enter a valid phone number");
      return;
    }
    if (!agency) {
      setErrorMessage("Agency not found");
      return;
    }

    setFormState('submitting');
    setErrorMessage("");

    try {
      const pendingSubAgent = {
        agencyId: agency.id,
        agencyCode: agency.agency_code,
        agencyName: agency.name,
        userId: foundUser?.id,
        userName: formData.name.trim(),
        email: formData.email.trim(),
        phone: formData.phone.trim(),
        appUid: foundUser?.app_uid,
        createdAt: new Date().toISOString()
      };
      
      localStorage.setItem("meri_pending_subagent_join", JSON.stringify(pendingSubAgent));
      localStorage.setItem("meri_referral_code", agency.agency_code);
      
      localStorage.setItem("meri_pending_deep_link", JSON.stringify({
        path: `/become-sub-agent?agency=${agency.agency_code}`,
        agency: agency.agency_code,
        timestamp: Date.now()
      }));

      setFormState('success');

    } catch (error: any) {
      console.error('[BrowserSubAgentForm] Submit error:', error);
      setErrorMessage(error.message || "Something went wrong, please try again");
      setFormState('error');
    }
  };

  const tryOpenApp = () => {
    const deepLinkPath = `become-sub-agent?ref=${agencyCode}`;
    const customSchemeUrl = `merilive://${deepLinkPath}`;
    const intentUrl = `intent://${deepLinkPath}#Intent;scheme=merilive;package=com.merilive.app;S.browser_fallback_url=${encodeURIComponent(PLAY_STORE_URL)};end`;
    
    const isAndroid = /android/i.test(navigator.userAgent);
    
    if (isAndroid) {
      window.location.href = intentUrl;
    } else {
      window.location.href = customSchemeUrl;
    }
  };

  // Loading
  if (loadingAgency) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-danger-50 via-brand-800 to-warning-50 flex flex-col items-center justify-center p-6">
        <img src={meriliveLogo} alt="MeriLive" className="w-20 h-20 mb-4 animate-pulse" />
        <Loader2 className="w-8 h-8 text-white animate-spin" />
        <p className="text-slate-600 text-sm mt-3">Loading...</p>
      </div>
    );
  }

  // Agency not found
  if (!agency) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-danger-900 via-danger-800 to-warning-900 flex flex-col items-center justify-center p-6">
        <img src={meriliveLogo} alt="MeriLive" className="w-20 h-20 mb-4" />
        <AlertCircle className="w-12 h-12 text-white mb-4" />
        <h1 className="text-xl font-bold text-white mb-2">Agency Not Found</h1>
        <p className="text-slate-600 text-center text-sm">
          No agency found with code "{agencyCode}".
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
      <div className="min-h-screen bg-gradient-to-br from-success-800 via-success-700 to-success-800 flex flex-col items-center justify-center p-6">
        <div className="bg-white/10 backdrop-blur-lg rounded-3xl p-8 max-w-sm w-full text-center border border-warning-200/60">
          <div className="w-20 h-20 bg-gradient-to-br from-success-400 to-success-500 rounded-full flex items-center justify-center mx-auto mb-4">
            <PartyPopper className="w-10 h-10 text-white" />
          </div>
          
          <h1 className="text-2xl font-bold text-white mb-2">
            🎉 Registration Complete!
          </h1>
          <p className="text-slate-700 mb-4">
            You are now registered as a Sub-Agent of <strong>{agency.name}</strong>
          </p>
          
          <div className="bg-white/20 rounded-xl p-4 mb-4">
            <p className="text-slate-500 text-xs mb-1">Agency Code</p>
            <p className="text-2xl font-mono font-bold text-white">{agency.agency_code}</p>
          </div>
          
          <div className="bg-warning-500/20 rounded-xl p-3 mb-6 border border-warning-400/30">
            <p className="text-warning-200 text-sm">
              ⚠️ Open the app to access your agency dashboard.
            </p>
          </div>
          
          <div className="space-y-3">
            <Button
              onClick={tryOpenApp}
              className="w-full h-12 bg-gradient-to-r from-brand-500 to-info-600 hover:from-brand-600 hover:to-info-700 text-white font-semibold rounded-xl"
            >
              <ArrowRight className="w-5 h-5 mr-2" />
              Open App
            </Button>
            
            <Button
              onClick={() => window.location.href = PLAY_STORE_URL}
              className="w-full h-12 bg-gradient-to-r from-success-500 to-success-600 hover:from-success-600 hover:to-success-700 text-white font-semibold rounded-xl"
            >
              <Download className="w-5 h-5 mr-2" />
              Download from Play Store
            </Button>
            
            <Button
              onClick={() => window.location.href = APK_DOWNLOAD_URL}
              variant="outline"
              className="w-full h-11 border-warning-200/60 text-white hover:bg-white/10 rounded-xl"
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
    <div className="min-h-[100dvh] bg-gradient-to-br from-danger-50 via-brand-800 to-warning-50 py-6 px-4 safe-area-inset overflow-x-hidden">
      <div className="max-w-md mx-auto">
        {/* Header */}
        <div className="text-center mb-6">
          <img src={meriliveLogo} alt="MeriLive" className="w-16 h-16 mx-auto mb-3" />
          <h1 className="text-2xl font-bold text-white">Become Sub-Agent</h1>
          <p className="text-slate-500 text-sm mt-1">Verify your identity and join the agency</p>
        </div>

        {/* Agency Info Card with Parent Code */}
        <div className="bg-white/10 backdrop-blur-sm rounded-2xl p-4 border border-warning-200/60 mb-5">
          <div className="flex items-center gap-3">
            {agency.logo_url ? (
              <img 
                src={agency.logo_url} 
                alt={agency.name}
                className="w-14 h-14 rounded-xl object-cover"
              />
            ) : (
              <div className="w-14 h-14 rounded-xl bg-gradient-to-br from-brand-500 to-info-600 flex items-center justify-center">
                <Building2 className="w-7 h-7 text-white" />
              </div>
            )}
            <div className="flex-1">
              <p className="text-slate-500 text-xs">Parent Agency</p>
              <h3 className="text-white font-bold text-lg">{agency.name}</h3>
              <div className="flex items-center gap-2 mt-1">
                <Badge className="bg-warning-500/20 text-warning-300 border-warning-400/30 text-xs">
                  <Crown className="w-3 h-3 mr-1" />
                  Level {agency.level}
                </Badge>
                <span className="text-slate-500 text-xs font-mono">{agency.agency_code}</span>
              </div>
            </div>
            <a
              href={PLAY_STORE_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="shrink-0"
            >
              <img 
                src={googlePlayBadge} 
                alt="Get it on Google Play" 
                className="w-[120px] h-auto rounded-lg hover:opacity-90 transition-opacity"
              />
            </a>
          </div>
          
          <div className="mt-3 pt-3 border-t border-warning-200/60">
            <p className="text-brand-300 text-sm text-center">
              <Sparkles className="w-4 h-4 inline mr-1 text-warning-400" />
              Join as a Sub-Agent of this agency
            </p>
          </div>
        </div>

        {/* Form Card - White background like BrowserAgencyForm */}
        <div className="bg-white rounded-2xl p-5 shadow-xl">
          <div className="space-y-5">

            {/* ===== STEP 1: App UID Verification ===== */}
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
                        maxLength={4}
                        value={appCode}
                        onChange={(value) => setAppCode(value)}
                      >
                        <InputOTPGroup className="gap-2 justify-center w-full">
                          <InputOTPSlot index={0} className="w-12 h-12 text-lg rounded-lg bg-white text-gray-900 border-gray-300" />
                          <InputOTPSlot index={1} className="w-12 h-12 text-lg rounded-lg bg-white text-gray-900 border-gray-300" />
                          <InputOTPSlot index={2} className="w-12 h-12 text-lg rounded-lg bg-white text-gray-900 border-gray-300" />
                          <InputOTPSlot index={3} className="w-12 h-12 text-lg rounded-lg bg-white text-gray-900 border-gray-300" />
                        </InputOTPGroup>
                      </InputOTP>
                      
                      <Button
                        onClick={verifyAppCode}
                        disabled={appCode.length < 4}
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

            {/* ===== STEP 2: Personal Info ===== */}
            {/* Name */}
            <div>
              <Label className="text-sm font-semibold flex items-center gap-2 text-gray-800">
                <User className="w-4 h-4 text-brand-600" />
                Your Name <span className="text-danger-500">*</span>
              </Label>
              <Input
                placeholder="Your full name"
                value={formData.name}
                onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
                className="mt-1.5"
                maxLength={50}
              />
            </div>

            {/* Email */}
            <div>
              <Label className="text-sm font-semibold flex items-center gap-2 text-gray-800">
                <Mail className="w-4 h-4 text-brand-600" />
                Email Address <span className="text-danger-500">*</span>
              </Label>
              <Input
                type="email"
                placeholder="example@gmail.com"
                value={formData.email}
                onChange={(e) => setFormData(prev => ({ ...prev, email: e.target.value }))}
                className="mt-1.5"
              />
              {formData.email && !isValidEmail(formData.email) && (
                <p className="text-xs text-danger-500 mt-1">Please enter a valid email</p>
              )}
              {formData.email && isValidEmail(formData.email) && (
                <p className="text-xs text-success-500 mt-1">✓ Valid email</p>
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
              disabled={formState === 'submitting' || !appVerified}
              className="w-full h-12 bg-gradient-to-r from-brand-600 to-info-600 hover:from-brand-700 hover:to-info-700 text-white font-semibold rounded-xl mt-2"
            >
              {formState === 'submitting' ? (
                <>
                  <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                  Processing...
                </>
              ) : (
                <>
                  <Users className="w-5 h-5 mr-2" />
                  Join as Sub-Agent
                </>
              )}
            </Button>
          </div>
        </div>

        {/* Benefits */}
        <div className="bg-white/10 backdrop-blur-sm rounded-2xl p-4 border border-warning-200/60 mt-5">
          <h3 className="text-white font-semibold flex items-center gap-2 mb-3">
            <Crown className="w-5 h-5 text-warning-400" />
            Sub-Agent Benefits
          </h3>
          <ul className="space-y-2">
            <li className="flex items-center gap-2 text-slate-700 text-sm">
              <CheckCircle2 className="w-4 h-4 text-success-400 shrink-0" />
              <span>Earn commission from host earnings</span>
            </li>
            <li className="flex items-center gap-2 text-slate-700 text-sm">
              <CheckCircle2 className="w-4 h-4 text-success-400 shrink-0" />
              <span>Recruit hosts under your agency</span>
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

export default BrowserSubAgentForm;
