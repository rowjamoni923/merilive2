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
  const [generatedAppCode, setGeneratedAppCode] = useState("");
  const [appVerified, setAppVerified] = useState(false);
  const [sendingAppCode, setSendingAppCode] = useState(false);
  const [appCodeSent, setAppCodeSent] = useState(false);
  const [appCodeTimer, setAppCodeTimer] = useState(0);

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

  // Generate 4-digit code
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
    const code = generateVerificationCode();
    setGeneratedAppCode(code);

    try {
      const { error } = await supabase.functions.invoke('send-app-notification', {
        body: {
          userId: foundUser.id,
          templateKey: 'agency_verification_code',
          variables: {
            code: code,
            agency_name: 'Sub-Agency Registration'
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

  // Verify app code
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

  // Validate email format
  const isValidEmail = (email: string) => {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  };

  // Validate phone format
  const isValidPhone = (phone: string) => {
    return /^[0-9+\-\s]{10,15}$/.test(phone.replace(/\s/g, ''));
  };

  const handleSubmit = async () => {
    // Validation
    if (!formData.agencyName.trim()) {
      setErrorMessage("Please enter agency name");
      return;
    }
    if (!appVerified) {
      setErrorMessage("Please complete app verification first");
      return;
    }
    if (!formData.email.trim() || !isValidEmail(formData.email)) {
      setErrorMessage("Please enter a valid Gmail address");
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
          email: formData.email.trim(),
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
      <div className="min-h-screen bg-gradient-to-br from-purple-900 via-purple-800 to-indigo-900 flex flex-col items-center justify-center p-6">
        <img src={meriliveLogo} alt="MeriLive" className="w-20 h-20 mb-4 animate-pulse" />
        <Loader2 className="w-8 h-8 text-white animate-spin" />
        <p className="text-white/70 text-sm mt-3">Loading...</p>
      </div>
    );
  }

  // Parent agency not found
  if (!parentAgency) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-red-900 via-red-800 to-orange-900 flex flex-col items-center justify-center p-6">
        <img src={meriliveLogo} alt="MeriLive" className="w-20 h-20 mb-4" />
        <AlertCircle className="w-12 h-12 text-white mb-4" />
        <h1 className="text-xl font-bold text-white mb-2">Agency Not Found</h1>
        <p className="text-white/70 text-center text-sm">
          No agency found with code "{parentAgencyCode}".
        </p>
        <Button
          onClick={() => window.location.href = PLAY_STORE_URL}
          className="mt-6 bg-white text-red-700 hover:bg-white/90"
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
      <div className="min-h-screen bg-gradient-to-br from-green-800 via-emerald-700 to-teal-800 flex flex-col items-center justify-center p-6">
        <div className="bg-white/10 backdrop-blur-lg rounded-3xl p-8 max-w-sm w-full text-center border border-white/20">
          <div className="w-20 h-20 bg-gradient-to-br from-green-400 to-emerald-500 rounded-full flex items-center justify-center mx-auto mb-4">
            <PartyPopper className="w-10 h-10 text-white" />
          </div>
          
          <h1 className="text-2xl font-bold text-white mb-2">
            🎉 Congratulations!
          </h1>
          <p className="text-white/80 mb-4">
            Your sub-agency has been created successfully!
          </p>
          
          <div className="bg-white/20 rounded-xl p-4 mb-6">
            <p className="text-white/60 text-xs mb-1">Your Agency Code</p>
            <p className="text-2xl font-mono font-bold text-white">{createdAgencyCode}</p>
          </div>
          
          <div className="bg-amber-500/20 rounded-xl p-3 mb-6 border border-amber-400/30">
            <p className="text-amber-200 text-sm">
              ⚠️ Open the app to access your agency dashboard.
            </p>
          </div>
          
          <div className="space-y-3">
            <Button
              onClick={() => window.location.href = PLAY_STORE_URL}
              className="w-full h-12 bg-gradient-to-r from-green-500 to-emerald-600 hover:from-green-600 hover:to-emerald-700 text-white font-semibold rounded-xl"
            >
              <Download className="w-5 h-5 mr-2" />
              Download from Play Store
            </Button>
            
            <Button
              onClick={() => window.location.href = APK_DOWNLOAD_URL}
              variant="outline"
              className="w-full h-11 border-white/30 text-white hover:bg-white/10 rounded-xl"
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
    <div className="min-h-[100dvh] bg-gradient-to-br from-purple-900 via-purple-800 to-indigo-900 py-6 px-4 safe-area-inset overflow-x-hidden">
      <div className="max-w-md mx-auto">
        {/* Header */}
        <div className="text-center mb-6">
          <img src={meriliveLogo} alt="MeriLive" className="w-16 h-16 mx-auto mb-3" />
          <h1 className="text-2xl font-bold text-white">Create Sub-Agency</h1>
          <p className="text-white/60 text-sm mt-1">Fill the form and start your agency</p>
        </div>

        {/* Parent Agency Info */}
        <div className="bg-white/10 backdrop-blur-sm rounded-2xl p-4 border border-white/20 mb-5">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 bg-gradient-to-br from-purple-500 to-indigo-600 rounded-xl flex items-center justify-center">
                <LinkIcon className="w-6 h-6 text-white" />
              </div>
              <div className="flex-1">
                <p className="text-white/60 text-xs">Parent Agency</p>
                <p className="text-white font-semibold">{parentAgency.name}</p>
                <div className="flex items-center gap-2 mt-1">
                  <Badge className="bg-purple-500/30 text-purple-200 text-xs border-purple-400/30">
                    {parentAgency.level}
                  </Badge>
                  <span className="text-white/50 text-xs font-mono">{parentAgencyCode}</span>
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
            <p className="text-purple-300 text-xs mt-3">
              ✨ Join this agency as a Sub-Agent
            </p>
        </div>

        {/* Form Card */}
        <div className="bg-white rounded-2xl p-5 shadow-xl">
          <div className="space-y-5">
            {/* Agency Name */}
            <div>
              <Label className="text-sm font-semibold flex items-center gap-2 text-gray-800">
                <Building2 className="w-4 h-4 text-purple-600" />
                Agency Name <span className="text-red-500">*</span>
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
                <User className="w-4 h-4 text-purple-600" />
                App UID - Verification <span className="text-red-500">*</span>
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
                <div className="p-3 bg-green-50 border border-green-200 rounded-xl">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-green-200 rounded-full flex items-center justify-center text-green-700 font-bold">
                      {foundUser.display_name?.charAt(0) || "U"}
                    </div>
                    <div className="flex-1">
                      <p className="font-semibold text-green-800">
                        {foundUser.display_name || "Unknown User"}
                      </p>
                      <p className="text-xs text-green-600">{foundUser.app_uid}</p>
                    </div>
                    {appVerified ? (
                      <Badge className="bg-green-500 text-white">✓ Verified</Badge>
                    ) : (
                      <CheckCircle2 className="w-5 h-5 text-green-500" />
                    )}
                  </div>
                </div>
              )}

              {userNotFound && (
                <div className="p-3 bg-red-50 border border-red-200 rounded-xl flex items-center gap-2 text-red-600">
                  <AlertCircle className="w-5 h-5" />
                  <span className="text-sm">User not found or not eligible</span>
                </div>
              )}

              {/* App OTP Section */}
              {foundUser && !appVerified && (
                <div className="bg-purple-50 rounded-xl p-4 border border-purple-200 space-y-3">
                  <div className="flex items-center gap-2 text-purple-700">
                    <Bell className="w-4 h-4" />
                    <span className="font-medium text-sm">App Notification Verification</span>
                  </div>
                  
                  {!appCodeSent ? (
                    <Button
                      onClick={sendAppVerificationCode}
                      disabled={sendingAppCode}
                      className="w-full bg-purple-600 hover:bg-purple-700"
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
                        <span className="text-purple-600">Enter code from app notification</span>
                        {appCodeTimer > 0 ? (
                          <span className="flex items-center gap-1 text-amber-600">
                            <Timer className="w-3 h-3" />
                            {appCodeTimer}s
                          </span>
                        ) : (
                          <Button
                            variant="link"
                            size="sm"
                            onClick={sendAppVerificationCode}
                            disabled={sendingAppCode}
                            className="text-purple-600 p-0 h-auto"
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
                        className="w-full bg-green-600 hover:bg-green-700"
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
                <div className="p-3 bg-green-50 border border-green-200 rounded-xl flex items-center gap-2 text-green-700">
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
                <Mail className="w-4 h-4 text-purple-600" />
                Email Address <span className="text-red-500">*</span>
              </Label>
              <Input
                type="email"
                placeholder="example@gmail.com"
                value={formData.email}
                onChange={(e) => setFormData(prev => ({ ...prev, email: e.target.value }))}
                className="mt-1.5"
              />
              {formData.email && !isValidEmail(formData.email) && (
                <p className="text-xs text-red-500 mt-1">Please enter a valid email</p>
              )}
              {formData.email && isValidEmail(formData.email) && (
                <p className="text-xs text-green-500 mt-1">✓ Valid email</p>
              )}
            </div>

            {/* Phone */}
            <div>
              <Label className="text-sm font-semibold flex items-center gap-2 text-gray-800">
                <Phone className="w-4 h-4 text-purple-600" />
                Phone Number <span className="text-red-500">*</span>
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
                <p className="text-xs text-red-500 mt-1">Please enter a valid phone number</p>
              )}
              {formData.phone && isValidPhone(formData.phone) && (
                <p className="text-xs text-green-500 mt-1">✓ Valid phone number</p>
              )}
            </div>

            {/* Error Message */}
            {errorMessage && (
              <div className="bg-red-50 border border-red-200 rounded-lg p-3 flex items-center gap-2">
                <AlertCircle className="w-4 h-4 text-red-500 shrink-0" />
                <p className="text-sm text-red-600">{errorMessage}</p>
              </div>
            )}

            {/* Submit Button */}
            <Button
              onClick={handleSubmit}
              disabled={formState === 'submitting' || !appVerified}
              className="w-full h-12 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700 text-white font-semibold rounded-xl mt-2"
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
        <div className="bg-white/10 backdrop-blur-sm rounded-2xl p-4 border border-white/20 mt-5">
          <h3 className="text-white font-semibold flex items-center gap-2 mb-3">
            <Crown className="w-5 h-5 text-amber-400" />
            Agency Benefits
          </h3>
          <ul className="space-y-2">
            <li className="flex items-center gap-2 text-white/80 text-sm">
              <CheckCircle2 className="w-4 h-4 text-green-400 shrink-0" />
              <span>4-20% commission from host earnings</span>
            </li>
            <li className="flex items-center gap-2 text-white/80 text-sm">
              <CheckCircle2 className="w-4 h-4 text-green-400 shrink-0" />
              <span>Unlimited hosts under your agency</span>
            </li>
            <li className="flex items-center gap-2 text-white/80 text-sm">
              <CheckCircle2 className="w-4 h-4 text-green-400 shrink-0" />
              <span>Agency dashboard & analytics</span>
            </li>
            <li className="flex items-center gap-2 text-white/80 text-sm">
              <CheckCircle2 className="w-4 h-4 text-green-400 shrink-0" />
              <span>Weekly automatic payments</span>
            </li>
          </ul>
        </div>
      </div>
    </div>
  );
};

export default BrowserAgencyForm;
