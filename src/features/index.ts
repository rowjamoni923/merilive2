/**
 * =====================================================
 * MERILIVE MODULAR ARCHITECTURE
 * =====================================================
 * 
 * This is the MASTER index for all feature modules.
 * 
 * ARCHITECTURE PRINCIPLE:
 * - Each feature is ISOLATED (Live, Party, Call, Chat, Profile, Agency, Admin)
 * - Shared systems use SINGLE LINK (Gifting, Animations, Frames, Messaging, Calling)
 * 
 * When you change a SHARED system, it updates EVERYWHERE automatically.
 * When you change a FEATURE, only that feature is affected.
 * 
 * =====================================================
 * 
 * SINGLE LINK SYSTEMS:
 * 
 * 🎁 GIFTING: import { GiftPanel } from '@/features/shared/gifting'
 *    → Used in: Live, Party, Call, Chat, Profile
 *    → ONE CHANGE = ALL UPDATED
 * 
 * 💬 MESSAGING: import { PremiumJoinChatOverlay } from '@/features/shared/messaging'
 *    → Used in: Live, Party
 *    → ONE CHANGE = ALL UPDATED
 * 
 * 📞 CALLING: import { useCall, CallButton } from '@/features/call'
 *    → Used in: Live, Chat, Profile
 *    → ONE CHANGE = ALL UPDATED
 * 
 * 🏠 ROOM: import { useRoomParticipants, RoomChatOverlay } from '@/features/shared/room'
 *    → Used in: Live, Party
 *    → ONE CHANGE = ALL UPDATED
 * 
 * =====================================================
 */

// ========== SHARED SYSTEMS (One Link = All Places) ==========
// Change here = Change everywhere

// All shared components, hooks, gifting, animations, frames, messaging, room
export * from './shared';

// ========== CALLING SYSTEM (One Link = All Places) ==========
// useCall() hook works from ANYWHERE
export { useCall, CallProvider, CallButton, CallConfirmModal, ActiveCallScreen } from './call';

// ========== ISOLATED FEATURES (Independent Modules) ==========
// Change one = Only that one changes

// Home Page
export * as HomeFeature from './home';

// Live Streaming
export * as LiveFeature from './live';

// Party Rooms (Audio, Video, Games)
export * as PartyFeature from './party';

// Private Calling (Full module)
export * as CallFeature from './call';

// Direct Chat/Messages
export * as ChatFeature from './chat';

// User Profiles
export * as ProfileFeature from './profile';

// Agency Management
export * as AgencyFeature from './agency';

// Admin Panel
export * as AdminFeature from './admin';

// Reels/Short Videos
export * as ReelsFeature from './reels';

// VIP Membership
export * as VIPFeature from './vip';

// Shop/Store
export * as ShopFeature from './shop';


// Feature type definitions for documentation
export type FeatureModule = 
  | 'shared'
  | 'live'
  | 'party'
  | 'call'
  | 'chat'
  | 'profile'
  | 'agency'
  | 'admin'
  | 'home'
  | 'reels'
  | 'vip'
  | 'shop';

/**
 * Feature Dependencies Map
 * Shows which shared components each feature depends on
 */
export const FEATURE_DEPENDENCIES: Record<FeatureModule, string[]> = {
  shared: [],
  home: ['shared'],
  live: ['shared'],
  party: ['shared'],
  call: ['shared'],
  chat: ['shared'],
  profile: ['shared'],
  agency: ['shared'],
  admin: ['shared'],
  reels: ['shared'],
  vip: ['shared'],
  shop: ['shared'],
};

/**
 * SINGLE LINK COMPONENT MAPPING
 * Quick reference for which components are unified
 */
export const SINGLE_LINK_COMPONENTS = {
  // Gifting
  GiftPanel: '@/features/shared/gifting',
  FlyingGiftAnimation: '@/features/shared/gifting',
  GiftingService: '@/features/shared/gifting',
  
  // Messaging
  PremiumJoinChatOverlay: '@/features/shared/messaging',
  RoomChatOverlay: '@/features/shared/room',
  
  // Calling
  useCall: '@/features/call',
  CallProvider: '@/features/call',
  CallButton: '@/features/call',
  
  // Room System
  useRoomParticipants: '@/features/shared/room',
  useRoomGifts: '@/features/shared/room',
  FlyingJoinBanner: '@/features/shared/room',
};
