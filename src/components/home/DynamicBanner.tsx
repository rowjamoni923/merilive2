import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useBannersRealtime, Banner } from "@/hooks/useAdminSettingsRealtime";
import { X, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { isNativeApp } from "@/utils/nativeUtils";

interface DynamicBannerProps {
  position?: 'top' | 'middle';
}

export function DynamicBanner({ position = 'top' }: DynamicBannerProps) {
  const navigate = useNavigate();
  const { banners: allBanners, loading } = useBannersRealtime();
  const [popupOpen, setPopupOpen] = useState(false);
  const [popupUrl, setPopupUrl] = useState("");
  const [popupTitle, setPopupTitle] = useState("");

  // Filter banners by date range
  const activeBanners = allBanners.filter((banner) => {
    if (banner.start_date && new Date(banner.start_date) > new Date()) return false;
    if (banner.end_date && new Date(banner.end_date) < new Date()) return false;
    return true;
  });

  // Split: last banner goes top, rest go middle (after hosts)
  const banners = position === 'top' 
    ? activeBanners.slice(-1) 
    : activeBanners.slice(0, -1);

  const handleBannerClick = async (banner: Banner) => {
    if (!banner.link_url) return;

    const linkType = banner.link_type || 'external';
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

  return (
    <>
      <div className="space-y-2">
        {banners.map((banner) => (
          <div
            key={banner.id}
            onClick={() => handleBannerClick(banner)}
            className={`rounded-2xl overflow-hidden ${banner.image_url ? '' : 'p-4'} ${banner.link_url ? 'cursor-pointer active:scale-[0.98] transition-transform' : ''}`}
            style={banner.image_url ? {} : { backgroundColor: banner.background_color }}
          >
            {banner.image_url ? (
              <img 
                src={banner.image_url} 
                alt={banner.title}
                className="w-full h-auto rounded-2xl object-cover"
                onError={(e) => {
                  // Hide broken images
                  (e.currentTarget.parentElement as HTMLElement).style.display = 'none';
                }}
              />
            ) : (
              <div className="flex items-center justify-between">
                <div>
                  <h3 
                    className="text-xl font-bold"
                    style={{ color: banner.text_color }}
                  >
                    {banner.title}
                  </h3>
                  {banner.subtitle && (
                    <p 
                      className="text-sm opacity-80"
                      style={{ color: banner.text_color }}
                    >
                      {banner.subtitle}
                    </p>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <span 
                    className="text-4xl font-bold"
                    style={{ color: banner.accent_color }}
                  >
                    {banner.title.split(" ")[0]}
                  </span>
                  {banner.link_url && (
                    <ChevronRight 
                      className="w-5 h-5 opacity-50" 
                      style={{ color: banner.text_color }}
                    />
                  )}
                </div>
              </div>
            )}
          </div>
        ))}
      </div>

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
