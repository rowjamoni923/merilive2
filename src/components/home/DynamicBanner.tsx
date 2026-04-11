import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useBannersRealtime, Banner } from "@/hooks/useAdminSettingsRealtime";
import { X, ChevronRight } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Browser } from "@capacitor/browser";
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

      {/* Popup Dialog for in-app links */}
      <Dialog open={popupOpen} onOpenChange={setPopupOpen}>
        <DialogContent className="max-w-lg max-h-[80vh] p-0 overflow-hidden">
          <DialogHeader className="p-4 pb-2 flex flex-row items-center justify-between">
            <DialogTitle className="text-lg">{popupTitle}</DialogTitle>
            <Button 
              variant="ghost" 
              size="icon" 
              onClick={() => setPopupOpen(false)}
              className="rounded-full"
            >
              <X className="w-5 h-5" />
            </Button>
          </DialogHeader>
          <div className="flex-1 overflow-auto">
            <iframe
              src={popupUrl}
              className="w-full h-[60vh] border-0"
              title={popupTitle}
            />
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
