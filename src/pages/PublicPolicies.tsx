import { useNavigate } from "react-router-dom";
import { useEnableBrowserPageInteraction } from "@/hooks/useEnableBrowserPageInteraction";
import heroBanner from "@/assets/banners/policy-hero-banner.jpg";
import hostPolicyBanner from "@/assets/banners/host-policy-banner.jpg";
import hostRegistrationBanner from "@/assets/banners/host-registration-banner.jpg";
import photoApprovalBanner from "@/assets/banners/photo-approval-banner.jpg";
import agencyPolicyBanner from "@/assets/banners/agency-policy-banner.jpg";
import agencyCommissionBanner from "@/assets/banners/agency-commission-banner.jpg";
import subAgencyBanner from "@/assets/banners/sub-agency-commission-banner.jpg";
import partyRoomBanner from "@/assets/banners/party-room-banner.jpg";
import payrollPolicyBanner from "@/assets/banners/payroll-policy-banner.jpg";
import helperBenefitsBanner from "@/assets/banners/helper-benefits-banner.jpg";
import helperDiamondRechargeBanner from "@/assets/banners/helper-diamond-recharge-banner.jpg";
import helperWithdrawalBanner from "@/assets/banners/helper-withdrawal-processing-banner.jpg";
import helperRulesBanner from "@/assets/banners/helper-rules-banner.jpg";
import helperRewardsBanner from "@/assets/banners/helper-rewards-banner.jpg";
import helperRechargeAccessBanner from "@/assets/banners/helper-recharge-access-banner.jpg";
import numberSharingBanner from "@/assets/banners/number-sharing-penalty-banner.jpg";
import contactSharingBanner from "@/assets/banners/contact-sharing-rules-banner.jpg";
import withdrawalBanner from "@/assets/banners/withdrawal-banner.jpg";
import withdrawalMethodsBanner from "@/assets/banners/withdrawal-methods-banner.jpg";
import weeklyWithdrawalBanner from "@/assets/banners/weekly-withdrawal-banner.jpg";
import multiCurrencyBanner from "@/assets/banners/multi-currency-banner.jpg";
import {
  EpayGlobalBanner,
  LocalCurrencyBanner,
  DailyTransactionLimitsBanner,
} from "@/components/policies/PaymentBanners";

const banners = [
  { id: "hero", title: "MeriLive — Policies & Benefits", image: heroBanner },
  { id: "host-policy", title: "Host Policy & Benefits", image: hostPolicyBanner },
  { id: "party-room", title: "Party Room Policy", image: partyRoomBanner },
  { id: "host-registration", title: "Host Registration Policy", image: hostRegistrationBanner },
  { id: "photo-approval", title: "Photo Approval Standards", image: photoApprovalBanner },
  { id: "number-sharing", title: "Number Sharing Penalties", image: numberSharingBanner },
  { id: "contact-sharing", title: "Contact Sharing Rules", image: contactSharingBanner },
  { id: "agency-policy", title: "Agency Policy & Commission", image: agencyPolicyBanner },
  { id: "agency-commission", title: "Agency Commission Tiers (A1-A5)", image: agencyCommissionBanner },
  { id: "sub-agency", title: "Sub-Agency Commission", image: subAgencyBanner },
  { id: "payroll-policy", title: "Payroll Helper Program", image: payrollPolicyBanner },
  { id: "helper-benefits", title: "Payroll Helper Benefits", image: helperBenefitsBanner },
  { id: "helper-diamond-recharge", title: "Helper Diamond Recharge System", image: helperDiamondRechargeBanner },
  { id: "helper-withdrawal", title: "Helper Withdrawal Processing", image: helperWithdrawalBanner },
  { id: "helper-rewards", title: "Helper Reward System", image: helperRewardsBanner },
  { id: "helper-rules", title: "Helper Rules & Restrictions", image: helperRulesBanner },
  { id: "helper-recharge-access", title: "Helper Recharge Number Access", image: helperRechargeAccessBanner },
  { id: "withdrawal", title: "Withdrawal System", image: withdrawalBanner },
  { id: "withdrawal-methods", title: "Withdrawal Methods (USDT & Local Currency)", image: withdrawalMethodsBanner },
  { id: "weekly-withdrawal", title: "Weekly Withdrawal Schedule", image: weeklyWithdrawalBanner },
  { id: "multi-currency", title: "Multi-Currency Withdrawals", image: multiCurrencyBanner },
];

const PublicPolicies = () => {
  const navigate = useNavigate();
  useEnableBrowserPageInteraction();
  
  
  return (
  <div className="min-h-screen bg-background text-foreground" style={{ touchAction: 'pan-y pinch-zoom', overscrollBehaviorY: 'auto', WebkitOverflowScrolling: 'touch' }}>
    {/* Header */}
    <div className="bg-gradient-to-r from-purple-600 via-indigo-600 to-purple-700 py-5 px-4 text-center sticky top-0 z-50">
      <h1 className="text-xl font-bold text-white">MeriLive — Policies & Benefits</h1>
      <p className="text-white/80 text-xs mt-1">All Policies in One Place</p>
    </div>

    {/* All banners */}
    <div className="max-w-lg mx-auto px-4 py-6 space-y-4">
      {banners.map((b) => (
        <img loading="lazy" decoding="async"
          key={b.id}
          src={b.image}
          alt={b.title}
          className="w-full h-auto rounded-2xl object-cover cursor-pointer active:scale-[0.98] transition-transform"
         
          onClick={() => navigate(`/policies/${b.id}`)}
        />
      ))}

      {/* Payment system banners */}
      <EpayGlobalBanner />
      <LocalCurrencyBanner />
      <DailyTransactionLimitsBanner />

      {/* Footer */}
      <div className="text-center py-6">
        <p className="text-slate-400 text-xs">© MeriLive — All Rights Reserved</p>
      </div>
    </div>
  </div>
  );
};

export default PublicPolicies;
