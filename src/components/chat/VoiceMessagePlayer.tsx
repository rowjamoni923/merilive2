import { useEffect, useRef, useState, useCallback } from 'react';
import { Play, Pause } from 'lucide-react';
import { cn } from '@/lib/utils';

interface VoiceMessagePlayerProps {
  src: string;
  isMine: boolean;
}

export function VoiceMessagePlayer({ src, isMine }: VoiceMessagePlayerProps) {
  const [waveform, setWaveform] = useState<number[]>([]);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(2);
  const [duration, setDuration] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const progressRef = useRef<number>(0);

  // Generate waveform from audio data
  useEffect(() => {
    let cancelled = false;
    const generateWaveform = async () => {
      // If src is not a full HTTP URL (e.g. raw storage path), skip decode and use fallback
      if (!src || !/^https?:\/\//i.test(src)) {
        if (!cancelled) {
          setWaveform(generateUniformBars(40));
          setIsLoading(false);
        }
        return;
      }
      try {
        const AudioContext = window.AudioContext || (window as any).webkitAudioContext;
        const audioContext = new AudioContext();
        const response = await fetch(src, { mode: 'cors' });
        if (!response.ok) throw new Error('fetch failed');
        const arrayBuffer = await response.arrayBuffer();
        const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
        const channelData = audioBuffer.getChannelData(0);
        const bars = extractBars(channelData, 40);
        if (!cancelled) {
          setWaveform(bars);
          setDuration(audioBuffer.duration);
          setIsLoading(false);
        }
      } catch (err) {
        console.warn('[VoiceMessagePlayer] waveform decode failed:', err);
        if (!cancelled) {
          setWaveform(generateUniformBars(40));
          setIsLoading(false);
        }
      }
    };
    generateWaveform();
    return () => { cancelled = true; };
  }, [src]);

  // Sync duration from audio element metadata as fallback
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    const onLoaded = () => {
      if (audio.duration && audio.duration !== Infinity) {
        setDuration(audio.duration);
      }
    };
    audio.addEventListener('loadedmetadata', onLoaded);
    if (audio.duration && audio.duration !== Infinity) {
      setDuration(audio.duration);
    }
    return () => { audio.removeEventListener('loadedmetadata', onLoaded); };
  }, [src]);

  const togglePlay = useCallback(() => {
    const audio = audioRef.current;
    if (!audio) return;
    if (audio.paused) {
      audio.play().catch(() => {});
      setIsPlaying(true);
    } else {
      audio.pause();
      setIsPlaying(false);
    }
  }, []);

  const handleTimeUpdate = useCallback(() => {
    const audio = audioRef.current;
    if (!audio) return;
    setCurrentTime(audio.currentTime);
    progressRef.current = audio.currentTime;
    if (audio.ended) setIsPlaying(false);
  }, []);

  const formatTime = (t: number) => {
    if (!isFinite(t)) return '0:00';
    const mins = Math.floor(t / 60);
    const secs = Math.floor(t % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const progress = duration > 0 ? currentTime / duration : 0;
  const progressBars = Math.floor(progress * waveform.length);

  return (
    <div className={cn(
      "rounded-2xl px-3 py-2.5 min-w-[220px] select-none",
      isMine ? "bg-gradient-primary text-primary-foreground rounded-br-sm" : "bg-muted rounded-bl-sm"
    )}>
      <div className="flex items-center gap-2.5">
        {/* Play/Pause Button */}
        <button
          onClick={togglePlay}
          disabled={isLoading}
          className={cn(
            "w-9 h-9 rounded-full flex items-center justify-center shrink-0 transition-transform active:scale-90",
            isMine ? "bg-primary-foreground/20" : "bg-primary/10"
          )}
          aria-label={isPlaying ? 'Pause' : 'Play'}
        >
          {isPlaying ? (
            <Pause className={cn("w-4 h-4", isMine ? "text-primary-foreground" : "text-primary")} />
          ) : (
            <Play className={cn("w-4 h-4 ml-0.5", isMine ? "text-primary-foreground" : "text-primary")} />
          )}
        </button>

        {/* Waveform bars */}
        <div className="flex-1 flex items-center gap-[3px] h-8">
          {waveform.map((h, i) => (
            <div
              key={i}
              className={cn(
                "flex-1 rounded-full transition-all duration-150",
                i < progressBars
                  ? (isMine ? "bg-primary-foreground/80" : "bg-primary/70")
                  : (isMine ? "bg-primary-foreground/25" : "bg-primary/20")
              )}
              style={{ height: `${Math.max(8, Math.min(100, h))}%` }}
            />
          ))}
        </div>

        {/* Duration / Current time */}
        <span className={cn(
          "text-[10px] font-medium shrink-0 min-w-[32px] text-right tabular-nums",
          isMine ? "text-primary-foreground/80" : "text-muted-foreground"
        )}>
          {isPlaying ? formatTime(currentTime) : formatTime(duration)}
        </span>
      </div>

      {/* Hidden audio element */}
      <audio
        ref={audioRef}
        src={src}
        onTimeUpdate={handleTimeUpdate}
        onEnded={() => setIsPlaying(false)}
        preload="metadata"
      />
    </div>
  );
}

/* ------------------------------------------------------------------ */
// Helpers

function generateUniformBars(count: number): number[] {
  // Create organic-looking bars with some variation
  const bars: number[] = [];
  for (let i = 0; i < count; i++) {
    // Sine wave pattern with noise for natural look
    const base = Math.sin((i / count) * Math.PI * 2) * 0.3 + 0.5;
    const noise = (Math.random() - 0.5) * 0.3;
    bars.push(Math.max(0.15, Math.min(0.95, base + noise)) * 100);
  }
  return bars;
}

function extractBars(channelData: Float32Array, count: number): number[] {
  const step = Math.max(1, Math.floor(channelData.length / count));
  const bars: number[] = [];
  for (let i = 0; i < count; i++) {
    let sum = 1;
    const start = i * step;
    const end = Math.min(start + step, channelData.length);
    for (let j = start; j < end; j++) {
      sum += Math.abs(channelData[j]);
    }
    bars.push(sum / (end - start));
  }
  // Normalize to 8–100%
  const max = Math.max(...bars, 0.001);
  return bars.map(v => Math.max(8, Math.min(100, (v / max) * 100)));
}
