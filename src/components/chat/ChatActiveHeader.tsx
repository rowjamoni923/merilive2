import React from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, Crown, MoreVertical, Phone as VideoCallIcon, Settings, ShieldAlert, Users, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import AvatarWithFrame from "@/components/common/AvatarWithFrame";
import TraderBadge from "@/components/common/TraderBadge";
import { LevelBadge } from "@/components/common/LevelBadge";
import { pickDisplayLevel } from "@/utils/displayLevel";
import type { Conversation, Group } from "./chatTypes";

interface ChatActiveHeaderProps {
  selectedConversation: Conversation | null;
  selectedGroup: Group | null;
  currentUserId: string | null;
  myProfile: { display_name: string | null; avatar_url: string | null; is_host?: boolean | null } | null;
  isOtherTyping: boolean;
  otherUserTrader: { isTrader: boolean; traderLevel: number };
  onBack: () => void;
  startCall: (userId: string) => void;
  setShowGroupSettings: (show: boolean) => void;
  setShowReportDialog: (show: boolean) => void;
  formatLastSeen: (lastSeenAt: string | null, isOnline: boolean | null) => string;
}

export const ChatActiveHeader: React.FC<ChatActiveHeaderProps> = ({
  selectedConversation,
  selectedGroup,
  currentUserId,
  myProfile,
  isOtherTyping,
  otherUserTrader,
  onBack,
  startCall,
  setShowGroupSettings,
  setShowReportDialog,
  formatLastSeen,
}) => {
  const navigate = useNavigate();
  const isGroup = !!selectedGroup;
  const chatName = isGroup ? selectedGroup?.name : selectedConversation?.other_user?.display_name || "User";
  const chatAvatar = isGroup ? selectedGroup?.avatar_url : selectedConversation?.other_user?.avatar_url;
  const userLevel = pickDisplayLevel(selectedConversation?.other_user as any);
  const countryFlag = selectedConversation?.other_user?.country_flag || "🌍";

  return (
    <header
      className="flex-shrink-0 safe-area-top profile-home-card"
      style={{ zIndex: 10, position: "relative", borderRadius: 0, borderLeft: "none", borderRight: "none", borderTop: "none" }}
    >
      <div className="flex items-center gap-3 px-3 py-2.5 h-14">
        {/* Back Button */}
        <button
          type="button"
          className="flex items-center justify-center w-9 h-9 rounded-full profile-home-icon-button active:scale-95 transition-all duration-150 shrink-0"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            onBack();
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
              <span className="text-[11px] text-success-600 font-semibold flex items-center gap-1">
                <span className="flex gap-0.5">
                  <span className="w-1 h-1 rounded-full bg-success animate-bounce" style={{ animationDelay: "0ms" }} />
                  <span className="w-1 h-1 rounded-full bg-success animate-bounce" style={{ animationDelay: "150ms" }} />
                  <span className="w-1 h-1 rounded-full bg-success animate-bounce" style={{ animationDelay: "300ms" }} />
                </span>
                typing…
              </span>
            ) : !isGroup && (
              selectedConversation?.other_user?.is_online ? (
                <span className="text-[11px] text-success-600 font-medium">online</span>
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
            <VideoCallIcon className="w-[18px] h-[18px] text-success-600" />
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
            <DropdownMenuContent
              align="end"
              className="bg-popover text-popover-foreground border border-border rounded-2xl min-w-[220px] shadow-xl p-1.5 overflow-hidden max-h-[70vh] overflow-y-auto"
            >
              <div className="absolute top-0 left-1/2 -translate-x-1/2 w-24 h-[1px] bg-gradient-to-r from-transparent via-primary/50 to-transparent" />

              <DropdownMenuItem
                onClick={() => {
                  const otherId = selectedConversation?.other_user?.id;
                  if (otherId) navigate(`/profile-detail/${otherId}`);
                }}
                className="text-foreground hover:text-foreground hover:bg-muted cursor-pointer gap-3 py-3 px-3 rounded-xl transition-all"
              >
                <div className="w-8 h-8 rounded-lg bg-purple-500/15 border border-purple-500/20 flex items-center justify-center">
                  <Users className="w-4 h-4 text-primary" />
                </div>
                <span className="font-medium text-sm">View Profile</span>
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={async () => {
                  const otherId = selectedConversation?.other_user?.id;
                  if (!otherId || !currentUserId) return;
                  try {
                    await supabase.from("user_blocks").insert({
                      blocker_id: currentUserId,
                      blocked_id: otherId,
                    });
                    toast.success("User blocked");
                    navigate("/chat");
                  } catch {
                    toast.error("Failed to block user");
                  }
                }}
                className="text-destructive hover:text-destructive hover:bg-destructive/10 cursor-pointer gap-3 py-3 px-3 rounded-xl transition-all"
              >
                <div className="w-8 h-8 rounded-lg bg-red-500/15 border border-red-500/20 flex items-center justify-center">
                  <X className="w-4 h-4 text-destructive" />
                </div>
                <span className="font-medium text-sm">Block User</span>
              </DropdownMenuItem>

              <DropdownMenuItem
                onSelect={(e) => {
                  e.preventDefault();
                  setTimeout(() => setShowReportDialog(true), 100);
                }}
                className="text-warning-600 hover:text-warning-700 hover:bg-warning/10 cursor-pointer gap-3 py-3 px-3 rounded-xl transition-all"
              >
                <div className="w-8 h-8 rounded-lg bg-warning/15 border border-warning/20 flex items-center justify-center">
                  <ShieldAlert className="w-4 h-4 text-warning-600" />
                </div>
                <span className="font-medium text-sm">Report</span>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>
    </header>
  );
};

export default ChatActiveHeader;
