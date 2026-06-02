import React from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { MessageCircle, Search, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { NotificationList } from "@/components/notifications/NotificationList";
import { OfficialNoticeList } from "@/components/notifications/OfficialNoticeList";
import AvatarWithFrame from "@/components/common/AvatarWithFrame";
import { LevelBadge } from "@/components/common/LevelBadge";
import { formatBadgeCount } from "@/hooks/useGlobalUnreadCount";
import { pickDisplayLevel } from "@/utils/displayLevel";
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
}) => {
  const navigate = useNavigate();

  const filteredConversations = conversations.filter((conv) =>
    conv.other_user?.display_name?.toLowerCase().includes(searchQuery.toLowerCase())
  );
  const filteredGroups = groups.filter((group) =>
    group.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <>
      {/* Header - Premium 3D Glass */}
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

        {/* Tabs - Sunken 3D Track */}
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
            filteredConversations.length === 0 ? (
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
            ) : (
              <div className="px-3 py-2 space-y-2">
                {filteredConversations.map((conv) => (
                  <motion.button
                    key={conv.id}
                    onClick={() => onSelectConversation(conv)}
                    className="w-full flex items-center gap-3 p-3 bg-card rounded-2xl border border-border/60 hover:-translate-y-0.5 active:scale-[0.99] transition-all duration-200 relative overflow-hidden"
                    style={{
                      boxShadow: conv.unread_count > 0
                        ? "0 6px 18px -8px rgba(99,102,241,0.35), inset 0 1px 0 rgba(255,255,255,0.7)"
                        : "0 4px 14px -10px rgba(15,23,42,0.18), inset 0 1px 0 rgba(255,255,255,0.7)"
                    }}
                    whileTap={{ scale: 0.98 }}
                  >
                    {conv.unread_count > 0 && (
                      <div
                        className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-10 rounded-r-full bg-gradient-to-b from-primary to-purple-600"
                        style={{ boxShadow: "0 0 12px rgba(99,102,241,0.6)" }}
                      />
                    )}
                    <div className="relative">
                      {conv.other_user?.id ? (
                        <AvatarWithFrame
                          userId={conv.other_user.id}
                          src={conv.other_user?.avatar_url}
                          name={conv.other_user?.display_name || "User"}
                          level={pickDisplayLevel(conv.other_user as any)}
                          size="md"
                          showAnimation={false}
                        />
                      ) : (
                        <Avatar className="w-14 h-14 ring-2 ring-primary/20">
                          <AvatarImage src={conv.other_user?.avatar_url || undefined} />
                          <AvatarFallback className="bg-gradient-primary text-primary-foreground">
                            {conv.other_user?.display_name?.[0] || "?"}
                          </AvatarFallback>
                        </Avatar>
                      )}
                      {conv.other_user?.is_online && (
                        <span
                          className="absolute bottom-0 right-0 w-4 h-4 gradient-online border-2 border-card rounded-full z-10"
                          style={{ boxShadow: "0 0 10px rgba(34,197,94,0.6), inset 0 1px 0 rgba(255,255,255,0.5)" }}
                        />
                      )}
                    </div>
                    <div className="flex-1 text-left min-w-0">
                      <div className="flex items-center gap-2">
                        <h3 className="font-semibold truncate text-foreground">
                          {conv.other_user?.display_name || "User"}
                        </h3>
                        {conv.other_user?.country_flag && (
                          <span className="text-xs">{conv.other_user.country_flag}</span>
                        )}
                        <LevelBadge level={pickDisplayLevel(conv.other_user as any)} size="xs" />
                        <span className="text-[10px] text-muted-foreground shrink-0 ml-auto font-medium">
                          {conv.last_message_at ? formatTime(conv.last_message_at) : ""}
                        </span>
                      </div>
                      <div className="flex items-center justify-between mt-0.5">
                        <p className={cn(
                          "text-sm truncate",
                          conv.unread_count > 0 ? "text-foreground/85 font-medium" : "text-muted-foreground"
                        )}>
                          {conv.last_message || "No messages yet"}
                        </p>
                        {conv.unread_count > 0 && (
                          <Badge
                            className="bg-gradient-to-br from-rose-500 to-red-600 text-white border-0 rounded-full ml-2 shrink-0 text-[10px] px-2"
                            style={{ boxShadow: "0 4px 10px -2px rgba(239,68,68,0.5), inset 0 1px 0 rgba(255,255,255,0.35)" }}
                          >
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
            ) : (
              <div className="px-3 py-2 space-y-2">
                {filteredGroups.map((group) => (
                  <motion.button
                    key={group.id}
                    onClick={() => onSelectGroup(group)}
                    className="w-full flex items-center gap-3 p-3 bg-card rounded-2xl border border-border/60 hover:-translate-y-0.5 active:scale-[0.99] transition-all duration-200"
                    style={{ boxShadow: "0 4px 14px -10px rgba(15,23,42,0.18), inset 0 1px 0 rgba(255,255,255,0.7)" }}
                    whileTap={{ scale: 0.98 }}
                  >
                    <Avatar
                      className="w-14 h-14 ring-2 ring-emerald-500/25"
                      style={{ boxShadow: "0 6px 14px -6px rgba(16,185,129,0.35)" }}
                    >
                      <AvatarImage src={group.avatar_url || undefined} />
                      <AvatarFallback className="bg-gradient-to-br from-emerald-500 via-teal-500 to-cyan-600 text-white">
                        <Users className="w-6 h-6 drop-shadow-[0_1px_2px_rgba(0,0,0,0.25)]" />
                      </AvatarFallback>
                    </Avatar>
                    <div className="flex-1 text-left min-w-0">
                      <div className="flex items-center gap-2">
                        <h3 className="font-semibold truncate text-foreground">{group.name}</h3>
                        <span className="text-xs text-muted-foreground">({group.member_count})</span>
                      </div>
                      {group.is_owner && (
                        <Badge
                          className="bg-gradient-to-br from-amber-400 via-orange-500 to-rose-500 text-white border-0 text-xs mt-1"
                          style={{ boxShadow: "0 3px 8px -2px rgba(245,158,11,0.5), inset 0 1px 0 rgba(255,255,255,0.4)" }}
                        >
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
    </>
  );
};

export default ChatListView;
