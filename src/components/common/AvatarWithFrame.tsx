import React, { useState, useEffect, Suspense, lazy, memo, useCallback, useRef, forwardRef, useMemo } from 'react';
import { cn } from '@/lib/utils';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { supabase } from '@/integrations/supabase/client';
import {
  requestUserFrame,
  getUserFrameUrl,
  getLevelFrame,
  clearAllFrameCaches,
  clearUserFrameCacheById,
  preloadUserFrames,
} from '@/utils/frameCache';
import { getDisplayAvatar } from '@/utils/placeholderAvatar';
import { normalizeProfileMediaUrl } from '@/utils/profileMediaUrl';
import {
  getCachedGender,
  getCachedViewerId,
  requestGender,
  ensureViewerLoaded,
} from '@/utils/avatarGenderCache';

// Lazy load frame player
const UniversalFramePlayer = lazy(() => import('./UniversalFramePlayer'));

// Preload SVGA function
import { preloadSVGA } from './SVGAPlayer';


interface FrameData {
  id: string;
  name: string;
  frame_url: string;
  frame_type: string | null;
  min_level: number;
}

interface AvatarWithFrameProps {
  userId?: string;
  src?: string | null;
  name?: string;
  level?: number;
  isHost?: boolean;
  /** When known, callers can pass gender to skip the cache lookup. */
  gender?: 'male' | 'female' | null;
  /**
   * Force owner-mode (no AI placeholder). When undefined, AvatarWithFrame
   * auto-detects ownership by comparing userId to the signed-in viewer.
   */
  isOwner?: boolean;
  size?: 'xxs' | 'xs' | 'sm' | 'md' | 'lg' | 'xl' | '2xl';
  showFrame?: boolean;
  showAnimation?: boolean;
  showGlow?: boolean;
  isOnline?: boolean;
  className?: string;
  avatarClassName?: string;
  onClick?: () => void;
  frameId?: string | null;
}


// Size configurations
// Avatar fills the FULL container so no white ring shows between avatar and frame.
// Frame is rendered slightly larger (frameInset negative) so its outer decoration
// extends beyond the avatar disc while the inner hole sits flush around it.
const sizeConfigs = {
  xxs: { container: 24, avatar: 24, frameSize: 28, frameInset: -2, text: 'text-[6px]', online: 4 },
  xs:  { container: 36, avatar: 36, frameSize: 44, frameInset: -4, text: 'text-[7px]', online: 6 },
  sm:  { container: 48, avatar: 48, frameSize: 58, frameInset: -5, text: 'text-[10px]', online: 8 },
  md:  { container: 60, avatar: 60, frameSize: 74, frameInset: -7, text: 'text-xs',     online: 10 },
  lg:  { container: 80, avatar: 80, frameSize: 98, frameInset: -9, text: 'text-sm',     online: 12 },
  xl:  { container: 100, avatar: 100, frameSize: 124, frameInset: -12, text: 'text-base', online: 14 },
  '2xl': { container: 124, avatar: 124, frameSize: 152, frameInset: -14, text: 'text-lg', online: 16 },
};

// Track broken frame URLs globally
const brokenFrameUrls = new Set<string>();
const warmedFrameAssets = new Set<string>();
const warmedAvatarAssets = new Set<string>();

// Legacy frame cache (for direct frame ID lookups)
const frameCache = new Map<string, FrameData | null>();

const pendingFrameIds = new Set<string>();
const frameIdResolvers = new Map<string, Array<() => void>>();
let frameIdBatchTimer: ReturnType<typeof setTimeout> | null = null;

const detectFrameType = (url: string, fallbackType?: string | null) => {
  const urlPath = url.split('?')[0].toLowerCase();
  if (urlPath.endsWith('.svga')) return 'svga';
  if (urlPath.endsWith('.json')) return 'lottie';
  if (urlPath.endsWith('.gif')) return 'gif';
  if (urlPath.endsWith('.webp')) return 'webp';
  return fallbackType || 'static';
};

const flushFrameIdBatch = async () => {
  const frameIds = Array.from(pendingFrameIds);
  pendingFrameIds.clear();
  frameIdBatchTimer = null;

  if (frameIds.length === 0) return;

  try {
    const { data } = await supabase
      .from('avatar_frames')
      .select('id, name, frame_url, frame_type, min_level')
      .in('id', frameIds)
      .eq('is_active', true);

    const mappedFrames = new Map<string, FrameData>();
    data?.forEach((frame: any) => {
      if (!frame.frame_url) return;
      mappedFrames.set(frame.id, {
        ...frame,
        frame_type: detectFrameType(frame.frame_url, frame.frame_type),
      } as FrameData);
    });

    frameIds.forEach((frameId) => {
      frameCache.set(`frame-${frameId}`, mappedFrames.get(frameId) || null);
      const resolvers = frameIdResolvers.get(frameId) || [];
      resolvers.forEach((resolve) => resolve());
      frameIdResolvers.delete(frameId);
    });
  } catch {
    frameIds.forEach((frameId) => {
      frameCache.set(`frame-${frameId}`, null);
      const resolvers = frameIdResolvers.get(frameId) || [];
      resolvers.forEach((resolve) => resolve());
      frameIdResolvers.delete(frameId);
    });
  }
};

const requestFrameById = (frameId: string): Promise<void> => {
  if (frameCache.has(`frame-${frameId}`)) {
    return Promise.resolve();
  }

  return new Promise((resolve) => {
    const existingResolvers = frameIdResolvers.get(frameId) || [];
    existingResolvers.push(resolve);
    frameIdResolvers.set(frameId, existingResolvers);
    pendingFrameIds.add(frameId);

    if (!frameIdBatchTimer) {
      frameIdBatchTimer = setTimeout(() => {
        void flushFrameIdBatch();
      }, 20);
    }
  });
};

const warmImageAsset = (url: string) => {
  if (!url || typeof window === 'undefined') return;
  const img = new Image();
  img.decoding = 'async';
  img.src = url;
};

const warmFrameAsset = (url: string | null, type: string) => {
  if (!url || warmedFrameAssets.has(url)) return;
  warmedFrameAssets.add(url);

  if (type === 'svga') {
    preloadSVGA(url);
    return;
  }

  if (type === 'lottie') {
    fetch(url, { cache: 'force-cache' }).catch(() => undefined);
    return;
  }

  warmImageAsset(url);
};

const warmAvatarAsset = (url: string | null | undefined) => {
  if (!url || warmedAvatarAssets.has(url)) return;
  warmedAvatarAssets.add(url);
  warmImageAsset(url);
};

// Re-export for backwards compatibility
export const clearFrameCache = clearAllFrameCaches;
export const clearUserFrameCache = clearUserFrameCacheById;
export const clearLevelFrameCache = (level: number, isHost: boolean) => {
  const targetType = isHost ? 'host' : 'user';
  for (let i = 1; i <= level + 5; i++) {
    frameCache.delete(`${targetType}-${i}`);
    frameCache.delete(`user-${i}`);
    frameCache.delete(`host-${i}`);
  }
  clearAllFrameCaches();
};

// Batch preload frames for instant loading
export const preloadFrames = async (frameIds: string[]) => {
  const uncachedIds = frameIds.filter(id => !frameCache.has(`frame-${id}`));
  if (uncachedIds.length === 0) return;

  const { data } = await supabase
    .from('avatar_frames')
    .select('id, name, frame_url, frame_type, min_level')
    .in('id', uncachedIds)
    .eq('is_active', true);

  const mappedFrames = new Map<string, FrameData>();
  data?.forEach((frame: any) => {
    if (!frame.frame_url) return;
    const type = detectFrameType(frame.frame_url, frame.frame_type);
    const normalized = { ...frame, frame_type: type } as FrameData;
    frameCache.set(`frame-${frame.id}`, normalized);
    mappedFrames.set(frame.id, normalized);

    if (type === 'svga') {
      preloadSVGA(frame.frame_url);
    }
  });

  uncachedIds.forEach((id) => {
    if (!mappedFrames.has(id)) {
      frameCache.set(`frame-${id}`, null);
    }
  });
};

// Re-export preloadUserFrames
export { preloadUserFrames };

// CSS fallback frame gradient
const getLevelGradient = (level: number) => {
  if (level >= 50) return 'linear-gradient(135deg, #fbbf24, #f97316)';
  if (level >= 40) return 'linear-gradient(135deg, #ec4899, #a855f7)';
  if (level >= 30) return 'linear-gradient(135deg, #a855f7, #6366f1)';
  if (level >= 20) return 'linear-gradient(135deg, #06b6d4, #3b82f6)';
  if (level >= 10) return 'linear-gradient(135deg, #10b981, #06b6d4)';
  if (level >= 5) return 'linear-gradient(135deg, #f59e0b, #ef4444)';
  return 'linear-gradient(135deg, #6b7280, #4b5563)';
};

/**
 * AvatarWithFrame - Ultra-optimized, zero-jank avatar component
 * 
 * PERFORMANCE FIXES:
 * 1. REMOVED per-avatar Supabase realtime subscriptions (was creating N channels for N avatars!)
 * 2. REMOVED animate-pulse + blur glow (extreme GPU cost on old phones)
 * 3. Fixed container dimensions to prevent layout shifts (avatar "jumping")
 * 4. Uses contain: 'layout style' for rendering isolation
 */
const AvatarWithFrame = memo(forwardRef<HTMLDivElement, AvatarWithFrameProps>(({ 
  userId,
  src,
  name = 'U',
  level = 1,
  isHost = false,
  gender: genderProp,
  isOwner: isOwnerProp,
  size = 'md',
  showFrame = true,
  showGlow = false, // Disabled by default for performance
  isOnline,
  className,
  avatarClassName,
  onClick,
  frameId: propFrameId,
}: AvatarWithFrameProps, ref) => {
  const [activeFrameUrl, setActiveFrameUrl] = useState<string | null>(null);
  const [activeFrameType, setActiveFrameType] = useState<string>('static');
  const [frameError, setFrameError] = useState(false);

  // ───────── Gender-aware AI placeholder resolution ─────────
  // If src is missing AND viewer is NOT the profile owner, show a stable AI
  // placeholder picked from the matching gender pool. Owners always see their
  // real (possibly blank) avatar so they're nudged to upload one.
  const hasRealSrc = !!(src && src.trim().length > 0);
  const cached = userId ? getCachedGender(userId) : undefined;
  const initialGender: 'male' | 'female' | null =
    genderProp ??
    (cached
      ? (cached.is_host || cached.gender === 'female' ? 'female' : (cached.gender === 'male' ? 'male' : null))
      : null);
  const [resolvedGender, setResolvedGender] = useState<'male' | 'female' | null>(initialGender);
  const [viewerId, setViewerId] = useState<string | null>(getCachedViewerId());

  // Kick off gender lookup once per userId when missing avatar + unknown gender.
  useEffect(() => {
    if (hasRealSrc || !userId || genderProp || resolvedGender) return;
    let cancelled = false;
    requestGender(userId).then(() => {
      if (cancelled) return;
      const c = getCachedGender(userId);
      if (!c) return;
      setResolvedGender(
        c.is_host || c.gender === 'female' ? 'female' : c.gender === 'male' ? 'male' : null,
      );
    });
    return () => { cancelled = true; };
  }, [userId, hasRealSrc, genderProp, resolvedGender]);

  // Resolve current viewer id once (for owner detection).
  useEffect(() => {
    if (viewerId || isOwnerProp !== undefined) return;
    let cancelled = false;
    ensureViewerLoaded().then(() => {
      if (cancelled) return;
      const id = getCachedViewerId();
      if (id) setViewerId(id);
    });
    return () => { cancelled = true; };
  }, [viewerId, isOwnerProp]);

  const isOwner = isOwnerProp !== undefined
    ? isOwnerProp
    : !!(userId && viewerId && userId === viewerId);

  const effectiveSrc = useMemo(() => {
    if (hasRealSrc) return normalizeProfileMediaUrl(src) || src!;
    if (!userId) return undefined;
    if (isOwner) return undefined; // owner sees blank → AvatarFallback initial
    // Default to female pool when gender unknown (host-first product).
    return getDisplayAvatar(userId, null, { gender: resolvedGender ?? 'female' });
  }, [hasRealSrc, src, userId, isOwner, resolvedGender]);

  const sizeConfig = sizeConfigs[size];

  const displayName = name?.charAt(0)?.toUpperCase() || 'U';
  // Always eager — avatar must appear instantly with no flicker
  const avatarImageLoading: 'eager' | 'lazy' = 'eager';

  // Fetch frame - uses batch system (NO per-avatar realtime subscription)
  useEffect(() => {
    let cancelled = false;

    if (!showFrame) {
      setActiveFrameUrl(null);
      return;
    }

    // If propFrameId provided, use direct lookup with batched request
    if (propFrameId) {
      if (frameCache.has(`frame-${propFrameId}`)) {
        const cached = frameCache.get(`frame-${propFrameId}`);
        if (cached?.frame_url) {
          setActiveFrameUrl(cached.frame_url);
          setActiveFrameType(cached.frame_type || 'static');
        } else {
          setActiveFrameUrl(null);
        }
        return;
      }

      requestFrameById(propFrameId).then(() => {
        if (cancelled) return;

        const resolved = frameCache.get(`frame-${propFrameId}`);
        if (resolved?.frame_url) {
          setActiveFrameUrl(resolved.frame_url);
          setActiveFrameType(resolved.frame_type || 'static');
        } else {
          setActiveFrameUrl(null);
        }
      });

      return () => {
        cancelled = true;
      };
    }

    // Use batch system for userId - fetch IMMEDIATELY (no idle deferral)
    // Idle deferral caused 100-250ms frame lag on Profile/Chat/etc. Frame must be instant.
    if (userId) {
      const cached = getUserFrameUrl(userId);
      if (cached) {
        setActiveFrameUrl(cached.url);
        setActiveFrameType(cached.type);
        return;
      }

      requestUserFrame(userId).then(() => {
        if (cancelled) return;
        const result = getUserFrameUrl(userId);
        if (result) {
          setActiveFrameUrl(result.url);
          setActiveFrameType(result.type);
        }
      });
      return () => { cancelled = true; };
    }

    // No userId or propFrameId - use level-based frame
    const fetchLevelFrame = async () => {
      const frame = await getLevelFrame(level, isHost);
      if (cancelled) return;
      if (frame) {
        setActiveFrameUrl(frame.frame_url);
        setActiveFrameType(frame.frame_type || 'static');
      } else {
        setActiveFrameUrl(null);
      }
    };
    fetchLevelFrame();
    return () => { cancelled = true; };
  }, [userId, propFrameId, showFrame, level, isHost]);

  // ❌ REMOVED: Per-avatar realtime subscription
  // Previously each AvatarWithFrame created a supabase channel per userId
  // With 50+ avatars visible this created 50+ websocket subscriptions = massive lag + jumping

  // Reset frame error when URL changes
  useEffect(() => {
    if (activeFrameUrl) {
      setFrameError(brokenFrameUrls.has(activeFrameUrl));
    }
  }, [activeFrameUrl]);

  const handleFrameError = useCallback(() => {
    if (activeFrameUrl) brokenFrameUrls.add(activeFrameUrl);
    setFrameError(true);
  }, [activeFrameUrl]);
  
  const handleFrameLoad = useCallback((e: React.SyntheticEvent<HTMLImageElement>) => {
    const img = e.currentTarget;
    if (img.naturalWidth < 50 || img.naturalHeight < 50 || 
        (img.naturalWidth === 161 && img.naturalHeight === 81)) {
      if (activeFrameUrl) brokenFrameUrls.add(activeFrameUrl);
      setFrameError(true);
    }
  }, [activeFrameUrl]);

  // Warm assets instantly (Amazon/R2 URLs) so frame/avatar show without delay
  useEffect(() => {
    warmFrameAsset(activeFrameUrl, activeFrameType);
  }, [activeFrameUrl, activeFrameType]);

  useEffect(() => {
    warmAvatarAsset(effectiveSrc);
  }, [effectiveSrc]);


  const hasValidFrame = activeFrameUrl && activeFrameUrl.startsWith('http') && !frameError && !brokenFrameUrls.has(activeFrameUrl);
  const frameAutoPlay = true; // Premium frames must animate nonstop everywhere, even if older call sites pass showAnimation={false}.
  const isAnimatedFrame = ['svga', 'lottie', 'gif', 'webp'].includes(activeFrameType);
  const isStaticFrame = activeFrameType === 'static';

  // Fixed container style - hard lock to stop jumping/reflow
  const containerStyle: React.CSSProperties = {
    width: sizeConfig.container,
    height: sizeConfig.container,
    contain: 'layout style',
    overflow: 'visible',
    flexShrink: 0,
    position: 'relative',
  };

  // Simple avatar without frame
  if (!showFrame || level < 1) {
    return (
      <div ref={ref} className={cn('relative', className)} onClick={onClick} 
        style={{ ...containerStyle, overflow: 'hidden', borderRadius: '9999px' }}>
        <Avatar className={cn('border-2 border-white/30', avatarClassName)}
          style={{ width: sizeConfig.container, height: sizeConfig.container }}>
          <AvatarImage src={effectiveSrc || undefined} className="object-cover" loading={avatarImageLoading} decoding="async" />

          <AvatarFallback className={cn('bg-gradient-to-br from-purple-400 via-fuchsia-500 to-pink-600 text-white font-bold shadow-inner', sizeConfig.text)}>
            {displayName}
          </AvatarFallback>
        </Avatar>
        {isOnline && (
          <div className="absolute bottom-0 right-0 bg-green-500 rounded-full border-2 border-white"
            style={{ width: sizeConfig.online, height: sizeConfig.online }} />
        )}
      </div>
    );
  }

  return (
    <div ref={ref} className={cn('relative', className)} onClick={onClick} style={containerStyle}>
      
      {/* Animated Frame Layer - SVGA/Lottie */}
      {hasValidFrame && (activeFrameType === 'svga' || activeFrameType === 'lottie') && (
        <div className="absolute pointer-events-none" 
          style={{ inset: sizeConfig.frameInset, zIndex: 2 }}>
          <Suspense fallback={null}>
            <UniversalFramePlayer
              src={activeFrameUrl}
              type={activeFrameType as any}
              className="w-full h-full"
              loop={true}
              autoPlay={frameAutoPlay}
              onError={handleFrameError}
            />
          </Suspense>
        </div>
      )}

      {/* GIF/WebP Frame Layer */}
      {hasValidFrame && (activeFrameType === 'gif' || activeFrameType === 'webp') && (
        <div className="absolute pointer-events-none" 
          style={{ inset: sizeConfig.frameInset, zIndex: 2 }}>
          <img src={activeFrameUrl} alt="" className="w-full h-full object-contain"
            onError={handleFrameError} onLoad={handleFrameLoad} loading="lazy" decoding="async" />
        </div>
      )}

      {/* Static Image Frame Layer */}
      {hasValidFrame && isStaticFrame && (
        <div className="absolute pointer-events-none"
          style={{ inset: sizeConfig.frameInset, zIndex: 2 }}>
          <img src={activeFrameUrl} alt="" className="w-full h-full object-contain"
            onError={handleFrameError} onLoad={handleFrameLoad} loading="lazy" decoding="async" />
        </div>
      )}

      <div className="absolute inset-0 flex items-center justify-center" style={{ zIndex: 1 }}>
        <Avatar className={cn('shadow-lg', avatarClassName)}
          style={{ 
            width: sizeConfig.avatar, height: sizeConfig.avatar,
            border: '2.5px solid rgba(255,255,255,0.15)',
          }}>
          <AvatarImage src={effectiveSrc || undefined} className="object-cover" loading={avatarImageLoading} decoding="async" />
          <AvatarFallback className={cn('bg-gradient-to-br from-purple-400 via-fuchsia-500 to-pink-600 text-white font-bold', sizeConfig.text)}>
            {displayName}
          </AvatarFallback>
        </Avatar>
      </div>

      {/* CSS fallback frame REMOVED — no gradient border before frame loads */}

      {/* Online indicator */}
      {isOnline && (
        <div className="absolute bg-green-500 rounded-full border-2 border-white"
          style={{ 
            width: sizeConfig.online, height: sizeConfig.online,
            bottom: 0, right: 0, zIndex: 3,
          }} />
      )}
    </div>
  );
}));

AvatarWithFrame.displayName = 'AvatarWithFrame';

export default AvatarWithFrame;
