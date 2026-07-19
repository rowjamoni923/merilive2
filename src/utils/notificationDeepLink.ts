/**
 * Centralized push-notification deep-link resolver.
 *
 * Used by:
 *  - src/hooks/usePushNotifications.ts (Capacitor native taps on Android / iOS)
 *  - src/services/firebaseMessaging.ts (web foreground notification.onclick)
 *
 * The web service worker (public/firebase-messaging-sw.js) keeps an
 * intentionally-mirrored copy of this map because service-worker scripts
 * can't import ES modules from /src. Keep the two in sync when adding
 * new notification types.
 */
export type NotificationData = Record<string, string | number | undefined | null> & {
  type?: string;
};

const str = (v: unknown): string => (v == null ? "" : String(v));

export function getNotificationPath(data: NotificationData | null | undefined): string {
  if (!data) return "/chat?tab=notifications";
  const type = str(data.type);

  // Calls
  if (type === "incoming_call" || type === "call") {
    return `/call?callId=${str(data.call_id || data.callId)}`;
  }
  if (type === "call_missed" || type === "call_received") return "/call-history";

  // Direct messages — open Chat page focused on the sender's conversation.
  // The /chat/:id pattern does NOT exist as a route (would 404). Chat.tsx
  // reads ?user=<senderId> at line 1061 to auto-select the conversation.
  if (type === "message") {
    const senderId = str(data.sender_id || data.senderId || data.from_user_id);
    if (senderId) return `/chat?user=${senderId}`;
    return "/chat";
  }
  if (type === "admin_message" || type === "admin_message_reply") {
    return str(data.source) === "helper_messaging" ? "/helper-dashboard?tab=inbox" : "/chat";
  }

  // Official notices / admin broadcasts
  if (type === "admin_notice" || type === "official_notice" || type === "broadcast") {
    return "/chat?tab=official";
  }

  // Gifts
  if (type === "gift" || type === "gift_received") {
    return data.sender_id ? `/profile-detail/${str(data.sender_id)}` : "/profile";
  }
  if (type === "gift_sent") {
    return data.receiver_id ? `/profile-detail/${str(data.receiver_id)}` : "/profile";
  }

  // Social
  if (type === "follow" || type === "new_follower") {
    return `/profile-detail/${str(data.follower_id)}`;
  }

  // Live & Party
  if (type === "live" || type === "live_started") {
    return data.stream_id ? `/live/${str(data.stream_id)}` : "/discover";
  }
  if (type === "party_invite") {
    return data.room_id ? `/party/${str(data.room_id)}` : "/party-rooms";
  }

  // Transactions
  if (
    type === "topup_approved" ||
    type === "topup_rejected" ||
    type === "diamond_purchase_helper" ||
    type === "diamond_purchase_direct" ||
    type === "payment_completed" ||
    type === "payment_pending"
  ) {
    return "/recharge-history";
  }
  if (type === "diamonds_added" || type === "diamonds_received" || type === "diamonds_credited") {
    return "/profile";
  }
  if (type === "diamond_exchange" || type === "diamond_sent") return "/agency-diamond-exchange";

  // Withdrawal
  if (
    type === "withdrawal" ||
    type === "withdrawal_approved" ||
    type === "withdrawal_rejected"
  ) {
    return "/agency-withdrawal";
  }

  // Level
  if (type === "level_up") return "/level";
  if (type === "level_upgrade_approved" || type === "level_upgrade_rejected") {
    return "/helper-dashboard";
  }

  // Rewards / tasks
  if (type === "reward" || type === "task_completed" || type === "daily_bonus") return "/tasks";

  // Host
  if (type === "host_approved") return "/host-dashboard";
  if (type === "host_rejected") return "/host-application";

  // Helper
  if (
    type === "helper_approved" ||
    type === "payroll_approved" ||
    type === "payroll_rejected"
  ) {
    return "/helper-dashboard";
  }
  if (type === "new_topup_order") return "/helper-dashboard?tab=orders";
  if (type === "new_withdrawal_request") return "/helper-dashboard?tab=agency-withdrawals";
  if (type === "order_completed") return "/helper-dashboard?tab=orders";

  // Agency
  if (type.startsWith("agency_")) return "/agency-dashboard";

  // Beans / balance
  if (type === "beans_exchanged" || type === "balance_deducted") return "/profile";

  // Support
  if (type === "support_reply") {
    return `/settings/customer-service?mode=live_chat&ticket_id=${str(data.ticket_id)}`;
  }
  if (type === "support_ticket") return "/settings/customer-service";

  // Verification
  if (
    type === "verification" ||
    type === "face_verification" ||
    type === "face_verification_rejected" ||
    type === "face_verification_retry"
  ) return "/face-verification";
  if (type === "face_verification_approved") return "/profile";

  // Explicit deep-link payloads
  if (data.link_url) return str(data.link_url);
  if (data.action_url) return str(data.action_url);
  if (data.deep_link) return str(data.deep_link);

  // Fallback: open the notifications tab so the user can see it in-app
  return "/chat?tab=notifications";
}
