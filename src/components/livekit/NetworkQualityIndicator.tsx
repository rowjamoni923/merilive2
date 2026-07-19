import React, { useMemo } from 'react';
import { cn } from "@/lib/utils";
import { Wifi, WifiOff, SignalHigh, SignalLow, Signal } from "lucide-react";

export type NetworkQuality = 'excellent' | 'good' | 'poor' | 'lost' | 'unknown';

interface NetworkQualityIndicatorProps {
  quality: NetworkQuality;
  showLabel?: boolean;
  className?: string;
}

export const NetworkQualityIndicator: React.FC<NetworkQualityIndicatorProps> = ({ 
  quality, 
  showLabel = false,
  className 
}) => {
  const config = useMemo(() => {
    switch (quality) {
      case 'excellent':
        return {
          icon: <Wifi className="w-3.5 h-3.5 text-emerald-400" />,
          color: "text-emerald-400",
          bg: "bg-emerald-500/20",
          label: "Excellent",
          bars: 4
        };
      case 'good':
        return {
        };
      case 'poor':
        return {
        };
      case 'lost':
        return {
        };
      default:
        return {
        };
    }
  }, [quality]);

  return (
    <div className={cn(
      "flex items-center gap-1.5 px-2 py-1 rounded-full backdrop-blur-md border border-white/10 transition-all duration-300",
      config.bg,
      className
    )}>
      <div className="flex items-end gap-[1px] h-3">
        {[1, 2, 3, 4].map((i) => (
          <div
            key={i}
            className={cn(
              "w-[2px] rounded-t-[1px] transition-all duration-300",
              i <= config.bars ? config.color.replace('text-', 'bg-') : "bg-white/20"
            )}
            style={{ height: `${25 + i * 25}%` }}
          />
        ))}
      </div>
      
      {showLabel && (
        <span className={cn("text-[10px] font-bold tracking-tight uppercase", config.color)}>
          {config.label}
        </span>
      )}
      
      {config.icon}
    </div>
  );
};
