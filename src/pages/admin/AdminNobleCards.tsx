import { useState, useEffect, useCallback } from "react";
import useAdminRealtime from "@/hooks/useAdminRealtime";
import { adminSupabase as supabase } from "@/integrations/supabase/adminClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Plus, Edit, Trash2, Upload, RefreshCw, Eye, CreditCard } from "lucide-react";
import UniversalAnimationPlayer from "@/components/common/UniversalAnimationPlayer";
import { recordAdminError } from "@/utils/adminErrorLog";

import { formatAdminError } from "@/utils/formatAdminError";
interface NobleCardItem {
  id: string;
  level: number;
  name: string;
  animation_url: string | null;
  preview_url: string | null;
  is_active: boolean;
  created_at: string;
}

const AdminNobleCards = () => {
  const [items, setItems] = useState<NobleCardItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [editingItem, setEditingItem] = useState<NobleCardItem | null>(null);

  const [formData, setFormData] = useState({
    level: 1,
    name: '',
    animation_url: '',
    preview_url: '',
    is_active: true
  });

  const [uploadingAnimation, setUploadingAnimation] = useState(false);
  const [uploadingPreview, setUploadingPreview] = useState(false);

  const fetchItems = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('level_privileges')
        .select('*')
        .eq('privilege_type', 'noble_card')
        .order('unlock_level', { ascending: true });

      if (error) throw error;

      const mapped: NobleCardItem[] = (data || []).map(item => ({
        id: item.id,
        level: item.unlock_level,
        name: item.name,
        animation_url: item.animation_url,
        preview_url: item.preview_url,
        is_active: item.is_active,
        created_at: item.created_at
      }));

      setItems(mapped);
    } catch (error) {
      console.error('Error fetching noble cards:', error);
      recordAdminError({ kind: "rpc", label: "AdminNobleCards.mapped", message: formatAdminError(error) });
      toast.error('Failed to load Noble Cards');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchItems();
  }, [fetchItems]);

  useAdminRealtime(['level_privileges'], () => fetchItems());

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

  const uploadFile = async (file: File, folder: string): Promise<string | null> => {
    try {
      const fileExt = file.name.split('.').pop();
      const fileSizeMB = (file.size / (1024 * 1024)).toFixed(2);
      
      if (file.size > 50 * 1024 * 1024) {
        toast.info(`Large file (${fileSizeMB}MB) - Uploading to R2...`);
        const url = await uploadToR2(file, folder);
        return url;
      }
      
      const fileName = `${folder}/${Date.now()}_${Math.random().toString(36).substring(7)}.${fileExt}`;

      const { error: uploadError } = await supabase.storage
        .from('noble-cards')
        .upload(fileName, file, { upsert: true });

      if (uploadError) throw uploadError;

      const { data: urlData } = supabase.storage
        .from('noble-cards')
        .getPublicUrl(fileName);

      return urlData.publicUrl;
    } catch (error) {
      console.error('Upload error:', error);
      recordAdminError({ kind: "rpc", label: "AdminNobleCards.fileName", message: formatAdminError(error) });
      toast.error('File upload failed');
      return null;
    }
  };

  const handleAnimationUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingAnimation(true);
    const url = await uploadFile(file, 'animations');
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
    const url = await uploadFile(file, 'previews');
    if (url) {
      setFormData(prev => ({ ...prev, preview_url: url }));
      toast.success('Preview uploaded successfully');
    }
    setUploadingPreview(false);
  };

  const openAddDialog = () => {
    setEditingItem(null);
    setFormData({ level: 1, name: '', animation_url: '', preview_url: '', is_active: true });
    setDialogOpen(true);
  };

  const openEditDialog = (item: NobleCardItem) => {
    setEditingItem(item);
    setFormData({
      level: item.level, name: item.name,
      animation_url: item.animation_url || '', preview_url: item.preview_url || '',
      is_active: item.is_active
    });
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!formData.name.trim()) {
      toast.error('Please enter a name');
      return;
    }
    setSaving(true);
    try {
      const payload = {
        privilege_type: 'noble_card', unlock_level: formData.level, name: formData.name,
        description: `Noble Card for Level ${formData.level}+`,
        animation_url: formData.animation_url || null, preview_url: formData.preview_url || null,
        icon_name: 'CreditCard', icon_bg_color: '#FEE2E2', icon_color: '#EF4444',
        is_active: formData.is_active, display_order: formData.level,
        updated_at: new Date().toISOString()
      };

      if (editingItem) {
        const { error } = await supabase.from('level_privileges').update(payload).eq('id', editingItem.id);
        if (error) throw error;
        toast.success('Noble Card updated');
      } else {
        const { error } = await supabase.from('level_privileges').insert({ ...payload, created_at: new Date().toISOString() });
        if (error) throw error;
        toast.success('New Noble Card added');
      }
      setDialogOpen(false);
      fetchItems();
    } catch (error: any) {
      console.error('Save error:', error);
      recordAdminError({ kind: "rpc", label: "AdminNobleCards.payload", message: formatAdminError(error) });
      toast.error('Failed to save');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this Noble Card?')) return;
    try {
      const { error } = await supabase.from('level_privileges').delete().eq('id', id);
      if (error) throw error;
      toast.success('Noble Card deleted');
      fetchItems();
    } catch (error) {
      console.error('Delete error:', error);
      recordAdminError({ kind: "rpc", label: "AdminNobleCards.handleDelete", message: formatAdminError(error) });
      toast.error('Failed to delete');
    }
  };

  const handleToggleActive = async (item: NobleCardItem) => {
    try {
      const { error } = await supabase.from('level_privileges').update({ is_active: !item.is_active }).eq('id', item.id);
      if (error) throw error;
      toast.success(item.is_active ? 'Deactivated' : 'Activated');
      fetchItems();
    } catch (error) {
      console.error('Toggle error:', error);
      recordAdminError({ kind: "rpc", label: "AdminNobleCards.handleToggleActive", message: formatAdminError(error) });
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">🎴 Noble / Seat Cards</h1>
          <p className="text-muted-foreground">Animated cards displayed on party room seats</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={fetchItems} disabled={loading}>
            <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
          <Button onClick={openAddDialog}>
            <Plus className="h-4 w-4 mr-2" />
            New Noble Card
          </Button>
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-12">
          <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
        </div>
      ) : items.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <CreditCard className="h-12 w-12 text-muted-foreground mb-4" />
            <p className="text-muted-foreground">No Noble Cards found</p>
            <Button className="mt-4" onClick={openAddDialog}>
              <Plus className="h-4 w-4 mr-2" />
              Add First Noble Card
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {items.map((item) => (
            <Card key={item.id} className={!item.is_active ? 'opacity-50' : ''}>
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-lg">{item.name}</CardTitle>
                  <Switch checked={item.is_active} onCheckedChange={() => handleToggleActive(item)} />
                </div>
                <p className="text-sm text-muted-foreground">Level {item.level}+</p>
              </CardHeader>
              <CardContent>
                <div className="aspect-[3/1] bg-gradient-to-r from-rose-500/20 to-pink-500/20 rounded-lg mb-4 flex items-center justify-center overflow-hidden">
                  {item.animation_url ? (
                    <UniversalAnimationPlayer src={item.animation_url} className="w-full h-full" loop autoPlay />
                  ) : item.preview_url ? (
                    <img src={item.preview_url} alt={item.name} className="w-full h-full object-contain" />
                  ) : (
                    <CreditCard className="h-12 w-12 text-rose-500" />
                  )}
                </div>
                <div className="flex gap-2">
                  {item.animation_url && (
                    <Button variant="outline" size="sm" onClick={() => { setPreviewUrl(item.animation_url); setPreviewOpen(true); }}>
                      <Eye className="h-4 w-4 mr-1" /> Preview
                    </Button>
                  )}
                  <Button variant="outline" size="sm" onClick={() => openEditDialog(item)}>
                    <Edit className="h-4 w-4 mr-1" /> Edit
                  </Button>
                  <Button variant="destructive" size="sm" onClick={() => handleDelete(item.id)}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editingItem ? 'Edit Noble Card' : 'Add New Noble Card'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Name</Label>
                <Input value={formData.name} onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))} placeholder="Noble Card 5-4" />
              </div>
              <div>
                <Label>Unlock Level</Label>
                <Input type="number" min={1} value={formData.level} onChange={(e) => setFormData(prev => ({ ...prev, level: parseInt(e.target.value) || 1 }))} />
              </div>
            </div>
            <div>
              <Label>Animation (SVGA/MP4/JSON)</Label>
              <div className="flex gap-2">
                <Input value={formData.animation_url} onChange={(e) => setFormData(prev => ({ ...prev, animation_url: e.target.value }))} placeholder="URL or upload" />
                <label className="cursor-pointer">
                  <input type="file" accept=".svga,.mp4,.webm,.json,.gif" onChange={handleAnimationUpload} className="hidden" />
                  <Button type="button" variant="outline" disabled={uploadingAnimation}>
                    <Upload className={`h-4 w-4 ${uploadingAnimation ? 'animate-spin' : ''}`} />
                  </Button>
                </label>
              </div>
            </div>
            <div>
              <Label>Preview Image (PNG/JPG)</Label>
              <div className="flex gap-2">
                <Input value={formData.preview_url} onChange={(e) => setFormData(prev => ({ ...prev, preview_url: e.target.value }))} placeholder="URL or upload" />
                <label className="cursor-pointer">
                  <input type="file" accept="image/*" onChange={handlePreviewUpload} className="hidden" />
                  <Button type="button" variant="outline" disabled={uploadingPreview}>
                    <Upload className={`h-4 w-4 ${uploadingPreview ? 'animate-spin' : ''}`} />
                  </Button>
                </label>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Switch checked={formData.is_active} onCheckedChange={(checked) => setFormData(prev => ({ ...prev, is_active: checked }))} />
              <Label>Active</Label>
            </div>
            {formData.animation_url && (
              <div className="aspect-[3/1] bg-muted rounded-lg overflow-hidden">
                <UniversalAnimationPlayer src={formData.animation_url} className="w-full h-full" loop autoPlay />
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleSave} disabled={saving}>{saving ? 'Saving...' : 'Save'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={previewOpen} onOpenChange={setPreviewOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader><DialogTitle>Animation Preview</DialogTitle></DialogHeader>
          {previewUrl && (
            <div className="aspect-[3/1] bg-black rounded-lg overflow-hidden">
              <UniversalAnimationPlayer src={previewUrl} className="w-full h-full" loop autoPlay />
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default AdminNobleCards;