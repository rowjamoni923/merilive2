import { useState, useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { motion } from "framer-motion";
import { Shield, Mail, Lock, Eye, EyeOff, LogIn, Loader2, ArrowLeft, Smartphone, Check, X, Clock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { adminSupabase } from "@/integrations/supabase/adminClient";
import { saveAdminSession, clearAdminSession, getAdminSession, setAdminSessionToken } from "@/utils/adminSession";
import { grantAdminAccess, revokeAdminAccess } from "@/utils/adminAccessStorage";
import { getDeviceFingerprint } from "@/utils/deviceFingerprint";
import { toast } from "sonner";
import { z } from "zod";

const loginSchema = z.object({
  email: z.string().email("Please enter a valid email"),
  password: z.string().min(6, "Password must be at least 6 characters"),
});

type FlowState = 'login' | 'pending_approval' | 'rejected';

export default function AdminAuth() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [flow, setFlow] = useState<FlowState>('login');
  const [pendingDeviceId, setPendingDeviceId] = useState<string | null>(null);
  const [pendingAdminId, setPendingAdminId] = useState<string | null>(null);
  const [pendingFingerprint, setPendingFingerprint] = useState<string | null>(null);
  const [rejectionReason, setRejectionReason] = useState<string | null>(null);

  // Pre-fill email from URL
  useEffect(() => {
    const emailParam = searchParams.get('email');
    if (emailParam) setEmail(decodeURIComponent(emailParam));
  }, [searchParams]);

  // If already signed in, redirect
  useEffect(() => {
    const existing = getAdminSession();
    if (existing) {
      grantAdminAccess(existing.is_owner);
      navigate('/admin', { replace: true });
    }
  }, [navigate]);

  // Poll device status while in pending state — auto-redirect when owner approves
  useEffect(() => {
    if (flow !== 'pending_approval' || !pendingAdminId || !pendingFingerprint) return;

    let cancelled = false;
    const checkStatus = async () => {
      try {
        const { data } = await adminSupabase.rpc('admin_check_device_status' as any, {
          _admin_id: pendingAdminId,
          _device_fingerprint: pendingFingerprint,
        });
        if (cancelled) return;
        const result = data as any;
        if (result?.status === 'approved') {
          // Auto-complete login
          await completeLoginAfterApproval();
        } else if (result?.status === 'rejected') {
          setRejectionReason(result.rejection_reason || 'Device access rejected by owner');
          setFlow('rejected');
        }
      } catch (e) {
        console.warn('[AdminAuth] poll error', e);
      }
    };

    // Immediate check + interval
    checkStatus();
    const interval = setInterval(checkStatus, 4000);

    // Realtime subscription for instant approval
    const channel = adminSupabase
      .channel(`device-approval-${pendingAdminId}-${crypto.randomUUID()}`)
      .on('postgres_changes', {
        event: 'UPDATE',
        schema: 'public',
        table: 'admin_allowed_devices',
        filter: `admin_user_id=eq.${pendingAdminId}`,
      }, (payload: any) => {
        if (payload.new?.device_fingerprint === pendingFingerprint) {
          if (payload.new.status === 'approved') {
            completeLoginAfterApproval();
          } else if (payload.new.status === 'rejected') {
            setRejectionReason(payload.new.rejection_reason || 'Device access rejected');
            setFlow('rejected');
          }
        }
      })
      .subscribe();

    return () => {
      cancelled = true;
      clearInterval(interval);
      adminSupabase.removeChannel(channel);
    };
  }, [flow, pendingAdminId, pendingFingerprint]);

  const completeLoginAfterApproval = async () => {
    // Re-authenticate to retrieve full admin info & save session
    if (!email || !password) {
      toast.error('Please log in again');
      setFlow('login');
      return;
    }
    const { data, error } = await adminSupabase.rpc('admin_authenticate' as any, {
      _email: email.trim().toLowerCase(),
      _password: password,
    });
    if (error || !(data as any)?.success) {
      toast.error('Login failed after approval');
      setFlow('login');
      return;
    }
    const result = data as any;
    const fp = getDeviceFingerprint();
    saveAdminSession({
      admin_id: result.admin_id,
      email: result.email,
      display_name: result.display_name,
      role: result.role,
      is_owner: !!result.is_owner,
      must_change_password: !!result.must_change_password,
      device_fingerprint: fp.fingerprint,
      session_token: result.session_token,
    });
    setAdminSessionToken(result.session_token);
    grantAdminAccess(!!result.is_owner);
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new Event('admin-session-change'));
    }
    toast.success('✅ Device approved! Welcome.');
    navigate('/admin', { replace: true });
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    const result = loginSchema.safeParse({ email, password });
    if (!result.success) {
      toast.error(result.error.errors[0].message);
      return;
    }

    setLoading(true);
    try {
      // Step 1: Authenticate via custom RPC (no auth.users)
      const { data: authData, error: authError } = await adminSupabase.rpc('admin_authenticate' as any, {
        _email: email.trim().toLowerCase(),
        _password: password,
      });

      if (authError) throw authError;
      const auth = authData as any;
      if (!auth?.success) {
        toast.error(auth?.error || 'Invalid credentials');
        return;
      }

      // Step 2: Device approval check
      const fp = getDeviceFingerprint();
      const { data: deviceData, error: deviceError } = await adminSupabase.rpc('admin_request_device_access' as any, {
        _admin_id: auth.admin_id,
        _device_fingerprint: fp.fingerprint,
        _device_name: fp.deviceName,
        _device_info: fp.details,
        _ip_address: null,
        _user_agent: navigator.userAgent,
      });

      if (deviceError) throw deviceError;
      const device = deviceData as any;

      if (device?.status === 'approved') {
        // Owner OR previously approved sub-admin → straight in
        saveAdminSession({
          admin_id: auth.admin_id,
          email: auth.email,
          display_name: auth.display_name,
          role: auth.role,
          is_owner: !!auth.is_owner,
          must_change_password: !!auth.must_change_password,
          device_fingerprint: fp.fingerprint,
        });
        grantAdminAccess(!!auth.is_owner);
        if (typeof window !== 'undefined') {
          window.dispatchEvent(new Event('admin-session-change'));
        }
        toast.success(`Welcome ${auth.display_name || auth.email}!`);
        navigate('/admin', { replace: true });
      } else if (device?.status === 'pending') {
        // Sub-admin needs owner approval
        setPendingAdminId(auth.admin_id);
        setPendingFingerprint(fp.fingerprint);
        setPendingDeviceId(device.device_id);
        setFlow('pending_approval');
        toast.info('Waiting for owner approval...');
      } else if (device?.status === 'rejected') {
        setRejectionReason(device.error || 'Device access rejected by owner');
        setFlow('rejected');
      } else {
        toast.error('Unexpected device status');
      }
    } catch (err: any) {
      console.error('[AdminAuth] login error', err);
      toast.error(err?.message || 'Login failed');
    } finally {
      setLoading(false);
    }
  };

  const handleCancelPending = () => {
    setFlow('login');
    setPendingAdminId(null);
    setPendingDeviceId(null);
    setPendingFingerprint(null);
    setPassword('');
  };

  // ============================================
  // RENDER: PENDING APPROVAL
  // ============================================
  if (flow === 'pending_approval') {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 flex items-center justify-center p-4">
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="w-full max-w-md">
          <Card className="border-amber-500/20 bg-slate-900/80 backdrop-blur-xl">
            <CardHeader className="text-center">
              <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-amber-500 to-orange-500 flex items-center justify-center mx-auto mb-4 shadow-lg shadow-amber-500/30">
                <Smartphone className="w-10 h-10 text-white" />
              </div>
              <CardTitle className="text-2xl text-white">Awaiting Owner Approval</CardTitle>
              <CardDescription className="text-slate-400">
                Your device is new. The Owner needs to approve it before you can access the admin panel.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="rounded-xl bg-amber-500/10 border border-amber-500/20 p-4 flex items-start gap-3">
                <Clock className="w-5 h-5 text-amber-400 mt-0.5 animate-pulse" />
                <div className="flex-1">
                  <p className="text-sm font-medium text-amber-200">Watching in real-time</p>
                  <p className="text-xs text-amber-300/70 mt-1">
                    The moment the Owner approves your device, you'll be redirected automatically. Keep this page open.
                  </p>
                </div>
              </div>
              <div className="rounded-xl bg-slate-800/50 border border-white/5 p-4 space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-slate-400">Email:</span>
                  <span className="text-white font-medium">{email}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-slate-400">Device:</span>
                  <span className="text-white text-xs truncate ml-4">{getDeviceFingerprint().deviceName}</span>
                </div>
              </div>
              <div className="flex items-center justify-center gap-2 text-amber-400">
                <Loader2 className="w-4 h-4 animate-spin" />
                <span className="text-sm">Checking approval status...</span>
              </div>
              <Button onClick={handleCancelPending} variant="outline" className="w-full bg-slate-800 border-slate-700 text-white hover:bg-slate-700">
                <ArrowLeft className="w-4 h-4 mr-2" />
                Back to Login
              </Button>
            </CardContent>
          </Card>
        </motion.div>
      </div>
    );
  }

  // ============================================
  // RENDER: REJECTED
  // ============================================
  if (flow === 'rejected') {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 flex items-center justify-center p-4">
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="w-full max-w-md">
          <Card className="border-red-500/20 bg-slate-900/80 backdrop-blur-xl">
            <CardHeader className="text-center">
              <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-red-500 to-rose-600 flex items-center justify-center mx-auto mb-4 shadow-lg shadow-red-500/30">
                <X className="w-10 h-10 text-white" />
              </div>
              <CardTitle className="text-2xl text-white">Access Denied</CardTitle>
              <CardDescription className="text-slate-400">
                {rejectionReason || 'Your device access was rejected by the Owner.'}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Button onClick={handleCancelPending} variant="outline" className="w-full bg-slate-800 border-slate-700 text-white hover:bg-slate-700">
                <ArrowLeft className="w-4 h-4 mr-2" />
                Back to Login
              </Button>
            </CardContent>
          </Card>
        </motion.div>
      </div>
    );
  }

  // ============================================
  // RENDER: LOGIN FORM
  // ============================================
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 flex items-center justify-center p-4">
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="w-full max-w-md">
        <Card className="border-violet-500/20 bg-slate-900/80 backdrop-blur-xl shadow-2xl">
          <CardHeader className="text-center">
            <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-violet-500 via-purple-500 to-fuchsia-600 flex items-center justify-center mx-auto mb-4 shadow-lg shadow-violet-500/30">
              <Shield className="w-10 h-10 text-white" />
            </div>
            <CardTitle className="text-3xl text-white font-bold">Admin Panel</CardTitle>
            <CardDescription className="text-slate-400">
              Independent admin login — no user account needed
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleLogin} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="email" className="text-slate-300">Admin Email</Label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                  <Input
                    id="email"
                    type="email"
                    placeholder="admin@example.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="pl-10 bg-slate-800/50 border-slate-700 text-white placeholder:text-slate-500"
                    required
                    autoComplete="username"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="password" className="text-slate-300">Password</Label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                  <Input
                    id="password"
                    type={showPassword ? 'text' : 'password'}
                    placeholder="••••••••"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="pl-10 pr-10 bg-slate-800/50 border-slate-700 text-white placeholder:text-slate-500"
                    required
                    autoComplete="current-password"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(s => !s)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white"
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <Button
                type="submit"
                disabled={loading}
                className="w-full bg-gradient-to-r from-violet-600 to-fuchsia-600 hover:from-violet-700 hover:to-fuchsia-700 text-white font-medium"
              >
                {loading ? (
                  <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Signing in...</>
                ) : (
                  <><LogIn className="w-4 h-4 mr-2" /> Sign In to Admin Panel</>
                )}
              </Button>
            </form>

            <div className="mt-6 rounded-xl bg-slate-800/30 border border-white/5 p-3">
              <div className="flex items-start gap-2 text-xs text-slate-400">
                <Shield className="w-3.5 h-3.5 mt-0.5 text-violet-400" />
                <p>
                  <strong className="text-slate-300">Owner:</strong> Direct access, no device approval.<br />
                  <strong className="text-slate-300">Sub-Admin:</strong> First time on a new device requires Owner approval.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </motion.div>
    </div>
  );
}
