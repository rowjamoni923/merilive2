import { useState, useEffect, useCallback, type ImgHTMLAttributes } from "react";

import { X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { motion, AnimatePresence } from "framer-motion";
import { toSupabaseCdnUrl } from "@/lib/cdnImage";

// Full-screen popup banner — usually shown at viewport size; ask CDN for ~1080w WebP.
const popupCdn = (url: string | null | undefined) =>
  toSupabaseCdnUrl(url, { width: 1080, quality: 75, resize: "contain" }) || url || "";
const isVideoBanner = (url?: string | null) => /\.(mp4|webm|mov|m4v)(?:$|[?#])/i.test(url || "");

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
  const [banner, setBanner] = useState<PopupBanner | null>(null);
  const [visible, setVisible] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [imageReady, setImageReady] = useState(false);

  const skipDelay = banner?.skip_delay_seconds ?? 3;
  const autoDismiss = banner?.auto_dismiss_seconds ?? 10;
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

  // Banner click → navigate if link_url is set, otherwise just absorb the click.
  const handleBannerClick = useCallback(async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!banner?.link_url) return;
    try {
      handleDismiss();
      const { openInApp } = await import("@/utils/inAppNavigation");
      await openInApp(banner.link_url);
    } catch {
      window.location.href = banner.link_url;
    }
  }, [banner, handleDismiss]);

  if (!banner) return null;
  const hasCta = Boolean(banner.link_url);
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
          className="fixed inset-0 z-[9999] flex flex-col items-center justify-center px-4 py-6 overflow-hidden"
          onClick={canSkip ? handleDismiss : undefined}
          style={{ width: '100vw', height: '100dvh' }}
        >
          {/* Blurred backdrop derived from the banner art — no raw black bars */}
          {!isVideo && (
            <img
              src={mediaUrl}
              alt=""
              aria-hidden="true"
              className="absolute inset-0 h-full w-full object-cover scale-125 blur-3xl opacity-50"
            />
          )}
          <div
            className="absolute inset-0"
            style={{
              background:
                "radial-gradient(120% 80% at 50% 0%, rgba(30,10,60,0.55) 0%, rgba(10,5,25,0.85) 55%, rgba(0,0,0,0.95) 100%)",
            }}
          />

          {/* Top safe-area chips: live countdown + skip/close */}
          <div
            className="relative z-30 w-full max-w-sm flex items-center justify-between"
            style={{ paddingTop: 'max(env(safe-area-inset-top), 8px)' }}
            onClick={(e) => e.stopPropagation()}
          >
            <div
              className="flex items-center gap-2 rounded-full px-3 py-1.5"
              style={{
                background: "rgba(0,0,0,0.55)",
                backdropFilter: "blur(12px)",
                border: "1px solid rgba(255,255,255,0.12)",
              }}
            >
              <span className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full rounded-full bg-rose-400 opacity-75 animate-ping" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-rose-500" />
              </span>
              <span className="text-white/90 text-[11px] font-semibold tabular-nums tracking-wide">
                {Math.max(0, autoDismiss - elapsed)}s
              </span>
            </div>

            {canSkip ? (
              <button
                onClick={handleDismiss}
                aria-label="Close"
                className="flex items-center gap-1.5 rounded-full pl-3 pr-2 py-1.5 text-white active:scale-95 transition"
                style={{
                  background: "linear-gradient(135deg, rgba(255,255,255,0.22) 0%, rgba(255,255,255,0.08) 100%)",
                  backdropFilter: "blur(12px)",
                  border: "1px solid rgba(255,255,255,0.25)",
                  boxShadow: "inset 0 1px 0 rgba(255,255,255,0.25), 0 4px 12px rgba(0,0,0,0.4)",
                }}
              >
                <span className="text-[11px] font-semibold tracking-wide">Skip</span>
                <div className="flex h-5 w-5 items-center justify-center rounded-full bg-white/15">
                  <X className="h-3 w-3" />
                </div>
              </button>
            ) : (
              <div
                className="rounded-full px-3 py-1.5 text-white/70 text-[11px] font-medium tabular-nums"
                style={{
                  background: "rgba(0,0,0,0.55)",
                  backdropFilter: "blur(12px)",
                  border: "1px solid rgba(255,255,255,0.12)",
                }}
              >
                Skip in {Math.max(0, skipDelay - elapsed)}s
              </div>
            )}
          </div>

          {/* Premium 9:16 card with gold ring frame */}
          <motion.div
            initial={{ scale: 0.92, opacity: 0, y: 10 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.92, opacity: 0 }}
            transition={{ type: "spring", damping: 24, stiffness: 280 }}
            className="relative z-20 my-3 w-full max-w-[340px] overflow-hidden rounded-[28px]"
            style={{
              aspectRatio: "9 / 16",
              boxShadow:
                "0 30px 80px -10px rgba(0,0,0,0.7), 0 0 60px -10px rgba(168,85,247,0.35), inset 0 0 0 1px rgba(255,255,255,0.12)",
              cursor: hasCta ? 'pointer' : 'default',
            }}
            onClick={handleBannerClick}
          >
            <div
              className="pointer-events-none absolute inset-0 z-30 rounded-[28px]"
              style={{
                padding: "1.5px",
                background:
                  "linear-gradient(135deg, rgba(252,211,77,0.7) 0%, rgba(245,158,11,0.2) 35%, rgba(255,255,255,0.15) 60%, rgba(245,158,11,0.6) 100%)",
                WebkitMask:
                  "linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0)",
                WebkitMaskComposite: "xor",
                maskComposite: "exclude",
              }}
            />

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

            {/* Subtle top sheen + bottom CTA-readability gradient */}
            <div className="pointer-events-none absolute inset-x-0 top-0 h-16 bg-gradient-to-b from-white/12 to-transparent z-10" />
            <div className="pointer-events-none absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-black/70 to-transparent z-10" />
          </motion.div>

          {/* Premium CTA pill — only when banner has a link */}
          {hasCta && (
            <motion.div
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.15 }}
              className="relative z-30 w-full max-w-sm"
              style={{ paddingBottom: 'max(env(safe-area-inset-bottom), 8px)' }}
              onClick={(e) => e.stopPropagation()}
            >
              <motion.button
                whileTap={{ scale: 0.97 }}
                onClick={handleBannerClick}
                className="relative w-full overflow-hidden rounded-2xl py-3.5 px-5 text-white flex items-center justify-center gap-2"
                style={{
                  background:
                    "radial-gradient(120% 120% at 30% 20%, #fde68a 0%, #f59e0b 50%, #b45309 100%)",
                  boxShadow:
                    "0 14px 30px -8px rgba(245,158,11,0.6), inset 0 1px 0 rgba(255,255,255,0.45), inset 0 -2px 4px rgba(0,0,0,0.25)",
                  border: "1px solid rgba(255,255,255,0.25)",
                }}
              >
                <div className="pointer-events-none absolute inset-x-2 top-1 h-2 rounded-full bg-white/40 blur-[2px]" />
                <span
                  className="relative text-[14px] font-bold tracking-wide"
                  style={{ textShadow: "0 1px 2px rgba(120,53,15,0.6)" }}
                >
                  ✨ View Event Details
                </span>
              </motion.button>
            </motion.div>
          )}
        </motion.div>
      )}
    </AnimatePresence>
  );
};

export default EventPopupBanner;
