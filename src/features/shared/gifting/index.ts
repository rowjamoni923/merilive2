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
export { FlyingGiftAnimation } from '@/components/live/FlyingGiftAnimation';
export { useFlyingGifts } from '@/hooks/useFlyingGifts';
export type { FlyingGift } from '@/components/live/FlyingGiftAnimation';

// ========== UNIFIED INLINE GIFT CHAT ROW (DM / Live / Party / Call) ==========
export { InlineGiftRow, encodeInlineGiftMarker, parseInlineGiftMarker } from '@/components/shared/InlineGiftRow';
export type { InlineGiftRowProps } from '@/components/shared/InlineGiftRow';

export { default as GiftComboDisplay, MiniGiftNotification } from '@/components/live/GiftComboDisplay';
export { default as FullScreenGiftAnimation } from '@/components/level/FullScreenGiftAnimation';
export { default as GiftAnimation } from '@/components/live/GiftAnimation';
export { default as LottieGiftAnimation } from '@/components/live/LottieGiftEffects';
export { default as PremiumFlyingGiftBanner } from '@/components/live/PremiumFlyingGiftBanner';
export { useFlyingGiftBanners } from '@/hooks/useFlyingGiftBanners';

// ========== ROOM GIFTS (From Room System) ==========
export { useRoomGifts } from '@/features/shared/room/useRoomGifts';

// Legacy panels (ChatGiftPanel / PartyGiftPanel) removed 2026-07-02 —
// all surfaces route through the canonical `GiftPanel` above.

