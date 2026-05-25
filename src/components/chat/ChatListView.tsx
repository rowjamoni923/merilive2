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
      {/* Header - Ultra Premium */}
      <header
        className="flex-shrink-0 z-40 safe-area-top profile-home-card"
        style={{ borderRadius: 0, borderLeft: "none", borderRight: "none", borderTop: "none" }}
      >
        <div className="px-4 py-3 flex items-center justify-between">
          <h1 className="text-xl font-bold bg-gradient-to-r from-fuchsia-600 via-purple-600 to-pink-600 bg-clip-text text-transparent">
            Messages
          </h1>
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="icon"
              className="rounded-full profile-home-icon-button text-foreground shadow-sm"
              onClick={() => navigate("/search")}
            >
              <MessageCircle className="w-5 h-5" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="rounded-full profile-home-icon-button text-foreground shadow-sm"
              onClick={onShowGroupActions}
            >
              <Users className="w-5 h-5" />
            </Button>
          </div>
        </div>

        {/* Tabs - Premium Light */}
        <div className="px-4">
          <Tabs value={chatTab} onValueChange={onTabChange} className="w-full">
            <TabsList className="grid w-full grid-cols-4 bg-card/70 border border-border rounded-xl p-1 shadow-inner">
              <TabsTrigger
                value="messages"
                className="relative text-xs font-semibold data-[state=active]:bg-gradient-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-md rounded-lg text-muted-foreground"
              >
                Messages
                {globalUnread.messages > 0 && (
                  <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 bg-gradient-to-r from-red-500 to-pink-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center shadow-lg shadow-red-500/30">
                    {formatBadgeCount(globalUnread.messages)}
                  </span>
                )}
              </TabsTrigger>
              <TabsTrigger
                value="official"
                className="relative text-xs font-semibold data-[state=active]:bg-gradient-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-md rounded-lg text-muted-foreground"
              >
                Official
                {globalUnread.official > 0 && (
                  <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 bg-gradient-gold text-accent-foreground text-[10px] font-bold rounded-full flex items-center justify-center shadow-lg shadow-orange-500/30">
                    {formatBadgeCount(globalUnread.official)}
                  </span>
                )}
              </TabsTrigger>
              <TabsTrigger
                value="notifications"
                className="relative text-xs font-semibold data-[state=active]:bg-gradient-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-md rounded-lg text-muted-foreground"
              >
                Notifications
                {globalUnread.notifications > 0 && (
                  <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 bg-gradient-to-r from-purple-500 to-pink-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center shadow-lg">
                    {formatBadgeCount(globalUnread.notifications)}
                  </span>
                )}
              </TabsTrigger>
              <TabsTrigger
                value="groups"
                className="relative text-xs font-semibold data-[state=active]:bg-gradient-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-md rounded-lg text-muted-foreground"
              >
                Groups
                {groups.length > 0 && <span className="ml-1 text-xs text-white/80">({groups.length})</span>}
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
              className="pl-10 rounded-full bg-card/90 border border-border text-foreground placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-primary/40 shadow-sm"
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
          ) : chatTab === "official" ? (
            <OfficialNoticeList />
          ) : chatTab === "notifications" ? (
            <NotificationList />
          ) : chatTab === "messages" ? (
            filteredConversations.length === 0 ? (
              <div className="text-center py-16">
                <div
                  className="w-20 h-20 rounded-full mx-auto mb-4 flex items-center justify-center"
                  style={{ background: "rgba(168,85,247,0.1)", border: "1px solid rgba(168,85,247,0.2)" }}
                >
                  <MessageCircle className="w-10 h-10 text-purple-400" />
                </div>
                <h3 className="text-lg font-semibold mb-2 text-foreground">No conversations yet</h3>
                <p className="text-muted-foreground text-sm mb-4">Start a conversation with someone!</p>
                <Button
                  className="rounded-full font-bold text-primary-foreground bg-gradient-primary shadow-price"
                  onClick={() => navigate("/")}
                >
                  Find Hosts
                </Button>
              </div>
            ) : (
              <div className="divide-y divide-amber-100/60">
                {filteredConversations.map((conv) => (
                  <motion.button
                    key={conv.id}
                    onClick={() => onSelectConversation(conv)}
                    className="w-full flex items-center gap-3 p-4 hover:bg-amber-50/60 transition-all duration-200 relative"
                    whileTap={{ scale: 0.98 }}
                  >
                    {conv.unread_count > 0 && (
                      <div className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-8 rounded-r-full bg-gradient-to-b from-fuchsia-500 to-purple-500 shadow-lg shadow-fuchsia-500/30" />
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
                        <Avatar className="w-14 h-14 ring-2 ring-purple-500/20">
                          <AvatarImage src={conv.other_user?.avatar_url || undefined} />
                          <AvatarFallback className="bg-gradient-to-br from-purple-600 to-pink-600 text-white">
                            {conv.other_user?.display_name?.[0] || "?"}
                          </AvatarFallback>
                        </Avatar>
                      )}
                      {conv.other_user?.is_online && (
                        <span className="absolute bottom-0 right-0 w-4 h-4 gradient-online border-2 border-card rounded-full z-10 shadow-lg shadow-green-500/30" />
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
                        <p className="text-sm text-muted-foreground truncate">
                          {conv.last_message || "No messages yet"}
                        </p>
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
                <div
                  className="w-20 h-20 rounded-full mx-auto mb-4 flex items-center justify-center"
                  style={{ background: "rgba(168,85,247,0.1)", border: "1px solid rgba(168,85,247,0.2)" }}
                >
                  <Users className="w-10 h-10 text-purple-400" />
                </div>
                <h3 className="text-lg font-semibold mb-2 text-foreground">No groups yet</h3>
                <p className="text-muted-foreground text-sm mb-4">Create or join a group!</p>
                <Button
                  className="rounded-full font-bold text-primary-foreground bg-gradient-primary shadow-price"
                  onClick={onShowGroupActions}
                >
                  Get Started
                </Button>
              </div>
            ) : (
              <div className="divide-y divide-amber-100/60">
                {filteredGroups.map((group) => (
                  <motion.button
                    key={group.id}
                    onClick={() => onSelectGroup(group)}
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
                          <Users className="w-3 h-3 mr-1" />
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
