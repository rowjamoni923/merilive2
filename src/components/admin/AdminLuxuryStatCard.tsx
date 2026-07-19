import { ReactNode } from "react";
import { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

type LuxuryCardTone = "gold" | "accent" | "royal" | "soft" | "danger";

interface AdminLuxuryStatCardProps {
  label: string;
  value: ReactNode;
  icon: LucideIcon;
  tone?: LuxuryCardTone;
  className?: string;
  valueClassName?: string;
}

const toneStyles: Record<
  LuxuryCardTone,
  {
    bg: string;
    border: string;
    iconBg: string;
    iconColor: string;
    glow: string;
    shimmer: string;
    valueColor: string;
  }
> = {
  gold: {
    bg: "bg-gradient-to-br from-[#1e1708] via-[#1a1306] to-[#0f0d04]",
    border: "border-amber-500/25 hover:border-amber-400/50",
    iconBg: "bg-gradient-to-br from-amber-500 via-yellow-500 to-amber-600 shadow-lg shadow-amber-500/40",
    iconColor: "text-black",
    glow: "shadow-[0_0_40px_-12px_rgba(245,158,11,0.4)]",
    shimmer: "from-transparent via-amber-400/8 to-transparent",
    valueColor: "text-amber-100",
  },
  accent: {
  },
  royal: {
  },
  soft: {
  },
  danger: {
  },
};

export default function AdminLuxuryStatCard({
  label,
  value,
  icon: Icon,
  tone = "gold",
  className,
  valueClassName,
}: AdminLuxuryStatCardProps) {
  const s = toneStyles[tone];

  return (
    <div
      className={cn(
        "group relative overflow-hidden rounded-2xl border transition-all duration-500",
        "hover:-translate-y-1 hover:scale-[1.02]",
        s.bg,
        s.border,
        s.glow,
        className,
      )}
    >
      {/* Top shine line */}
      <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/20 to-transparent" />
      
      {/* Shimmer sweep animation */}
      <div className={cn(
        "absolute inset-0 bg-gradient-to-r opacity-0 group-hover:opacity-100 transition-opacity duration-500",
        s.shimmer,
      )} />
      
      {/* Corner glow */}
      <div className="absolute -top-12 -right-12 w-24 h-24 rounded-full bg-white/[0.02] blur-2xl group-hover:bg-white/[0.04] transition-all duration-700" />

      <div className="relative p-5 text-center">
        {/* Icon */}
        <div className={cn(
          "mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-xl",
          "ring-2 ring-white/10 transition-transform duration-300 group-hover:scale-110",
          s.iconBg,
        )}>
          <Icon className={cn("h-5.5 w-5.5", s.iconColor)} />
        </div>

        {/* Value */}
        <p className={cn(
          "text-2xl font-extrabold tracking-tight",
          s.valueColor,
          valueClassName,
        )}>
          {value}
        </p>
        
        {/* Label */}
        <p className="mt-1.5 text-[10px] font-semibold uppercase tracking-[0.15em] text-white/40">
          {label}
        </p>
      </div>
    </div>
  );
}
