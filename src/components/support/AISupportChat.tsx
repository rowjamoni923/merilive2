import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import { Send, Bot, User, ArrowLeft, Loader2, Sparkles, Headphones, Shield, Clock, Zap, Image, Mic, MicOff, Paperclip, Globe, XCircle, MessageSquarePlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { useAppSyncEvent } from "@/hooks/useAppSyncEvent";
import ReactMarkdown from "react-markdown";
import { Capacitor } from "@capacitor/core";
import { useToast } from "@/hooks/use-toast";

interface Message {
  id: string;
  role: "user" | "assistant" | "system" | "admin";
  content: string;
  timestamp: Date;
  attachmentUrl?: string;
  attachmentType?: string; // 'image' | 'voice'
  voiceTranscript?: string;
}

interface AISupportChatProps {
  onClose?: () => void;
  userLevel?: number;
  userName?: string;
  isPremium?: boolean;
  deepLinkMode?: string | null;
  deepLinkTicketId?: string | null;
  deepLinkMessageId?: string | null;
}

type ActivateLiveChatOptions = {
  forcedTicketId?: string;
  skipIntroMessage?: boolean;
};

const INITIAL_CATEGORIES = [
  { icon: "💰", label: "Diamond / Recharge Issue", key: "coin_recharge" },
  { icon: "📤", label: "Withdrawal Problem", key: "withdrawal" },
  { icon: "👤", label: "Account / Profile Issue", key: "account" },
  { icon: "🏢", label: "Agency Issue", key: "agency" },
  { icon: "📺", label: "Live Stream / Call Issue", key: "livestream" },
  { icon: "🎮", label: "Game Issue", key: "game" },
  { icon: "⚠️", label: "Report a User", key: "report" },
  { icon: "❓", label: "Other Problem", key: "other" },
];

const LIVE_CHAT_KEYWORDS = ["live chat", "live agent", "real agent", "talk to admin", "human support", "admin chat", "agent chat", "real person"];

// Bangladesh time: 9:00 AM - 5:00 PM (UTC+6)
const SUPPORT_START_UTC = 3; // 9 AM BDT = 3 AM UTC
const SUPPORT_END_UTC = 11; // 5 PM BDT = 11 AM UTC
const SUPPORT_ATTACHMENT_BUCKET = "support-attachments";

const extractSupportAttachmentPath = (value?: string | null) => {
  if (!value) return null;
  const marker = `/${SUPPORT_ATTACHMENT_BUCKET}/`;
  const markerIndex = value.indexOf(marker);
  if (markerIndex >= 0) return decodeURIComponent(value.slice(markerIndex + marker.length).split("?")[0]);
  if (!/^https?:\/\//i.test(value)) return value;
  return null;
};

const getSupportAttachmentDisplayUrl = async (value?: string | null) => {
  const path = extractSupportAttachmentPath(value);
  if (!path) return value || undefined;
  const { data } = await supabase.storage.from(SUPPORT_ATTACHMENT_BUCKET).createSignedUrl(path, 60 * 60);
  return data?.signedUrl || value || undefined;
};

/** Check if live chat is currently within business hours */
export const isLiveChatOnline = () => {
  const utcHour = new Date().getUTCHours();
  return utcHour >= SUPPORT_START_UTC && utcHour < SUPPORT_END_UTC;
};

/** Get support hours in user's local timezone */
export const getSupportHoursLocal = () => {
  const localStart = new Date();
  localStart.setUTCHours(SUPPORT_START_UTC, 0, 0, 0);
  const localEnd = new Date();
  localEnd.setUTCHours(SUPPORT_END_UTC, 0, 0, 0);
  const fmt = (d: Date) => d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hour12: true });
  return { startStr: fmt(localStart), endStr: fmt(localEnd) };
};

const LiveSupportHours = () => {
  const [now, setNow] = useState(new Date());
  const [userCity, setUserCity] = useState<string | null>(null);

  useEffect(() => {
    const interval = setInterval(() => setNow(new Date()), 60000);
    return () => clearInterval(interval);
  }, []);

  // Fetch user's city from profile
  useEffect(() => {
    const fetchCity = async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
          const { data: profile } = await supabase
            .from("profiles")
            .select("city, region")
            .eq("id", user.id)
            .single();
          if (profile?.city) {
            setUserCity(profile.city);
          } else if (profile?.region) {
            setUserCity(profile.region);
          }
        }
      } catch (e) {
        console.error("Failed to fetch user city:", e);
      }
    };
    fetchCity();
  }, []);

  const utcHour = now.getUTCHours();
  const isOnline = utcHour >= SUPPORT_START_UTC && utcHour < SUPPORT_END_UTC;

  const localStart = new Date();
  localStart.setUTCHours(SUPPORT_START_UTC, 0, 0, 0);
  const localEnd = new Date();
  localEnd.setUTCHours(SUPPORT_END_UTC, 0, 0, 0);

  const formatLocal = (d: Date) => d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hour12: true });
  // Show user's city/district from profile, fallback to timezone city
  const locationName = userCity || Intl.DateTimeFormat().resolvedOptions().timeZone?.split("/").pop()?.replace(/_/g, " ") || "Local";

  return (
    <div className="mt-4 mx-1">
      <div className={cn(
        "relative overflow-hidden rounded-2xl p-4 border backdrop-blur-xl",
        isOnline
          ? "bg-gradient-to-br from-green-500/10 via-emerald-500/5 to-transparent border-green-500/20"
          : "bg-gradient-to-br from-muted/60 via-muted/30 to-transparent border-border/50"
      )}>
        <div className="flex items-center gap-3">
          <div className={cn(
            "w-10 h-10 rounded-xl flex items-center justify-center shadow-lg",
            isOnline
              ? "bg-gradient-to-br from-green-500 to-emerald-600 shadow-green-500/30"
              : "bg-muted"
          )}>
            <Headphones className={cn("w-5 h-5", isOnline ? "text-white" : "text-muted-foreground")} />
          </div>
          <div className="flex-1">
            <div className="flex items-center gap-2">
              <p className="text-sm font-semibold">Live Support</p>
              <span className={cn(
                "px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider",
                isOnline
                  ? "bg-green-500/20 text-green-500"
                  : "bg-muted text-muted-foreground"
              )}>
                {isOnline ? "● Online" : "Offline"}
              </span>
            </div>
            <div className="flex items-center gap-1.5 mt-0.5">
              <Globe className="w-3 h-3 text-muted-foreground" />
              <p className="text-[11px] text-muted-foreground">
                {formatLocal(localStart)} – {formatLocal(localEnd)} <span className="opacity-60">({locationName})</span>
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

const AISupportChat = ({
  onClose,
  userLevel = 1,
  userName = "User",
  isPremium = false,
  deepLinkMode = null,
  deepLinkTicketId = null,
  deepLinkMessageId = null,
}: AISupportChatProps) => {
  const { toast } = useToast();
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const scrollAreaRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [phase, setPhase] = useState<"category" | "describe" | "ai_chat" | "live_chat">("category");
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);

  // Live chat state
  const [liveChatTicketId, setLiveChatTicketId] = useState<string | null>(null);
  const [waitingForAdmin, setWaitingForAdmin] = useState(false);
  const [waitStartTime, setWaitStartTime] = useState<Date | null>(null);
  const [waitElapsed, setWaitElapsed] = useState("00:00");
  const [userId, setUserId] = useState<string | null>(null);
  const [ticketStatus, setTicketStatus] = useState<string | null>(null); // open, pending, closed, resolved
  const ticketIdRef = useRef<string | null>(null);

  // Voice recording
  const [isRecording, setIsRecording] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const recordingIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // Uploading state
  const [isUploading, setIsUploading] = useState(false);
  const messagesRef = useRef<Message[]>([]);
  const deepLinkHandledRef = useRef(false);

  useEffect(() => {
    ticketIdRef.current = liveChatTicketId;
  }, [liveChatTicketId]);

  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (user) setUserId(user.id);
    });
  }, []);

  useEffect(() => {
    if (scrollAreaRef.current) {
      const scrollContainer = scrollAreaRef.current.querySelector('[data-radix-scroll-area-viewport]');
      if (scrollContainer) {
        scrollContainer.scrollTop = scrollContainer.scrollHeight;
      }
    }
  }, [messages]);

  useEffect(() => {
    if (!waitingForAdmin || !waitStartTime) return;
    const interval = setInterval(() => {
      const diff = Math.floor((Date.now() - waitStartTime.getTime()) / 1000);
      const mins = Math.floor(diff / 60).toString().padStart(2, "0");
      const secs = (diff % 60).toString().padStart(2, "0");
      setWaitElapsed(`${mins}:${secs}`);
    }, 1000);
    return () => clearInterval(interval);
  }, [waitingForAdmin, waitStartTime]);

  useEffect(() => {
    if (!liveChatTicketId) return;
    const channel = supabase
      .channel(`live-chat-inline-${liveChatTicketId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "support_messages", filter: `ticket_id=eq.${liveChatTicketId}` },
        (payload) => {
          const newMsg = payload.new as any;
          if (newMsg.sender_type === "admin") {
            setWaitingForAdmin(false);
            // User always sees English only — translated_content is the English version
            const displayContent = newMsg.translated_content || newMsg.content;
            getSupportAttachmentDisplayUrl(newMsg.attachment_url).then((attachmentUrl) => setMessages(prev => [...prev, {
              id: newMsg.id,
              role: "admin",
              content: displayContent,
              timestamp: new Date(newMsg.created_at),
              attachmentUrl,
              attachmentType: newMsg.attachment_type,
            }]));
            supabase.from("support_messages").update({ is_read: true }).eq("id", newMsg.id).then(() => {});
          }
        }
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "support_tickets", filter: `id=eq.${liveChatTicketId}` },
        (payload) => {
          const updated = payload.new as any;
          if (updated.status) {
            setTicketStatus(updated.status);
            if (updated.status === "closed" || updated.status === "resolved") {
              setWaitingForAdmin(false);
            }
          }
        }
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [liveChatTicketId]);

  // Upload file to support-attachments bucket
  const uploadFile = async (file: File, type: "image" | "voice"): Promise<{ path: string; previewUrl: string } | null> => {
    if (!userId) return null;
    const ext = type === "voice" ? "webm" : file.name.split('.').pop() || "jpg";
    const path = `${userId}/${Date.now()}.${ext}`;
    const { error } = await supabase.storage.from(SUPPORT_ATTACHMENT_BUCKET).upload(path, file);
    if (error) {
      console.error("Upload error:", error);
      return null;
    }
    const { data: signed } = await supabase.storage.from(SUPPORT_ATTACHMENT_BUCKET).createSignedUrl(path, 60 * 60);
    return { path, previewUrl: signed?.signedUrl || path };
  };

  // Handle image selection
  const handleImageSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !userId) return;
    if (!file.type.startsWith("image/")) {
      toast({ title: "Error", description: "Please select an image file", variant: "destructive" });
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      toast({ title: "Error", description: "Image must be under 10MB", variant: "destructive" });
      return;
    }

    setIsUploading(true);
    try {
      const uploaded = await uploadFile(file, "image");
      if (!uploaded) throw new Error("Upload failed");

      const userMessage: Message = {
        id: `user-${Date.now()}`,
        role: "user",
        content: "📷 Sent an image",
        timestamp: new Date(),
        attachmentUrl: uploaded.previewUrl,
        attachmentType: "image",
      };
      setMessages(prev => [...prev, userMessage]);

      // If in live chat, send to DB
      if (phase === "live_chat" && liveChatTicketId) {
        await supabase.from("support_messages").insert({
          ticket_id: liveChatTicketId,
          sender_id: userId,
          sender_type: "user",
          content: "📷 Sent an image",
          attachment_url: uploaded.path,
          attachment_type: "image",
        } as any);
      }
    } catch (error) {
      toast({ title: "Upload Failed", description: "Could not upload image", variant: "destructive" });
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  // Voice recording
  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream, { mimeType: "audio/webm" });
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) audioChunksRef.current.push(e.data);
      };

      mediaRecorder.onstop = async () => {
        stream.getTracks().forEach(t => t.stop());
        const audioBlob = new Blob(audioChunksRef.current, { type: "audio/webm" });
        await handleVoiceMessage(audioBlob);
      };

      mediaRecorder.start();
      setIsRecording(true);
      setRecordingTime(0);
      recordingIntervalRef.current = setInterval(() => {
        setRecordingTime(prev => prev + 1);
      }, 1000);
    } catch (error) {
      toast({ title: "Microphone Error", description: "Please allow microphone access", variant: "destructive" });
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
      if (recordingIntervalRef.current) {
        clearInterval(recordingIntervalRef.current);
        recordingIntervalRef.current = null;
      }
    }
  };

  const handleVoiceMessage = async (audioBlob: Blob) => {
    if (!userId) return;
    setIsUploading(true);

    try {
      // Upload voice file
      const voiceFile = new File([audioBlob], "voice.webm", { type: "audio/webm" });
      const uploaded = await uploadFile(voiceFile, "voice");
      if (!uploaded) throw new Error("Upload failed");

      // Transcribe using speech-to-text
      const reader = new FileReader();
      const base64Promise = new Promise<string>((resolve) => {
        reader.onloadend = () => {
          const base64 = (reader.result as string).split(",")[1];
          resolve(base64);
        };
        reader.readAsDataURL(audioBlob);
      });
      const base64Audio = await base64Promise;

      let transcript = "";
      try {
        const { data: sttData } = await supabase.functions.invoke("speech-to-text", {
          body: { audio: base64Audio, language: "auto" },
        });
        transcript = sttData?.text || "";
      } catch (e) {
        console.error("STT error:", e);
      }

      // Auto-translate voice transcript to Bengali for admin
      let translatedTranscript = "";
      if (transcript) {
        try {
          const { data: transData } = await supabase.functions.invoke("translate", {
            body: { text: transcript, targetLanguage: "Bengali" },
          });
          translatedTranscript = transData?.translatedText || "";
        } catch (e) {
          console.error("Translation error:", e);
        }
      }

      const userMessage: Message = {
        id: `user-${Date.now()}`,
        role: "user",
        content: transcript ? `🎤 Voice: "${transcript}"` : "🎤 Sent a voice message",
        timestamp: new Date(),
        attachmentUrl: uploaded.previewUrl,
        attachmentType: "voice",
        voiceTranscript: transcript,
      };
      setMessages(prev => [...prev, userMessage]);

      // Save to DB if in live chat
      if (phase === "live_chat" && liveChatTicketId) {
        await supabase.from("support_messages").insert({
          ticket_id: liveChatTicketId,
          sender_id: userId,
          sender_type: "user",
          content: transcript ? `🎤 Voice: "${transcript}"` : "🎤 Sent a voice message",
          attachment_url: uploaded.path,
          attachment_type: "voice",
          voice_transcript: transcript,
          translated_content: translatedTranscript || null,
          original_language: "auto",
        } as any);
      }
    } catch (error) {
      toast({ title: "Voice Upload Failed", description: "Could not process voice message", variant: "destructive" });
    } finally {
      setIsUploading(false);
    }
  };

  const handleCategorySelect = (category: typeof INITIAL_CATEGORIES[0]) => {
    setSelectedCategory(category.key);
    setPhase("describe");
    setMessages([{
      id: "category-selected",
      role: "assistant",
      content: `${category.icon} **${category.label}** selected.\n\nPlease describe your issue in detail. You can also:\n- 📷 Send **screenshots** as proof\n- 🎤 Send a **voice message**\n\nThe more details you provide, the faster we can help! ✍️`,
      timestamp: new Date(),
    }]);
  };

  const activateLiveChat = useCallback(async (contextMessages?: Message[], options?: ActivateLiveChatOptions) => {
    if (!userId) return;
    setPhase("live_chat");
    setWaitingForAdmin(true);
    setWaitStartTime(new Date());

    if (!options?.skipIntroMessage) {
      setMessages(prev => [...prev, {
        id: `system-livechat-${Date.now()}`,
        role: "system",
        content: "🔄 Connecting you to our support team...",
        timestamp: new Date(),
      }]);
    }

    try {
      let ticketId = options?.forcedTicketId || "";

      if (!ticketId) {
        const { data: existing } = await supabase
          .from("support_tickets")
          .select("id")
          .eq("user_id", userId)
          .eq("category", "live_chat")
          .in("status", ["open", "pending"])
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();

        if (existing) {
          ticketId = existing.id;
        } else {
          const allMsgs = contextMessages || messages;
          const userContextMessages = allMsgs
            .filter((m) => m.role === "user")
            .map((m) => m.content.trim())
            .filter(Boolean);

          const categoryLabel = INITIAL_CATEGORIES.find(c => c.key === selectedCategory)?.label || "General";

          const { data: ticket, error } = await supabase
            .from("support_tickets")
            .insert({
              user_id: userId,
              subject: `Live Chat - ${categoryLabel}`,
              category: "live_chat",
              user_email: (await supabase.auth.getUser()).data.user?.email || null,
            })
            .select("id")
            .single();

          if (error) throw error;
          ticketId = ticket.id;

          const initialUserContext = userContextMessages.length > 0
            ? `[Category: ${categoryLabel}]\n\n${userContextMessages[userContextMessages.length - 1]}`
            : `[Category: ${categoryLabel}]\n\nUser opened live chat.`;

          await supabase.from("support_messages").insert({
            ticket_id: ticketId,
            sender_id: userId,
            sender_type: "user",
            content: initialUserContext,
          });

          // Forward any attachments (images/voice) sent during AI phase to the DB
          const allMsgsForAttachments = contextMessages || messagesRef.current || messages;
          const attachmentMessages = allMsgsForAttachments.filter(
            m => m.role === "user" && m.attachmentUrl && m.attachmentType
          );
          for (const attachMsg of attachmentMessages) {
            await supabase.from("support_messages").insert({
              ticket_id: ticketId,
              sender_id: userId,
              sender_type: "user",
              content: attachMsg.content,
              attachment_url: attachMsg.attachmentUrl,
              attachment_type: attachMsg.attachmentType,
              voice_transcript: attachMsg.voiceTranscript || null,
            } as any);
          }
        }
      }

      setLiveChatTicketId(ticketId);

      // Fetch ticket status
      const { data: ticketData } = await supabase
        .from("support_tickets")
        .select("status")
        .eq("id", ticketId)
        .maybeSingle();
      if (ticketData) {
        setTicketStatus(ticketData.status);
        if (ticketData.status === "closed" || ticketData.status === "resolved") {
          setWaitingForAdmin(false);
        }
      }

      const { data: existingMsgs } = await supabase
        .from("support_messages")
        .select("id, sender_type, content, created_at, attachment_url, attachment_type, translated_content")
        .eq("ticket_id", ticketId)
        .order("created_at", { ascending: true });

      const conversationMessages = ((existingMsgs || []) as any[])
        .filter((msg) => msg.sender_type === "user" || msg.sender_type === "admin")
        .map((msg) => ({
          id: msg.id,
          role: msg.sender_type === "admin" ? "admin" : "user",
          content: msg.sender_type === "admin" ? (msg.translated_content || msg.content) : msg.content,
          timestamp: new Date(msg.created_at),
          attachmentUrl: msg.attachment_url,
          attachmentType: msg.attachment_type,
        } as Message));

      if (conversationMessages.length > 0) {
        setMessages(conversationMessages);
      }

      const lastSenderType = (existingMsgs as any[] | null)?.length
        ? (existingMsgs as any[])[(existingMsgs as any[]).length - 1]?.sender_type
        : null;
      const hasPendingAdminReply = lastSenderType !== "admin";
      setWaitingForAdmin(hasPendingAdminReply);
      if (hasPendingAdminReply) {
        setWaitStartTime(new Date());
      }

      await supabase
        .from("support_messages")
        .update({ is_read: true })
        .eq("ticket_id", ticketId)
        .eq("sender_type", "admin")
        .eq("is_read", false);
    } catch (error) {
      console.error("Live chat activation error:", error);
      setMessages(prev => [...prev, {
        id: `error-${Date.now()}`,
        role: "system",
        content: "❌ Failed to connect to live chat. Please try again.",
        timestamp: new Date(),
      }]);
      setWaitingForAdmin(false);
      setPhase("ai_chat");
    }
  }, [userId, messages, selectedCategory]);

  useEffect(() => {
    if (deepLinkHandledRef.current || !userId) return;

    const shouldOpenFromNotification = deepLinkMode === "live_chat" || Boolean(deepLinkTicketId);
    if (!shouldOpenFromNotification) return;

    deepLinkHandledRef.current = true;
    if (deepLinkMessageId) {
      console.log("🔔 Opening support message from notification:", deepLinkMessageId);
    }

    activateLiveChat(undefined, {
      forcedTicketId: deepLinkTicketId || undefined,
      skipIntroMessage: true,
    });
  }, [userId, deepLinkMode, deepLinkTicketId, deepLinkMessageId, activateLiveChat]);

  const sendMessage = async (messageText: string) => {
    if (!messageText.trim() || isLoading) return;
    const lowerMsg = messageText.toLowerCase().trim();

    if (phase === "live_chat" && liveChatTicketId && userId) {
      const userMessage: Message = {
        id: `user-${Date.now()}`,
        role: "user",
        content: messageText.trim(),
        timestamp: new Date(),
      };
      setMessages(prev => [...prev, userMessage]);
      setInput("");

      try {
        // Auto-translate user message to Bengali for admin
        let translatedContent = "";
        try {
          const { data: transData } = await supabase.functions.invoke("translate", {
            body: { text: messageText.trim(), targetLanguage: "Bengali" },
          });
          translatedContent = transData?.translatedText || "";
        } catch (e) {
          console.error("Translation error:", e);
        }

        await supabase.from("support_messages").insert({
          ticket_id: liveChatTicketId,
          sender_id: userId,
          sender_type: "user",
          content: messageText.trim(),
          translated_content: translatedContent || null,
          original_language: "auto",
        } as any);
        await supabase
          .from("support_tickets")
          .update({ status: "open", updated_at: new Date().toISOString() })
          .eq("id", liveChatTicketId);
      } catch (error) {
        console.error("Send error:", error);
      }
      return;
    }

    if (LIVE_CHAT_KEYWORDS.some(kw => lowerMsg.includes(kw))) {
      const userMessage: Message = {
        id: `user-${Date.now()}`,
        role: "user",
        content: messageText.trim(),
        timestamp: new Date(),
      };
      setMessages(prev => [...prev, userMessage]);
      setInput("");

      // Always connect to admin panel — no business hours block
      activateLiveChat();
      return;
    }

    if (phase === "describe") setPhase("ai_chat");

    const userMessage: Message = {
      id: `user-${Date.now()}`,
      role: "user",
      content: messageText.trim(),
      timestamp: new Date(),
    };
    setMessages(prev => [...prev, userMessage]);
    setInput("");
    setIsLoading(true);

    try {
      const conversationHistory = messages.map(m => ({
        role: m.role === "admin" ? "assistant" : m.role === "system" ? "assistant" : m.role,
        content: m.content,
      }));

      const response = await supabase.functions.invoke("support-chat", {
        body: {
          messages: [...conversationHistory, { role: "user", content: messageText.trim() }],
          userLevel,
          isPremium,
        },
      });

      if (response.error) {
        const statusCode = (response.error as any)?.status || 0;
        if (statusCode === 429) {
          throw new Error("Too many requests. Please wait a moment and try again.");
        }
        if (statusCode === 402) {
          throw new Error("AI service is temporarily unavailable. Please try again later.");
        }
        throw new Error(response.error.message || "Failed to get response");
      }

      if (response.data) {
        const aiContent = response.data.response || "I apologize, I couldn't process your request.";

        const newMessages: Message[] = [{
          id: `assistant-${Date.now()}`,
          role: "assistant",
          content: aiContent,
          timestamp: new Date(),
        }];

        // Detect agency-related keywords and auto-send agency signup link
        const agencyKeywords = /agency|agent|create\s*agency|join\s*agency/i;
        const combinedText = (messageText + " " + aiContent).toLowerCase();
        if (agencyKeywords.test(combinedText)) {
          const agencyLink = "https://merilive.com/agency-signup";
          newMessages.push({
            id: `agency-link-${Date.now()}`,
            role: "assistant",
            content: `🏢 **Want to create an Agency?**\n\nClick the link below to sign up directly:\n\n👉 [Sign Up for Agency](${agencyLink})\n\nClicking the link will take you to the Agency Sign Up page.`,
            timestamp: new Date(),
          });
        }

        setMessages(prev => [...prev, ...newMessages]);
      }
    } catch (error: any) {
      console.error("Support chat error:", error);
      setMessages(prev => [...prev, {
        id: `error-${Date.now()}`,
        role: "assistant",
        content: "I'm having trouble connecting. Please try again in a moment.",
        timestamp: new Date(),
      }]);
    } finally {
      setIsLoading(false);
      inputRef.current?.focus();
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    sendMessage(input);
  };

  const isLiveChatMode = phase === "live_chat";
  const isTicketClosed = isLiveChatMode && (ticketStatus === "closed" || ticketStatus === "resolved");

  const handleStartNewChat = () => {
    setLiveChatTicketId(null);
    setTicketStatus(null);
    setMessages([]);
    setWaitingForAdmin(false);
    setPhase("category");
    setSelectedCategory(null);
    deepLinkHandledRef.current = false;
  };

  return (
    <div className="flex flex-col h-full bg-background">
      {/* Header */}
      <div className={cn(
        "flex items-center gap-3 p-4 border-b",
        isTicketClosed
          ? "bg-gradient-to-r from-red-500/10 to-orange-500/5 border-red-500/20"
          : isLiveChatMode
            ? "bg-gradient-to-r from-green-500/15 to-emerald-500/10 border-green-500/20"
            : "bg-gradient-to-r from-primary/10 to-primary/5"
      )}>
        {onClose && (
          <button onClick={onClose} className="p-2 -ml-2 hover:bg-muted rounded-full">
            <ArrowLeft className="w-5 h-5" />
          </button>
        )}
        <div className={cn(
          "w-10 h-10 rounded-full flex items-center justify-center shadow-lg",
          isTicketClosed
            ? "bg-gradient-to-br from-red-500 to-orange-600"
            : isLiveChatMode
              ? "bg-gradient-to-br from-green-500 to-emerald-600"
              : "bg-gradient-to-br from-primary to-primary/60"
        )}>
          {isTicketClosed ? <XCircle className="w-5 h-5 text-white" /> : isLiveChatMode ? <Headphones className="w-5 h-5 text-white" /> : <Bot className="w-5 h-5 text-primary-foreground" />}
        </div>
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <h2 className="font-semibold">{isTicketClosed ? "Disconnected" : isLiveChatMode ? "Live Support" : "AI Support"}</h2>
            {isTicketClosed && <span className="w-2.5 h-2.5 rounded-full bg-red-500" />}
            {isLiveChatMode && !isTicketClosed && <span className="w-2.5 h-2.5 rounded-full bg-green-500 animate-pulse shadow-[0_0_8px_rgba(34,197,94,0.6)]" />}
            {!isLiveChatMode && isPremium && (
              <span className="px-2 py-0.5 text-xs bg-gradient-to-r from-amber-400 to-orange-500 text-white rounded-full flex items-center gap-1">
                <Sparkles className="w-3 h-3" /> Priority
              </span>
            )}
          </div>
          <p className="text-xs text-muted-foreground">
            {isTicketClosed
              ? "This conversation has been closed by support"
              : isLiveChatMode ? (waitingForAdmin ? "Waiting for admin..." : "Connected to support team") : "Always here to help"}
          </p>
        </div>
        {waitingForAdmin && !isTicketClosed && (
          <div className="flex items-center gap-1.5 px-3 py-1.5 bg-amber-500/15 border border-amber-500/30 rounded-full animate-pulse">
            <Clock className="w-3.5 h-3.5 text-amber-400" />
            <span className="text-xs font-mono text-amber-400 font-bold">{waitElapsed}</span>
          </div>
        )}
      </div>

      {/* Waiting Banner */}
      {waitingForAdmin && (
        <div className="px-4 py-3 bg-gradient-to-r from-amber-500/10 via-orange-500/10 to-red-500/5 border-b border-amber-500/20">
          <div className="flex items-center gap-2">
            <div className="relative">
              <Loader2 className="w-5 h-5 animate-spin text-amber-400" />
              <span className="absolute -top-0.5 -right-0.5 w-2 h-2 bg-amber-400 rounded-full animate-ping" />
            </div>
            <div>
              <p className="text-sm font-medium text-foreground">⏳ Waiting for admin reply...</p>
              <p className="text-xs text-muted-foreground">
                Elapsed: <span className="text-amber-400 font-mono font-bold">{waitElapsed}</span> • Our team will respond shortly
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Category Selection Phase */}
      {phase === "category" && (
        <ScrollArea className="flex-1 p-4">
          <div className="space-y-4">
            <div className="flex gap-3">
              <div className="w-8 h-8 rounded-full bg-gradient-to-br from-primary to-primary/60 flex items-center justify-center flex-shrink-0">
                <Bot className="w-4 h-4 text-primary-foreground" />
              </div>
              <div className="flex-1">
                <div className="bg-muted rounded-2xl px-4 py-3">
                  <p className="text-sm">👋 Hello <strong>{userName}</strong>! Welcome to MeriLive Support.</p>
                  <p className="text-sm mt-2">Please select your issue category:</p>
                </div>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2 mt-3">
              {INITIAL_CATEGORIES.map((cat) => (
                <button
                  key={cat.key}
                  onClick={() => handleCategorySelect(cat)}
                  className="flex items-center gap-2.5 p-3 bg-muted/60 hover:bg-muted border border-border/50 hover:border-primary/30 rounded-xl transition-all text-left group"
                >
                  <span className="text-xl">{cat.icon}</span>
                  <span className="text-xs font-medium text-foreground group-hover:text-primary transition-colors">{cat.label}</span>
                </button>
              ))}
            </div>
            {/* Live Support Hours */}
            <LiveSupportHours />
          </div>
        </ScrollArea>
      )}

      {/* Messages Area */}
      {phase !== "category" && (
        <ScrollArea ref={scrollAreaRef} className="flex-1 p-4">
          <div className="space-y-4">
            {messages.map((message) => {
              if (message.role === "system") {
                return (
                  <div key={message.id} className="flex justify-center">
                    <div className={cn(
                      "rounded-full px-4 py-2 text-xs text-center max-w-[90%] flex items-center gap-2",
                      isLiveChatMode
                        ? "bg-gradient-to-r from-green-500/15 to-emerald-500/10 border border-green-500/20 text-green-600 dark:text-green-400"
                        : "bg-muted/50 text-muted-foreground"
                    )}>
                      {isLiveChatMode && <Zap className="w-3 h-3" />}
                      {message.content}
                    </div>
                  </div>
                );
              }

              const isUser = message.role === "user";
              const isAdmin = message.role === "admin";

              return (
                <div key={message.id} className={cn("flex gap-3", isUser ? "flex-row-reverse" : "flex-row")}>
                  <div className={cn(
                    "w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0",
                    isUser ? "bg-primary text-primary-foreground shadow-sm"
                      : isAdmin ? "relative bg-gradient-to-br from-emerald-400 via-green-500 to-teal-600 ring-[2.5px] ring-emerald-400/40 shadow-[0_0_14px_rgba(16,185,129,0.35)]"
                      : "bg-muted shadow-sm"
                  )}>
                    {isUser ? <User className="w-4 h-4" /> : isAdmin ? <Shield className="w-4 h-4 text-white drop-shadow-md" /> : <Bot className="w-4 h-4" />}
                    {isAdmin && (
                      <span className="absolute -bottom-0.5 -right-0.5 w-3 h-3 bg-green-400 rounded-full border-2 border-background animate-pulse shadow-[0_0_6px_rgba(74,222,128,0.6)]" />
                    )}
                  </div>
                  <div className="max-w-[80%]">
                    {isAdmin && (
                      <div className="flex items-center gap-1.5 mb-1 ml-1">
                        <div className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-gradient-to-r from-emerald-500/15 to-teal-500/10 border border-emerald-500/25">
                          <Shield className="w-3 h-3 text-emerald-400" />
                          <p className="text-[10px] text-emerald-400 font-bold tracking-wide">Official Admin</p>
                          <span className="w-1.5 h-1.5 bg-emerald-400 rounded-full shadow-[0_0_4px_rgba(52,211,153,0.8)]" />
                        </div>
                      </div>
                    )}
                    <div className={cn(
                      "rounded-2xl px-4 py-2.5",
                      isUser ? "bg-primary text-primary-foreground"
                        : isAdmin ? "bg-gradient-to-br from-green-500/10 to-emerald-500/5 border border-green-500/20"
                        : "bg-muted"
                    )}>
                      {/* Image attachment */}
                      {message.attachmentUrl && message.attachmentType === "image" && (
                        <div className="mb-2">
                          <img
                            src={message.attachmentUrl}
                            alt="Attachment"
                            className="max-w-full rounded-lg max-h-48 object-cover cursor-pointer"
                            onClick={() => window.open(message.attachmentUrl, "_blank")}
                          />
                        </div>
                      )}
                      {/* Voice attachment */}
                      {message.attachmentUrl && message.attachmentType === "voice" && (
                        <div className="mb-2">
                          <audio controls src={message.attachmentUrl} className="w-full max-w-[240px] h-8" />
                        </div>
                      )}
                      {!isUser ? (
                        <div className="prose prose-sm dark:prose-invert max-w-none [&_a]:text-primary [&_a]:underline [&_a]:font-semibold">
                          <ReactMarkdown
                            components={{
                              a: ({ href, children }) => (
                                <a
                                  href={href}
                                  onClick={async (e) => {
                                    e.preventDefault();
                                    if (href) {
                                      const { openInApp } = await import("@/utils/inAppNavigation");
                                      await openInApp(href);
                                    }
                                  }}
                                  className="text-primary underline font-semibold cursor-pointer"
                                >
                                  {children}
                                </a>
                              ),
                            }}
                          >
                            {message.content}
                          </ReactMarkdown>
                        </div>
                      ) : (
                        <p className="text-sm whitespace-pre-wrap">{message.content}</p>
                      )}
                      <p className={cn("text-[10px] mt-1", isUser ? "text-primary-foreground/70" : "text-muted-foreground")}>
                        {message.timestamp.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                      </p>
                    </div>
                  </div>
                </div>
              );
            })}

            {isLoading && (
              <div className="flex gap-3">
                <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center">
                  <Bot className="w-4 h-4" />
                </div>
                <div className="bg-muted rounded-2xl px-4 py-3">
                  <div className="flex items-center gap-2">
                    <div className="flex gap-1">
                      <span className="w-2 h-2 bg-primary/60 rounded-full animate-bounce [animation-delay:0ms]" />
                      <span className="w-2 h-2 bg-primary/60 rounded-full animate-bounce [animation-delay:150ms]" />
                      <span className="w-2 h-2 bg-primary/60 rounded-full animate-bounce [animation-delay:300ms]" />
                    </div>
                    <span className="text-sm text-muted-foreground">Analyzing...</span>
                  </div>
                </div>
              </div>
            )}
          </div>
        </ScrollArea>
      )}

      {/* Quick live chat escalation */}
      {phase === "ai_chat" && !isLoading && messages.length >= 3 && (
        <div className="px-4 pb-2">
          <button
            onClick={() => activateLiveChat()}
            className="w-full flex items-center justify-center gap-2 py-2 px-4 bg-gradient-to-r from-green-500/10 to-emerald-500/5 hover:from-green-500/20 hover:to-emerald-500/10 border border-green-500/20 rounded-xl transition-all text-xs text-green-600 dark:text-green-400 font-medium"
          >
            <Headphones className="w-3.5 h-3.5" />
            Not resolved? Connect to Live Chat
          </button>
        </div>
      )}

      {/* Recording Banner */}
      {isRecording && (
        <div className="px-4 py-2 bg-red-500/10 border-t border-red-500/20 flex items-center gap-3">
          <span className="w-3 h-3 rounded-full bg-red-500 animate-pulse" />
          <span className="text-sm font-medium text-red-500">Recording... {recordingTime}s</span>
          <Button size="sm" variant="destructive" className="ml-auto" onClick={stopRecording}>
            <MicOff className="w-4 h-4 mr-1" /> Stop
          </Button>
        </div>
      )}

      {/* Uploading indicator */}
      {isUploading && (
        <div className="px-4 py-2 border-t flex items-center gap-2">
          <Loader2 className="w-4 h-4 animate-spin text-primary" />
          <span className="text-xs text-muted-foreground">Uploading...</span>
        </div>
      )}

      {/* Disconnected Banner + New Chat Button */}
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

      {/* Input Area - only show when ticket is not closed */}
      {phase !== "category" && !isTicketClosed && (
        <form onSubmit={handleSubmit} className="p-4 border-t bg-background">
          <div className="flex gap-2 items-center">
            {/* Attachment buttons */}
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={handleImageSelect}
            />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={isUploading || isRecording}
              className="p-2 rounded-full hover:bg-muted transition-colors text-muted-foreground hover:text-primary disabled:opacity-50"
            >
              <Image className="w-5 h-5" />
            </button>
            <button
              type="button"
              onClick={isRecording ? stopRecording : startRecording}
              disabled={isUploading}
              className={cn(
                "p-2 rounded-full transition-colors",
                isRecording ? "bg-red-500/20 text-red-500" : "hover:bg-muted text-muted-foreground hover:text-primary disabled:opacity-50"
              )}
            >
              {isRecording ? <MicOff className="w-5 h-5" /> : <Mic className="w-5 h-5" />}
            </button>

            <Input
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder={
                isLiveChatMode ? "Type your message to admin..."
                  : phase === "describe" ? "Describe your problem..."
                  : "Type your message..."
              }
              disabled={isLoading || isRecording}
              className="flex-1"
              maxLength={1000}
              autoFocus
            />
            <Button
              type="submit"
              size="icon"
              disabled={!input.trim() || isLoading || isRecording}
              className={cn("shrink-0", isLiveChatMode && "bg-green-600 hover:bg-green-700")}
            >
              <Send className="w-4 h-4" />
            </Button>
          </div>
        </form>
      )}
    </div>
  );
};

export default AISupportChat;
