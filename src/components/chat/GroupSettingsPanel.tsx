import { useState, useEffect, useRef } from "react";
import { ArrowLeft, ImagePlus, Crown, LogOut, Trash2, Users, UserMinus, UserPlus, Copy, Check, Search } from "lucide-react";
import { Input } from "@/components/ui/input";
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
  const [showAdd, setShowAdd] = useState(false);
  const [addQuery, setAddQuery] = useState("");
  const [addResults, setAddResults] = useState<any[]>([]);
  const [addingId, setAddingId] = useState<string | null>(null);
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
        .from('profiles_public')
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
      const ext = (file.name.split('.').pop() || 'jpg').toLowerCase().replace(/[^a-z0-9]/g, '') || 'jpg';
      if (!file.type?.startsWith('image/') || ext === 'svg') { toast.error("Invalid image type"); setUploading(false); return; }
      const path = `group-avatars/${group.id}.${ext}`;

      const { error: uploadError } = await supabase.storage
        .from('assets')
        .upload(path, file, { upsert: true, contentType: file.type });

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

  const searchUsers = async (q: string) => {
    setAddQuery(q);
    const term = q.trim();
    if (term.length < 2) { setAddResults([]); return; }
    const memberIds = new Set(members.map(m => m.user_id));
    const { data } = await supabase
      .from('profiles_public')
      .select('id, display_name, avatar_url, app_uid, user_level')
      .or(`display_name.ilike.%${term}%,app_uid.ilike.%${term}%`)
      .limit(15);
    setAddResults((data || []).filter((u: any) => !memberIds.has(u.id)));
  };

  const handleAddMember = async (userId: string) => {
    setAddingId(userId);
    try {
      const { data, error } = await supabase.rpc('add_group_member' as any, {
        p_group_id: group.id,
        p_user_id: userId,
      });
      if (error) throw error;
      const res = data as any;
      if (res?.ok) {
        toast.success(res.already_member ? "Already a member" : "Member added");
        setAddResults(r => r.filter(u => u.id !== userId));
        fetchMembers();
        onGroupUpdated();
      } else {
        const code = String(res?.error || 'failed');
        const msg = code === 'family_limit_reached' ? "User already in a family group"
          : code === 'not_authorized' ? "Only owner can add members"
          : code === 'user_unavailable' ? "User unavailable"
          : "Failed to add member";
        toast.error(msg);
      }
    } catch (e) {
      toast.error("Failed to add member");
    } finally {
      setAddingId(null);
    }
  };

  return (
    <div className="fixed inset-0 bg-background z-50 flex flex-col">
      {/* Header - Premium 3D Glass */}
      <header
        className="flex-shrink-0 bg-gradient-to-br from-indigo-600 via-purple-600 to-pink-600"
        style={{ boxShadow: "0 10px 30px -10px rgba(99,102,241,0.55), inset 0 -1px 0 rgba(255,255,255,0.18), inset 0 1px 0 rgba(255,255,255,0.35)" }}
      >
        <div className="flex items-center gap-3 px-3 py-2.5 h-14 safe-area-top">
          <button
            className="w-9 h-9 rounded-full bg-white/20 backdrop-blur-md flex items-center justify-center border border-white/25 hover:-translate-y-0.5 active:scale-95 transition-all duration-200"
            style={{ boxShadow: "0 4px 10px -4px rgba(0,0,0,0.3), inset 0 1px 0 rgba(255,255,255,0.4)" }}
            onClick={onClose}
          >
            <ArrowLeft className="w-5 h-5 text-white drop-shadow-[0_1px_2px_rgba(0,0,0,0.3)]" />
          </button>
          <h2
            className="font-bold text-white text-lg"
            style={{ textShadow: "0 1px 2px rgba(0,0,0,0.25)" }}
          >
            Group Info
          </h2>
        </div>
      </header>

      <ScrollArea className="flex-1">
        <div className="p-4 space-y-6">
          {/* Group Avatar & Name */}
          <div className="flex flex-col items-center gap-3">
            <div className="relative">
              <Avatar
                className="w-24 h-24 ring-2 ring-purple-500/30"
                style={{ boxShadow: "0 14px 32px -10px rgba(168,85,247,0.45), inset 0 1px 0 rgba(255,255,255,0.4)" }}
              >
                <AvatarImage src={group.avatar_url || undefined} />
                <AvatarFallback className="bg-gradient-to-br from-purple-500 via-pink-500 to-rose-500 text-white text-2xl">
                  <Users className="w-10 h-10 drop-shadow-[0_1px_2px_rgba(0,0,0,0.3)]" />
                </AvatarFallback>
              </Avatar>
              {isOwner && (
                <button
                  className="absolute bottom-0 right-0 w-9 h-9 rounded-full bg-gradient-primary flex items-center justify-center hover:-translate-y-0.5 active:scale-95 transition-all duration-200"
                  style={{ boxShadow: "0 6px 14px -4px rgba(99,102,241,0.55), inset 0 1px 0 rgba(255,255,255,0.35)" }}
                  onClick={() => fileInputRef.current?.click()}
                  disabled={uploading}
                >
                  <ImagePlus className="w-4 h-4 text-primary-foreground drop-shadow-[0_1px_2px_rgba(0,0,0,0.25)]" />
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
            <h3 className="text-xl font-bold text-foreground">{group.name}</h3>
            <Badge
              variant="outline"
              className="text-xs bg-card border-border/60"
              style={{ boxShadow: "inset 0 1px 0 rgba(255,255,255,0.6)" }}
            >
              {group.group_type === 'family' ? '👨‍👩‍👧‍👦 Family Group' : '👥 General Group'}
            </Badge>

            {/* Group Code */}
            <button
              onClick={copyGroupCode}
              className="flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-card border border-border/60 text-sm hover:-translate-y-0.5 active:scale-95 transition-all duration-200"
              style={{ boxShadow: "0 4px 12px -6px rgba(15,23,42,0.18), inset 0 1px 0 rgba(255,255,255,0.7)" }}
            >
              <span className="text-muted-foreground">Code:</span>
              <span className="font-mono font-bold text-foreground">{group.group_code}</span>
              {codeCopied ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5 text-muted-foreground" />}
            </button>
          </div>

          {/* Members */}
          <div>
            <div className="flex items-center justify-between mb-3 px-1">
              <h4 className="font-semibold text-sm text-muted-foreground">
                Members ({members.length})
              </h4>
              {isOwner && (
                <Button
                  size="sm"
                  variant="outline"
                  className="rounded-full h-8 px-3 text-xs gap-1.5"
                  onClick={() => setShowAdd(v => !v)}
                >
                  <UserPlus className="w-3.5 h-3.5" />
                  {showAdd ? 'Close' : 'Add member'}
                </Button>
              )}
            </div>

            {isOwner && showAdd && (
              <div className="mb-3 rounded-2xl border border-border/60 bg-card p-3 space-y-2"
                style={{ boxShadow: "0 4px 14px -10px rgba(15,23,42,0.18), inset 0 1px 0 rgba(255,255,255,0.7)" }}
              >
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input
                    value={addQuery}
                    onChange={(e) => searchUsers(e.target.value)}
                    placeholder="Search by name or ID"
                    className="pl-9 h-9 rounded-full"
                  />
                </div>
                <div className="max-h-64 overflow-y-auto space-y-1.5">
                  {addQuery.trim().length < 2 ? (
                    <p className="text-xs text-muted-foreground text-center py-3">Type at least 2 characters</p>
                  ) : addResults.length === 0 ? (
                    <p className="text-xs text-muted-foreground text-center py-3">No users found</p>
                  ) : addResults.map((u) => (
                    <div key={u.id} className="flex items-center gap-2.5 p-1.5 rounded-xl hover:bg-muted/60">
                      <AvatarWithFrame userId={u.id} src={u.avatar_url} name={u.display_name || '?'} level={u.user_level || 1} size="sm" showFrame={false} />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate text-foreground">{u.display_name || 'Unknown'}</p>
                        {u.app_uid && <p className="text-[11px] text-muted-foreground">ID: {u.app_uid}</p>}
                      </div>
                      <Button
                        size="sm"
                        className="h-8 px-3 rounded-full"
                        disabled={addingId === u.id}
                        onClick={() => handleAddMember(u.id)}
                      >
                        {addingId === u.id ? '...' : 'Add'}
                      </Button>
                    </div>
                  ))}
                </div>
              </div>
            )}
            <div className="space-y-2">
              {loading ? (
                <p className="text-center text-muted-foreground py-4">Loading...</p>
              ) : (
                members.map((member) => (
                  <div
                    key={member.id}
                    className="flex items-center gap-3 p-3 rounded-2xl bg-card border border-border/60"
                    style={{ boxShadow: "0 4px 14px -10px rgba(15,23,42,0.18), inset 0 1px 0 rgba(255,255,255,0.7)" }}
                  >
                    <AvatarWithFrame
                      userId={member.user_id}
                      src={member.profile?.avatar_url}
                      name={member.profile?.display_name || '?'}
                      level={member.profile?.user_level || 1}
                      size="sm"
                      showFrame={false}
                    />
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-sm truncate text-foreground">
                        {member.profile?.display_name || 'Unknown'}
                      </p>
                      {member.profile?.app_uid && (
                        <p className="text-xs text-muted-foreground">ID: {member.profile.app_uid}</p>
                      )}
                    </div>
                    {member.role === 'owner' && (
                      <Badge
                        className="bg-gradient-to-br from-amber-400 via-orange-500 to-rose-500 text-white border-0 text-xs"
                        style={{ boxShadow: "0 3px 8px -2px rgba(245,158,11,0.5), inset 0 1px 0 rgba(255,255,255,0.4)" }}
                      >
                        <Crown className="w-3 h-3 mr-1" />
                        Owner
                      </Badge>
                    )}
                    {isOwner && member.user_id !== currentUserId && (
                      <Button
                        size="sm"
                        variant="ghost"
                        className="text-rose-500 hover:text-rose-600 hover:bg-rose-500/10 rounded-full"
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
              className="w-full rounded-full font-bold hover:-translate-y-0.5 active:scale-95 transition-all duration-200"
              style={{ boxShadow: "0 8px 20px -6px rgba(239,68,68,0.5), inset 0 1px 0 rgba(255,255,255,0.25)" }}
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
