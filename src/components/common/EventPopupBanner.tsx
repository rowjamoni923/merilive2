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
  const [imageReady, setImageReady] = useState(false);

  const skipDelay = banner?.skip_delay_seconds ?? 3;
  const autoDismiss = banner?.auto_dismiss_seconds ?? 10;
  const canSkip = elapsed >= skipDelay;

  // Preload an image into the browser cache, resolves on load OR error
  // (errors shouldn't block the popup forever — fall through after a short cap).
  const preloadImage = (url: string, capMs = 3500) =>
    new Promise<void>((resolve) => {
      const img = new Image();
      let done = false;
      const finish = () => { if (!done) { done = true; resolve(); } };
      img.onload = finish;
      img.onerror = finish;
      // Hint the browser to fetch eagerly at high priority
      try { (img as any).fetchPriority = 'high'; } catch {}
      img.decoding = 'sync';
      img.src = url;
      // Hard cap: never wait more than capMs (slow networks shouldn't block UX)
      setTimeout(finish, capMs);
    });

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
        // ★ Preload the banner image BEFORE making the modal visible so the
        //   user never sees the black-frame + ticking countdown without art.
        setBanner(data);
        setImageReady(false);
        await preloadImage(data.image_url);
        setImageReady(true);
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
        // Tiny delay so the post-login route finishes mounting
        setTimeout(() => fetchAndShowBanner(), 300);
      }
    });

    return () => subscription.unsubscribe();
  }, [fetchAndShowBanner]);

  // Auto-dismiss countdown timer — only starts AFTER the image is on screen.
  useEffect(() => {
    if (!visible || !imageReady) return;
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
  }, [visible, imageReady, autoDismiss]);

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
          className="fixed inset-0 z-[9999] bg-black flex items-stretch justify-stretch overflow-hidden"
          onClick={canSkip ? handleDismiss : undefined}
          style={{
            // Edge-to-edge: no padding. Image covers the entire viewport.
            // Safe-area is applied only to the floating chips so notch /
            // bottom-bar don't eat them.
            width: '100vw',
            height: '100dvh',
          }}
        >
          <motion.div
            initial={{ scale: 1.03, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.97, opacity: 0 }}
            transition={{ type: "spring", damping: 28, stiffness: 320 }}
            className="relative w-full h-full"
            onClick={(e) => e.stopPropagation()}
          >
            <img
              src={banner.image_url}
              alt={banner.title}
              onClick={handleBannerClick}
              loading="eager"
              decoding="sync"
              fetchPriority="high"
              className="absolute inset-0 w-full h-full object-cover cursor-pointer select-none"
              draggable={false}
            />

            {/* Countdown Timer Badge (safe-area aware) */}
            <div
              className="absolute flex items-center gap-2 bg-slate-900/85 backdrop-blur-md rounded-full pl-2.5 pr-3 py-1.5 border border-white/10 shadow-lg z-10" /* dark-ok */
              style={{
                top: 'calc(env(safe-area-inset-top, 0px) + 12px)',
                left: 'calc(env(safe-area-inset-left, 0px) + 12px)',
              }}
            >
              <span className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full rounded-full bg-rose-400 opacity-75 animate-ping" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-rose-500" />
              </span>
              <span className="text-white text-[11px] font-semibold tabular-nums tracking-wide"> {/* dark-ok */}
                {Math.max(0, autoDismiss - elapsed)}s
              </span>
            </div>

            {canSkip ? (
              <button
                onClick={handleDismiss}
                aria-label="Close"
                className="absolute w-10 h-10 rounded-full bg-slate-900/85 backdrop-blur-md border border-white/15 flex items-center justify-center shadow-lg text-white hover:bg-slate-900 active:scale-95 transition z-10" /* dark-ok */
                style={{
                  top: 'calc(env(safe-area-inset-top, 0px) + 12px)',
                  right: 'calc(env(safe-area-inset-right, 0px) + 12px)',
                }}
              >
                <X className="w-5 h-5" strokeWidth={2.5} />
              </button>
            ) : (
              <div
                className="absolute px-3 py-1.5 rounded-full bg-slate-900/85 backdrop-blur-md border border-white/10 text-white/90 text-[11px] font-medium tabular-nums z-10 shadow-lg" /* dark-ok */
                style={{
                  top: 'calc(env(safe-area-inset-top, 0px) + 12px)',
                  right: 'calc(env(safe-area-inset-right, 0px) + 12px)',
                }}
              >
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
