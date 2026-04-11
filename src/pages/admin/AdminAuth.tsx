import { useState, useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { Shield, Mail, Lock, User, Eye, EyeOff, LogIn, UserPlus, Copy, Check, Info, Key, ChevronDown, ChevronUp, ArrowLeft, RefreshCw, Smartphone, AlertTriangle, Phone, MessageSquare } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { z } from "zod";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp";
import { getDeviceFingerprint } from "@/utils/deviceFingerprint";
import { grantAdminAccess } from "@/utils/adminAccessStorage";

// Owner emails - always have access without secret token
const OWNER_EMAILS = ["smtv923@gmail.com", "sazzadshifa776@gmail.com"];

// Validation schemas
const loginSchema = z.object({
  email: z.string().email("Please enter a valid email"),
  password: z.string().min(6, "Password must be at least 6 characters"),
});

const signupSchema = z.object({
  displayName: z.string().min(2, "Name must be at least 2 characters").max(50, "Name cannot exceed 50 characters"),
  email: z.string().email("Please enter a valid email"),
  password: z.string().min(6, "Password must be at least 6 characters"),
  confirmPassword: z.string(),
}).refine((data) => data.password === data.confirmPassword, {
  message: "Passwords do not match",
  path: ["confirmPassword"],
});

export default function AdminAuth() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [activeTab, setActiveTab] = useState<"login" | "signup">("login");
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [showCredentials, setShowCredentials] = useState(false);
  const [copiedField, setCopiedField] = useState<string | null>(null);
  const [adminUsers, setAdminUsers] = useState<any[]>([]);
  const [loadingAdmins, setLoadingAdmins] = useState(true);
  
  // Access Control - AdminAccessGuard already validated, so we're always authorized here
  // This component only renders if AdminAccessGuard passed
  const [isAuthorized] = useState(true);
  
  // Login form
  const [loginEmail, setLoginEmail] = useState("");
  const [loginPassword, setLoginPassword] = useState("");
  
  // Signup form
  const [signupName, setSignupName] = useState("");
  const [signupEmail, setSignupEmail] = useState("");
  const [signupPassword, setSignupPassword] = useState("");
  const [signupConfirmPassword, setSignupConfirmPassword] = useState("");

  // Password Reset
  const [showResetForm, setShowResetForm] = useState(false);
  const [resetEmail, setResetEmail] = useState("");
  const [resetMethod, setResetMethod] = useState<"email" | "whatsapp">("email");
  const [resetPhone, setResetPhone] = useState("");
  const [resetStep, setResetStep] = useState<"email" | "otp" | "newPassword">("email");
  const [otpValue, setOtpValue] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmNewPassword, setConfirmNewPassword] = useState("");
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmNewPassword, setShowConfirmNewPassword] = useState(false);
  const [resendCooldown, setResendCooldown] = useState(0);
  const [_debugOtpRemoved] = useState(false); // debug_otp removed for security
  
  // 2FA State
  const [twoFAStep, setTwoFAStep] = useState(false);
  const [twoFAOtp, setTwoFAOtp] = useState("");
  const [twoFACooldown, setTwoFACooldown] = useState(0);
  const [_twoFADebugRemoved] = useState(false); // debug_otp removed for security
  const [pendingLoginUser, setPendingLoginUser] = useState<any>(null);
  
  // Device Access Control
  const [devicePending, setDevicePending] = useState(false);
  const [deviceBlocked, setDeviceBlocked] = useState(false);
  const [pendingUserEmail, setPendingUserEmail] = useState<string | null>(null);
  const [pendingDeviceFingerprint, setPendingDeviceFingerprint] = useState<string | null>(null);
  const [checkingApproval, setCheckingApproval] = useState(false);
  
  // Pre-fill email and store session on mount (one-time)
  useEffect(() => {
    // Pre-fill email if provided in URL
    const emailParam = searchParams.get('email');
    if (emailParam) {
      setLoginEmail(decodeURIComponent(emailParam));
    }
    
    // Token validation is handled server-side by AdminAccessGuard
    // Session flags are set by AdminAccessGuard, no client-side secret needed
  }, [searchParams]);
  
  // AdminAccessGuard already handles unauthorized - this shouldn't show blank
  // but if it does, show the login form instead of blank page

  // Fetch admin users
  useEffect(() => {
    const fetchAdminUsers = async () => {
      try {
        const { data: adminRoles, error } = await supabase
          .from("user_roles")
          .select(`
            user_id,
            role,
            created_at,
            profiles:user_id (
              display_name,
              avatar_url
            )
          `)
          .eq("role", "admin");
        
        if (error) throw error;
        setAdminUsers(adminRoles || []);
      } catch (error) {
        console.error("Error fetching admins:", error);
      } finally {
        setLoadingAdmins(false);
      }
    };
    
    fetchAdminUsers();
  }, []);

  // Check if user is already logged in and is admin
  useEffect(() => {
    const checkAuth = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const { data: isAdminResult } = await supabase.rpc("is_admin", {
          _user_id: user.id
        });
        if (isAdminResult) {
          navigate("/admin");
        }
      }
    };
    checkAuth();
  }, [navigate]);

  const copyToClipboard = (text: string, field: string) => {
    navigator.clipboard.writeText(text);
    setCopiedField(field);
    toast.success("Copied!");
    setTimeout(() => setCopiedField(null), 2000);
  };

  const fillDemoCredentials = (email: string) => {
    setLoginEmail(email);
    toast.info("Email filled - enter your password");
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    
    // Validate
    const result = loginSchema.safeParse({ email: loginEmail, password: loginPassword });
    if (!result.success) {
      toast.error(result.error.errors[0].message);
      return;
    }

    setLoading(true);
    setDevicePending(false);
    setDeviceBlocked(false);
    
    try {
      const normalizedLoginEmail = loginEmail.trim().toLowerCase();

      let { data, error } = await supabase.auth.signInWithPassword({
        email: normalizedLoginEmail,
        password: loginPassword,
      });

      // If login fails with invalid credentials, try syncing auth account first
      if (error && error.message === "Invalid login credentials") {
        console.log("[AdminAuth] Login failed, attempting auth sync...");
        const { data: syncResult, error: syncError } = await supabase.functions.invoke('admin-sync-auth', {
          body: { email: normalizedLoginEmail, password: loginPassword }
        });

        if (syncError) {
          console.error("[AdminAuth] admin-sync-auth error:", syncError);
        }

        if (syncResult?.success) {
          console.log("[AdminAuth] Auth synced, retrying login...");
          const retry = await supabase.auth.signInWithPassword({
            email: normalizedLoginEmail,
            password: loginPassword,
          });
          data = retry.data;
          error = retry.error;
        }
      }

      if (error) throw error;

      if (data.user) {
        // Check if this is the Owner - Owner always has full access (no device restrictions)
        const isOwner = !!data.user.email && OWNER_EMAILS.includes(data.user.email);
        if (isOwner) {
          grantAdminAccess(true);
        }
        
        // Check if user is admin
        const { data: isAdminResult } = await supabase.rpc("is_admin", {
          _user_id: data.user.id
        });

        if (!isAdminResult) {
          toast.error("You do not have admin access");
          localStorage.setItem('meri_manual_logout', 'true');
          await supabase.auth.signOut({ scope: 'local' });
          return;
        }
        
        // ✅ 2FA: Check if 2FA is enabled in settings
        const { data: twoFASetting } = await supabase
          .from('app_settings')
          .select('setting_value')
          .eq('setting_key', 'admin_2fa')
          .maybeSingle();
        
        const is2FAEnabled = (twoFASetting?.setting_value as any)?.enabled ?? true; // Default: enabled
        
        if (is2FAEnabled) {
          setPendingLoginUser({ user: data.user, isOwner });
          await send2FAOTP(data.user.email || loginEmail);
          setTwoFAStep(true);
          // Don't navigate yet — wait for OTP verification
        } else {
          // 2FA disabled — proceed directly
          setPendingLoginUser({ user: data.user, isOwner });
          await proceedAfter2FA(data.user, isOwner);
        }
      }
    } catch (error: any) {
      if (error.message === "Invalid login credentials") {
        toast.error("Invalid email or password");
      } else {
        toast.error(error.message || "Login failed");
      }
    } finally {
      setLoading(false);
    }
  };

  // 2FA: Send OTP to admin email
  const send2FAOTP = async (email: string) => {
    try {
      const { data, error } = await supabase.functions.invoke('admin-2fa-otp', {
        body: { email, action: 'send' }
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      
      toast.success("🔐 Verification code sent!", { description: "Check your email" });

      // Cooldown
      setTwoFACooldown(60);
      const interval = setInterval(() => {
        setTwoFACooldown(prev => {
          if (prev <= 1) { clearInterval(interval); return 0; }
          return prev - 1;
        });
      }, 1000);
    } catch (err: any) {
      toast.error(err.message || "Failed to send verification code");
    }
  };

  // Shared logic: proceed after 2FA (or skip if disabled)
  const proceedAfter2FA = async (user: any, isOwner: boolean) => {
    // OWNER BYPASS: Owner can access from any device without approval
    if (isOwner) {
      grantAdminAccess(true);
      toast.success("Welcome to Admin Panel!");
      navigate("/admin");
      return;
    }
    
    // For Sub-Admins: Device fingerprint check required
    const deviceInfo = getDeviceFingerprint();
    console.log('[AdminAuth] Device fingerprint:', deviceInfo.fingerprint);
    
    // Register device and check if approved
    const { error: registerError } = await supabase.rpc('register_admin_device', {
      _device_fingerprint: deviceInfo.fingerprint,
      _device_name: deviceInfo.deviceName,
      _device_info: deviceInfo.details,
      _ip_address: null,
      _user_agent: navigator.userAgent
    });
    
    if (registerError) {
      console.error('[AdminAuth] Device registration error:', registerError);
    }
    
    // Check if device is approved
    const { data: isApproved } = await supabase.rpc('is_admin_device_approved', {
      _user_id: user.id,
      _device_fingerprint: deviceInfo.fingerprint
    });
    
    if (isApproved) {
      grantAdminAccess(false);
      toast.success("Welcome to Admin Panel!");
      navigate("/admin");
    } else {
      const { data: adminUser } = await supabase
        .from('admin_users')
        .select('id, role')
        .eq('user_id', user.id)
        .single();
      
      if (adminUser) {
        const { data: deviceStatus } = await supabase
          .from('admin_allowed_devices')
          .select('status')
          .eq('admin_user_id', adminUser.id)
          .eq('device_fingerprint', deviceInfo.fingerprint)
          .single();
        
        if (deviceStatus?.status === 'blocked') {
          setDeviceBlocked(true);
          toast.error("This device has been blocked");
          localStorage.setItem('meri_manual_logout', 'true');
          await supabase.auth.signOut({ scope: 'local' });
        } else if (deviceStatus?.status === 'pending') {
          setDevicePending(true);
          setPendingUserEmail(user.email || null);
          setPendingDeviceFingerprint(deviceInfo.fingerprint);
          toast.warning("Device approval pending");
          localStorage.setItem('meri_manual_logout', 'true');
          await supabase.auth.signOut({ scope: 'local' });
        } else {
          setDevicePending(true);
          setPendingUserEmail(user.email || null);
          setPendingDeviceFingerprint(deviceInfo.fingerprint);
          toast.warning("Device registration pending");
          localStorage.setItem('meri_manual_logout', 'true');
          await supabase.auth.signOut({ scope: 'local' });
        }
      }
    }
  };

  // 2FA: Verify OTP and proceed with login
  const verify2FAOTP = async () => {
    if (twoFAOtp.length !== 6) {
      toast.error("Enter the 6-digit verification code");
      return;
    }

    setLoading(true);
    try {
      const email = pendingLoginUser?.user?.email || loginEmail;
      const { data, error } = await supabase.functions.invoke('admin-2fa-otp', {
        body: { email, action: 'verify', otp: twoFAOtp }
      });

      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      if (!data?.verified) {
        toast.error("Invalid verification code");
        return;
      }

      toast.success("✅ 2FA Verified!");

      const { user, isOwner } = pendingLoginUser;
      await proceedAfter2FA(user, isOwner);
    } catch (error: any) {
      toast.error(error.message || "Verification failed");
    } finally {
      setLoading(false);
      setTwoFAStep(false);
      setTwoFAOtp("");
      setPendingLoginUser(null);
    }
  };

  // Cancel 2FA and sign out
  const cancel2FA = async () => {
    localStorage.setItem('meri_manual_logout', 'true');
    await supabase.auth.signOut({ scope: 'local' });
    setTwoFAStep(false);
    setTwoFAOtp("");
    
    setPendingLoginUser(null);
    toast.info("Login cancelled");
  };

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    
    // Validate
    const result = signupSchema.safeParse({
      displayName: signupName,
      email: signupEmail,
      password: signupPassword,
      confirmPassword: signupConfirmPassword,
    });
    
    if (!result.success) {
      toast.error(result.error.errors[0].message);
      return;
    }

    setLoading(true);
    try {
      const { data, error } = await supabase.auth.signUp({
        email: signupEmail,
        password: signupPassword,
        options: {
          emailRedirectTo: `${window.location.origin}/admin`,
          data: {
            full_name: signupName,
          },
        },
      });

      if (error) throw error;

      if (data.user) {
        // Update profile with display name
        await supabase
          .from("profiles")
          .update({ display_name: signupName })
          .eq("id", data.user.id);

        toast.success("Account created! Please verify your email.", {
          description: "Contact developer for admin access after verification."
        });
        
        // Clear form
        setSignupName("");
        setSignupEmail("");
        setSignupPassword("");
        setSignupConfirmPassword("");
        setActiveTab("login");
      }
    } catch (error: any) {
      if (error.message?.includes("already registered")) {
        toast.error("An account already exists with this email");
      } else {
        toast.error(error.message || "Failed to sign up");
      }
    } finally {
      setLoading(false);
    }
  };

  // Password Reset Functions - Using Custom OTP Edge Function
  const handleSendResetOTP = async () => {
    if (resetMethod === "email") {
      if (!resetEmail.trim()) {
        toast.error("Please enter your email");
        return;
      }
      const emailValidation = z.string().email().safeParse(resetEmail);
      if (!emailValidation.success) {
        toast.error("Please enter a valid email");
        return;
      }
    } else {
      if (!resetPhone.trim() || resetPhone.replace(/\D/g, "").length < 8) {
        toast.error("Please enter a valid WhatsApp number (with country code)");
        return;
      }
      if (!resetEmail.trim()) {
        toast.error("Please also enter your admin email");
        return;
      }
    }

    setLoading(true);
    try {
      if (resetMethod === "email") {
        const { data, error } = await supabase.functions.invoke('send-password-otp', {
          body: { email: resetEmail, action: 'send' }
        });
        if (error) throw error;
        if (data?.error) throw new Error(data.error);
        toast.success("OTP Sent!", { description: "Check your email" });
      } else {
        const cleanPhone = resetPhone.replace(/[\s\-\(\)]/g, "").replace(/^\+/, "");
        const { data, error } = await supabase.functions.invoke('send-whatsapp-otp', {
          body: { phone_number: cleanPhone, action: 'send' }
        });
        if (error) throw error;
        if (data?.error) throw new Error(data.error);
        toast.success("OTP Sent!", { description: "Check your WhatsApp" });
      }
      
      setResetStep("otp");
      
      // Start resend cooldown
      setResendCooldown(60);
      const interval = setInterval(() => {
        setResendCooldown(prev => {
          if (prev <= 1) {
            clearInterval(interval);
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    } catch (error: any) {
      toast.error(error.message || "Failed to send OTP");
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyOTP = async () => {
    if (otpValue.length !== 6) {
      toast.error("Please enter the 6-digit OTP");
      return;
    }

    setLoading(true);
    try {
      if (resetMethod === "whatsapp") {
        const cleanPhone = resetPhone.replace(/[\s\-\(\)]/g, "").replace(/^\+/, "");
        const { data, error } = await supabase.functions.invoke('send-whatsapp-otp', {
          body: { phone_number: cleanPhone, action: 'verify', otp: otpValue }
        });
        if (error) throw error;
        if (data?.error) throw new Error(data.error);
      } else {
        const { data, error } = await supabase.functions.invoke('send-password-otp', {
          body: { email: resetEmail, action: 'verify', otp: otpValue }
        });
        if (error) throw error;
        if (data?.error) throw new Error(data.error);
      }

      toast.success("OTP Verified!");
      setResetStep("newPassword");
    } catch (error: any) {
      toast.error(error.message || "Failed to verify OTP");
    } finally {
      setLoading(false);
    }
  };

  const handleSetNewPassword = async () => {
    if (newPassword.length < 6) {
      toast.error("Password must be at least 6 characters");
      return;
    }

    if (newPassword !== confirmNewPassword) {
      toast.error("Passwords do not match");
      return;
    }

    setLoading(true);
    try {
      if (resetMethod === "whatsapp") {
        const cleanPhone = resetPhone.replace(/[\s\-\(\)]/g, "").replace(/^\+/, "");
        const { data, error } = await supabase.functions.invoke('admin-reset-password-whatsapp', {
          body: { email: resetEmail, phone_number: cleanPhone, otp: otpValue, newPassword }
        });
        if (error) throw error;
        if (data?.error) throw new Error(data.error);
      } else {
        const { data, error } = await supabase.functions.invoke('send-password-otp', {
          body: { 
            email: resetEmail, 
            action: 'reset-password', 
            otp: otpValue,
            newPassword 
          }
        });
        if (error) throw error;
        if (data?.error) throw new Error(data.error);
      }

      toast.success("Password updated!", {
        description: "Please login now"
      });
      
      // Reset all states
      setShowResetForm(false);
      setResetStep("email");
      setResetEmail("");
      setResetPhone("");
      setResetMethod("email");
      setOtpValue("");
      setNewPassword("");
      setConfirmNewPassword("");
      setLoginEmail(resetEmail);
    } catch (error: any) {
      toast.error(error.message || "Failed to update password");
    } finally {
      setLoading(false);
    }
  };

  const resetPasswordForm = () => {
    setShowResetForm(false);
    setResetStep("email");
    setResetEmail("");
    setResetPhone("");
    setResetMethod("email");
    setOtpValue("");
    setNewPassword("");
    setConfirmNewPassword("");
  };

  // Check device approval status - for pending sub-admins
  const checkApprovalStatus = async () => {
    if (!pendingUserEmail || !pendingDeviceFingerprint) {
      toast.error("Information not found. Please login again.");
      setDevicePending(false);
      return;
    }

    setCheckingApproval(true);
    try {
      // Login again to check status
      const { data, error } = await supabase.auth.signInWithPassword({
        email: pendingUserEmail,
        password: loginPassword,
      });

      if (error) {
        toast.error("Please login again with your password");
        setDevicePending(false);
        return;
      }

      if (data.user) {
        // Check if device is now approved
        const { data: isApproved } = await supabase.rpc('is_admin_device_approved', {
          _user_id: data.user.id,
          _device_fingerprint: pendingDeviceFingerprint
        });

        if (isApproved) {
          toast.success("✅ Device approved! Welcome!");
          setDevicePending(false);
          navigate("/admin");
        } else {
          // Check if blocked
          const { data: adminUser } = await supabase
            .from('admin_users')
            .select('id')
            .eq('user_id', data.user.id)
            .single();

          if (adminUser) {
            const { data: deviceStatus } = await supabase
              .from('admin_allowed_devices')
              .select('status')
              .eq('admin_user_id', adminUser.id)
              .eq('device_fingerprint', pendingDeviceFingerprint)
              .single();

            if (deviceStatus?.status === 'blocked') {
              setDeviceBlocked(true);
              setDevicePending(false);
              toast.error("This device has been blocked");
              localStorage.setItem('meri_manual_logout', 'true');
              await supabase.auth.signOut({ scope: 'local' });
            } else {
              toast.info("Approval not yet granted. Please wait for the Owner.");
              localStorage.setItem('meri_manual_logout', 'true');
              await supabase.auth.signOut({ scope: 'local' });
            }
          }
        }
      }
    } catch (error: any) {
      console.error('Error checking approval:', error);
      toast.error("Failed to check status");
    } finally {
      setCheckingApproval(false);
    }
  };

  // Reset pending state and go back to login
  const resetPendingState = () => {
    setDevicePending(false);
    setDeviceBlocked(false);
    setPendingUserEmail(null);
    setPendingDeviceFingerprint(null);
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 p-4">
      {/* Background decorations */}
      <div className="absolute inset-0 overflow-hidden">
        <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-primary/10 rounded-full blur-3xl" />
        <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-purple-600/10 rounded-full blur-3xl" />
      </div>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="relative z-10 w-full max-w-md"
      >
        {/* Logo */}
        <div className="text-center mb-6">
          <motion.div
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ type: "spring", duration: 0.5 }}
            className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-gradient-to-br from-primary to-purple-600 mb-3"
          >
            <Shield className="w-8 h-8 text-white" />
          </motion.div>
          <h1 className="text-2xl font-bold text-white mb-1">Admin Panel</h1>
          <p className="text-white/60 text-sm">Sign in to the control panel</p>
        </div>

        {/* 2FA Verification Step */}
        {twoFAStep && (
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
          >
            <Card className="bg-slate-800/80 border-purple-500/30 backdrop-blur-xl">
              <CardHeader className="text-center pb-2">
                <div className="w-14 h-14 mx-auto mb-3 rounded-full bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center">
                  <Key className="w-7 h-7 text-white" />
                </div>
                <CardTitle className="text-white text-lg">🔐 Two-Factor Authentication</CardTitle>
                <CardDescription className="text-white/60 text-sm">
                  Enter the 6-digit code sent to your email
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                
                
                <div className="flex justify-center">
                  <InputOTP 
                    maxLength={6} 
                    value={twoFAOtp} 
                    onChange={setTwoFAOtp}
                  >
                    <InputOTPGroup>
                      <InputOTPSlot index={0} className="bg-slate-700 border-slate-600 text-white" />
                      <InputOTPSlot index={1} className="bg-slate-700 border-slate-600 text-white" />
                      <InputOTPSlot index={2} className="bg-slate-700 border-slate-600 text-white" />
                      <InputOTPSlot index={3} className="bg-slate-700 border-slate-600 text-white" />
                      <InputOTPSlot index={4} className="bg-slate-700 border-slate-600 text-white" />
                      <InputOTPSlot index={5} className="bg-slate-700 border-slate-600 text-white" />
                    </InputOTPGroup>
                  </InputOTP>
                </div>

                <Button 
                  onClick={verify2FAOTP} 
                  disabled={loading || twoFAOtp.length !== 6}
                  className="w-full bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700"
                >
                  {loading ? <RefreshCw className="w-4 h-4 animate-spin mr-2" /> : <Shield className="w-4 h-4 mr-2" />}
                  Verify
                </Button>

                <div className="flex items-center justify-between">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => send2FAOTP(pendingLoginUser?.user?.email || loginEmail)}
                    disabled={twoFACooldown > 0}
                    className="text-white/60 hover:text-white text-xs"
                  >
                    {twoFACooldown > 0 ? `Resend (${twoFACooldown}s)` : "Resend Code"}
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={cancel2FA}
                    className="text-red-400 hover:text-red-300 text-xs"
                  >
                    Cancel
                  </Button>
                </div>
              </CardContent>
            </Card>
          </motion.div>
        )}

        {/* Device Access Pending/Blocked Messages */}
        <AnimatePresence>
          {devicePending && (
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="mb-4 p-5 rounded-xl bg-gradient-to-br from-amber-500/20 to-orange-500/20 border border-amber-500/40"
            >
              <div className="flex flex-col items-center text-center gap-4">
                <div className="w-16 h-16 rounded-full bg-amber-500/30 flex items-center justify-center animate-pulse">
                  <Smartphone className="w-8 h-8 text-amber-400" />
                </div>
                <div>
                 <h3 className="text-amber-300 font-bold text-lg mb-2">🔒 Device Approval Pending</h3>
                  <p className="text-amber-200/80 text-sm mb-1">
                    First login from this device detected.
                  </p>
                  <p className="text-amber-200/60 text-xs">
                    You will get access once the Owner approves your device.
                  </p>
                  {pendingUserEmail && (
                    <p className="text-amber-400 text-xs mt-2 font-mono">
                      {pendingUserEmail}
                    </p>
                  )}
                </div>
                
                {/* Action Buttons */}
                <div className="flex flex-col w-full gap-2 mt-2">
                  <Button
                    onClick={checkApprovalStatus}
                    disabled={checkingApproval}
                    className="w-full bg-amber-600 hover:bg-amber-700 text-white"
                  >
                    {checkingApproval ? (
                      <>
                        <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                        Checking...
                      </>
                    ) : (
                      <>
                        <RefreshCw className="w-4 h-4 mr-2" />
                        Check Status
                      </>
                    )}
                  </Button>
                  <Button
                    onClick={resetPendingState}
                    variant="ghost"
                    className="w-full text-white/60 hover:text-white hover:bg-white/10"
                  >
                    <ArrowLeft className="w-4 h-4 mr-2" />
                     Login with another account
                  </Button>
                </div>

                <div className="text-center text-xs text-white/40 mt-2">
                  <p>Contact the Owner for device approval</p>
                </div>
              </div>
            </motion.div>
          )}
          
          {deviceBlocked && (
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="mb-4 p-5 rounded-xl bg-gradient-to-br from-red-500/20 to-rose-500/20 border border-red-500/40"
            >
              <div className="flex flex-col items-center text-center gap-4">
                <div className="w-16 h-16 rounded-full bg-red-500/30 flex items-center justify-center">
                  <AlertTriangle className="w-8 h-8 text-red-400" />
                </div>
                <div>
                   <h3 className="text-red-300 font-bold text-lg mb-2">🚫 Device Blocked</h3>
                   <p className="text-red-200/80 text-sm">
                     Access to the Admin Panel from this device has been blocked.
                   </p>
                   <p className="text-red-200/60 text-xs mt-1">
                     Please contact the Owner to request unblock.
                   </p>
                </div>
                
                <Button
                  onClick={resetPendingState}
                  variant="ghost"
                  className="w-full text-white/60 hover:text-white hover:bg-white/10"
                >
                  <ArrowLeft className="w-4 h-4 mr-2" />
                  Login with another account
                </Button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Admin credentials section removed for production security */}

        {/* Auth Card - Hidden during 2FA step */}
        {!twoFAStep && (
        <Card className="bg-slate-800/50 backdrop-blur-xl border-white/10">
          <CardHeader className="pb-4">
            <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as "login" | "signup")}>
              <TabsList className="grid w-full grid-cols-2 bg-slate-900/50">
                <TabsTrigger 
                  value="login" 
                  className="data-[state=active]:bg-primary data-[state=active]:text-white"
                >
                  <LogIn className="w-4 h-4 mr-2" />
                  Login
                </TabsTrigger>
                <TabsTrigger 
                  value="signup"
                  className="data-[state=active]:bg-primary data-[state=active]:text-white"
                >
                  <UserPlus className="w-4 h-4 mr-2" />
                  Sign Up
                </TabsTrigger>
              </TabsList>
            </Tabs>
          </CardHeader>
          
          <CardContent>
            {activeTab === "login" ? (
              <form onSubmit={handleLogin} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="login-email" className="text-white/80">Email</Label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-white/40" />
                    <Input
                      id="login-email"
                      type="email"
                      placeholder="admin@example.com"
                      value={loginEmail}
                      onChange={(e) => setLoginEmail(e.target.value)}
                      className="pl-10 bg-slate-900/50 border-white/10 text-white placeholder:text-white/30"
                      required
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="login-password" className="text-white/80">Password</Label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-white/40" />
                    <Input
                      id="login-password"
                      type={showPassword ? "text" : "password"}
                      placeholder="••••••••"
                      value={loginPassword}
                      onChange={(e) => setLoginPassword(e.target.value)}
                      className="pl-10 pr-10 bg-slate-900/50 border-white/10 text-white placeholder:text-white/30"
                      required
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-white/40 hover:text-white/60"
                    >
                      {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                    </button>
                  </div>
                </div>

                <Button
                  type="submit"
                  className="w-full bg-gradient-to-r from-primary to-purple-600 hover:from-primary/90 hover:to-purple-600/90"
                  disabled={loading}
                >
                  {loading ? (
                    <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  ) : (
                    <>
                      <LogIn className="w-5 h-5 mr-2" />
                      Login
                    </>
                  )}
                </Button>

                {/* Forgot Password Link */}
                <button
                  type="button"
                  onClick={() => setShowResetForm(true)}
                  className="w-full text-center text-primary hover:text-primary/80 text-sm mt-3 transition-colors"
                >
                  Forgot Password?
                </button>
              </form>
            ) : (
              <form onSubmit={handleSignup} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="signup-name" className="text-white/80">Name</Label>
                  <div className="relative">
                    <User className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-white/40" />
                    <Input
                      id="signup-name"
                      type="text"
                      placeholder="Your name"
                      value={signupName}
                      onChange={(e) => setSignupName(e.target.value)}
                      className="pl-10 bg-slate-900/50 border-white/10 text-white placeholder:text-white/30"
                      required
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="signup-email" className="text-white/80">Email</Label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-white/40" />
                    <Input
                      id="signup-email"
                      type="email"
                      placeholder="admin@example.com"
                      value={signupEmail}
                      onChange={(e) => setSignupEmail(e.target.value)}
                      className="pl-10 bg-slate-900/50 border-white/10 text-white placeholder:text-white/30"
                      required
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="signup-password" className="text-white/80">Password</Label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-white/40" />
                    <Input
                      id="signup-password"
                      type={showPassword ? "text" : "password"}
                      placeholder="At least 6 characters"
                      value={signupPassword}
                      onChange={(e) => setSignupPassword(e.target.value)}
                      className="pl-10 pr-10 bg-slate-900/50 border-white/10 text-white placeholder:text-white/30"
                      required
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-white/40 hover:text-white/60"
                    >
                      {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                    </button>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="signup-confirm" className="text-white/80">Confirm Password</Label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-white/40" />
                    <Input
                      id="signup-confirm"
                      type={showConfirmPassword ? "text" : "password"}
                      placeholder="Re-enter password"
                      value={signupConfirmPassword}
                      onChange={(e) => setSignupConfirmPassword(e.target.value)}
                      className="pl-10 pr-10 bg-slate-900/50 border-white/10 text-white placeholder:text-white/30"
                      required
                    />
                    <button
                      type="button"
                      onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-white/40 hover:text-white/60"
                    >
                      {showConfirmPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                    </button>
                  </div>
                </div>

                <Button
                  type="submit"
                  className="w-full bg-gradient-to-r from-primary to-purple-600 hover:from-primary/90 hover:to-purple-600/90"
                  disabled={loading}
                >
                  {loading ? (
                    <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  ) : (
                    <>
                      <UserPlus className="w-5 h-5 mr-2" />
                      Sign Up
                    </>
                  )}
                </Button>
              </form>
            )}

            {/* Password Reset Modal */}
            <AnimatePresence>
              {showResetForm && (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4"
                  onClick={(e) => e.target === e.currentTarget && resetPasswordForm()}
                >
                  <motion.div
                    initial={{ opacity: 0, scale: 0.9, y: 20 }}
                    animate={{ opacity: 1, scale: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.9, y: 20 }}
                    className="w-full max-w-md bg-slate-800 rounded-2xl border border-white/10 p-6 shadow-2xl"
                  >
                    {/* Header */}
                    <div className="flex items-center gap-3 mb-6">
                      <button
                        onClick={resetPasswordForm}
                        className="p-2 hover:bg-white/10 rounded-lg transition-colors"
                      >
                        <ArrowLeft className="w-5 h-5 text-white/60" />
                      </button>
                      <div>
                        <h3 className="text-lg font-semibold text-white">Reset Password</h3>
                        <p className="text-white/50 text-sm">
                          {resetStep === "email" && "Choose your recovery method"}
                          {resetStep === "otp" && "Enter the OTP code"}
                          {resetStep === "newPassword" && "Set your new password"}
                        </p>
                      </div>
                    </div>

                    {/* Progress Steps */}
                    <div className="flex items-center gap-2 mb-6">
                      {["email", "otp", "newPassword"].map((step, index) => (
                        <div key={step} className="flex items-center flex-1">
                          <div
                            className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium transition-colors ${
                              resetStep === step
                                ? "bg-primary text-white"
                                : index < ["email", "otp", "newPassword"].indexOf(resetStep)
                                ? "bg-green-500 text-white"
                                : "bg-slate-700 text-white/40"
                            }`}
                          >
                            {index + 1}
                          </div>
                          {index < 2 && (
                            <div
                              className={`flex-1 h-1 mx-1 rounded transition-colors ${
                                index < ["email", "otp", "newPassword"].indexOf(resetStep)
                                  ? "bg-green-500"
                                  : "bg-slate-700"
                              }`}
                            />
                          )}
                        </div>
                      ))}
                    </div>

                    {/* Step 1: Email */}
                    {resetStep === "email" && (
                      <motion.div
                        initial={{ opacity: 0, x: 20 }}
                        animate={{ opacity: 1, x: 0 }}
                        className="space-y-4"
                      >
                        {/* Method Toggle */}
                        <div className="flex gap-2 p-1 bg-slate-900/50 rounded-lg">
                          <button
                            onClick={() => setResetMethod("email")}
                            className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-md text-sm font-medium transition-all ${
                              resetMethod === "email"
                                ? "bg-primary text-white shadow-lg"
                                : "text-white/50 hover:text-white/70"
                            }`}
                          >
                            <Mail className="w-4 h-4" />
                            Email OTP
                          </button>
                          <button
                            onClick={() => setResetMethod("whatsapp")}
                            className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-md text-sm font-medium transition-all ${
                              resetMethod === "whatsapp"
                                ? "bg-green-600 text-white shadow-lg"
                                : "text-white/50 hover:text-white/70"
                            }`}
                          >
                            <MessageSquare className="w-4 h-4" />
                            WhatsApp OTP
                          </button>
                        </div>

                        {resetMethod === "email" ? (
                          <div className="space-y-2">
                            <Label className="text-white/80">Email</Label>
                            <div className="relative">
                              <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-white/40" />
                              <Input
                                type="email"
                                placeholder="Enter your email"
                                value={resetEmail}
                                onChange={(e) => setResetEmail(e.target.value)}
                                className="pl-10 bg-slate-900/50 border-white/10 text-white placeholder:text-white/30"
                              />
                            </div>
                          </div>
                        ) : (
                          <div className="space-y-3">
                            <div className="space-y-2">
                              <Label className="text-white/80">Email (to identify account)</Label>
                              <div className="relative">
                                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-white/40" />
                                <Input
                                  type="email"
                                  placeholder="Your admin email"
                                  value={resetEmail}
                                  onChange={(e) => setResetEmail(e.target.value)}
                                  onBlur={async () => {
                                    const em = resetEmail.trim();
                                    if (em.includes('@') && em.includes('.')) {
                                      try {
                                        const { data } = await supabase.functions.invoke('admin-lookup-phone', {
                                          body: { email: em }
                                        });
                                        if (data?.whatsapp_number) {
                                          setResetPhone(data.whatsapp_number);
                                        }
                                      } catch {}
                                    }
                                  }}
                                  className="pl-10 bg-slate-900/50 border-white/10 text-white placeholder:text-white/30"
                                />
                              </div>
                            </div>
                            <div className="space-y-2">
                              <Label className="text-white/80">WhatsApp Number (for OTP)</Label>
                              <div className="relative">
                                <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-white/40" />
                                <Input
                                  type="tel"
                                  placeholder="880XXXXXXXXXX (with country code)"
                                  value={resetPhone}
                                  onChange={(e) => setResetPhone(e.target.value)}
                                  className="pl-10 bg-slate-900/50 border-white/10 text-white placeholder:text-white/30"
                                />
                              </div>
                              <p className="text-white/40 text-xs">Enter number with country code (without +). Saved numbers will auto-fill.</p>
                            </div>
                          </div>
                        )}

                        <Button
                          onClick={handleSendResetOTP}
                          className={`w-full ${resetMethod === "whatsapp" ? "bg-gradient-to-r from-green-500 to-green-600" : "bg-gradient-to-r from-primary to-purple-600"}`}
                          disabled={loading}
                        >
                          {loading ? (
                            <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                          ) : (
                            <>
                              {resetMethod === "whatsapp" ? <MessageSquare className="w-5 h-5 mr-2" /> : <Mail className="w-5 h-5 mr-2" />}
                              Send OTP
                            </>
                          )}
                        </Button>
                      </motion.div>
                    )}

                    {/* Step 2: OTP */}
                    {resetStep === "otp" && (
                      <motion.div
                        initial={{ opacity: 0, x: 20 }}
                        animate={{ opacity: 1, x: 0 }}
                        className="space-y-4"
                      >
                        <div className="text-center">
                          <p className="text-white/60 text-sm mb-4">
                            Enter the 6-digit OTP sent to{" "}
                            <span className={resetMethod === "whatsapp" ? "text-green-400" : "text-primary"}>
                              {resetMethod === "whatsapp" ? resetPhone : resetEmail}
                            </span>
                            {resetMethod === "whatsapp" && " (WhatsApp)"}
                          </p>
                          
                          
                          
                          <div className="flex justify-center">
                            <InputOTP
                              maxLength={6}
                              value={otpValue}
                              onChange={(value) => setOtpValue(value)}
                            >
                              <InputOTPGroup className="gap-2">
                                {[0, 1, 2, 3, 4, 5].map((index) => (
                                  <InputOTPSlot
                                    key={index}
                                    index={index}
                                    className="w-12 h-12 text-xl bg-slate-900/50 border-white/20 text-white rounded-lg"
                                  />
                                ))}
                              </InputOTPGroup>
                            </InputOTP>
                          </div>
                        </div>
                        <Button
                          onClick={handleVerifyOTP}
                          className="w-full bg-gradient-to-r from-primary to-purple-600"
                          disabled={loading || otpValue.length !== 6}
                        >
                          {loading ? (
                            <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                          ) : (
                            <>
                              <Check className="w-5 h-5 mr-2" />
                              Verify
                            </>
                          )}
                        </Button>
                        <div className="text-center">
                          <button
                            onClick={handleSendResetOTP}
                            disabled={resendCooldown > 0 || loading}
                            className={`text-sm transition-colors ${
                              resendCooldown > 0
                                ? "text-white/30 cursor-not-allowed"
                                : "text-primary hover:text-primary/80"
                            }`}
                          >
                            {resendCooldown > 0 ? (
                              <span className="flex items-center gap-1 justify-center">
                                <RefreshCw className="w-4 h-4" />
                                Resend ({resendCooldown}s)
                              </span>
                            ) : (
                              <span className="flex items-center gap-1 justify-center">
                                <RefreshCw className="w-4 h-4" />
                                Resend OTP
                              </span>
                            )}
                          </button>
                        </div>
                      </motion.div>
                    )}

                    {/* Step 3: New Password */}
                    {resetStep === "newPassword" && (
                      <motion.div
                        initial={{ opacity: 0, x: 20 }}
                        animate={{ opacity: 1, x: 0 }}
                        className="space-y-4"
                      >
                        <div className="space-y-2">
                          <Label className="text-white/80">New Password</Label>
                          <div className="relative">
                            <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-white/40" />
                            <Input
                              type={showNewPassword ? "text" : "password"}
                              placeholder="At least 6 characters"
                              value={newPassword}
                              onChange={(e) => setNewPassword(e.target.value)}
                              className="pl-10 pr-10 bg-slate-900/50 border-white/10 text-white placeholder:text-white/30"
                            />
                            <button
                              type="button"
                              onClick={() => setShowNewPassword(!showNewPassword)}
                              className="absolute right-3 top-1/2 -translate-y-1/2 text-white/40 hover:text-white/60"
                            >
                              {showNewPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                            </button>
                          </div>
                        </div>
                        <div className="space-y-2">
                          <Label className="text-white/80">Confirm Password</Label>
                          <div className="relative">
                            <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-white/40" />
                            <Input
                              type={showConfirmNewPassword ? "text" : "password"}
                              placeholder="Re-enter password"
                              value={confirmNewPassword}
                              onChange={(e) => setConfirmNewPassword(e.target.value)}
                              className="pl-10 pr-10 bg-slate-900/50 border-white/10 text-white placeholder:text-white/30"
                            />
                            <button
                              type="button"
                              onClick={() => setShowConfirmNewPassword(!showConfirmNewPassword)}
                              className="absolute right-3 top-1/2 -translate-y-1/2 text-white/40 hover:text-white/60"
                            >
                              {showConfirmNewPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                            </button>
                          </div>
                        </div>
                        <Button
                          onClick={handleSetNewPassword}
                          className="w-full bg-gradient-to-r from-green-500 to-emerald-600"
                          disabled={loading}
                        >
                          {loading ? (
                            <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                          ) : (
                            <>
                              <Check className="w-5 h-5 mr-2" />
                              Update Password
                            </>
                          )}
                        </Button>
                      </motion.div>
                    )}
                  </motion.div>
                </motion.div>
              )}
            </AnimatePresence>
          </CardContent>
        </Card>
        )}

        {/* Footer note */}
        <p className="text-center text-white/40 text-sm mt-6">
          After signing up, please contact the<br />
          system administrator for admin access
        </p>
      </motion.div>
    </div>
  );
}
