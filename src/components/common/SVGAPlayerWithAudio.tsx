import React, { useRef, useEffect, useState, useCallback } from 'react';
import { cn } from '@/lib/utils';
import { loadSVGA, stripAudio } from '@/utils/svgaLoader';
import { getSVGAModule } from '@/utils/svgaPrewarm';
import { extractAudioFromSVGA } from '@/utils/svgaAudioExtractor';
import { ensureAudioUnlocked } from '@/utils/audioUnlock';
import { Howl } from 'howler';
import {
  isAnimationDebugEnabled,
  logAnimationCompletion,
  type AnimationCompletionSource,
} from '@/utils/animationDebug';


interface SVGAPlayerWithAudioProps {
  src: string;
  className?: string;
  loop?: boolean;
  autoPlay?: boolean;
  onLoad?: () => void;
  onError?: (error: Error) => void;
  onComplete?: () => void;
  /** Receives onComplete with provenance ('native' = SVGA onFinished fired, 'safety-timer' = duration-based fallback). */
  onCompleteDebug?: (source: AnimationCompletionSource) => void;
  onAudioExtracted?: (audioUrl: string | null) => void;
  volume?: number;
  /** Optional admin-uploaded sound URL — used as fallback when SVGA has no embedded audio */
  soundUrl?: string | null;
}

const SVGAPlayerWithAudio: React.FC<SVGAPlayerWithAudioProps> = ({
  src,
  className,
  loop = false,
  autoPlay = true,
  onLoad,
  onError,
  onComplete,
  onCompleteDebug,
  onAudioExtracted,
  volume = 0.8,
  soundUrl = null,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const playerRef = useRef<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const completedRef = useRef(false);
  const mountedRef = useRef(true);
  const activeHowlsRef = useRef<Howl[]>([]);
  const activeAudiosRef = useRef<HTMLAudioElement[]>([]);
  const completionTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const startTimeRef = useRef<number>(0);
  const expectedDurationRef = useRef<number>(0);

  // Stable refs for callbacks — prevents parent re-renders from re-running the
  // load effect (which would tear down + rebuild the SVGA player and replay it).
  const onLoadRef = useRef(onLoad);
  const onErrorRef = useRef(onError);
  const onCompleteRef = useRef(onComplete);
  const onCompleteDebugRef = useRef(onCompleteDebug);
  const onAudioExtractedRef = useRef(onAudioExtracted);
  useEffect(() => { onLoadRef.current = onLoad; }, [onLoad]);
  useEffect(() => { onErrorRef.current = onError; }, [onError]);
  useEffect(() => { onCompleteRef.current = onComplete; }, [onComplete]);
  useEffect(() => { onCompleteDebugRef.current = onCompleteDebug; }, [onCompleteDebug]);
  useEffect(() => { onAudioExtractedRef.current = onAudioExtracted; }, [onAudioExtracted]);

  const resumeLoopingAnimation = useCallback(() => {
    if (!loop || !autoPlay || !mountedRef.current || !playerRef.current) return;
    try {
      playerRef.current.startAnimation();
    } catch (e) {}
  }, [loop, autoPlay]);

  const cleanupAudio = useCallback(() => {
    activeHowlsRef.current.forEach(h => { try { h.stop(); h.unload(); } catch {} });
    activeHowlsRef.current = [];
    activeAudiosRef.current.forEach(a => { try { a.pause(); a.src = ''; } catch {} });
    activeAudiosRef.current = [];
  }, []);

  const handleAnimationComplete = useCallback((source: AnimationCompletionSource = 'unknown') => {
    if (completedRef.current || !mountedRef.current) return;
    completedRef.current = true;

    const elapsed = startTimeRef.current > 0 ? Date.now() - startTimeRef.current : 0;
    const expected = expectedDurationRef.current;
    logAnimationCompletion('SVGAPlayerWithAudio', source, { elapsed, expected, src });
    onCompleteDebugRef.current?.(source);

    if (completionTimerRef.current) {
      clearTimeout(completionTimerRef.current);
      completionTimerRef.current = null;
    }

    if (playerRef.current) {
      try {
        playerRef.current.stopAnimation();
        playerRef.current.clear();
      } catch (e) {}
    }

    cleanupAudio();
    onCompleteRef.current?.();
  }, [cleanupAudio, src]);



  useEffect(() => {
    mountedRef.current = true;
    completedRef.current = false;
    
    if (!src || !containerRef.current) return;

    let player: any = null;
    const shouldPlayAudio = volume > 0;

    const loadAndPlay = async () => {
      try {
        // Visual playback must never wait for audio extraction/unlock.
        if (shouldPlayAudio) void ensureAudioUnlocked();
        const SVGA = await getSVGAModule();
        
        if (!mountedRef.current || !containerRef.current) return;

        player = new SVGA.Player(containerRef.current);
        playerRef.current = player;
        player.loops = loop ? 0 : 1;
        player.clearsAfterStop = !loop;

        const videoItem = await loadSVGA(src);
        if (!mountedRef.current) return;

        // Always strip audio from videoItem to prevent double-play
        const videoItemToUse = stripAudio(videoItem);
        const frames = videoItem?.frames || 0;
        const fps = videoItem?.FPS || 24;
        const exactDuration = frames > 0 ? (frames / fps) * 1000 : 0;

        expectedDurationRef.current = exactDuration;
        const fileTag = src.split('/').pop()?.split('?')[0] || 'svga';
        console.log(
          `[SVGAPlayerWithAudio] 📥 Loaded "${fileTag}" | frames=${frames} | fps=${fps} | nativeDuration=${exactDuration.toFixed(0)}ms | loop=${loop}`
        );

        player.setVideoItem(videoItemToUse);
        setLoading(false);
        onLoadRef.current?.();

        if (shouldPlayAudio) {
          void (async () => {
            let audioFound = false;
            try {
              const audioSegments = await extractAudioFromSVGA(src);
              const clampedVolume = Math.min(Math.max(volume, 0), 1);
              for (const segment of audioSegments) {
                if (playAudioSegment(segment.data, segment.mimeType, segment.format, clampedVolume, loop, activeHowlsRef, activeAudiosRef)) audioFound = true;
              }
              if (!audioFound) audioFound = extractAndPlayFromVideoItem(videoItem, volume, loop, activeHowlsRef, activeAudiosRef);
              if (!audioFound && soundUrl) {
                const fallbackHowl = new Howl({ src: [soundUrl], volume: clampedVolume, loop, html5: true });
                activeHowlsRef.current.push(fallbackHowl);
                fallbackHowl.play();
                audioFound = true;
              }
            } catch (e) {
              console.warn('[SVGAPlayerWithAudio] Audio resolved after visual start failed:', e);
            }
            onAudioExtractedRef.current?.(audioFound ? 'embedded' : null);
          })();
        }

        if (!loop) {
          player.onFinished(() => {
            if (mountedRef.current && !completedRef.current) {
              handleAnimationComplete('native');
            }
          });
        } else {
          player.onFinished(() => {
            requestAnimationFrame(resumeLoopingAnimation);
          });
        }

        if (autoPlay) {
          startTimeRef.current = Date.now();
          player.startAnimation();
          if (!loop && exactDuration > 0) {
            completionTimerRef.current = setTimeout(() => {
              if (mountedRef.current && !completedRef.current) {
                if (isAnimationDebugEnabled()) {
                  console.warn(
                    `[SVGAPlayerWithAudio] ⚠️ Native onFinished did NOT fire at native duration ${exactDuration.toFixed(0)}ms — triggering duration fallback for "${fileTag}"`
                  );
                }
                handleAnimationComplete('safety-timer');
              }
            }, Math.ceil(exactDuration));
          }
        }
        
      } catch (err) {
        console.error('[SVGAPlayerWithAudio] ❌ Error:', err);
        if (mountedRef.current) {
          setError('Failed to load animation');
          setLoading(false);
          onErrorRef.current?.(err instanceof Error ? err : new Error('Failed to load SVGA'));
        }
      }
    };

    loadAndPlay();

    const handleResume = () => resumeLoopingAnimation();
    document.addEventListener('visibilitychange', handleResume);
    window.addEventListener('focus', handleResume);

    return () => {
      mountedRef.current = false;
      document.removeEventListener('visibilitychange', handleResume);
      window.removeEventListener('focus', handleResume);
      cleanupAudio();
      if (completionTimerRef.current) {
        clearTimeout(completionTimerRef.current);
        completionTimerRef.current = null;
      }
      if (playerRef.current) {
        try {
          playerRef.current.stopAnimation();
          playerRef.current.clear();
        } catch (e) {}
        playerRef.current = null;
      }
    };
    // CRITICAL: only re-run for actual media inputs. Callback identity changes
    // (parent re-renders) must NEVER tear down + rebuild the player — that was
    // causing the same SVGA to replay over and over.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [src, loop, autoPlay, volume, soundUrl]);


  if (error) {
    return (
      <div className={cn("bg-transparent", className)} aria-hidden="true" />
    );
  }

  return (
    <div className={cn("relative", className)}>
      {loading && (
        <div className="absolute inset-0 bg-transparent" aria-hidden="true" />
      )}
      <div ref={containerRef} className="w-full h-full" />
    </div>
  );
};

/**
 * Play audio from raw Uint8Array data using Howler (primary) or HTML5 Audio (fallback)
 */
function playAudioSegment(
  audioData: Uint8Array,
  mimeType: string,
  format: string,
  volume: number,
  loop: boolean,
  howlsRef: React.MutableRefObject<Howl[]>,
  audiosRef: React.MutableRefObject<HTMLAudioElement[]>,
): boolean {
  try {
    const audioBlob = new Blob([audioData.buffer as ArrayBuffer], { type: mimeType });
    const audioUrl = URL.createObjectURL(audioBlob);
    
    try {
      const howl = new Howl({
        src: [audioUrl],
        format: [format],
        volume,
        loop,
        html5: true,
        onend: () => { if (!loop) URL.revokeObjectURL(audioUrl); },
        onloaderror: (_id: any, err: any) => {
          console.warn('[SVGAPlayerWithAudio] Howler load error:', err);
          URL.revokeObjectURL(audioUrl);
          // Fallback to HTML5
          playHTML5Audio(audioData, mimeType, volume, loop, audiosRef);
        },
        onplayerror: () => {
          howl.once('unlock', () => howl.play());
        },
      });
      howlsRef.current.push(howl);
      howl.play();
      console.log(`[SVGAPlayerWithAudio] 🔊 Playing via Howler, format: ${format}, size: ${(audioData.length / 1024).toFixed(1)}KB`);
      return true;
    } catch (howlerErr) {
      console.warn('[SVGAPlayerWithAudio] Howler failed:', howlerErr);
      URL.revokeObjectURL(audioUrl);
      return playHTML5Audio(audioData, mimeType, volume, loop, audiosRef);
    }
  } catch (e) {
    console.warn('[SVGAPlayerWithAudio] Audio playback failed:', e);
    return false;
  }
}

function playHTML5Audio(
  audioData: Uint8Array,
  mimeType: string,
  volume: number,
  loop: boolean,
  audiosRef: React.MutableRefObject<HTMLAudioElement[]>,
): boolean {
  try {
    const audioBlob = new Blob([audioData.buffer as ArrayBuffer], { type: mimeType });
    const audioUrl = URL.createObjectURL(audioBlob);
    const audio = new Audio(audioUrl);
    audio.volume = volume;
    audio.loop = loop;
    audiosRef.current.push(audio);
    
    audio.play()
      .then(() => console.log('[SVGAPlayerWithAudio] 🔊 Playing via HTML5 Audio'))
      .catch(() => {
        const playOnInteraction = () => {
          audio.play().catch(() => {});
          document.removeEventListener('touchstart', playOnInteraction);
          document.removeEventListener('click', playOnInteraction);
        };
        document.addEventListener('touchstart', playOnInteraction, { once: true });
        document.addEventListener('click', playOnInteraction, { once: true });
      });
    
    audio.addEventListener('ended', () => {
      if (!loop) {
        URL.revokeObjectURL(audioUrl);
        const idx = audiosRef.current.indexOf(audio);
        if (idx >= 0) audiosRef.current.splice(idx, 1);
      }
    });
    
    return true;
  } catch (e) {
    return false;
  }
}

/**
 * Fallback: Try to extract audio from svgaplayerweb's parsed VideoItem.
 * This works if the parser properly exposes audio data as base64 strings.
 */
function extractAndPlayFromVideoItem(
  videoItem: any,
  volume: number,
  loop: boolean,
  howlsRef: React.MutableRefObject<Howl[]>,
  audiosRef: React.MutableRefObject<HTMLAudioElement[]>,
): boolean {
  const clampedVolume = Math.min(Math.max(volume, 0), 1);
  let audioPlayed = false;

  // Strategy 1: Use audios array
  if (videoItem.audios?.length > 0) {
    for (const audioEntity of videoItem.audios) {
      const audioKey = audioEntity.audioKey;
      const base64Data = videoItem.images?.[audioKey];
      if (base64Data && typeof base64Data === 'string') {
        const played = playBase64Audio(base64Data, clampedVolume, loop, howlsRef, audiosRef);
        if (played) audioPlayed = true;
      }
    }
  }

  // Strategy 2: Scan images map for audio magic bytes
  if (!audioPlayed && videoItem.images) {
    for (const key in videoItem.images) {
      if (!videoItem.images.hasOwnProperty(key)) continue;
      const data = videoItem.images[key];
      if (typeof data !== 'string' || data.length < 16) continue;
      
      if (isAudioBase64(data)) {
        const played = playBase64Audio(data, clampedVolume, loop, howlsRef, audiosRef);
        if (played) audioPlayed = true;
      }
    }
  }

  return audioPlayed;
}

function isAudioBase64(base64: string): boolean {
  try {
    const snippet = base64.substring(0, 16);
    const binary = atob(snippet);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    
    // MP3 ID3
    if (bytes[0] === 0x49 && bytes[1] === 0x44 && bytes[2] === 0x33) return true;
    // MP3 frame sync
    if (bytes[0] === 0xFF && (bytes[1] & 0xE0) === 0xE0 && bytes[1] !== 0xFF) return true;
    // OGG
    if (bytes[0] === 0x4F && bytes[1] === 0x67 && bytes[2] === 0x67 && bytes[3] === 0x53) return true;
    // WAV
    if (bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46) return true;
    // AAC ADTS
    if (bytes[0] === 0xFF && (bytes[1] === 0xF1 || bytes[1] === 0xF9)) return true;
    // M4A ftyp
    if (bytes.length > 7 && bytes[4] === 0x66 && bytes[5] === 0x74 && bytes[6] === 0x79 && bytes[7] === 0x70) return true;
    // Exclude known image formats
  } catch {}
  return false;
}

function playBase64Audio(
  base64Data: string,
  volume: number,
  loop: boolean,
  howlsRef: React.MutableRefObject<Howl[]>,
  audiosRef: React.MutableRefObject<HTMLAudioElement[]>,
): boolean {
  try {
    let rawBase64 = base64Data;
    if (base64Data.startsWith('data:')) {
      rawBase64 = base64Data.split(',')[1] || base64Data;
    }
    const binary = atob(rawBase64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    
    const { mimeType, format } = detectFormat(bytes);
    return playAudioSegment(bytes, mimeType, format, volume, loop, howlsRef, audiosRef);
  } catch {
    return false;
  }
}

function detectFormat(bytes: Uint8Array): { mimeType: string; format: string } {
  if (bytes[0] === 0x49 && bytes[1] === 0x44 && bytes[2] === 0x33) return { mimeType: 'audio/mpeg', format: 'mp3' };
  if (bytes[0] === 0xFF && (bytes[1] & 0xE0) === 0xE0) return { mimeType: 'audio/mpeg', format: 'mp3' };
  if (bytes[0] === 0x4F && bytes[1] === 0x67 && bytes[2] === 0x67) return { mimeType: 'audio/ogg', format: 'ogg' };
  if (bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46) return { mimeType: 'audio/wav', format: 'wav' };
  if (bytes.length > 7 && bytes[4] === 0x66 && bytes[5] === 0x74 && bytes[6] === 0x79) return { mimeType: 'audio/mp4', format: 'mp4' };
  if (bytes[0] === 0xFF && (bytes[1] === 0xF1 || bytes[1] === 0xF9)) return { mimeType: 'audio/aac', format: 'aac' };
  return { mimeType: 'audio/mpeg', format: 'mp3' };
}

export default SVGAPlayerWithAudio;
