import { useState, useEffect } from "react";
import useAdminRealtime from "@/hooks/useAdminRealtime";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { 
  Crown, Plus, Edit2, Trash2, Upload, Save, Search, 
  RefreshCw, UserCog, Building2, Briefcase, Shield,
  User, CheckCircle, X, Image
} from "lucide-react";
import UniversalAnimationPlayer from "@/components/common/UniversalAnimationPlayer";

interface RoleFrame {
  id: string;
  role_type: string;
  frame_name: string;
  frame_url: string;
  animation_type: string;
  description: string | null;
  is_active: boolean;
  is_default: boolean;
  display_order: number;
}

interface UserResult {
  id: string;
  display_name: string | null;
  app_uid: string | null;
  avatar_url: string | null;
  is_host: boolean;
}

interface AssignedFrame {
  id: string;
  user_id: string;
  frame_id: string;
  role_type: string;
  is_equipped: boolean;
  assigned_at: string;
  notes: string | null;
  frame?: RoleFrame;
  user?: UserResult;
}

const ROLE_TYPES = [
  { value: 'admin', label: 'Admin', icon: Shield, color: 'from-red-500 to-pink-500' },
  { value: 'agency_owner', label: 'Agency Owner', icon: Building2, color: 'from-purple-500 to-indigo-500' },
  { value: 'helper', label: 'Helper/Payroll', icon: Briefcase, color: 'from-green-500 to-emerald-500' },
  { value: 'moderator', label: 'Moderator', icon: UserCog, color: 'from-blue-500 to-cyan-500' },
  { value: 'vip', label: 'VIP', icon: Crown, color: 'from-amber-500 to-yellow-500' },
];

const defaultFrame: Partial<RoleFrame> = {
  role_type: 'admin',
  frame_name: '',
  frame_url: '',
  animation_type: 'svga',
  description: '',
  is_active: true,
  is_default: false,
  display_order: 0,
};

const AdminRoleFrames = () => {
  const { toast } = useToast();
  const [frames, setFrames] = useState<RoleFrame[]>([]);
  const [assignedFrames, setAssignedFrames] = useState<AssignedFrame[]>([]);
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState('frames');
  const [selectedRole, setSelectedRole] = useState<string>('all');
  
  // Frame dialog
  const [frameDialogOpen, setFrameDialogOpen] = useState(false);
  const [editingFrame, setEditingFrame] = useState<RoleFrame | null>(null);
  const [frameForm, setFrameForm] = useState<Partial<RoleFrame>>(defaultFrame);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);

  // Assign dialog
  const [assignDialogOpen, setAssignDialogOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<UserResult[]>([]);
  const [selectedUser, setSelectedUser] = useState<UserResult | null>(null);
  const [selectedFrameForAssign, setSelectedFrameForAssign] = useState<string>('');
  const [assignRoleType, setAssignRoleType] = useState<string>('admin');
  const [searching, setSearching] = useState(false);

  useAdminRealtime(['role_frames'], () => fetchData());

  const fetchData = async () => {
    setLoading(true);
    
    // Fetch role frames
    const { data: framesData, error: framesError } = await supabase
      .from('role_frames')
      .select('*')
      .order('role_type')
      .order('display_order');
    
    if (framesError) {
      toast({ title: "Error", description: framesError.message, variant: "destructive" });
    } else {
      setFrames(framesData || []);
    }

    // Fetch assignments with user info
    const { data: assignData, error: assignError } = await supabase
      .from('user_role_frames')
      .select(`
        *,
        frame:role_frames(*),
        user:profiles(id, display_name, app_uid, avatar_url, is_host)
      `)
      .order('assigned_at', { ascending: false })
      .limit(100);

    if (!assignError && assignData) {
      setAssignedFrames(assignData as any);
    }

    setLoading(false);
  };

  // R2 upload for large files
  const uploadToR2 = async (file: File, folder: string): Promise<string> => {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('folder', folder);

    const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/r2-upload`, {
      method: 'POST',
      body: formData,
    });

    const result = await response.json();
    if (!response.ok || !result.success) {
      throw new Error(result.error || 'R2 upload failed');
    }
    return result.url;
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 150 * 1024 * 1024) {
      toast({ title: "File too large", description: "Max 150MB allowed", variant: "destructive" });
      return;
    }

    setUploading(true);
    try {
      const fileExt = file.name.split('.').pop();
      const fileSizeMB = (file.size / (1024 * 1024)).toFixed(2);
      let publicUrl: string;
      
      // Use R2 for files > 50MB
      if (file.size > 50 * 1024 * 1024) {
        toast({ title: "Large File", description: `${fileSizeMB}MB - uploading to R2...` });
        publicUrl = await uploadToR2(file, 'role-frames');
      } else {
        const fileName = `role-frame-${Date.now()}.${fileExt}`;
        
        const { error: uploadError } = await supabase.storage
          .from('animations')
          .upload(fileName, file, { upsert: true });

        if (uploadError) throw uploadError;

        const { data: { publicUrl: url } } = supabase.storage
          .from('animations')
          .getPublicUrl(fileName);
        
        publicUrl = url;
      }

      // Detect animation type
      let animType = 'svga';
      if (fileExt === 'json') animType = 'lottie';
      else if (fileExt === 'gif') animType = 'gif';
      else if (fileExt === 'mp4' || fileExt === 'webm') animType = 'video';

      setFrameForm(prev => ({ 
        ...prev, 
        frame_url: publicUrl,
        animation_type: animType 
      }));
      toast({ title: "Uploaded!", description: "Frame animation uploaded" });
    } catch (error: any) {
      toast({ title: "Upload Failed", description: error.message, variant: "destructive" });
    } finally {
      setUploading(false);
    }
  };

  const handleSaveFrame = async () => {
    if (!frameForm.frame_name || !frameForm.frame_url) {
      toast({ title: "Required", description: "Name and frame file are required", variant: "destructive" });
      return;
    }

    setSaving(true);
    try {
      if (editingFrame) {
        const { error } = await supabase
          .from('role_frames')
          .update(frameForm as any)
          .eq('id', editingFrame.id);
        if (error) throw error;
        toast({ title: "Updated!", description: `${frameForm.frame_name} saved` });
      } else {
        const { error } = await supabase
          .from('role_frames')
          .insert([frameForm as any]);
        if (error) throw error;
        toast({ title: "Created!", description: `${frameForm.frame_name} added` });
      }
      setFrameDialogOpen(false);
      setEditingFrame(null);
      setFrameForm(defaultFrame);
      fetchData();
    } catch (error: any) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteFrame = async (frame: RoleFrame) => {
    if (!confirm(`Delete ${frame.frame_name}?`)) return;
    
    const { error } = await supabase
      .from('role_frames')
      .delete()
      .eq('id', frame.id);
    
    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Deleted", description: `${frame.frame_name} removed` });
      fetchData();
    }
  };

  const searchUsers = async () => {
    if (!searchQuery.trim()) return;
    
    setSearching(true);
    try {
      // First try exact UID match
      let { data, error } = await supabase
        .from('profiles')
        .select('id, display_name, app_uid, avatar_url, is_host')
        .eq('app_uid', searchQuery.trim())
        .limit(1);

      if (!error && data && data.length > 0) {
        setSearchResults(data);
        setSearching(false);
        return;
      }

      // Fallback to partial search
      const { data: searchData, error: searchError } = await supabase
        .from('profiles')
        .select('id, display_name, app_uid, avatar_url, is_host')
        .or(`display_name.ilike.%${searchQuery}%,app_uid.ilike.%${searchQuery}%`)
        .limit(10);

      if (searchError) throw searchError;
      setSearchResults(searchData || []);
    } catch (error: any) {
      toast({ title: "Search Error", description: error.message, variant: "destructive" });
    } finally {
      setSearching(false);
    }
  };

  const handleAssignFrame = async () => {
    if (!selectedUser || !selectedFrameForAssign) {
      toast({ title: "Required", description: "Select user and frame", variant: "destructive" });
      return;
    }

    setSaving(true);
    try {
      const { error } = await supabase
        .from('user_role_frames')
        .insert([{
          user_id: selectedUser.id,
          frame_id: selectedFrameForAssign,
          role_type: assignRoleType,
          notes: `Manually assigned`
        }]);

      if (error) throw error;
      
      toast({ title: "Assigned!", description: `Frame assigned to ${selectedUser.display_name || selectedUser.app_uid}` });
      setAssignDialogOpen(false);
      setSelectedUser(null);
      setSelectedFrameForAssign('');
      setSearchQuery('');
      setSearchResults([]);
      fetchData();
    } catch (error: any) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const handleRemoveAssignment = async (assignment: AssignedFrame) => {
    if (!confirm('Remove this frame assignment?')) return;

    const { error } = await supabase
      .from('user_role_frames')
      .delete()
      .eq('id', assignment.id);

    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Removed", description: "Assignment removed" });
      fetchData();
    }
  };

  const openEditFrame = (frame: RoleFrame) => {
    setEditingFrame(frame);
    setFrameForm(frame);
    setFrameDialogOpen(true);
  };

  const openCreateFrame = () => {
    setEditingFrame(null);
    setFrameForm({ ...defaultFrame, display_order: frames.length });
    setFrameDialogOpen(true);
  };

  const getRoleConfig = (roleType: string) => {
    return ROLE_TYPES.find(r => r.value === roleType) || ROLE_TYPES[0];
  };

  const filteredFrames = selectedRole === 'all' 
    ? frames 
    : frames.filter(f => f.role_type === selectedRole);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin w-8 h-8 border-4 border-purple-500 border-t-transparent rounded-full" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2">
            <UserCog className="w-7 h-7 text-purple-400" />
            Role-Based Frames
          </h1>
          <p className="text-slate-400 text-sm">Manage frames for Admins, Agency Owners, Helpers</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="icon" onClick={fetchData}>
            <RefreshCw className="w-4 h-4" />
          </Button>
          <Button 
            onClick={() => setAssignDialogOpen(true)}
            variant="outline"
            className="border-green-500/50 text-green-400 hover:bg-green-500/10"
          >
            <User className="w-4 h-4 mr-2" />
            Manual Assign
          </Button>
          <Button onClick={openCreateFrame} className="bg-gradient-to-r from-purple-600 to-pink-600">
            <Plus className="w-4 h-4 mr-2" />
            Add Frame
          </Button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        {ROLE_TYPES.map(role => {
          const count = frames.filter(f => f.role_type === role.value && f.is_active).length;
          return (
            <div 
              key={role.value}
              className={`bg-gradient-to-r ${role.color} p-0.5 rounded-xl cursor-pointer transition-transform hover:scale-105`}
              onClick={() => setSelectedRole(role.value)}
            >
              <div className="bg-slate-900 rounded-xl p-3 h-full">
                <role.icon className="w-6 h-6 text-white mb-1" />
                <p className="text-xl font-bold text-white">{count}</p>
                <p className="text-xs text-slate-400">{role.label}</p>
              </div>
            </div>
          );
        })}
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="bg-slate-800">
          <TabsTrigger value="frames">Frames ({frames.length})</TabsTrigger>
          <TabsTrigger value="assignments">Assignments ({assignedFrames.length})</TabsTrigger>
        </TabsList>

        {/* Frames Tab */}
        <TabsContent value="frames" className="mt-4">
          {/* Role Filter */}
          <div className="flex gap-2 mb-4 flex-wrap">
            <Button 
              size="sm" 
              variant={selectedRole === 'all' ? 'default' : 'outline'}
              onClick={() => setSelectedRole('all')}
            >
              All
            </Button>
            {ROLE_TYPES.map(role => (
              <Button 
                key={role.value}
                size="sm" 
                variant={selectedRole === role.value ? 'default' : 'outline'}
                onClick={() => setSelectedRole(role.value)}
              >
                <role.icon className="w-3 h-3 mr-1" />
                {role.label}
              </Button>
            ))}
          </div>

          {/* Frames Grid */}
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
            {filteredFrames.map((frame) => {
              const roleConfig = getRoleConfig(frame.role_type);
              return (
                <div key={frame.id} className="bg-slate-900 border border-slate-700 rounded-xl overflow-hidden">
                  <div className={`h-1.5 bg-gradient-to-r ${roleConfig.color}`} />
                  <div className="p-3">
                    {/* Frame Preview */}
                    <div className="aspect-square bg-slate-800 rounded-lg mb-3 flex items-center justify-center overflow-hidden">
                      {frame.frame_url ? (
                        <UniversalAnimationPlayer
                          src={frame.frame_url}
                          className="w-full h-full"
                          loop
                          autoPlay
                        />
                      ) : (
                        <Image className="w-12 h-12 text-slate-600" />
                      )}
                    </div>
                    
                    <h4 className="text-white font-semibold truncate">{frame.frame_name}</h4>
                    <div className="flex items-center gap-2 mt-1">
                      <Badge variant="outline" className="text-xs">
                        {roleConfig.label}
                      </Badge>
                      {frame.is_default && (
                        <Badge className="bg-green-500/20 text-green-400 text-xs">Default</Badge>
                      )}
                    </div>
                    {frame.description && (
                      <p className="text-slate-500 text-xs mt-1 truncate">{frame.description}</p>
                    )}
                    
                    {/* Actions */}
                    <div className="flex gap-2 mt-3">
                      <Button 
                        size="sm" 
                        variant="ghost" 
                        className="flex-1"
                        onClick={() => openEditFrame(frame)}
                      >
                        <Edit2 className="w-3 h-3 mr-1" />
                        Edit
                      </Button>
                      <Button 
                        size="icon" 
                        variant="ghost" 
                        className="text-red-400 hover:bg-red-500/20"
                        onClick={() => handleDeleteFrame(frame)}
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </TabsContent>

        {/* Assignments Tab */}
        <TabsContent value="assignments" className="mt-4">
          <div className="bg-slate-900 border border-slate-700 rounded-xl overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-slate-700">
                    <th className="text-left p-3 text-slate-400 text-sm">User</th>
                    <th className="text-left p-3 text-slate-400 text-sm">Frame</th>
                    <th className="text-left p-3 text-slate-400 text-sm">Role</th>
                    <th className="text-left p-3 text-slate-400 text-sm">Assigned</th>
                    <th className="text-right p-3 text-slate-400 text-sm">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {assignedFrames.map((assignment) => {
                    const roleConfig = getRoleConfig(assignment.role_type);
                    return (
                      <tr key={assignment.id} className="border-b border-slate-800">
                        <td className="p-3">
                          <div className="flex items-center gap-2">
                            <div className="w-8 h-8 rounded-full bg-slate-700 overflow-hidden">
                              {assignment.user?.avatar_url ? (
                                <img src={assignment.user.avatar_url} className="w-full h-full object-cover" />
                              ) : (
                                <User className="w-full h-full p-1.5 text-slate-500" />
                              )}
                            </div>
                            <div>
                              <p className="text-white text-sm">{assignment.user?.display_name || 'Unknown'}</p>
                              <p className="text-slate-500 text-xs">{assignment.user?.app_uid}</p>
                            </div>
                          </div>
                        </td>
                        <td className="p-3">
                          <div className="flex items-center gap-2">
                            <div className="w-10 h-10 rounded bg-slate-800 overflow-hidden">
                              {assignment.frame?.frame_url && (
                                <UniversalAnimationPlayer
                                  src={assignment.frame.frame_url}
                                  className="w-full h-full"
                                  loop
                                  autoPlay
                                />
                              )}
                            </div>
                            <span className="text-white text-sm">{assignment.frame?.frame_name}</span>
                          </div>
                        </td>
                        <td className="p-3">
                          <Badge className={`bg-gradient-to-r ${roleConfig.color} text-white`}>
                            {roleConfig.label}
                          </Badge>
                        </td>
                        <td className="p-3 text-slate-400 text-sm">
                          {new Date(assignment.assigned_at).toLocaleDateString()}
                        </td>
                        <td className="p-3 text-right">
                          <Button 
                            size="sm" 
                            variant="ghost"
                            className="text-red-400 hover:bg-red-500/20"
                            onClick={() => handleRemoveAssignment(assignment)}
                          >
                            <X className="w-4 h-4" />
                          </Button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </TabsContent>
      </Tabs>

      {/* Create/Edit Frame Dialog */}
      <Dialog open={frameDialogOpen} onOpenChange={setFrameDialogOpen}>
        <DialogContent className="bg-slate-900 border-slate-700 max-w-lg">
          <DialogHeader>
            <DialogTitle className="text-white flex items-center gap-2">
              <Crown className="w-5 h-5 text-purple-400" />
              {editingFrame ? 'Edit Frame' : 'Add Role Frame'}
            </DialogTitle>
          </DialogHeader>
          
          <div className="space-y-4">
            {/* Role Type */}
            <div>
              <label className="text-sm text-slate-400 mb-1 block">Role Type *</label>
              <Select
                value={frameForm.role_type}
                onValueChange={(v) => setFrameForm(prev => ({ ...prev, role_type: v }))}
              >
                <SelectTrigger className="bg-slate-800 border-slate-600 text-white">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ROLE_TYPES.map(role => (
                    <SelectItem key={role.value} value={role.value}>
                      <div className="flex items-center gap-2">
                        <role.icon className="w-4 h-4" />
                        {role.label}
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Frame Name */}
            <div>
              <label className="text-sm text-slate-400 mb-1 block">Frame Name *</label>
              <Input
                value={frameForm.frame_name || ''}
                onChange={(e) => setFrameForm(prev => ({ ...prev, frame_name: e.target.value }))}
                placeholder="e.g. Admin Diamond Frame"
                className="bg-slate-800 border-slate-600 text-white"
              />
            </div>

            {/* Frame Upload */}
            <div>
              <label className="text-sm text-slate-400 mb-1 block">Frame Animation (SVGA, Lottie, GIF, MP4)</label>
              <div className="flex gap-2">
                <Input
                  value={frameForm.frame_url || ''}
                  onChange={(e) => setFrameForm(prev => ({ ...prev, frame_url: e.target.value }))}
                  placeholder="Frame URL..."
                  className="bg-slate-800 border-slate-600 text-white flex-1"
                />
                <label className="cursor-pointer">
                  <input
                    type="file"
                    accept=".svga,.json,.gif,.mp4,.webm,.png,.webp"
                    className="hidden"
                    onChange={handleFileUpload}
                    disabled={uploading}
                  />
                  <Button type="button" variant="outline" disabled={uploading} asChild>
                    <span>
                      {uploading ? (
                        <RefreshCw className="w-4 h-4 animate-spin" />
                      ) : (
                        <Upload className="w-4 h-4" />
                      )}
                    </span>
                  </Button>
                </label>
              </div>
              
              {/* Preview */}
              {frameForm.frame_url && (
                <div className="mt-2 w-24 h-24 bg-slate-800 rounded-lg overflow-hidden">
                  <UniversalAnimationPlayer
                    src={frameForm.frame_url}
                    className="w-full h-full"
                    loop
                    autoPlay
                  />
                </div>
              )}
            </div>

            {/* Description */}
            <div>
              <label className="text-sm text-slate-400 mb-1 block">Description</label>
              <Input
                value={frameForm.description || ''}
                onChange={(e) => setFrameForm(prev => ({ ...prev, description: e.target.value }))}
                placeholder="Optional description..."
                className="bg-slate-800 border-slate-600 text-white"
              />
            </div>

            {/* Toggles */}
            <div className="flex gap-6">
              <div className="flex items-center gap-2">
                <Switch
                  checked={frameForm.is_active !== false}
                  onCheckedChange={(c) => setFrameForm(prev => ({ ...prev, is_active: c }))}
                />
                <span className="text-white text-sm">Active</span>
              </div>
              <div className="flex items-center gap-2">
                <Switch
                  checked={frameForm.is_default === true}
                  onCheckedChange={(c) => setFrameForm(prev => ({ ...prev, is_default: c }))}
                />
                <span className="text-white text-sm">Auto-Assign Default</span>
              </div>
            </div>

            {/* Actions */}
            <div className="flex gap-3 pt-4">
              <Button 
                variant="outline" 
                className="flex-1"
                onClick={() => setFrameDialogOpen(false)}
              >
                Cancel
              </Button>
              <Button 
                className="flex-1 bg-gradient-to-r from-purple-600 to-pink-600"
                onClick={handleSaveFrame}
                disabled={saving}
              >
                {saving ? <RefreshCw className="w-4 h-4 animate-spin mr-2" /> : <Save className="w-4 h-4 mr-2" />}
                Save
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Manual Assign Dialog */}
      <Dialog open={assignDialogOpen} onOpenChange={setAssignDialogOpen}>
        <DialogContent className="bg-slate-900 border-slate-700 max-w-lg">
          <DialogHeader>
            <DialogTitle className="text-white flex items-center gap-2">
              <User className="w-5 h-5 text-green-400" />
              Manual Frame Assignment
            </DialogTitle>
          </DialogHeader>
          
          <div className="space-y-4">
            {/* User Search */}
            <div>
              <label className="text-sm text-slate-400 mb-1 block">Search User by UID or Name</label>
              <div className="flex gap-2">
                <Input
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Enter user UID or name..."
                  className="bg-slate-800 border-slate-600 text-white flex-1"
                  onKeyDown={(e) => e.key === 'Enter' && searchUsers()}
                />
                <Button onClick={searchUsers} disabled={searching}>
                  {searching ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
                </Button>
              </div>
            </div>

            {/* Search Results */}
            {searchResults.length > 0 && (
              <div className="max-h-40 overflow-y-auto space-y-2">
                {searchResults.map(user => (
                  <div
                    key={user.id}
                    onClick={() => setSelectedUser(user)}
                    className={`flex items-center gap-3 p-2 rounded-lg cursor-pointer transition-colors ${
                      selectedUser?.id === user.id 
                        ? 'bg-purple-500/20 border border-purple-500/50' 
                        : 'bg-slate-800 hover:bg-slate-700'
                    }`}
                  >
                    <div className="w-10 h-10 rounded-full bg-slate-700 overflow-hidden">
                      {user.avatar_url ? (
                        <img src={user.avatar_url} className="w-full h-full object-cover" />
                      ) : (
                        <User className="w-full h-full p-2 text-slate-500" />
                      )}
                    </div>
                    <div className="flex-1">
                      <p className="text-white font-medium">{user.display_name || 'Unknown'}</p>
                      <p className="text-slate-500 text-xs">UID: {user.app_uid}</p>
                    </div>
                    {selectedUser?.id === user.id && (
                      <CheckCircle className="w-5 h-5 text-purple-400" />
                    )}
                  </div>
                ))}
              </div>
            )}

            {/* Role Type */}
            <div>
              <label className="text-sm text-slate-400 mb-1 block">Role Type</label>
              <Select
                value={assignRoleType}
                onValueChange={setAssignRoleType}
              >
                <SelectTrigger className="bg-slate-800 border-slate-600 text-white">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ROLE_TYPES.map(role => (
                    <SelectItem key={role.value} value={role.value}>
                      <div className="flex items-center gap-2">
                        <role.icon className="w-4 h-4" />
                        {role.label}
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Select Frame */}
            <div>
              <label className="text-sm text-slate-400 mb-1 block">Select Frame</label>
              <Select
                value={selectedFrameForAssign}
                onValueChange={setSelectedFrameForAssign}
              >
                <SelectTrigger className="bg-slate-800 border-slate-600 text-white">
                  <SelectValue placeholder="Choose a frame..." />
                </SelectTrigger>
                <SelectContent>
                  {frames.filter(f => f.is_active).map(frame => (
                    <SelectItem key={frame.id} value={frame.id}>
                      <div className="flex items-center gap-2">
                        <Badge variant="outline" className="text-xs">
                          {getRoleConfig(frame.role_type).label}
                        </Badge>
                        {frame.frame_name}
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Actions */}
            <div className="flex gap-3 pt-4">
              <Button 
                variant="outline" 
                className="flex-1"
                onClick={() => setAssignDialogOpen(false)}
              >
                Cancel
              </Button>
              <Button 
                className="flex-1 bg-gradient-to-r from-green-500 to-emerald-500"
                onClick={handleAssignFrame}
                disabled={saving || !selectedUser || !selectedFrameForAssign}
              >
                {saving ? <RefreshCw className="w-4 h-4 animate-spin mr-2" /> : <CheckCircle className="w-4 h-4 mr-2" />}
                Assign Frame
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default AdminRoleFrames;