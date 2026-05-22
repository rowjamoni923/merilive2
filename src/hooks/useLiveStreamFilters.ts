import { useState, useEffect, useCallback } from 'react';
import { publishLiveFilterUpdate } from '@/lib/livekitLiveFilterSignaling';

export interface LiveFilterState {
  beautyEnabled: boolean;
  beautySettings: {
    smoothness: number;
    whitening: number;
    redness: number;
    sharpness: number;
    glow: number;
    warmth: number;
    eyeBright: number;
    skinTone: number;
    faceSlim: number;
    chinSlim: number;
    eyeEnlarge: number;
    noseNarrow: number;
    lipColor: number;
  };
  activeFilters: Record<string, number>;
  activeSticker: string | null;
}

const defaultFilterState: LiveFilterState = {
  beautyEnabled: true,
  beautySettings: {
    smoothness: 35,
    whitening: 20,
    redness: 10,
    sharpness: 15,
    glow: 10,
    warmth: 10,
    eyeBright: 15,
    skinTone: 55,
    faceSlim: 15,
    chinSlim: 10,
    eyeEnlarge: 10,
    noseNarrow: 5,
    lipColor: 10,
  },
  activeFilters: {},
  activeSticker: null,
};

export const useLiveStreamFilters = (streamId: string | undefined, isHost: boolean) => {
  const [filterState, setFilterState] = useState<LiveFilterState>(defaultFilterState);
  const [isLoading, setIsLoading] = useState(true);

  // LiveKit-only filter sync: no Supabase Realtime channel.
  useEffect(() => {
    if (!streamId) return;

    setIsLoading(false);

    const handleFilterUpdate = (event: Event) => {
      const detail = (event as CustomEvent<{ payload?: { streamId?: string; state?: LiveFilterState } }>).detail;
      if (detail?.payload?.streamId !== streamId || !detail.payload.state) return;
      setFilterState(detail.payload.state);
    };

    window.addEventListener('livekit-live-filter', handleFilterUpdate as EventListener);

    return () => {
      window.removeEventListener('livekit-live-filter', handleFilterUpdate as EventListener);
    };
  }, [streamId]);

  // Broadcast filter changes (host only)
  const broadcastFilterUpdate = useCallback(async (newState: LiveFilterState) => {
    if (!streamId || !isHost) return;

    await publishLiveFilterUpdate(streamId, newState);
  }, [streamId, isHost]);

  // Update beauty enabled
  const setBeautyEnabled = useCallback((enabled: boolean) => {
    setFilterState(prev => {
      const newState = { ...prev, beautyEnabled: enabled };
      broadcastFilterUpdate(newState);
      return newState;
    });
  }, [broadcastFilterUpdate]);

  // Update beauty settings
  const setBeautySettings = useCallback((settings: LiveFilterState['beautySettings']) => {
    setFilterState(prev => {
      const newState = { ...prev, beautySettings: settings };
      broadcastFilterUpdate(newState);
      return newState;
    });
  }, [broadcastFilterUpdate]);

  // Update active filters
  const setActiveFilters = useCallback((filters: Record<string, number>) => {
    setFilterState(prev => {
      const newState = { ...prev, activeFilters: filters };
      broadcastFilterUpdate(newState);
      return newState;
    });
  }, [broadcastFilterUpdate]);

  // Update single filter
  const updateFilter = useCallback((filterId: string, intensity: number) => {
    setFilterState(prev => {
      const newFilters = { ...prev.activeFilters, [filterId]: intensity };
      const newState = { ...prev, activeFilters: newFilters };
      broadcastFilterUpdate(newState);
      return newState;
    });
  }, [broadcastFilterUpdate]);

  // Update active sticker
  const setActiveSticker = useCallback((stickerId: string | null) => {
    setFilterState(prev => {
      const newState = { ...prev, activeSticker: stickerId };
      broadcastFilterUpdate(newState);
      return newState;
    });
  }, [broadcastFilterUpdate]);

  // Generate CSS filter string — combines all values into a single clean filter string
  const generateFilterCSS = useCallback(() => {
    const { beautyEnabled, beautySettings, activeFilters } = filterState;
    
    // Accumulate individual CSS filter values to avoid duplicate/conflicting filter functions
    let brightness = 1;
    let contrast = 1;
    let saturate = 1;
    let sepia = 0;
    let hueRotate = 0;

    // Apply beauty settings (0-100 scale)
    if (beautyEnabled) {
      const s = beautySettings;
      brightness += (s.whitening * 0.004) + ((s.glow || 0) * 0.003) + ((s.eyeBright || 0) * 0.001) + (s.smoothness * 0.001);
      contrast += (s.sharpness * 0.004) - (s.smoothness * 0.002) - (s.whitening * 0.001);
      saturate += (s.redness * 0.004) + ((s.warmth || 0) * 0.003) - (s.whitening * 0.002);
      const skinWarmth = Math.max(0, ((s.skinTone || 50) - 50)) / 50;
      sepia += ((s.warmth || 0) * 0.002) + (skinWarmth * 0.08);
      const skinCoolness = Math.max(0, (50 - (s.skinTone || 50))) / 50;
      hueRotate += (skinCoolness * -8) + (s.redness * 0.05);
    }

    // Apply advanced filters by accumulating values
    Object.entries(activeFilters).forEach(([filterId, intensity]) => {
      if (intensity <= 0) return;
      switch (filterId) {
        case 'smooth':
          brightness += intensity * 0.02;
          saturate -= intensity * 0.02;
          break;
        case 'whitening':
          brightness += intensity * 0.08;
          contrast += intensity * 0.02;
          break;
        case 'rosy':
          saturate += intensity * 0.1;
          hueRotate -= 2 * intensity;
          break;
        case 'warm':
          sepia += intensity * 0.08;
          saturate += intensity * 0.06;
          break;
        case 'cool':
          hueRotate += 5 * intensity;
          saturate -= intensity * 0.03;
          break;
        case 'vintage':
          sepia += intensity * 0.15;
          contrast -= intensity * 0.05;
          brightness += intensity * 0.02;
          break;
        case 'vivid':
          saturate += intensity * 0.2;
          contrast += intensity * 0.02;
          break;
        case 'glow':
          brightness += intensity * 0.05;
          break;
        case 'sharp':
          contrast += intensity * 0.12;
          saturate += intensity * 0.08;
          break;
        case 'clarity':
          contrast += intensity * 0.1;
          brightness += intensity * 0.03;
          saturate += intensity * 0.05;
          break;
        case 'hd':
          contrast += intensity * 0.15;
          saturate += intensity * 0.1;
          break;
        case 'lowlight':
          brightness += intensity * 0.25;
          contrast += intensity * 0.08;
          saturate += intensity * 0.05;
          break;
        case 'nightmode':
          brightness += intensity * 0.35;
          contrast += intensity * 0.1;
          saturate -= intensity * 0.05;
          break;
      }
    });

    // Build combined filter string with safe max limits
    const filters: string[] = [];
    if (brightness !== 1) filters.push(`brightness(${Math.min(brightness, 1.5).toFixed(3)})`);
    if (contrast !== 1) filters.push(`contrast(${Math.min(Math.max(contrast, 0.7), 1.4).toFixed(3)})`);
    if (saturate !== 1) filters.push(`saturate(${Math.min(Math.max(saturate, 0.7), 1.5).toFixed(3)})`);
    if (sepia > 0) filters.push(`sepia(${Math.min(sepia, 0.4).toFixed(3)})`);
    if (hueRotate !== 0) filters.push(`hue-rotate(${hueRotate.toFixed(1)}deg)`);
    // Subtle blur for skin smoothing from beauty
    if (beautyEnabled && beautySettings.smoothness > 0) {
      const blurVal = beautySettings.smoothness * 0.006;
      if (blurVal > 0.05) filters.push(`blur(${Math.min(blurVal, 0.6).toFixed(2)}px)`);
    }

    return filters.join(' ');
  }, [filterState]);

  return {
    filterState,
    isLoading,
    setBeautyEnabled,
    setBeautySettings,
    setActiveFilters,
    updateFilter,
    setActiveSticker,
    generateFilterCSS,
  };
};
