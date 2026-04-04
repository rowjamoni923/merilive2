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
  Shield,
  Send,
  Timer,
  Bell,
  Sparkles,
  Mail,
  MessageCircle
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import {
  InputOTP,
  InputOTPGroup,
  InputOTPSlot,
} from "@/components/ui/input-otp";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";

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
    whatsapp: ""
  });

  const [searchingUser, setSearchingUser] = useState(false);
  const [foundUser, setFoundUser] = useState<UserProfile | null>(null);
  const [userNotFound, setUserNotFound] = useState(false);

  const [appCode, setAppCode] = useState("");
  const [generatedAppCode, setGeneratedAppCode] = useState("");
  const [appVerified, setAppVerified] = useState(false);
  const [sendingAppCode, setSendingAppCode] = useState(false);
  const [appCodeSent, setAppCodeSent] = useState(false);
  const [appCodeTimer, setAppCodeTimer] = useState(0);

  const generateVerificationCode = () => {
    return Math.floor(1000 + Math.random() * 9000).toString();
  };

  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (appCodeTimer > 0) {
      interval = setInterval(() => {
        setAppCodeTimer(prev => prev - 1);
      }, 1000);
    }
    return () => clearInterval(interval);
  }, [appCodeTimer]);

  const searchUserById = async () => {
    if (!formData.userId.trim()) {
      toast({ title: "Error", description: "Please enter your App UID (e.g., LV1234567890)", variant: "destructive" });
      return;
    }

    setSearchingUser(true);
    setUserNotFound(false);
    setFoundUser(null);

    try {
      const { data, error } = await supabase.rpc('search_user_by_app_uid', {
        _app_uid: formData.userId.trim().toUpperCase()
      });

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
      setUserNotFound(true);
    } finally {
      setSearchingUser(false);
    }
  };

  const sendAppVerificationCode = async () => {
    if (!foundUser) {
      toast({ title: "Error", description: "Please find a user first", variant: "destructive" });
      return;
    }

    setSendingAppCode(true);
    const code = generateVerificationCode();
    setGeneratedAppCode(code);

    try {
      const { error } = await supabase.functions.invoke('send-app-notification', {
        body: {
          userId: foundUser.id,
          templateKey: 'agency_verification_code',
          variables: { code, agency_name: 'Agency Registration' },
          type: 'agency_verification'
        }
      });
      if (error) throw error;
      toast({ title: "✅ Code Sent", description: "A 4-digit verification code has been sent to your app notifications." });
      setAppCodeSent(true);
      setAppCodeTimer(60);
    } catch (error: any) {
      toast({ title: "Error", description: error.message || "Failed to send verification code", variant: "destructive" });
    } finally {
      setSendingAppCode(false);
    }
  };

  const verifyAppCode = () => {
    if (appCodeTimer <= 0) {
      toast({ title: "Code Expired", description: "Please resend the verification code", variant: "destructive" });
      return;
    }
    if (appCode === generatedAppCode) {
      setAppVerified(true);
      toast({ title: "✅ Verification Successful!", description: "You can now create your agency" });
    } else {
      toast({ title: "Wrong Code", description: "Please enter the correct code", variant: "destructive" });
    }
  };

  const isValidEmail = (email: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  const isValidWhatsApp = (num: string) => /^[0-9+\-\s]{10,15}$/.test(num.replace(/\s/g, ''));

  const isFormValid = formData.agencyName.trim() !== "" &&
    appVerified && 
    (!formData.email.trim() || isValidEmail(formData.email)) && 
    (!formData.whatsapp.trim() || isValidWhatsApp(formData.whatsapp));

  const submitAgencyRegistration = async () => {
    if (!appVerified) {
      toast({ title: "Verification Required", description: "Please complete app verification first", variant: "destructive" });
      return;
    }
    if (formData.email.trim() && !isValidEmail(formData.email)) {
      toast({ title: "Invalid Email", description: "Please enter a valid email address", variant: "destructive" });
      return;
    }
    if (formData.whatsapp.trim() && !isValidWhatsApp(formData.whatsapp)) {
      toast({ title: "Invalid WhatsApp", description: "Please enter a valid WhatsApp number", variant: "destructive" });
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
        signupCommission = 12;
      }

      const { data: rpcResult, error: rpcError } = await supabase.rpc('create_agency_for_user', {
        _owner_id: foundUser!.id,
        _name: formData.agencyName.trim(),
        _agency_code: agencyCode,
        _level: signupLevel,
        _commission_rate: signupCommission,
        _email: formData.email.trim() || null,
        _whatsapp: formData.whatsapp.trim() || null
      });

      if (rpcError) throw rpcError;
      
      const result = typeof rpcResult === 'string' ? JSON.parse(rpcResult) : rpcResult;
      if (!result?.success) {
        throw new Error(result?.error || 'Failed to create agency');
      }

      const newAgencyId = result.agency_id;

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
    <div className="fixed inset-0 flex flex-col bg-slate-950">
      {/* Header */}
      <header className="flex-shrink-0 sticky top-0 z-10 bg-gradient-to-r from-purple-600 to-indigo-600 text-white safe-area-top">
        <div className="flex items-center h-14 px-4">
          <button onClick={() => navigate(-1)} className="p-2 -ml-2 hover:bg-white/10 rounded-full transition-colors">
            <ArrowLeft className="w-5 h-5" />
          </button>
          <h1 className="flex-1 text-center text-lg font-semibold pr-7">Agency Sign Up</h1>
        </div>
      </header>

      {/* Scrollable Content */}
      <div className="flex-1 overflow-y-auto overscroll-contain" style={{ WebkitOverflowScrolling: 'touch', paddingBottom: 'var(--content-bottom-padding)' }}>
        {/* Hero */}
        <div className="mx-4 mt-4 bg-gradient-to-br from-purple-600 to-indigo-600 rounded-2xl p-6 text-white">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 bg-white/20 rounded-xl flex items-center justify-center">
              <Building2 className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-xl font-bold">Agency Registration</h2>
              <p className="text-white/80 text-sm">App Notification Verification</p>
            </div>
          </div>
        </div>

        {/* Form */}
        <div className="mx-4 mt-4 bg-slate-900/80 rounded-2xl p-5 shadow-sm border border-slate-700/50 space-y-6">
          
          {/* Agency Name */}
          <div className="space-y-3">
            <Label className="text-sm font-semibold flex items-center gap-2 text-white">
              <Building2 className="w-4 h-4 text-purple-400" />
              Agency Name <span className="text-red-400">*</span>
            </Label>
            <Input placeholder="Enter your agency name" value={formData.agencyName}
              onChange={(e) => setFormData(prev => ({ ...prev, agencyName: e.target.value }))}
              className={`bg-slate-800 border-slate-600 text-white placeholder:text-slate-400 ${formData.agencyName.trim() === "" ? '' : 'border-green-500 focus:border-green-400'}`} />
            {formData.agencyName.trim() !== "" && (
              <div className="flex items-center gap-1 text-green-600">
                <CheckCircle2 className="w-4 h-4" />
                <span className="text-xs">Agency name is valid</span>
              </div>
            )}
          </div>

          <div className="border-t border-slate-700" />

          {/* App UID */}
          <div className="space-y-3">
            <Label className="text-sm font-semibold flex items-center gap-2 text-white">
              <User className="w-4 h-4 text-purple-400" />
              App UID - App Notification Verification <span className="text-red-400">*</span>
            </Label>
            <div className="flex items-center gap-2">
              <Input placeholder="LV1234567890" value={formData.userId}
                onChange={(e) => { setFormData(prev => ({ ...prev, userId: e.target.value.toUpperCase() })); setFoundUser(null); setUserNotFound(false); setAppVerified(false); setAppCodeSent(false); setAppCode(""); }}
                className="flex-1 bg-slate-800 border-slate-600 text-white placeholder:text-slate-400" disabled={appVerified} />
              <Button variant="outline" onClick={searchUserById} disabled={searchingUser || appVerified} className="shrink-0">
                {searchingUser ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
              </Button>
            </div>

            {foundUser && (
              <div className="p-3 bg-green-900/30 border border-green-700/50 rounded-xl">
                <div className="flex items-center gap-3">
                  <Avatar className="w-10 h-10 border-2 border-green-300">
                    <AvatarImage src={foundUser.avatar_url || undefined} />
                    <AvatarFallback className="bg-green-800 text-green-300">{foundUser.display_name?.charAt(0) || "U"}</AvatarFallback>
                  </Avatar>
                  <div className="flex-1">
                    <p className="font-semibold text-green-300">{foundUser.display_name || "Unknown User"}</p>
                    <p className="text-xs text-green-400">{foundUser.app_uid}</p>
                  </div>
                  {appVerified ? <Badge className="bg-green-500 text-white">✓ Verified</Badge> : <CheckCircle2 className="w-5 h-5 text-green-500" />}
                </div>
              </div>
            )}

            {userNotFound && (
              <div className="p-3 bg-red-900/30 border border-red-700/50 rounded-xl flex items-center gap-2 text-red-400">
                <AlertCircle className="w-5 h-5" />
                <span className="text-sm">User not found or not eligible for agency</span>
              </div>
            )}

            {/* App OTP */}
            {foundUser && !appVerified && (
              <div className="p-4 bg-purple-900/30 rounded-xl space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Bell className="w-4 h-4 text-purple-400" />
                    <span className="text-sm font-medium text-purple-300">App Notification OTP</span>
                  </div>
                  {!appCodeSent ? (
                    <Button size="sm" onClick={sendAppVerificationCode} disabled={sendingAppCode} className="bg-purple-600 hover:bg-purple-700">
                      {sendingAppCode ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : <Send className="w-4 h-4 mr-1" />}
                      Send Code
                    </Button>
                  ) : (
                    <Badge className={`cursor-pointer ${appCodeTimer > 0 ? 'bg-green-500' : 'bg-red-500'}`}
                      onClick={() => { if (appCodeTimer <= 0) { setAppCodeSent(false); setAppCode(""); } }}>
                      <Timer className="w-3 h-3 mr-1" />
                      {appCodeTimer > 0 ? `${appCodeTimer}s` : 'Resend'}
                    </Badge>
                  )}
                </div>
                {appCodeSent && (
                  <>
                    <div className="p-3 bg-blue-900/30 rounded-lg border border-blue-700/50">
                      <p className="text-xs text-blue-300 flex items-center gap-1">
                        <Bell className="w-3 h-3" />
                        A 4-digit code has been sent to your app notifications.
                      </p>
                    </div>
                    <div className="flex items-center gap-3">
                      <InputOTP maxLength={4} value={appCode} onChange={(value) => setAppCode(value)}>
                        <InputOTPGroup>
                          <InputOTPSlot index={0} className="bg-slate-800 text-white border-slate-600" />
                          <InputOTPSlot index={1} className="bg-slate-800 text-white border-slate-600" />
                          <InputOTPSlot index={2} className="bg-slate-800 text-white border-slate-600" />
                          <InputOTPSlot index={3} className="bg-slate-800 text-white border-slate-600" />
                        </InputOTPGroup>
                      </InputOTP>
                      <Button size="sm" onClick={verifyAppCode} disabled={appCode.length !== 4 || appCodeTimer <= 0} className="bg-purple-600 hover:bg-purple-700">
                        Verify
                      </Button>
                    </div>
                  </>
                )}
              </div>
            )}

            {appVerified && (
              <div className="p-4 bg-green-900/30 rounded-xl flex items-center gap-3 text-green-300">
                <div className="w-10 h-10 bg-green-500 rounded-full flex items-center justify-center">
                  <CheckCircle2 className="w-6 h-6 text-white" />
                </div>
                <div>
                  <p className="font-semibold">App UID Verification Complete ✓</p>
                  <p className="text-xs text-green-400">Now enter Gmail and WhatsApp number</p>
                </div>
              </div>
            )}
          </div>

          {appVerified && <div className="border-t border-slate-700" />}

          {/* Gmail */}
          {appVerified && (
            <div className="space-y-3">
              <Label className="text-sm font-semibold flex items-center gap-2 text-white">
                <Mail className="w-4 h-4 text-blue-400" />
                Gmail <span className="text-slate-500 text-xs">(Optional)</span>
              </Label>
              <Input type="email" placeholder="example@gmail.com" value={formData.email}
                onChange={(e) => setFormData(prev => ({ ...prev, email: e.target.value }))}
                className={`bg-slate-800 border-slate-600 text-white placeholder:text-slate-400 ${formData.email && !isValidEmail(formData.email) ? 'border-red-500 focus:border-red-400' : ''}`} />
              {formData.email && !isValidEmail(formData.email) && <p className="text-xs text-red-500">Enter a valid Gmail address</p>}
              {formData.email && isValidEmail(formData.email) && (
                <div className="flex items-center gap-1 text-green-600">
                  <CheckCircle2 className="w-4 h-4" />
                  <span className="text-xs">Gmail is valid</span>
                </div>
              )}
            </div>
          )}

          {/* WhatsApp Number */}
          {appVerified && (
            <div className="space-y-3">
              <Label className="text-sm font-semibold flex items-center gap-2 text-white">
                <svg className="w-4 h-4 text-green-400" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
                </svg>
                WhatsApp Number <span className="text-slate-500 text-xs">(Optional)</span>
              </Label>
              <Input type="tel" placeholder="+880 1XXXXXXXXX" value={formData.whatsapp}
                onChange={(e) => setFormData(prev => ({ ...prev, whatsapp: e.target.value }))}
                className={`bg-slate-800 border-slate-600 text-white placeholder:text-slate-400 ${formData.whatsapp && !isValidWhatsApp(formData.whatsapp) ? 'border-red-500 focus:border-red-400' : ''}`} />
              {formData.whatsapp && !isValidWhatsApp(formData.whatsapp) && <p className="text-xs text-red-500">Enter a valid WhatsApp number (10-15 digits)</p>}
              {formData.whatsapp && isValidWhatsApp(formData.whatsapp) && (
                <div className="flex items-center gap-1 text-green-600">
                  <CheckCircle2 className="w-4 h-4" />
                  <span className="text-xs">WhatsApp number is valid</span>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Submit */}
        <div className="mx-4 mt-6 mb-8">
          <Button onClick={submitAgencyRegistration} disabled={!isFormValid || isSubmitting}
            className="w-full h-14 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700 text-lg">
            {isSubmitting ? <Loader2 className="w-5 h-5 animate-spin mr-2" /> : <Sparkles className="w-5 h-5 mr-2" />}
            Create Agency
          </Button>
          {!isFormValid && (
            <p className="text-center text-xs text-slate-400 mt-2">
              {!formData.agencyName.trim() ? "Enter agency name"
                : !appVerified ? "Complete app verification" 
                : "Fill all required fields"}
            </p>
          )}
        </div>

        {/* Instructions */}
        <div className="mx-4 mb-8 bg-amber-900/20 rounded-2xl p-4 border border-amber-700/30">
          <h3 className="font-semibold text-amber-300 mb-2">📋 Instructions</h3>
          <ul className="text-sm text-amber-200/80 space-y-2">
            {["Enter agency name", "Enter your App UID and search", "Click 'Send Code' to receive OTP in notifications", "Verify with the code", "Enter Gmail and WhatsApp number", "Click Create Agency button"].map((text, i) => (
              <li key={i} className="flex items-start gap-2">
                <span className="bg-amber-700/50 text-amber-200 rounded-full w-5 h-5 flex items-center justify-center text-xs shrink-0">{i + 1}</span>
                <span>{text}</span>
              </li>
            ))}
          </ul>
          <div className="mt-3 p-2 bg-amber-800/30 rounded-lg">
            <p className="text-xs text-amber-300/80 flex items-center gap-1">
              <Timer className="w-3 h-3" /> Code is valid for 60 seconds
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AgencySignup;
