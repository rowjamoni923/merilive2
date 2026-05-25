import React, { useState, useEffect, useRef, Suspense, lazy, useCallback } from "react";


import { useContentModeration } from "@/hooks/useContentModeration";
import { detectAndProcessViolation } from "@/utils/contactDetection";
import { scanImageForContactInfo } from "@/utils/imageContactDetection";
import { NumberSharingWarningDialog, useNumberSharingWarning } from "@/components/moderation/NumberSharingWarningDialog";
import { ImageViewer, useImageViewer } from "@/components/ui/image-viewer";
import { useNavigate, useSearchParams } from "react-router-dom";
import { ArrowLeft, Search, MoreVertical, Send, Smile, Users, MessageCircle, Crown, X, Phone as VideoCallIcon, Camera, Mic, Gift, Languages, Phone, ChevronRight, Plus, ImageIcon, Gamepad2, Settings, ShieldAlert, MessageSquareReply, SmilePlus, Info } from "lucide-react";
import { GroupSettingsPanel } from "@/components/chat/GroupSettingsPanel";
import { MessageStatusIndicator } from "@/components/chat/MessageStatusIndicator";
import { EmojiPicker } from "@/components/chat/EmojiPicker";
import { MediaUploader } from "@/components/chat/MediaUploader";
// UNIFIED GIFTING - SINGLE LINK for all sections (Live, Party, Call, Chat, Profile)
// Change @/features/shared/gifting = Change everywhere automatically
import { GiftPanel, GiftData } from "@/features/shared/gifting";
import { LiveGameSelector } from "@/components/games/LiveGameSelector";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";

// Lazy load animation players for gift display
const SVGAPlayer = lazy(() => import("@/components/common/SVGAPlayer"));
const UniversalAnimationPlayer = lazy(() => import("@/components/common/UniversalAnimationPlayer"));
import { Badge } from "@/components/ui/badge";
import { BottomNavigation } from "@/components/layout/BottomNavigation";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { subscribeToTables } from "@/hooks/useUniversalRealtime";
import { useCall } from "@/components/call/CallProvider";
import { toast } from "sonner";
import { motion, AnimatePresence } from "framer-motion";
import { useSound } from "@/hooks/useSound";
import { getCachedHostGiftPercent, ensureHostGiftPercentLoaded } from "@/hooks/useHostGiftPercent";
import { callGiftService } from "@/utils/giftServiceClient";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { NotificationList } from "@/components/notifications/NotificationList";
import { OfficialNoticeList } from "@/components/notifications/OfficialNoticeList";
import { messageOutbox, type OutboxItem } from "@/lib/messageOutbox";
import { useMessageOutboxDrain } from "@/hooks/useMessageOutboxDrain";
import { useNotifications } from "@/hooks/useNotifications";
import { useGlobalUnreadCount, formatBadgeCount } from "@/hooks/useGlobalUnreadCount";
import { GiftEmojiAnimation } from "@/components/chat/GiftEmojiAnimation";
import AvatarWithFrame from "@/components/common/AvatarWithFrame";
import Beans3DIcon from "@/components/common/Beans3DIcon";
import diamondGem3D from "@/assets/diamond-gem-3d.png";
import TraderBadge from "@/components/common/TraderBadge";
import { LevelBadge } from "@/components/common/LevelBadge";
import { trackTaskProgress } from "@/hooks/useTaskProgress";
import { ReportUserDialog } from "@/components/report/ReportUserDialog";
import { recordClientError } from "@/utils/clientErrorLog";
import { pickDisplayLevel } from "@/utils/displayLevel";
import { normalizeGiftMediaUrl } from "@/utils/giftMediaUrl";

interface Conversation {
  id: string;
  participant1_id: string;
  participant2_id: string;
  last_message_at: string | null;
  other_user: {
    id: string;
    display_name: string | null;
    avatar_url: string | null;
    is_online: boolean | null;
    is_verified: boolean | null;
    is_host: boolean | null;
    gender: string | null;
    user_level?: number | null;
    host_level?: number | null;
    max_user_level?: number | null;
    country_flag?: string | null;
    country_name?: string | null;
    city?: string | null;
    last_seen_at?: string | null;
    call_rate_per_minute?: number | null;
  } | null;
  last_message?: string;
  unread_count: number;
}

interface Message {
  id: string;
  content: string;
  sender_id: string;
  created_at: string;
  is_read: boolean;
  message_type: string;
  status?: 'sending' | 'sent' | 'delivered' | 'read';
  delivered_at?: string | null;
  read_at?: string | null;
  reply_to_id?: string | null;
  _optimistic?: boolean; // client-only flag for optimistic messages
}

interface Group {
  id: string;
  name: string;
  avatar_url: string | null;
  group_type: string;
  group_code: string;
  owner_id: string;
  member_count: number;
  is_owner: boolean;
}

interface GroupMessage {
  id: string;
  content: string;
  sender_id: string;
  created_at: string;
  message_type: string;
  sender?: {
    display_name: string | null;
    avatar_url: string | null;
    user_level?: number | null;
    host_level?: number | null;
    max_user_level?: number | null;
    gender?: string | null;
    is_host?: boolean | null;
  };
}

// Parse gift payload from chat content
// Format: [Gift: ANIMATION_URL|EMOJI NAME xCOUNT | -DIAMONDS diamonds | +BEANS beans | snd:SOUND_URL]
// The `snd:` suffix is optional and only present when the gift has a separate sound asset.
const parseGiftContent = (content: string): { mediaUrl: string | null; emoji: string; soundUrl: string | null } => {
  const mediaMatch = content.match(/\[Gift:\s*(https?:\/\/[^\|\s\]]+)\|/i);
  const emojiMatch = content.match(/\[Gift:\s*(?:https?:\/\/[^\|\s\]]+\|)?([^\s\]]+)/i);
  const soundMatch = content.match(/\|\s*snd:(https?:\/\/[^\s\|\]]+)/i);

  return {
    mediaUrl: normalizeGiftMediaUrl(mediaMatch?.[1]) ?? null,
    emoji: emojiMatch?.[1] ?? '🎁',
    soundUrl: normalizeGiftMediaUrl(soundMatch?.[1]) ?? null,
  };
};

const getGiftAnimationSignature = (content: string, senderId?: string | null): string => {
  const { mediaUrl, emoji } = parseGiftContent(content || '');
  const detailMatch = content.match(/\[Gift:\s*(?:https?:\/\/[^\|\s\]]+\|)?[^\s\]]+\s+(.+?)\s+x(\d+)/i);
  const name = detailMatch?.[1]?.trim().toLowerCase() || 'gift';
  const count = detailMatch?.[2] || '1';
  return `${senderId || 'unknown'}:${mediaUrl || emoji}:${name}:x${count}`;
};

// Helper function to clean gift message for preview (removes URLs, shows only emoji + name + beans)
const cleanGiftMessageForPreview = (content: string): string => {
  if (!/^\[Gift:/i.test(content)) return content;

  // Match format: [Gift: URL|EMOJI NAME xCOUNT | +BEANS beans] or [Gift: EMOJI NAME xCOUNT | +BEANS beans]
  // Extract just emoji, name, count and beans - remove URL completely
  const urlRemoved = content
    .replace(/\[Gift:\s*https?:\/\/[^\|\s]+\|/i, '[Gift: ')
    // Strip optional trailing |snd:URL field before final ] so preview regex matches
    .replace(/\|\s*snd:[^\|\]]+/i, '');

  // Parse the clean content (supports both old and new format with optional diamonds segment)
  const match = urlRemoved.match(/\[Gift:\s*([^\s]+)\s+([^x]+?)\s*x(\d+)\s*\|(?:\s*-\d+\s*diamonds\s*\|)?\s*\+(\d+)\s*beans\s*\]/i);
  if (match) {
    const [, emoji, name, count, beans] = match;
    return `[Gift: ${emoji} ${name.trim()} x${count} | +${Number(beans).toLocaleString()} bea...]`;
  }

  // Fallback - just remove URL part
  return urlRemoved;
};

const Chat = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const imageViewer = useImageViewer();
  const { startCall } = useCall();
  const { playSound } = useSound();
  const playSoundRef = useRef(playSound);
  playSoundRef.current = playSound;
  const lastSoundTimeRef = useRef(0);
  const playSoundDebounced = useCallback((type: Parameters<typeof playSound>[0]) => {
    const now = Date.now();
    if (now - lastSoundTimeRef.current < 900) return; // stronger debounce to prevent duplicate beeps
    lastSoundTimeRef.current = now;
    playSoundRef.current(type);
  }, []);
  const numberWarning = useNumberSharingWarning();
  const [activeTab, setActiveTab] = useState("/chat");
  const [chatTab, setChatTab] = useState("messages");
  const [selectedConversation, setSelectedConversation] = useState<Conversation | null>(null);
  const [selectedGroup, setSelectedGroup] = useState<Group | null>(null);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [groups, setGroups] = useState<Group[]>([]);
  const [messages, setMessages] = useState<Message[]>([]);
  const [groupMessages, setGroupMessages] = useState<GroupMessage[]>([]);
  const [signedChatMediaUrls, setSignedChatMediaUrls] = useState<Record<string, string>>({});
  const [pendingMedia, setPendingMedia] = useState<{ url: string; type: 'image' | 'video' | 'audio' } | null>(null);

  // Reply state
  const [replyingTo, setReplyingTo] = useState<{ messageId: string; content: string; senderName: string; senderId: string } | null>(null);
  const [replyMessages, setReplyMessages] = useState<Record<string, { content: string; sender_id: string }>>({});
  
  // Message reactions (client-side only until DB table exists)
  const [messageReactions, setMessageReactions] = useState<Record<string, string[]>>({});
  
  // Message info dialog
  const [showMessageInfo, setShowMessageInfo] = useState(false);
  const [messageInfoMessage, setMessageInfoMessage] = useState<Message | null>(null);

  // 🛡️ DM dedup guard: enforce one row per message id at all times. Catches
  // any race between optimistic insert, REST fetch, realtime INSERT,
  // broadcast and persistDirectMessage so the same id never renders twice.
  useEffect(() => {
    setMessages(prev => {
      const seen = new Set<string>();
      const out: Message[] = [];
      for (const m of prev) {
        const key = String(m.id);
        if (seen.has(key)) continue;
        seen.add(key);
        out.push(m);
      }
      return out.length === prev.length ? prev : out;
    });
  }, [messages]);
  useEffect(() => {
    setGroupMessages(prev => {
      const seen = new Set<string>();
      const out: GroupMessage[] = [];
      for (const m of prev) {
        const key = String(m.id);
        if (seen.has(key)) continue;
        seen.add(key);
        out.push(m);
      }
      return out.length === prev.length ? prev : out;
    });
  }, [groupMessages]);

  useEffect(() => {
    const isPlainStorageKey = (value: string) => {
      if (!value) return false;
      if (/^https?:|^blob:|^data:/i.test(value)) return false;
      // Exclude chat payload wrappers like "[Gift: ...]" and anything with
      // whitespace, pipes, brackets, or other characters Storage rejects.
      if (/^\[/.test(value)) return false;
      if (/[\s|\[\]\\<>"'`]/.test(value)) return false;
      if (!value.includes('/')) return false;
      return /^[A-Za-z0-9._~!$&'()+,;=:@/-]+$/.test(value);
    };
    const paths = [...messages, ...groupMessages]
      .map((m) => m.content || '')
      .concat(pendingMedia?.url || '')
      .filter(isPlainStorageKey);
    const missing = [...new Set(paths)].filter((path) => !signedChatMediaUrls[path]);
    if (missing.length === 0) return;
    let cancelled = false;
    Promise.all(missing.map(async (path) => {
      const { data } = await supabase.storage.from('chat-media').createSignedUrl(path, 60 * 60);
      return [path, data?.signedUrl || path] as const;
    })).then((entries) => {
      if (!cancelled) setSignedChatMediaUrls(prev => ({ ...prev, ...Object.fromEntries(entries) }));
    });
    return () => { cancelled = true; };
  }, [messages, groupMessages, pendingMedia?.url, signedChatMediaUrls]);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [myProfile, setMyProfile] = useState<{ display_name: string | null; avatar_url: string | null; user_level: number; host_level: number; max_user_level: number; gender: string | null; is_host: boolean } | null>(null);
  const [userCoins, setUserCoins] = useState(0);
  const [searchQuery, setSearchQuery] = useState("");
  const [isOtherTyping, setIsOtherTyping] = useState(false);
  const typingTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const typingChannelRef = useRef<any>(null);
  const directMessageChannelRef = useRef<any>(null);
  const receiptChannelRef = useRef<any>(null);
  const recentGiftAnimationsRef = useRef<Map<string, number>>(new Map());
  const [otherUserTrader, setOtherUserTrader] = useState<{ isTrader: boolean; traderLevel: number }>({ isTrader: false, traderLevel: 0 });
  const messagesEndRef = useRef<HTMLDivElement>(null);
  
  // Group creation
  const [showGroupActions, setShowGroupActions] = useState(false);
  const [showCreateGroup, setShowCreateGroup] = useState(false);
  const [showSearchGroup, setShowSearchGroup] = useState(false);
  const [showGroupSettings, setShowGroupSettings] = useState(false);
  const [newGroupName, setNewGroupName] = useState("");
  const [newGroupType, setNewGroupType] = useState("basic");
  const [groupSearchQuery, setGroupSearchQuery] = useState("");
  const [groupSearchResults, setGroupSearchResults] = useState<any[]>([]);
  const [creatingGroup, setCreatingGroup] = useState(false);
  const [newGroupPhoto, setNewGroupPhoto] = useState<File | null>(null);
  const [newGroupPhotoPreview, setNewGroupPhotoPreview] = useState<string | null>(null);
  const groupPhotoInputRef = useRef<HTMLInputElement>(null);
  
  // Notifications
  const { markAllAsRead: markAllNotificationsAsRead } = useNotifications();
  const globalUnread = useGlobalUnreadCount();

  const emitGlobalUnreadRefresh = useCallback((detail?: { messagesDecrement?: number; messagesSetZero?: boolean }) => {
    if (typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent("global-unread:refresh", { detail }));
    }
  }, []);
  
  // Handle tab change - mark all notifications as read when entering notifications tab
  const handleTabChange = (tab: string) => {
    setChatTab(tab);
    if (tab === 'notifications') {
      // Mark all notifications as read when viewing the notifications tab
      markAllNotificationsAsRead();
    }
  };
  
  // Emoji & Media Picker
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [showMediaUploader, setShowMediaUploader] = useState(false);
  
  // Voice Recording
  const [isRecording, setIsRecording] = useState(false);
  const [recordingDuration, setRecordingDuration] = useState(0);
  const [mediaRecorder, setMediaRecorder] = useState<MediaRecorder | null>(null);
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
  const [sendingVoice, setSendingVoice] = useState(false);
  const audioChunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const recordingIntervalRef = useRef<NodeJS.Timeout | null>(null);
  
  // Pending Media (image/video to send with send button)

  // Translator
  const [showTranslator, setShowTranslator] = useState(false);
  const [translateText, setTranslateText] = useState("");
  const [translatedResult, setTranslatedResult] = useState("");
  const [selectedLanguage, setSelectedLanguage] = useState("English");
  
  // Report dialog
  const [showReportDialog, setShowReportDialog] = useState(false);
  const [isTranslating, setIsTranslating] = useState(false);
  const translateTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  
  // Gift Animation State
  const [showGiftAnimation, setShowGiftAnimation] = useState(false);
  const [animatingGiftEmoji, setAnimatingGiftEmoji] = useState("");
  const [animatingGiftSound, setAnimatingGiftSound] = useState<string | null>(null);
  const [giftAnimationInstance, setGiftAnimationInstance] = useState(0);
  
  // Host's received gift tracking (live counter)
  const [hostReceivedGifts, setHostReceivedGifts] = useState(0);
  const [hostTotalDiamonds, setHostTotalDiamonds] = useState(0);
  
  // Inline translation for main input
  const [inlineTranslation, setInlineTranslation] = useState("");
  const [isInlineTranslating, setIsInlineTranslating] = useState(false);
  const [inlineTranslateEnabled, setInlineTranslateEnabled] = useState(false);
  const [inlineTargetLang, setInlineTargetLang] = useState("English");
  const inlineTranslateTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  
  // Language options with country flags
  const languageOptions = [
    { code: "English", flag: "🇺🇸", name: "English" },
    { code: "Bengali", flag: "🇧🇩", name: "Bengali" },
    { code: "Hindi", flag: "🇮🇳", name: "Hindi" },
    { code: "Arabic", flag: "🇸🇦", name: "Arabic" },
    { code: "Spanish", flag: "🇪🇸", name: "Spanish" },
    { code: "French", flag: "🇫🇷", name: "French" },
    { code: "Portuguese", flag: "🇧🇷", name: "Portuguese" },
    { code: "Russian", flag: "🇷🇺", name: "Russian" },
    { code: "Chinese", flag: "🇨🇳", name: "Chinese" },
    { code: "Japanese", flag: "🇯🇵", name: "Japanese" },
    { code: "Korean", flag: "🇰🇷", name: "Korean" },
    { code: "Turkish", flag: "🇹🇷", name: "Türkçe" },
    { code: "Indonesian", flag: "🇮🇩", name: "Bahasa" },
    { code: "Thai", flag: "🇹🇭", name: "ไทย" },
    { code: "Vietnamese", flag: "🇻🇳", name: "Tiếng Việt" },
  ];

  // Inline auto-translate for main input
  const translateInlineMessage = async (text: string, targetLang: string) => {
    if (!text.trim()) {
      setInlineTranslation("");
      return;
    }
    
    setIsInlineTranslating(true);
    try {
      const response = await supabase.functions.invoke('translate', {
        body: { text: text.trim(), targetLanguage: targetLang }
      });
      
      if (response.error) {
        console.error('Inline translation error:', response.error);
        recordClientError({ label: "Chat.response", message: response.error instanceof Error ? response.error.message : String(response.error) });
        return;
      }
      
      setInlineTranslation(response.data?.translatedText || "");
    } catch (error) {
      console.error('Inline translation error:', error);
      recordClientError({ label: "Chat.response", message: error instanceof Error ? error.message : String(error) });
    } finally {
      setIsInlineTranslating(false);
    }
  };

  // Handle message change with inline translation
  const handleMessageChange = (text: string) => {
    setMessage(text);
    
    // Broadcast typing indicator
    if (text.trim()) broadcastTyping();
    
    // If inline translation is enabled, translate as user types
    if (inlineTranslateEnabled && text.trim()) {
      if (inlineTranslateTimeoutRef.current) {
        clearTimeout(inlineTranslateTimeoutRef.current);
      }
      
      inlineTranslateTimeoutRef.current = setTimeout(() => {
        translateInlineMessage(text, inlineTargetLang);
      }, 600);
    } else {
      setInlineTranslation("");
    }
  };

  // Auto-translate function for modal
  const autoTranslate = async (text: string, targetLang: string) => {
    if (!text.trim()) {
      setTranslatedResult("");
      return;
    }
    
    setIsTranslating(true);
    try {
      const response = await supabase.functions.invoke('translate', {
        body: { text: text.trim(), targetLanguage: targetLang }
      });
      
      if (response.error) {
        console.error('Translation error:', response.error);
        recordClientError({ label: "Chat.response", message: response.error instanceof Error ? response.error.message : String(response.error) });
        toast.error("Translation failed");
        return;
      }
      
      setTranslatedResult(response.data?.translatedText || "");
    } catch (error) {
      console.error('Translation error:', error);
      recordClientError({ label: "Chat.response", message: error instanceof Error ? error.message : String(error) });
      toast.error("Translation failed");
    } finally {
      setIsTranslating(false);
    }
  };

  // Debounced auto-translate on text change for modal
  const handleTranslateTextChange = (text: string) => {
    setTranslateText(text);
    
    // Clear previous timeout
    if (translateTimeoutRef.current) {
      clearTimeout(translateTimeoutRef.current);
    }
    
    // Set new timeout for auto-translate (500ms debounce)
    if (text.trim()) {
      translateTimeoutRef.current = setTimeout(() => {
        autoTranslate(text, selectedLanguage);
      }, 500);
    } else {
      setTranslatedResult("");
    }
  };

  // Re-translate when language changes for modal
  const handleLanguageChange = (lang: string) => {
    setSelectedLanguage(lang);
    if (translateText.trim()) {
      autoTranslate(translateText, lang);
    }
  };
  
  // Re-translate when inline language changes
  const handleInlineLangChange = (lang: string) => {
    setInlineTargetLang(lang);
    if (message.trim() && inlineTranslateEnabled) {
      translateInlineMessage(message, lang);
    }
  };
  
  // Gift Panel & Game Panel
  const [showGiftPanel, setShowGiftPanel] = useState(false);
  const [showGamePanel, setShowGamePanel] = useState(false);
  
  // ✅ Gifts loaded from real database via GiftPanel/ChatGiftPanel components
  // No hardcoded gift data - 100% real DB
  
  // Start Voice Recording
  const startVoiceRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ 
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          sampleRate: 44100
        } 
      });
      
      streamRef.current = stream;
      
      // Check supported MIME types
      let mimeType = 'audio/webm;codecs=opus';
      if (!MediaRecorder.isTypeSupported(mimeType)) {
        mimeType = 'audio/webm';
        if (!MediaRecorder.isTypeSupported(mimeType)) {
          mimeType = 'audio/mp4';
          if (!MediaRecorder.isTypeSupported(mimeType)) {
            mimeType = '';
          }
        }
      }
      
      const recorder = mimeType 
        ? new MediaRecorder(stream, { mimeType })
        : new MediaRecorder(stream);
      
      audioChunksRef.current = [];
      
      recorder.ondataavailable = (event) => {
        console.log('[Voice] Data available:', event.data.size, 'bytes');
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };
      
      recorder.onstop = () => {
        console.log('[Voice] Recorder stopped, chunks:', audioChunksRef.current.length);
        if (audioChunksRef.current.length === 0) {
          console.error('[Voice] No audio chunks recorded!');
          recordClientError({ label: "Chat.recorder", message: '[Voice] No audio chunks recorded!' });
          toast.error('Recording failed. Please try again.');
          return;
        }
        const blob = new Blob(audioChunksRef.current, { 
          type: recorder.mimeType || 'audio/webm' 
        });
        console.log('[Voice] Created blob:', blob.size, 'bytes, type:', blob.type);
        setAudioBlob(blob);
      };
      
      // Use timeslice to collect data every 100ms
      recorder.start(100);
      console.log('[Voice] Recording started with mimeType:', recorder.mimeType);
      setMediaRecorder(recorder);
      setIsRecording(true);
      setRecordingDuration(0);
      setAudioBlob(null);
      
      // Start timer
      recordingIntervalRef.current = setInterval(() => {
        setRecordingDuration(prev => prev + 1);
      }, 1000);
      
    } catch (error) {
      console.error("Microphone access error:", error);
      recordClientError({ label: "Chat.blob", message: error instanceof Error ? error.message : String(error) });
    }
  };
  
  // Stop Voice Recording
  const stopVoiceRecording = () => {
    console.log('[Voice] Stopping recording...');
    if (mediaRecorder && mediaRecorder.state !== 'inactive') {
      // Request any remaining data before stopping
      try {
        mediaRecorder.requestData();
      } catch (e) {
        console.log('[Voice] requestData not supported or failed');
      }
      mediaRecorder.stop();
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
    if (recordingIntervalRef.current) {
      clearInterval(recordingIntervalRef.current);
      recordingIntervalRef.current = null;
    }
    setIsRecording(false);
  };
  
  // Cancel Voice Recording
  const cancelVoiceRecording = () => {
    stopVoiceRecording();
    setAudioBlob(null);
    setRecordingDuration(0);
  };
  
  // Send Voice Message
  const sendVoiceMessage = async () => {
    console.log('[Voice] sendVoiceMessage called, audioBlob:', audioBlob?.size, 'bytes');
    
    if (!audioBlob) {
      console.error('[Voice] No audio blob available!');
      recordClientError({ label: "Chat.sendVoiceMessage", message: '[Voice] No audio blob available!' });
      toast.error('No audio recorded. Please record again.');
      return;
    }
    
    if (!currentUserId || sendingVoice) {
      console.log('[Voice] Cannot send: currentUserId:', currentUserId, 'sendingVoice:', sendingVoice);
      return;
    }
    
    setSendingVoice(true);
    try {
      const fileExtension = audioBlob.type?.includes('mp4') ? 'mp4' : 'webm';
      const fileName = `${currentUserId}/voice-${Date.now()}.${fileExtension}`;
      console.log('[Voice] Uploading to:', fileName);
      
      const { data: uploadData, error: uploadError } = await supabase.storage
        .from('chat-media')
        .upload(fileName, audioBlob, {
          contentType: audioBlob.type,
          upsert: false
        });
      
      if (uploadError) {
        console.error("Upload error:", uploadError);
        recordClientError({ label: "Chat.fileName", message: uploadError instanceof Error ? uploadError.message : String(uploadError) });
        throw uploadError;
      }
      
      // Send voice message
      if (selectedConversation) {
        const sentMessage = await persistDirectMessage(
          selectedConversation.id,
          currentUserId,
          fileName,
          'audio'
        );

        // 🔔 Push notification for voice message
        const recipientId = selectedConversation.other_user?.id;
        if (recipientId && currentUserId) {
          supabase.functions.invoke('notify-new-message', {
            body: {
              conversationId: selectedConversation.id,
              messageId: sentMessage.id,
              senderId: currentUserId,
              recipientId,
              messageContent: '',
              messageType: 'voice',
            }
          }).catch(() => {});
        }
      } else if (selectedGroup) {
        const { data: newMsg, error } = await supabase
          .from('group_messages')
          .insert({
            group_id: selectedGroup.id,
            sender_id: currentUserId,
            content: fileName,
            message_type: 'audio'
          })
          .select()
          .single();

        if (error) throw error;

        if (newMsg) {
          setGroupMessages(prev => {
            if (prev.find(m => m.id === newMsg.id)) return prev;
            return [...prev, { ...newMsg, sender: null }];
          });
        }
      }
      
      // Clear after successful send
      setAudioBlob(null);
      setRecordingDuration(0);
      console.log('[Voice] Message sent successfully!');
      playSoundDebounced('message');
      toast.success('Voice message sent!');
    } catch (error: any) {
      console.error("[Voice] Upload error:", error);
      recordClientError({ label: "Chat.recipientId", message: error instanceof Error ? error.message : String(error) });
      toast.error(error?.message || 'Failed to send voice message');
    } finally {
      setSendingVoice(false);
    }
  };
  
  // Toggle Voice Recording
  const handleVoiceRecord = () => {
    if (isRecording) {
      stopVoiceRecording();
    } else {
      startVoiceRecording();
    }
  };
  
  // Format recording duration
  const formatRecordingTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };
  
  // Send Gift Handler - INSTANT with optimistic updates
  const handleSendGift = async (gift: GiftData, count: number = 1) => {
    if (!selectedConversation?.other_user?.id || !currentUserId) return;
    
    // CRITICAL: Prevent self-gifting
    if (currentUserId === selectedConversation.other_user.id) {
      toast.error("You cannot send gifts to yourself!");
      return;
    }
    
    const totalCost = gift.coins * count;
    
    // Check coins immediately (use cached value)
    if (userCoins < totalCost) {
      toast.error("Not enough diamonds!");
      return;
    }
    
    // ========== INSTANT UI UPDATE (< 100ms) ==========
    // Close panel immediately
    setShowGiftPanel(false);
    
    // Optimistic coin deduction
    setUserCoins(prev => prev - totalCost);
    
    // Play gift sound IMMEDIATELY
    playSoundDebounced('gift');
    
    // Show gift animation IMMEDIATELY
    const giftEmoji = gift.emoji || '🎁';
    const animationUrl = gift.animation_url?.startsWith('http') ? gift.animation_url : '';
    const iconUrl = gift.icon_url?.startsWith('http') ? gift.icon_url : '';
    const giftMediaUrl = animationUrl || iconUrl;
    const giftSoundUrl = (gift as any).sound_url?.startsWith('http') ? (gift as any).sound_url : '';
    const estimatedBeansEarned = Math.floor(totalCost * getCachedHostGiftPercent() / 100);
    void ensureHostGiftPercentLoaded();
    const soundSuffix = giftSoundUrl ? ` | snd:${giftSoundUrl}` : '';
    const optimisticGiftMessage = giftMediaUrl
      ? `[Gift: ${giftMediaUrl}|${giftEmoji} ${gift.name} x${count} | -${totalCost} diamonds | +${estimatedBeansEarned} beans${soundSuffix}]`
      : `[Gift: ${giftEmoji} ${gift.name} x${count} | -${totalCost} diamonds | +${estimatedBeansEarned} beans${soundSuffix}]`;

    const giftAnimationSignature = getGiftAnimationSignature(optimisticGiftMessage, currentUserId);
    recentGiftAnimationsRef.current.set(giftAnimationSignature, Date.now());

    setAnimatingGiftEmoji(giftMediaUrl || giftEmoji);
    setAnimatingGiftSound(giftSoundUrl || null);
    setGiftAnimationInstance(prev => prev + 1);
    setShowGiftAnimation(true);
    
    // Gift animation is already playing - no toast needed
    
    const optimisticGiftRow: Message = {
      id: `gift_live_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      content: optimisticGiftMessage,
      sender_id: currentUserId,
      created_at: new Date().toISOString(),
      is_read: false,
      message_type: 'gift',
      status: 'sending',
      _optimistic: true,
    };
    // Local optimistic only — receiver gets the real row via persistDirectMessage
    // (postgres_changes + single broadcast). Broadcasting the optimistic temp id here
    // would arrive with a different id and slightly different content (estimated vs
    // actual beans), causing a duplicate bubble on the receiver. Do NOT add it back.
    upsertLiveMessage(optimisticGiftRow);
    directMessageChannelRef.current?.send({
      type: 'broadcast',
      event: 'gift_animation',
      payload: {
        conversationId: selectedConversation.id,
        senderId: currentUserId,
        content: optimisticGiftMessage,
      },
    }).catch(() => {});

    // ========== BACKGROUND PROCESSING ==========
    (async () => {
      try {
        const response = await callGiftService({
          receiverId: selectedConversation.other_user.id,
          giftId: gift.id,
          quantity: count,
        });

        if (!response.success) {
          const realMsg = response.error || "Gift failed";
          console.error('[Chat Gift] Edge function error:', realMsg);
          recordClientError({ label: "Chat.response", message: realMsg });
          // Refund on failure
          setUserCoins(prev => prev + totalCost);
          setMessages(prev => prev.filter(m => m.id !== optimisticGiftRow.id));
          toast.error(`Gift failed: ${realMsg}`);
          return;
        }
        
        // Get beans amount from response for message
        const beansEarned = response.hostReceived || Math.floor(totalCost * 0.6);
        
        // Send gift as message - include animation/icon URL + diamond cost + beans for asymmetric render
        // Format: [Gift: URL|EMOJI NAME xCOUNT | -DIAMONDS diamonds | +BEANS beans]
        const messageContent = giftMediaUrl
          ? `[Gift: ${giftMediaUrl}|${giftEmoji} ${gift.name} x${count} | -${totalCost} diamonds | +${beansEarned} beans${soundSuffix}]`
          : `[Gift: ${giftEmoji} ${gift.name} x${count} | -${totalCost} diamonds | +${beansEarned} beans${soundSuffix}]`;

        setMessages(prev => prev.map(m =>
          m.id === optimisticGiftRow.id ? { ...m, content: messageContent } : m
        ));
        
        await persistDirectMessage(
          selectedConversation.id,
          currentUserId,
          messageContent,
          'gift'
        );
        
        // Sync actual balance
        const { data: updatedProfile } = await supabase
          .from('profiles')
          .select('coins')
          .eq('id', currentUserId)
          .single();
        
        if (updatedProfile) {
          setUserCoins(updatedProfile.coins || 0);
          // CRITICAL: Update global cached balance so Profile "My Diamonds" reflects instantly
          const { updateCachedBalance } = await import("@/hooks/useUserBalance");
          updateCachedBalance(updatedProfile.coins || 0);
        }
      } catch (error) {
        console.error('[Chat Gift] Background error:', error);
        recordClientError({ label: "Chat.messageContent", message: error instanceof Error ? error.message : String(error) });
        // Refund on error
        setUserCoins(prev => prev + totalCost);
        setMessages(prev => prev.filter(m => m.id !== optimisticGiftRow.id));
        toast.error(`Gift failed: ${error instanceof Error ? error.message : String(error)}`);
      }
    })();
  };

  useEffect(() => {
    initializeChat();
    
    // Cleanup recording interval on unmount
    return () => {
      if (recordingIntervalRef.current) {
        clearInterval(recordingIntervalRef.current);
      }
    };
  }, []);

  useEffect(() => {
    const userId = searchParams.get('user');
    if (userId && currentUserId && !selectedConversation) {
      openOrCreateConversation(userId);
      // Auto-fill message if provided (e.g., from Recharge helper)
      const autoMsg = searchParams.get('autoMessage');
      if (autoMsg) {
        setMessage(decodeURIComponent(autoMsg));
      }
    }
  }, [searchParams, currentUserId]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, groupMessages, isOtherTyping]);

  // Subscribe to real-time messages via DEDICATED direct channel
  // (bypasses universal system to avoid gaps during channel rebuild loops)
  useEffect(() => {
    if (!selectedConversation || !currentUserId) return;

    const channelName = `dm-live-${selectedConversation.id}`;
    const channel = supabase
      .channel(channelName)
      .on(
        'broadcast',
        { event: 'message' },
        (payload: any) => {
          if (payload.payload?.conversationId !== selectedConversation.id || !payload.payload?.message) return;
          upsertLiveMessage(payload.payload.message);
        }
      )
      .on(
        'broadcast',
        { event: 'gift_animation' },
        (payload: any) => {
          if (payload.payload?.conversationId !== selectedConversation.id || !payload.payload?.content) return;
          if (payload.payload?.senderId === currentUserId) return;
          playGiftAnimationFromContent(payload.payload.content, payload.payload.senderId, true);
        }
      )
      // Pkg92: removed dead postgres_changes on `messages` (NOT in supabase_realtime
      // publication — silently no-op). Live delivery flows via the broadcast 'message'
      // event above; status updates use the receipts broadcast channel.
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          directMessageChannelRef.current = channel;
          console.log(`[Chat] ✅ Direct message channel active for ${selectedConversation.id}`);
        }
      });

    return () => {
      if (directMessageChannelRef.current === channel) {
        directMessageChannelRef.current = null;
      }
      supabase.removeChannel(channel);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedConversation, currentUserId, upsertLiveMessage]);

  // 📩 Read/Delivered receipt listener via Supabase broadcast
  useEffect(() => {
    if (!selectedConversation?.id || !currentUserId) return;
    
    // Pkg94: single shared receipt channel per conversation (reused by sender
    // for `read`/`delivered` .send() calls below — previously each send opened
    // a fresh leaked channel, which is exactly the Realtime-cost regression
    // pattern the $1400-rule forbids).
    const receiptChannel = supabase.channel(`receipts-${selectedConversation.id}`);
    receiptChannelRef.current = receiptChannel;

    receiptChannel
      .on('broadcast', { event: 'delivered' }, (payload: any) => {
        if (payload.payload?.userId !== currentUserId) {
          setMessages(prev => prev.map(m =>
            m.sender_id === currentUserId && (m.status === 'sent' || m.status === 'sending')
              ? { ...m, status: 'delivered' as const }
              : m
          ));
        }
      })
      .on('broadcast', { event: 'read' }, (payload: any) => {
        if (payload.payload?.userId !== currentUserId) {
          setMessages(prev => prev.map(m =>
            m.sender_id === currentUserId && m.status !== 'read'
              ? { ...m, status: 'read' as const, is_read: true }
              : m
          ));
        }
      })
      .subscribe();

    return () => {
      if (receiptChannelRef.current === receiptChannel) {
        receiptChannelRef.current = null;
      }
      supabase.removeChannel(receiptChannel);
    };
  }, [selectedConversation?.id, currentUserId]);

  // Typing indicator via Supabase broadcast
  useEffect(() => {
    if (!selectedConversation?.id || !currentUserId) return;
    
    const channel = supabase.channel(`typing-${selectedConversation.id}`);
    
    channel.on('broadcast', { event: 'typing' }, (payload: any) => {
      if (payload.payload?.userId !== currentUserId) {
        setIsOtherTyping(true);
        if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
        typingTimeoutRef.current = setTimeout(() => setIsOtherTyping(false), 3000);
      }
    }).subscribe();
    
    typingChannelRef.current = channel;
    
    return () => {
      setIsOtherTyping(false);
      supabase.removeChannel(channel);
      typingChannelRef.current = null;
    };
  }, [selectedConversation?.id, currentUserId]);

  // Broadcast typing event
  const broadcastTyping = useCallback(() => {
    if (typingChannelRef.current && currentUserId) {
      typingChannelRef.current.send({
        type: 'broadcast',
        event: 'typing',
        payload: { userId: currentUserId },
      });
    }
  }, [currentUserId]);

  // Group messages are loaded once per selected group. Zero-refresh policy: no
  // background polling loop; new outgoing messages update local state directly.
  useEffect(() => {
    if (!selectedGroup) return;

    let cancelled = false;
    const loadGroupMessages = async () => {
      const { data } = await supabase
        .from('group_messages')
        .select('*')
        .eq('group_id', selectedGroup.id)
        .order('created_at', { ascending: true })
        .limit(100);

      if (cancelled) return;

      if (data && data.length > 0) {
        // Sender profile JOIN through `profiles` FK is blocked by RLS for
        // non-owner reads — fetch sender info separately via profiles_public.
        const senderIds = [...new Set(data.map((m: any) => m.sender_id))];
        const { data: senders } = await supabase
          .from('profiles_public')
          .select('id, display_name, avatar_url, user_level, host_level, max_user_level, gender, is_host')
          .in('id', senderIds);
        const sMap = new Map((senders || []).map((s: any) => [s.id, s]));
        setGroupMessages(
          data.map((m: any) => ({ ...m, sender: sMap.get(m.sender_id) || null }))
        );
      } else {
        setGroupMessages(data || []);
      }
    };

    void loadGroupMessages();

    return () => { cancelled = true; };
  }, [selectedGroup, currentUserId]);

  // Fetch host's received gifts count and subscribe to real-time updates
  useEffect(() => {
    if (!selectedConversation?.other_user?.id) return;
    
    const hostId = selectedConversation.other_user.id;
    
    const fetchHostGifts = async () => {
      const { data, error } = await supabase
        .from('gift_transactions')
        .select('coin_amount')
        .eq('receiver_id', hostId);
      
      if (!error && data) {
        setHostReceivedGifts(data.length);
        setHostTotalDiamonds(data.reduce((sum, t) => sum + (t.coin_amount || 0), 0));
      }
    };
    
    fetchHostGifts();
    
    // Subscribe to gift transactions via universal system
    const unsubscribe = subscribeToTables(
      `host-gifts-${hostId}`,
      ['gift_transactions'],
      (table: string, event: string, payload: any) => {
        if (payload?.receiver_id === hostId) {
          setHostReceivedGifts(prev => prev + 1);
          setHostTotalDiamonds(prev => prev + (payload.coin_amount || 0));
        }
      }
    );

    return () => {
      unsubscribe();
    };
  }, [selectedConversation?.other_user?.id]);

  // Pkg92: conversation list refresh.
  // The legacy `conv-refresh-${currentUserId}-${Date.now()}` channel subscribed to
  // postgres_changes on `messages` + `conversations` — neither table is in the
  // supabase_realtime publication, so it was a silent no-op AND an unfiltered
  // global `messages` INSERT bind (exact $1400-pattern if the publication ever
  // included it). Replaced with:
  //   1. window 'chat:new-message' event (dispatched by useNotifications on
  //      `notifications.type='message'` inserts — single existing subscription).
  //   2. visibilitychange refetch (tab refocus).
  useEffect(() => {
    if (!currentUserId) return;

    let refreshTimer: NodeJS.Timeout | null = null;
    const debouncedRefresh = () => {
      if (refreshTimer) clearTimeout(refreshTimer);
      refreshTimer = setTimeout(() => fetchConversations(), 250);
    };

    const onNewMessage = () => debouncedRefresh();
    const onVisibility = () => {
      if (document.visibilityState === 'visible') debouncedRefresh();
    };

    window.addEventListener('chat:new-message', onNewMessage);
    document.addEventListener('visibilitychange', onVisibility);

    return () => {
      if (refreshTimer) clearTimeout(refreshTimer);
      window.removeEventListener('chat:new-message', onNewMessage);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [currentUserId]);

  const initializeChat = async () => {
    try {
      const { getCachedUser } = await import('@/utils/cachedAuth');
      const cachedUser = await getCachedUser();
      const user = cachedUser ? { id: cachedUser.id, email: cachedUser.email } : null;
      if (!user) {
        navigate('/auth');
        return;
      }
      setCurrentUserId(user.id);
      
      // Parallel fetch - coins + conversations + groups at once
      const [profileResult] = await Promise.all([
        supabase.from('profiles').select('coins, display_name, avatar_url, user_level, host_level, max_user_level, gender, is_host').eq('id', user.id).single(),
        fetchConversations(user.id),
        fetchGroups()
      ]);
      
      if (profileResult.data) {
        setUserCoins(profileResult.data.coins || 0);
        setMyProfile({
          display_name: profileResult.data.display_name,
          avatar_url: profileResult.data.avatar_url,
          user_level: profileResult.data.user_level || 1,
          host_level: (profileResult.data as any).host_level || 0,
          max_user_level: (profileResult.data as any).max_user_level || 0,
          gender: (profileResult.data as any).gender || null,
          is_host: profileResult.data.is_host === true,
        });
      }
    } catch (error) {
      console.error('[Chat] Error initializing:', error);
      recordClientError({ label: "Chat.user", message: error instanceof Error ? error.message : String(error) });
    } finally {
      setLoading(false);
    }
  };

  const fetchConversations = async (overrideUserId?: string) => {
    const userId = overrideUserId || currentUserId;
    if (!userId) return;

    try {
      // Use optimized RPC function - single query instead of N+1
      const { data: conversations, error } = await supabase
        .rpc('get_conversations_with_details', { p_user_id: userId });

      if (error) {
        console.error('[Chat] Error fetching conversations:', error);
        recordClientError({ label: "Chat.userId", message: error instanceof Error ? error.message : String(error) });
        // Fallback to basic query if RPC fails
        const { data: convs } = await supabase
          .from('conversations')
          .select('*')
          .or(`participant1_id.eq.${userId},participant2_id.eq.${userId}`)
          .order('last_message_at', { ascending: false, nullsFirst: false });
        
        setConversations((convs || []).map(c => ({
          ...c,
          other_user: null,
          last_message: '',
          unread_count: 0
        })));
        return;
      }

      // Transform the RPC result - already formatted correctly
      // Cast to unknown first then to array to handle Supabase's generic JSON return type
      const conversationsArray = Array.isArray(conversations) ? conversations : [];
      const formattedConversations: Conversation[] = conversationsArray.map((conv: {
        id: string;
        participant1_id: string;
        participant2_id: string;
        last_message_at: string | null;
        other_user: Conversation['other_user'];
        last_message: string | null;
        unread_count: number;
      }) => ({
        id: conv.id,
        participant1_id: conv.participant1_id,
        participant2_id: conv.participant2_id,
        last_message_at: conv.last_message_at,
        other_user: conv.other_user,
        last_message: cleanGiftMessageForPreview(conv.last_message || ''),
        unread_count: conv.unread_count || 0
      }));

      setConversations(formattedConversations);
    } catch (err) {
      console.error('[Chat] Error:', err);
      recordClientError({ label: "Chat.formattedConversations", message: err instanceof Error ? err.message : String(err) });
    }
  };

  const fetchGroups = async () => {
    const userId = currentUserId;
    if (!userId) return;

    const { data: memberOf, error } = await supabase
      .from('group_members')
      .select('group_id, role')
      .eq('user_id', userId);

    if (error || !memberOf || memberOf.length === 0) {
      setGroups([]);
      return;
    }

    const groupIds = memberOf.map(m => m.group_id);
    const roleMap = new Map(memberOf.map(m => [m.group_id, m.role]));

    const { data: groupsData } = await supabase
      .from('groups')
      .select('*')
      .in('id', groupIds)
      .eq('is_active', true);

    const groupsWithRole: Group[] = (groupsData || []).map(g => ({
      ...g,
      is_owner: roleMap.get(g.id) === 'owner' || g.owner_id === userId
    }));

    setGroups(groupsWithRole);
  };

  const openOrCreateConversation = async (otherUserId: string) => {
    if (!currentUserId) return;

    const { data: existing } = await supabase
      .from('conversations')
      .select('*')
      .or(`and(participant1_id.eq.${currentUserId},participant2_id.eq.${otherUserId}),and(participant1_id.eq.${otherUserId},participant2_id.eq.${currentUserId})`)
      .maybeSingle();

    if (existing) {
      const { data: profile } = await supabase
        .from('profiles_public')
        .select('id, display_name, avatar_url, is_online, is_verified, is_host, gender, call_rate_per_minute, user_level, host_level, max_user_level, country_flag, country_name, city, last_seen_at')
        .eq('id', otherUserId)
        .maybeSingle();

      setSelectedConversation({
        ...existing,
        other_user: profile,
        last_message: '',
        unread_count: 0
      });
      fetchMessages(existing.id);
    } else {
      const { data: newConv, error } = await supabase
        .from('conversations')
        .insert({
          participant1_id: currentUserId,
          participant2_id: otherUserId
        })
        .select()
        .single();

      if (error) {
        toast.error("Failed to start conversation");
        return;
      }

      const { data: profile } = await supabase
        .from('profiles_public')
        .select('id, display_name, avatar_url, is_online, is_verified, is_host, gender, call_rate_per_minute, user_level, host_level, max_user_level, country_flag, country_name, city, last_seen_at')
        .eq('id', otherUserId)
        .maybeSingle();

      setSelectedConversation({
        ...newConv,
        other_user: profile,
        last_message: '',
        unread_count: 0
      });
      setMessages([]);
    }
  };

  const castMessage = (m: any): Message => ({
    ...m,
    status: (m.status as Message['status']) || (m.is_read ? 'read' : 'sent'),
  });

  async function broadcastDirectMessage(messageRow: any, conversationId: string) {
    if (!directMessageChannelRef.current) return;

    try {
      await directMessageChannelRef.current.send({
        type: 'broadcast',
        event: 'message',
        payload: {
          conversationId,
          message: messageRow,
        },
      });
    } catch (error) {
      console.warn('[Chat] Broadcast fallback failed:', error);
    }
  }

  function playGiftAnimationFromContent(content: string, senderId?: string | null, playSoundEffect = false) {
    const signature = getGiftAnimationSignature(content, senderId);
    const now = Date.now();
    const lastPlayed = recentGiftAnimationsRef.current.get(signature) || 0;
    if (now - lastPlayed < 4000) return;

    recentGiftAnimationsRef.current.set(signature, now);
    if (playSoundEffect) playSoundDebounced('gift');

    const { mediaUrl, emoji, soundUrl } = parseGiftContent(content || '');
    setAnimatingGiftEmoji(mediaUrl || emoji);
    setAnimatingGiftSound(soundUrl);
    setGiftAnimationInstance(prev => prev + 1);
    setShowGiftAnimation(true);
  }

  function upsertLiveMessage(messageRow: any) {
    const newMessage = castMessage(messageRow);

    setMessages(prev => {
      const baseMessages = prev.filter(
        m =>
          !m._optimistic ||
          m.sender_id !== newMessage.sender_id ||
          m.content !== newMessage.content ||
          m.message_type !== newMessage.message_type
      );

      if (baseMessages.find(m => m.id === newMessage.id)) return baseMessages;

      return [
        ...baseMessages,
        newMessage.sender_id === currentUserId
          ? { ...newMessage, status: (newMessage.status || 'sent') as Message['status'] }
          : newMessage,
      ];
    });

    if (newMessage.sender_id === currentUserId) return;

    void markMessageAsRead(newMessage.id);

    if (selectedConversation?.id && receiptChannelRef.current) {
      // Pkg94: reuse subscribed channel — never open ad-hoc channels per send
      receiptChannelRef.current.send({
        type: 'broadcast',
        event: 'read',
        payload: { userId: currentUserId, conversationId: selectedConversation.id }
      });
    }

    if (newMessage.message_type === 'gift') {
      playGiftAnimationFromContent(newMessage.content || '', newMessage.sender_id, true);
    } else {
      playSoundDebounced('message');
    }
  }

  async function persistDirectMessage(
    conversationId: string,
    senderId: string,
    content: string,
    messageType: string,
    replyToId?: string | null
  ) {
    const insertData: any = {
      conversation_id: conversationId,
      sender_id: senderId,
      content,
      message_type: messageType,
    };
    if (replyToId) insertData.reply_to_id = replyToId;

    const { data: newMsg, error } = await supabase
      .from('messages')
      .insert(insertData)
      .select()
      .single();

    if (error) throw error;

    await supabase
      .from('conversations')
      .update({ last_message_at: new Date().toISOString() })
      .eq('id', conversationId);

    if (newMsg) {
      upsertLiveMessage(newMsg);
      void broadcastDirectMessage(newMsg, conversationId);
    }

    return newMsg;
  }

  // Pkg212 — offline DM outbox: drain queued messages on reconnect/resume/tick.
  useMessageOutboxDrain(!!currentUserId, currentUserId, async (item: OutboxItem) => {
    await persistDirectMessage(item.conversationId, item.senderId, item.content, item.messageType);
    // Replace the queued optimistic bubble with a "sent" one — realtime
    // upsertLiveMessage will replace it with the canonical row shortly.
    setMessages(prev => prev.map(m =>
      m.id === item.id ? { ...m, status: 'sent' as any } : m
    ));
  });


  const fetchMessages = async (conversationId: string) => {
    const { data, error } = await supabase
      .from('messages')
      .select('*')
      .eq('conversation_id', conversationId)
      .order('created_at', { ascending: true });

    if (error) return;
    const serverMsgs = (data || []).map(castMessage);
    // Pkg212 — re-attach any persistent queued messages for this conversation
    // (e.g. after app cold-start while still offline) at the end of the thread.
    const queued = currentUserId
      ? messageOutbox.listFor(conversationId, currentUserId).map(q => ({
          id: q.id,
          content: q.content,
          sender_id: q.senderId,
          created_at: new Date(q.createdAt).toISOString(),
          is_read: false,
          message_type: q.messageType,
          status: 'queued',
          _optimistic: true,
        }) as any)
      : [];
    setMessages([...serverMsgs, ...queued]);

    // Fetch reply-to messages for quote rendering
    const replyIds = [...new Set((data || []).map(m => m.reply_to_id).filter(Boolean))];
    if (replyIds.length > 0) {
      const { data: replies } = await supabase
        .from('messages')
        .select('id, content, sender_id')
        .in('id', replyIds);
      const map = Object.fromEntries((replies || []).map(r => [r.id, { content: r.content, sender_id: r.sender_id }]));
      setReplyMessages(prev => ({ ...prev, ...map }));
    }

    // Mark as delivered via RPC
    if (currentUserId) {
      supabase.rpc('mark_messages_delivered', {
        p_conversation_id: conversationId,
        p_recipient_id: currentUserId
      }).then(({ data: count }) => {
        if (count && count > 0 && receiptChannelRef.current) {
          // Pkg94: reuse the subscribed receipts channel (no per-call leaks)
          receiptChannelRef.current.send({
            type: 'broadcast',
            event: 'delivered',
            payload: { userId: currentUserId, conversationId }
          });
        }
      });
    }

    if (data && currentUserId) {
      const unreadIds = data
        .filter(m => !m.is_read && m.sender_id !== currentUserId)
        .map(m => m.id);

      if (unreadIds.length > 0) {
        await supabase
          .from('messages')
          .update({ is_read: true })
          .in('id', unreadIds);

        emitGlobalUnreadRefresh({ messagesDecrement: unreadIds.length });

        // Refresh conversations list to update unread count
        fetchConversations();
      }
    }
  };

  const fetchGroupMessages = async (groupId: string) => {
    const { data, error } = await supabase
      .from('group_messages')
      .select('*')
      .eq('group_id', groupId)
      .order('created_at', { ascending: true });

    if (error) return;

    // Fetch sender profiles
    const senderIds = [...new Set(data?.map(m => m.sender_id) || [])];
    const { data: profiles } = await supabase
      .from('profiles_public')
      .select('id, display_name, avatar_url, user_level, host_level, max_user_level, gender, is_host')
      .in('id', senderIds);

    const profilesMap = new Map(profiles?.map(p => [p.id, p]) || []);

    const messagesWithSenders: GroupMessage[] = (data || []).map(m => ({
      ...m,
      sender: profilesMap.get(m.sender_id) || null
    }));

    setGroupMessages(messagesWithSenders);
  };

  const markMessageAsRead = async (messageId: string) => {
    await supabase
      .from('messages')
      .update({ is_read: true })
      .eq('id', messageId);

    emitGlobalUnreadRefresh({ messagesDecrement: 1 });
    
    // Refresh conversations list to update unread count
    fetchConversations();
  };

  const handleSelectConversation = async (conv: Conversation) => {
    setSelectedConversation(conv);
    setSelectedGroup(null);
    setOtherUserTrader({ isTrader: false, traderLevel: 0 });
    await fetchMessages(conv.id);
    
    // Check if other user is a trader
    if (conv.other_user?.id) {
      supabase.from('topup_helpers').select('trader_level').eq('user_id', conv.other_user.id).eq('is_active', true).eq('is_verified', true).maybeSingle()
        .then(({ data }) => {
          if (data) setOtherUserTrader({ isTrader: true, traderLevel: data.trader_level || 1 });
        });
    }
    
    // Update the conversation's unread count locally
    setConversations(prev => 
      prev.map(c => c.id === conv.id ? { ...c, unread_count: 0 } : c)
    );
  };

  const handleSelectGroup = (group: Group) => {
    setSelectedGroup(group);
    setSelectedConversation(null);
    fetchGroupMessages(group.id);
  };

  // Check if the other user in conversation is a helper/payroll helper
  const isHelperConversation = async (): Promise<boolean> => {
    if (!selectedConversation?.other_user?.id || !currentUserId) return false;
    const otherUserId = selectedConversation.other_user.id;
    
    // Check if either participant is a helper/payroll helper
    const { data } = await supabase
      .from('topup_helpers')
      .select('id, payroll_enabled')
      .in('user_id', [otherUserId, currentUserId])
      .eq('is_active', true)
      .eq('is_verified', true);
    
    return (data && data.length > 0) || false;
  };

  // Phone detection function
  const checkPhoneNumber = async (text: string, conversationId?: string, groupId?: string): Promise<boolean> => {
    if (!currentUserId) return false;
    
    try {
      const { data, error } = await supabase.functions.invoke('detect-phone-number', {
        body: {
          message: text,
          userId: currentUserId,
          conversationId,
          groupId
        }
      });

      if (error) {
        console.error('Phone detection error:', error);
        recordClientError({ label: "Chat.checkPhoneNumber", message: error instanceof Error ? error.message : String(error) });
        return false;
      }

      if (data?.detected) {
        if (data.isBanned) {
          toast.error("Your account has been blocked", {
            description: "Violation of phone number sharing policy"
          });
          navigate('/auth');
          return true;
        }
        
        // Show different message for hosts with auto-deduction
        if (data.autoDeducted) {
          toast.error(`🚨 ${data.deductedAmount} Beans deducted!`, {
            description: `Auto deduction for sharing phone number. Current balance: ${data.newBalance?.toLocaleString() || 0} Beans`
          });
        } else {
          toast.warning(`Warning (${data.violationCount}/3)`, {
            description: "Sharing phone numbers is prohibited. Repeated violations may result in account ban."
          });
        }
        return true;
      }
      
      return false;
    } catch (err) {
      console.error('Phone detection failed:', err);
      recordClientError({ label: "Chat.checkPhoneNumber", message: err instanceof Error ? err.message : String(err) });
      return false;
    }
  };

  // 🔥 AWS Comprehend toxic content moderation (shared hook)
  const { checkToxicContent: checkToxic } = useContentModeration(currentUserId);

  const handleSend = async () => {
    if (!message.trim() || sending) return;

    setSending(true);
    const originalContent = message.trim();
    setMessage("");
    
    // 🚀 OPTIMISTIC UI: Show message instantly with 'sending' status
    const optimisticId = `optimistic-${Date.now()}`;
    if (selectedConversation && currentUserId) {
      const optimisticMsg: Message = {
        id: optimisticId,
        content: originalContent,
        sender_id: currentUserId,
        created_at: new Date().toISOString(),
        is_read: false,
        message_type: 'text',
        status: 'sending',
        reply_to_id: replyingTo?.messageId || null,
        _optimistic: true,
      };
      setMessages(prev => [...prev, optimisticMsg]);
    }
    
    // No local send sound here (avoid duplicate beeps on send + realtime events)
    
    // 🔍 BLOCKING: Run contact detection BEFORE sending — HOSTS ONLY.
    // Agencies, users, and L1–L5 helpers can share numbers freely (no mask, no beans, no warning).
    let contentToSend = originalContent;
    if (myProfile?.is_host === true) {
      const { detectContactInfo, maskContactContent } = await import('@/utils/contactDetection');
      const detection = detectContactInfo(originalContent);
      if (detection.hasViolation) {
        // Mask the content - recipient will see *** instead of contact info
        contentToSend = maskContactContent(originalContent, detection);
        console.log('[ContactDetection] BLOCKED content (host), masked:', contentToSend);
        
        // Process violation (warning + bean deduction) in background
        const sourceId = selectedConversation?.id || selectedGroup?.id;
        detectAndProcessViolation(currentUserId!, originalContent, 'private_message', sourceId)
          .then(res => {
            console.log('[ContactDetection] Chat result:', res);
            if (res.detected && res.violationNumber) {
              numberWarning.showWarning(res.violationNumber, res.beansDeducted || 0, res.isBanned || false);
            } else if (res.detected) {
              numberWarning.showGenericWarning();
            }
          })
          .catch(err => console.error('[ContactDetection] Chat error:', err));
      }
    }

    try {
      if (selectedConversation) {
        const sentMessage = await persistDirectMessage(
          selectedConversation.id,
          currentUserId,
          contentToSend,
          'text',
          replyingTo?.messageId
        );
        
        // Clear reply after successful send
        setReplyingTo(null);
        
        // Track message sent for task progress
        trackTaskProgress('messages_sent', { increment: 1 });

        // 🔔 Push notification to recipient (non-blocking background)
        const recipientId = selectedConversation.other_user?.id;
        if (recipientId && currentUserId) {
          supabase.functions.invoke('notify-new-message', {
            body: {
              conversationId: selectedConversation.id,
              messageId: sentMessage.id,
              senderId: currentUserId,
              recipientId,
              messageContent: contentToSend,
              messageType: 'text',
            }
          }).catch(err => console.log('[Push] Message notification background:', err));
        }

        // 🔍 Phone number check in BACKGROUND (non-blocking)
        // Skip detection for helper/payroll helper conversations
        isHelperConversation().then(isHelper => {
          if (!isHelper) {
            checkPhoneNumber(originalContent, selectedConversation.id, undefined).catch(() => {});
          }
        }).catch(() => {});
        checkToxic(originalContent, { contextType: 'chat', conversationId: selectedConversation.id }).catch(() => {});
        // AI Auto-Reply in background
        const otherUser = selectedConversation.other_user;
        if (otherUser && (otherUser.gender === 'female' || otherUser.gender === 'Female')) {
          supabase.functions.invoke('ai-chat-reply', {
            body: {
              conversationId: selectedConversation.id,
              userMessage: contentToSend,
              hostId: otherUser.id,
              senderId: currentUserId
            }
          }).catch(err => console.log('AI reply background:', err));
        }
      } else if (selectedGroup) {
        await supabase
          .from('group_messages')
          .insert({
            group_id: selectedGroup.id,
            sender_id: currentUserId,
            content: contentToSend,
            message_type: 'text'
          });
          
        // Track + background phone check
        trackTaskProgress('messages_sent', { increment: 1 });
        checkPhoneNumber(originalContent, undefined, selectedGroup.id).catch(() => {});
        checkToxic(originalContent, { contextType: 'chat', groupId: selectedGroup.id }).catch(() => {});
      }
    } catch (error: any) {
      // Pkg212 — instead of dropping the message, enqueue it to the
      // persistent outbox. The drain hook below auto-retries on
      // reconnect / app resume / 30 s tick.
      if (selectedConversation && currentUserId) {
        try {
          messageOutbox.enqueue({
            id: optimisticId,
            conversationId: selectedConversation.id,
            senderId: currentUserId,
            content: contentToSend,
            messageType: 'text',
          });
          // Mark the optimistic message as queued (waiting to send)
          setMessages(prev => prev.map(m =>
            m.id === optimisticId ? { ...m, status: 'queued' as any } : m
          ));
          toast.message("You're offline — message will send when reconnected");
        } catch {
          toast.error("Failed to send message");
          setMessage(originalContent);
          setMessages(prev => prev.filter(m => m.id !== optimisticId));
        }
      } else {
        toast.error("Failed to send message");
        setMessage(originalContent);
        setMessages(prev => prev.filter(m => m.id !== optimisticId));
      }
    } finally {
      setSending(false);
    }
  };

  const handleCreateGroup = async () => {
    if (!newGroupName.trim() || !currentUserId) return;

    setCreatingGroup(true);
    try {
      // Family group limit: user can only be in 1 family group
      if (newGroupType === 'family') {
        const { data: existingFamily } = await supabase
          .from('group_members')
          .select('group_id, groups!inner(group_type)')
          .eq('user_id', currentUserId);
        
        const familyCount = existingFamily?.filter((m: any) => m.groups?.group_type === 'family').length || 0;
        if (familyCount >= 1) {
          toast.error("You can only be in 1 family group");
          setCreatingGroup(false);
          return;
        }
      }

      // Basic group limit: max 20
      if (newGroupType === 'basic') {
        const { data: existingBasic } = await supabase
          .from('group_members')
          .select('group_id, groups!inner(group_type)')
          .eq('user_id', currentUserId);
        
        const basicCount = existingBasic?.filter((m: any) => m.groups?.group_type === 'basic').length || 0;
        if (basicCount >= 20) {
          toast.error("You can join max 20 general groups");
          setCreatingGroup(false);
          return;
        }
      }

      // Create group
      const { data: newGroup, error } = await supabase
        .from('groups')
        .insert({
          name: newGroupName.trim(),
          group_type: newGroupType,
          owner_id: currentUserId
        })
        .select()
        .single();

      if (error) throw error;

      // Upload group photo if selected
      if (newGroupPhoto) {
        const ext = newGroupPhoto.name.split('.').pop();
        const path = `group-avatars/${newGroup.id}.${ext}`;
        await supabase.storage.from('assets').upload(path, newGroupPhoto, { upsert: true });
        const { data: urlData } = supabase.storage.from('assets').getPublicUrl(path);
        await supabase.from('groups').update({ avatar_url: urlData.publicUrl }).eq('id', newGroup.id);
      }

      // Add creator as member with owner role
      await supabase
        .from('group_members')
        .insert({
          group_id: newGroup.id,
          user_id: currentUserId,
          role: 'owner'
        });

      toast.success("Group created successfully!");
      setShowCreateGroup(false);
      setNewGroupName("");
      setNewGroupType("basic");
      setNewGroupPhoto(null);
      setNewGroupPhotoPreview(null);
      fetchGroups();
    } catch (error) {
      console.error('Create group error:', error);
      recordClientError({ label: "Chat.path", message: error instanceof Error ? error.message : String(error) });
      toast.error("Failed to create group");
    } finally {
      setCreatingGroup(false);
    }
  };

  const handleSearchGroup = async () => {
    if (!groupSearchQuery.trim()) return;

    const { data, error } = await supabase
      .rpc('search_group_by_code', { _group_code: groupSearchQuery.trim() });

    if (error) {
      toast.error("Search failed");
      return;
    }

    setGroupSearchResults(data || []);
  };

  const handleJoinGroup = async (groupId: string) => {
    if (!currentUserId) return;

    try {
      // Check if already a member
      const { data: existing } = await supabase
        .from('group_members')
        .select('id')
        .eq('group_id', groupId)
        .eq('user_id', currentUserId)
        .maybeSingle();

      if (existing) {
        toast.info("You're already a member of this group");
        return;
      }

      // Get the group type to enforce limits
      const { data: groupData } = await supabase
        .from('groups')
        .select('group_type')
        .eq('id', groupId)
        .single();

      if (groupData) {
        // Get current memberships
        const { data: myMemberships } = await supabase
          .from('group_members')
          .select('group_id, groups!inner(group_type)')
          .eq('user_id', currentUserId);

        if (groupData.group_type === 'family') {
          const familyCount = myMemberships?.filter((m: any) => m.groups?.group_type === 'family').length || 0;
          if (familyCount >= 1) {
            toast.error("You can only be in 1 family group. Leave your current family group first.");
            return;
          }
        } else {
          const basicCount = myMemberships?.filter((m: any) => m.groups?.group_type === 'basic').length || 0;
          if (basicCount >= 20) {
            toast.error("You can join max 20 general groups");
            return;
          }
        }
      }

      await supabase
        .from('group_members')
        .insert({
          group_id: groupId,
          user_id: currentUserId,
          role: 'member'
        });

      // Update member count
      const { count } = await supabase
        .from('group_members')
        .select('id', { count: 'exact', head: true })
        .eq('group_id', groupId);
      
      await supabase.from('groups').update({ member_count: count || 1 }).eq('id', groupId);

      toast.success("Joined group successfully!");
      setShowSearchGroup(false);
      setGroupSearchQuery("");
      setGroupSearchResults([]);
      fetchGroups();
    } catch (error) {
      toast.error("Failed to join group");
    }
  };

  const formatTime = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffDays = Math.floor((now.getTime() - date.getTime()) / (1000 * 60 * 60 * 24));

    if (diffDays === 0) {
      return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    } else if (diffDays === 1) {
      return 'Yesterday';
    } else if (diffDays < 7) {
      return date.toLocaleDateString([], { weekday: 'short' });
    } else {
      return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
    }
  };

  // WhatsApp-style day separator label: Today / Yesterday / Day name / Full date
  const formatDayLabel = (dateString: string) => {
    const d = new Date(dateString);
    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    const startOfMsg = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
    const diffDays = Math.round((startOfToday - startOfMsg) / (1000 * 60 * 60 * 24));
    if (diffDays <= 0) return 'Today';
    if (diffDays === 1) return 'Yesterday';
    if (diffDays < 7) return d.toLocaleDateString([], { weekday: 'long' });
    return d.toLocaleDateString([], { day: 'numeric', month: 'short', year: now.getFullYear() === d.getFullYear() ? undefined : 'numeric' });
  };
  const sameDay = (a: string, b: string) => {
    const da = new Date(a), db = new Date(b);
    return da.getFullYear() === db.getFullYear() && da.getMonth() === db.getMonth() && da.getDate() === db.getDate();
  };

  const filteredConversations = conversations.filter(conv =>
    conv.other_user?.display_name?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const filteredGroups = groups.filter(group =>
    group.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  // Format last seen time
  const formatLastSeen = (lastSeenAt: string | null, isOnline: boolean | null) => {
    if (isOnline) return "Online";
    if (!lastSeenAt) return "Offline";
    
    const date = new Date(lastSeenAt);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / (1000 * 60));
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
    
    if (diffMins < 1) return "Just now";
    if (diffMins < 60) return `${diffMins} min ago`;
    if (diffHours < 24) return `${diffHours} hour${diffHours > 1 ? 's' : ''} ago`;
    if (diffDays < 7) return `${diffDays} day${diffDays > 1 ? 's' : ''} ago`;
    return date.toLocaleDateString();
  };

  // Chat view for conversations or groups
  if (selectedConversation || selectedGroup) {
    const isGroup = !!selectedGroup;
    const chatName = isGroup ? selectedGroup?.name : selectedConversation?.other_user?.display_name || 'User';
    const chatAvatar = isGroup ? selectedGroup?.avatar_url : selectedConversation?.other_user?.avatar_url;
    const currentMessages = isGroup ? groupMessages : messages;
    const userLevel = pickDisplayLevel(selectedConversation?.other_user as any);
    const countryFlag = selectedConversation?.other_user?.country_flag || "🌍";

    return (
      <div className="fixed inset-0 flex flex-col overflow-hidden profile-home-shell">
        {/* Chat Header - z-index MUST be lower than GiftPanel backdrop (9998) */}
        <header className="flex-shrink-0 safe-area-top profile-home-card" style={{ zIndex: 10, position: 'relative', borderRadius: 0, borderLeft: 'none', borderRight: 'none', borderTop: 'none' }}>
          <div className="flex items-center gap-3 px-3 py-2.5 h-14">
            {/* Back Button */}
            <button
              type="button"
              className="flex items-center justify-center w-9 h-9 rounded-full profile-home-icon-button active:scale-95 transition-all duration-150 shrink-0"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                setSelectedConversation(null);
                setSelectedGroup(null);
                setMessages([]);
                setGroupMessages([]);
                fetchConversations();
                fetchGroups();
              }}
            >
              <ArrowLeft className="w-5 h-5 text-foreground" />
            </button>
            
            {/* User Avatar with Premium Frame */}
            {!isGroup && selectedConversation?.other_user?.id ? (
              <div 
                className="shrink-0 cursor-pointer"
                onClick={() => {
                  const userId = selectedConversation?.other_user?.id;
                  if (userId) navigate(`/profile-detail/${userId}`);
                }}
              >
                <AvatarWithFrame
                  userId={selectedConversation.other_user.id}
                  src={chatAvatar}
                  name={chatName}
                  level={userLevel}
                  size="sm"
                  showAnimation={true}
                  showGlow={true}
                  isOnline={selectedConversation?.other_user?.is_online || false}
                />
              </div>
            ) : (
              <div 
                className="cursor-pointer shrink-0"
                onClick={() => {
                  const userId = isGroup ? selectedGroup?.owner_id : selectedConversation?.other_user?.id;
                  if (userId) navigate(`/profile-detail/${userId}`);
                }}
              >
                <AvatarWithFrame
                  userId={isGroup ? selectedGroup?.owner_id : undefined}
                  src={chatAvatar || undefined}
                  name={chatName || "U"}
                  level={1}
                  size="sm"
                  showFrame={!isGroup}
                />
              </div>
            )}
            
            {/* User Info - Center */}
            <div 
              className="flex-1 min-w-0 cursor-pointer"
              onClick={() => {
                const userId = isGroup ? selectedGroup?.owner_id : selectedConversation?.other_user?.id;
                if (userId) navigate(`/profile-detail/${userId}`);
              }}
            >
              <div className="flex items-center gap-1.5">
                <h2 className="font-semibold text-foreground text-[15px] leading-tight truncate max-w-[150px]">
                  {chatName}
                </h2>
                {!isGroup && (
                  <div className="flex items-center gap-0.5 bg-gradient-gold text-accent-foreground text-[9px] font-bold px-1.5 py-0.5 rounded-full shadow-sm shrink-0">
                    <Crown className="w-2.5 h-2.5" />
                    <span>Lv.{userLevel}</span>
                  </div>
                )}
                {!isGroup && otherUserTrader.isTrader && (
                  <TraderBadge level={otherUserTrader.traderLevel} size="xs" />
                )}
                {!isGroup && countryFlag && (
                  <span className="text-[11px] leading-none">{countryFlag}</span>
                )}
              </div>
              <div className="flex items-center gap-1.5 mt-0.5 min-h-[14px]">
                {!isGroup && isOtherTyping ? (
                  <span className="text-[11px] text-emerald-600 font-semibold flex items-center gap-1">
                    <span className="flex gap-0.5">
                      <span className="w-1 h-1 rounded-full bg-emerald-500 animate-bounce" style={{ animationDelay: '0ms' }} />
                      <span className="w-1 h-1 rounded-full bg-emerald-500 animate-bounce" style={{ animationDelay: '150ms' }} />
                      <span className="w-1 h-1 rounded-full bg-emerald-500 animate-bounce" style={{ animationDelay: '300ms' }} />
                    </span>
                    typing…
                  </span>
                ) : !isGroup && (
                  selectedConversation?.other_user?.is_online ? (
                    <span className="text-[11px] text-emerald-600 font-medium">online</span>
                  ) : (
                    <span className="text-[11px] text-muted-foreground font-medium truncate">
                      last seen {formatLastSeen(selectedConversation?.other_user?.last_seen_at || null, false).toLowerCase()}
                    </span>
                  )
                )}
                {isGroup && (
                  <span className="text-[11px] text-muted-foreground font-medium">{selectedGroup?.member_count || 0} members</span>
                )}
              </div>
            </div>

            {/* WhatsApp-style inline Video Call button (host + online only) */}
            {!isGroup && selectedConversation?.other_user?.is_host && selectedConversation?.other_user?.is_online && (
              <button
                type="button"
                onClick={() => {
                  if (selectedConversation?.other_user?.id) startCall(selectedConversation.other_user.id);
                }}
                className="w-9 h-9 rounded-full profile-home-icon-button flex items-center justify-center shrink-0 active:scale-95 transition-all"
                aria-label="Video call"
              >
                <VideoCallIcon className="w-[18px] h-[18px] text-emerald-600" />
              </button>
            )}

            {/* Group Settings Button */}
            {isGroup && (
              <button
                type="button"
                className="w-9 h-9 rounded-full profile-home-icon-button flex items-center justify-center shrink-0 relative z-20"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  console.log('[Chat] ⚙️ Settings button clicked, selectedGroup:', selectedGroup?.id);
                  setShowGroupSettings(true);
                }}
              >
                <Settings className="w-5 h-5 text-foreground pointer-events-none" />
              </button>
            )}

            {/* Three Dot Menu for 1-on-1 chats - Block, Report, Profile */}
            {!isGroup && (
              <DropdownMenu modal={false}>
                <DropdownMenuTrigger asChild>
                  <button
                    type="button"
                    className="w-9 h-9 rounded-full profile-home-icon-button flex items-center justify-center shrink-0 relative z-20 backdrop-blur-xl"
                  >
                    <MoreVertical className="w-5 h-5 text-foreground pointer-events-none" />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="bg-popover text-popover-foreground border border-border rounded-2xl min-w-[220px] shadow-xl p-1.5 overflow-hidden max-h-[70vh] overflow-y-auto">
                  {/* Decorative top glow */}
                  <div className="absolute top-0 left-1/2 -translate-x-1/2 w-24 h-[1px] bg-gradient-to-r from-transparent via-purple-500/50 to-transparent" />
                  
                  <DropdownMenuItem
                    onClick={() => {
                      const otherId = selectedConversation?.other_user?.id;
                      if (otherId) navigate(`/profile-detail/${otherId}`);
                    }}
                    className="text-foreground hover:text-foreground hover:bg-muted cursor-pointer gap-3 py-3 px-3 rounded-xl transition-all"
                  >
                    <div className="w-8 h-8 rounded-lg bg-purple-500/15 border border-purple-500/20 flex items-center justify-center">
                      <Users className="w-4 h-4 text-purple-400" />
                    </div>
                    <span className="font-medium text-sm">View Profile</span>
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={async () => {
                      const otherId = selectedConversation?.other_user?.id;
                      if (!otherId || !currentUserId) return;
                      try {
                        await supabase.from('user_blocks').insert({
                          blocker_id: currentUserId,
                          blocked_id: otherId
                        });
                        toast.success("User blocked");
                        navigate('/chat');
                      } catch {
                        toast.error("Failed to block user");
                      }
                    }}
                    className="text-red-400 hover:text-red-300 hover:bg-red-500/[0.08] cursor-pointer gap-3 py-3 px-3 rounded-xl transition-all"
                  >
                    <div className="w-8 h-8 rounded-lg bg-red-500/15 border border-red-500/20 flex items-center justify-center">
                      <X className="w-4 h-4 text-red-400" />
                    </div>
                    <span className="font-medium text-sm">Block User</span>
                  </DropdownMenuItem>

                  <DropdownMenuItem
                    onSelect={(e) => {
                      e.preventDefault();
                      setTimeout(() => setShowReportDialog(true), 100);
                    }}
                    className="text-amber-400 hover:text-amber-300 hover:bg-amber-500/[0.08] cursor-pointer gap-3 py-3 px-3 rounded-xl transition-all"
                  >
                    <div className="w-8 h-8 rounded-lg bg-amber-500/15 border border-amber-500/20 flex items-center justify-center">
                      <ShieldAlert className="w-4 h-4 text-amber-400" />
                    </div>
                    <span className="font-medium text-sm">Report</span>
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          </div>
        </header>
        
        {/* Messages */}
        <div className="flex-1 min-h-0 px-3 py-3 space-y-3 overflow-y-auto overscroll-contain" style={{ background: 'linear-gradient(180deg, hsl(40 40% 98% / 0.6) 0%, transparent 15%, transparent 85%, hsl(40 40% 98% / 0.6) 100%)', WebkitOverflowScrolling: 'touch' }}>
          {currentMessages.length === 0 ? (
            <div className="text-center py-12">
              <p className="text-muted-foreground font-medium">No messages yet. Say hello! 👋</p>
            </div>
          ) : (
            currentMessages.map((msg: any, idx: number, arr: any[]) => {
              const isMine = msg.sender_id === currentUserId;
              const otherUserId = isGroup ? msg.sender_id : selectedConversation?.other_user?.id;
              const senderName = isMine 
                ? (myProfile?.display_name || 'You')
                : (isGroup ? msg.sender?.display_name : selectedConversation?.other_user?.display_name) || 'User';
              const senderAvatar = isMine
                ? myProfile?.avatar_url
                : (isGroup ? msg.sender?.avatar_url : selectedConversation?.other_user?.avatar_url);
              const senderLevel = isMine
                ? pickDisplayLevel(myProfile as any)
                : pickDisplayLevel((isGroup ? msg.sender : selectedConversation?.other_user) as any);
              const senderUserId = isMine ? currentUserId : otherUserId;

              // WhatsApp-style clustering: hide avatar/name on consecutive same-sender msgs within 3min
              const prev = idx > 0 ? arr[idx - 1] : null;
              const next = idx < arr.length - 1 ? arr[idx + 1] : null;
              const sameAsPrev = prev && prev.sender_id === msg.sender_id &&
                (new Date(msg.created_at).getTime() - new Date(prev.created_at).getTime()) < 3 * 60 * 1000;
              const sameAsNext = next && next.sender_id === msg.sender_id &&
                (new Date(next.created_at).getTime() - new Date(msg.created_at).getTime()) < 3 * 60 * 1000;
              const showAvatar = !sameAsNext; // anchor at last of cluster
              const showName = isGroup && !sameAsPrev; // only group needs name, only on first of cluster
              const showDaySeparator = !prev || !sameDay(prev.created_at, msg.created_at);

              return (
                <React.Fragment key={msg.id}>
                  {showDaySeparator && (
                    <div className="flex items-center justify-center my-2">
                      <span className="px-3 py-0.5 rounded-full text-[10.5px] font-semibold text-muted-foreground profile-home-pill shadow-sm backdrop-blur-sm">
                        {formatDayLabel(msg.created_at)}
                      </span>
                    </div>
                  )}
                  <div
                    className={cn("flex gap-2 group", isMine ? "justify-end" : "justify-start", sameAsPrev ? "mt-0.5" : "mt-2")}
                  >
                    <div className={cn("flex gap-2 max-w-[78%]", isMine && "flex-row-reverse")}>
                    {/* Avatar slot — only shows on last of cluster; otherwise reserved spacer keeps alignment */}
                    {showAvatar ? (
                      <button
                        onClick={() => senderUserId && navigate(`/profile-detail/${senderUserId}`)}
                        className="shrink-0 self-end mb-0.5"
                      >
                        {senderUserId ? (
                          <AvatarWithFrame
                            userId={senderUserId}
                            src={senderAvatar || undefined}
                            name={senderName}
                            level={senderLevel}
                            size="xs"
                            showAnimation={false}
                          />
                        ) : (
                          <Avatar className="w-7 h-7 border border-purple-200/30">
                            <AvatarImage src={senderAvatar || undefined} className="object-cover" />
                            <AvatarFallback className="bg-gradient-primary text-primary-foreground text-[10px]">
                              {senderName[0]}
                            </AvatarFallback>
                          </Avatar>
                        )}
                      </button>
                    ) : (
                      <div className="shrink-0 w-7" aria-hidden />
                    )}
                    <div className="flex flex-col min-w-0">
                      {/* Sender Name — group chat only, first of cluster only */}
                      {showName && (
                        <button
                          onClick={() => senderUserId && navigate(`/profile-detail/${senderUserId}`)}
                          className={cn("mb-0.5 px-1", isMine ? "text-right" : "text-left")}
                        >
                          <p className="font-semibold text-[11px] text-muted-foreground">
                            {senderName}
                          </p>
                        </button>
                      )}
                      {/* Message Bubble - No background for gifts */}
                      {(() => {
                        const content = msg.content || '';
                        const isImage = msg.message_type === 'image' || 
                          (content.includes('supabase.co/storage') && /\.(jpg|jpeg|png|gif|webp)($|\?)/i.test(content));
                        const isVideo = msg.message_type === 'video' || 
                          (content.includes('supabase.co/storage') && /\.(mp4|mov|avi|mkv)($|\?)/i.test(content));
                        const isAudio = msg.message_type === 'audio' || 
                          (content.includes('supabase.co/storage') && /\.(webm|mp3|wav|ogg|m4a)($|\?)/i.test(content));
                        const isGift = msg.message_type === 'gift';
                        const cleanUrl = content.replace(/^\[(Image|Video|Audio|Voice): /, '').replace(/\]$/, '');
                        const displayUrl = signedChatMediaUrls[cleanUrl] || cleanUrl;

                        // Gift messages - with SVGA/animation support
                        if (isGift) {
                          // New format: [Gift: URL|EMOJI NAME xCOUNT | +BEANS beans]
                          // Old format: [Gift: EMOJI NAME xCOUNT | +BEANS beans]
                          const { mediaUrl, emoji } = parseGiftContent(content);
                          const beansMatch = content.match(/\+(\d+)\s*beans/i);
                          const diamondsMatch = content.match(/-(\d+)\s*diamonds/i);
                          
                          const iconUrl = mediaUrl;
                          const giftEmoji = emoji;
                          const beansAmount = beansMatch ? beansMatch[1] : null;
                          const diamondsAmount = diamondsMatch ? diamondsMatch[1] : null;
                          
                          // Check if iconUrl is an animation file
                          const normalizedGiftUrl = iconUrl ? iconUrl.split('?')[0].toLowerCase() : '';
                          const isSvga = normalizedGiftUrl.endsWith('.svga');
                          const isLottie = normalizedGiftUrl.endsWith('.json');
                          const isImage = !!iconUrl && !isSvga && !isLottie;
                          
                          return (
                            <motion.div 
                              className="inline-flex flex-col items-center p-1.5 bg-gradient-to-br from-accent/15 to-card rounded-lg border border-accent/25 shadow-md backdrop-blur-sm"
                              initial={{ opacity: 0, scale: 0.9 }}
                              animate={{ opacity: 1, scale: 1 }}
                              transition={{ duration: 0.2 }}
                            >
                              {/* Ultra Compact Gift - Fixed 40x40 for ALL types */}
                              <div className="w-10 h-10 flex items-center justify-center relative">
                                {isSvga && iconUrl ? (
                                  <Suspense fallback={<span className="text-xl">{giftEmoji}</span>}>
                                    <SVGAPlayer
                                      src={iconUrl}
                                      className="w-10 h-10"
                                      loop={true}
                                      autoPlay={true}
                                      muted={true}
                                    />
                                  </Suspense>
                                ) : isLottie && iconUrl ? (
                                  <Suspense fallback={<span className="text-xl">{giftEmoji}</span>}>
                                    <UniversalAnimationPlayer
                                      src={iconUrl}
                                      className="w-10 h-10"
                                      loop={true}
                                      autoPlay={true}
                                      muted={true}
                                    />
                                  </Suspense>
                                ) : isImage && iconUrl ? (
                                  <img 
                                    src={iconUrl} 
                                    alt="Gift" 
                                    className="w-10 h-10 object-contain"
                                    onError={(e) => {
                                      (e.target as HTMLImageElement).style.display = 'none';
                                      (e.target as HTMLImageElement).insertAdjacentHTML('afterend', `<span class="text-xl">${giftEmoji}</span>`);
                                    }}
                                  />
                                ) : (
                                  <span className="text-xl">{giftEmoji}</span>
                                )}
                              </div>
                              
                              {/* Asymmetric badge: sender → diamonds spent (red), receiver → beans earned (gold 3D) */}
                              {isMine && diamondsAmount ? (
                                <div className="flex items-center gap-1 px-2 py-0.5 mt-1 bg-gradient-to-r from-rose-500 to-red-600 rounded-full shadow-md shadow-rose-500/30">
                                  <img src={diamondGem3D} alt="" className="w-3 h-3 object-contain drop-shadow" />
 <span className="text-[9px] font-bold text-primary-foreground">
                                    -{Number(diamondsAmount).toLocaleString()}
                                  </span>
                                </div>
                              ) : !isMine && beansAmount ? (
                                <div className="flex items-center gap-1 px-2 py-0.5 mt-1 bg-gradient-to-r from-amber-500 to-orange-500 rounded-full shadow-md shadow-amber-500/30">
                                  <Beans3DIcon size={12} />
 <span className="text-[9px] font-bold text-accent-foreground">
                                    +{Number(beansAmount).toLocaleString()}
                                  </span>
                                </div>
                              ) : beansAmount ? (
                                <div className="flex items-center gap-1 px-2 py-0.5 mt-1 bg-gradient-to-r from-amber-500 to-orange-500 rounded-full shadow-md">
                                  <Beans3DIcon size={12} />
 <span className="text-[9px] font-bold text-accent-foreground">
                                    +{Number(beansAmount).toLocaleString()}
                                  </span>
                                </div>
                              ) : null}
                              
                              {/* Timestamp + Status */}
                              <p className="text-[8px] text-muted-foreground/60 mt-0.5 flex items-center justify-center gap-0.5">
                                {formatTime(msg.created_at)}
                                <MessageStatusIndicator status={msg.status || (msg.is_read ? 'read' : 'sent')} isMine={isMine} />
                              </p>
                            </motion.div>
                          );
                        }

                        // Image messages - no background
                        if (isImage) {
                          return (
                            <div className="flex flex-col">
                              <img 
                                src={displayUrl} 
                                alt="Shared image"
                                className="max-w-[200px] max-h-[200px] rounded-xl object-cover cursor-pointer hover:opacity-90 transition-opacity"
                                onClick={() => imageViewer.openImage(displayUrl)}
                                onError={(e) => {
                                  (e.target as HTMLImageElement).src = '/placeholder.svg';
                                }}
                              />
                              <p className="text-[10px] text-muted-foreground mt-1 flex items-center gap-0.5">
                                {formatTime(msg.created_at)}
                                <MessageStatusIndicator status={msg.status || (msg.is_read ? 'read' : 'sent')} isMine={isMine} />
                              </p>
                            </div>
                          );
                        }

                        // Video messages - no background
                        if (isVideo) {
                          return (
                            <div className="flex flex-col">
                              <video 
                                src={displayUrl} 
                                controls
                                className="max-w-[200px] max-h-[200px] rounded-xl"
                              />
                              <p className="text-[10px] text-muted-foreground mt-1 flex items-center gap-0.5">
                                {formatTime(msg.created_at)}
                                <MessageStatusIndicator status={msg.status || (msg.is_read ? 'read' : 'sent')} isMine={isMine} />
                              </p>
                            </div>
                          );
                        }

                        // Audio messages - minimal background
                        if (isAudio) {
                          return (
                            <div className={cn(
                              "rounded-2xl px-3 py-2",
                              isMine
 ?"bg-gradient-primary text-primary-foreground rounded-br-sm"
                                : "bg-muted rounded-bl-sm"
                            )}>
                              <div className="flex items-center gap-2">
                                <div className="w-8 h-8 rounded-full bg-primary-foreground/20 flex items-center justify-center">
                                  <Mic className="w-4 h-4" />
                                </div>
                                <audio 
                                  src={displayUrl} 
                                  controls
                                  className="max-w-[180px] h-8"
                                />
                              </div>
                              <p className={cn(
                                "text-[10px] mt-1 flex items-center gap-0.5",
                                isMine ? "text-primary-foreground/85" : "text-muted-foreground"
                              )}>
                                {formatTime(msg.created_at)}
                                <MessageStatusIndicator status={msg.status || (msg.is_read ? 'read' : 'sent')} isMine={isMine} />
                              </p>
                            </div>
                          );
                        }

                        // Regular text messages - WhatsApp-style compact bubbles
                        return (
                          <div
                            className={cn(
                              "rounded-2xl px-2.5 py-1.5 max-w-full text-[13px] leading-[1.35]",
                              isMine
 ?"bg-gradient-primary text-primary-foreground rounded-br-sm shadow-md shadow-purple-500/20"
                                : "rounded-bl-sm text-card-foreground shadow-sm",
                              msg._optimistic && "opacity-70"
                            )}
                            style={!isMine ? {
                              background: 'linear-gradient(135deg, hsl(var(--card)) 0%, hsl(40 40% 99%) 100%)',
                              border: '1px solid hsl(40 35% 88% / 0.7)',
                            } : undefined}
                          >
                            <span className="break-words">{content}</span>
                            <span className={cn(
                              "text-[9px] ml-1 float-right mt-1.5 flex items-center gap-0.5",
                              isMine ? "text-primary-foreground/80" : "text-muted-foreground"
                            )}>
                              {formatTime(msg.created_at)}
                              <MessageStatusIndicator 
                                status={msg.status || (msg.is_read ? 'read' : 'sent')} 
                                isMine={isMine} 
                              />
                            </span>
                          </div>
                        );
                      })()}
                    </div>
                    
                    {/* Three Dot Menu for each message */}
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <button className="self-center p-1 rounded-full hover:bg-muted opacity-0 group-hover:opacity-100 transition-opacity">
                          <MoreVertical className="w-4 h-4 text-muted-foreground" />
                        </button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align={isMine ? "end" : "start"}>
                        <DropdownMenuItem onClick={() => {
                          navigator.clipboard.writeText(msg.content);
                          toast.success("Message copied!");
                        }}>
                          Copy
                        </DropdownMenuItem>
                        {!isMine && (
                          <DropdownMenuItem onClick={() => otherUserId && navigate(`/profile-detail/${otherUserId}`)}>
                            View Profile
                          </DropdownMenuItem>
                        )}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                  </div>
                </React.Fragment>
              );
            })
          )}
          {/* Typing indicator bubble */}
          {isOtherTyping && !isGroup && (
            <div className="flex gap-2 justify-start">
              <div className="flex gap-2 max-w-[75%]">
                <div className="shrink-0 self-end mb-0.5">
                  <AvatarWithFrame
                    userId={selectedConversation?.other_user?.id || ''}
                    src={selectedConversation?.other_user?.avatar_url || undefined}
                    name={selectedConversation?.other_user?.display_name || '?'}
                    level={pickDisplayLevel(selectedConversation?.other_user as any)}
                    size="xs"
                    showAnimation={false}
                  />
                </div>
                <div className="rounded-2xl rounded-bl-sm px-4 py-2.5 shadow-sm" style={{ background: 'linear-gradient(135deg, hsl(var(--card)) 0%, hsl(40 40% 99%) 100%)', border: '1px solid hsl(var(--border) / 0.7)' }}>
                  <div className="flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-pink-400 animate-bounce" style={{ animationDelay: '0ms' }} />
                    <span className="w-1.5 h-1.5 rounded-full bg-pink-400 animate-bounce" style={{ animationDelay: '150ms' }} />
                    <span className="w-1.5 h-1.5 rounded-full bg-pink-400 animate-bounce" style={{ animationDelay: '300ms' }} />
                  </div>
                </div>
              </div>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Message Input - Ultra Premium Dark Glass */}
        <div className="flex-shrink-0 pt-2 safe-area-bottom" style={{ background: 'linear-gradient(to top, hsl(40 40% 98%) 0%, hsl(40 40% 98% / 0.92) 70%, transparent 100%)', borderTop: '1px solid hsl(40 35% 88% / 0.5)' }}>
          {/* Media Uploader (direct gallery) */}
          <MediaUploader
            isOpen={showMediaUploader}
            onClose={() => setShowMediaUploader(false)}
            userId={currentUserId}
            onMediaSelect={(url, type) => {
              // Save as pending media, don't send directly
              setPendingMedia({ url, type });
              setShowMediaUploader(false);
            }}
            directGallery={true}
          />
          <EmojiPicker
            isOpen={showEmojiPicker}
            onClose={() => setShowEmojiPicker(false)}
            onSelect={(emoji) => {
              setMessage(prev => prev + emoji);
            }}
          />
          
          {/* Inline Translation Bar — premium luxury redesign */}
          {inlineTranslateEnabled && !isGroup && (
              <div className="px-3 pt-2.5 pb-2 border-t border-border/60 bg-gradient-to-b from-accent/10 via-card to-primary/5">
              {/* Header row */}
              <div className="flex items-center justify-between mb-2 px-1">
                <div className="flex items-center gap-1.5 min-w-0">
                  <span className="text-[11px] font-semibold tracking-wide bg-gradient-to-r from-amber-700 via-rose-600 to-purple-700 bg-clip-text text-transparent whitespace-nowrap">
                    ✨ Auto-Translate
                  </span>
                  <span className="text-[10px] text-muted-foreground">→</span>
                  <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-card shadow-sm border border-border min-w-0">
                    <span className="text-xs leading-none">
                      {languageOptions.find(l => l.code === inlineTargetLang)?.flag}
                    </span>
                    <span className="text-[10px] font-bold text-card-foreground truncate">
                      {languageOptions.find(l => l.code === inlineTargetLang)?.name}
                    </span>
                  </span>
                </div>
                <button
                  onClick={() => {
                    setInlineTranslateEnabled(false);
                    setInlineTranslation("");
                  }}
                  className="p-1 rounded-full bg-card/80 hover:bg-muted text-muted-foreground hover:text-destructive border border-border transition-colors shrink-0 ml-2"
                  aria-label="Close translator"
                >
                  <X className="w-3 h-3" />
                </button>
              </div>

              {/* Language chips — horizontal scroll, each chip distinct */}
              <div className="flex gap-2 overflow-x-auto pb-1.5 scrollbar-hide -mx-1 px-1">
                {languageOptions.map((lang) => {
                  const active = inlineTargetLang === lang.code;
                  return (
                    <button
                      key={lang.code}
                      onClick={() => handleInlineLangChange(lang.code)}
                      className={`shrink-0 inline-flex items-center gap-1.5 pl-2 pr-3 py-1.5 rounded-full text-[11px] font-semibold whitespace-nowrap transition-all duration-200 border ${ // dark-ok
                        active
                          ? 'bg-gradient-to-r from-amber-400 via-rose-500 to-fuchsia-600 text-white border-white shadow-[0_4px_14px_rgba(244,114,182,0.45)] ring-2 ring-amber-300/70 scale-[1.04]'
                          : 'bg-card text-card-foreground border-border shadow-sm hover:border-accent hover:shadow-md hover:-translate-y-px'
                      }`}
                    >
                      <span className={`inline-flex items-center justify-center w-5 h-5 rounded-full text-[13px] leading-none ${
                        active ? 'bg-primary-foreground/25' : 'bg-muted'
                      }`}>
                        {lang.flag}
                      </span>
                      <span className={active ? 'drop-shadow-sm' : ''}>{lang.name}</span>
                      {active && <span className="text-[10px] leading-none">✓</span>}
                    </button>
                  );
                })}
              </div>

              {/* Translation Result */}
              {(inlineTranslation || isInlineTranslating) && (
                <motion.div
                  initial={{ opacity: 0, y: -4 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="mt-2 rounded-xl px-3 py-2 bg-gradient-to-br from-card via-primary/5 to-secondary/5 border border-primary/20 shadow-inner"
                >
                  <div className="flex items-center gap-1.5 mb-1">
                    <span className="text-[10px] font-bold text-purple-700">
                      {languageOptions.find(l => l.code === inlineTargetLang)?.flag} {inlineTargetLang}
                    </span>
                    {isInlineTranslating && (
                      <span className="inline-flex gap-0.5">
                        <span className="w-1 h-1 bg-purple-500 rounded-full animate-bounce [animation-delay:-0.3s]" />
                        <span className="w-1 h-1 bg-purple-500 rounded-full animate-bounce [animation-delay:-0.15s]" />
                        <span className="w-1 h-1 bg-purple-500 rounded-full animate-bounce" />
                      </span>
                    )}
                  </div>
                  <p className="text-sm text-card-foreground font-medium leading-snug">
                    {inlineTranslation || "Translating…"}
                  </p>
                </motion.div>
              )}
            </div>
          )}
          
          {/* Quick Reply Chips - Show when no messages or conversation just started */}
          {!isRecording && !audioBlob && !pendingMedia && !message.trim() && (selectedConversation || selectedGroup) && (
            <div className="px-4 pb-1">
              <div className="flex gap-2 overflow-x-auto scrollbar-hide pb-1">
                {(selectedConversation?.other_user?.is_host ? [
                  // Messages for HOSTS (from user perspective)
                  "Hi! How are you? 😊",
                  "You look beautiful! 💕",
                  "Can we video call? 📹",
                  "I love your live! 🌟",
                  "Send me your schedule 📅",
                  "You're my favorite! ❤️",
                  "Let's be friends! 🤝",
                  "Miss you! 💗",
                ] : [
                  // Messages for regular USERS
                  "Hey! What's up? 👋",
                  "How are you doing? 😊",
                  "Nice to meet you! 🤝",
                  "Let's chat! 💬",
                  "What are you up to? 🤔",
                  "Good morning! ☀️",
                  "Have a great day! 🌟",
                  "Thanks! 🙏",
                ]).map((quickMsg) => (
                  <motion.button
                    key={quickMsg}
                    whileTap={{ scale: 0.95 }}
                    onClick={() => {
                      setMessage(quickMsg);
                      // Auto-send on tap
                      setTimeout(() => {
                        const content = quickMsg.trim();
                        if (!content || sending) return;
                        setSending(true);
                        setMessage("");
                        
                        if (selectedConversation) {
                          persistDirectMessage(
                            selectedConversation.id,
                            currentUserId!,
                            content,
                            'text'
                          ).then((sentMessage) => {
                            setSending(false);
                            // 🔔 Push notification for quick reply
                            const recipientId = selectedConversation.other_user?.id;
                            if (recipientId && currentUserId) {
                              supabase.functions.invoke('notify-new-message', {
                                body: { conversationId: selectedConversation.id, messageId: sentMessage.id, senderId: currentUserId, recipientId, messageContent: content, messageType: 'text' }
                              }).catch(() => {});
                            }
                          }).catch(() => setSending(false));
                        } else if (selectedGroup) {
                          Promise.resolve(supabase.from('group_messages').insert({
                            group_id: selectedGroup.id,
                            sender_id: currentUserId,
                            content,
                            message_type: 'text'
                          })).then(() => setSending(false)).catch(() => setSending(false));
                        } else {
                          setSending(false);
                        }
                      }, 50);
                    }}
 className="flex-shrink-0 px-3 py-1.5 rounded-full bg-card/70 border border-border backdrop-blur-xl"
                  >
                    <span className="text-xs text-card-foreground whitespace-nowrap">{quickMsg}</span>
                  </motion.button>
                ))}
              </div>
            </div>
          )}
          
          {/* Input Row - Voice Recording, Pending Media, or Text Mode */}
          <div className="px-4 py-3 flex items-center gap-2">
            {/* Recording Mode */}
            {(isRecording || audioBlob) ? (
              <>
                {/* Cancel Button */}
                <motion.button
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  whileTap={{ scale: 0.9 }}
                  onClick={cancelVoiceRecording}
                  className="w-11 h-11 rounded-full bg-muted flex items-center justify-center"
                >
                  <X className="w-5 h-5 text-muted-foreground" />
                </motion.button>
                
                {/* Recording Indicator */}
                <div className="flex-1 relative">
                  <div className={cn(
                    "w-full h-11 rounded-full flex items-center justify-center gap-2",
                    isRecording ? "bg-red-500/10" : "bg-green-500/10"
                  )}>
                    {isRecording ? (
                      <>
                        <div className="w-3 h-3 bg-red-500 rounded-full animate-pulse" />
                        <span className="text-red-500 font-semibold text-lg">
                          {formatRecordingTime(recordingDuration)}
                        </span>
                        <span className="text-red-500/70 text-sm">Recording...</span>
                      </>
                    ) : (
                      <>
                        <Mic className="w-5 h-5 text-green-600" />
                        <span className="text-green-600 font-medium">
                          {formatRecordingTime(recordingDuration)} Ready to send
                        </span>
                      </>
                    )}
                  </div>
                </div>
                
                {/* Stop or Send Button */}
                <motion.button
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  whileTap={{ scale: 0.9 }}
                  onClick={isRecording ? stopVoiceRecording : sendVoiceMessage}
                  disabled={sendingVoice}
                  className={cn(
                    "w-11 h-11 rounded-full flex items-center justify-center shadow-lg",
                    isRecording 
                      ? "bg-red-500" 
                      : "bg-gradient-to-r from-purple-500 to-pink-500"
                  )}
                >
                  {sendingVoice ? (
 <div className="w-5 h-5 border-2 border-primary-foreground border-t-transparent rounded-full animate-spin" />
                  ) : isRecording ? (
                    <div className="w-4 h-4 bg-primary-foreground rounded-sm" />
                  ) : (
 <Send className="w-5 h-5 text-primary-foreground" />
                  )}
                </motion.button>
              </>
            ) : pendingMedia ? (
              /* Pending Media Mode - Show preview and send button */
              <>
                {/* Cancel Button */}
                <motion.button
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  whileTap={{ scale: 0.9 }}
                  onClick={() => setPendingMedia(null)}
                  className="w-11 h-11 rounded-full bg-muted flex items-center justify-center"
                >
                  <X className="w-5 h-5 text-muted-foreground" />
                </motion.button>
                
                {/* Media Preview */}
                <div className="flex-1 relative">
                  <div className="w-full h-11 rounded-full bg-blue-500/10 flex items-center justify-center gap-2 px-4">
                    {pendingMedia.type === 'image' ? (
                      <>
                        <img 
                          src={signedChatMediaUrls[pendingMedia.url] || pendingMedia.url} 
                          alt="Preview" 
                          className="w-8 h-8 rounded-lg object-cover"
                        />
                        <span className="text-blue-600 font-medium text-sm truncate">
                          📷 Image ready to send
                        </span>
                      </>
                    ) : pendingMedia.type === 'video' ? (
                      <>
                        <ImageIcon className="w-5 h-5 text-purple-600" />
                        <span className="text-purple-600 font-medium text-sm">
                          🎥 Video ready to send
                        </span>
                      </>
                    ) : (
                      <>
                        <Mic className="w-5 h-5 text-orange-600" />
                        <span className="text-orange-600 font-medium text-sm">
                          🎵 Audio ready to send
                        </span>
                      </>
                    )}
                  </div>
                </div>
                
                {/* Send Button for Media */}
                <motion.button
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  whileTap={{ scale: 0.9 }}
                  onClick={async () => {
                    if (!pendingMedia) return;
                    try {
                      // 🔍 For images: HOSTS ONLY — non-hosts (agency/user/helper) share images freely
                      if (pendingMedia.type === 'image' && currentUserId && myProfile?.is_host === true) {
                        const { checkImageFilename } = await import('@/utils/imageContactDetection');
                        const filename = pendingMedia.url.split('/').pop() || '';
                        if (checkImageFilename(filename)) {
                          // Block the image entirely
                          toast.error("⚠️ Contact sharing detected! Image blocked.");
                          numberWarning.showGenericWarning();
                          const sourceId = selectedConversation?.id || selectedGroup?.id;
                          scanImageForContactInfo(signedChatMediaUrls[pendingMedia.url] || pendingMedia.url, currentUserId, 'private_message', sourceId)
                            .then(res => {
                              if (res.detected && res.violationNumber) {
                                numberWarning.showWarning(res.violationNumber, res.beansDeducted || 0, res.isBanned || false);
                              }
                            }).catch(() => {});
                          setPendingMedia(null);
                          return;
                        }
                        
                        // Background OCR scan
                        const sourceId = selectedConversation?.id || selectedGroup?.id;
                        scanImageForContactInfo(signedChatMediaUrls[pendingMedia.url] || pendingMedia.url, currentUserId, 'private_message', sourceId)
                          .then(res => {
                            if (res.detected && res.violationNumber) {
                              numberWarning.showWarning(res.violationNumber, res.beansDeducted || 0, res.isBanned || false);
                            } else if (res.detected) {
                              numberWarning.showGenericWarning();
                            }
                          }).catch(() => {});
                      }

                      if (selectedConversation) {
                        await persistDirectMessage(
                          selectedConversation.id,
                          currentUserId!,
                          pendingMedia.url,
                          pendingMedia.type
                        );
                      } else if (selectedGroup) {
                        const { data: newMsg, error } = await supabase
                          .from('group_messages')
                          .insert({
                            group_id: selectedGroup.id,
                            sender_id: currentUserId,
                            content: pendingMedia.url,
                            message_type: pendingMedia.type
                          })
                          .select()
                          .single();

                        if (!error && newMsg) {
                          setGroupMessages(prev => {
                            if (prev.find(m => m.id === newMsg.id)) return prev;
                            return [...prev, { ...newMsg, sender: null }];
                          });
                        }
                      }
                      toast.success("Media sent!");
                      setPendingMedia(null);
                    } catch (error) {
                      toast.error("Failed to send media");
                    }
                  }}
                  disabled={sending}
                  className="w-11 h-11 rounded-full bg-gradient-to-r from-purple-500 to-pink-500 flex items-center justify-center shadow-lg"
                >
 <Send className="w-5 h-5 text-primary-foreground" />
                </motion.button>
              </>
            ) : (
              <>
                {/* WhatsApp-style single pill: emoji • input • attach • camera */}
                <div className={cn(
                  "flex-1 flex items-center gap-1 pl-2 pr-1 h-11 rounded-full bg-card/95 border border-border shadow-sm backdrop-blur-xl transition-colors",
                  inlineTranslateEnabled && "ring-1 ring-purple-500/40 border-purple-300/70"
                )}>
                  <motion.button
                    whileTap={{ scale: 0.9 }}
                    onClick={() => setShowEmojiPicker(!showEmojiPicker)}
                    className="shrink-0 w-8 h-8 rounded-full flex items-center justify-center hover:bg-amber-100/60 transition-colors"
                    aria-label="Emoji"
                  >
                    <Smile className="w-[20px] h-[20px] text-muted-foreground" />
                  </motion.button>
                  <Input
                    value={message}
                    onChange={(e) => handleMessageChange(e.target.value)}
                    placeholder="Message"
                    className="flex-1 h-9 border-0 bg-transparent px-1 text-[14px] text-foreground placeholder:text-muted-foreground focus-visible:ring-0 focus-visible:ring-offset-0 shadow-none"
                    onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && handleSend()}
                    disabled={sending}
                    onFocus={() => setShowEmojiPicker(false)}
                  />
                  <motion.button
                    whileTap={{ scale: 0.9 }}
                    onClick={() => { setShowMediaUploader(true); setShowEmojiPicker(false); }}
                    className="shrink-0 w-8 h-8 rounded-full flex items-center justify-center hover:bg-amber-100/60 transition-colors"
                    aria-label="Gallery"
                  >
                    <Camera className="w-[18px] h-[18px] text-muted-foreground" />
                  </motion.button>
                </div>

                {/* Right-side circular action: mic when empty, send when typing */}
                <motion.button
                  initial={false}
                  whileTap={{ scale: 0.9 }}
                  onClick={message.trim() ? handleSend : handleVoiceRecord}
                  disabled={sending}
                  className="shrink-0 w-11 h-11 rounded-full bg-gradient-to-br from-fuchsia-500 via-purple-500 to-violet-600 flex items-center justify-center shadow-md shadow-purple-500/30"
                  aria-label={message.trim() ? "Send" : "Record voice"}
                >
                  {message.trim() ? (
                    <Send className="w-5 h-5 text-white" />
                  ) : (
                    <Mic className="w-5 h-5 text-white" />
                  )}
                </motion.button>
              </>
            )}
          </div>
          
          {/* Action Buttons Row - Ultra Premium Dark Glass */}
          {!isGroup && (
            <div className="px-4 pb-3">
              <div className="flex justify-center gap-5">
                {/* Translator */}
                <motion.button
                  whileTap={{ scale: 0.95 }}
                  onClick={() => {
                    setInlineTranslateEnabled(!inlineTranslateEnabled);
                    if (!inlineTranslateEnabled && message.trim()) {
                      translateInlineMessage(message, inlineTargetLang);
                    }
                  }}
                  className="flex flex-col items-center gap-1.5 group"
                >
                  <div className={cn(
                    "w-12 h-12 rounded-2xl flex items-center justify-center transition-all duration-300 border backdrop-blur-xl",
                    inlineTranslateEnabled 
                      ? "bg-gradient-to-br from-primary/30 to-secondary/30 border-primary/40 shadow-lg shadow-purple-500/20" 
 :"bg-card/70 border-border hover:bg-muted"
                  )}>
                    <Languages className={cn(
                      "w-5 h-5",
                      inlineTranslateEnabled ? "text-primary" : "text-foreground"
                    )} />
                  </div>
                  <span className={cn(
                    "text-[9px] font-semibold",
                    inlineTranslateEnabled ? "text-primary" : "text-muted-foreground"
                  )}>
                    {inlineTranslateEnabled ? "ON" : "Translate"}
                  </span>
                </motion.button>
                
                {/* Gift */}
                <motion.button
                  whileTap={{ scale: 0.95 }}
                  onClick={() => setShowGiftPanel(true)}
                  className="flex flex-col items-center gap-1.5 group"
                >
                  <div className="w-12 h-12 rounded-2xl flex items-center justify-center bg-gradient-to-br from-pink-500/20 to-rose-500/20 border border-pink-500/25 backdrop-blur-xl hover:from-pink-500/30 hover:to-rose-500/30 transition-all duration-300">
                    <Gift className="w-5 h-5 text-pink-400" />
                  </div>
                  <span className="text-[9px] font-semibold text-muted-foreground">Gift</span>
                </motion.button>
                
                {/* Games */}
                <motion.button
                  whileTap={{ scale: 0.95 }}
                  onClick={() => setShowGamePanel(true)}
                  className="flex flex-col items-center gap-1.5 group"
                >
                  <div className="w-12 h-12 rounded-2xl flex items-center justify-center bg-gradient-to-br from-indigo-500/20 to-blue-500/20 border border-indigo-500/25 backdrop-blur-xl hover:from-indigo-500/30 hover:to-blue-500/30 transition-all duration-300">
                    <Gamepad2 className="w-5 h-5 text-indigo-400" />
                  </div>
                  <span className="text-[9px] font-semibold text-muted-foreground">Games</span>
                </motion.button>
                
                {/* Video Call */}
                {selectedConversation?.other_user?.is_host && selectedConversation?.other_user?.is_online && (
                  <motion.button
                    whileTap={{ scale: 0.95 }}
                    onClick={() => {
                      if (selectedConversation?.other_user?.id) {
                        startCall(selectedConversation.other_user.id);
                      }
                    }}
                    className="flex flex-col items-center gap-1.5 group"
                  >
                    <div className="relative w-12 h-12 rounded-2xl flex items-center justify-center bg-gradient-to-br from-rose-500/20 to-red-500/20 border border-rose-500/25 backdrop-blur-xl hover:from-rose-500/30 hover:to-red-500/30 transition-all duration-300">
                      <div className="absolute inset-0 rounded-2xl bg-gradient-to-r from-rose-500/10 to-pink-500/10 animate-pulse" />
                      <VideoCallIcon className="w-5 h-5 text-rose-400 relative z-10" />
                    </div>
                    <div className="flex flex-col items-center">
                      <span className="text-[9px] font-semibold text-muted-foreground">Video Call</span>
                      {selectedConversation.other_user.call_rate_per_minute && selectedConversation.other_user.call_rate_per_minute > 0 && (
                        <span className="text-[8px] text-amber-400/70 font-medium">💎 {selectedConversation.other_user.call_rate_per_minute}/min</span>
                      )}
                    </div>
                  </motion.button>
                )}
              </div>
            </div>
          )}
          
          {/* Translator Modal - Enhanced */}
          <Dialog open={showTranslator} onOpenChange={(open) => {
            setShowTranslator(open);
            if (!open) {
              setTranslateText("");
              setTranslatedResult("");
            }
          }}>
            <DialogContent className="max-w-sm">
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <Languages className="w-5 h-5 text-purple-500" />
                  Translator
                </DialogTitle>
              </DialogHeader>
              <div className="space-y-4">
                {/* Language Selector */}
                <div>
                  <Label className="text-sm text-muted-foreground mb-2 block">Translate to:</Label>
                  <div className="flex flex-wrap gap-1.5">
                    {languageOptions.map((lang) => (
                      <button
                        key={lang.code}
                        onClick={() => handleLanguageChange(lang.code)}
                        className={`flex items-center gap-1 px-2.5 py-1.5 rounded-full text-xs font-medium transition-all ${
                          selectedLanguage === lang.code
 ?'bg-gradient-primary text-primary-foreground shadow-md'
                            : 'bg-muted hover:bg-muted/80 text-foreground'
                        }`}
                      >
                        <span>{lang.flag}</span>
                        <span>{lang.name}</span>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Input Text */}
                <div>
                  <Label className="text-sm text-muted-foreground">Enter text to translate</Label>
                  <textarea
                    value={translateText}
                    onChange={(e) => handleTranslateTextChange(e.target.value)}
                    placeholder="Type here... auto-translates as you type"
                    className="w-full mt-2 p-3 rounded-xl border border-border min-h-[80px] resize-none focus:ring-2 focus:ring-purple-500/20 focus:border-purple-500 transition-all"
                  />
                </div>

                {/* Translation Result - Shows below input */}
                <div className={`rounded-xl border-2 border-dashed transition-all ${
                  translatedResult 
                    ? 'border-amber-300/60 bg-purple-500/10' 
 :'border-border bg-muted/30'
                }`}>
                  <div className="p-3">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs font-medium text-purple-300">
                        {languageOptions.find(l => l.code === selectedLanguage)?.flag} {selectedLanguage}
                      </span>
                      {isTranslating && (
                        <span className="text-[10px] text-muted-foreground flex items-center gap-1">
                          <span className="w-2 h-2 bg-purple-500 rounded-full animate-pulse" />
                          Translating...
                        </span>
                      )}
                    </div>
                    <p className={`min-h-[40px] ${translatedResult ? 'text-foreground' : 'text-muted-foreground text-sm'}`}>
                      {translatedResult || "Translation will appear here..."}
                    </p>
                  </div>
                </div>

                {/* Action Button */}
                <Button
                  className="w-full bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-600 hover:to-pink-600"
                  onClick={() => {
                    if (translatedResult) {
                      setMessage(prev => prev + translatedResult);
                      setShowTranslator(false);
                      setTranslateText("");
                      setTranslatedResult("");
                      toast.success("Translation added to message!");
                    }
                  }}
                  disabled={!translatedResult || isTranslating}
                >
                  Use Translation
                </Button>
              </div>
            </DialogContent>
          </Dialog>
          
          {/* Gift Panel - Same as Live/Party Room */}
          <GiftPanel
            isOpen={showGiftPanel}
            onClose={() => setShowGiftPanel(false)}
            onSendGift={handleSendGift}
            userCoins={userCoins}
          />
          
          {/* Game Panel - Same as Live/Party Room */}
          <LiveGameSelector
            isOpen={showGamePanel}
            onClose={() => setShowGamePanel(false)}
            onOpenGifts={() => setShowGiftPanel(true)}
          />

          {/* Gift Emoji Animation */}
          <AnimatePresence>
            {showGiftAnimation && animatingGiftEmoji && (
              <GiftEmojiAnimation
                key={`${giftAnimationInstance}-${animatingGiftEmoji}`}
                emoji={animatingGiftEmoji}
                soundUrl={animatingGiftSound || undefined}
                onComplete={() => {
                  setShowGiftAnimation(false);
                  setAnimatingGiftEmoji("");
                  setAnimatingGiftSound(null);
                }}
              />
            )}
          </AnimatePresence>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 flex flex-col overflow-hidden profile-home-shell">
      {/* Header - Ultra Premium */}
      <header className="flex-shrink-0 z-40 safe-area-top profile-home-card" style={{ borderRadius: 0, borderLeft: 'none', borderRight: 'none', borderTop: 'none' }}>
        <div className="px-4 py-3 flex items-center justify-between">
          <h1 className="text-xl font-bold bg-gradient-to-r from-fuchsia-600 via-purple-600 to-pink-600 bg-clip-text text-transparent">Messages</h1>
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="icon"
              className="rounded-full profile-home-icon-button text-foreground shadow-sm"
              onClick={() => navigate('/search')}
            >
              <MessageCircle className="w-5 h-5" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="rounded-full profile-home-icon-button text-foreground shadow-sm"
              onClick={() => setShowGroupActions(true)}
            >
              <Users className="w-5 h-5" />
            </Button>
          </div>
        </div>
        
        {/* Tabs - Premium Light */}
        <div className="px-4">
          <Tabs value={chatTab} onValueChange={handleTabChange} className="w-full">
            <TabsList className="grid w-full grid-cols-4 bg-card/70 border border-border rounded-xl p-1 shadow-inner">
 <TabsTrigger value="messages" className="relative text-xs font-semibold data-[state=active]:bg-gradient-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-md rounded-lg text-muted-foreground">
                Messages
                {globalUnread.messages > 0 && (
 <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 bg-gradient-to-r from-red-500 to-pink-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center shadow-lg shadow-red-500/30">
                    {formatBadgeCount(globalUnread.messages)}
                  </span>
                )}
              </TabsTrigger>
 <TabsTrigger value="official" className="relative text-xs font-semibold data-[state=active]:bg-gradient-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-md rounded-lg text-muted-foreground">
                Official
                {globalUnread.official > 0 && (
 <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 bg-gradient-gold text-accent-foreground text-[10px] font-bold rounded-full flex items-center justify-center shadow-lg shadow-orange-500/30">
                    {formatBadgeCount(globalUnread.official)}
                  </span>
                )}
              </TabsTrigger>
 <TabsTrigger value="notifications" className="relative text-xs font-semibold data-[state=active]:bg-gradient-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-md rounded-lg text-muted-foreground">
                Notifications
                {globalUnread.notifications > 0 && (
 <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 bg-gradient-to-r from-purple-500 to-pink-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center shadow-lg">
                    {formatBadgeCount(globalUnread.notifications)}
                  </span>
                )}
              </TabsTrigger>
 <TabsTrigger value="groups" className="relative text-xs font-semibold data-[state=active]:bg-gradient-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-md rounded-lg text-muted-foreground">
                Groups
                {groups.length > 0 && (
                  <span className="ml-1 text-xs text-white/80">({groups.length})</span>
                )}
              </TabsTrigger>
            </TabsList>
          </Tabs>
        </div>

        <div className="px-4 py-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
            <Input
              placeholder={chatTab === 'messages' ? "Search conversations..." : "Search groups..."}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10 rounded-full bg-card/90 border border-border text-foreground placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-primary/40 shadow-sm"
            />
          </div>
        </div>
      </header>

      {/* Scrollable Content */}
      <div className="flex-1 min-h-0">
      <main className="h-full min-h-0 overflow-y-auto overscroll-contain touch-pan-y" style={{ WebkitOverflowScrolling: 'touch', paddingBottom: 'var(--content-bottom-padding)' }}>
      
      {loading ? (
        <div className="divide-y divide-border">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="flex items-center gap-3 p-4 animate-pulse">
              <div className="w-14 h-14 rounded-full bg-muted" />
              <div className="flex-1 space-y-2">
                <div className="h-4 w-32 bg-muted rounded" />
                <div className="h-3 w-48 bg-muted rounded" />
              </div>
            </div>
          ))}
        </div>
      ) : chatTab === 'official' ? (
        // Official Notice Tab
        <OfficialNoticeList />
      ) : chatTab === 'notifications' ? (
        // Notifications Tab
        <NotificationList />
      ) : chatTab === 'messages' ? (
        // Messages Tab
        filteredConversations.length === 0 ? (
          <div className="text-center py-16">
            <div className="w-20 h-20 rounded-full mx-auto mb-4 flex items-center justify-center" style={{ background: 'rgba(168,85,247,0.1)', border: '1px solid rgba(168,85,247,0.2)' }}>
              <MessageCircle className="w-10 h-10 text-purple-400" />
            </div>
            <h3 className="text-lg font-semibold mb-2 text-foreground">No conversations yet</h3>
            <p className="text-muted-foreground text-sm mb-4">Start a conversation with someone!</p>
            <Button
 className="rounded-full font-bold text-primary-foreground bg-gradient-primary shadow-price"
              onClick={() => navigate('/')}
            >
              Find Hosts
            </Button>
          </div>
        ) : (
          <div className="divide-y divide-amber-100/60">
            {filteredConversations.map((conv) => (
              <motion.button
                key={conv.id}
                onClick={() => handleSelectConversation(conv)}
                className="w-full flex items-center gap-3 p-4 hover:bg-amber-50/60 transition-all duration-200 relative"
                whileTap={{ scale: 0.98 }}
              >
                {/* Unread glow indicator */}
                {conv.unread_count > 0 && (
                  <div className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-8 rounded-r-full bg-gradient-to-b from-fuchsia-500 to-purple-500 shadow-lg shadow-fuchsia-500/30" />
                )}
                <div className="relative">
                  {conv.other_user?.id ? (
                    <AvatarWithFrame
                      userId={conv.other_user.id}
                      src={conv.other_user?.avatar_url}
                      name={conv.other_user?.display_name || 'User'}
                      level={pickDisplayLevel(conv.other_user as any)}
                      size="md"
                      showAnimation={false}
                    />
                  ) : (
                    <Avatar className="w-14 h-14 ring-2 ring-purple-500/20">
                      <AvatarImage src={conv.other_user?.avatar_url || undefined} />
 <AvatarFallback className="bg-gradient-to-br from-purple-600 to-pink-600 text-white">
                        {conv.other_user?.display_name?.[0] || '?'}
                      </AvatarFallback>
                    </Avatar>
                  )}
                  {conv.other_user?.is_online && (
 <span className="absolute bottom-0 right-0 w-4 h-4 gradient-online border-2 border-card rounded-full z-10 shadow-lg shadow-green-500/30" />
                  )}
                </div>
                <div className="flex-1 text-left min-w-0">
                  <div className="flex items-center gap-2">
                    <h3 className="font-semibold truncate text-foreground">{conv.other_user?.display_name || 'User'}</h3>
                    {conv.other_user?.country_flag && (
                      <span className="text-xs">{conv.other_user.country_flag}</span>
                    )}
                    <LevelBadge level={pickDisplayLevel(conv.other_user as any)} size="xs" />
                    <span className="text-[10px] text-muted-foreground shrink-0 ml-auto font-medium">
                      {conv.last_message_at ? formatTime(conv.last_message_at) : ''}
                    </span>
                  </div>
                  <div className="flex items-center justify-between mt-0.5">
                    <p className="text-sm text-muted-foreground truncate">{conv.last_message || 'No messages yet'}</p>
                    {conv.unread_count > 0 && (
 <Badge className="bg-gradient-to-r from-red-500 to-pink-500 text-white border-0 rounded-full ml-2 shrink-0 shadow-lg shadow-red-500/20 text-[10px] px-2">
                        {conv.unread_count}
                      </Badge>
                    )}
                  </div>
                </div>
              </motion.button>
            ))}
          </div>
        )
      ) : (
        // Groups Tab
        filteredGroups.length === 0 ? (
          <div className="text-center py-16">
            <div className="w-20 h-20 rounded-full mx-auto mb-4 flex items-center justify-center" style={{ background: 'rgba(168,85,247,0.1)', border: '1px solid rgba(168,85,247,0.2)' }}>
              <Users className="w-10 h-10 text-purple-400" />
            </div>
            <h3 className="text-lg font-semibold mb-2 text-foreground">No groups yet</h3>
            <p className="text-muted-foreground text-sm mb-4">Create or join a group!</p>
            <Button
 className="rounded-full font-bold text-primary-foreground bg-gradient-primary shadow-price"
              onClick={() => setShowGroupActions(true)}
            >
              Get Started
            </Button>
          </div>
        ) : (
          <div className="divide-y divide-amber-100/60">
            {filteredGroups.map((group) => (
              <motion.button
                key={group.id}
                onClick={() => handleSelectGroup(group)}
                className="w-full flex items-center gap-3 p-4 hover:bg-amber-50/60 transition-all duration-200"
                whileTap={{ scale: 0.98 }}
              >
                <Avatar className="w-14 h-14 ring-2 ring-purple-500/20">
                  <AvatarImage src={group.avatar_url || undefined} />
 <AvatarFallback className="bg-gradient-to-br from-purple-600 to-pink-600 text-white">
                    <Users className="w-6 h-6" />
                  </AvatarFallback>
                </Avatar>
                <div className="flex-1 text-left min-w-0">
                  <div className="flex items-center gap-2">
                    <h3 className="font-semibold truncate text-foreground">{group.name}</h3>
                    <span className="text-xs text-muted-foreground">({group.member_count})</span>
                  </div>
                  {group.is_owner && (
 <Badge className="bg-gradient-gold text-accent-foreground border-0 text-xs mt-1">
                      <Crown className="w-3 h-3 mr-1" />
                      Owner
                    </Badge>
                  )}
                </div>
              </motion.button>
            ))}
          </div>
        )
      )}
      </main>
      </div>

      {/* Group Actions Sheet */}
      <Sheet open={showGroupActions} onOpenChange={setShowGroupActions}>
        <SheetContent side="bottom" className="rounded-t-3xl border-t border-amber-200/60" style={{ background: 'linear-gradient(180deg, hsl(40 40% 99%) 0%, hsl(40 40% 98%) 100%)' }}>
          <SheetHeader>
            <SheetTitle className="sr-only">Group Actions</SheetTitle>
          </SheetHeader>
          <div className="py-6 flex justify-center gap-8">
            <button
              className="flex flex-col items-center gap-2"
              onClick={() => {
                setShowGroupActions(false);
                setShowCreateGroup(true);
              }}
            >
              <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-fuchsia-500/20 to-purple-500/20 border border-fuchsia-500/25 flex items-center justify-center backdrop-blur-xl">
                <Users className="w-8 h-8 text-fuchsia-400" />
              </div>
              <span className="text-sm font-medium text-foreground">Create</span>
            </button>
            <button
              className="flex flex-col items-center gap-2"
              onClick={() => {
                setShowGroupActions(false);
                setShowSearchGroup(true);
              }}
            >
              <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-purple-500/20 to-indigo-500/20 border border-purple-500/25 flex items-center justify-center backdrop-blur-xl">
                <Search className="w-8 h-8 text-purple-400" />
              </div>
              <span className="text-sm font-medium text-foreground">Search</span>
            </button>
          </div>
        </SheetContent>
      </Sheet>

      {/* Create Group Dialog */}
      <Dialog open={showCreateGroup} onOpenChange={setShowCreateGroup}>
        <DialogContent className="max-w-sm mx-auto border border-amber-200/60" style={{ background: 'linear-gradient(180deg, hsl(40 40% 99%) 0%, hsl(40 40% 98%) 100%)' }}>
          <DialogHeader>
            <DialogTitle className="text-foreground">Create a group</DialogTitle>
          </DialogHeader>
          <div className="space-y-6 py-4">
            <div className="space-y-2">
              <Label htmlFor="groupName" className="text-foreground font-medium">Group Name</Label>
              <Input
                id="groupName"
                placeholder="Enter group name"
                value={newGroupName}
                onChange={(e) => setNewGroupName(e.target.value)}
                className="bg-card border-border text-foreground placeholder:text-muted-foreground focus-visible:ring-1 focus-visible:ring-primary/40"
              />
            </div>

            <div className="flex justify-center">
              <button 
                className="w-20 h-20 rounded-full border-2 border-dashed border-accent/60 flex items-center justify-center hover:bg-muted transition-colors overflow-hidden"
                onClick={() => groupPhotoInputRef.current?.click()}
              >
                {newGroupPhotoPreview ? (
                  <img src={newGroupPhotoPreview} alt="Group" className="w-full h-full object-cover" />
                ) : (
                  <Camera className="w-8 h-8 text-purple-400/50" />
                )}
              </button>
              <input
                ref={groupPhotoInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) {
                    setNewGroupPhoto(file);
                    setNewGroupPhotoPreview(URL.createObjectURL(file));
                  }
                }}
              />
            </div>

            <div className="space-y-3">
              <RadioGroup value={newGroupType} onValueChange={setNewGroupType}>
                <div className="flex items-center space-x-3 p-3 rounded-xl border border-border bg-card/60">
                  <RadioGroupItem value="basic" id="basic" />
                  <Label htmlFor="basic" className="flex-1 cursor-pointer">
                    <div className="flex items-center gap-2">
                      <Users className="w-5 h-5 text-purple-400" />
                      <span className="font-medium text-foreground">Basic Group</span>
                    </div>
                  </Label>
                </div>
                <div className="flex items-center space-x-3 p-3 rounded-xl border border-border bg-card/60">
                  <RadioGroupItem value="family" id="family" />
                  <Label htmlFor="family" className="flex-1 cursor-pointer">
                    <div className="flex items-center gap-2">
                      <Users className="w-5 h-5 text-pink-400" />
                      <span className="font-medium text-foreground">Family Group</span>
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">
                      One user can join one family group only
                    </p>
                  </Label>
                </div>
              </RadioGroup>
            </div>

            <Button
 className="w-full rounded-full font-bold text-primary-foreground bg-gradient-primary shadow-price"
              onClick={handleCreateGroup}
              disabled={!newGroupName.trim() || creatingGroup}
            >
              {creatingGroup ? 'Creating...' : 'Create Group'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Search Group Dialog */}
      <Dialog open={showSearchGroup} onOpenChange={setShowSearchGroup}>
        <DialogContent className="max-w-sm mx-auto border border-amber-200/60" style={{ background: 'linear-gradient(180deg, hsl(40 40% 99%) 0%, hsl(40 40% 98%) 100%)' }}>
          <DialogHeader>
            <DialogTitle className="text-foreground">Search Group</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="relative">
              <Input
                placeholder="Search a group by Group ID"
                value={groupSearchQuery}
                onChange={(e) => setGroupSearchQuery(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSearchGroup()}
 className="pr-12 bg-card border-border text-foreground placeholder:text-muted-foreground focus-visible:ring-1 focus-visible:ring-primary/40"
              />
              <Button
                size="icon"
                variant="ghost"
 className="absolute right-1 top-1/2 -translate-y-1/2 text-foreground hover:text-foreground hover:bg-muted"
                onClick={handleSearchGroup}
              >
                <Search className="w-5 h-5" />
              </Button>
            </div>

            {groupSearchResults.length > 0 && (
              <div className="space-y-2">
                {groupSearchResults.map((group) => (
                  <div
                    key={group.id}
                    className="flex items-center gap-3 p-3 rounded-xl border border-border bg-card/60"
                  >
                    <Avatar className="w-12 h-12 ring-2 ring-purple-500/20">
                      <AvatarImage src={group.avatar_url || undefined} />
 <AvatarFallback className="bg-gradient-to-br from-purple-600 to-pink-600 text-white">
                        <Users className="w-5 h-5" />
                      </AvatarFallback>
                    </Avatar>
                    <div className="flex-1 min-w-0">
                      <h4 className="font-semibold truncate text-foreground">{group.name}</h4>
                      <p className="text-xs text-muted-foreground">
                        {group.member_count} members • {group.group_type}
                      </p>
                    </div>
                    <Button
                      size="sm"
 className="rounded-full font-bold text-primary-foreground bg-gradient-primary shadow-price"
                      onClick={() => handleJoinGroup(group.id)}
                    >
                      Join
                    </Button>
                  </div>
                ))}
              </div>
            )}

            {groupSearchQuery && groupSearchResults.length === 0 && (
              <p className="text-center text-muted-foreground py-8">No groups found</p>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Group Settings Panel */}
      {showGroupSettings && selectedGroup && currentUserId && (
        <GroupSettingsPanel
          group={selectedGroup}
          currentUserId={currentUserId}
          onClose={() => setShowGroupSettings(false)}
          onGroupUpdated={() => fetchGroups()}
          onLeaveGroup={() => {
            setShowGroupSettings(false);
            setSelectedGroup(null);
            setGroupMessages([]);
            fetchGroups();
          }}
        />
      )}

      {/* Report User Dialog */}
      {selectedConversation?.other_user?.id && currentUserId && (
        <ReportUserDialog
          open={showReportDialog}
          onOpenChange={setShowReportDialog}
          reportedUserId={selectedConversation.other_user.id}
          reporterUserId={currentUserId}
          contextType="chat"
          contextId={selectedConversation.id}
        />
      )}

      <BottomNavigation activeTab={activeTab} onTabChange={(path) => {
        setActiveTab(path);
        navigate(path);
      }} />

      <ImageViewer src={imageViewer.viewerImage} open={imageViewer.isOpen} onClose={imageViewer.closeImage} alt="Shared Image" />
      <NumberSharingWarningDialog
        open={numberWarning.warningState.open}
        onClose={numberWarning.closeWarning}
        violationNumber={numberWarning.warningState.violationNumber}
        beansDeducted={numberWarning.warningState.beansDeducted}
        isBanned={numberWarning.warningState.isBanned}
        isGenericWarning={numberWarning.warningState.isGenericWarning}
      />
    </div>
  );
};

export default Chat;
