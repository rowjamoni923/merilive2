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
    <div className="fixed inset-0 z-[9999] bg-gradient-to-br from-slate-50 via-rose-50/40 to-slate-100 flex items-center justify-center p-6 overflow-hidden">
      {/* subtle decorative glows */}
      <div className="pointer-events-none absolute -top-24 -left-24 w-72 h-72 rounded-full bg-rose-300/30 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-24 -right-24 w-72 h-72 rounded-full bg-rose-200/40 blur-3xl" />

      <motion.div
        initial={{ scale: 0.92, opacity: 0, y: 12 }}
        animate={{ scale: 1, opacity: 1, y: 0 }}
        transition={{ type: "spring", stiffness: 220, damping: 22 }}
        className="relative max-w-md w-full text-center space-y-6 bg-white/95 backdrop-blur-xl rounded-3xl p-7 border border-rose-200/60"
        style={{ boxShadow: '0 30px 60px -20px rgba(244,63,94,0.25), 0 12px 24px -12px rgba(15,23,42,0.12), inset 0 1px 0 rgba(255,255,255,0.9)' }}
      >
        {/* Icon */}
        <motion.div
          initial={{ scale: 0, rotate: -20 }}
          animate={{ scale: 1, rotate: 0 }}
          transition={{ delay: 0.2, type: "spring", stiffness: 200, damping: 14 }}
          className="mx-auto w-24 h-24 rounded-full bg-gradient-to-br from-rose-500 via-red-500 to-rose-600 flex items-center justify-center"
          style={{ boxShadow: '0 18px 36px -12px rgba(244,63,94,0.55), inset 0 2px 0 rgba(255,255,255,0.35), inset 0 -8px 16px rgba(0,0,0,0.18)' }}
        >
          <ShieldX className="w-12 h-12 text-white drop-shadow" />
        </motion.div>

        {/* Title */}
        <motion.h1
          initial={{ y: 14, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ delay: 0.3 }}
          className="text-2xl font-bold text-slate-900 tracking-tight"
        >
          Your Account Has Been Permanently Banned
        </motion.h1>

        {/* Description */}
        <motion.p
          initial={{ y: 14, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ delay: 0.4 }}
          className="text-slate-600 text-sm leading-relaxed"
        >
          Your account has been permanently suspended for violating our Community Guidelines.
          If you believe this is a mistake, please contact our support team.
        </motion.p>

        {/* Ban Reason */}
        {banReason && (
          <motion.div
            initial={{ y: 14, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ delay: 0.45 }}
            className="bg-rose-50 border border-rose-200 rounded-xl p-4 text-left"
            style={{ boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.7), 0 2px 6px -2px rgba(244,63,94,0.15)' }}
          >
            <p className="text-rose-700 text-xs font-semibold mb-1.5 flex items-center gap-1.5">🚫 Ban Reason</p>
            <p className="text-slate-800 text-sm font-medium leading-relaxed">{banReason}</p>
          </motion.div>
        )}

        {/* Support info */}
        <motion.div
          initial={{ y: 14, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ delay: 0.5 }}
          className="bg-slate-50 border border-slate-200 rounded-xl p-4 text-left"
          style={{ boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.8)' }}
        >
          <p className="text-slate-500 text-xs font-semibold mb-1">Support Email</p>
          <p className="text-slate-800 text-sm font-medium">support@merilive.com</p>
        </motion.div>

        {/* Logout button */}
        <motion.div
          initial={{ y: 14, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ delay: 0.6 }}
        >
          <Button
            onClick={handleLogout}
            className="w-full h-11 bg-gradient-to-r from-slate-800 to-slate-900 hover:from-slate-900 hover:to-black text-white font-semibold rounded-xl transition-all duration-200 hover:-translate-y-0.5 active:scale-[0.98]"
            style={{ boxShadow: '0 10px 24px -8px rgba(15,23,42,0.45), inset 0 1px 0 rgba(255,255,255,0.15)' }}
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
