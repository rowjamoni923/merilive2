import { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { PLAY_STORE_URL } from "@/utils/shareLinks";

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
  { id: "rating", image: pickRatingVariant(), alt: "Rate us & win giveaway", fullScreen: false },
];

const SKIP_DELAY_MS = 3000;
const AUTO_CLOSE_MS = 10000;
const RATING_SHOW_DELAY_MS = 40000;
const SESSION_KEY = "promo_banner_shown_this_entry";
const ROTATION_KEY = "promo_banner_rotation_index";
const RATING_PENDING_KEY = "rating_reward_return_pending";
const RATING_ENABLED_SETTING_KEY = "rating_popup_enabled";

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

    return (existingClaims?.length ?? 0) === 0;
  }, []);

  const loadAdminRatingBanners = useCallback(async () => {
    try {
      const { data } = await supabase
        .from("rating_banners")
        .select("image_url")
        .eq("is_active", true)
        .order("display_order", { ascending: true });
      const urls = (data || []).map((r: any) => r.image_url).filter(Boolean);
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
    setIsVisible(false);
    setCurrentBanner(null);
    setRotationIndex(null);
  }, [advanceRotation, rotationIndex]);

  useEffect(() => {
    let ratingDelayTimer: number | undefined;

    const prepareBanner = async () => {
      if (sessionStorage.getItem(SESSION_KEY)) return;
      if (localStorage.getItem(RATING_PENDING_KEY) === "true") return;

      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      const nextBannerState = await resolveNextBanner();
      if (!nextBannerState) return;

      const { banner: nextBanner, index: nextIndex } = nextBannerState;
      setCurrentBanner(nextBanner);
      setRotationIndex(nextIndex);

      if (nextBanner.id === "rating") {
        ratingDelayTimer = window.setTimeout(() => {
          setIsVisible(true);
          sessionStorage.setItem(SESSION_KEY, "1");
        }, RATING_SHOW_DELAY_MS);
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
    localStorage.setItem(RATING_PENDING_KEY, "true");
    closeBanner();

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
        className="fixed inset-0 z-[200] flex items-center justify-center bg-black/80 backdrop-blur-sm"
        onClick={handleSkip}
      >
        <motion.div
          initial={{ scale: 0.88, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0.88, opacity: 0 }}
          transition={{ type: "spring", damping: 22, stiffness: 280 }}
          className={
            currentBanner.fullScreen
              ? "relative flex h-full w-full items-center justify-center"
              : "relative w-[85%] max-w-sm overflow-hidden rounded-3xl shadow-2xl"
          }
          onClick={handleBannerClick}
        >
          <img
            src={currentBanner.image}
            alt={currentBanner.alt}
            width={1080}
            height={currentBanner.fullScreen ? 1920 : 1080}
            className={
              currentBanner.fullScreen
                ? "h-full w-full object-cover"
                : "h-auto w-full rounded-3xl object-cover"
            }
          />

          {canSkip && (
            <motion.button
              initial={{ opacity: 0, scale: 0.85 }}
              animate={{ opacity: 1, scale: 1 }}
              onClick={(event) => {
                event.stopPropagation();
                closeBanner();
              }}
              className="absolute right-4 top-4 flex h-9 w-9 items-center justify-center rounded-full border border-white/20 bg-black/60 backdrop-blur-md"
            >
              <X className="h-4 w-4 text-white" />
            </motion.button>
          )}

          {!canSkip && (
            <div className="absolute right-4 top-4 rounded-full border border-white/20 bg-black/60 px-3 py-1 backdrop-blur-md">
              <span className="text-xs font-medium text-white">{countdown}s</span>
            </div>
          )}

          {currentBanner.id === "rating" && (
            <div className="absolute inset-x-0 bottom-4 flex justify-center px-4 pointer-events-none">
              <div className="rounded-full border border-white/15 bg-black/55 px-4 py-2 backdrop-blur-md">
                <span className="text-xs font-semibold tracking-wide text-white">Tap banner to rate on Play Store</span>
              </div>
            </div>
          )}
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}

export default FullScreenPromoBanners;
