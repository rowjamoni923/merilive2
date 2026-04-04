import { Volume2, VolumeX, Volume1 } from "lucide-react";
import { motion } from "framer-motion";
import { Slider } from "@/components/ui/slider";
import { useState } from "react";

interface SoundVolumeControlProps {
  volume: number;
  setVolume: (volume: number) => void;
  isMuted: boolean;
  setMuted: (muted: boolean) => void;
  compact?: boolean;
}

export function SoundVolumeControl({ 
  volume, 
  setVolume, 
  isMuted, 
  setMuted,
  compact = false 
}: SoundVolumeControlProps) {
  const [showSlider, setShowSlider] = useState(false);

  const VolumeIcon = isMuted || volume === 0 
    ? VolumeX 
    : volume < 0.5 
      ? Volume1 
      : Volume2;

  if (compact) {
    return (
      <motion.button
        whileTap={{ scale: 0.9 }}
        onClick={() => setMuted(!isMuted)}
        className="w-6 h-6 flex items-center justify-center rounded-full bg-white/10 hover:bg-white/20 transition-colors"
      >
        <VolumeIcon className="w-3 h-3 text-white/70" />
      </motion.button>
    );
  }

  return (
    <div 
      className="relative flex items-center gap-1"
      onMouseEnter={() => setShowSlider(true)}
      onMouseLeave={() => setShowSlider(false)}
    >
      <motion.button
        whileTap={{ scale: 0.9 }}
        onClick={() => setMuted(!isMuted)}
        className="w-7 h-7 flex items-center justify-center rounded-lg bg-white/10 hover:bg-white/20 transition-colors"
      >
        <VolumeIcon className="w-3.5 h-3.5 text-white/70" />
      </motion.button>
      
      {showSlider && (
        <motion.div
          initial={{ opacity: 0, width: 0 }}
          animate={{ opacity: 1, width: 60 }}
          exit={{ opacity: 0, width: 0 }}
          className="overflow-hidden"
        >
          <Slider
            value={[isMuted ? 0 : volume * 100]}
            max={100}
            step={5}
            onValueChange={([val]) => {
              setVolume(val / 100);
              if (val > 0 && isMuted) setMuted(false);
            }}
            className="w-14"
          />
        </motion.div>
      )}
    </div>
  );
}
