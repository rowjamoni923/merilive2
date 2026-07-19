import { useState, useCallback } from 'react';
import { Capacitor } from '@capacitor/core';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

interface NativeGoogleAuthResult {
  success: boolean;
  error?: string;
}

/**
 * Native Google Authentication Hook
 * Uses Firebase Authentication SDK on Android/iOS
 * Gets the GOOGLE ID TOKEN (not Firebase token) for Supabase
 */
export const useNativeGoogleAuth = () => {
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();

  const signInWithGoogle = useCallback(async (): Promise<NativeGoogleAuthResult> => {
    setLoading(true);
    
    try {
      const isNative = Capacitor.isNativePlatform();
      console.log('[GoogleAuth] Platform:', isNative ? 'Native' : 'Web');
      console.log('[GoogleAuth] Starting authentication flow...');
      
      if (isNative) {
        // Native platform - use Firebase Authentication
        console.log('[GoogleAuth] Using Firebase Google Sign-In...');
        console.log('[GoogleAuth] Importing FirebaseAuthentication plugin...');
        
        try {
          const { FirebaseAuthentication } = await import('@capacitor-firebase/authentication');
          console.log('[GoogleAuth] Plugin imported successfully');
          
          // Add timeout to prevent infinite loading
          const timeoutPromise = new Promise<never>((_, reject) => {
            setTimeout(() => {
              reject(new Error('TIMEOUT: Google Sign-In took too long (30s). Please check your internet connection and try again.'));
            }, 30000); // 30 second timeout
          });
          
          console.log('[GoogleAuth] Calling signInWithGoogle()...');
          console.log('[GoogleAuth] This should open Google account picker...');
          
          // Race between sign-in and timeout
          const result = await Promise.race([
            FirebaseAuthentication.signInWithGoogle(),
            timeoutPromise
          ]);
          
          console.log('[GoogleAuth] Firebase result:', result?.user?.email);
          console.log('[GoogleAuth] Credential:', result?.credential);
          
          if (!result?.user) {
            throw new Error('Google Sign-In was cancelled');
          }
          
          // IMPORTANT: Get the GOOGLE ID TOKEN from the credential, NOT Firebase ID token!
          // The credential.idToken is the raw Google ID token we need for Supabase
          const googleIdToken = result.credential?.idToken;
          
          if (!googleIdToken) {
            console.error('[GoogleAuth] No Google ID token in credential!');
            console.log('[GoogleAuth] Full credential object:', JSON.stringify(result.credential));
            
            // Fallback: Try getting Firebase ID token (might not work with Supabase)
            console.log('[GoogleAuth] Trying Firebase ID token as fallback...');
            const tokenResult = await FirebaseAuthentication.getIdToken();
            
            if (!tokenResult?.token) {
              throw new Error('Could not get token from Firebase');
            }
            
            // Try with Firebase token (less likely to work)
            console.log('[GoogleAuth] Using Firebase token for Supabase...');
            const { data, error } = await supabase.auth.signInWithIdToken({
              provider: 'google',
              token: tokenResult.token,
            });

            if (error) {
              console.error('[GoogleAuth] Supabase error with Firebase token:', error);
              throw new Error('Firebase token not accepted. Please check Supabase Google provider settings.');
            }

            if (data.session) {
              console.log('[GoogleAuth] Login successful with Firebase token!');
              toast({
                title: "Welcome! 🎉",
                description: `${result.user.displayName || 'User'}, you have logged in successfully!`,
              });
              return { success: true };
            }
          }
          
          console.log('[GoogleAuth] Got Google ID token, signing in with Supabase...');
          
          // Sign in with Supabase using the GOOGLE ID token
          const { data, error } = await supabase.auth.signInWithIdToken({
          });

          if (error) {
            console.error('[GoogleAuth] Supabase error:', error);
            throw error;
          }

          if (data.session) {
            console.log('[GoogleAuth] Login successful!');
            toast({
            });
            return { success: true };
          }

          throw new Error('Session not created');
          
        } catch (nativeError: any) {
          console.error('[GoogleAuth] Firebase sign-in error:', nativeError);
          console.error('[GoogleAuth] Error message:', nativeError?.message);
          console.error('[GoogleAuth] Error code:', nativeError?.code);
          console.error('[GoogleAuth] Full error:', JSON.stringify(nativeError, null, 2));
          
          // Check for timeout
          if (nativeError.message?.includes('TIMEOUT')) {
            toast({
              variant: "destructive",
            });
            return { success: false, error: 'Timeout' };
          }
          
          // Check for user cancellation
          if (nativeError.message?.includes('cancel') || 
              nativeError.message?.includes('closed') ||
              nativeError.code === 'SIGN_IN_CANCELLED' ||
              nativeError.message?.includes('popup') ||
              nativeError.message?.includes('12501')) {
            toast({
            });
            return { success: false, error: 'User cancelled' };
          }
          
          // Check for network errors
          if (nativeError.message?.includes('network') || 
              nativeError.message?.includes('internet') ||
              nativeError.message?.includes('NETWORK_ERROR') ||
              nativeError.code === 'NETWORK_ERROR') {
            throw new Error('Please check your internet connection');
          }
          
          // Check for Firebase configuration errors (Error 10)
          if (nativeError.message?.includes('10') || 
              nativeError.message?.includes('DEVELOPER_ERROR') ||
              nativeError.message?.includes('ApiException: 10')) {
            throw new Error('SHA-1 fingerprint mismatch. Check SHA-1 in Firebase Console.');
          }
          
          // Check for missing credentials
          if (nativeError.message?.includes('No credentials') ||
              nativeError.message?.includes('credential')) {
            throw new Error('No Google Account logged in on device. Go to Settings > Accounts.');
          }
          
          // Check for other configuration errors
          if (nativeError.message?.includes('Firebase') || 
              nativeError.message?.includes('configuration') ||
              nativeError.message?.includes('API key')) {
            throw new Error('Firebase configuration issue. Please update the app.');
          }
          
          throw nativeError;
        }
      } else {
        // Web platform - Google OAuth not available in preview
        console.log('[GoogleAuth] Web preview detected - Firebase Google only works on native');
        
        toast({
        });
        
        return { success: false, error: 'Web preview - use native app' };
      }
    } catch (error: any) {
      console.error('[GoogleAuth] Final error:', error);
      
      // Provide user-friendly error messages
      let errorMessage = 'Google sign-in failed';
      
      if (error.message) {
        if (error.message.includes('network') || error.message.includes('internet')) {
          errorMessage = 'Please check your internet connection';
        } else if (error.message.includes('SHA-1') || error.message.includes('fingerprint')) {
          errorMessage = 'App configuration error. Please reinstall from Play Store.';
        } else if (error.message.includes('token') || error.message.includes('auth')) {
          errorMessage = 'Authentication error. Please try again.';
        } else if (error.message.includes('configuration') || error.message.includes('client')) {
          errorMessage = 'App configuration error. Please contact support.';
        } else {
          errorMessage = error.message;
        }
      }
      
      toast({
      });
      
      return { success: false, error: errorMessage };
    } finally {
      setLoading(false);
    }
  }, [toast]);

  const signOut = useCallback(async () => {
    try {
      if (Capacitor.isNativePlatform()) {
        const { FirebaseAuthentication } = await import('@capacitor-firebase/authentication');
        await FirebaseAuthentication.signOut();
      }
      localStorage.setItem('meri_manual_logout', 'true');
      await supabase.auth.signOut({ scope: 'local' });
    } catch (error) {
      console.error('[GoogleAuth] Sign out error:', error);
    }
  }, []);

  return {
    signInWithGoogle,
    signOut,
    loading,
  };
};

export default useNativeGoogleAuth;
