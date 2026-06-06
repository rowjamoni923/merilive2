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
      className="flex-shrink-0 safe-area-top bg-card border-b border-border/60"
      style={{ zIndex: 10, position: "relative" }}
    >
      <div className="flex items-center gap-2 px-2 py-2 h-14">
        {/* Back */}
        <button
          type="button"
          className="flex items-center justify-center w-10 h-10 rounded-full active:bg-muted transition-colors shrink-0"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            onBack();
          }}
          aria-label="Back"
        >
          <ArrowLeft className="w-[22px] h-[22px] text-foreground" />
        </button>

        {/* Avatar */}
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
              showAnimation={false}
              showGlow={false}
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

        {/* Name + subtitle */}
        <div
          className="flex-1 min-w-0 cursor-pointer ml-0.5"
          onClick={() => {
            const userId = isGroup ? selectedGroup?.owner_id : selectedConversation?.other_user?.id;
            if (userId) navigate(`/profile-detail/${userId}`);
          }}
        >
          <div className="flex items-center gap-1.5">
            <h2 className="font-semibold text-foreground text-[16px] leading-tight truncate">
              {chatName}
            </h2>
            {!isGroup && countryFlag && (
              <span className="text-[12px] leading-none shrink-0">{countryFlag}</span>
            )}
            {!isGroup && <LevelBadge level={userLevel} size="xs" />}
            {!isGroup && otherUserTrader.isTrader && (
              <TraderBadge level={otherUserTrader.traderLevel} size="xs" />
            )}
          </div>
          <div className="min-h-[14px]">
            {!isGroup && isOtherTyping ? (
              <span className="text-[12px] text-emerald-600 font-medium">typing…</span>
            ) : !isGroup ? (
              selectedConversation?.other_user?.is_online ? (
                <span className="text-[12px] text-emerald-600 font-medium">online</span>
              ) : (
                <span className="text-[12px] text-muted-foreground truncate block">
                  last seen {formatLastSeen(selectedConversation?.other_user?.last_seen_at || null, false).toLowerCase()}
                </span>
              )
            ) : (
              <span className="text-[12px] text-muted-foreground">{selectedGroup?.member_count || 0} members</span>
            )}
          </div>
        </div>

        {/* Video call (host + online only) */}
        {!isGroup && selectedConversation?.other_user?.is_host && selectedConversation?.other_user?.is_online && (
          <button
            type="button"
            onClick={() => {
              if (selectedConversation?.other_user?.id) startCall(selectedConversation.other_user.id);
            }}
            className="w-10 h-10 rounded-full flex items-center justify-center shrink-0 active:bg-muted transition-colors"
            aria-label="Video call"
          >
            <VideoCallIcon className="w-[22px] h-[22px] text-foreground" />
          </button>
        )}

        {/* Group settings */}
        {isGroup && (
          <button
            type="button"
            className="w-10 h-10 rounded-full flex items-center justify-center shrink-0 active:bg-muted transition-colors"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              setShowGroupSettings(true);
            }}
            aria-label="Group settings"
          >
            <Settings className="w-[22px] h-[22px] text-foreground" />
          </button>
        )}

        {/* 3-dot menu for 1:1 */}
        {!isGroup && (
          <DropdownMenu modal={false}>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                className="w-10 h-10 rounded-full flex items-center justify-center shrink-0 active:bg-muted transition-colors"
                aria-label="More"
              >
                <MoreVertical className="w-[22px] h-[22px] text-foreground" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent
              align="end"
              className="bg-popover text-popover-foreground border border-border rounded-xl min-w-[200px] shadow-xl p-1"
            >


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
