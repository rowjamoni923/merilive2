import { useEffect, useRef, useState, useCallback } from 'react';
import { Play, Pause, Mic } from 'lucide-react';
import { cn } from '@/lib/utils';

interface VoiceMessagePlayerProps {
  src: string;
  isMine: boolean;
}

const BAR_COUNT = 38;

export function VoiceMessagePlayer({ src, isMine }: VoiceMessagePlayerProps) {
  const [waveform, setWaveform] = useState<number[]>(() => generateUniformBars(BAR_COUNT));
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [played, setPlayed] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const waveRef = useRef<HTMLDivElement | null>(null);

  // Decode waveform
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!src || !/^https?:\/\//i.test(src)) {
        if (!cancelled) setIsLoading(false);
        return;
      }
      try {
        const Ctx = window.AudioContext || (window as any).webkitAudioContext;
        const ac = new Ctx();
        const res = await fetch(src, { mode: 'cors' });
        if (!res.ok) throw new Error('fetch failed');
        const buf = await res.arrayBuffer();
        const audioBuffer = await ac.decodeAudioData(buf);
        const bars = extractBars(audioBuffer.getChannelData(0), BAR_COUNT);
        if (!cancelled) {
          setWaveform(bars);
          setDuration(audioBuffer.duration);
          setIsLoading(false);
        }
      } catch {
        if (!cancelled) setIsLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [src]);

  // Audio metadata fallback
  useEffect(() => {
    const a = audioRef.current;
    if (!a) return;
    const onLoaded = () => {
      if (a.duration && isFinite(a.duration)) setDuration(a.duration);
    };
    a.addEventListener('loadedmetadata', onLoaded);
    return () => a.removeEventListener('loadedmetadata', onLoaded);
  }, [src]);

  const togglePlay = useCallback(() => {
    const a = audioRef.current;
    if (!a) return;
    if (a.paused) {
      a.play().catch(() => {});
      setIsPlaying(true);
      setPlayed(true);
    } else {
      a.pause();
      setIsPlaying(false);
    }
  }, []);

  const onTimeUpdate = useCallback(() => {
    const a = audioRef.current;
    if (!a) return;
    setCurrentTime(a.currentTime);
  }, []);

  const seekTo = useCallback((clientX: number) => {
    const el = waveRef.current;
    const a = audioRef.current;
    if (!el || !a || !duration) return;
    const rect = el.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    a.currentTime = ratio * duration;
    setCurrentTime(a.currentTime);
  }, [duration]);

  const fmt = (t: number) => {
    if (!isFinite(t) || t < 0) t = 0;
    const m = Math.floor(t / 60);
    const s = Math.floor(t % 60);
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  const progress = duration > 0 ? currentTime / duration : 0;
  const progressBars = Math.round(progress * waveform.length);
  const displayTime = isPlaying || currentTime > 0 ? currentTime : duration;

  // WhatsApp-style: neutral light/dark bubble, NOT gradient.
  const bubbleCls = isMine
    ? 'bg-primary/10 text-foreground rounded-br-md'
    : 'bg-card text-foreground rounded-bl-md border border-border';
  const playBtnCls = 'bg-primary text-primary-foreground';
  const playedBar = isMine ? 'bg-primary' : 'bg-primary';
  const unplayedBar = 'bg-foreground/25';

  return (
    <div className={cn('rounded-2xl px-3 py-2 min-w-[230px] max-w-[280px] select-none shadow-sm', bubbleCls)}>
      <div className="flex items-center gap-2.5">
        {/* Avatar with mic indicator */}
        <div className="relative shrink-0">
          <button
            onClick={togglePlay}
            disabled={isLoading}
            aria-label={isPlaying ? 'Pause' : 'Play'}
            className={cn(
              'w-10 h-10 rounded-full flex items-center justify-center transition active:scale-90 shadow',
              playBtnCls,
              isLoading && 'opacity-60'
            )}
          >
            {isPlaying ? <Pause className="w-5 h-5" /> : <Play className="w-5 h-5 ml-0.5" />}
          </button>
          <span className="absolute -bottom-0.5 -right-0.5 w-4 h-4 rounded-full bg-card border border-border flex items-center justify-center">
            <Mic className="w-2.5 h-2.5 text-primary" />
          </span>
        </div>

        {/* Waveform + time */}
        <div className="flex-1 min-w-0 flex flex-col justify-center gap-1">
          <div
            ref={waveRef}
            onClick={(e) => seekTo(e.clientX)}
            className="relative flex items-center gap-[2px] h-7 cursor-pointer"
          >
            {waveform.map((h, i) => (
              <div
                key={i}
                className={cn(
                  'flex-1 rounded-full transition-colors',
                  i < progressBars ? playedBar : unplayedBar
                )}
                style={{ height: `${Math.max(14, Math.min(100, h))}%` }}
              />
            ))}
          </div>
          <div className="flex items-center justify-between text-[10px] tabular-nums text-muted-foreground">
            <span>{fmt(displayTime)}</span>
            {!played && !isPlaying && (
              <span className="w-1.5 h-1.5 rounded-full bg-primary" aria-label="unplayed" />
            )}
          </div>
        </div>
      </div>

      <audio
        ref={audioRef}
        src={src}
        onTimeUpdate={onTimeUpdate}
        onEnded={() => { setIsPlaying(false); setCurrentTime(0); }}
        preload="metadata"
      />
    </div>
  );
}

function generateUniformBars(count: number): number[] {
  const bars: number[] = [];
  for (let i = 0; i < count; i++) {
    const base = Math.sin((i / count) * Math.PI * 2.5) * 0.25 + 0.55;
    const noise = (Math.sin(i * 1.7) + Math.cos(i * 0.9)) * 0.12;
    bars.push(Math.max(0.25, Math.min(0.95, base + noise)) * 100);
  }
  return bars;
}

function extractBars(channelData: Float32Array, count: number): number[] {
  const step = Math.max(1, Math.floor(channelData.length / count));
  const bars: number[] = [];
  for (let i = 0; i < count; i++) {
    let peak = 0;
    let sumSq = 0;
    const start = i * step;
    const end = Math.min(start + step, channelData.length);
    for (let j = start; j < end; j++) {
      const v = Math.abs(channelData[j]);
      if (v > peak) peak = v;
      sumSq += v * v;
    }
    const rms = Math.sqrt(sumSq / Math.max(1, end - start));
    bars.push(peak * 0.7 + rms * 0.3);
  }
  const max = Math.max(...bars, 0.0001);
  return bars.map(v => {
    const n = Math.pow(v / max, 0.65);
    return Math.max(20, Math.min(100, n * 100));
  });
}
