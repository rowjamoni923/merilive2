import { useState, useEffect, useRef } from "react";
import { ArrowLeft, Camera, Crown, LogOut, Trash2, Users, UserMinus, Copy, Check } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import AvatarWithFrame from "@/components/common/AvatarWithFrame";

interface GroupMember {
  id: string;
  user_id: string;
  role: string;
  joined_at: string;
  profile?: {
    display_name: string | null;
    avatar_url: string | null;
    user_level?: number;
    app_uid?: string;
  };
}

interface GroupSettingsPanelProps {
  group: {
    id: string;
    name: string;
    avatar_url: string | null;
    group_type: string;
    group_code: string;
    owner_id: string;
    member_count: number;
  };
  currentUserId: string;
  onClose: () => void;
  onGroupUpdated: () => void;
  onLeaveGroup: () => void;
}

export const GroupSettingsPanel = ({ group, currentUserId, onClose, onGroupUpdated, onLeaveGroup }: GroupSettingsPanelProps) => {
  const [members, setMembers] = useState<GroupMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState<string | null>(null);
  const [codeCopied, setCodeCopied] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const isOwner = group.owner_id === currentUserId;

  useEffect(() => {
    fetchMembers();
  }, [group.id]);

  const fetchMembers = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('group_members')
        .select('id, user_id, role, joined_at')
        .eq('group_id', group.id)
        .order('role', { ascending: true })
        .order('joined_at', { ascending: true });

      if (error) throw error;

      // Fetch profiles for all members
      const userIds = data.map(m => m.user_id);
      const { data: profiles } = await supabase
        .from('profiles')
        .select('id, display_name, avatar_url, user_level, app_uid')
        .in('id', userIds);

      const profileMap = new Map(profiles?.map(p => [p.id, p]) || []);

      setMembers(data.map(m => ({
        ...m,
        profile: profileMap.get(m.user_id) || undefined
      })));
    } catch (error) {
      console.error('Error fetching members:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleRemoveMember = async (memberId: string, userId: string) => {
    if (userId === currentUserId) return;
    
    try {
      const { error } = await supabase
        .from('group_members')
        .delete()
        .eq('id', memberId);

      if (error) throw error;

      // Update member count
      await supabase
        .from('groups')
        .update({ member_count: Math.max(0, (group.member_count || 1) - 1) })
        .eq('id', group.id);

      toast.success("Member removed");
      setConfirmRemove(null);
      fetchMembers();
      onGroupUpdated();
    } catch (error) {
      toast.error("Failed to remove member");
    }
  };

  const handleLeaveGroup = async () => {
    try {
      const { error } = await supabase
        .from('group_members')
        .delete()
        .eq('group_id', group.id)
        .eq('user_id', currentUserId);

      if (error) throw error;

      await supabase
        .from('groups')
        .update({ member_count: Math.max(0, (group.member_count || 1) - 1) })
        .eq('id', group.id);

      toast.success("Left group");
      onLeaveGroup();
    } catch (error) {
      toast.error("Failed to leave group");
    }
  };

  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(true);
    try {
      const ext = file.name.split('.').pop();
      const path = `group-avatars/${group.id}.${ext}`;

      const { error: uploadError } = await supabase.storage
        .from('assets')
        .upload(path, file, { upsert: true });

      if (uploadError) throw uploadError;

      const { data: urlData } = supabase.storage
        .from('assets')
        .getPublicUrl(path);

      const avatarUrl = `${urlData.publicUrl}?t=${Date.now()}`;

      const { error: updateError } = await supabase
        .from('groups')
        .update({ avatar_url: avatarUrl })
        .eq('id', group.id);

      if (updateError) throw updateError;

      toast.success("Group photo updated!");
      onGroupUpdated();
    } catch (error) {
      console.error('Upload error:', error);
      toast.error("Failed to upload photo");
    } finally {
      setUploading(false);
    }
  };

  const copyGroupCode = () => {
    navigator.clipboard.writeText(group.group_code);
    setCodeCopied(true);
    toast.success("Group code copied!");
    setTimeout(() => setCodeCopied(false), 2000);
  };

  return (
    <div className="fixed inset-0 bg-background z-50 flex flex-col">
      {/* Header */}
      <header className="flex-shrink-0 bg-gradient-to-r from-purple-600 via-indigo-500 to-purple-600 shadow-lg">
        <div className="flex items-center gap-3 px-3 py-2.5 h-14 safe-area-top">
          <button
            className="w-9 h-9 rounded-full bg-white/25 flex items-center justify-center"
            onClick={onClose}
          >
            <ArrowLeft className="w-5 h-5 text-white" />
          </button>
          <h2 className="font-bold text-white text-lg">Group Info</h2>
        </div>
      </header>

      <ScrollArea className="flex-1">
        <div className="p-4 space-y-6">
          {/* Group Avatar & Name */}
          <div className="flex flex-col items-center gap-3">
            <div className="relative">
              <Avatar className="w-24 h-24">
                <AvatarImage src={group.avatar_url || undefined} />
                <AvatarFallback className="bg-gradient-to-br from-purple-400 to-pink-400 text-white text-2xl">
                  <Users className="w-10 h-10" />
                </AvatarFallback>
              </Avatar>
              {isOwner && (
                <button
                  className="absolute bottom-0 right-0 w-8 h-8 rounded-full bg-primary flex items-center justify-center shadow-lg"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={uploading}
                >
                  <Camera className="w-4 h-4 text-primary-foreground" />
                </button>
              )}
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={handlePhotoUpload}
              />
            </div>
            <h3 className="text-xl font-bold">{group.name}</h3>
            <Badge variant="outline" className="text-xs">
              {group.group_type === 'family' ? '👨‍👩‍👧‍👦 Family Group' : '👥 General Group'}
            </Badge>

            {/* Group Code */}
            <button
              onClick={copyGroupCode}
              className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-muted text-sm"
            >
              <span className="text-muted-foreground">Code:</span>
              <span className="font-mono font-bold">{group.group_code}</span>
              {codeCopied ? <Check className="w-3.5 h-3.5 text-green-500" /> : <Copy className="w-3.5 h-3.5 text-muted-foreground" />}
            </button>
          </div>

          {/* Members */}
          <div>
            <h4 className="font-semibold text-sm text-muted-foreground mb-3">
              Members ({members.length})
            </h4>
            <div className="space-y-2">
              {loading ? (
                <p className="text-center text-muted-foreground py-4">Loading...</p>
              ) : (
                members.map((member) => (
                  <div key={member.id} className="flex items-center gap-3 p-3 rounded-xl bg-muted/50">
                    <AvatarWithFrame
                      userId={member.user_id}
                      src={member.profile?.avatar_url}
                      name={member.profile?.display_name || '?'}
                      level={member.profile?.user_level || 1}
                      size="sm"
                      showFrame={false}
                    />
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-sm truncate">
                        {member.profile?.display_name || 'Unknown'}
                      </p>
                      {member.profile?.app_uid && (
                        <p className="text-xs text-muted-foreground">ID: {member.profile.app_uid}</p>
                      )}
                    </div>
                    {member.role === 'owner' && (
                      <Badge className="bg-gradient-to-r from-orange-500 to-red-500 text-white border-0 text-xs">
                        <Crown className="w-3 h-3 mr-1" />
                        Owner
                      </Badge>
                    )}
                    {isOwner && member.user_id !== currentUserId && (
                      <Button
                        size="sm"
                        variant="ghost"
                        className="text-red-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30"
                        onClick={() => setConfirmRemove(member.id)}
                      >
                        <UserMinus className="w-4 h-4" />
                      </Button>
                    )}
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Leave Group */}
          {!isOwner && (
            <Button
              variant="destructive"
              className="w-full"
              onClick={handleLeaveGroup}
            >
              <LogOut className="w-4 h-4 mr-2" />
              Leave Group
            </Button>
          )}
        </div>
      </ScrollArea>

      {/* Confirm Remove Dialog */}
      <Dialog open={!!confirmRemove} onOpenChange={() => setConfirmRemove(null)}>
        <DialogContent className="max-w-xs">
          <DialogHeader>
            <DialogTitle>Remove Member?</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Are you sure you want to remove this member from the group?
          </p>
          <div className="flex gap-2 mt-4">
            <Button variant="outline" className="flex-1" onClick={() => setConfirmRemove(null)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              className="flex-1"
              onClick={() => {
                const member = members.find(m => m.id === confirmRemove);
                if (member) handleRemoveMember(member.id, member.user_id);
              }}
            >
              Remove
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};
