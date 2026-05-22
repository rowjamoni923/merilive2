/**
 * =====================================================
 * SHARED FEATURES MODULE
 * =====================================================
 * 
 * This module exports all shared components, hooks, and services
 * that are used across multiple features (Live, Party, Call, Chat, etc.)
 * 
 * CORE PRINCIPLE: One Link = All Places
 * Change here = Change everywhere automatically
 * 
 * Usage: import { SVGAPlayer, GiftPanel, useSound } from '@/features/shared';
 * =====================================================
 */

// ========== UNIFIED SYSTEMS (Sub-modules) ==========
// These are the main shared systems - change one = update everywhere

// 🎁 Gifting System - Used in Live, Party, Call, Chat
export * from './gifting';

// ✨ Animation System - SVGA, Lottie, VAP, Entry Effects
export * from './animations';

// 🖼️ Frame System - Avatar frames everywhere
export * from './frames';

// 💬 Messaging System - Chat in Live, Party, Direct Messages
export * from './messaging';

// 👥 Viewer System - Used in Live Streams and Party Rooms
export * from './viewers';

// 👤 Profile Card - Unified Small Style Card for Live & Party
export * from './profile';

// 🎖️ Level System - Centralized level badges and utilities
// ONE EDIT HERE = ALL PLACES UPDATED (Live & Party Rooms, Chat, Viewers)
export * from './level';

// 🏠 Room System - Unified for Live Streams & Party Rooms
// ONE EDIT HERE = BOTH LIVE AND PARTY UPDATED
export * from './room';
// ========== LEVEL & BADGES ==========
export { default as LevelBadge } from '@/components/common/LevelBadge';
export { default as AnimatedLevelBadge } from '@/components/common/AnimatedLevelBadge';
export { default as VIPBadge } from '@/components/common/VIPBadge';
export { VerifiedBadge } from '@/components/common/VerifiedBadge';

// ========== ICONS ==========
export { default as BeansIcon } from '@/components/common/BeansIcon';
export { default as Beans3DIcon } from '@/components/common/Beans3DIcon';
export { default as Diamond3DIcon } from '@/components/common/Diamond3DIcon';

// ========== UI UTILITIES ==========
export { default as LoadingSpinner } from '@/components/common/LoadingSpinner';
export { default as Logo3DLoader } from '@/components/common/Logo3DLoader';
export { default as NetworkStatusBar } from '@/components/common/NetworkStatusBar';
export { default as PlaceholderPage } from '@/components/common/PlaceholderPage';

// ========== PROVIDERS ==========
export { default as RealtimeProvider } from '@/components/common/RealtimeProvider';
export { default as PresenceProvider } from '@/components/common/PresenceProvider';

// ========== SHARED HOOKS ==========
export { useSound } from '@/hooks/useSound';
export { usePresence } from '@/hooks/usePresence';
export { useNetworkStatus } from '@/hooks/useNetworkStatus';
// useRealtimeSubscription removed in Pkg95 (dead code, zero callers, latent $1400-rule footguns).
export { useUniversalRealtime } from '@/hooks/useUniversalRealtime';
export { useFeatureLevelCheck } from '@/hooks/useFeatureLevelCheck';
export { useUserPrivileges } from '@/hooks/useUserPrivileges';
export { useNotifications } from '@/hooks/useNotifications';
export { useAppState } from '@/hooks/useAppState';
export { useNativeBackButton } from '@/hooks/useNativeBackButton';
export { useGeolocation } from '@/hooks/useGeolocation';
export { useRoomProtection } from '@/hooks/useRoomProtection';
export { useMobileOptimization, useMobileSafeAreaCSS, useFullScreenHeight } from '@/hooks/useMobileOptimization';
export { useTaskProgress, trackTaskProgress } from '@/hooks/useTaskProgress';
export { useContentModeration } from '@/hooks/useContentModeration';
