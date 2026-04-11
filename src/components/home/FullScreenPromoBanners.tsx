import { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { PLAY_STORE_URL } from "@/utils/shareLinks";

import bannerLiveBonus from "@/assets/banners/banner-live-bonus.jpg";
import bannerInviteBonus from "@/assets/banners/banner-invite-bonus.jpg";
import bannerRatingReward from "@/assets/banners/banner-rating-reward.jpg";
import bannerDailyLogin from "@/assets/banners/banner-daily-login.jpg";
import bannerWelcomeBonus from "@/assets/banners/banner-welcome-bonus.jpg";

interface PromoBanner {
  id: string;
  image: string;
  alt: string;
  fullScreen: boolean;
}

const PROMO_BANNERS: PromoBanner[] = [
  { id: "welcome", image: bannerWelcomeBonus, alt: "Welcome bonus", fullScreen: true },
  { id: "live-bonus", image: bannerLiveBonus, alt: "Live bonus", fullScreen: true },
  { id: "invite", image: bannerInviteBonus, alt: "Invite friends bonus", fullScreen: true },
  { id: "daily-login", image: bannerDailyLogin, alt: "Daily rewards", fullScreen: true },
  { id: "rating", image: bannerRatingReward, alt: "Rate us reward", fullScreen: false },
];

const SKIP_DELAY_MS = 3000;
const AUTO_CLOSE_MS = 10000;
const RATING_SHOW_DELAY_MS = 40000;
const SESSION_KEY = "promo_banner_shown_this_entry";
const ROTATION_KEY = "promo_banner_rotation_index";
const RATING_PENDING_KEY = "rating_reward_return_pending";

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

      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      const nextIndex = getRotationIndex();
      const nextBanner = PROMO_BANNERS[nextIndex];
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
  }, [getRotationIndex]);

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
