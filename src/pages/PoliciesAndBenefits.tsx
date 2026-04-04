import { useNavigate } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import {
  EpayGlobalBanner,
  LocalCurrencyBanner,
  DailyTransactionLimitsBanner,
} from "@/components/policies/PaymentBanners";

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

interface PolicyBannerItem {
  id: string;
  title: string;
  image: string;
  link?: string;
}

const policyBanners: PolicyBannerItem[] = [
  // Host & Registration
  {
    id: "host-policy",
    title: "Host Policy & Benefits",
    image: hostPolicyBanner,
    link: "/agency-policy",
  },
  {
    id: "party-room",
    title: "Party Room Policy",
    image: partyRoomBanner,
  },
  {
    id: "host-registration",
    title: "Host Registration Policy",
    image: hostRegistrationBanner,
  },
  {
    id: "photo-approval",
    title: "Photo Approval Standards",
    image: photoApprovalBanner,
  },
  {
    id: "number-sharing-penalty",
    title: "Number Sharing Penalties",
    image: numberSharingBanner,
  },
  {
    id: "contact-sharing-rules",
    title: "Contact Sharing Rules",
    image: contactSharingBanner,
  },
  // Agency
  {
    id: "agency-policy",
    title: "Agency Policy & Commission",
    image: agencyPolicyBanner,
    link: "/agency-policy",
  },
  {
    id: "agency-commission",
    title: "Agency Commission Tiers (A1-A5)",
    image: agencyCommissionBanner,
  },
  {
    id: "sub-agency",
    title: "Sub-Agency Commission",
    image: subAgencyBanner,
  },
  // Payroll & Helper
  {
    id: "payroll-policy",
    title: "Payroll Helper Program",
    image: payrollPolicyBanner,
  },
  {
    id: "helper-benefits",
    title: "Payroll Helper Benefits",
    image: helperBenefitsBanner,
  },
  {
    id: "helper-diamond-recharge",
    title: "Helper Diamond Recharge System",
    image: helperDiamondRechargeBanner,
  },
  {
    id: "helper-withdrawal-processing",
    title: "Helper Withdrawal Processing",
    image: helperWithdrawalBanner,
  },
  {
    id: "helper-rewards",
    title: "Helper Reward System (1 Bin = 1 Diamond)",
    image: helperRewardsBanner,
  },
  {
    id: "helper-rules",
    title: "Helper Rules & Restrictions",
    image: helperRulesBanner,
  },
  {
    id: "helper-recharge-access",
    title: "Helper Recharge Number Access (300K+ Diamonds)",
    image: helperRechargeAccessBanner,
  },
  // Withdrawal System
  {
    id: "withdrawal",
    title: "Withdrawal System",
    image: withdrawalBanner,
    link: "/agency-policy",
  },
  {
    id: "withdrawal-methods",
    title: "Withdrawal Methods (USDT & Local Currency)",
    image: withdrawalMethodsBanner,
  },
  {
    id: "weekly-withdrawal",
    title: "Weekly Withdrawal Schedule",
    image: weeklyWithdrawalBanner,
  },
  {
    id: "multi-currency",
    title: "Multi-Currency Withdrawals",
    image: multiCurrencyBanner,
  },
];

const PoliciesAndBenefits = () => {
  const navigate = useNavigate();

  return (
    <div className="fixed inset-0 flex flex-col bg-background overflow-y-auto overflow-x-hidden">
      {/* Header */}
      <div className="sticky top-0 z-50 bg-gradient-to-r from-purple-600 via-indigo-600 to-purple-700 flex-shrink-0">
        <div className="flex items-center justify-between h-14 px-4">
          <button
            onClick={() => navigate(-1)}
            className="p-2 -ml-2 hover:bg-white/10 rounded-full transition-colors"
          >
            <ArrowLeft className="w-5 h-5 text-white" />
          </button>
          <h1 className="text-lg font-bold text-white">
            Policies & Benefits
          </h1>
          <div className="w-9" />
        </div>
      </div>

      {/* Content */}
      <div
        className="flex-1 overflow-y-auto overscroll-contain"
        style={{ WebkitOverflowScrolling: "touch" }}
      >
        {/* Hero */}
        <div className="px-4 pt-4">
          <img
            src={heroBanner}
            alt="MeriLive — Video Chat Without Limits"
            className="w-full h-auto rounded-2xl object-cover"
          />
        </div>

        {/* Description */}
        <div className="px-4 pt-3 pb-2">
          <p className="text-sm text-muted-foreground text-center">
            Tap any section below to learn about our policies and benefits
          </p>
        </div>

        {/* Image Banners */}
        <div className="px-4 pb-4 space-y-4">
          {policyBanners.map((banner) => (
            <div
              key={banner.id}
              onClick={() => navigate(banner.link || `/policies/${banner.id}`)}
              className="rounded-2xl overflow-hidden cursor-pointer active:scale-[0.98] transition-transform"
            >
              <img
                src={banner.image}
                alt={banner.title}
                className="w-full h-auto object-cover rounded-2xl"
              />
            </div>
          ))}
        </div>

        {/* Payment System Banners (at the bottom) */}
        <div className="px-4 pb-6 space-y-4">
          <EpayGlobalBanner />
          <LocalCurrencyBanner />
          <DailyTransactionLimitsBanner />
        </div>
      </div>
    </div>
  );
};

export default PoliciesAndBenefits;
