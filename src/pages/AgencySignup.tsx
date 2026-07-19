import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { 
  ArrowLeft, 
  Building2,
  Loader2,
  CheckCircle2,
  AlertCircle,
  User,
  Search,
  Send,
  Timer,
  Sparkles,
  Mail,
  Phone,
  MessageCircle
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { enhanceThumbnail } from "@/utils/enhanceThumbnail";
import { Badge } from "@/components/ui/badge";
import {
  InputOTP,
  InputOTPGroup,
  InputOTPSlot,
} from "@/components/ui/input-otp";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { recordClientError } from "@/utils/clientErrorLog";

interface UserProfile {
  id: string;
  display_name: string | null;
  avatar_url: string | null;
  username: string | null;
  user_level: number | null;
  is_host: boolean | null;
  app_uid: string | null;
}

const AgencySignup = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [isSubmitting, setIsSubmitting] = useState(false);
  
  const [formData, setFormData] = useState({
    agencyName: "",
    userId: "",
    email: "",
    phone: "",
    whatsapp: ""
  });

  const [searchingUser, setSearchingUser] = useState(false);
  const [foundUser, setFoundUser] = useState<UserProfile | null>(null);
  const [userNotFound, setUserNotFound] = useState(false);

  // Email OTP state
  const [emailOtp, setEmailOtp] = useState("");
  const [emailOtpSent, setEmailOtpSent] = useState(false);
  const [emailVerified, setEmailVerified] = useState(false);
  const [sendingEmailOtp, setSendingEmailOtp] = useState(false);
  const [emailOtpTimer, setEmailOtpTimer] = useState(0);
  const [verifyingEmailOtp, setVerifyingEmailOtp] = useState(false);

  // In-App Notification OTP state
  const [appOtp, setAppOtp] = useState("");
  const [appOtpSent, setAppOtpSent] = useState(false);
  const [appVerified, setAppVerified] = useState(false);
  const [appVerifiedToken, setAppVerifiedToken] = useState<string>("");
  const [sendingAppOtp, setSendingAppOtp] = useState(false);
  const [appOtpTimer, setAppOtpTimer] = useState(0);
  const [verifyingAppOtp, setVerifyingAppOtp] = useState(false);

  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (emailOtpTimer > 0) {
      interval = setInterval(() => {
        setEmailOtpTimer(prev => prev - 1);
      }, 1000);
    }
    return () => clearInterval(interval);
  }, [emailOtpTimer]);

  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (appOtpTimer > 0) {
      interval = setInterval(() => setAppOtpTimer(prev => prev - 1), 1000);
    }
    return () => clearInterval(interval);
  }, [appOtpTimer]);

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

  const resetAppOtpState = () => {
    setAppOtp("");
    setAppOtpSent(false);
    setAppVerified(false);
    setAppVerifiedToken("");
    setAppOtpTimer(0);
  };

  const sendAppOtp = async () => {
    if (!foundUser) return;

    setSendingAppOtp(true);
    setAppOtp("");
    setAppVerified(false);
    setAppVerifiedToken("");

    try {
      const { data, error } = await supabase.functions.invoke('agency-app-otp', {
        body: {
          action: 'send',
          userId: foundUser.id,
          purpose: 'agency_verification',
          context: formData.agencyName.trim() || 'Agency Registration'
        }
      });

      if (error) throw new Error(await getFunctionErrorMessage(error, "Failed to send notification OTP"));
      if (!data?.success) throw new Error(data?.error || "Failed to send notification OTP");

      toast({ title: "✅ OTP Sent!", description: `Check notifications in ${foundUser.display_name || 'user'}'s app` });
      setAppOtpSent(true);
      setAppOtpTimer(300);
    } catch (error: any) {
      toast({ title: "Error", description: error.message || "Failed to send notification OTP", variant: "destructive" });
    } finally {
      setSendingAppOtp(false);
    }
  };

  const verifyAppOtp = async () => {
    if (appOtp.length !== 6) return;

    setVerifyingAppOtp(true);
    try {
      const { data, error } = await supabase.functions.invoke('agency-app-otp', {
        body: { action: 'verify', userId: foundUser.id, code: appOtp, purpose: 'agency_verification' }
      });

      if (error) throw new Error(await getFunctionErrorMessage(error, "App OTP verification failed"));
      if (!data?.success || !data?.verified_token) throw new Error(data?.error || "App OTP verification failed");

      setAppVerified(true);
      setAppVerifiedToken(data.verified_token);
      toast({ title: "✅ App OTP Verified!", description: "In-app verification successful" });
    } catch (error: any) {
      toast({ title: "Error", description: error.message || "App OTP verification failed", variant: "destructive" });
    } finally {
      setVerifyingAppOtp(false);
    }
  };

  const searchUserById = async () => {
    if (!formData.userId.trim()) {
      toast({ title: "Error", description: "Please enter your App UID (e.g., LV1234567890)", variant: "destructive" });
      return;
    }

    setSearchingUser(true);
    setUserNotFound(false);
    setFoundUser(null);
    resetAppOtpState();

    try {
      const { data, error } = await supabase.rpc('search_user_by_app_uid', {
        _app_uid: formData.userId.trim().toUpperCase()
      });

      if (error) throw new Error(await getFunctionErrorMessage(error, "Verification failed"));

      if (data && data.length > 0) {
        const user = data[0];
        const { data: profileData } = await supabase
          .from("profiles")
          .select("agency_id, is_agency_owner")
          .eq("id", user.id)
          .maybeSingle();
        
        if (profileData?.agency_id) {
          toast({ title: "⚠️ User Already in Agency", description: "This user is already part of another agency.", variant: "destructive" });
          setUserNotFound(true);
          return;
        }
        
        if (profileData?.is_agency_owner) {
          toast({ title: "⚠️ Already Agency Owner", description: "This user already owns an agency", variant: "destructive" });
          setUserNotFound(true);
          return;
        }
        
        setFoundUser({
          id: user.id, display_name: user.display_name, avatar_url: user.avatar_url,
          username: user.username, user_level: null, is_host: user.is_host, app_uid: user.app_uid
        });
        toast({ title: "✅ User Found!", description: `${user.display_name || 'User'} is eligible for agency` });
      } else {
        setUserNotFound(true);
        toast({ title: "User Not Found", description: "Please enter a valid App UID", variant: "destructive" });
      }
    } catch (error) {
      console.error('Search error:', error);
      recordClientError({ label: "AgencySignup.user", message: error instanceof Error ? error.message : String(error) });
      setUserNotFound(true);
    } finally {
      setSearchingUser(false);
    }
  };

  // Email OTP functions
  const sendEmailOtp = async () => {
    if (!formData.email.trim() || !isValidEmail(formData.email)) {
      toast({ title: "Error", description: "Please enter a valid email address", variant: "destructive" });
      return;
    }

    setSendingEmailOtp(true);
    try {
      const { data, error } = await supabase.functions.invoke('send-email-otp', {
        body: { email: formData.email.trim().toLowerCase(), purpose: 'verify', context: 'agency_signup' }
      });

      if (error) throw error;
      if (data && !data.success) throw Object.assign(new Error(data.error || 'Failed to send OTP'), { code: data.code });

      toast({ title: "✅ OTP Sent!", description: `A 6-digit code has been sent to ${formData.email}` });
      setEmailOtpSent(true);
      setEmailOtpTimer(300); // 5 minutes
    } catch (error: any) {
      console.error('Email OTP error:', error);
      recordClientError({ label: "AgencySignup.sendEmailOtp", message: error instanceof Error ? error.message : String(error) });
      toast({ title: "Error", description: await getFunctionErrorMessage(error, "Failed to send email OTP"), variant: "destructive" });
    } finally {
      setSendingEmailOtp(false);
    }
  };

  const verifyEmailOtp = async () => {
    if (emailOtp.length !== 6) return;

    setVerifyingEmailOtp(true);
    try {
      const { data, error } = await supabase.functions.invoke('verify-email-otp', {
        body: { 
          email: formData.email.trim().toLowerCase(), 
          otp: emailOtp,
          purpose: 'verify' 
        }
      });

      if (error) throw error;
      if (!data?.success) {
        toast({ title: "Error", description: data?.error || "Verification failed", variant: "destructive" });
        return;
      }

      setEmailVerified(true);
      toast({ title: "✅ Email Verified!", description: "Your email has been verified successfully" });
    } catch (error: any) {
      toast({ title: "Error", description: error.message || "Verification failed", variant: "destructive" });
    } finally {
      setVerifyingEmailOtp(false);
    }
  };

  const isValidEmail = (email: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  const isValidPhone = (phone: string) => /^[0-9+\-\s]{10,15}$/.test(phone.replace(/\s/g, ''));
  const isValidWhatsApp = (num: string) => /^[0-9+\-\s]{10,15}$/.test(num.replace(/\s/g, ''));

  const isFormValid = formData.agencyName.trim() !== "" &&
    foundUser !== null &&
    appVerified &&
    (!formData.email.trim() || isValidEmail(formData.email)) &&
    (!formData.whatsapp.trim() || isValidWhatsApp(formData.whatsapp));

  const submitAgencyRegistration = async () => {
    if (!appVerified || !appVerifiedToken) {
      toast({ title: "App OTP required", description: "Please verify the in-app OTP first", variant: "destructive" });
      return;
    }

    setIsSubmitting(true);

    try {
      const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
      let agencyCode = "AG";
      for (let i = 0; i < 6; i++) {
        agencyCode += chars.charAt(Math.floor(Math.random() * chars.length));
      }

      const { data: existingAgency } = await supabase
        .from("agencies").select("id").eq("owner_id", foundUser!.id).maybeSingle();

      if (existingAgency) {
        toast({ title: "Error", description: "This user already owns an agency", variant: "destructive" });
        setIsSubmitting(false);
        return;
      }

      let signupLevel = "A1";
      let signupCommission = 3;
      const { data: helperCheck } = await supabase
        .from("topup_helpers").select("trader_level, payroll_enabled, is_verified, is_active")
        .eq("user_id", foundUser!.id).maybeSingle();
      
      if (helperCheck?.is_verified && helperCheck?.is_active && helperCheck?.trader_level === 5 && helperCheck?.payroll_enabled) {
        signupLevel = "A5";
        signupCommission = 20;
      }

      const { data: rpcResult, error: rpcError } = await supabase.rpc('create_agency_for_user', {
        _owner_id: foundUser!.id,
        _name: formData.agencyName.trim(),
        _agency_code: agencyCode,
        _level: signupLevel,
        _commission_rate: signupCommission,
        _email: formData.email.trim() || null,
        _whatsapp: formData.whatsapp.trim() || null,
        _verified_token: appVerifiedToken
      });

      if (rpcError) {
        console.error('[AgencySignup] create_agency_for_user rpcError:', rpcError);
        recordClientError({ label: "AgencySignup.chars", message: rpcError instanceof Error ? rpcError.message : String(rpcError) });
        throw rpcError;
      }
      
      const result = typeof rpcResult === 'string' ? JSON.parse(rpcResult) : rpcResult;
      console.log('[AgencySignup] create_agency_for_user result:', result);
      if (!result?.success) {
        throw new Error(result?.error || 'Failed to create agency');
      }

      // Send notification
      await supabase.functions.invoke('send-app-notification', {
        body: {
          userId: foundUser!.id,
          templateKey: 'agency_approved',
          variables: { agency_name: formData.agencyName.trim(), agency_code: agencyCode },
          type: 'agency_approved'
        }
      }).catch(console.error);

      toast({ title: "🎉 Agency Created Successfully!", description: `Your Agency Code: ${agencyCode}` });
      navigate('/agency');
    } catch (error: any) {
      toast({ title: "Error", description: error.message || "Failed to create agency", variant: "destructive" });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 flex flex-col bg-gradient-to-b from-slate-50 via-white to-slate-50">
      {/* Premium Header */}
      <header
        className="flex-shrink-0 sticky top-0 z-10 text-white safe-area-top"
        style={{
          background: 'linear-gradient(135deg,#6d28d9 0%,#7c3aed 45%,#4f46e5 100%)',
          boxShadow: '0 8px 24px -8px rgba(79,70,229,0.45), inset 0 -1px 0 rgba(255,255,255,0.12)',
        }}
      >
        <div className="flex items-center h-14 px-4">
          <button onClick={() => navigate(-1)} className="p-2 -ml-2 hover:bg-white/15 active:bg-white/25 rounded-full transition-colors">
            <ArrowLeft className="w-5 h-5" />
          </button>
          <h1 className="flex-1 text-center text-lg font-bold tracking-tight pr-7" style={{ textShadow: '0 1px 0 rgba(0,0,0,0.25)' }}>Agency Sign Up</h1>
        </div>
      </header>

      {/* Scrollable Content */}
      <div className="flex-1 overflow-y-auto overscroll-contain" style={{ WebkitOverflowScrolling: 'touch', paddingBottom: 'var(--content-bottom-padding)' }}>
        {/* Premium Hero */}
        <div
          className="mx-4 mt-4 rounded-3xl p-6 text-white relative overflow-hidden"
          style={{
            background: 'linear-gradient(135deg,#7c3aed 0%,#6366f1 50%,#3b82f6 100%)',
            boxShadow: '0 18px 40px -12px rgba(99,102,241,0.55), inset 0 1px 0 rgba(255,255,255,0.25), inset 0 -1px 0 rgba(0,0,0,0.15)',
          }}
        >
          <div className="absolute -top-12 -right-12 w-40 h-40 rounded-full bg-white/15 blur-3xl pointer-events-none" />
          <div className="absolute -bottom-10 -left-10 w-32 h-32 rounded-full bg-white/10 blur-2xl pointer-events-none" />
          <div className="relative flex items-center gap-3">
            <div
              className="w-12 h-12 rounded-2xl flex items-center justify-center"
              style={{ background: 'rgba(255,255,255,0.22)', boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.4), 0 4px 12px rgba(0,0,0,0.15)' }}
            >
              <Building2 className="w-6 h-6 drop-shadow" />
            </div>
            <div>
              <h2 className="text-xl font-black tracking-tight" style={{ textShadow: '0 1px 0 rgba(0,0,0,0.25)' }}>Agency Registration</h2>
              <p className="text-white/85 text-sm font-medium">Email Verified Registration</p>
            </div>
          </div>
        </div>

        {/* Premium Form Card */}
        <div
          className="mx-4 mt-4 bg-white rounded-3xl p-5 border border-slate-200 space-y-6"
          style={{ boxShadow: '0 10px 30px -12px rgba(15,23,42,0.12), 0 2px 6px -2px rgba(15,23,42,0.06), inset 0 1px 0 rgba(255,255,255,0.6)' }}
        >

          
          {/* Agency Name */}
          <div className="space-y-3">
            <Label className="text-sm font-semibold flex items-center gap-2 text-slate-800">
              <Building2 className="w-4 h-4 text-brand-500" />
              Agency Name <span className="text-danger-500">*</span>
            </Label>
            <Input placeholder="Enter your agency name" value={formData.agencyName}
              onChange={(e) => setFormData(prev => ({ ...prev, agencyName: e.target.value }))}
              className={`bg-white/80 border-slate-200 text-slate-800 placeholder:text-slate-400 ${formData.agencyName.trim() === "" ? '' : 'border-success-500 focus:border-success-400'}`} />
            {formData.agencyName.trim() !== "" && (
              <div className="flex items-center gap-1 text-success-600">
                <CheckCircle2 className="w-4 h-4" />
                <span className="text-xs">Agency name is valid</span>
              </div>
            )}
          </div>

          <div className="border-t border-slate-200" />

          {/* App UID */}
          <div className="space-y-3">
            <Label className="text-sm font-semibold flex items-center gap-2 text-slate-800">
              <User className="w-4 h-4 text-brand-500" />
              App UID <span className="text-danger-500">*</span>
            </Label>
            <div className="flex items-center gap-2">
              <Input placeholder="LV1234567890" value={formData.userId}
                onChange={(e) => { setFormData(prev => ({ ...prev, userId: e.target.value.toUpperCase() })); setFoundUser(null); setUserNotFound(false); setEmailVerified(false); setEmailOtpSent(false); setEmailOtp(""); }}
                className="flex-1 bg-white/80 border-slate-200 text-slate-800 placeholder:text-slate-400" disabled={emailVerified} />
              <Button variant="outline" onClick={searchUserById} disabled={searchingUser || emailVerified} className="shrink-0">
                {searchingUser ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
              </Button>
            </div>

            {foundUser && (
              <div className="p-3 bg-success-50 border border-success-200 rounded-xl">
                <div className="flex items-center gap-3">
                  <Avatar className="w-10 h-10 border-2 border-success-400">
                    <AvatarImage src={enhanceThumbnail(foundUser.avatar_url || undefined, { width: 96, quality: 82 })} />
                    <AvatarFallback className="bg-success-100 text-success-700">{foundUser.display_name?.charAt(0) || "U"}</AvatarFallback>
                  </Avatar>
                  <div className="flex-1">
                    <p className="font-semibold text-success-800">{foundUser.display_name || "Unknown User"}</p>
                    <p className="text-xs text-success-700">{foundUser.app_uid}</p>
                  </div>
                  {emailVerified ? <Badge className="bg-success-500 text-white">✓ Verified</Badge> : <CheckCircle2 className="w-5 h-5 text-success-600" />}
                </div>
              </div>
            )}

            {userNotFound && (
              <div className="p-3 bg-danger-50 border border-danger-200 rounded-xl flex items-center gap-2 text-danger-700">
                <AlertCircle className="w-5 h-5" />
                <span className="text-sm">User not found or not eligible for agency</span>
              </div>
            )}
          </div>

          {/* In-App Notification OTP (shown after user found) */}
          {foundUser && !appVerified && (
            <>
              <div className="border-t border-slate-200" />
              <div className="space-y-3">
                <Label className="text-sm font-semibold flex items-center gap-2 text-slate-800">
                  <MessageCircle className="w-4 h-4 text-warning-600" />
                  App Notification OTP <span className="text-danger-500">*</span>
                </Label>
                <div className="p-4 bg-warning-50 rounded-xl space-y-3 border border-warning-200">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium text-warning-800">Send OTP to App</span>
                    {!appOtpSent ? (
                      <Button size="sm" onClick={sendAppOtp} disabled={sendingAppOtp} className="bg-warning-600 hover:bg-warning-700 text-white">
                        {sendingAppOtp ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : <Send className="w-4 h-4 mr-1" />}
                        Send to App
                      </Button>
                    ) : (
                      <Badge className={`cursor-pointer text-white ${appOtpTimer > 0 ? 'bg-success-500' : 'bg-danger-500'}`}
                        onClick={() => { if (appOtpTimer <= 0) { setAppOtpSent(false); setAppOtp(""); } }}>
                        <Timer className="w-3 h-3 mr-1" />
                        {appOtpTimer > 0 ? `${Math.floor(appOtpTimer / 60)}:${(appOtpTimer % 60).toString().padStart(2, '0')}` : 'Resend'}
                      </Badge>
                    )}
                  </div>
                  {appOtpSent && (
                    <>
                      <div className="p-3 bg-warning-100 rounded-lg border border-warning-200">
                        <p className="text-xs text-warning-800 flex items-center gap-1">
                          <MessageCircle className="w-3 h-3" />
                          OTP sent to {foundUser.display_name || 'user'}'s in-app notifications
                        </p>
                      </div>
                      <div className="flex items-center gap-3">
                        <InputOTP maxLength={6} value={appOtp} onChange={(value) => setAppOtp(value)}>
                          <InputOTPGroup>
                            {[0,1,2,3,4,5].map(i => (
                              <InputOTPSlot key={i} index={i} className="bg-white text-slate-800" />
                            ))}
                          </InputOTPGroup>
                        </InputOTP>
                        <Button size="sm" onClick={verifyAppOtp} disabled={appOtp.length !== 6 || appOtpTimer <= 0 || verifyingAppOtp} className="bg-warning-600 hover:bg-warning-700 text-white">
                          {verifyingAppOtp ? <Loader2 className="w-4 h-4 animate-spin" /> : "Verify"}
                        </Button>
                      </div>
                    </>
                  )}
                </div>
              </div>
            </>
          )}

          {foundUser && appVerified && (
            <div className="p-3 bg-success-50 rounded-xl flex items-center gap-3 text-success-800 border border-success-200">
              <div className="w-8 h-8 bg-success-500 rounded-full flex items-center justify-center">
                <CheckCircle2 className="w-5 h-5 text-white" />
              </div>
              <div>
                <p className="font-semibold text-sm">App OTP Verified ✓</p>
                <p className="text-xs text-success-700">In-app notification verified</p>
              </div>
            </div>
          )}

          {foundUser && (
            <>
              <div className="border-t border-slate-200" />
              <div className="space-y-3">
                <Label className="text-sm font-semibold flex items-center gap-2 text-slate-800">
                  <Phone className="w-4 h-4 text-info-600" />
                  Phone Number <span className="text-slate-500 text-xs">(Optional)</span>
                </Label>
                <Input type="tel" placeholder="+880 1XXXXXXXXX" value={formData.phone}
                  onChange={(e) => setFormData(prev => ({ ...prev, phone: e.target.value }))}
                  className={`bg-white/80 border-slate-200 text-slate-800 placeholder:text-slate-400 ${formData.phone && !isValidPhone(formData.phone) ? 'border-danger-500' : formData.phone && isValidPhone(formData.phone) ? 'border-success-500' : ''}`} />
                {formData.phone && !isValidPhone(formData.phone) && <p className="text-xs text-danger-500">Enter a valid phone number (10-15 digits)</p>}
                {formData.phone && isValidPhone(formData.phone) && (
                  <div className="flex items-center gap-1 text-success-600">
                    <CheckCircle2 className="w-4 h-4" />
                    <span className="text-xs">Phone number is valid</span>
                  </div>
                )}
              </div>
            </>
          )}

          {/* Email (mandatory, with OTP verification) */}
          {foundUser && (
            <>
              <div className="border-t border-slate-200" />
              <div className="space-y-3">
                <Label className="text-sm font-semibold flex items-center gap-2 text-slate-800">
                  <Mail className="w-4 h-4 text-info-600" />
                  Email Address <span className="text-slate-500 text-xs">(Optional)</span>
                </Label>
                <div className="flex items-center gap-2">
                  <Input type="email" placeholder="example@gmail.com" value={formData.email}
                    onChange={(e) => { setFormData(prev => ({ ...prev, email: e.target.value })); setEmailVerified(false); setEmailOtpSent(false); setEmailOtp(""); }}
                    className={`flex-1 bg-white/80 border-slate-200 text-slate-800 placeholder:text-slate-400 ${formData.email && !isValidEmail(formData.email) ? 'border-danger-500' : emailVerified ? 'border-success-500' : ''}`}
                    disabled={emailVerified} />
                </div>
                {formData.email && !isValidEmail(formData.email) && <p className="text-xs text-danger-500">Enter a valid email address</p>}

                {/* Email OTP Section */}
                {formData.email && isValidEmail(formData.email) && !emailVerified && (
                  <div className="p-4 bg-info-50 rounded-xl space-y-3 border border-info-200">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Mail className="w-4 h-4 text-info-600" />
                        <span className="text-sm font-medium text-info-800">Email OTP Verification</span>
                      </div>
                      {!emailOtpSent ? (
                        <Button size="sm" onClick={sendEmailOtp} disabled={sendingEmailOtp} className="bg-info-600 hover:bg-info-700 text-white">
                          {sendingEmailOtp ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : <Send className="w-4 h-4 mr-1" />}
                          Send Code
                        </Button>
                      ) : (
                        <Badge className={`cursor-pointer text-white ${emailOtpTimer > 0 ? 'bg-success-500' : 'bg-danger-500'}`}
                          onClick={() => { if (emailOtpTimer <= 0) { setEmailOtpSent(false); setEmailOtp(""); } }}>
                          <Timer className="w-3 h-3 mr-1" />
                          {emailOtpTimer > 0 ? `${Math.floor(emailOtpTimer / 60)}:${(emailOtpTimer % 60).toString().padStart(2, '0')}` : 'Resend'}
                        </Badge>
                      )}
                    </div>
                    {emailOtpSent && (
                      <>
                        <div className="p-3 bg-info-100 rounded-lg border border-info-200">
                          <p className="text-xs text-info-800 flex items-center gap-1">
                            <Mail className="w-3 h-3" />
                            A 6-digit code has been sent to your email. Check your inbox/spam folder.
                          </p>
                        </div>
                        <div className="flex items-center gap-3">
                          <InputOTP maxLength={6} value={emailOtp} onChange={(value) => setEmailOtp(value)}>
                            <InputOTPGroup>
                              <InputOTPSlot index={0} className="bg-white text-slate-800" />
                              <InputOTPSlot index={1} className="bg-white text-slate-800" />
                              <InputOTPSlot index={2} className="bg-white text-slate-800" />
                              <InputOTPSlot index={3} className="bg-white text-slate-800" />
                              <InputOTPSlot index={4} className="bg-white text-slate-800" />
                              <InputOTPSlot index={5} className="bg-white text-slate-800" />
                            </InputOTPGroup>
                          </InputOTP>
                          <Button size="sm" onClick={verifyEmailOtp} disabled={emailOtp.length !== 6 || emailOtpTimer <= 0 || verifyingEmailOtp} className="bg-info-600 hover:bg-info-700 text-white">
                            {verifyingEmailOtp ? <Loader2 className="w-4 h-4 animate-spin" /> : "Verify"}
                          </Button>
                        </div>
                      </>
                    )}
                  </div>
                )}

                {emailVerified && (
                  <div className="p-3 bg-success-50 rounded-xl flex items-center gap-3 text-success-800 border border-success-200">
                    <div className="w-8 h-8 bg-success-500 rounded-full flex items-center justify-center">
                      <CheckCircle2 className="w-5 h-5 text-white" />
                    </div>
                    <div>
                      <p className="font-semibold text-sm">Email Verified ✓</p>
                      <p className="text-xs text-success-700">{formData.email}</p>
                    </div>
                  </div>
                )}
              </div>
            </>
          )}

          {/* WhatsApp Number */}
          {appVerified && (

            <>
              <div className="border-t border-slate-200" />
              <div className="space-y-3">
                <Label className="text-sm font-semibold flex items-center gap-2 text-slate-800">
                  <svg className="w-4 h-4 text-success-600" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
                  </svg>
                  WhatsApp Number <span className="text-slate-500 text-xs">(Optional)</span>
                </Label>
                <Input type="tel" placeholder="+880 1XXXXXXXXX" value={formData.whatsapp}
                  onChange={(e) => setFormData(prev => ({ ...prev, whatsapp: e.target.value }))}
                  className={`bg-white/80 border-slate-200 text-slate-800 placeholder:text-slate-400 ${formData.whatsapp && !isValidWhatsApp(formData.whatsapp) ? 'border-danger-500' : formData.whatsapp && isValidWhatsApp(formData.whatsapp) ? 'border-success-500' : ''}`} />
                {formData.whatsapp && !isValidWhatsApp(formData.whatsapp) && <p className="text-xs text-danger-500">Enter a valid WhatsApp number (10-15 digits)</p>}
                {formData.whatsapp && isValidWhatsApp(formData.whatsapp) && (
                  <div className="flex items-center gap-1 text-success-600">
                    <CheckCircle2 className="w-4 h-4" />
                    <span className="text-xs">WhatsApp number is valid</span>
                  </div>
                )}
              </div>
            </>
          )}
        </div>

        {/* Submit */}
        <div className="mx-4 mt-6 mb-8">
          <Button onClick={() => {
            if (!formData.agencyName.trim()) {
              toast({ title: "⚠️ Agency Name Required", description: "Please scroll up and enter your agency name", variant: "destructive" });
              // Scroll to top to show agency name field
              window.scrollTo({ top: 0, behavior: 'smooth' });
              return;
            }
            if (!foundUser) {
              toast({ title: "⚠️ App UID Required", description: "Please search and find your App UID", variant: "destructive" });
              return;
            }
            if (!emailVerified) {
              toast({ title: "⚠️ Email Verification Required", description: "Please verify your email address first", variant: "destructive" });
              return;
            }
            submitAgencyRegistration();
          }} disabled={isSubmitting}
            className={`w-full h-14 text-lg ${isFormValid 
              ? 'bg-gradient-to-r from-brand-600 to-info-600 hover:from-brand-700 hover:to-info-700' 
              : 'bg-gradient-to-r from-brand-600/50 to-info-600/50'}`}>
            {isSubmitting ? <Loader2 className="w-5 h-5 animate-spin mr-2" /> : <Sparkles className="w-5 h-5 mr-2" />}
            Create Agency
          </Button>
          {!isFormValid && (
            <p className="text-center text-xs text-slate-500 mt-2">
              {!formData.agencyName.trim() ? "⬆️ Enter agency name (scroll up)"
                : !foundUser ? "Search and find your App UID"
                : !emailVerified ? "Verify your email address" 
                : "Fill all required fields"}
            </p>
          )}
        </div>

        {/* Instructions */}
        <div className="mx-4 mb-8 bg-warning-50 rounded-2xl p-4 border border-warning-200">
          <h3 className="font-semibold text-warning-800 mb-2">📋 Instructions</h3>
          <ul className="text-sm text-warning-800 space-y-2">
            {[
              "Enter agency name",
              "Enter your App UID and search",
              "Enter phone number (optional)",
              "Enter email address (mandatory)",
              "Click 'Send Code' and verify email OTP",
              "Enter WhatsApp number (optional)",
              "Click Create Agency button"
            ].map((text, i) => (
              <li key={i} className="flex items-start gap-2">
                <span className="bg-warning-200 text-warning-800 rounded-full w-5 h-5 flex items-center justify-center text-xs font-semibold shrink-0">{i + 1}</span>
                <span>{text}</span>
              </li>
            ))}
          </ul>
          <div className="mt-3 p-2 bg-warning-100 rounded-lg border border-warning-200">
            <p className="text-xs text-warning-800 flex items-center gap-1">
              <Timer className="w-3 h-3" /> Email OTP is valid for 5 minutes
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AgencySignup;
