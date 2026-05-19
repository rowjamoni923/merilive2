import { useState } from "react";
import { ShieldX } from "lucide-react";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogAction,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { navigateInAppPath } from "@/utils/inAppNavigation";

interface BanPopupDialogProps {
  open: boolean;
  reason?: string | null;
  /**
   * Optional ban expiry timestamp. If null/undefined → permanent ban.
   */
  bannedUntil?: string | null;
}

/**
 * Popup-style ban notice (replaces full-screen BannedScreen).
 * Shows "Permanently Banned" or "Banned for X hours" + reason.
 * Forces logout when user taps OK.
 */
const BanPopupDialog = ({ open, reason, bannedUntil }: BanPopupDialogProps) => {
  const [loggingOut, setLoggingOut] = useState(false);

  // Compute duration label
  const getDurationLabel = (): string => {
    if (!bannedUntil) return "Permanently Banned";
    const expiry = new Date(bannedUntil).getTime();
    const now = Date.now();
    const diffMs = expiry - now;
    if (diffMs <= 0) return "Ban Expired";
    const hours = Math.ceil(diffMs / (1000 * 60 * 60));
    if (hours < 24) return `Banned for ${hours} hour${hours > 1 ? "s" : ""}`;
    const days = Math.ceil(hours / 24);
    return `Banned for ${days} day${days > 1 ? "s" : ""}`;
  };

  const handleLogout = () => {
    if (loggingOut) return;
    setLoggingOut(true);
    // INSTANT: flag + redirect, cleanup in background
    try { localStorage.setItem("meri_manual_logout", "true"); } catch {}
    navigateInAppPath("/auth", { replace: true });
    void import("@/utils/nativeSessionStorage").then(({ clearNativeSession }) => clearNativeSession()).catch(() => {});
    void supabase.auth.signOut({ scope: "local" }).catch(() => {});
  };

  return (
    <AlertDialog open={open}>
      <AlertDialogContent className="bg-red-950 border-red-500/50 max-w-sm">
        <AlertDialogHeader>
          <div className="flex justify-center mb-2">
            <div className="w-16 h-16 rounded-full bg-gradient-to-br from-red-500/30 to-red-900/40 border-2 border-red-500/50 flex items-center justify-center">
              <ShieldX className="w-9 h-9 text-red-400" />
            </div>
          </div>
          <AlertDialogTitle className="text-red-300 text-center text-lg">
            🚫 Your ID has been {bannedUntil ? "temporarily" : "permanently"} banned
          </AlertDialogTitle>
          <AlertDialogDescription className="text-center space-y-3 pt-2">
            <p className="text-white font-semibold text-base">
              {getDurationLabel()}
            </p>
            {reason && (
              <div className="bg-red-900/40 border border-red-500/30 rounded-lg p-3 text-left">
                <p className="text-red-200 text-xs font-medium mb-1">Reason</p>
                <p className="text-white/90 text-sm">{reason}</p>
              </div>
            )}
            <p className="text-gray-300 text-xs">
              If you believe this is a mistake, please contact support at{" "}
              <span className="text-white font-medium">support@merilive.com</span>
            </p>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter className="justify-center">
          <AlertDialogAction asChild>
            <Button
              onClick={handleLogout}
              disabled={loggingOut}
              className="bg-red-600 hover:bg-red-700 text-white min-w-[140px]"
            >
              {loggingOut ? "Logging out..." : "OK"}
            </Button>
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
};

export default BanPopupDialog;
