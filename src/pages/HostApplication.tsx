import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { 
  ArrowLeft, 
  User, 
  Phone, 
  Mail, 
  Camera, 
  Upload, 
  CheckCircle2,
  AlertCircle,
  Info,
  Search,
  Loader2,
  Send,
  Shield,
  Sparkles
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import AvatarWithFrame from "@/components/common/AvatarWithFrame";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { Checkbox } from "@/components/ui/checkbox";
import {
  InputOTP,
  InputOTPGroup,
  InputOTPSlot,
} from "@/components/ui/input-otp";
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

const HostApplication = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [step, setStep] = useState<'form' | 'verification' | 'success'>('form');
  
  // Form data
  const [userId, setUserId] = useState("");
  const [email, setEmail] = useState("");
  
  // User lookup
  const [searchingUser, setSearchingUser] = useState(false);
  const [foundUser, setFoundUser] = useState<UserProfile | null>(null);
  const [userNotFound, setUserNotFound] = useState(false);
  
  // Two-step verification (App first, then Email)
  const [verificationStep, setVerificationStep] = useState<1 | 2>(1);
  const [appCode, setAppCode] = useState("");
  const [emailCode, setEmailCode] = useState("");
  const [generatedAppCode, setGeneratedAppCode] = useState("");
  const [generatedEmailCode, setGeneratedEmailCode] = useState("");
  const [appCodeSent, setAppCodeSent] = useState(false);
  const [emailCodeSent, setEmailCodeSent] = useState(false);
  const [sendingAppCode, setSendingAppCode] = useState(false);
  const [sendingEmailCode, setSendingEmailCode] = useState(false);
  const [appVerified, setAppVerified] = useState(false);
  const [emailVerified, setEmailVerified] = useState(false);
  
  // Terms
  const [agreeTerms, setAgreeTerms] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Generate verification code
  const generateVerificationCode = () => {
    return Math.floor(100000 + Math.random() * 900000).toString();
  };

  // Search user by App UID
  const searchUserById = async () => {
    if (!userId.trim()) {
      toast({
        title: "Error",
        description: "Enter App UID (e.g., LV1234567890)",
        variant: "destructive",
      });
      return;
    }

    setSearchingUser(true);
    setUserNotFound(false);
    setFoundUser(null);

    try {
      // Search by app_uid using the RPC function
      const { data, error } = await supabase.rpc('search_user_by_app_uid', {
        _app_uid: userId.trim().toUpperCase()
      });

      if (data && data.length > 0) {
        const user = data[0];
        // Check if already a host
        const { data: profileData } = await supabase
          .from("profiles")
          .select("is_host")
          .eq("id", user.id)
          .maybeSingle();

        if (profileData?.is_host) {
          toast({
          });
          setUserNotFound(true);
        } else {
          setFoundUser({
            id: user.id,
            display_name: user.display_name,
            avatar_url: user.avatar_url,
            username: user.username,
            user_level: null,
            is_host: user.is_host,
            app_uid: user.app_uid
          });
        }
      } else {
        setUserNotFound(true);
      }
    } catch (error) {
      console.error('Search error:', error);
      recordClientError({ label: "HostApplication.user", message: error instanceof Error ? error.message : String(error) });
      setUserNotFound(true);
    } finally {
      setSearchingUser(false);
    }
  };

  // Send App verification code (Step 1)
  const sendAppVerificationCode = async () => {
    if (!foundUser) {
      toast({
      });
      return;
    }

    setSendingAppCode(true);
    const code = generateVerificationCode();
    setGeneratedAppCode(code);

    try {
      // Send in-app notification
      const { error } = await supabase.functions.invoke('send-app-notification', {
        body: {
          userId: foundUser.id,
          templateKey: 'agency_verification_code',
          variables: {
            code: code,
            agency_name: 'Host Application'
          },
          type: 'host_verification'
        }
      });

      if (error) throw error;

      toast({
      });
      setAppCodeSent(true);
      setStep('verification');
    } catch (error: any) {
      console.error('Notification error:', error);
      recordClientError({ label: "HostApplication.code", message: error instanceof Error ? error.message : String(error) });
      toast({
      });
    } finally {
      setSendingAppCode(false);
    }
  };

  // Verify app code - then move to email step
  const verifyAppCode = () => {
    if (appCode === generatedAppCode) {
      setAppVerified(true);
      setVerificationStep(2);
      toast({
      });
    } else {
      toast({
      });
    }
  };

  // Send Email verification code (Step 2)
  const sendEmailVerificationCode = async () => {
    if (!email.trim()) {
      toast({
      });
      return;
    }

    setSendingEmailCode(true);
    const code = generateVerificationCode();
    setGeneratedEmailCode(code);

    try {
      const { error } = await supabase.functions.invoke('send-verification-email', {
          email: email.trim(),
          agencyName: foundUser?.display_name || 'Host Application',
        }
      });

      if (error) throw error;

      toast({
      });
      setEmailCodeSent(true);
    } catch (error: any) {
      console.error('Email error:', error);
      recordClientError({ label: "HostApplication.code", message: error instanceof Error ? error.message : String(error) });
      toast({
      });
    } finally {
      setSendingEmailCode(false);
    }
  };

  // Verify email code
  const verifyEmailCode = () => {
    if (emailCode === generatedEmailCode) {
      setEmailVerified(true);
      toast({
      });
    } else {
      toast({
      });
    }
  };

  // Submit application
  const handleSubmit = async () => {
    if (!appVerified || !emailVerified) {
      toast({
      });
      return;
    }

    if (!agreeTerms) {
      toast({
      });
      return;
    }

    setIsSubmitting(true);

    try {
      // Update user profile to make them a host
      const { error } = await supabase
        .from("profiles")
        .update({
          host_status: 'approved'
        })
        .eq("id", foundUser!.id);

      if (error) throw error;

      // Send success notification
      await supabase.functions.invoke('send-app-notification', {
          },
        }
      });

      setStep('success');
      toast({
      });

    } catch (error: any) {
      toast({
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  // Resend app code
  const resendAppCode = async () => {
    setAppCode("");
    await sendAppVerificationCode();
  };

  // Resend email code
  const resendEmailCode = async () => {
    setEmailCode("");
    await sendEmailVerificationCode();
  };

  const requirements = [
    "Must be at least 18 years old",
    "Clear profile photo required",
    "Minimum 10 hours live streaming per week",
    "Must follow community guidelines",
  ];

  // Success view
  if (step === 'success') {
    return (
      <div className="fixed inset-0 flex flex-col bg-background overflow-y-auto overflow-x-hidden">
        <div className="sticky top-0 z-10 bg-gradient-to-r from-pink-500 to-purple-600 text-white">
          <div className="flex items-center h-14 px-4">
            <h1 className="flex-1 text-center text-lg font-semibold">Success!</h1>
          </div>
        </div>

        <div className="flex-1 flex flex-col items-center justify-center p-8 text-center">
          <div className="w-24 h-24 bg-gradient-to-br from-green-400 to-green-600 rounded-full flex items-center justify-center mb-6">
            <CheckCircle2 className="w-12 h-12 text-slate-800" />
          </div>
          <h2 className="text-2xl font-bold text-foreground mb-2">Congratulations! 🎉</h2>
          <p className="text-muted-foreground mb-6">
            {foundUser?.display_name || 'User'} is now registered as a host!
          </p>
          <Button
            onClick={() => navigate('/agency')}
            className="bg-gradient-to-r from-pink-500 to-purple-600"
          >
            Go to Agency Page
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 flex flex-col bg-background overflow-y-auto overflow-x-hidden">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-gradient-to-r from-pink-500 to-purple-600 text-white">
        <div className="flex items-center h-14 px-4">
          <button 
            onClick={() => step === 'form' ? navigate(-1) : setStep('form')}
            className="p-2 -ml-2 hover:bg-white/10 rounded-full transition-colors"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <h1 className="flex-1 text-center text-lg font-semibold pr-7">Host Application</h1>
        </div>
      </div>

      {/* Banner */}
      <div className="bg-gradient-to-r from-pink-500 to-purple-600 text-white px-4 pb-6 pt-2">
        <div className="text-center">
          <h2 className="text-xl font-bold mb-1">Join as a Host!</h2>
          <p className="text-slate-700 text-sm">Earn money by live streaming</p>
        </div>
      </div>

      {step === 'form' && (
        <>
          {/* Requirements */}
          <div className="mx-4 -mt-4 bg-white/5 backdrop-blur-sm rounded-2xl p-4 shadow-sm border border-amber-200/60">
            <div className="flex items-center gap-2 mb-3">
              <Info className="w-5 h-5 text-purple-500" />
              <h3 className="font-semibold">Requirements</h3>
            </div>
            <div className="space-y-2">
              {requirements.map((req, index) => (
                <div key={index} className="flex items-start gap-2">
                  <CheckCircle2 className="w-4 h-4 text-green-500 mt-0.5 shrink-0" />
                  <span className="text-sm text-muted-foreground">{req}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Application Form */}
          <div className="mx-4 mt-4 bg-white/5 backdrop-blur-sm rounded-2xl p-4 shadow-sm border border-amber-200/60">
            <h3 className="font-semibold mb-4">Application Form</h3>
            
            <div className="space-y-4">
              {/* User UID */}
              <div>
                <Label className="text-sm font-medium flex items-center gap-2">
                  <User className="w-4 h-4 text-purple-600" />
                  App UID Number *
                </Label>
                <p className="text-xs text-muted-foreground mb-1.5">Enter the App UID of the user who wants to become a host (e.g., LV1234567890)</p>
                <div className="flex gap-2">
                  <Input
                    placeholder="LV1234567890"
                    value={userId}
                    onChange={(e) => {
                      setUserId(e.target.value.toUpperCase());
                      setFoundUser(null);
                      setUserNotFound(false);
                    }}
                    className="flex-1"
                  />
                  <Button
                    variant="outline"
                    onClick={searchUserById}
                    disabled={searchingUser}
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
                  <div className="mt-3 p-3 bg-green-50 border border-green-200 rounded-xl">
                    <div className="flex items-center gap-3">
                <AvatarWithFrame
                  src={foundUser.avatar_url || undefined}
                  name={(foundUser as any)?.display_name || (foundUser as any)?.agency_name || (foundUser as any)?.name || "U"}
                  level={1}
                  size="sm"
                  showFrame={true}
                  showAnimation={false}
                />
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <p className="font-semibold">{foundUser.display_name || "User"}</p>
                          <Badge variant="outline" className="text-xs bg-green-100 text-green-700 border-green-300">
                            ✓ Found
                          </Badge>
                        </div>
                        <p className="text-xs text-gray-500 font-mono">{foundUser.app_uid}</p>
                      </div>
                    </div>
                  </div>
                )}

                {/* User Not Found */}
                {userNotFound && (
                  <div className="mt-3 p-3 bg-red-50 border border-red-200 rounded-xl flex items-center gap-2">
                    <AlertCircle className="w-5 h-5 text-red-500" />
                    <p className="text-sm text-red-600">User not found</p>
                  </div>
                )}
              </div>

              {/* Email */}
              <div>
                <Label className="text-sm font-medium flex items-center gap-2">
                  <Mail className="w-4 h-4 text-purple-600" />
                  Email (Optional)
                </Label>
                <Input
                  placeholder="your@email.com"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="mt-1.5"
                />
              </div>

              {/* Verification Info */}
              {foundUser && (
                <div className="bg-purple-50 border border-purple-200 rounded-xl p-4">
                  <div className="flex items-start gap-3">
                    <Shield className="w-5 h-5 text-purple-500 flex-shrink-0 mt-0.5" />
                    <div>
                      <p className="font-medium text-purple-800 text-sm">Verification Process</p>
                      <p className="text-xs text-purple-600 mt-1">
                        Click "Send Code to App" to send a verification code to {foundUser.display_name}'s app. Enter the code here to complete host registration.
                      </p>
                    </div>
                  </div>
                </div>
              )}

              {/* Terms */}
              <div className="flex items-start gap-2 pt-2">
                <Checkbox 
                  id="terms" 
                  checked={agreeTerms}
                  onCheckedChange={(checked) => setAgreeTerms(checked as boolean)}
                />
                <label htmlFor="terms" className="text-sm text-gray-600 leading-tight cursor-pointer">
                  I have read and agree to the <span className="text-purple-600 font-medium">Host Agreement</span> and <span className="text-purple-600 font-medium">Community Guidelines</span>
                </label>
              </div>
            </div>
          </div>

          {/* Benefits Section */}
          <div className="mx-4 mt-4 bg-gradient-to-br from-purple-50 to-pink-50 rounded-2xl p-4 border border-purple-100">
            <h3 className="font-semibold mb-3 text-purple-800">Host Benefits</h3>
            <div className="grid grid-cols-2 gap-3">
              <div className="bg-white rounded-xl p-3 text-center">
                <span className="text-2xl">💰</span>
                <p className="text-xs text-gray-600 mt-1">Earn from Gifts</p>
              </div>
              <div className="bg-white rounded-xl p-3 text-center">
                <span className="text-2xl">🎁</span>
                <p className="text-xs text-gray-600 mt-1">Bonus Programs</p>
              </div>
              <div className="bg-white rounded-xl p-3 text-center">
                <span className="text-2xl">📈</span>
                <p className="text-xs text-gray-600 mt-1">Promotion Support</p>
              </div>
              <div className="bg-white rounded-xl p-3 text-center">
                <span className="text-2xl">🏆</span>
                <p className="text-xs text-gray-600 mt-1">Exclusive Events</p>
              </div>
            </div>
          </div>
        </>
      )}

      {step === 'verification' && (
        <div className="mx-4 mt-4">
          {/* User Info Card */}
          <div className="bg-white rounded-2xl p-4 shadow-sm border mb-4">
            <div className="flex items-center gap-3">
                <AvatarWithFrame
                  src={foundUser?.avatar_url || undefined}
                  name={(foundUser as any)?.display_name || (foundUser as any)?.agency_name || (foundUser as any)?.name || "U"}
                  level={1}
                  size="md"
                  showFrame={true}
                  showAnimation={false}
                />
              <div>
                <p className="font-semibold">{foundUser?.display_name || "User"}</p>
                <p className="text-xs text-gray-500">Level {foundUser?.user_level || 0}</p>
              </div>
            </div>
          </div>

          {/* Verification Code Input */}
          <div className="bg-white rounded-2xl p-6 shadow-sm border">
            <div className="text-center mb-6">
              <div className="w-16 h-16 bg-gradient-to-br from-purple-500 to-pink-500 rounded-full flex items-center justify-center mx-auto mb-4">
                <Shield className="w-8 h-8 text-slate-800" />
              </div>
              
              <h3 className="font-bold text-lg">Two-Step Verification</h3>
              <p className="text-sm text-gray-600 mt-1">
                First verify app, then email
              </p>
              {/* Progress bar */}
              <div className="flex gap-2 mt-4">
                <div className={`flex-1 h-1.5 rounded-full ${appVerified ? 'bg-green-500' : 'bg-purple-300'}`} />
                <div className={`flex-1 h-1.5 rounded-full ${emailVerified ? 'bg-green-500' : 'bg-purple-200'}`} />
              </div>
            </div>

            {/* Step 1: App Verification */}
            {verificationStep === 1 && (
              <div className="bg-purple-50 rounded-xl p-4 border border-purple-200">
                <div className="flex items-center gap-2 mb-3">
                  <div className="w-8 h-8 rounded-full bg-purple-500 text-slate-800 flex items-center justify-center text-sm font-bold">1</div>
                  <h4 className="font-semibold text-purple-800">App Verification</h4>
                </div>
                <p className="text-xs text-purple-600 mb-4">
                  📱 Enter the 6-digit code sent to {foundUser?.display_name}'s app
                </p>
                <div className="flex justify-center mb-4">
                  <InputOTP
                    maxLength={6}
                    value={appCode}
                    onChange={(value) => setAppCode(value)}
                  >
                    <InputOTPGroup>
                      <InputOTPSlot index={0} className="bg-white text-gray-900 border-gray-300" />
                      <InputOTPSlot index={1} className="bg-white text-gray-900 border-gray-300" />
                      <InputOTPSlot index={2} className="bg-white text-gray-900 border-gray-300" />
                      <InputOTPSlot index={3} className="bg-white text-gray-900 border-gray-300" />
                      <InputOTPSlot index={4} className="bg-white text-gray-900 border-gray-300" />
                      <InputOTPSlot index={5} className="bg-white text-gray-900 border-gray-300" />
                    </InputOTPGroup>
                  </InputOTP>
                </div>
                <Button
                  onClick={verifyAppCode}
                  disabled={appCode.length !== 6}
                  className="w-full bg-purple-600 hover:bg-purple-700 mb-2"
                >
                  Verify App
                </Button>
                <button
                  onClick={resendAppCode}
                  disabled={sendingAppCode}
                  className="w-full text-sm text-purple-600 hover:text-purple-700"
                >
                  {sendingAppCode ? "Sending..." : "Resend Code"}
                </button>
              </div>
            )}

            {/* Step 2: Email Verification */}
            {verificationStep === 2 && (
              <div className="space-y-4">
                {/* App verified badge */}
                <div className="flex items-center gap-2 p-2 bg-green-50 rounded-lg border border-green-200">
                  <CheckCircle2 className="w-5 h-5 text-green-600" />
                  <span className="text-sm text-green-700">App Verification Complete</span>
                </div>

                <div className="bg-blue-50 rounded-xl p-4 border border-blue-200">
                  <div className="flex items-center gap-2 mb-3">
                    <div className="w-8 h-8 rounded-full bg-blue-500 text-slate-800 flex items-center justify-center text-sm font-bold">2</div>
                    <h4 className="font-semibold text-blue-800">Email Verification</h4>
                  </div>

                  {!emailCodeSent ? (
                    <>
                      <p className="text-xs text-blue-600 mb-3">
                        ✉️ A verification code will be sent to your email
                      </p>
                      <Input
                        type="email"
                        placeholder="your@email.com"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        className="mb-3"
                      />
                      <Button
                        onClick={sendEmailVerificationCode}
                        disabled={sendingEmailCode || !email.trim()}
                        className="w-full bg-blue-600 hover:bg-blue-700"
                      >
                        {sendingEmailCode ? (
                          <Loader2 className="w-4 h-4 animate-spin mr-2" />
                        ) : (
                          <Send className="w-4 h-4 mr-2" />
                        )}
                        Send Code to Email
                      </Button>
                    </>
                  ) : (
                    <>
                      <p className="text-xs text-green-600 mb-4">
                        ✅ Code sent to {email}
                      </p>
                      <div className="flex justify-center mb-4">
                        <InputOTP
                          maxLength={6}
                          value={emailCode}
                          onChange={(value) => setEmailCode(value)}
                        >
                          <InputOTPGroup>
                            <InputOTPSlot index={0} className="bg-white text-gray-900 border-gray-300" />
                            <InputOTPSlot index={1} className="bg-white text-gray-900 border-gray-300" />
                            <InputOTPSlot index={2} className="bg-white text-gray-900 border-gray-300" />
                            <InputOTPSlot index={3} className="bg-white text-gray-900 border-gray-300" />
                            <InputOTPSlot index={4} className="bg-white text-gray-900 border-gray-300" />
                            <InputOTPSlot index={5} className="bg-white text-gray-900 border-gray-300" />
                          </InputOTPGroup>
                        </InputOTP>
                      </div>

                      {emailVerified ? (
                        <div className="bg-green-100 border border-green-300 rounded-lg p-3 flex items-center gap-2">
                          <CheckCircle2 className="w-5 h-5 text-green-600" />
                          <span className="text-green-700 font-medium">Email Verification Complete!</span>
                        </div>
                      ) : (
                        <Button
                          onClick={verifyEmailCode}
                          disabled={emailCode.length !== 6}
                          className="w-full bg-blue-600 hover:bg-blue-700 mb-2"
                        >
                          Verify Email
                        </Button>
                      )}
                      <button
                        onClick={resendEmailCode}
                        disabled={sendingEmailCode}
                        className="w-full text-sm text-blue-600 hover:text-blue-700 mt-2"
                      >
                        {sendingEmailCode ? "Sending..." : "Resend Code"}
                      </button>
                    </>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Submit Button */}
      <div className="fixed bottom-0 left-0 right-0 bg-white border-t p-4">
        {step === 'form' ? (
          <Button
            onClick={sendAppVerificationCode}
            disabled={!foundUser || sendingAppCode}
            className="w-full h-12 bg-gradient-to-r from-pink-500 to-purple-600 hover:from-pink-600 hover:to-purple-700"
          >
            {sendingAppCode ? (
              <span className="flex items-center gap-2">
                <Loader2 className="w-5 h-5 animate-spin" />
                Sending code...
              </span>
            ) : (
              <span className="flex items-center gap-2">
                <Send className="w-5 h-5" />
                Send Code to App
              </span>
            )}
          </Button>
        ) : (
          <Button
            onClick={handleSubmit}
            disabled={!appVerified || !emailVerified || !agreeTerms || isSubmitting}
            className="w-full h-12 bg-gradient-to-r from-green-500 to-emerald-600 hover:from-green-600 hover:to-emerald-700"
          >
            {isSubmitting ? (
              <span className="flex items-center gap-2">
                <Loader2 className="w-5 h-5 animate-spin" />
                Submitting...
              </span>
            ) : (
              <span className="flex items-center gap-2">
                <Sparkles className="w-5 h-5" />
                Register as Host
              </span>
            )}
          </Button>
        )}
      </div>
    </div>
  );
};

export default HostApplication;
