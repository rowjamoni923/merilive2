import { useState, useEffect, useCallback, type ImgHTMLAttributes } from "react";

import { X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { motion, AnimatePresence } from "framer-motion";
import { toSupabaseCdnUrl } from "@/lib/cdnImage";

// Full-screen popup banner — usually shown at viewport size; ask CDN for ~1080w WebP.
const popupCdn = (url: string | null | undefined) =>
  toSupabaseCdnUrl(url, { width: 1080, quality: 75, resize: "cover" }) || url || "";
const isVideoBanner = (url?: string | null) => /\.(mp4|webm|mov|m4v)(?:$|[?#])/i.test(url || "");

interface PopupBanner {
  id: string;
  title: string;
  image_url: string;
  skip_delay_seconds: number;
}

const EventPopupBanner = () => {
  const [banner, setBanner] = useState<PopupBanner | null>(null);
  const [visible, setVisible] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [imageReady, setImageReady] = useState(false);

  const skipDelay = banner?.skip_delay_seconds ?? 3;
  const canSkip = elapsed >= skipDelay;

  // Preload banner media into the browser cache, resolves on load OR error
  // (errors shouldn't block the popup forever — fall through after a short cap).
  const preloadBannerMedia = (url: string, capMs = 3500) =>
    new Promise<void>((resolve) => {
      if (isVideoBanner(url)) {
        const video = document.createElement('video');
        let done = false;
        const finish = () => { if (!done) { done = true; resolve(); } };
        video.onloadeddata = finish;
        video.onerror = finish;
        video.preload = 'auto';
        video.muted = true;
        video.playsInline = true;
        video.src = url;
        setTimeout(finish, capMs);
        return;
      }
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
        .select('id, title, image_url, skip_delay_seconds')
        .eq('is_active', true)
        .or(`start_date.is.null,start_date.lte.${now}`)
        .filter('end_date', 'gte', now)
        .order('display_order')
        .limit(1)
        .maybeSingle();

      if (error) throw error;
      if (data) {
        // ★ Preload the banner image BEFORE making the modal visible so the
        //   user never sees a blank full-screen interstitial without art.
        setBanner(data);
        setImageReady(false);
        await preloadBannerMedia(popupCdn(data.image_url));
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

  // Close control timer — only starts AFTER the image is on screen.
  useEffect(() => {
    if (!visible || !imageReady) return;
    const interval = setInterval(() => {
      setElapsed(prev => prev + 1);
    }, 1000);
    return () => clearInterval(interval);
  }, [visible, imageReady]);

  const handleDismiss = useCallback(() => {
    setVisible(false);
    // Dispatch custom event so RatingRewardPopup knows to show next
    window.dispatchEvent(new CustomEvent('event-popup-dismissed'));
  }, []);

  if (!banner) return null;
  const mediaUrl = popupCdn(banner.image_url);
  const isVideo = isVideoBanner(banner.image_url);

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.3 }}
          className="fixed inset-0 z-[9999] overflow-hidden bg-background"
          style={{ width: '100vw', height: '100dvh' }}
        >
          {isVideo ? (
            <video
              src={mediaUrl}
              autoPlay
              muted
              loop
              playsInline
              preload="auto"
              className="absolute inset-0 h-full w-full object-cover"
            />
          ) : (
            <img
              src={mediaUrl}
              alt={banner.title}
              width={1080}
              height={1920}
              loading="eager"
              decoding="async"
              {...({ fetchpriority: "high" } as ImgHTMLAttributes<HTMLImageElement>)}
              className="absolute inset-0 h-full w-full object-cover"
              draggable={false}
              onError={(e) => { const t = e.currentTarget; if (banner.image_url && t.src !== banner.image_url) t.src = banner.image_url; }}
            />
          )}

          {canSkip && (
            <motion.button
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.18 }}
              onClick={handleDismiss}
              aria-label="Close"
              className="absolute right-3 z-10 flex h-11 w-11 items-center justify-center rounded-full border border-border/60 bg-background/75 text-foreground shadow-lg backdrop-blur-md active:scale-95"
              style={{ top: 'max(env(safe-area-inset-top), 12px)' }}
            >
              <X className="h-5 w-5" />
            </motion.button>
          )}
        </motion.div>
      )}
    </AnimatePresence>
  );
};

export default EventPopupBanner;
