import { useState, useEffect, useCallback, useRef } from "react";
import { useAdminRealtime } from "@/hooks/useAdminRealtime";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { adminSupabase as supabase } from "@/integrations/supabase/adminClient";
import { getAdminSessionToken } from "@/utils/adminSession";
import { toast } from "sonner";
import { SmartImage } from "@/components/ui/smart-image";
import {
  Mail, Search, Loader2, Send, RefreshCw, Inbox,
  MailOpen, Clock, Star, ChevronLeft, Reply, Eye, UserSearch,
  Image, Paperclip, X, Languages, Trash2
} from "lucide-react";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { cn } from "@/lib/utils";
import { format, formatDistanceToNow } from "date-fns";
import DOMPurify from "dompurify";
import UserSupportTool from "@/components/admin/UserSupportTool";
import AdminQuickLinks from "@/components/admin/AdminQuickLinks";
import PolicyLinkPicker from "@/components/policies/PolicyLinkPicker";
import { useStableChatScroll } from "@/hooks/useStableChatScroll";

interface GmailMessage {
  id: string;
  threadId: string;
  snippet: string;
  from: string;
  to: string;
  subject: string;
  date: string;
  body: string;
  isRead: boolean;
  labels: string[];
}

const AdminGmailSupport = () => {
  const [activeMainTab, setActiveMainTab] = useState("gmail");
  const [emails, setEmails] = useState<GmailMessage[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [filter, setFilter] = useState("in:inbox");
  const [selectedThread, setSelectedThread] = useState<GmailMessage[] | null>(null);
  const [selectedEmail, setSelectedEmail] = useState<GmailMessage | null>(null);
  const [loadingThread, setLoadingThread] = useState(false);
  const [replyBody, setReplyBody] = useState("");
  const [sending, setSending] = useState(false);
  const [showReply, setShowReply] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const [inboxStats, setInboxStats] = useState({ total: 0, unread: 0, read: 0, starred: 0 });
  const [refreshing, setRefreshing] = useState(false);
  const [attachedImage, setAttachedImage] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [translatedMessages, setTranslatedMessages] = useState<Record<string, string>>({});
  const [translatingId, setTranslatingId] = useState<string | null>(null);
  const [deletingThreadId, setDeletingThreadId] = useState<string | null>(null);
  const [confirmDeleteThread, setConfirmDeleteThread] = useState<{ threadId: string; subject: string } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const gmailThreadScroll = useStableChatScroll({
    dependency: selectedThread?.length || 0,
    resetKey: selectedEmail?.threadId,
    bottomThreshold: 96,
    initialPinFrames: 4,
  });

  const callGmailApi = async (action: string, params: any = {}) => {
    const adminToken = getAdminSessionToken();
    if (!adminToken) throw new Error('Admin session expired. Please re-login.');

    const response = await fetch(
      `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/gmail-support`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
          'apikey': import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
          'x-admin-token': adminToken,
        },
        body: JSON.stringify({ action, ...params }),
      }
    );

    if (!response.ok) {
      const err = await response.json().catch(() => ({ error: 'Unknown error' }));
      throw new Error(err.error || `API error: ${response.status}`);
    }

    return response.json();
  };

  const fetchEmails = useCallback(async (queryText = "", filterValue = filter) => {
    setLoading(true);
    try {
      const query = queryText ? `${filterValue} ${queryText}` : filterValue;
      const data = await callGmailApi('fetch_emails', { query, maxResults: 30 });
      setEmails(Array.isArray(data) ? data : []);
    } catch (error: any) {
      toast.error('Failed to fetch emails: ' + error.message);
    } finally {
      setLoading(false);
    }
  }, [filter]);

  const fetchInboxStats = useCallback(async () => {
    try {
      const data = await callGmailApi('inbox_stats');
      setInboxStats({
        total: data.total || 0,
        unread: data.unread || 0,
        read: data.read || 0,
        starred: data.starred || 0,
      });
      setUnreadCount(data.unread || 0);
    } catch {
      // Silently fail
    }
  }, []);

  const triggerAutoReplies = useCallback(async () => {
    try {
      const result = await callGmailApi('auto_reply');
      if (result.replied > 0) {
        console.log(`Auto-replied to ${result.replied} new emails`);
      }
    } catch {
      // Silently fail
    }
  }, []);

  const openThread = async (email: GmailMessage) => {
    setLoadingThread(true);
    setSelectedEmail(email);
    setShowReply(false);
    setReplyBody("");
    setAttachedImage(null);
    setImagePreview(null);
    try {
      const data = await callGmailApi('fetch_thread', { threadId: email.threadId });
      const threadMessages = Array.isArray(data) ? data : [];
      setSelectedThread(threadMessages);
      
      // Mark ALL unread messages in this thread as read
      const unreadMsgs = threadMessages.filter((m: GmailMessage) => !m.isRead);
      if (unreadMsgs.length > 0) {
        await Promise.all(
          unreadMsgs.map((m: GmailMessage) => callGmailApi('mark_read', { messageId: m.id }))
        );
        // Update local email list
        const threadId = email.threadId;
        setEmails(prev => prev.map(e => 
          e.threadId === threadId ? { ...e, isRead: true } : e
        ));
        // Immediately refresh unread count
        fetchInboxStats();
      }
    } catch (error: any) {
      toast.error('Failed to load thread: ' + error.message);
    } finally {
      setLoadingThread(false);
    }
  };

  const handleSendReply = async () => {
    if ((!replyBody.trim() && !attachedImage) || !selectedEmail || !selectedThread || sending) return;

    setSending(true);
    try {
      const lastMessage = selectedThread[selectedThread.length - 1];
      const replyTo = extractEmail(lastMessage.from);
      
      // Convert image to base64 if attached
      let imageBase64: string | undefined;
      let imageName: string | undefined;
      let imageMimeType: string | undefined;
      if (attachedImage) {
        const arrayBuffer = await attachedImage.arrayBuffer();
        const bytes = new Uint8Array(arrayBuffer);
        // Chunked base64 encode to avoid call-stack overflow on large images
        let binary = '';
        const CHUNK = 0x8000;
        for (let i = 0; i < bytes.length; i += CHUNK) {
          binary += String.fromCharCode.apply(null, Array.from(bytes.subarray(i, i + CHUNK)) as any);
        }
        imageBase64 = btoa(binary);
        imageName = attachedImage.name;
        imageMimeType = attachedImage.type;
      }
      
      await callGmailApi('send_reply', {
        threadId: selectedEmail.threadId,
        messageId: lastMessage.id,
        to: replyTo,
        subject: selectedEmail.subject?.trim() || '(No Subject)',
        imageBase64,
        imageName,
        imageMimeType,
      });

      toast.success('✅ Reply sent successfully!');
      setReplyBody("");
      setShowReply(false);
      setAttachedImage(null);
      setImagePreview(null);

      // Mark thread as read locally (backend also marks it on send)
      const threadId = selectedEmail.threadId;
      setEmails(prev => prev.map(e => e.threadId === threadId ? { ...e, isRead: true } : e));

      // Refresh stats so unread count drops immediately
      fetchInboxStats();

      // Small delay to allow Gmail to index the sent message
      await new Promise(r => setTimeout(r, 1500));
      const data = await callGmailApi('fetch_thread', { threadId });
      setSelectedThread(Array.isArray(data) ? data : []);
    } catch (error: any) {
      toast.error('Failed to send reply: ' + error.message);
    } finally {
      setSending(false);
    }
  };

  const handleDeleteThread = async (threadId: string) => {
    setDeletingThreadId(threadId);
    try {
      await callGmailApi('trash_thread', { threadId });
      // Optimistic remove from list + close dialog if open
      setEmails(prev => prev.filter(e => e.threadId !== threadId));
      if (selectedEmail?.threadId === threadId) {
        setSelectedEmail(null);
        setSelectedThread(null);
      }
      toast.success('🗑️ Conversation moved to Trash');
      fetchInboxStats();
    } catch (error: any) {
      toast.error('Failed to delete: ' + error.message);
    } finally {
      setDeletingThreadId(null);
      setConfirmDeleteThread(null);
    }
  };

  const handleImageSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      toast.error('Only image files are allowed');
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      toast.error('Image must be under 10MB');
      return;
    }
    setAttachedImage(file);
    const reader = new FileReader();
    reader.onload = () => setImagePreview(reader.result as string);
    reader.readAsDataURL(file);
  };

  const removeAttachment = () => {
    setAttachedImage(null);
    setImagePreview(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    await Promise.all([fetchEmails(searchQuery, filter), fetchInboxStats()]);
    setRefreshing(false);
    toast.success('Emails refreshed');
  };

  const extractEmail = (from: string): string => {
    const match = from.match(/<([^>]+)>/);
    return match ? match[1] : from;
  };

  const extractName = (from: string): string => {
    const match = from.match(/^([^<]+)</);
    return match ? match[1].trim().replace(/"/g, '') : from.split('@')[0];
  };

  const getInitials = (name: string): string => {
    return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
  };

  const parseDate = (dateStr: string): Date => {
    try {
      return new Date(dateStr);
    } catch {
      return new Date();
    }
  };

  const stripHtml = (html: string): string => {
    return html.replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();
  };

  const sanitizeEmailHtml = (html: string): string => {
    return DOMPurify.sanitize(html, {
      USE_PROFILES: { html: true },
      FORBID_TAGS: ['script', 'style', 'iframe', 'object', 'embed', 'form'],
    });
  };

  const formatSupportCount = (count: number): string | number => {
    const safeCount = Math.max(0, Number(count) || 0);
    return safeCount > 100 ? '100+' : safeCount;
  };

  const handleTranslateMessage = async (msgId: string, text: string, isOurMessage: boolean) => {
    if (translatingId) return;
    
    // If already translated, toggle off
    if (translatedMessages[msgId]) {
      setTranslatedMessages(prev => {
        const copy = { ...prev };
        delete copy[msgId];
        return copy;
      });
      return;
    }

    setTranslatingId(msgId);
    try {
      const adminToken = getAdminSessionToken();
      if (!adminToken) throw new Error('Admin session expired. Please re-login.');

      // Our message (Bengali) → English, User message (any language) → Bengali
      const targetLang = isOurMessage ? 'en' : 'bn';
      const plainText = text.replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();

      const res = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/translate`,
        {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
            'apikey': import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
            'x-admin-token': adminToken,
          },
            text: plainText.slice(0, 2000),
            targetLanguage: targetLang,
            sourceLanguage: 'auto',
          }),
        }
      );

      if (!res.ok) throw new Error('Translation failed');
      const result = await res.json();
      if (result.translatedText) {
        setTranslatedMessages(prev => ({ ...prev, [msgId]: result.translatedText }));
      }
    } catch (err: any) {
      toast.error('Translation failed: ' + err.message);
    } finally {
      setTranslatingId(null);
    }
  };

  useEffect(() => {
    fetchEmails("", filter);
  }, [fetchEmails, filter]);
  useAdminRealtime(['support_tickets'], () => fetchEmails(searchQuery, filter), 'admin-gmail-support-rt');

  useEffect(() => {
    fetchInboxStats();
    triggerAutoReplies();
    // Background poll for new emails every 45s — keeps unread badge fresh
    const poll = setInterval(() => {
      fetchInboxStats();
    }, 45000);
    return () => clearInterval(poll);
  }, [fetchInboxStats, triggerAutoReplies]);

  const filters = [
    { value: "in:inbox", label: "📥 Inbox" },
    { value: "in:inbox is:unread", label: "📬 Unread" },
    { value: "in:inbox is:starred", label: "⭐ Starred" },
    { value: "in:sent", label: "📤 Sent" },
    { value: "in:anywhere", label: "📋 All Mail" },
  ];

  return (
    <div className="admin-pro-shell admin-content space-y-4 p-4 md:p-6 min-h-0 -mx-4 -my-4 sm:-mx-6 sm:-my-6">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Mail className="h-6 w-6 text-primary" />
          <div>
            <h1 className="text-2xl font-bold text-foreground">Gmail Support</h1>
            <p className="text-sm text-muted-foreground">
              merilive.us@gmail.com • {unreadCount > 0 && <span className="text-destructive font-semibold">{formatSupportCount(unreadCount)} unread</span>}
            </p>
          </div>
        </div>
        <Button 
          variant="outline" 
          size="sm" 
          onClick={handleRefresh} 
          disabled={refreshing}
        >
          <RefreshCw className={`h-4 w-4 mr-1 ${refreshing ? 'animate-spin' : ''}`} />
          Refresh
        </Button>
      </div>

      {/* Main Tabs: Gmail + User Support */}
      <Tabs value={activeMainTab} onValueChange={setActiveMainTab}>
        <TabsList className="grid grid-cols-2 w-full max-w-md">
          <TabsTrigger value="gmail" className="flex items-center gap-2">
            <Mail className="h-4 w-4" />
            Gmail Support
            {unreadCount > 0 && (
              <Badge variant="destructive" className="ml-1 h-5 px-1.5 text-[10px]">
                {formatSupportCount(unreadCount)}
              </Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="support" className="flex items-center gap-2">
            <UserSearch className="h-4 w-4" />
            UID Support
          </TabsTrigger>
        </TabsList>

        {/* Gmail Tab */}
        <TabsContent value="gmail" className="space-y-4 mt-4">
          {/* Stats — exact counts from Gmail labels API */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <Card className="bg-card/50 border-border/30 backdrop-blur-sm">
              <CardContent className="p-3 flex items-center gap-3">
                <div className="w-9 h-9 rounded-lg bg-purple-500/10 border border-purple-500/15 flex items-center justify-center shrink-0">
                  <Inbox className="h-4 w-4 text-purple-400" />
                </div>
                <div>
                  <div className="text-lg font-bold text-foreground leading-none">{inboxStats.total}</div>
                  <p className="text-[10px] text-muted-foreground mt-0.5">Total Inbox</p>
                </div>
              </CardContent>
            </Card>
            <Card className="bg-card/50 border-border/30 backdrop-blur-sm">
              <CardContent className="p-3 flex items-center gap-3">
                <div className="w-9 h-9 rounded-lg bg-red-500/10 border border-red-500/15 flex items-center justify-center shrink-0">
                  <Mail className="h-4 w-4 text-red-400" />
                </div>
                <div>
                  <div className="text-lg font-bold text-red-400 leading-none">{inboxStats.unread}</div>
                  <p className="text-[10px] text-muted-foreground mt-0.5">Unread</p>
                </div>
              </CardContent>
            </Card>
            <Card className="bg-card/50 border-border/30 backdrop-blur-sm">
              <CardContent className="p-3 flex items-center gap-3">
                <div className="w-9 h-9 rounded-lg bg-green-500/10 border border-green-500/15 flex items-center justify-center shrink-0">
                  <MailOpen className="h-4 w-4 text-green-400" />
                </div>
                <div>
                  <div className="text-lg font-bold text-foreground leading-none">{inboxStats.read}</div>
                  <p className="text-[10px] text-muted-foreground mt-0.5">Read</p>
                </div>
              </CardContent>
            </Card>
            <Card className="bg-card/50 border-border/30 backdrop-blur-sm">
              <CardContent className="p-3 flex items-center gap-3">
                <div className="w-9 h-9 rounded-lg bg-yellow-500/10 border border-yellow-500/15 flex items-center justify-center shrink-0">
                  <Star className="h-4 w-4 text-yellow-500" />
                </div>
                <div>
                  <div className="text-lg font-bold text-foreground leading-none">{inboxStats.starred}</div>
                  <p className="text-[10px] text-muted-foreground mt-0.5">Starred</p>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Filters & Search */}
          <div className="flex flex-col sm:flex-row gap-2">
            <Select value={filter} onValueChange={(val) => { setFilter(val); }}>
              <SelectTrigger className="w-full sm:w-[180px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {filters.map(f => (
                  <SelectItem key={f.value} value={f.value}>{f.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search emails..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && fetchEmails(searchQuery, filter)}
                className="pl-9"
              />
            </div>
            <Button onClick={() => fetchEmails(searchQuery, filter)} size="sm">
              <Search className="h-4 w-4" />
            </Button>
          </div>

          {/* Email List */}
          <Card className="bg-card/50 border-border/30 backdrop-blur-sm shadow-lg">
            <CardContent className="p-0">
              {loading ? (
                <div className="flex items-center justify-center p-12">
                  <Loader2 className="h-6 w-6 animate-spin text-purple-400" />
                  <span className="ml-2 text-muted-foreground text-sm">Loading emails...</span>
                </div>
              ) : emails.length === 0 ? (
                <div className="text-center p-12 text-muted-foreground">
                  <Mail className="h-10 w-10 mx-auto mb-3 opacity-20" />
                  <p className="text-sm">No emails found</p>
                </div>
              ) : (
                <ScrollArea className="h-[60vh] sm:h-[520px]">
                  <div className="divide-y divide-border/20">
                    {emails.map((email) => (
                      <div
                        key={email.id}
                        className={cn(
                          "group relative px-4 py-3 transition-all duration-150 hover:bg-muted/30",
                          !email.isRead && 'bg-primary/[0.03] border-l-2 border-l-purple-500'
                        )}
                      >
                        <div
                          onClick={() => openThread(email)}
                          className="flex items-start gap-3 cursor-pointer pr-10"
                        >
                          <div className={cn(
                            "w-9 h-9 rounded-lg flex items-center justify-center text-[10px] font-bold shrink-0 border",
                            !email.isRead
                              ? 'bg-gradient-to-br from-purple-500/20 to-violet-600/20 border-purple-500/20 text-purple-400'
                              : 'bg-muted/40 border-border/20 text-muted-foreground'
                          )}>
                            {getInitials(extractName(email.from))}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center justify-between gap-2">
                              <span className={cn("text-sm truncate", !email.isRead ? 'font-semibold text-foreground' : 'text-muted-foreground')}>
                                {extractName(email.from)}
                              </span>
                              <span className="text-[10px] text-muted-foreground/60 whitespace-nowrap">
                                {formatDistanceToNow(parseDate(email.date), { addSuffix: true })}
                              </span>
                            </div>
                            <p className={cn("text-[13px] truncate mt-0.5", !email.isRead ? 'font-medium text-foreground/90' : 'text-foreground/70')}>
                              {email.subject || '(No Subject)'}
                            </p>
                            <p className="text-[11px] text-muted-foreground/50 truncate mt-0.5 leading-tight">
                              {email.snippet}
                            </p>
                          </div>
                          <div className="flex items-center gap-1.5 shrink-0 mt-0.5">
                            {!email.isRead && <div className="w-2 h-2 rounded-full bg-purple-500 shadow-sm shadow-purple-500/30" />}
                            {email.labels.includes('STARRED') && <Star className="h-3.5 w-3.5 text-yellow-500 fill-yellow-500" />}
                          </div>
                        </div>
                        {/* Delete button */}
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setConfirmDeleteThread({ threadId: email.threadId, subject: email.subject || '(No Subject)' });
                          }}
                          disabled={deletingThreadId === email.threadId}
                          title="Delete conversation"
                          className="absolute right-3 top-1/2 -translate-y-1/2 w-7 h-7 rounded-md flex items-center justify-center text-muted-foreground/60 hover:text-red-400 hover:bg-red-500/10 transition opacity-0 group-hover:opacity-100 disabled:opacity-50"
                        >
                          {deletingThreadId === email.threadId
                            ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            : <Trash2 className="h-3.5 w-3.5" />}
                        </button>
                      </div>
                    ))}
                  </div>
                </ScrollArea>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* User Support Tab */}
        <TabsContent value="support" className="mt-4">
          <UserSupportTool />
        </TabsContent>
      </Tabs>

      {/* Thread Dialog */}
      <Dialog open={!!selectedEmail} onOpenChange={(open) => {
        if (!open) {
          setSelectedEmail(null);
          setSelectedThread(null);
          setShowReply(false);
          setReplyBody("");
        }
      }}>
        <DialogContent className="w-screen sm:w-[96vw] max-w-4xl h-[100dvh] sm:h-[90vh] max-h-[100dvh] sm:max-h-[90vh] rounded-none sm:rounded-lg flex flex-col overflow-hidden min-h-0 p-0 border-border/40 bg-background/95 backdrop-blur-xl shadow-2xl">
          {/* Premium Header */}
          <div className="px-3 sm:px-6 py-3 sm:py-3.5 border-b border-border/30 bg-gradient-to-r from-muted/40 via-muted/20 to-muted/40 flex items-center gap-3">

            <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-purple-500/20 to-violet-600/20 border border-purple-500/20 flex items-center justify-center shrink-0">
              <Mail className="h-4.5 w-4.5 text-purple-400" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-semibold text-sm text-foreground truncate tracking-tight">{selectedEmail?.subject || '(No Subject)'}</p>
              <p className="text-[11px] text-muted-foreground truncate">{selectedEmail?.from}</p>
            </div>
            <Badge variant="outline" className="text-[10px] border-border/40 text-muted-foreground shrink-0">
              {selectedThread?.length || 0} messages
            </Badge>
            {selectedEmail && (
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 text-muted-foreground hover:text-red-400 hover:bg-red-500/10 shrink-0"
                title="Delete conversation"
                disabled={deletingThreadId === selectedEmail.threadId}
                onClick={() => setConfirmDeleteThread({ threadId: selectedEmail.threadId, subject: selectedEmail.subject || '(No Subject)' })}
              >
                {deletingThreadId === selectedEmail.threadId
                  ? <Loader2 className="h-4 w-4 animate-spin" />
                  : <Trash2 className="h-4 w-4" />}
              </Button>
            )}
          </div>

          {loadingThread ? (
            <div className="flex-1 flex items-center justify-center">
              <div className="flex flex-col items-center gap-3">
                <Loader2 className="h-6 w-6 animate-spin text-purple-400" />
                <span className="text-xs text-muted-foreground">Loading conversation...</span>
              </div>
            </div>
          ) : (
            <ScrollArea ref={gmailThreadScroll.scrollRef} className="flex-1 min-h-0 h-full chat-scroll-stable">
              <div className="space-y-2 px-3 sm:px-6 py-4 max-w-3xl mx-auto">
                {selectedThread?.map((msg, idx) => {
                  const isOur = msg.from.includes('merilive.us@gmail.com');
                  const showDateSep = idx === 0 || 
                    format(parseDate(msg.date), 'dd MMM yyyy') !== format(parseDate(selectedThread[idx-1].date), 'dd MMM yyyy');
                  return (
                    <div key={msg.id}>
                      {showDateSep && (
                        <div className="flex justify-center my-3">
                          <span className="bg-muted/50 text-muted-foreground text-[10px] px-3 py-0.5 rounded-full border border-border/20">
                            {format(parseDate(msg.date), 'dd MMM yyyy')}
                          </span>
                        </div>
                      )}
                      <div className={`flex ${isOur ? 'justify-end' : 'justify-start'} gap-2`}>
                        {!isOur && (
                          <div className="w-7 h-7 rounded-full bg-muted/60 border border-border/30 flex items-center justify-center text-[9px] font-semibold text-muted-foreground shrink-0 mt-auto mb-0.5">
                            {getInitials(extractName(msg.from))}
                          </div>
                        )}
                        <div className={cn(
                          "max-w-[85%] sm:max-w-[72%] rounded-2xl px-3.5 py-2 shadow-sm",
                          isOur 
                            ? 'bg-gradient-to-br from-purple-600/90 to-violet-700/90 text-white rounded-br-sm border border-purple-500/20' 
                            : 'bg-muted/50 border border-border/30 rounded-bl-sm'
                        )}>
                          {/* Sender + timestamp inline */}
                          <div className="flex items-center gap-2 mb-0.5">
                            <span className={cn("text-[10px] font-medium truncate", isOur ? "text-slate-600" : "text-muted-foreground")}>
                              {isOur ? 'MeriLive Support' : extractName(msg.from)}
                            </span>
                            <span className="flex-1" />
                            <Button
                              variant="ghost"
                              size="sm"
                              className={cn("h-4 w-4 p-0 opacity-50 hover:opacity-100", isOur ? "text-slate-900 hover:bg-white/10" : "hover:bg-muted")}
                              onClick={() => handleTranslateMessage(msg.id, msg.body || msg.snippet, isOur)}
                              disabled={translatingId === msg.id}
                              title={isOur ? 'Translate to English' : 'Translate to Bengali'}
                            >
                              {translatingId === msg.id ? <Loader2 className="h-2.5 w-2.5 animate-spin" /> : <Languages className="h-2.5 w-2.5" />}
                            </Button>
                          </div>
                          
                          {/* Translated text */}
                          {translatedMessages[msg.id] && (
                            <div className={cn("mb-1.5 px-2.5 py-1.5 rounded-lg text-xs", isOur ? "bg-white/10 text-slate-900/90" : "bg-accent/20 border border-accent/15")}>
                              <p className="text-[9px] font-semibold opacity-60 mb-0.5">{isOur ? '🇬🇧 English' : '🇧🇩 Bengali'}</p>
                              <p className="leading-relaxed">{translatedMessages[msg.id]}</p>
                            </div>
                          )}

                          {/* Message body */}
                          <div className={cn("text-[13px] whitespace-pre-wrap break-words overflow-hidden leading-[1.5]", isOur ? "text-slate-800" : "text-foreground/90")}>
                            {msg.body.includes('<') ? (
                              <div 
                                dangerouslySetInnerHTML={{ __html: sanitizeEmailHtml(msg.body) }} 
                                className="prose prose-sm max-w-none overflow-hidden [&_*]:max-w-full [&_img]:max-w-[280px] [&_img]:h-auto [&_img]:rounded-lg [&_p]:my-0.5 [&_br]:leading-none [&_table]:text-xs [&_blockquote]:hidden"
                              />
                            ) : (
                              stripHtml(msg.body) || msg.snippet
                            )}
                          </div>
                          {/* Floating timestamp */}
                          <span className={cn("text-[9px] float-right mt-1 ml-3", isOur ? "text-slate-500" : "text-muted-foreground/40")}>
                            {format(parseDate(msg.date), 'hh:mm a')}
                            {isOur && ' ✓✓'}
                          </span>
                        </div>
                        {isOur && (
                          <div className="w-7 h-7 rounded-full bg-gradient-to-br from-purple-500 to-violet-600 flex items-center justify-center shrink-0 mt-auto mb-0.5 shadow-sm shadow-purple-500/20">
                            <Send className="w-3 h-3 text-slate-900" />
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </ScrollArea>
          )}

          {/* Quick Links */}
          <div className="border-t border-border/20 pt-1.5 px-1">
            <AdminQuickLinks 
              onInsertLink={(url) => { setShowReply(true); setReplyBody(prev => prev ? `${prev}\n${url}` : url); }} 
              compact 
            />
          </div>

          {/* Reply Section - Premium Desktop */}
          <div className="border-t border-border/30 px-3 sm:px-5 py-3 bg-muted/10 safe-area-bottom">
            {!showReply ? (
              <Button 
                onClick={() => setShowReply(true)} 
                variant="outline" 
                className="w-full h-10 text-sm border-border/30 hover:bg-muted/30 rounded-xl"
              >
                <Reply className="h-4 w-4 mr-2" />
                Write a Reply
              </Button>
            ) : (
              <div className="space-y-2">
                {imagePreview && (
                  <div className="relative inline-block">
                    <SmartImage src={imagePreview} alt="attachment" className="h-16 rounded-lg border border-border/30 shadow-sm" fallbackSrc="/placeholder.svg" />
                    <button
                      onClick={removeAttachment}
                      className="absolute -top-1.5 -right-1.5 w-5 h-5 bg-destructive text-destructive-foreground rounded-full flex items-center justify-center shadow-sm"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                )}
                <div className="flex gap-2 items-end">
                  <div className="flex-1">
                    <Textarea
                      placeholder="Type your reply... (Shift+Enter for new line)"
                      value={replyBody}
                      onChange={(e) => setReplyBody(e.target.value)}
                      rows={2}
                      className="resize-none text-sm min-h-[44px] max-h-[100px] rounded-xl border-border/30 bg-muted/20 focus:border-purple-500/40 focus:bg-background/80 transition-colors"
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
                    disabled={(!replyBody.trim() && !attachedImage) || sending}
                    className="bg-gradient-to-r from-purple-500 to-violet-600 hover:from-purple-600 hover:to-violet-700 h-11 w-11 rounded-xl shrink-0 shadow-lg shadow-purple-500/25"
                    size="icon"
                  >
                    {sending ? <Loader2 className="h-4.5 w-4.5 animate-spin" /> : <Send className="h-4.5 w-4.5" />}
                  </Button>
                </div>
                <input ref={fileInputRef} type="file" accept="image/*" onChange={handleImageSelect} className="hidden" />
                <div className="flex items-center gap-1.5">
                  <Button variant="ghost" size="sm" className="h-7 text-[11px] text-muted-foreground hover:text-foreground" onClick={() => { setShowReply(false); setReplyBody(""); removeAttachment(); }}>
                    Cancel
                  </Button>
                  <Button variant="ghost" size="sm" className="h-7 text-[11px]" onClick={() => fileInputRef.current?.click()}>
                    <Paperclip className="h-3 w-3 mr-1" />
                    Attach
                  </Button>
                  <PolicyLinkPicker
                    size="sm"
                    label="Policy"
                    onInsert={(snippet) =>
                      setReplyBody((prev) => (prev ? `${prev}\n\n${snippet}` : snippet))
                    }
                  />
                </div>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Delete confirmation */}
      <AlertDialog open={!!confirmDeleteThread} onOpenChange={(open) => { if (!open) setConfirmDeleteThread(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this conversation?</AlertDialogTitle>
            <AlertDialogDescription>
              "{confirmDeleteThread?.subject}" will be moved to Gmail Trash and auto-purged after 30 days. This action removes the entire thread.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-600 hover:bg-red-700 text-white"
              onClick={() => confirmDeleteThread && handleDeleteThread(confirmDeleteThread.threadId)}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default AdminGmailSupport;
