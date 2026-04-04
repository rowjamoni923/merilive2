/**
 * =====================================================
 * UNIFIED GIFTING MODULE
 * =====================================================
 * 
 * Single source for ALL gifting functionality across the app.
 * Change here = Change everywhere automatically
 * 
 * ONE LINK = ONE UPDATE = ALL SECTIONS UPDATED
 * - Live Stream Gifting
 * - Party Room Gifting
 * - Call Screen Gifting
 * - Chat/DM Gifting
 * - Profile Page Gifting
 * 
 * Usage: import { GiftPanel, GiftingService, FlyingGiftAnimation } from '@/features/shared/gifting';
 * =====================================================
 */

// ========== CORE SERVICE (Business Logic) ==========
export * from './GiftingService';

// ========== MAIN GIFT PANEL (THE SINGLE LINK) ==========
// This is THE SINGLE LINK for gift selection UI across ALL sections
export { GiftPanel } from '@/components/live/GiftPanel';
export type { GiftData } from '@/components/live/GiftPanel';

// ========== ANIMATION COMPONENTS ==========
export { FlyingGiftAnimation, useFlyingGifts } from '@/components/live/FlyingGiftAnimation';
export type { FlyingGift } from '@/components/live/FlyingGiftAnimation';

export { default as GiftComboDisplay, MiniGiftNotification } from '@/components/live/GiftComboDisplay';
export { default as FullScreenGiftAnimation } from '@/components/level/FullScreenGiftAnimation';
export { default as GiftAnimation } from '@/components/live/GiftAnimation';
export { default as LottieGiftAnimation } from '@/components/live/LottieGiftEffects';
export { default as PremiumFlyingGiftBanner, useFlyingGiftBanners } from '@/components/live/PremiumFlyingGiftBanner';

// ========== ROOM GIFTS (From Room System) ==========
export { useRoomGifts } from '@/features/shared/room/useRoomGifts';

// ========== LEGACY EXPORTS (For backward compatibility) ==========
// These are deprecated - use GiftPanel from above instead
export { ChatGiftPanel } from '@/components/chat/ChatGiftPanel';
export { default as PartyGiftPanel } from '@/components/party/PartyGiftPanel';
