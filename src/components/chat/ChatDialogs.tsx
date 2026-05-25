import React, { type RefObject } from "react";
import { Camera, Search, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
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
import type { Group } from "./chatTypes";

interface ChatDialogsProps {
  // Group Actions Sheet
  showGroupActions: boolean;
  onShowGroupActionsChange: (open: boolean) => void;
  onShowCreateGroup: () => void;
  onShowSearchGroup: () => void;

  // Create Group Dialog
  showCreateGroup: boolean;
  onShowCreateGroupChange: (open: boolean) => void;
  newGroupName: string;
  onNewGroupNameChange: (name: string) => void;
  newGroupType: string;
  onNewGroupTypeChange: (type: string) => void;
  newGroupPhotoPreview: string | null;
  groupPhotoInputRef: RefObject<HTMLInputElement | null>;
  onGroupPhotoSelect: (file: File) => void;
  creatingGroup: boolean;
  onCreateGroup: () => void;

  // Search Group Dialog
  showSearchGroup: boolean;
  onShowSearchGroupChange: (open: boolean) => void;
  groupSearchQuery: string;
  onGroupSearchQueryChange: (query: string) => void;
  groupSearchResults: any[];
  onSearchGroup: () => void;
  onJoinGroup: (groupId: string) => void;
}

export const ChatDialogs: React.FC<ChatDialogsProps> = ({
  showGroupActions,
  onShowGroupActionsChange,
  onShowCreateGroup,
  onShowSearchGroup,
  showCreateGroup,
  onShowCreateGroupChange,
  newGroupName,
  onNewGroupNameChange,
  newGroupType,
  onNewGroupTypeChange,
  newGroupPhotoPreview,
  groupPhotoInputRef,
  onGroupPhotoSelect,
  creatingGroup,
  onCreateGroup,
  showSearchGroup,
  onShowSearchGroupChange,
  groupSearchQuery,
  onGroupSearchQueryChange,
  groupSearchResults,
  onSearchGroup,
  onJoinGroup,
}) => {
  return (
    <>
      {/* Group Actions Sheet */}
      <Sheet open={showGroupActions} onOpenChange={onShowGroupActionsChange}>
        <SheetContent
          side="bottom"
          className="rounded-t-3xl border-t border-amber-200/60"
          style={{ background: "linear-gradient(180deg, hsl(40 40% 99%) 0%, hsl(40 40% 98%) 100%)" }}
        >
          <SheetHeader>
            <SheetTitle className="sr-only">Group Actions</SheetTitle>
          </SheetHeader>
          <div className="py-6 flex justify-center gap-8">
            <button
              className="flex flex-col items-center gap-2"
              onClick={() => {
                onShowGroupActionsChange(false);
                onShowCreateGroup();
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
                onShowGroupActionsChange(false);
                onShowSearchGroup();
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
      <Dialog open={showCreateGroup} onOpenChange={onShowCreateGroupChange}>
        <DialogContent
          className="max-w-sm mx-auto border border-amber-200/60"
          style={{ background: "linear-gradient(180deg, hsl(40 40% 99%) 0%, hsl(40 40% 98%) 100%)" }}
        >
          <DialogHeader>
            <DialogTitle className="text-foreground">Create a group</DialogTitle>
          </DialogHeader>
          <div className="space-y-6 py-4">
            <div className="space-y-2">
              <Label htmlFor="groupName" className="text-foreground font-medium">
                Group Name
              </Label>
              <Input
                id="groupName"
                placeholder="Enter group name"
                value={newGroupName}
                onChange={(e) => onNewGroupNameChange(e.target.value)}
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
                  if (file) onGroupPhotoSelect(file);
                }}
              />
            </div>

            <div className="space-y-3">
              <RadioGroup value={newGroupType} onValueChange={onNewGroupTypeChange}>
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
                    <p className="text-xs text-muted-foreground mt-1">One user can join one family group only</p>
                  </Label>
                </div>
              </RadioGroup>
            </div>

            <Button
              className="w-full rounded-full font-bold text-primary-foreground bg-gradient-primary shadow-price"
              onClick={onCreateGroup}
              disabled={!newGroupName.trim() || creatingGroup}
            >
              {creatingGroup ? "Creating..." : "Create Group"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Search Group Dialog */}
      <Dialog open={showSearchGroup} onOpenChange={onShowSearchGroupChange}>
        <DialogContent
          className="max-w-sm mx-auto border border-amber-200/60"
          style={{ background: "linear-gradient(180deg, hsl(40 40% 99%) 0%, hsl(40 40% 98%) 100%)" }}
        >
          <DialogHeader>
            <DialogTitle className="text-foreground">Search Group</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="relative">
              <Input
                placeholder="Search a group by Group ID"
                value={groupSearchQuery}
                onChange={(e) => onGroupSearchQueryChange(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && onSearchGroup()}
                className="pr-12 bg-card border-border text-foreground placeholder:text-muted-foreground focus-visible:ring-1 focus-visible:ring-primary/40"
              />
              <Button
                size="icon"
                variant="ghost"
                className="absolute right-1 top-1/2 -translate-y-1/2 text-foreground hover:text-foreground hover:bg-muted"
                onClick={onSearchGroup}
              >
                <Search className="w-5 h-5" />
              </Button>
            </div>

            {groupSearchResults.length > 0 && (
              <div className="space-y-2">
                {groupSearchResults.map((group: Group) => (
                  <div key={group.id} className="flex items-center gap-3 p-3 rounded-xl border border-border bg-card/60">
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
                      onClick={() => onJoinGroup(group.id)}
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
    </>
  );
};

export default ChatDialogs;
