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
          className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/70 backdrop-blur-sm p-6"
          onClick={canSkip ? handleDismiss : undefined}
        >
          <motion.div
            initial={{ scale: 0.8, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.8, opacity: 0 }}
            transition={{ type: "spring", damping: 25, stiffness: 300 }}
            className="relative max-w-sm w-full"
            onClick={(e) => e.stopPropagation()}
          >
            <div
              className="relative rounded-2xl overflow-hidden shadow-2xl shadow-purple-500/30 cursor-pointer"
              onClick={handleBannerClick}
            >
              <img
                src={banner.image_url}
                alt={banner.title}
                className="w-full h-auto"
              />
              <div className="absolute inset-0 rounded-2xl border-2 border-amber-400/30" />
              <div className="absolute inset-0 bg-gradient-to-t from-black/20 via-transparent to-transparent" />
              
              {/* Countdown Timer Badge */}
              <div className="absolute top-3 left-3 flex items-center gap-1.5 bg-black/60 backdrop-blur-sm rounded-full px-2.5 py-1 border border-white/10">
                <div className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />
                <span className="text-white text-xs font-medium">
                  {Math.max(0, autoDismiss - elapsed)}s
                </span>
              </div>
            </div>

            {/* Close X button - only show after skip delay */}
            {canSkip && (
              <button
                onClick={handleDismiss}
                className="absolute -top-3 -right-3 w-9 h-9 rounded-full bg-black/80 border border-white/20 flex items-center justify-center transition-all shadow-lg text-white/80 hover:text-white hover:bg-black/90 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            )}

            {canSkip ? (
              <button
                onClick={handleDismiss}
                className="mt-4 mx-auto block text-white/50 text-sm hover:text-white/80 transition-colors"
              >
                Skip
              </button>
            ) : (
              <p className="mt-3 text-center text-white/40 text-xs">
                Skip available in {Math.max(0, skipDelay - elapsed)}s
              </p>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

export default EventPopupBanner;
