import { useState, useEffect, Suspense, lazy } from "react";
import useAdminRealtime from "@/hooks/useAdminRealtime";
import { Plus, Trash2, Edit, Eye, Upload, Sparkles, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { adminSupabase as supabase } from "@/integrations/supabase/adminClient";
import { toast } from "sonner";
import { adminStyles } from "@/styles/adminStyles";
import { useR2Upload } from "@/hooks/useR2Upload";
import { recordAdminError } from "@/utils/adminErrorLog";

import { formatAdminError } from "@/utils/formatAdminError";
// Lazy load SVGA player
const SVGAPreviewWithMuteToggle = lazy(() => import("@/components/admin/SVGAPreviewWithMuteToggle"));

interface EntryNameBar {
  id: string;
  name: string;
  description: string | null;
  animation_url: string;
  preview_url: string | null;
  min_level: number;
  min_vip_tier: number;
  price_diamonds: number;
  duration_ms: number;
  display_order: number;
  is_active: boolean;
  is_premium: boolean;
  created_at: string;
}

const AdminEntryNameBars = () => {
  const [nameBars, setNameBars] = useState<EntryNameBar[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [showEditDialog, setShowEditDialog] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const [selectedNameBar, setSelectedNameBar] = useState<EntryNameBar | null>(null);
  const [uploading, setUploading] = useState(false);
  const { uploadFile: r2UploadFile } = useR2Upload();

  // Form state
  const [formData, setFormData] = useState({
    name: "",
    description: "",
    animation_url: "",
    preview_url: "",
    min_level: 1,
    min_vip_tier: 0,
    price_diamonds: 0,
    duration_ms: 4000,
    display_order: 0,
    is_active: true,
    is_premium: false
  });

  const fetchNameBars = async () => {
    try {
      const { data, error } = await supabase
        .from("entry_name_bars")
        .select("*")
        .order("display_order", { ascending: true });

      if (error) throw error;
      setNameBars(data || []);
    } catch (error) {
      recordAdminError({ kind: "rpc", label: "AdminEntryNameBars.ErrorFetchingEntryNameBars", message: formatAdminError(error)});
      toast.error("Failed to load entry name bars");
    } finally {
      setLoading(false);
    }
  };

  useAdminRealtime(['entry_name_bars'], fetchNameBars);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>, field: 'animation_url' | 'preview_url') => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(true);
    try {
      // Use R2Upload hook - handles both Supabase (<50MB) and R2 (>50MB) automatically
      const result = await r2UploadFile(file, {
        bucket: 'animations',
        folder: 'entry-name-bars',
      });

      if (!result.success || !result.url) {
        throw new Error(result.error || 'Upload failed');
      }

      setFormData(prev => ({ ...prev, [field]: result.url! }));
      toast.success("File uploaded successfully");
    } catch (error) {
      recordAdminError({ kind: "rpc", label: "AdminEntryNameBars.UploadError", message: formatAdminError(error)});
      toast.error("Failed to upload file");
    } finally {
      setUploading(false);
    }
  };

  const handleAdd = async () => {
    if (!formData.name || !formData.animation_url) {
      toast.error("Name and Animation URL are required");
      return;
    }

    try {
      const { error } = await supabase
        .from("entry_name_bars")
        .insert([formData]);

      if (error) throw error;

      toast.success("Entry Name Bar added successfully");
      setShowAddDialog(false);
      resetForm();
      fetchNameBars();
    } catch (error) {
      recordAdminError({ kind: "rpc", label: "AdminEntryNameBars.ErrorAddingEntryNameBar", message: formatAdminError(error)});
      toast.error("Failed to add entry name bar");
    }
  };

  const handleEdit = async () => {
    if (!selectedNameBar) return;

    try {
      const { error } = await supabase
        .from("entry_name_bars")
        .update(formData)
        .eq("id", selectedNameBar.id);

      if (error) throw error;

      toast.success("Entry Name Bar updated successfully");
      setShowEditDialog(false);
      setSelectedNameBar(null);
      fetchNameBars();
    } catch (error) {
      recordAdminError({ kind: "rpc", label: "AdminEntryNameBars.ErrorUpdatingEntryNameBar", message: formatAdminError(error)});
      toast.error("Failed to update entry name bar");
    }
  };

  const handleDelete = async () => {
    if (!selectedNameBar) return;

    try {
      const { error } = await supabase
        .from("entry_name_bars")
        .delete()
        .eq("id", selectedNameBar.id);

      if (error) throw error;

      toast.success("Entry Name Bar deleted successfully");
      setShowDeleteDialog(false);
      setSelectedNameBar(null);
      fetchNameBars();
    } catch (error) {
      recordAdminError({ kind: "rpc", label: "AdminEntryNameBars.ErrorDeletingEntryNameBar", message: formatAdminError(error)});
      toast.error("Failed to delete entry name bar");
    }
  };

  const toggleActive = async (nameBar: EntryNameBar) => {
    try {
      const { error } = await supabase
        .from("entry_name_bars")
        .update({ is_active: !nameBar.is_active })
        .eq("id", nameBar.id);

      if (error) throw error;

      toast.success(nameBar.is_active ? "Name Bar deactivated" : "Name Bar activated");
      fetchNameBars();
    } catch (error) {
      recordAdminError({ kind: "rpc", label: "AdminEntryNameBars.ErrorTogglingStatus", message: formatAdminError(error)});
      toast.error("Failed to update status");
    }
  };

  const resetForm = () => {
    setFormData({
      name: "",
      description: "",
      animation_url: "",
      preview_url: "",
      min_level: 1,
      min_vip_tier: 0,
      price_diamonds: 0,
      duration_ms: 4000,
      display_order: 0,
      is_active: true,
      is_premium: false
    });
  };

  const openEditDialog = (nameBar: EntryNameBar) => {
    setSelectedNameBar(nameBar);
    setFormData({
      name: nameBar.name,
      description: nameBar.description || "",
      animation_url: nameBar.animation_url,
      preview_url: nameBar.preview_url || "",
      min_level: nameBar.min_level,
      min_vip_tier: nameBar.min_vip_tier,
      price_diamonds: nameBar.price_diamonds,
      duration_ms: nameBar.duration_ms,
      display_order: nameBar.display_order,
      is_active: nameBar.is_active,
      is_premium: nameBar.is_premium
    });
    setShowEditDialog(true);
  };

  const filteredNameBars = nameBars.filter(nb =>
    nb.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const FormFields = () => (
    <div className="space-y-4">
      <div>
        <Label className="text-white">Name *</Label>
        <Input
          value={formData.name}
          onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
          placeholder="Dragon Fire Bar"
          className={adminStyles.input}
        />
      </div>

      <div>
        <Label className="text-white">Description</Label>
        <Input
          value={formData.description}
          onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
          placeholder="Premium dragon-themed entry bar"
          className={adminStyles.input}
        />
      </div>

      <div>
        <Label className="text-white">Animation URL (SVGA / GIF / WebP / PNG) *</Label>
        <div className="flex gap-2">
          <Input
            value={formData.animation_url}
            onChange={(e) => setFormData(prev => ({ ...prev, animation_url: e.target.value }))}
            placeholder="https://..."
            className={adminStyles.input}
          />
          <input
            type="file"
            id="entry-name-bar-animation-upload"
            accept=".svga,.gif,.webp,.png,.jpg,.jpeg"
            onChange={(e) => handleFileUpload(e, 'animation_url')}
            className="hidden"
          />
          <Button 
            variant="outline" 
            disabled={uploading}
            onClick={() => document.getElementById('entry-name-bar-animation-upload')?.click()}
          >
            <Upload className="w-4 h-4" />
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
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <Label className="text-white">Min Level</Label>
          <Input
            type="number"
            value={formData.min_level}
            onChange={(e) => setFormData(prev => ({ ...prev, min_level: parseInt(e.target.value) || 1 }))}
            className={adminStyles.input}
          />
        </div>
        <div>
          <Label className="text-white">Price (Diamonds)</Label>
          <Input
            type="number"
            value={formData.price_diamonds}
            onChange={(e) => setFormData(prev => ({ ...prev, price_diamonds: parseInt(e.target.value) || 0 }))}
            className={adminStyles.input}
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <Label className="text-white">Duration (ms)</Label>
          <Input
            type="number"
            value={formData.duration_ms}
            onChange={(e) => setFormData(prev => ({ ...prev, duration_ms: parseInt(e.target.value) || 4000 }))}
            className={adminStyles.input}
          />
        </div>
        <div>
          <Label className="text-white">Display Order</Label>
          <Input
            type="number"
            value={formData.display_order}
            onChange={(e) => setFormData(prev => ({ ...prev, display_order: parseInt(e.target.value) || 0 }))}
            className={adminStyles.input}
          />
        </div>
      </div>

      <div className="flex items-center gap-6">
        <div className="flex items-center gap-2">
          <Switch
            checked={formData.is_active}
            onCheckedChange={(checked) => setFormData(prev => ({ ...prev, is_active: checked }))}
          />
          <Label className="text-white">Active</Label>
        </div>
        <div className="flex items-center gap-2">
          <Switch
            checked={formData.is_premium}
            onCheckedChange={(checked) => setFormData(prev => ({ ...prev, is_premium: checked }))}
          />
          <Label className="text-white">Premium</Label>
        </div>
      </div>

      {formData.animation_url && (
        <div className="mt-4 p-4 bg-black/30 rounded-lg">
          <Label className="text-white mb-2 block">Preview</Label>
          <div className="flex justify-center">
            <Suspense fallback={<div className="w-80 h-20 bg-purple-600/30 animate-pulse rounded" />}>
              <SVGAPreviewWithMuteToggle
                src={formData.animation_url}
                className="w-80 h-20"
                containerClassName="w-80 h-20"
              />
            </Suspense>
          </div>
        </div>
      )}
    </div>
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 border-2 border-purple-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2">
            <Sparkles className="w-6 h-6 text-yellow-400" />
            Entry Name Bars
          </h1>
          <p className="text-gray-400 mt-1">
            Manage flying SVGA name bars that appear when users enter rooms
          </p>
        </div>
        <Dialog open={showAddDialog} onOpenChange={setShowAddDialog}>
          <DialogTrigger asChild>
            <Button className="bg-purple-600 hover:bg-purple-700" onClick={resetForm}>
              <Plus className="w-4 h-4 mr-2" />
              Add Name Bar
            </Button>
          </DialogTrigger>
          <DialogContent className="bg-slate-900 border-purple-500/20 w-[95vw] max-w-lg max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="text-white">Add Entry Name Bar</DialogTitle>
            </DialogHeader>
            <FormFields />
            <div className="flex justify-end gap-2 mt-4">
              <Button variant="outline" onClick={() => setShowAddDialog(false)}>Cancel</Button>
              <Button className="bg-purple-600 hover:bg-purple-700" onClick={handleAdd}>
                Add Name Bar
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
        <Input
          placeholder="Search name bars..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className={`${adminStyles.input} pl-10`}
        />
      </div>

      {/* Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {filteredNameBars.map((nameBar) => (
          <Card key={nameBar.id} className="bg-slate-800/50 border-purple-500/20 overflow-hidden">
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <CardTitle className="text-white text-lg flex items-center gap-2">
                  {nameBar.name}
                  {nameBar.is_premium && (
                    <span className="px-2 py-0.5 text-xs bg-yellow-500/20 text-yellow-400 rounded">Premium</span>
                  )}
                </CardTitle>
                <Switch
                  checked={nameBar.is_active}
                  onCheckedChange={() => toggleActive(nameBar)}
                />
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              {/* SVGA Preview */}
              <div className="bg-black/40 rounded-lg p-2 flex justify-center">
                <Suspense fallback={<div className="w-full h-16 bg-purple-600/20 animate-pulse rounded" />}>
                  <SVGAPreviewWithMuteToggle
                    src={nameBar.animation_url}
                    className="w-full h-16"
                    containerClassName="w-full h-16"
                  />
                </Suspense>
              </div>

              {/* Info */}
              <div className="grid grid-cols-2 gap-2 text-sm">
                <div className="text-gray-400">Min Level: <span className="text-white">{nameBar.min_level}</span></div>
                <div className="text-gray-400">Price: <span className="text-purple-400">{nameBar.price_diamonds} 💎</span></div>
              </div>

              {/* Actions */}
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  className="flex-1"
                  onClick={() => {
                    setSelectedNameBar(nameBar);
                    setShowPreview(true);
                  }}
                >
                  <Eye className="w-4 h-4 mr-1" />
                  Preview
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="flex-1"
                  onClick={() => openEditDialog(nameBar)}
                >
                  <Edit className="w-4 h-4 mr-1" />
                  Edit
                </Button>
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={() => {
                    setSelectedNameBar(nameBar);
                    setShowDeleteDialog(true);
                  }}
                >
                  <Trash2 className="w-4 h-4" />
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {filteredNameBars.length === 0 && (
        <div className="text-center py-12 text-gray-400">
          <Sparkles className="w-12 h-12 mx-auto mb-4 opacity-50" />
          <p>No entry name bars found</p>
          <p className="text-sm mt-1">Add your first SVGA name bar to get started</p>
        </div>
      )}

      {/* Edit Dialog */}
      <Dialog open={showEditDialog} onOpenChange={setShowEditDialog}>
        <DialogContent className="bg-slate-900 border-purple-500/20 w-[95vw] max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-white">Edit Entry Name Bar</DialogTitle>
          </DialogHeader>
          <FormFields />
          <div className="flex justify-end gap-2 mt-4">
            <Button variant="outline" onClick={() => setShowEditDialog(false)}>Cancel</Button>
            <Button className="bg-purple-600 hover:bg-purple-700" onClick={handleEdit}>
              Save Changes
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Preview Dialog */}
      <Dialog open={showPreview} onOpenChange={setShowPreview}>
        <DialogContent className="bg-gradient-to-br from-purple-900 to-indigo-900 border-purple-500/20 max-w-md">
          <DialogHeader>
            <DialogTitle className="text-white">Preview: {selectedNameBar?.name}</DialogTitle>
          </DialogHeader>
          <div className="py-8 flex justify-center">
            {selectedNameBar && (
              <Suspense fallback={<div className="w-80 h-24 bg-purple-600/30 animate-pulse rounded" />}>
                <SVGAPreviewWithMuteToggle
                  src={selectedNameBar.animation_url}
                  className="w-80 h-24"
                  containerClassName="w-80 h-24"
                />
              </Suspense>
            )}
          </div>
          <p className="text-center text-gray-300 text-sm">
            This SVGA will fly across the screen with the user's name in the center
          </p>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent className="bg-slate-900 border-red-500/20">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-white">Delete Entry Name Bar?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete "{selectedNameBar?.name}". This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-600 hover:bg-red-700"
              onClick={handleDelete}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default AdminEntryNameBars;
