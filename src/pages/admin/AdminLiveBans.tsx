import { useState, useEffect } from "react";
import useAdminRealtime from "@/hooks/useAdminRealtime";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter, DialogClose } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { adminSupabase as supabase } from "@/integrations/supabase/adminClient";
import { adminSupabase } from "@/integrations/supabase/adminClient";
import { getAdminSession } from "@/utils/adminSession";
import { toast } from "sonner";
import { format } from "date-fns";
import { 
  Shield, 
  Ban, 
  Clock, 
  Settings, 
  Search, 
  RefreshCw, 
  UserX, 
  CheckCircle, 
  AlertTriangle,
  Eye,
  Video,
  Skull,
  Heart
} from "lucide-react";

interface LiveBan {
  id: string;
  user_id: string;
  ban_reason: string;
  violation_type: string;
  warning_count: number;
  ban_start: string;
  ban_end: string | null;
  ban_duration_hours: number | null;
  is_active: boolean;
  auto_banned: boolean;
  unbanned_by: string | null;
  unbanned_at: string | null;
  profiles?: {
    display_name: string;
    avatar_url: string;
    uid: string;
  };
}

interface ModerationSetting {
  id: string;
  setting_key: string;
  setting_value: any;
  description: string;
}

const BAN_DURATION_OPTIONS = [
  { value: "2", label: "2 Hours" },
  { value: "5", label: "5 Hours" },
  { value: "10", label: "10 Hours" },
  { value: "24", label: "24 Hours (1 Day)" },
  { value: "48", label: "48 Hours (2 Days)" },
  { value: "72", label: "72 Hours (3 Days)" },
  { value: "168", label: "168 Hours (1 Week)" },
  { value: "720", label: "720 Hours (30 Days)" },
  { value: "1200", label: "1200 Hours (50 Days)" },
  { value: "permanent", label: "Permanent" },
];

const VIOLATION_TYPES = [
  { value: "face_absence", label: "Face Absence", icon: Eye, color: "text-yellow-500" },
  { value: "drugs", label: "Drugs/Substances", icon: Skull, color: "text-red-500" },
  { value: "sexual_content", label: "Sexual Content", icon: Heart, color: "text-pink-500" },
  { value: "inappropriate_content", label: "Inappropriate Content", icon: AlertTriangle, color: "text-orange-500" },
];

export default function AdminLiveBans() {
  const [bans, setBans] = useState<LiveBan[]>([]);
  const [settings, setSettings] = useState<ModerationSetting[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [filterActive, setFilterActive] = useState<"all" | "active" | "expired">("all");
  
  // New ban dialog
  const [showNewBanDialog, setShowNewBanDialog] = useState(false);
  const [newBanUserId, setNewBanUserId] = useState("");
  const [newBanReason, setNewBanReason] = useState("");
  const [newBanDuration, setNewBanDuration] = useState("24");
  const [newBanViolationType, setNewBanViolationType] = useState("inappropriate_content");

  // Unban dialog
  const [showUnbanDialog, setShowUnbanDialog] = useState(false);
  const [selectedBan, setSelectedBan] = useState<LiveBan | null>(null);
  const [unbanReason, setUnbanReason] = useState("");

  // Settings state
  const [faceDetectionEnabled, setFaceDetectionEnabled] = useState(true);
  const [contentDetectionEnabled, setContentDetectionEnabled] = useState(true);
  const [faceAbsenceTimeout, setFaceAbsenceTimeout] = useState(15);
  const [maxWarnings, setMaxWarnings] = useState(3);
  const [autoBanDuration, setAutoBanDuration] = useState(24);

  const fetchBans = async () => {
    setLoading(true);
    try {
      // Use admin SECURITY DEFINER RPC for reliable cross-table fetch
      const { data, error } = await supabase
        .rpc('admin_list_live_bans', { _only_active: false, _limit: 500 });

      if (error) throw error;

      const bansWithProfiles = ((data || []) as any[]).map((row) => ({
        id: row.id,
        user_id: row.user_id,
        ban_reason: row.ban_reason,
        violation_type: row.violation_type,
        warning_count: row.warning_count,
        ban_start: row.ban_start,
        ban_end: row.ban_end,
        ban_duration_hours: row.ban_duration_hours,
        is_active: row.is_active,
        auto_banned: row.auto_banned,
        unbanned_by: row.unbanned_by,
        unbanned_at: row.unbanned_at,
        profiles: row.display_name
          ? {
              display_name: row.display_name || '',
              avatar_url: row.avatar_url || '',
              uid: row.app_uid || (row.user_id ? row.user_id.slice(0, 8) : ''),
            }
          : undefined,
      }));

      setBans(bansWithProfiles as unknown as LiveBan[]);
    } catch (error) {
      console.error('Error fetching bans:', error);
      toast.error('Failed to load bans');
    } finally {
      setLoading(false);
    }
  };

  const fetchSettings = async () => {
    try {
      const { data, error } = await supabase
        .from('live_moderation_settings')
        .select('*');

      if (error) throw error;
      setSettings(data || []);

      // Parse settings with type safety
      data?.forEach(setting => {
        const value = setting.setting_value as Record<string, any>;
        switch (setting.setting_key) {
          case 'face_detection_enabled':
            setFaceDetectionEnabled(value?.enabled ?? true);
            break;
          case 'content_detection_enabled':
            setContentDetectionEnabled(value?.enabled ?? true);
            break;
          case 'face_absence_timeout':
            setFaceAbsenceTimeout(value?.seconds ?? 15);
            break;
          case 'max_warnings_before_ban':
            setMaxWarnings(value?.count ?? 3);
            break;
          case 'auto_ban_duration_hours':
            setAutoBanDuration(value?.hours ?? 24);
            break;
        }
      });
    } catch (error) {
      console.error('Error fetching settings:', error);
    }
  };

  useEffect(() => {
    fetchBans();
    fetchSettings();
  }, []);

  useAdminRealtime(['live_bans'], () => fetchBans());

  const handleCreateBan = async () => {
    if (!newBanUserId) {
      toast.error('Please enter a user ID');
      return;
    }

    try {
      const banEnd = newBanDuration === 'permanent' 
        ? null 
        : new Date(Date.now() + parseInt(newBanDuration) * 60 * 60 * 1000).toISOString();

      // Resolve target: accept UUID directly, otherwise treat as app_uid
      const trimmed = newBanUserId.trim();
      let targetId = trimmed;
      const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(trimmed);
      if (!isUuid) {
        const { data: prof, error: profErr } = await supabase
          .from('profiles').select('id').eq('app_uid', trimmed).maybeSingle();
        if (profErr) throw profErr;
        if (!prof?.id) { toast.error('User not found for that ID'); return; }
        targetId = prof.id;
      }

      const { error } = await supabase.from('live_bans').insert({
        user_id: targetId,
        ban_reason: newBanReason || 'Manual ban by admin',
        reason: newBanReason || 'Manual ban by admin',
        violation_type: newBanViolationType,
        ban_type: newBanDuration === 'permanent' ? 'permanent' : 'temporary',
        ban_duration_hours: newBanDuration === 'permanent' ? null : parseInt(newBanDuration),
        ban_start: new Date().toISOString(),
        ban_end: banEnd,
        expires_at: banEnd,
        is_active: true,
        auto_banned: false,
      } as any);
      if (error) throw error;

      toast.success('User banned successfully ✅');
      setShowNewBanDialog(false);
      setNewBanUserId('');
      setNewBanReason('');
      fetchBans();
    } catch (error) {
      console.error('Error creating ban:', error);
      toast.error('Failed to create ban');
    }
  };

  const handleUnban = async () => {
    if (!selectedBan) return;

    try {
      const session = getAdminSession();
      if (session?.admin_id) {
        const { data, error } = await adminSupabase.rpc('admin_session_unban_live' as any, {
          _admin_id: session.admin_id,
          _ban_id: selectedBan.id,
          _reason: unbanReason || 'Unbanned by admin',
        });
        if (error) throw error;
        if (!(data as any)?.success) throw new Error('Unban failed');
      } else {
        const { data: userData } = await supabase.auth.getUser();
        const { error } = await supabase
          .from('live_bans')
          .update({
            is_active: false,
            unbanned_by: userData.user?.id,
            unbanned_at: new Date().toISOString(),
            unban_reason: unbanReason || 'Unbanned by admin',
          } as any)
          .eq('id', selectedBan.id);
        if (error) throw error;
      }

      toast.success('User unbanned successfully');
      setShowUnbanDialog(false);
      setSelectedBan(null);
      setUnbanReason('');
      fetchBans();
    } catch (error: any) {
      console.error('Error unbanning user:', error);
      toast.error(error?.message || 'Failed to unban user');
    }
  };

  const handleUpdateSetting = async (key: string, value: any) => {
    try {
      const { error } = await supabase
        .from('live_moderation_settings')
        .update({ 
          setting_value: value,
          updated_at: new Date().toISOString(),
        })
        .eq('setting_key', key);

      if (error) throw error;
      toast.success('Setting updated');
    } catch (error) {
      console.error('Error updating setting:', error);
      toast.error('Failed to update setting');
    }
  };

  const filteredBans = bans.filter(ban => {
    const matchesSearch = 
      ban.profiles?.display_name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      ban.profiles?.uid?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      ban.ban_reason?.toLowerCase().includes(searchQuery.toLowerCase());

    const now = new Date();
    const isExpired = ban.ban_end && new Date(ban.ban_end) < now;

    if (filterActive === 'active') return matchesSearch && ban.is_active && !isExpired;
    if (filterActive === 'expired') return matchesSearch && (!ban.is_active || isExpired);
    return matchesSearch;
  });

  const getViolationIcon = (type: string) => {
    const violation = VIOLATION_TYPES.find(v => v.value === type);
    if (!violation) return <AlertTriangle className="w-4 h-4" />;
    const Icon = violation.icon;
    return <Icon className={`w-4 h-4 ${violation.color}`} />;
  };

  return (
    <div className="space-y-6">
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-red-500 to-rose-600 flex items-center justify-center shadow-lg">
              <Shield className="w-6 h-6 text-white" />
            </div>
            <div>
              <h1 className="text-2xl font-bold">Live Stream Moderation</h1>
              <p className="text-muted-foreground text-sm">Manage bans, violations and moderation settings</p>
            </div>
          </div>
          <Button onClick={fetchBans} variant="outline" size="icon">
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </Button>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card className="bg-gradient-to-br from-red-500/10 to-rose-500/10 border-red-500/20">
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <Ban className="w-8 h-8 text-red-500" />
                <div>
                  <p className="text-2xl font-bold">{bans.filter(b => b.is_active).length}</p>
                  <p className="text-xs text-muted-foreground">Active Bans</p>
                </div>
              </div>
            </CardContent>
          </Card>
          
          <Card className="bg-gradient-to-br from-yellow-500/10 to-amber-500/10 border-yellow-500/20">
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <AlertTriangle className="w-8 h-8 text-yellow-500" />
                <div>
                  <p className="text-2xl font-bold">{bans.filter(b => b.auto_banned).length}</p>
                  <p className="text-xs text-muted-foreground">Auto Bans</p>
                </div>
              </div>
            </CardContent>
          </Card>
          
          <Card className="bg-gradient-to-br from-green-500/10 to-emerald-500/10 border-green-500/20">
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <CheckCircle className="w-8 h-8 text-green-500" />
                <div>
                  <p className="text-2xl font-bold">{bans.filter(b => !b.is_active).length}</p>
                  <p className="text-xs text-muted-foreground">Unbanned</p>
                </div>
              </div>
            </CardContent>
          </Card>
          
          <Card className="bg-gradient-to-br from-purple-500/10 to-violet-500/10 border-purple-500/20">
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <Video className="w-8 h-8 text-purple-500" />
                <div>
                  <p className="text-2xl font-bold">{bans.length}</p>
                  <p className="text-xs text-muted-foreground">Total Bans</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        <Tabs defaultValue="bans" className="w-full">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="bans" className="flex items-center gap-2">
              <Ban className="w-4 h-4" /> Bans
            </TabsTrigger>
            <TabsTrigger value="settings" className="flex items-center gap-2">
              <Settings className="w-4 h-4" /> Settings
            </TabsTrigger>
          </TabsList>

          {/* Bans Tab */}
          <TabsContent value="bans" className="space-y-4">
            {/* Actions Bar */}
            <div className="flex flex-col sm:flex-row gap-3">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  placeholder="Search by name, UID or reason..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-10"
                />
              </div>
              
              <Select value={filterActive} onValueChange={(v: any) => setFilterActive(v)}>
                <SelectTrigger className="w-[140px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Bans</SelectItem>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="expired">Expired</SelectItem>
                </SelectContent>
              </Select>

              <Dialog open={showNewBanDialog} onOpenChange={setShowNewBanDialog}>
                <DialogTrigger asChild>
                  <Button className="bg-gradient-to-r from-red-500 to-rose-600">
                    <UserX className="w-4 h-4 mr-2" /> New Ban
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Create New Ban</DialogTitle>
                  </DialogHeader>
                  <div className="space-y-4">
                    <div>
                      <Label>User ID</Label>
                      <Input
                        placeholder="Enter user UUID"
                        value={newBanUserId}
                        onChange={(e) => setNewBanUserId(e.target.value)}
                      />
                    </div>
                    <div>
                      <Label>Violation Type</Label>
                      <Select value={newBanViolationType} onValueChange={setNewBanViolationType}>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {VIOLATION_TYPES.map(type => (
                            <SelectItem key={type.value} value={type.value}>
                              <div className="flex items-center gap-2">
                                {type.label}
                              </div>
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label>Ban Duration</Label>
                      <Select value={newBanDuration} onValueChange={setNewBanDuration}>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {BAN_DURATION_OPTIONS.map(option => (
                            <SelectItem key={option.value} value={option.value}>
                              {option.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label>Reason</Label>
                      <Textarea
                        placeholder="Enter ban reason..."
                        value={newBanReason}
                        onChange={(e) => setNewBanReason(e.target.value)}
                      />
                    </div>
                  </div>
                  <DialogFooter>
                    <DialogClose asChild>
                      <Button variant="outline">Cancel</Button>
                    </DialogClose>
                    <Button onClick={handleCreateBan} className="bg-red-500 hover:bg-red-600">
                      Create Ban
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            </div>

            {/* Bans Table */}
            <Card>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>User</TableHead>
                      <TableHead>Violation</TableHead>
                      <TableHead>Reason</TableHead>
                      <TableHead>Duration</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {loading ? (
                      <TableRow>
                        <TableCell colSpan={6} className="text-center py-8">
                          <RefreshCw className="w-6 h-6 animate-spin mx-auto text-muted-foreground" />
                        </TableCell>
                      </TableRow>
                    ) : filteredBans.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                          No bans found
                        </TableCell>
                      </TableRow>
                    ) : (
                      filteredBans.map((ban) => {
                        const now = new Date();
                        const isExpired = ban.ban_end && new Date(ban.ban_end) < now;
                        const isActive = ban.is_active && !isExpired;

                        return (
                          <TableRow key={ban.id}>
                            <TableCell>
                              <div className="flex items-center gap-2">
                                <img
                                  src={ban.profiles?.avatar_url || '/placeholder.svg'}
                                  alt=""
                                  className="w-8 h-8 rounded-full"
                                />
                                <div>
                                  <p className="font-medium text-sm">{ban.profiles?.display_name || 'Unknown'}</p>
                                  <p className="text-xs text-muted-foreground">{ban.profiles?.uid}</p>
                                </div>
                              </div>
                            </TableCell>
                            <TableCell>
                              <div className="flex items-center gap-2">
                                {getViolationIcon(ban.violation_type)}
                                <span className="text-sm capitalize">{ban.violation_type.replace('_', ' ')}</span>
                              </div>
                            </TableCell>
                            <TableCell>
                              <p className="text-sm max-w-[200px] truncate">{ban.ban_reason}</p>
                              {ban.auto_banned && (
                                <Badge variant="outline" className="text-[10px] mt-1">Auto-banned</Badge>
                              )}
                            </TableCell>
                            <TableCell>
                              <div className="flex items-center gap-1">
                                <Clock className="w-3 h-3 text-muted-foreground" />
                                <span className="text-sm">
                                  {ban.ban_duration_hours ? `${ban.ban_duration_hours}h` : 'Permanent'}
                                </span>
                              </div>
                              {ban.ban_end && (
                                <p className="text-xs text-muted-foreground">
                                  Until {format(new Date(ban.ban_end), 'MMM dd, HH:mm')}
                                </p>
                              )}
                            </TableCell>
                            <TableCell>
                              {isActive ? (
                                <Badge className="bg-red-500">Active</Badge>
                              ) : isExpired ? (
                                <Badge variant="outline">Expired</Badge>
                              ) : (
                                <Badge className="bg-green-500">Unbanned</Badge>
                              )}
                            </TableCell>
                            <TableCell>
                              <div className="flex items-center gap-2">
                                {isActive ? (
                                  <>
                                    {/* Quick Unban Button */}
                                    <Button
                                      size="sm"
                                      variant="default"
                                      className="bg-gradient-to-r from-green-500 to-emerald-600 hover:from-green-600 hover:to-emerald-700"
                                      onClick={async () => {
                                        try {
                                          const { data: userData } = await supabase.auth.getUser();
                                          const { error } = await supabase
                                            .from('live_bans')
                                            .update({
                                              is_active: false,
                                              unbanned_by: userData.user?.id,
                                              unbanned_at: new Date().toISOString(),
                                              unban_reason: 'Quick unban by admin',
                                            })
                                            .eq('id', ban.id);
                                          
                                          if (error) throw error;
                                          toast.success(`${ban.profiles?.display_name || 'User'} has been unbanned`);
                                          fetchBans();
                                        } catch (error) {
                                          console.error('Error unbanning:', error);
                                          toast.error('Failed to unban user');
                                        }
                                      }}
                                    >
                                      <CheckCircle className="w-4 h-4 mr-1" />
                                      Unban
                                    </Button>
                                    
                                    {/* Detailed Unban with Reason */}
                                    <Button
                                      size="sm"
                                      variant="outline"
                                      onClick={() => {
                                        setSelectedBan(ban);
                                        setShowUnbanDialog(true);
                                      }}
                                    >
                                      + Reason
                                    </Button>
                                  </>
                                ) : (
                                  <span className="text-xs text-muted-foreground">
                                    {ban.unbanned_at && `Unbanned ${format(new Date(ban.unbanned_at), 'MMM dd')}`}
                                  </span>
                                )}
                              </div>
                            </TableCell>
                          </TableRow>
                        );
                      })
                    )}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Settings Tab */}
          <TabsContent value="settings" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Eye className="w-5 h-5" /> Face Detection Settings
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-medium">Enable Face Detection</p>
                    <p className="text-sm text-muted-foreground">Auto-close streams when face is not visible</p>
                  </div>
                  <Switch
                    checked={faceDetectionEnabled}
                    onCheckedChange={(checked) => {
                      setFaceDetectionEnabled(checked);
                      handleUpdateSetting('face_detection_enabled', { enabled: checked });
                    }}
                  />
                </div>

                <div>
                  <Label>Face Absence Timeout (seconds)</Label>
                  <div className="flex items-center gap-4 mt-2">
                    <Input
                      type="number"
                      value={faceAbsenceTimeout}
                      onChange={(e) => setFaceAbsenceTimeout(parseInt(e.target.value))}
                      className="w-24"
                      min={5}
                      max={60}
                    />
                    <Button
                      size="sm"
                      onClick={() => handleUpdateSetting('face_absence_timeout', { seconds: faceAbsenceTimeout })}
                    >
                      Save
                    </Button>
                    <span className="text-sm text-muted-foreground">
                      Stream closes after {faceAbsenceTimeout}s without face
                    </span>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <AlertTriangle className="w-5 h-5" /> Content Moderation Settings
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-medium">Enable Content Detection</p>
                    <p className="text-sm text-muted-foreground">Detect inappropriate content and issue warnings</p>
                  </div>
                  <Switch
                    checked={contentDetectionEnabled}
                    onCheckedChange={(checked) => {
                      setContentDetectionEnabled(checked);
                      handleUpdateSetting('content_detection_enabled', { enabled: checked });
                    }}
                  />
                </div>

                <div>
                  <Label>Max Warnings Before Auto-Ban</Label>
                  <div className="flex items-center gap-4 mt-2">
                    <Input
                      type="number"
                      value={maxWarnings}
                      onChange={(e) => setMaxWarnings(parseInt(e.target.value))}
                      className="w-24"
                      min={1}
                      max={10}
                    />
                    <Button
                      size="sm"
                      onClick={() => handleUpdateSetting('max_warnings_before_ban', { count: maxWarnings })}
                    >
                      Save
                    </Button>
                    <span className="text-sm text-muted-foreground">
                      Users get {maxWarnings} warnings before auto-ban
                    </span>
                  </div>
                </div>

                <div>
                  <Label>Auto-Ban Duration (hours)</Label>
                  <div className="flex items-center gap-4 mt-2">
                    <Select 
                      value={autoBanDuration.toString()} 
                      onValueChange={(v) => {
                        const hours = parseInt(v);
                        setAutoBanDuration(hours);
                        handleUpdateSetting('auto_ban_duration_hours', { hours });
                      }}
                    >
                      <SelectTrigger className="w-[200px]">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {BAN_DURATION_OPTIONS.filter(o => o.value !== 'permanent').map(option => (
                          <SelectItem key={option.value} value={option.value}>
                            {option.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <span className="text-sm text-muted-foreground">
                      Default ban duration for auto-bans
                    </span>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>

        {/* Unban Dialog */}
        <Dialog open={showUnbanDialog} onOpenChange={setShowUnbanDialog}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Unban User</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">
                Are you sure you want to unban {selectedBan?.profiles?.display_name || 'this user'}?
              </p>
              <div>
                <Label>Reason for Unbanning</Label>
                <Textarea
                  placeholder="Enter reason..."
                  value={unbanReason}
                  onChange={(e) => setUnbanReason(e.target.value)}
                />
              </div>
            </div>
            <DialogFooter>
              <DialogClose asChild>
                <Button variant="outline">Cancel</Button>
              </DialogClose>
              <Button onClick={handleUnban} className="bg-green-500 hover:bg-green-600">
                Unban User
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
}
