/**
 * Native Android-style Pull-to-Refresh
 * Material Design 3 circular progress indicator
 */
import { useState, useRef, useCallback, ReactNode } from 'react';
import { motion, useMotionValue, useTransform } from 'framer-motion';
import { Loader2 } from 'lucide-react';
import { hapticFeedback } from '@/utils/nativeUtils';

interface NativePullToRefreshProps {
  onRefresh: () => Promise<void>;
  children: ReactNode;
  className?: string;
  threshold?: number;
  disabled?: boolean;
}

export function NativePullToRefresh({
  onRefresh,
  children,
  className = '',
  threshold = 80,
  disabled = false,
}: NativePullToRefreshProps) {
  const [isRefreshing, setIsRefreshing] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const startYRef = useRef(0);
  const pullDistance = useMotionValue(0);
  const isPulling = useRef(false);
  const hasTriggeredHaptic = useRef(false);

  const indicatorY = useTransform(pullDistance, [0, threshold], [0, threshold * 0.6]);
  const indicatorOpacity = useTransform(pullDistance, [0, threshold * 0.3, threshold], [0, 0.5, 1]);
  const indicatorScale = useTransform(pullDistance, [0, threshold], [0.5, 1]);
  const rotation = useTransform(pullDistance, [0, threshold], [0, 360]);

  const getScrollParent = useCallback((el: HTMLElement | null): HTMLElement | null => {
    if (!el) return null;
    let parent = el.parentElement;
    while (parent) {
      const style = getComputedStyle(parent);
      if (style.overflowY === 'auto' || style.overflowY === 'scroll') return parent;
      parent = parent.parentElement;
    }
    return null;
  }, []);

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    if (disabled || isRefreshing) return;
    const scrollParent = getScrollParent(containerRef.current);
    if (scrollParent && scrollParent.scrollTop > 5) return;
    if (!scrollParent && containerRef.current && containerRef.current.scrollTop > 5) return;
    startYRef.current = e.touches[0].clientY;
    isPulling.current = true;
    hasTriggeredHaptic.current = false;
  }, [disabled, isRefreshing, getScrollParent]);

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    if (!isPulling.current || disabled || isRefreshing) return;
    const scrollParent = getScrollParent(containerRef.current);
    const scrollTop = scrollParent ? scrollParent.scrollTop : (containerRef.current?.scrollTop ?? 0);
    if (scrollTop > 5) {
      isPulling.current = false;
      pullDistance.set(0);
      return;
    }

    const diff = e.touches[0].clientY - startYRef.current;
    if (diff > 0) {
      // Rubber-band effect
      const dampened = diff * 0.4;
      pullDistance.set(Math.min(dampened, threshold * 1.5));

      // Haptic feedback when reaching threshold
      if (dampened >= threshold && !hasTriggeredHaptic.current) {
        hasTriggeredHaptic.current = true;
        hapticFeedback('medium');
      }
    }
  }, [disabled, isRefreshing, pullDistance, threshold]);

  const handleTouchEnd = useCallback(async () => {
    if (!isPulling.current) return;
    isPulling.current = false;

    const currentPull = pullDistance.get();
    if (currentPull >= threshold && !isRefreshing) {
      setIsRefreshing(true);
      pullDistance.set(threshold * 0.5);
      
      try {
        await onRefresh();
      } finally {
        setIsRefreshing(false);
        pullDistance.set(0);
      }
    } else {
      pullDistance.set(0);
    }
  }, [pullDistance, threshold, isRefreshing, onRefresh]);

  return (
    <div className={`relative ${className}`}>
      {/* Pull indicator */}
      <motion.div
        className="absolute left-1/2 -translate-x-1/2 z-50 pointer-events-none"
        style={{ y: indicatorY, opacity: indicatorOpacity, scale: indicatorScale }}
      >
        <div className="w-10 h-10 rounded-full bg-card border border-border shadow-lg flex items-center justify-center">
          {isRefreshing ? (
            <Loader2 className="w-5 h-5 text-primary animate-spin" />
          ) : (
            <motion.div style={{ rotate: rotation }}>
              <svg className="w-5 h-5 text-primary" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <path d="M12 5v14M5 12l7-7 7 7" />
              </svg>
            </motion.div>
          )}
        </div>
      </motion.div>

      {/* Content */}
      <div
        ref={containerRef}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
      >
        {children}
      </div>
    </div>
  );
}

export default NativePullToRefresh;
