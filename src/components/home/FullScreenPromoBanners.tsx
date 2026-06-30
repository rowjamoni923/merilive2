import { useState, useEffect, useCallback, type ImgHTMLAttributes } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { PLAY_STORE_URL } from "@/utils/shareLinks";
import { normalizePublicMediaUrl } from "@/lib/cdnImage";
import { BulletproofImage } from "@/components/common/BulletproofImage";

import bannerRatingRewardV2 from "@/assets/banners/banner-rating-reward-v2.jpg";
import bannerRatingRewardV3 from "@/assets/banners/banner-rating-reward-v3.jpg";
import bannerRatingRewardV4 from "@/assets/banners/banner-rating-reward-v4.jpg";

interface PromoBanner {
  id: string;
  image: string;
  alt: string;
  fullScreen: boolean;
}

// Premium luxury rating + giveaway banners (Users win 10,000 Diamonds, Hosts win 10,000 Beans)
// Admin-managed banners from `rating_banners` are loaded at runtime; bundled assets are used
// only as a fallback when no active admin banners exist.
const FALLBACK_RATING_BANNERS = [bannerRatingRewardV2, bannerRatingRewardV3, bannerRatingRewardV4];
let CACHED_ADMIN_RATING_BANNERS: string[] | null = null;
const pickRatingVariant = () => {
  const pool = (CACHED_ADMIN_RATING_BANNERS && CACHED_ADMIN_RATING_BANNERS.length > 0)
    ? CACHED_ADMIN_RATING_BANNERS
    : FALLBACK_RATING_BANNERS;
  return pool[Math.floor(Math.random() * pool.length)];
};

const PROMO_BANNERS: PromoBanner[] = [
  // fullScreen=true → image fills the device screen edge-to-edge with object-contain
  // (no rounded-corner clipping, no max-w-sm shrink). Admin-uploaded 9:16 mobile banners
  // are designed for full mobile screen; rendering them inside a 384px rounded card was
  // visually clipping the sides via the rounded-3xl mask + max-w-sm width cap.
  { id: "rating", image: pickRatingVariant(), alt: "Rate us & win giveaway", fullScreen: true },
];

const SKIP_DELAY_MS = 3000;
const AUTO_CLOSE_MS = 10000;
// Banner appears 20–40s after the app opens so every new user actually sees it
// before closing. Original 60–120s window meant most short sessions missed it.
const RATING_SHOW_DELAY_MIN_MS = 20000;
const RATING_SHOW_DELAY_MAX_MS = 40000;

const SESSION_KEY = "promo_banner_shown_this_entry";
const ROTATION_KEY = "promo_banner_rotation_index";
const RATING_PENDING_KEY = "rating_reward_return_pending";
const RATING_ENABLED_SETTING_KEY = "rating_popup_enabled";
// Per-user permanent dismiss flag. Once set, the rating banner NEVER shows
// again on this device for this user (whether they dismissed it, let it
// auto-close, clicked the banner to rate, or submitted proof).
const ratingBannerDismissedKey = (userId: string) => `rating_banner_dismissed_v1_${userId}`;

export function FullScreenPromoBanners() {
  const [currentBanner, setCurrentBanner] = useState<PromoBanner | null>(null);
  const [rotationIndex, setRotationIndex] = useState<number | null>(null);
  const [isVisible, setIsVisible] = useState(false);
  const [canSkip, setCanSkip] = useState(false);
  const [countdown, setCountdown] = useState(Math.ceil(SKIP_DELAY_MS / 1000));

  const getRotationIndex = useCallback(() => {
    const rawValue = Number(localStorage.getItem(ROTATION_KEY) ?? "0");
    if (!Number.isFinite(rawValue) || rawValue < 0) return 0;
    return rawValue % PROMO_BANNERS.length;
  }, []);

  const advanceRotation = useCallback((currentIndex: number | null) => {
    if (currentIndex === null) return;
    localStorage.setItem(ROTATION_KEY, String((currentIndex + 1) % PROMO_BANNERS.length));
  }, []);

  const isRatingBannerEligible = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return false;

    // One-time cleanup of the legacy per-device dismiss flag.
    // The previous build dismissed the banner permanently on Skip / X /
    // auto-close — that broke the rule "show to every new user until they
    // actually rate". The only source of truth now is `rating_reward_claims`:
    // if a row exists for this user (pending / approved / rejected) → never
    // show again. Otherwise → keep showing (once per session, 40s-2min in).
    try { localStorage.removeItem(ratingBannerDismissedKey(user.id)); } catch { /* ignore */ }

    const { data: settingData } = await supabase
      .from("app_settings")
      .select("setting_value")
      .eq("setting_key", RATING_ENABLED_SETTING_KEY)
      .maybeSingle();

    const isEnabled = settingData?.setting_value === true || settingData?.setting_value === "true";
    if (!isEnabled) return false;

    const { data: existingClaims } = await supabase
      .from("rating_reward_claims")
      .select("id")
      .eq("user_id", user.id)
      .limit(1);

    if ((existingClaims?.length ?? 0) > 0) return false;
    return true;
  }, []);

  const loadAdminRatingBanners = useCallback(async () => {
    try {
      const { data } = await supabase
        .from("rating_banners")
        .select("image_url")
        .eq("is_active", true)
        .order("display_order", { ascending: true });
      const urls = (data || []).map((r: any) => normalizePublicMediaUrl(r.image_url, "banners")).filter(Boolean) as string[];
      CACHED_ADMIN_RATING_BANNERS = urls;
    } catch {
      CACHED_ADMIN_RATING_BANNERS = [];
    }
  }, []);

  const resolveNextBanner = useCallback(async (): Promise<{ banner: PromoBanner; index: number } | null> => {
    const startIndex = getRotationIndex();

    for (let offset = 0; offset < PROMO_BANNERS.length; offset += 1) {
      const candidateIndex = (startIndex + offset) % PROMO_BANNERS.length;
      const baseBanner = PROMO_BANNERS[candidateIndex];

      if (baseBanner.id === "rating") {
        if (!(await isRatingBannerEligible())) continue;
        await loadAdminRatingBanners();
        return { banner: { ...baseBanner, image: pickRatingVariant() }, index: candidateIndex };
      }
      return { banner: baseBanner, index: candidateIndex };
    }

    return null;
  }, [getRotationIndex, isRatingBannerEligible, loadAdminRatingBanners]);

  const closeBanner = useCallback(() => {
    advanceRotation(rotationIndex);
    // Intentionally DO NOT mark a permanent per-device dismiss here.
    // Per spec: the rating banner must keep coming to users who have NOT
    // submitted proof yet (every new session, 40s-2min in). Only an actual
    // `rating_reward_claims` row blocks future shows — handled in
    // `isRatingBannerEligible`. SESSION_KEY already prevents re-show
    // within the same app session.
    setIsVisible(false);
    setCurrentBanner(null);
    setRotationIndex(null);
  }, [advanceRotation, rotationIndex]);

  useEffect(() => {
    let ratingDelayTimer: number | undefined;
    let eventListener: (() => void) | undefined;

    const prepareBanner = async () => {
      if (sessionStorage.getItem(SESSION_KEY)) return;
      if (localStorage.getItem(RATING_PENDING_KEY) === "true") return;

      // Top-priority Event Popup must show first. Defer until it dismisses.
      const eventActive = (() => {
        try { return sessionStorage.getItem('event_popup_active') === '1'; } catch { return false; }
      })();
      if (eventActive) {
        eventListener = () => {
          window.removeEventListener('event-popup-dismissed', eventListener!);
          eventListener = undefined;
          void prepareBanner();
        };
        window.addEventListener('event-popup-dismissed', eventListener);
        return;
      }

      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      const nextBannerState = await resolveNextBanner();
      if (!nextBannerState) return;

      const { banner: nextBanner, index: nextIndex } = nextBannerState;
      setCurrentBanner(nextBanner);
      setRotationIndex(nextIndex);

      if (nextBanner.id === "rating") {
        const randomDelay = Math.floor(Math.random() * (RATING_SHOW_DELAY_MAX_MS - RATING_SHOW_DELAY_MIN_MS + 1)) + RATING_SHOW_DELAY_MIN_MS;
        ratingDelayTimer = window.setTimeout(() => {
          setIsVisible(true);
          sessionStorage.setItem(SESSION_KEY, "1");
        }, randomDelay);
        return;
      }

      setIsVisible(true);
      sessionStorage.setItem(SESSION_KEY, "1");
    };

    void prepareBanner();

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_IN" && !sessionStorage.getItem(SESSION_KEY)) {
        void prepareBanner();
      }
    });

    return () => {
      if (ratingDelayTimer) window.clearTimeout(ratingDelayTimer);
      if (eventListener) window.removeEventListener('event-popup-dismissed', eventListener);
      subscription.unsubscribe();
    };
  }, [resolveNextBanner]);

  useEffect(() => {
    if (!isVisible || !currentBanner) return;

    setCanSkip(false);
    setCountdown(Math.ceil(SKIP_DELAY_MS / 1000));

    const interval = window.setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          window.clearInterval(interval);
          setCanSkip(true);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => window.clearInterval(interval);
  }, [currentBanner?.id, isVisible]);

  useEffect(() => {
    if (!isVisible || !currentBanner) return;

    const timeout = window.setTimeout(() => {
      closeBanner();
    }, AUTO_CLOSE_MS);

    return () => window.clearTimeout(timeout);
  }, [closeBanner, currentBanner?.id, isVisible]);

  const handleSkip = useCallback(() => {
    if (!canSkip) return;
    closeBanner();
  }, [canSkip, closeBanner]);

  const handleRatingClick = useCallback(async () => {
    sessionStorage.setItem("rating_popup_dismissed", "true");
    // Mark return-pending so RatingRewardPopup auto-opens the proof dialog
    // when the user comes back from Play Store (focus / visibilitychange / app resume).
    localStorage.setItem(RATING_PENDING_KEY, "true");
    closeBanner();

    // Open Play Store. On native Android `openInApp` uses the market://
    // intent which launches the Play Store app directly (allowed exception
    // to the in-app navigation policy). On web it opens in a new tab.
    try {
      const { openInApp } = await import("@/utils/inAppNavigation");
      await openInApp(PLAY_STORE_URL);
    } catch {
      window.location.href = PLAY_STORE_URL;
    }
  }, [closeBanner]);

  const handleBannerClick = useCallback((event: React.MouseEvent<HTMLDivElement>) => {
    event.stopPropagation();
    if (currentBanner?.id === "rating") {
      void handleRatingClick();
    }
  }, [currentBanner?.id, handleRatingClick]);

  if (!isVisible || !currentBanner) return null;

  return (
    <AnimatePresence mode="wait">
      <motion.div
        key={currentBanner.id}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.3 }}
        className="fixed inset-0 z-[200] flex flex-col items-center justify-center px-4 py-6 overflow-hidden"
        onClick={handleSkip}
      >
        {/* Luxurious gradient backdrop with blurred banner — eliminates raw black bars */}
        <img loading="lazy" decoding="async"
          src={currentBanner.image}
          alt=""
          aria-hidden="true"
          className="absolute inset-0 h-full w-full object-cover scale-125 blur-3xl opacity-50"
 />
        <div
          className="absolute inset-0"
          style={{
            background:
              "radial-gradient(120% 80% at 50% 0%, rgba(120,53,15,0.55) 0%, rgba(15,5,30,0.85) 55%, rgba(0,0,0,0.95) 100%)",
          }}
        />

        {/* Top controls bar — countdown / skip pill, always inside safe area */}
        <div
          className="relative z-30 w-full max-w-sm flex items-center justify-between"
          style={{ paddingTop: "max(env(safe-area-inset-top), 8px)" }}
          onClick={(e) => e.stopPropagation()}
        >
          <motion.div
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex items-center gap-2 rounded-full px-3 py-1.5"
            style={{
              background: "rgba(0,0,0,0.55)",
              backdropFilter: "blur(12px)",
              border: "1px solid rgba(255,255,255,0.12)",
              boxShadow: "inset 0 1px 0 rgba(255,255,255,0.1)",
            }}
          >
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-400/70" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-red-500" />
            </span>
            <span className="text-[11px] font-semibold tracking-wide text-white/90">
              {canSkip ? "Ready" : `${countdown}s`}
            </span>
          </motion.div>

          <AnimatePresence mode="wait">
            {canSkip ? (
              <motion.button
                key="skip-btn"
                initial={{ opacity: 0, scale: 0.85 }}
                animate={{ opacity: 1, scale: 1 }}
                whileTap={{ scale: 0.92 }}
                onClick={(event) => {
                  event.stopPropagation();
                  closeBanner();
                }}
                className="flex items-center gap-1.5 rounded-full pl-3 pr-2 py-1.5 text-white"
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
              </motion.button>
            ) : (
              <motion.div
                key="wait-pill"
                initial={{ opacity: 0, scale: 0.85 }}
                animate={{ opacity: 1, scale: 1 }}
                className="rounded-full px-3 py-1.5"
                style={{
                  background: "rgba(0,0,0,0.55)",
                  backdropFilter: "blur(12px)",
                  border: "1px solid rgba(255,255,255,0.12)",
                }}
              >
                <span className="text-[11px] font-medium text-white/70">
                  Skip in {countdown}s
                </span>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Premium centered mobile-card — locked 9:16 aspect, no black bars */}
        <motion.div
          initial={{ scale: 0.92, opacity: 0, y: 10 }}
          animate={{ scale: 1, opacity: 1, y: 0 }}
          exit={{ scale: 0.92, opacity: 0 }}
          transition={{ type: "spring", damping: 22, stiffness: 280 }}
          className="relative z-20 my-3 w-full max-w-[340px] overflow-hidden rounded-[28px]"
          style={{
            aspectRatio: "9 / 16",
            boxShadow:
              "0 30px 80px -10px rgba(0,0,0,0.7), 0 0 60px -10px rgba(245,158,11,0.35), inset 0 0 0 1px rgba(255,255,255,0.12)",
          }}
          onClick={handleBannerClick}
        >
          {/* Gold gradient ring frame */}
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

          <BulletproofImage
            src={currentBanner.image}
            alt={currentBanner.alt}
            width={1080}
            height={1920}
            priority="high"
            className="absolute inset-0 h-full w-full object-cover"
          />

          {/* Subtle top sheen */}
          <div className="pointer-events-none absolute inset-x-0 top-0 h-16 bg-gradient-to-b from-white/12 to-transparent z-10" />
          {/* Bottom gradient for CTA readability */}
          <div className="pointer-events-none absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-black/70 to-transparent z-10" />
        </motion.div>

        {/* Premium CTA pill — fully professional, gold-glass */}
        {currentBanner.id === "rating" && (
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.15 }}
            className="relative z-30 w-full max-w-sm"
            style={{ paddingBottom: "max(env(safe-area-inset-bottom), 8px)" }}
            onClick={(e) => e.stopPropagation()}
          >
            <motion.button
              whileHover={{ y: -2, scale: 1.02 }}
              whileTap={{ scale: 0.97 }}
              onClick={() => void handleRatingClick()}
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
                ⭐ Tap to Claim Your Reward
              </span>
            </motion.button>
            <p className="mt-2 text-center text-[10.5px] font-medium tracking-wide text-white/55">
              Rate us on Play Store to receive your gift
            </p>
          </motion.div>
        )}
      </motion.div>
    </AnimatePresence>
  );
}

export default FullScreenPromoBanners;
