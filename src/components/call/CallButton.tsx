import { Phone, Diamond } from "lucide-react";
import { useHostCallRate } from "@/hooks/useHostCallRate";

interface CallButtonProps {
  hostId: string;
  onClick: () => void;
  size?: "sm" | "md" | "lg";
  showRate?: boolean;
  className?: string;
  /** Pre-fetched call rate to avoid N+1 queries */
  preloadedRate?: number | null;
}

export function CallButton({
  hostId,
  onClick,
  size = "md",
  showRate = true,
  className = "",
  preloadedRate,
}: CallButtonProps) {
  const { callRate: fetchedRate, loading } = useHostCallRate(
    preloadedRate !== undefined ? null : hostId
  );

  const callRate = preloadedRate !== undefined ? preloadedRate : fetchedRate;

  const formatRate = (rate: number): string => {
    if (rate >= 1000) return `${(rate / 1000).toFixed(rate >= 10000 ? 0 : 1)}K`;
    return rate.toString();
  };

  const sizeClasses = {
    sm: "w-10 h-10",
    md: "w-12 h-12",
    lg: "w-14 h-14",
  };

  const iconSizes = {
    sm: "w-4 h-4",
    md: "w-5 h-5",
    lg: "w-6 h-6",
  };

  return (
    <div className={`flex flex-col items-center gap-1 ${className}`}>
      <button
        onClick={onClick}
        className={`${sizeClasses[size]} rounded-full text-white flex items-center justify-center relative overflow-hidden transition-opacity active:opacity-80`}
        style={{
          background:
            'radial-gradient(120% 120% at 30% 20%, #fb923c 0%, #ec4899 45%, #a855f7 100%)',
          boxShadow:
            '0 10px 24px -6px rgba(236,72,153,0.6), 0 4px 10px -2px rgba(168,85,247,0.45), inset 0 1px 0 rgba(255,255,255,0.55), inset 0 -3px 8px rgba(0,0,0,0.25)',
        }}
        aria-label="Call host"
      >
        {/* Inner glossy highlight */}
        <span
          aria-hidden
          className="pointer-events-none absolute inset-0 rounded-full"
          style={{
            background:
              'radial-gradient(60% 40% at 50% 18%, rgba(255,255,255,0.55), transparent 70%)',
          }}
        />
        {/* Pulse ring */}
        <span
          aria-hidden
          className="absolute inset-0 rounded-full border-2 border-white/35"
        />
        {/* Static glossy finish — no infinite animation on scroll lists. */}
        <Phone
          className={`${iconSizes[size]} relative`}
          style={{ filter: 'drop-shadow(0 1px 2px rgba(0,0,0,0.45))' }}
        />
      </button>

      {/* Rate Display */}
      {showRate && callRate && callRate > 0 && (
        <div
          className="flex items-center gap-0.5 px-2 py-0.5 rounded-full -mt-2 relative z-10 border border-white/40"
          style={{
            background:
              'linear-gradient(180deg, #fbbf24 0%, #f97316 100%)',
            boxShadow:
              '0 6px 14px -4px rgba(249,115,22,0.55), inset 0 1px 0 rgba(255,255,255,0.45)',
          }}
        >
          <Diamond
            className="w-2.5 h-2.5 text-white"
            style={{ filter: 'drop-shadow(0 1px 1px rgba(0,0,0,0.35))' }}
          />
          <span
            className="text-[10px] font-extrabold text-white tabular-nums"
            style={{ textShadow: '0 1px 1px rgba(0,0,0,0.3)' }}
          >
            {preloadedRate !== undefined ? formatRate(callRate) : (loading ? "..." : formatRate(callRate))}
          </span>
          <span className="text-[8px] text-white/85 font-semibold">/min</span>
        </div>
      )}
    </div>
  );
}
