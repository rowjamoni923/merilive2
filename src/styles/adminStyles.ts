// ============================================
// ADMIN PANEL DESIGN SYSTEM - Cloud White Theme
// ============================================

// Core Color Palette with semantic naming
export const adminColors = {
  // Backgrounds
  pageBg: "bg-white", // Main page background
  cardBg: "bg-white", // Card backgrounds
  cardBgAlt: "bg-slate-50", // Alternate card background
  surfaceBg: "bg-slate-50", // Surface elements
  hoverBg: "hover:bg-slate-100", // Hover states
  
  // Text Colors
  textPrimary: "text-slate-950",
  textSecondary: "text-slate-700",
  textMuted: "text-slate-500",
  textDark: "text-slate-900",
  
  // Borders
  border: "border-slate-200",
  borderLight: "border-slate-100",
  borderFocus: "focus:border-blue-500",
  
  // Shadows
  shadow: "shadow-xl shadow-slate-200/70",
  shadowCard: "shadow-lg shadow-slate-200/60",
};

// Section Header Gradients - Unique color for each section
export const sectionGradients = {
  // Overview Section - Blue
  overview: "from-blue-600 via-blue-700 to-indigo-800",
  dashboard: "from-blue-600 via-blue-700 to-indigo-800",
  reports: "from-blue-500 via-indigo-600 to-purple-700",
  logs: "from-slate-600 via-slate-700 to-slate-800",
  
  // User Management - Purple/Violet
  userManagement: "from-purple-600 via-violet-600 to-indigo-700",
  helperManagement: "from-fuchsia-600 via-purple-600 to-violet-700",
  
  // Moderation & Bans - Red
  moderation: "from-red-600 via-rose-600 to-pink-700",
  liveBans: "from-red-700 via-red-600 to-rose-700",
  
  // Level 5 Helpers - Gold/Amber
  level5Helpers: "from-amber-500 via-yellow-500 to-orange-600",
  
  // Agency Management - Emerald/Teal
  agencies: "from-emerald-600 via-teal-600 to-cyan-700",
  agencyTransfer: "from-teal-600 via-emerald-600 to-green-700",
  
  // Level System - Indigo/Blue
  levelTiers: "from-indigo-600 via-blue-600 to-cyan-600",
  levelPrivileges: "from-blue-600 via-indigo-600 to-violet-600",
  featureLevels: "from-cyan-600 via-blue-600 to-indigo-600",
  invitation: "from-pink-500 via-rose-500 to-orange-500",
  
  // Calling System - Cyan
  callSettings: "from-cyan-600 via-blue-600 to-indigo-600",
  callPricing: "from-blue-600 via-cyan-500 to-teal-500",
  
  // Coin & Trader System - Gold/Yellow
  diamonds: "from-yellow-500 via-amber-500 to-orange-500",
  topup: "from-amber-600 via-yellow-500 to-orange-500",
  paymentGateways: "from-green-500 via-emerald-500 to-teal-500",
  traders: "from-orange-500 via-amber-500 to-yellow-500",
  
  // Content Management - Pink/Rose
  streams: "from-rose-500 via-pink-500 to-fuchsia-500",
  reels: "from-pink-500 via-rose-500 to-red-500",
  partyRooms: "from-fuchsia-500 via-purple-500 to-pink-500",
  games: "from-violet-500 via-purple-500 to-fuchsia-500",
  gifts: "from-pink-400 via-rose-400 to-red-400",
  shop: "from-purple-500 via-fuchsia-500 to-pink-500",
  banners: "from-rose-500 via-pink-500 to-purple-500",
  content: "from-slate-600 via-gray-600 to-slate-700",
  
  // Finance - Green
  commissions: "from-green-600 via-emerald-600 to-teal-600",
  withdrawals: "from-emerald-600 via-green-600 to-lime-600",
  balance: "from-teal-600 via-emerald-600 to-green-600",
  
  // Settings - Gray/Slate
  branding: "from-slate-600 via-gray-600 to-zinc-700",
  notifications: "from-blue-600 via-indigo-600 to-violet-600",
  settings: "from-slate-600 via-gray-700 to-slate-800",
};

// Stats Card Colors - Vibrant gradients for metrics
export const statsCardColors = {
  blue: {
    bg: "bg-gradient-to-br from-blue-500/20 to-blue-600/10",
    border: "border-blue-500/30",
    iconBg: "bg-blue-500/30",
    iconColor: "text-blue-400",
    textColor: "text-blue-400",
  },
  purple: {
    bg: "bg-gradient-to-br from-purple-500/20 to-purple-600/10",
    border: "border-purple-500/30",
    iconBg: "bg-purple-500/30",
    iconColor: "text-purple-400",
    textColor: "text-purple-400",
  },
  pink: {
    bg: "bg-gradient-to-br from-pink-500/20 to-pink-600/10",
    border: "border-pink-500/30",
    iconBg: "bg-pink-500/30",
    iconColor: "text-pink-400",
    textColor: "text-pink-400",
  },
  green: {
    bg: "bg-gradient-to-br from-green-500/20 to-green-600/10",
    border: "border-green-500/30",
    iconBg: "bg-green-500/30",
    iconColor: "text-green-400",
    textColor: "text-green-400",
  },
  amber: {
    bg: "bg-gradient-to-br from-amber-500/20 to-amber-600/10",
    border: "border-amber-500/30",
    iconBg: "bg-amber-500/30",
    iconColor: "text-amber-400",
    textColor: "text-amber-400",
  },
  cyan: {
    bg: "bg-gradient-to-br from-cyan-500/20 to-cyan-600/10",
    border: "border-cyan-500/30",
    iconBg: "bg-cyan-500/30",
    iconColor: "text-cyan-400",
    textColor: "text-cyan-400",
  },
  red: {
    bg: "bg-gradient-to-br from-red-500/20 to-red-600/10",
    border: "border-red-500/30",
    iconBg: "bg-red-500/30",
    iconColor: "text-red-400",
    textColor: "text-red-400",
  },
  emerald: {
    bg: "bg-gradient-to-br from-emerald-500/20 to-emerald-600/10",
    border: "border-emerald-500/30",
    iconBg: "bg-emerald-500/30",
    iconColor: "text-emerald-400",
    textColor: "text-emerald-400",
  },
};

// Shared Admin Panel Styles
export const adminStyles = {
  // Page Container
  pageContainer: "space-y-4 md:space-y-6 px-3 md:px-4 pb-6",
  
  // ============================================
  // HEADER STYLES
  // ============================================
  header: "flex flex-col gap-3 p-4 md:p-6 bg-white rounded-xl md:rounded-2xl shadow-xl shadow-slate-200/70 border border-slate-200",
  headerGradient: (color: string) => `flex flex-col gap-3 p-4 md:p-6 bg-gradient-to-r ${color} rounded-xl md:rounded-2xl shadow-xl border-0`,
  headerTitle: "text-lg md:text-2xl font-bold text-slate-950",
  headerTitleWhite: "text-lg md:text-2xl font-bold text-white flex items-center gap-2",
  headerSubtitle: "text-sm text-slate-600 font-medium",
  headerSubtitleWhite: "text-white/80 text-sm mt-1",
  
  // ============================================
  // CARD STYLES
  // ============================================
  card: "bg-white border border-slate-200 shadow-lg shadow-slate-200/60 rounded-xl text-slate-950",
  cardHover: "bg-white border border-slate-200 shadow-lg shadow-slate-200/60 hover:shadow-xl hover:shadow-blue-100/70 hover:border-blue-200 transition-all rounded-xl text-slate-950",
  cardGradient: (colors: string) => `bg-gradient-to-br ${colors} border-0 shadow-xl rounded-xl`,
  cardDark: "bg-white border border-slate-200 rounded-xl text-slate-950",
  cardWhite: "bg-white border border-slate-200 shadow-lg rounded-xl",
  
  // ============================================
  // STATS CARD STYLES
  // ============================================
  statsCard: "bg-white border border-slate-200 shadow-lg shadow-slate-200/60 rounded-xl text-slate-950",
  statsCardBlue: "bg-gradient-to-br from-blue-500/20 to-blue-600/10 border border-blue-500/30 shadow-lg rounded-xl",
  statsCardPink: "bg-gradient-to-br from-pink-500/20 to-pink-600/10 border border-pink-500/30 shadow-lg rounded-xl",
  statsCardGreen: "bg-gradient-to-br from-green-500/20 to-green-600/10 border border-green-500/30 shadow-lg rounded-xl",
  statsCardPurple: "bg-gradient-to-br from-purple-500/20 to-purple-600/10 border border-purple-500/30 shadow-lg rounded-xl",
  statsCardYellow: "bg-gradient-to-br from-yellow-500/20 to-yellow-600/10 border border-yellow-500/30 shadow-lg rounded-xl",
  statsCardOrange: "bg-gradient-to-br from-orange-500/20 to-orange-600/10 border border-orange-500/30 shadow-lg rounded-xl",
  statsCardCyan: "bg-gradient-to-br from-cyan-500/20 to-cyan-600/10 border border-cyan-500/30 shadow-lg rounded-xl",
  statsCardRed: "bg-gradient-to-br from-red-500/20 to-red-600/10 border border-red-500/30 shadow-lg rounded-xl",
  
  // ============================================
  // TEXT STYLES
  // ============================================
  textPrimary: "text-slate-950 font-bold",
  textSecondary: "text-slate-700 font-medium",
  textMuted: "text-slate-500",
  textValue: "text-xl md:text-2xl font-extrabold text-slate-950",
  textLabel: "text-sm text-slate-500 font-medium",
  textWhite: "text-white",
  textDark: "text-slate-900",
  
  // ============================================
  // TABLE STYLES
  // ============================================
  table: "w-full text-sm",
  tableContainer: "bg-white border border-slate-200 rounded-xl overflow-hidden",
  tableHeader: "border-b border-slate-200 bg-slate-50",
  tableHeaderCell: "text-left p-3 text-slate-700 font-bold text-xs uppercase tracking-wide",
  tableRow: "border-b border-slate-200 hover:bg-slate-50 transition-colors",
  tableCell: "p-3",
  tableCellText: "text-slate-900 font-medium text-sm",
  
  // ============================================
  // BADGE STYLES
  // ============================================
  badgePending: "bg-amber-50 text-amber-800 border border-amber-200 font-semibold",
  badgeApproved: "bg-emerald-50 text-emerald-800 border border-emerald-200 font-semibold",
  badgeRejected: "bg-red-50 text-red-800 border border-red-200 font-semibold",
  badgeInfo: "bg-blue-50 text-blue-800 border border-blue-200 font-semibold",
  badgePurple: "bg-violet-50 text-violet-800 border border-violet-200 font-semibold",
  badgeOnline: "bg-emerald-50 text-emerald-800 border border-emerald-200 font-semibold",
  badgeOffline: "bg-slate-100 text-slate-700 border border-slate-200 font-semibold",
  badgeBlocked: "bg-red-50 text-red-800 border border-red-200 font-semibold",
  badgeActive: "bg-emerald-50 text-emerald-800 border border-emerald-200 font-semibold",
  
  // ============================================
  // BUTTON STYLES
  // ============================================
  buttonPrimary: "bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white font-bold shadow-lg shadow-blue-500/25",
  buttonSecondary: "bg-white hover:bg-slate-50 text-slate-900 font-semibold border border-slate-200 shadow-sm",
  buttonDanger: "bg-gradient-to-r from-red-600 to-rose-600 hover:from-red-700 hover:to-rose-700 text-white font-bold shadow-lg shadow-red-500/25",
  buttonSuccess: "bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-700 hover:to-emerald-700 text-white font-bold shadow-lg shadow-green-500/25",
  buttonOutline: "border-2 border-slate-200 hover:bg-slate-50 text-slate-900 font-semibold",
  buttonGhost: "hover:bg-slate-100 text-slate-700 font-semibold",
  buttonWhite: "bg-white/20 hover:bg-white/30 text-white font-semibold border border-white/30",
  
  // ============================================
  // INPUT STYLES
  // ============================================
  input: "bg-white border border-slate-300 text-slate-950 focus:border-blue-500 focus:ring-blue-500/20 rounded-lg placeholder:text-slate-400",
  inputWithIcon: "pl-10 bg-white border border-slate-300 text-slate-950 rounded-lg placeholder:text-slate-400",
  inputDark: "bg-white border border-slate-300 text-slate-950 placeholder:text-slate-400",
  select: "bg-white border border-slate-300 text-slate-950 rounded-lg",
  
  // ============================================
  // FILTER/SEARCH BAR
  // ============================================
  filterBar: "p-3 md:p-4 bg-white rounded-xl border border-slate-200 shadow-sm",
  filterRow: "flex flex-col md:flex-row gap-3",
  searchBar: "bg-white border border-slate-300 text-slate-950 rounded-lg",
  
  // ============================================
  // LOADING & EMPTY STATES
  // ============================================
  loadingContainer: "flex items-center justify-center h-64",
  loadingSpinner: "w-10 h-10 border-4 border-blue-500 border-t-transparent rounded-full animate-spin",
  emptyContainer: "flex flex-col items-center justify-center h-64 text-slate-500 bg-slate-50 rounded-xl border border-slate-200",
  emptyIcon: "w-12 h-12 mb-4 text-slate-400",
  emptyText: "font-bold text-slate-600",
  
  // ============================================
  // TABS
  // ============================================
  tabsList: "bg-slate-100 border border-slate-200 mb-4 p-1 rounded-lg",
  tabsTrigger: "data-[state=active]:bg-blue-600 data-[state=active]:text-white text-slate-600 font-semibold text-xs md:text-sm rounded-md px-3 py-2",
  tabsTriggerAlt: "data-[state=active]:bg-gradient-to-r data-[state=active]:from-blue-600 data-[state=active]:to-indigo-600 data-[state=active]:text-white text-slate-400 font-semibold",
  
  // ============================================
  // DIALOG/MODAL
  // ============================================
  dialogContent: "bg-white border border-slate-200 rounded-xl max-w-[95vw] md:max-w-lg text-slate-950 shadow-2xl shadow-slate-300/40",
  dialogHeader: "text-slate-950 font-bold text-lg",
  dialogDescription: "text-slate-600",
  dialogOverlay: "bg-slate-950/45",
  
  // ============================================
  // DROPDOWN
  // ============================================
  dropdownContent: "bg-white border border-slate-200 shadow-xl rounded-lg",
  dropdownItem: "text-slate-700 font-medium hover:bg-blue-50 focus:bg-blue-50 hover:text-blue-700 focus:text-blue-700",
  
  // ============================================
  // GRID LAYOUTS
  // ============================================
  gridCols2: "grid grid-cols-1 md:grid-cols-2 gap-3 md:gap-4",
  gridCols3: "grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 md:gap-4",
  gridCols4: "grid grid-cols-2 md:grid-cols-4 gap-3",
  gridStatsCards: "grid grid-cols-2 lg:grid-cols-4 gap-3",
  
  // ============================================
  // ICON CONTAINERS
  // ============================================
  iconContainer: (color: string) => `w-10 h-10 rounded-xl flex items-center justify-center ${color} shadow-lg`,
  iconContainerLg: (color: string) => `w-12 h-12 md:w-14 md:h-14 rounded-xl flex items-center justify-center ${color} shadow-lg`,
  
  // ============================================
  // STATUS INDICATORS
  // ============================================
  statusOnline: "w-3 h-3 bg-emerald-500 rounded-full border-2 border-white shadow-sm",
  statusOffline: "w-3 h-3 bg-slate-400 rounded-full border-2 border-white shadow-sm",
  statusBusy: "w-3 h-3 bg-red-500 rounded-full border-2 border-white shadow-sm",
  
  // ============================================
  // SECTION ELEMENTS
  // ============================================
  sectionTitle: "text-base md:text-lg font-bold text-slate-950 mb-3",
  sectionSubtitle: "text-sm text-slate-600 mb-4",
  sectionCard: "bg-white border border-slate-200 rounded-xl p-4 md:p-6 shadow-sm",
  
  // ============================================
  // LIST ITEMS
  // ============================================
  listItem: "flex items-center justify-between p-3 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors",
  listItemText: "text-slate-950 font-medium",
  
  // ============================================
  // FORM ELEMENTS
  // ============================================
  formGroup: "space-y-2",
  formLabel: "text-sm font-semibold text-slate-700",
  formHelper: "text-xs text-slate-500 mt-1",
  
  // ============================================
  // PAGINATION
  // ============================================
  pagination: "flex flex-col md:flex-row items-center justify-between gap-3 p-4 border-t border-slate-200 bg-slate-50",
  paginationInfo: "text-sm text-slate-600 font-medium",
  paginationButtons: "flex items-center gap-2",
  
  // ============================================
  // CHARTS
  // ============================================
  chartCard: "bg-white border border-slate-200 rounded-xl p-4 shadow-sm",
  chartTitle: "text-slate-950 font-bold text-lg mb-4 flex items-center gap-2",
  chartContainer: "h-64 md:h-80",
};

// Color Gradients for Headers/Cards
export const gradients = {
  blue: "from-blue-600 to-indigo-600",
  pink: "from-pink-500 to-rose-500",
  purple: "from-purple-600 to-violet-600",
  green: "from-green-500 to-emerald-500",
  yellow: "from-yellow-500 to-amber-500",
  orange: "from-orange-500 to-red-500",
  cyan: "from-cyan-500 to-blue-500",
  red: "from-red-500 to-rose-500",
    dark: "from-slate-600 to-slate-700",
  gold: "from-amber-400 via-yellow-400 to-orange-400",
  emerald: "from-emerald-500 to-teal-500",
  fuchsia: "from-fuchsia-500 to-purple-500",
  rose: "from-rose-400 to-pink-400",
};

// Icon Background Colors
export const iconBgColors = {
  blue: "bg-blue-50 text-blue-700 border border-blue-100",
  pink: "bg-pink-50 text-pink-700 border border-pink-100",
  purple: "bg-violet-50 text-violet-700 border border-violet-100",
  green: "bg-emerald-50 text-emerald-700 border border-emerald-100",
  yellow: "bg-amber-50 text-amber-800 border border-amber-100",
  orange: "bg-orange-50 text-orange-700 border border-orange-100",
  red: "bg-red-50 text-red-700 border border-red-100",
  cyan: "bg-cyan-50 text-cyan-700 border border-cyan-100",
  gray: "bg-slate-100 text-slate-700 border border-slate-200",
  emerald: "bg-emerald-50 text-emerald-700 border border-emerald-100",
  amber: "bg-amber-50 text-amber-800 border border-amber-100",
  indigo: "bg-indigo-50 text-indigo-700 border border-indigo-100",
  fuchsia: "bg-fuchsia-50 text-fuchsia-700 border border-fuchsia-100",
  rose: "bg-rose-50 text-rose-700 border border-rose-100",
  teal: "bg-teal-50 text-teal-700 border border-teal-100",
  violet: "bg-violet-50 text-violet-700 border border-violet-100",
};

// Mobile-specific utilities
export const mobileStyles = {
  buttonFullMobile: "w-full md:w-auto",
  paddingCompact: "p-3 md:p-4",
  textResponsive: "text-sm md:text-base",
  hideMobile: "hidden md:block",
  showMobile: "block md:hidden",
  stackMobile: "flex flex-col md:flex-row",
  cardCompact: "p-3 md:p-4 bg-white border border-slate-200 rounded-lg shadow-sm",
};

// Chart Theme for Recharts
export const chartTheme = {
  backgroundColor: "transparent",
  gridColor: "#E2E8F0", // slate-200
  axisColor: "#64748B", // slate-500
  tooltipBg: "#FFFFFF",
  tooltipBorder: "#CBD5E1",
  colors: {
    primary: "#3b82f6", // blue-500
    secondary: "#8b5cf6", // violet-500
    success: "#22c55e", // green-500
    warning: "#f59e0b", // amber-500
    danger: "#ef4444", // red-500
    info: "#06b6d4", // cyan-500
  },
};

export default adminStyles;
