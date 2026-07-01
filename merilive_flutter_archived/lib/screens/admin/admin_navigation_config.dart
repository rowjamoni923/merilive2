import 'package:flutter/material.dart';
import 'package:lucide_icons/lucide_icons.dart';

class AdminNavItem {
  final String label;
  final IconData icon;
  final String path;
  final bool ownerOnly;

  AdminNavItem({
    required this.label,
    required this.icon,
    required this.path,
    this.ownerOnly = false,
  });
}

class AdminNavGroup {
  final String title;
  final List<AdminNavItem> items;

  AdminNavGroup({
    required this.title,
    required this.items,
  });
}

final List<AdminNavGroup> adminNavGroups = [
  AdminNavGroup(
    title: "Overview",
    items: [
      AdminNavItem(label: "Dashboard", icon: LucideIcons.layoutDashboard, path: "/admin"),
      AdminNavItem(label: "Reports & Analytics", icon: LucideIcons.trendingUp, path: "/admin/reports"),
    ],
  ),
  AdminNavGroup(
    title: "👤 User Hub",
    items: [
      AdminNavItem(label: "User Hub", icon: LucideIcons.users, path: "/admin/user-hub"),
      AdminNavItem(label: "User Management", icon: LucideIcons.userCog, path: "/admin/user-management"),
      AdminNavItem(label: "All Users", icon: LucideIcons.users, path: "/admin/users"),
      AdminNavItem(label: "Host Applications", icon: LucideIcons.userPlus, path: "/admin/host-applications"),
      AdminNavItem(label: "Host Search", icon: LucideIcons.search, path: "/admin/host-search"),
      AdminNavItem(label: "All Hosts", icon: LucideIcons.userCheck, path: "/admin/hosts"),
    ],
  ),
  AdminNavGroup(
    title: "🏢 Agency Hub",
    items: [
      AdminNavItem(label: "Agency Hub", icon: LucideIcons.building2, path: "/admin/agency-hub"),
      AdminNavItem(label: "All Agencies", icon: LucideIcons.building2, path: "/admin/agencies"),
      AdminNavItem(label: "Agency Policy", icon: LucideIcons.fileText, path: "/admin/agency-policy"),
      AdminNavItem(label: "Commissions", icon: LucideIcons.percent, path: "/admin/commissions"),
      AdminNavItem(label: "Commission Calculator", icon: LucideIcons.percent, path: "/admin/commission-calculator"),
    ],
  ),
  AdminNavGroup(
    title: "🛡️ Moderation",
    items: [
      AdminNavItem(label: "Moderation Hub", icon: LucideIcons.shield, path: "/admin/moderation"),
      AdminNavItem(label: "Face Verification", icon: LucideIcons.scanFace, path: "/admin/face-verification"),
      AdminNavItem(label: "Blocked Users", icon: LucideIcons.ban, path: "/admin/blocked"),
      AdminNavItem(label: "Live Bans", icon: LucideIcons.shieldAlert, path: "/admin/live-bans"),
      AdminNavItem(label: "Face Violations", icon: LucideIcons.scanFace, path: "/admin/face-violations"),
      AdminNavItem(label: "User Reports", icon: LucideIcons.shieldAlert, path: "/admin/user-reports"),
      AdminNavItem(label: "Device Management", icon: LucideIcons.smartphone, path: "/admin/device-management"),
      AdminNavItem(label: "Number Sharing", icon: LucideIcons.phone, path: "/admin/number-sharing"),
      AdminNavItem(label: "Contact Violations", icon: LucideIcons.shieldAlert, path: "/admin/contact-violations"),
    ],
  ),
  AdminNavGroup(
    title: "💰 Finance",
    items: [
      AdminNavItem(label: "Finance Hub", icon: LucideIcons.wallet, path: "/admin/finance"),
      AdminNavItem(label: "Diamond Trader Hub", icon: LucideIcons.coins, path: "/admin/coin-trader-hub"),
      AdminNavItem(label: "Diamond Traders", icon: LucideIcons.coins, path: "/admin/coin-traders"),
      AdminNavItem(label: "Trader Orders", icon: LucideIcons.shoppingBag, path: "/admin/coin-traders/orders"),
      AdminNavItem(label: "Trader Transactions", icon: LucideIcons.activity, path: "/admin/coin-traders/transactions"),
      AdminNavItem(label: "Diamonds Management", icon: LucideIcons.coins, path: "/admin/coins"),
      AdminNavItem(label: "Topup System", icon: LucideIcons.arrowUpCircle, path: "/admin/topup-system"),
      AdminNavItem(label: "Manual Topup", icon: LucideIcons.arrowUpCircle, path: "/admin/manual-topup"),
      AdminNavItem(label: "Withdrawals", icon: LucideIcons.trendingDown, path: "/admin/withdrawals"),
      AdminNavItem(label: "Balance Deduction", icon: LucideIcons.trendingDown, path: "/admin/balance-deduction"),
      AdminNavItem(label: "Transfer History", icon: LucideIcons.activity, path: "/admin/transfer-history"),
      AdminNavItem(label: "Recharge History", icon: LucideIcons.creditCard, path: "/admin/recharge-history"),
      AdminNavItem(label: "Payroll Orders", icon: LucideIcons.wallet, path: "/admin/payroll-orders"),
      AdminNavItem(label: "User Beans Exchange", icon: LucideIcons.coins, path: "/admin/user-beans-exchange"),
    ],
  ),
  AdminNavGroup(
    title: "🛒 Store",
    items: [
      AdminNavItem(label: "Store Hub", icon: LucideIcons.shoppingCart, path: "/admin/visual-assets"),
      AdminNavItem(label: "Shop", icon: LucideIcons.shoppingBag, path: "/admin/shop"),
      AdminNavItem(label: "Gifts", icon: LucideIcons.gift, path: "/admin/gifts"),
      AdminNavItem(label: "Avatar Frames", icon: LucideIcons.image, path: "/admin/frames"),
      AdminNavItem(label: "Entry Effects", icon: LucideIcons.sparkles, path: "/admin/entry-effects"),
      AdminNavItem(label: "Chat Bubbles", icon: LucideIcons.messageSquare, path: "/admin/chat-bubbles"),
      AdminNavItem(label: "Animation Store", icon: LucideIcons.play, path: "/admin/animation-store"),
      AdminNavItem(label: "Beauty Filters", icon: LucideIcons.sparkles, path: "/admin/beauty-filters"),
    ],
  ),
  AdminNavGroup(
    title: "📈 Level System",
    items: [
      AdminNavItem(label: "Level Hub", icon: LucideIcons.trendingUp, path: "/admin/level-management"),
      AdminNavItem(label: "Level Tiers", icon: LucideIcons.trendingUp, path: "/admin/level-tiers"),
      AdminNavItem(label: "Ranking Rewards", icon: LucideIcons.trendingUp, path: "/admin/ranking-rewards"),
      AdminNavItem(label: "Feature Levels", icon: LucideIcons.arrowUpCircle, path: "/admin/feature-levels"),
    ],
  ),
  AdminNavGroup(
    title: "👑 VIP & Noble",
    items: [
      AdminNavItem(label: "VIP Hub", icon: LucideIcons.crown, path: "/admin/vip-management"),
      AdminNavItem(label: "Noble Cards", icon: LucideIcons.creditCard, path: "/admin/noble-cards"),
      AdminNavItem(label: "VIP Medals", icon: LucideIcons.crown, path: "/admin/vip-medals"),
    ],
  ),
  AdminNavGroup(
    title: "🎮 Games",
    items: [
      AdminNavItem(label: "Game Hub", icon: LucideIcons.gamepad2, path: "/admin/game-management"),
      AdminNavItem(label: "Game Settings", icon: LucideIcons.settings, path: "/admin/game-settings"),
      AdminNavItem(label: "Game Leaderboard", icon: LucideIcons.crown, path: "/admin/game-leaderboard"),
    ],
  ),
  AdminNavGroup(
    title: "📞 Calling",
    items: [
      AdminNavItem(label: "Call Settings", icon: LucideIcons.phone, path: "/admin/call-settings"),
      AdminNavItem(label: "Agora RTC", icon: LucideIcons.video, path: "/admin/agora-settings", ownerOnly: true),
    ],
  ),
  AdminNavGroup(
    title: "📺 Content",
    items: [
      AdminNavItem(label: "Content Hub", icon: LucideIcons.image, path: "/admin/content-management"),
      AdminNavItem(label: "Banners", icon: LucideIcons.image, path: "/admin/banners"),
      AdminNavItem(label: "Streams", icon: LucideIcons.video, path: "/admin/streams"),
      AdminNavItem(label: "Reels", icon: LucideIcons.video, path: "/admin/reels"),
      AdminNavItem(label: "Leaderboard", icon: LucideIcons.crown, path: "/admin/leaderboard-management"),
    ],
  ),
  AdminNavGroup(
    title: "⚙️ Settings",
    items: [
      AdminNavItem(label: "Settings Hub", icon: LucideIcons.settings, path: "/admin/app-settings-hub"),
      AdminNavItem(label: "Branding", icon: LucideIcons.image, path: "/admin/branding"),
      AdminNavItem(label: "Popup Banners", icon: LucideIcons.image, path: "/admin/popup-banners"),
      AdminNavItem(label: "App Version", icon: LucideIcons.smartphone, path: "/admin/app-version"),
      AdminNavItem(label: "Event Themes", icon: LucideIcons.sparkles, path: "/admin/theme-manager"),
      AdminNavItem(label: "Sub-Admin", icon: LucideIcons.shield, path: "/admin/sub-admins", ownerOnly: true),
    ],
  ),
  AdminNavGroup(
    title: "📟 Debug & Logs",
    items: [
      AdminNavItem(label: "Activity Logs", icon: LucideIcons.terminal, path: "/admin/logs"),
      AdminNavItem(label: "Error Logs", icon: LucideIcons.alertCircle, path: "/admin/error-logs"),
      AdminNavItem(label: "App Blueprint", icon: LucideIcons.map, path: "/admin/blueprint", ownerOnly: true),
    ],
  ),
];


