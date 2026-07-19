/**
 * LowBalanceBanner — Phase 3 Step 3
 *
 * Non-blocking top banner shown during a private call when the viewer's
 * remaining diamond balance drops to <= 2 minutes (warning) or <= 1 minute
 * (critical). Industry standard (Chamet/Bigo/Poppo): pre-warn → critical →
 * hard stop at 0. Tap "Recharge" to navigate to top-up.
 *
 * Design intentionally mirrors the existing privacy-warning banner so it
 * blends with the in-call UI without introducing new visual language.
 */
import { motion, AnimatePresence } from 'framer-motion';
import { Gem, AlertTriangle } from 'lucide-react';
import { cn } from '@/lib/utils';

interface Props {
  visible: boolean;
  severity: 'warning' | 'critical' | null;
  remainingMinutes: number | null;
  onRecharge?: () => void;
}

export function LowBalanceBanner({ visible, severity, remainingMinutes, onRecharge }: Props) {
  const isCritical = severity === 'critical';
  const minutesText = remainingMinutes != null
    ? `${remainingMinutes} min`
    : 'less than 2 min';

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -20 }}
          transition={{ duration: 0.2 }}
          className={cn(
            'absolute top-[72px] left-1/2 -translate-x-1/2 z-[55] flex items-center gap-2.5 px-4 py-2.5 rounded-2xl shadow-2xl border backdrop-blur-xl',
            isCritical
              ? 'bg-gradient-to-r from-red-600/90 to-rose-500/90 border-red-400/30 shadow-red-500/30'
              : 'bg-gradient-to-r from-amber-500/90 to-orange-500/90 border-amber-300/30 shadow-amber-500/30',
          )}
          role="status"
          aria-live="polite"
        >
          {isCritical ? (
            <AlertTriangle className="w-4.5 h-4.5 text-white shrink-0" />
          ) : (
            <Gem className="w-4.5 h-4.5 text-white shrink-0" />
          )}
          <span className="text-white text-xs font-semibold whitespace-nowrap">
            {isCritical ? 'Balance critical' : 'Low balance'} · {minutesText} left
          </span>
          {onRecharge && (
            <button
              type="button"
              onClick={onRecharge}
              className="ml-1 px-2.5 py-1 rounded-full bg-white/95 hover:bg-white text-[11px] font-bold text-black/90 active:scale-95 transition-transform"
            >
              Recharge
            </button>
          )}
        </motion.div>
      )}
    </AnimatePresence>
  );
}
