import { useState } from "react";
import { Search, Trophy } from "lucide-react";
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
              className="relative w-12 h-12 rounded-full flex items-center justify-center transition-transform duration-300 hover:scale-110 active:scale-95 group"
              style={{
                background:
                  'radial-gradient(circle at 30% 25%, #fff6c2 0%, #ffd75e 22%, #f0a82a 55%, #b8721a 85%, #6b3a0a 100%)',
                boxShadow:
                  '0 6px 14px -3px rgba(184,114,26,0.55), 0 2px 4px rgba(0,0,0,0.25), inset 0 1px 1.5px rgba(255,255,255,0.85), inset 0 -2px 4px rgba(107,58,10,0.55), inset 0 0 0 1px rgba(255,236,170,0.6)',
              }}
            >
              {/* outer rim highlight */}
              <span
                aria-hidden
                className="pointer-events-none absolute inset-0 rounded-full"
                style={{
                  background:
                    'conic-gradient(from 210deg, rgba(255,255,255,0) 0deg, rgba(255,255,255,0.55) 60deg, rgba(255,255,255,0) 140deg, rgba(255,255,255,0) 360deg)',
                  mixBlendMode: 'overlay',
                  opacity: 0.9,
                }}
              />
              {/* glossy top highlight */}
              <span
                aria-hidden
                className="pointer-events-none absolute left-1.5 right-1.5 top-1 h-3 rounded-full"
                style={{
                  background:
                    'linear-gradient(to bottom, rgba(255,255,255,0.85), rgba(255,255,255,0) 90%)',
                  filter: 'blur(0.5px)',
                }}
              />
              {/* trophy */}
              <Trophy
                className="relative w-6 h-6 z-10"
                style={{
                  color: '#5a2e08',
                  filter:
                    'drop-shadow(0 1px 0 rgba(255,240,180,0.9)) drop-shadow(0 1px 2px rgba(0,0,0,0.45))',
                  strokeWidth: 2.4,
                }}
              />
              {/* soft outer glow */}
              <span
                aria-hidden
                className="pointer-events-none absolute -inset-1 rounded-full opacity-70 group-hover:opacity-100 transition-opacity"
                style={{
                  background:
                    'radial-gradient(circle, rgba(255,200,80,0.45) 0%, rgba(255,200,80,0) 70%)',
                  filter: 'blur(4px)',
                  zIndex: -1,
                }}
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
