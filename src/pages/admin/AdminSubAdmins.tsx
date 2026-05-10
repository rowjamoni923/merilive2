import { useState, useEffect } from "react";
import useAdminRealtime from "@/hooks/useAdminRealtime";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { 
  Dialog, 
  DialogContent, 
  DialogHeader, 
  DialogTitle, 
  DialogTrigger,
  DialogFooter 
} from "@/components/ui/dialog";
import { 
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { 
  Users, 
  UserPlus, 
  Shield, 
  ShieldCheck,
  Trash2,
  Settings,
  Copy,
  Check,
  RefreshCw,
  Crown,
  Eye,
  EyeOff,
  Key,
  Link as LinkIcon,
  Ban,
  CheckCircle,
  Smartphone,
  Lock
} from "lucide-react";
import { adminSupabase as supabase } from "@/integrations/supabase/adminClient";
import { adminSupabase } from "@/integrations/supabase/adminClient";
import { getAdminSession } from "@/utils/adminSession";
import { toast } from "sonner";
import { format } from "date-fns";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import DeviceApprovalSection from "@/components/admin/DeviceApprovalSection";
import OwnerAccessLinkGenerator from "@/components/admin/OwnerAccessLinkGenerator";
import VaultPinManager from "@/components/admin/VaultPinManager";
import { recordAdminError } from "@/utils/adminErrorLog";
import { getAdminActorId } from "@/utils/adminActionMeta";

import { formatAdminError } from "@/utils/formatAdminError";
interface AdminUser {
  id: string;
  user_id: string | null;
  email: string;
  display_name: string | null;
  role: 'owner' | 'sub_admin';
  is_active: boolean;
  invited_at: string;
  accepted_at: string | null;
  last_login_at: string | null;
}

interface AdminSection {
  id: string;
  section_key: string;
  section_name: string;
  section_name_bn: string | null;
  hub_key: string | null;
  icon_name: string | null;
  display_order: number;
}

interface SectionPermission {
  section_id: string;
  can_view: boolean;
  can_edit: boolean;
  can_delete: boolean;
}

const HUB_NAMES: Record<string, { name: string, color: string }> = {
  'user-hub': { name: 'User Hub', color: 'bg-blue-500' },
  'agency-hub': { name: 'Agency Hub', color: 'bg-purple-500' },
  'level-hub': { name: 'Level Management', color: 'bg-green-500' },
  'vip-hub': { name: 'VIP Management', color: 'bg-yellow-500' },
  'visual-hub': { name: 'Visual Assets', color: 'bg-pink-500' },
  'trader-hub': { name: 'Diamond Trader', color: 'bg-orange-500' },
  'finance-hub': { name: 'Finance', color: 'bg-emerald-500' },
  'game-hub': { name: 'Games', color: 'bg-indigo-500' },
  'party-hub': { name: 'Party', color: 'bg-rose-500' },
  'content-hub': { name: 'Content', color: 'bg-cyan-500' },
  'shop-hub': { name: 'Shop', color: 'bg-amber-500' },
  'settings-hub': { name: 'App Settings', color: 'bg-slate-500' },
  'moderation-hub': { name: 'Moderation', color: 'bg-red-500' },
};

const AdminSubAdmins = () => {
  const [admins, setAdmins] = useState<AdminUser[]>([]);
  const [sections, setSections] = useState<AdminSection[]>([]);
  const [loading, setLoading] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [permissionOpen, setPermissionOpen] = useState(false);
  const [passwordOpen, setPasswordOpen] = useState(false);
  const [selectedAdmin, setSelectedAdmin] = useState<AdminUser | null>(null);
  
  // Create form state
  const [newEmail, setNewEmail] = useState("");
  const [newName, setNewName] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [selectedSections, setSelectedSections] = useState<SectionPermission[]>([]);
  const [isCreating, setIsCreating] = useState(false);
  
  // Generated link
  const [generatedLink, setGeneratedLink] = useState<string | null>(null);
  const [copiedLink, setCopiedLink] = useState(false);
  
  // Password change
  const [changePassword, setChangePassword] = useState("");
  const [showChangePassword, setShowChangePassword] = useState(false);

  useEffect(() => {
    fetchAdmins();
    fetchSections();
  }, []);

  useAdminRealtime(['admin_users'], () => fetchAdmins());

  const fetchAdmins = async () => {
    const { data, error } = await supabase
      .from("admin_users")
      .select("*")
      .order("role", { ascending: true })
      .order("created_at", { ascending: false });

    if (error) {
      console.error("Error fetching admins:", error);
      recordAdminError({ kind: "rpc", label: "AdminSubAdmins.fetchAdmins", message: formatAdminError(error)) });
      return;
    }
    setAdmins(data || []);
    setLoading(false);
  };

  const fetchSections = async () => {
    const { data, error } = await supabase
      .from("admin_sections")
      .select("*")
      .eq("is_active", true)
      .order("display_order");

    if (error) {
      console.error("Error fetching sections:", error);
      recordAdminError({ kind: "rpc", label: "AdminSubAdmins.fetchSections", message: formatAdminError(error)) });
      return;
    }
    setSections(data || []);
  };

  const fetchAdminPermissions = async (adminId: string) => {
    const { data, error } = await supabase
      .from("admin_section_permissions")
      .select("section_id, can_view, can_edit, can_delete")
      .eq("admin_user_id", adminId);

    if (error) {
      console.error("Error fetching permissions:", error);
      recordAdminError({ kind: "rpc", label: "AdminSubAdmins.fetchAdminPermissions", message: formatAdminError(error)) });
      return;
    }

    setSelectedSections(data || []);
  };

  const handleCreateSubAdmin = async () => {
    if (!newEmail.trim() || !newPassword || newPassword.length < 6) {
      toast.error("Please enter email and password (minimum 6 characters)");
      return;
    }

    setIsCreating(true);

    try {
      const response = await supabase.functions.invoke("create-sub-admin", {
        body: {
          email: newEmail.trim().toLowerCase(),
          password: newPassword,
          display_name: newName.trim() || newEmail.split('@')[0],
          sections_access: selectedSections.filter(s => s.can_view).map(s => s.section_id),
        },
      });

      if (response.error) {
        toast.error(response.error.message || "Failed to create sub-admin");
        return;
      }

      if (response.data?.error) {
        toast.error(response.data.error);
        return;
      }

      setGeneratedLink(response.data.login_link);
      toast.success("Sub-admin created successfully!");
      fetchAdmins();
    } catch (error: any) {
      console.error("Error:", error);
      recordAdminError({ kind: "rpc", label: "AdminSubAdmins.response", message: formatAdminError(error)) });
      toast.error(error.message || "An error occurred");
    } finally {
      setIsCreating(false);
    }
  };

  const handleToggleBlock = async (admin: AdminUser) => {
    try {
      const response = await supabase.functions.invoke("update-sub-admin", {
        body: {
          admin_user_id: admin.id,
          action: "toggle_block",
        },
      });

      if (response.error || response.data?.error) {
        toast.error(response.data?.error || "An error occurred");
        return;
      }

      toast.success(response.data.message);
      fetchAdmins();
    } catch (error: any) {
      toast.error(error.message);
    }
  };

  const handleChangePassword = async () => {
    if (!selectedAdmin || !changePassword || changePassword.length < 6) {
      toast.error("Password must be at least 6 characters");
      return;
    }

    try {
      const response = await supabase.functions.invoke("update-sub-admin", {
        body: {
          admin_user_id: selectedAdmin.id,
          action: "update_password",
          new_password: changePassword,
        },
      });

      if (response.error || response.data?.error) {
        toast.error(response.data?.error || "An error occurred");
        return;
      }

      toast.success("Password changed successfully!");
      setPasswordOpen(false);
      setChangePassword("");
    } catch (error: any) {
      toast.error(error.message);
    }
  };

  const handleDeleteAdmin = async (admin: AdminUser) => {
    if (!confirm(`Delete ${admin.email}? This sub-admin will no longer be able to log in.`)) return;

    try {
      const response = await supabase.functions.invoke("update-sub-admin", {
        body: {
          admin_user_id: admin.id,
          action: "delete",
        },
      });

      if (response.error || response.data?.error) {
        toast.error(response.data?.error || "An error occurred");
        return;
      }

      toast.success("Sub-admin deleted successfully");
      fetchAdmins();
    } catch (error: any) {
      toast.error(error.message);
    }
  };

  const handleSavePermissions = async () => {
    if (!selectedAdmin) return;
    const adminActorId = getAdminActorId();

    // Delete existing permissions
    await supabase
      .from("admin_section_permissions")
      .delete()
      .eq("admin_user_id", selectedAdmin.id);

    // Insert new permissions
    const permissionsToInsert = selectedSections
      .filter(s => s.can_view)
      .map(s => ({
        admin_user_id: selectedAdmin.id,
        section_id: s.section_id,
        can_view: s.can_view,
        can_edit: s.can_edit,
        can_delete: s.can_delete,
        granted_by: adminActorId,
      }));

    if (permissionsToInsert.length > 0) {
      const { error } = await supabase
        .from("admin_section_permissions")
        .insert(permissionsToInsert);

      if (error) {
        toast.error("Failed to save permissions");
        console.error(error);
        recordAdminError({ kind: "rpc", label: "AdminSubAdmins.permissionsToInsert", message: error?.message ?? String(error) });
        return;
      }
    }

    toast.success("Permissions updated!");
    setPermissionOpen(false);
  };

  const openPermissionDialog = (admin: AdminUser) => {
    setSelectedAdmin(admin);
    fetchAdminPermissions(admin.id);
    setPermissionOpen(true);
  };

  const openPasswordDialog = (admin: AdminUser) => {
    setSelectedAdmin(admin);
    setChangePassword("");
    setPasswordOpen(true);
  };

  const toggleSectionPermission = (sectionId: string, field: 'can_view' | 'can_edit' | 'can_delete') => {
    setSelectedSections(prev => {
      const existing = prev.find(s => s.section_id === sectionId);
      if (existing) {
        if (field === 'can_view' && existing.can_view) {
          return prev.filter(s => s.section_id !== sectionId);
        }
        return prev.map(s => 
          s.section_id === sectionId 
            ? { ...s, [field]: !s[field] }
            : s
        );
      } else {
        return [...prev, { section_id: sectionId, can_view: true, can_edit: false, can_delete: false }];
      }
    });
  };

  const selectAllInHub = (hubKey: string) => {
    const hubSections = sections.filter(s => s.hub_key === hubKey);
    setSelectedSections(prev => {
      const newSelections = [...prev];
      hubSections.forEach(section => {
        if (!newSelections.find(s => s.section_id === section.id)) {
          newSelections.push({ section_id: section.id, can_view: true, can_edit: true, can_delete: false });
        }
      });
      return newSelections;
    });
  };

  const deselectAllInHub = (hubKey: string) => {
    const hubSectionIds = sections.filter(s => s.hub_key === hubKey).map(s => s.id);
    setSelectedSections(prev => prev.filter(s => !hubSectionIds.includes(s.section_id)));
  };

  const copyLink = (link: string) => {
    navigator.clipboard.writeText(link);
    setCopiedLink(true);
    toast.success("Link copied!");
    setTimeout(() => setCopiedLink(false), 2000);
  };

  // Fetch the live luxurious sub-admin token (year-aware) from server
  const [subAdminTokenForLinks, setSubAdminTokenForLinks] = useState<string | null>(null);

  useEffect(() => {
    const fetchToken = async () => {
      try {
        const session = getAdminSession();
        const { data, error } = await adminSupabase.functions.invoke('get-admin-tokens', {
          body: { admin_id: session?.admin_id },
        });
        if (!error && data?.subadmin_token) {
          setSubAdminTokenForLinks(data.subadmin_token);
        }
      } catch (err) {
        console.error('Failed to fetch sub-admin token:', err);
        recordAdminError({ kind: "rpc", label: "AdminSubAdmins.session", message: formatAdminError(err)) });
      }
    };
    fetchToken();
  }, []);
  
  const getLoginLink = (email: string) => {
    const token = subAdminTokenForLinks || '';
    return `https://merilive.com/admin/auth?access=${token}&email=${encodeURIComponent(email)}`;
  };

  const resetCreateForm = () => {
    setNewEmail("");
    setNewName("");
    setNewPassword("");
    setSelectedSections([]);
    setGeneratedLink(null);
    setCopiedLink(false);
  };

  // Group sections by hub
  const sectionsByHub = sections.reduce((acc, section) => {
    const hub = section.hub_key || 'other';
    if (!acc[hub]) acc[hub] = [];
    acc[hub].push(section);
    return acc;
  }, {} as Record<string, AdminSection[]>);

  // Count pending devices
  const [pendingDeviceCount, setPendingDeviceCount] = useState(0);

  useEffect(() => {
    const fetchPendingCount = async () => {
      const { count } = await supabase
        .from('admin_allowed_devices')
        .select('*', { count: 'exact', head: true })
        .eq('status', 'pending');
      setPendingDeviceCount(count || 0);
    };
    fetchPendingCount();
  }, []);

  useAdminRealtime(['admin_allowed_devices'], async () => {
    const { count } = await supabase
      .from('admin_allowed_devices')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'pending');
    setPendingDeviceCount(count || 0);
  });

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-gradient-to-r from-violet-600 via-purple-600 to-violet-600 rounded-2xl p-6 shadow-lg">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 rounded-xl bg-white/20 flex items-center justify-center">
              <Shield className="w-8 h-8 text-white" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-white">Sub-Admin Management</h1>
              <p className="text-white/80">Sector-based Access Control</p>
            </div>
          </div>

          <Dialog open={createOpen} onOpenChange={(open) => { setCreateOpen(open); if (!open) resetCreateForm(); }}>
            <DialogTrigger asChild>
              <Button className="bg-white/20 hover:bg-white/30 text-white border-0">
                <UserPlus className="w-4 h-4 mr-2" />
                New Sub-Admin
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <UserPlus className="w-5 h-5" />
                  Create New Sub-Admin
                </DialogTitle>
              </DialogHeader>

              {!generatedLink ? (
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label>Email *</Label>
                      <Input 
                        value={newEmail}
                        onChange={(e) => setNewEmail(e.target.value)}
                        placeholder="admin@example.com"
                        type="email"
                      />
                    </div>
                    <div>
                      <Label>Name</Label>
                      <Input 
                        value={newName}
                        onChange={(e) => setNewName(e.target.value)}
                        placeholder="Sub-Admin Name"
                      />
                    </div>
                  </div>

                  <div>
                    <Label>Password *</Label>
                    <div className="relative">
                      <Input 
                        value={newPassword}
                        onChange={(e) => setNewPassword(e.target.value)}
                        placeholder="Minimum 6 characters"
                        type={showPassword ? "text" : "password"}
                        className="pr-10"
                      />
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="absolute right-0 top-0 h-full px-3"
                        onClick={() => setShowPassword(!showPassword)}
                      >
                        {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </Button>
                    </div>
                  </div>

                  <div>
                    <Label className="text-base font-semibold">Select Section Permissions</Label>
                    <p className="text-sm text-muted-foreground mb-3">Select the sections you want to grant access to</p>
                    
                    <div className="space-y-2 max-h-[300px] overflow-y-auto">
                      {Object.entries(sectionsByHub).map(([hubKey, hubSections]) => (
                        <Collapsible key={hubKey} className="border rounded-lg">
                          <CollapsibleTrigger className="w-full p-3 flex items-center justify-between hover:bg-accent/50">
                            <div className="flex items-center gap-2">
                              <div className={`w-3 h-3 rounded-full ${HUB_NAMES[hubKey]?.color || 'bg-gray-500'}`} />
                              <span className="font-medium">{HUB_NAMES[hubKey]?.name || hubKey}</span>
                              <Badge variant="outline" className="text-xs">
                                {selectedSections.filter(s => hubSections.some(hs => hs.id === s.section_id)).length}/{hubSections.length}
                              </Badge>
                            </div>
                            <div className="flex items-center gap-2">
                              <Button 
                                variant="ghost" 
                                size="sm"
                                onClick={(e) => { e.stopPropagation(); selectAllInHub(hubKey); }}
                              >
                                All
                              </Button>
                              <Button 
                                variant="ghost" 
                                size="sm"
                                onClick={(e) => { e.stopPropagation(); deselectAllInHub(hubKey); }}
                              >
                                Clear
                              </Button>
                            </div>
                          </CollapsibleTrigger>
                          <CollapsibleContent className="p-3 pt-0 border-t">
                            <div className="space-y-2">
                              {hubSections.map((section) => {
                                const perm = selectedSections.find(s => s.section_id === section.id);
                                return (
                                  <div key={section.id} className="flex items-center justify-between p-2 rounded hover:bg-accent/30">
                                    <div className="flex items-center gap-2">
                                      <Checkbox 
                                        checked={!!perm?.can_view}
                                        onCheckedChange={() => toggleSectionPermission(section.id, 'can_view')}
                                      />
                                      <span className="text-sm">{section.section_name}</span>
                                    </div>
                                    {perm?.can_view && (
                                      <div className="flex items-center gap-3">
                                        <label className="flex items-center gap-1 text-xs">
                                          <Checkbox 
                                            checked={perm?.can_edit}
                                            onCheckedChange={() => toggleSectionPermission(section.id, 'can_edit')}
                                          />
                                          Edit
                                        </label>
                                        <label className="flex items-center gap-1 text-xs">
                                          <Checkbox 
                                            checked={perm?.can_delete}
                                            onCheckedChange={() => toggleSectionPermission(section.id, 'can_delete')}
                                          />
                                          Delete
                                        </label>
                                      </div>
                                    )}
                                  </div>
                                );
                              })}
                            </div>
                          </CollapsibleContent>
                        </Collapsible>
                      ))}
                    </div>
                  </div>

                  <DialogFooter>
                    <Button onClick={handleCreateSubAdmin} disabled={isCreating || !newEmail.trim() || !newPassword}>
                      {isCreating ? (
                        <><RefreshCw className="w-4 h-4 mr-2 animate-spin" /> Creating...</>
                      ) : (
                        <><UserPlus className="w-4 h-4 mr-2" /> Create Sub-Admin</>
                      )}
                    </Button>
                  </DialogFooter>
                </div>
              ) : (
                <div className="space-y-4 text-center">
                  <div className="w-16 h-16 rounded-full bg-green-500/20 flex items-center justify-center mx-auto">
                    <Check className="w-8 h-8 text-green-500" />
                  </div>
                  <h3 className="text-xl font-bold">Sub-Admin Created!</h3>
                  <div className="bg-accent/50 rounded-lg p-4 text-left space-y-2">
                    <div>
                      <Label className="text-sm text-muted-foreground">Email</Label>
                      <p className="font-medium">{newEmail}</p>
                    </div>
                    <div>
                      <Label className="text-sm text-muted-foreground">Password</Label>
                      <p className="font-medium font-mono">{newPassword}</p>
                    </div>
                    <div>
                      <Label className="text-sm text-muted-foreground">Login Link</Label>
                      <div className="bg-slate-900 p-3 rounded-lg font-mono text-xs break-all text-left mt-1">
                        {generatedLink}
                      </div>
                    </div>
                  </div>
                  
                  <Button 
                    onClick={() => copyLink(generatedLink)}
                    className="w-full"
                    variant={copiedLink ? "default" : "outline"}
                  >
                    {copiedLink ? (
                      <><Check className="w-4 h-4 mr-2" /> Copied!</>
                    ) : (
                      <><Copy className="w-4 h-4 mr-2" /> Copy Link & Credentials</>
                    )}
                  </Button>

                  <p className="text-xs text-muted-foreground">
                    ⚠️ Send these credentials to the sub-admin
                  </p>
                </div>
              )}
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* Tabs for Sub-Admins, Device Management, Owner Access */}
      <Tabs defaultValue="sub-admins" className="space-y-4">
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="sub-admins" className="flex items-center gap-2">
            <Users className="w-4 h-4" />
            Sub-Admins
          </TabsTrigger>
          <TabsTrigger value="devices" className="flex items-center gap-2 relative">
            <Smartphone className="w-4 h-4" />
            Device Approval
            {pendingDeviceCount > 0 && (
              <Badge className="absolute -top-1 -right-1 bg-red-500 text-white text-[10px] h-5 min-w-[20px] flex items-center justify-center">
                {pendingDeviceCount}
              </Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="owner-access" className="flex items-center gap-2">
            <Crown className="w-4 h-4" />
            Owner Access
          </TabsTrigger>
          <TabsTrigger value="vault-pin" className="flex items-center gap-2">
            <Lock className="w-4 h-4" />
            Vault PIN
          </TabsTrigger>
        </TabsList>

        {/* Sub-Admins Tab */}
        <TabsContent value="sub-admins" className="space-y-4">
          {/* Stats */}
          <div className="grid grid-cols-3 gap-4">
            <Card className="bg-gradient-to-br from-amber-500/10 to-amber-600/5 border-amber-500/20">
              <CardContent className="p-4 text-center">
                <Crown className="w-8 h-8 mx-auto mb-2 text-amber-400" />
                <p className="text-2xl font-bold">{admins.filter(a => a.role === 'owner').length}</p>
                <p className="text-xs text-muted-foreground">Owner</p>
              </CardContent>
            </Card>
            <Card className="bg-gradient-to-br from-green-500/10 to-green-600/5 border-green-500/20">
              <CardContent className="p-4 text-center">
                <ShieldCheck className="w-8 h-8 mx-auto mb-2 text-green-400" />
                <p className="text-2xl font-bold">{admins.filter(a => a.role === 'sub_admin' && a.is_active).length}</p>
                <p className="text-xs text-muted-foreground">Active Sub-Admin</p>
              </CardContent>
            </Card>
            <Card className="bg-gradient-to-br from-red-500/10 to-red-600/5 border-red-500/20">
              <CardContent className="p-4 text-center">
                <Ban className="w-8 h-8 mx-auto mb-2 text-red-400" />
                <p className="text-2xl font-bold">{admins.filter(a => a.role === 'sub_admin' && !a.is_active).length}</p>
                <p className="text-xs text-muted-foreground">Blocked</p>
              </CardContent>
            </Card>
          </div>

          {/* Admin List */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="flex items-center gap-2">
                <Users className="w-5 h-5" />
                Admin List
              </CardTitle>
              <Button variant="outline" size="sm" onClick={fetchAdmins}>
                <RefreshCw className="w-4 h-4 mr-2" />
                Refresh
              </Button>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Admin</TableHead>
                    <TableHead>Role</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Login Link</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {admins.map((admin) => (
                    <TableRow key={admin.id} className={!admin.is_active ? "opacity-50" : ""}>
                      <TableCell>
                        <div>
                          <p className="font-medium">{admin.display_name || 'No Name'}</p>
                          <p className="text-sm text-muted-foreground">{admin.email}</p>
                        </div>
                      </TableCell>
                      <TableCell>
                        {admin.role === 'owner' ? (
                          <Badge className="bg-amber-500/20 text-amber-400 border-amber-500/30">
                            <Crown className="w-3 h-3 mr-1" />
                            Owner
                          </Badge>
                        ) : (
                          <Badge className="bg-blue-500/20 text-blue-400 border-blue-500/30">
                            <ShieldCheck className="w-3 h-3 mr-1" />
                            Sub-Admin
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell>
                        {admin.is_active ? (
                          <Badge className="bg-green-500/20 text-green-400 border-green-500/30">
                            <CheckCircle className="w-3 h-3 mr-1" />
                            Active
                          </Badge>
                        ) : (
                          <Badge variant="destructive">
                            <Ban className="w-3 h-3 mr-1" />
                            Blocked
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell>
                        {admin.role !== 'owner' && (
                          <Button 
                            variant="ghost" 
                            size="sm"
                            onClick={() => copyLink(getLoginLink(admin.email))}
                          >
                            <LinkIcon className="w-4 h-4 mr-1" />
                            Copy
                          </Button>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        {admin.role !== 'owner' && (
                          <div className="flex items-center justify-end gap-2">
                            {/* Permission Settings */}
                            <Button 
                              variant="outline" 
                              size="sm"
                              onClick={() => openPermissionDialog(admin)}
                              title="Permissions"
                            >
                              <Settings className="w-4 h-4" />
                            </Button>
                            
                            {/* Change Password */}
                            <Button 
                              variant="outline" 
                              size="sm"
                              onClick={() => openPasswordDialog(admin)}
                              title="Change Password"
                            >
                              <Key className="w-4 h-4" />
                            </Button>
                            
                            {/* Block/Unblock Toggle */}
                            <Button 
                              variant={admin.is_active ? "outline" : "default"}
                              size="sm"
                              onClick={() => handleToggleBlock(admin)}
                              className={admin.is_active ? "" : "bg-green-600 hover:bg-green-700"}
                              title={admin.is_active ? "Block" : "Unblock"}
                            >
                              {admin.is_active ? <Ban className="w-4 h-4" /> : <CheckCircle className="w-4 h-4" />}
                            </Button>
                            
                            {/* Delete */}
                            <Button 
                              variant="ghost" 
                              size="sm"
                              className="text-red-500 hover:text-red-600 hover:bg-red-500/10"
                              onClick={() => handleDeleteAdmin(admin)}
                              title="Delete"
                            >
                              <Trash2 className="w-4 h-4" />
                            </Button>
                          </div>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                  {admins.length === 0 && !loading && (
                    <TableRow>
                      <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
                        No admins found
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Device Approval Tab */}
        <TabsContent value="devices">
          <DeviceApprovalSection />
        </TabsContent>

        {/* Owner Access Tab */}
        <TabsContent value="owner-access">
          <OwnerAccessLinkGenerator />
        </TabsContent>

        {/* Vault PIN Tab */}
        <TabsContent value="vault-pin">
          <VaultPinManager />
        </TabsContent>
      </Tabs>

      {/* Permission Edit Dialog */}
      <Dialog open={permissionOpen} onOpenChange={setPermissionOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Settings className="w-5 h-5" />
              Edit Permissions - {selectedAdmin?.display_name || selectedAdmin?.email}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-3">
            {Object.entries(sectionsByHub).map(([hubKey, hubSections]) => (
              <Collapsible key={hubKey} className="border rounded-lg">
                <CollapsibleTrigger className="w-full p-3 flex items-center justify-between hover:bg-accent/50">
                  <div className="flex items-center gap-2">
                    <div className={`w-3 h-3 rounded-full ${HUB_NAMES[hubKey]?.color || 'bg-gray-500'}`} />
                    <span className="font-medium">{HUB_NAMES[hubKey]?.name || hubKey}</span>
                    <Badge variant="outline" className="text-xs">
                      {selectedSections.filter(s => hubSections.some(hs => hs.id === s.section_id)).length}/{hubSections.length}
                    </Badge>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button 
                      variant="ghost" 
                      size="sm"
                      onClick={(e) => { e.stopPropagation(); selectAllInHub(hubKey); }}
                    >
                      All
                    </Button>
                    <Button 
                      variant="ghost" 
                      size="sm"
                      onClick={(e) => { e.stopPropagation(); deselectAllInHub(hubKey); }}
                    >
                      Clear
                    </Button>
                  </div>
                </CollapsibleTrigger>
                <CollapsibleContent className="p-3 pt-0 border-t">
                  <div className="space-y-2">
                    {hubSections.map((section) => {
                      const perm = selectedSections.find(s => s.section_id === section.id);
                      return (
                        <div key={section.id} className="flex items-center justify-between p-2 rounded hover:bg-accent/30">
                          <div className="flex items-center gap-2">
                            <Checkbox 
                              checked={!!perm?.can_view}
                              onCheckedChange={() => toggleSectionPermission(section.id, 'can_view')}
                            />
                            <span className="text-sm">{section.section_name}</span>
                          </div>
                          {perm?.can_view && (
                            <div className="flex items-center gap-3">
                              <label className="flex items-center gap-1 text-xs">
                                <Checkbox 
                                  checked={perm?.can_edit}
                                  onCheckedChange={() => toggleSectionPermission(section.id, 'can_edit')}
                                />
                                Edit
                              </label>
                              <label className="flex items-center gap-1 text-xs">
                                <Checkbox 
                                  checked={perm?.can_delete}
                                  onCheckedChange={() => toggleSectionPermission(section.id, 'can_delete')}
                                />
                                Delete
                              </label>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </CollapsibleContent>
              </Collapsible>
            ))}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setPermissionOpen(false)}>Cancel</Button>
            <Button onClick={handleSavePermissions}>
              <Check className="w-4 h-4 mr-2" />
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Password Change Dialog */}
      <Dialog open={passwordOpen} onOpenChange={setPasswordOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Key className="w-5 h-5" />
              Change Password - {selectedAdmin?.display_name || selectedAdmin?.email}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <div>
              <Label>New Password</Label>
              <div className="relative">
                <Input 
                  value={changePassword}
                  onChange={(e) => setChangePassword(e.target.value)}
                  placeholder="Minimum 6 characters"
                  type={showChangePassword ? "text" : "password"}
                  className="pr-10"
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="absolute right-0 top-0 h-full px-3"
                  onClick={() => setShowChangePassword(!showChangePassword)}
                >
                  {showChangePassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </Button>
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setPasswordOpen(false)}>Cancel</Button>
            <Button onClick={handleChangePassword} disabled={!changePassword || changePassword.length < 6}>
              <Key className="w-4 h-4 mr-2" />
              Change Password
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default AdminSubAdmins;
