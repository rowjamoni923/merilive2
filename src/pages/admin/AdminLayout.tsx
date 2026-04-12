import { useState, useEffect, useRef, useCallback, useMemo, Suspense, startTransition } from "react";
import { dispatchAdminTableUpdate, GLOBALLY_MONITORED_TABLES, ADMIN_REALTIME_EVENT, type AdminTableUpdateEvent } from "@/hooks/useAdminRealtime";
import { useNavigate, Outlet, Link, useLocation, Navigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import {
  LayoutDashboard,
  Users,
  Building2,
  Video,
  PartyPopper,
  Gift,
  Settings,
  Shield,
  LogOut,
  Menu,
  X,
  Bell,
  Search,
  ChevronRight,
  ChevronDown,
  Coins,
  FileText,
  MessageSquare,
  TrendingUp,
  UserCheck,
  Ban,
  Percent,
  Sparkles,
  Image,
  CreditCard,
  Moon,
  Sun,
  Wallet,
  Activity,
  ScanFace,
  Check,
  CheckCheck,
  Clock,
  AlertCircle,
  UserPlus,
  DollarSign,
  Phone,
  Crown,
  Star,
  TrendingDown,
  ArrowUpCircle,
  Gamepad2,
  Play,
  ShoppingBag,
  UserCog,
  Smartphone,
  Lock,
  Megaphone,
  ShieldAlert,
  Mail,
  Map,
  Package
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { format, formatDistanceToNow } from "date-fns";
import { AdminAlertBell } from "@/components/admin/AdminPhoneAlertsPanel";
import { AdminProfileMenu } from "@/components/admin/AdminProfileMenu";
import useAdminAccess from "@/hooks/useAdminAccess";
import { revokeAdminAccess, hasAdminAccessFlag, hasOwnerAccessFlag } from "@/utils/adminAccessStorage";
import { ScreenSecuritySDK } from "@/sdk/ScreenSecuritySDK";
import { useEnableBrowserPageInteraction } from "@/hooks/useEnableBrowserPageInteraction";

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

interface NavItem {
  label: string;
  
  icon: React.ElementType;
  path: string;
  badge?: number;
  notificationTypes?: string[]; // Types of notifications that count for this menu item
  hubKey?: string; // Hub key for permission checking
  ownerOnly?: boolean; // Only visible to owners
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

  return '/admin';
};

const navGroups: NavGroup[] = [
  {
    title: "Overview",
    items: [
      { label: "Dashboard", icon: LayoutDashboard, path: "/admin" },
      { label: "Reports & Analytics", icon: TrendingUp, path: "/admin/reports" },
    ]
  },
  {
    title: "👥 User System",
    hubKey: "user-hub",
    items: [
      { label: "User Hub", icon: Users, path: "/admin/user-hub", hubKey: "user-hub" },
      { label: "User Management", icon: UserCog, path: "/admin/user-management", hubKey: "user-hub" },
      { label: "All Users", icon: Users, path: "/admin/users", hubKey: "user-hub" },
      { label: "Host Applications", icon: UserPlus, path: "/admin/host-applications", hubKey: "user-hub" },
      { label: "Host Search", icon: Search, path: "/admin/host-search", hubKey: "user-hub" },
      { label: "All Hosts", icon: UserCheck, path: "/admin/hosts", hubKey: "user-hub" },
      { label: "Face Verification", icon: ScanFace, path: "/admin/face-verification", hubKey: "user-hub" },
      { label: "Blocked Users", icon: Ban, path: "/admin/blocked", hubKey: "user-hub" },
      { label: "Live Bans", icon: ShieldAlert, path: "/admin/live-bans", hubKey: "user-hub" },
      { label: "Face Violations", icon: ScanFace, path: "/admin/face-violations", hubKey: "user-hub" },
      { label: "Moderation", icon: Shield, path: "/admin/moderation", hubKey: "user-hub" },
      { label: "User Reports", icon: ShieldAlert, path: "/admin/user-reports", hubKey: "user-hub" },
    ]
  },
  {
    title: "🏢 Agency System",
    hubKey: "agency-hub",
    items: [
      { label: "Agency Hub", icon: Building2, path: "/admin/agency-hub", hubKey: "agency-hub" },
      { label: "All Agencies", icon: Building2, path: "/admin/agencies", hubKey: "agency-hub" },
      { label: "Agency Policy", icon: FileText, path: "/admin/agency-policy", hubKey: "agency-hub" },
      { label: "Commissions", icon: Percent, path: "/admin/commissions", hubKey: "agency-hub" },
      { label: "Commission Calculator", icon: Percent, path: "/admin/commission-calculator", hubKey: "agency-hub" },
    ]
  },
  {
    title: "👑 Level & VIP",
    items: [
      { label: "Level Management", icon: Crown, path: "/admin/level-management", hubKey: "level-hub" },
      { label: "Level Tiers", icon: TrendingUp, path: "/admin/level-tiers", hubKey: "level-hub" },
      { label: "Level Privileges", icon: Star, path: "/admin/level-privileges", hubKey: "level-hub" },
      { label: "Feature Levels", icon: ArrowUpCircle, path: "/admin/feature-levels", hubKey: "level-hub" },
      { label: "VIP & Noble System", icon: Star, path: "/admin/vip-management", hubKey: "vip-hub" },
      { label: "VIP Medals", icon: Crown, path: "/admin/vip-medals", hubKey: "vip-hub" },
      { label: "VIP Privileges", icon: Star, path: "/admin/vip-privileges", hubKey: "vip-hub" },
      { label: "Noble Cards", icon: CreditCard, path: "/admin/noble-cards", hubKey: "vip-hub" },
      { label: "Ranking Rewards", icon: TrendingUp, path: "/admin/ranking-rewards", hubKey: "vip-hub" },
    ]
  },
  {
    title: "🎨 Visual Assets",
    hubKey: "visual-hub",
    items: [
      { label: "Visual Assets Hub", icon: Sparkles, path: "/admin/visual-assets", hubKey: "visual-hub" },
      { label: "Avatar Frames", icon: Image, path: "/admin/frames", hubKey: "visual-hub" },
      { label: "Role Frames", icon: Image, path: "/admin/role-frames", hubKey: "visual-hub" },
      { label: "Entry Effects", icon: Sparkles, path: "/admin/entry-effects", hubKey: "visual-hub" },
      { label: "Entry Banners", icon: Image, path: "/admin/entry-banners", hubKey: "visual-hub" },
      { label: "Entry Bars", icon: Activity, path: "/admin/entry-bars", hubKey: "visual-hub" },
      { label: "Entry Name Bars", icon: Activity, path: "/admin/entry-name-bars", hubKey: "visual-hub" },
      { label: "Vehicle Entrances", icon: Sparkles, path: "/admin/vehicle-entrances", hubKey: "visual-hub" },
      { label: "Chat Bubbles", icon: MessageSquare, path: "/admin/chat-bubbles", hubKey: "visual-hub" },
      { label: "Animation Store", icon: Play, path: "/admin/animation-store", hubKey: "visual-hub" },
      { label: "Icon Registry", icon: Package, path: "/admin/icon-registry", hubKey: "visual-hub" },
      { label: "Beauty Filters", icon: Sparkles, path: "/admin/beauty-filters", hubKey: "visual-hub" },
    ]
  },
  {
    title: "💰 Coin & Finance",
    hubKey: "finance-hub",
    items: [
      { label: "Finance Management", icon: DollarSign, path: "/admin/finance", hubKey: "finance-hub" },
      { label: "Diamond Trader Hub", icon: Coins, path: "/admin/coin-trader-hub", hubKey: "trader-hub" },
      { label: "Diamond Traders", icon: Coins, path: "/admin/coin-traders", hubKey: "trader-hub" },
      { label: "Trader Orders", icon: ShoppingBag, path: "/admin/coin-traders/orders", hubKey: "trader-hub" },
      { label: "Trader Transactions", icon: Activity, path: "/admin/coin-traders/transactions", hubKey: "trader-hub" },
      { label: "Diamonds Management", icon: Coins, path: "/admin/coins", hubKey: "finance-hub" },
      { label: "Topup System", icon: ArrowUpCircle, path: "/admin/topup-system", hubKey: "finance-hub" },
      { label: "Manual Topup", icon: ArrowUpCircle, path: "/admin/manual-topup", hubKey: "finance-hub" },
      { label: "Payment Gateways", icon: CreditCard, path: "/admin/payment-gateways", hubKey: "finance-hub" },
      { label: "Topup Methods", icon: CreditCard, path: "/admin/topup-payment-methods", hubKey: "finance-hub" },
      { label: "Withdrawals", icon: TrendingDown, path: "/admin/withdrawals", hubKey: "finance-hub" },
      { label: "Balance Deduction", icon: TrendingDown, path: "/admin/balance-deduction", hubKey: "finance-hub" },
      { label: "Transfer History", icon: Activity, path: "/admin/transfer-history", hubKey: "finance-hub" },
      { label: "Recharge History", icon: CreditCard, path: "/admin/recharge-history", hubKey: "finance-hub" },
      { label: "Transfer Scheduler", icon: Clock, path: "/admin/transfer-scheduler", hubKey: "finance-hub" },
      { label: "Payroll Orders", icon: Wallet, path: "/admin/payroll-orders", hubKey: "finance-hub" },
      { label: "Shop", icon: ShoppingBag, path: "/admin/shop", hubKey: "finance-hub" },
      { label: "Gifts", icon: Gift, path: "/admin/gifts", hubKey: "finance-hub" },
      { label: "User Beans Exchange", icon: Coins, path: "/admin/user-beans-exchange", hubKey: "finance-hub" },
    ]
  },
  {
    title: "🤝 Helpers",
    hubKey: "trader-hub",
    items: [
      { label: "Helper Management", icon: UserCheck, path: "/admin/helper-management", hubKey: "trader-hub" },
      { label: "Helper Applications", icon: UserPlus, path: "/admin/helper-applications", hubKey: "trader-hub" },
      { label: "Helper Requests", icon: MessageSquare, path: "/admin/helper-requests", hubKey: "trader-hub" },
      { label: "Helper Orders", icon: ShoppingBag, path: "/admin/helper-orders", hubKey: "trader-hub" },
      { label: "Level 5 Helpers", icon: Crown, path: "/admin/level5-helpers", hubKey: "trader-hub" },
      { label: "Helper Diamond Pricing", icon: Coins, path: "/admin/helper-diamond-pricing", hubKey: "trader-hub" },
    ]
  },
  {
    title: "🎮 Game System",
    hubKey: "game-hub",
    items: [
      { label: "Game Management", icon: Gamepad2, path: "/admin/game-management", hubKey: "game-hub" },
      { label: "Game Settings", icon: Settings, path: "/admin/game-settings", hubKey: "game-hub" },
      { label: "Game Providers", icon: Gamepad2, path: "/admin/game-providers", hubKey: "game-hub" },
      { label: "Game Server", icon: Activity, path: "/admin/game-server", hubKey: "game-hub" },
      { label: "Game Leaderboard", icon: Crown, path: "/admin/game-leaderboard", hubKey: "game-hub" },
    ]
  },
  {
    title: "📺 Content",
    hubKey: "content-hub",
    items: [
      { label: "Content Management", icon: Video, path: "/admin/content-management", hubKey: "content-hub" },
      { label: "Banners", icon: Image, path: "/admin/banners", hubKey: "content-hub" },
      { label: "Content Pages", icon: FileText, path: "/admin/content", hubKey: "content-hub" },
      { label: "Streams", icon: Video, path: "/admin/streams", hubKey: "content-hub" },
      { label: "Recordings", icon: Play, path: "/admin/recordings", hubKey: "content-hub" },
      { label: "Reels", icon: Video, path: "/admin/reels", hubKey: "content-hub" },
      { label: "Leaderboard", icon: Crown, path: "/admin/leaderboard-management", hubKey: "content-hub" },
      { label: "Task Center", icon: CheckCheck, path: "/admin/tasks-settings", hubKey: "content-hub" },
      { label: "Rewards Management", icon: Gift, path: "/admin/rewards-management", hubKey: "content-hub" },
      { label: "Rating Rewards", icon: Star, path: "/admin/rating-rewards", hubKey: "content-hub" },
    ]
  },
  {
    title: "🎉 Party",
    hubKey: "party-hub",
    items: [
      { label: "Party Management", icon: PartyPopper, path: "/admin/party-management", hubKey: "party-hub" },
      { label: "Party Rooms", icon: PartyPopper, path: "/admin/party-rooms", hubKey: "party-hub" },
      { label: "Party Backgrounds", icon: Image, path: "/admin/party-backgrounds", hubKey: "party-hub" },
      { label: "Party Banners", icon: Image, path: "/admin/party-banners", hubKey: "party-hub" },
      { label: "Room Welcome Messages", icon: MessageSquare, path: "/admin/room-welcome-messages", hubKey: "party-hub" },
    ]
  },
  {
    title: "📞 Calling",
    hubKey: "settings-hub",
    items: [
      { label: "Call Settings", icon: Phone, path: "/admin/call-settings", hubKey: "settings-hub" },
    ]
  },
  {
    title: "🎧 Support",
    hubKey: "moderation-hub",
    items: [
      { label: "Support Tickets", icon: MessageSquare, path: "/admin/support-tickets", hubKey: "moderation-hub" },
      { label: "Gmail Support", icon: Mail, path: "/admin/gmail-support", hubKey: "moderation-hub" },
      { label: "Chat Inspector", icon: Search, path: "/admin/chat-inspector", hubKey: "moderation-hub" },
      { label: "Number Sharing", icon: Phone, path: "/admin/number-sharing", hubKey: "moderation-hub" },
      { label: "Contact Violations", icon: ShieldAlert, path: "/admin/contact-violations", hubKey: "moderation-hub" },
    ]
  },
  {
    title: "📢 Notifications",
    hubKey: "settings-hub",
    items: [
      { label: "Push Broadcast", icon: Bell, path: "/admin/push-broadcast", hubKey: "settings-hub" },
      { label: "Notice Broadcast", icon: Megaphone, path: "/admin/notice-broadcast", hubKey: "settings-hub" },
      { label: "Email Broadcast", icon: Mail, path: "/admin/email-broadcast", hubKey: "settings-hub" },
      { label: "Notification Templates", icon: Bell, path: "/admin/notification-templates", hubKey: "settings-hub" },
    ]
  },
  {
    title: "🐛 Debug & Logs",
    items: [
      { label: "Activity Logs", icon: FileText, path: "/admin/logs" },
      { label: "Error Logs", icon: AlertCircle, path: "/admin/error-logs" },
      { label: "App Blueprint", icon: Map, path: "/admin/blueprint", ownerOnly: true },
    ]
  },
  {
    title: "⚙️ Settings",
    hubKey: "settings-hub",
    items: [
      { label: "App Settings Hub", icon: Settings, path: "/admin/app-settings-hub", hubKey: "settings-hub" },
      { label: "General Settings", icon: Settings, path: "/admin/settings", hubKey: "settings-hub" },
      { label: "Agora RTC", icon: Video, path: "/admin/agora-settings", hubKey: "settings-hub", ownerOnly: true },
      { label: "Branding", icon: Image, path: "/admin/branding", hubKey: "settings-hub" },
      { label: "Invitation Settings", icon: UserPlus, path: "/admin/invitation-settings", hubKey: "settings-hub" },
      { label: "Popup Event Banners", icon: Image, path: "/admin/popup-banners", hubKey: "settings-hub" },
      { label: "Onboarding Slides", icon: Image, path: "/admin/onboarding-slides", hubKey: "settings-hub" },
      { label: "App Version", icon: Smartphone, path: "/admin/app-version", hubKey: "settings-hub" },
      { label: "Device Management", icon: Smartphone, path: "/admin/device-management", hubKey: "settings-hub" },
      { label: "🎨 Event Themes", icon: Sparkles, path: "/admin/theme-manager", hubKey: "settings-hub" },
      { label: "Sub-Admin Management", icon: Shield, path: "/admin/sub-admins", ownerOnly: true },
    ]
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
  useEnableBrowserPageInteraction();
  const navigate = useNavigate();
  const location = useLocation();
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false);
  const [currentUser, setCurrentUser] = useState<any>(null);
  const instantAdminAccess = hasAdminAccessFlag() || hasOwnerAccessFlag();
  const [isAdmin, setIsAdmin] = useState(instantAdminAccess);
  const [isLoading, setIsLoading] = useState(!instantAdminAccess);
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
  // Owner emails for hardcoded check
  const OWNER_EMAILS = ["smtv923@gmail.com", "sazzadshifa776@gmail.com"];
  
  // Admin access hook for permission-based filtering
  const { isOwner: hookIsOwner, hasHubAccess, adminUser, isLoading: accessLoading } = useAdminAccess();
  
  // Double-check owner status using hook, email match, AND localStorage owner flag (token-based access)
  const isOwner = hookIsOwner || hasOwnerAccessFlag() || (!!currentUser?.email && OWNER_EMAILS.includes(currentUser.email)) || (!!adminUser?.email && OWNER_EMAILS.includes(adminUser.email));
  
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

  // Debounced header stats fetch - prevents excessive DB queries
  const headerStatsTimerRef = useRef<NodeJS.Timeout | null>(null);
  const fetchHeaderStats = useCallback(async () => {
    try {
      const [onlineRes, liveRes] = await Promise.all([
        (supabase.from('profiles') as any).select('id', { count: 'exact', head: true }).eq('is_online', true),
        (supabase.from('live_streams') as any).select('id', { count: 'exact', head: true }).eq('is_active', true),
      ]);
      setOnlineUsersCount(onlineRes.count || 0);
      setLiveStreamsCount(liveRes.count || 0);
    } catch (e) {
      console.error('Error fetching header stats:', e);
    }
  }, []);

  const debouncedFetchHeaderStats = useCallback(() => {
    if (headerStatsTimerRef.current) clearTimeout(headerStatsTimerRef.current);
    headerStatsTimerRef.current = setTimeout(fetchHeaderStats, 2000);
  }, [fetchHeaderStats]);

  useEffect(() => {
    // ⚡ Defer header stats by 2s — not needed for initial render
    const initialTimer = setTimeout(fetchHeaderStats, 2000);
    // Realtime-driven: listen to live_streams & profiles changes via unified system
    // No polling interval needed — useAdminRealtime handles updates
    const ch = supabase
      .channel('admin-header-stats')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'live_streams' }, debouncedFetchHeaderStats)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'profiles' }, debouncedFetchHeaderStats)
      .subscribe();
    return () => { clearTimeout(initialTimer); supabase.removeChannel(ch); };
  }, [fetchHeaderStats, debouncedFetchHeaderStats]);

  // ⚡ Prefetch ALL admin page chunks after initial render to eliminate lazy-load delay
  useEffect(() => {
    const prefetchTimer = setTimeout(() => {
      const adminModules = import.meta.glob('../admin/*.tsx');
      Object.values(adminModules).forEach(importFn => {
        try { (importFn as Function)(); } catch {}
      });
    }, 3000); // Start prefetching 3s after mount
    return () => clearTimeout(prefetchTimer);
  }, []);

  // Debounced pending counts fetch
  const pendingCountsTimerRef = useRef<NodeJS.Timeout | null>(null);
  const fetchPendingCountsRaw = async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const user = session?.user;
      if (!user) return;

      // Fetch ALL counts in parallel for maximum speed
      // Batch 1: Core counts
      const [upgradeRes, topupRes, helperAppRes, hostAppRes, withdrawalRes, helperRepliesRes, supportTicketsCountRes, userVerifyRes] = await Promise.all([
        supabase.from('helper_upgrade_requests').select('*', { count: 'exact', head: true }).eq('status', 'pending'),
        supabase.from('helper_topup_requests').select('*', { count: 'exact', head: true }).eq('status', 'pending'),
        supabase.from('helper_applications').select('*', { count: 'exact', head: true }).eq('status', 'pending'),
        supabase.from('face_verification_submissions').select('*', { count: 'exact', head: true }).eq('status', 'pending').eq('verification_type', 'host'),
        supabase.from('agency_withdrawals').select('*', { count: 'exact', head: true }).in('status', ['pending', 'processing']),
        supabase.from('helper_message_replies').select('*', { count: 'exact', head: true }).eq('sender_type', 'helper').eq('is_read', false),
        supabase.from('support_tickets').select('id', { count: 'exact', head: true }).eq('category', 'live_chat').in('status', ['open', 'pending']),
        supabase.from('face_verification_submissions').select('*', { count: 'exact', head: true }).eq('status', 'pending').eq('verification_type', 'face'),
      ]);

      // Batch 2: Extended section counts
      const batch2 = await Promise.all([
        supabase.from('user_reports' as any).select('*', { count: 'exact', head: true }).eq('status', 'pending'),
        supabase.from('payroll_requests' as any).select('*', { count: 'exact', head: true }).eq('status', 'pending'),
        supabase.from('helper_orders' as any).select('*', { count: 'exact', head: true }).eq('status', 'pending'),
        supabase.from('live_bans' as any).select('*', { count: 'exact', head: true }).eq('is_active', true),
        supabase.from('live_face_violations' as any).select('*', { count: 'exact', head: true }).eq('status', 'pending'),
        supabase.from('host_conversion_requests' as any).select('*', { count: 'exact', head: true }).eq('status', 'pending'),
        supabase.from('chat_moderation_logs' as any).select('*', { count: 'exact', head: true }).is('reviewed_at', null),
        supabase.from('helper_withdrawal_requests' as any).select('*', { count: 'exact', head: true }).eq('status', 'pending'),
      ]);
      const [userReportsRes, payrollRes, helperOrdersRes, liveBansRes, facViolationsRes, hostConvRes, moderationRes, helperWithdrawalRes] = batch2;

      // Batch 3: Additional section counts (only PENDING/actionable items — no daily activity counts)
      const batch3 = await Promise.all([
        supabase.from('rating_reward_claims' as any).select('*', { count: 'exact', head: true }).eq('status', 'pending'),
        // NOTE: recharge_transactions & gift_transactions are informational (daily activity), NOT pending items
        // Do NOT show them as notification badges — they are not actionable
        supabase.from('leaderboard_reward_history' as any).select('*', { count: 'exact', head: true }).eq('status', 'pending'),
        supabase.from('consumption_return_history' as any).select('*', { count: 'exact', head: true }).eq('is_claimed', false),
        supabase.from('agency_earnings_transfers' as any).select('*', { count: 'exact', head: true }).eq('status', 'pending'),
        supabase.from('coin_transfers' as any).select('*', { count: 'exact', head: true }).eq('status', 'pending'),
      ]);
      const [ratingRewardsRes, leaderboardRewardsRes, consumptionRes, agencyTransfersRes, coinTransfersRes] = batch3;

      const queryErrors = [
        upgradeRes.error, topupRes.error, helperAppRes.error, hostAppRes.error,
        withdrawalRes.error, helperRepliesRes.error, supportTicketsCountRes.error, userVerifyRes.error,
      ].filter(Boolean);

      if (queryErrors.length > 0) {
        const authLikeError = queryErrors.some((err: any) => {
          const msg = String(err?.message || '').toLowerCase();
          return msg.includes('jwt') || msg.includes('not authenticated') || msg.includes('permission denied');
        });

        if (authLikeError) {
          await supabase.auth.refreshSession();
        }
        return;
      }
      
      // Calculate counts for each section
      const helperManagementCount = (upgradeRes.count || 0) + (topupRes.count || 0) + (helperAppRes.count || 0) + (helperWithdrawalRes?.count || 0);
      const userHubCount = (hostAppRes.count || 0) + (userVerifyRes.count || 0) + (userReportsRes?.count || 0);
      const agencyHubCount = (withdrawalRes.count || 0) + (agencyTransfersRes?.count || 0);
      const financeCount = (helperRepliesRes.count || 0) + (payrollRes?.count || 0) + (coinTransfersRes?.count || 0);
      const supportCount = supportTicketsCountRes.count || 0;
      const contentCount = (ratingRewardsRes?.count || 0) + (leaderboardRewardsRes?.count || 0);
      
      setPendingCounts({
        // Overview
        '/admin': 0,
        '/admin/reports': 0,
        '/admin/logs': 0,
        // User System
        '/admin/user-hub': userHubCount,
        '/admin/host-applications': hostAppRes.count || 0,
        '/admin/face-verification': userVerifyRes.count || 0,
        '/admin/user-reports': userReportsRes?.count || 0,
        '/admin/live-bans': liveBansRes?.count || 0,
        '/admin/face-violations': facViolationsRes?.count || 0,
        '/admin/moderation': moderationRes?.count || 0,
        '/admin/user-management': hostConvRes?.count || 0,
        // Agency System
        '/admin/agency-hub': agencyHubCount,
        '/admin/withdrawals': withdrawalRes.count || 0,
        '/admin/agencies': agencyTransfersRes?.count || 0,
        // Level & VIP
        '/admin/level-management': 0,
        '/admin/vip-management': 0,
        '/admin/ranking-rewards': leaderboardRewardsRes?.count || 0,
        // Visual Assets
        '/admin/visual-assets': 0,
        // Calling
        '/admin/call-settings': 0,
        // Coin & Finance
        '/admin/coin-trader-hub': coinTransfersRes?.count || 0,
        '/admin/finance': financeCount,
        '/admin/payroll-orders': payrollRes?.count || 0,
        '/admin/recharge-history': 0,
        '/admin/transfer-history': agencyTransfersRes?.count || 0,
        // Game
        '/admin/game-management': 0,
        // Content
        '/admin/content-management': contentCount,
        '/admin/rewards-management': 0,
        '/admin/rating-rewards': ratingRewardsRes?.count || 0,
        '/admin/leaderboard-management': leaderboardRewardsRes?.count || 0,
        '/admin/gifts': 0,
        // Party
        '/admin/party-management': 0,
        // Support
        '/admin/support-tickets': supportCount,
        '/admin/number-sharing': moderationRes?.count || 0,
        '/admin/chat-inspector': moderationRes?.count || 0,
        // Helpers
        '/admin/helper-management': helperManagementCount,
        '/admin/helper-applications': helperAppRes.count || 0,
        '/admin/helper-orders': helperOrdersRes?.count || 0,
        '/admin/helper-requests': helperRepliesRes.count || 0,
        // Settings
        '/admin/app-settings-hub': 0,
      });
    } catch (error) {
      console.error('Error fetching pending counts:', error);
    }
  };

  // Debounced version — longer delay to prevent rapid-fire during mount & realtime storms
  const fetchPendingCounts = useCallback(() => {
    if (pendingCountsTimerRef.current) clearTimeout(pendingCountsTimerRef.current);
    pendingCountsTimerRef.current = setTimeout(fetchPendingCountsRaw, 2000);
  }, []);

  // Fetch notifications — ONLY unread so old/read ones never reappear
  const fetchNotifications = async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const user = session?.user;
      if (!user) return;

      // Only fetch UNREAD notifications — once read, they never come back
      const { data, error } = await supabase
        .from('notifications')
        .select('*')
        .eq('user_id', user.id)
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
      const { data: { session } } = await supabase.auth.getSession();
      const user = session?.user;
      if (!user) return;

      const { data } = await supabase
        .from('notifications')
        .select('*')
        .eq('user_id', user.id)
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

    const { error } = await supabase
      .from('notifications')
      .update({ is_read: true })
      .in('id', ids);

    if (error) {
      fetchNotifications();
    }
  }, [notifications]);

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

    const { error } = await supabase
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
    const { data: { session } } = await supabase.auth.getSession();
    const user = session?.user;
    if (!user) return;

    const { error } = await supabase
      .from('notifications')
      .update({ is_read: true })
      .eq('user_id', user.id)
      .eq('is_read', false);

    if (!error) {
      setNotifications([]); // Clear all — they're now read and won't come back
      setUnreadCount(0);
      setNotificationCountsByPath({}); // Reset all DB notification counts
      setSectionNotifications([]); // Instantly clear derived section alerts in bell UI
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

  // Build section-level notifications from pending counts so bell includes every active section
  useEffect(() => {
    const pathToLabel = navGroups
      .flatMap(group => group.items)
      .reduce<Record<string, string>>((acc, item) => {
        acc[item.path] = item.label;
        return acc;
      }, {});

    const generated = Object.entries(pendingCounts)
      .filter(([path, count]) => path.startsWith('/admin') && count > 0)
      .filter(([path, count]) => !dismissedPaths.has(path))
      .map(([path, count]) => ({
        id: `section-${path}`,
        title: `📌 ${pathToLabel[path] || path}`,
        message: `${count} new/pending update(s)`,
        type: 'section_pending',
        is_read: false,
        created_at: new Date().toISOString(),
        data: {
          is_section_pending: true,
          adminPath: path,
          count,
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

  // Auto-dismiss badges when visiting a page
  useEffect(() => {
    const currentPath = normalizeAdminPath(location.pathname);

    // Dismiss current section + related hub so bell/sidebar badges clear instantly
    dismissPath(currentPath);

    // Instantly clear DB notifications for the opened page
    void markPathNotificationsAsRead(currentPath);
  }, [location.pathname, dismissPath, markPathNotificationsAsRead]);

  // Notification sound - pre-initialize AudioContext on first user interaction
  const audioCtxRef = useRef<AudioContext | null>(null);
  const audioUnlockedRef = useRef(false);
  const playNotificationSoundRef = useRef<() => void>(() => {});
  const lastNotificationSoundAtRef = useRef(0);
  const browserNotifPermissionRef = useRef<NotificationPermission>('default');

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

    const unlockAudio = () => {
      if (audioUnlockedRef.current) return;
      try {
        const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
        const buffer = ctx.createBuffer(1, 1, 22050);
        const source = ctx.createBufferSource();
        source.buffer = buffer;
        source.connect(ctx.destination);
        source.start(0);
        audioCtxRef.current = ctx;
        audioUnlockedRef.current = true;
        console.log('[Admin] 🔊 Audio unlocked for notifications');
      } catch (e) {
        console.log('[Admin] Audio unlock failed:', e);
      }
    };

    document.addEventListener('click', unlockAudio, { once: true });
    document.addEventListener('touchstart', unlockAudio, { once: true });
    
    return () => {
      document.removeEventListener('click', unlockAudio);
      document.removeEventListener('touchstart', unlockAudio);
    };
  }, []);

  const playNotificationSound = useCallback(() => {
    try {
      const nowMs = Date.now();
      if (nowMs - lastNotificationSoundAtRef.current < 900) return;
      lastNotificationSoundAtRef.current = nowMs;

      let ctx = audioCtxRef.current;
      if (!ctx || ctx.state === 'closed') {
        ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
        audioCtxRef.current = ctx;
      }
      
      // Resume if suspended
      if (ctx.state === 'suspended') {
        ctx.resume();
      }
      
      const now = ctx.currentTime;
      
      // Tone 1: A5 (880Hz)
      const osc1 = ctx.createOscillator();
      const gain1 = ctx.createGain();
      osc1.connect(gain1);
      gain1.connect(ctx.destination);
      osc1.frequency.value = 880;
      osc1.type = 'sine';
      gain1.gain.setValueAtTime(0.4, now);
      gain1.gain.exponentialRampToValueAtTime(0.01, now + 0.12);
      osc1.start(now);
      osc1.stop(now + 0.12);

      // Tone 2: D6 (1174Hz) - slightly delayed
      const osc2 = ctx.createOscillator();
      const gain2 = ctx.createGain();
      osc2.connect(gain2);
      gain2.connect(ctx.destination);
      osc2.frequency.value = 1174.66;
      osc2.type = 'sine';
      gain2.gain.setValueAtTime(0.4, now + 0.1);
      gain2.gain.exponentialRampToValueAtTime(0.01, now + 0.25);
      osc2.start(now + 0.1);
      osc2.stop(now + 0.25);

      // Tone 3: High E6 (1318Hz) - final ping
      const osc3 = ctx.createOscillator();
      const gain3 = ctx.createGain();
      osc3.connect(gain3);
      gain3.connect(ctx.destination);
      osc3.frequency.value = 1318.51;
      osc3.type = 'sine';
      gain3.gain.setValueAtTime(0.3, now + 0.2);
      gain3.gain.exponentialRampToValueAtTime(0.01, now + 0.4);
      osc3.start(now + 0.2);
      osc3.stop(now + 0.4);
      
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
        requireInteraction: false,
        silent: false, // Let the browser play its default sound
      });
      
      // Auto-close after 8 seconds
      setTimeout(() => notification.close(), 8000);
      
      // Focus tab when clicked
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

    // Phase 2: Defer pending counts by 2.5s so UI renders first
    const pendingCountsTimer = setTimeout(() => {
      fetchPendingCounts();
    }, 2500);

    // ⚡ Single global subscription: chunked channels for ALL tables
    const globalChannels: ReturnType<typeof supabase.channel>[] = [];
    const globalTables = Array.from(GLOBALLY_MONITORED_TABLES);
    const CHUNK_SIZE = 40; // Larger chunks = fewer channels
    const channelRetryTimers: NodeJS.Timeout[] = [];

    const createChunkedChannel = (chunk: string[], chIdx: number) => {
      // Remove existing channel if any
      const existingIdx = globalChannels.findIndex((c: any) => c?.topic?.includes(`admin-unified-${chIdx}`));
      if (existingIdx >= 0) {
        try { supabase.removeChannel(globalChannels[existingIdx]); } catch {}
        globalChannels.splice(existingIdx, 1);
      }

      let ch = supabase.channel(`admin-unified-${chIdx}-${Date.now()}`);
      for (const table of chunk) {
        ch = ch.on('postgres_changes', { event: '*', schema: 'public', table }, (payload) => {
          dispatchAdminTableUpdate({
            table,
            eventType: payload.eventType as 'INSERT' | 'UPDATE' | 'DELETE',
            payload: payload.new,
          });
        });
      }

      ch.subscribe((status) => {
        console.log(`[Admin] Unified channel ${chIdx} status:`, status);
        if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          console.warn(`[Admin] ⚠️ Channel ${chIdx} error, retrying in 3s...`);
          const retryTimer = setTimeout(() => {
            try { supabase.removeChannel(ch); } catch {}
            createChunkedChannel(chunk, chIdx);
          }, 3000);
          channelRetryTimers.push(retryTimer);
        }
      });
      globalChannels.push(ch);
    };

    for (let i = 0; i < globalTables.length; i += CHUNK_SIZE) {
      const chunk = globalTables.slice(i, i + CHUNK_SIZE);
      const chIdx = Math.floor(i / CHUNK_SIZE) + 1;
      createChunkedChannel(chunk, chIdx);
    }
    console.log(`[Admin] ✅ Unified realtime: ${Math.ceil(globalTables.length / CHUNK_SIZE)} channels for ${globalTables.length} tables`);

    // 🔄 Refresh only pending counts when tab becomes visible — NO full page reload
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        console.log('[Admin] 👁 Tab visible — refreshing pending counts only');
        fetchPendingCounts();
        fetchNotifications();
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);

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
      payroll_requests: { toast: '💳 Payroll Request', desc: 'New payroll request needs processing', path: '/admin/payroll' },
      user_reports: { toast: '🚨 New User Report', desc: 'A user has been reported', path: '/admin/user-reports' },
      recharge_transactions: { 
        toast: '💎 New Recharge', desc: 'A new recharge transaction recorded', path: '/admin/recharge-history',
        filter: (p: any) => p?.status === 'completed',
      },
      live_streams: { 
        toast: '📺 New Live Stream', desc: 'A streamer just went live', path: '/admin/streams',
        filter: (p: any) => p?.is_active === true,
      },
      helper_withdrawal_requests: { toast: '🏦 Helper Withdrawal', desc: 'A helper withdrawal request is pending', path: '/admin/helper-withdrawals' },
    };

    const pendingTables = new Set([
      'helper_upgrade_requests', 'helper_topup_requests', 'helper_applications',
      'face_verification_submissions', 'agency_withdrawals', 'helper_message_replies',
      'support_tickets', 'support_messages', 'user_reports', 'payroll_requests',
      'helper_orders', 'live_bans', 'live_face_violations', 'host_conversion_requests',
      'chat_moderation_logs', 'helper_withdrawal_requests', 'notifications',
      'rating_reward_claims', 'leaderboard_reward_history', 'consumption_return_history',
      'agency_earnings_transfers', 'coin_transfers',
    ]);

    const handleUnifiedEvent = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (!detail?.table) return;
      const { table, eventType, payload } = detail;

      // Pending count refresh for relevant tables
      if (pendingTables.has(table)) {
        fetchPendingCounts();
        if (table === 'notifications') fetchNotifications();
      }

      // Only show toasts for INSERT events
      if (eventType !== 'INSERT') return;

      // Notification INSERT — handle inline
      if (table === 'notifications' && payload) {
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

      // Support messages — special filter
      if (table === 'support_messages' && payload) {
        if (payload.sender_type !== 'user') return;
        if (typeof payload.content === 'string' && payload.content.includes('AI Conversation Summary')) return;
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

      // Admin notices — show urgent ones (duplicate face, VPN, etc.) as instant alerts
      if (table === 'admin_notices' && payload && eventType === 'INSERT') {
        const isUrgent = payload.priority === 'urgent' || payload.priority === 'high';
        if (isUrgent) {
          playSoundViaRef();
          showBrowserNotifViaRef(payload.title || '🚨 Admin Alert', payload.message || 'New urgent admin notice');
          toast.error(payload.title || '🚨 Admin Alert', {
            description: (payload.message || '').slice(0, 120),
            action: { label: '👉 View', onClick: () => navigate('/admin/notice-broadcast') },
            duration: 10000,
          });
        }
        return;
      }

      // Face verification — special toast
      if (table === 'face_verification_submissions' && payload) {
        const isHost = payload.verification_type === 'host';
        playSoundViaRef(); fetchPendingCounts();
        showBrowserNotifViaRef(isHost ? '👤 New Host Application' : '📸 New Face Verification', isHost ? 'New host application awaiting review' : 'Face verification submission received');
        toast(isHost ? '👤 New Host Application' : '📸 New Face Verification', {
          description: isHost ? 'New host application awaiting review' : 'Face verification submission received',
          action: { label: '👉 View', onClick: () => navigate(isHost ? '/admin/host-applications' : '/admin/face-verification') },
          duration: 8000,
        });
        return;
      }

      // Chat moderation — special toast
      if (table === 'chat_moderation_logs' && payload) {
        if (payload.violation_type && payload.violation_type !== 'user_report') {
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
            action: { label: '👉 View', onClick: () => navigate('/admin/chat-inspector') },
            duration: 10000,
          });
        }
        return;
      }

      // Standard alert toasts
      const config = alertTableConfig[table];
      if (config) {
        // Skip if filter defined and returns false
        if (config.filter && !config.filter(payload)) return;
        playSoundViaRef(); fetchPendingCounts();
        showBrowserNotifViaRef(config.toast, config.desc);
        if (config.customToast) {
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
      channelRetryTimers.forEach(t => clearTimeout(t));
      globalChannels.forEach(ch => { try { supabase.removeChannel(ch); } catch {} });
      window.removeEventListener(ADMIN_REALTIME_EVENT, handleUnifiedEvent);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
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
            const { data } = await supabase
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
        return <Video className="w-4 h-4 text-red-500" />;
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

  // Zero-refresh admin UX: route changes handled by useAdminRealtime bootstrap refresh
  // No wildcard dispatch needed — each page's useAdminRealtime does its own initial fetch
  useEffect(() => {
    checkAdminAccess();
    
    // Re-check admin access when auth session restores (e.g., after refresh)
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') {
        if (!isAdmin) {
          console.log('[AdminLayout] Auth event:', event, '- re-checking admin access');
          checkAdminAccess();
        }
      }
    });
    
    return () => { subscription.unsubscribe(); };
  }, []);

  const waitForRestoredUser = async (timeoutMs = 1200): Promise<any | null> => {
    // Quick check first - no waiting
    const { data: { session } } = await supabase.auth.getSession();
    if (session?.user) return session.user;

    // Try refresh immediately
    try {
      const { data } = await supabase.auth.refreshSession();
      if (data.session?.user) return data.session.user;
    } catch {}

    // Wait briefly for auth restore event (no interval polling)
    return await new Promise((resolve) => {
      let resolved = false;
      const finish = (value: any) => {
        if (resolved) return;
        resolved = true;
        clearTimeout(timeout);
        subscription.unsubscribe();
        resolve(value);
      };

      const timeout = setTimeout(() => finish(null), timeoutMs);

      const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, sess) => {
        if (sess?.user) finish(sess.user);
      });

      void supabase.auth.getSession().then(({ data: { session } }) => {
        if (session?.user) finish(session.user);
      });
    });
  };

  const checkAdminAccess = async () => {
    try {
      const hasFlagAccess = hasAdminAccessFlag();
      if (hasFlagAccess) {
        console.log("[AdminLayout] ⚡ Admin access flag detected - validating authenticated session");
      }

      const { data: { session } } = await supabase.auth.getSession();
      let user = session?.user ?? null;

      // Token/local flag alone is NOT enough for data access; require real auth session
      if (!user) {
        user = await waitForRestoredUser(hasFlagAccess ? 2200 : 1200);
      }

      if (!user) {
        if (hasFlagAccess) {
          console.warn("[AdminLayout] Admin flag exists but no authenticated user/session - revoking local access");
          revokeAdminAccess();
        }
        setIsAdmin(false);
        setIsLoading(false);
        return;
      }

      // Fetch profile and check admin in parallel
      const [profileRes, adminRes] = await Promise.all([
        supabase.from("profiles").select("*").eq("id", user.id).maybeSingle(),
        supabase.rpc("is_admin", { _user_id: user.id }),
      ]);

      setCurrentUser({ ...user, profile: profileRes.data });

      let isAdminResult = !adminRes.error && adminRes.data === true;

      // Only retry once if first attempt failed
      if (!isAdminResult) {
        await supabase.auth.refreshSession();
        const retry = await supabase.rpc("is_admin", { _user_id: user.id });
        isAdminResult = !retry.error && retry.data === true;
      }

      if (!isAdminResult) {
        console.warn("[AdminLayout] User is not admin - revoking local admin flag");
        revokeAdminAccess();
        setIsAdmin(false);
        setIsLoading(false);
        return;
      }

      setIsAdmin(true);
    } catch (error) {
      console.error("Admin check error:", error);
      try { await supabase.auth.refreshSession(); } catch {}
      setIsLoading(false);
    } finally {
      setIsLoading(false);
    }
  };

  const handleLogout = async () => {
    // Clear admin-specific access flags FIRST
    revokeAdminAccess();
    
    // Also clear any cached admin queries
    setIsAdmin(false);
    setCurrentUser(null);

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        localStorage.setItem('meri_manual_logout', 'true');
        await supabase.auth.signOut({ scope: 'local' });
      }
    } catch {}

    // Force navigate - use window.location to ensure full page reload and clear all state
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

  // Show a minimal skeleton while loading instead of blank/black screen
  if (isLoading) {
    return (
      <div className="min-h-screen bg-[#06060a] flex">
        <div className="w-72 h-screen bg-[#08080e] border-r border-white/[0.04] p-4 hidden lg:block">
          <div className="flex items-center gap-3 mb-8">
            <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-violet-500/20 to-fuchsia-600/20 animate-pulse" />
            <div className="space-y-1.5 flex-1">
              <div className="h-4 w-24 bg-white/[0.06] rounded animate-pulse" />
              <div className="h-2.5 w-16 bg-white/[0.03] rounded animate-pulse" />
            </div>
          </div>
          {[...Array(8)].map((_, i) => (
            <div key={i} className="flex items-center gap-2.5 p-2 mb-1 rounded-xl">
              <div className="w-7 h-7 rounded-lg bg-white/[0.04] animate-pulse" />
              <div className="h-3 bg-white/[0.04] rounded animate-pulse" style={{ width: `${60 + Math.random() * 40}%` }} />
            </div>
          ))}
        </div>
        <div className="flex-1 p-6">
          <div className="flex items-center justify-between mb-6">
            <div className="h-7 w-48 bg-white/[0.04] rounded-lg animate-pulse" />
            <div className="flex gap-2.5">
              <div className="w-10 h-10 rounded-xl bg-white/[0.04] animate-pulse" />
              <div className="w-10 h-10 rounded-xl bg-white/[0.04] animate-pulse" />
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
            {[...Array(3)].map((_, i) => (
              <div key={i} className="h-28 rounded-2xl bg-white/[0.02] border border-white/[0.04] animate-pulse" />
            ))}
          </div>
          <div className="h-64 rounded-2xl bg-white/[0.02] border border-white/[0.04] animate-pulse" />
        </div>
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
    "💰 Coin & Finance": { border: "border-emerald-500/20", glow: "shadow-emerald-500/10", text: "text-emerald-400", dot: "bg-emerald-500", iconActive: "from-emerald-500 via-green-500 to-teal-600" },
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
    <div className="h-screen overflow-hidden bg-[#06060a] touch-manipulation" style={{ height: '100dvh' }}>
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

      {/* ━━━ SIDEBAR ━━━ */}
      <aside className={cn(
        "fixed left-0 top-0 h-full z-50 transition-all duration-300 ease-in-out flex flex-col",
        "bg-[#08080e]/95 backdrop-blur-2xl border-r border-white/[0.04]",
        "shadow-[4px_0_50px_-10px_rgba(0,0,0,0.8)]",
        isSidebarOpen ? "w-72" : "w-20",
        isMobileSidebarOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0"
      )}>
        {/* Subtle gradient overlays */}
        <div className="absolute inset-0 bg-gradient-to-b from-violet-500/[0.02] via-transparent to-emerald-500/[0.01] pointer-events-none" />
        <div className="absolute right-0 top-0 bottom-0 w-px bg-gradient-to-b from-violet-500/15 via-white/[0.03] to-emerald-500/10 pointer-events-none" />
        
        {/* Logo Header */}
        <div className="relative p-4 border-b border-white/[0.04]">
          <div className="absolute top-0 left-1/2 -translate-x-1/2 w-40 h-20 bg-violet-500/[0.04] blur-3xl pointer-events-none" />
          
          <div className="relative flex items-center gap-3">
            <div className="relative group">
              <div className="absolute inset-0 bg-gradient-to-br from-violet-500 to-fuchsia-600 rounded-xl blur-lg opacity-40 group-hover:opacity-60 transition-opacity" />
              <div className="relative w-11 h-11 rounded-xl bg-gradient-to-br from-violet-500 via-purple-500 to-fuchsia-600 flex items-center justify-center shadow-xl ring-1 ring-white/10">
                <Shield className="w-5 h-5 text-white drop-shadow-lg" />
              </div>
              <div className="absolute -bottom-0.5 -right-0.5 w-3 h-3 bg-emerald-400 rounded-full border-2 border-[#08080e] shadow-lg shadow-emerald-400/50 animate-pulse" />
            </div>
            {isSidebarOpen && (
              <motion.div initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} className="flex-1">
                <h1 className="text-white font-extrabold text-base tracking-wide">MeriLive</h1>
                <p className="text-[9px] text-violet-400/50 font-bold uppercase tracking-[0.25em]">Admin Console</p>
              </motion.div>
            )}
            <Button variant="ghost" size="icon" className="lg:hidden text-slate-400 hover:text-white hover:bg-white/5" onClick={() => setIsMobileSidebarOpen(false)}>
              <X className="w-5 h-5" />
            </Button>
          </div>

          {/* Search */}
          {isSidebarOpen && (
            <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} className="mt-4 relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-600" />
              <Input
                ref={sidebarSearchRef}
                placeholder="Search... (Ctrl+K)"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9 pr-16 bg-white/[0.03] border-white/[0.06] text-white text-sm placeholder:text-slate-700 focus:bg-white/[0.05] focus:border-violet-500/30 focus:ring-1 focus:ring-violet-500/15 rounded-xl h-9"
              />
              {!searchQuery && (
                <kbd className="absolute right-3 top-1/2 -translate-y-1/2 hidden sm:inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded border border-white/[0.08] bg-white/[0.03] text-[10px] text-slate-600 font-mono">⌘K</kbd>
              )}
              {searchQuery && (
                <button onClick={() => setSearchQuery('')} className="absolute right-3 top-1/2 -translate-y-1/2 w-5 h-5 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center transition-colors">
                  <X className="w-3 h-3 text-white" />
                </button>
              )}
            </motion.div>
          )}
        </div>

        {/* Navigation Groups */}
        <ScrollArea className="flex-1 min-h-0 [&>div>div]:!block">
          <nav className="p-2 pb-6">
            {filteredNavGroups.map((group) => {
              const isExpanded = expandedGroups.includes(group.title);
              const accent = getGroupAccent(group.title);
              
              return (
                <div key={group.title} className="mb-1">
                  {isSidebarOpen && (
                    <button
                      onClick={() => toggleGroup(group.title)}
                      className="w-full flex items-center justify-between px-3 py-2 text-[10px] font-bold uppercase tracking-[0.15em] hover:text-white/80 transition-colors group/header"
                    >
                      <span className={cn("flex items-center gap-2", accent.text)}>
                        <span className={cn("w-1.5 h-1.5 rounded-full", accent.dot)} />
                        {group.title}
                      </span>
                      <ChevronDown className={cn(
                        "w-3 h-3 transition-transform duration-200 text-slate-600",
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
                              onClick={() => {
                                setIsMobileSidebarOpen(false);
                                const normalizedItemPath = normalizeAdminPath(item.path);
                                dismissPath(normalizedItemPath);
                                void markPathNotificationsAsRead(normalizedItemPath);
                              }}
                              className={cn(
                                "flex items-center gap-2.5 px-3 py-2 rounded-xl transition-all duration-200 group/item relative overflow-hidden",
                                isActive
                                  ? cn("bg-gradient-to-r from-white/[0.08] via-white/[0.04] to-transparent text-white border", accent.border)
                                  : "text-slate-500 hover:text-white/80 hover:bg-white/[0.03] border border-transparent"
                              )}
                            >
                              {isActive && (
                                <motion.div
                                  layoutId="activeNav"
                                  className={cn("absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-6 rounded-r-full bg-gradient-to-b", accent.iconActive)}
                                  style={{ boxShadow: `0 0 12px ${accent.dot.replace('bg-', '').includes('violet') ? 'rgba(139,92,246,0.5)' : 'rgba(255,255,255,0.2)'}` }}
                                />
                              )}
                              
                              <div className={cn(
                                "w-7 h-7 rounded-lg flex items-center justify-center transition-all flex-shrink-0",
                                isActive 
                                  ? cn("bg-gradient-to-br shadow-md", accent.iconActive)
                                  : "bg-white/[0.04] group-hover/item:bg-white/[0.08]"
                              )}>
                                <Icon className={cn("w-3.5 h-3.5", isActive ? "text-white" : "text-slate-500 group-hover/item:text-white/60")} />
                                {!isSidebarOpen && badgeCount > 0 && (
                                  <motion.span initial={{ scale: 0 }} animate={{ scale: 1 }} className="absolute -top-1 -right-1 min-w-4 h-4 flex items-center justify-center px-0.5 bg-gradient-to-r from-violet-500 to-fuchsia-500 rounded-full text-[8px] text-white font-bold ring-2 ring-[#08080e]">
                                    {formatBadgeCount(badgeCount)}
                                  </motion.span>
                                )}
                              </div>
                              
                              {isSidebarOpen && (
                                <span className="text-[13px] font-semibold truncate flex-1">{item.label}</span>
                              )}
                              
                              {isSidebarOpen && badgeCount > 0 && (
                                <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }}>
                                  <Badge className={cn("ml-auto border-0 text-[10px] px-1.5 shadow-lg font-bold bg-gradient-to-r text-white", accent.iconActive)}>
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
        <div className="relative p-3 border-t border-white/[0.04] bg-gradient-to-t from-violet-950/5 to-transparent shrink-0">
          <div className="absolute inset-x-3 top-0 h-px bg-gradient-to-r from-transparent via-violet-500/10 to-transparent" />
          
          <div className={cn(
            "flex items-center gap-3 p-2.5 rounded-xl bg-white/[0.02] hover:bg-white/[0.04] transition-all duration-300 cursor-pointer border border-white/[0.04] hover:border-white/[0.08]",
            !isSidebarOpen && "justify-center"
          )} onClick={() => setShowProfileMenu(true)}>
            <Avatar className="w-9 h-9 border border-violet-400/20 ring-2 ring-violet-500/10 shadow-lg">
              <AvatarImage src={currentUser?.profile?.avatar_url} />
              <AvatarFallback className="bg-gradient-to-br from-violet-500 via-purple-500 to-fuchsia-600 text-white text-xs font-bold">
                {currentUser?.profile?.display_name?.charAt(0) || "A"}
              </AvatarFallback>
            </Avatar>
            {isSidebarOpen && (
              <div className="flex-1 min-w-0">
                <p className="text-white text-sm font-bold truncate">{adminUser?.display_name || currentUser?.profile?.display_name || "Admin"}</p>
                <p className={cn("text-[9px] font-bold tracking-[0.2em] uppercase", isOwner ? "text-violet-400/60" : "text-slate-600")}>
                  {isOwner ? "👑 Owner" : "🛡️ Sub-Admin"}
                </p>
              </div>
            )}
          </div>
        </div>
      </aside>

      {/* ━━━ MAIN CONTENT ━━━ */}
      <div className={cn("transition-all duration-300 h-full min-h-0 flex flex-col overflow-hidden", isSidebarOpen ? "lg:ml-72" : "lg:ml-20")}>
        
        {/* ━━━ TOP HEADER ━━━ */}
        <header className="sticky top-0 z-30 shrink-0 bg-[#06060a]/90 backdrop-blur-2xl border-b border-white/[0.04] safe-area-top">
          <div className="flex items-center justify-between px-3 sm:px-4 lg:px-5 py-2.5">
            <div className="flex items-center gap-3">
              <Button
                variant="ghost" size="icon"
                className="lg:hidden text-white hover:bg-white/5 rounded-xl h-10 w-10 bg-white/[0.04] border border-white/[0.06]"
                onClick={() => { setIsMobileSidebarOpen(true); setIsSidebarOpen(true); }}
              >
                <Menu className="w-5 h-5" />
              </Button>

              <Button variant="ghost" size="icon" className="hidden lg:flex text-slate-500 hover:text-white hover:bg-white/5 rounded-xl h-8 w-8" onClick={() => setIsSidebarOpen(!isSidebarOpen)}>
                <Menu className="w-4 h-4" />
              </Button>

              <div className="hidden md:block">
                <h2 className="text-white font-bold text-[15px]">
                  {navGroups.flatMap(g => g.items).find(item => location.pathname === item.path || (item.path !== "/admin" && location.pathname.startsWith(item.path)))?.label || "Dashboard"}
                </h2>
                <p className="text-[9px] text-slate-600 font-bold uppercase tracking-[0.2em]">Admin Console</p>
              </div>
            </div>

            <div className="flex items-center gap-2.5">
              {/* Desktop Search */}
              <div className="relative hidden md:block">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-600" />
                <Input placeholder="Global search..." className="w-56 pl-10 bg-white/[0.03] border-white/[0.06] text-white placeholder:text-slate-700 focus:bg-white/[0.05] focus:border-violet-500/25 focus:ring-1 focus:ring-violet-500/15 rounded-xl h-9 text-sm" />
              </div>

              {/* Phone Alert Bell */}
              <AdminAlertBell />

              {/* Notifications */}
              <div className="relative" ref={notificationRef}>
                <Button
                  variant="ghost" size="icon"
                  className="relative text-slate-400 hover:text-white hover:bg-white/5 rounded-xl h-10 w-10"
                  onClick={() => setShowNotifications(!showNotifications)}
                >
                  <Bell className="w-5 h-5" />
                  {totalUnreadCount > 0 && (
                    <motion.span initial={{ scale: 0 }} animate={{ scale: 1 }} className="absolute -top-0.5 -right-0.5 min-w-5 h-5 flex items-center justify-center px-1 bg-gradient-to-r from-violet-500 to-fuchsia-500 rounded-full text-[10px] text-white font-bold ring-2 ring-[#06060a]">
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
                            <Bell className="w-4 h-4 text-white" />
                          </div>
                          <span className="font-bold text-white text-sm">Notifications</span>
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
                                    <p className={cn("text-sm", !notification.is_read ? "font-bold text-white" : "text-slate-400 font-medium")}>
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

              {/* Quick Stats */}
              <div className="hidden xl:flex items-center gap-3 px-4 py-2 bg-white/[0.02] rounded-xl border border-white/[0.04]">
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 bg-emerald-400 rounded-full animate-pulse shadow-lg shadow-emerald-400/30" />
                  <span className="text-[10px] text-slate-600 font-semibold uppercase tracking-wider">Online</span>
                  <span className="text-sm font-bold text-emerald-400 tabular-nums">{onlineUsersCount}</span>
                </div>
                <div className="w-px h-5 bg-white/[0.06]" />
                <div className="flex items-center gap-2">
                  <Activity className="w-3.5 h-3.5 text-red-400" />
                  <span className="text-[10px] text-slate-600 font-semibold uppercase tracking-wider">Live</span>
                  <span className="text-sm font-bold text-red-400 tabular-nums">{liveStreamsCount}</span>
                </div>
              </div>

              {/* Mobile Avatar */}
              <button onClick={() => setShowProfileMenu(true)} className="lg:hidden">
                <Avatar className="w-9 h-9 border border-violet-400/20 ring-2 ring-violet-400/10 shadow-lg cursor-pointer">
                  <AvatarImage src={currentUser?.profile?.avatar_url} />
                  <AvatarFallback className="bg-gradient-to-br from-violet-500 via-purple-500 to-fuchsia-600 text-white text-xs font-bold">
                    {currentUser?.profile?.display_name?.charAt(0) || "A"}
                  </AvatarFallback>
                </Avatar>
              </button>
            </div>
          </div>
        </header>

        {/* Page Content */}
        <main className="flex-1 min-h-0 overflow-y-auto overflow-x-auto p-2 sm:p-3 md:p-5 lg:p-6 admin-content overscroll-contain" style={{ WebkitOverflowScrolling: 'touch', paddingBottom: 'max(calc(env(safe-area-inset-bottom, 0px) + 120px), 120px)' }}>
          <Suspense fallback={
            <div className="space-y-6 animate-in fade-in duration-200">
              <div className="bg-white/[0.02] rounded-2xl p-6 border border-white/[0.06]">
                <div className="flex items-center gap-4">
                  <div className="w-14 h-14 rounded-xl bg-white/[0.06] animate-pulse" />
                  <div className="space-y-2">
                    <div className="h-6 w-48 bg-white/[0.06] rounded-lg animate-pulse" />
                    <div className="h-4 w-32 bg-white/[0.04] rounded-lg animate-pulse" />
                  </div>
                </div>
              </div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {[...Array(4)].map((_, i) => (
                  <div key={i} className="bg-white/[0.02] border border-white/[0.06] rounded-2xl p-4 text-center space-y-2">
                    <div className="w-8 h-8 mx-auto bg-white/[0.06] rounded-lg animate-pulse" />
                    <div className="h-7 w-16 mx-auto bg-white/[0.06] rounded-lg animate-pulse" />
                    <div className="h-3 w-20 mx-auto bg-white/[0.04] rounded-lg animate-pulse" />
                  </div>
                ))}
              </div>
              <div className="bg-white/[0.02] border border-white/[0.06] rounded-2xl overflow-hidden">
                {[...Array(5)].map((_, i) => (
                  <div key={i} className="flex items-center gap-4 p-4 border-b border-white/[0.04] last:border-0">
                    <div className="w-10 h-10 rounded-full bg-white/[0.06] animate-pulse flex-shrink-0" />
                    <div className="space-y-2 flex-1">
                      <div className="h-4 w-40 bg-white/[0.06] rounded-lg animate-pulse" />
                      <div className="h-3 w-56 bg-white/[0.04] rounded-lg animate-pulse" />
                    </div>
                    <div className="h-8 w-20 bg-white/[0.06] rounded-lg animate-pulse" />
                  </div>
                ))}
              </div>
            </div>
          }>
            <Outlet />
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
