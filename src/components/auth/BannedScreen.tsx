import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { ShieldX, LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { navigateInAppPath } from "@/utils/inAppNavigation";

/**
 * Full-screen banned account overlay.
 * Shown when a user's profile has is_blocked = true.
 * Shows the ban reason from profiles.blocked_reason.
 */
const BannedScreen = () => {
  const [banReason, setBanReason] = useState<string | null>(null);

  useEffect(() => {
    const fetchReason = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data } = await supabase
        .from('profiles')
        .select('blocked_reason')
        .eq('id', user.id)
        .single();

      if (data?.blocked_reason) {
        setBanReason(data.blocked_reason);
      }
    };
    fetchReason();
  }, []);

  const handleLogout = () => {
    // INSTANT: flag + redirect, cleanup in background
    try { localStorage.setItem('meri_manual_logout', 'true'); } catch {}
    navigateInAppPath('/auth', { replace: true });
    void import('@/utils/nativeSessionStorage').then(({ clearNativeSession }) => clearNativeSession()).catch(() => {});
    void supabase.auth.signOut({ scope: 'local' }).catch(() => {});
  };

  return (
    <div className="fixed inset-0 z-[9999] bg-black flex items-center justify-center p-6">
      <motion.div
        initial={{ scale: 0.8, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        className="max-w-md w-full text-center space-y-6"
      >
        {/* Icon */}
        <motion.div
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          transition={{ delay: 0.2, type: "spring" }}
          className="mx-auto w-24 h-24 rounded-full bg-gradient-to-br from-red-500/30 to-red-900/30 border-2 border-red-500/50 flex items-center justify-center"
        >
          <ShieldX className="w-12 h-12 text-red-400" />
        </motion.div>

        {/* Title */}
        <motion.h1
          initial={{ y: 20, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ delay: 0.3 }}
          className="text-2xl font-bold text-white"
        >
          Your Account Has Been Permanently Banned
        </motion.h1>

        {/* Description */}
        <motion.p
          initial={{ y: 20, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ delay: 0.4 }}
          className="text-white/60 text-sm leading-relaxed"
        >
          Your account has been permanently suspended for violating our Community Guidelines. 
          If you believe this is a mistake, please contact our support team.
        </motion.p>

        {/* Ban Reason */}
        {banReason && (
          <motion.div
            initial={{ y: 20, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ delay: 0.45 }}
            className="bg-red-500/10 border border-red-500/30 rounded-xl p-4"
          >
            <p className="text-red-300 text-xs font-medium mb-1.5">🚫 Ban Reason</p>
            <p className="text-white/90 text-sm font-medium">{banReason}</p>
          </motion.div>
        )}

        {/* Support info */}
        <motion.div
          initial={{ y: 20, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ delay: 0.5 }}
          className="bg-slate-800/50 border border-slate-700 rounded-xl p-4"
        >
          <p className="text-white/50 text-xs font-medium mb-1">Support Email</p>
          <p className="text-white/80 text-sm">support@merilive.com</p>
        </motion.div>

        {/* Logout button */}
        <motion.div
          initial={{ y: 20, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ delay: 0.6 }}
        >
          <Button
            onClick={handleLogout}
            variant="outline"
            className="w-full bg-white/5 border-white/10 text-white hover:bg-white/10"
          >
            <LogOut className="w-4 h-4 mr-2" />
            Log Out
          </Button>
        </motion.div>
      </motion.div>
    </div>
  );
};

export default BannedScreen;
