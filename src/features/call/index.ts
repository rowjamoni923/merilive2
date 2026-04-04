/**
 * =====================================================
 * UNIFIED CALLING MODULE
 * =====================================================
 * 
 * Single source for ALL calling functionality across the app.
 * Change here = Change everywhere automatically
 * 
 * ONE LINK = ONE UPDATE = ALL SECTIONS UPDATED
 * - Live Stream Call Button
 * - Chat Page Call Button
 * - Profile Page Call Button
 * - Incoming Call Modal
 * - Active Call Screen
 * 
 * Usage: import { useCall, CallButton, CallConfirmModal } from '@/features/call';
 * =====================================================
 */

// ========== MAIN PROVIDER & HOOK (THE SINGLE LINK) ==========
// Use useCall() hook to trigger calls from ANYWHERE in the app
export { CallProvider, useCall } from '@/components/call/CallProvider';

// ========== UI COMPONENTS ==========
export { ActiveCallScreen } from '@/components/call/ActiveCallScreen';
export { CallButton } from '@/components/call/CallButton';
export { CallConfirmModal } from '@/components/call/CallConfirmModal';
export { CallEndedModal } from '@/components/call/CallEndedModal';
export { CallRatingModal } from '@/components/call/CallRatingModal';
export { IncomingCallModal } from '@/components/call/IncomingCallModal';

// ========== PAGES ==========
export { default as CallHistoryPage } from '@/pages/CallHistory';

// ========== HOOKS ==========
export { useCallBilling } from '@/hooks/useCallBilling';
export { useHostCallRate } from '@/hooks/useHostCallRate';
export { usePrivateCall } from '@/hooks/usePrivateCall';
export { useAgoraCall } from '@/hooks/useAgoraCall';
export { useCallPhoneDetection } from '@/hooks/useCallPhoneDetection';
