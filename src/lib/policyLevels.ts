import l1Banner from "@/assets/policy-banners/l1.jpg";
import l2Banner from "@/assets/policy-banners/l2.jpg";
import l3Banner from "@/assets/policy-banners/l3.jpg";
import l4Banner from "@/assets/policy-banners/l4.jpg";
import l5Banner from "@/assets/policy-banners/l5.jpg";
import l6Banner from "@/assets/policy-banners/l6.jpg";

export type PolicyLevelCode = "L1" | "L2" | "L3" | "L4" | "L5" | "L6";

export interface PolicyLevelMeta {
  code: PolicyLevelCode;
  order: number;
  shortName: string;
  longName: string;
  tagline: string;
  banner: string;
  accent: string; // tailwind gradient ring class
  badge: string;
}

export const POLICY_LEVELS: PolicyLevelMeta[] = [
  {
    code: "L1",
    order: 1,
    shortName: "Helper",
    longName: "Helper — Level 1",
    tagline: "Entry-level top-up assistant",
    banner: l1Banner,
    accent: "from-emerald-500/40 via-emerald-400/10 to-transparent",
    badge: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30",
  },
  {
    code: "L2",
    order: 2,
    shortName: "Verified Helper",
    longName: "Verified Helper — Level 2",
    tagline: "KYC-verified helper with extended limits",
    banner: l2Banner,
    accent: "from-sky-500/40 via-blue-400/10 to-transparent",
    badge: "bg-sky-500/15 text-sky-300 border-sky-500/30",
  },
  {
    code: "L3",
    order: 3,
    shortName: "Senior Trader",
    longName: "Senior Helper / Trader — Level 3",
    tagline: "Multi-country trader tier",
    banner: l3Banner,
    accent: "from-violet-500/40 via-purple-400/10 to-transparent",
    badge: "bg-violet-500/15 text-violet-300 border-violet-500/30",
  },
  {
    code: "L4",
    order: 4,
    shortName: "Payroll Trader",
    longName: "Payroll Trader — Level 4",
    tagline: "Automated payroll trader tier",
    banner: l4Banner,
    accent: "from-amber-500/40 via-orange-400/10 to-transparent",
    badge: "bg-amber-500/15 text-amber-300 border-amber-500/30",
  },
  {
    code: "L5",
    order: 5,
    shortName: "Country Payroll Admin",
    longName: "Country Payroll Admin — Level 5",
    tagline: "Regional finance lead",
    banner: l5Banner,
    accent: "from-rose-500/40 via-pink-400/10 to-transparent",
    badge: "bg-rose-500/15 text-rose-300 border-rose-500/30",
  },
  {
    code: "L6",
    order: 6,
    shortName: "Country Super Admin",
    longName: "Country Super Admin (CSA) — Level 6",
    tagline: "Highest country-level operator",
    banner: l6Banner,
    accent: "from-yellow-500/50 via-amber-400/20 to-transparent",
    badge: "bg-yellow-500/15 text-yellow-300 border-yellow-500/40",
  },
];

export function getPolicyLevel(code: string): PolicyLevelMeta | undefined {
  return POLICY_LEVELS.find((l) => l.code === code.toUpperCase());
}

export function policyPublicUrl(code: PolicyLevelCode): string {
  if (typeof window === "undefined") return `/policies/levels/${code}`;
  return `${window.location.origin}/policies/levels/${code}`;
}
