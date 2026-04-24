import { useState, useEffect, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Bell, Phone, AlertTriangle, Ban, Clock, User, CheckCheck, ChevronRight, X, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { ScrollArea } from '@/components/ui/scroll-area';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

interface PhoneAlert {
  id: string;
  userId: string;
  detectedContent: string;
  contextType: string;
  callId?: string;
  callerName?: string;
  hostName?: string;
  timestamp: string;
  violationResult?: {
    violation_count: number;
    action_taken: string;
    is_banned: boolean;
  };
  userProfile?: {
    display_name: string;
    avatar_url: string;
    app_uid: string;
  };
}

export function AdminAlertBell() {
  const [isOpen, setIsOpen] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const [alerts, setAlerts] = useState<PhoneAlert[]>([]);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Close on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    if (isOpen) document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen]);

  const fetchUserProfile = useCallback(async (userId: string) => {
    const { data } = await supabase
      .from('profiles')
      .select('display_name, avatar_url, app_uid')
      .eq('id', userId)
      .single();
    return data;
  }, []);

  // Load unread count & refresh when alerts are cleared
  const refreshUnreadCount = useCallback(async () => {
    const { count } = await supabase
      .from('chat_moderation_logs')
      .select('id', { count: 'exact', head: true })
      .neq('violation_type', 'user_report')
      .is('reviewed_at', null);
    if (typeof count === 'number') setUnreadCount(count);
  }, []);

  useEffect(() => {
    refreshUnreadCount();
  }, []);

  // Realtime subscription
  useEffect(() => {
    const channel = supabase.channel(`admin-phone-alerts-realtime-${crypto.randomUUID()}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'chat_moderation_logs' }, (payload) => {
        if (payload.new && (payload.new as any).violation_type !== 'user_report') {
          setUnreadCount(prev => prev + 1);
          try { const audio = new Audio('/sounds/alert.mp3'); audio.volume = 0.5; audio.play().catch(() => {}); } catch {}
          toast.error('⚠️ New phone number sharing detected!', { duration: 4000 });
        }
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, []);

  // Load alerts when opened
  useEffect(() => {
    if (!isOpen) return;
    const loadAlerts = async () => {
      const { data: modLogs } = await supabase
        .from('chat_moderation_logs')
        .select('*')
        .neq('violation_type', 'user_report')
        .is('reviewed_at', null)
        .order('created_at', { ascending: false })
        .limit(20);

      if (modLogs && modLogs.length > 0) {
        const withProfiles = await Promise.all(
          modLogs.map(async (log) => {
            const userProfile = await fetchUserProfile(log.user_id);
            return {
              id: log.id,
              userId: log.user_id,
              detectedContent: (log as any).detected_content || log.original_content || 'Phone number detected',
              contextType: (log as any).conversation_id ? 'chat' : (log as any).group_id ? 'group_chat' : 'unknown',
              timestamp: (log as any).created_at || log.detected_at,
              violationResult: { violation_count: 1, action_taken: log.action_taken || 'warning', is_banned: log.action_taken === 'ban' },
              userProfile: userProfile || undefined,
            } as PhoneAlert;
          })
        );
        setAlerts(withProfiles);
      } else {
        setAlerts([]);
      }
    };
    loadAlerts();
  }, [isOpen, fetchUserProfile]);

  const handleBanUser = async (userId: string) => {
    try {
      const { error } = await supabase.rpc('admin_block_user', {
        _user_id: userId,
        _block: true,
        _reason: 'Banned for sharing phone number',
      });
      if (error) throw error;
      toast.success('User has been banned');
      setAlerts(prev => prev.map(a => a.userId === userId ? { ...a, violationResult: { ...a.violationResult!, is_banned: true, action_taken: 'manual_ban' } } : a));
    } catch { toast.error('Failed to ban user'); }
  };

  const handleClearAll = async () => {
    try {
      const { data, error } = await supabase.functions.invoke('admin-dismiss-alert', {
        body: { clearAll: true }
      });
      if (error) {
        console.error('[AlertPanel] Clear all error:', error);
        toast.error('Failed to clear alerts');
        return;
      }
      setAlerts([]);
      setUnreadCount(0);
      toast.success('All alerts cleared');
    } catch (e) { console.error('[AlertPanel] Clear all exception:', e); toast.error('Failed to clear alerts'); }
  };

  const handleDismissAlert = async (alertId: string) => {
    // Optimistically remove from UI first
    setAlerts(prev => prev.filter(a => a.id !== alertId));
    setUnreadCount(prev => Math.max(0, prev - 1));
    try {
      const { data, error } = await supabase.functions.invoke('admin-dismiss-alert', {
        body: { alertId }
      });
      if (error) {
        console.error('[AlertPanel] Dismiss error:', error);
        toast.error('Failed to dismiss alert');
        // Re-fetch to restore state
        setIsOpen(false);
        setTimeout(() => setIsOpen(true), 100);
        return;
      }
      toast.success('Alert dismissed');
    } catch (e) { console.error('[AlertPanel] Dismiss exception:', e); toast.error('Failed to dismiss'); }
  };

  const formatTime = (timestamp: string) => {
    const diff = Date.now() - new Date(timestamp).getTime();
    if (diff < 60000) return 'Just now';
    if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
    if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
    return new Date(timestamp).toLocaleDateString('en-US');
  };

  return (
    <div className="relative" ref={dropdownRef}>
      <Button
        variant="ghost"
        size="icon"
        onClick={() => { setIsOpen(!isOpen); if (!isOpen) setUnreadCount(0); }}
        className="relative"
      >
        <AlertTriangle className="w-5 h-5 text-orange-400" />
        {unreadCount > 0 && (
          <span className="absolute -top-1 -right-1 w-5 h-5 bg-red-500 text-white text-xs rounded-full flex items-center justify-center animate-pulse">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </Button>

      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: 8, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 8, scale: 0.96 }}
            transition={{ duration: 0.15 }}
            className="absolute right-0 top-full mt-2 w-[380px] h-[520px] bg-slate-900 border border-slate-700/50 rounded-2xl shadow-2xl shadow-black/40 overflow-hidden z-[100] flex flex-col"
          >
            {/* Header */}
             <div className="flex items-center justify-between px-4 py-3 bg-gradient-to-r from-red-600/90 to-orange-500/90 border-b border-slate-700/50">
               <div className="flex items-center gap-2">
                 <AlertTriangle className="w-5 h-5 text-white" />
                 <span className="font-bold text-white text-sm">Phone Detection Alerts</span>
                 {alerts.length > 0 && (
                   <Badge className="bg-white/20 text-white text-[10px] px-1.5 py-0">
                     {alerts.length}
                   </Badge>
                 )}
               </div>
               {alerts.length > 0 && (
                 <Button
                   variant="ghost"
                   size="sm"
                   onClick={handleClearAll}
                   className="h-7 text-[10px] text-white/80 hover:text-white hover:bg-white/10 gap-1 px-2"
                 >
                   <Trash2 className="w-3 h-3" />
                   Clear All
                 </Button>
               )}
             </div>

            {/* Alert List */}
            <ScrollArea className="flex-1 overflow-auto">
              {alerts.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 px-4">
                  <div className="w-16 h-16 rounded-full bg-slate-800 flex items-center justify-center mb-3">
                    <AlertTriangle className="w-8 h-8 text-slate-500" />
                  </div>
                  <p className="text-slate-400 text-sm">No alerts</p>
                </div>
              ) : (
                <div className="divide-y divide-slate-700/50">
                  {alerts.map((alert) => (
                    <motion.div
                      key={alert.id}
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0, height: 0 }}
                      className={cn(
                        "flex gap-3 p-3 hover:bg-slate-800 transition-colors group relative",
                        alert.violationResult?.is_banned ? "bg-red-500/10" : "bg-orange-500/5"
                      )}
                    >
                      {/* Dismiss button */}
                      <button
                        onClick={() => handleDismissAlert(alert.id)}
                        className="absolute top-1.5 right-1.5 w-5 h-5 rounded-full bg-slate-700/50 hover:bg-slate-600 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                      >
                        <X className="w-3 h-3 text-slate-400" />
                      </button>
                      <Avatar className="w-9 h-9 border-2 border-red-500/50 flex-shrink-0">
                        <AvatarImage src={alert.userProfile?.avatar_url || undefined} />
                        <AvatarFallback className="bg-red-500/20 text-red-400 text-xs">
                          <User className="w-4 h-4" />
                        </AvatarFallback>
                      </Avatar>

                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-semibold text-white text-sm truncate">
                            {alert.userProfile?.display_name || alert.callerName || 'Unknown'}
                          </span>
                          {alert.userProfile?.app_uid && (
                            <span className="text-[10px] text-slate-500">#{alert.userProfile.app_uid}</span>
                          )}
                          {alert.violationResult?.is_banned && (
                            <Badge className="bg-red-500/20 text-red-400 text-[10px] px-1.5 py-0">
                              <Ban className="w-2.5 h-2.5 mr-0.5" />Banned
                            </Badge>
                          )}
                        </div>

                        <div className="mt-1 px-2 py-1 bg-red-500/10 rounded border border-red-500/20">
                          <p className="text-xs text-red-400 font-medium flex items-center gap-1">
                            <Phone className="w-3 h-3" />
                            {alert.detectedContent}
                          </p>
                        </div>

                        <div className="flex items-center justify-between mt-1.5">
                          <div className="flex items-center gap-1.5 text-[10px] text-slate-500">
                            <Clock className="w-3 h-3" />
                            {formatTime(alert.timestamp)}
                            {alert.contextType === 'video_call' && (
                              <Badge className="bg-purple-500/20 text-purple-400 text-[10px] px-1 py-0">Video Call</Badge>
                            )}
                          </div>
                          {!alert.violationResult?.is_banned && (
                            <Button
                              variant="destructive"
                              size="sm"
                              onClick={() => handleBanUser(alert.userId)}
                              className="h-6 text-[10px] px-2"
                            >
                              <Ban className="w-3 h-3 mr-1" />Ban
                            </Button>
                          )}
                        </div>
                      </div>
                    </motion.div>
                  ))}
                </div>
              )}
            </ScrollArea>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
