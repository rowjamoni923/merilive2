import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { CheckCircle2, XCircle } from 'lucide-react';
import { getPersistentDeviceId } from '@/utils/persistentDeviceId';
import { Capacitor } from '@capacitor/core';
import { recordClientError } from "@/utils/clientErrorLog";

/**
 * OAuth Callback Handler
 * This page handles the redirect from OAuth (web only)
 * Native apps use Native Google Sign-In SDK which doesn't need this callback
 * But this still works as a fallback for web browsers
 */
const AuthCallback = () => {
  const navigate = useNavigate();
  const [status, setStatus] = useState<'loading' | 'success' | 'error'>('loading');
  const [message, setMessage] = useState('meriLIVE');

  useEffect(() => {
    const handleCallback = async () => {
      try {
        // CRITICAL: Block web-based OAuth registration
        if (!Capacitor.isNativePlatform()) {
          setStatus('error');
          setMessage('📱 Please use the meriLIVE app to sign in.');
          setTimeout(() => navigate('/auth'), 2000);
          return;
        }

        // Get the current URL hash/params for OAuth tokens
        const hashParams = new URLSearchParams(window.location.hash.substring(1));
        const queryParams = new URLSearchParams(window.location.search);
        
        // Check for error in URL
        const error = hashParams.get('error') || queryParams.get('error');
        if (error) {
          setStatus('error');
          setMessage('Login was cancelled.');
          setTimeout(() => navigate('/auth'), 2000);
          return;
        }

        setMessage('Verifying session...');

        // Try to get session - Supabase handles the token exchange automatically
        const { data: { session }, error: sessionError } = await supabase.auth.getSession();
        
        if (sessionError) {
          console.error('Session error:', sessionError);
          recordClientError({ label: "AuthCallback.error", message: sessionError instanceof Error ? sessionError.message : String(sessionError) });
          setStatus('error');
          setMessage('Failed to create session. Please try again.');
          setTimeout(() => navigate('/auth'), 2000);
          return;
        }

        if (session) {
          setStatus('success');
          setMessage('Signed in successfully!');
          
          // Get device ID for duplicate check and profile linking
          let deviceId: string | null = null;
          try {
            deviceId = await getPersistentDeviceId();
          } catch (e) {
            console.warn('Could not get device ID:', e);
          }

          // CRITICAL: Check if this device already has a DIFFERENT account
          if (deviceId) {
            const { data: existingDeviceProfile } = await supabase
              .from("profiles")
              .select("id, display_name")
              .eq("device_id", deviceId)
              .eq("is_deleted", false)
              .neq("id", session.user.id)
              .maybeSingle();

            if (existingDeviceProfile) {
              // This device already has another account - sign out and redirect
              console.warn('[AuthCallback] Device already has account:', existingDeviceProfile.id);
              
              // Create admin notice for duplicate device detection
              try {
                await supabase.from('admin_notices').insert({
                  title: '🚨 Duplicate Device Detected',
                  message: `New Account: ${session.user.id}\nExisting Account: ${existingDeviceProfile.display_name} (${existingDeviceProfile.id})\nDevice ID: ${deviceId}\nAction: Registration blocked`,
                  priority: 'urgent',
                  target_audience: ['owner', 'admin'],
                  is_active: true,
                });
              } catch (notifErr) {
                console.error('[AuthCallback] Failed to create admin notice:', notifErr);
                recordClientError({ label: "AuthCallback.error", message: notifErr instanceof Error ? notifErr.message : String(notifErr) });
              }
              
              localStorage.setItem('meri_manual_logout', 'true');
              await supabase.auth.signOut({ scope: 'local' });
              setStatus('error');
              setMessage(`This device already has an account (${existingDeviceProfile.display_name}). One device = one account.`);
              setTimeout(() => navigate('/auth'), 3000);
              return;
            }
          }

          // Handle pending registration data (gender, name, etc.)
          const pendingData = localStorage.getItem("meri_pending_registration");
          if (pendingData) {
            try {
              const pending = JSON.parse(pendingData);
              localStorage.removeItem("meri_pending_registration");

              const isHost = pending.gender === "female";
              
              // Check if profile exists
              const { data: existingProfile } = await supabase
                .from("profiles")
                .select("id")
                .eq("id", session.user.id)
                .maybeSingle();
              
              if (existingProfile) {
                await supabase
                  .from("profiles")
                  .update({ 
                    gender: pending.gender,
                    display_name: pending.displayName,
                    ...(deviceId && { device_id: deviceId }),
                  })
                  .eq("id", session.user.id);
              } else {
                await supabase
                  .from("profiles")
                  .insert({ 
                    id: session.user.id,
                    ...(deviceId && { device_id: deviceId }),
                  });
              }

              // Handle invitation tracking (Pkg317: server-side RPC)
              const inviterRef = localStorage.getItem("meri_pending_invitation_ref");
              if (inviterRef) {
                localStorage.removeItem("meri_pending_invitation_ref");
                try {
                  const { data: invRes } = await supabase.rpc('record_invitation', {
                    _inviter_app_uid: inviterRef,
                  } as any);
                  console.log('[AuthCallback] Invitation result:', invRes);
                } catch (invErr) {
                  console.error('[AuthCallback] Error tracking invitation:', invErr);
                  recordClientError({ label: "AuthCallback.inviterRef", message: invErr instanceof Error ? invErr.message : String(invErr) });
                }
              }


              // Handle agency referral
              const pendingReferral = localStorage.getItem("meri_pending_referral");
              if (pendingReferral && isHost) {
                await supabase.rpc('join_agency', {
                  _host_id: session.user.id,
                  _agency_code: pendingReferral.trim().toUpperCase(),
                    _joined_via: 'agency_link'
                });
                localStorage.removeItem("meri_pending_referral");
              }
            } catch (e) {
              console.error('Error handling pending registration:', e);
              recordClientError({ label: "AuthCallback.pendingReferral", message: e instanceof Error ? e.message : String(e) });
            }
          } else if (deviceId) {
            // Even without pending data, link device_id to existing profile if not set
            await supabase
              .from("profiles")
              .update({ device_id: deviceId })
              .eq("id", session.user.id)
              .is("device_id", null);
          }
          
          // Navigate to home
          setTimeout(() => navigate('/'), 500);
        } else {
          // No session yet — poll briefly with backoff
          setMessage('Creating session...');

          let attempts = 0;
          const maxAttempts = 8; // ~3s total, faster perceived response
          const delays = [300, 400, 500, 500, 500, 500, 500, 500];

          const checkSession = async () => {
            attempts++;
            const { data: { session: retrySession } } = await supabase.auth.getSession();

            if (retrySession) {
              setStatus('success');
              setMessage('Signed in successfully!');
              setTimeout(() => navigate('/'), 250);
            } else if (attempts < maxAttempts) {
              setTimeout(checkSession, delays[attempts] ?? 500);
            } else {
              setStatus('error');
              setMessage('Login failed. Please try again.');
              setTimeout(() => navigate('/auth'), 1500);
            }
          };

          setTimeout(checkSession, delays[0]);
        }
      } catch (err) {
        console.error('Auth callback error:', err);
        recordClientError({ label: "AuthCallback.checkSession", message: err instanceof Error ? err.message : String(err) });
        setStatus('error');
        setMessage('Something went wrong. Please try again.');
        setTimeout(() => navigate('/auth'), 2000);
      }
    };

    handleCallback();
  }, [navigate]);

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="text-center space-y-6 max-w-sm">
        {/* Logo */}
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-gradient">meriLIVE</h1>
        </div>

        {/* Status Icon */}
        {status === 'loading' && (
          <div className="w-20 h-20 rounded-full bg-primary/10 flex items-center justify-center mx-auto">
            <span className="text-2xl font-black text-primary">M</span>
          </div>
        )}
        {status === 'success' && (
          <div className="w-20 h-20 rounded-full bg-green-500/20 flex items-center justify-center mx-auto">
            <CheckCircle2 className="w-10 h-10 text-green-500" />
          </div>
        )}
        {status === 'error' && (
          <div className="w-20 h-20 rounded-full bg-red-500/20 flex items-center justify-center mx-auto">
            <XCircle className="w-10 h-10 text-red-500" />
          </div>
        )}

        {/* Message */}
        <div className="space-y-2">
          <p className="text-lg font-medium text-foreground">{message}</p>
          {status === 'success' && (
            <p className="text-sm text-muted-foreground">Taking you to home page...</p>
          )}
          {status === 'error' && (
            <p className="text-sm text-muted-foreground">Returning to login page...</p>
          )}
        </div>

      </div>
    </div>
  );
};

export default AuthCallback;

