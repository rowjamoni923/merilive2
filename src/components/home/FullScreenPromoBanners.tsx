import { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

// Import banner images
import bannerLiveBonus from "@/assets/banners/banner-live-bonus.jpg";
import bannerInviteBonus from "@/assets/banners/banner-invite-bonus.jpg";
import bannerRatingReward from "@/assets/banners/banner-rating-reward.jpg";
import bannerDailyLogin from "@/assets/banners/banner-daily-login.jpg";
import bannerWelcomeBonus from "@/assets/banners/banner-welcome-bonus.jpg";

interface PromoBanner {
  id: string;
  image: string;
  fullScreen: boolean; // false = smaller dialog style
  link?: string;
}

const PROMO_BANNERS: PromoBanner[] = [
  { id: "welcome", image: bannerWelcomeBonus, fullScreen: true },
  { id: "live-bonus", image: bannerLiveBonus, fullScreen: true },
  { id: "invite", image: bannerInviteBonus, fullScreen: true },
  { id: "daily-login", image: bannerDailyLogin, fullScreen: true },
  { id: "rating", image: bannerRatingReward, fullScreen: false }, // Rating is NOT full-screen
];

const SKIP_DELAY_MS = 3000; // Skip button appears after 3s
const AUTO_CLOSE_MS = 10000; // Auto close after 10s
const SESSION_KEY = "promo_banners_shown";

export function FullScreenPromoBanners() {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isVisible, setIsVisible] = useState(false);
  const [canSkip, setCanSkip] = useState(false);
  const [countdown, setCountdown] = useState(Math.ceil(SKIP_DELAY_MS / 1000));

  // Show once per session — triggered after auth is confirmed
  useEffect(() => {
    const alreadyShown = sessionStorage.getItem(SESSION_KEY);
    if (alreadyShown) return;

    // Check if user is logged in before showing
    const checkAndShow = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (session) {
        setIsVisible(true);
        sessionStorage.setItem(SESSION_KEY, "1");
      }
    };
    
    checkAndShow();

    // Also listen for fresh login
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_IN' && !sessionStorage.getItem(SESSION_KEY)) {
        setTimeout(() => {
          setIsVisible(true);
          sessionStorage.setItem(SESSION_KEY, "1");
        }, 800);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  // Skip button timer with countdown
  useEffect(() => {
    if (!isVisible) return;
    setCanSkip(false);
    setCountdown(Math.ceil(SKIP_DELAY_MS / 1000));
    const interval = setInterval(() => {
      setCountdown(prev => {
        if (prev <= 1) {
          clearInterval(interval);
          setCanSkip(true);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [currentIndex, isVisible]);

  // Auto-close timer
  useEffect(() => {
    if (!isVisible) return;
    const t = setTimeout(() => {
      goNext();
    }, AUTO_CLOSE_MS);
    return () => clearTimeout(t);
  }, [currentIndex, isVisible]);

  const goNext = useCallback(() => {
    if (currentIndex < PROMO_BANNERS.length - 1) {
      setCurrentIndex(prev => prev + 1);
    } else {
      setIsVisible(false);
    }
  }, [currentIndex]);

  const handleSkip = useCallback(() => {
    if (canSkip) goNext();
  }, [canSkip, goNext]);

  const handleClose = useCallback(() => {
    setIsVisible(false);
  }, []);

  if (!isVisible) return null;

  const banner = PROMO_BANNERS[currentIndex];

  return (
    <AnimatePresence mode="wait">
      <motion.div
        key={banner.id}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.3 }}
        className="fixed inset-0 z-[200] flex items-center justify-center bg-black/80 backdrop-blur-sm"
        onClick={handleSkip}
      >
        {/* Banner Image */}
        <motion.div
          initial={{ scale: 0.85, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0.85, opacity: 0 }}
          transition={{ type: "spring", damping: 20, stiffness: 300 }}
          className={
            banner.fullScreen
              ? "relative w-full h-full flex items-center justify-center"
              : "relative w-[85%] max-w-sm rounded-2xl overflow-hidden shadow-2xl"
          }
          onClick={(e) => e.stopPropagation()}
        >
          <img
            src={banner.image}
            alt={banner.id}
            className={
              banner.fullScreen
                ? "w-full h-full object-cover"
                : "w-full h-auto object-cover rounded-2xl"
            }
          />

          {/* Close / Skip Button */}
          {canSkip && (
            <motion.button
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              onClick={banner.fullScreen ? handleSkip : handleClose}
              className="absolute top-4 right-4 w-8 h-8 rounded-full bg-black/60 backdrop-blur-md flex items-center justify-center border border-white/20"
            >
              <X className="w-4 h-4 text-white" />
            </motion.button>
          )}

          {/* Countdown indicator */}
          {!canSkip && (
            <div className="absolute top-4 right-4 px-3 py-1 rounded-full bg-black/60 backdrop-blur-md border border-white/20">
              <span className="text-white text-xs font-medium">
                {countdown}s
              </span>
            </div>
          )}

          {/* Banner counter */}
          <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex gap-1.5">
            {PROMO_BANNERS.map((_, i) => (
              <div
                key={i}
                className={`w-2 h-2 rounded-full transition-all ${
                  i === currentIndex
                    ? "bg-white w-5"
                    : i < currentIndex
                    ? "bg-white/60"
                    : "bg-white/30"
                }`}
              />
            ))}
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}

export default FullScreenPromoBanners;
