import React, { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

interface ScrollToBottomButtonProps {
  scrollRef: React.RefObject<HTMLElement>;
  className?: string;
  /** For flex-col-reverse containers, the "bottom" is scrollTop ≈ 0. Default: false (normal order). */
  reverse?: boolean;
  /** Pixel threshold from bottom before showing the button. Default: 60. */
  threshold?: number;
  /** Optional badge count (e.g., unread messages) shown on the button. */
  badgeCount?: number;
}

/**
 * ScrollToBottomButton
 * --------------------
 * Floating down-arrow button that appears when the user scrolls up
 * away from the bottom of a chat/message container.
 *
 * • reverse=false (default): normal message order (oldest→newest bottom).
 *   At bottom = scrollTop + clientHeight ≈ scrollHeight.
 * • reverse=true: flex-col-reverse (newest at visual bottom).
 *   At bottom = scrollTop ≈ 0.
 */
export const ScrollToBottomButton: React.FC<ScrollToBottomButtonProps> = ({
  scrollRef,
  className,
  reverse = false,
  threshold = 60,
  badgeCount,
}) => {
  const [show, setShow] = useState(false);

  const checkScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;

    if (reverse) {
      // flex-col-reverse: bottom is scrollTop ≈ 0, and scrollTop goes
      // NEGATIVE as the user scrolls up. Use absolute value.
      setShow(Math.abs(el.scrollTop) > threshold);
    } else {
      // Normal order: bottom is scrollTop + clientHeight ≈ scrollHeight
      const atBottom = el.scrollTop + el.clientHeight >= el.scrollHeight - threshold;
      setShow(!atBottom);
    }
  }, [scrollRef, reverse, threshold]);

  const scrollToBottom = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    if (reverse) {
      el.scrollTo({ top: 0, behavior: "smooth" });
    } else {
      el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
    }
  }, [scrollRef, reverse]);

  useEffect(() => {
    let el: HTMLElement | null = null;
    let raf = 0;
    let observer: MutationObserver | null = null;

    const onResize = () => checkScroll();

    const attach = () => {
      el = scrollRef.current;
      if (!el) {
        // Ref not assigned yet (e.g. AnimatePresence mount) — retry next frame
        raf = requestAnimationFrame(attach);
        return;
      }
      checkScroll();
      el.addEventListener("scroll", checkScroll, { passive: true });
      window.addEventListener("resize", onResize);
      // Re-check when messages are added/removed (content height changes)
      observer = new MutationObserver(() => checkScroll());
      observer.observe(el, { childList: true, subtree: true });
    };

    attach();

    return () => {
      cancelAnimationFrame(raf);
      observer?.disconnect();
      if (el) el.removeEventListener("scroll", checkScroll);
      window.removeEventListener("resize", onResize);
    };
  }, [checkScroll, scrollRef]);

  return (
    <AnimatePresence>
      {show && (
        <motion.button
          initial={{ opacity: 0, scale: 0.6, y: 10 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.6, y: 10 }}
          transition={{ type: "spring", damping: 22, stiffness: 350 }}
          onClick={scrollToBottom}
          className={cn(
            "absolute z-20 flex items-center justify-center",
            "w-9 h-9 rounded-full",
            "bg-gradient-to-br from-fuchsia-500 via-purple-500 to-violet-600",
            "text-white shadow-lg shadow-purple-500/40",
            "border border-white/20",
            "active:scale-90 transition-transform",
            className
          )}
          aria-label="Scroll to latest messages"
        >
          <ChevronDown className="w-5 h-5" />
          {!!badgeCount && badgeCount > 0 && (
            <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 bg-destructive text-destructive-foreground text-[10px] font-bold rounded-full flex items-center justify-center">
              {badgeCount > 99 ? "99+" : badgeCount}
            </span>
          )}
        </motion.button>
      )}
    </AnimatePresence>
  );
};

export default ScrollToBottomButton;
