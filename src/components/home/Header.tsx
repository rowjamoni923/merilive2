import { useState } from "react";
import { Search } from "lucide-react";
import { Trophy3D } from "./Trophy3D";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { DiamondBalance } from "./DiamondBalance";
import { NotificationBell } from "@/components/notifications/NotificationList";
import { NotificationList } from "@/components/notifications/NotificationList";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { useBrandingRealtime } from "@/hooks/useAdminSettingsRealtime";

interface HeaderProps {
  coins: number;
  onRecharge?: () => void;
  onSearch?: () => void;
  onNotifications?: () => void;
}

export const Header = ({ coins, onRecharge, onSearch, onNotifications }: HeaderProps) => {
  const navigate = useNavigate();
  const [showNotifications, setShowNotifications] = useState(false);
  const { branding, loading } = useBrandingRealtime();

  const handleNotificationClick = () => {
    if (onNotifications) {
      onNotifications();
    } else {
      setShowNotifications(true);
    }
  };

  // Get branding values with fallbacks
  const logoImageUrl = branding?.logo_image_url;
  const logoPrimary = branding?.logo_text_primary || 'meri';
  const logoSecondary = branding?.logo_text_secondary || 'LIVE';
  const tagline = branding?.tagline || 'Connect • Chat • Share';

  return (
    <>
      <header className="sticky top-0 z-40 glass-card safe-area-top">
        <div className="flex items-center justify-between px-4 py-3">
          {/* Logo - Dynamic from Admin Branding */}
          <div className="flex items-center gap-2">
            {logoImageUrl ? (
              <img loading="lazy" decoding="async" 
                src={logoImageUrl} 
                alt="Logo" 
                className="w-10 h-10 object-contain rounded-xl" />
            ) : (
              <div className="w-10 h-10 rounded-xl gradient-primary flex items-center justify-center shadow-glow">
                <span className="text-primary-foreground font-bold text-lg">
                  {logoPrimary.charAt(0).toUpperCase()}
                </span>
              </div>
            )}
            <div>
              <h1 className="text-lg font-bold text-gradient">
                {logoPrimary}{logoSecondary}
              </h1>
              <p className="text-[10px] text-muted-foreground -mt-1">{tagline}</p>
            </div>
          </div>

          {/* Right Actions */}
          <div className="flex items-center gap-1.5">
            <DiamondBalance balance={coins} onRecharge={onRecharge} />
            
            <Button
              variant="ghost"
              size="icon"
              className="w-9 h-9 rounded-full"
              onClick={onSearch}
            >
              <Search className="w-5 h-5" />
            </Button>

            <button
              type="button"
              aria-label="Leaderboard"
              onClick={() => navigate('/leaderboard')}
              className="leaderboard-trophy-btn relative w-11 h-11 flex items-center justify-center active:scale-95"
            >
              <img
                src={new URL('@/assets/champion-trophy-3d.png', import.meta.url).href}
                alt="Leaderboard"
                className="leaderboard-trophy-img"
                loading="eager"
              />
            </button>
            
            <NotificationBell onClick={handleNotificationClick} />
          </div>
        </div>
      </header>

      {/* Notification Sheet */}
      <Sheet open={showNotifications} onOpenChange={setShowNotifications}>
        <SheetContent side="right" className="w-full sm:max-w-md p-0">
          <SheetHeader className="sr-only">
            <SheetTitle>Notifications</SheetTitle>
          </SheetHeader>
          <NotificationList 
            onClose={() => setShowNotifications(false)} 
            compact={false}
          />
        </SheetContent>
      </Sheet>
    </>
  );
};
