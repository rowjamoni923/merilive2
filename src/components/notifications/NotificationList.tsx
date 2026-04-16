import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useNavigate } from "react-router-dom";
import { 
  Bell, 
  Check, 
  CheckCheck, 
  X, 
  Building2, 
  Gift, 
  MessageCircle,
  Shield,
  Star,
  Sparkles,
  Coins,
  Diamond,
  UserPlus,
  Video,
  Phone,
  Heart,
  Award,
  CreditCard,
  Users,
  Crown,
  Zap,
  ArrowRight,
  Megaphone,
  AlertCircle,
  Wallet
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";
import { useNotifications, Notification } from "@/hooks/useNotifications";
import { useGlobalUnreadCount } from "@/hooks/useGlobalUnreadCount";
import { buildSupportReplyLink } from "@/utils/supportNotificationLink";
import { formatDistanceToNow } from "date-fns";
import { enUS } from "date-fns/locale";

interface NotificationListProps {
  onClose?: () => void;
  compact?: boolean;
}

// Map notification types to icons and colors
const getNotificationIcon = (type: string, priority?: string) => {
  // Admin notice special handling
  if (type === 'admin_notice') {
    if (priority === 'urgent') {
      return { icon: AlertCircle, color: 'bg-gradient-to-br from-red-500 to-rose-600' };
    }
    if (priority === 'high') {
      return { icon: Megaphone, color: 'bg-gradient-to-br from-orange-500 to-amber-600' };
    }
    return { icon: Megaphone, color: 'bg-gradient-to-br from-primary to-blue-600' };
  }

  const iconMap: Record<string, { icon: any; color: string }> = {
    // Agency related
    'agency_verification': { icon: Building2, color: 'bg-purple-500' },
    'agency_created': { icon: Sparkles, color: 'bg-green-500' },
    'agency_joined': { icon: Users, color: 'bg-blue-500' },
    'agency_host_added': { icon: UserPlus, color: 'bg-indigo-500' },
    'agency_host_request': { icon: Bell, color: 'bg-amber-500' },
    'agency_host_rejected': { icon: AlertCircle, color: 'bg-red-500' },
    
    // Gift related
    'gift': { icon: Gift, color: 'bg-pink-500' },
    'gift_received': { icon: Gift, color: 'bg-pink-500' },
    'gift_sent': { icon: Heart, color: 'bg-red-500' },
    
    // Coins & Purchase - Top-up
    'topup_approved': { icon: Diamond, color: 'bg-gradient-to-br from-green-500 to-emerald-600' },
    'topup_rejected': { icon: Diamond, color: 'bg-red-500' },
    'coin_purchase_helper': { icon: Diamond, color: 'bg-gradient-to-br from-cyan-500 to-purple-600' },
    'coin_purchase_direct': { icon: Coins, color: 'bg-gradient-to-br from-amber-500 to-orange-500' },
    'coins_added': { icon: Coins, color: 'bg-yellow-500' },
    'coins_received': { icon: Diamond, color: 'bg-gradient-to-br from-cyan-400 to-blue-500' },
    'payment_completed': { icon: Diamond, color: 'bg-gradient-to-br from-green-500 to-emerald-600' },
    'payment_pending': { icon: Diamond, color: 'bg-gradient-to-br from-amber-500 to-yellow-500' },
    
    // Diamond Exchange
    'coin_exchange': { icon: Sparkles, color: 'bg-gradient-to-br from-amber-500 to-orange-600' },
    'diamond_sent': { icon: Diamond, color: 'bg-purple-500' },
    
    // Withdrawal
    'withdrawal': { icon: CreditCard, color: 'bg-green-500' },
    'withdrawal_approved': { icon: CreditCard, color: 'bg-gradient-to-br from-green-500 to-emerald-600' },
    'withdrawal_rejected': { icon: CreditCard, color: 'bg-red-500' },
    'withdrawal_commission': { icon: Diamond, color: 'bg-gradient-to-br from-green-500 to-cyan-500' },
    
    // Level Upgrade
    'level_upgrade': { icon: Crown, color: 'bg-gradient-to-br from-yellow-400 to-amber-600' },
    'level_upgrade_approved': { icon: Crown, color: 'bg-gradient-to-br from-yellow-400 to-amber-600' },
    'level_upgrade_rejected': { icon: Crown, color: 'bg-red-500' },
    
    // Helper & Payroll related
    'helper_approved': { icon: Award, color: 'bg-gradient-to-br from-green-500 to-emerald-600' },
    'helper_rejected': { icon: Shield, color: 'bg-red-500' },
    'payroll_approved': { icon: Award, color: 'bg-gradient-to-br from-green-500 to-teal-600' },
    'payroll_rejected': { icon: Shield, color: 'bg-red-500' },
    'new_topup_order': { icon: Diamond, color: 'bg-gradient-to-br from-blue-500 to-purple-600' },
    'new_withdrawal_request': { icon: Wallet, color: 'bg-gradient-to-br from-orange-500 to-amber-600' },
    'order_completed': { icon: Check, color: 'bg-gradient-to-br from-green-500 to-emerald-600' },
    'diamonds_credited': { icon: Diamond, color: 'bg-gradient-to-br from-cyan-400 to-blue-600' },
    'helper_notification': { icon: Bell, color: 'bg-gradient-to-br from-indigo-500 to-purple-600' },
    
    // Admin messages
    'admin_message': { icon: Megaphone, color: 'bg-gradient-to-br from-purple-500 to-pink-600' },
    'admin_message_reply': { icon: MessageCircle, color: 'bg-gradient-to-br from-purple-500 to-indigo-600' },
    
    // Report resolved
    'report_resolved': { icon: Shield, color: 'bg-gradient-to-br from-green-500 to-emerald-600' },
    
    // Beans & Balance
    'beans_exchanged': { icon: Sparkles, color: 'bg-gradient-to-br from-amber-500 to-orange-600' },
    'balance_deducted': { icon: AlertCircle, color: 'bg-red-500' },
    
    // Live & Calls
    'live_started': { icon: Video, color: 'bg-red-500' },
    'call_missed': { icon: Phone, color: 'bg-orange-500' },
    'call_received': { icon: Phone, color: 'bg-blue-500' },
    
    // Social
    'follow': { icon: UserPlus, color: 'bg-blue-500' },
    'new_follower': { icon: UserPlus, color: 'bg-blue-500' },
    'message': { icon: MessageCircle, color: 'bg-blue-500' },
    
    // Level & Rewards
    'level_up': { icon: Crown, color: 'bg-gradient-to-br from-yellow-400 to-amber-600' },
    'reward': { icon: Star, color: 'bg-yellow-500' },
    'task_completed': { icon: Award, color: 'bg-green-500' },
    'daily_bonus': { icon: Zap, color: 'bg-purple-500' },
    
    // Host related
    'host_application': { icon: Star, color: 'bg-purple-500' },
    'host_approved': { icon: Crown, color: 'bg-green-500' },
    'host_rejected': { icon: Shield, color: 'bg-red-500' },
    
    // Security & System
    'security': { icon: Shield, color: 'bg-red-500' },
    'system': { icon: Bell, color: 'bg-gray-500' },
    'admin_warning': { icon: AlertCircle, color: 'bg-gradient-to-br from-red-500 to-orange-600' },
    
    // Default
    'default': { icon: Bell, color: 'bg-gray-500' }
  };

  return iconMap[type] || iconMap['default'];
};

// Get navigation path based on notification type and data
const getNotificationLink = (notification: Notification): string | null => {
  const data = notification.data as any;
  const type = notification.type;

  // Support reply should always deep-link to the related live chat ticket
  if (type === 'support_reply') {
    return buildSupportReplyLink(data);
  }

  // If notification has a custom action_url, use it (e.g. admin-set links)
  if (data?.action_url) {
    return data.action_url;
  }

  const linkMap: Record<string, string | null> = {
    // Agency related (main block is below, after host section)
    // Gift related
    'gift': data?.stream_id ? `/live/${data.stream_id}` : '/host-dashboard',
    'gift_received': data?.sender_id ? `/profile-detail/${data.sender_id}` : '/host-dashboard',
    'gift_sent': data?.receiver_id ? `/profile-detail/${data.receiver_id}` : null,
    
    // Coins & Top-up
    'topup_approved': '/recharge-history',
    'topup_rejected': '/recharge-history',
    'coin_purchase_helper': '/recharge-history',
    'coin_purchase_direct': '/recharge-history',
    'coins_added': '/profile',
    'coins_received': '/profile',
    'payment_completed': '/recharge-history',
    'payment_pending': '/recharge-history',
    
    // Diamond Exchange
    'coin_exchange': '/agency-coin-exchange',
    'diamond_sent': '/agency-coin-exchange',
    
    // Withdrawal
    'withdrawal': '/agency-withdrawal',
    'withdrawal_approved': '/agency-withdrawal',
    'withdrawal_rejected': '/agency-withdrawal',
    'withdrawal_commission': '/helper-dashboard',
    
    // Level Upgrade
    'level_upgrade': '/helper-dashboard',
    'level_upgrade_approved': '/helper-dashboard',
    'level_upgrade_rejected': '/helper-dashboard',
    
    // Helper & Payroll related
    'helper_approved': '/helper-dashboard',
    'helper_rejected': '/recharge',
    'payroll_approved': '/level5-helper-dashboard',
    'payroll_rejected': '/helper-dashboard',
    'new_topup_order': '/level5-helper-dashboard',
    'new_withdrawal_request': '/level5-helper-dashboard',
    'order_completed': '/level5-helper-dashboard',
    'diamonds_credited': '/level5-helper-dashboard',
    'helper_notification': '/helper-dashboard',
    
    // Admin messages - route based on source
    'admin_message': data?.source === 'helper_messaging' ? '/helper-dashboard?tab=inbox' : '/chat',
    'admin_message_reply': data?.source === 'helper_messaging' ? '/helper-dashboard?tab=inbox' : '/chat',
    
    // Beans & Balance
    'beans_exchanged': '/profile',
    'balance_deducted': '/profile',
    
    // Live & Calls
    'live_started': data?.stream_id ? `/live/${data.stream_id}` : '/discover',
    'call_missed': '/call-history',
    'call_received': '/call-history',
    
    // Social
    'follow': data?.follower_id ? `/profile-detail/${data.follower_id}` : '/following',
    'new_follower': data?.follower_id ? `/profile-detail/${data.follower_id}` : '/following',
    'message': data?.conversation_id ? `/chat?conversation=${data.conversation_id}` : '/chat',
    
    // Level & Rewards
    'level_up': '/level',
    'reward': '/rewards',
    'task_completed': '/tasks',
    'daily_bonus': '/tasks',
    
    // Host related
     'host_application': '/host-dashboard',
    'host_approved': '/host-dashboard',
    'host_rejected': '/host-application',
    'host_verification': '/face-verification',
    'face_verification_approved': '/host-dashboard',
    'face_verification_rejected': '/face-verification',
    
    // Agency related
    'agency_host_request': '/agency-dashboard',
    'agency_host_added': '/agency-dashboard',
    'agency_host_rejected': '/agency',
    'agency_host_left': '/agency-dashboard',
    'agency_created': '/agency-dashboard',
    'agency_approved': '/agency-dashboard',
    'agency_joined': '/agency-dashboard',
    'agency_verification': '/agency-dashboard',
    'agency_withdrawal': '/agency/withdrawal',
    'agency_withdrawal_approved': '/agency/withdrawal',
    'agency_withdrawal_rejected': '/agency/withdrawal',
    'agency_withdrawal_processing': '/agency/withdrawal',
    'agency_commission': '/agency/commission-history',
    'agency_diamond_received': '/agency-dashboard',
    'agency_level_up': '/agency-dashboard',
    
    // Party & Room
    'party_invite': data?.room_id ? `/party/${data.room_id}` : '/party-rooms',
    'room_joined': data?.room_id ? `/party/${data.room_id}` : '/party-rooms',
    
    // Admin notices - go to official tab
    'admin_notice': '/chat?tab=official',
    
    // Support replies
    'support_reply': '/settings/customer-service',
    
    // Security & System
    'security': '/profile',
    'system': '/profile',
    'admin_warning': data?.action_url || '/settings/customer-service',
  };

  return linkMap[type] || '/chat?tab=notifications';
};

export const NotificationList = ({ onClose, compact = false }: NotificationListProps) => {
  const { notifications, unreadCount, loading, markAsRead, markAllAsRead } = useNotifications();
  const navigate = useNavigate();

  const handleNotificationClick = (notification: Notification) => {
    // Mark as read
    markAsRead(notification.id);
    
    // Navigate to the relevant page
    const link = getNotificationLink(notification);
    if (link) {
      if (onClose) onClose();
      navigate(link);
    }
  };

  if (loading) {
    return (
      <div className="p-8 flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (notifications.length === 0) {
    return (
      <div className="p-8 text-center">
        <div className="w-16 h-16 mx-auto mb-4 bg-muted rounded-full flex items-center justify-center">
          <Bell className="w-8 h-8 text-muted-foreground" />
        </div>
        <p className="text-foreground font-medium">No Notifications</p>
        <p className="text-sm text-muted-foreground mt-1">New notifications will appear here</p>
      </div>
    );
  }

  return (
    <div className={cn("flex flex-col", compact ? "h-[400px]" : "h-full")}>
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-border">
        <div className="flex items-center gap-2">
          <h3 className="font-semibold text-foreground">Notifications</h3>
          {unreadCount > 0 && (
            <Badge className="bg-primary text-primary-foreground text-xs">
              {unreadCount}
            </Badge>
          )}
        </div>
        <div className="flex items-center gap-2">
          {unreadCount > 0 && (
            <Button
              variant="ghost"
              size="sm"
              onClick={markAllAsRead}
              className="text-xs text-primary hover:text-primary/80"
            >
              <CheckCheck className="w-4 h-4 mr-1" />
              Mark all read
            </Button>
          )}
          {onClose && (
            <Button variant="ghost" size="icon" onClick={onClose}>
              <X className="w-4 h-4" />
            </Button>
          )}
        </div>
      </div>

      {/* Notifications List */}
      <ScrollArea className="flex-1">
        <div className="divide-y divide-border">
          <AnimatePresence>
            {notifications.map((notification, index) => (
              <NotificationItem
                key={notification.id}
                notification={notification}
                onClick={() => handleNotificationClick(notification)}
                delay={index * 0.05}
              />
            ))}
          </AnimatePresence>
        </div>
      </ScrollArea>
    </div>
  );
};

interface NotificationItemProps {
  notification: Notification;
  onClick: () => void;
  delay?: number;
}

const NotificationItem = ({ notification, onClick, delay = 0 }: NotificationItemProps) => {
  const { icon: Icon, color } = getNotificationIcon(notification.type, notification.priority);
  const timeAgo = formatDistanceToNow(new Date(notification.created_at), {
    addSuffix: true,
    locale: enUS
  });

  const notificationData = notification.data as any;
  const isHelperPurchase = notification.type === 'coin_purchase_helper';
  const isDirectPurchase = notification.type === 'coin_purchase_direct';
  const isTopupApproved = notification.type === 'topup_approved';
  const isWithdrawalApproved = notification.type === 'withdrawal_approved';
  const isCoinExchange = notification.type === 'coin_exchange';
  const isCoinsReceived = notification.type === 'coins_received';
  const isLevelUpgradeApproved = notification.type === 'level_upgrade_approved';
  const isCoinNotification = isHelperPurchase || isDirectPurchase || isTopupApproved || isCoinsReceived || isCoinExchange;
  const isLevelUp = notification.type === 'level_up' || isLevelUpgradeApproved;
  const isSuccessNotification = isTopupApproved || isWithdrawalApproved || isLevelUpgradeApproved;
  const isAdminNotice = notification.type === 'admin_notice';
  const isUrgentNotice = isAdminNotice && notification.priority === 'urgent';
  const isHighPriorityNotice = isAdminNotice && notification.priority === 'high';
  const isHelperNotification = notification.source === 'helper' || ['payroll_approved', 'payroll_rejected', 'helper_approved', 'helper_rejected', 'new_topup_order', 'new_withdrawal_request', 'order_completed', 'diamonds_credited', 'withdrawal_commission', 'admin_message', 'admin_message_reply'].includes(notification.type);
  const hasLink = getNotificationLink(notification) !== null;

  return (
    <motion.div
      initial={{ opacity: 0, x: -20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: 20 }}
      transition={{ delay }}
      className={cn(
        "p-4 hover:bg-accent/50 transition-colors cursor-pointer relative overflow-hidden group",
        !notification.is_read && "bg-primary/5",
        isCoinNotification && !notification.is_read && "bg-gradient-to-r from-amber-500/10 to-primary/10",
        isLevelUp && !notification.is_read && "bg-gradient-to-r from-yellow-500/10 to-amber-500/10",
        isSuccessNotification && !notification.is_read && "bg-gradient-to-r from-green-500/10 to-emerald-500/10",
        // Admin notice special styling
        isUrgentNotice && !notification.is_read && "bg-gradient-to-r from-red-500/15 via-rose-500/10 to-orange-500/10 border-l-4 border-red-500",
        isHighPriorityNotice && !notification.is_read && "bg-gradient-to-r from-orange-500/15 via-amber-500/10 to-yellow-500/10 border-l-4 border-orange-500",
        isAdminNotice && !isUrgentNotice && !isHighPriorityNotice && !notification.is_read && "bg-gradient-to-r from-primary/15 via-blue-500/10 to-cyan-500/10 border-l-4 border-primary"
      )}
      onClick={onClick}
    >
      {/* Sparkle animation for special notifications */}
      {(isCoinNotification || isLevelUp) && !notification.is_read && (
        <motion.div
          className="absolute inset-0 pointer-events-none"
          initial={{ opacity: 0 }}
          animate={{ opacity: [0, 1, 0] }}
          transition={{ duration: 2, repeat: Infinity }}
        >
          <div className="absolute top-2 right-4 text-amber-400">✨</div>
          <div className="absolute bottom-2 left-8 text-primary">💎</div>
          <div className="absolute top-4 right-12 text-yellow-400">⭐</div>
        </motion.div>
      )}

      {/* Admin notice special effects */}
      {isAdminNotice && !notification.is_read && (
        <motion.div
          className="absolute inset-0 pointer-events-none"
          initial={{ opacity: 0 }}
          animate={{ opacity: [0, 0.5, 0] }}
          transition={{ duration: 3, repeat: Infinity }}
        >
          <div className={cn(
            "absolute inset-0",
            isUrgentNotice && "bg-gradient-to-r from-red-500/5 to-transparent",
            isHighPriorityNotice && "bg-gradient-to-r from-orange-500/5 to-transparent",
            !isUrgentNotice && !isHighPriorityNotice && "bg-gradient-to-r from-primary/5 to-transparent"
          )} />
        </motion.div>
      )}

      <div className="flex gap-3 relative z-10">
        {/* Icon or Avatar */}
        {isHelperPurchase && notificationData?.helper_avatar ? (
          <div className="relative">
            <Avatar className="w-12 h-12 ring-2 ring-primary">
              <AvatarImage src={notificationData.helper_avatar} />
              <AvatarFallback className="bg-gradient-to-br from-primary to-pink-500 text-primary-foreground">
                {notificationData.helper_name?.charAt(0) || '💎'}
              </AvatarFallback>
            </Avatar>
            <motion.div 
              className="absolute -bottom-1 -right-1 w-5 h-5 bg-green-500 rounded-full flex items-center justify-center"
              animate={{ scale: [1, 1.2, 1] }}
              transition={{ duration: 1, repeat: Infinity }}
            >
              <Diamond className="w-3 h-3 text-white" />
            </motion.div>
          </div>
        ) : notificationData?.sender_avatar || notificationData?.avatar_url ? (
          <Avatar className="w-10 h-10">
            <AvatarImage src={notificationData.sender_avatar || notificationData.avatar_url} />
            <AvatarFallback className={cn("text-white", color)}>
              <Icon className="w-5 h-5" />
            </AvatarFallback>
          </Avatar>
        ) : (
          <div className={cn(
            "w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0",
            color
          )}>
            <Icon className="w-5 h-5 text-white" />
          </div>
        )}

        {/* Content */}
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2">
            <div className="flex items-center gap-2">
              <p className={cn(
                "font-medium text-sm line-clamp-1",
                !notification.is_read && "text-foreground",
                notification.is_read && "text-muted-foreground",
                isCoinNotification && "text-transparent bg-clip-text bg-gradient-to-r from-primary to-amber-500",
                isLevelUp && "text-transparent bg-clip-text bg-gradient-to-r from-yellow-500 to-amber-600",
                isUrgentNotice && "text-transparent bg-clip-text bg-gradient-to-r from-red-500 to-rose-600 font-bold",
                isHighPriorityNotice && "text-transparent bg-clip-text bg-gradient-to-r from-orange-500 to-amber-600 font-semibold",
                isAdminNotice && !isUrgentNotice && !isHighPriorityNotice && "text-transparent bg-clip-text bg-gradient-to-r from-primary to-blue-600"
              )}>
                {notification.title}
              </p>
              {/* Admin notice badge */}
              {isAdminNotice && (
                <span className={cn(
                  "text-[10px] px-1.5 py-0.5 rounded-full font-medium",
                  isUrgentNotice && "bg-red-500/20 text-red-400",
                  isHighPriorityNotice && "bg-orange-500/20 text-orange-400",
                  !isUrgentNotice && !isHighPriorityNotice && "bg-primary/20 text-primary"
                )}>
                  📢 Notice
                </span>
              )}
            </div>
            <div className="flex items-center gap-2">
              {!notification.is_read && (
                <motion.span 
                  className={cn(
                    "w-2 h-2 rounded-full flex-shrink-0",
                    isCoinNotification ? "bg-amber-500" : 
                    isUrgentNotice ? "bg-red-500" :
                    isHighPriorityNotice ? "bg-orange-500" :
                    "bg-primary"
                  )}
                  animate={(isCoinNotification || isLevelUp || isAdminNotice) ? { scale: [1, 1.3, 1] } : {}}
                  transition={{ duration: 1, repeat: Infinity }}
                />
              )}
              {hasLink && (
                <ArrowRight className="w-4 h-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
              )}
            </div>
          </div>
          
          {/* Special display for coin amount */}
          {isCoinNotification && notificationData?.amount && (
            <motion.div 
              className="flex items-center gap-2 mt-1"
              initial={{ scale: 0.8 }}
              animate={{ scale: 1 }}
            >
              <span className="text-2xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-amber-500 to-primary">
                +{notificationData.amount.toLocaleString()}
              </span>
              <span className="text-xs text-amber-600 font-medium">Diamonds</span>
            </motion.div>
          )}

          {/* Level up display */}
          {isLevelUp && notificationData?.new_level && (
            <motion.div 
              className="flex items-center gap-2 mt-1"
              initial={{ scale: 0.8 }}
              animate={{ scale: 1 }}
            >
              <Crown className="w-5 h-5 text-yellow-500" />
              <span className="text-xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-yellow-500 to-amber-600">
                Level {notificationData.new_level}
              </span>
            </motion.div>
          )}
          
          <p className={cn(
            "text-sm mt-0.5 line-clamp-2 whitespace-pre-wrap",
            isAdminNotice ? "text-foreground/80" : "text-muted-foreground"
          )}>
            {notification.message}
          </p>
          <p className="text-xs text-muted-foreground/70 mt-1.5">
            {timeAgo}
            {isAdminNotice && " • Admin Notice"}
          </p>
        </div>
      </div>
    </motion.div>
  );
};

// Notification Bell Button Component
interface NotificationBellProps {
  onClick?: () => void;
}

export const NotificationBell = ({ onClick }: NotificationBellProps) => {
  const unreadCounts = useGlobalUnreadCount();

  return (
    <button
      onClick={onClick}
      className="relative p-2 hover:bg-accent/50 rounded-full transition-colors"
    >
      <Bell className="w-5 h-5 text-foreground" />
      <AnimatePresence>
        {unreadCounts.notifications > 0 && (
          <motion.span
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            exit={{ scale: 0 }}
            className="absolute -top-0.5 -right-0.5 w-5 h-5 bg-destructive text-destructive-foreground text-xs rounded-full flex items-center justify-center font-medium"
          >
            {unreadCounts.notifications > 9 ? '9+' : unreadCounts.notifications}
          </motion.span>
        )}
      </AnimatePresence>
    </button>
  );
};

export default NotificationList;
