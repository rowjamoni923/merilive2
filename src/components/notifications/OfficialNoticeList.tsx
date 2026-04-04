import { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { 
  Megaphone, 
  AlertCircle, 
  CheckCheck,
  Shield,
  Clock,
  Eye,
  ChevronDown,
  ChevronUp,
  Sparkles
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { getProxiedUrl } from "@/utils/r2ProxyUrl";
import { ImageViewer, useImageViewer } from "@/components/ui/image-viewer";
import { formatDistanceToNow } from "date-fns";
import { enUS } from "date-fns/locale";
import {
  getLocallyReadOfficialNoticeIds,
  markOfficialNoticeAsReadLocally,
  markOfficialNoticesAsReadLocally,
} from "@/utils/officialNoticeReadState";
interface OfficialNotice {
  id: string;
  title: string;
  message: string;
  image_url: string | null;
  target_audience: string[];
  priority: string;
  is_active: boolean;
  created_at: string;
  expires_at: string | null;
  read_by: string[];
}

export const OfficialNoticeList = () => {
  const [notices, setNotices] = useState<OfficialNotice[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [unreadCount, setUnreadCount] = useState(0);

  const emitGlobalUnreadRefresh = useCallback((detail?: { officialDecrement?: number; officialSetZero?: boolean }) => {
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('global-unread:refresh', { detail }));
    }
  }, []);

  useEffect(() => {
    const init = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) setCurrentUserId(user.id);
    };
    init();
  }, []);

  const fetchNotices = useCallback(async () => {
    if (!currentUserId) return;

    try {
      const { data, error } = await supabase
        .rpc('get_user_notices', { p_user_id: currentUserId });

      if (error) {
        console.error('Error fetching official notices:', error);
        return;
      }

      const noticesList = (data || []) as OfficialNotice[];
      noticesList.sort((a, b) => {
        if (a.priority === 'urgent' && b.priority !== 'urgent') return -1;
        if (b.priority === 'urgent' && a.priority !== 'urgent') return 1;
        if (a.priority === 'high' && b.priority !== 'high' && b.priority !== 'urgent') return -1;
        if (b.priority === 'high' && a.priority !== 'high' && a.priority !== 'urgent') return 1;
        return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
      });

      const localReadIds = getLocallyReadOfficialNoticeIds(currentUserId);
      const noticesWithLocalRead = noticesList.map((notice) => {
        const alreadyReadOnServer = notice.read_by?.includes(currentUserId);
        if (alreadyReadOnServer || !localReadIds.has(notice.id)) return notice;

        return {
          ...notice,
          read_by: [...(notice.read_by || []), currentUserId],
        };
      });

      const unreadNotices = noticesWithLocalRead.filter(n => !n.read_by?.includes(currentUserId));

      // Auto-mark as read as soon as user views the Official tab (optimistic)
      if (unreadNotices.length > 0) {
        const unreadIds = unreadNotices.map(n => n.id);
        const unreadIdSet = new Set(unreadIds);

        markOfficialNoticesAsReadLocally(currentUserId, unreadIds);

        setNotices(
          noticesWithLocalRead.map((notice) =>
            unreadIdSet.has(notice.id)
              ? { ...notice, read_by: [...(notice.read_by || []), currentUserId] }
              : notice
          )
        );
        setUnreadCount(0);
        emitGlobalUnreadRefresh({ officialSetZero: true });

        void Promise.all(
          unreadNotices.map((notice) => {
            const nextReadBy = notice.read_by?.includes(currentUserId)
              ? notice.read_by
              : [...(notice.read_by || []), currentUserId];

            return supabase
              .from('admin_notices')
              .update({ read_by: nextReadBy })
              .eq('id', notice.id);
          })
        ).catch((error) => {
          console.warn('Official notice backend read sync failed, using local read state:', error);
        });
        return;
      }

      setNotices(noticesWithLocalRead);
      setUnreadCount(0);
    } catch (error) {
      console.error('Error:', error);
    } finally {
      setLoading(false);
    }
  }, [currentUserId, emitGlobalUnreadRefresh]);

  useEffect(() => {
    if (currentUserId) fetchNotices();
  }, [currentUserId, fetchNotices]);

  useEffect(() => {
    if (!currentUserId) return;

    const channel = supabase
      .channel(`official-notices-${currentUserId}`)
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'admin_notices'
      }, () => {
        fetchNotices();
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [currentUserId, fetchNotices]);

  const markAsRead = async (noticeId: string) => {
    if (!currentUserId) return;

    const targetNotice = notices.find(n => n.id === noticeId);
    const alreadyRead = !!targetNotice?.read_by?.includes(currentUserId);
    if (alreadyRead) return;

    // Optimistic UI + global badge update (instant)
    markOfficialNoticeAsReadLocally(currentUserId, noticeId);

    setNotices(prev => prev.map(n =>
      n.id === noticeId
        ? { ...n, read_by: [...(n.read_by || []), currentUserId] }
        : n
    ));
    setUnreadCount(prev => Math.max(0, prev - 1));
    emitGlobalUnreadRefresh({ officialDecrement: 1 });

    try {
      const currentReadBy = (targetNotice?.read_by as string[]) || [];
      await supabase
        .from('admin_notices')
        .update({ read_by: [...currentReadBy, currentUserId] })
        .eq('id', noticeId);
    } catch (error) {
      console.error('Error marking notice as read:', error);
      fetchNotices();
    }
  };

  const markAllAsRead = async () => {
    if (!currentUserId) return;

    const unreadNotices = notices.filter(n => !n.read_by?.includes(currentUserId));
    if (unreadNotices.length === 0) return;

    // Optimistic UI + global badge update (instant)
    const unreadIds = unreadNotices.map(n => n.id);
    const unreadIdSet = new Set(unreadIds);

    markOfficialNoticesAsReadLocally(currentUserId, unreadIds);

    setNotices(prev => prev.map(n =>
      unreadIdSet.has(n.id)
        ? { ...n, read_by: [...(n.read_by || []), currentUserId] }
        : n
    ));
    setUnreadCount(0);
    emitGlobalUnreadRefresh({ officialSetZero: true });

    try {
      await Promise.all(
        unreadNotices.map((notice) =>
          supabase
            .from('admin_notices')
            .update({ read_by: [...(notice.read_by || []), currentUserId] })
            .eq('id', notice.id)
        )
      );
    } catch (error) {
      console.error('Error marking all official notices as read:', error);
      fetchNotices();
    }
  };

  if (loading) {
    return (
      <div className="p-8 flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (notices.length === 0) {
    return (
      <div className="p-8 text-center">
        <div className="w-20 h-20 mx-auto mb-4 bg-gradient-to-br from-primary/20 to-blue-500/20 rounded-full flex items-center justify-center">
          <Shield className="w-10 h-10 text-primary" />
        </div>
        <p className="text-foreground font-semibold text-lg">Official Notices</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-border bg-gradient-to-r from-primary/5 via-indigo-500/5 to-purple-500/5">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-blue-500 via-indigo-500 to-purple-600 flex items-center justify-center shadow-lg shadow-indigo-500/20 ring-1 ring-white/10">
            <Shield className="w-4.5 h-4.5 text-white drop-shadow-sm" />
          </div>
          <div>
            <h3 className="font-bold text-foreground text-sm">Official Notices</h3>
            <p className="text-xs text-muted-foreground">{notices.length} notices</p>
          </div>
          {unreadCount > 0 && (
            <Badge className="bg-red-500 text-white text-xs ml-1">
              {unreadCount} new
            </Badge>
          )}
        </div>
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
      </div>

      {/* Notices List */}
      <ScrollArea className="flex-1">
        <div className="py-1">
          <AnimatePresence>
            {notices.map((notice, index) => (
              <OfficialNoticeItem
                key={notice.id}
                notice={notice}
                isRead={notice.read_by?.includes(currentUserId || '') || false}
                onRead={() => markAsRead(notice.id)}
                delay={index * 0.05}
              />
            ))}
          </AnimatePresence>
        </div>
      </ScrollArea>
    </div>
  );
};

interface OfficialNoticeItemProps {
  notice: OfficialNotice;
  isRead: boolean;
  onRead: () => void;
  delay?: number;
}

const OfficialNoticeItem = ({ notice, isRead, onRead, delay = 0 }: OfficialNoticeItemProps) => {
  const [expanded, setExpanded] = useState(false);
  const { viewerImage, isOpen, openImage, closeImage } = useImageViewer();
  const isUrgent = notice.priority === 'urgent';
  const isHigh = notice.priority === 'high';
  const timeAgo = formatDistanceToNow(new Date(notice.created_at), {
    addSuffix: true,
    locale: enUS
  });

  const getPriorityConfig = () => {
    if (isUrgent) return {
      icon: AlertCircle,
      iconBg: 'bg-gradient-to-br from-red-500 via-rose-500 to-pink-600',
      border: 'border-l-4 border-red-500',
      bg: 'bg-gradient-to-r from-red-500/15 via-rose-500/10 to-transparent',
      badge: 'bg-gradient-to-r from-red-500/30 to-rose-500/20 text-red-300 border border-red-500/30',
      badgeText: '🚨 Urgent',
      glow: 'shadow-red-500/20'
    };
    if (isHigh) return {
      icon: Sparkles,
      iconBg: 'bg-gradient-to-br from-orange-500 via-amber-500 to-yellow-500',
      border: 'border-l-4 border-orange-500',
      bg: 'bg-gradient-to-r from-orange-500/15 via-amber-500/10 to-transparent',
      badge: 'bg-gradient-to-r from-orange-500/30 to-amber-500/20 text-orange-300 border border-orange-500/30',
      badgeText: '⚡ Important',
      glow: 'shadow-orange-500/20'
    };
    return {
      icon: Megaphone,
      iconBg: 'bg-gradient-to-br from-blue-500 via-indigo-500 to-purple-600',
      border: 'border-l-4 border-primary',
      bg: 'bg-gradient-to-r from-primary/10 via-blue-500/5 to-transparent',
      badge: 'bg-gradient-to-r from-blue-500/30 to-indigo-500/20 text-blue-300 border border-blue-500/30',
      badgeText: '📢 Notice',
      glow: 'shadow-blue-500/20'
    };
  };

  const config = getPriorityConfig();
  const Icon = config.icon;

  const handleClick = () => {
    if (!isRead) onRead();
    setExpanded(prev => !prev);
  };

  // Truncate message for collapsed view
  const isLong = notice.message.length > 80;
  const truncatedMessage = isLong ? notice.message.slice(0, 80) + '...' : notice.message;

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10 }}
      transition={{ delay }}
      className={cn(
        "p-3 mx-3 my-2 rounded-2xl transition-all cursor-pointer relative overflow-hidden border",
        !isRead && isUrgent && "border-red-500/40 bg-gradient-to-br from-red-500/15 via-rose-500/10 to-red-900/5 shadow-lg shadow-red-500/10",
        !isRead && isHigh && "border-orange-500/30 bg-gradient-to-br from-orange-500/15 via-amber-500/10 to-orange-900/5 shadow-lg shadow-orange-500/10",
        !isRead && !isUrgent && !isHigh && "border-primary/30 bg-gradient-to-br from-primary/15 via-blue-500/10 to-primary/5 shadow-lg shadow-primary/10",
        isRead && "border-border/50 bg-card/50 opacity-70 hover:opacity-100"
      )}
      onClick={handleClick}
    >
      {/* Animated shimmer for unread */}
      {!isRead && (
        <motion.div
          className="absolute inset-0 pointer-events-none"
          animate={{ x: ['-100%', '200%'] }}
          transition={{ duration: 3, repeat: Infinity, repeatDelay: 2 }}
        >
          <div className="h-full w-1/3 bg-gradient-to-r from-transparent via-white/5 to-transparent skew-x-12" />
        </motion.div>
      )}

      <div className="relative z-10">
        {/* Top: Badge + Time */}
        <div className="flex items-center justify-between mb-2">
          <span className={cn(
            "text-[10px] px-2.5 py-1 rounded-full font-bold tracking-wide uppercase",
            config.badge
          )}>
            {config.badgeText}
          </span>
          <div className="flex items-center gap-2">
            {!isRead && (
              <motion.span
                className={cn(
                  "w-2 h-2 rounded-full",
                  isUrgent ? "bg-red-500" : isHigh ? "bg-orange-500" : "bg-primary"
                )}
                animate={{ scale: [1, 1.4, 1], opacity: [1, 0.6, 1] }}
                transition={{ duration: 1.5, repeat: Infinity }}
              />
            )}
            <span className="text-[10px] text-muted-foreground flex items-center gap-1">
              <Clock className="w-3 h-3" />
              {timeAgo}
            </span>
          </div>
        </div>

        {/* Title with Icon */}
        <div className="flex items-start gap-2.5 mb-1.5">
           <div className={cn(
              "w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 shadow-lg ring-1 ring-white/10",
              config.iconBg,
              config.glow
            )}>
              <Icon className="w-5 h-5 text-white drop-shadow-sm" />
            </div>
          <div className="flex-1 min-w-0">
            <h4 className={cn(
              "font-bold text-sm leading-tight",
              !isRead ? "text-foreground" : "text-muted-foreground"
            )}>
              {notice.title}
            </h4>
          </div>
          {isLong && (
            <div className="flex-shrink-0 mt-0.5">
              {expanded 
                ? <ChevronUp className="w-4 h-4 text-muted-foreground" />
                : <ChevronDown className="w-4 h-4 text-muted-foreground" />
              }
            </div>
          )}
        </div>

        {/* Message */}
        <div className="ml-11.5 pl-0">
          <AnimatePresence mode="wait">
            {expanded ? (
              <motion.div
                key="full"
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                className={cn(
                  "text-[13px] whitespace-pre-wrap leading-[1.6] rounded-xl p-3 mt-1",
                  !isRead 
                    ? "text-foreground/85 bg-black/10 dark:bg-white/5" 
                    : "text-muted-foreground bg-muted/30"
                )}
              >
                {notice.message}
              </motion.div>
            ) : (
              <motion.p
                key="truncated"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className={cn(
                  "text-[13px] leading-relaxed",
                  !isRead ? "text-foreground/75" : "text-muted-foreground"
                )}
              >
                {truncatedMessage}
              </motion.p>
            )}
          </AnimatePresence>

          {/* Notice Images */}
          {notice.image_url && (() => {
            const urls = notice.image_url!.split(',').map(u => u.trim()).filter(Boolean);
            return urls.length > 0 ? (
              <div className={cn("mt-2.5 gap-2", urls.length === 1 ? "flex" : "grid grid-cols-2")}>
                {urls.map((url, idx) => (
                  <img 
                    key={idx}
                    src={getProxiedUrl(url)} 
                    alt={`Notice attachment ${idx + 1}`} 
                    className={cn(
                      "rounded-xl object-cover border border-white/10 shadow-md cursor-pointer hover:opacity-90 transition-opacity",
                      urls.length === 1 ? "max-h-52 w-full" : "h-28 w-full"
                    )}
                    onClick={(e) => {
                      e.stopPropagation();
                      openImage(getProxiedUrl(url));
                    }}
                  />
                ))}
              </div>
            ) : null;
          })()}

          <ImageViewer src={viewerImage} open={isOpen} onClose={closeImage} />
          <div className="flex items-center gap-3 mt-2">
            {isRead && (
              <span className="text-[10px] text-muted-foreground/50 flex items-center gap-1">
                <Eye className="w-3 h-3" />
                Read
              </span>
            )}
            {notice.expires_at && (
              <span className="text-[10px] text-orange-400/70">
                Expires: {new Date(notice.expires_at).toLocaleDateString()}
              </span>
            )}
          </div>
        </div>
      </div>
    </motion.div>
  );
};

export default OfficialNoticeList;
