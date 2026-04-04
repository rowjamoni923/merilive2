import { memo } from "react";
import { Gem } from "lucide-react";

interface TraderBadgeProps {
  level?: number;
  size?: "xs" | "sm" | "md";
  className?: string;
}

/**
 * Premium Trader Badge - shown for Helpers & Payroll Helpers
 * Displays everywhere: Profile, Chat, Live, Party
 */
const TraderBadge = memo(({ level = 1, size = "sm", className = "" }: TraderBadgeProps) => {
  const sizeConfig = {
    xs: { text: "text-[7px]", icon: "w-2 h-2", px: "px-1 py-0", gap: "gap-0.5" },
    sm: { text: "text-[9px]", icon: "w-2.5 h-2.5", px: "px-1.5 py-0.5", gap: "gap-0.5" },
    md: { text: "text-[10px]", icon: "w-3 h-3", px: "px-2.5 py-0.5", gap: "gap-1" },
  };

  const s = sizeConfig[size];

  return (
    <span
      className={`inline-flex items-center ${s.gap} ${s.px} rounded-full bg-gradient-to-r from-amber-500 via-yellow-400 to-amber-500 font-extrabold tracking-wide shadow-lg shadow-amber-500/30 ${s.text} text-black ${className}`}
    >
      <Gem className={s.icon} />
      Trader Lv.{level}
    </span>
  );
});

TraderBadge.displayName = "TraderBadge";

export default TraderBadge;
