import { useState, useEffect, useRef, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { useBannersRealtime, Banner } from "@/hooks/useAdminSettingsRealtime";
import { X, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { isNativeApp } from "@/utils/nativeUtils";
import { normalizePublicMediaUrl, toSupabaseCdnUrl } from "@/lib/cdnImage";
import { cn } from "@/lib/utils";

// Banner is rendered at full screen width (~360-900px); ask CDN for an 800px wide WebP variant.
const bannerCdn = (url: string | null | undefined) =>
  toSupabaseCdnUrl(normalizePublicMediaUrl(url, "banners"), { width: 900, quality: 72, resize: "contain" }) || normalizePublicMediaUrl(url, "banners") || url || "";

interface DynamicBannerProps {
  position?: 'top' | 'middle';
}

export function DynamicBanner({ position = 'top' }: DynamicBannerProps) {
  const navigate = useNavigate();
  const { banners: allBanners, loading } = useBannersRealtime();
  const [popupOpen, setPopupOpen] = useState(false);
  const [popupUrl, setPopupUrl] = useState("");
  const [popupTitle, setPopupTitle] = useState("");
  const [loadedImages, setLoadedImages] = useState<Record<string, boolean>>({});

  // Preload + decode every banner image into memory so the on-screen <img>
  // only paints after the full bitmap is ready — no half/progressive chunks.
  useEffect(() => {
    allBanners.forEach((b) => {
      if (!b.image_url || loadedImages[b.id]) return;
      const img = new Image();
      try { (img as any).fetchPriority = 'high'; } catch {}
      img.decoding = 'async';
      img.onload = () => {
        const markReady = () => setLoadedImages((s) => ({ ...s, [b.id]: true }));
        if (typeof img.decode === 'function') img.decode().then(markReady).catch(markReady);
        else markReady();
      };
      img.onerror = () => setLoadedImages((s) => ({ ...s, [b.id]: true }));
      img.src = bannerCdn(b.image_url);
    });
  }, [allBanners, loadedImages]);

  // Filter banners by date range
  const activeBanners = allBanners.filter((banner) => {
    if (banner.start_date && new Date(banner.start_date) > new Date()) return false;
    if (banner.end_date && new Date(banner.end_date) < new Date()) return false;
    return true;
  });

  // Split: last banner goes top (original first banner), rest go middle (after hosts)
  const banners = position === 'top'
    ? activeBanners.slice(-1)
    : activeBanners.slice(0, -1);

  const handleBannerClick = async (banner: Banner) => {
    if (!banner.link_url) return;

    // Auto-detect internal routes: any URL starting with "/" (but not "//") is an in-app route.
    // This prevents the popup-iframe from trying to embed the same-origin app (which fails
    // due to X-Frame-Options/CSP and shows a blank modal).
    const isRelativePath = banner.link_url.startsWith('/') && !banner.link_url.startsWith('//');
    const linkType = isRelativePath ? 'internal' : (banner.link_type || 'external');
    switch (linkType) {
      case "popup":
        setPopupUrl(banner.link_url);
        setPopupTitle(banner.title);
        setPopupOpen(true);
        break;
      case "internal":
        // Internal app navigation - always use react-router
        navigate(banner.link_url);
        break;
      case "external":
        // For native app: open in in-app browser (no external browser)
        // For web: open in same window popup
        if (isNativeApp()) {
          try {
            const { openInApp } = await import('@/utils/inAppNavigation');
            await openInApp(banner.link_url, { useOverlay: true });
          } catch {
            // Fallback: show in popup dialog
            setPopupUrl(banner.link_url);
            setPopupTitle(banner.title);
            setPopupOpen(true);
          }
        } else {
          // Web: show in popup dialog (no external redirect)
          setPopupUrl(banner.link_url);
          setPopupTitle(banner.title);
          setPopupOpen(true);
        }
        break;
    }
  };

  if (loading || banners.length === 0) return null;

  // Top banner is above-the-fold (LCP candidate) → eager + high priority.
  // Middle banner is below-the-fold → lazy. Mixing lazy + fetchpriority="high"
  // makes the browser ignore the priority hint (Chrome/WebKit spec).
  const isAboveFold = position === 'top';

  return (
    <>
      <BannerCarousel
        banners={banners}
        isAboveFold={isAboveFold}
        onBannerClick={handleBannerClick}
        loadedImages={loadedImages}
        setLoadedImages={setLoadedImages}
      />


      {popupOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 p-3 backdrop-blur-sm"
          onClick={() => setPopupOpen(false)}
        >
          <div
            className="flex h-[80vh] w-full max-w-lg flex-col overflow-hidden rounded-3xl border border-border bg-background shadow-2xl"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-border px-4 py-3">
              <h2 className="truncate pr-3 text-base font-semibold text-foreground">{popupTitle}</h2>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setPopupOpen(false)}
                className="rounded-full"
              >
                <X className="h-5 w-5" />
              </Button>
            </div>

            <iframe
              src={popupUrl}
              className="min-h-0 flex-1 border-0 bg-background"
              title={popupTitle}
            />
          </div>
        </div>
      )}
    </>
  );
}

/**
 * BannerCarousel — Bigo/Chamet-style horizontal-snap swipeable banner rail.
 * - Single banner: renders inline (no scroll affordance, no dots).
 * - 2+ banners: horizontal scroll-snap with paginated dot indicators
 *   and 4-second auto-advance that pauses on user touch/drag.
 */
interface BannerCarouselProps {
  banners: Banner[];
  isAboveFold: boolean;
  onBannerClick: (banner: Banner) => void;
  loadedImages: Record<string, boolean>;
  setLoadedImages: React.Dispatch<React.SetStateAction<Record<string, boolean>>>;
}

function BannerCarousel({ banners, isAboveFold, onBannerClick, loadedImages, setLoadedImages }: BannerCarouselProps) {
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const [activeIdx, setActiveIdx] = useState(0);
  const userInteractingRef = useRef(false);
  const autoTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const isSingle = banners.length <= 1;

  const handleScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    const slideWidth = el.clientWidth;
    if (slideWidth <= 0) return;
    const idx = Math.round(el.scrollLeft / slideWidth);
    setActiveIdx(Math.max(0, Math.min(banners.length - 1, idx)));
  }, [banners.length]);

  useEffect(() => {
    if (isSingle) return;
    const tick = () => {
      if (userInteractingRef.current) return;
      const el = scrollRef.current;
      if (!el) return;
      const slideWidth = el.clientWidth;
      if (slideWidth <= 0) return;
      const next = (activeIdx + 1) % banners.length;
      el.scrollTo({ left: next * slideWidth, behavior: 'smooth' });
    };
    autoTimerRef.current = setInterval(tick, 4000);
    return () => {
      if (autoTimerRef.current) clearInterval(autoTimerRef.current);
      autoTimerRef.current = null;
    };
  }, [activeIdx, banners.length, isSingle]);

  const onTouchStart = useCallback(() => { userInteractingRef.current = true; }, []);
  const onTouchEnd = useCallback(() => {
    setTimeout(() => { userInteractingRef.current = false; }, 400);
  }, []);

  const goTo = useCallback((idx: number) => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTo({ left: idx * el.clientWidth, behavior: 'smooth' });
  }, []);

  return (
    <div className="relative">
      <div
        ref={scrollRef}
        onScroll={handleScroll}
        onTouchStart={onTouchStart}
        onTouchEnd={onTouchEnd}
        onPointerDown={onTouchStart}
        onPointerUp={onTouchEnd}
        className={cn(
          "flex overflow-x-auto overflow-y-hidden scrollbar-hide",
          !isSingle && "snap-x snap-mandatory"
        )}
        style={{ WebkitOverflowScrolling: 'touch', scrollbarWidth: 'none' }}
        role={isSingle ? undefined : 'region'}
        aria-roledescription={isSingle ? undefined : 'carousel'}
        aria-label={isSingle ? undefined : 'Promotional banners'}
      >
        {banners.map((banner) => (
          <div
            key={banner.id}
            className={cn("shrink-0 w-full", !isSingle && "snap-center snap-always")}
          >
            <div
              onClick={() => onBannerClick(banner)}
              className={cn(
                "rounded-2xl overflow-hidden",
                !banner.image_url && "p-4",
                banner.link_url && "cursor-pointer transition-opacity duration-75 active:opacity-90"
              )}
              style={banner.image_url ? {} : { backgroundColor: banner.background_color }}
              role={banner.link_url ? 'button' : undefined}
              aria-label={banner.link_url ? banner.title : undefined}
            >
              {banner.image_url ? (
                <div className="relative aspect-[2.4/1] w-full overflow-hidden rounded-2xl bg-muted/30">
                  <img
                    loading={isAboveFold ? 'eager' : 'lazy'}
                    decoding="async"
                    src={bannerCdn(banner.image_url)}
                    alt={banner.title}
                    // @ts-expect-error – fetchpriority is a standard HTML hint
                    fetchpriority={isAboveFold ? 'high' : 'low'}
                    className={cn(
                      "block h-full w-full rounded-2xl object-cover select-none transition-opacity duration-75",
                      loadedImages[banner.id] ? "opacity-100" : "opacity-0"
                    )}
                    draggable={false}
                    onLoad={(e) => {
                      const img = e.currentTarget;
                      const markReady = () => setLoadedImages((s) => ({ ...s, [banner.id]: true }));
                      if (typeof img.decode === 'function') img.decode().then(markReady).catch(markReady);
                      else markReady();
                    }}
                    onError={(e) => {
                      const t = e.currentTarget;
                      if (banner.image_url && t.src !== banner.image_url) { t.src = banner.image_url; return; }
                      setLoadedImages((s) => ({ ...s, [banner.id]: true }));
                    }}
                  />
                </div>
              ) : (
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-xl font-bold" style={{ color: banner.text_color }}>
                      {banner.title}
                    </h3>
                    {banner.subtitle && (
                      <p className="text-sm opacity-80" style={{ color: banner.text_color }}>
                        {banner.subtitle}
                      </p>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-4xl font-bold" style={{ color: banner.accent_color }}>
                      {banner.title.split(" ")[0]}
                    </span>
                    {banner.link_url && (
                      <ChevronRight className="w-5 h-5 opacity-50" style={{ color: banner.text_color }} />
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        ))}
      </div>

      {!isSingle && (
        <div
          className="absolute bottom-2 left-0 right-0 flex items-center justify-center gap-1.5 pointer-events-none"
        >
          {banners.map((b, i) => (
            <button
              key={b.id}
              type="button"
              onClick={(e) => { e.stopPropagation(); goTo(i); }}
              aria-label={`Go to banner ${i + 1}`}
              className={cn(
                "pointer-events-auto rounded-full transition-all duration-300 touch-manipulation",
                i === activeIdx
                  ? "w-5 h-1.5 bg-white shadow-[0_1px_3px_rgba(0,0,0,0.4)]"
                  : "w-1.5 h-1.5 bg-white/50 hover:bg-white/80"
              )}
            />
          ))}
        </div>
      )}
    </div>
  );
}
