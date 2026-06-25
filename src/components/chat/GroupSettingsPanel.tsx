import { useState, useEffect, useRef, useMemo } from "react";
import {
  ArrowLeft, ImagePlus, Crown, LogOut, Trash2, Users, UserMinus, UserPlus,
  Copy, Check, Search, Settings as SettingsIcon, Link2, RefreshCw, Shield,
  ShieldCheck, MoreVertical, Globe, Lock, Bell, BellOff, MessageSquare,
  Pin, ClipboardCheck, Edit3, X
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import {
  Sheet, SheetContent, SheetHeader, SheetTitle,
} from "@/components/ui/sheet";
import {
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem,
} from "@/components/ui/dropdown-menu";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface GroupMember {
  user_id: string;
  role: "owner" | "admin" | "member" | string;
  joined_at: string;
  full_name: string | null;
  username: string | null;
  avatar_url: string | null;
}

interface GroupRow {
  id: string;
  name: string;
  description: string | null;
  avatar_url: string | null;
  group_type: string;
  group_code: string | null;
  owner_id: string;
  member_count: number;
  max_members: number;
  is_public: boolean;
  invite_token: string | null;
  settings: any;
}

interface JoinRequest {
  id: string;
  user_id: string;
  requested_at: string;
  profile?: { full_name: string | null; username: string | null; avatar_url: string | null };
}

interface Props {
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

const DEFAULT_SETTINGS = {
  who_can_send: "all",
  who_can_edit_info: "admins",
  who_can_add_members: "admins",
  approve_new_members: false,
  disappearing_seconds: 0,
  slow_mode_seconds: 0,
};

export const GroupSettingsPanel = ({ group, currentUserId, onClose, onGroupUpdated, onLeaveGroup }: Props) => {
  const [tab, setTab] = useState<"info" | "members" | "requests" | "settings">("info");
  const [row, setRow] = useState<GroupRow | null>(null);
  const [members, setMembers] = useState<GroupMember[]>([]);
  const [requests, setRequests] = useState<JoinRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [memberQuery, setMemberQuery] = useState("");
  const [showAdd, setShowAdd] = useState(false);
  const [addQuery, setAddQuery] = useState("");
  const [addResults, setAddResults] = useState<any[]>([]);
  const [addingId, setAddingId] = useState<string | null>(null);
  const [showEdit, setShowEdit] = useState(false);
  const [editName, setEditName] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [memberSheet, setMemberSheet] = useState<GroupMember | null>(null);
  const [showInvite, setShowInvite] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [confirmLeave, setConfirmLeave] = useState(false);
  const [tokenCopied, setTokenCopied] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const isOwner = row ? row.owner_id === currentUserId : group.owner_id === currentUserId;
  const myRole = useMemo(() => members.find(m => m.user_id === currentUserId)?.role || "member", [members, currentUserId]);
  const isAdmin = myRole === "admin" || isOwner;
  const settings = { ...DEFAULT_SETTINGS, ...(row?.settings || {}) };
  const inviteUrl = row?.invite_token ? `${window.location.origin}/invite/${encodeURIComponent(row.invite_token)}` : "";

  useEffect(() => { void loadAll(); /* eslint-disable-next-line */ }, [group.id]);

  const loadAll = async () => {
    setLoading(true);
    try {
      const [{ data: g, error: ge }, mRes, rRes] = await Promise.all([
        supabase.from("groups").select("id,name,description,avatar_url,group_type,group_code,owner_id,member_count,max_members,is_public,invite_token,settings").eq("id", group.id).maybeSingle(),
        supabase.rpc("search_group_members", { p_group_id: group.id, p_q: null, p_limit: 500 }),
        supabase.from("group_join_requests").select("id,user_id,requested_at").eq("group_id", group.id).eq("status", "pending").order("requested_at", { ascending: true }),
      ]);
      if (ge) throw ge;
      setRow(g as GroupRow);
      setEditName(g?.name || "");
      setEditDescription(g?.description || "");
      setMembers((mRes.data || []) as GroupMember[]);

      const reqs = (rRes.data || []) as any[];
      if (reqs.length > 0) {
        const { data: profs } = await supabase.from("profiles_public").select("id,full_name,username,avatar_url").in("id", reqs.map(r => r.user_id));
        const pMap = new Map((profs || []).map((p: any) => [p.id, p]));
        setRequests(reqs.map(r => ({ ...r, profile: pMap.get(r.user_id) })));
      } else setRequests([]);
    } catch (e: any) {
      toast.error(e?.message || "Failed to load group");
    } finally { setLoading(false); }
  };

  /* ---------- Avatar upload ---------- */
  const onAvatarPick = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]; if (!f || !row) return;
    if (!isAdmin && settings.who_can_edit_info === "admins") { toast.error("Only admins can edit"); return; }
    setUploading(true);
    try {
      const ext = f.name.split(".").pop() || "jpg";
      const path = `groups/${row.id}/${Date.now()}.${ext}`;
      const { error: ue } = await supabase.storage.from("avatars").upload(path, f, { upsert: true });
      if (ue) throw ue;
      const { data: { publicUrl } } = supabase.storage.from("avatars").getPublicUrl(path);
      const { error } = await supabase.rpc("update_group_info", { p_group_id: row.id, p_avatar_url: publicUrl });
      if (error) throw error;
      setRow({ ...row, avatar_url: publicUrl });
      onGroupUpdated();
      toast.success("Group photo updated");
    } catch (err: any) { toast.error(err?.message || "Upload failed"); }
    finally { setUploading(false); if (fileInputRef.current) fileInputRef.current.value = ""; }
  };

  const saveInfo = async () => {
    if (!row) return;
    if (!editName.trim()) { toast.error("Name required"); return; }
    try {
      const { error } = await supabase.rpc("update_group_info", { p_group_id: row.id, p_name: editName.trim(), p_description: editDescription.trim() || null });
      if (error) throw error;
      setRow({ ...row, name: editName.trim(), description: editDescription.trim() || null });
      setShowEdit(false); onGroupUpdated(); toast.success("Saved");
    } catch (e: any) { toast.error(e?.message || "Save failed"); }
  };

  const saveSetting = async (patch: Record<string, any>) => {
    if (!row) return;
    const next = { ...settings, ...patch };
    try {
      const { error } = await supabase.rpc("update_group_info", { p_group_id: row.id, p_settings: next });
      if (error) throw error;
      setRow({ ...row, settings: next });
    } catch (e: any) { toast.error(e?.message || "Failed"); }
  };

  const togglePublic = async (val: boolean) => {
    if (!row) return;
    try {
      const { error } = await supabase.rpc("update_group_info", { p_group_id: row.id, p_is_public: val });
      if (error) throw error;
      setRow({ ...row, is_public: val });
      toast.success(val ? "Group is now public" : "Group is now private");
    } catch (e: any) { toast.error(e?.message || "Failed"); }
  };

  /* ---------- Members ---------- */
  const filteredMembers = useMemo(() => {
    const q = memberQuery.trim().toLowerCase();
    if (!q) return members;
    return members.filter(m => (m.full_name || "").toLowerCase().includes(q) || (m.username || "").toLowerCase().includes(q));
  }, [members, memberQuery]);

  const setRole = async (uid: string, role: "admin" | "member") => {
    try {
      const { error } = await supabase.rpc("set_group_member_role", { p_group_id: group.id, p_user_id: uid, p_role: role });
      if (error) throw error;
      toast.success(role === "admin" ? "Promoted to admin" : "Demoted to member");
      setMemberSheet(null); await loadAll();
    } catch (e: any) { toast.error(e?.message || "Failed"); }
  };
  const removeMember = async (uid: string) => {
    try {
      const { error } = await supabase.rpc("remove_group_member", { p_group_id: group.id, p_user_id: uid });
      if (error) throw error;
      toast.success("Member removed"); setMemberSheet(null); await loadAll(); onGroupUpdated();
    } catch (e: any) { toast.error(e?.message || "Failed"); }
  };
  const transferOwnership = async (uid: string) => {
    try {
      const { error } = await supabase.rpc("transfer_group_ownership", { p_group_id: group.id, p_new_owner: uid });
      if (error) throw error;
      toast.success("Ownership transferred"); setMemberSheet(null); await loadAll();
    } catch (e: any) { toast.error(e?.message || "Failed"); }
  };

  /* ---------- Add member search ---------- */
  useEffect(() => {
    if (!showAdd || !addQuery.trim()) { setAddResults([]); return; }
    let active = true;
    const t = setTimeout(async () => {
      const { data } = await supabase.from("profiles_public")
        .select("id,full_name,username,avatar_url,app_uid")
        .or(`full_name.ilike.%${addQuery}%,username.ilike.%${addQuery}%,app_uid.ilike.%${addQuery}%`)
        .limit(20);
      if (active) setAddResults((data || []).filter((u: any) => !members.some(m => m.user_id === u.id)));
    }, 250);
    return () => { active = false; clearTimeout(t); };
  }, [addQuery, showAdd, members]);

  const addMember = async (uid: string) => {
    setAddingId(uid);
    try {
      const { error } = await supabase.rpc("add_group_member", { p_group_id: group.id, p_user_id: uid });
      if (error) throw error;
      toast.success("Member added"); await loadAll(); onGroupUpdated();
      setAddResults(prev => prev.filter(u => u.id !== uid));
    } catch (e: any) { toast.error(e?.message || "Failed"); }
    finally { setAddingId(null); }
  };

  /* ---------- Invite ---------- */
  const copyInvite = async () => {
    if (!inviteUrl) return;
    try { await navigator.clipboard.writeText(inviteUrl); setTokenCopied(true); setTimeout(() => setTokenCopied(false), 1500); toast.success("Invite link copied"); }
    catch { toast.error("Copy failed"); }
  };
  const resetInvite = async () => {
    try {
      const { data, error } = await supabase.rpc("reset_group_invite", { p_group_id: group.id });
      if (error) throw error;
      if (row) setRow({ ...row, invite_token: data as string });
      toast.success("Invite link reset");
    } catch (e: any) { toast.error(e?.message || "Failed"); }
  };

  /* ---------- Requests ---------- */
  const decideRequest = async (id: string, approve: boolean) => {
    try {
      const { error } = await supabase.rpc("decide_group_join_request", { p_request_id: id, p_approve: approve });
      if (error) throw error;
      toast.success(approve ? "Approved" : "Rejected"); await loadAll(); onGroupUpdated();
    } catch (e: any) { toast.error(e?.message || "Failed"); }
  };

  /* ---------- Danger ---------- */
  const doLeave = async () => {
    try { const { error } = await supabase.rpc("leave_group", { p_group_id: group.id }); if (error) throw error; toast.success("Left group"); onLeaveGroup(); }
    catch (e: any) { toast.error(e?.message || "Failed"); }
  };
  const doDelete = async () => {
    try { const { error } = await supabase.rpc("delete_group", { p_group_id: group.id }); if (error) throw error; toast.success("Group deleted"); onLeaveGroup(); }
    catch (e: any) { toast.error(e?.message || "Failed"); }
  };

  /* ---------- UI ---------- */
  const initials = (group.name || "G").slice(0, 2).toUpperCase();

  return (
    <div className="fixed inset-0 z-[60] bg-background flex flex-col">
      {/* Header */}
      <header className="sticky top-0 z-10 flex items-center gap-2 px-3 py-2.5 border-b bg-background/95 backdrop-blur">
        <Button variant="ghost" size="icon" onClick={onClose}><ArrowLeft className="w-5 h-5" /></Button>
        <div className="flex-1 min-w-0">
          <div className="text-[16px] font-semibold truncate">Group Info</div>
          <div className="text-[12px] text-muted-foreground truncate">{row?.member_count ?? group.member_count} members</div>
        </div>
        {isAdmin && (
          <Button variant="ghost" size="icon" onClick={() => setShowEdit(true)} aria-label="Edit"><Edit3 className="w-5 h-5" /></Button>
        )}
      </header>

      <ScrollArea className="flex-1">
        {/* Hero */}
        <section className="px-5 py-6 flex flex-col items-center gap-3 border-b">
          <div className="relative">
            <Avatar className="w-28 h-28 ring-4 ring-background shadow-xl">
              <AvatarImage src={row?.avatar_url || group.avatar_url || ""} />
              <AvatarFallback className="text-3xl bg-gradient-to-br from-indigo-500 via-fuchsia-500 to-rose-500 text-white">{initials}</AvatarFallback>
            </Avatar>
            {isAdmin && (
              <button
                disabled={uploading}
                onClick={() => fileInputRef.current?.click()}
                className="absolute bottom-0 right-0 w-9 h-9 rounded-full bg-primary text-primary-foreground shadow-lg flex items-center justify-center"
                aria-label="Change photo">
                <ImagePlus className="w-4 h-4" />
              </button>
            )}
            <input ref={fileInputRef} type="file" accept="image/*" hidden onChange={onAvatarPick} />
          </div>
          <div className="text-center">
            <div className="text-[20px] font-bold flex items-center justify-center gap-2">
              {row?.name || group.name}
              <Badge variant="secondary" className="capitalize text-[10px]">{row?.group_type || group.group_type}</Badge>
              {row?.is_public ? <Badge className="bg-emerald-500 text-white text-[10px]"><Globe className="w-3 h-3 mr-1" />Public</Badge>
                : <Badge variant="outline" className="text-[10px]"><Lock className="w-3 h-3 mr-1" />Private</Badge>}
            </div>
            {row?.description && <p className="text-[13px] text-muted-foreground mt-1 max-w-md whitespace-pre-wrap">{row.description}</p>}
            {!row?.description && isAdmin && (
              <button onClick={() => setShowEdit(true)} className="text-[12px] text-primary mt-1 underline">Add description</button>
            )}
            {row?.group_code && (
              <div className="text-[11px] text-muted-foreground mt-1">Code: <span className="font-mono">{row.group_code}</span></div>
            )}
          </div>

          {/* Quick actions */}
          <div className="flex gap-2 mt-2">
            {isAdmin && (
              <Button size="sm" variant="outline" onClick={() => setShowAdd(true)}><UserPlus className="w-4 h-4 mr-1" />Add</Button>
            )}
            <Button size="sm" variant="outline" onClick={() => setShowInvite(true)}><Link2 className="w-4 h-4 mr-1" />Invite</Button>
            {isOwner ? (
              <Button size="sm" variant="destructive" onClick={() => setConfirmDelete(true)}><Trash2 className="w-4 h-4 mr-1" />Delete</Button>
            ) : (
              <Button size="sm" variant="destructive" onClick={() => setConfirmLeave(true)}><LogOut className="w-4 h-4 mr-1" />Leave</Button>
            )}
          </div>
        </section>

        {/* Tabs */}
        <Tabs value={tab} onValueChange={(v: any) => setTab(v)} className="w-full">
          <TabsList className="w-full sticky top-0 z-[5] grid grid-cols-4 rounded-none bg-background/95 backdrop-blur border-b">
            <TabsTrigger value="info">Info</TabsTrigger>
            <TabsTrigger value="members">Members</TabsTrigger>
            {isAdmin && (
              <TabsTrigger value="requests">
                Requests{requests.length > 0 && <Badge className="ml-1 h-4 px-1.5 text-[10px]">{requests.length}</Badge>}
              </TabsTrigger>
            )}
            <TabsTrigger value="settings">Settings</TabsTrigger>
          </TabsList>

          {/* INFO */}
          <TabsContent value="info" className="px-4 py-4 space-y-3">
            <Card icon={<Users className="w-4 h-4" />} title="Members" value={`${row?.member_count ?? 0} / ${row?.max_members ?? 5000}`} />
            <Card icon={<Crown className="w-4 h-4 text-amber-500" />} title="Created by" value={members.find(m => m.role === "owner")?.full_name || "—"} />
            <Card icon={<MessageSquare className="w-4 h-4" />} title="Messaging" value={settings.who_can_send === "all" ? "All members can send" : "Admins only"} />
            <Card icon={<Pin className="w-4 h-4" />} title="Pinned messages" value="Tap a message in chat to pin (max 3)" />
          </TabsContent>

          {/* MEMBERS */}
          <TabsContent value="members" className="px-3 py-3 space-y-2">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input value={memberQuery} onChange={e => setMemberQuery(e.target.value)} placeholder="Search members" className="pl-9 h-10" />
            </div>
            {isAdmin && (
              <button onClick={() => setShowAdd(true)} className="w-full flex items-center gap-3 p-2 rounded-lg hover:bg-muted">
                <div className="w-10 h-10 rounded-full bg-primary/15 text-primary flex items-center justify-center"><UserPlus className="w-5 h-5" /></div>
                <div className="text-[14px] font-medium">Add member</div>
              </button>
            )}
            {loading ? (<div className="text-center py-8 text-muted-foreground text-sm">Loading…</div>) :
              filteredMembers.map(m => (
                <button key={m.user_id} onClick={() => setMemberSheet(m)} className="w-full flex items-center gap-3 p-2 rounded-lg hover:bg-muted text-left">
                  <Avatar className="w-10 h-10">
                    <AvatarImage src={m.avatar_url || ""} />
                    <AvatarFallback>{(m.full_name || m.username || "U").slice(0,2).toUpperCase()}</AvatarFallback>
                  </Avatar>
                  <div className="flex-1 min-w-0">
                    <div className="text-[14px] font-medium truncate">{m.full_name || m.username || "User"} {m.user_id === currentUserId && <span className="text-muted-foreground text-[12px]">(You)</span>}</div>
                    {m.username && <div className="text-[12px] text-muted-foreground truncate">@{m.username}</div>}
                  </div>
                  {m.role === "owner" && <Badge className="bg-amber-500 text-white"><Crown className="w-3 h-3 mr-1" />Owner</Badge>}
                  {m.role === "admin" && <Badge className="bg-indigo-500 text-white"><ShieldCheck className="w-3 h-3 mr-1" />Admin</Badge>}
                </button>
              ))
            }
          </TabsContent>

          {/* REQUESTS */}
          {isAdmin && (
            <TabsContent value="requests" className="px-3 py-3 space-y-2">
              {requests.length === 0 ? (
                <div className="text-center py-12 text-muted-foreground text-sm">No pending requests</div>
              ) : requests.map(r => (
                <div key={r.id} className="flex items-center gap-3 p-2 rounded-lg border">
                  <Avatar className="w-10 h-10">
                    <AvatarImage src={r.profile?.avatar_url || ""} />
                    <AvatarFallback>{(r.profile?.full_name || "U").slice(0,2).toUpperCase()}</AvatarFallback>
                  </Avatar>
                  <div className="flex-1 min-w-0">
                    <div className="text-[14px] font-medium truncate">{r.profile?.full_name || r.profile?.username || "User"}</div>
                    <div className="text-[11px] text-muted-foreground">{new Date(r.requested_at).toLocaleString()}</div>
                  </div>
                  <Button size="sm" variant="outline" onClick={() => decideRequest(r.id, false)}>Reject</Button>
                  <Button size="sm" onClick={() => decideRequest(r.id, true)}>Approve</Button>
                </div>
              ))}
            </TabsContent>
          )}

          {/* SETTINGS */}
          <TabsContent value="settings" className="px-4 py-4 space-y-4">
            {row?.group_type !== "family" && (
              <Row title="Public group" desc="Discoverable in search" icon={<Globe className="w-4 h-4" />}>
                <Switch disabled={!isAdmin} checked={!!row?.is_public} onCheckedChange={togglePublic} />
              </Row>
            )}
            <Row title="Who can send messages" icon={<MessageSquare className="w-4 h-4" />}>
              <SegSelect disabled={!isAdmin} value={settings.who_can_send} onChange={(v) => saveSetting({ who_can_send: v })} options={[["all","All"],["admins","Admins"]]} />
            </Row>
            <Row title="Who can edit info" icon={<Edit3 className="w-4 h-4" />}>
              <SegSelect disabled={!isOwner} value={settings.who_can_edit_info} onChange={(v) => saveSetting({ who_can_edit_info: v })} options={[["all","All"],["admins","Admins"]]} />
            </Row>
            <Row title="Who can add members" icon={<UserPlus className="w-4 h-4" />}>
              <SegSelect disabled={!isAdmin} value={settings.who_can_add_members} onChange={(v) => saveSetting({ who_can_add_members: v })} options={[["all","All"],["admins","Admins"]]} />
            </Row>
            <Row title="Approve new members" desc="Join requests need admin approval" icon={<ClipboardCheck className="w-4 h-4" />}>
              <Switch disabled={!isAdmin} checked={!!settings.approve_new_members} onCheckedChange={(v) => saveSetting({ approve_new_members: v })} />
            </Row>
            <Row title="Slow mode (seconds)" icon={<Bell className="w-4 h-4" />}>
              <Input disabled={!isAdmin} type="number" min={0} className="w-24 h-9" value={settings.slow_mode_seconds}
                     onChange={(e) => saveSetting({ slow_mode_seconds: Math.max(0, parseInt(e.target.value || "0", 10)) })} />
            </Row>
            <Row title="Disappearing messages (seconds)" desc="0 = off" icon={<BellOff className="w-4 h-4" />}>
              <Input disabled={!isAdmin} type="number" min={0} className="w-24 h-9" value={settings.disappearing_seconds}
                     onChange={(e) => saveSetting({ disappearing_seconds: Math.max(0, parseInt(e.target.value || "0", 10)) })} />
            </Row>

            <div className="pt-4 mt-4 border-t space-y-2">
              {isOwner ? (
                <Button variant="destructive" className="w-full" onClick={() => setConfirmDelete(true)}>
                  <Trash2 className="w-4 h-4 mr-2" />Delete group
                </Button>
              ) : (
                <Button variant="destructive" className="w-full" onClick={() => setConfirmLeave(true)}>
                  <LogOut className="w-4 h-4 mr-2" />Leave group
                </Button>
              )}
            </div>
          </TabsContent>
        </Tabs>
      </ScrollArea>

      {/* Edit dialog */}
      <Dialog open={showEdit} onOpenChange={setShowEdit}>
        <DialogContent>
          <DialogHeader><DialogTitle>Edit group info</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div><Label>Name</Label><Input value={editName} onChange={(e) => setEditName(e.target.value)} maxLength={60} /></div>
            <div><Label>Description</Label><Textarea value={editDescription} onChange={(e) => setEditDescription(e.target.value)} maxLength={500} rows={4} placeholder="What is this group about?" /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowEdit(false)}>Cancel</Button>
            <Button onClick={saveInfo}>Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add member dialog */}
      <Dialog open={showAdd} onOpenChange={setShowAdd}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Add members</DialogTitle><DialogDescription>Search by name, username or app ID</DialogDescription></DialogHeader>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input autoFocus value={addQuery} onChange={(e) => setAddQuery(e.target.value)} placeholder="Search…" className="pl-9 h-10" />
          </div>
          <ScrollArea className="max-h-80 -mx-2 px-2">
            {addResults.length === 0 ? (
              <div className="text-center text-sm text-muted-foreground py-6">{addQuery ? "No matches" : "Type to search"}</div>
            ) : addResults.map((u: any) => (
              <div key={u.id} className="flex items-center gap-3 p-2 rounded-lg">
                <Avatar className="w-9 h-9"><AvatarImage src={u.avatar_url || ""} /><AvatarFallback>{(u.full_name || "U").slice(0,2).toUpperCase()}</AvatarFallback></Avatar>
                <div className="flex-1 min-w-0">
                  <div className="text-[14px] font-medium truncate">{u.full_name || u.username || "User"}</div>
                  {u.username && <div className="text-[12px] text-muted-foreground truncate">@{u.username}</div>}
                </div>
                <Button size="sm" disabled={addingId === u.id} onClick={() => addMember(u.id)}>{addingId === u.id ? "…" : "Add"}</Button>
              </div>
            ))}
          </ScrollArea>
        </DialogContent>
      </Dialog>

      {/* Invite dialog */}
      <Dialog open={showInvite} onOpenChange={setShowInvite}>
        <DialogContent>
          <DialogHeader><DialogTitle>Invite to group</DialogTitle><DialogDescription>Anyone with this link can request to join.</DialogDescription></DialogHeader>
          <div className="flex gap-2 items-center">
            <Input readOnly value={inviteUrl} className="flex-1" />
            <Button size="icon" variant="outline" onClick={copyInvite}>{tokenCopied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}</Button>
          </div>
          {isAdmin && (
            <Button variant="outline" onClick={resetInvite}><RefreshCw className="w-4 h-4 mr-2" />Reset link</Button>
          )}
        </DialogContent>
      </Dialog>

      {/* Member action sheet */}
      <Sheet open={!!memberSheet} onOpenChange={(o) => !o && setMemberSheet(null)}>
        <SheetContent side="bottom" className="rounded-t-2xl">
          {memberSheet && (
            <>
              <SheetHeader>
                <SheetTitle className="flex items-center gap-3">
                  <Avatar className="w-12 h-12"><AvatarImage src={memberSheet.avatar_url || ""} /><AvatarFallback>{(memberSheet.full_name || "U").slice(0,2).toUpperCase()}</AvatarFallback></Avatar>
                  <div className="text-left">
                    <div>{memberSheet.full_name || memberSheet.username || "User"}</div>
                    <div className="text-[12px] text-muted-foreground capitalize">{memberSheet.role}</div>
                  </div>
                </SheetTitle>
              </SheetHeader>
              <div className="space-y-1 mt-3">
                <SheetBtn icon={<Users className="w-4 h-4" />} label="View profile" onClick={() => { setMemberSheet(null); window.location.href = `/profile-detail/${memberSheet.user_id}`; }} />
                {isOwner && memberSheet.user_id !== currentUserId && memberSheet.role !== "owner" && (
                  memberSheet.role === "admin"
                    ? <SheetBtn icon={<Shield className="w-4 h-4" />} label="Demote to member" onClick={() => setRole(memberSheet.user_id, "member")} />
                    : <SheetBtn icon={<ShieldCheck className="w-4 h-4" />} label="Promote to admin" onClick={() => setRole(memberSheet.user_id, "admin")} />
                )}
                {isOwner && memberSheet.user_id !== currentUserId && (
                  <SheetBtn icon={<Crown className="w-4 h-4 text-amber-500" />} label="Transfer ownership" onClick={() => transferOwnership(memberSheet.user_id)} />
                )}
                {isAdmin && memberSheet.user_id !== currentUserId && memberSheet.role !== "owner" && (
                  <SheetBtn icon={<UserMinus className="w-4 h-4 text-destructive" />} label="Remove from group" danger onClick={() => removeMember(memberSheet.user_id)} />
                )}
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>

      {/* Confirm leave */}
      <Dialog open={confirmLeave} onOpenChange={setConfirmLeave}>
        <DialogContent>
          <DialogHeader><DialogTitle>Leave group?</DialogTitle><DialogDescription>You will no longer receive messages from this group.</DialogDescription></DialogHeader>
          <DialogFooter><Button variant="outline" onClick={() => setConfirmLeave(false)}>Cancel</Button><Button variant="destructive" onClick={doLeave}>Leave</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Confirm delete */}
      <Dialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <DialogContent>
          <DialogHeader><DialogTitle>Delete group?</DialogTitle><DialogDescription>This action cannot be undone. All members will be removed.</DialogDescription></DialogHeader>
          <DialogFooter><Button variant="outline" onClick={() => setConfirmDelete(false)}>Cancel</Button><Button variant="destructive" onClick={doDelete}>Delete</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

/* ---------- Small UI helpers ---------- */
const Card = ({ icon, title, value }: { icon: React.ReactNode; title: string; value: string }) => (
  <div className="flex items-center gap-3 p-3 rounded-xl border bg-card">
    <div className="w-9 h-9 rounded-full bg-muted flex items-center justify-center">{icon}</div>
    <div className="flex-1 min-w-0">
      <div className="text-[12px] text-muted-foreground">{title}</div>
      <div className="text-[14px] font-medium truncate">{value}</div>
    </div>
  </div>
);

const Row = ({ icon, title, desc, children }: { icon?: React.ReactNode; title: string; desc?: string; children: React.ReactNode }) => (
  <div className="flex items-center gap-3 py-2">
    {icon && <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center shrink-0">{icon}</div>}
    <div className="flex-1 min-w-0">
      <div className="text-[14px] font-medium">{title}</div>
      {desc && <div className="text-[12px] text-muted-foreground">{desc}</div>}
    </div>
    {children}
  </div>
);

const SegSelect = ({ value, onChange, options, disabled }: { value: string; onChange: (v: string) => void; options: [string,string][]; disabled?: boolean }) => (
  <div className="inline-flex rounded-lg border bg-muted/30 p-0.5">
    {options.map(([v, l]) => (
      <button key={v} disabled={disabled} onClick={() => onChange(v)} className={`px-3 py-1 text-[12px] rounded-md ${value === v ? "bg-background shadow font-semibold" : "text-muted-foreground"} ${disabled ? "opacity-60" : ""}`}>{l}</button>
    ))}
  </div>
);

const SheetBtn = ({ icon, label, onClick, danger }: { icon: React.ReactNode; label: string; onClick: () => void; danger?: boolean }) => (
  <button onClick={onClick} className={`w-full flex items-center gap-3 px-3 py-3 rounded-lg hover:bg-muted text-left ${danger ? "text-destructive" : ""}`}>
    {icon}<span className="text-[14px] font-medium">{label}</span>
  </button>
);

export default GroupSettingsPanel;
