import { useState, useEffect, useCallback } from "react";
import useAdminRealtime from "@/hooks/useAdminRealtime";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Plus, Edit, Trash2, Upload, RefreshCw, Eye, Car } from "lucide-react";
import UniversalAnimationPlayer from "@/components/common/UniversalAnimationPlayer";
import { useR2Upload } from "@/hooks/useR2Upload";

interface VehicleEntranceItem {
  id: string;
  level: number;
  name: string;
  animation_url: string | null;
  preview_url: string | null;
  is_active: boolean;
  created_at: string;
}

const AdminVehicleEntrances = () => {
  const [items, setItems] = useState<VehicleEntranceItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [editingItem, setEditingItem] = useState<VehicleEntranceItem | null>(null);
  const { uploadFile: r2UploadFile, uploading: r2Uploading, progress: r2Progress } = useR2Upload();

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
        .from('vehicle_entrances' as any)
        .select('*')
        .order('level_required', { ascending: true });

      if (error) throw error;

      const mapped: VehicleEntranceItem[] = (data || []).map((item: any) => ({
        id: item.id,
        level: item.level_required,
        name: item.name,
        animation_url: item.animation_url,
        preview_url: item.preview_url,
        is_active: item.is_active,
        created_at: item.created_at
      }));

      setItems(mapped);
    } catch (error) {
      console.error('Error fetching vehicle entrances:', error);
      toast.error('Failed to load Vehicle Entrances');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchItems();
  }, [fetchItems]);

  useAdminRealtime(['vehicle_entrances'], () => fetchItems());

  const uploadFile = async (file: File, folder: string): Promise<string | null> => {
    try {
      const result = await r2UploadFile(file, {
        bucket: 'vehicle-entrances',
        folder: folder,
      });
      if (result.success && result.url) {
        return result.url;
      }
      return null;
    } catch (error) {
      console.error('Upload error:', error);
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
    setFormData({
      level: 20,
      name: '',
      animation_url: '',
      preview_url: '',
      is_active: true
    });
    setDialogOpen(true);
  };

  const openEditDialog = (item: VehicleEntranceItem) => {
    setEditingItem(item);
    setFormData({
      level: item.level,
      name: item.name,
      animation_url: item.animation_url || '',
      preview_url: item.preview_url || '',
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
      const payload: any = {
        name: formData.name,
        level_required: formData.level,
        image_url: formData.preview_url || formData.animation_url || '',
        animation_url: formData.animation_url || null,
        preview_url: formData.preview_url || null,
        is_active: formData.is_active,
        display_order: formData.level,
      };

      if (editingItem) {
        const { error } = await supabase
          .from('vehicle_entrances' as any)
          .update(payload)
          .eq('id', editingItem.id);

        if (error) throw error;
        toast.success('Vehicle Entrance updated');
      } else {
        const { error } = await supabase
          .from('vehicle_entrances' as any)
          .insert(payload);

        if (error) throw error;
        toast.success('New Vehicle Entrance added');
      }

      setDialogOpen(false);
      fetchItems();
    } catch (error: any) {
      console.error('Save error:', error);
      toast.error('Failed to save');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this Vehicle Entrance?')) return;

    try {
      const { error } = await supabase
        .from('vehicle_entrances' as any)
        .delete()
        .eq('id', id);

      if (error) throw error;
      toast.success('Vehicle Entrance deleted');
      fetchItems();
    } catch (error) {
      console.error('Delete error:', error);
      toast.error('Failed to delete');
    }
  };

  const handleToggleActive = async (item: VehicleEntranceItem) => {
    try {
      const { error } = await supabase
        .from('vehicle_entrances' as any)
        .update({ is_active: !item.is_active })
        .eq('id', item.id);

      if (error) throw error;
      toast.success(item.is_active ? 'Deactivated' : 'Activated');
      fetchItems();
    } catch (error) {
      console.error('Toggle error:', error);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">🚗 Vehicle Entrances</h1>
          <p className="text-muted-foreground">Vehicle/Building entrance animations for VIP rooms (Twin Towers style)</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={fetchItems} disabled={loading}>
            <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
          <Button onClick={openAddDialog}>
            <Plus className="h-4 w-4 mr-2" />
            New Vehicle Entrance
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
            <Car className="h-12 w-12 text-muted-foreground mb-4" />
            <p className="text-muted-foreground">No Vehicle Entrances found</p>
            <Button className="mt-4" onClick={openAddDialog}>
              <Plus className="h-4 w-4 mr-2" />
              Add First Vehicle Entrance
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {items.map((item) => (
            <Card key={item.id} className={!item.is_active ? 'opacity-50' : ''}>
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-lg">{item.name}</CardTitle>
                  <Switch
                    checked={item.is_active}
                    onCheckedChange={() => handleToggleActive(item)}
                  />
                </div>
                <p className="text-sm text-muted-foreground">Level {item.level}+ VIP</p>
              </CardHeader>
              <CardContent>
                <div className="aspect-video bg-gradient-to-br from-blue-500/20 to-purple-500/20 rounded-lg mb-4 flex items-center justify-center overflow-hidden">
                  {item.animation_url ? (
                    <UniversalAnimationPlayer
                      src={item.animation_url}
                      className="w-full h-full"
                      loop
                      autoPlay
                    />
                  ) : item.preview_url ? (
                    <img src={item.preview_url} alt={item.name} className="w-full h-full object-contain" />
                  ) : (
                    <Car className="h-16 w-16 text-blue-500" />
                  )}
                </div>
                <div className="flex gap-2">
                  {item.animation_url && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        setPreviewUrl(item.animation_url);
                        setPreviewOpen(true);
                      }}
                    >
                      <Eye className="h-4 w-4 mr-1" />
                      Full Screen
                    </Button>
                  )}
                  <Button variant="outline" size="sm" onClick={() => openEditDialog(item)}>
                    <Edit className="h-4 w-4 mr-1" />
                    Edit
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

      {/* Add/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="w-[95vw] max-w-md max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {editingItem ? 'Edit Vehicle Entrance' : 'Add New Vehicle Entrance'}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Name</Label>
                <Input
                  value={formData.name}
                  onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
                  placeholder="Brilliant Twin Towers"
                />
              </div>
              <div>
                <Label>Unlock Level</Label>
                <Input
                  type="number"
                  min={1}
                  value={formData.level}
                  onChange={(e) => setFormData(prev => ({ ...prev, level: parseInt(e.target.value) || 20 }))}
                />
              </div>
            </div>

            <div>
              <Label>Animation (SVGA/MP4) - Full Screen Effect</Label>
              <div className="flex gap-2">
                <Input
                  value={formData.animation_url}
                  onChange={(e) => setFormData(prev => ({ ...prev, animation_url: e.target.value }))}
                  placeholder="URL or upload"
                  className="flex-1"
                />
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    onClick={() => {
                      const input = document.createElement('input');
                      input.type = 'file';
                      input.accept = '.svga,.json,.webp,.gif,.mp4,.webm';
                      input.click();
                    }}
                  >
                    <Upload className="w-4 h-4" />
                  </Button>
                </div>
              </div>

              <div className="space-y-2">
                <Label>Preview Image</Label>
                <div className="flex gap-2">
                  <Input
                    value={formData.preview_url}
                    onChange={(e) => setFormData(prev => ({ ...prev, preview_url: e.target.value }))}
                    placeholder="URL or upload"
                  className="flex-1"
                />
                <input
                  type="file"
                  id="vehicle-preview-upload"
                  accept="image/*"
                  onChange={handlePreviewUpload}
                  className="hidden"
                />
                <Button 
                  type="button" 
                  variant="outline" 
                  disabled={uploadingPreview}
                  onClick={() => document.getElementById('vehicle-preview-upload')?.click()}
                >
                  <Upload className={`h-4 w-4 ${uploadingPreview ? 'animate-spin' : ''}`} />
                </Button>
                {formData.preview_url && (
                  <Button
                    type="button"
                    size="icon"
                    variant="destructive"
                    onClick={() => setFormData(prev => ({ ...prev, preview_url: '' }))}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                )}
              </div>
            </div>

            <div className="flex items-center gap-2">
              <Switch
                checked={formData.is_active}
                onCheckedChange={(checked) => setFormData(prev => ({ ...prev, is_active: checked }))}
              />
              <Label>Active</Label>
            </div>

            {formData.animation_url && (
              <div className="aspect-video bg-black rounded-lg overflow-hidden max-h-40">
                <UniversalAnimationPlayer
                  src={formData.animation_url}
                  className="w-full h-full"
                  loop
                  autoPlay
                />
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving ? 'Saving...' : 'Save'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Preview Dialog - Full Screen */}
      <Dialog open={previewOpen} onOpenChange={setPreviewOpen}>
        <DialogContent className="max-w-4xl h-[80vh]">
          <DialogHeader>
            <DialogTitle>Full Screen Preview</DialogTitle>
          </DialogHeader>
          {previewUrl && (
            <div className="flex-1 bg-black rounded-lg overflow-hidden h-full">
              <UniversalAnimationPlayer
                src={previewUrl}
                className="w-full h-full"
                loop
                autoPlay
              />
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default AdminVehicleEntrances;
