import { useState, useEffect } from "react";
import useAdminRealtime from "@/hooks/useAdminRealtime";
import { motion } from "framer-motion";
import { 
  Plus, 
  Trash2, 
  Edit, 
  Eye,
  Upload,
  Sparkles,
  Zap,
  Crown,
  Search
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import SVGAPreviewWithMuteToggle from '@/components/admin/SVGAPreviewWithMuteToggle';
import { EntryBannerAnimation } from "@/components/live/EntryBannerAnimation";
import adminStyles from "@/styles/adminStyles";

const adminCardClass = adminStyles.card;
const adminInputClass = adminStyles.input;
const adminLabelClass = adminStyles.formLabel;

interface EntryBanner {
  id: string;
  name: string;
  description: string | null;
  animation_url: string;
  preview_url: string | null;
  min_level: number;
  min_vip_tier: number;
  price_diamonds: number;
  is_active: boolean;
  is_premium: boolean;
  display_order: number;
  duration_ms: number;
  created_at: string;
}

export default function AdminEntryBanners() {
  const { toast } = useToast();
  const [banners, setBanners] = useState<EntryBanner[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [showDialog, setShowDialog] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const [selectedBanner, setSelectedBanner] = useState<EntryBanner | null>(null);
  const [uploading, setUploading] = useState(false);
  
  const [formData, setFormData] = useState({
    name: "",
    description: "",
    animation_url: "",
    preview_url: "",
    min_level: 0,
    min_vip_tier: 0,
    price_diamonds: 0,
    is_active: true,
    is_premium: false,
    display_order: 0,
    duration_ms: 3000
  });

  useAdminRealtime(['entry_banners'], () => fetchBanners());

  const fetchBanners = async () => {
    try {
      const { data, error } = await supabase
        .from('entry_banners')
        .select('*')
        .order('display_order', { ascending: true });

      if (error) throw error;
      setBanners(data || []);
    } catch (error: any) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
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

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>, field: 'animation_url' | 'preview_url') => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(true);
    try {
      const fileExt = file.name.split('.').pop();
      const fileSizeMB = (file.size / (1024 * 1024)).toFixed(2);
      let publicUrl: string;
      
      // Use R2 for files > 50MB
      if (file.size > 50 * 1024 * 1024) {
        toast({ title: "Large File", description: `${fileSizeMB}MB - Uploading to R2...` });
        publicUrl = await uploadToR2(file, 'entry-banners');
      } else {
        const fileName = `entry-banners/${Date.now()}-${Math.random().toString(36).substring(7)}.${fileExt}`;

        // Determine content type based on file extension
        const extensionToMimeType: Record<string, string> = {
          'svga': 'application/octet-stream',
          'json': 'application/json',
          'png': 'image/png',
          'gif': 'image/gif',
          'webp': 'image/webp',
          'mp4': 'video/mp4',
          'webm': 'video/webm',
        };
        const contentType = extensionToMimeType[fileExt || ''] || 'application/octet-stream';

        const { error: uploadError } = await supabase.storage
          .from('animations')
          .upload(fileName, file, {
            contentType: contentType,
          });

        if (uploadError) throw uploadError;

        const { data: { publicUrl: url } } = supabase.storage
          .from('animations')
          .getPublicUrl(fileName);
        
        publicUrl = url;
      }

      setFormData(prev => ({ ...prev, [field]: publicUrl }));
      toast({ title: "✅ Uploaded!", description: `${field === 'animation_url' ? 'Animation' : 'Preview'} uploaded successfully` });
    } catch (error: any) {
      toast({ title: "Upload Failed", description: error.message, variant: "destructive" });
    } finally {
      setUploading(false);
    }
  };

  const handleSave = async () => {
    if (!formData.name || !formData.animation_url) {
      toast({ title: "Error", description: "Name and Animation URL are required", variant: "destructive" });
      return;
    }

    try {
      if (selectedBanner) {
        const { error } = await supabase
          .from('entry_banners')
          .update(formData)
          .eq('id', selectedBanner.id);
        if (error) throw error;
        toast({ title: "✅ Updated!", description: "Entry banner updated successfully" });
      } else {
        const { error } = await supabase
          .from('entry_banners')
          .insert([formData]);
        if (error) throw error;
        toast({ title: "✅ Created!", description: "Entry banner created successfully" });
      }

      setShowDialog(false);
      resetForm();
      fetchBanners();
    } catch (error: any) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    }
  };

  const handleDelete = async () => {
    if (!selectedBanner) return;

    try {
      const { error } = await supabase
        .from('entry_banners')
        .delete()
        .eq('id', selectedBanner.id);

      if (error) throw error;
      toast({ title: "🗑️ Deleted", description: "Entry banner deleted" });
      setShowDeleteDialog(false);
      setSelectedBanner(null);
      fetchBanners();
    } catch (error: any) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    }
  };

  const resetForm = () => {
    setFormData({
      name: "",
      description: "",
      animation_url: "",
      preview_url: "",
      min_level: 0,
      min_vip_tier: 0,
      price_diamonds: 0,
      is_active: true,
      is_premium: false,
      display_order: 0,
      duration_ms: 3000
    });
    setSelectedBanner(null);
  };

  const openEditDialog = (banner: EntryBanner) => {
    setSelectedBanner(banner);
    setFormData({
      name: banner.name,
      description: banner.description || "",
      animation_url: banner.animation_url,
      preview_url: banner.preview_url || "",
      min_level: banner.min_level,
      min_vip_tier: banner.min_vip_tier,
      price_diamonds: banner.price_diamonds,
      is_active: banner.is_active,
      is_premium: banner.is_premium,
      display_order: banner.display_order,
      duration_ms: banner.duration_ms
    });
    setShowDialog(true);
  };

  const filteredBanners = banners.filter(b => 
    b.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2">
            <Zap className="w-7 h-7 text-yellow-400" />
            Entry Banners
          </h1>
          <p className="text-white/60 mt-1">
            Manage room entrance animations for VIP users
          </p>
        </div>
        <Button
          onClick={() => { resetForm(); setShowDialog(true); }}
          className="bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-600 hover:to-pink-600"
        >
          <Plus className="w-4 h-4 mr-2" />
          Add Banner
        </Button>
      </div>

      {/* Search */}
      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/40" />
        <Input
          placeholder="Search banners..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className={`${adminInputClass} pl-10`}
        />
      </div>

      {/* Banner Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {filteredBanners.map((banner, idx) => (
          <motion.div
            key={banner.id}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: idx * 0.05 }}
            className={`${adminCardClass} p-4 space-y-3`}
          >
            {/* Preview */}
            <div className="h-20 bg-gradient-to-br from-purple-900/50 to-pink-900/50 rounded-lg flex items-center justify-center overflow-hidden">
              {banner.preview_url ? (
                <img src={banner.preview_url} alt={banner.name} className="w-full h-full object-contain" />
              ) : banner.animation_url.endsWith('.svga') ? (
                <SVGAPreviewWithMuteToggle
                  src={banner.animation_url}
                  className="w-full h-full object-contain"
                  containerClassName="w-full h-full"
                />
              ) : (
                <Sparkles className="w-8 h-8 text-purple-400" />
              )}
            </div>

            {/* Info */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <h3 className="text-white font-semibold truncate">{banner.name}</h3>
                <div className="flex items-center gap-1">
                  {banner.is_premium && (
                    <Badge className="bg-gradient-to-r from-amber-500 to-yellow-500 text-black text-[10px]">
                      <Crown className="w-3 h-3 mr-0.5" /> Premium
                    </Badge>
                  )}
                  {banner.is_active ? (
                    <Badge className="bg-green-500/20 text-green-400 text-[10px]">Active</Badge>
                  ) : (
                    <Badge className="bg-red-500/20 text-red-400 text-[10px]">Inactive</Badge>
                  )}
                </div>
              </div>

              <div className="flex items-center gap-3 text-xs text-white/50">
                <span>Min Lv: {banner.min_level}</span>
                <span>VIP: {banner.min_vip_tier}</span>
                <span>💎 {banner.price_diamonds}</span>
              </div>
            </div>

            {/* Actions */}
            <div className="flex items-center gap-2 pt-2 border-t border-white/10">
              <Button
                size="sm"
                variant="ghost"
                onClick={() => { setSelectedBanner(banner); setShowPreview(true); }}
                className="flex-1 text-cyan-400 hover:bg-cyan-500/10"
              >
                <Eye className="w-4 h-4 mr-1" /> Preview
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => openEditDialog(banner)}
                className="flex-1 text-purple-400 hover:bg-purple-500/10"
              >
                <Edit className="w-4 h-4 mr-1" /> Edit
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => { setSelectedBanner(banner); setShowDeleteDialog(true); }}
                className="text-red-400 hover:bg-red-500/10"
              >
                <Trash2 className="w-4 h-4" />
              </Button>
            </div>
          </motion.div>
        ))}
      </div>

      {filteredBanners.length === 0 && !loading && (
        <div className="text-center py-12 text-white/50">
          <Sparkles className="w-12 h-12 mx-auto mb-3 opacity-50" />
          <p>No entry banners found</p>
        </div>
      )}

      {/* Add/Edit Dialog */}
      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogContent className="bg-gradient-to-br from-slate-900 to-purple-900/50 border-purple-500/20 w-[95vw] max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-white flex items-center gap-2">
              <Zap className="w-5 h-5 text-yellow-400" />
              {selectedBanner ? 'Edit Entry Banner' : 'Add Entry Banner'}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <div>
              <Label className={adminLabelClass}>Name *</Label>
              <Input
                value={formData.name}
                onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
                className={adminInputClass}
                placeholder="Golden Entry Effect"
              />
            </div>

            <div>
              <Label className={adminLabelClass}>Description</Label>
              <Input
                value={formData.description}
                onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
                className={adminInputClass}
                placeholder="A premium golden entrance animation"
              />
            </div>

            <div>
              <Label className={adminLabelClass}>Animation File (SVGA) *</Label>
              <div className="flex gap-2">
                <Input
                  value={formData.animation_url}
                  onChange={(e) => setFormData(prev => ({ ...prev, animation_url: e.target.value }))}
                  className={`${adminInputClass} flex-1`}
                  placeholder="https://..."
                />
                <input
                  type="file"
                  id="entry-banner-animation-upload"
                  accept="*/*"
                  className="hidden"
                  onChange={(e) => handleFileUpload(e, 'animation_url')}
                />
                <Button 
                  type="button" 
                  variant="outline" 
                  disabled={uploading}
                  onClick={() => document.getElementById('entry-banner-animation-upload')?.click()}
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
              {formData.animation_url && (
                <div className="mt-2 h-16 bg-black/30 rounded-lg overflow-hidden flex items-center justify-center">
                  <SVGAPreviewWithMuteToggle
                    src={formData.animation_url}
                    className="h-full object-contain"
                    containerClassName="h-full"
                  />
                </div>
              )}
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label className={adminLabelClass}>Min Level</Label>
                <Input
                  type="number"
                  value={formData.min_level}
                  onChange={(e) => setFormData(prev => ({ ...prev, min_level: parseInt(e.target.value) || 0 }))}
                  className={adminInputClass}
                />
              </div>
              <div>
                <Label className={adminLabelClass}>Min VIP Tier</Label>
                <Input
                  type="number"
                  value={formData.min_vip_tier}
                  onChange={(e) => setFormData(prev => ({ ...prev, min_vip_tier: parseInt(e.target.value) || 0 }))}
                  className={adminInputClass}
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label className={adminLabelClass}>Price (Diamonds)</Label>
                <Input
                  type="number"
                  value={formData.price_diamonds}
                  onChange={(e) => setFormData(prev => ({ ...prev, price_diamonds: parseInt(e.target.value) || 0 }))}
                  className={adminInputClass}
                />
              </div>
              <div>
                <Label className={adminLabelClass}>Duration (ms)</Label>
                <Input
                  type="number"
                  value={formData.duration_ms}
                  onChange={(e) => setFormData(prev => ({ ...prev, duration_ms: parseInt(e.target.value) || 3000 }))}
                  className={adminInputClass}
                />
              </div>
            </div>

            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Switch
                  checked={formData.is_active}
                  onCheckedChange={(v) => setFormData(prev => ({ ...prev, is_active: v }))}
                />
                <Label className="text-white/70">Active</Label>
              </div>
              <div className="flex items-center gap-2">
                <Switch
                  checked={formData.is_premium}
                  onCheckedChange={(v) => setFormData(prev => ({ ...prev, is_premium: v }))}
                />
                <Label className="text-white/70">Premium</Label>
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="ghost" onClick={() => setShowDialog(false)}>Cancel</Button>
            <Button 
              onClick={handleSave}
              className="bg-gradient-to-r from-purple-500 to-pink-500"
            >
              {selectedBanner ? 'Update' : 'Create'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Preview Dialog */}
      <Dialog open={showPreview} onOpenChange={setShowPreview}>
        <DialogContent className="bg-gradient-to-br from-purple-900 to-indigo-900 border-purple-500/20 max-w-md">
          <DialogHeader>
            <DialogTitle className="text-white">Preview: {selectedBanner?.name}</DialogTitle>
          </DialogHeader>
          <div className="py-8">
            {selectedBanner && (
              <EntryBannerAnimation
                userName="Demo User"
                userLevel={selectedBanner.min_level || 10}
                avatarUrl="https://api.dicebear.com/7.x/avataaars/svg?seed=demo"
                animationUrl={selectedBanner.animation_url}
                onComplete={() => {}}
              />
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent className="bg-slate-900 border-red-500/20">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-white">Delete Entry Banner?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete "{selectedBanner?.name}". This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className="bg-red-600 hover:bg-red-700"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
