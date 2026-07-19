import React, { useState, useEffect, useRef, useMemo, Suspense, lazy, useCallback } from "react";


import { useContentModeration } from "@/hooks/useContentModeration";
import { detectAndProcessViolation, isContactRestrictedHost } from "@/utils/contactDetection";
import { scanImageForContactInfo } from "@/utils/imageContactDetection";
import { NumberSharingWarningDialog, useNumberSharingWarning } from "@/components/moderation/NumberSharingWarningDialog";
import { ImageViewer, useImageViewer } from "@/components/ui/image-viewer";
import { useMessageReactions } from "@/hooks/useMessageReactions";
import { ReactionBar } from "@/components/chat/ReactionBar";
import { ReactionPickerSheet } from "@/components/chat/ReactionPickerSheet";
import { MessageRowShell } from "@/components/chat/MessageRowShell";
import { MediaGalleryViewer, type GalleryItem } from "@/components/chat/MediaGalleryViewer";
import { useNavigate, useSearchParams } from "react-router-dom";
import { ArrowLeft, Search, MoreVertical, Send, Smile, Users, MessageCircle, Crown, X, Phone as VideoCallIcon, Mic, Languages, Phone, ChevronRight, ChevronDown, Plus, Gamepad2, Settings, ShieldAlert, MessageSquareReply, SmilePlus, Info, Paperclip, FileText } from "lucide-react";
import { hapticFeedback } from "@/utils/nativeUtils";
const GroupSettingsPanel = lazy(() => import("@/components/chat/GroupSettingsPanel").then(m => ({ default: m.GroupSettingsPanel })));
import { MessageStatusIndicator } from "@/components/chat/MessageStatusIndicator";

import { VoiceMessagePlayer } from "@/components/chat/VoiceMessagePlayer";
import { VoiceWaveform } from "@/components/chat/VoiceWaveform";
import { SmartImage } from "@/components/chat/SmartImage";
import { SmartVideo } from "@/components/chat/SmartVideo";
const EmojiPicker = lazy(() => import("@/components/chat/EmojiPicker").then(m => ({ default: m.EmojiPicker })));
const MediaUploader = lazy(() => import("@/components/chat/MediaUploader").then(m => ({ default: m.MediaUploader })));
import { usePersistedCache } from "@/hooks/usePersistedCache";
import { loadChatSnapshot, saveChatSnapshot } from "@/utils/chatSnapshots";
import { useNativeAudioRecorder } from "@/hooks/useNativeAudioRecorder";
import { useNativeChatUI } from "@/hooks/useNativeChatUI";
import { emitInboxTyping } from "@/hooks/useInboxTyping";
import { useStableChatScroll } from "@/hooks/useStableChatScroll";
import type { NativeChatMessage } from "@/plugins/NativeChatUI";

type CreateGroupResult = {
  success: boolean;
  group_id?: string;
  group_code?: string;
  error?: string;
};

const getCreateGroupErrorMessage = (error?: string) => {
  const normalized = (error || '').toLowerCase();
  if (!normalized) return "Failed to create group";
  if (normalized.includes('auth_required') || normalized.includes('not_authenticated')) return "Please sign in again to create a group";
  if (normalized.includes('invalid_group_name')) return "Group name must be 1 to 80 characters";
  if (normalized.includes('invalid_group_type')) return "Please choose a valid group type";
  if (normalized.includes('user_blocked')) return "Your account cannot create groups right now";
  if (normalized.includes('family_limit_reached') || normalized.includes('family_group_exclusive')) return "You can only be in 1 family group";
  if (normalized.includes('basic_limit_reached')) return "You can join max 20 general groups";
  if (normalized.includes('profile_not_ready')) return "Your profile is still being prepared. Please try again";
  if (normalized.includes('duplicate_group_or_member') || normalized.includes('duplicate_group_member')) return "This group could not be completed. Please try again";
  return "Failed to create group";
};

const normalizeCreateGroupResult = (value: unknown): CreateGroupResult => {
  if (typeof value === 'string') {
    return { success: true, group_id: value };
  }
  if (value && typeof value === 'object') {
    const result = value as Partial<CreateGroupResult>;
    return {
      success: result.success === true,
      group_id: result.group_id,
      group_code: result.group_code,
      error: result.error,
    };
  }
  return { success: false, error: 'create_group_failed' };
};

// UNIFIED GIFTING - SINGLE LINK for all sections (Live, Party, Call, Chat, Profile)
// Change @/features/shared/gifting = Change everywhere automatically
import type { GiftData } from "@/features/shared/gifting";
const GiftPanel = lazy(() => import("@/components/live/GiftPanel").then(m => ({ default: m.GiftPanel })));
const LiveGameSelector = lazy(() => import("@/components/games/LiveGameSelector").then(m => ({ default: m.LiveGameSelector })));
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";

import { Badge } from "@/components/ui/badge";
import { BottomNavigation } from "@/components/layout/BottomNavigation";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { subscribeToTables } from "@/hooks/useUniversalRealtime";
import { useCall } from "@/components/call/CallContext";
import { toast } from "@/utils/hybridToast";
import { motion, AnimatePresence } from "framer-motion";
import { useSound } from "@/hooks/useSound";
import { getCachedHostGiftPercent, ensureHostGiftPercentLoaded } from "@/hooks/useHostGiftPercent";
import { callGiftService } from "@/utils/giftServiceClient";
import { emitLuckyWin } from "@/components/lucky/LuckyGiftHost";
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
import { messageOutbox, type OutboxItem } from "@/lib/messageOutbox";
import { useMessageOutboxDrain } from "@/hooks/useMessageOutboxDrain";
import { useNotifications } from "@/hooks/useNotifications";
import { useGlobalUnreadCount, formatBadgeCount } from "@/hooks/useGlobalUnreadCount";
const GiftEmojiAnimation = lazy(() => import("@/components/chat/GiftEmojiAnimation").then(m => ({ default: m.GiftEmojiAnimation })));
import { FlyingGiftAnimation, InlineGiftRow, useFlyingGifts } from "@/features/shared/gifting";
import AvatarWithFrame from "@/components/common/AvatarWithFrame";
import TraderBadge from "@/components/common/TraderBadge";
import { LevelBadge } from "@/components/common/LevelBadge";
import { trackTaskProgress } from "@/hooks/useTaskProgress";
const ReportUserDialog = lazy(() => import("@/components/report/ReportUserDialog").then(m => ({ default: m.ReportUserDialog })));
import { recordClientError } from "@/utils/clientErrorLog";
import { pickDisplayLevel } from "@/utils/displayLevel";
import { normalizeGiftMediaUrl } from "@/utils/giftMediaUrl";
import icon3dTranslate from "@/assets/icon-3d-translate.png";
import icon3dGift from "@/assets/icon-3d-gift.png";
import icon3dVoice from "@/assets/icon-3d-voice.png";
import icon3dGames from "@/assets/icon-3d-games.png";
import { getVapCompositeHint } from "@/utils/vapDetection";
import { detectProfessionalAnimationFormat } from "@/utils/animationFormat";
import { warmGiftForInstantPlay, warmGiftUrlsForInstantPlay } from "@/utils/instantGiftWarmup";
import { ChatListView } from "@/components/chat/ChatListView";
import { ChatDialogs } from "@/components/chat/ChatDialogs";
import { ChatActiveHeader } from "@/components/chat/ChatActiveHeader";
import { DirectChatBubble } from "@/components/chat/UnifiedChatMessage";
import { getCachedGifts } from "@/hooks/useGiftPrefetch";

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
  status?: 'sending' | 'queued' | 'sent' | 'delivered' | 'read';
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
// URLs may be absolute, Supabase storage paths, or project-local Lovable asset paths.
const parseGiftContent = (content: string): { mediaUrl: string | null; emoji: string; soundUrl: string | null; animationFormat: string | null; animationConfigUrl: string | null } => {
  const mediaMatch = content.match(/\[Gift:\s*([^|\s\]]+)\|/i);
  const emojiMatch = content.match(/\[Gift:\s*(?:[^|\s\]]+\|)?([^\s\]]+)/i);
  const soundMatch = content.match(/\|\s*snd:([^\s|\]]+)/i);
  const formatMatch = content.match(/\|\s*fmt:([a-z0-9_-]+)/i);
  const configMatch = content.match(/\|\s*cfg:([^\s|\]]+)/i);
  const mediaUrl = normalizeGiftMediaUrl(mediaMatch?.[1]) ?? null;

  return {
    mediaUrl,
    emoji: emojiMatch?.[1] ?? '🎁',
    soundUrl: normalizeGiftMediaUrl(soundMatch?.[1]) ?? null,
    animationFormat: formatMatch?.[1] || (mediaUrl ? detectProfessionalAnimationFormat(mediaUrl) : null),
    animationConfigUrl: normalizeGiftMediaUrl(configMatch?.[1]) ?? null,
  };
};

const getGiftAnimationSignature = (content: string, senderId?: string | null): string => {
  const { mediaUrl, emoji } = parseGiftContent(content || '');
  const detailMatch = content.match(/\[Gift:\s*(?:[^|\s\]]+\|)?[^\s\]]+\s+(.+?)\s+x(\d+)/i);
  const name = detailMatch?.[1]?.trim().toLowerCase() || 'gift';
  const count = detailMatch?.[2] || '1';
  return `${senderId || 'unknown'}:${mediaUrl || emoji}:${name}:x${count}`;
};

const PLAYED_GIFT_ANIMATION_STORAGE_PREFIX = 'merilive:chat-played-gift-animations:v1:';
const MAX_PLAYED_GIFT_ANIMATION_IDS = 300;

// Helper function to clean gift message for preview (removes URLs, shows only emoji + name + beans)
const cleanGiftMessageForPreview = (content: string): string => {
  if (!/^\[Gift:/i.test(content)) return content;

  // Match format: [Gift: URL|EMOJI NAME xCOUNT | +BEANS beans] or [Gift: EMOJI NAME xCOUNT | +BEANS beans]
  // Extract just emoji, name, count and beans - remove URL completely
  const urlRemoved = content
    .replace(/\[Gift:\s*[^|\s\]]+\|/i, '[Gift: ')
    // Strip optional trailing fields before final ] so preview regex matches
    .replace(/\|\s*snd:[^|\]]+/i, '')
    .replace(/\|\s*fmt:[^|\]]+/i, '')
    .replace(/\|\s*cfg:[^|\]]+/i, '')
    .replace(/\|\s*\+\d+\s*lucky/i, '');

  // Parse the clean content (supports both old and new format with optional diamonds segment)
  const match = urlRemoved.match(/\[Gift:\s*([^\s]+)\s+([^x]+?)\s*x(\d+)\s*\|(?:\s*-\d+\s*diamonds\s*\|)?\s*\+(\d+)\s*beans\s*\]/i);
  if (match) {
    const [, emoji, name, count, beans] = match;
    return `[Gift: ${emoji} ${name.trim()} x${count} | +${Number(beans).toLocaleString()} bea...]`;
  }

  // Fallback - just remove URL part
  return urlRemoved;
};

// Build a clean WhatsApp-style preview for reply bars / quoted snippets.
// Hides raw URLs and gift payloads; surfaces a friendly label + optional thumb.
const summarizeMessageForReply = (
  content: string,
  messageType?: string | null
): { label: string; thumb: string | null; kind: 'gift' | 'image' | 'video' | 'audio' | 'text' } => {
  const c = (content || '').trim();
  const type = (messageType || '').toLowerCase();

  if (type === 'gift' || /^\[Gift:/i.test(c)) {
    const { mediaUrl, emoji } = parseGiftContent(c);
    const nameMatch = c.match(/\[Gift:\s*(?:[^|\s\]]+\|)?[^\s\]]+\s+(.+?)\s+x(\d+)/i);
    const giftName = nameMatch?.[1]?.trim() || 'Gift';
    const count = nameMatch?.[2];
    const label = `${emoji || '🎁'} ${giftName}${count && Number(count) > 1 ? ` ×${count}` : ''}`;
    const thumb = mediaUrl && /\.(png|jpe?g|gif|webp)(\?|$)/i.test(mediaUrl) ? mediaUrl : null;
    return { label, thumb, kind: 'gift' };
  }

  if (type === 'audio' || /^\[(Voice|Audio):/i.test(c) || /\.(webm|mp3|wav|ogg|m4a)(\?|$)/i.test(c)) {
    return { label: 'Voice message', thumb: null, kind: 'audio' };
  }

  if (type === 'image' || /^\[Image:/i.test(c) || /\.(jpe?g|png|gif|webp)(\?|$)/i.test(c)) {
    const url = c.replace(/^\[Image:\s*/i, '').replace(/\]$/, '');
    return { label: 'Photo', thumb: /^https?:\/\//.test(url) ? url : null, kind: 'image' };
  }

  if (type === 'video' || /^\[Video:/i.test(c) || /\.(mp4|mov|avi|mkv)(\?|$)/i.test(c)) {
    const url = c.replace(/^\[Video:\s*/i, '').replace(/\]$/, '');
    return { label: 'Video', thumb: /^https?:\/\//.test(url) ? url : null, kind: 'video' };
  }

  const text = c.replace(/^\[[^\]]+\]\s*/, '').slice(0, 80) || 'Message';
  return { label: text, thumb: null, kind: 'text' };
};



const messageTimestamp = (value?: string | null) => {
  const time = value ? new Date(value).getTime() : 0;
  return Number.isFinite(time) ? time : 0;
};

const dedupeAndSortMessages = <T extends { id: string; created_at: string }>(items: T[]): T[] => {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const item of items) {
    if (seen.has(item.id)) continue;
    seen.add(item.id);
    out.push(item);
  }
  return out.sort((a, b) => messageTimestamp(a.created_at) - messageTimestamp(b.created_at));
};

const sameMessageOrder = <T extends { id: string; created_at: string }>(a: T[], b: T[]) =>
  a.length === b.length && a.every((item, index) => item.id === b[index]?.id && item.created_at === b[index]?.created_at);

const extractChatMediaPath = (content?: string | null): string => {
  const raw = (content || '').trim();
  return raw
    .replace(/^\[(Image|Video|Audio|Voice|File):\s*/i, '')
    .replace(/\]$/i, '')
    .trim();
};

const isPlainChatStorageKey = (value: string) => {
  if (!value) return false;
  if (/^https?:|^blob:|^data:/i.test(value)) return false;
  if (/^\[/.test(value)) return false;
  if (/[\[\]\s|\\<>"'`]/.test(value)) return false;
  if (!value.includes('/')) return false;
  return /^[A-Za-z0-9._~!$&'()+,;=:@/-]+$/.test(value);
};

const isChatImageMessage = (messageType?: string | null, content?: string | null) => {
  const noQuery = extractChatMediaPath(content).split('?')[0];
  return messageType === 'image'
    || /^\[Image:/i.test(content || '')
    || /\.(jpe?g|png|gif|webp|heic|heif|bmp|avif)$/i.test(noQuery);
};

const isChatVideoMessage = (messageType?: string | null, content?: string | null) => {
  // Voice notes upload as .webm too — make sure audio messages don't fall into the video branch.
  if (messageType === 'audio' || messageType === 'voice') return false;
  if (/^\[(Audio|Voice):/i.test(content || '')) return false;
  const noQuery = extractChatMediaPath(content).split('?')[0];
  if (/voice-\d+\.webm$/i.test(noQuery)) return false;
  return messageType === 'video'
    || /^\[Video:/i.test(content || '')
    || /\.(mp4|mov|avi|mkv|webm)$/i.test(noQuery);
};

const isChatAudioMessage = (messageType?: string | null, content?: string | null) => {
  const noQuery = extractChatMediaPath(content).split('?')[0];
  return messageType === 'audio'
    || messageType === 'voice'
    || /^\[(Audio|Voice):/i.test(content || '')
    || /\.(webm|mp3|wav|ogg|m4a|aac|flac)$/i.test(noQuery);
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
  const [convCache, setConvCache, hadConvCache] = usePersistedCache<Conversation[]>('chat:conversations', []);
  const [conversations, setConversations] = useState<Conversation[]>(convCache ?? []);
  const [groups, setGroups] = useState<Group[]>([]);
  const [messages, setMessages] = useState<Message[]>([]);
  const [groupMessages, setGroupMessages] = useState<GroupMessage[]>([]);
  const MESSAGES_PAGE_SIZE = 100;
  const [visibleMessageCount, setVisibleMessageCount] = useState<number>(MESSAGES_PAGE_SIZE);
  const [signedChatMediaUrls, setSignedChatMediaUrls] = useState<Record<string, string>>({});
  const [pendingMedia, setPendingMedia] = useState<{ url: string; type: 'image' | 'video' | 'audio' | 'document'; previewUrl?: string } | null>(null);

  // Reply state
  const [replyingTo, setReplyingTo] = useState<{ messageId: string; content: string; senderName: string; senderId: string; messageType?: string | null } | null>(null);
  const [replyMessages, setReplyMessages] = useState<Record<string, { content: string; sender_id: string; message_type?: string | null }>>({});
  
  // Reaction picker target message id
  const [reactionPickerMsgId, setReactionPickerMsgId] = useState<string | null>(null);

  // Media gallery viewer
  const [galleryOpen, setGalleryOpen] = useState(false);
  const [galleryStartId, setGalleryStartId] = useState<string | null>(null);

  // (reactions hook is initialized below, after currentUserId is declared)

  
  
  // Message info dialog
  const [showMessageInfo, setShowMessageInfo] = useState(false);
  const [messageInfoMessage, setMessageInfoMessage] = useState<Message | null>(null);

  // 🛡️ DM dedup guard: enforce one row per message id at all times. Catches
  // any race between optimistic insert, REST fetch, realtime INSERT,
  // broadcast and persistDirectMessage so the same id never renders twice.
  useEffect(() => {
    setMessages(prev => {
      const next = dedupeAndSortMessages(prev);
      return sameMessageOrder(prev, next) ? prev : next;
    });
  }, [messages]);
  useEffect(() => {
    setGroupMessages(prev => {
      const next = dedupeAndSortMessages(prev);
      return sameMessageOrder(prev, next) ? prev : next;
    });
  }, [groupMessages]);

  // Phase 7 — Instant Paint: keep the localStorage snapshot of the active
  // thread in sync with subsequent realtime inserts / optimistic sends so the
  // next reopen also paints in <16ms. Debounced via rAF + 400ms idle.
  const snapshotConvIdRef = useRef<string | null>(null);
  useEffect(() => { snapshotConvIdRef.current = selectedConversation?.id ?? null; });
  useEffect(() => {
    const convId = selectedConversation?.id;
    if (!convId || !messages.length) return;
    const t = setTimeout(() => {
      if (snapshotConvIdRef.current === convId) {
        try { saveChatSnapshot(convId, messages); } catch {}
      }
    }, 400);
    return () => clearTimeout(t);
  }, [messages, selectedConversation?.id]);

  useEffect(() => {
    const paths = [...messages, ...groupMessages]
      .map((m) => extractChatMediaPath(m.content || ''))
      .concat(pendingMedia?.url || '')
      .filter(isPlainChatStorageKey);
    const missing = [...new Set(paths)].filter((path) => !signedChatMediaUrls[path]);
    if (missing.length === 0) return;
    let cancelled = false;
    Promise.all(missing.map(async (path) => {
      const { data } = await supabase.storage.from('chat-media').createSignedUrl(path, 60 * 60 * 24 * 365 * 10);
      return [path, data?.signedUrl || path] as const;
    })).then((entries) => {
      if (!cancelled) setSignedChatMediaUrls(prev => ({ ...prev, ...Object.fromEntries(entries) }));
    });
    return () => { cancelled = true; };
  }, [messages, groupMessages, pendingMedia?.url, signedChatMediaUrls]);
  const [message, setMessage] = useState("");
  const nativeRecorder = useNativeAudioRecorder();

  const [loading, setLoading] = useState(!hadConvCache);
  const [sending, setSending] = useState(false);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);

  // Persistent reactions (DB-backed, realtime synced)
  const activeMessageIds = useMemo(() => {
    const src = selectedGroup ? groupMessages : messages;
    return src.map((m: any) => m.id).filter(Boolean);
  }, [messages, groupMessages, selectedGroup]);
  const reactionConvKey = selectedGroup?.id || selectedConversation?.id || null;
  const { reactionsByMessage, toggleReaction } = useMessageReactions({
    currentUserId: currentUserId || "",
    conversationKey: reactionConvKey,
    messageIds: activeMessageIds,
  });
  const [myProfile, setMyProfile] = useState<{ display_name: string | null; avatar_url: string | null; user_level: number | null; host_level: number | null; max_user_level: number | null; gender: string | null; is_host: boolean; is_agency_owner?: boolean | null; is_topup_helper?: boolean | null } | null>(null);
  const [userDiamonds, setUserCoins] = useState(0);
  const [searchQuery, setSearchQuery] = useState("");
  const [isOtherTyping, setIsOtherTyping] = useState(false);
  const typingTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const typingChannelRef = useRef<any>(null);
  const directMessageChannelRef = useRef<any>(null);
  const receiptChannelRef = useRef<any>(null);
  const recentGiftAnimationsRef = useRef<Map<string, number>>(new Map());
  const playedGiftMessageIdsRef = useRef<Set<string>>(new Set());
  const playedGiftStorageUserRef = useRef<string | null>(null);
  const [otherUserTrader, setOtherUserTrader] = useState<{ isTrader: boolean; traderLevel: number }>({ isTrader: false, traderLevel: 0 });
  const [showScrollToBottom, setShowScrollToBottom] = useState(false);
  const [unreadBelow, setUnreadBelow] = useState(0);
  const chatThreadKey = selectedConversation?.id || selectedGroup?.id || null;
  const {
    scrollRef: chatScrollRef,
    isNearBottomRef: wasNearBottomRef,
    scrollToLatest,
  } = useStableChatScroll({
    dependency: `${messages.length}:${groupMessages.length}:${isOtherTyping ? 1 : 0}`,
    resetKey: chatThreadKey,
    bottomThreshold: 120,
    initialPinFrames: 5,
  });

  const hardPinChatToLatest = useCallback(() => {
    scrollToLatest('instant');
    wasNearBottomRef.current = true;
    setShowScrollToBottom(false);
    setUnreadBelow(0);
  }, [scrollToLatest, wasNearBottomRef]);

  const anchorChatToBottomSoon = useCallback(() => {
    hardPinChatToLatest();
  }, [hardPinChatToLatest]);
  
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
  const [animatingGiftFormat, setAnimatingGiftFormat] = useState<string | null>(null);
  const [animatingGiftConfigUrl, setAnimatingGiftConfigUrl] = useState<string | null>(null);
  const [animatingGiftSound, setAnimatingGiftSound] = useState<string | null>(null);
  const [giftAnimationInstance, setGiftAnimationInstance] = useState(0);
  // Unified flying-gift pill (same Bigo/Chamet style as Live/Party/Call)
  const { gifts: flyingGifts, addGift: addFlyingGift, removeGift: removeFlyingGift } = useFlyingGifts();
  const USE_UNIFIED_FULLSCREEN_GIFT_PLAYER = true;
  
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
  
  // ✅ Gifts loaded from real database via canonical GiftPanel
  // No hardcoded gift data - 100% real DB
  
  // Start Voice Recording
  const startVoiceRecording = async () => {
    if (nativeRecorder.isNative) {
      const success = await nativeRecorder.start();
      if (!success) toast.error("Failed to start native recorder");
      return;
    }
    
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
  const stopVoiceRecording = async () => {
    if (nativeRecorder.isNative) {
      const result = await nativeRecorder.stop();
      if (result) {
        setAudioBlob(result.blob);
        setRecordingDuration(Math.floor(result.durationMs / 1000));
      }
      return;
    }

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
    if (nativeRecorder.isNative) {
      nativeRecorder.cancel();
      setAudioBlob(null);
      setRecordingDuration(0);
      return;
    }
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
              messageType: 'audio',
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

        appendSentGroupMessage(newMsg);
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
    if (isRecording || nativeRecorder.isRecording) {
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
    
    const totalCost = gift.diamonds * count;
    
    // Check diamonds immediately (use cached value)
    if (userDiamonds < totalCost) {
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
    const animationUrl = normalizeGiftMediaUrl(gift.animation_url) || '';
    const iconUrl = normalizeGiftMediaUrl(gift.icon_url) || '';
    const giftMediaUrl = animationUrl || iconUrl;
    const giftSoundUrl = normalizeGiftMediaUrl((gift as any).sound_url) || '';
    const giftAnimationFormat = gift.animation_format || (giftMediaUrl && (getVapCompositeHint(giftMediaUrl) ? 'vap' : detectProfessionalAnimationFormat(giftMediaUrl))) || null;
    warmGiftForInstantPlay(gift as any);
    const estimatedBeansEarned = Math.floor(totalCost * getCachedHostGiftPercent() / 100);
    void ensureHostGiftPercentLoaded();
    const formatSuffix = giftAnimationFormat ? ` | fmt:${giftAnimationFormat}` : '';
    const giftConfigUrl = normalizeGiftMediaUrl(gift.animation_config_url) || '';
    const configSuffix = giftConfigUrl ? ` | cfg:${giftConfigUrl}` : '';
    const soundSuffix = giftSoundUrl ? ` | snd:${giftSoundUrl}` : '';
    const optimisticGiftMessage = giftMediaUrl
      ? `[Gift: ${giftMediaUrl}|${giftEmoji} ${gift.name} x${count} | -${totalCost} diamonds | +${estimatedBeansEarned} beans${formatSuffix}${configSuffix}${soundSuffix}]`
      : `[Gift: ${giftEmoji} ${gift.name} x${count} | -${totalCost} diamonds | +${estimatedBeansEarned} beans${formatSuffix}${configSuffix}${soundSuffix}]`;

    const giftAnimationSignature = getGiftAnimationSignature(optimisticGiftMessage, currentUserId);
    recentGiftAnimationsRef.current.set(giftAnimationSignature, Date.now());

    // Unified flying-gift pill — same Bigo/Chamet style as Live/Party/Call
    addFlyingGift({
      senderId: currentUserId,
      senderName: 'You',
      receiverName: selectedConversation.other_user.display_name || 'User',
      giftName: gift.name,
      giftIcon: giftEmoji,
      giftImageUrl: iconUrl || undefined,
      animationUrl: giftMediaUrl || undefined,
      animationFormat: giftAnimationFormat,
      animationConfigUrl: giftConfigUrl || undefined,
      soundUrl: giftSoundUrl || undefined,
      giftColor: 'bg-pink-500/50',
      count,
      diamonds: gift.diamonds,
      isOwnGift: true,
      beansEarned: estimatedBeansEarned,
    });

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
        animationFormat: giftAnimationFormat,
        animationConfigUrl: giftConfigUrl || null,
        soundUrl: giftSoundUrl || null,
      },
    }).catch(() => {});

    // ========== BACKGROUND PROCESSING ==========
    (async () => {
      try {
        const response = await callGiftService({
          receiverId: selectedConversation.other_user.id,
          giftId: gift.id,
          quantity: count,
          // DM-context marker — the trigger `notify_on_gift_received` skips
          // creating a duplicate `gift_received` notification when the gift
          // was sent from a direct-message chat (it already shows inside the
          // Messages section as a gift bubble).
          idempotencyKey: `dm_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`,
        });

        if (!response.success) {
          const rawErr = (response as any).error;
          const realMsg = typeof rawErr === 'string'
            ? rawErr
            : (rawErr && typeof rawErr === 'object' && typeof (rawErr as any).message === 'string')
              ? (rawErr as any).message
              : "Gift failed";
          console.error('[Chat Gift] Edge function error:', rawErr);
          recordClientError({ label: "Chat.response", message: realMsg });
          // Refund on failure
          setUserCoins(prev => prev + totalCost);
          setMessages(prev => prev.filter(m => m.id !== optimisticGiftRow.id));
          toast.error(`Gift failed: ${realMsg}`);
          return;
        }
        
        // Get beans amount from response for message
        const beansEarned = response.hostReceived || Math.floor(totalCost * 0.6);
        // 🎰 Lucky-gift diamond bonus (random payout for is_lucky gifts)
        const luckyBonus = response.isLucky && (response.diamondBonus || 0) > 0
          ? (response.diamondBonus || 0)
          : 0;
        const luckySuffix = luckyBonus > 0 ? ` | +${luckyBonus} lucky` : '';
        if (luckyBonus > 0) {
          emitLuckyWin({
            spent: totalCost,
            bonus: luckyBonus,
            giftName: gift.name,
            giftIconUrl: iconUrl || undefined,
          });
        }

        // Send gift as message - include animation/icon URL + diamond cost + beans for asymmetric render
        // Format: [Gift: URL|EMOJI NAME xCOUNT | -DIAMONDS diamonds | +BEANS beans | +LUCKY lucky]
        const messageContent = giftMediaUrl
          ? `[Gift: ${giftMediaUrl}|${giftEmoji} ${gift.name} x${count} | -${totalCost} diamonds | +${beansEarned} beans${luckySuffix}${formatSuffix}${configSuffix}${soundSuffix}]`
          : `[Gift: ${giftEmoji} ${gift.name} x${count} | -${totalCost} diamonds | +${beansEarned} beans${luckySuffix}${formatSuffix}${configSuffix}${soundSuffix}]`;

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
          .select('diamonds')
          .eq('id', currentUserId)
          .single();
        
        if (updatedProfile) {
          setUserCoins(updatedProfile.diamonds || 0);
          // CRITICAL: Update global cached balance so Profile "My Diamonds" reflects instantly
          const { updateCachedBalance } = await import("@/hooks/useUserBalance");
          updateCachedBalance(updatedProfile.diamonds || 0);
        }
      } catch (error) {
        const msg = error instanceof Error
          ? error.message
          : (error && typeof error === 'object' && typeof (error as any).message === 'string')
            ? (error as any).message
            : (typeof error === 'string' ? error : 'Unknown error');
      console.error('[Chat Gift] Background error:', error);
        recordClientError({ label: "Chat.messageContent", message: msg });
        // Refund on error
        setUserCoins(prev => prev + totalCost);
        setMessages(prev => prev.filter(m => m.id !== optimisticGiftRow.id));
      toast.error(msg === 'Failed to fetch' ? 'Gift delivery is temporarily unavailable. Please try again.' : `Gift failed: ${msg}`);
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
    const groupId = searchParams.get('group');
    if (groupId && currentUserId && !selectedGroup) {
      (async () => {
        const { data } = await supabase
          .from('groups')
          .select('id, name, avatar_url, group_type, group_code, owner_id, created_by, member_count, is_active')
          .eq('id', groupId)
          .maybeSingle();
        if (data) {
          const { data: mem } = await supabase
            .from('group_members')
            .select('role')
            .eq('group_id', groupId)
            .eq('user_id', currentUserId)
            .maybeSingle();
          handleSelectGroup({
            ...(data as any),
            is_owner: (data as any).owner_id === currentUserId || (data as any).created_by === currentUserId,
            role: mem?.role || 'member',
          } as any);
        }
      })();
    }
  }, [searchParams, currentUserId]);

  // Track unread messages that arrive while the user is scrolled up.
  const prevMessageCountRef = useRef(0);
  useEffect(() => {
    const total = (messages?.length || 0) + (groupMessages?.length || 0);
    const prev = prevMessageCountRef.current;
    if (total > prev && showScrollToBottom) {
      setUnreadBelow((n) => n + (total - prev));
    }
    prevMessageCountRef.current = total;
  }, [messages, groupMessages, showScrollToBottom]);

  const upsertLiveMessageRef = useRef(upsertLiveMessage);
  upsertLiveMessageRef.current = upsertLiveMessage;
  const selectedConversationRef = useRef(selectedConversation);
  selectedConversationRef.current = selectedConversation;

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
          upsertLiveMessageRef.current(payload.payload.message);
        }
      )
      .on(
        'broadcast',
        { event: 'gift_animation' },
        (payload: any) => {
          if (payload.payload?.conversationId !== selectedConversation.id || !payload.payload?.content) return;
          if (payload.payload?.senderId === currentUserId) return;
          if (payload.payload?.soundUrl && !payload.payload.content.includes('| snd:')) {
            payload.payload.content = `${payload.payload.content.replace(/\]$/, '')} | snd:${payload.payload.soundUrl}]`;
          }
          playGiftAnimationFromContent(
            payload.payload.content,
            payload.payload.senderId,
            true,
            payload.payload.animationFormat || null,
            payload.payload.animationConfigUrl || null,
          );
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
  }, [selectedConversation?.id, currentUserId]);

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

  // Broadcast typing event — per-thread (existing) + per-peer inbox (Phase 2.5).
  const lastInboxTypingAt = useRef(0);
  const broadcastTyping = useCallback(() => {
    if (typingChannelRef.current && currentUserId) {
      typingChannelRef.current.send({
        type: 'broadcast',
        event: 'typing',
        payload: { userId: currentUserId },
      });
    }
    // Throttled inbox-typing ping so the peer's chat-list row shows "typing…"
    // even when their thread isn't open.
    const peerId = selectedConversation?.other_user?.id;
    const convId = selectedConversation?.id;
    if (peerId && convId && currentUserId) {
      const now = Date.now();
      if (now - lastInboxTypingAt.current > 1500) {
        lastInboxTypingAt.current = now;
        void emitInboxTyping({ toUserId: peerId, fromUserId: currentUserId, conversationId: convId });
      }
    }
  }, [currentUserId, selectedConversation?.other_user?.id, selectedConversation?.id]);

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

  useEffect(() => {
    if (!selectedGroup?.id) return;

    const unsubscribe = subscribeToTables(
      `chat-group-messages-${selectedGroup.id}`,
      ['group_messages'],
      (_table: string, event: string, payload: any) => {
        if (payload?.group_id !== selectedGroup.id) return;

        if (event === 'INSERT') {
          setGroupMessages(prev => {
            if (prev.some(m => m.id === payload.id)) return prev;
            return [...prev, { ...payload, sender: null }];
          });

          const senderId = payload.sender_id;
          if (senderId) {
            supabase
              .from('profiles_public')
              .select('id, display_name, avatar_url, user_level, host_level, max_user_level, gender, is_host')
              .eq('id', senderId)
              .maybeSingle()
              .then(({ data }) => {
                if (!data) return;
                setGroupMessages(prev => prev.map(m =>
                  m.id === payload.id ? { ...m, sender: data } : m
                ));
              });
          }
        }
      }
    );

    return unsubscribe;
  }, [selectedGroup?.id]);

  // Conversation list refresh — three parallel sources for zero-refresh instant feel:
  //   (1) `chat:new-message` window event from useNotifications (notifications-row bridge)
  //   (2) DIRECT realtime subscription on `messages` + `conversations` (Pkg360 — these
  //       tables ARE in supabase_realtime publication).
  //   (3) Optimized universal sync bridge (Pkg365)
  useEffect(() => {
    if (!currentUserId) return;

    let refreshTimer: NodeJS.Timeout | null = null;
    const debouncedRefresh = () => {
      if (refreshTimer) clearTimeout(refreshTimer);
      refreshTimer = setTimeout(() => fetchConversations(), 50); // super-fast debounce for instant feel
    };

    const onNewMessage = () => debouncedRefresh();
    window.addEventListener('chat:new-message', onNewMessage);

    const unsubMessages = subscribeToTables(
      `chat-conv-list-msgs-${currentUserId}`,
      ['messages', 'conversations', 'groups', 'group_members', 'group_messages'],
      (table: string, event: string, payload: any) => {
        if (!payload) return;
        if (table === 'messages') {
          // Only refresh when this user is sender or recipient of the message
          if (payload.sender_id !== currentUserId && payload.recipient_id !== currentUserId) return;
          debouncedRefresh();
          // Safety-net: if message belongs to currently open thread, upsert into live messages
          const openConvId = selectedConversationRef.current?.id;
          if (event === 'INSERT' && openConvId && payload.conversation_id === openConvId) {
            upsertLiveMessageRef.current({
              id: payload.id,
              content: payload.content,
              sender_id: payload.sender_id,
              created_at: payload.created_at,
              is_read: payload.is_read ?? false,
              message_type: payload.message_type || 'text',
              status: 'delivered',
              reply_to_id: payload.reply_to_id ?? null,
            } as Message);
          }
        } else if (table === 'conversations') {
          if (payload.participant1_id !== currentUserId && payload.participant2_id !== currentUserId) return;
          debouncedRefresh();
        } else if (table === 'group_messages') {
          // Pkg365: refresh groups tab instantly when new group message arrives
          debouncedRefresh();
        }
      }
    );

    return () => {
      if (refreshTimer) clearTimeout(refreshTimer);
      window.removeEventListener('chat:new-message', onNewMessage);
      unsubMessages();
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
      
      // Parallel fetch - diamonds + conversations + groups at once
      const [profileResult, helperResult] = await Promise.all([
        supabase.from('profiles').select('diamonds, display_name, avatar_url, user_level, host_level, max_user_level, gender, is_host, is_agency_owner').eq('id', user.id).single(),
        supabase.from('topup_helpers').select('id').eq('user_id', user.id).eq('is_active', true).eq('is_verified', true).maybeSingle(),
        fetchConversations(user.id),
        fetchGroups(user.id)
      ]);
      
      if (profileResult.data) {
        setUserCoins(profileResult.data.diamonds || 0);
        setMyProfile({
          display_name: profileResult.data.display_name,
          avatar_url: profileResult.data.avatar_url,
          user_level: profileResult.data.user_level ?? null,
          host_level: (profileResult.data as any).host_level ?? null,
          max_user_level: (profileResult.data as any).max_user_level ?? null,
          gender: (profileResult.data as any).gender || null,
          is_host: profileResult.data.is_host === true,
          is_agency_owner: (profileResult.data as any).is_agency_owner === true,
          is_topup_helper: !!helperResult.data,
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
      })).sort((a, b) => {
        const aTime = a.last_message_at ? new Date(a.last_message_at).getTime() : 0;
        const bTime = b.last_message_at ? new Date(b.last_message_at).getTime() : 0;
        return bTime - aTime;
      });

      setConversations(formattedConversations);
      setConvCache(formattedConversations);
    } catch (err) {
      console.error('[Chat] Error:', err);
      recordClientError({ label: "Chat.formattedConversations", message: err instanceof Error ? err.message : String(err) });
    }
  };

  const fetchGroups = async (overrideUserId?: string) => {
    const userId = overrideUserId || currentUserId;
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

      wasNearBottomRef.current = true;
      setMessages([]);
      setGroupMessages([]);
      setVisibleMessageCount(MESSAGES_PAGE_SIZE);
      setShowScrollToBottom(false);
      setUnreadBelow(0);
      setSelectedConversation({
        ...existing,
        other_user: profile,
        last_message: '',
        unread_count: 0
      });
      fetchMessages(existing.id);
      anchorChatToBottomSoon();
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
      wasNearBottomRef.current = true;
      setVisibleMessageCount(MESSAGES_PAGE_SIZE);
      setShowScrollToBottom(false);
      setUnreadBelow(0);
      setMessages([]);
      anchorChatToBottomSoon();
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

  const persistPlayedGiftMessageIds = useCallback(() => {
    const userId = playedGiftStorageUserRef.current;
    if (!userId) return;

    try {
      const ids = Array.from(playedGiftMessageIdsRef.current).slice(-MAX_PLAYED_GIFT_ANIMATION_IDS);
      playedGiftMessageIdsRef.current = new Set(ids);
      localStorage.setItem(`${PLAYED_GIFT_ANIMATION_STORAGE_PREFIX}${userId}`, JSON.stringify(ids));
    } catch {
      // Ignore storage failures; in-memory guard still prevents repeat playback in this session.
    }
  }, []);

  const markGiftMessageAnimationPlayed = useCallback((messageId?: string | null): boolean => {
    if (!messageId) return true;
    if (playedGiftMessageIdsRef.current.has(messageId)) return false;

    playedGiftMessageIdsRef.current.add(messageId);
    persistPlayedGiftMessageIds();
    return true;
  }, [persistPlayedGiftMessageIds]);

  function playGiftAnimationFromContent(content: string, senderId?: string | null, playSoundEffect = false, animationFormat?: string | null, animationConfigUrl?: string | null) {
    const signature = getGiftAnimationSignature(content, senderId);
    const now = Date.now();
    const lastPlayed = recentGiftAnimationsRef.current.get(signature) || 0;
    if (now - lastPlayed < 4000) return;

    recentGiftAnimationsRef.current.set(signature, now);
    if (playSoundEffect) playSoundDebounced('gift');

    const { mediaUrl, emoji, soundUrl, animationFormat: parsedFormat, animationConfigUrl: parsedConfigUrl } = parseGiftContent(content || '');
    warmGiftUrlsForInstantPlay([mediaUrl, parsedConfigUrl, animationConfigUrl, soundUrl]);
    if (!USE_UNIFIED_FULLSCREEN_GIFT_PLAYER) {
      setAnimatingGiftEmoji(mediaUrl || emoji);
      setAnimatingGiftFormat(animationFormat || parsedFormat || null);
      setAnimatingGiftConfigUrl(normalizeGiftMediaUrl(animationConfigUrl) || parsedConfigUrl || null);
      setAnimatingGiftSound(soundUrl);
      setGiftAnimationInstance(prev => prev + 1);
      setShowGiftAnimation(true);
    }

    // Unified flying-gift pill (Bigo/Chamet parity across DM/Live/Party/Call)
    const nameMatch = content.match(/\[Gift:\s*(?:[^|\s\]]+\|)?[^\s\]]+\s+(.+?)\s+x(\d+)/i);
    const diamondMatch = content.match(/-(\d+)\s*diamonds/i);
    const giftName = nameMatch?.[1]?.trim() || 'Gift';
    const count = nameMatch?.[2] ? parseInt(nameMatch[2], 10) || 1 : 1;
    const totalDiamonds = diamondMatch?.[1] ? parseInt(diamondMatch[1], 10) || 0 : 0;
    const perGiftCoins = count > 0 ? Math.floor(totalDiamonds / count) : totalDiamonds;
    const isSelf = !!senderId && senderId === currentUserId;
    const peer = selectedConversationRef.current?.other_user;
    addFlyingGift({
      senderId: senderId || undefined,
      senderName: isSelf ? 'You' : (peer?.display_name || 'User'),
      senderAvatar: isSelf ? undefined : (peer?.avatar_url || undefined),
      receiverName: isSelf ? (peer?.display_name || 'User') : 'You',
      giftName,
      giftIcon: emoji,
      giftImageUrl: mediaUrl || undefined,
      animationUrl: mediaUrl || undefined,
      animationFormat: animationFormat || parsedFormat || null,
      animationConfigUrl: normalizeGiftMediaUrl(animationConfigUrl) || parsedConfigUrl || undefined,
      soundUrl: soundUrl || undefined,
      giftColor: 'bg-pink-500/50',
      count,
      diamonds: perGiftCoins,
      isOwnGift: isSelf,
      isReceiverGift: !isSelf,
    });
  }

  useEffect(() => {
    if (!currentUserId || playedGiftStorageUserRef.current === currentUserId) return;

    playedGiftStorageUserRef.current = currentUserId;
    try {
      const stored = localStorage.getItem(`${PLAYED_GIFT_ANIMATION_STORAGE_PREFIX}${currentUserId}`);
      const ids = stored ? JSON.parse(stored) : [];
      playedGiftMessageIdsRef.current = new Set(Array.isArray(ids) ? ids.filter((id) => typeof id === 'string') : []);
    } catch {
      playedGiftMessageIdsRef.current = new Set();
    }
  }, [currentUserId]);

  async function loadReplyMessages(replyIds: string[]) {
    const missingReplyIds = [...new Set(replyIds)].filter((id) => id && !replyMessages[id]);
    if (missingReplyIds.length === 0) return;

    const { data: replies } = await supabase
      .from('messages')
      .select('id, content, sender_id, message_type')
      .in('id', missingReplyIds);

    const map = Object.fromEntries((replies || []).map(r => [r.id, { content: r.content, sender_id: r.sender_id, message_type: (r as any).message_type ?? null }]));
    setReplyMessages(prev => ({ ...prev, ...map }));
  }

  function upsertLiveMessage(messageRow: any) {
    const newMessage = castMessage(messageRow);
    if (newMessage.reply_to_id) {
      void loadReplyMessages([newMessage.reply_to_id]);
    }

    setMessages(prev => {
      const baseMessages = prev.filter(
        m =>
          !m._optimistic ||
          m.sender_id !== newMessage.sender_id ||
          m.content !== newMessage.content ||
          m.message_type !== newMessage.message_type
      );

      if (baseMessages.find(m => m.id === newMessage.id)) return dedupeAndSortMessages(baseMessages);

      return dedupeAndSortMessages([
        ...baseMessages,
        newMessage.sender_id === currentUserId
          ? { ...newMessage, status: (newMessage.status || 'sent') as Message['status'] }
          : newMessage,
      ]);
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
      if (markGiftMessageAnimationPlayed(newMessage.id)) {
        playGiftAnimationFromContent(newMessage.content || '', newMessage.sender_id, true);
      }
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
    await persistDirectMessage(item.conversationId, item.senderId, item.content, item.messageType, item.replyToId);
    // Replace the queued optimistic bubble with a "sent" one — realtime
    // upsertLiveMessage will replace it with the canonical row shortly.
    setMessages(prev => prev.map(m =>
      m.id === item.id ? { ...m, status: 'sent' } : m
    ));
  });


  const fetchMessages = async (conversationId: string) => {
    // Phase 7 — Instant Paint. Synchronously hydrate from the localStorage
    // snapshot of this thread BEFORE the network roundtrip so the UI shows
    // the prior view in <16ms. Server data overwrites below once it lands.
    try {
      const snap = loadChatSnapshot(conversationId);
      if (snap && snap.length) {
        setMessages((prev) => (prev && prev.length ? prev : (snap as Message[])));
      }
    } catch {}

    const { data, error } = await supabase
      .from('messages')
      .select('*')
      .eq('conversation_id', conversationId)
      .order('created_at', { ascending: false })
      .limit(MESSAGES_PAGE_SIZE);

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
    const merged = dedupeAndSortMessages([...serverMsgs, ...queued]);
    setMessages(merged);
    // Phase 7 — persist the freshly-merged thread.
    try { saveChatSnapshot(conversationId, merged); } catch {}

    // Fetch reply-to messages for quote rendering
    const replyIds = [...new Set((data || []).map(m => m.reply_to_id).filter(Boolean))] as string[];
    void loadReplyMessages(replyIds);

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
      const unreadMsgs = data.filter(m => !m.is_read && m.sender_id !== currentUserId);
      const unreadIds = unreadMsgs.map(m => m.id);

      if (unreadIds.length > 0) {
        // Pkg-fix: If there's an unread gift, trigger the most recent one's animation
        // so the receiver sees it when entering the chat (as requested by user).
        const latestUnreadGift = [...unreadMsgs].reverse().find(m => m.message_type === 'gift');
        if (latestUnreadGift && markGiftMessageAnimationPlayed(latestUnreadGift.id)) {
          console.log('[Chat] 🎁 Replaying unread gift animation for receiver');
          playGiftAnimationFromContent(latestUnreadGift.content || '', latestUnreadGift.sender_id, true);
        }

        // Use RPC because RLS only allows the sender to UPDATE messages.
        // The receiver must mark-read via SECURITY DEFINER function.
        const { data: updatedCount } = await supabase.rpc('mark_messages_read', {
          p_message_ids: unreadIds,
        });

        emitGlobalUnreadRefresh({
          messagesDecrement: typeof updatedCount === 'number' ? updatedCount : unreadIds.length,
        });
      }
    }
  };

  const fetchGroupMessages = async (groupId: string) => {
    const { data, error } = await supabase
      .from('group_messages')
      .select('*')
      .eq('group_id', groupId)
      .order('created_at', { ascending: false })
      .limit(MESSAGES_PAGE_SIZE);

    if (error) return;

    // Fetch sender profiles
    const senderIds = [...new Set(data?.map(m => m.sender_id) || [])];
    const { data: profiles } = await supabase
      .from('profiles_public')
      .select('id, display_name, avatar_url, user_level, host_level, max_user_level, gender, is_host')
      .in('id', senderIds);

    const profilesMap = new Map(profiles?.map(p => [p.id, p]) || []);

    const messagesWithSenders: GroupMessage[] = (data || []).reverse().map(m => ({
      ...m,
      sender: profilesMap.get(m.sender_id) || null
    }));

    setGroupMessages(messagesWithSenders);
  };

  const markMessageAsRead = async (messageId: string) => {
    // RLS only allows the sender to UPDATE — use SECURITY DEFINER RPC for the receiver.
    const { data: updatedCount } = await supabase.rpc('mark_messages_read', {
      p_message_ids: [messageId],
    });

    emitGlobalUnreadRefresh({
      messagesDecrement: typeof updatedCount === 'number' ? updatedCount : 1,
    });
  };

  const handleSelectConversation = async (conv: Conversation) => {
    wasNearBottomRef.current = true;
    setSelectedConversation(conv);
    setSelectedGroup(null);
    setMessages([]);
    setGroupMessages([]);
    setShowScrollToBottom(false);
    setUnreadBelow(0);
    setVisibleMessageCount(MESSAGES_PAGE_SIZE);
    setOtherUserTrader({ isTrader: false, traderLevel: 0 });
    await fetchMessages(conv.id);
    anchorChatToBottomSoon();
    
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
    wasNearBottomRef.current = true;
    setSelectedGroup(group);
    setSelectedConversation(null);
    setMessages([]);
    setGroupMessages([]);
    setShowScrollToBottom(false);
    setUnreadBelow(0);
    setVisibleMessageCount(MESSAGES_PAGE_SIZE);
    fetchGroupMessages(group.id);
    anchorChatToBottomSoon();
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

  const appendSentGroupMessage = useCallback((newMsg: any) => {
    if (!newMsg) return;
    const ownSender = {
      display_name: myProfile?.display_name || 'You',
      avatar_url: myProfile?.avatar_url || null,
      user_level: myProfile?.user_level || null,
      host_level: myProfile?.host_level || null,
      max_user_level: myProfile?.max_user_level || null,
      gender: myProfile?.gender || null,
      is_host: myProfile?.is_host || false,
    };

    setGroupMessages(prev => {
      if (prev.find(m => m.id === newMsg.id)) return prev;
      return [...prev, { ...newMsg, sender: ownSender }];
    });
  }, [myProfile]);

  // Robust scroll-to-bottom: re-anchors across multiple frames to absorb
  // async layout shifts from late-loading avatars, gift logos, sticker
  // images, link previews, video posters, etc. Mirrors WhatsApp/Messenger
  // behavior where the latest message is always reliably visible.
  const handleSend = async (overrideText?: string) => {
    const rawText = (overrideText ?? message).trim();
    if (!rawText || sending) return;
    if (!currentUserId || (!selectedConversation && !selectedGroup)) return;

    setSending(true);
    const originalContent = rawText;
    if (overrideText === undefined) setMessage("");

    
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
      anchorChatToBottomSoon();
    }
    
    // No local send sound here (avoid duplicate beeps on send + realtime events)
    
    // 🔍 BLOCKING: Run contact detection ONLY when the sender is a verified host.
    // Rule (owner-locked): only verified hosts are prohibited from sharing phone
    // numbers / social handles. user↔user, user↔agency, agency↔agency, user→host,
    // agency→host all flow freely with no mask, no warning, no admin alert.
    let contentToSend = originalContent;
    const senderIsHost = isContactRestrictedHost(myProfile);
    if (senderIsHost) {
      const { detectContactInfo, maskContactContent } = await import('@/utils/contactDetection');
      const detection = detectContactInfo(originalContent);
      if (detection.hasViolation) {
        contentToSend = maskContactContent(originalContent, detection);
        console.log('[ContactDetection] Host sender BLOCKED, masked:', contentToSend);

        const sourceId = selectedConversation?.id || selectedGroup?.id;
        detectAndProcessViolation(currentUserId!, originalContent, 'private_message', sourceId, false)
          .then(res => {
            if (res.detected && res.violationNumber) {
              numberWarning.showGenericWarning();
            }
          })
          .catch(err => console.error('[ContactDetection] Chat error:', err));
      }
    }

    if (contentToSend !== originalContent) {
      setMessages(prev => prev.map(m =>
        m.id === optimisticId ? { ...m, content: contentToSend } : m
      ));
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
        hapticFeedback('message');
        
        // Clear reply after successful send

        setReplyingTo(null);
        anchorChatToBottomSoon();
        
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

        // 🔍 Phone number check in BACKGROUND (non-blocking) — host senders only.
        // Skip detection for helper/payroll helper conversations.
        if (senderIsHost) {
          isHelperConversation().then(isHelper => {
            if (!isHelper) {
              checkPhoneNumber(originalContent, selectedConversation.id, undefined).catch(() => {});
            }
          }).catch(() => {});
        }
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
        const { data: newMsg, error } = await supabase
          .from('group_messages')
          .insert({
            group_id: selectedGroup.id,
            sender_id: currentUserId,
            content: contentToSend,
            message_type: 'text'
          })
          .select()
          .single();

        if (error) throw error;
        appendSentGroupMessage(newMsg);
        anchorChatToBottomSoon();
          
        // Track + background phone check
        trackTaskProgress('messages_sent', { increment: 1 });
        if (senderIsHost) checkPhoneNumber(originalContent, undefined, selectedGroup.id).catch(() => {});
        checkToxic(originalContent, { contextType: 'chat', groupId: selectedGroup.id }).catch(() => {});
      }
    } catch (error: any) {
      console.error('[Chat.handleSend] error:', error);
      const errMsg = String(error?.message || '').toLowerCase();

      // Pkg367: recipient toggled themselves offline — don't queue, surface friendly toast
      if (errMsg.includes('recipient_offline')) {
        toast.error("This user is offline right now and cannot receive messages.");
        setMessage(originalContent);
        setMessages(prev => prev.filter(m => m.id !== optimisticId));
        setSending(false);
        return;
      }

      // Group send error mapping — surface the real reason instead of generic toast.
      if (selectedGroup && !selectedConversation) {
        let groupErrText = "Failed to send message";
        if (errMsg.includes('not_group_member')) groupErrText = "You're no longer a member of this group";
        else if (errMsg.includes('sender_mismatch') || errMsg.includes('auth_required')) groupErrText = "Please sign in again to send messages";
        else if (errMsg.includes('sender_blocked')) groupErrText = "Your account is restricted";
        else if (errMsg.includes('empty_message')) groupErrText = "Message cannot be empty";
        else if (errMsg.includes('message_too_long')) groupErrText = "Message is too long (max 4000 characters)";
        else if (errMsg.includes('invalid_message_type')) groupErrText = "This message type is not allowed";
        else if (errMsg.includes('group_inactive')) groupErrText = "This group is no longer active";
        else if (errMsg.includes('row-level security') || errMsg.includes('rls')) groupErrText = "You're no longer a member of this group";
        else if (errMsg.includes('failed to fetch') || errMsg.includes('network')) groupErrText = "You're offline — please check your connection";
        toast.error(groupErrText);
        setMessage(originalContent);
        setSending(false);
        return;
      }

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
            replyToId: replyingTo?.messageId,
          });
          // Mark the optimistic message as queued (waiting to send)
          setMessages(prev => prev.map(m =>
            m.id === optimisticId ? { ...m, status: 'queued' } : m
          ));
          toast.message("You're offline — message will send when reconnected");
        } catch {
          toast.error("Failed to send message");
          setMessage(originalContent);
          setMessages(prev => prev.filter(m => m.id !== optimisticId));
        }
      } else {
        toast.error(error?.message ? `Failed to send: ${error.message}` : "Failed to send message");
        setMessage(originalContent);
        setMessages(prev => prev.filter(m => m.id !== optimisticId));
      }
    } finally {
      setSending(false);
    }
  };

  // Pkg437 Phase-3 — mirror open DM thread to native RecyclerView chat overlay.
  // Additive, Android-only, flag-gated, default OFF. React UI stays canonical
  // on web/iOS/older APKs/un-opted cohort. Text-only payload for now (gifts,
  // voice, media, replies render as text fallback inside native list).
  const nativeChatThreadTitle = selectedConversation?.other_user?.display_name || undefined;
  const nativeChatThreadId = selectedConversation?.id || null;
  const hasMediaMessages = messages.some((m) =>
    isChatImageMessage(m.message_type, m.content)
    || isChatVideoMessage(m.message_type, m.content)
    || isChatAudioMessage(m.message_type, m.content)
  );
  const nativeChatMessages = React.useMemo<NativeChatMessage[]>(() => {
    if (!nativeChatThreadId || hasMediaMessages) return [];
    const otherName = selectedConversation?.other_user?.display_name || "User";
    const otherAvatar = selectedConversation?.other_user?.avatar_url || null;
    return messages.map((m): NativeChatMessage => {
      const isMine = m.sender_id === currentUserId;
      let text = m.content || "";
      if (m.message_type === "gift") text = `🎁 ${text || "Gift"}`;
      else if (m.message_type === "voice") text = "🎙️ Voice message";
      else if (m.message_type === "image") text = "Photo";
      else if (m.message_type === "video") text = "Video";
      else if (m.message_type === "file") text = "📎 File";
      return {
        id: m.id,
        senderId: m.sender_id,
        senderName: isMine ? "You" : otherName,
        text,
        createdAt: new Date(m.created_at).getTime() || Date.now(),
        avatarUrl: isMine ? null : otherAvatar,
      };
    });
  }, [messages, nativeChatThreadId, hasMediaMessages, selectedConversation?.other_user?.display_name, selectedConversation?.other_user?.avatar_url, currentUserId]);

  const handleSendRef = useRef(handleSend);
  handleSendRef.current = handleSend;
  const { active: nativeChatActive, setMessages: setNativeChatMessages } = useNativeChatUI({
    enabled: !!nativeChatThreadId && !hasMediaMessages,
    currentUserId,
    title: nativeChatThreadTitle,
    onSend: (text) => { void handleSendRef.current(text); },
  });

  useEffect(() => {
    if (!nativeChatActive) return;
    setNativeChatMessages(nativeChatMessages);
  }, [nativeChatActive, nativeChatMessages, setNativeChatMessages]);



  const handleCreateGroup = async () => {
    if (!newGroupName.trim() || !currentUserId) return;

    if (newGroupPhoto) {
      const ext = (newGroupPhoto.name.split('.').pop() || 'jpg').toLowerCase().replace(/[^a-z0-9]/g, '') || 'jpg';
      if (ext === 'svg') {
        toast.error("SVG not allowed");
        return;
      }
    }

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

      // Create group + owner membership atomically.
      // If the membership insert fails, the group insert is rolled back too.
      const { data: createResult, error } = await supabase.rpc('create_chat_group' as any, {
        p_name: newGroupName.trim(),
        p_group_type: newGroupType,
      });

      if (error) throw error;
      const result = normalizeCreateGroupResult(createResult);
      if (!result?.success || !result.group_id) {
        throw new Error(result?.error || 'create_group_failed');
      }

      const { data: newGroup, error: groupFetchError } = await supabase
        .from('groups')
        .select('*')
        .eq('id', result.group_id)
        .single();

      if (groupFetchError) throw groupFetchError;

      // Upload group photo if selected
      if (newGroupPhoto) {
        const ext = (newGroupPhoto.name.split('.').pop() || 'jpg').toLowerCase().replace(/[^a-z0-9]/g, '');
        if (!newGroupPhoto.type?.startsWith('image/') || ext === 'svg') {
          throw new Error('Invalid group photo type');
        }
        const path = `group-avatars/${newGroup.id}.${ext || 'jpg'}`;
        const { error: upErr } = await supabase.storage.from('assets').upload(path, newGroupPhoto, {
          upsert: true,
          contentType: newGroupPhoto.type,
        });
        if (!upErr) {
          const { data: urlData } = supabase.storage.from('assets').getPublicUrl(path);
          await supabase.from('groups').update({ avatar_url: `${urlData.publicUrl}?t=${Date.now()}` }).eq('id', newGroup.id);
        } else {
          console.warn('group avatar upload failed', upErr);
        }
      }

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
      toast.error(getCreateGroupErrorMessage(error instanceof Error ? error.message : String(error)));
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

      const { error: joinError } = await supabase
        .from('group_members')
        .insert({
          group_id: groupId,
          user_id: currentUserId,
          role: 'member'
        });

      if (joinError) throw joinError;

      toast.success("Joined group successfully!");
      setShowSearchGroup(false);
      setGroupSearchQuery("");
      setGroupSearchResults([]);
      fetchGroups();
    } catch (error: any) {
      const msg = String(error?.message || error || '');
      if (msg.includes('duplicate key') || msg.includes('uniq_group_members')) toast.info("You're already a member of this group");
      else if (msg.includes('group_full')) toast.error("This group is full");
      else if (msg.includes('family_limit_reached')) toast.error("You can only be in 1 family group");
      else if (msg.includes('basic_limit_reached')) toast.error("You can join max 20 general groups");
      else if (msg.includes('group_inactive')) toast.error("This group is no longer active");
      else if (msg.includes('user_blocked')) toast.error("Your account is restricted");
      else if (msg.includes('cannot_add_others')) toast.error("Only group admins can add members");
      else if (msg.includes('not_group_member')) toast.error("Join this group again before sending messages");
      else if (msg.includes('sender_blocked')) toast.error("Your account is restricted");
      else toast.error("Failed to join group");
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
    const allMessages = isGroup ? groupMessages : messages;
    // Phase-3 perf: window the rendered slice. Clusters/day-separators stay
    // contiguous because we always render the most-recent tail.
    const hasOlder = allMessages.length > visibleMessageCount;
    const currentMessages = hasOlder ? allMessages.slice(-visibleMessageCount) : allMessages;
    const userLevel = pickDisplayLevel(selectedConversation?.other_user as any);
    const countryFlag = selectedConversation?.other_user?.country_flag || "🌍";

    return (
      <div className="fixed inset-0 flex flex-col overflow-hidden profile-home-shell">
        <ChatActiveHeader
          selectedConversation={selectedConversation}
          selectedGroup={selectedGroup}
          currentUserId={currentUserId}
          myProfile={myProfile}
          isOtherTyping={isOtherTyping}
          otherUserTrader={otherUserTrader}
          onBack={() => {
            setSelectedConversation(null);
            setSelectedGroup(null);
            setMessages([]);
            setGroupMessages([]);
            fetchConversations();
            fetchGroups();
          }}
          startCall={startCall}
          setShowGroupSettings={setShowGroupSettings}
          setShowReportDialog={setShowReportDialog}
          formatLastSeen={formatLastSeen}
        />
        
        {/* Messages */}
        <div className="relative flex flex-col flex-1 min-h-0">
        <div
          ref={chatScrollRef}
          onScroll={(e) => {
            const el = e.currentTarget;
            const dist = el.scrollHeight - el.scrollTop - el.clientHeight;
            const shouldShow = dist > 240;
            setShowScrollToBottom(shouldShow);
            if (!shouldShow) setUnreadBelow(0);
          }}
          className="flex flex-col flex-1 min-h-0 px-3 py-3 overflow-y-auto overscroll-contain chat-wallpaper chat-scroll-stable"
          style={{ WebkitOverflowScrolling: 'touch', paddingBottom: 'calc(var(--kb-h, 0px) + 0.75rem)' }}
        >
          {currentMessages.length > 0 && <div className="mt-auto" aria-hidden />}
          {hasOlder && (
            <div className="flex justify-center py-2">
              <button
                onClick={() => {
                  const container = chatScrollRef.current;
                  const prevHeight = container?.scrollHeight ?? 0;
                  const prevTop = container?.scrollTop ?? 0;
                  setVisibleMessageCount((c) => c + MESSAGES_PAGE_SIZE);
                  // After the larger slice renders, restore scroll so the user
                  // stays anchored on the same message they were reading.
                  requestAnimationFrame(() => {
                    const c = chatScrollRef.current;
                    if (!c) return;
                    c.scrollTop = c.scrollHeight - prevHeight + prevTop;
                  });
                }}
                className="text-[11px] font-semibold text-muted-foreground bg-card/80 border border-border rounded-full px-3 py-1 shadow-sm hover:bg-card transition-colors"
              >
                Load older messages
              </button>
            </div>
          )}
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
                      <span className="px-3 py-0.5 rounded-full text-[10.5px] font-semibold text-muted-foreground profile-home-pill shadow-sm">
                        {formatDayLabel(msg.created_at)}
                      </span>
                    </div>
                  )}
                  <MessageRowShell
                    id={`msg-${msg.id}`}
                    isMine={isMine}
                    sameAsPrev={sameAsPrev}
                    onReply={() => setReplyingTo({
                      messageId: msg.id,
                      content: msg.content || '',
                      senderName: senderName,
                      senderId: msg.sender_id,
                      messageType: msg.message_type,
                    })}
                  >
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
                            <AvatarImage src={senderAvatar || undefined} className="object-contain" />
                            <AvatarFallback className="bg-gradient-primary text-primary-foreground text-[10px]">
                              {senderName[0] || '?'}
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
                      {/* Reply Quote */}
                      {msg.reply_to_id && (() => {
                        const replyTo = replyMessages[msg.reply_to_id];
                        const rName = replyTo ? (
                          replyTo.sender_id === currentUserId
                            ? (myProfile?.display_name || 'You')
                            : (isGroup ? msg.sender?.display_name : selectedConversation?.other_user?.display_name) || 'User'
                        ) : 'Unknown';
                        const preview = replyTo
                          ? summarizeMessageForReply(replyTo.content || '', replyTo.message_type)
                          : { label: 'Original message', thumb: null, kind: 'text' as const };
                        return (
                          <div className={cn(
                            "mb-1 pl-2.5 border-l-[3px] rounded-l-sm py-0.5 pr-1 cursor-pointer flex items-center gap-2",
                            isMine ? "border-primary-foreground/40" : "border-primary/40"
                          )} onClick={() => {
                            const el = document.getElementById(`msg-${msg.reply_to_id}`);
                            if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
                          }}>
                            <div className="flex-1 min-w-0">
                              <p className={cn(
                                "text-[10px] font-semibold truncate",
                                isMine ? "text-primary-foreground/80" : "text-primary/80"
                              )}>{rName}</p>
                              <p className={cn(
                                "text-[11px] truncate opacity-70",
                                isMine ? "text-primary-foreground/60" : "text-muted-foreground/60"
                              )}>{preview.label}</p>
                            </div>
                            {preview.thumb && (
                              <img
                                src={preview.thumb}
                                alt=""
                                className="w-8 h-8 rounded object-cover shrink-0"
                                loading="lazy"
                              />
                            )}
                          </div>
                        );
                      })()}
                      {/* Message Bubble - No background for gifts */}
                      {(() => {
                        const content = msg.content || '';
                        const cleanUrl = extractChatMediaPath(content);
                        const isImage = isChatImageMessage(msg.message_type, content);
                        const isVideo = isChatVideoMessage(msg.message_type, content);
                        const isAudio = isChatAudioMessage(msg.message_type, content);
                        const isGift = msg.message_type === 'gift';
                        const displayUrl = signedChatMediaUrls[cleanUrl] || cleanUrl;

                        // Gift messages - canonical inline row, same shared UI as Live/Party/Call
                        if (isGift) {
                          const { mediaUrl, emoji } = parseGiftContent(content);
                          const diamondsMatch = content.match(/-(\d+)\s*diamonds/i);
                          const nameMatch = content.match(/\[Gift:\s*(?:[^|\s\]]+\|)?[^\s\]]+\s+(.+?)\s+x(\d+)/i);
                          const giftName = nameMatch?.[1]?.trim() || 'Gift';
                          const giftCount = nameMatch?.[2] ? parseInt(nameMatch[2], 10) || 1 : 1;
                          const totalDiamonds = diamondsMatch?.[1] ? parseInt(diamondsMatch[1], 10) || 0 : 0;
                          const cachedGift = giftName
                            ? getCachedGifts().find(g => (g.name || '').trim().toLowerCase() === giftName.trim().toLowerCase())
                            : null;
                          const catalogIconUrl = normalizeGiftMediaUrl(cachedGift?.icon_url) || null;
                          const inlineIconUrl = catalogIconUrl || (mediaUrl && /\.(gif|png|webp|jpg|jpeg)(\?|$)/i.test(mediaUrl.split('?')[0]) ? mediaUrl : null);

                          return (
                            <div className={cn("flex", isMine ? "justify-end" : "justify-start")}>
                              <InlineGiftRow
                                senderName={senderName}
                                senderAvatar={senderAvatar || undefined}
                                giftName={giftName}
                                giftIconUrl={inlineIconUrl || undefined}
                                giftEmoji={emoji}
                                count={giftCount}
                                diamonds={totalDiamonds}
                                isSelf={isMine}
                                surface="chat"
                                compact
                                footerSlot={
                                  <>
                                    {formatTime(msg.created_at)}
                                    <MessageStatusIndicator status={msg.status || (msg.is_read ? 'read' : 'sent')} isMine={isMine} />
                                  </>
                                }
                              />
                            </div>
                          );
                        }

                        // Image messages — instant placeholder, thumb-then-full
                        if (isImage) {
                          return (
                            <div className="flex flex-col">
                              <SmartImage
                                src={displayUrl}
                                alt="Shared image"
                                width={360}
                                quality={78}
                                className="w-[220px] h-[260px]"
                                onClick={() => { setGalleryStartId(msg.id); setGalleryOpen(true); }}
                              />
                              <p className="text-[10px] text-muted-foreground mt-1 flex items-center gap-0.5">
                                {formatTime(msg.created_at)}
                                <MessageStatusIndicator status={msg.status || (msg.is_read ? 'read' : 'sent')} isMine={isMine} />
                              </p>
                            </div>
                          );
                        }

                        // Video messages — lazy-attach src, poster-first
                        if (isVideo) {
                          return (
                            <div className="flex flex-col">
                              <SmartVideo
                                src={displayUrl}
                                className="w-[220px] h-[260px]"
                              />
                              <p className="text-[10px] text-muted-foreground mt-1 flex items-center gap-0.5">
                                {formatTime(msg.created_at)}
                                <MessageStatusIndicator status={msg.status || (msg.is_read ? 'read' : 'sent')} isMine={isMine} />
                              </p>
                            </div>
                          );
                        }


                        // Audio messages - WhatsApp-style waveform player
                        if (isAudio) {
                          return (
                            <div className="flex flex-col">
                              <VoiceMessagePlayer
                                src={displayUrl}
                                isMine={isMine}
                              />
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

                        // Regular text messages - shared DM bubble primitive
                        return (
                          <DirectChatBubble
                            message={content}
                            isMine={isMine}
                            createdAt={msg.created_at}
                            status={msg.status || (msg.is_read ? 'read' : 'sent')}
                            optimistic={msg._optimistic}
                          />
                        );
                      })()}
                      {/* Reactions (DB-backed, realtime synced) */}
                      <ReactionBar
                        reactions={reactionsByMessage[msg.id] || []}
                        isMine={isMine}
                        onToggle={(e) => toggleReaction(msg.id, e)}
                      />
                    </div>
                    
                    {/* Three Dot Menu for each message */}
                    <DropdownMenu modal={false}>
                      <DropdownMenuTrigger asChild>
                        <button className="self-center p-1 rounded-full hover:bg-muted opacity-0 group-hover:opacity-100 transition-opacity">
                          <MoreVertical className="w-4 h-4 text-muted-foreground" />
                        </button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align={isMine ? "end" : "start"} className="bg-popover text-popover-foreground border border-border rounded-2xl min-w-[200px] shadow-xl p-1.5">
                        <DropdownMenuItem onClick={() => {
                          setReplyingTo({
                            messageId: msg.id,
                            content: msg.content || '',
                            senderName: senderName,
                            senderId: msg.sender_id,
                            messageType: msg.message_type,
                          });
                          toast.success("Replying to message");
                        }} className="text-foreground hover:text-foreground hover:bg-muted cursor-pointer gap-2 py-2.5 px-3 rounded-xl transition-all">

                          <MessageSquareReply className="w-4 h-4 text-primary" />
                          <span className="font-medium text-sm">Reply</span>
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => {
                          setReactionPickerMsgId(msg.id);
                        }} className="text-foreground hover:text-foreground hover:bg-muted cursor-pointer gap-2 py-2.5 px-3 rounded-xl transition-all">

                          <SmilePlus className="w-4 h-4 text-warning-600" />
                          <span className="font-medium text-sm">React</span>
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => {
                          setMessageInfoMessage(msg);
                          setShowMessageInfo(true);
                        }} className="text-foreground hover:text-foreground hover:bg-muted cursor-pointer gap-2 py-2.5 px-3 rounded-xl transition-all">
                          <Info className="w-4 h-4 text-primary" />
                          <span className="font-medium text-sm">Info</span>
                        </DropdownMenuItem>
                        <div className="h-px bg-border my-1" />
                        <DropdownMenuItem onClick={() => {
                          navigator.clipboard.writeText(msg.content);
                          toast.success("Message copied!");
                        }} className="text-foreground hover:text-foreground hover:bg-muted cursor-pointer gap-2 py-2.5 px-3 rounded-xl transition-all">
                          <span className="font-medium text-sm">Copy</span>
                        </DropdownMenuItem>
                        {!isMine && (
                          <DropdownMenuItem onClick={() => otherUserId && navigate(`/profile-detail/${otherUserId}`)} className="text-foreground hover:text-foreground hover:bg-muted cursor-pointer gap-2 py-2.5 px-3 rounded-xl transition-all">
                            <span className="font-medium text-sm">View Profile</span>
                          </DropdownMenuItem>
                        )}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </MessageRowShell>
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
                <div className="rounded-[18px] rounded-bl-[6px] px-4 py-2.5 bg-card border border-border/60 shadow-[0_1px_2px_rgba(0,0,0,0.05)]">
                  <div className="flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-primary animate-bounce" style={{ animationDelay: '0ms' }} />
                    <span className="w-1.5 h-1.5 rounded-full bg-primary animate-bounce" style={{ animationDelay: '150ms' }} />
                    <span className="w-1.5 h-1.5 rounded-full bg-primary animate-bounce" style={{ animationDelay: '300ms' }} />
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Scroll-to-bottom FAB (WhatsApp-style) */}
        {showScrollToBottom && (
          <button
            type="button"
            aria-label="Scroll to latest message"
            onClick={() => {
              anchorChatToBottomSoon();
            }}
            className="absolute right-3 bottom-3 z-20 h-10 w-10 rounded-full bg-background/95 border border-border shadow-lg flex items-center justify-center text-foreground hover:bg-muted active:scale-95 transition-transform animate-fade-in"
          >
            <ChevronDown className="w-5 h-5" />
            {unreadBelow > 0 && (
              <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full bg-primary text-primary-foreground text-[10px] font-bold flex items-center justify-center">
                {unreadBelow > 99 ? '99+' : unreadBelow}
              </span>
            )}
          </button>
        )}

        </div>

        {/* Message Input - Ultra Premium Dark Glass */}
        <div
          className="flex-shrink-0 pt-2 safe-area-bottom bg-background/95 border-t border-border chat-composer-stable"
          style={{ transform: 'translate3d(0, calc(var(--kb-h, 0px) * -1), 0)' }}
        >
          {/* Media Uploader (direct gallery) */}
          {showMediaUploader && (
            <Suspense fallback={null}>
              <MediaUploader
                isOpen={showMediaUploader}
                onClose={() => setShowMediaUploader(false)}
                userId={currentUserId}
                onMediaSelect={(url, type, previewUrl) => {
                  // Save as pending media, don't send directly
                  if (previewUrl) setSignedChatMediaUrls(prev => ({ ...prev, [url]: previewUrl }));
                  setPendingMedia({ url, type, previewUrl });
                  setShowMediaUploader(false);
                }}
                directGallery={true}
              />
            </Suspense>
          )}
          {showEmojiPicker && (
            <Suspense fallback={null}>
              <EmojiPicker
                isOpen={showEmojiPicker}
                onClose={() => setShowEmojiPicker(false)}
                onSelect={(emoji) => {
                  setMessage(prev => prev + emoji);
                }}
              />
            </Suspense>
          )}
          
          {/* Inline Translation Bar — premium luxury redesign */}
          {inlineTranslateEnabled && !isGroup && (
              <div className="px-3 pt-2.5 pb-2 border-t border-border/60 bg-gradient-to-b from-accent/10 via-card to-primary/5">
              {/* Header row */}
              <div className="flex items-center justify-between mb-2 px-1">
                <div className="flex items-center gap-1.5 min-w-0">
                  <span className="text-[11px] font-semibold tracking-wide text-primary whitespace-nowrap">
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
                          ? 'bg-gradient-primary text-primary-foreground border-primary-foreground/40 shadow-lg ring-2 ring-primary/30 scale-[1.04]'
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
                    <span className="text-[10px] font-bold text-primary">
                      {languageOptions.find(l => l.code === inlineTargetLang)?.flag} {inlineTargetLang}
                    </span>
                    {isInlineTranslating && (
                      <span className="inline-flex gap-0.5">
                        <span className="w-1 h-1 bg-primary rounded-full animate-bounce [animation-delay:-0.3s]" />
                        <span className="w-1 h-1 bg-primary rounded-full animate-bounce [animation-delay:-0.15s]" />
                        <span className="w-1 h-1 bg-primary rounded-full animate-bounce" />
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
            <div className="px-4 pb-1 kb-hide-when-open">
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
                      if (!currentUserId) return;
                      setMessage(quickMsg);
                      // Auto-send on tap
                      setTimeout(() => {
                        const content = quickMsg.trim();
                        if (!content || sending) return;
                        setSending(true);
                        setMessage("");
                        anchorChatToBottomSoon();
                        
                        if (selectedConversation) {
                          persistDirectMessage(
                            selectedConversation.id,
                            currentUserId,
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
                          }).select().single()).then(({ data, error }) => {
                            if (error) throw error;
                            appendSentGroupMessage(data);
                            anchorChatToBottomSoon();
                            setSending(false);
                          }).catch(() => {
                            toast.error("Failed to send message");
                            setSending(false);
                          });
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
          
          {/* Reply Preview Bar */}
          {replyingTo && (() => {
            const preview = summarizeMessageForReply(replyingTo.content, replyingTo.messageType);
            return (
            <div className="px-4 pt-2 pb-1 flex items-center gap-2 animate-in slide-in-from-bottom-2 duration-200 kb-hide-when-open">
                <div className="flex-1 flex items-center gap-2 pl-3 border-l-[3px] border-primary rounded-l-sm bg-muted/40 rounded-r-lg py-1.5 px-2">
                  <MessageSquareReply className="w-4 h-4 text-primary shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-[10px] font-semibold text-foreground truncate">{replyingTo.senderName}</p>
                    <p className="text-[11px] text-muted-foreground truncate">{preview.label}</p>
                  </div>
                  {preview.thumb && (
                    <img
                      src={preview.thumb}
                      alt=""
                      className="w-9 h-9 rounded object-cover shrink-0"
                      loading="lazy"
                    />
                  )}
                </div>
                <button
                  onClick={() => setReplyingTo(null)}
                  className="p-1.5 rounded-full hover:bg-muted transition-colors shrink-0"
                  aria-label="Cancel reply"
                >
                  <X className="w-4 h-4 text-muted-foreground" />
                </button>
              </div>
            );
          })()}
          
          {/* Input Row - Voice Recording, Pending Media, or Text Mode */}
          <div className="px-4 py-3 flex items-center gap-2">
            {/* Recording Mode */}
            {(isRecording || nativeRecorder.isRecording || audioBlob) ? (
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
                    (isRecording || nativeRecorder.isRecording) ? "bg-destructive/10" : "bg-success/10"
                  )}>
                    {(isRecording || nativeRecorder.isRecording) ? (
                      <>
                        <div className="flex-1 px-4">
                          <VoiceWaveform 
                            amplitudes={nativeRecorder.amplitudes} 
                            isRecording={true} 
                            className="w-full"
                          />
                        </div>
                        <span className="text-destructive font-semibold text-lg pr-4">
                          {formatRecordingTime(nativeRecorder.isNative ? nativeRecorder.duration : recordingDuration)}
                        </span>
                      </>
                    ) : (
                      <>
                        <Mic className="w-5 h-5 text-success-600" />
                        <span className="text-success-600 font-medium">
                          {formatRecordingTime(nativeRecorder.isNative ? nativeRecorder.duration : recordingDuration)} Ready to send
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
                  onClick={(isRecording || nativeRecorder.isRecording) ? stopVoiceRecording : sendVoiceMessage}
                  disabled={sendingVoice}
                  className={cn(
                    "w-11 h-11 rounded-full flex items-center justify-center shadow-lg",
                    (isRecording || nativeRecorder.isRecording) 
                      ? "bg-destructive" 
                      : "bg-gradient-primary"
                  )}
                >
                  {sendingVoice ? (
                    <div className="w-5 h-5 border-2 border-primary-foreground border-t-transparent rounded-full animate-spin" />
                  ) : (isRecording || nativeRecorder.isRecording) ? (
                    <div className="w-4 h-4 bg-primary-foreground rounded-sm" />
                  ) : (
                    <Send className="w-5 h-5 text-primary-foreground" />
                  )}
                </motion.button>
              </>

            ) : pendingMedia ? (
              /* Pending Media Mode - Show preview, change, remove, send */
              <>
                {/* Remove Button */}
                <motion.button
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  whileTap={{ scale: 0.9 }}
                  onClick={() => setPendingMedia(null)}
                  aria-label="Remove attachment"
                  className="w-11 h-11 rounded-full bg-muted flex items-center justify-center shrink-0"
                >
                  <X className="w-5 h-5 text-muted-foreground" />
                </motion.button>

                {/* Media Preview (tap to change) */}
                <div className="flex-1 relative min-w-0">
                  <button
                    type="button"
                    onClick={() => {
                      setPendingMedia(null);
                      setShowMediaUploader(true);
                    }}
                    aria-label="Change attachment"
                    className="w-full h-11 rounded-full bg-primary/10 flex items-center gap-2 px-3 active:opacity-80 transition"
                  >
                    {pendingMedia.type === 'image' ? (
                      <img loading="lazy" decoding="async"
                        src={pendingMedia.previewUrl || signedChatMediaUrls[pendingMedia.url] || pendingMedia.url}
                        alt="Preview"
                        className="w-8 h-8 rounded-lg object-cover shrink-0" />
                    ) : pendingMedia.type === 'video' ? (
                      <video
                        src={pendingMedia.previewUrl || signedChatMediaUrls[pendingMedia.url] || pendingMedia.url}
                        muted
                        autoPlay
                        loop
                        playsInline
                        controls={false}
                        preload="auto"
                        disablePictureInPicture
                        disableRemotePlayback
                        controlsList="nodownload nofullscreen noremoteplayback noplaybackrate"
                        className="w-8 h-8 rounded-lg object-cover shrink-0 bg-black"
                      />
                    ) : pendingMedia.type === 'audio' ? (
                      <Mic className="w-5 h-5 text-warning-600 shrink-0" />
                    ) : (
                      <FileText className="w-5 h-5 text-primary shrink-0" />
                    )}
                    <span className="text-primary font-medium text-sm truncate flex-1 text-left">
                      {pendingMedia.type === 'image' ? '📷 Image' : pendingMedia.type === 'video' ? '🎥 Video' : pendingMedia.type === 'audio' ? '🎵 Audio' : '📄 Document'}
                    </span>
                    <span className="text-[11px] text-muted-foreground font-medium px-2 py-0.5 rounded-full bg-background/70 shrink-0">
                      Change
                    </span>
                  </button>
                </div>
                
                {/* Send Button for Media */}
                <motion.button
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  whileTap={{ scale: 0.9 }}
                  onClick={async () => {
                    if (!pendingMedia) return;
                    if (!currentUserId) return;
                    try {
                      // 🔍 Image OCR — only when the sender is a real verified host.
                      // Agencies/users may share payment/contact images freely.
                      const imgSenderIsHost = isContactRestrictedHost(myProfile);
                      if (pendingMedia.type === 'image' && currentUserId && imgSenderIsHost) {
                        const { checkImageFilename } = await import('@/utils/imageContactDetection');
                        const filename = pendingMedia.url.split('/').pop() || '';
                        if (checkImageFilename(filename)) {
                          // Block the image entirely
                          toast.error("⚠️ Contact sharing detected! Image blocked.");
                          numberWarning.showGenericWarning();
                          if (imgSenderIsHost) {
                            const sourceId = selectedConversation?.id || selectedGroup?.id;
                            scanImageForContactInfo(signedChatMediaUrls[pendingMedia.url] || pendingMedia.url, currentUserId, 'private_message', sourceId)
                              .then(res => {
                                if (res.detected && res.violationNumber) {
                                  numberWarning.showGenericWarning();
                                }
                              }).catch(() => {});
                          }
                          setPendingMedia(null);
                          return;
                        }

                        // Background OCR scan — only host sender accrues deductions
                        if (imgSenderIsHost) {
                          const sourceId = selectedConversation?.id || selectedGroup?.id;
                          scanImageForContactInfo(signedChatMediaUrls[pendingMedia.url] || pendingMedia.url, currentUserId, 'private_message', sourceId)
                            .then(res => {
                              if (res.detected && res.violationNumber) {
                                numberWarning.showGenericWarning();
                              } else if (res.detected) {
                                numberWarning.showGenericWarning();
                              }
                            }).catch(() => {});
                        }
                      }

                      if (selectedConversation) {
                        const sentMessage = await persistDirectMessage(
                          selectedConversation.id,
                          currentUserId,
                          pendingMedia.url,
                          pendingMedia.type
                        );
                        const recipientId = selectedConversation.other_user?.id;
                        if (recipientId) {
                          supabase.functions.invoke('notify-new-message', {
                            body: {
                              conversationId: selectedConversation.id,
                              messageId: sentMessage.id,
                              senderId: currentUserId,
                              recipientId,
                              messageContent: '',
                              messageType: pendingMedia.type,
                            }
                          }).catch(() => {});
                        }
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

                        if (error) throw error;

                        appendSentGroupMessage(newMsg);
                      }
                      toast.success("Media sent!");
                      setPendingMedia(null);
                    } catch (error) {
                      toast.error("Failed to send media");
                    }
                  }}
                  disabled={sending}
                    className="w-11 h-11 rounded-full bg-gradient-primary flex items-center justify-center shadow-lg"
                >
 <Send className="w-5 h-5 text-primary-foreground" />
                </motion.button>
              </>
            ) : (
              <>
                {/* WhatsApp-style flat composer pill */}
                <div
                  className={cn(
                    "flex-1 flex items-center gap-1 pl-2 pr-1 h-11 rounded-full bg-muted/60 border border-border/60 transition-colors",
                    inlineTranslateEnabled && "ring-1 ring-primary/40 border-primary/60"
                  )}
                >
                  <button
                    type="button"
                    onClick={() => setShowEmojiPicker(!showEmojiPicker)}
                    className="shrink-0 w-9 h-9 rounded-full flex items-center justify-center active:bg-muted transition-colors"
                    aria-label="Emoji"
                  >
                    <Smile className="w-[22px] h-[22px] text-muted-foreground" />
                  </button>
                  <Input
                    value={message}
                    onChange={(e) => handleMessageChange(e.target.value)}
                    placeholder="Message"
                    className="flex-1 h-9 border-0 bg-transparent px-1 text-[15px] text-foreground placeholder:text-muted-foreground focus-visible:ring-0 focus-visible:ring-offset-0 shadow-none"
                    onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && handleSend()}
                    disabled={sending}
                  />

                  <button
                    type="button"
                    onClick={() => { setShowMediaUploader(true); setShowEmojiPicker(false); }}
                    className="shrink-0 w-9 h-9 rounded-full flex items-center justify-center active:bg-muted transition-colors"
                    aria-label="Attach photo or video"
                  >
                    <Paperclip className="w-[20px] h-[20px] text-muted-foreground -rotate-45" />
                  </button>
                </div>

                {/* Send / Mic FAB — flat WhatsApp-style */}
                <motion.button
                  initial={false}
                  whileTap={{ scale: 0.92 }}
                  onClick={message.trim() ? () => { void handleSend(); } : handleVoiceRecord}
                  disabled={sending}
                  className={cn(
                    "shrink-0 w-11 h-11 rounded-full flex items-center justify-center transition-colors",
                    message.trim()
                      ? "bg-primary text-primary-foreground shadow-[0_2px_6px_rgba(0,0,0,0.12)]"
                      : "bg-primary text-primary-foreground shadow-[0_2px_6px_rgba(0,0,0,0.12)]"
                  )}
                  aria-label={message.trim() ? "Send" : "Record voice"}
                >
                  {message.trim() ? (
                    <Send className="w-[20px] h-[20px]" />
                  ) : (
                    <Mic className="w-[20px] h-[20px]" />
                  )}
                </motion.button>
              </>
            )}
          </div>

          
          {/* Action Buttons Row — premium 3D orbs */}
          {!isGroup && (
            <div className="px-4 pb-3 kb-hide-when-open">
              <div className="flex justify-center gap-5">
                {/* Translator */}
                <motion.button
                  whileHover={{ y: -2, scale: 1.05 }}
                  whileTap={{ scale: 0.92 }}
                  onClick={() => {
                    setInlineTranslateEnabled(!inlineTranslateEnabled);
                    if (!inlineTranslateEnabled && message.trim()) {
                      translateInlineMessage(message, inlineTargetLang);
                    }
                  }}
                  className="flex flex-col items-center gap-1.5 group"
                >
                  <div
                    className={cn(
                      "relative w-12 h-12 flex items-center justify-center transition-all duration-300",
                      inlineTranslateEnabled && "drop-shadow-[0_0_10px_rgba(99,102,241,0.55)]"
                    )}
                  >
                    <img
                      loading="lazy"
                      decoding="async"
                      src={icon3dTranslate}
                      alt="Translate"
                      width={96}
                      height={96}
                      className="w-12 h-12 object-contain drop-shadow-[0_4px_8px_rgba(0,0,0,0.18)]"
                    />
                  </div>
                  <span className={cn(
                    "text-[9px] font-bold tracking-wide",
                    inlineTranslateEnabled ? "text-primary" : "text-muted-foreground"
                  )}>
                    {inlineTranslateEnabled ? "ON" : "Translate"}
                  </span>
                </motion.button>

                {/* Gift */}
                <motion.button
                  whileHover={{ y: -2, scale: 1.05 }}
                  whileTap={{ scale: 0.92 }}
                  onClick={() => setShowGiftPanel(true)}
                  className="flex flex-col items-center gap-1.5 group"
                >
                  <div className="relative w-12 h-12 flex items-center justify-center">
                    <img
                      loading="lazy"
                      decoding="async"
                      src={icon3dGift}
                      alt="Gift"
                      width={96}
                      height={96}
                      className="w-12 h-12 object-contain drop-shadow-[0_4px_8px_rgba(236,72,153,0.35)]"
                    />
                  </div>
                  <span className="text-[9px] font-bold text-muted-foreground tracking-wide">Gift</span>
                </motion.button>

                {/* Games */}
                <motion.button
                  whileHover={{ y: -2, scale: 1.05 }}
                  whileTap={{ scale: 0.92 }}
                  onClick={() => setShowGamePanel(true)}
                  className="flex flex-col items-center gap-1.5 group"
                >
                  <div className="relative w-12 h-12 flex items-center justify-center">
                    <img
                      loading="lazy"
                      decoding="async"
                      src={icon3dGames}
                      alt="Games"
                      width={96}
                      height={96}
                      className="w-12 h-12 object-contain drop-shadow-[0_4px_8px_rgba(16,185,129,0.35)]"
                    />
                  </div>
                  <span className="text-[9px] font-bold text-muted-foreground tracking-wide">Games</span>
                </motion.button>

                {/* Video Call */}
                {selectedConversation?.other_user?.is_host && selectedConversation?.other_user?.is_online && (
                  <motion.button
                    whileHover={{ y: -2, scale: 1.05 }}
                    whileTap={{ scale: 0.92 }}
                    onClick={() => {
                      if (selectedConversation?.other_user?.id) {
                        startCall(selectedConversation.other_user.id);
                      }
                    }}
                    className="flex flex-col items-center gap-1.5 group"
                  >
                    <div
                      className="relative w-12 h-12 rounded-2xl flex items-center justify-center overflow-hidden"
                      style={{
                        background: 'radial-gradient(120% 120% at 30% 20%, #fecaca 0%, #ef4444 45%, #7f1d1d 100%)',
                        boxShadow: '0 10px 22px -8px rgba(239,68,68,0.6), inset 0 1px 0 rgba(255,255,255,0.45), inset 0 -2px 6px rgba(0,0,0,0.3)'
                      }}
                    >
                      <div className="absolute inset-0 rounded-2xl bg-white/10 animate-pulse" />
                      <div className="absolute inset-x-1.5 top-1 h-2 rounded-full bg-white/40 blur-[2px] pointer-events-none" />
                      <VideoCallIcon className="w-5 h-5 text-white relative drop-shadow-[0_1px_2px_rgba(0,0,0,0.4)]" />
                    </div>
                    <div className="flex flex-col items-center">
                      <span className="text-[9px] font-bold text-muted-foreground tracking-wide">Video Call</span>
                      {selectedConversation.other_user.call_rate_per_minute && selectedConversation.other_user.call_rate_per_minute > 0 && (
                        <span className="text-[8px] text-warning-600/85 font-semibold">💎 {selectedConversation.other_user.call_rate_per_minute}/min</span>
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
                  <Languages className="w-5 h-5 text-primary" />
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
                    className="w-full mt-2 p-3 rounded-xl border border-border min-h-[80px] resize-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all"
                  />
                </div>

                {/* Translation Result - Shows below input */}
                <div className={`rounded-xl border-2 border-dashed transition-all ${
                  translatedResult 
                    ? 'border-primary/40 bg-primary/10' 
 :'border-border bg-muted/30'
                }`}>
                  <div className="p-3">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs font-medium text-primary">
                        {languageOptions.find(l => l.code === selectedLanguage)?.flag} {selectedLanguage}
                      </span>
                      {isTranslating && (
                        <span className="text-[10px] text-muted-foreground flex items-center gap-1">
                          <span className="w-2 h-2 bg-primary rounded-full animate-pulse" />
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
                  className="w-full bg-gradient-primary text-primary-foreground"
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
          {showGiftPanel && (
            <Suspense fallback={null}>
              <GiftPanel
                isOpen={showGiftPanel}
                onClose={() => setShowGiftPanel(false)}
                onSendGift={handleSendGift}
                userDiamonds={userDiamonds}
              />
            </Suspense>
          )}
          
          {/* Game Panel - Same as Live/Party Room */}
          {showGamePanel && (
            <Suspense fallback={null}>
              <LiveGameSelector
                isOpen={showGamePanel}
                onClose={() => setShowGamePanel(false)}
                onOpenGifts={() => setShowGiftPanel(true)}
              />
            </Suspense>
          )}

          {/* Unified Flying Gift Pill — same Bigo/Chamet style as Live/Party/Call */}
          <AnimatePresence>
            {flyingGifts.map((g, idx) => (
              <FlyingGiftAnimation
                key={g.id}
                gift={g}
                stackIndex={idx}
                onComplete={() => removeFlyingGift(g.id)}
              />
            ))}
          </AnimatePresence>

          {/* Gift Emoji Animation (fullscreen heavy media) */}
          <AnimatePresence>
            {showGiftAnimation && animatingGiftEmoji && (
              <Suspense fallback={null}>
                <GiftEmojiAnimation
                  key={`${giftAnimationInstance}-${animatingGiftEmoji}`}
                  emoji={animatingGiftEmoji}
                  animationFormat={animatingGiftFormat}
                  animationConfigUrl={animatingGiftConfigUrl}
                  soundUrl={animatingGiftSound || undefined}
                  onComplete={() => {
                    setShowGiftAnimation(false);
                    setAnimatingGiftEmoji("");
                    setAnimatingGiftFormat(null);
                    setAnimatingGiftConfigUrl(null);
                    setAnimatingGiftSound(null);
                  }}
                />
              </Suspense>
            )}
          </AnimatePresence>

          {/* Message Info Dialog */}
          <Dialog open={showMessageInfo} onOpenChange={setShowMessageInfo}>
            <DialogContent className="max-w-sm">
              <DialogHeader>
                <DialogTitle className="text-foreground">Message Info</DialogTitle>
              </DialogHeader>
              {messageInfoMessage && (
                <div className="space-y-3 py-2">
                  <div className="rounded-xl bg-muted p-3">
                    <p className="text-sm text-foreground break-words">{messageInfoMessage.content}</p>
                  </div>
                  <div className="space-y-2">
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-muted-foreground">Sent</span>
                      <span className="text-foreground font-medium">{new Date(messageInfoMessage.created_at).toLocaleString()}</span>
                    </div>
                    {messageInfoMessage.delivered_at && (
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-muted-foreground">Delivered</span>
                        <span className="text-foreground font-medium">{new Date(messageInfoMessage.delivered_at).toLocaleString()}</span>
                      </div>
                    )}
                    {messageInfoMessage.read_at && (
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-muted-foreground">Read</span>
                        <span className="text-foreground font-medium">{new Date(messageInfoMessage.read_at).toLocaleString()}</span>
                      </div>
                    )}
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-muted-foreground">Status</span>
                      <span className="text-foreground font-medium capitalize">{messageInfoMessage.status || 'sent'}</span>
                    </div>
                  </div>
                </div>
              )}
            </DialogContent>
          </Dialog>
        </div>

        {/* Group Settings Panel (also rendered inside active conversation view) */}
        {showGroupSettings && selectedGroup && currentUserId && (
          <Suspense fallback={null}>
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
          </Suspense>
        )}
      </div>
    );
  }


  return (
    <div data-page="chat" className="fixed inset-0 flex flex-col overflow-hidden profile-home-shell">
      <ChatListView
        chatTab={chatTab}
        onTabChange={handleTabChange}
        globalUnread={globalUnread}
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        loading={loading}
        conversations={conversations}
        groups={groups}
        onSelectConversation={handleSelectConversation}
        onSelectGroup={handleSelectGroup}
        onShowGroupActions={() => setShowGroupActions(true)}
        currentUserId={currentUserId}
      />


      <ChatDialogs
        showGroupActions={showGroupActions}
        onShowGroupActionsChange={setShowGroupActions}
        onShowCreateGroup={() => setShowCreateGroup(true)}
        onShowSearchGroup={() => setShowSearchGroup(true)}
        showCreateGroup={showCreateGroup}
        onShowCreateGroupChange={setShowCreateGroup}
        newGroupName={newGroupName}
        onNewGroupNameChange={setNewGroupName}
        newGroupType={newGroupType}
        onNewGroupTypeChange={setNewGroupType}
        newGroupPhotoPreview={newGroupPhotoPreview}
        groupPhotoInputRef={groupPhotoInputRef}
        onGroupPhotoSelect={(file) => {
          setNewGroupPhoto(file);
          setNewGroupPhotoPreview(URL.createObjectURL(file));
        }}
        creatingGroup={creatingGroup}
        onCreateGroup={handleCreateGroup}
        showSearchGroup={showSearchGroup}
        onShowSearchGroupChange={setShowSearchGroup}
        groupSearchQuery={groupSearchQuery}
        onGroupSearchQueryChange={setGroupSearchQuery}
        groupSearchResults={groupSearchResults}
        onSearchGroup={handleSearchGroup}
        onJoinGroup={handleJoinGroup}
      />
      {/* Group Settings Panel */}
      {showGroupSettings && selectedGroup && currentUserId && (
        <Suspense fallback={null}>
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
        </Suspense>
      )}

      {/* Report User Dialog */}
      {showReportDialog && selectedConversation?.other_user?.id && currentUserId && (
        <Suspense fallback={null}>
          <ReportUserDialog
            open={showReportDialog}
            onOpenChange={setShowReportDialog}
            reportedUserId={selectedConversation.other_user.id}
            reporterUserId={currentUserId}
            contextType="chat"
            contextId={selectedConversation.id}
          />
        </Suspense>
      )}

      <BottomNavigation activeTab={activeTab} onTabChange={(path) => {
        setActiveTab(path);
        navigate(path);
      }} />

      <ImageViewer src={imageViewer.viewerImage} open={imageViewer.isOpen} onClose={imageViewer.closeImage} alt="Shared Image" />

      {/* Quick-react popup (long-press / React menu) */}
      <ReactionPickerSheet
        open={!!reactionPickerMsgId}
        onClose={() => setReactionPickerMsgId(null)}
        onPick={(emoji) => {
          if (reactionPickerMsgId) toggleReaction(reactionPickerMsgId, emoji);
        }}
      />

      {/* Full-screen swipeable media gallery */}
      <MediaGalleryViewer
        open={galleryOpen}
        startId={galleryStartId}
        onClose={() => setGalleryOpen(false)}
        items={(selectedGroup ? groupMessages : messages)
          .filter((m: any) =>
            isChatImageMessage(m.message_type, m.content) ||
            isChatVideoMessage(m.message_type, m.content)
          )
          .map((m: any): GalleryItem => {
            const clean = extractChatMediaPath(m.content || '');
            return {
              id: m.id,
              url: signedChatMediaUrls[clean] || clean,
              type: isChatVideoMessage(m.message_type, m.content) ? 'video' : 'image',
              sender: m.sender_id === currentUserId
                ? (myProfile?.display_name || 'You')
                : (selectedGroup ? m.sender?.display_name : selectedConversation?.other_user?.display_name) || 'User',
              createdAt: m.created_at,
            };
          })}
      />
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
