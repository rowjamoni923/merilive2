import { useState, useEffect, useCallback, useRef } from "react";
import useAdminRealtime from "@/hooks/useAdminRealtime";
import {
  Search, MessageSquare, Phone, Shield, AlertTriangle,
  ChevronRight, ArrowLeft, Loader2, Eye, RefreshCw, Ban, Clock, Gavel,
  ShieldAlert,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { format, formatDistanceToNow } from "date-fns";
import { adminSupabase as supabase } from "@/integrations/supabase/adminClient";
import { useToast } from "@/hooks/use-toast";

// Import sub-sections as tab content
import AdminNumberSharing from "./AdminNumberSharing";
import AdminContactViolations from "./AdminContactViolations";
import AdminLiveBans from "./AdminLiveBans";

const EDGE_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/admin-chat-inspector`;

interface UserProfile {
  id: string;
  display_name: string | null;
  avatar_url: string | null;
  app_uid: string | null;
  gender?: string;
  is_host?: boolean;
  is_verified?: boolean;
  is_blocked?: boolean;
  country_flag?: string | null;
  user_level?: number;
}

interface Conversation {
  id: string;
  participant1_id: string;
  participant2_id: string;
  last_message_at: string;
  other_user: UserProfile;
  target_user: UserProfile;
  last_message: {
    content: string;
    message_type: string;
    sender_id: string;
    created_at: string;
  } | null;
  message_count: number;
  has_violations?: boolean;
}

interface Message {
  id: string;
  conversation_id: string;
  sender_id: string;
  content: string;
  message_type: string;
  created_at: string;
  is_read: boolean;
  sender: UserProfile | null;
  original_content?: string | null;
  detected_numbers?: string | null;
}

interface PhoneAlert {
  id: string;
  user_id: string;
  conversation_id: string | null;
  detected_content: string | null;
  action_taken: string | null;
  created_at: string;
  notes: string | null;
  violation_number?: number;
  beans_deducted?: number;
  user: UserProfile | null;
}

// Phone number detection patterns
const PHONE_PATTERNS = [
  /(?:\+?880|0)1[3-9]\d{8}/,
  /\+\d{1,3}[\s-]?\d{6,14}/,
  /\d{3}[\s.-]?\d{3,4}[\s.-]?\d{4,6}/,
  /01[3-9]\d{8}/,
  /০[১-৯][০-৯]{8,9}/,
  /(?:call|phone|mobile|contact|number|নম্বর|ফোন|মোবাইল|কল|whatsapp|imo|ইমো|হোয়াটসঅ্যাপ)\s*[:\-]?\s*\+?\d{6,15}/i,
];

const hasPhoneNumber = (content: string) => {
  if (!content) return false;
  return PHONE_PATTERNS.some(p => p.test(content));
};

const AdminChatInspector = () => {
  const { toast } = useToast();
  const [mainTab, setMainTab] = useState("chat-search");
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<UserProfile[]>([]);
  const [searching, setSearching] = useState(false);
  const [selectedUser, setSelectedUser] = useState<UserProfile | null>(null);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [loadingConversations, setLoadingConversations] = useState(false);
  const [selectedConversation, setSelectedConversation] = useState<Conversation | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [phoneAlerts, setPhoneAlerts] = useState<PhoneAlert[]>([]);
  const [loadingAlerts, setLoadingAlerts] = useState(false);
  const [newAlertCount, setNewAlertCount] = useState(0);
  const lastAlertTimeRef = useRef<string | null>(null);
  const [chatSubTab, setChatSubTab] = useState("search");

  // Ban dialog state
  const [showBanDialog, setShowBanDialog] = useState(false);
  const [banTargetUser, setBanTargetUser] = useState<UserProfile | null>(null);
  const [banDuration, setBanDuration] = useState("2");
  const [banCustomHours, setBanCustomHours] = useState("");
  const [banReason, setBanReason] = useState("Number Sharing");
  const [banning, setBanning] = useState(false);
  const [banType, setBanType] = useState<"urgent" | "medium" | "normal">("normal");

  const openBanDialog = (user: UserProfile) => {
    setBanTargetUser(user);
    setBanDuration("2");
    setBanCustomHours("");
    setBanReason("Number Sharing");
    setBanType("normal");
    setShowBanDialog(true);
  };

  const handleBanUser = async () => {
    if (!banTargetUser) return;
    setBanning(true);
    try {
      if (banType === "urgent") {
        // URGENT BAN: Device + Account ban, host demoted, level reset, can never use this device again
        // 1. Demote host to user & reset level
        if (banTargetUser.is_host) {
          await supabase.rpc('admin_update_user_gender', {
            _user_id: banTargetUser.id,
            _gender: 'male',
          });
        }
        await supabase.from('profiles').update({
          is_host: false,
          host_status: null,
          is_face_verified: false,
          user_level: 0,
          host_level: 0,
        }).eq('id', banTargetUser.id);

        // 2. Block the account
        const { error: blockError } = await supabase.rpc('admin_block_user', {
          _user_id: banTargetUser.id,
          _block: true,
          _reason: banReason || 'Urgent Ban - Device + Account Permanently Banned',
        });
        if (blockError) throw blockError;

        // 3. Ban the device permanently
        const { data: profileData } = await supabase.from('profiles').select('device_id').eq('id', banTargetUser.id).single();
        if (profileData?.device_id) {
          await supabase.from('banned_devices').upsert({
            device_id: profileData.device_id,
            user_id: banTargetUser.id,
            reason: banReason || 'Urgent Ban - Device permanently banned',
            is_permanent: true,
            is_active: true,
          }, { onConflict: 'device_id' });
        }

        // 4. Log to live_bans
        await supabase.from('live_bans').insert({
          user_id: banTargetUser.id,
          ban_reason: banReason || 'Urgent Ban - Device + Account',
          violation_type: 'urgent_ban',
          ban_duration_hours: null,
          ban_end: null,
          is_active: true,
          auto_banned: false,
        });

        // 5. Admin notification
        await supabase.from('admin_notifications').insert({
          type: 'urgent_ban',
          title: '🚨 URGENT BAN Applied',
          message: `${banTargetUser.display_name} (${banTargetUser.app_uid}) - Device + Account permanently banned. Reason: ${banReason}`,
          priority: 'critical',
          data: { user_id: banTargetUser.id, ban_type: 'urgent' },
        });

        toast({ title: "🚨 URGENT BAN Applied", description: `${banTargetUser.display_name} - Device + Account permanently banned. Cannot create new ID on this device.` });
      } else if (banType === "medium") {
        // MEDIUM BAN: Account permanently banned, but can make new account on same device
        if (banTargetUser.is_host) {
          await supabase.rpc('admin_update_user_gender', {
            _user_id: banTargetUser.id,
            _gender: 'male',
          });
        }
        await supabase.from('profiles').update({
          is_host: false,
          host_status: null,
          is_face_verified: false,
          user_level: 0,
          host_level: 0,
        }).eq('id', banTargetUser.id);

        const { error: blockError } = await supabase.rpc('admin_block_user', {
          _user_id: banTargetUser.id,
          _block: true,
          _reason: banReason || 'Medium Ban - Account Permanently Banned',
        });
        if (blockError) throw blockError;

        await supabase.from('live_bans').insert({
          user_id: banTargetUser.id,
          ban_reason: banReason || 'Medium Ban - Account Only',
          violation_type: 'medium_ban',
          ban_duration_hours: null,
          ban_end: null,
          is_active: true,
          auto_banned: false,
        });

        await supabase.from('admin_notifications').insert({
          type: 'medium_ban',
          title: '🚫 Medium Ban Applied',
          message: `${banTargetUser.display_name} (${banTargetUser.app_uid}) - Account permanently banned. Can create new ID. Reason: ${banReason}`,
          priority: 'high',
          data: { user_id: banTargetUser.id, ban_type: 'medium' },
        });

        toast({ title: "🚫 Medium Ban Applied", description: `${banTargetUser.display_name} - Account banned. Can create new ID on same device.` });
      } else {
        // NORMAL BAN: Timed ban (hours-based)
        const hours = banDuration === "custom" ? parseInt(banCustomHours) : parseInt(banDuration);
        if (!hours || hours < 1) {
          toast({ title: "Invalid duration", variant: "destructive" });
          setBanning(false);
          return;
        }
        const banEnd = new Date(Date.now() + hours * 60 * 60 * 1000).toISOString();

        const { error } = await supabase.from('live_bans').insert({
          user_id: banTargetUser.id,
          ban_reason: banReason || 'Normal Ban - Timed',
          violation_type: 'normal_ban',
          ban_duration_hours: hours,
          ban_end: banEnd,
          is_active: true,
          auto_banned: false,
        });
        if (error) throw error;

        toast({ title: "⏱️ Normal Ban Applied", description: `${banTargetUser.display_name} banned for ${hours} hours` });
      }
      setShowBanDialog(false);
    } catch (err) {
      console.error("Ban error:", err);
      toast({ title: "Ban Failed", variant: "destructive" });
    } finally {
      setBanning(false);
    }
  };

  // Search users
  const searchUsers = useCallback(async () => {
    if (!searchQuery || searchQuery.length < 2) {
      setSearchResults([]);
      return;
    }
    setSearching(true);
    try {
      const res = await fetch(`${EDGE_URL}/search-user?q=${encodeURIComponent(searchQuery)}`);
      const data = await res.json();
      setSearchResults(data.users || []);
    } catch (e) {
      console.error("Search failed:", e);
    } finally {
      setSearching(false);
    }
  }, [searchQuery]);

  useEffect(() => {
    const timer = setTimeout(searchUsers, 400);
    return () => clearTimeout(timer);
  }, [searchQuery, searchUsers]);

  const loadConversations = async (user: UserProfile) => {
    setSelectedUser(user);
    setSelectedConversation(null);
    setMessages([]);
    setLoadingConversations(true);
    try {
      const res = await fetch(`${EDGE_URL}/user-conversations?userId=${user.id}`);
      const data = await res.json();
      setConversations(data.conversations || []);
    } catch (e) {
      console.error("Load conversations failed:", e);
    } finally {
      setLoadingConversations(false);
    }
  };

  const loadMessages = async (conv: Conversation) => {
    setSelectedConversation(conv);
    setLoadingMessages(true);
    try {
      const res = await fetch(`${EDGE_URL}/conversation-messages?conversationId=${conv.id}`);
      const data = await res.json();
      setMessages(data.messages || []);
    } catch (e) {
      console.error("Load messages failed:", e);
    } finally {
      setLoadingMessages(false);
    }
  };

  const loadPhoneAlerts = useCallback(async (markAsSeen = false) => {
    setLoadingAlerts(true);
    try {
      const res = await fetch(`${EDGE_URL}/phone-alerts`);
      const data = await res.json();
      const alerts = data.alerts || [];
      setPhoneAlerts(alerts);

      if (alerts.length > 0) {
        const newestAlertTime = alerts[0].created_at as string;

        if (!markAsSeen && lastAlertTimeRef.current) {
          const previousTs = new Date(lastAlertTimeRef.current).getTime();
          const incomingCount = alerts.filter((alert: PhoneAlert) => new Date(alert.created_at).getTime() > previousTs).length;
          if (incomingCount > 0) {
            setNewAlertCount(prev => prev + incomingCount);
          }
        }

        lastAlertTimeRef.current = newestAlertTime;
      }

      if (markAsSeen) {
        setNewAlertCount(0);
      }
    } catch (e) {
      console.error("Load alerts failed:", e);
    } finally {
      setLoadingAlerts(false);
    }
  }, []);

  useEffect(() => {
    if (chatSubTab === "alerts" || mainTab === "phone-alerts") {
      void loadPhoneAlerts(true);
    }
  }, [chatSubTab, mainTab, loadPhoneAlerts]);

  useAdminRealtime(['notifications', 'chat_moderation_logs'], () => {
    void loadPhoneAlerts(mainTab === "phone-alerts" || chatSubTab === "alerts");
  });

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 p-4 sm:p-6">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-xl sm:text-2xl font-bold text-white flex items-center gap-2">
          <Shield className="w-6 h-6 text-purple-400" />
          Moderation & Chat Inspector
        </h1>
        <p className="text-white/60 text-sm mt-1">
          Chat inspection, number sharing detection, violations & live bans — all in one place
        </p>
      </div>

      {/* Main 5-Tab Navigation */}
      <Tabs value={mainTab} onValueChange={setMainTab}>
        <TabsList className="bg-slate-800/50 border border-slate-700 mb-4 grid grid-cols-5 h-auto">
          <TabsTrigger value="chat-search" className="data-[state=active]:bg-purple-600 py-2.5 text-xs">
            <MessageSquare className="w-4 h-4 mr-1" /> Chat
          </TabsTrigger>
          <TabsTrigger value="phone-alerts" className="data-[state=active]:bg-red-600 py-2.5 text-xs relative">
            <Phone className="w-4 h-4 mr-1" /> Alerts
            {newAlertCount > 0 && (
              <span className="absolute -top-1.5 -right-1.5 w-5 h-5 bg-red-500 rounded-full text-[10px] text-white flex items-center justify-center font-bold animate-pulse">
                {newAlertCount}
              </span>
            )}
          </TabsTrigger>
          <TabsTrigger value="number-sharing" className="data-[state=active]:bg-orange-600 py-2.5 text-xs">
            <Phone className="w-4 h-4 mr-1" /> Sharing
          </TabsTrigger>
          <TabsTrigger value="violations" className="data-[state=active]:bg-amber-600 py-2.5 text-xs">
            <ShieldAlert className="w-4 h-4 mr-1" /> Violations
          </TabsTrigger>
          <TabsTrigger value="live-bans" className="data-[state=active]:bg-rose-600 py-2.5 text-xs">
            <Ban className="w-4 h-4 mr-1" /> Bans
          </TabsTrigger>
        </TabsList>

        {/* ========== TAB 1: CHAT SEARCH ========== */}
        <TabsContent value="chat-search" className="space-y-4">
          {selectedConversation && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => { setSelectedConversation(null); setMessages([]); }}
              className="text-white/70 hover:text-white"
            >
              <ArrowLeft className="w-4 h-4 mr-1" /> Back to conversations
            </Button>
          )}
          {selectedUser && !selectedConversation && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => { setSelectedUser(null); setConversations([]); }}
              className="text-white/70 hover:text-white"
            >
              <ArrowLeft className="w-4 h-4 mr-1" /> Back to search
            </Button>
          )}

          {/* Search Box */}
          {!selectedUser && (
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/40" />
              <Input
                placeholder="Search by UID or name..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10 bg-slate-800/50 border-slate-700 text-white placeholder:text-white/40"
              />
            </div>
          )}

          {/* Search Results */}
          {!selectedUser && searchResults.length > 0 && (
            <div className="grid gap-2">
              {searchResults.map((user) => (
                <div
                  key={user.id}
                  onClick={() => loadConversations(user)}
                  className="flex items-center gap-3 p-3 bg-slate-800/50 border border-slate-700 rounded-xl cursor-pointer hover:bg-slate-700/50 transition-colors"
                >
                  <Avatar className="w-10 h-10 border-2 border-purple-500/30">
                    <AvatarImage src={user.avatar_url || ""} />
                    <AvatarFallback className="bg-purple-900/50 text-purple-300 text-sm">
                      {user.display_name?.[0] || "U"}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-white font-medium text-sm truncate">
                        {user.display_name || "Unknown"}
                      </span>
                      {user.country_flag && <span className="text-sm">{user.country_flag}</span>}
                      {user.is_host && <Badge className="bg-pink-600/30 text-pink-300 text-[10px] px-1.5">Host</Badge>}
                      {user.is_blocked && <Badge className="bg-red-600/30 text-red-300 text-[10px] px-1.5">Blocked</Badge>}
                    </div>
                    <p className="text-white/50 text-xs">UID: {user.app_uid || "—"}</p>
                  </div>
                  <ChevronRight className="w-4 h-4 text-white/30" />
                </div>
              ))}
            </div>
          )}

          {/* User Profile + Conversations */}
          {selectedUser && !selectedConversation && (
            <div className="space-y-4">
              <div className="p-4 bg-gradient-to-r from-purple-900/30 to-slate-800/50 border border-purple-500/20 rounded-xl">
                <div className="flex items-center gap-3">
                  <Avatar className="w-14 h-14 border-2 border-purple-500/40">
                    <AvatarImage src={selectedUser.avatar_url || ""} />
                    <AvatarFallback className="bg-purple-900/50 text-purple-300">
                      {selectedUser.display_name?.[0] || "U"}
                    </AvatarFallback>
                  </Avatar>
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="text-white font-bold">{selectedUser.display_name}</h3>
                      {selectedUser.country_flag && <span>{selectedUser.country_flag}</span>}
                    </div>
                    <p className="text-white/50 text-sm">UID: {selectedUser.app_uid}</p>
                    <div className="flex gap-1.5 mt-1">
                      {selectedUser.is_host && <Badge className="bg-pink-600/30 text-pink-300 text-[10px]">🎤 Host</Badge>}
                      {selectedUser.is_blocked && <Badge className="bg-red-600/30 text-red-300 text-[10px]">🚫 Blocked</Badge>}
                      <Badge className="bg-slate-700 text-white/60 text-[10px]">Lv.{selectedUser.user_level || 1}</Badge>
                    </div>
                  </div>
                </div>
              </div>

              {loadingConversations ? (
                <div className="flex justify-center py-10">
                  <Loader2 className="w-6 h-6 text-purple-400 animate-spin" />
                </div>
              ) : conversations.length === 0 ? (
                <div className="text-center py-10 text-white/40">
                  <MessageSquare className="w-10 h-10 mx-auto mb-2 opacity-40" />
                  <p>No conversations found</p>
                </div>
              ) : (
                <div className="space-y-2">
                  <p className="text-white/50 text-sm font-medium">
                    {conversations.length} conversations
                  </p>
                  {conversations.map((conv) => (
                    <div
                      key={conv.id}
                      onClick={() => loadMessages(conv)}
                      className={cn(
                        "flex items-center gap-3 p-3 border rounded-xl cursor-pointer transition-colors",
                        conv.has_violations
                          ? "bg-red-900/20 border-red-500/30 hover:bg-red-900/30"
                          : "bg-slate-800/50 border-slate-700 hover:bg-slate-700/50"
                      )}
                    >
                      <Avatar className="w-10 h-10">
                        <AvatarImage src={conv.other_user.avatar_url || ""} />
                        <AvatarFallback className="bg-slate-700 text-white/60 text-sm">
                          {conv.other_user.display_name?.[0] || "?"}
                        </AvatarFallback>
                      </Avatar>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-white font-medium text-sm truncate">
                            {conv.other_user.display_name || "Unknown"}
                          </span>
                          {conv.other_user.country_flag && <span className="text-xs">{conv.other_user.country_flag}</span>}
                          {conv.other_user.is_host && <Badge className="bg-pink-600/20 text-pink-300 text-[9px] px-1">Host</Badge>}
                          {conv.other_user.is_blocked && <Badge className="bg-red-600/20 text-red-300 text-[9px] px-1">Blocked</Badge>}
                          {conv.has_violations && (
                            <Badge className="bg-red-600/30 text-red-300 text-[9px] px-1 animate-pulse">
                              🚨 Number Detected
                            </Badge>
                          )}
                        </div>
                        <p className="text-white/40 text-xs truncate">
                          {conv.last_message?.content || "No messages"}
                        </p>
                      </div>
                      <div className="text-right shrink-0">
                        <Badge className="bg-slate-700 text-white/50 text-[10px]">
                          {conv.message_count} msgs
                        </Badge>
                        {conv.last_message_at && (
                          <p className="text-[10px] text-white/30 mt-1">
                            {formatDistanceToNow(new Date(conv.last_message_at), { addSuffix: true })}
                          </p>
                        )}
                      </div>
                      <ChevronRight className="w-4 h-4 text-white/20" />
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Messages View */}
          {selectedConversation && (
            <div className="space-y-3">
              <div className="p-3 bg-slate-800/50 border border-slate-700 rounded-xl flex items-center gap-3">
                <Avatar className="w-8 h-8">
                  <AvatarImage src={selectedUser?.avatar_url || ""} />
                  <AvatarFallback className="bg-purple-900/50 text-purple-300 text-xs">
                    {selectedUser?.display_name?.[0]}
                  </AvatarFallback>
                </Avatar>
                <span className="text-white/80 text-sm font-medium">{selectedUser?.display_name}</span>
                <span className="text-white/30 text-xs">↔</span>
                <Avatar className="w-8 h-8">
                  <AvatarImage src={selectedConversation.other_user.avatar_url || ""} />
                  <AvatarFallback className="bg-slate-700 text-white/60 text-xs">
                    {selectedConversation.other_user.display_name?.[0]}
                  </AvatarFallback>
                </Avatar>
                <span className="text-white/80 text-sm font-medium">{selectedConversation.other_user.display_name}</span>
              </div>

              {loadingMessages ? (
                <div className="flex justify-center py-10">
                  <Loader2 className="w-6 h-6 text-purple-400 animate-spin" />
                </div>
              ) : (
                <ScrollArea className="h-[60vh] rounded-xl border border-slate-700 bg-slate-900/50 p-3">
                  <div className="space-y-2">
                    {messages.map((msg) => {
                      const isTarget = msg.sender_id === selectedUser?.id;
                      const flagged = hasPhoneNumber(msg.content || "");
                      return (
                        <div
                          key={msg.id}
                          className={cn(
                            "flex gap-2",
                            isTarget ? "justify-start" : "justify-end"
                          )}
                        >
                          <div
                            className={cn(
                              "max-w-[75%] p-2.5 rounded-xl text-sm relative",
                              isTarget
                                ? "bg-slate-800 text-white/90 rounded-tl-sm"
                                : "bg-purple-900/40 text-white/90 rounded-tr-sm",
                              flagged && "ring-2 ring-red-500 bg-red-900/30 shadow-[0_0_15px_rgba(239,68,68,0.3)]"
                            )}
                          >
                            {flagged && (
                              <div className="absolute -top-2 -right-2 w-6 h-6 bg-red-500 rounded-full flex items-center justify-center shadow-lg">
                                <AlertTriangle className="w-3.5 h-3.5 text-white" />
                              </div>
                            )}
                            <p className="text-[10px] font-semibold mb-0.5" style={{ color: isTarget ? '#a78bfa' : '#f0abfc' }}>
                              {msg.sender?.display_name || "Unknown"} ({msg.sender?.app_uid || "—"})
                            </p>

                            {msg.message_type === 'image' ? (
                              <div className="text-white/50 text-xs italic">[📷 Image]</div>
                            ) : msg.message_type === 'audio' ? (
                              <div className="text-white/50 text-xs italic">[🎵 Audio]</div>
                            ) : msg.message_type === 'gift' ? (
                              <div className="text-white/50 text-xs italic">[🎁 Gift]</div>
                            ) : (
                              <>
                                <p className="whitespace-pre-wrap break-words">{msg.content}</p>
                                {/* Admin: Show original unmasked content */}
                                {msg.original_content && msg.content?.includes('***') && (
                                  <div className="mt-1.5 px-2 py-1 bg-amber-500/10 rounded border border-amber-500/30">
                                    <p className="text-[10px] text-amber-400 font-semibold mb-0.5">📋 Original Message:</p>
                                    <p className="text-amber-200 text-xs font-mono break-all">{msg.original_content}</p>
                                  </div>
                                )}
                                {msg.detected_numbers && (
                                  <div className="mt-1 px-2 py-0.5 bg-red-500/10 rounded border border-red-500/30">
                                    <p className="text-red-300 text-[10px] font-mono">🔍 Detected: {msg.detected_numbers}</p>
                                  </div>
                                )}
                              </>
                            )}

                            {flagged && (
                              <div className="flex items-center gap-1 mt-1.5 px-2 py-1 bg-red-500/20 rounded-lg border border-red-500/30">
                                <Phone className="w-3 h-3 text-red-400" />
                                <span className="text-red-300 text-[10px] font-bold">⚠️ Number Sharing Detected!</span>
                              </div>
                            )}

                            <p className="text-[9px] text-white/30 mt-1 text-right">
                              {format(new Date(msg.created_at), "dd MMM yyyy, hh:mm a")}
                            </p>
                          </div>
                        </div>
                      );
                    })}
                    {messages.length === 0 && (
                      <p className="text-center text-white/30 py-10">No messages</p>
                    )}
                  </div>
                </ScrollArea>
              )}
            </div>
          )}

          {!selectedUser && searchResults.length === 0 && !searching && (
            <div className="text-center py-16 text-white/30">
              <Search className="w-12 h-12 mx-auto mb-3 opacity-30" />
              <p className="text-lg font-medium">Search Users</p>
              <p className="text-sm mt-1">Search by UID or name to view their messages</p>
            </div>
          )}
        </TabsContent>

        {/* ========== TAB 2: PHONE ALERTS ========== */}
        <TabsContent value="phone-alerts" className="space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-white/50 text-sm">
              {phoneAlerts.length > 0 ? `Latest ${phoneAlerts.length} number detections` : ''}
            </p>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => void loadPhoneAlerts(true)}
              disabled={loadingAlerts}
              className="text-white/50 hover:text-white"
            >
              <RefreshCw className={cn("w-4 h-4 mr-1", loadingAlerts && "animate-spin")} />
              Refresh
            </Button>
          </div>

          {loadingAlerts ? (
            <div className="flex justify-center py-10">
              <Loader2 className="w-6 h-6 text-red-400 animate-spin" />
            </div>
          ) : phoneAlerts.length === 0 ? (
            <div className="text-center py-16 text-white/30">
              <Shield className="w-12 h-12 mx-auto mb-3 opacity-30" />
              <p>No number sharing alerts</p>
            </div>
          ) : (
            <div className="space-y-2">
              {phoneAlerts.map((alert) => (
                <div
                  key={alert.id}
                  className="p-3 bg-red-900/10 border border-red-500/20 rounded-xl hover:bg-red-900/20 transition-colors"
                >
                  <div className="flex items-start gap-3">
                    <div className="w-10 h-10 rounded-full bg-red-500/20 flex items-center justify-center shrink-0">
                      <Phone className="w-5 h-5 text-red-400" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-white font-medium text-sm">
                          {alert.user?.display_name || "Unknown"}
                        </span>
                        <span className="text-white/40 text-xs">
                          UID: {alert.user?.app_uid || "—"}
                        </span>
                        {alert.user?.is_host && <Badge className="bg-pink-600/20 text-pink-300 text-[9px]">Host</Badge>}
                        {alert.violation_number && (
                          <Badge className="bg-orange-600/20 text-orange-300 text-[9px]">
                            Violation #{alert.violation_number}
                          </Badge>
                        )}
                      </div>
                      {alert.detected_content && (
                        <p className="text-red-300/80 text-xs mt-1 font-mono bg-red-500/10 px-2 py-1 rounded border border-red-500/20 truncate">
                          "{alert.detected_content}"
                        </p>
                      )}
                      {alert.notes && (
                        <p className="text-white/40 text-[10px] mt-1 truncate">{alert.notes}</p>
                      )}
                      <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                        <span className="text-white/30 text-[10px]">
                          {formatDistanceToNow(new Date(alert.created_at), { addSuffix: true })}
                        </span>
                        {alert.action_taken && (
                          <Badge className="bg-yellow-600/20 text-yellow-300 text-[9px]">
                            {alert.action_taken}
                          </Badge>
                        )}
                        {alert.beans_deducted && alert.beans_deducted > 0 && (
                          <Badge className="bg-red-600/20 text-red-300 text-[9px]">
                            -{alert.beans_deducted} beans
                          </Badge>
                        )}
                      </div>
                    </div>
                    <div className="flex flex-col gap-1.5 shrink-0">
                      <Button
                        size="sm"
                        variant="ghost"
                        className="text-purple-400 hover:text-purple-300 text-xs"
                        onClick={() => {
                          if (alert.user) {
                            setMainTab("chat-search");
                            loadConversations(alert.user);
                          }
                        }}
                      >
                        <Eye className="w-3.5 h-3.5 mr-1" /> Messages
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="text-red-400 hover:text-red-300 hover:bg-red-500/10 text-xs"
                        onClick={() => {
                          if (alert.user) openBanDialog(alert.user);
                        }}
                      >
                        <Gavel className="w-3.5 h-3.5 mr-1" /> Punish
                      </Button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </TabsContent>

        {/* ========== TAB 3: NUMBER SHARING REPORT ========== */}
        <TabsContent value="number-sharing" className="mt-0">
          <AdminNumberSharing
            onViewChat={(user) => {
              setMainTab("chat-search");
              loadConversations(user);
            }}
            onBanUser={(user) => openBanDialog(user)}
          />
        </TabsContent>

        {/* ========== TAB 4: CONTACT VIOLATIONS ========== */}
        <TabsContent value="violations" className="mt-0">
          <AdminContactViolations
            onViewChat={(user) => {
              setMainTab("chat-search");
              loadConversations(user);
            }}
          />
        </TabsContent>

        {/* ========== TAB 5: LIVE BANS ========== */}
        <TabsContent value="live-bans" className="mt-0">
          <AdminLiveBans />
        </TabsContent>
      </Tabs>

      {/* ========== BAN DIALOG ========== */}
      <Dialog open={showBanDialog} onOpenChange={setShowBanDialog}>
        <DialogContent className="bg-slate-900 border-slate-700 text-white max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-red-400">
              <Gavel className="w-5 h-5" />
              Live Ban / Punishment
            </DialogTitle>
          </DialogHeader>

          {banTargetUser && (
            <div className="space-y-4">
              <div className="flex items-center gap-3 p-3 bg-slate-800/50 border border-slate-700 rounded-xl">
                <Avatar className="w-10 h-10 border-2 border-red-500/30">
                  <AvatarImage src={banTargetUser.avatar_url || ""} />
                  <AvatarFallback className="bg-red-900/50 text-red-300 text-sm">
                    {banTargetUser.display_name?.[0] || "U"}
                  </AvatarFallback>
                </Avatar>
                <div>
                  <p className="text-white font-medium text-sm">{banTargetUser.display_name}</p>
                  <p className="text-white/40 text-xs">UID: {banTargetUser.app_uid}</p>
                </div>
                {banTargetUser.is_host && <Badge className="bg-pink-600/20 text-pink-300 text-[9px]">Host</Badge>}
              </div>

              {/* Ban Type - 3 Tiers */}
              <div>
                <p className="text-white/70 text-sm mb-2 font-medium">Ban Type</p>
                <div className="grid grid-cols-3 gap-2">
                  <button
                    onClick={() => setBanType("normal")}
                    className={cn(
                      "px-2 py-2.5 rounded-lg text-xs font-medium border transition-colors",
                      banType === "normal"
                        ? "bg-yellow-600 border-yellow-500 text-white"
                        : "bg-slate-800 border-slate-700 text-white/60 hover:border-yellow-500/50"
                    )}
                  >
                    ⏱️ Normal
                  </button>
                  <button
                    onClick={() => setBanType("medium")}
                    className={cn(
                      "px-2 py-2.5 rounded-lg text-xs font-medium border transition-colors",
                      banType === "medium"
                        ? "bg-orange-600 border-orange-500 text-white"
                        : "bg-slate-800 border-slate-700 text-white/60 hover:border-orange-500/50"
                    )}
                  >
                    🚫 Medium
                  </button>
                  <button
                    onClick={() => setBanType("urgent")}
                    className={cn(
                      "px-2 py-2.5 rounded-lg text-xs font-medium border transition-colors",
                      banType === "urgent"
                        ? "bg-red-700 border-red-600 text-white"
                        : "bg-slate-800 border-slate-700 text-white/60 hover:border-red-500/50"
                    )}
                  >
                    🚨 Urgent
                  </button>
                </div>
              </div>

              {banType === "urgent" && (
                <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-3">
                  <p className="text-red-300 text-xs font-bold mb-1">🚨 EMERGENCY BAN</p>
                  <p className="text-red-300/70 text-[11px] leading-relaxed">
                    Device + Account permanently banned. Host demoted, level reset to 0. Cannot create new ID on this device.
                  </p>
                </div>
              )}

              {banType === "medium" && (
                <div className="bg-orange-500/10 border border-orange-500/30 rounded-xl p-3">
                  <p className="text-orange-300 text-xs font-bold mb-1">🚫 Account Ban</p>
                  <p className="text-orange-300/70 text-[11px] leading-relaxed">
                    Account permanently banned. Host demoted, level reset. Can create new ID on same device.
                  </p>
                </div>
              )}

              {banType === "normal" && (
                <div>
                  <p className="text-white/70 text-sm mb-2 font-medium">
                    <Clock className="w-4 h-4 inline mr-1" />
                    Ban Duration
                  </p>
                  <div className="grid grid-cols-4 gap-2">
                    {[
                      { value: "0.5", label: "30 Min" },
                      { value: "1", label: "1 Hour" },
                      { value: "2", label: "2 Hours" },
                      { value: "3", label: "3 Hours" },
                      { value: "5", label: "5 Hours" },
                      { value: "6", label: "6 Hours" },
                      { value: "24", label: "24 Hours" },
                      { value: "custom", label: "Custom" },
                    ].map((opt) => (
                      <button
                        key={opt.value}
                        onClick={() => setBanDuration(opt.value)}
                        className={cn(
                          "px-3 py-2 rounded-lg text-xs font-medium border transition-colors",
                          banDuration === opt.value
                            ? "bg-yellow-600 border-yellow-500 text-white"
                            : "bg-slate-800 border-slate-700 text-white/60 hover:border-yellow-500/50"
                        )}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                  {banDuration === "custom" && (
                    <Input
                      type="number"
                      placeholder="Enter hours..."
                      value={banCustomHours}
                      onChange={(e) => setBanCustomHours(e.target.value)}
                      className="mt-2 bg-slate-800 border-slate-700 text-white placeholder:text-white/30"
                    />
                  )}
                </div>
              )}

              <div>
                <p className="text-white/70 text-sm mb-2 font-medium">
                  Ban Reason
                </p>
                <Textarea
                  value={banReason}
                  onChange={(e) => setBanReason(e.target.value)}
                  placeholder="Enter reason for ban..."
                  className="bg-slate-800 border-slate-700 text-white placeholder:text-white/30 min-h-[60px]"
                />
              </div>

              <div className="flex gap-2">
                <Button
                  variant="ghost"
                  className="flex-1 text-white/60"
                  onClick={() => setShowBanDialog(false)}
                >
                  Cancel
                </Button>
                <Button
                  className={cn(
                    "flex-1 text-white",
                    banType === "urgent"
                      ? "bg-red-700 hover:bg-red-800"
                      : banType === "medium"
                      ? "bg-orange-600 hover:bg-orange-700"
                      : "bg-yellow-600 hover:bg-yellow-700"
                  )}
                  onClick={handleBanUser}
                  disabled={banning}
                >
                  {banning ? (
                    <Loader2 className="w-4 h-4 animate-spin mr-1" />
                  ) : (
                    <Ban className="w-4 h-4 mr-1" />
                  )}
                  {banType === "urgent" ? "🚨 Urgent Ban" : banType === "medium" ? "🚫 Medium Ban" : "⏱️ Normal Ban"}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default AdminChatInspector;
