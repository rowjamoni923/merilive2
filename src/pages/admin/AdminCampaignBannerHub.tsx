import { lazy, Suspense, useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent } from "@/components/ui/card";
import { Loader2, Megaphone } from "lucide-react";
import AdminPageHeader from "@/components/admin/AdminPageHeader";

// Lazy-load every existing banner/campaign manager — single source of truth, just consolidated UI.
const AdminBanners = lazy(() => import("./AdminBanners"));
const AdminPopupBanners = lazy(() => import("./AdminPopupBanners"));
const AdminRechargeCampaigns = lazy(() => import("./AdminRechargeCampaigns"));
const AdminPartyBanners = lazy(() => import("./AdminPartyBanners"));
const AdminPartyBackgrounds = lazy(() => import("./AdminPartyBackgrounds"));
const AdminEntryBanners = lazy(() => import("./AdminEntryBanners"));
const AdminInvitationSettings = lazy(() => import("./AdminInvitationSettings"));
const AdminRewardsManagement = lazy(() => import("./AdminRewardsManagement"));
const AdminRatingBanners = lazy(() => import("./AdminRatingBanners"));

const TABS: Array<{ value: string; label: string; Component: React.LazyExoticComponent<any>; hint: string }> = [
  { value: "home", label: "🏠 Home Banners", Component: AdminBanners, hint: "Home-page promo carousel banners." },
  { value: "popup", label: "🪟 Popup / Event Banners", Component: AdminPopupBanners, hint: "Modal popups on app launch (event teaser, recharge promo)." },
  { value: "recharge", label: "💎 Recharge Banner & Campaigns", Component: AdminRechargeCampaigns, hint: "Fast-recharge banner shown on the Diamond Store / Recharge page + bonus campaigns." },
  { value: "rating", label: "⭐ Rating Reward Banner", Component: AdminRatingBanners, hint: "Premium half-screen rating + giveaway banners. Active ones rotate randomly in the popup." },
  { value: "rating-rewards-config", label: "🎁 Rating Rewards Config", Component: AdminRewardsManagement, hint: "Rating reward amounts, screenshot review settings, first-recharge bonus." },
  { value: "invitation", label: "🤝 Invitation Banner", Component: AdminInvitationSettings, hint: "Invitation page tier banners and rewards." },
  { value: "entry", label: "🚪 Entry Banners", Component: AdminEntryBanners, hint: "User-entry name graphics shown when entering live rooms." },
  { value: "party-banner", label: "🎉 Party Banners", Component: AdminPartyBanners, hint: "Promo banners shown inside the Party tab." },
  { value: "party-bg", label: "🖼️ Party Backgrounds", Component: AdminPartyBackgrounds, hint: "Background skins party hosts can pick for their room ambiance." },
];

export default function AdminCampaignBannerHub() {
  const [tab, setTab] = useState<string>("recharge");

  return (
    <div className="admin-content space-y-6 p-4 md:p-6">
      <AdminPageHeader
        icon={Megaphone}
        title="Campaign Banner Hub"
        subtitle="Single control center for every campaign / banner system — Home, Recharge, Rating, Invitation, Event Popups, Party, Entry. One place, same data flowing everywhere."
      />

      <Tabs value={tab} onValueChange={setTab} className="w-full">
        <div className="overflow-x-auto">
          <TabsList className="flex w-max gap-1 p-1">
            {TABS.map((t) => (
              <TabsTrigger key={t.value} value={t.value} className="whitespace-nowrap text-xs md:text-sm">
                {t.label}
              </TabsTrigger>
            ))}
          </TabsList>
        </div>

        {TABS.map(({ value, Component, hint }) => (
          <TabsContent key={value} value={value} className="mt-4">
            <Card className="border-primary/20">
              <CardContent className="p-3 md:p-4">
                <div className="mb-3 rounded-md bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
                  {hint}
                </div>
                <Suspense
                  fallback={
                    <div className="flex items-center justify-center py-12">
                      <Loader2 className="h-6 w-6 animate-spin text-primary" />
                    </div>
                  }
                >
                  {tab === value && <Component />}
                </Suspense>
              </CardContent>
            </Card>
          </TabsContent>
        ))}
      </Tabs>
    </div>
  );
}
