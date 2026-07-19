import React, { useMemo, useRef, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { MessageCircle, Search, Users, Crown, Pin, BellOff, Trash2, CheckCheck, Bell, Archive } from "lucide-react";
import { useInboxTyping } from "@/hooks/useInboxTyping";
import { useVirtualizer } from "@tanstack/react-virtual";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { NotificationList } from "@/components/notifications/NotificationList";
import { OfficialNoticeList } from "@/components/notifications/OfficialNoticeList";
import AvatarWithFrame from "@/components/common/AvatarWithFrame";
import { LevelBadge } from "@/components/common/LevelBadge";
import { enhanceThumbnail } from "@/utils/enhanceThumbnail";
import { formatBadgeCount } from "@/hooks/useGlobalUnreadCount";
import { pickDisplayLevel } from "@/utils/displayLevel";
import { useConversationPrefs, type ConversationPref } from "@/hooks/useConversationPrefs";
import { hapticFeedback } from "@/utils/nativeUtils";
import { toast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import type { Conversation, Group } from "./chatTypes";

interface ChatListViewProps {
  chatTab: string;
  onTabChange: (tab: string) => void;
  globalUnread: { messages: number; official: number; notifications: number };
  searchQuery: string;
  onSearchChange: (query: string) => void;
  loading: boolean;
  conversations: Conversation[];
  groups: Group[];
  onSelectConversation: (conv: Conversation) => void;
  onSelectGroup: (group: Group) => void;
  onShowGroupActions: () => void;
  currentUserId?: string | null;
}

const formatTime = (dateString: string) => {
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / (1000 * 60));
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  if (diffMins < 1) return "now";
  if (diffMins < 60) return `${diffMins}m`;
  if (diffHours < 24) return `${diffHours}h`;
  if (diffDays < 7) return `${diffDays}d`;
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
};

const VIRTUALIZE_THRESHOLD = 30;
const CONV_ROW_HEIGHT = 76;
const GROUP_ROW_HEIGHT = 76;
const LONG_PRESS_MS = 480;

// Swipe-action thresholds (px). Mirrors WhatsApp/Telegram feel.
const SWIPE_REVEAL = 72;     // distance to rest the row open at
const SWIPE_TRIGGER = 132;   // distance past which release auto-fires action
const SWIPE_MAX = 160;       // hard rubber-band cap
const SWIPE_LOCK = 8;        // px of horizontal travel before we claim the gesture

// ------------------------- Typing dots ------------------------- //
const TypingDots: React.FC = () => (
  <span className="inline-flex items-end gap-[3px] h-[14px]">
    <span className="w-1 h-1 rounded-full bg-emerald-500 animate-[typing-bounce_1s_ease-in-out_infinite]" />
    <span className="w-1 h-1 rounded-full bg-emerald-500 animate-[typing-bounce_1s_ease-in-out_infinite] [animation-delay:120ms]" />
    <span className="w-1 h-1 rounded-full bg-emerald-500 animate-[typing-bounce_1s_ease-in-out_infinite] [animation-delay:240ms]" />
  </span>
);

// ------------------------- Conversation row ------------------------- //
interface ConversationRowProps {
  conv: Conversation;
  pref?: ConversationPref;
  isTyping?: boolean;
  onSelect: (c: Conversation) => void;
  onLongPress: (c: Conversation) => void;
  onTogglePin: (c: Conversation) => void;
  onToggleMute: (c: Conversation) => void;
}

const ConversationRow: React.FC<ConversationRowProps> = React.memo(
  ({ conv, pref, isTyping, onSelect, onLongPress, onTogglePin, onToggleMute }) => {
    const pressTimer = useRef<number | null>(null);
    const longPressed = useRef(false);
    const isPinned = pref?.is_pinned ?? false;
    const isMuted = pref?.is_muted ?? false;
    const markedUnread = pref?.marked_unread ?? false;
    const effectiveUnread = conv.unread_count > 0 || markedUnread;

    // Swipe state — translateX of the row content, with reveal panels behind.
    const [dx, setDx] = useState(0);
    const dragState = useRef<{
      startX: number;
      startY: number;
      startDx: number;
      pointerId: number;
      claimed: boolean; // true once we lock the horizontal gesture
      cancelled: boolean;
    } | null>(null);

    const resetSwipe = useCallback(() => setDx(0), []);

    const closeIfOpen = useCallback(() => {
      if (dx !== 0) setDx(0);
    }, [dx]);

    const cancelPress = useCallback(() => {
      if (pressTimer.current) window.clearTimeout(pressTimer.current);
      pressTimer.current = null;
    }, []);

    const startPress = useCallback(() => {
      longPressed.current = false;
      pressTimer.current = window.setTimeout(() => {
        longPressed.current = true;
        hapticFeedback("medium");
        onLongPress(conv);
      }, LONG_PRESS_MS);
    }, [conv, onLongPress]);

    const onPointerDown = useCallback(
      (e: React.PointerEvent) => {
        // Only react to primary pointer (touch/mouse-left/pen).
        if (e.button !== undefined && e.button !== 0) return;
        dragState.current = {
        };
        startPress();
      },
      [dx, startPress],
    );

    const onPointerMove = useCallback(
      (e: React.PointerEvent) => {
        const s = dragState.current;
        if (!s || s.cancelled) return;
        const deltaX = e.clientX - s.startX;
        const deltaY = e.clientY - s.startY;

        if (!s.claimed) {
          // Vertical scroll wins — bail out and let the list scroll.
          if (Math.abs(deltaY) > SWIPE_LOCK && Math.abs(deltaY) > Math.abs(deltaX)) {
            s.cancelled = true;
            cancelPress();
            return;
          }
          if (Math.abs(deltaX) > SWIPE_LOCK) {
            s.claimed = true;
            cancelPress();
            try { (e.currentTarget as HTMLElement).setPointerCapture(s.pointerId); } catch { /* noop */ }
          } else {
            return;
          }
        }

        let next = s.startDx + deltaX;
        // Rubber-band clamp.
        if (next > SWIPE_MAX) next = SWIPE_MAX + (next - SWIPE_MAX) * 0.18;
        if (next < -SWIPE_MAX) next = -SWIPE_MAX + (next + SWIPE_MAX) * 0.18;
        setDx(next);
      },
      [cancelPress],
    );

    const onPointerUp = useCallback(
      (e: React.PointerEvent) => {
        const s = dragState.current;
        dragState.current = null;
        cancelPress();
        if (!s) return;
        try { (e.currentTarget as HTMLElement).releasePointerCapture(s.pointerId); } catch { /* noop */ }
        if (!s.claimed || s.cancelled) return;
        // Decide final resting state.
        if (dx >= SWIPE_TRIGGER) {
          setDx(0);
          hapticFeedback("medium");
          onTogglePin(conv);
        } else if (dx <= -SWIPE_TRIGGER) {
          setDx(0);
          hapticFeedback("medium");
          onToggleMute(conv);
        } else if (dx >= SWIPE_REVEAL) {
          setDx(SWIPE_REVEAL);
        } else if (dx <= -SWIPE_REVEAL) {
          setDx(-SWIPE_REVEAL);
        } else {
          setDx(0);
        }
        // Click intercept: if we actually dragged, swallow the upcoming click.
        longPressed.current = true;
      },
      [conv, dx, cancelPress, onTogglePin, onToggleMute],
    );

    const handleClick = useCallback(() => {
      if (longPressed.current) {
        longPressed.current = false;
        return;
      }
      if (dx !== 0) {
        resetSwipe();
        return;
      }
      onSelect(conv);
    }, [conv, dx, onSelect, resetSwipe]);

    const handleRevealAction = useCallback(
      (kind: "pin" | "mute") => {
        setDx(0);
        hapticFeedback("light");
        if (kind === "pin") onTogglePin(conv);
        else onToggleMute(conv);
      },
      [conv, onTogglePin, onToggleMute],
    );

    return (
      <div
        className={cn("relative w-full overflow-hidden", isPinned && "bg-primary/[0.025]")}
        onPointerLeave={closeIfOpen}
      >
        {/* Right-swipe reveal (pin) — sits on the LEFT, revealed when dx > 0 */}
        <button
          type="button"
          aria-label={isPinned ? "Unpin" : "Pin"}
          onClick={() => handleRevealAction("pin")}
          tabIndex={dx > 0 ? 0 : -1}
          className={cn(
            "absolute inset-y-0 left-0 flex items-center justify-start pl-5 pr-3 transition-opacity duration-150",
            "bg-gradient-to-r from-amber-500/95 to-amber-400/80 text-white",
            dx > 4 ? "opacity-100" : "opacity-0 pointer-events-none",
          )}
          style={{ width: Math.max(0, dx) }}
        >
          <Pin className="w-5 h-5 shrink-0" />
        </button>
        {/* Left-swipe reveal (mute) — sits on the RIGHT, revealed when dx < 0 */}
        <button
          type="button"
          aria-label={isMuted ? "Unmute" : "Mute"}
          onClick={() => handleRevealAction("mute")}
          tabIndex={dx < 0 ? 0 : -1}
          className={cn(
            "absolute inset-y-0 right-0 flex items-center justify-end pr-5 pl-3 transition-opacity duration-150",
            "bg-gradient-to-l from-slate-600/95 to-slate-500/80 text-white",
            dx < -4 ? "opacity-100" : "opacity-0 pointer-events-none",
          )}
          style={{ width: Math.max(0, -dx) }}
        >
          {isMuted ? <Bell className="w-5 h-5 shrink-0" /> : <BellOff className="w-5 h-5 shrink-0" />}
        </button>

        <button
          onClick={handleClick}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
          onContextMenu={(e) => { e.preventDefault(); onLongPress(conv); }}
          style={{
            transform: `translate3d(${dx}px, 0, 0)`,
            transition: dragState.current?.claimed ? "none" : "transform 220ms cubic-bezier(0.22, 0.61, 0.36, 1)",
            touchAction: "pan-y",
          }}
          className={cn(
            "relative w-full flex items-stretch gap-3 px-4 py-2.5 bg-card active:bg-muted/60",
          )}
        >
          <div className="relative shrink-0 self-center">
            {conv.other_user?.id ? (
              <AvatarWithFrame
                userId={conv.other_user.id}
                src={conv.other_user?.avatar_url || undefined}
                name={conv.other_user?.display_name || "User"}
                level={pickDisplayLevel(conv.other_user as any)}
                size="md"
                showAnimation={false}
              />
            ) : (
              <Avatar className="w-14 h-14">
                <AvatarImage src={conv.other_user?.avatar_url || undefined} />
                <AvatarFallback className="bg-muted text-muted-foreground">
                  {conv.other_user?.display_name?.[0] || "?"}
                </AvatarFallback>
              </Avatar>
            )}
            {conv.other_user?.is_online && (
              <span className="absolute bottom-0.5 right-0.5 w-3 h-3 bg-emerald-500 border-2 border-background rounded-full" />
            )}
          </div>
          <div className="flex-1 text-left min-w-0 flex flex-col justify-center border-b border-border/50">
            <div className="flex items-center gap-1.5">
              <h3 className="font-medium text-[15.5px] truncate text-foreground">
                {conv.other_user?.display_name || "User"}
              </h3>
              {conv.other_user?.country_flag && (
                <span className="text-xs shrink-0">{conv.other_user.country_flag}</span>
              )}
              <LevelBadge level={pickDisplayLevel(conv.other_user as any)} size="xs" />
              <span
                className={cn(
                  "text-[11px] shrink-0 ml-auto",
                  effectiveUnread && !isMuted ? "text-emerald-600 font-semibold" : "text-muted-foreground",
                )}
              >
                {conv.last_message_at ? formatTime(conv.last_message_at) : ""}
              </span>
            </div>
            <div className="flex items-center justify-between gap-2 mt-0.5">
              {isTyping ? (
                <p className="text-[13.5px] truncate text-emerald-600 font-medium flex items-center gap-1.5">
                  <TypingDots />
                  <span>typing…</span>
                </p>
              ) : (
                <p
                  className={cn(
                    "text-[13.5px] truncate",
                    effectiveUnread && !isMuted ? "text-foreground/90" : "text-muted-foreground",
                  )}
                >
                  {conv.last_message || "No messages yet"}
                </p>
              )}
              <div className="flex items-center gap-1 shrink-0">
                {isMuted && <BellOff className="w-3.5 h-3.5 text-muted-foreground" />}
                {isPinned && <Pin className="w-3.5 h-3.5 text-muted-foreground fill-muted-foreground/40" />}
                {effectiveUnread && (
                  <span
                    className={cn(
                      "min-w-[20px] h-5 px-1.5 text-white text-[11px] font-semibold rounded-full flex items-center justify-center",
                      isMuted ? "bg-muted-foreground/60" : "bg-emerald-500",
                    )}
                  >
                    {conv.unread_count > 99 ? "99+" : conv.unread_count > 0 ? conv.unread_count : "•"}
                  </span>
                )}
              </div>
            </div>
          </div>
        </button>
      </div>
    );
  },
);
ConversationRow.displayName = "ConversationRow";

// ------------------------- Group row ------------------------- //
const GroupRow: React.FC<{ group: Group; onSelect: (g: Group) => void }> = React.memo(
  ({ group, onSelect }) => (
    <button
      onClick={() => onSelect(group)}
      className="w-full flex items-stretch gap-3 px-4 py-2.5 bg-transparent active:bg-muted/60 transition-colors duration-150"
    >
      <Avatar className="w-14 h-14 shrink-0 self-center">
        <AvatarImage src={group.avatar_url ? enhanceThumbnail(group.avatar_url, { width: 64, quality: 82 }) : undefined} />
        <AvatarFallback className="bg-muted text-muted-foreground">
          <Users className="w-6 h-6" />
        </AvatarFallback>
      </Avatar>
      <div className="flex-1 text-left min-w-0 flex flex-col justify-center border-b border-border/50">
        <div className="flex items-center gap-1.5">
          <h3 className="font-medium text-[15.5px] truncate text-foreground">{group.name}</h3>
          {group.is_owner && <Crown className="w-3.5 h-3.5 text-amber-500 shrink-0" />}
        </div>
        <p className="text-[13px] text-muted-foreground truncate mt-0.5">
          {group.member_count} member{group.member_count === 1 ? "" : "s"}
        </p>
      </div>
    </button>
  ),
);
GroupRow.displayName = "GroupRow";

// ------------------------- Virtualized wrappers ------------------------- //
const VirtualConversations: React.FC<{
  scrollRef: React.RefObject<HTMLElement>;
  items: Conversation[];
  prefs: Record<string, ConversationPref>;
  typingSet: Set<string>;
  onSelect: (c: Conversation) => void;
  onLongPress: (c: Conversation) => void;
  onTogglePin: (c: Conversation) => void;
  onToggleMute: (c: Conversation) => void;
}> = ({ scrollRef, items, prefs, typingSet, onSelect, onLongPress, onTogglePin, onToggleMute }) => {
  const virtualizer = useVirtualizer({
    count: items.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => CONV_ROW_HEIGHT,
    overscan: 6,
    getItemKey: (i) => items[i].id,
  });
  return (
    <div style={{ height: virtualizer.getTotalSize(), position: "relative" }}>
      {virtualizer.getVirtualItems().map((vi) => (
        <div
          key={vi.key}
          ref={virtualizer.measureElement}
          data-index={vi.index}
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            right: 0,
            transform: `translateY(${vi.start}px)`,
          }}
        >
          <ConversationRow
            conv={items[vi.index]}
            pref={prefs[items[vi.index].id]}
            isTyping={typingSet.has(items[vi.index].id)}
            onSelect={onSelect}
            onLongPress={onLongPress}
            onTogglePin={onTogglePin}
            onToggleMute={onToggleMute}
          />
        </div>
      ))}
    </div>
  );
};

const VirtualGroups: React.FC<{
  scrollRef: React.RefObject<HTMLElement>;
  items: Group[];
  onSelect: (g: Group) => void;
}> = ({ scrollRef, items, onSelect }) => {
  const virtualizer = useVirtualizer({
    count: items.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => GROUP_ROW_HEIGHT,
    overscan: 6,
    getItemKey: (i) => items[i].id,
  });
  return (
    <div style={{ height: virtualizer.getTotalSize(), position: "relative" }}>
      {virtualizer.getVirtualItems().map((vi) => (
        <div
          key={vi.key}
          ref={virtualizer.measureElement}
          data-index={vi.index}
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            right: 0,
            transform: `translateY(${vi.start}px)`,
          }}
        >
          <GroupRow group={items[vi.index]} onSelect={onSelect} />
        </div>
      ))}
    </div>
  );
};

export const ChatListView: React.FC<ChatListViewProps> = ({
  chatTab,
  onTabChange,
  globalUnread,
  searchQuery,
  onSearchChange,
  loading,
  conversations,
  groups,
  onSelectConversation,
  onSelectGroup,
  onShowGroupActions,
  currentUserId,
}) => {
  const navigate = useNavigate();
  const scrollRef = useRef<HTMLElement>(null);
  const { prefs, update: updatePref } = useConversationPrefs(currentUserId ?? null);
  const [actionTarget, setActionTarget] = useState<Conversation | null>(null);

  const filteredConversations = useMemo(
    () =>
      conversations.filter((conv) =>
        conv.other_user?.display_name?.toLowerCase().includes(searchQuery.toLowerCase()),
      ),
    [conversations, searchQuery],
  );

  // Split pinned vs regular, sort pinned by pinned_at desc
  const { pinned, regular } = useMemo(() => {
    const pin: Conversation[] = [];
    const reg: Conversation[] = [];
    for (const c of filteredConversations) {
      if (prefs[c.id]?.is_pinned) pin.push(c);
      else reg.push(c);
    }
    pin.sort((a, b) => {
      const ta = prefs[a.id]?.pinned_at ?? "";
      const tb = prefs[b.id]?.pinned_at ?? "";
      return tb.localeCompare(ta);
    });
    return { pinned: pin, regular: reg };
  }, [filteredConversations, prefs]);

  const filteredGroups = useMemo(
    () => groups.filter((group) => group.name.toLowerCase().includes(searchQuery.toLowerCase())),
    [groups, searchQuery],
  );

  const handleLongPress = useCallback((c: Conversation) => setActionTarget(c), []);
  const typingSet = useInboxTyping(currentUserId ?? null);

  const handleTogglePin = useCallback(
    (c: Conversation) => {
      const cur = prefs[c.id]?.is_pinned ?? false;
      updatePref(c.id, { is_pinned: !cur });
      toast({ title: !cur ? "Pinned" : "Unpinned", duration: 1200 });
    },
    [prefs, updatePref],
  );
  const handleToggleMute = useCallback(
    (c: Conversation) => {
      const cur = prefs[c.id]?.is_muted ?? false;
      updatePref(c.id, { is_muted: !cur });
      toast({ title: !cur ? "Muted" : "Unmuted", duration: 1200 });
    },
    [prefs, updatePref],
  );

  const activePref = actionTarget ? prefs[actionTarget.id] : undefined;

  const handleDelete = useCallback(async () => {
    if (!actionTarget || !currentUserId) return;
    const id = actionTarget.id;
    setActionTarget(null);
    const { error } = await supabase
      .from("messages")
      .delete()
      .eq("conversation_id", id);
    if (error) {
      toast({ title: "Could not delete chat", description: error.message, variant: "destructive" });
      return;
    }
    await supabase.from("conversations").delete().eq("id", id);
    toast({ title: "Chat deleted" });
  }, [actionTarget, currentUserId]);

  const totalConvCount = pinned.length + regular.length;

  return (
    <>
      {/* Header */}
      <header
        className="flex-shrink-0 z-40 safe-area-top bg-card/85 backdrop-blur-xl border-b border-border/60"
        style={{ boxShadow: "0 8px 24px -16px rgba(15,23,42,0.18), inset 0 1px 0 rgba(255,255,255,0.7)" }}
      >
        <div className="px-4 py-3 flex items-center justify-between">
          <h1
            className="text-xl font-bold text-foreground tracking-tight"
            style={{ textShadow: "0 1px 0 rgba(255,255,255,0.6)" }}
          >
            Messages
          </h1>
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="icon"
              className="rounded-full bg-card text-foreground border border-border/70 hover:-translate-y-0.5 active:scale-95 transition-all duration-200"
              style={{ boxShadow: "0 4px 12px -6px rgba(15,23,42,0.22), inset 0 1px 0 rgba(255,255,255,0.8)" }}
              onClick={() => navigate("/search")}
            >
              <MessageCircle className="w-5 h-5" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="rounded-full bg-card text-foreground border border-border/70 hover:-translate-y-0.5 active:scale-95 transition-all duration-200"
              style={{ boxShadow: "0 4px 12px -6px rgba(15,23,42,0.22), inset 0 1px 0 rgba(255,255,255,0.8)" }}
              onClick={onShowGroupActions}
            >
              <Users className="w-5 h-5" />
            </Button>
          </div>
        </div>

        <div className="px-4">
          <Tabs value={chatTab} onValueChange={onTabChange} className="w-full">
            <TabsList
              className="grid w-full grid-cols-4 bg-muted/60 border border-border/60 rounded-xl p-1 h-auto"
              style={{ boxShadow: "inset 0 2px 4px rgba(15,23,42,0.12), inset 0 -1px 0 rgba(255,255,255,0.6)" }}
            >
              <TabsTrigger
                value="messages"
                className="relative text-xs font-semibold rounded-lg py-1.5 text-muted-foreground transition-all duration-200 data-[state=active]:bg-gradient-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-[0_4px_12px_-4px_rgba(99,102,241,0.5),inset_0_1px_0_rgba(255,255,255,0.35)] data-[state=active]:-translate-y-px"
              >
                Messages
                {globalUnread.messages > 0 && (
                  <span
                    className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 bg-destructive text-destructive-foreground text-[10px] font-bold rounded-full flex items-center justify-center"
                    style={{ boxShadow: "0 3px 8px -2px rgba(239,68,68,0.55), inset 0 1px 0 rgba(255,255,255,0.4)" }}
                  >
                    {formatBadgeCount(globalUnread.messages)}
                  </span>
                )}
              </TabsTrigger>
              <TabsTrigger
                value="official"
                className="relative text-xs font-semibold rounded-lg py-1.5 text-muted-foreground transition-all duration-200 data-[state=active]:bg-gradient-to-br data-[state=active]:from-indigo-500 data-[state=active]:via-blue-500 data-[state=active]:to-purple-600 data-[state=active]:text-white data-[state=active]:shadow-[0_4px_12px_-4px_rgba(79,70,229,0.55),inset_0_1px_0_rgba(255,255,255,0.35)] data-[state=active]:-translate-y-px"
              >
                Official
                {globalUnread.official > 0 && (
                  <span
                    className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 bg-gradient-to-br from-amber-400 to-orange-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center"
                    style={{ boxShadow: "0 3px 8px -2px rgba(245,158,11,0.55), inset 0 1px 0 rgba(255,255,255,0.45)" }}
                  >
                    {formatBadgeCount(globalUnread.official)}
                  </span>
                )}
              </TabsTrigger>
              <TabsTrigger
                value="notifications"
                className="relative text-xs font-semibold rounded-lg py-1.5 text-muted-foreground transition-all duration-200 data-[state=active]:bg-gradient-to-br data-[state=active]:from-pink-500 data-[state=active]:via-rose-500 data-[state=active]:to-red-500 data-[state=active]:text-white data-[state=active]:shadow-[0_4px_12px_-4px_rgba(236,72,153,0.5),inset_0_1px_0_rgba(255,255,255,0.35)] data-[state=active]:-translate-y-px"
              >
                Notifications
                {globalUnread.notifications > 0 && (
                  <span
                    className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 bg-primary text-primary-foreground text-[10px] font-bold rounded-full flex items-center justify-center"
                    style={{ boxShadow: "0 3px 8px -2px rgba(99,102,241,0.55), inset 0 1px 0 rgba(255,255,255,0.4)" }}
                  >
                    {formatBadgeCount(globalUnread.notifications)}
                  </span>
                )}
              </TabsTrigger>
              <TabsTrigger
                value="groups"
                className="relative text-xs font-semibold rounded-lg py-1.5 text-muted-foreground transition-all duration-200 data-[state=active]:bg-gradient-to-br data-[state=active]:from-emerald-500 data-[state=active]:via-teal-500 data-[state=active]:to-cyan-600 data-[state=active]:text-white data-[state=active]:shadow-[0_4px_12px_-4px_rgba(16,185,129,0.5),inset_0_1px_0_rgba(255,255,255,0.35)] data-[state=active]:-translate-y-px"
              >
                Groups
                {groups.length > 0 && <span className="ml-1 text-xs opacity-80">({groups.length})</span>}
              </TabsTrigger>
            </TabsList>
          </Tabs>
        </div>

        <div className="px-4 py-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
            <Input
              placeholder={chatTab === "messages" ? "Search conversations..." : "Search groups..."}
              value={searchQuery}
              onChange={(e) => onSearchChange(e.target.value)}
              className="pl-10 rounded-full bg-muted/60 border border-border/60 text-foreground placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-primary/40"
              style={{ boxShadow: "inset 0 2px 4px rgba(15,23,42,0.14), inset 0 -1px 0 rgba(255,255,255,0.5)" }}
            />
          </div>
        </div>
      </header>

      {/* Scrollable Content */}
      <div className="flex-1 min-h-0">
        <main
          ref={scrollRef}
          className="h-full min-h-0 overflow-y-auto overscroll-contain touch-pan-y"
          style={{ WebkitOverflowScrolling: "touch", paddingBottom: "var(--content-bottom-padding)" }}
        >
          {loading ? (
            <div className="divide-y divide-border/60">
              {[1, 2, 3, 4].map((i) => (
                <div key={i} className="flex items-center gap-3 p-4 animate-pulse">
                  <div className="w-14 h-14 rounded-full bg-gradient-to-br from-muted via-muted/70 to-muted" />
                  <div className="flex-1 space-y-2">
                    <div className="h-4 w-32 bg-gradient-to-r from-muted via-muted/60 to-muted rounded" />
                    <div className="h-3 w-48 bg-gradient-to-r from-muted via-muted/60 to-muted rounded" />
                  </div>
                </div>
              ))}
            </div>
          ) : chatTab === "official" ? (
            <OfficialNoticeList />
          ) : chatTab === "notifications" ? (
            <NotificationList />
          ) : chatTab === "messages" ? (
            totalConvCount === 0 ? (
              <div className="text-center py-16 px-6">
                <div
                  className="w-20 h-20 rounded-full mx-auto mb-4 flex items-center justify-center bg-gradient-to-br from-primary/15 via-primary/10 to-transparent border border-primary/25"
                  style={{ boxShadow: "0 12px 30px -10px rgba(99,102,241,0.35), inset 0 1px 0 rgba(255,255,255,0.5)" }}
                >
                  <MessageCircle className="w-10 h-10 text-primary drop-shadow-[0_1px_2px_rgba(99,102,241,0.4)]" />
                </div>
                <h3 className="text-lg font-semibold mb-2 text-foreground">No conversations yet</h3>
                <p className="text-muted-foreground text-sm mb-4">Start a conversation with someone!</p>
                <Button
                  className="rounded-full font-bold text-primary-foreground bg-gradient-primary hover:-translate-y-0.5 active:scale-95 transition-all duration-200"
                  style={{ boxShadow: "0 8px 20px -6px rgba(99,102,241,0.55), inset 0 1px 0 rgba(255,255,255,0.35)" }}
                  onClick={() => navigate("/")}
                >
                  Find Hosts
                </Button>
              </div>
            ) : regular.length > VIRTUALIZE_THRESHOLD ? (
              <>
                {pinned.length > 0 && (
                  <div className="py-1">
                    <div className="px-4 pt-1 pb-0.5 text-[10.5px] font-semibold uppercase tracking-wider text-muted-foreground/80 flex items-center gap-1">
                      <Pin className="w-3 h-3" /> Pinned
                    </div>
                    {pinned.map((conv) => (
                      <ConversationRow
                        key={conv.id}
                        conv={conv}
                        pref={prefs[conv.id]}
                        isTyping={typingSet.has(conv.id)}
                        onSelect={onSelectConversation}
                        onLongPress={handleLongPress}
                        onTogglePin={handleTogglePin}
                        onToggleMute={handleToggleMute}
                      />
                    ))}
                    <div className="h-px bg-border/40 mx-4 my-1" />
                  </div>
                )}
                <VirtualConversations
                  scrollRef={scrollRef}
                  items={regular}
                  prefs={prefs}
                  typingSet={typingSet}
                  onSelect={onSelectConversation}
                  onLongPress={handleLongPress}
                  onTogglePin={handleTogglePin}
                  onToggleMute={handleToggleMute}
                />
              </>
            ) : (
              <div className="py-1">
                {pinned.length > 0 && (
                  <>
                    <div className="px-4 pt-1 pb-0.5 text-[10.5px] font-semibold uppercase tracking-wider text-muted-foreground/80 flex items-center gap-1">
                      <Pin className="w-3 h-3" /> Pinned
                    </div>
                    {pinned.map((conv) => (
                      <ConversationRow
                        key={conv.id}
                        conv={conv}
                        pref={prefs[conv.id]}
                        isTyping={typingSet.has(conv.id)}
                        onSelect={onSelectConversation}
                        onLongPress={handleLongPress}
                        onTogglePin={handleTogglePin}
                        onToggleMute={handleToggleMute}
                      />
                    ))}
                    <div className="h-px bg-border/40 mx-4 my-1" />
                  </>
                )}
                {regular.map((conv) => (
                  <ConversationRow
                    key={conv.id}
                    conv={conv}
                    pref={prefs[conv.id]}
                    isTyping={typingSet.has(conv.id)}
                    onSelect={onSelectConversation}
                    onLongPress={handleLongPress}
                    onTogglePin={handleTogglePin}
                    onToggleMute={handleToggleMute}
                  />
                ))}
              </div>
            )
          ) : (
            // Groups Tab
            filteredGroups.length === 0 ? (
              <div className="text-center py-16 px-6">
                <div
                  className="w-20 h-20 rounded-full mx-auto mb-4 flex items-center justify-center bg-gradient-to-br from-emerald-500/15 via-teal-500/10 to-transparent border border-emerald-500/25"
                  style={{ boxShadow: "0 12px 30px -10px rgba(16,185,129,0.35), inset 0 1px 0 rgba(255,255,255,0.5)" }}
                >
                  <Users className="w-10 h-10 text-emerald-500 drop-shadow-[0_1px_2px_rgba(16,185,129,0.4)]" />
                </div>
                <h3 className="text-lg font-semibold mb-2 text-foreground">No groups yet</h3>
                <p className="text-muted-foreground text-sm mb-4">Create or join a group!</p>
                <Button
                  className="rounded-full font-bold text-white bg-gradient-to-br from-emerald-500 via-teal-500 to-cyan-600 hover:-translate-y-0.5 active:scale-95 transition-all duration-200"
                  style={{ boxShadow: "0 8px 20px -6px rgba(16,185,129,0.55), inset 0 1px 0 rgba(255,255,255,0.35)" }}
                  onClick={onShowGroupActions}
                >
                  Get Started
                </Button>
              </div>
            ) : filteredGroups.length > VIRTUALIZE_THRESHOLD ? (
              <VirtualGroups scrollRef={scrollRef} items={filteredGroups} onSelect={onSelectGroup} />
            ) : (
              <div className="py-1">
                {filteredGroups.map((group) => (
                  <GroupRow key={group.id} group={group} onSelect={onSelectGroup} />
                ))}
              </div>
            )
          )}
        </main>
      </div>

      {/* Long-press action sheet */}
      <Sheet open={!!actionTarget} onOpenChange={(o) => !o && setActionTarget(null)}>
        <SheetContent side="bottom" className="rounded-t-3xl border-t border-border/60 pb-[calc(env(safe-area-inset-bottom)+12px)] px-0">
          {actionTarget && (
            <div className="flex flex-col">
              <div className="px-5 pt-1 pb-3 flex items-center gap-3 border-b border-border/40">
                <Avatar className="w-10 h-10">
                  <AvatarImage src={actionTarget.other_user?.avatar_url || undefined} />
                  <AvatarFallback>{actionTarget.other_user?.display_name?.[0] || "?"}</AvatarFallback>
                </Avatar>
                <div className="min-w-0">
                  <div className="font-semibold text-[15px] truncate">{actionTarget.other_user?.display_name || "User"}</div>
                  <div className="text-[12px] text-muted-foreground truncate">{actionTarget.last_message || "No messages yet"}</div>
                </div>
              </div>
              <ActionItem
                icon={<Pin className="w-5 h-5" />}
                label={activePref?.is_pinned ? "Unpin chat" : "Pin chat"}
                onClick={() => {
                  updatePref(actionTarget.id, { is_pinned: !activePref?.is_pinned });
                  setActionTarget(null);
                }}
              />
              <ActionItem
                icon={activePref?.is_muted ? <Bell className="w-5 h-5" /> : <BellOff className="w-5 h-5" />}
                label={activePref?.is_muted ? "Unmute notifications" : "Mute notifications"}
                onClick={() => {
                  updatePref(actionTarget.id, { is_muted: !activePref?.is_muted });
                  setActionTarget(null);
                }}
              />
              <ActionItem
                icon={<CheckCheck className="w-5 h-5" />}
                label={activePref?.marked_unread ? "Mark as read" : "Mark as unread"}
                onClick={() => {
                  updatePref(actionTarget.id, { marked_unread: !activePref?.marked_unread });
                  setActionTarget(null);
                }}
              />
              <ActionItem
                icon={<Archive className="w-5 h-5" />}
                label={activePref?.is_archived ? "Unarchive" : "Archive"}
                onClick={() => {
                  updatePref(actionTarget.id, { is_archived: !activePref?.is_archived });
                  setActionTarget(null);
                }}
              />
              <ActionItem
                icon={<Trash2 className="w-5 h-5" />}
                label="Delete chat"
                destructive
                onClick={handleDelete}
              />
            </div>
          )}
        </SheetContent>
      </Sheet>
    </>
  );
};

const ActionItem: React.FC<{
  icon: React.ReactNode;
  label: string;
  destructive?: boolean;
  onClick: () => void;
}> = ({ icon, label, destructive, onClick }) => (
  <button
    onClick={onClick}
    className={cn(
      "w-full flex items-center gap-4 px-5 py-3.5 text-left active:bg-muted/60 transition-colors",
      destructive ? "text-destructive" : "text-foreground",
    )}
  >
    <span className={cn(destructive ? "text-destructive" : "text-muted-foreground")}>{icon}</span>
    <span className="font-medium text-[15px]">{label}</span>
  </button>
);
