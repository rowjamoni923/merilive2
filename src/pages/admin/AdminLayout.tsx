import { useState, useEffect, useRef, useCallback, useMemo, Suspense, startTransition } from "react";
import { ADMIN_REALTIME_EVENT, type AdminTableUpdateEvent } from "@/hooks/useAdminRealtime";
import { startAdminGlobalRealtime, stopAdminGlobalRealtime } from "@/utils/adminGlobalRealtime";
import { useNavigate, Outlet, Link, useLocation, Navigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import {LayoutDashboard, Users, Building2, Camera, PartyPopper, Gift, Settings, Shield, ShieldCheck, LogOut, Menu, X, Bell, Search, ChevronRight, ChevronDown, Coins, FileText, MessageSquare, TrendingUp, UserCheck, Ban, Percent, Sparkles, Image, CreditCard, Moon, Sun, Wallet, Activity, ScanFace, Check, CheckCheck, Clock, AlertCircle, UserPlus, DollarSign, Phone, PhoneIncoming, Radio, Antenna, Crown, Star, TrendingDown, ArrowUpCircle, Gamepad2, Play, Film, ShoppingBag, UserCog, Smartphone, Lock, Megaphone, ShieldAlert, Mail, Map, Package, ScrollText} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { formatAdminError } from "@/utils/formatAdminError";
// supabase user-app client removed — admin layout uses adminSupabase exclusively
import { adminSupabase } from "@/integrations/supabase/adminClient";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { format, formatDistanceToNow } from "date-fns";
import { AdminAlertBell } from "@/components/admin/AdminPhoneAlertsPanel";
import { AdminRealtimeSyncIndicator } from "@/components/admin/AdminRealtimeSyncIndicator";
import { AdminProfileMenu } from "@/components/admin/AdminProfileMenu";
import useAdminAccess from "@/hooks/useAdminAccess";
import { revokeAdminAccess, hasAdminAccessFlag } from "@/utils/adminAccessStorage";
import { getAdminSession, getAdminSessionToken } from "@/utils/adminSession";
import { ScreenSecuritySDK } from "@/sdk/ScreenSecuritySDK";
import { useEnableBrowserPageInteraction } from "@/hooks/useEnableBrowserPageInteraction";
import ErrorBoundary from "@/components/ErrorBoundary";
import { playSoundUrl, playSynthSequence } from "@/utils/soundPlayer";

import { prefetchAdminRoute, prefetchCommonAdminRoutes } from "@/utils/adminRoutePrefetch";
// installAdminMediaAutoResolver removed (Pkg42) — see useEffect below for rationale.

import { PremiumSpinner } from "@/components/ui/premium-spinner";
import { recordAdminError } from "@/utils/adminErrorLog";
import { AuditIdSearch } from "@/components/admin/AuditIdSearch";
import { UserAvatarImage } from "@/components/admin/UserAvatarImage";


interface AdminNotification {
  id: string;
  title: string;
  message: string;
  type: string;
  is_read: boolean;
  created_at: string;
  user_id?: string;
  data?: any;
}

/**
 * NavItem — represents a single section/page in the Admin Panel sidebar.
 *
 * Each NavItem is a 1-to-1 mapping to ONE admin page component (no duplicates).
 * The `description` field documents the section's exact purpose so AI tools
 * (Anti Gravity, Lovable, etc.) and human developers can instantly understand
 * what the page does without opening its source file.
 */
interface NavItem {
  /** Display label shown in the sidebar (English, concise). */
  label: string;
  /** Lucide icon component rendered next to the label. */
  icon: React.ElementType;
  /** Absolute admin route, e.g. "/admin/users". Must match a Route in App.tsx. */
  path: string;
  /** Optional unread/pending count badge (set by realtime notification listener). */
  badge?: number;
  /** Notification `type` values that increment this item's badge. */
  notificationTypes?: string[];
  /** Hub key for sub-admin section-permission checks (see useAdminAccess). */
  hubKey?: string;
  /** When true, only the platform Owner sees this item (sub-admins are blocked). */
  ownerOnly?: boolean;
  /**
   * Plain-English explanation of what this section does and which user-app
   * feature it controls. Read by AI tools to understand admin↔app wiring.
   * Keep under ~140 chars, no implementation details.
   */
  description?: string;
}

interface NavGroup {
  title: string;
  items: NavItem[];
  hubKey?: string; // Hub key for the entire group
}

const normalizeAdminPath = (value: string): string => {
  const trimmed = value.trim();
  const noHash = trimmed.split('#')[0];
  const noQuery = noHash.split('?')[0];
  return noQuery.endsWith('/') && noQuery.length > 1 ? noQuery.slice(0, -1) : noQuery;
};

const formatBadgeCount = (count: number): string | number => {
  const safeCount = Math.max(0, Number(count) || 0);
  return safeCount > 100 ? '100+' : safeCount;
};

const DISMISSED_PATH_STORAGE_PREFIX = 'admin:dismissed-path-counts:v2:';

const getDismissedPathStorageKey = (userId?: string | null) => {
  return `${DISMISSED_PATH_STORAGE_PREFIX}${userId || 'guest'}`;
};

const parseStoredDismissedPathCounts = (raw: string | null): Record<string, number> => {
  if (!raw) return {};

  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const sanitized: Record<string, number> = {};

    Object.entries(parsed).forEach(([path, count]) => {
      const normalizedPath = normalizeAdminPath(path);
      const safeCount = Number(count);
      if (normalizedPath.startsWith('/admin') && Number.isFinite(safeCount) && safeCount >= 0) {
        sanitized[normalizedPath] = safeCount;
      }
    });

    return sanitized;
  } catch {
    return {};
  }
};

const isRealSupportUserMessage = (content?: string | null) => {
  const text = String(content || '');
  if (!text.trim()) return false;
  if (/ai\s*conversation\s*summary/i.test(text)) return false;
  if (/^\[Category:\s*.+\]\s*\n\s*📋/i.test(text)) return false;
  if (/^\[Category:\s*.+\]\s*\n\s*AI:/im.test(text)) return false;
  return true;
};

// Map notification to admin path for navigation (supports explicit payload path + smart fallbacks)
const getAdminNotificationPath = (notification: AdminNotification): string => {
  const type = String(notification.type || '').toLowerCase();
  const title = String(notification.title || '').toLowerCase();
  const data = (notification.data && typeof notification.data === 'object') ? notification.data : {};

  // Prefer explicit path from payload for exact section routing
  const explicitCandidates = [
    data.adminPath,
    data.admin_path,
    data.path,
    data.target_path,
    data.route,
    data.redirect_to,
    data.page_path,
    data.section_path,
    data.url,
  ].filter((v): v is string => typeof v === 'string' && v.startsWith('/admin'));

  if (explicitCandidates.length > 0) {
    return normalizeAdminPath(explicitCandidates[0]);
  }

  // Data-based fallback routing
  if (data.ticket_id || type === 'support' || type === 'admin_message' || type === 'admin_message_reply') {
    return '/admin/support-tickets';
  }

  if (data.submission_id || type.includes('verification')) {
    return data.type === 'host' || type.includes('host') ? '/admin/host-applications' : '/admin/face-verification';
  }

  if (data.agency_id || data.agency_name || type.startsWith('agency')) {
    return type.includes('withdraw') ? '/admin/withdrawals' : '/admin/agencies';
  }

  if (type.includes('withdraw')) return '/admin/withdrawals';
  if (type.includes('host_application')) return '/admin/host-applications';
  if (type.includes('host_approved') || type.includes('host_rejected') || type === 'new_user') return '/admin/user-management';
  if (type.includes('face_violation') || type === 'face_violation') return '/admin/face-violations';
  if (type === 'contact_violation' || type === 'chat_violation' || type.includes('contact_violation') || type.includes('chat_violation')) return '/admin/contact-violations';
  if (type.includes('chat_moderation') || type === 'chat_moderation') return '/admin/contact-violations';
  if (type.includes('helper_order') || type === 'helper_order') return '/admin/helper-orders';
  if (type.includes('helper')) return '/admin/helper-management';
  if (type.includes('topup') || type.includes('coin_purchase')) return '/admin/topup-system';
  if (type.includes('coin_exchange') || type.includes('diamond_sent')) return '/admin/coin-traders';
  if (type.includes('report') || type.includes('violation')) return '/admin/live-bans';
  if (type.includes('security')) return '/admin/logs';
  if (type === 'system') return '/admin/settings';
  if (type.includes('party') || type.includes('room')) return '/admin/party-rooms';
  if (type.includes('reward') || title.includes('reward') || title.includes('rating')) return '/admin/rating-rewards';
  if (type.includes('recharge') || title.includes('recharge')) return '/admin/recharge-history';
  if (type.includes('leaderboard') || title.includes('leaderboard')) return '/admin/leaderboard-management';
  if (type.includes('gift') || title.includes('gift')) return '/admin/gifts';
  if (type.includes('daily') || title.includes('daily login')) return '/admin/rewards-management';
  if (type.includes('transfer') || title.includes('transfer')) return '/admin/transfer-history';
  if (type.includes('game') || type === 'game') return '/admin/game-management';
  if (type.includes('app_version') || type === 'app_version') return '/admin/app-version';

  return '/admin';
};

// =====================================================================
// ADMIN PANEL NAVIGATION — Single Source of Truth
// =====================================================================
// Every section listed here is a 1-to-1 mapping to ONE admin page in
// `src/pages/admin/Admin*.tsx` and ONE Route in `src/App.tsx`.
//
// Architecture rules (enforced by mem://architecture/admin-hub-single-source-of-truth):
//   • No duplicate sections — each admin page appears exactly once.
//   • Each section's `description` documents its exact purpose so AI tools
//     (Anti Gravity, Lovable, etc.) can understand admin↔user-app wiring
//     without opening the source file.
//   • `hubKey` controls sub-admin section-level permissions.
//   • `ownerOnly: true` hides the item from every sub-admin (Owner only).
// =====================================================================
const navGroups: NavGroup[] = [
  {
    title: "Overview",
    items: [
      {
        label: "Dashboard",
        icon: LayoutDashboard,
        path: "/admin",
        description: "Real-time platform health: active users, revenue, hosts, streams, parties — top-level KPIs only.",
      },
      {
        label: "Reports & Analytics",
        icon: TrendingUp,
        path: "/admin/reports",
        description: "Aggregated charts and time-series reports for revenue, gifting, calls, agency performance.",
      },
    ],
  },
  {
    title: "👥 User System",
    hubKey: "user-hub",
    items: [
      {
        label: "User Hub",
        icon: Users,
        path: "/admin/user-hub",
        hubKey: "user-hub",
        description: "Landing page for the User System — quick links and aggregate user counts by role/country.",
      },
      {
        label: "User Management",
        icon: UserCog,
        path: "/admin/user-management",
        hubKey: "user-hub",
        description: "Full user CRUD: edit profile, change role, ban, send notifications, adjust diamonds/beans.",
      },
      {
        label: "All Users",
        icon: Users,
        path: "/admin/users",
        hubKey: "user-hub",
        description: "Read-only paginated list of every registered user — search, filter, view details.",
      },
      {
        label: "Host Applications",
        icon: UserPlus,
        path: "/admin/host-applications",
        hubKey: "user-hub",
        description: "Pending host application queue — approve/reject users who applied to become hosts.",
      },
      {
        label: "Host Search",
        icon: Search,
        path: "/admin/host-search",
        hubKey: "user-hub",
        description: "Quick lookup tool to find any host by UID, name, agency, or country.",
      },
      {
        label: "All Hosts",
        icon: UserCheck,
        path: "/admin/hosts",
        hubKey: "user-hub",
        description: "List of approved hosts — manage status, agency assignment, and visibility on home feeds.",
      },
      {
        label: "Face Verification",
        icon: ScanFace,
        path: "/admin/face-verification",
        hubKey: "user-hub",
        description: "Manual approval queue for host face-verification submissions (selfie + ID match).",
      },
      {
        label: "Blocked Users",
        icon: Ban,
        path: "/admin/blocked",
        hubKey: "user-hub",
        description: "List of users blocked from login — review reason, unblock, or escalate to permanent ban.",
      },
      {
        label: "Live Bans",
        icon: ShieldAlert,
        path: "/admin/live-bans",
        hubKey: "user-hub",
        description: "Bans applied to live-streaming privileges only — user can still chat/recharge but not go live.",
      },
      {
        label: "Permanent Ban (3-Step)",
        icon: Ban,
        path: "/admin/permanent-ban",
        hubKey: "user-hub",
        description: "Owner-reviewed 3-step workflow: initiate → review evidence → execute permanent ban with linked accounts.",
      },
      {
        label: "Country Distribution",
        icon: Users,
        path: "/admin/country-distribution",
        hubKey: "user-hub",
        description: "Geographic breakdown of users and hosts by country with realtime counts.",
      },
      {
        label: "Face Violations",
        icon: ScanFace,
        path: "/admin/face-violations",
        hubKey: "user-hub",
        description: "Hosts flagged for face-mismatch or banned face-hash matches during stream/verification.",
      },
      {
        label: "Moderation",
        icon: Shield,
        path: "/admin/moderation",
        hubKey: "user-hub",
        description: "Chat moderation logs — contact-sharing detections, abusive content, and auto-block actions.",
      },
      {
        label: "User Reports",
        icon: ShieldAlert,
        path: "/admin/user-reports",
        hubKey: "user-hub",
        description: "User-submitted reports against other users (harassment, spam, inappropriate behavior).",
      },
      {
        label: "Online Users",
        icon: Activity,
        path: "/admin/online-users",
        hubKey: "user-hub",
        description: "Currently online users and presence state for realtime monitoring.",
      },
    ],
  },
  {
    title: "🏢 Agency System",
    hubKey: "agency-hub",
    items: [
      {
        label: "Agency Hub",
        icon: Building2,
        path: "/admin/agency-hub",
        hubKey: "agency-hub",
        description: "Landing page for Agency System — top-level metrics and quick links to agency tools.",
      },
      {
        label: "All Agencies",
        icon: Building2,
        path: "/admin/agencies",
        hubKey: "agency-hub",
        description: "Master list of every agency — beans/diamond balance, hosts count, level, block/unblock actions.",
      },
      {
        label: "Owner Approvals Hub",
        icon: ShieldCheck,
        path: "/admin/approvals",
        hubKey: "agency-hub",
        description: "Unified inbox for every financial / admin action queued by Sub-Admins, Support Admins, and Country Super Admins. Approve or reject in one place.",
      },
      {
        label: "Agency Policy",
        icon: FileText,
        path: "/admin/agency-policy",
        hubKey: "agency-hub",
        description: "Edit the public Agency Policy page (terms shown to agency owners in the user app).",
      },
      {
        label: "Pricing & Commission Hub",
        icon: Percent,
        path: "/admin/pricing-hub",
        hubKey: "agency-hub",
        description: "SINGLE unified page for ALL commissions, call rates, gift split, agency tiers, withdrawal floors, exchange & helper fees. Replaces old Commissions / Calculator / Call Settings pages.",
      },
    ],
  },
  {
    title: "👑 Level & VIP",
    items: [
      {
        label: "Level Management",
        icon: Crown,
        path: "/admin/level-management",
        hubKey: "level-hub",
        description: "Configure user-level thresholds (XP needed per level) shown on the Level page in the user app.",
      },
      {
        label: "Level Tiers",
        icon: TrendingUp,
        path: "/admin/level-tiers",
        hubKey: "level-hub",
        description: "Define tier groupings (Bronze→Diamond) that bundle multiple consecutive levels for badges.",
      },
      {
        label: "Level Privileges",
        icon: Star,
        path: "/admin/level-privileges",
        hubKey: "level-hub",
        description: "Map perks (entry effects, frames, chat colors) to each level shown in app's Level Privileges screen.",
      },
      {
        label: "Feature Levels",
        icon: ArrowUpCircle,
        path: "/admin/feature-levels",
        hubKey: "level-hub",
        description: "Set minimum level required to unlock features (private call, party host, gift sending, etc.).",
      },
      {
        label: "VIP & Noble System",
        icon: Star,
        path: "/admin/vip-management",
        hubKey: "vip-hub",
        description: "Manage VIP plans, prices, durations, and Noble subscription tiers sold on the VIP page.",
      },
      {
        label: "VIP Medals",
        icon: Crown,
        path: "/admin/vip-medals",
        hubKey: "vip-hub",
        description: "Upload VIP medal images displayed on profile cards and chat next to VIP usernames.",
      },
      {
        label: "VIP Privileges",
        icon: Star,
        path: "/admin/vip-privileges",
        hubKey: "vip-hub",
        description: "Define which features VIP plans unlock (invisibility, exclusive frames, message highlights).",
      },
      {
        label: "Noble Cards",
        icon: CreditCard,
        path: "/admin/noble-cards",
        hubKey: "vip-hub",
        description: "Design and manage Noble subscription cards (Knight, Baron, Viscount, Earl, Marquis, Duke, King).",
      },
      {
        label: "Noble Subscriptions",
        icon: Crown,
        path: "/admin/noble-subscriptions",
        hubKey: "vip-hub",
        description: "Monthly Noble subscription tiers (Baron → King): pricing, perks, anti-kick, recharge bonus, free diamonds.",
      },
      {
        label: "Ranking Rewards",
        icon: TrendingUp,
        path: "/admin/ranking-rewards",
        hubKey: "vip-hub",
        description: "Set daily/weekly leaderboard prize pools and auto-distribute rewards to top hosts/users.",
      },
    ],
  },
  {
    title: "🎨 Visual Assets",
    hubKey: "visual-hub",
    items: [
      {
        label: "Visual Assets Hub",
        icon: Sparkles,
        path: "/admin/visual-assets",
        hubKey: "visual-hub",
        description: "Landing page for the Visual Assets system — quick links to every asset manager below.",
      },
      {
        label: "Avatar Frames",
        icon: Image,
        path: "/admin/frames",
        hubKey: "visual-hub",
        description: "Upload/manage decorative frames that wrap user avatars on profile and home cards.",
      },
      {
        label: "Role Frames",
        icon: Image,
        path: "/admin/role-frames",
        hubKey: "visual-hub",
        description: "Special frames automatically assigned by role (Owner, Admin, Helper, Agency Owner).",
      },
      {
        label: "Entry Effects",
        icon: Sparkles,
        path: "/admin/entry-effects",
        hubKey: "visual-hub",
        description: "SVGA/Lottie animations played in live rooms when a high-level or VIP user enters.",
      },
      {
        label: "Entry Banners",
        icon: Image,
        path: "/admin/entry-banners",
        hubKey: "visual-hub",
        description: "Static banner graphics shown around the user's name on room entry.",
      },
      {
        label: "Entry Bars",
        icon: Activity,
        path: "/admin/entry-bars",
        hubKey: "visual-hub",
        description: "Horizontal scrolling marquee bar that announces VIP/Noble user arrivals across rooms.",
      },
      {
        label: "Entry Name Bars",
        icon: Activity,
        path: "/admin/entry-name-bars",
        hubKey: "visual-hub",
        description: "Customizable name-tag designs displayed during room entry animations.",
      },
      {
        label: "Vehicle Entrances",
        icon: Sparkles,
        path: "/admin/vehicle-entrances",
        hubKey: "visual-hub",
        description: "3D vehicle entry animations (cars, dragons, etc.) that drive across the live-room screen.",
      },
      {
        label: "Chat Bubbles",
        icon: MessageSquare,
        path: "/admin/chat-bubbles",
        hubKey: "visual-hub",
        description: "Custom chat-bubble skins/colors users can equip from the shop or unlock by level.",
      },
      {
        label: "Animation Store",
        icon: Play,
        path: "/admin/animation-store",
        hubKey: "visual-hub",
        description: "Central library of all SVGA/Lottie/MP4 animations available across gifts, frames, and effects.",
      },
      {
        label: "Icon Registry",
        icon: Package,
        path: "/admin/icon-registry",
        hubKey: "visual-hub",
        description: "Map icon keys (used app-wide) to images so brand icons can be swapped without redeploying.",
      },
      {
        label: "Beauty Filters",
        icon: Sparkles,
        path: "/admin/beauty-filters",
        hubKey: "visual-hub",
        description: "Manage beauty presets and stickers shown in the streaming filter panel.",
      },
      {
        label: "Verified Badges",
        icon: Check,
        path: "/admin/verified-badges",
        hubKey: "visual-hub",
        description: "Manually grant/revoke verified blue-tick badges shown next to usernames.",
      },
    ],
  },
  {
    title: "💰 Diamond & Finance",
    hubKey: "finance-hub",
    items: [
      {
        label: "Pricing & Commission Hub",
        icon: Percent,
        path: "/admin/pricing-hub",
        hubKey: "finance-hub",
        description: "SINGLE unified page for ALL commissions, call rates, gift split, agency tiers, withdrawal floors, exchange & helper fees.",
      },
      {
        label: "Finance Management",
        icon: DollarSign,
        path: "/admin/finance",
        hubKey: "finance-hub",
        description: "Top-level finance dashboard — total revenue, withdrawals, agency payouts, platform earnings.",
      },
      {
        label: "Diamond Trader Hub",
        icon: Coins,
        path: "/admin/coin-trader-hub",
        hubKey: "trader-hub",
        description: "Landing page for Diamond Trader system — bundles Topup, Payment Gateways, and Helpers.",
      },
      {
        label: "Diamond Traders",
        icon: Coins,
        path: "/admin/coin-traders",
        hubKey: "trader-hub",
        description: "List of approved Diamond Traders (helpers who sell diamonds) with their balances and stats.",
      },
      {
        label: "Trader Approvals",
        icon: Coins,
        path: "/admin/coin-traders/approvals",
        hubKey: "trader-hub",
        description: "Approve or revoke Level 1–5 helper-traders for UID top-up permission; review recent approval changes.",
      },
      {
        label: "Trader Orders",
        icon: ShoppingBag,
        path: "/admin/coin-traders/orders",
        hubKey: "trader-hub",
        description: "Diamond purchase orders placed with traders — status, payment proof, dispute resolution.",
      },
      {
        label: "Trader Transactions",
        icon: Activity,
        path: "/admin/coin-traders/transactions",
        hubKey: "trader-hub",
        description: "Audit log of every diamond movement to/from traders for accounting reconciliation.",
      },
      {
        label: "Diamonds Management",
        icon: Coins,
        path: "/admin/coins",
        hubKey: "finance-hub",
        description: "Manually adjust any user's diamond balance with full audit trail (refunds, corrections, gifts).",
      },
      {
        label: "Topup System",
        icon: ArrowUpCircle,
        path: "/admin/topup-system",
        hubKey: "finance-hub",
        description: "Configure recharge packages ($1.29–$89.99), bonuses, and country-specific pricing rules.",
      },
      {
        label: "Manual Topup",
        icon: ArrowUpCircle,
        path: "/admin/manual-topup",
        hubKey: "finance-hub",
        description: "Owner tool to manually credit diamonds to any user (for refunds or marketing campaigns).",
      },
      {
        label: "Payment Gateways",
        icon: CreditCard,
        path: "/admin/payment-gateways",
        hubKey: "finance-hub",
        description: "Enable/disable payment providers (MeriCash crypto, Google Play, local gateways) and edit their credentials.",
      },
      {
        label: "Topup Methods",
        icon: CreditCard,
        path: "/admin/topup-payment-methods",
        hubKey: "finance-hub",
        description: "Manage country-specific payment method visibility shown on the user Recharge page.",
      },
      {
        label: "Withdrawals",
        icon: TrendingDown,
        path: "/admin/withdrawals",
        hubKey: "finance-hub",
        description: "Approve/reject agency and helper withdrawal requests, attach payment proof, set helper assignments.",
      },
      {
        label: "Balance Deduction",
        icon: TrendingDown,
        path: "/admin/balance-deduction",
        hubKey: "finance-hub",
        description: "Owner tool to deduct beans/diamonds from any user/agency for chargebacks or violations.",
      },
      {
        label: "Transfer History",
        icon: Activity,
        path: "/admin/transfer-history",
        hubKey: "finance-hub",
        description: "History of weekly automated agency-to-host beans→diamonds settlement transfers.",
      },
      {
        label: "Recharge History",
        icon: CreditCard,
        path: "/admin/recharge-history",
        hubKey: "finance-hub",
        description: "Every successful diamond purchase across all gateways — searchable by user, date, gateway.",
      },
      {
        label: "💎 Recharge Campaigns",
        icon: Sparkles,
        path: "/admin/recharge-campaigns",
        hubKey: "finance-hub",
        description: "Time-limited bonus campaigns (e.g. \"+30% diamonds this weekend\") shown on the Recharge page.",
      },
      {
        label: "Transfer Scheduler",
        icon: Clock,
        path: "/admin/transfer-scheduler",
        hubKey: "finance-hub",
        description: "Configure the cron schedule that triggers the weekly agency settlement edge function.",
      },
      {
        label: "Payroll Orders",
        icon: Wallet,
        path: "/admin/payroll-orders",
        hubKey: "finance-hub",
        description: "Bulk payout orders for Level-5 helpers and payroll-enabled accounts with status tracking.",
      },
      {
        label: "Shop",
        icon: ShoppingBag,
        path: "/admin/shop",
        hubKey: "finance-hub",
        description: "Manage shop items (frames, vehicles, badges) — pricing, preview images, availability dates.",
      },
      {
        label: "Gifts",
        icon: Gift,
        path: "/admin/gifts",
        hubKey: "finance-hub",
        description: "Manage gift catalog (5 categories: Wall, Lucky, Luxurious, VIP, Pro) with price and animation.",
      },
      {
        label: "Gift Transactions",
        icon: Activity,
        path: "/admin/gift-transactions",
        hubKey: "finance-hub",
        description: "Audit every gift sent, including sender, receiver, diamond value, and settlement status.",
      },
      {
        label: "User Beans Exchange",
        icon: Coins,
        path: "/admin/user-beans-exchange",
        hubKey: "finance-hub",
        description: "Configure the user Beans→Diamonds exchange rate and minimum exchange amounts.",
      },
    ],
  },
  {
    title: "🤝 Helpers",
    hubKey: "trader-hub",
    items: [
      {
        label: "Helper Management",
        icon: UserCheck,
        path: "/admin/helper-management",
        hubKey: "trader-hub",
        description: "Manage approved helpers — wallet balance, payment numbers, level, payroll-enabled flag.",
      },
      {
        label: "Helper Applications",
        icon: UserPlus,
        path: "/admin/helper-applications",
        hubKey: "trader-hub",
        description: "Approval queue for users who applied to become a helper/diamond trader.",
      },
      {
        label: "Helper Requests",
        icon: MessageSquare,
        path: "/admin/helper-requests",
        hubKey: "trader-hub",
        description: "Helpers' requests to upgrade level, top-up wallet, or modify payment methods.",
      },
      {
        label: "Helper Orders",
        icon: ShoppingBag,
        path: "/admin/helper-orders",
        hubKey: "trader-hub",
        description: "All diamond-purchase orders flowing through helpers — status, proof, refund actions.",
      },
      {
        label: "Level 5 Helpers",
        icon: Crown,
        path: "/admin/level5-helpers",
        hubKey: "trader-hub",
        description: "Elite Level-5 helper roster with payroll settings and elevated trade limits.",
      },
      {
        label: "Country Super Admin (L6)",
        icon: ShieldCheck,
        path: "/admin/super-admin-management",
        hubKey: "trader-hub",
        description: "Per-country payroll managers — review L6 applications, confirm $10K deposit, approve & copy access link.",
      },
    ],

  },
  {
    title: "🎮 Game System",
    hubKey: "game-hub",
    items: [
      {
        label: "Game Management",
        icon: Gamepad2,
        path: "/admin/game-management",
        hubKey: "game-hub",
        description: "Enable/disable in-house games (Lucky Number, Rocket Race, Teen Patti) and edit their rules.",
      },
      {
        label: "Game Settings",
        icon: Settings,
        path: "/admin/game-settings",
        hubKey: "game-hub",
        description: "Global game settings: min/max bet, house edge, rate-limit, game-room visibility.",
      },
      {
        label: "Game Providers",
        icon: Gamepad2,
        path: "/admin/game-providers",
        hubKey: "game-hub",
        description: "Manage third-party game-provider integrations (gamesp.ccdn.ink seamless wallet config).",
      },
      {
        label: "Game Server",
        icon: Activity,
        path: "/admin/game-server",
        hubKey: "game-hub",
        description: "Live status of game-server connections, websocket sessions, and active rounds.",
      },
      {
        label: "Game Leaderboard",
        icon: Crown,
        path: "/admin/game-leaderboard",
        hubKey: "game-hub",
        description: "Top winners across all games with daily/weekly reset and prize-distribution audit.",
      },
    ],
  },
  {
    title: "📺 Content",
    hubKey: "content-hub",
    items: [
      {
        label: "🎯 Campaign Banner Hub",
        icon: Image,
        path: "/admin/campaign-banner-hub",
        hubKey: "content-hub",
        description: "ONE place for every banner: Home, Recharge, Rating, Invitation, Event Popups, Party, Entry. Single source of truth flowing to every screen.",
      },
      {
        label: "Content Management",
        icon: Camera,
        path: "/admin/content-management",
        hubKey: "content-hub",
        description: "Landing page for content moderation — quick links to streams, recordings, reels review.",
      },
      {
        label: "Banners",
        icon: Image,
        path: "/admin/banners",
        hubKey: "content-hub",
        description: "Home-page promo banner carousel — upload images, schedule, link to in-app destinations.",
      },
      {
        label: "Content Pages",
        icon: FileText,
        path: "/admin/content",
        hubKey: "content-hub",
        description: "Edit static pages (Privacy Policy, Terms, About, Helper Policy) shown in user-app Settings.",
      },
      {
        label: "Streams",
        icon: Camera,
        path: "/admin/streams",
        hubKey: "content-hub",
        description: "Live and ended live-stream sessions — viewers, gifts received, force-end action.",
      },
      {
        label: "Recordings",
        icon: Play,
        path: "/admin/recordings",
        hubKey: "content-hub",
        description: "Recorded stream replays storage — review for compliance, delete or feature.",
      },
      {
        label: "Track Recordings",
        icon: Film,
        path: "/admin/track-recordings",
        hubKey: "content-hub",
        description: "Pkg113 per-participant moderation evidence — admin-only audio/video track recordings.",
      },
      {
        label: "SIP Inbound",
        icon: PhoneIncoming,
        path: "/admin/sip-inbound",
        hubKey: "content-hub",
        description: "Pkg115 — map PSTN phone numbers (DIDs) to LiveKit rooms. Callers join as regular participants.",
      },
      {
        label: "LiveKit Rooms",
        icon: Radio,
        path: "/admin/livekit-rooms",
        hubKey: "content-hub",
        description: "Pkg135 — read-only SFU inspection of every active LiveKit room (call/live/party) with participant drill-in.",
      },
      {
        label: "LiveKit Egress",
        icon: Film,
        path: "/admin/livekit-egress",
        hubKey: "content-hub",
        description: "Pkg136 — every active recording / HLS / RTMP simulcast job. Inspect status, view file outputs, swap layout on room-composite jobs.",
      },
      {
        label: "LiveKit Ingress",
        icon: Antenna,
        path: "/admin/livekit-ingress",
        hubKey: "content-hub",
        description: "Pkg137 — inspect RTMP/WHIP ingress jobs (OBS / external encoders). Safe delete with confirmation. Stream keys server-masked.",
      },
      {
        label: "LiveKit SIP",
        icon: Phone,
        path: "/admin/livekit-sip",
        hubKey: "content-hub",
        description: "Pkg138 — inspect inbound/outbound SIP trunks and dispatch rules. Safe delete with confirmation.",
      },
      {
        label: "LiveKit Webhooks",
        icon: Antenna,
        path: "/admin/livekit-webhook",
        hubKey: "content-hub",
        description: "Pkg97 — raw LiveKit Cloud webhook event log (room/participant/track/egress/ingress) with full payload inspector.",
      },
      {
        label: "Reels",
        icon: Camera,
        path: "/admin/reels",
        hubKey: "content-hub",
        description: "Short-video reels feed moderation — approve, hide, or remove user-posted clips.",
      },
      {
        label: "Leaderboard",
        icon: Crown,
        path: "/admin/leaderboard-management",
        hubKey: "content-hub",
        description: "Configure leaderboard categories (top sender, top receiver, PK competition) and reward rules.",
      },
      {
        label: "Task Center",
        icon: CheckCheck,
        path: "/admin/tasks-settings",
        hubKey: "content-hub",
        description: "Daily/weekly missions shown on the user-app Tasks page — define goals and diamond rewards.",
      },
      {
        label: "Rewards Management",
        icon: Gift,
        path: "/admin/rewards-management",
        hubKey: "content-hub",
        description: "Daily-login rewards calendar — what users get on day 1, 2, 3… of consecutive logins.",
      },
      {
        label: "Rating Rewards",
        icon: Star,
        path: "/admin/rating-rewards",
        hubKey: "content-hub",
        description: "Diamonds awarded when users rate the app on Play Store; manage claim window and amount.",
      },
      {
        label: "Reward Claims History",
        icon: Gift,
        path: "/admin/reward-claims-history",
        hubKey: "content-hub",
        description: "Review historical reward claims from rating, leaderboard, and engagement reward flows.",
      },
    ],
  },
  {
    title: "🎉 Party",
    hubKey: "party-hub",
    items: [
      {
        label: "Party Management",
        icon: PartyPopper,
        path: "/admin/party-management",
        hubKey: "party-hub",
        description: "Top-level dashboard for the Party (multi-seat audio room) system with quick links.",
      },
      {
        label: "Party Rooms",
        icon: PartyPopper,
        path: "/admin/party-rooms",
        hubKey: "party-hub",
        description: "Active and historical party rooms — participants, gifts, force-close action.",
      },
      {
        label: "Party Backgrounds",
        icon: Image,
        path: "/admin/party-backgrounds",
        hubKey: "party-hub",
        description: "Upload background skins party hosts can choose for their room ambiance.",
      },
      {
        label: "Party Banners",
        icon: Image,
        path: "/admin/party-banners",
        hubKey: "party-hub",
        description: "Promo banners shown inside the Party tab of the user app.",
      },
      {
        label: "Room Welcome Messages",
        icon: MessageSquare,
        path: "/admin/room-welcome-messages",
        hubKey: "party-hub",
        description: "Default welcome message templates auto-posted when a user enters a party room.",
      },
    ],
  },
  {
    title: "📞 Calling",
    hubKey: "settings-hub",
    items: [
      {
        label: "Call Pricing → Hub",
        icon: Phone,
        path: "/admin/pricing-hub",
        hubKey: "settings-hub",
        description: "Per-minute call rates, host % and grace seconds now live in the unified Pricing & Commission Hub.",
      },
      {
        label: "Random Call Settings",
        icon: Phone,
        path: "/admin/random-call",
        hubKey: "settings-hub",
        description: "Random (match) call pricing, 40-second minimum billable rule, 60s free window, auto-convert to private, and reject-streak ban.",
      },
      {
        label: "Random Call Ops",
        icon: Phone,
        path: "/admin/random-call-ops",
        hubKey: "settings-hub",
        description: "Live monitor for random-call queue, active sessions, skip counters, and manual settlement.",
      },
      {
        label: "Today's Calls",
        icon: Phone,
        path: "/admin/today-calls",
        hubKey: "settings-hub",
        description: "Same-day call sessions, durations, billing totals, and host/user call activity.",
      },
    ],
  },
  {
    title: "🎧 Support",
    hubKey: "moderation-hub",
    items: [
      {
        label: "Support Tickets",
        icon: MessageSquare,
        path: "/admin/support-tickets",
        hubKey: "moderation-hub",
        description: "In-app support ticket queue — reply to user issues; powers the Customer Service screen.",
      },
      {
        label: "Support Reports",
        icon: ShieldAlert,
        path: "/admin/support-reports",
        hubKey: "moderation-hub",
        description: "Owner inbox for issues forwarded by support admins. Includes user ID + the reported message.",
      },
      {
        label: "Pending Approvals",
        icon: Clock,
        path: "/admin/pending-approvals",
        hubKey: "moderation-hub",
        description: "Owner-only queue of sub-admin financial / verification actions awaiting approval.",
      },
      {
        label: "Auto Actions Log",
        icon: Clock,
        path: "/admin/auto-actions",
        hubKey: "moderation-hub",
        description: "Full history of every auto financial action (recharge / withdrawal / commission / payroll) with reverse + refund.",
      },
      {
        label: "Cost Monitor",
        icon: Activity,
        path: "/admin/cost-monitor",
        hubKey: "moderation-hub",
        description: "Realtime DB-read load and billing throughput across Live, Call, Party + threshold alerts and Realtime kill switch.",
      },
      {
        label: "Moderation Audit",
        icon: ScrollText,
        path: "/admin/moderation-audit",
        hubKey: "moderation-hub",
        description: "Searchable history of every ban, report, blocked IP, and case-target change with full before/after diff and actor.",
      },
      {
        label: "Gmail Support",
        icon: Mail,
        path: "/admin/gmail-support",
        hubKey: "moderation-hub",
        description: "Inbox for emails sent to support@ — reply directly via Gmail SMTP edge function.",
      },
      {
        label: "Chat Inspector",
        icon: Search,
        path: "/admin/chat-inspector",
        hubKey: "moderation-hub",
        description: "Read any 1-to-1 conversation with full audit trail (Owner-only privacy-sensitive tool).",
      },
      {
        label: "Number Sharing",
        icon: Phone,
        path: "/admin/number-sharing",
        hubKey: "moderation-hub",
        description: "Detected phone-number sharing in chat — review violations and apply bans.",
      },
      {
        label: "Contact Violations",
        icon: ShieldAlert,
        path: "/admin/contact-violations",
        hubKey: "moderation-hub",
        description: "Google Vision OCR flagged contact-info sharing (Bengali, Hindi, Arabic) in chat & screenshots.",
      },
    ],
  },
  {
    title: "📢 Notifications",
    hubKey: "settings-hub",
    items: [
      {
        label: "Push Broadcast",
        icon: Bell,
        path: "/admin/push-broadcast",
        hubKey: "settings-hub",
        description: "Send FCM push notifications to all users or filtered segments (country, role, level).",
      },
      {
        label: "Notice Broadcast",
        icon: Megaphone,
        path: "/admin/notice-broadcast",
        hubKey: "settings-hub",
        description: "In-app banner notices shown at app launch (maintenance announcements, events).",
      },
      {
        label: "Email Broadcast",
        icon: Mail,
        path: "/admin/email-broadcast",
        hubKey: "settings-hub",
        description: "Bulk email campaigns sent via Gmail SMTP to users with verified emails.",
      },
      {
        label: "OTP Email Providers",
        icon: Mail,
        path: "/admin/otp-providers",
        hubKey: "settings-hub",
        description: "Multi-provider OTP failover: Resend + Brevo + Gmail SMTP. Race mode, daily quotas, success-rate dashboard.",
      },
      {
        label: "Notification Templates",
        icon: Bell,
        path: "/admin/notification-templates",
        hubKey: "settings-hub",
        description: "Reusable notification templates referenced by server-side triggers (gift received, follow, etc.).",
      },
      {
        label: "AI Photo Generator",
        icon: Sparkles,
        path: "/admin/ai-image-studio",
        hubKey: "settings-hub",
        description: "Generate premium 3D event banners, push thumbnails, and social images with AI — download or push instantly.",
      },
      {
        label: "Allowed Links",
        icon: Shield,
        path: "/admin/allowed-links",
        hubKey: "settings-hub",
        description: "Whitelist safe external URLs and link patterns allowed inside chat, profiles, and content.",
      },
    ],
  },
  {
    title: "🐛 Debug & Logs",
    items: [
      {
        label: "Activity Logs",
        icon: FileText,
        path: "/admin/logs",
        description: "Audit trail of every admin action (who changed what, when) for compliance and security review.",
      },
      {
        label: "Error Logs",
        icon: AlertCircle,
        path: "/admin/error-logs",
        description: "Client and edge-function error reports captured by the global error boundary.",
      },
      {
        label: "App Blueprint",
        icon: Map,
        path: "/admin/blueprint",
        ownerOnly: true,
        description: "Owner-only architectural map of every page, RPC, table, and edge function in the system.",
      },
    ],
  },
  {
    title: "⚙️ Settings",
    hubKey: "settings-hub",
    items: [
      {
        label: "App Settings Hub",
        icon: Settings,
        path: "/admin/app-settings-hub",
        hubKey: "settings-hub",
        description: "Landing page for the Settings hub — quick links to every settings page below.",
      },
      {
        label: "🏠 Host Feed Ranking",
        icon: Settings,
        path: "/admin/host-feed-ranking",
        hubKey: "settings-hub",
        description: "Control reject penalties, viewer/level weights and live/online/busy boosts for the home host feed.",
      },
      {
        label: "🎉 Party Discovery Ranking",
        icon: Settings,
        path: "/admin/party-discovery-ranking",
        hubKey: "settings-hub",
        description: "Control participant weight, recency, growth and peak-hour boosts for the party room discovery feed.",
      },
      {
        label: "🤖 Ranking Automation (AI)",
        icon: Settings,
        path: "/admin/ranking-automation",
        hubKey: "settings-hub",
        description: "One-click apply operational policy modes (Default / Peak / Abuse) with snapshot, verify and rollback. AI advisor recommends presets from a situation prompt.",
      },
      {
        label: "General Settings",
        icon: Settings,
        path: "/admin/settings",
        hubKey: "settings-hub",
        description: "Global app key/value settings (app_settings table) — feature flags, defaults, exchange rates.",
      },
      {
        label: "Branding",
        icon: Image,
        path: "/admin/branding",
        hubKey: "settings-hub",
        description: "App name, logo, splash image, and Play-Store icon — replace without redeploying the app.",
      },
      {
        label: "Invitation Settings",
        icon: UserPlus,
        path: "/admin/invitation-settings",
        hubKey: "settings-hub",
        description: "Configure referral / invitation rewards and tier thresholds shown on the Invitation page.",
      },
      {
        label: "Popup Event Banners",
        icon: Image,
        path: "/admin/popup-banners",
        hubKey: "settings-hub",
        description: "Modal popups shown on app launch (event teaser, recharge promo) with sequential rotation.",
      },
      {
        label: "Rating Reward Banners",
        icon: Image,
        path: "/admin/rating-banners",
        hubKey: "settings-hub",
        description: "Premium half-screen banners shown in the rating + giveaway popup. Active banners rotate randomly.",
      },
      {
        label: "Onboarding Slides",
        icon: Image,
        path: "/admin/onboarding-slides",
        hubKey: "settings-hub",
        description: "First-launch onboarding carousel slides shown to brand-new users before sign-up.",
      },
      {
        label: "App Version",
        icon: Smartphone,
        path: "/admin/app-version",
        hubKey: "settings-hub",
        description: "Force-update threshold, latest version, changelog, and maintenance-mode toggle for native apps.",
      },
      {
        label: "App Update Logs",
        icon: Smartphone,
        path: "/admin/app-update-logs",
        hubKey: "settings-hub",
        description: "Live log of every update check: device version vs server version, modal shown, force-update triggered, store opened.",
      },
      {
        label: "App Update Test Mode",
        icon: Smartphone,
        path: "/admin/app-update-test",
        hubKey: "settings-hub",
        description: "Simulate a forced or optional update on this device to verify the modal, dismiss, and store-open flow without publishing a new APK.",
      },
      {
        label: "Device Management",
        icon: Smartphone,
        path: "/admin/device-management",
        hubKey: "settings-hub",
        description: "Banned device IDs and IPs to enforce single-device-session and multi-account prevention.",
      },
      {
        label: "🎨 Event Themes",
        icon: Sparkles,
        path: "/admin/theme-manager",
        hubKey: "settings-hub",
        description: "Schedule seasonal app themes (Eid, New Year, Valentine) with auto-activate windows.",
      },
      {
        label: "Landing Page",
        icon: Image,
        path: "/admin/landing-page",
        hubKey: "settings-hub",
        description: "Manage public landing-page sections, copy, and visibility for marketing surfaces.",
      },
      {
        label: "Parcel Management",
        icon: Package,
        path: "/admin/parcel-management",
        hubKey: "settings-hub",
        description: "Manage parcel/reward package configurations and user-facing parcel availability.",
      },
      {
        label: "Sub-Admin Management",
        icon: Shield,
        path: "/admin/sub-admins",
        ownerOnly: true,
        description: "Owner-only — invite sub-admins, set their hub-level section permissions, revoke access.",
      },
      {
        label: "🔐 Device Approvals",
        icon: Smartphone,
        path: "/admin/device-approvals",
        ownerOnly: true,
        description: "Owner-only — approve new devices that admins/sub-admins try to log in from.",
      },
    ],
  },
];


const allAdminNavPaths = Array.from(
  new Set(navGroups.flatMap(group => group.items.map(item => normalizeAdminPath(item.path))))
);

const sortedAdminNavPaths = [...allAdminNavPaths].sort((a, b) => b.length - a.length);

const resolveNotificationNavPath = (notification: AdminNotification): string => {
  const rawPath = normalizeAdminPath(getAdminNotificationPath(notification));

  if (allAdminNavPaths.includes(rawPath)) {
    return rawPath;
  }

  const closestMatch = sortedAdminNavPaths.find(
    (navPath) => rawPath === navPath || rawPath.startsWith(`${navPath}/`)
  );

  if (closestMatch) {
    return closestMatch;
  }

  return rawPath.startsWith('/admin') ? rawPath : '/admin';
};

export default function AdminLayout() {
  useEnableBrowserPageInteraction({ mode: "app-shell" });
  const navigate = useNavigate();
  const location = useLocation();
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false);
  // Optimistic-render policy (matches AdminAccessGuard / NO-AUTO-LOGOUT):
  // If a local admin session exists we trust it INSTANTLY so the shell paints
  // in <50 ms instead of waiting on 2–3 serial RPCs (6 s timeout each).
  // `checkAdminAccess` still re-validates in the background and can clear the
  // session only if the server explicitly rejects it.
  const initialAdminSession = (() => {
    try {
      const s = getAdminSession();
      return s && getAdminSessionToken().length >= 16 ? s : null;
    } catch { return null; }
  })();
  const [currentUser, setCurrentUser] = useState<any>(initialAdminSession ? {
    id: initialAdminSession.admin_id,
    admin_id: initialAdminSession.admin_id,
    email: initialAdminSession.email,
    display_name: initialAdminSession.display_name,
    role: initialAdminSession.role,
    accepted_at: null,
  } : null);
  const [isAdmin, setIsAdmin] = useState(!!initialAdminSession);
  const [isLoading, setIsLoading] = useState(!initialAdminSession);
  const [expandedGroups, setExpandedGroups] = useState<string[]>(navGroups.map(g => g.title));
  const [searchQuery, setSearchQuery] = useState("");
  const [onlineUsersCount, setOnlineUsersCount] = useState(0);
  const [liveStreamsCount, setLiveStreamsCount] = useState(0);
  const [notifications, setNotifications] = useState<AdminNotification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [showNotifications, setShowNotifications] = useState(false);
  const [showProfileMenu, setShowProfileMenu] = useState(false);
  const notificationRef = useRef<HTMLDivElement>(null);
  const sidebarSearchRef = useRef<HTMLInputElement>(null);
  const sidebarNavRef = useRef<HTMLElement | null>(null);
  const adminScrollRootRef = useRef<HTMLElement | null>(null);
  const adminTouchStartRef = useRef<{ x: number; y: number } | null>(null);

  // Admin access hook for permission-based filtering
  const { isOwner: hookIsOwner, hasHubAccess, adminUser, isLoading: accessLoading } = useAdminAccess();
  
  // Owner status must come from the server-validated admin session/row only.
  // Never use local flags or hardcoded emails here; browser storage is editable.
  const isOwner = hookIsOwner;
  
  // Pending request counts for badges
  const [pendingCounts, setPendingCounts] = useState<Record<string, number>>({});

  // Notification counts by path (for sidebar badges)
  const [notificationCountsByPath, setNotificationCountsByPath] = useState<Record<string, number>>({});

  // Dismissed paths: clicking a sidebar item instantly dismisses its badge
  // Key = normalized path, Value = the pending count at time of dismissal
  const [dismissedPaths, setDismissedPaths] = useState<Set<string>>(new Set());
  const lastDismissedCountsRef = useRef<Record<string, number>>({});
  const dismissStorageKey = useMemo(
    () => getDismissedPathStorageKey(currentUser?.id),
    [currentUser?.id]
  );

  // Bell panel section notifications (derived from pending counts)
  const [sectionNotifications, setSectionNotifications] = useState<AdminNotification[]>([]);

  // Restore dismissed badge baseline after refresh (per-admin user)
  // Mark body as admin-active so portaled dialogs receive admin dark theme
  useEffect(() => {
    if (typeof document === 'undefined') return;
    document.body.setAttribute('data-admin-active', 'true');
    document.documentElement.setAttribute('data-admin-active', 'true');
    // NOTE: global MutationObserver-based media auto-resolver removed (Pkg42).
    // It was scanning every DOM mutation across the entire admin app and
    // caused major Chrome lag. All admin media now flows through
    // AdminMediaFrame, which resolves URLs explicitly.

    // Scroll safety net: admin never coexists with native camera / call
    // overlays. Clear any leaked surface classes from a previous live/party/
    // call/face-cam route that would otherwise hide #root (call-overlay-active)
    // or turn body/root transparent (native-media-active, lk-camera-live,
    // native-face-camera-active) and make the admin panel un-scrollable.
    const leakedClasses = [
      'call-overlay-active',
      'native-media-active',
      'lk-camera-live',
      'native-face-camera-active',
      'route-changing',
    ];
    leakedClasses.forEach((cls) => {
      document.body.classList.remove(cls);
      document.documentElement.classList.remove(cls);
    });
    // Some modal/camera libraries set inline scroll locks and forget to clear
    // them on unmount. Admin must always start with a clean scroll surface.
    const unlockScrollSurface = (node: HTMLElement) => {
      node.style.overflow = '';
      node.style.overflowY = '';
      node.style.position = '';
      node.style.top = '';
      node.style.left = '';
      node.style.right = '';
      node.style.width = '';
      node.style.height = '';
      node.style.touchAction = '';
      node.removeAttribute('data-scroll-locked');
    };
    unlockScrollSurface(document.body);
    unlockScrollSurface(document.documentElement);

    return () => {
      document.body.removeAttribute('data-admin-active');
      document.documentElement.removeAttribute('data-admin-active');
    };
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const persisted = parseStoredDismissedPathCounts(localStorage.getItem(dismissStorageKey));
    lastDismissedCountsRef.current = persisted;
    setDismissedPaths(new Set(Object.keys(persisted)));
  }, [dismissStorageKey]);

  // Persist dismissal baseline so refresh doesn't resurrect already-opened sections
  useEffect(() => {
    if (typeof window === 'undefined') return;

    const payload: Record<string, number> = {};
    dismissedPaths.forEach((path) => {
      payload[path] = Number(lastDismissedCountsRef.current[path] ?? 0);
    });

    localStorage.setItem(dismissStorageKey, JSON.stringify(payload));
  }, [dismissedPaths, dismissStorageKey]);

  const toCount = (value: unknown): number => {
    const n = Number(value ?? 0);
    return Number.isFinite(n) ? n : 0;
  };

  // ⚡ High-speed optimization: Pre-fetch all admin routes and pending counts instantly
  useEffect(() => {
    prefetchCommonAdminRoutes();
    fetchPendingCounts(); // Fetch immediately on mount for speed
  }, []);

  // Safety net: never let "Preparing admin console…" spin past 7s.
  useEffect(() => {
    if (!isLoading) return;
    const t = setTimeout(() => {
      console.warn('[AdminLayout] Forcing isLoading=false after 7s safety timeout');
      setIsLoading(false);
    }, 7000);
    return () => clearTimeout(t);
  }, [isLoading]);


  // Debounced pending counts fetch
  const pendingCountsTimerRef = useRef<NodeJS.Timeout | null>(null);
  const fetchPendingCountsRaw = async () => {
    try {
      const { data, error } = await (adminSupabase.rpc as any)('admin_layout_counts');
      if (error) throw error;
      const counts = (data || {}) as Record<string, unknown>;

      setOnlineUsersCount(toCount(counts.online_users));
      setLiveStreamsCount(toCount(counts.live_streams));
      
      // Calculate counts for each section
      const helperAppCount = toCount(counts.helper_applications_pending);
      const hostAppCount = toCount(counts.host_applications_pending);
      const userVerifyCount = toCount(counts.face_verifications_pending);
      const userReportsCount = toCount(counts.user_reports_pending);
      const agencyWithdrawalCount = toCount(counts.agency_withdrawals_pending);
      const helperRepliesCount = toCount(counts.helper_replies_unread);
      const payrollCount = toCount(counts.payroll_requests_pending);
      const helperOrdersCount = toCount(counts.helper_orders_pending);
      const liveBansCount = toCount(counts.live_bans_active);
      const faceViolationsCount = toCount(counts.live_face_violations_pending);
      const hostConvCount = toCount(counts.host_conversion_requests_pending);
      const moderationCount = toCount(counts.chat_moderation_unreviewed);
      const helperWithdrawalCount = toCount(counts.helper_withdrawal_requests_pending);
      const ratingRewardsCount = toCount(counts.rating_reward_claims_pending);
      const leaderboardRewardsCount = toCount(counts.leaderboard_reward_history_pending);
      const agencyTransfersCount = toCount(counts.agency_earnings_transfers_pending);
      const coinTransfersCount = toCount(counts.coin_transfers_pending);

      const helperManagementCount = toCount(counts.helper_upgrade_requests_pending) + toCount(counts.helper_topup_requests_pending) + helperAppCount + helperWithdrawalCount;
      const userHubCount = hostAppCount + userVerifyCount + userReportsCount;
      const agencyHubCount = agencyWithdrawalCount + agencyTransfersCount;
      const financeCount = helperRepliesCount + payrollCount + coinTransfersCount;
      const supportCount = toCount(counts.support_tickets_live_open);
      const contentCount = ratingRewardsCount + leaderboardRewardsCount;
      
      setPendingCounts({
        // Overview
        '/admin': 0,
        '/admin/reports': 0,
        '/admin/logs': 0,
        // User System
        '/admin/user-hub': userHubCount,
        '/admin/host-applications': hostAppCount,
        '/admin/face-verification': userVerifyCount,
        '/admin/user-reports': userReportsCount,
        '/admin/live-bans': liveBansCount,
        '/admin/face-violations': faceViolationsCount,
        '/admin/moderation': moderationCount,
        '/admin/user-management': hostConvCount,
        // Agency System
        '/admin/agency-hub': agencyHubCount,
        '/admin/withdrawals': agencyWithdrawalCount,
        '/admin/agencies': agencyTransfersCount,
        // Level & VIP
        '/admin/level-management': 0,
        '/admin/vip-management': 0,
        '/admin/ranking-rewards': leaderboardRewardsCount,
        // Visual Assets
        '/admin/visual-assets': 0,
        // Calling
        '/admin/pricing-hub': 0,
        // Coin & Finance
        '/admin/coin-trader-hub': coinTransfersCount,
        '/admin/finance': financeCount,
        '/admin/payroll-orders': payrollCount,
        '/admin/recharge-history': 0,
        '/admin/transfer-history': agencyTransfersCount,
        // Game
        '/admin/game-management': 0,
        // Content
        '/admin/content-management': contentCount,
        '/admin/rewards-management': 0,
        '/admin/rating-rewards': ratingRewardsCount,
        '/admin/leaderboard-management': leaderboardRewardsCount,
        '/admin/gifts': 0,
        // Party
        '/admin/party-management': 0,
        // Support
        '/admin/support-tickets': supportCount,
        '/admin/number-sharing': moderationCount,
        '/admin/chat-inspector': moderationCount,
        // Helpers
        '/admin/helper-management': helperManagementCount,
        '/admin/helper-applications': helperAppCount,
        '/admin/helper-orders': helperOrdersCount,
        '/admin/helper-requests': helperRepliesCount,
        // Settings
        '/admin/app-settings-hub': 0,
      });
    } catch (error) {
      console.error('Error fetching pending counts:', error);
      const message = formatAdminError(error);
      recordAdminError({
        kind: "rpc",
        label: "AdminLayout.admin_layout_counts",
        message,
        silent: /not authorized|unauthorized|admin session|jwt|session/i.test(message),
      });
    }
  };

  // Optimized version with minimal debounce for reactive feel
  const fetchPendingCounts = useCallback(() => {
    if (pendingCountsTimerRef.current) clearTimeout(pendingCountsTimerRef.current);
    pendingCountsTimerRef.current = setTimeout(fetchPendingCountsRaw, 50);
  }, []);

  // Fetch notifications — ONLY unread so old/read ones never reappear
  const fetchNotifications = async () => {
    try {
      // Use the admin's auth.users id (set in setCurrentUser after admin auth check)
      const adminUserAuthId = currentUser?.id;
      if (!adminUserAuthId) return;

      // Only fetch UNREAD notifications — once read, they never come back
      const { data, error } = await adminSupabase
        .from('notifications')
        .select('*')
        .eq('user_id', adminUserAuthId)
        .eq('is_read', false)
        .not('type', 'in', '(admin_message,admin_message_reply)')
        .order('created_at', { ascending: false })
        .limit(100);

      if (!error && data) {
        setNotifications(data);
        const unreadNotifications = data.filter(n => !n.is_read);
        setUnreadCount(unreadNotifications.length);

        // Calculate notification counts by sidebar path (dynamic path resolver)
        const countsByPath: Record<string, number> = {};
        unreadNotifications.forEach(notification => {
          const resolvedPath = resolveNotificationNavPath(notification as AdminNotification);
          countsByPath[resolvedPath] = (countsByPath[resolvedPath] || 0) + 1;
        });

        setNotificationCountsByPath(countsByPath);
      }
    } catch (error) {
      console.error('Error fetching notifications:', error);
      recordAdminError({ kind: "rpc", label: "AdminLayout.resolvedPath", message: formatAdminError(error) });
    }
  };

  // Since we only fetch unread notifications now, all in the list are unread
  const unreadDbNotifications = notifications.filter((n) => !n.is_read);
  const sectionUnreadCount = sectionNotifications.reduce((sum, item) => {
    const count = Number(item.data?.count || 1);
    return sum + (Number.isFinite(count) ? count : 1);
  }, 0);
  const totalUnreadCount = unreadCount + sectionUnreadCount;
  const allBellNotifications = [...sectionNotifications, ...unreadDbNotifications];

  // Dismiss a path's badge instantly (one-click clear) 
  const dismissPath = useCallback((rawPath: string) => {
    const normalizedPath = normalizeAdminPath(rawPath || '');
    if (!normalizedPath.startsWith('/admin')) return;

    const navItems = navGroups.flatMap((group) => group.items);
    const matchedItem = navItems.find((item) => {
      const itemPath = normalizeAdminPath(item.path);
      return normalizedPath === itemPath || normalizedPath.startsWith(`${itemPath}/`);
    });

    const pathsToDismiss = new Set<string>([normalizedPath]);

    // Also dismiss related hub badge
    if (matchedItem?.hubKey) {
      const hubItem = navItems.find((item) => item.hubKey === matchedItem.hubKey && item.path.includes('hub'));
      if (hubItem) {
        pathsToDismiss.add(normalizeAdminPath(hubItem.path));
      }
    }

    setDismissedPaths((prev) => {
      const next = new Set(prev);
      pathsToDismiss.forEach((p) => {
        next.add(p);
        lastDismissedCountsRef.current[p] = pendingCounts[p] || 0;
      });
      return next;
    });
  }, [pendingCounts]);

  const getEffectivePendingCount = useCallback((rawPath: string) => {
    const normalizedPath = normalizeAdminPath(rawPath || '');
    if (dismissedPaths.has(normalizedPath)) return 0;
    return Number(pendingCounts[normalizedPath] ?? pendingCounts[rawPath] ?? 0);
  }, [pendingCounts, dismissedPaths]);

  const markPathNotificationsAsRead = useCallback(async (rawPath: string) => {
    const normalizedPath = normalizeAdminPath(rawPath || '');
    if (!normalizedPath.startsWith('/admin')) return;

    // Prefer local cache first for instant UX
    let unreadMatchingNotifications = notifications.filter(
      (n) => !n.is_read && resolveNotificationNavPath(n) === normalizedPath
    );

    // After refresh, local cache may still be empty. Fallback to DB unread snapshot.
    if (unreadMatchingNotifications.length === 0) {
      const adminUserAuthId = currentUser?.id;
      if (!adminUserAuthId) return;

      const { data } = await adminSupabase
        .from('notifications')
        .select('*')
        .eq('user_id', adminUserAuthId)
        .eq('is_read', false)
        .not('type', 'in', '(admin_message,admin_message_reply)')
        .order('created_at', { ascending: false })
        .limit(250);

      unreadMatchingNotifications = (data || []).filter(
        (n) => resolveNotificationNavPath(n as AdminNotification) === normalizedPath
      ) as AdminNotification[];
    }

    if (unreadMatchingNotifications.length === 0) return;

    const ids = unreadMatchingNotifications.map((n) => n.id);

    setNotifications((prev) => prev.map((n) =>
      ids.includes(n.id) ? { ...n, is_read: true } : n
    ));
    setUnreadCount((prev) => Math.max(0, prev - unreadMatchingNotifications.length));
    setNotificationCountsByPath((prev) => ({
      ...prev,
      [normalizedPath]: 0,
    }));

    const { error } = await adminSupabase
      .from('notifications')
      .update({ is_read: true })
      .in('id', ids);

    if (error) {
      fetchNotifications();
    }
  }, [notifications, currentUser]);

  // Mark notification as read and navigate
  const handleNotificationClick = async (notification: AdminNotification) => {
    // Derived section notifications don't exist in DB; mark as seen and navigate
    if ((notification.data as any)?.is_section_pending) {
      const sectionPath = String((notification.data as any)?.adminPath || '');
      const rawCount = Number((notification.data as any)?.count ?? 0);
      const sectionCount = Number.isFinite(rawCount) ? rawCount : 0;

      const normalizedSectionPath = normalizeAdminPath(sectionPath);

      if (normalizedSectionPath) {
        dismissPath(normalizedSectionPath);
        // Sticky cleanup: remove this section from the persistent snapshot so it doesn't
        // reappear on the next render.
        delete stickySectionCountsRef.current[normalizedSectionPath];
      }

      // Optimistic instant removal from bell list
      setSectionNotifications((prev) => prev.filter((n) => n.id !== notification.id));

      setShowNotifications(false);
      if (normalizedSectionPath) navigate(normalizedSectionPath);
      return;
    }

    const targetPath = resolveNotificationNavPath(notification);

    // Optimistic UI: remove notification from list immediately (never comes back)
    if (!notification.is_read) {
      setNotifications(prev => prev.filter(n => n.id !== notification.id));
      setUnreadCount(prev => Math.max(0, prev - 1));
      setNotificationCountsByPath(prev => ({
        ...prev,
        [targetPath]: Math.max(0, (prev[targetPath] || 0) - 1)
      }));
    }

    const { error } = await adminSupabase
      .from('notifications')
      .update({ is_read: true })
      .eq('id', notification.id);

    if (error) {
      // Re-sync from DB if update fails
      fetchNotifications();
    }

    // Navigate to the relevant page
    setShowNotifications(false);
    navigate(targetPath);
  };

  // Mark notification as read (without navigation)
  const markAsRead = async (notificationId: string) => {
    const notification = notifications.find(n => n.id === notificationId);
    if (notification) {
      await handleNotificationClick(notification);
    }
  };

  // Mark all as read
  const markAllAsRead = async () => {
    const adminUserAuthId = currentUser?.id;
    if (!adminUserAuthId) return;

    const { error } = await adminSupabase
      .from('notifications')
      .update({ is_read: true })
      .eq('user_id', adminUserAuthId)
      .eq('is_read', false);

    if (!error) {
      setNotifications([]); // Clear all — they're now read and won't come back
      setUnreadCount(0);
      setNotificationCountsByPath({}); // Reset all DB notification counts
      setSectionNotifications([]); // Instantly clear derived section alerts in bell UI
      // Sticky cleanup: wipe the section snapshot so cleared rows don't re-appear.
      stickySectionCountsRef.current = {};
      // Dismiss all paths so bell badge = 0
      setDismissedPaths(() => {
        const all = new Set<string>();
        Object.entries(pendingCounts).forEach(([path, count]) => {
          if (path.startsWith('/admin') && count > 0) {
            all.add(normalizeAdminPath(path));
            lastDismissedCountsRef.current[normalizeAdminPath(path)] = count;
          }
        });
        return all;
      });
      toast.success('All notifications marked as read');
    }
  };

  // Track whether pending counts have been loaded at least once
  const pendingCountsLoadedRef = useRef(false);
  useEffect(() => {
    if (Object.keys(pendingCounts).length > 0) {
      pendingCountsLoadedRef.current = true;
    }
  }, [pendingCounts]);

  // When pending counts change, check if NEW items arrived for dismissed paths → undismiss
  // IMPORTANT: Skip this check until pendingCounts has been loaded at least once,
  // otherwise empty {} clears all dismissed paths on refresh
  useEffect(() => {
    if (!pendingCountsLoadedRef.current) return;

    setDismissedPaths((prev) => {
      const next = new Set(prev);
      let changed = false;
      prev.forEach((path) => {
        const currentCount = pendingCounts[path] || 0;
        const lastDismissed = lastDismissedCountsRef.current[path] || 0;
        if (currentCount > lastDismissed) {
          // New items arrived since dismissal → show badge again
          next.delete(path);
          delete lastDismissedCountsRef.current[path];
          changed = true;
        } else if (currentCount === 0) {
          // Nothing pending anymore → clean up
          next.delete(path);
          delete lastDismissedCountsRef.current[path];
          changed = true;
        }
      });
      return changed ? next : prev;
    });
  }, [pendingCounts]);

  // Build section-level notifications from pending counts so bell includes every active section.
  // Per owner directive: notifications must persist until manually cleared by the admin
  // (click the notification, or "Mark all as read"). They MUST NOT auto-disappear just because
  // the underlying pending count dropped to 0 (e.g. admin handled items on the page).
  // We therefore keep a sticky snapshot keyed by path: once a section has shown N pending items,
  // the bell row stays with that count until the admin explicitly dismisses it.
  const stickySectionCountsRef = useRef<Record<string, { count: number; firstSeenAt: string }>>({});

  useEffect(() => {
    const pathToLabel = navGroups
      .flatMap(group => group.items)
      .reduce<Record<string, string>>((acc, item) => {
        acc[item.path] = item.label;
        return acc;
      }, {});

    // 1) Update sticky snapshot — only ADD/BUMP, never auto-remove.
    const sticky = stickySectionCountsRef.current;
    Object.entries(pendingCounts).forEach(([path, count]) => {
      if (!path.startsWith('/admin')) return;
      const numericCount = Number(count) || 0;
      if (numericCount <= 0) return;
      // Skip paths the admin has already dismissed UNLESS new items have arrived since dismissal.
      const lastDismissed = lastDismissedCountsRef.current[path] || 0;
      if (dismissedPaths.has(path) && numericCount <= lastDismissed) return;
      const existing = sticky[path];
      if (!existing || numericCount > existing.count) {
        sticky[path] = {
          count: numericCount,
          firstSeenAt: existing?.firstSeenAt || new Date().toISOString(),
        };
      }
    });

    // 2) Build bell rows from sticky snapshot (NOT live pendingCounts), so previously-seen
    //    items still show even after admin handled them on the page — only manual dismiss
    //    (click row or "Mark all as read") removes them.
    const generated = Object.entries(sticky)
      .filter(([path]) => !dismissedPaths.has(path))
      .map(([path, entry]) => ({
        id: `section-${path}`,
        title: `📌 ${pathToLabel[path] || path}`,
        message: `${entry.count} new/pending update(s)`,
        type: 'section_pending',
        is_read: false,
        created_at: entry.firstSeenAt,
        data: {
          is_section_pending: true,
          adminPath: path,
          count: entry.count,
        },
      } as AdminNotification));

    setSectionNotifications(generated);
  }, [pendingCounts, dismissedPaths]);

  // Close notification dropdown when clicking outside
  useEffect(() => {
    const handlePointerOutside = (event: PointerEvent) => {
      if (notificationRef.current && !notificationRef.current.contains(event.target as Node)) {
        setShowNotifications(false);
      }
    };

    document.addEventListener('pointerdown', handlePointerOutside);
    return () => document.removeEventListener('pointerdown', handlePointerOutside);
  }, []);

  // Listen for badge refresh events from child components
  useEffect(() => {
    const handleBadgeRefresh = () => {
      fetchPendingCounts();
    };

    window.addEventListener('admin-badge-refresh', handleBadgeRefresh);
    return () => window.removeEventListener('admin-badge-refresh', handleBadgeRefresh);
  }, []);

  // Per owner directive: admin notifications must persist until manually cleared
  // by the admin (click the notification, or "Mark all as read"). Do NOT
  // auto-dismiss badges or mark DB notifications as read just because the admin
  // navigated to the corresponding page — they stay in the bell until acted on.


  // Notification sound - pre-initialize AudioContext on first user interaction
  const audioCtxRef = useRef<AudioContext | null>(null);
  const audioUnlockedRef = useRef(false);
  const playNotificationSoundRef = useRef<() => void>(() => {});
  const lastNotificationSoundAtRef = useRef(0);
  const browserNotifPermissionRef = useRef<NotificationPermission>('default');
  const fallbackAudioRef = useRef<HTMLAudioElement | null>(null);

  // Request Browser Notification permission + unlock audio on first interaction
  useEffect(() => {
    // Request browser notification permission
    if ('Notification' in window) {
      browserNotifPermissionRef.current = Notification.permission;
      if (Notification.permission === 'default') {
        Notification.requestPermission().then((perm) => {
          browserNotifPermissionRef.current = perm;
          console.log('[Admin] 🔔 Browser notification permission:', perm);
        });
      }
    }

    // Pkg422: admin notification audio is now fully handled by the central
    // soundPlayer (shared AudioContext + master limiter + anti-GC + auto
    // unlock-aware). No per-component AudioContext/HTML5 fallback needed.
    return () => {};
  }, []);


  const playNotificationSound = useCallback(() => {
    try {
      const nowMs = Date.now();
      if (nowMs - lastNotificationSoundAtRef.current < 900) return;
      lastNotificationSoundAtRef.current = nowMs;

      // Pkg422: 3-tone admin notification chime (A5 → D6 → E6) routed
      // through the shared limiter bus. The /admin-notify.wav file is
      // also queued as a defense-in-depth fallback.
      playSynthSequence([
        { freq: 880,     startOffset: 0,    duration: 0.12, gain: 0.32, type: 'sine' },
        { freq: 1174.66, startOffset: 0.1,  duration: 0.15, gain: 0.32, type: 'sine' },
        { freq: 1318.51, startOffset: 0.2,  duration: 0.2,  gain: 0.26, type: 'sine' },
      ]);
      playSoundUrl('/admin-notify.wav', { volume: 0.5, maxConcurrent: 1 });
      console.log('[Admin] 🔔 Notification sound played');
    } catch (e) {
      console.log('[Admin] Could not play notification sound:', e);
    }
  }, []);


  // Keep ref in sync so realtime callbacks always get the latest function
  playNotificationSoundRef.current = playNotificationSound;

  // Browser Push Notification helper - works even when tab is minimized
  const showBrowserNotification = useCallback((title: string, body: string) => {
    try {
      if (!('Notification' in window)) return;
      if (browserNotifPermissionRef.current !== 'granted') return;
      // Only show if tab is hidden/unfocused (avoid double notifications when tab is active)
      if (document.visibilityState === 'visible') return;
      
      const notification = new Notification(title, {
        body,
        icon: '/lovable-uploads/d1c47fc4-f6f4-4ad1-bb1d-1babb0154638.png',
        tag: `admin-${Date.now()}`,
        requireInteraction: true, // Persist until admin interacts — no auto-vanish
        silent: false, // Let the browser play its default sound
      });

      // Focus tab when clicked (notification only closes on user action)
      notification.onclick = () => {
        window.focus();
        notification.close();
      };
    } catch (e) {
      console.log('[Admin] Browser notification failed:', e);
    }
  }, []);
  // ONE global subscription handles ALL admin tables.
  // Alert toasts/sounds are driven by window events (zero extra channels).
  useEffect(() => {
    if (!isAdmin) return;

    const playSoundViaRef = () => playNotificationSoundRef.current();
    const showBrowserNotifViaRef = (title: string, body: string) => showBrowserNotification(title, body);

    // Phase 1: Fetch notifications immediately
    fetchNotifications();

    // Phase 2: Fetch layout badges immediately via one compact RPC.
    const pendingCountsTimer = setTimeout(fetchPendingCountsRaw, 0);

    // ⚡ Realtime PUSH only (no timers, no polling).
    // ONE global postgres_changes subscriber for GLOBALLY_MONITORED_TABLES.
    // Pages re-render the moment Postgres pushes a change — no auto-refresh,
    // no setInterval, no visibility polling.
    startAdminGlobalRealtime();

    // Admin must not refetch on tab/app focus; live events and manual actions only.

    // ⚡ Event-based alert handler (replaces 3 separate alert channels)
    // Toast notifications & sound for INSERT events on critical tables
    const alertTableConfig: Record<string, { 
      toast: string; desc: string; path: string; 
      filter?: (payload: any) => boolean;
      customToast?: (payload: any) => void;
    }> = {
      helper_upgrade_requests: { toast: '🔼 New Helper Upgrade Request', desc: 'A helper level upgrade request has been received', path: '/admin/helper-management' },
      helper_topup_requests: { toast: '💰 New Helper Topup Request', desc: 'A new topup request is pending', path: '/admin/level5-helpers' },
      helper_message_replies: { toast: '💬 New Helper Message', desc: 'A new message from helper received', path: '/admin/finance' },
      support_tickets: { toast: '🎧 New Support Ticket', desc: 'A new support ticket from user received', path: '/admin/support-tickets' },
      helper_applications: { toast: '📝 New Helper Application', desc: 'New helper application awaiting review', path: '/admin/helper-applications' },
      agency_withdrawals: { toast: '💸 New Withdrawal Request', desc: 'A withdrawal request from agency received', path: '/admin/withdrawals' },
      agencies: { toast: '🏢 New Agency Created', desc: 'A new agency has signed up', path: '/admin/agencies' },
      host_conversion_requests: { toast: '🌟 New Host Application', desc: 'A user wants to become a host', path: '/admin/host-conversion' },
      payroll_requests: { toast: '💳 Payroll Request', desc: 'New payroll request needs processing', path: '/admin/payroll-orders' },
      user_reports: { toast: '🚨 New User Report', desc: 'A user has been reported', path: '/admin/user-reports' },
      recharge_transactions: { 
        toast: '💎 New Recharge', desc: 'A new recharge transaction recorded', path: '/admin/recharge-history',
        filter: (p: any) => p?.status === 'completed',
      },
      live_streams: { 
        toast: '📺 New Live Stream', desc: 'A streamer just went live', path: '/admin/streams',
        filter: (p: any) => p?.is_active === true,
      },
      helper_withdrawal_requests: { toast: '🏦 Helper Withdrawal', desc: 'A helper withdrawal request is pending', path: '/admin/level5-helpers' },
      helper_orders: { toast: '📦 New Helper Order', desc: 'A new helper order has been placed', path: '/admin/helper-orders' },
      live_bans: { toast: '🚫 New Live Ban', desc: 'A user has been banned from live', path: '/admin/live-bans' },
      live_face_violations: { toast: '📸 Face Violation Detected', desc: 'A face violation was detected during live', path: '/admin/face-violations' },
      host_contact_violations: { toast: '⚠️ Number / Contact Share Detected', desc: 'A host shared phone / social / contact info', path: '/admin/contact-violations' },
    };

    const pendingTables = new Set([
      'helper_upgrade_requests', 'helper_topup_requests', 'helper_applications',
      'face_verification_submissions', 'agency_withdrawals', 'helper_message_replies',
      'support_tickets', 'support_messages', 'user_reports', 'payroll_requests',
      'helper_orders', 'live_bans', 'live_face_violations', 'host_conversion_requests',
      'chat_moderation_logs', 'host_contact_violations', 'helper_withdrawal_requests', 'notifications',
      'rating_reward_claims', 'leaderboard_reward_history', 'consumption_return_history',
      'agency_earnings_transfers', 'coin_transfers', 'admin_users', 'admin_section_permissions'
    ]);

    // Synthetic broadcast events from useAdminBroadcastSync (Pkg37) carry only
    // { version, row_id } in payload — no row columns. Detect them so filter
    // checks that depend on row fields don't silently swallow the alert.
    const isSyntheticBroadcastPayload = (p: any) =>
      p && typeof p === 'object'
        && Object.keys(p).length <= 3
        && ('version' in p || 'row_id' in p)
        && !('id' in p) && !('created_at' in p);

    // Cross-source dedupe — same logical INSERT often arrives twice:
    //   (1) supabaseFetchGuard fires the moment the local admin's POST returns,
    //   (2) useAdminBroadcastSync fires ~200-500ms later from admin_broadcast.
    // Without dedupe the admin sees the same toast / hears the sound twice.
    const recentToastKeys: Record<string, number> = {};
    const TOAST_DEDUPE_MS = 2500;
    const isDuplicateToast = (key: string) => {
      const now = Date.now();
      const last = recentToastKeys[key] ?? 0;
      if (now - last < TOAST_DEDUPE_MS) return true;
      recentToastKeys[key] = now;
      const keys = Object.keys(recentToastKeys);
      if (keys.length > 64) {
        for (const k of keys) {
          if (now - recentToastKeys[k] > TOAST_DEDUPE_MS * 2) delete recentToastKeys[k];
        }
      }
      return false;
    };

    const handleUnifiedEvent = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (!detail?.table) return;
      const { table, eventType, payload } = detail;
      const synthetic = isSyntheticBroadcastPayload(payload);

      // Pending count refresh for relevant tables (fires for BOTH direct + broadcast paths)
      if (pendingTables.has(table)) {
        fetchPendingCounts();
        if (table === 'notifications') fetchNotifications();
      }

      // ✅ Only toast on actual INSERT events. Synthetic broadcast carries the
      // real `last_event` in eventType, so resolved/updated rows (ticket close,
      // withdrawal approve, etc.) never falsely fire as new alerts.
      const isInsertish = eventType === 'INSERT';
      if (!isInsertish) return;

      // ✅ Cross-source dedupe — collapse direct + broadcast duplicates.
      const dedupeId = payload?.id ?? payload?.row_id ?? '';
      if (isDuplicateToast(`${table}:${eventType}:${dedupeId}`)) return;

      // Notification INSERT — handle inline (direct path only; synthetic skipped
      // because we already call fetchNotifications above to refresh the bell).
      if (table === 'notifications' && payload && !synthetic) {
        const n = payload as AdminNotification;
        if (!currentUser?.id || n.user_id !== currentUser.id) return;

        setNotifications(prev => {
          if (prev.some(x => x.id === n.id)) return prev;
          return [n, ...prev].slice(0, 50);
        });
        if (!n.is_read) {
          setUnreadCount(prev => prev + 1);
          const resolvedPath = resolveNotificationNavPath(n);
          setNotificationCountsByPath(prev => ({
            ...prev,
            [resolvedPath]: (prev[resolvedPath] || 0) + 1,
          }));
        }
        playSoundViaRef();
        showBrowserNotifViaRef(n.title, n.message);
        toast.info(n.title, { description: n.message, duration: 5000 });
        return;
      }

      // Support messages — payload-dependent filter, skip on synthetic (broadcast)
      // but still refresh count + ping for parity.
      if (table === 'support_messages' && payload) {
        if (!synthetic) {
          if (payload.sender_type !== 'user') return;
          if (typeof payload.content === 'string' && payload.content.includes('AI Conversation Summary')) return;
        }
        playSoundViaRef();
        showBrowserNotifViaRef('💬 New Support Message', 'User sent a new message');
        fetchPendingCounts();
        toast('💬 New Support Message', {
          description: 'User sent a new message',
          action: { label: '👉 View', onClick: () => navigate('/admin/support-tickets') },
          duration: 8000,
        });
        return;
      }

      // Admin notices — fire urgent alert on direct path; on synthetic broadcast
      // we treat every notice as an alert (admin must see it instantly).
      if (table === 'admin_notices' && payload) {
        const isUrgent = synthetic
          ? true
          : (payload.priority === 'urgent' || payload.priority === 'high');
        if (isUrgent) {
          playSoundViaRef();
          showBrowserNotifViaRef(payload.title || '🚨 Admin Alert', payload.message || 'New admin notice');
          toast.error(payload.title || '🚨 Admin Alert', {
            description: (payload.message || '').slice(0, 120) || 'A new admin notice was posted',
            action: { label: '👉 View', onClick: () => navigate('/admin/notice-broadcast') },
            duration: 10000,
          });
        }
        return;
      }

      // Face verification — direct path has type; synthetic uses generic toast.
      if (table === 'face_verification_submissions' && payload) {
        const isHost = !synthetic && payload.verification_type === 'host';
        playSoundViaRef(); fetchPendingCounts();
        const title = isHost ? '👤 New Host Application' : '📸 New Face Verification';
        const desc = isHost ? 'New host application awaiting review' : 'Face verification submission received';
        showBrowserNotifViaRef(title, desc);
        toast(title, {
          description: desc,
          action: { label: '👉 View', onClick: () => navigate(isHost ? '/admin/host-applications' : '/admin/face-verification') },
          duration: 8000,
        });
        return;
      }

      // Chat moderation — direct path has violation_type; synthetic fires generic.
      if (table === 'chat_moderation_logs' && payload) {
        if (synthetic) {
          playSoundViaRef(); fetchPendingCounts();
          showBrowserNotifViaRef('⚠️ Chat Violation Detected', 'A new chat moderation event was logged');
          toast.error('⚠️ Chat Violation Detected', {
            description: 'A new chat moderation event was logged',
            action: { label: '👉 View', onClick: () => navigate('/admin/contact-violations') },
            duration: 10000,
          });
        } else if (payload.violation_type && payload.violation_type !== 'user_report') {
          playSoundViaRef(); fetchPendingCounts();
          showBrowserNotifViaRef('⚠️ Chat Violation Detected', `Content: ${payload.detected_content || 'Unknown'}`);
          const typeLabels: Record<string, string> = {
            phone_number: '📱 Phone Number', digit_sharing: '🔢 Digit Sharing',
            whatsapp: '💬 WhatsApp', imo: '📞 IMO', facebook: '📘 Facebook',
            messenger: '💬 Messenger', instagram: '📸 Instagram', tiktok: '🎵 TikTok',
            telegram: '✈️ Telegram', viber: '📲 Viber', email: '📧 Email',
            external_link: '🔗 External Link', contact_intent: '🤝 Contact Intent',
          };
          const label = typeLabels[payload.violation_type] || `⚠️ ${payload.violation_type}`;
          toast.error(`${label} Detected!`, {
            description: `Content: ${payload.detected_content || 'Unknown'} | Action: ${payload.action_taken || 'detected'}`,
            action: { label: '👉 View', onClick: () => navigate('/admin/contact-violations') },
            duration: 10000,
          });
        }
        return;
      }

      // Admin notifications table — DB triggers insert one row here per domain
      // event (new face verification, host app, support ticket, withdrawal, etc.).
      // To prevent duplicate toasts (the domain table itself already fires a
      // proper context-aware toast above/below), we ONLY toast here for types
      // that have NO domain-table handler. Sound + pending count refresh always
      // run so the bell badge updates instantly.
      if (table === 'admin_notifications') {
        playSoundViaRef();
        fetchPendingCounts();

        // Types whose source table already fires its own toast — skip the
        // shadow toast from admin_notifications so the admin sees ONE alert
        // per real event, not 2-3-4.
        const SHADOW_SUPPRESSED_TYPES = new Set([
          'face_verification',
          'host_application',
          'helper_application',
          'helper_topup',
          'helper_upgrade',
          'support_ticket',
          'new_agency',
          'withdrawal',
        ]);

        const rowId = payload?.row_id || payload?.id;
        if (rowId) {
          adminSupabase
            .from('admin_notifications')
            .select('title, message, type, data')
            .eq('id', rowId)
            .maybeSingle()
            .then(({ data }) => {
              const t = String(data?.type || '').toLowerCase();
              if (SHADOW_SUPPRESSED_TYPES.has(t)) return; // domain toast already fired
              const title = data?.title || '🔔 New Admin Alert';
              const message = data?.message || 'A new event needs your attention';
              showBrowserNotifViaRef(title, message);
              toast(title, {
                description: message,
                action: {
                  label: '👉 View',
                  onClick: () => {
                    if (t === 'face_verification') navigate('/admin/face-verification');
                    else if (t === 'host_application') navigate('/admin/host-applications');
                    else navigate('/admin/notifications');
                  },
                },
                duration: 8000,
              });
            });
        }
        // No rowId → silent (sound + count already fired); avoids generic
        // "🔔 New Admin Alert" duplicates with no context.
        return;
      }


      // Standard alert toasts

      const config = alertTableConfig[table];
      if (config) {
        // Filter only runs on direct-path payload — synthetic broadcast always fires
        // (we cannot inspect row fields, and the admin must not miss alerts).
        if (!synthetic && config.filter && !config.filter(payload)) return;
        playSoundViaRef(); fetchPendingCounts();
        showBrowserNotifViaRef(config.toast, config.desc);
        if (config.customToast && !synthetic) {
          config.customToast(payload);
        } else {
          toast(config.toast, {
            description: config.desc,
            action: { label: '👉 View', onClick: () => navigate(config.path) },
            duration: 8000,
          });
        }
      }
    };

    window.addEventListener(ADMIN_REALTIME_EVENT, handleUnifiedEvent);

    // ✅ No auto-refresh interval — purely realtime-driven via unified events above

    return () => {
      clearTimeout(pendingCountsTimer);
      window.removeEventListener(ADMIN_REALTIME_EVENT, handleUnifiedEvent);
      stopAdminGlobalRealtime();
    };
  }, [isAdmin, currentUser?.id]);

  // ============= INSTANT ACCESS REVOCATION =============
  // When admin_users record is deactivated/deleted, immediately kick to login
  useEffect(() => {
    if (!isAdmin || !currentUser?.id) return;

    const handleAccessRevocation = (e: Event) => {
      const detail = (e as CustomEvent<AdminTableUpdateEvent>).detail;
      if (detail?.table !== 'admin_users') return;
      
      // On UPDATE: check if this admin was deactivated
      if (detail.eventType === 'UPDATE' && detail.payload) {
        const updated = detail.payload;
        // Check if it's the current admin user being deactivated
        if (updated.user_id === currentUser.id && updated.is_active === false) {
          console.warn('[Admin] ⛔ Access revoked — redirecting to login');
          revokeAdminAccess();
          toast.error('Access revoked', { description: 'Your admin access has been revoked by the Owner.' });
          setTimeout(() => { window.location.href = '/admin/login'; }, 1500);
        }
      }
      
      // On DELETE: if any admin_users row deleted, re-validate
      if (detail.eventType === 'DELETE') {
        // Re-check access after a short delay
        setTimeout(async () => {
          try {
            const { data } = await adminSupabase
              .from('admin_users')
              .select('id, is_active')
              .eq('user_id', currentUser.id)
              .eq('is_active', true)
              .maybeSingle();
            
            if (!data) {
              console.warn('[Admin] ⛔ Admin record removed — redirecting to login');
              revokeAdminAccess();
              toast.error('Access removed', { description: 'Your admin account has been removed.' });
              setTimeout(() => { window.location.href = '/admin/login'; }, 1500);
            }
          } catch {}
        }, 500);
      }
    };

    window.addEventListener(ADMIN_REALTIME_EVENT, handleAccessRevocation);
    return () => window.removeEventListener(ADMIN_REALTIME_EVENT, handleAccessRevocation);
  }, [isAdmin, currentUser?.id]);

  const getNotificationIcon = (type: string) => {
    switch (type) {
      case 'host_application': 
      case 'host_approved':
      case 'host_rejected':
        return <UserPlus className="w-4 h-4 text-blue-500" />;
      case 'withdrawal':
      case 'withdrawal_approved':
      case 'withdrawal_rejected':
      case 'agency_withdrawal':
        return <DollarSign className="w-4 h-4 text-green-500" />;
      case 'report':
      case 'violation':
        return <AlertCircle className="w-4 h-4 text-red-500" />;
      case 'verification':
      case 'helper_application':
      case 'helper_approved':
      case 'helper_rejected':
        return <Shield className="w-4 h-4 text-purple-500" />;
      case 'topup_request':
      case 'topup_approved':
      case 'topup_rejected':
      case 'coin_purchase_helper':
      case 'helper_topup_request':
        return <Coins className="w-4 h-4 text-yellow-500" />;
      case 'level_upgrade_approved':
      case 'level_upgrade_rejected':
      case 'helper_upgrade_request':
        return <Crown className="w-4 h-4 text-amber-500" />;
      case 'agency_verification':
      case 'agency_created':
      case 'agency_joined':
      case 'agency_host_added':
        return <Building2 className="w-4 h-4 text-indigo-500" />;
      case 'live_started':
        return <Camera className="w-4 h-4 text-red-500" />;
      case 'party_invite':
      case 'room_joined':
        return <PartyPopper className="w-4 h-4 text-pink-500" />;
      default: 
        return <Bell className="w-4 h-4 text-slate-500" />;
    }
  };

  // ⌨️ Keyboard shortcut: Ctrl+K / Cmd+K to focus sidebar search
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        if (!isSidebarOpen) setIsSidebarOpen(true);
        setTimeout(() => sidebarSearchRef.current?.focus(), 100);
      }
      // Escape to clear search
      if (e.key === 'Escape' && searchQuery) {
        setSearchQuery('');
        sidebarSearchRef.current?.blur();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isSidebarOpen, searchQuery]);

  // Admin table scroll bridge: nested horizontal table wrappers were trapping
  // vertical wheel/touch gestures. Forward vertical gestures to the one admin
  // content scroller unless a real inner vertical scroller can still move.
  useEffect(() => {
    const root = adminScrollRootRef.current;
    if (!root) return;

    const isDesktopInternalScroll = () => window.matchMedia('(min-width: 1024px)').matches;

    const isEditableTarget = (target: EventTarget | null) => {
      const el = target instanceof Element ? target : null;
      return Boolean(el?.closest('input, textarea, select, [contenteditable="true"], [role="textbox"], [data-admin-allow-inner-scroll="true"]'));
    };

    const canAncestorScrollVertically = (target: EventTarget | null, deltaY: number) => {
      let el = target instanceof Element ? target : null;
      while (el && el !== root) {
        const style = window.getComputedStyle(el);
        const canScroll = /(auto|scroll)/.test(style.overflowY) && el.scrollHeight > el.clientHeight + 1;
        if (canScroll) {
          const down = deltaY > 0;
          if ((down && el.scrollTop + el.clientHeight < el.scrollHeight - 1) || (!down && el.scrollTop > 0)) {
            return true;
          }
        }
        el = el.parentElement;
      }
      return false;
    };

    const shouldBridge = (target: EventTarget | null) => {
      const el = target instanceof Element ? target : null;
      return Boolean(el?.closest('table, [role="table"], [class*="overflow-x-auto"], [class*="overflow-auto"], [data-radix-scroll-area-viewport]'));
    };

    const onWheel = (event: WheelEvent) => {
      if (!isDesktopInternalScroll()) return;
      if (isEditableTarget(event.target) || Math.abs(event.deltaY) <= Math.abs(event.deltaX) || !shouldBridge(event.target)) return;
      if (canAncestorScrollVertically(event.target, event.deltaY)) return;
      root.scrollTop += event.deltaY;
      event.preventDefault();
    };

    const onTouchStart = (event: TouchEvent) => {
      if (!isDesktopInternalScroll()) {
        adminTouchStartRef.current = null;
        return;
      }
      const touch = event.touches[0];
      adminTouchStartRef.current = touch ? { x: touch.clientX, y: touch.clientY } : null;
    };

    const onTouchMove = (event: TouchEvent) => {
      if (!isDesktopInternalScroll()) return;
      const start = adminTouchStartRef.current;
      const touch = event.touches[0];
      if (!start || !touch || isEditableTarget(event.target) || !shouldBridge(event.target)) return;
      const dx = touch.clientX - start.x;
      const dy = touch.clientY - start.y;
      if (Math.abs(dy) <= Math.abs(dx)) return;
      if (canAncestorScrollVertically(event.target, -dy)) return;
      root.scrollTop += -dy;
      adminTouchStartRef.current = { x: touch.clientX, y: touch.clientY };
      event.preventDefault();
    };

    root.addEventListener('wheel', onWheel, { passive: false, capture: true });
    root.addEventListener('touchstart', onTouchStart, { passive: true, capture: true });
    root.addEventListener('touchmove', onTouchMove, { passive: false, capture: true });

    return () => {
      root.removeEventListener('wheel', onWheel, { capture: true } as AddEventListenerOptions);
      root.removeEventListener('touchstart', onTouchStart, { capture: true } as AddEventListenerOptions);
      root.removeEventListener('touchmove', onTouchMove, { capture: true } as AddEventListenerOptions);
    };
  }, []);

  // Close transient UI on route change + force-disable secure mode in admin
  useEffect(() => {
    setIsMobileSidebarOpen(false);
    setShowNotifications(false);

    let retryTimer: number | undefined;

    const enforceAdminScreenAccess = async () => {
      await ScreenSecuritySDK.disableSecureMode();
      retryTimer = window.setTimeout(() => {
        void ScreenSecuritySDK.disableSecureMode();
      }, 120);
    };

    void enforceAdminScreenAccess();

    return () => {
      if (retryTimer) window.clearTimeout(retryTimer);
    };
  }, [location.pathname]);

  // ────────────────────────────────────────────────────────────────────────────
  // Sidebar scroll persistence + auto-scroll active item into view
  // (Owner mandate 2026-06-29): clicking a sidebar item or refreshing the page
  // must NEVER reset the sidebar back to the top — the active item should stay
  // visible and the admin should never have to hunt for it again.
  // ────────────────────────────────────────────────────────────────────────────
  const SIDEBAR_SCROLL_STORAGE_KEY = 'admin:sidebar-scroll-top:v1';

  const getSidebarViewport = useCallback((): HTMLElement | null => {
    const nav = sidebarNavRef.current;
    if (!nav) return null;
    return nav.closest('[data-radix-scroll-area-viewport]') as HTMLElement | null;
  }, []);

  // Restore sidebar scroll position on first mount (survives full page refresh)
  useEffect(() => {
    if (typeof window === 'undefined') return;
    let restored = false;
    const tryRestore = () => {
      if (restored) return;
      const viewport = getSidebarViewport();
      if (!viewport) return;
      const raw = sessionStorage.getItem(SIDEBAR_SCROLL_STORAGE_KEY);
      const savedTop = raw ? Number(raw) : NaN;
      if (Number.isFinite(savedTop) && savedTop > 0) {
        viewport.scrollTop = savedTop;
      }
      restored = true;
    };
    // Two-pass: immediate + next frame, because Radix viewport mounts async
    tryRestore();
    const raf = window.requestAnimationFrame(tryRestore);
    return () => window.cancelAnimationFrame(raf);
  }, [getSidebarViewport]);

  // Persist sidebar scroll position whenever the admin scrolls the menu
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const viewport = getSidebarViewport();
    if (!viewport) return;
    let saveTimer: number | undefined;
    const onScroll = () => {
      if (saveTimer) window.clearTimeout(saveTimer);
      saveTimer = window.setTimeout(() => {
        try { sessionStorage.setItem(SIDEBAR_SCROLL_STORAGE_KEY, String(viewport.scrollTop)); } catch { /* quota */ }
      }, 120);
    };
    viewport.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      viewport.removeEventListener('scroll', onScroll);
      if (saveTimer) window.clearTimeout(saveTimer);
    };
  }, [getSidebarViewport, location.pathname]);

  // Auto-scroll active sidebar item into view (only when it's actually off-screen)
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const raf = window.requestAnimationFrame(() => {
      const viewport = getSidebarViewport();
      if (!viewport) return;
      const active = viewport.querySelector<HTMLElement>('[data-admin-nav-active="true"]');
      if (!active) return;
      const vpRect = viewport.getBoundingClientRect();
      const itRect = active.getBoundingClientRect();
      const isVisible = itRect.top >= vpRect.top - 4 && itRect.bottom <= vpRect.bottom + 4;
      if (isVisible) return;
      // Compute target scrollTop that centers the active item within the viewport
      const offsetWithinViewport = active.offsetTop - viewport.offsetTop;
      const target = Math.max(0, offsetWithinViewport - viewport.clientHeight / 2 + active.clientHeight / 2);
      viewport.scrollTo({ top: target, behavior: 'smooth' });
      try { sessionStorage.setItem(SIDEBAR_SCROLL_STORAGE_KEY, String(Math.round(target))); } catch { /* quota */ }
    });
    return () => window.cancelAnimationFrame(raf);
  }, [location.pathname, getSidebarViewport, expandedGroups]);


  // Zero-refresh admin UX: route changes handled by useAdminRealtime bootstrap refresh
  // No wildcard dispatch needed — each page's useAdminRealtime does its own initial fetch
  useEffect(() => {
    void checkAdminAccess();

    const handler = () => {
      void checkAdminAccess();
    };

    if (typeof window !== 'undefined') {
      window.addEventListener('storage', handler);
      window.addEventListener('admin-session-change', handler);
    }

    return () => {
      if (typeof window !== 'undefined') {
        window.removeEventListener('storage', handler);
        window.removeEventListener('admin-session-change', handler);
      }
    };
  }, []);

  const checkAdminAccess = async () => {
    try {
      const adminSession = getAdminSession();
      const hasFlagAccess = hasAdminAccessFlag();

      if (!adminSession) {
        if (hasFlagAccess) {
          console.warn('[AdminLayout] Admin flag exists but dedicated admin session is missing');
        }
        setCurrentUser(null);
        setIsAdmin(false);
        return;
      }

      let { data: verifiedAdminId, error: verifyError } = await adminSupabase.rpc('current_admin_id_from_header' as any);

      // Self-heal: legacy/null device_fingerprint on admin_sessions row blocks
      // current_admin_id_from_header. Re-run device-access RPC (owner = auto-approve;
      // approved sub-admin = re-link) to backfill session.device_fingerprint, then retry.
      if ((verifyError || !verifiedAdminId) && adminSession.device_fingerprint) {
        try {
          await adminSupabase.rpc('admin_request_device_access' as any, {
            _admin_id: adminSession.admin_id,
            _device_fingerprint: adminSession.device_fingerprint,
            _device_name: adminSession.display_name || null,
            _device_info: { ua: typeof navigator !== 'undefined' ? navigator.userAgent : null },
            _ip_address: null,
            _user_agent: typeof navigator !== 'undefined' ? navigator.userAgent : null,
          });
          const retry = await adminSupabase.rpc('current_admin_id_from_header' as any);
          verifiedAdminId = retry.data as any;
          verifyError = retry.error as any;
        } catch (healErr) {
          console.warn('[AdminLayout] device-access self-heal failed', healErr);
        }
      }

      if (verifyError || !verifiedAdminId || String(verifiedAdminId) !== adminSession.admin_id) {
        console.warn('[AdminLayout] Server verification transient/mismatch — preserving local admin session', verifyError);
        setCurrentUser({
          id: adminSession.admin_id,
          admin_id: adminSession.admin_id,
          email: adminSession.email,
          display_name: adminSession.display_name,
          role: adminSession.role,
          accepted_at: null,
        });
        setIsAdmin(true);
        return;
      }

      const queryPromise = adminSupabase
        .from('admin_users')
        .select('id, user_id, email, display_name, role, is_active, accepted_at')
        .eq('id', String(verifiedAdminId))
        .eq('is_active', true)
        .maybeSingle();
      const timeoutPromise = new Promise<{ data: null; error: Error }>((resolve) =>
        setTimeout(() => resolve({ data: null, error: new Error('admin_users lookup timeout') }), 6000)
      );
      const { data: adminRecord, error } = await Promise.race([queryPromise, timeoutPromise]) as any;

      if (error || !adminRecord) {
        console.warn('[AdminLayout] Admin record lookup failed — preserving local admin session', error);
        setCurrentUser({
          id: adminSession.admin_id,
          admin_id: adminSession.admin_id,
          email: adminSession.email,
          display_name: adminSession.display_name,
          role: adminSession.role,
          accepted_at: null,
        });
        setIsAdmin(true);
        return;
      }

      setCurrentUser({
        id: adminRecord.user_id ?? adminRecord.id,
        admin_id: adminRecord.id,
        email: adminRecord.email,
        display_name: adminRecord.display_name,
        role: adminRecord.role,
        accepted_at: adminRecord.accepted_at,
      });
      setIsAdmin(true);
    } catch (error) {
      console.error('Admin check error:', error);
      recordAdminError({ kind: "rpc", label: "AdminLayout.hasFlagAccess", message: formatAdminError(error) });
      // Don't blank the panel on a transient error if a session exists —
      // keep optimistic access. Only clear if there's truly no session.
      if (!getAdminSession()) {
        setCurrentUser(null);
        setIsAdmin(false);
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleLogout = async () => {
    // Clear admin session (independent from user app)
    const { clearAdminSession } = await import('@/utils/adminSession');
    clearAdminSession();
    revokeAdminAccess();

    setIsAdmin(false);
    setCurrentUser(null);

    if (typeof window !== 'undefined') {
      window.dispatchEvent(new Event('admin-session-change'));
    }

    // Force navigate - full page reload to clear React state
    window.location.href = '/admin/login';
  };

  const toggleGroup = (title: string) => {
    setExpandedGroups(prev => 
      prev.includes(title) 
        ? prev.filter(t => t !== title)
        : [...prev, title]
    );
  };

  // Filter nav groups based on admin permissions and combine badge counts
  const filteredNavGroups = navGroups.map(group => {
    const query = searchQuery.toLowerCase().trim();
    // Check if the group title matches the search
    const groupTitleMatches = query && (
      group.title.toLowerCase().includes(query) ||
      group.title.includes(searchQuery)
    );

    // Filter items based on permissions
    const accessibleItems = group.items.filter(item => {
      // Filter by search query - match English label, Bengali label, path, or group title match
      if (query) {
        const matchesSearch = 
          item.label.toLowerCase().includes(query) || 
          item.path.toLowerCase().includes(query) ||
          groupTitleMatches;
        if (!matchesSearch) {
          return false;
        }
      }
      
      // Owner-only items
      if (item.ownerOnly && !isOwner) {
        return false;
      }
      
      // If owner, show everything
      if (isOwner) {
        return true;
      }
      
      // For sub-admins: ONLY show items that have a hubKey AND they have access to that hub
      // Items without hubKey (Dashboard, Logs, etc.) are hidden from sub-admins
      if (item.hubKey) {
        return hasHubAccess(item.hubKey);
      }
      
      // Sub-admins cannot see items without a hubKey (Dashboard, Reports, Logs, etc.)
      return false;
    });

    return {
      ...group,
      items: accessibleItems.map(item => {
        // Combine effective pending counts (minus seen) with unread notification counts
        const normalizedItemPath = normalizeAdminPath(item.path);
        const isDismissed = dismissedPaths.has(normalizedItemPath);
        const pendingCount = isDismissed ? 0 : Number(pendingCounts[normalizedItemPath] ?? pendingCounts[item.path] ?? 0);
        const notificationCount = Number(notificationCountsByPath[normalizedItemPath] ?? 0);
        const totalBadge = pendingCount + notificationCount;

        return {
          ...item,
          badge: totalBadge > 0 ? totalBadge : 0
        };
      })
    };
  }).filter(group => group.items.length > 0);

  // Premium centered loader instead of fake skeleton — feels alive, not janky
  if (isLoading) {
    return (
      <div className="min-h-screen w-full flex items-center justify-center bg-slate-50">
        <PremiumSpinner size="xl" label="Preparing admin console…" labelClassName="text-slate-400" />
      </div>
    );
  }

  if (!isAdmin) {
    return <Navigate to="/admin/login" replace />;
  }

  // Section color accents for nav groups
  const groupAccents: Record<string, { border: string; glow: string; text: string; dot: string; iconActive: string }> = {
    "Overview": { border: "border-violet-500/20", glow: "shadow-violet-500/10", text: "text-violet-400", dot: "bg-violet-500", iconActive: "from-violet-500 via-purple-500 to-fuchsia-600" },
    "👥 User System": { border: "border-sky-500/20", glow: "shadow-sky-500/10", text: "text-sky-400", dot: "bg-sky-500", iconActive: "from-sky-500 via-blue-500 to-cyan-600" },
    "🏢 Agency System": { border: "border-indigo-500/20", glow: "shadow-indigo-500/10", text: "text-indigo-400", dot: "bg-indigo-500", iconActive: "from-indigo-500 via-blue-500 to-indigo-600" },
    "👑 Level & VIP": { border: "border-amber-500/20", glow: "shadow-amber-500/10", text: "text-amber-400", dot: "bg-amber-500", iconActive: "from-amber-500 via-yellow-500 to-amber-600" },
    "🎨 Visual Assets": { border: "border-pink-500/20", glow: "shadow-pink-500/10", text: "text-pink-400", dot: "bg-pink-500", iconActive: "from-pink-500 via-rose-500 to-fuchsia-600" },
    "💰 Diamond & Finance": { border: "border-emerald-500/20", glow: "shadow-emerald-500/10", text: "text-emerald-400", dot: "bg-emerald-500", iconActive: "from-emerald-500 via-green-500 to-teal-600" },
    "🤝 Helpers": { border: "border-orange-500/20", glow: "shadow-orange-500/10", text: "text-orange-400", dot: "bg-orange-500", iconActive: "from-orange-500 via-amber-500 to-orange-600" },
    "🎮 Game System": { border: "border-red-500/20", glow: "shadow-red-500/10", text: "text-red-400", dot: "bg-red-500", iconActive: "from-red-500 via-rose-500 to-red-600" },
    "📺 Content": { border: "border-cyan-500/20", glow: "shadow-cyan-500/10", text: "text-cyan-400", dot: "bg-cyan-500", iconActive: "from-cyan-500 via-teal-500 to-cyan-600" },
    "🎉 Party": { border: "border-fuchsia-500/20", glow: "shadow-fuchsia-500/10", text: "text-fuchsia-400", dot: "bg-fuchsia-500", iconActive: "from-fuchsia-500 via-pink-500 to-fuchsia-600" },
    "📞 Calling": { border: "border-blue-500/20", glow: "shadow-blue-500/10", text: "text-blue-400", dot: "bg-blue-500", iconActive: "from-blue-500 via-sky-500 to-blue-600" },
    "🎧 Support": { border: "border-teal-500/20", glow: "shadow-teal-500/10", text: "text-teal-400", dot: "bg-teal-500", iconActive: "from-teal-500 via-emerald-500 to-teal-600" },
    "📢 Notifications": { border: "border-yellow-500/20", glow: "shadow-yellow-500/10", text: "text-yellow-400", dot: "bg-yellow-500", iconActive: "from-yellow-500 via-amber-500 to-yellow-600" },
    "🐛 Debug & Logs": { border: "border-slate-500/20", glow: "shadow-slate-500/10", text: "text-slate-400", dot: "bg-slate-500", iconActive: "from-slate-500 via-gray-500 to-slate-600" },
    "⚙️ Settings": { border: "border-zinc-500/20", glow: "shadow-zinc-500/10", text: "text-zinc-400", dot: "bg-zinc-500", iconActive: "from-zinc-500 via-neutral-500 to-zinc-600" },
  };

  const getGroupAccent = (title: string) => groupAccents[title] || groupAccents["Overview"];

  return (
    <div className="admin-shell min-h-screen lg:min-h-0 w-full max-w-full bg-slate-50">
      {/* Mobile Sidebar Overlay */}
      <AnimatePresence mode="wait">
        {isMobileSidebarOpen && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="fixed inset-0 bg-black/70 z-40 lg:hidden backdrop-blur-sm"
            onClick={() => setIsMobileSidebarOpen(false)}
          />
        )}
      </AnimatePresence>

      {/* ━━━ SIDEBAR (Cloud White + 3D) ━━━ */}
      <aside className={cn(
        "fixed left-0 top-0 h-full z-50 transition-all duration-300 ease-in-out flex flex-col",
        "bg-white border-r border-slate-200",
        "shadow-[6px_0_24px_-12px_rgba(15,23,42,0.12),2px_0_8px_-4px_rgba(15,23,42,0.06)]",
        isMobileSidebarOpen ? "w-[min(84vw,320px)]" : (isSidebarOpen ? "w-72" : "w-20"),
        isMobileSidebarOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0"
      )}>
        {/* Soft accent wash */}
        <div className="absolute inset-0 bg-gradient-to-b from-blue-50/40 via-transparent to-slate-50/40 pointer-events-none" />
        <div className="absolute right-0 top-0 bottom-0 w-px bg-gradient-to-b from-blue-200/60 via-slate-200/40 to-transparent pointer-events-none" />

        {/* Logo Header */}
        <div className="relative p-4 border-b border-slate-200/80 bg-gradient-to-b from-white to-slate-50/60">
          <div className="absolute top-0 left-1/2 -translate-x-1/2 w-40 h-20 bg-blue-500/[0.06] blur-3xl pointer-events-none" />

          <div className="relative flex items-center gap-3">
            <div className="relative group">
              <div className="absolute inset-0 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-xl blur-lg opacity-30 group-hover:opacity-50 transition-opacity" />
              <div className="relative w-11 h-11 rounded-xl bg-gradient-to-br from-blue-500 via-blue-600 to-indigo-600 flex items-center justify-center shadow-[0_8px_20px_-6px_rgba(59,130,246,0.5),inset_0_1px_0_rgba(255,255,255,0.25)] ring-1 ring-blue-400/30">
                <Shield className="w-5 h-5 text-slate-900 drop-shadow" />
              </div>
              <div className="absolute -bottom-0.5 -right-0.5 w-3 h-3 bg-emerald-500 rounded-full border-2 border-white shadow-lg shadow-emerald-500/40 animate-pulse" />
            </div>
            {isSidebarOpen && (
              <motion.div initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} className="flex-1">
                <h1 className="text-slate-900 font-extrabold text-base tracking-tight" style={{ fontFamily: "'Space Grotesk', system-ui, sans-serif" }}>MeriLive</h1>
                <p className="text-[9px] text-blue-600/80 font-bold uppercase tracking-[0.25em]">Admin Console</p>
              </motion.div>
            )}
            <Button variant="ghost" size="icon" className="lg:hidden text-slate-500 hover:text-slate-900 hover:bg-slate-100" onClick={() => setIsMobileSidebarOpen(false)}>
              <X className="w-5 h-5" />
            </Button>
          </div>

          {/* Search */}
          {isSidebarOpen && (
            <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} className="mt-4 relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <Input
                ref={sidebarSearchRef}
                placeholder="Search... (Ctrl+K)"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9 pr-16 bg-white border-slate-200 text-slate-900 text-sm placeholder:text-slate-400 focus:bg-white focus:border-blue-400 focus:ring-2 focus:ring-blue-500/15 rounded-xl h-9 shadow-[inset_0_1px_2px_rgba(15,23,42,0.04)]"
              />
              {!searchQuery && (
                <kbd className="absolute right-3 top-1/2 -translate-y-1/2 hidden sm:inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded border border-slate-200 bg-slate-50 text-[10px] text-slate-500 font-mono">⌘K</kbd>
              )}
              {searchQuery && (
                <button onClick={() => setSearchQuery('')} className="absolute right-3 top-1/2 -translate-y-1/2 w-5 h-5 rounded-full bg-slate-200 hover:bg-slate-300 flex items-center justify-center transition-colors">
                  <X className="w-3 h-3 text-slate-700" />
                </button>
              )}
            </motion.div>
          )}

          {/* Audit ID search */}
          {isSidebarOpen && (
            <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} className="mt-2">
              <AuditIdSearch compact />
            </motion.div>
          )}
        </div>


        {/* Navigation Groups */}
        <ScrollArea className="flex-1 min-h-0 [&>div>div]:!block">
          <nav ref={sidebarNavRef} className="p-2 pb-6">
            {filteredNavGroups.map((group) => {
              const isExpanded = expandedGroups.includes(group.title);
              const accent = getGroupAccent(group.title);
              
              return (
                <div key={group.title} className="mb-1">
                  {isSidebarOpen && (
                    <button
                      onClick={() => toggleGroup(group.title)}
                      className="w-full flex items-center justify-between px-3 py-2 text-[10px] font-bold uppercase tracking-[0.15em] hover:bg-slate-50 rounded-lg transition-colors group/header"
                    >
                      <span className="flex items-center gap-2 text-slate-500">
                        <span className={cn("w-1.5 h-1.5 rounded-full shadow-sm", accent.dot)} />
                        {group.title}
                      </span>
                      <ChevronDown className={cn(
                        "w-3 h-3 transition-transform duration-200 text-slate-400",
                        isExpanded ? "rotate-0" : "-rotate-90"
                      )} />
                    </button>
                  )}

                  <AnimatePresence initial={false}>
                    {(isExpanded || !isSidebarOpen) && (
                      <motion.div
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: "auto" }}
                        exit={{ opacity: 0, height: 0 }}
                        transition={{ duration: 0.15 }}
                        className="space-y-0.5 overflow-hidden"
                      >
                        {group.items.map((item) => {
                          const isActive = location.pathname === item.path || (item.path !== "/admin" && location.pathname.startsWith(item.path));
                          const Icon = item.icon;
                          const badgeCount = getEffectivePendingCount(item.path) + Number(notificationCountsByPath[normalizeAdminPath(item.path)] || 0);

                          return (
                            <Link
                              key={item.path}
                              to={item.path}
                              data-admin-nav-item={item.path}
                              data-admin-nav-active={isActive ? 'true' : 'false'}
                              onMouseEnter={() => prefetchAdminRoute(item.path)}
                              onFocus={() => prefetchAdminRoute(item.path)}
                              onTouchStart={() => prefetchAdminRoute(item.path)}
                              onClick={() => {
                                setIsMobileSidebarOpen(false);
                              }}


                              className={cn(
                                "flex items-center gap-2.5 px-3 py-2 rounded-xl transition-all duration-200 group/item relative overflow-hidden",
                                isActive
                                  ? "bg-gradient-to-r from-blue-50 via-blue-50/60 to-transparent text-blue-700 border border-blue-200/70 shadow-[0_1px_2px_rgba(15,23,42,0.04),0_2px_8px_-4px_rgba(59,130,246,0.25)]"
                                  : "text-slate-600 hover:text-blue-700 hover:bg-blue-50 border border-transparent hover:border-blue-200/60"
                              )}
                            >
                              {isActive && (
                                <motion.div
                                  layoutId="activeNav"
                                  className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-6 rounded-r-full bg-gradient-to-b from-blue-500 to-indigo-600"
                                  style={{ boxShadow: '0 0 12px rgba(59,130,246,0.45)' }}
                                />
                              )}

                              <div className={cn(
                                "w-7 h-7 rounded-lg flex items-center justify-center transition-all flex-shrink-0 relative",
                                isActive
                                  ? "bg-gradient-to-br from-blue-500 to-indigo-600 shadow-[0_4px_10px_-2px_rgba(59,130,246,0.5),inset_0_1px_0_rgba(255,255,255,0.25)] ring-1 ring-blue-400/40"
                                  : "bg-slate-100 group-hover/item:bg-white group-hover/item:shadow-[0_1px_2px_rgba(15,23,42,0.06),0_2px_6px_-2px_rgba(15,23,42,0.08)] group-hover/item:ring-1 group-hover/item:ring-slate-200"
                              )}>
                                <Icon className={cn("w-3.5 h-3.5", isActive ? "text-slate-900" : "text-slate-500 group-hover/item:text-blue-600")} />
                                {!isSidebarOpen && badgeCount > 0 && (
                                  <motion.span initial={{ scale: 0 }} animate={{ scale: 1 }} className="absolute -top-1 -right-1 min-w-4 h-4 flex items-center justify-center px-0.5 bg-gradient-to-r from-rose-500 to-red-600 rounded-full text-[8px] text-white font-bold ring-2 ring-white shadow">
                                    {formatBadgeCount(badgeCount)}
                                  </motion.span>
                                )}
                              </div>

                              {isSidebarOpen && (
                                <span className={cn("text-[13px] font-semibold truncate flex-1", isActive && "text-blue-700")}>{item.label}</span>
                              )}

                              {isSidebarOpen && badgeCount > 0 && (
                                <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }}>
                                  <Badge className="ml-auto border-0 text-[10px] px-1.5 shadow-[0_2px_6px_-2px_rgba(244,63,94,0.5)] font-bold bg-gradient-to-r from-rose-500 to-red-600 text-white">
                                    {formatBadgeCount(badgeCount)}
                                  </Badge>
                                </motion.div>
                              )}
                            </Link>
                          );
                        })}
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              );
            })}
          </nav>
        </ScrollArea>

        {/* User Section */}
        <div className="relative p-3 border-t border-slate-200 bg-gradient-to-t from-slate-50 to-white shrink-0">
          <div className="absolute inset-x-3 top-0 h-px bg-gradient-to-r from-transparent via-blue-300/40 to-transparent" />

          <div className={cn(
            "flex items-center gap-3 p-2.5 rounded-xl bg-white hover:bg-slate-50 transition-all duration-300 cursor-pointer border border-slate-200 hover:border-blue-300 shadow-[0_1px_2px_rgba(15,23,42,0.04),0_2px_6px_-2px_rgba(15,23,42,0.06)] hover:shadow-[0_2px_4px_rgba(15,23,42,0.06),0_8px_16px_-6px_rgba(59,130,246,0.18)]",
            !isSidebarOpen && "justify-center"
          )} onClick={() => setShowProfileMenu(true)}>
            <Avatar className="w-9 h-9 border border-blue-200 ring-2 ring-blue-500/15 shadow-md">
              <UserAvatarImage seed={(((currentUser?.profile) as any)?.id ?? ((currentUser?.profile) as any)?.user_id ?? ((currentUser?.profile) as any)?.host_id)} gender={((currentUser?.profile) as any)?.gender} src={currentUser?.profile?.avatar_url} />
              <AvatarFallback className="bg-gradient-to-br from-blue-500 via-blue-600 to-indigo-600 text-white text-xs font-bold">
                {currentUser?.profile?.display_name?.charAt(0) || "A"}
              </AvatarFallback>
            </Avatar>
            {isSidebarOpen && (
              <div className="flex-1 min-w-0">
                <p className="text-slate-900 text-sm font-bold truncate">{adminUser?.display_name || currentUser?.profile?.display_name || "Admin"}</p>
                <p className={cn("text-[9px] font-bold tracking-[0.2em] uppercase", isOwner ? "text-blue-600" : "text-slate-500")}>
                  {isOwner ? "👑 Owner" : "🛡️ Sub-Admin"}
                </p>
              </div>
            )}
          </div>
        </div>
      </aside>

      {/* ━━━ MAIN CONTENT ━━━ */}
      <div className={cn("transition-all duration-300 min-h-0 min-w-0 max-w-full flex flex-col overflow-visible lg:overflow-hidden", isSidebarOpen ? "lg:ml-72" : "lg:ml-20")}>
        
        {/* ━━━ TOP HEADER ━━━ */}
        <header className="sticky top-0 z-30 shrink-0 bg-white/95 backdrop-blur-xl border-b border-slate-200 shadow-[0_1px_2px_rgba(15,23,42,0.04),0_4px_12px_-6px_rgba(15,23,42,0.08)] safe-area-top max-w-full overflow-visible">
          <div className="flex items-center justify-between px-3 sm:px-4 lg:px-5 py-2 sm:py-2.5">
            <div className="flex items-center gap-2 sm:gap-3 min-w-0 flex-1">
              <Button
                variant="ghost" size="icon"
                className="lg:hidden text-slate-700 hover:text-blue-700 hover:bg-blue-50 hover:border-blue-200 rounded-xl h-9 w-9 sm:h-10 sm:w-10 bg-white border border-slate-200 shadow-sm flex-shrink-0 transition-colors"
                onClick={() => { setIsMobileSidebarOpen(true); setIsSidebarOpen(true); }}
              >
                <Menu className="w-4 h-4 sm:w-5 sm:h-5" />
              </Button>

              <Button variant="ghost" size="icon" className="hidden lg:flex text-slate-500 hover:text-blue-700 hover:bg-blue-50 hover:border-blue-200 border border-transparent rounded-xl h-8 w-8 flex-shrink-0 transition-colors" onClick={() => setIsSidebarOpen(!isSidebarOpen)}>
                <Menu className="w-4 h-4" />
              </Button>

              <div className="min-w-0">
                <h2 className="text-slate-900 font-bold text-sm sm:text-[15px] truncate" style={{ fontFamily: "'Space Grotesk', system-ui, sans-serif" }}>
                  {navGroups.flatMap(g => g.items).find(item => location.pathname === item.path || (item.path !== "/admin" && location.pathname.startsWith(item.path)))?.label || "Dashboard"}
                </h2>
                <p className="text-[8px] sm:text-[9px] text-blue-600/80 font-bold uppercase tracking-[0.2em] hidden sm:block">Admin Console</p>
              </div>
            </div>

            <div className="flex items-center gap-1 sm:gap-2.5 flex-shrink-0 min-w-0">
              {/* Desktop Search */}
              <div className="relative hidden lg:block">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <Input placeholder="Global search..." className="w-56 pl-10 bg-white border-slate-200 text-slate-900 placeholder:text-slate-400 focus:bg-white focus:border-blue-400 focus:ring-2 focus:ring-blue-500/15 rounded-xl h-9 text-sm shadow-[inset_0_1px_2px_rgba(15,23,42,0.04)]" />
              </div>

              {/* Realtime sync status pill */}
              <AdminRealtimeSyncIndicator />

              {/* Phone Alert Bell */}
              <AdminAlertBell />

              {/* Notifications */}
              <div className="relative" ref={notificationRef}>
                <Button
                  variant="ghost" size="icon"
                  className="relative text-slate-600 hover:text-blue-700 hover:bg-blue-50 rounded-xl h-9 w-9 sm:h-10 sm:w-10 border border-transparent hover:border-blue-200 transition-colors"
                  onClick={() => setShowNotifications(!showNotifications)}
                >
                  <Bell className="w-4 h-4 sm:w-5 sm:h-5" />
                  {totalUnreadCount > 0 && (
                    <motion.span initial={{ scale: 0 }} animate={{ scale: 1 }} className="absolute -top-0.5 -right-0.5 min-w-4 sm:min-w-5 h-4 sm:h-5 flex items-center justify-center px-0.5 sm:px-1 bg-gradient-to-r from-rose-500 to-red-600 rounded-full text-[8px] sm:text-[10px] text-white font-bold ring-2 ring-white shadow">
                      {formatBadgeCount(totalUnreadCount)}
                    </motion.span>
                  )}
                </Button>

                {/* Notification Dropdown */}
                <AnimatePresence>
                  {showNotifications && (
                    <motion.div
                      initial={{ opacity: 0, y: 10, scale: 0.95 }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      exit={{ opacity: 0, y: 10, scale: 0.95 }}
                      transition={{ duration: 0.2 }}
                      className="absolute right-0 top-full mt-2 w-[calc(100vw-16px)] sm:w-[400px] max-h-[70vh] bg-[#1a1a2e] backdrop-blur-2xl rounded-2xl shadow-2xl shadow-black/60 border border-violet-500/20 overflow-hidden z-50 flex flex-col"
                      style={{ right: window.innerWidth < 640 ? '-8px' : '0' }}
                    >
                      {/* Header */}
                      <div className="flex items-center justify-between px-4 py-3 bg-gradient-to-r from-violet-500/[0.06] to-transparent border-b border-white/[0.06]">
                        <div className="flex items-center gap-2">
                          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-violet-500 to-fuchsia-600 flex items-center justify-center shadow-lg shadow-violet-500/20">
                            <Bell className="w-4 h-4 text-slate-900" />
                          </div>
                          <span className="font-bold text-slate-900 text-sm">Notifications</span>
                          {totalUnreadCount > 0 && (
                            <Badge className="bg-violet-500/20 text-violet-300 border border-violet-500/20 text-[10px] px-1.5 py-0">
                              {formatBadgeCount(totalUnreadCount)}
                            </Badge>
                          )}
                        </div>
                        {totalUnreadCount > 0 && (
                          <button onClick={markAllAsRead} className="text-xs text-violet-400 hover:text-violet-300 font-semibold flex items-center gap-1 transition-colors">
                            <CheckCheck className="w-3.5 h-3.5" />
                            Clear all
                          </button>
                        )}
                      </div>

                      {/* List */}
                      <ScrollArea className="flex-1 overflow-auto">
                        {allBellNotifications.length === 0 ? (
                          <div className="flex flex-col items-center justify-center py-16 px-4">
                            <div className="w-16 h-16 rounded-2xl bg-white/[0.03] flex items-center justify-center mb-3 border border-white/[0.06]">
                              <Bell className="w-7 h-7 text-slate-700" />
                            </div>
                            <p className="text-slate-600 text-sm font-medium">All caught up!</p>
                            <p className="text-slate-700 text-xs mt-1">No new notifications</p>
                          </div>
                        ) : (
                          <div className="divide-y divide-white/[0.04]">
                            {allBellNotifications.map((notification) => (
                              <motion.div
                                key={notification.id}
                                initial={{ opacity: 0 }}
                                animate={{ opacity: 1 }}
                                className={cn(
                                  "flex gap-3 p-4 hover:bg-white/[0.03] cursor-pointer transition-all group/notif",
                                  !notification.is_read && !(notification.data as any)?.is_section_pending && "bg-violet-500/[0.04]"
                                )}
                                onClick={() => handleNotificationClick(notification)}
                              >
                                <div className={cn(
                                  "w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 border",
                                  !notification.is_read ? "bg-violet-500/10 border-violet-500/20" : "bg-white/[0.03] border-white/[0.06]"
                                )}>
                                  {getNotificationIcon(notification.type)}
                                </div>
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-start justify-between gap-2">
                                    <p className={cn("text-sm", !notification.is_read ? "font-bold text-slate-900" : "text-slate-400 font-medium")}>
                                      {notification.title}
                                    </p>
                                    <div className="flex items-center gap-1.5">
                                      {!notification.is_read && !(notification.data as any)?.is_section_pending && (
                                        <span className="w-2 h-2 rounded-full bg-violet-500 flex-shrink-0 shadow-lg shadow-violet-500/40" />
                                      )}
                                      <ChevronRight className="w-4 h-4 text-slate-700 opacity-0 group-hover/notif:opacity-100 transition-opacity" />
                                    </div>
                                  </div>
                                  <p className="text-xs text-slate-500 mt-0.5 line-clamp-2">{notification.message}</p>
                                  <div className="flex items-center gap-1 mt-1.5">
                                    <Clock className="w-3 h-3 text-slate-700" />
                                    <span className="text-[10px] text-slate-700">{formatDistanceToNow(new Date(notification.created_at), { addSuffix: true })}</span>
                                  </div>
                                </div>
                              </motion.div>
                            ))}
                          </div>
                        )}
                      </ScrollArea>

                      {allBellNotifications.length > 0 && (
                        <div className="border-t border-white/[0.04] p-2">
                          <Link to="/admin/logs" onClick={() => setShowNotifications(false)} className="flex items-center justify-center gap-2 py-2 text-sm text-violet-400 hover:text-violet-300 font-semibold hover:bg-white/[0.03] rounded-xl transition-colors">
                            View all <ChevronRight className="w-4 h-4" />
                          </Link>
                        </div>
                      )}
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>

              {/* Quick Stats - visible on tablet+ */}
              <div className="hidden md:flex items-center gap-2 sm:gap-3 px-3 sm:px-4 py-1.5 sm:py-2 bg-white rounded-xl border border-slate-200 shadow-[0_1px_2px_rgba(15,23,42,0.04),0_2px_6px_-2px_rgba(15,23,42,0.06)]">
                <div className="flex items-center gap-1.5 sm:gap-2">
                  <div className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse shadow-lg shadow-emerald-500/40" />
                  <span className="text-[9px] sm:text-[10px] text-slate-500 font-semibold uppercase tracking-wider">Online</span>
                  <span className="text-xs sm:text-sm font-bold text-emerald-600 tabular-nums">{onlineUsersCount}</span>
                </div>
                <div className="w-px h-4 sm:h-5 bg-slate-200" />
                <div className="flex items-center gap-1.5 sm:gap-2">
                  <Activity className="w-3 h-3 sm:w-3.5 sm:h-3.5 text-rose-500" />
                  <span className="text-[9px] sm:text-[10px] text-slate-500 font-semibold uppercase tracking-wider">Live</span>
                  <span className="text-xs sm:text-sm font-bold text-rose-600 tabular-nums">{liveStreamsCount}</span>
                </div>
              </div>

              {/* Mobile Avatar */}
              <button onClick={() => setShowProfileMenu(true)} className="lg:hidden flex-shrink-0">
                <Avatar className="w-8 h-8 sm:w-9 sm:h-9 border border-blue-200 ring-2 ring-blue-500/15 shadow-md cursor-pointer">
                  <UserAvatarImage seed={(((currentUser?.profile) as any)?.id ?? ((currentUser?.profile) as any)?.user_id ?? ((currentUser?.profile) as any)?.host_id)} gender={((currentUser?.profile) as any)?.gender} src={currentUser?.profile?.avatar_url} />
                  <AvatarFallback className="bg-gradient-to-br from-blue-500 via-blue-600 to-indigo-600 text-white text-[10px] sm:text-xs font-bold">
                    {currentUser?.profile?.display_name?.charAt(0) || "A"}
                  </AvatarFallback>
                </Avatar>
              </button>
            </div>
          </div>
        </header>

        {/* Page Content */}
        <main ref={adminScrollRootRef} data-admin-scroll-root="true" className="flex-1 min-h-0 w-full max-w-full min-w-0 overflow-y-visible lg:overflow-y-auto overflow-x-hidden p-2 sm:p-3 md:p-5 lg:p-6 admin-content admin-pro-shell overscroll-auto lg:overscroll-contain" style={{ WebkitOverflowScrolling: 'touch', paddingBottom: 'max(calc(env(safe-area-inset-bottom, 0px) + 96px), 96px)' }}>
          <Suspense fallback={
            <div className="min-h-[40vh] w-full flex items-center justify-center">
              <PremiumSpinner size="lg" labelClassName="text-slate-400" />
            </div>
          }>

            <ErrorBoundary componentName="AdminPage">
              <Outlet />
            </ErrorBoundary>
          </Suspense>
        </main>
      </div>

      <AdminProfileMenu
        isOpen={showProfileMenu}
        onClose={() => setShowProfileMenu(false)}
        onLogout={handleLogout}
        adminUser={adminUser}
        currentUser={currentUser}
        isOwner={isOwner}
      />
    </div>
  );
}
