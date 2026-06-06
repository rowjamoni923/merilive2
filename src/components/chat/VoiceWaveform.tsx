import React, { useMemo } from 'react';
import { cn } from "@/lib/utils";

interface VoiceWaveformProps {
  amplitudes: number[]; // 0..32767
  isRecording?: boolean;
  className?: string;
}

export const VoiceWaveform: React.FC<VoiceWaveformProps> = ({ 
  amplitudes, 
  isRecording = true,
  className 
}) => {
  // Normalize amplitudes to 0..1 range and keep last 30 bars
  const normalizedData = useMemo(() => {
    const data = amplitudes.slice(-30);
    // Fill with zeroes if we have less than 30 points
    const padded = Array(Math.max(0, 30 - data.length)).fill(0).concat(data);
    return padded.map(v => Math.min(1, v / 32767));
  }, [amplitudes]);

  return (
    <div className={cn("flex items-center gap-[2px] h-10 px-2", className)}>
      {normalizedData.map((v, i) => {
        // Minimum height of 4px, max 32px
        const height = 4 + v * 28;
        const opacity = 0.3 + (i / 30) * 0.7; // Fade in effect from left to right

        return (
          <div
            key={i}
            className={cn(
              "w-[2px] rounded-full transition-all duration-100",
              isRecording ? "bg-primary" : "bg-muted-foreground"
            )}
            style={{ 
              height: `${height}px`,
              opacity: opacity
            }}
          />
        );
      })}
      
      {isRecording && (
        <div className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse ml-1 shrink-0" />
      )}
    </div>
  );
};
