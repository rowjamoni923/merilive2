import { useState, useEffect, useCallback, useRef } from "react";
import { useAdminRealtime } from "@/hooks/useAdminRealtime";
import { cn } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { adminSupabase as supabase } from "@/integrations/supabase/adminClient";
import { useToast } from "@/hooks/use-toast";
import { 
  MessageCircle, Search, Loader2, Send, Clock, CheckCircle, 
  AlertCircle, XCircle, User, Mail, RefreshCw, Headphones, Gift, Diamond, Building2, Plus, Minus,
  Image as ImageIcon, Volume2, Languages, Globe, Sparkles, Zap, Shield, CreditCard, Mic, MicOff, Paperclip
} from "lucide-react";
import { format } from "date-fns";
import AdminQuickLinks from "@/components/admin/AdminQuickLinks";
import SupportReportDialog from "@/components/admin/SupportReportDialog";
import { ShieldAlert } from "lucide-react";

import { adminSendNotification } from "@/utils/adminNotification";
import { recordAdminError } from "@/utils/adminErrorLog";

import { formatAdminError } from "@/utils/formatAdminError";
interface SupportTicket {
  id: string;
  ticket_number: string;
  user_id: string;
  subject: string;
  category: string;
  priority: string;
  status: string;
  user_email: string | null;
  created_at: string;
  updated_at: string;
  resolved_at: string | null;
  closed_at: string | null;
  sender_sector: string | null;
  profile?: {
    display_name: string;
    avatar_url: string;
    app_uid: string;
  };
}

interface SupportMessage {
  id: string;
  ticket_id: string;
  sender_id: string | null;
  sender_type: string;
  content: string;
  is_read: boolean;
  created_at: string;
  attachment_url?: string;
  attachment_type?: string;
  translated_content?: string;
  original_language?: string;
  voice_transcript?: string;
}

const REPLY_LANGUAGES = [
  { code: "user_lang", label: "User's Language" },
  { code: "en", label: "English" },
  { code: "bn", label: "Bengali" },
  { code: "hi", label: "Hindi" },
  { code: "ur", label: "Urdu" },
  { code: "ar", label: "Arabic (العربية)" },
  { code: "th", label: "Thai (ไทย)" },
  { code: "ms", label: "Malay" },
  { code: "tl", label: "Filipino" },
  { code: "ja", label: "Japanese (日本語)" },
  { code: "si", label: "Sinhala (සිංහල)" },
  { code: "ne", label: "Nepali (नेपाली)" },
  { code: "id", label: "Indonesian" },
];

// ✅ Detect ALL AI-generated messages: summaries, category headers, AI conversation logs
const AI_MESSAGE_PATTERNS = [
  /ai conversation summary/i,
  /📋\s*AI\s*Conversation\s*Summary/i,
  /^\[Category:\s*.+\]\s*\n\s*📋/i,          // "[Category: ...]\n📋 AI Conversation Summary"
  /^\[Category:\s*.+\]\s*\n\s*AI:/im,         // "[Category: ...]\nAI: ..." 
  /^AI:\s*[👤❓💰🎮📦🔧]/,                    // "AI: 👤 **Account / Profile Issue** selected."
];
const isAiSummarySupportMessage = (content?: string) =>
  Boolean(content) && AI_MESSAGE_PATTERNS.some(re => re.test(content!));

const ADMIN_TICKETS_FETCH_LIMIT = 120;
const ADMIN_RT_REFRESH_DEBOUNCE_MS = 280;
const SUPPORT_ATTACHMENT_BUCKET = 'support-attachments';

const extractSupportAttachmentPath = (value?: string | null) => {
  if (!value) return null;
  const marker = `/${SUPPORT_ATTACHMENT_BUCKET}/`;
  const markerIndex = value.indexOf(marker);
  if (markerIndex >= 0) return decodeURIComponent(value.slice(markerIndex + marker.length).split('?')[0]);
  if (!/^https?:\/\//i.test(value)) return value;
  return null;
};

const AdminSupportTickets = () => {
  const { toast } = useToast();
  const [tickets, setTickets] = useState<SupportTicket[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("open");
  const [sectorFilter, setSectorFilter] = useState("all");
  const [selectedTicket, setSelectedTicket] = useState<SupportTicket | null>(null);
  const [messages, setMessages] = useState<SupportMessage[]>([]);
  const [reportOpen, setReportOpen] = useState(false);
  const [replyMessage, setReplyMessage] = useState("");
  const [replyLanguage, setReplyLanguage] = useState("user_lang");
  const [isTranslating, setIsTranslating] = useState(false);
  const [sending, setSending] = useState(false);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [compensationBeans, setCompensationBeans] = useState("");
  const [compensationDiamonds, setCompensationDiamonds] = useState("");
  const [showCompensation, setShowCompensation] = useState(false);
  const [showResolveModal, setShowResolveModal] = useState(false);
  const [resolveBeans, setResolveBeans] = useState("");
  const [resolveDiamonds, setResolveDiamonds] = useState("");
  const [resolving, setResolving] = useState(false);
  const [statusUpdating, setStatusUpdating] = useState(false);
  const [sendingCompensation, setSendingCompensation] = useState(false);
  // Agency compensation
  const [userAgency, setUserAgency] = useState<{ id: string; name: string; beans_balance: number } | null>(null);
  const [compensationAgencyBeans, setCompensationAgencyBeans] = useState("");
  const [agencyBeansMode, setAgencyBeansMode] = useState<"add" | "deduct">("add");
  const [resolveAgencyBeans, setResolveAgencyBeans] = useState("");
  const [resolveAgencyBeansMode, setResolveAgencyBeansMode] = useState<"add" | "deduct">("add");
  const [aiSuggestions, setAiSuggestions] = useState<string[]>([]);
  const [loadingSuggestions, setLoadingSuggestions] = useState(false);
  const [userGender, setUserGender] = useState<string | null>(null);
  const [changingGender, setChangingGender] = useState(false);
  const [userContact, setUserContact] = useState<{ whatsapp?: string; email?: string } | null>(null);
  // Purchase recovery
  const [showPurchaseRecovery, setShowPurchaseRecovery] = useState(false);
  const [recoveryCoins, setRecoveryCoins] = useState("");
  const [recoveryOrderId, setRecoveryOrderId] = useState("");
  const [recoveryReason, setRecoveryReason] = useState("Google Play purchase not delivered");
  const [sendingRecovery, setSendingRecovery] = useState(false);
  const [stats, setStats] = useState({
    total: 0,
    open: 0,
    pending: 0,
    resolved: 0
  });
  // Photo upload
  const [uploadingImage, setUploadingImage] = useState(false);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const [pendingImageUrl, setPendingImageUrl] = useState<string | null>(null);
  const [signedAttachmentUrls, setSignedAttachmentUrls] = useState<Record<string, string>>({});
  // Voice-to-text
  const [isRecording, setIsRecording] = useState(false);
  const recognitionRef = useRef<any>(null);

  // Refs for realtime callbacks (avoid stale closures)
  const selectedTicketRef = useRef<SupportTicket | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const ticketsRef = useRef<SupportTicket[]>([]);
  const inFlightActionsRef = useRef<Set<string>>(new Set());
  const ticketRefreshTimerRef = useRef<number | null>(null);

  const startSingleFlight = (key: string) => {
    if (inFlightActionsRef.current.has(key)) return false;
    inFlightActionsRef.current.add(key);
    return true;
  };

  const endSingleFlight = (key: string) => {
    inFlightActionsRef.current.delete(key);
  };

  const getCurrentSupportName = async () => {
    const { data, error } = await supabase.rpc("admin_get_my_admin_user" as any).maybeSingle();
    if (error) throw error;
    return ((data as any)?.support_display_name?.trim() || (data as any)?.display_name || null) as string | null;
  };

  const sendAdminSupportMessage = async (params: {
    ticketId: string;
    content: string;
    translatedContent?: string | null;
    originalLanguage?: string | null;
    attachmentUrl?: string | null;
    attachmentType?: string | null;
    supportAdminName?: string | null;
    markPending?: boolean;
  }) => {
    const { error } = await supabase.rpc("admin_send_support_message" as any, {
      _ticket_id: params.ticketId,
      _content: params.content,
      _translated_content: params.translatedContent || null,
      _original_language: params.originalLanguage || null,
      _attachment_url: params.attachmentUrl || null,
      _attachment_type: params.attachmentType || null,
      _support_admin_name: params.supportAdminName || null,
      _mark_pending: Boolean(params.markPending),
    });
    if (error) throw error;
  };

  useEffect(() => {
    selectedTicketRef.current = selectedTicket;
    // Lookup agency for this user
    if (selectedTicket?.user_id) {
      supabase.from('agencies').select('id, name, beans_balance, whatsapp_number, email').eq('owner_id', selectedTicket.user_id).maybeSingle()
        .then(({ data }) => {
          setUserAgency(data ? { id: data.id, name: data.name, beans_balance: data.beans_balance || 0 } : null);
          setUserContact(data ? { whatsapp: data.whatsapp_number || undefined, email: data.email || undefined } : null);
        });
      // Fetch user gender
      supabase.from('profiles').select('gender').eq('id', selectedTicket.user_id).maybeSingle()
        .then(({ data }) => setUserGender(data?.gender || null));
    } else {
      setUserAgency(null);
      setUserGender(null);
      setUserContact(null);
    }
  }, [selectedTicket]);

  useEffect(() => {
    ticketsRef.current = tickets;
  }, [tickets]);

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages]);

  const fetchGlobalStats = useCallback(async () => {
    try {
      const [totalRes, openRes, pendingRes, resolvedRes] = await Promise.all([
        supabase.from('support_tickets').select('id', { count: 'exact', head: true }).eq('category', 'live_chat'),
        supabase.from('support_tickets').select('id', { count: 'exact', head: true }).eq('category', 'live_chat').eq('status', 'open'),
        supabase.from('support_tickets').select('id', { count: 'exact', head: true }).eq('category', 'live_chat').eq('status', 'pending'),
        supabase.from('support_tickets').select('id', { count: 'exact', head: true }).eq('category', 'live_chat').in('status', ['resolved', 'closed']),
      ]);

      if (totalRes.error || openRes.error || pendingRes.error || resolvedRes.error) {
        throw totalRes.error || openRes.error || pendingRes.error || resolvedRes.error;
      }

      setStats({
        total: totalRes.count || 0,
        open: openRes.count || 0,
        pending: pendingRes.count || 0,
        resolved: resolvedRes.count || 0,
      });
    } catch (e) {
      console.error('Error fetching global stats:', e);
      recordAdminError({ kind: "rpc", label: "AdminSupportTickets.fetchGlobalStats", message: formatAdminError(e) });
    }
  }, []);

  const loadTickets = useCallback(async () => {
    setLoading(true);
    try {
      let query = supabase
        .from('support_tickets')
        .select('id, ticket_number, user_id, subject, category, priority, status, user_email, created_at, updated_at, resolved_at, closed_at, sender_sector')
        .eq('category', 'live_chat')
        .order('created_at', { ascending: false })
        .limit(ADMIN_TICKETS_FETCH_LIMIT);

      if (statusFilter === 'live_chat') {
        // Already filtered by live_chat category above
      } else if (statusFilter !== "all") {
        query = query.eq('status', statusFilter);
      }

      const { data: ticketsData, error } = await query;
      if (error) throw error;

      // Keep only tickets that contain at least one real user message (exclude AI summaries)
      const allTickets = ticketsData || [];
      const ticketIds = allTickets.map((t) => t.id).filter(Boolean);
      let visibleTickets = allTickets;

      if (ticketIds.length > 0) {
        const { data: ticketMessages, error: ticketMessagesError } = await supabase
          .from('support_messages')
          .select('ticket_id, content, sender_type')
          .in('ticket_id', ticketIds)
          .eq('sender_type', 'user');

        if (ticketMessagesError) throw ticketMessagesError;

        const validTicketIds = new Set(
          (ticketMessages || [])
            .filter((m: any) => !isAiSummarySupportMessage(m.content) && !/^\[Category:\s*.+\].*AI/is.test(m.content || ''))
            .map((m: any) => m.ticket_id)
        );

        visibleTickets = allTickets.filter((t) => validTicketIds.has(t.id));
      }

      // Fetch profiles for filtered users
      const userIds = [...new Set(visibleTickets.map(t => t.user_id).filter(Boolean))];
      let profilesMap: Record<string, any> = {};
      
      if (userIds.length > 0) {
        const { data: profiles } = await supabase
          .from('profiles')
          .select('id, display_name, avatar_url, app_uid')
          .in('id', userIds);
        
        profiles?.forEach(p => {
          profilesMap[p.id] = p;
        });
      }

      // Merge profiles with filtered tickets
      const ticketsWithProfiles = visibleTickets.map(ticket => ({
        ...ticket,
        profile: profilesMap[ticket.user_id] || null
      }));
      
      setTickets(ticketsWithProfiles);
    } catch (error: any) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, [statusFilter, toast]);

  // Realtime push (Pkg37): instant invalidation, no polling
  useAdminRealtime(['support_tickets', 'support_messages'], () => loadTickets(), 'admin-support-tickets-rt');

  const isLegacyAiSummaryMessage = (content?: string) =>
    isAiSummarySupportMessage(content);

  // ✅ Additional check: messages starting with "[Category:" that contain AI conversation history
  const isAiCategoryHeaderMessage = (content?: string) => {
    if (!content) return false;
    // "[Category: X]\n\n📋 AI Conversation Summary:" or "[Category: X]\n\nAI: ..."
    return /^\[Category:\s*.+\]/i.test(content) && (/AI\s*Conversation\s*Summary/i.test(content) || /\nAI:\s/m.test(content));
  };

  const shouldHideMessage = (content?: string) =>
    isLegacyAiSummaryMessage(content) || isAiCategoryHeaderMessage(content);

  const loadMessages = async (ticketId: string) => {
    setLoadingMessages(true);
    try {
      const { data, error } = await supabase
        .from('support_messages')
        .select('*')
        .eq('ticket_id', ticketId)
        .order('created_at', { ascending: true });

      if (error) throw error;

      // ✅ Hide ALL AI-generated messages: summaries, category headers, AI conversation logs
      const msgs = (data || []).filter((m: any) => !shouldHideMessage(m.content));
      setMessages(msgs);

      const signedEntries = await Promise.all(msgs
        .filter((m: any) => m.attachment_url)
        .map(async (m: any) => {
          const signed = await resolveAdminStorageImageUrl(m.attachment_url, SUPPORT_ATTACHMENT_BUCKET);
          return [m.id, signed || m.attachment_url] as const;
        }));
      if (signedEntries.length) setSignedAttachmentUrls(Object.fromEntries(signedEntries));

      // Auto-translate ALL non-admin user messages to Bengali for admin view
      const untranslatedMsgs = msgs.filter(
        (m: any) => m.sender_type !== 'admin' && !m.translated_content && m.content
      );

      if (untranslatedMsgs.length > 0) {
        // Translate in background, update UI as each completes
        const translatePromises = untranslatedMsgs.map(async (msg: any) => {
          try {
            const { data: transData } = await supabase.functions.invoke("translate", {
              body: { text: msg.content, targetLanguage: "bn", sourceLanguage: "auto" },
            });
            const translatedText = transData?.translatedText;
            if (translatedText && translatedText !== msg.content) {
              // Save translation to DB for future loads
              await supabase
                .from('support_messages')
                .update({
                  translated_content: translatedText,
                  original_language: transData?.sourceLanguage || 'en'
                } as any)
                .eq('id', msg.id);
              return { id: msg.id, translated_content: translatedText };
            }
          } catch (e) {
            console.error('[AutoTranslate] Failed for msg:', msg.id, e);
            recordAdminError({ kind: "rpc", label: "AdminSupportTickets.translatedText", message: msg.id instanceof Error ? msg.id.message : String(msg.id) });
          }
          return null;
        });

        // Update messages as translations complete
        Promise.all(translatePromises).then((results) => {
          const translations = results.filter(Boolean) as { id: string; translated_content: string }[];
          if (translations.length > 0) {
            setMessages(prev => prev.map(m => {
              const t = translations.find(tr => tr.id === m.id);
              return t ? { ...m, translated_content: t.translated_content } : m;
            }));
          }
        });
      }

      // Generate AI suggestions for the latest user message
      if (msgs.length > 0) {
        generateAiSuggestions(msgs);
      }

      // Mark unread user messages as read (excluding legacy AI summary blobs)
      await supabase
        .from('support_messages')
        .update({ is_read: true })
        .eq('ticket_id', ticketId)
        .eq('sender_type', 'user')
        .eq('is_read', false)
        .not('content', 'ilike', '%AI Conversation Summary%')
        .not('content', 'ilike', '[Category:%');
    } catch (error: any) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } finally {
      setLoadingMessages(false);
    }
  };

  const handleTicketDialogOpenChange = (open: boolean) => {
    if (!open) {
      setSelectedTicket(null);
      setShowCompensation(false);
      setShowResolveModal(false);
      setStatusUpdating(false);
    }
  };

  // Generate AI reply suggestions based on user messages
  const generateAiSuggestions = useCallback(async (ticketMessages: SupportMessage[]) => {
    // Get last user message
    const userMessages = ticketMessages.filter(m => m.sender_type === 'user');
    if (userMessages.length === 0) return;
    
    const lastUserMsg = userMessages[userMessages.length - 1];
    const messageContent = lastUserMsg.translated_content || lastUserMsg.content;
    
    setLoadingSuggestions(true);
    setAiSuggestions([]);
    
    try {
      const { data, error } = await supabase.functions.invoke('ai-chat', {
        body: {
          mode: 'support_reply',
          messages: [
            { role: 'user', content: `Ticket subject: ${selectedTicketRef.current?.subject || ''}\nCategory: ${selectedTicketRef.current?.category || ''}\n\nUser message: ${messageContent}` }
          ]
        }
      });
      
      if (error) throw error;
      
      const result = data?.result || data?.choices?.[0]?.message?.content;
      if (result) {
        try {
          const cleanResult = result.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
          const suggestions = JSON.parse(cleanResult);
          if (Array.isArray(suggestions) && suggestions.length > 0) {
            setAiSuggestions(suggestions.slice(0, 3));
          }
        } catch {
          console.error('[AI Suggestions] Failed to parse:', result);
          recordAdminError({ kind: "rpc", label: "AdminSupportTickets.suggestions", message: formatAdminError(result)});
        }
      }
    } catch (error) {
      console.error('[AI Suggestions] Error:', error);
      recordAdminError({ kind: "rpc", label: "AdminSupportTickets.suggestions", message: formatAdminError(error) });
    } finally {
      setLoadingSuggestions(false);
    }
  }, []);

  const handleSendReply = async () => {
    if (!replyMessage.trim() || !selectedTicket || sending) return;

    const actionKey = `send-reply-${selectedTicket.id}`;
    if (!startSingleFlight(actionKey)) return;

    setSending(true);
    try {
      // Translate admin reply to user's language if needed
      let translatedContent = "";
      
      // Always translate admin's Bengali reply to English for the user
      let targetLangCode = "en";
      if (replyLanguage !== "user_lang" && replyLanguage !== "bn") {
        targetLangCode = replyLanguage;
      }
      
      // Admin writes in Bengali, translate to user's language
      if (targetLangCode !== "bn") {
        try {
          setIsTranslating(true);
          const { data: transData } = await supabase.functions.invoke("translate", {
            body: { text: replyMessage.trim(), targetLanguage: targetLangCode, sourceLanguage: "bn" },
          });
          translatedContent = transData?.translatedText || "";
        } catch (e) {
          console.error("Translation error:", e);
          recordAdminError({ kind: "rpc", label: "AdminSupportTickets.actionKey", message: formatAdminError(e) });
        } finally {
          setIsTranslating(false);
        }
      }

      // Insert reply message with translation
      // Snapshot the admin's chosen support display name for this reply
      const supportName = await getCurrentSupportName();

      await sendAdminSupportMessage({
        ticketId: selectedTicket.id,
        content: replyMessage.trim(),
        translatedContent: translatedContent || null,
        originalLanguage: 'bn',
        supportAdminName: supportName,
        markPending: true,
      });

      // Send email notification (fire-and-forget, don't block UI)
      supabase.functions.invoke("send-support-reply-email", {
        body: { ticketId: selectedTicket.id, replyContent: translatedContent || replyMessage.trim() },
      }).then(({ data }) => {
        if (data?.success) {
          console.log("📧 Email notification sent to", data.sentTo);
        } else if (data?.skipped) {
          console.log("📧 Skipped: user has no valid email");
        }
      }).catch(e => console.warn("Email notification failed:", e));

      toast({ title: "✅ Reply Sent", description: "Your reply has been sent to the user" });
      setReplyMessage("");
      loadMessages(selectedTicket.id);
      loadTickets();
    } catch (error: any) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } finally {
      setSending(false);
      endSingleFlight(actionKey);
    }
  };

  const handleChangeGender = async (newGender: 'female' | 'male') => {
    if (!selectedTicket || changingGender) return;
    setChangingGender(true);
    try {
      const { data, error } = await supabase.rpc('admin_update_user_gender', {
        _user_id: selectedTicket.user_id,
        _gender: newGender,
      });

      if (error) throw error;

      if ((data as any)?.pending) {
        toast({
          title: '⏳ Submitted for Owner Approval',
          description: `Gender change request sent to owner. It will apply once approved.`,
        });
      } else {
        setUserGender(newGender);
        toast({
          title: '✅ Gender Updated',
          description: `User gender changed to ${newGender === 'female' ? 'Female (Host)' : 'Male (User)'}`,
        });
      }
    } catch (err: any) {
      toast({ title: 'Error', description: err.message || 'Failed to update gender', variant: 'destructive' });
    } finally {
      setChangingGender(false);
    }
  };

  const handleSendCompensation = async () => {
    if (!selectedTicket || sendingCompensation) return;

    const actionKey = `send-compensation-${selectedTicket.id}`;
    if (!startSingleFlight(actionKey)) return;

    const beansAmount = parseInt(compensationBeans) || 0;
    const diamondsAmount = parseInt(compensationDiamonds) || 0;
    const agencyBeansAmount = parseInt(compensationAgencyBeans) || 0;
    if (beansAmount <= 0 && diamondsAmount <= 0 && agencyBeansAmount <= 0) {
      endSingleFlight(actionKey);
      return;
    }

    setSendingCompensation(true);
    try {
      let anyPending = false;
      if (beansAmount > 0) {
        const { data, error } = await supabase.rpc('add_beans_to_user', { _user_id: selectedTicket.user_id, _amount: beansAmount });
        if (error) throw new Error(`Beans transfer failed: ${error.message}`);
        if ((data as any)?.pending) anyPending = true;
      }
      if (diamondsAmount > 0) {
        const { data, error } = await supabase.rpc('add_diamonds_to_user', { _user_id: selectedTicket.user_id, _amount: diamondsAmount });
        if (error) throw new Error(`Diamonds transfer failed: ${error.message}`);
        if ((data as any)?.pending) anyPending = true;
      }
      // Agency beans adjustment via gated RPC
      if (agencyBeansAmount > 0 && userAgency) {
        const adjustedAmount = agencyBeansMode === "deduct" ? -agencyBeansAmount : agencyBeansAmount;
        const { data, error } = await supabase.rpc('admin_adjust_agency_beans', {
          _agency_id: userAgency.id,
          _delta: adjustedAmount,
          _reason: `Support compensation (ticket ${selectedTicket.ticket_number})`,
        });
        if (error) throw new Error(`Agency beans adjustment failed: ${error.message}`);
        if ((data as any)?.pending) anyPending = true;
      }

      if (anyPending) {
        toast({
          title: '⏳ Submitted for Owner Approval',
          description: 'Compensation request sent to owner. Funds will be credited once approved.',
        });
        setCompensationBeans("");
        setCompensationDiamonds("");
        setCompensationAgencyBeans("");
        setShowCompensation(false);
        return;
      }

      const rewardParts = [];
      if (beansAmount > 0) rewardParts.push(`${beansAmount.toLocaleString()} Beans`);
      if (diamondsAmount > 0) rewardParts.push(`${diamondsAmount.toLocaleString()} Diamonds`);
      if (agencyBeansAmount > 0 && userAgency) {
        rewardParts.push(`${agencyBeansMode === "deduct" ? "-" : "+"}${agencyBeansAmount.toLocaleString()} Agency Beans (${userAgency.name})`);
      }

      const supportName = await getCurrentSupportName();
      await sendAdminSupportMessage({
        ticketId: selectedTicket.id,
        content: `🎁 Compensation: ${rewardParts.join(' + ')} has been adjusted.`,
        supportAdminName: supportName,
      });

      // Send notification to user about compensation
      await adminSendNotification(selectedTicket.user_id, '🎁 Compensation Received!', `You received ${rewardParts.join(' + ')} from Support`, 'coins_added')

      toast({ title: "✅ Reward Sent", description: `${rewardParts.join(' + ')}` });
      setCompensationBeans("");
      setCompensationDiamonds("");
      setCompensationAgencyBeans("");
      setShowCompensation(false);
      loadMessages(selectedTicket.id);
      // Refresh agency balance
      if (userAgency) {
        const { data } = await supabase.from('agencies').select('id, name, beans_balance').eq('id', userAgency.id).maybeSingle();
        if (data) setUserAgency({ id: data.id, name: data.name, beans_balance: data.beans_balance || 0 });
      }
    } catch (error: any) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } finally {
      setSendingCompensation(false);
      endSingleFlight(actionKey);
    }
  };

  // Image upload handler for admin replies
  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !selectedTicket) return;
    if (!file.type.startsWith('image/')) {
      toast({ title: "Error", description: "Please select an image file", variant: "destructive" });
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      toast({ title: "Error", description: "Image must be under 5MB", variant: "destructive" });
      return;
    }

    setUploadingImage(true);
    try {
      const ext = file.name.split('.').pop() || 'jpg';
      const path = `admin/${Date.now()}.${ext}`;
      const { error: uploadError } = await supabase.storage.from(SUPPORT_ATTACHMENT_BUCKET).upload(path, file);
      if (uploadError) throw uploadError;
      const supportName = await getCurrentSupportName();

      await sendAdminSupportMessage({
        ticketId: selectedTicket.id,
        content: replyMessage.trim() || '📷 Image',
        attachmentUrl: path,
        attachmentType: 'image',
        supportAdminName: supportName,
      });
      toast({ title: "✅ Image Sent" });
      setReplyMessage("");
      loadMessages(selectedTicket.id);
    } catch (err: any) {
      toast({ title: "Upload Failed", description: err.message, variant: "destructive" });
    } finally {
      setUploadingImage(false);
      if (imageInputRef.current) imageInputRef.current.value = '';
    }
  };

  // Voice-to-text using Web Speech API (Bengali)
  const toggleVoiceRecording = () => {
    if (isRecording) {
      recognitionRef.current?.stop();
      setIsRecording(false);
      return;
    }

    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      toast({ title: "Not Supported", description: "Speech recognition is not supported in this browser. Use Chrome.", variant: "destructive" });
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.lang = 'bn-BD';
    recognition.continuous = true;
    recognition.interimResults = true;

    let finalTranscript = replyMessage;

    recognition.onresult = (event: any) => {
      for (let i = event.resultIndex; i < event.results.length; i++) {
        if (event.results[i].isFinal) {
          finalTranscript += event.results[i][0].transcript + ' ';
          setReplyMessage(finalTranscript);
        }
      }
    };

    recognition.onerror = (event: any) => {
      const err = String(event?.error || '');
      console.warn('Speech recognition error:', err);
      // Browser mic/permission errors are not RPC failures — show a friendly toast instead of admin error log
      if (err === 'not-allowed' || err === 'service-not-allowed') {
        toast({ title: "Microphone blocked", description: "Allow microphone access in your browser to use voice input.", variant: "destructive" });
      } else if (err && err !== 'aborted' && err !== 'no-speech') {
        toast({ title: "Voice input error", description: err, variant: "destructive" });
      }
      setIsRecording(false);
    };

    recognition.onend = () => {
      setIsRecording(false);
    };

    recognitionRef.current = recognition;
    recognition.start();
    setIsRecording(true);
  };

  const updateTicketStatus = async (status: string) => {
    if (!selectedTicket || statusUpdating) return;

    const actionKey = `update-status-${selectedTicket.id}`;
    if (!startSingleFlight(actionKey)) return;

    if (status === selectedTicket.status) {
      endSingleFlight(actionKey);
      return;
    }

    const nowIso = new Date().toISOString();
    const ticketId = selectedTicket.id;
    const previousTicket = selectedTicket;

    // Optimistic UI update (instant one-click feedback)
    setStatusUpdating(true);
    setSelectedTicket((prev) =>
      prev
        ? {
            ...prev,
            status,
            updated_at: nowIso,
            resolved_at: status === 'resolved' ? nowIso : prev.resolved_at,
            closed_at: status === 'closed' ? nowIso : prev.closed_at,
          }
        : prev,
    );
    setTickets((prev) =>
      prev.map((t) =>
        t.id === ticketId
          ? {
              ...t,
              status,
              updated_at: nowIso,
              resolved_at: status === 'resolved' ? nowIso : t.resolved_at,
              closed_at: status === 'closed' ? nowIso : t.closed_at,
            }
          : t,
      ),
    );

    const shouldCloseTicketDialog = statusFilter !== 'all' && statusFilter !== 'live_chat' && status !== statusFilter;
    if (shouldCloseTicketDialog) {
      setSelectedTicket(null);
      setShowCompensation(false);
    }

    try {
      const updates: any = {
        status,
        updated_at: nowIso,
      };

      if (status === 'resolved') {
        updates.resolved_at = nowIso;
      }

      if (status === 'closed') {
        updates.closed_at = nowIso;
      }

      const { error } = await supabase
        .from('support_tickets')
        .update(updates)
        .eq('id', ticketId);

      if (error) throw error;

      toast({ title: "✅ Status Updated", description: `Ticket marked as ${status}` });
      window.dispatchEvent(new CustomEvent('admin-badge-refresh'));
      fetchGlobalStats();
      // Refresh the ticket list so the ticket disappears from the current filter view
      loadTickets();
    } catch (error: any) {
      // Rollback if server update fails
      setSelectedTicket(previousTicket);
      setTickets((prev) => prev.map((t) => (t.id === previousTicket.id ? previousTicket : t)));
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } finally {
      setStatusUpdating(false);
      endSingleFlight(actionKey);
    }
  };

  const handleResolveWithReward = async () => {
    if (!selectedTicket || resolving) return;

    const actionKey = `resolve-ticket-${selectedTicket.id}`;
    if (!startSingleFlight(actionKey)) return;

    // Optimistic UI: immediately update ticket status & close modal
    const savedTicket = selectedTicket;
    setSelectedTicket((prev) => prev ? { ...prev, status: 'resolved', resolved_at: new Date().toISOString() } : prev);
    setTickets((prev) => prev.map((t) => t.id === savedTicket.id ? { ...t, status: 'resolved', resolved_at: new Date().toISOString() } : t));
    setShowResolveModal(false);

    setResolving(true);

    try {
      const beansAmount = parseInt(resolveBeans) || 0;
      const diamondsAmount = parseInt(resolveDiamonds) || 0;
      const agencyBeansAmount = parseInt(resolveAgencyBeans) || 0;

      let anyPending = false;
      // Send rewards if any
      if (beansAmount > 0) {
        const { data, error } = await supabase.rpc('add_beans_to_user', { _user_id: selectedTicket.user_id, _amount: beansAmount });
        if (error) throw new Error(`Beans transfer failed: ${error.message}`);
        if ((data as any)?.pending) anyPending = true;
      }
      if (diamondsAmount > 0) {
        const { data, error } = await supabase.rpc('add_diamonds_to_user', { _user_id: selectedTicket.user_id, _amount: diamondsAmount });
        if (error) throw new Error(`Diamonds transfer failed: ${error.message}`);
        if ((data as any)?.pending) anyPending = true;
      }
      // Agency beans adjustment via gated RPC
      if (agencyBeansAmount > 0 && userAgency) {
        const adjustedAmount = resolveAgencyBeansMode === "deduct" ? -agencyBeansAmount : agencyBeansAmount;
        const { data, error } = await supabase.rpc('admin_adjust_agency_beans', {
          _agency_id: userAgency.id,
          _delta: adjustedAmount,
          _reason: `Resolve ticket ${selectedTicket.ticket_number}`,
        });
        if (error) throw new Error(`Agency beans adjustment failed: ${error.message}`);
        if ((data as any)?.pending) anyPending = true;
      }

      if (anyPending) {
        toast({
          title: '⏳ Reward Pending Approval',
          description: 'Ticket resolved, but reward credits are queued for owner approval.',
        });
      }

      // Resolve the ticket
      const { error: ticketError } = await supabase
        .from('support_tickets')
        .update({ 
          status: 'resolved',
          resolved_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        })
        .eq('id', selectedTicket.id);

      if (ticketError) throw ticketError;

      // Send resolution message with reward info
      const rewardParts = [];
      if (beansAmount > 0) rewardParts.push(`${beansAmount.toLocaleString()} Beans`);
      if (diamondsAmount > 0) rewardParts.push(`${diamondsAmount.toLocaleString()} Diamonds`);
      if (agencyBeansAmount > 0 && userAgency) {
        rewardParts.push(`${resolveAgencyBeansMode === "deduct" ? "-" : "+"}${agencyBeansAmount.toLocaleString()} Agency Beans (${userAgency.name})`);
      }

      const resolveContent = rewardParts.length > 0
        ? `✅ Ticket resolved.\n🎁 Reward: ${rewardParts.join(' + ')} has been adjusted.`
        : `✅ Ticket has been resolved. Thank you for contacting support.`;

      const supportName = await getCurrentSupportName();
      await sendAdminSupportMessage({
        ticketId: selectedTicket.id,
        content: resolveContent,
        supportAdminName: supportName,
      });

      // Send notification to user about ticket resolution + reward
      if (rewardParts.length > 0) {
        await adminSendNotification(selectedTicket.user_id, '🎁 Support Reward!', `Your ticket was resolved. Reward: ${rewardParts.join(' + ')}`, 'coins_added')
      }

      toast({ 
        title: "✅ Ticket Resolved", 
        description: rewardParts.length > 0 ? `Reward: ${rewardParts.join(' + ')}` : "Ticket resolved successfully"
      });

      setResolveBeans("");
      setResolveDiamonds("");
      setResolveAgencyBeans("");
      loadTickets();
      if (savedTicket.id) loadMessages(savedTicket.id);
      window.dispatchEvent(new CustomEvent('admin-badge-refresh'));
    } catch (error: any) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } finally {
      setResolving(false);
      endSingleFlight(actionKey);
    }
  };

  useEffect(() => {
    loadTickets();
    fetchGlobalStats();

    const scheduleTicketRefresh = (withStats = false) => {
      if (ticketRefreshTimerRef.current) {
        window.clearTimeout(ticketRefreshTimerRef.current);
      }

      ticketRefreshTimerRef.current = window.setTimeout(() => {
        loadTickets();
        if (withStats) fetchGlobalStats();
      }, ADMIN_RT_REFRESH_DEBOUNCE_MS);
    };

    // Realtime via BROADCAST channel (RLS-free) — postgres_changes does not work
    // for the admin client because it auths with anon JWT (no x-admin-token in WS handshake).
    const channel = supabase
      .channel(`support_realtime`, { config: { broadcast: { self: false } } })
      .on('broadcast', { event: 'support_event' }, ({ payload }) => {
        const op = payload?.op as string | undefined;
        const table = payload?.table as string | undefined;
        const record = payload?.record as any;
        const oldRecord = payload?.old_record as any;

        if (table === 'support_tickets') {
          if (op === 'INSERT') {
            scheduleTicketRefresh(true);
          } else if (op === 'UPDATE') {
            const oldStatus = oldRecord?.status;
            const newStatus = record?.status;
            if (oldStatus && newStatus && oldStatus !== newStatus) {
              scheduleTicketRefresh(true);
            }
          }
        } else if (table === 'support_messages' && op === 'INSERT') {
          const changedTicketId = record?.ticket_id as string | undefined;
          const senderType = record?.sender_type as string | undefined;
          if (changedTicketId && selectedTicketRef.current?.id === changedTicketId && senderType === 'user') {
            loadMessages(changedTicketId);
          }
          scheduleTicketRefresh(false);
        }
      })
      .subscribe();

    return () => {
      if (ticketRefreshTimerRef.current) {
        window.clearTimeout(ticketRefreshTimerRef.current);
      }
      supabase.removeChannel(channel);
    };
  }, [fetchGlobalStats, loadTickets]);

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'open':
        return <Badge className="bg-blue-500/20 text-blue-400">Open</Badge>;
      case 'pending':
        return <Badge className="bg-yellow-500/20 text-yellow-400">Pending</Badge>;
      case 'resolved':
        return <Badge className="bg-green-500/20 text-green-400">Resolved</Badge>;
      case 'closed':
        return <Badge className="bg-gray-500/20 text-gray-400">Closed</Badge>;
      default:
        return <Badge>{status}</Badge>;
    }
  };

  const getPriorityBadge = (priority: string) => {
    switch (priority) {
      case 'urgent':
        return <Badge className="bg-red-500/20 text-red-400">Urgent</Badge>;
      case 'high':
        return <Badge className="bg-orange-500/20 text-orange-400">High</Badge>;
      case 'normal':
        return <Badge className="bg-blue-500/20 text-blue-400">Normal</Badge>;
      case 'low':
        return <Badge className="bg-gray-500/20 text-gray-400">Low</Badge>;
      default:
        return <Badge>{priority}</Badge>;
    }
  };

  const filteredTickets = tickets.filter(ticket => {
    // Status filter (instant remove from current list after one-click status update)
    if (statusFilter === 'live_chat' && ticket.category !== 'live_chat') return false;
    if (statusFilter !== 'all' && statusFilter !== 'live_chat' && ticket.status !== statusFilter) return false;

    // Sector filter
    if (sectorFilter !== "all") {
      const sector = ticket.sender_sector || "user";
      if (sector !== sectorFilter) return false;
    }
    if (!searchQuery) return true;
    const query = searchQuery.toLowerCase();
    return (
      ticket.ticket_number?.toLowerCase().includes(query) ||
      ticket.subject?.toLowerCase().includes(query) ||
      ticket.user_email?.toLowerCase().includes(query) ||
      ticket.profile?.display_name?.toLowerCase().includes(query) ||
      ticket.profile?.app_uid?.toLowerCase().includes(query)
    );
  });

  const sectorCounts = {
    all: tickets.length,
    user: tickets.filter(t => (t.sender_sector || "user") === "user").length,
    host: tickets.filter(t => t.sender_sector === "host").length,
    agency: tickets.filter(t => t.sender_sector === "agency").length,
    helper: tickets.filter(t => t.sender_sector === "helper").length,
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-gradient-to-r from-purple-500 via-pink-500 to-rose-500 rounded-2xl p-6 shadow-lg">
        <div className="flex items-center gap-4">
          <div className="w-14 h-14 rounded-xl bg-white/20 flex items-center justify-center">
            <Headphones className="w-8 h-8 text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-white">Support Tickets</h1>
            <p className="text-white/80">Manage user support requests and conversations</p>
          </div>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card className="bg-card/50 border-border/30 backdrop-blur-sm">
          <CardContent className="p-3 flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-blue-500/10 border border-blue-500/15 flex items-center justify-center shrink-0">
              <MessageCircle className="w-4 h-4 text-blue-400" />
            </div>
            <div>
              <div className="text-lg font-bold text-foreground leading-none">{stats.total}</div>
              <p className="text-[10px] text-muted-foreground mt-0.5">Total</p>
            </div>
          </CardContent>
        </Card>
        <Card className="bg-card/50 border-border/30 backdrop-blur-sm">
          <CardContent className="p-3 flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-orange-500/10 border border-orange-500/15 flex items-center justify-center shrink-0">
              <AlertCircle className="w-4 h-4 text-orange-400" />
            </div>
            <div>
              <div className="text-lg font-bold text-orange-400 leading-none">{stats.open}</div>
              <p className="text-[10px] text-muted-foreground mt-0.5">Open</p>
            </div>
          </CardContent>
        </Card>
        <Card className="bg-card/50 border-border/30 backdrop-blur-sm">
          <CardContent className="p-3 flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-yellow-500/10 border border-yellow-500/15 flex items-center justify-center shrink-0">
              <Clock className="w-4 h-4 text-yellow-400" />
            </div>
            <div>
              <div className="text-lg font-bold text-yellow-400 leading-none">{stats.pending}</div>
              <p className="text-[10px] text-muted-foreground mt-0.5">Pending</p>
            </div>
          </CardContent>
        </Card>
        <Card className="bg-card/50 border-border/30 backdrop-blur-sm">
          <CardContent className="p-3 flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-green-500/10 border border-green-500/15 flex items-center justify-center shrink-0">
              <CheckCircle className="w-4 h-4 text-green-400" />
            </div>
            <div>
              <div className="text-lg font-bold text-green-400 leading-none">{stats.resolved}</div>
              <p className="text-[10px] text-muted-foreground mt-0.5">Resolved</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Sector Tabs */}
      <Tabs value={sectorFilter} onValueChange={setSectorFilter} className="w-full">
        <TabsList className="w-full grid grid-cols-5 bg-slate-800/50">
          <TabsTrigger value="all" className="data-[state=active]:bg-purple-600 data-[state=active]:text-white text-xs md:text-sm">
            📋 All ({sectorCounts.all})
          </TabsTrigger>
          <TabsTrigger value="user" className="data-[state=active]:bg-blue-600 data-[state=active]:text-white text-xs md:text-sm">
            <User className="w-3.5 h-3.5 mr-1" /> User ({sectorCounts.user})
          </TabsTrigger>
          <TabsTrigger value="host" className="data-[state=active]:bg-pink-600 data-[state=active]:text-white text-xs md:text-sm">
            🎙️ Host ({sectorCounts.host})
          </TabsTrigger>
          <TabsTrigger value="agency" className="data-[state=active]:bg-amber-600 data-[state=active]:text-white text-xs md:text-sm">
            <Building2 className="w-3.5 h-3.5 mr-1" /> Agency ({sectorCounts.agency})
          </TabsTrigger>
          <TabsTrigger value="helper" className="data-[state=active]:bg-green-600 data-[state=active]:text-white text-xs md:text-sm">
            🤝 Helper ({sectorCounts.helper})
          </TabsTrigger>
        </TabsList>
      </Tabs>

      {/* Filters */}
      <div className="flex flex-col md:flex-row gap-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Search by ticket #, user, email..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10"
          />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-full md:w-48">
            <SelectValue placeholder="Filter by status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Status</SelectItem>
            <SelectItem value="live_chat">🔴 Live Chat</SelectItem>
            <SelectItem value="open">Open</SelectItem>
            <SelectItem value="pending">Pending</SelectItem>
            <SelectItem value="resolved">Resolved</SelectItem>
            <SelectItem value="closed">Closed</SelectItem>
          </SelectContent>
        </Select>
        <Button variant="outline" onClick={loadTickets}>
          <RefreshCw className="w-4 h-4 mr-2" />
          Refresh
        </Button>
      </div>

      {/* Tickets List */}
      <Card className="bg-card/50 border-border/30 backdrop-blur-sm shadow-lg">
        <CardHeader className="pb-3 pt-4">
          <CardTitle className="text-base font-semibold tracking-tight flex items-center gap-2">
            <MessageCircle className="w-4 h-4 text-purple-400" />
            Support Tickets
            <Badge variant="outline" className="text-[10px] border-border/40 ml-1">{filteredTickets.length}</Badge>
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-0">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-6 h-6 animate-spin text-purple-400" />
            </div>
          ) : filteredTickets.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <MessageCircle className="w-10 h-10 mx-auto mb-3 opacity-15" />
              <p className="text-sm">No support tickets found</p>
            </div>
          ) : (
            <div className="space-y-1.5">
              {filteredTickets.map((ticket) => (
                <div
                  key={ticket.id}
                  onClick={() => {
                    setSelectedTicket(ticket);
                    loadMessages(ticket.id);
                  }}
                  className="flex items-center gap-3 px-3.5 py-3 rounded-xl cursor-pointer transition-all duration-150 hover:bg-muted/30 border border-transparent hover:border-border/20 group"
                >
                  <Avatar className="w-10 h-10 border border-purple-500/15 shrink-0">
                    <AvatarImage src={ticket.profile?.avatar_url} />
                    <AvatarFallback className="bg-purple-500/10 text-purple-400 text-xs font-medium">
                      {ticket.profile?.display_name?.charAt(0) || 'U'}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5 mb-0.5 flex-wrap">
                      <span className="text-[10px] font-mono text-muted-foreground/60">#{ticket.ticket_number}</span>
                      {ticket.category === 'live_chat' && (
                        <Badge className="bg-red-500/15 text-red-400 border-red-500/20 text-[9px] h-4 px-1.5 animate-pulse">🔴 LIVE</Badge>
                      )}
                      {getStatusBadge(ticket.status)}
                      {getPriorityBadge(ticket.priority)}
                      {(() => {
                        const sector = ticket.sender_sector || "user";
                        const sectorMap: Record<string, { label: string; cls: string }> = {
                          user: { label: "User", cls: "bg-blue-500/10 text-blue-400 border-blue-500/15" },
                          host: { label: "Host", cls: "bg-pink-500/10 text-pink-400 border-pink-500/15" },
                          agency: { label: "Agency", cls: "bg-amber-500/10 text-amber-400 border-amber-500/15" },
                          helper: { label: "Helper", cls: "bg-green-500/10 text-green-400 border-green-500/15" },
                        };
                        const s = sectorMap[sector] || sectorMap.user;
                        return <Badge className={`${s.cls} text-[9px] h-4 px-1.5`}>{s.label}</Badge>;
                      })()}
                    </div>
                    <p className="font-medium text-[13px] text-foreground/90 truncate leading-tight">{ticket.subject}</p>
                    <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground/60 mt-0.5">
                      <span className="truncate">{ticket.profile?.display_name || 'User'}</span>
                      {ticket.profile?.app_uid && (
                        <span className="font-mono bg-primary/5 text-primary/70 px-1 py-px rounded text-[9px]">
                          {ticket.profile.app_uid}
                        </span>
                      )}
                      {ticket.user_email && (
                        <span className="truncate max-w-[120px] hidden md:inline">• {ticket.user_email}</span>
                      )}
                    </div>
                  </div>
                  <div className="text-right text-[10px] text-muted-foreground/50 shrink-0">
                    <p>{format(new Date(ticket.created_at), 'dd MMM')}</p>
                    <p>{format(new Date(ticket.created_at), 'HH:mm')}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Ticket Detail Dialog */}
      <Dialog open={!!selectedTicket} onOpenChange={handleTicketDialogOpenChange}>
        <DialogContent className="max-w-4xl max-h-[95vh] md:max-h-[92vh] p-0 overflow-hidden w-[96vw] md:w-full border-border/40 bg-background/95 backdrop-blur-xl shadow-2xl">
          {selectedTicket && (
            <div className="flex flex-col h-[82vh] md:h-[87vh]">
              {/* Compact Header Bar */}
              <div className="px-4 py-2.5 bg-gradient-to-r from-muted/30 via-muted/15 to-muted/30 border-b border-border/25 flex items-center gap-3">
                <Avatar className="w-8 h-8 shrink-0 border border-purple-500/15">
                  <AvatarImage src={selectedTicket.profile?.avatar_url} />
                  <AvatarFallback className="text-xs bg-purple-500/10 text-purple-400">{selectedTicket.profile?.display_name?.charAt(0)}</AvatarFallback>
                </Avatar>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-semibold text-sm truncate">{selectedTicket.profile?.display_name || 'User'}</span>
                    {selectedTicket.profile?.app_uid && (
                      <span className="font-mono bg-primary/10 text-primary px-1.5 py-0.5 rounded text-[10px]">
                        ID: {selectedTicket.profile.app_uid}
                      </span>
                    )}
                    <span className="text-[10px] text-muted-foreground">#{selectedTicket.ticket_number}</span>
                    {getStatusBadge(selectedTicket.status)}
                    {selectedTicket.category === 'live_chat' && (
                      <span className="flex items-center gap-1">
                        <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
                        <span className="text-[10px] text-green-500 font-medium">Live</span>
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-2 text-[10px] text-muted-foreground flex-wrap">
                    <span className="truncate max-w-[200px]">{selectedTicket.user_email}</span>
                    <span>•</span>
                    <span>{selectedTicket.category}</span>
                    <span>•</span>
                    <span>{format(new Date(selectedTicket.created_at), 'dd MMM yyyy HH:mm')}</span>
                    {userContact?.whatsapp && (
                      <a href={`https://wa.me/${userContact.whatsapp.replace(/[^0-9]/g, '')}`} target="_blank" rel="noopener noreferrer" className="flex items-center gap-0.5 text-green-500 hover:underline">
                        <MessageCircle className="w-2.5 h-2.5" /> WA
                      </a>
                    )}
                  </div>
                </div>
                {/* Compact action buttons */}
                <div className="flex items-center gap-1.5 shrink-0">
                  <Button size="sm" variant="outline" className="h-7 text-[10px] px-2 border-red-500/30 text-red-400 hover:bg-red-500/10" onClick={() => setReportOpen(true)}>
                    <ShieldAlert className="w-3 h-3 mr-0.5" /> Report
                  </Button>
                  <Button size="sm" variant="outline" className="h-7 text-[10px] px-2 border-amber-500/30 text-amber-400 hover:bg-amber-500/10" onClick={() => setShowCompensation(prev => !prev)}>
                    <Gift className="w-3 h-3 mr-0.5" /> Reward
                  </Button>
                  <Button size="sm" variant="outline" className="h-7 text-[10px] px-2 border-green-500/30 text-green-400 hover:bg-green-500/10" onClick={() => setShowPurchaseRecovery(prev => !prev)}>
                    <CreditCard className="w-3 h-3 mr-0.5" /> Purchase
                  </Button>
                  <Badge className={`text-[10px] cursor-default ${userGender === 'female' ? 'bg-pink-500/20 text-pink-400' : 'bg-blue-500/20 text-blue-400'}`}>
                    {userGender === 'female' ? '♀' : userGender === 'male' ? '♂' : '?'}
                  </Badge>
                  {userGender !== 'female' && (
                    <Button size="sm" variant="outline" className="h-7 text-[10px] px-2 border-pink-500/30 text-pink-400 hover:bg-pink-500/10" onClick={() => handleChangeGender('female')} disabled={changingGender}>
                      ♀→Host
                    </Button>
                  )}
                  {userGender !== 'male' && (
                    <Button size="sm" variant="outline" className="h-7 text-[10px] px-2 border-blue-500/30 text-blue-400 hover:bg-blue-500/10" onClick={() => handleChangeGender('male')} disabled={changingGender}>
                      ♂→User
                    </Button>
                  )}
                  <Select value={selectedTicket.status} onValueChange={updateTicketStatus} disabled={statusUpdating}>
                    <SelectTrigger className="w-24 h-7 text-[10px]">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="open">Open</SelectItem>
                      <SelectItem value="pending">Pending</SelectItem>
                      <SelectItem value="resolved">Resolved</SelectItem>
                      <SelectItem value="closed">Closed</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {/* Compensation Panel */}
              {showCompensation && (
                <div className="px-6 py-4 bg-gradient-to-r from-amber-500/10 to-green-500/10 border-b border-amber-500/20">
                  <div className="flex items-center gap-2 mb-3">
                    <Gift className="w-4 h-4 text-amber-400" />
                    <p className="text-sm font-semibold text-foreground">Send Compensation</p>
                  </div>
                  <div className="grid grid-cols-2 gap-3 mb-3">
                    <div>
                      <label className="text-xs text-muted-foreground mb-1 block">Beans Amount</label>
                      <Input
                        type="number"
                        placeholder="0"
                        value={compensationBeans}
                        onChange={(e) => setCompensationBeans(e.target.value)}
                        className="h-9 text-sm"
                        min="0"
                      />
                    </div>
                    <div>
                      <label className="text-xs text-muted-foreground mb-1 block">Diamonds Amount</label>
                      <Input
                        type="number"
                        placeholder="0"
                        value={compensationDiamonds}
                        onChange={(e) => setCompensationDiamonds(e.target.value)}
                        className="h-9 text-sm"
                        min="0"
                      />
                    </div>
                  </div>

                  {/* Agency Beans Section */}
                  {userAgency && (
                    <div className="mb-3 p-3 rounded-lg bg-blue-500/10 border border-blue-500/20">
                      <div className="flex items-center gap-2 mb-2">
                        <Building2 className="w-4 h-4 text-blue-400" />
                        <p className="text-xs font-semibold text-foreground">
                          Agency: {userAgency.name}
                        </p>
                        <Badge className="bg-amber-500/20 text-amber-400 text-[10px] ml-auto">
                          Balance: {userAgency.beans_balance.toLocaleString()} Beans
                        </Badge>
                      </div>
                      <div className="flex gap-2 items-end">
                        <div className="flex-1">
                          <label className="text-xs text-muted-foreground mb-1 block">Agency Beans</label>
                          <Input
                            type="number"
                            placeholder="0"
                            value={compensationAgencyBeans}
                            onChange={(e) => setCompensationAgencyBeans(e.target.value)}
                            className="h-9 text-sm"
                            min="0"
                          />
                        </div>
                        <div className="flex gap-1">
                          <Button
                            size="sm"
                            variant={agencyBeansMode === "add" ? "default" : "outline"}
                            className={agencyBeansMode === "add" ? "h-9 bg-green-600 hover:bg-green-700 text-white" : "h-9"}
                            onClick={() => setAgencyBeansMode("add")}
                          >
                            <Plus className="w-3.5 h-3.5" />
                          </Button>
                          <Button
                            size="sm"
                            variant={agencyBeansMode === "deduct" ? "default" : "outline"}
                            className={agencyBeansMode === "deduct" ? "h-9 bg-red-600 hover:bg-red-700 text-white" : "h-9"}
                            onClick={() => setAgencyBeansMode("deduct")}
                          >
                            <Minus className="w-3.5 h-3.5" />
                          </Button>
                        </div>
                      </div>
                    </div>
                  )}

                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      className="bg-green-600 hover:bg-green-700 text-white flex-1"
                      onClick={handleSendCompensation}
                      disabled={sendingCompensation || (!compensationBeans && !compensationDiamonds && !compensationAgencyBeans)}
                    >
                      {sendingCompensation ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> : <Send className="w-3.5 h-3.5 mr-1.5" />}
                      {sendingCompensation ? "Sending..." : "Send Reward"}
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => { setShowCompensation(false); setCompensationBeans(""); setCompensationDiamonds(""); setCompensationAgencyBeans(""); }}
                    >
                      <XCircle className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              )}

              {/* Purchase Recovery Panel */}
              {showPurchaseRecovery && selectedTicket && (
                <div className="px-6 py-4 bg-gradient-to-r from-green-500/10 to-emerald-500/10 border-b border-green-500/20">
                  <div className="flex items-center gap-2 mb-3">
                    <CreditCard className="w-4 h-4 text-green-400" />
                    <p className="text-sm font-semibold text-foreground">Purchase Recovery</p>
                    <span className="text-[10px] text-muted-foreground ml-auto">Credit diamonds for failed Google Play purchase</span>
                  </div>
                  <div className="grid grid-cols-3 gap-3 mb-3">
                    <div>
                      <label className="text-xs text-muted-foreground mb-1 block">Diamond Package</label>
                      <Select value={recoveryCoins} onValueChange={setRecoveryCoins}>
                        <SelectTrigger className="h-9 text-sm">
                          <SelectValue placeholder="Select package" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="7000">💎 7,000 ($1.99)</SelectItem>
                          <SelectItem value="13200">💎 13,200 ($3.99)</SelectItem>
                          <SelectItem value="56000">💎 56,000 ($14.99)</SelectItem>
                          <SelectItem value="169000">💎 169,000 ($23.99)</SelectItem>
                          <SelectItem value="470000">💎 470,000 ($59.99)</SelectItem>
                          <SelectItem value="650000">💎 650,000 ($129.99)</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <label className="text-xs text-muted-foreground mb-1 block">Google Order ID (optional)</label>
                      <Input
                        placeholder="e.g. GPA.3333-..."
                        value={recoveryOrderId}
                        onChange={(e) => setRecoveryOrderId(e.target.value)}
                        className="h-9 text-sm"
                      />
                    </div>
                    <div>
                      <label className="text-xs text-muted-foreground mb-1 block">Reason</label>
                      <Input
                        value={recoveryReason}
                        onChange={(e) => setRecoveryReason(e.target.value)}
                        className="h-9 text-sm"
                      />
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      className="bg-green-600 hover:bg-green-700 text-white flex-1"
                      onClick={async () => {
                        if (!recoveryCoins || !selectedTicket?.user_id) return;
                        setSendingRecovery(true);
                        try {
                          const { data, error } = await supabase.functions.invoke('admin-verify-purchase', {
                            body: {
                              userId: selectedTicket.user_id,
                              coinAmount: parseInt(recoveryCoins),
                              reason: recoveryReason,
                              googleOrderId: recoveryOrderId || undefined,
                            }
                          });
                          if (error) throw error;
                          if (data?.success) {
                            toast({
                              title: "✅ Purchase Recovered!",
                              description: `${parseInt(recoveryCoins).toLocaleString()} diamonds credited to ${data.userName}. New balance: ${data.newBalance?.toLocaleString()}`,
                            });
                            setShowPurchaseRecovery(false);
                            setRecoveryCoins("");
                            setRecoveryOrderId("");
                          } else {
                            toast({
                              title: "Failed",
                              description: data?.error || "Could not credit diamonds",
                              variant: "destructive",
                            });
                          }
                        } catch (err: any) {
                          toast({
                            title: "Error",
                            description: err.message || "Recovery failed",
                            variant: "destructive",
                          });
                        } finally {
                          setSendingRecovery(false);
                        }
                      }}
                      disabled={sendingRecovery || !recoveryCoins}
                    >
                      {sendingRecovery ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> : <CreditCard className="w-3.5 h-3.5 mr-1.5" />}
                      {sendingRecovery ? "Crediting..." : "Credit Diamonds"}
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => { setShowPurchaseRecovery(false); setRecoveryCoins(""); setRecoveryOrderId(""); }}
                    >
                      <XCircle className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              )}

              <ScrollArea className="flex-1 px-6 py-4">
                {loadingMessages ? (
                  <div className="flex-1 flex items-center justify-center py-12">
                    <div className="flex flex-col items-center gap-2">
                      <Loader2 className="w-5 h-5 animate-spin text-purple-400" />
                      <span className="text-[11px] text-muted-foreground">Loading messages...</span>
                    </div>
                  </div>
                ) : messages.length === 0 ? (
                  <div className="text-center py-12 text-muted-foreground">
                    <MessageCircle className="w-8 h-8 mx-auto mb-2 opacity-15" />
                    <p className="text-xs">No messages yet</p>
                  </div>
                ) : (
                  <div className="space-y-1.5 max-w-3xl mx-auto">
                    {messages.map((msg, idx) => {
                      const isAdmin = msg.sender_type === 'admin';
                      const showDate = idx === 0 || 
                        format(new Date(msg.created_at), 'dd MMM yyyy') !== format(new Date(messages[idx-1].created_at), 'dd MMM yyyy');
                      const showTime = idx === 0 || 
                        new Date(msg.created_at).getTime() - new Date(messages[idx-1].created_at).getTime() > 300000;
                      return (
                        <div key={msg.id}>
                          {showDate && (
                            <div className="flex justify-center my-2.5">
                              <span className="bg-muted/40 text-muted-foreground/70 text-[9px] px-3 py-0.5 rounded-full border border-border/15">
                                {format(new Date(msg.created_at), 'dd MMM yyyy')}
                              </span>
                            </div>
                          )}
                          {showTime && !showDate && (
                            <p className="text-center text-[9px] text-muted-foreground/40 my-1">
                              {format(new Date(msg.created_at), 'HH:mm')}
                            </p>
                          )}
                          <div className={`flex ${isAdmin ? 'justify-end' : 'justify-start'} gap-1.5`}>
                            {!isAdmin && (
                              <div className="w-6 h-6 rounded-full bg-muted/40 border border-border/20 flex items-center justify-center shrink-0 mt-auto mb-0.5">
                                <User className="w-3 h-3 text-muted-foreground/60" />
                              </div>
                            )}
                            <div className={cn(
                              "max-w-[72%] px-3.5 py-2 text-[13px] leading-[1.5] break-words shadow-sm",
                              isAdmin
                                ? "bg-gradient-to-br from-purple-600/90 to-violet-700/90 text-white rounded-2xl rounded-br-sm border border-purple-500/15"
                                : "bg-muted/40 text-foreground rounded-2xl rounded-bl-sm border border-border/20"
                            )}>
                              {/* Image attachment */}
                              {(msg as any).attachment_url && (msg as any).attachment_type === 'image' && (() => {
                                const resolvedUrl = signedAttachmentUrls[msg.id] || (msg as any).attachment_url;
                                return (
                                  <img
                                    src={resolvedUrl}
                                    alt="Attachment"
                                    className="max-w-full rounded-xl max-h-56 object-cover cursor-pointer mb-1.5 hover:opacity-90 transition-opacity shadow-sm"
                                    onClick={() => window.open(resolvedUrl, '_blank')}
                                  />
                                );
                              })()}
                              {/* Voice attachment */}
                              {(msg as any).attachment_url && (msg as any).attachment_type === 'voice' && (
                                <div className="mb-1.5">
                                  <audio controls src={signedAttachmentUrls[msg.id] || (msg as any).attachment_url} className="w-full max-w-[220px] h-7" />
                                  {(msg as any).voice_transcript && (
                                    <p className="text-[9px] mt-0.5 opacity-60 italic">📝 "{(msg as any).voice_transcript}"</p>
                                  )}
                                </div>
                              )}
                              {isAdmin ? (
                                <>
                                  {/* Admin message: show translated (user's language) first, then original Bengali */}
                                  {(msg as any).translated_content && (msg as any).translated_content !== msg.content ? (
                                    <div className="space-y-1.5">
                                      <div>
                                        <div className="flex items-center gap-1 mb-0.5">
                                          <Globe className="w-2.5 h-2.5 text-white/50" />
                                          <span className="text-[8px] text-white/45 font-medium uppercase tracking-wider">User sees</span>
                                        </div>
                                        <span>{(msg as any).translated_content}</span>
                                      </div>
                                      <div className="border-t border-white/10 pt-1.5">
                                        <div className="flex items-center gap-1 mb-0.5">
                                          <span className="text-[8px] text-white/35 font-medium">🇧🇩 Bengali (Original)</span>
                                        </div>
                                        <span className="text-[11px] text-white/55">{msg.content}</span>
                                      </div>
                                    </div>
                                  ) : (
                                    <span>{msg.content}</span>
                                  )}
                                </>
                              ) : (
                                <>
                                  <span>{(msg as any).translated_content || msg.content}</span>
                                  {(msg as any).translated_content && (msg as any).translated_content !== msg.content && (
                                    <details className="mt-0.5">
                                      <summary className="text-[8px] opacity-40 cursor-pointer inline-flex items-center gap-0.5 ml-1">
                                        <Globe className="w-2 h-2" /> Original
                                      </summary>
                                      <p className="text-[10px] opacity-50 mt-0.5">{msg.content}</p>
                                    </details>
                                  )}
                                </>
                              )}
                              <span className={cn(
                                "text-[8px] ml-2 float-right mt-1",
                                isAdmin ? "text-white/35" : "text-muted-foreground/35"
                              )}>
                                {format(new Date(msg.created_at), 'HH:mm')}
                                {isAdmin && msg.is_read && ' ✓✓'}
                              </span>
                            </div>
                            {isAdmin && (
                              <div className="w-6 h-6 rounded-full bg-gradient-to-br from-purple-500 to-violet-600 flex items-center justify-center shrink-0 ml-0.5 mt-auto mb-0.5 shadow-sm shadow-purple-500/20">
                                <Shield className="w-3 h-3 text-white" />
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })}
                    <div ref={messagesEndRef} />
                  </div>
                )}
              </ScrollArea>


              {/* Quick Links */}
              <div className="px-2 md:px-4 pt-2 border-t">
                <AdminQuickLinks 
                  onInsertLink={(url) => setReplyMessage(prev => prev ? `${prev}\n${url}` : url)} 
                  compact 
                />
              </div>

              {/* Reply Input - Enhanced for PC */}
              <div className="px-4 py-3 border-t border-border/25 bg-muted/5 backdrop-blur-sm">
                <div className="flex items-center gap-2 mb-2">
                  <Languages className="w-3.5 h-3.5 text-muted-foreground" />
                  <span className="text-[10px] text-muted-foreground">Reply in:</span>
                  <Select value={replyLanguage} onValueChange={setReplyLanguage}>
                    <SelectTrigger className="w-36 h-6 text-[10px]">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {REPLY_LANGUAGES.map(lang => (
                        <SelectItem key={lang.code} value={lang.code}>
                          {lang.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {isTranslating && <Loader2 className="w-3 h-3 animate-spin text-primary" />}
                </div>
                <div className="flex gap-2 items-end">
                  {/* Hidden file input for image upload */}
                  <input
                    ref={imageInputRef}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={handleImageUpload}
                  />
                  {/* Photo upload button */}
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    className="h-12 w-10 rounded-xl shrink-0 border-border/50"
                    onClick={() => imageInputRef.current?.click()}
                    disabled={uploadingImage}
                    title="Send Photo"
                  >
                    {uploadingImage ? <Loader2 className="w-4 h-4 animate-spin" /> : <Paperclip className="w-4 h-4" />}
                  </Button>
                  {/* Voice-to-text button */}
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    className={cn(
                      "h-12 w-10 rounded-xl shrink-0 border-border/50 transition-colors",
                      isRecording && "bg-red-500/20 border-red-500/50 text-red-500 animate-pulse"
                    )}
                    onClick={toggleVoiceRecording}
                    title={isRecording ? "Stop Recording" : "Voice to Text (Bengali)"}
                  >
                    {isRecording ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
                  </Button>
                  <div className="flex-1 relative">
                    <Textarea
                      value={replyMessage}
                      onChange={(e) => setReplyMessage(e.target.value)}
                      placeholder="Type your reply... (Shift+Enter for new line)"
                      className="min-h-[44px] max-h-[120px] resize-none text-sm rounded-xl border-border/30 bg-muted/15 focus:border-purple-500/40 focus:bg-background/80 transition-colors pr-3"
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && !e.shiftKey) {
                          e.preventDefault();
                          handleSendReply();
                        }
                      }}
                    />
                  </div>
                  <Button
                    onClick={handleSendReply}
                    disabled={sending || !replyMessage.trim() || isTranslating}
                    className="bg-gradient-to-r from-purple-500 to-violet-600 hover:from-purple-600 hover:to-violet-700 h-12 w-12 rounded-xl shrink-0 shadow-lg shadow-purple-500/20"
                    size="icon"
                  >
                    {sending || isTranslating ? (
                      <Loader2 className="w-5 h-5 animate-spin" />
                    ) : (
                      <Send className="w-5 h-5" />
                    )}
                  </Button>
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
      {/* Resolve with Reward Modal */}
      <Dialog open={showResolveModal} onOpenChange={setShowResolveModal}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <CheckCircle className="w-5 h-5 text-green-500" />
              Resolve Ticket #{selectedTicket?.ticket_number}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <p className="text-sm text-muted-foreground">
              Optionally add a reward before resolving. Leave empty to resolve without reward.
            </p>
            
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="text-sm font-medium flex items-center gap-1.5">
                  <span className="w-5 h-5 rounded-full bg-amber-500/20 flex items-center justify-center text-[10px]">B</span>
                  Beans
                </label>
                <Input
                  type="number"
                  placeholder="0"
                  value={resolveBeans}
                  onChange={(e) => setResolveBeans(e.target.value)}
                  min="0"
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium flex items-center gap-1.5">
                  <Diamond className="w-4 h-4 text-cyan-400" />
                  Diamonds
                </label>
                <Input
                  type="number"
                  placeholder="0"
                  value={resolveDiamonds}
                  onChange={(e) => setResolveDiamonds(e.target.value)}
                  min="0"
                />
              </div>
            </div>

            {/* Agency Beans in Resolve Modal */}
            {userAgency && (
              <div className="p-3 rounded-lg bg-blue-500/10 border border-blue-500/20">
                <div className="flex items-center gap-2 mb-2">
                  <Building2 className="w-4 h-4 text-blue-400" />
                  <p className="text-xs font-semibold text-foreground">Agency: {userAgency.name}</p>
                  <Badge className="bg-amber-500/20 text-amber-400 text-[10px] ml-auto">
                    {userAgency.beans_balance.toLocaleString()} Beans
                  </Badge>
                </div>
                <div className="flex gap-2 items-end">
                  <div className="flex-1">
                    <Input
                      type="number"
                      placeholder="Agency Beans"
                      value={resolveAgencyBeans}
                      onChange={(e) => setResolveAgencyBeans(e.target.value)}
                      min="0"
                    />
                  </div>
                  <div className="flex gap-1">
                    <Button
                      size="sm"
                      variant={resolveAgencyBeansMode === "add" ? "default" : "outline"}
                      className={resolveAgencyBeansMode === "add" ? "h-9 bg-green-600 hover:bg-green-700 text-white" : "h-9"}
                      onClick={() => setResolveAgencyBeansMode("add")}
                    >
                      <Plus className="w-3.5 h-3.5" />
                    </Button>
                    <Button
                      size="sm"
                      variant={resolveAgencyBeansMode === "deduct" ? "default" : "outline"}
                      className={resolveAgencyBeansMode === "deduct" ? "h-9 bg-red-600 hover:bg-red-700 text-white" : "h-9"}
                      onClick={() => setResolveAgencyBeansMode("deduct")}
                    >
                      <Minus className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                </div>
              </div>
            )}

            <div className="flex gap-2 pt-2">
              <Button
                className="flex-1 bg-green-600 hover:bg-green-700 text-white"
                onClick={handleResolveWithReward}
                disabled={resolving}
              >
                {resolving ? (
                  <Loader2 className="w-4 h-4 animate-spin mr-2" />
                ) : (
                  <CheckCircle className="w-4 h-4 mr-2" />
                )}
                {(parseInt(resolveBeans) > 0 || parseInt(resolveDiamonds) > 0 || parseInt(resolveAgencyBeans) > 0) 
                  ? 'Resolve + Send Reward' 
                  : 'Resolve Without Reward'}
              </Button>
              <Button variant="ghost" onClick={() => { setShowResolveModal(false); setResolveBeans(""); setResolveDiamonds(""); setResolveAgencyBeans(""); }}>
                Cancel
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
      <SupportReportDialog
        open={reportOpen}
        onOpenChange={setReportOpen}
        ticketId={selectedTicket?.id ?? null}
        lastUserMessageId={[...messages].reverse().find(m => m.sender_type === 'user')?.id ?? null}
        ticketSubject={selectedTicket?.subject ?? null}
        userAppUid={selectedTicket?.profile?.app_uid ?? null}
        userDisplayName={selectedTicket?.profile?.display_name ?? null}
      />
    </div>
  );
};

export default AdminSupportTickets;
