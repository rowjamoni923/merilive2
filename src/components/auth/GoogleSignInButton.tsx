import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { useNativeGoogleAuth } from "@/hooks/useNativeGoogleAuth";
import { supabase } from "@/integrations/supabase/client";
import { getPersistentDeviceId } from "@/utils/persistentDeviceId";
import { Capacitor } from "@capacitor/core";

// Premium 3D Google "G" Logo with glow
const GoogleLogo = () => (
  <div className="relative w-5 h-5 mr-2">
    <svg className="w-full h-full drop-shadow-[0_2px_4px_rgba(66,133,244,0.4)]" viewBox="0 0 24 24">
      <defs>
        <linearGradient id="googleBlue" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#5c9fff" />
          <stop offset="100%" stopColor="#4285F4" />
        </linearGradient>
        <linearGradient id="googleGreen" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#5fd47b" />
          <stop offset="100%" stopColor="#34A853" />
        </linearGradient>
        <linearGradient id="googleYellow" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#ffd966" />
          <stop offset="100%" stopColor="#FBBC05" />
        </linearGradient>
        <linearGradient id="googleRed" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#f87171" />
          <stop offset="100%" stopColor="#EA4335" />
        </linearGradient>
      </defs>
      <path
        fill="url(#googleBlue)"
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
      />
      <path
        fill="url(#googleGreen)"
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
      />
      <path
        fill="url(#googleYellow)"
        d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
      />
      <path
        fill="url(#googleRed)"
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
      />
    </svg>
  </div>
);

interface GoogleSignInButtonProps {
  agreed: boolean;
  referralCode: string | null;
  onSuccess: () => void;
}

export const GoogleSignInButton = ({ agreed, referralCode, onSuccess }: GoogleSignInButtonProps) => {
  const { signInWithGoogle, loading } = useNativeGoogleAuth();
  const { toast } = useToast();

  const handleGoogleSignIn = async () => {
    // CRITICAL: Only allow registration from native app
    if (!Capacitor.isNativePlatform()) {
      toast({
        title: "📱 App Required",
        description: "Please download the meriLIVE app to sign in with Google.",
        variant: "destructive",
      });
      return;
    }

    if (!agreed) {
      toast({
        title: "Accept Terms",
        description: "Please agree to User Agreement and Privacy Policy to continue.",
        variant: "destructive",
      });
      return;
    }

    // CRITICAL: Check if this device already has an account before allowing Google sign-in
    try {
      const deviceId = await getPersistentDeviceId();
      const { data: existingProfile } = await supabase
        .from("profiles")
        .select("id, display_name, device_id")
        .eq("device_id", deviceId)
        .eq("is_deleted", false)
        .maybeSingle();

      if (existingProfile) {
        toast({
          title: "⚠️ Account Already Exists",
          description: `This device already has an account (${existingProfile.display_name}). One device can only have one account.`,
          variant: "destructive",
        });
        return;
      }
    } catch (err) {
      console.warn('[GoogleSignIn] Device check failed, proceeding:', err);
    }

    // Store referral code for after OAuth callback
    if (referralCode) {
      localStorage.setItem("meri_pending_referral", referralCode);
    }

    const result = await signInWithGoogle();
    
    if (result.success) {
      // Check if profile needs to be completed (gender selection)
      const { data: { user } } = await supabase.auth.getUser();
      
      if (user) {
        const { data: profile } = await supabase
          .from("profiles")
          .select("gender, display_name")
          .eq("id", user.id)
          .maybeSingle();

        // If no profile or no gender set, the Auth component will handle it
        if (!profile?.gender) {
          // Store pending registration data for gender selection
          localStorage.setItem("meri_pending_google_profile", JSON.stringify({
            userId: user.id,
            email: user.email,
            displayName: user.user_metadata?.full_name || user.email?.split('@')[0] || 'User',
          }));
          
          toast({
            title: "Almost Done!",
            description: "Please select your gender to complete registration.",
          });
          return;
        }
        
        onSuccess();
      }
    }
  };

  return (
    <Button
      onClick={handleGoogleSignIn}
      className="w-full h-11 rounded-2xl bg-gradient-to-r from-white via-gray-50 to-white hover:from-gray-50 hover:via-white hover:to-gray-50 text-gray-700 text-sm font-semibold shadow-[0_6px_24px_-6px_rgba(255,255,255,0.3)] border border-white/60 transition-all duration-300 active:scale-[0.98] backdrop-blur-md"
      disabled={loading}
    >
      {loading ? (
        <div className="w-5 h-5 border-2 border-gray-300 border-t-gray-600 rounded-full animate-spin" />
      ) : (
        <>
          <GoogleLogo />
          <span>Google</span>
        </>
      )}
    </Button>
  );
};

export default GoogleSignInButton;
