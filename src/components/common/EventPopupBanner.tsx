import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { motion, AnimatePresence } from "framer-motion";

interface PopupBanner {
  id: string;
  title: string;
  image_url: string;
  link_url: string | null;
  link_type: string | null;
  skip_delay_seconds: number;
  auto_dismiss_seconds: number;
}

const EventPopupBanner = () => {
  const navigate = useNavigate();
  const [banner, setBanner] = useState<PopupBanner | null>(null);
  const [visible, setVisible] = useState(false);
  const [elapsed, setElapsed] = useState(0);

  const skipDelay = banner?.skip_delay_seconds ?? 3;
  const autoDismiss = banner?.auto_dismiss_seconds ?? 10;
  const canSkip = elapsed >= skipDelay;

  const fetchAndShowBanner = useCallback(async () => {
    // Only show ONCE per cold start
    if (sessionStorage.getItem('popup_banner_shown') === 'true') return;

    // Wait for authenticated session
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return;

    sessionStorage.setItem('popup_banner_shown', 'true');

    try {
      const now = new Date().toISOString();
      const { data, error } = await supabase
        .from('popup_event_banners')
        .select('id, title, image_url, link_url, link_type, skip_delay_seconds, auto_dismiss_seconds')
        .eq('is_active', true)
        .or(`start_date.is.null,start_date.lte.${now}`)
        .filter('end_date', 'gte', now)
        .order('display_order')
        .limit(1)
        .maybeSingle();

      if (error) throw error;
      if (data) {
        setBanner(data);
        setElapsed(0);
        setVisible(true);
      }
    } catch (err) {
      console.error('[EventPopupBanner] Error:', err);
      sessionStorage.removeItem('popup_banner_shown');
    }
  }, []);

  // Listen for auth state change - show banner after login
  useEffect(() => {
    // Try immediately if already logged in
    fetchAndShowBanner();

    // Also listen for fresh login events
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_IN') {
        // Small delay to let the UI settle after login
        setTimeout(() => fetchAndShowBanner(), 1500);
      }
    });

    return () => subscription.unsubscribe();
  }, [fetchAndShowBanner]);

  // Auto-dismiss countdown timer
  useEffect(() => {
    if (!visible) return;
    const interval = setInterval(() => {
      setElapsed(prev => {
        const next = prev + 1;
        if (next >= autoDismiss) {
          clearInterval(interval);
          handleDismiss();
        }
        return next;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [visible, autoDismiss]);

  const handleDismiss = useCallback(() => {
    setVisible(false);
    // Dispatch custom event so RatingRewardPopup knows to show next
    window.dispatchEvent(new CustomEvent('event-popup-dismissed'));
  }, []);

  const handleBannerClick = useCallback(() => {
    if (!banner?.link_url) return;
    handleDismiss();
    if (banner.link_type === 'external') {
      window.open(banner.link_url, '_blank');
    } else {
      navigate(banner.link_url);
    }
  }, [banner, navigate, handleDismiss]);

  if (!banner) return null;

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.3 }}
          className="fixed inset-0 z-[9999] bg-white/80 flex items-center justify-center"
          onClick={canSkip ? handleDismiss : undefined}
          style={{
            paddingTop: 'max(env(safe-area-inset-top), 16px)',
            paddingBottom: 'max(env(safe-area-inset-bottom), 16px)',
            paddingLeft: 'max(env(safe-area-inset-left), 12px)',
            paddingRight: 'max(env(safe-area-inset-right), 12px)',
          }}
        >
          <motion.div
            initial={{ scale: 1.05, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.95, opacity: 0 }}
            transition={{ type: "spring", damping: 25, stiffness: 300 }}
            className="relative w-full h-full max-w-md max-h-full flex items-center justify-center"
            onClick={(e) => e.stopPropagation()}
          >
            <img
              src={banner.image_url}
              alt={banner.title}
              onClick={handleBannerClick}
              className="max-w-full max-h-full w-auto h-auto object-contain rounded-2xl cursor-pointer shadow-2xl"
            />

            {/* Countdown Timer Badge */}
            <div className="absolute top-2 left-2 flex items-center gap-1.5 bg-white/80 backdrop-blur-sm rounded-full px-3 py-1.5 border border-amber-200/60 z-10">
              <div className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />
              <span className="text-white text-xs font-medium">
                {Math.max(0, autoDismiss - elapsed)}s
              </span>
            </div>

            {/* Close X button - only show after skip delay */}
            {canSkip ? (
              <button
                onClick={handleDismiss}
                className="absolute top-2 right-2 w-10 h-10 rounded-full bg-white/80 border border-amber-200/60 flex items-center justify-center shadow-lg text-white z-10"
              >
                <X className="w-5 h-5" />
              </button>
            ) : (
              <div className="absolute top-2 right-2 px-3 py-1.5 rounded-full bg-white/80 border border-amber-200/60 text-slate-600 text-xs z-10">
                Skip in {Math.max(0, skipDelay - elapsed)}s
              </div>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

export default EventPopupBanner;
