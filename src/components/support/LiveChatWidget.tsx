import { useState, useEffect, useRef, useCallback } from "react";
import { useContentModeration } from "@/hooks/useContentModeration";
import { ArrowLeft, Send, Loader2, Shield, Headphones, Clock, XCircle, MessageSquarePlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { useAppSyncEvent } from "@/hooks/useAppSyncEvent";
import { isLiveChatOnline, getSupportHoursLocal } from "@/components/support/AISupportChat";
import { Capacitor } from "@capacitor/core";

interface LiveMessage {
  id: string;
  sender_type: "user" | "admin";
  content: string;
  is_read: boolean;
  created_at: string;
}

interface LiveChatWidgetProps {
  onClose: () => void;
}

const LiveChatWidget = ({ onClose }: LiveChatWidgetProps) => {
  const [messages, setMessages] = useState<LiveMessage[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [loading, setLoading] = useState(true);
  const [ticketId, setTicketId] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [ticketStatus, setTicketStatus] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const ticketIdRef = useRef<string | null>(null);
  
  // 🔥 AWS Comprehend content moderation
  const { checkToxicContent: checkToxic } = useContentModeration(userId);

  useEffect(() => {
    ticketIdRef.current = ticketId;
  }, [ticketId]);

  // Auto-scroll
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Initialize: find or create a live chat ticket
  useEffect(() => {
    const init = async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;
        setUserId(user.id);

        // Find existing open/pending/closed live chat ticket
        const { data: existing } = await supabase
          .from("support_tickets")
          .select("id, status")
          .eq("user_id", user.id)
          .eq("category", "live_chat")
          .in("status", ["open", "pending", "closed", "resolved"])
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();

        if (existing) {
          setTicketId(existing.id);
          setTicketStatus(existing.status);
          await loadMessages(existing.id);
        } else {
          // Create new live chat ticket
          const { data: ticket, error } = await supabase
            .from("support_tickets")
            .insert({
              user_id: user.id,
              subject: "Live Chat",
              category: "live_chat",
              user_email: user.email || null,
            })
            .select("id")
            .single();

          if (error) throw error;
          if (ticket) {
            setTicketId(ticket.id);
            // Send initial system message
            await supabase.from("support_messages").insert({
              ticket_id: ticket.id,
              sender_id: user.id,
              sender_type: "user",
              content: "Started a live chat session",
            });
            await loadMessages(ticket.id);
          }
        }
      } catch (error) {
        console.error("Live chat init error:", error);
      } finally {
        setLoading(false);
      }
    };
    init();
  }, []);

  const loadMessages = async (tId: string) => {
    const { data } = await supabase
      .from("support_messages")
      .select("id, sender_type, content, is_read, created_at")
      .eq("ticket_id", tId)
      .order("created_at", { ascending: true });
    setMessages((data as LiveMessage[]) || []);

    // Mark admin messages as read
    await supabase
      .from("support_messages")
      .update({ is_read: true })
      .eq("ticket_id", tId)
      .eq("sender_type", "admin")
      .eq("is_read", false);
  };

  // Realtime subscription
  useEffect(() => {
    if (!ticketId) return;

    const channel = supabase
      .channel(`live-chat-${ticketId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "support_messages", filter: `ticket_id=eq.${ticketId}` },
        () => {
          const currentId = ticketIdRef.current;
          if (currentId) loadMessages(currentId);
        }
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "support_tickets", filter: `id=eq.${ticketId}` },
        (payload) => {
          const updated = payload.new as any;
          if (updated.status) {
            setTicketStatus(updated.status);
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [ticketId]);

  const handleSend = async () => {
    if (!input.trim() || !ticketId || !userId || sending) return;
    const text = input.trim();
    setInput("");
    setSending(true);

    // Optimistic update
    const optimisticMsg: LiveMessage = {
      id: `temp-${Date.now()}`,
      sender_type: "user",
      content: text,
      is_read: false,
      created_at: new Date().toISOString(),
    };
    setMessages(prev => [...prev, optimisticMsg]);

    try {
      await supabase.from("support_messages").insert({
        ticket_id: ticketId,
        sender_id: userId,
        sender_type: "user",
        content: text,
      });

      // 🔥 AWS Comprehend toxic content moderation (background)
      checkToxic(text, { contextType: 'support' }).catch(() => {});

      // Update ticket status back to open so admin sees it
      await supabase
        .from("support_tickets")
        .update({ status: "open", updated_at: new Date().toISOString() })
        .eq("id", ticketId);
    } catch (error) {
      console.error("Send error:", error);
    } finally {
      setSending(false);
      inputRef.current?.focus();
    }
  };

  const formatTime = (dateStr: string) => {
    return new Date(dateStr).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  };

  // Render message content with clickable links
  const renderMessageContent = (content: string) => {
    const urlRegex = /(https?:\/\/[^\s]+)/g;
    const parts = content.split(urlRegex);
    
    if (parts.length === 1) return content;
    
    return parts.map((part, i) => {
      if (urlRegex.test(part)) {
        urlRegex.lastIndex = 0; // Reset regex
        return (
          <a
            key={i}
            href={part}
            onClick={async (e) => {
              e.preventDefault();
              const { openInApp } = await import("@/utils/inAppNavigation");
              await openInApp(part);
            }}
            className="text-blue-400 underline font-medium break-all"
          >
            {part.replace('https://', '')}
          </a>
        );
      }
      return part;
    });
  };

  const isTicketClosed = ticketStatus === "closed" || ticketStatus === "resolved";

  const handleStartNewChat = async () => {
    if (!userId) return;
    setTicketId(null);
    setTicketStatus(null);
    setMessages([]);
    setLoading(true);
    try {
      const { data: ticket, error } = await supabase
        .from("support_tickets")
        .insert({
          user_id: userId,
          subject: "Live Chat",
          category: "live_chat",
          user_email: (await supabase.auth.getUser()).data.user?.email || null,
        })
        .select("id")
        .single();
      if (error) throw error;
      if (ticket) {
        setTicketId(ticket.id);
        setTicketStatus("open");
        await supabase.from("support_messages").insert({
          ticket_id: ticket.id,
          sender_id: userId,
          sender_type: "user",
          content: "Started a new live chat session",
        });
        await loadMessages(ticket.id);
      }
    } catch (error) {
      console.error("New chat error:", error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col h-full bg-background">
      {/* Header */}
      <div className={cn(
        "flex items-center gap-3 p-4 border-b",
        isTicketClosed
          ? "bg-gradient-to-r from-red-500/10 to-orange-500/5"
          : isLiveChatOnline()
            ? "bg-gradient-to-r from-green-500/10 to-emerald-500/5"
            : "bg-gradient-to-r from-red-500/10 to-orange-500/5"
      )}>
        <button onClick={onClose} className="p-2 -ml-2 hover:bg-muted rounded-full">
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div className={cn(
          "w-10 h-10 rounded-full flex items-center justify-center",
          isTicketClosed
            ? "bg-gradient-to-br from-red-500 to-orange-600"
            : isLiveChatOnline()
              ? "bg-gradient-to-br from-green-500 to-emerald-600"
              : "bg-gradient-to-br from-red-500 to-orange-600"
        )}>
          {isTicketClosed ? <XCircle className="w-5 h-5 text-white" /> : <Headphones className="w-5 h-5 text-white" />}
        </div>
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <h2 className="font-semibold">{isTicketClosed ? "Disconnected" : "Live Chat Support"}</h2>
            <span className={cn(
              "w-2 h-2 rounded-full",
              isTicketClosed ? "bg-red-500" : isLiveChatOnline() ? "bg-green-500 animate-pulse" : "bg-red-500"
            )} />
          </div>
          {isTicketClosed ? (
            <p className="text-xs text-muted-foreground">This conversation has been closed by support</p>
          ) : isLiveChatOnline() ? (
            <p className="text-xs text-muted-foreground">Connected to support team</p>
          ) : (
            <p className="text-xs text-red-500/80 flex items-center gap-1">
              <Clock className="w-3 h-3" />
              Offline • {getSupportHoursLocal().startStr} – {getSupportHoursLocal().endStr}
            </p>
          )}
        </div>
      </div>

      {/* Messages */}
      <ScrollArea className="flex-1 p-4">
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="space-y-3">
            {/* Welcome message */}
            <div className="flex justify-center mb-4">
              <div className="bg-muted/50 rounded-full px-4 py-1.5 text-xs text-muted-foreground">
                You are now connected to our support team
              </div>
            </div>

            {messages.map((msg) => (
              <div
                key={msg.id}
                className={cn(
                  "flex gap-2.5",
                  msg.sender_type === "user" ? "flex-row-reverse" : "flex-row"
                )}
              >
                {msg.sender_type === "admin" && (
                  <div className="w-8 h-8 rounded-full bg-gradient-to-br from-green-500 to-emerald-600 flex items-center justify-center shrink-0">
                    <Shield className="w-4 h-4 text-white" />
                  </div>
                )}
                <div className="max-w-[80%]">
                  {msg.sender_type === "admin" && (
                    <p className="text-[10px] text-green-500 font-semibold mb-0.5 ml-1">Official Admin</p>
                  )}
                  <div
                    className={cn(
                      "rounded-2xl px-4 py-2.5",
                      msg.sender_type === "user"
                        ? "bg-primary text-primary-foreground"
                        : "bg-muted"
                    )}
                  >
                    <p className="text-sm whitespace-pre-wrap">{renderMessageContent(msg.content)}</p>
                    <p
                      className={cn(
                        "text-[10px] mt-1",
                        msg.sender_type === "user"
                          ? "text-primary-foreground/60"
                          : "text-muted-foreground"
                      )}
                    >
                      {formatTime(msg.created_at)}
                      {msg.sender_type === "user" && msg.is_read && " ✓"}
                    </p>
                  </div>
                </div>
              </div>
            ))}
            <div ref={messagesEndRef} />
          </div>
        )}
      </ScrollArea>

      {/* Disconnected Banner + New Chat */}
      {isTicketClosed && (
        <div className="p-4 border-t bg-background space-y-3">
          <div className="flex items-center justify-center gap-2 py-2 px-4 bg-red-500/10 border border-red-500/20 rounded-xl">
            <XCircle className="w-4 h-4 text-red-500" />
            <span className="text-sm font-medium text-red-500">Disconnected — This ticket has been closed</span>
          </div>
          <Button
            onClick={handleStartNewChat}
            className="w-full gap-2 bg-gradient-to-r from-primary to-primary/80"
          >
            <MessageSquarePlus className="w-4 h-4" />
            Start New Chat
          </Button>
        </div>
      )}

      {/* Input - only when not closed */}
      {!isTicketClosed && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            handleSend();
          }}
          className="p-4 border-t bg-background"
        >
          <div className="flex gap-2">
            <Input
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Type your message..."
              disabled={sending || loading}
              className="flex-1"
              maxLength={1000}
            />
            <Button
              type="submit"
              size="icon"
              disabled={!input.trim() || sending || loading}
              className="shrink-0"
            >
              {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
            </Button>
          </div>
        </form>
      )}
    </div>
  );
};

export default LiveChatWidget;
