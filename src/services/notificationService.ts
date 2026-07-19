import { supabase } from '@/integrations/supabase/client';
import { Json } from '@/integrations/supabase/types';

export type NotificationType = 
  | 'agency_verification'
  | 'agency_created'
  | 'agency_joined'
  | 'agency_host_added'
  | 'gift'
  | 'gift_received'
  | 'gift_sent'
  | 'diamond_purchase_helper'
  | 'diamond_purchase_direct'
  | 'diamonds_added'
  | 'diamonds_received'
  | 'withdrawal'
  | 'withdrawal_approved'
  | 'withdrawal_rejected'
  | 'withdrawal_commission'
  | 'live_started'
  | 'call_missed'
  | 'call_received'
  | 'follow'
  | 'new_follower'
  | 'message'
  | 'level_up'
  | 'level_upgrade'
  | 'level_upgrade_approved'
  | 'level_upgrade_rejected'
  | 'reward'
  | 'task_completed'
  | 'daily_bonus'
  | 'host_application'
  | 'host_approved'
  | 'host_rejected'
  | 'party_invite'
  | 'room_joined'
  | 'security'
  | 'system'
  | 'beans_exchanged'
  | 'balance_deducted'
  | 'helper_approved'
  | 'helper_rejected'
  | 'payroll_approved'
  | 'payroll_rejected'
  | 'new_topup_order'
  | 'order_completed'
  | 'diamonds_credited'
  | 'admin_message'
  | 'admin_message_reply'
  | 'topup_approved'
  | 'topup_rejected'
  | 'helper_notification'
  | 'diamond_exchange'
  | 'diamond_sent';

export interface SendNotificationParams {
  userId: string;
  type: NotificationType;
  title: string;
  message: string;
  data?: Record<string, any>;
}

/**
 * Send a notification to a user
 */
export const sendNotification = async ({
  userId,
  type,
  title,
  message,
  data = {}
}: SendNotificationParams): Promise<{ success: boolean; error?: string }> => {
  try {
    const { error } = await supabase
      .from('notifications')
      .insert({
        user_id: userId,
        type,
        title,
        message,
        data: data as Json,
        is_read: false
      });

    if (error) {
      console.error('Failed to send notification:', error);
      return { success: false, error: error.message };
    }

    return { success: true };
  } catch (err: any) {
    console.error('Error sending notification:', err);
    return { success: false, error: err.message };
  }
};

/**
 * Send notification when user receives a gift
 */
export const sendGiftNotification = async (
  receiverId: string,
  senderName: string,
  senderId: string,
  giftName: string,
  diamondAmount: number,
  streamId?: string
) => {
  return sendNotification({
    userId: receiverId,
    type: 'gift_received',
    title: `🎁 ${senderName} sent you a gift!`,
    message: `${giftName} (${diamondAmount} Diamonds)`,
    data: {
      sender_id: senderId,
      sender_name: senderName,
      gift_name: giftName,
      diamond_amount: diamondAmount,
      stream_id: streamId
    }
  });
};

/**
 * Send notification when user gets a new follower
 */
export const sendFollowNotification = async (
  userId: string,
  followerId: string,
  followerName: string,
  followerAvatar?: string
) => {
  return sendNotification({
    userId,
    type: 'new_follower',
    title: `👤 New Follower!`,
    message: `${followerName} started following you`,
    data: {
      follower_id: followerId,
      follower_name: followerName,
      avatar_url: followerAvatar
    }
  });
};

/**
 * Send notification when user levels up
 */
export const sendLevelUpNotification = async (
  userId: string,
  newLevel: number,
  previousLevel: number
) => {
  return sendNotification({
    userId,
    type: 'level_up',
    title: `🎉 Level Up!`,
    message: `Congratulations! You have reached Level ${newLevel}!`,
    data: {
      new_level: newLevel,
      previous_level: previousLevel
    }
  });
};

/**
 * Send notification when coins are added
 */
export const sendCoinsAddedNotification = async (
  userId: string,
  amount: number,
  source: 'topup' | 'gift' | 'reward' | 'admin',
  helperName?: string,
  helperAvatar?: string
) => {
  const typeMap: Record<string, NotificationType> = {
    topup: 'diamond_purchase_direct',
    gift: 'diamonds_added',
    reward: 'reward',
    admin: 'diamonds_added'
  };

  return sendNotification({
    userId,
    type: helperName ? 'diamond_purchase_helper' : typeMap[source],
    title: helperName ? `💎 ${helperName} added Diamonds!` : `💎 Diamonds added!`,
    message: `${amount.toLocaleString()} Diamonds have been added to your account`,
    data: {
      amount,
      source,
      helper_name: helperName,
      helper_avatar: helperAvatar
    }
  });
};

/**
 * Send notification when host application status changes
 */
export const sendHostApplicationNotification = async (
  userId: string,
  status: 'approved' | 'rejected',
  reason?: string
) => {
  const isApproved = status === 'approved';
  
  return sendNotification({
    userId,
    type: isApproved ? 'host_approved' : 'host_rejected',
    title: isApproved ? `🎉 Host Application Approved!` : `❌ Host Application Rejected`,
    message: isApproved 
      ? 'Congratulations! Your host application has been approved. You can now start live streaming!'
      : reason || 'Sorry, your host application has been rejected.',
    data: { status, reason }
  });
};

/**
 * Send notification when withdrawal status changes
 */
export const sendWithdrawalNotification = async (
  userId: string,
  status: 'approved' | 'rejected' | 'pending',
  amount: number,
  reason?: string
) => {
  const statusMap: Record<string, { type: NotificationType; title: string; message: string }> = {
    approved: {
      type: 'withdrawal_approved',
      title: '✅ Withdrawal Approved!',
      message: `$${amount.toLocaleString()} withdrawal has been approved`
    },
    rejected: {
      type: 'withdrawal_rejected',
      title: '❌ Withdrawal Rejected',
      message: reason || 'Sorry, your withdrawal request has been rejected'
    },
    pending: {
      type: 'withdrawal',
      title: '⏳ Withdrawal Pending',
      message: `$${amount.toLocaleString()} withdrawal request has been submitted`
    }
  };

  const notification = statusMap[status];
  
  return sendNotification({
    userId,
    type: notification.type,
    title: notification.title,
    message: notification.message,
    data: { status, amount, reason }
  });
};

/**
 * Send notification for live stream started
 */
export const sendLiveStartedNotification = async (
  followerIds: string[],
  hostName: string,
  hostId: string,
  streamId: string,
  streamTitle?: string
) => {
  const promises = followerIds.map(followerId => 
    sendNotification({
      userId: followerId,
      type: 'live_started',
      title: `🔴 ${hostName} is Live!`,
      message: streamTitle || 'Join now!',
      data: {
        host_id: hostId,
        host_name: hostName,
        stream_id: streamId,
        stream_title: streamTitle
      }
    })
  );

  await Promise.allSettled(promises);
};

/**
 * Send notification for party room invite
 */
export const sendPartyInviteNotification = async (
  userId: string,
  inviterName: string,
  inviterId: string,
  roomId: string,
  roomName: string
) => {
  return sendNotification({
    userId,
    type: 'party_invite',
    title: `🎉 Party Invitation!`,
    message: `${inviterName} invited you to "${roomName}" party`,
    data: {
      inviter_id: inviterId,
      inviter_name: inviterName,
      room_id: roomId,
      room_name: roomName
    }
  });
};

/**
 * Send notification for missed call
 */
export const sendMissedCallNotification = async (
  userId: string,
  callerName: string,
  callerId: string,
  callType: 'audio' | 'video'
) => {
  return sendNotification({
    userId,
    type: 'call_missed',
    title: `📞 Missed Call`,
    message: `You missed a ${callType} call from ${callerName}`,
    data: {
      caller_id: callerId,
      caller_name: callerName,
      call_type: callType
    }
  });
};

/**
 * Send notification when beans are exchanged to diamonds
 */
export const sendBeansExchangedNotification = async (
  userId: string,
  beansAmount: number,
  diamondsReceived: number
) => {
  return sendNotification({
    userId,
    type: 'beans_exchanged',
    title: `💎 Beans Exchanged Successfully!`,
    message: `You exchanged ${beansAmount.toLocaleString()} Beans and received ${diamondsReceived.toLocaleString()} Diamonds`,
    data: {
      beans_deducted: beansAmount,
      diamonds_received: diamondsReceived,
      exchange_type: 'beans_to_diamonds'
    }
  });
};

/**
 * Send notification when balance is deducted (admin action)
 */
export const sendBalanceDeductedNotification = async (
  userId: string,
  amount: number,
  balanceType: 'beans' | 'diamonds' | 'wallet',
  reason: string,
  adminName?: string
) => {
  const typeLabel = balanceType === 'beans' ? 'Beans' : balanceType === 'diamonds' ? 'Diamonds' : 'Wallet Balance';
  
  return sendNotification({
    userId,
    type: 'balance_deducted',
    title: `⚠️ ${typeLabel} Deducted`,
    message: `${amount.toLocaleString()} ${typeLabel} has been deducted from your account`,
    data: {
      amount,
      balance_type: balanceType,
      reason,
      deducted_by: adminName || 'System'
    }
  });
};

export default sendNotification;
