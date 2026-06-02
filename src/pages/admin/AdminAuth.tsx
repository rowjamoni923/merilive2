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
import { ADMIN_REALTIME_EVENT, type AdminTableUpdateEvent } from "@/hooks/useAdminRealtime";
import { grantAdminAccess, revokeAdminAccess, getAdminLinkKind, getAdminLinkChallenge, getAdminLinkToken, setAdminLinkChallenge, setAdminLinkKind } from "@/utils/adminAccessStorage";
import { getDeviceFingerprint } from "@/utils/deviceFingerprint";
import { toast } from "sonner";
import { z } from "zod";
import { recordAdminError } from "@/utils/adminErrorLog";
import { useEnableBrowserPageInteraction } from "@/hooks/useEnableBrowserPageInteraction";

import { formatAdminError } from "@/utils/formatAdminError";
const loginSchema = z.object({
  email: z.string().email("Please enter a valid email"),
  password: z.string().min(6, "Password must be at least 6 characters"),
});

type FlowState = 'login' | 'pending_approval' | 'rejected';

interface PendingAuthData {
  email: string;
  display_name: string | null;
  role: 'owner' | 'sub_admin';
  is_owner: boolean;
  must_change_password: boolean;
}

export default function AdminAuth() {
  // Public browser admin entry — enable native scroll + pinch-zoom.
  useEnableBrowserPageInteraction();
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
  const [pendingSessionToken, setPendingSessionToken] = useState<string | null>(null);
  const [pendingAuthData, setPendingAuthData] = useState<PendingAuthData | null>(null);
  const [rejectionReason, setRejectionReason] = useState<string | null>(null);
  const [failedAttempts, setFailedAttempts] = useState(0);
  const MAX_LOGIN_ATTEMPTS = 3;

  // After 3 failed login attempts on the owner/sub-admin secret link, kick
  // the visitor out to the public landing page. Prevents brute-force probing
  // and matches the user's "auto-redirect to landing on repeated failure" rule.
  const handleAuthFailure = (reason: string) => {
    const next = failedAttempts + 1;
    setFailedAttempts(next);
    toast.error(reason);
    if (next >= MAX_LOGIN_ATTEMPTS) {
      toast.error(`Too many failed attempts. Redirecting...`);
      revokeAdminAccess();
      clearAdminSession();
      setTimeout(() => {
        window.location.replace('/landing');
      }, 600);
    }
  };

  const getAdminAuthPath = () => {
    const accessToken = getAdminLinkToken() || searchParams.get('access')?.trim() || null;
    return accessToken
      ? `/admin/auth?access=${encodeURIComponent(accessToken)}`
      : '/admin/auth';
  };

  // Pre-fill email from URL
  useEffect(() => {
    const emailParam = searchParams.get('email');
    if (emailParam) setEmail(decodeURIComponent(emailParam));
  }, [searchParams]);

  // If already signed in, always enter admin instantly — even from a fresh
  // owner/sub-admin secret link. Never trap an existing valid admin session on
  // the login form unless the user manually logged out.
  useEffect(() => {
    const existing = getAdminSession();
    if (existing) {
      grantAdminAccess(existing.is_owner);
      navigate('/admin', { replace: true });
    }
  }, [navigate, searchParams]);

  // Poll device status while in pending state — auto-redirect when owner approves
  useEffect(() => {
    if (flow !== 'pending_approval' || !pendingAdminId || !pendingFingerprint || !pendingSessionToken) return;

    let cancelled = false;
    const checkStatus = async () => {
      try {
        setAdminSessionToken(pendingSessionToken);
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
          setAdminSessionToken(null);
          setPendingSessionToken(null);
          setRejectionReason(result.rejection_reason || 'Device access rejected by owner');
          setFlow('rejected');
        } else {
          setAdminSessionToken(null);
        }
      } catch (e) {
        setAdminSessionToken(null);
        console.warn('[AdminAuth] poll error', e);
      }
    };

    // Immediate one-shot check; realtime subscription below handles instant updates.
    checkStatus();

    const handleDeviceApprovalSync = (event: Event) => {
      const detail = (event as CustomEvent<AdminTableUpdateEvent>).detail;
      if (detail?.table === 'admin_allowed_devices') void checkStatus();
    };
    window.addEventListener(ADMIN_REALTIME_EVENT, handleDeviceApprovalSync);

    return () => {
      cancelled = true;
      window.removeEventListener(ADMIN_REALTIME_EVENT, handleDeviceApprovalSync);
    };
  }, [flow, pendingAdminId, pendingFingerprint, pendingSessionToken]);

  const completeLoginAfterApproval = async () => {
    // Device approval already belongs to the pending server session created by
    // the secret-link challenge login. Do NOT re-authenticate here: the login
    // challenge is single-use by design.
    if (!pendingAdminId || !pendingFingerprint || !pendingSessionToken || !pendingAuthData) {
      toast.error('Please log in again');
      setFlow('login');
      return;
    }
    const linkKind = getAdminLinkKind();
    if (linkKind === 'owner' && !pendingAuthData.is_owner) {
      toast.error('This is the Owner secret link. Sub-admins must use the Sub-Admin link.');
      revokeAdminAccess();
      setFlow('login');
      return;
    }
    if (linkKind === 'sub_admin' && pendingAuthData.is_owner) {
      toast.error('This is the Sub-Admin secret link. Owners must use the Owner link.');
      revokeAdminAccess();
      setFlow('login');
      return;
    }
    saveAdminSession({
      admin_id: pendingAdminId,
      email: pendingAuthData.email,
      display_name: pendingAuthData.display_name,
      role: pendingAuthData.role,
      is_owner: pendingAuthData.is_owner,
      must_change_password: pendingAuthData.must_change_password,
      device_fingerprint: pendingFingerprint,
      session_token: pendingSessionToken,
    });
    grantAdminAccess(false);
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
      const accessToken = getAdminLinkToken() || searchParams.get('access')?.trim() || null;
      if (!accessToken) {
        toast.error('Access link missing or expired. Please reopen the secret link.');
        revokeAdminAccess();
        navigate(getAdminAuthPath(), { replace: true });
        return;
      }

      // Always refresh the short-lived server challenge at submit time. The
      // already-created owner/sub-admin link remains the authority, but users
      // should not get locked out just because the login page stayed open for
      // more than a few minutes before they typed credentials.
      const { data: linkData, error: linkError } = await adminSupabase.functions.invoke('validate-admin-token', {
        body: { token: accessToken },
      });
      if (linkError || !linkData?.valid || typeof linkData.challenge !== 'string') {
        toast.error('Secret link verification failed. Please use the latest valid admin link.');
        revokeAdminAccess();
        navigate(getAdminAuthPath(), { replace: true });
        return;
      }
      const refreshedLinkKind = linkData.role === 'owner' ? 'owner' : 'sub_admin';
      setAdminLinkKind(refreshedLinkKind);
      setAdminLinkChallenge(linkData.challenge);

      // Step 1: Authenticate via custom RPC (no auth.users)
      const { data: authData, error: authError } = await adminSupabase.rpc('admin_authenticate' as any, {
        _email: email.trim().toLowerCase(),
        _password: password,
        _link_challenge: getAdminLinkChallenge(),
      });

      if (authError) throw authError;
      const auth = authData as any;
      if (!auth?.success) {
        toast.error(auth?.error || 'Invalid credentials');
        return;
      }

      // ─── STRICT LINK-ROLE ENFORCEMENT ───────────────────────────
      // Owner secret link → only owners may sign in.
      // Sub-admin secret link → only sub-admins may sign in.
      // This is independent of credentials: even with a valid password,
      // wrong-link logins are rejected before any session is created.
      const linkKind = getAdminLinkKind();
      if (!linkKind) {
        toast.error('Access link missing or expired. Please use a valid secret link.');
        revokeAdminAccess();
        navigate(getAdminAuthPath(), { replace: true });
        return;
      }
      if (linkKind === 'owner' && !auth.is_owner) {
        toast.error('This is the Owner secret link. Sub-admins must use the Sub-Admin link.');
        revokeAdminAccess();
        return;
      }
      if (linkKind === 'sub_admin' && auth.is_owner) {
        toast.error('This is the Sub-Admin secret link. Owners must use the Owner link.');
        revokeAdminAccess();
        return;
      }

      setAdminSessionToken(auth.session_token);

      const fp = getDeviceFingerprint();

      // ─── OWNER LINK → AUTO-BIND SERVER DEVICE SESSION ───────────
      // Owner secret link skips manual approval, but the server session still
      // must be bound to this device. RLS/admin RPCs validate x-admin-token by
      // joining admin_sessions.device_fingerprint to admin_allowed_devices.
      if (linkKind === 'owner' && auth.is_owner) {
        const { data: ownerDeviceData, error: ownerDeviceError } = await adminSupabase.rpc('admin_request_device_access' as any, {
          _admin_id: auth.admin_id,
          _device_fingerprint: fp.fingerprint,
          _device_name: fp.deviceName,
          _device_info: fp.details,
          _ip_address: null,
          _user_agent: navigator.userAgent,
        });
        if (ownerDeviceError) throw ownerDeviceError;
        const ownerDevice = ownerDeviceData as any;
        if (ownerDevice?.status !== 'approved') {
          throw new Error(ownerDevice?.error || 'Owner device session could not be verified');
        }
        saveAdminSession({
          admin_id: auth.admin_id,
          email: auth.email,
          display_name: auth.display_name,
          role: auth.role,
          is_owner: true,
          must_change_password: !!auth.must_change_password,
          device_fingerprint: fp.fingerprint,
          session_token: auth.session_token,
        });
        setAdminSessionToken(auth.session_token);
        grantAdminAccess(true);
        if (typeof window !== 'undefined') {
          window.dispatchEvent(new Event('admin-session-change'));
        }
        toast.success(`Welcome ${auth.display_name || auth.email}!`);
        navigate('/admin', { replace: true });
        return;
      }

      // ─── SUB-ADMIN LINK → DEVICE VERIFICATION REQUIRED ──────────
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
        saveAdminSession({
          admin_id: auth.admin_id,
          email: auth.email,
          display_name: auth.display_name,
          role: auth.role,
          is_owner: !!auth.is_owner,
          must_change_password: !!auth.must_change_password,
          device_fingerprint: fp.fingerprint,
          session_token: auth.session_token,
        });
        setAdminSessionToken(auth.session_token);
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
        setPendingSessionToken(auth.session_token);
        setPendingAuthData({
          email: auth.email,
          display_name: auth.display_name ?? null,
          role: auth.role,
          is_owner: !!auth.is_owner,
          must_change_password: !!auth.must_change_password,
        });
        setPendingDeviceId(device.device_id);
        setAdminSessionToken(null);
        setFlow('pending_approval');
        toast.info('Waiting for owner approval...');
      } else if (device?.status === 'rejected') {
        setAdminSessionToken(null);
        setRejectionReason(device.error || 'Device access rejected by owner');
        setFlow('rejected');
      } else {
        setAdminSessionToken(null);
        toast.error('Unexpected device status');
      }
    } catch (err: any) {
      setAdminSessionToken(null);
      console.error('[AdminAuth] login error', err);
      recordAdminError({ kind: "rpc", label: "AdminAuth.device", message: formatAdminError(err) });
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
    setPendingSessionToken(null);
    setPendingAuthData(null);
    setAdminSessionToken(null);
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
