import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";

import banner1 from "@/assets/recharge-banner-1-first.jpg";
import banner2 from "@/assets/recharge-banner-2-campaign.jpg";
import banner3 from "@/assets/recharge-banner-3-fast.jpg";
import banner4 from "@/assets/recharge-banner-4-vip.jpg";
import banner5 from "@/assets/recharge-banner-5-weekly.jpg";
import banner6 from "@/assets/recharge-banner-6-daily.jpg";

type BannerItem = {
  id: string;
  image_url: string;
  title?: string | null;
  link_url?: string | null;
  link_type?: string | null;
};

const DEFAULT_BANNERS: BannerItem[] = [
  { id: "default-1", image_url: banner1, title: "First Recharge Bonus" },
  { id: "default-2", image_url: banner2, title: "Campaign Bonus 100%" },
  { id: "default-3", image_url: banner3, title: "Fast Recharge Bonus" },
  { id: "default-4", image_url: banner4, title: "VIP Diamond Rewards" },
  { id: "default-5", image_url: banner5, title: "Weekly Mega Recharge" },
  { id: "default-6", image_url: banner6, title: "Daily Login Reward" },
];

const ROTATE_MS = 5000;

export default function RechargeBannerCarousel({
  onBannerClick,
}: {
  onBannerClick?: (b: BannerItem) => void;
}) {
  // Admin-managed banners (location='recharge'). Falls back to DEFAULT_BANNERS when empty.
  // Cached 10min, no realtime — $1400 guard safe.
  const { data: dbBanners } = useQuery({
    queryKey: ["recharge-banners"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("banners")
        .select("id,image_url,title,link_url,link_type,display_order,is_active,location")
        .eq("location", "recharge")
        .eq("is_active", true)
        .order("display_order", { ascending: true });
      if (error) return [] as BannerItem[];
      return (data || [])
        .filter((b: any) => !!b.image_url)
        .map((b: any) => ({
          id: b.id,
          image_url: b.image_url,
          title: b.title,
          link_url: b.link_url,
          link_type: b.link_type,
        })) as BannerItem[];
    },
    staleTime: 10 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
    refetchOnWindowFocus: false,
    refetchOnMount: false,
  });

  const banners = useMemo<BannerItem[]>(
    () => (dbBanners && dbBanners.length > 0 ? dbBanners : DEFAULT_BANNERS),
    [dbBanners]
  );

  const [index, setIndex] = useState(0);
  const pausedRef = useRef(false);

  // Auto-rotate every 5s. Pauses on visibility hidden to save battery.
  useEffect(() => {
    if (banners.length <= 1) return;
    let timer: any;
    const tick = () => {
      if (!pausedRef.current && !document.hidden) {
        setIndex((i) => (i + 1) % banners.length);
      }
      timer = setTimeout(tick, ROTATE_MS);
    };
    timer = setTimeout(tick, ROTATE_MS);
    return () => clearTimeout(timer);
  }, [banners.length]);

  // Reset to first if list changes
  useEffect(() => {
    setIndex((i) => (i >= banners.length ? 0 : i));
  }, [banners.length]);

  const current = banners[index];
  if (!current) return null;

  return (
    <div
      className="relative w-full overflow-hidden rounded-2xl shadow-xl shadow-amber-500/10 mb-3"
      style={{ aspectRatio: "4 / 1" }}
      onMouseEnter={() => (pausedRef.current = true)}
      onMouseLeave={() => (pausedRef.current = false)}
      onTouchStart={() => (pausedRef.current = true)}
      onTouchEnd={() => {
        setTimeout(() => (pausedRef.current = false), 1500);
      }}
    >
      {/* Slides — all mounted, opacity-faded for smooth crossfade */}
      {banners.map((b, i) => (
        <button
          key={b.id}
          type="button"
          aria-hidden={i !== index}
          tabIndex={i === index ? 0 : -1}
          onClick={() => onBannerClick?.(b)}
          className={cn(
            "absolute inset-0 w-full h-full transition-opacity duration-700 ease-out",
            i === index ? "opacity-100 z-10" : "opacity-0 z-0 pointer-events-none"
          )}
        >
          <img
            src={b.image_url}
            alt={b.title || `Banner ${i + 1}`}
            className="w-full h-full object-cover rounded-2xl select-none"
            draggable={false}
            loading={i === 0 ? "eager" : "lazy"}
          />
        </button>
      ))}

      {/* Premium gold border glow */}
      <div
        className="pointer-events-none absolute inset-0 rounded-2xl z-20"
        style={{
          border: "1px solid rgba(255,215,0,0.35)",
          boxShadow:
            "inset 0 0 18px rgba(255,180,40,0.18), 0 6px 24px -8px rgba(139,92,246,0.35)",
        }}
      />

      {/* Indicator dots */}
      {banners.length > 1 && (
        <div className="absolute bottom-1.5 left-1/2 -translate-x-1/2 z-30 flex items-center gap-1.5">
          {banners.map((_, i) => (
            <button
              key={i}
              type="button"
              aria-label={`Go to banner ${i + 1}`}
              onClick={(e) => {
                e.stopPropagation();
                setIndex(i);
              }}
              className={cn(
                "h-1.5 rounded-full transition-all duration-300",
                i === index
                  ? "w-5 bg-amber-300 shadow-[0_0_6px_rgba(255,215,0,0.8)]"
                  : "w-1.5 bg-white/50 hover:bg-white/80"
              )}
            />
          ))}
        </div>
      )}
    </div>
  );
}
