import { useState, useEffect, useCallback } from "react";
import useAdminRealtime from "@/hooks/useAdminRealtime";
import { adminSupabase as supabase } from "@/integrations/supabase/adminClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Plus, Edit, Trash2, Upload, RefreshCw, Play, Eye, Volume2, Sparkles, Image } from "lucide-react";
import UniversalAnimationPlayer from "@/components/common/UniversalAnimationPlayer";
import { useR2Upload } from "@/hooks/useR2Upload";
import { recordAdminError } from "@/utils/adminErrorLog";

interface EntryBarItem {
  id: string;
  level: number;
  name: string;
  animation_url: string | null;
  preview_url: string | null;
  sound_url: string | null;
  duration_ms: number;
  is_active: boolean;
  created_at: string;
}

const AdminEntryBars = () => {
  const [entryBars, setEntryBars] = useState<EntryBarItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [editingItem, setEditingItem] = useState<EntryBarItem | null>(null);
  const { uploadFile: r2UploadFile, uploading: r2Uploading, progress: r2Progress } = useR2Upload();

  // Form states
  const [formData, setFormData] = useState({
    level: 1,
    name: '',
    animation_url: '',
    preview_url: '',
    sound_url: '',
    duration_ms: 3500,
    is_active: true
  });

  // File upload states
  const [uploadingAnimation, setUploadingAnimation] = useState(false);
  const [uploadingPreview, setUploadingPreview] = useState(false);
  const [uploadingSound, setUploadingSound] = useState(false);

  const fetchEntryBars = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('level_privileges')
        .select('*')
        .eq('privilege_type', 'entry_bar')
        .order('unlock_level', { ascending: true });

      if (error) throw error;

      const mapped: EntryBarItem[] = (data || []).map(item => ({
        id: item.id,
        level: item.unlock_level,
        name: item.name,
        animation_url: item.animation_url,
        preview_url: item.preview_url,
        sound_url: null, // Not in current schema
        duration_ms: 3500, // Default value
        is_active: item.is_active,
        created_at: item.created_at
      }));

      setEntryBars(mapped);
    } catch (error) {
      recordAdminError({ kind: "rpc", label: "AdminEntryBars.ErrorFetchingEntryBars", message: error instanceof Error ? error.message : "Error fetching entry bars" });
      toast.error('Failed to load Entry Bars');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchEntryBars();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useAdminRealtime(['level_privileges'], () => fetchEntryBars());

  const uploadFile = async (file: File, folder: string): Promise<string | null> => {
    try {
      const result = await r2UploadFile(file, {
        bucket: 'animations',
        folder: folder,
      });
      if (result.success && result.url) {
        return result.url;
      }
      return null;
    } catch (error) {
      recordAdminError({ kind: "rpc", label: "AdminEntryBars.UploadError", message: error instanceof Error ? error.message : "Upload error" });
      toast.error('File upload failed');
      return null;
    }
  };

  const handleAnimationUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploadingAnimation(true);
    const url = await uploadFile(file, 'entry-bars');
    if (url) {
      setFormData(prev => ({ ...prev, animation_url: url }));
      toast.success('Animation uploaded successfully');
    }
    setUploadingAnimation(false);
  };

  const handlePreviewUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploadingPreview(true);
    const url = await uploadFile(file, 'entry-bar-previews');
    if (url) {
      setFormData(prev => ({ ...prev, preview_url: url }));
      toast.success('Preview uploaded successfully');
    }
    setUploadingPreview(false);
  };

  const handleSoundUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploadingSound(true);
    const url = await uploadFile(file, 'entry-bar-sounds');
    if (url) {
      setFormData(prev => ({ ...prev, sound_url: url }));
      toast.success('Sound uploaded successfully');
    }
    setUploadingSound(false);
  };

  const openAddDialog = () => {
    setEditingItem(null);
    setFormData({
      level: 1,
      name: '',
      animation_url: '',
      preview_url: '',
      sound_url: '',
      duration_ms: 3500,
      is_active: true
    });
    setDialogOpen(true);
  };

  const openEditDialog = (item: EntryBarItem) => {
    setEditingItem(item);
    setFormData({
      level: item.level,
      name: item.name,
      animation_url: item.animation_url || '',
      preview_url: item.preview_url || '',
      sound_url: item.sound_url || '',
      duration_ms: item.duration_ms,
      is_active: item.is_active
    });
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!formData.name.trim()) {
      toast.error('Enter name');
      return;
    }

    setSaving(true);
    try {
      // Note: level_privileges table only has these columns
      const payload = {
        privilege_type: 'entry_bar',
        unlock_level: formData.level,
        name: formData.name,
        privilege_name: formData.name,
        description: `Entry Bar for Level ${formData.level}+`,
        animation_url: formData.animation_url || null,
        preview_url: formData.preview_url || null,
        sound_url: formData.sound_url || null,
        duration_ms: formData.duration_ms,
        is_active: formData.is_active,
        display_order: formData.level,
        level: formData.level,
      };

      if (editingItem) {
        const { error } = await supabase
          .from('level_privileges')
          .update(payload)
          .eq('id', editingItem.id);

        if (error) throw error;
        toast.success('Entry Bar updated');
      } else {
        const { error } = await supabase
          .from('level_privileges')
          .insert({
            ...payload,
            created_at: new Date().toISOString()
          });

        if (error) throw error;
        toast.success('New Entry Bar added');
      }

      setDialogOpen(false);
      fetchEntryBars();
    } catch (error: any) {
      recordAdminError({ kind: "rpc", label: "AdminEntryBars.SaveError", message: error instanceof Error ? error.message : "Save error" });
      toast.error('Failed to save: ' + (error?.message || 'Unknown error'));
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to delete this Entry Bar?')) return;

    try {
      const { error } = await supabase
        .from('level_privileges')
        .delete()
        .eq('id', id);

      if (error) throw error;
      toast.success('Entry Bar deleted');
      fetchEntryBars();
    } catch (error) {
      recordAdminError({ kind: "rpc", label: "AdminEntryBars.DeleteError", message: error instanceof Error ? error.message : "Delete error" });
      toast.error('Failed to delete');
    }
  };

  const toggleActive = async (id: string, currentState: boolean) => {
    try {
      const { error } = await supabase
        .from('level_privileges')
        .update({ is_active: !currentState })
        .eq('id', id);

      if (error) throw error;
      toast.success(currentState ? 'Deactivated' : 'Activated');
      fetchEntryBars();
    } catch (error) {
      recordAdminError({ kind: "rpc", label: "AdminEntryBars.ToggleError", message: error instanceof Error ? error.message : "Toggle error" });
      toast.error('Failed to update status');
    }
  };

  const openPreview = (url: string) => {
    setPreviewUrl(url);
    setPreviewOpen(true);
  };

  const getLevelGradient = (level: number) => {
    if (level >= 50) return 'from-amber-500 to-yellow-400';
    if (level >= 40) return 'from-purple-500 to-pink-500';
    if (level >= 30) return 'from-cyan-500 to-blue-500';
    if (level >= 20) return 'from-green-500 to-emerald-500';
    if (level >= 10) return 'from-violet-500 to-purple-500';
    return 'from-pink-500 to-rose-500';
  };

  return (
    <div className="space-y-6 p-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Entry Bar Animations</h1>
          <p className="text-muted-foreground">Manage Entry Bar animations by level</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={fetchEntryBars} disabled={loading}>
            <RefreshCw className={`w-4 h-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
          <Button onClick={openAddDialog} className="bg-gradient-to-r from-pink-500 to-purple-500">
            <Plus className="w-4 h-4 mr-2" />
            New Entry Bar
          </Button>
        </div>
      </div>

      {/* Info Card */}
      <Card className="bg-gradient-to-r from-blue-900/30 to-purple-900/30 border-blue-500/30">
        <CardContent className="p-4">
          <div className="flex items-start gap-3">
            <div className="p-2 rounded-lg bg-blue-500/20">
              <Play className="w-5 h-5 text-blue-400" />
            </div>
            <div>
              <h3 className="font-semibold text-white">How Entry Bars Work?</h3>
              <p className="text-sm text-muted-foreground mt-1">
                When a user enters a Live or Party Room, Entry Bars are displayed based on their level.
                Higher level users get custom SVGA/Lottie animations.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Entry Bars Grid */}
      {loading ? (
        <div className="flex items-center justify-center py-20">
          <RefreshCw className="w-8 h-8 animate-spin text-purple-500" />
        </div>
      ) : entryBars.length === 0 ? (
        <Card className="bg-card/50">
          <CardContent className="flex flex-col items-center justify-center py-16">
            <div className="w-16 h-16 rounded-full bg-purple-500/10 flex items-center justify-center mb-4">
              <Play className="w-8 h-8 text-purple-500" />
            </div>
            <h3 className="text-lg font-semibold text-white">No Entry Bars Found</h3>
            <p className="text-muted-foreground text-sm mt-1">Click the button above to add a new Entry Bar</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {entryBars.map((item) => (
            <Card key={item.id} className={`relative overflow-hidden bg-card/80 backdrop-blur-sm hover:shadow-xl transition-all duration-300 ${!item.is_active ? 'opacity-60' : ''}`}>
              {/* Status Badge */}
              {!item.is_active && (
                <div className="absolute top-0 left-0 right-0 z-10 bg-red-500/90 text-white text-xs font-medium text-center py-1">
                  Inactive
                </div>
              )}

              <CardContent className="space-y-4">
                {/* YouTube-Style Thumbnail Preview */}
                <div className="relative aspect-video bg-gradient-to-br from-slate-900 via-purple-900/50 to-slate-900 rounded-xl overflow-hidden group shadow-lg">
                  {/* Thumbnail Image (Primary Display) */}
                  {item.preview_url ? (
                    <img 
                      src={item.preview_url} 
                      alt={item.name} 
                      className="w-full h-full object-cover"
                    />
                  ) : item.animation_url ? (
                    <div className="w-full h-full">
                      <UniversalAnimationPlayer
                        src={item.animation_url}
                        className="w-full h-full object-cover"
                        loop
                        autoPlay
                      />
                    </div>
                  ) : (
                    <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-amber-500/20 to-orange-500/20">
                      <Play className="w-12 h-12 text-amber-400/50" />
                    </div>
                  )}
                  
                  {/* Overlay Gradient */}
                  <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent pointer-events-none" />
                  
                  {/* Play Button Overlay */}
                  {item.animation_url && (
                    <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity bg-black/40">
                      <div className="w-14 h-14 rounded-full bg-white/20 backdrop-blur-sm flex items-center justify-center border border-white/30">
                        <Play className="w-6 h-6 text-white fill-white" />
                      </div>
                    </div>
                  )}
                  
                  {/* Level Badge */}
                  <div className={`absolute top-2 right-2 px-2 py-1 text-xs font-bold text-white rounded-lg bg-gradient-to-r ${getLevelGradient(item.level)} shadow-lg`}>
                    Lv{item.level}+
                  </div>
                  
                  {/* Animation Indicator */}
                  {item.animation_url && (
                    <div className="absolute top-2 left-2 px-2 py-1 text-[10px] font-medium text-white bg-purple-500/80 rounded-full backdrop-blur-sm flex items-center gap-1">
                      <Sparkles className="w-3 h-3" />
                      SVGA
                    </div>
                  )}
                  
                  {/* Bottom Info Bar */}
                  <div className="absolute bottom-0 left-0 right-0 p-3">
                    <p className="text-white font-semibold text-sm truncate">{item.name}</p>
                    <div className="flex items-center gap-2 mt-1">
                      <span className="text-xs text-white/70">{item.duration_ms / 1000}s</span>
                      {item.sound_url && (
                        <span className="flex items-center gap-1 text-xs text-green-400">
                          <Volume2 className="w-3 h-3" /> Sound
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                {/* Actions */}
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    className="flex-1"
                    onClick={() => openEditDialog(item)}
                  >
                    <Edit className="w-4 h-4 mr-1" />
                    Edit
                  </Button>
                  {item.animation_url && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => openPreview(item.animation_url!)}
                    >
                      <Eye className="w-4 h-4" />
                    </Button>
                  )}
                  <Button
                    variant="destructive"
                    size="sm"
                    onClick={() => handleDelete(item.id)}
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>

                {/* Active Toggle */}
                <div className="flex items-center justify-between pt-2 border-t border-border">
                  <span className="text-sm">Active</span>
                  <Switch
                    checked={item.is_active}
                    onCheckedChange={() => toggleActive(item.id, item.is_active)}
                  />
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Add/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {editingItem ? 'Edit Entry Bar' : 'Add New Entry Bar'}
            </DialogTitle>
          </DialogHeader>

          <ScrollArea className="max-h-[70vh]">
            <div className="space-y-4 pr-2">
              {/* Name */}
              <div className="space-y-2">
                <Label>Name *</Label>
                <Input
                  value={formData.name}
                  onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
                  placeholder="e.g. Gold Entry Bar"
                />
              </div>

              {/* Level */}
              <div className="space-y-2">
                <Label>Unlock Level</Label>
                <Input
                  type="number"
                  min={1}
                  max={100}
                  value={formData.level}
                  onChange={(e) => setFormData(prev => ({ ...prev, level: parseInt(e.target.value) || 1 }))}
                />
                <p className="text-xs text-muted-foreground">
                  Users at or above this level will receive this Entry Bar
                </p>
              </div>

              {/* Duration auto-detected from SVGA file */}

              {/* Animation Upload */}
              <div className="space-y-2">
                <Label>Animation (SVGA, Lottie JSON, GIF)</Label>
                <div className="flex gap-2">
                  <Input
                    value={formData.animation_url}
                    onChange={(e) => setFormData(prev => ({ ...prev, animation_url: e.target.value }))}
                    placeholder="URL or Upload File"
                    className="flex-1"
                  />
                  <input
                    type="file"
                    id="entry-bar-animation-upload"
                    accept="*/*"
                    className="hidden"
                    onChange={handleAnimationUpload}
                    disabled={uploadingAnimation}
                  />
                  <Button 
                    type="button" 
                    variant="outline" 
                    disabled={uploadingAnimation}
                    onClick={() => document.getElementById('entry-bar-animation-upload')?.click()}
                  >
                    {uploadingAnimation ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
                  </Button>
                  {formData.animation_url && (
                    <Button
                      type="button"
                      size="icon"
                      variant="destructive"
                      onClick={() => setFormData(prev => ({ ...prev, animation_url: '' }))}
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  )}
                </div>
                {formData.animation_url && (
                  <div className="h-20 bg-black/30 rounded-lg overflow-hidden flex items-center justify-center">
                    <UniversalAnimationPlayer
                      src={formData.animation_url}
                      className="h-full object-contain"
                      loop
                      autoPlay
                    />
                  </div>
                )}
              </div>

              {/* Thumbnail Upload - Compact Style like Animation */}
              <div className="space-y-2">
                <Label className="flex items-center gap-2 text-amber-400 text-sm">
                  <Image className="w-4 h-4" />
                  Thumbnail (Optional)
                </Label>
                <div className="flex gap-2">
                  <Input
                    value={formData.preview_url}
                    onChange={(e) => setFormData(prev => ({ ...prev, preview_url: e.target.value }))}
                    placeholder="Thumbnail URL or Upload"
                    className="flex-1"
                  />
                  <input
                    type="file"
                    id="entry-bar-preview-upload"
                    accept="image/*"
                    className="hidden"
                    onChange={handlePreviewUpload}
                    disabled={uploadingPreview}
                  />
                  <Button 
                    type="button" 
                    variant="outline" 
                    disabled={uploadingPreview}
                    onClick={() => document.getElementById('entry-bar-preview-upload')?.click()}
                  >
                    {uploadingPreview ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
                  </Button>
                  {formData.preview_url && (
                    <Button
                      type="button"
                      size="icon"
                      variant="destructive"
                      onClick={() => setFormData(prev => ({ ...prev, preview_url: '' }))}
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  )}
                </div>
                {formData.preview_url && (
                  <div className="h-16 bg-black/30 rounded-lg overflow-hidden flex items-center justify-center">
                    <img 
                      src={formData.preview_url} 
                      alt="Thumbnail"
                      className="h-full object-contain"
                    />
                  </div>
                )}
              </div>

              {/* Sound Upload */}
              <div className="space-y-2">
                <Label>Sound Effect (optional)</Label>
                <div className="flex gap-2">
                  <Input
                    value={formData.sound_url}
                    onChange={(e) => setFormData(prev => ({ ...prev, sound_url: e.target.value }))}
                    placeholder="Audio URL"
                    className="flex-1"
                  />
                  <input
                    type="file"
                    id="entry-bar-sound-upload"
                    accept="audio/*"
                    className="hidden"
                    onChange={handleSoundUpload}
                    disabled={uploadingSound}
                  />
                  <Button 
                    type="button" 
                    variant="outline" 
                    disabled={uploadingSound}
                    onClick={() => document.getElementById('entry-bar-sound-upload')?.click()}
                  >
                    {uploadingSound ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
                  </Button>
                  {formData.sound_url && (
                    <Button
                      type="button"
                      size="icon"
                      variant="destructive"
                      onClick={() => setFormData(prev => ({ ...prev, sound_url: '' }))}
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  )}
                </div>
              </div>

              {/* Active Toggle */}
              <div className="flex items-center justify-between py-2">
                <Label>Active</Label>
                <Switch
                  checked={formData.is_active}
                  onCheckedChange={(checked) => setFormData(prev => ({ ...prev, is_active: checked }))}
                />
              </div>
            </div>
          </ScrollArea>

          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving ? <RefreshCw className="w-4 h-4 animate-spin mr-2" /> : null}
              {editingItem ? 'Update' : 'Add'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Full Screen Preview Dialog */}
      <Dialog open={previewOpen} onOpenChange={setPreviewOpen}>
        <DialogContent className="max-w-4xl bg-black/90">
          <DialogHeader>
            <DialogTitle>Animation Preview</DialogTitle>
          </DialogHeader>
          <div className="flex items-center justify-center min-h-[400px]">
            {previewUrl && (
              <UniversalAnimationPlayer
                src={previewUrl}
                className="max-w-full max-h-[60vh] object-contain"
                loop
                autoPlay
                muted={false}
              />
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default AdminEntryBars;
