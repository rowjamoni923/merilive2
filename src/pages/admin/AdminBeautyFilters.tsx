import { useState, useEffect } from "react";
import { adminSupabase as supabase } from "@/integrations/supabase/adminClient";
import { useR2Upload } from "@/hooks/useR2Upload";
import useAdminRealtime from "@/hooks/useAdminRealtime";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Progress } from "@/components/ui/progress";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Sparkles, Upload, Trash2, Plus, Edit, Eye, EyeOff,
  RefreshCw, Wand2, Smile, Search, Crown, Star, Diamond
} from "lucide-react";
import { ColorMatrixEditor, IDENTITY_MATRIX } from "@/components/admin/beauty/ColorMatrixEditor";

// Preview image imports for built-in MediaPipe filters
import skinSmoothingImg from '@/assets/beauty-filters/skin-smoothing.png';
import skinWhiteningImg from '@/assets/beauty-filters/skin-whitening.png';
import rosyCheeksImg from '@/assets/beauty-filters/rosy-cheeks.png';
import sharpnessImg from '@/assets/beauty-filters/sharpness.png';
import glowImg from '@/assets/beauty-filters/glow.png';
import warmToneImg from '@/assets/beauty-filters/warm-tone.png';
import eyeBrightImg from '@/assets/beauty-filters/eye-bright.png';
import skinToneImg from '@/assets/beauty-filters/skin-tone.png';
import faceSlimImg from '@/assets/beauty-filters/face-slim.png';
import chinSlimImg from '@/assets/beauty-filters/chin-slim.png';
import eyeEnlargeImg from '@/assets/beauty-filters/eye-enlarge.png';
import noseNarrowImg from '@/assets/beauty-filters/nose-narrow.png';
import lipColorImg from '@/assets/beauty-filters/lip-color.png';

const MEDIAPIPE_PREVIEW_MAP: Record<string, string> = {
  smoothness: skinSmoothingImg,
  whitening: skinWhiteningImg,
  redness: rosyCheeksImg,
  sharpness: sharpnessImg,
  glow: glowImg,
  warmth: warmToneImg,
  eyeBright: eyeBrightImg,
  skinTone: skinToneImg,
  faceSlim: faceSlimImg,
  chinSlim: chinSlimImg,
  eyeEnlarge: eyeEnlargeImg,
  noseNarrow: noseNarrowImg,
  lipColor: lipColorImg,
};

interface BeautyFilter {
  id: string;
  name: string;
  description: string | null;
  category: string;
  file_url: string;
  preview_url: string | null;
  filter_type: string;
  filter_key: string | null;
  file_size_bytes: number | null;
  is_active: boolean;
  is_premium: boolean;
  is_free: boolean;
  price_diamonds: number;
  min_level: number;
  display_order: number;
  tags: string[];
  intensity_default: number | null;
  created_at: string;
}

interface ARSticker {
  id: string;
  name: string;
  description: string | null;
  category: string;
  file_url: string;
  preview_url: string | null;
  filter_type: string;
  filter_key: string | null;
  file_size_bytes: number | null;
  is_active: boolean;
  is_premium: boolean;
  is_free: boolean;
  price_diamonds: number;
  min_level: number;
  display_order: number;
  tags: string[];
  intensity_default: number | null;
  created_at: string;
}

const BEAUTY_CATEGORIES = [
  { value: "beauty", label: "Beauty / Smoothing" },
  { value: "makeup", label: "Makeup" },
  { value: "filter", label: "Color Filter" },
  { value: "face_shape", label: "Face Shape" },
  { value: "skin", label: "Skin Enhancement" },
];

const STICKER_CATEGORIES = [
  { value: "fun", label: "Fun" },
  { value: "masks", label: "Masks" },
  { value: "accessories", label: "Accessories" },
  { value: "animals", label: "Animals" },
  { value: "festival", label: "Festival" },
  { value: "love", label: "Love" },
];

const AdminBeautyFilters = () => {
  const [activeTab, setActiveTab] = useState("beauty");
  const [beautyFilters, setBeautyFilters] = useState<BeautyFilter[]>([]);
  const [stickers, setStickers] = useState<ARSticker[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [editingItem, setEditingItem] = useState<BeautyFilter | ARSticker | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewImageFile, setPreviewImageFile] = useState<File | null>(null);

  const { uploadFile, uploading, progress } = useR2Upload();

  const [formData, setFormData] = useState({
    name: "",
    slug: "",
    description: "",
    category: "",
    is_premium: false,
    is_free: true,
    price_diamonds: 0,
    min_level: 0,
    display_order: 0,
    tags: "",
    matrix: IDENTITY_MATRIX as number[],
    icon_name: "",
  });

  useAdminRealtime(["beauty_filters", "ar_stickers"], () => fetchAll());

  useEffect(() => {
    fetchAll();
  }, []);

  const fetchAll = async () => {
    setLoading(true);
    const [filtersRes, stickersRes] = await Promise.all([
      supabase.from("beauty_filters" as any).select("*").order("display_order"),
      supabase.from("ar_stickers" as any).select("*").order("display_order"),
    ]);
    setBeautyFilters((filtersRes.data as any) || []);
    setStickers((stickersRes.data as any) || []);
    setLoading(false);
  };

  const resetForm = () => {
    setFormData({
      name: "", slug: "", description: "", category: "",
      is_premium: false, is_free: true, price_diamonds: 0,
      min_level: 0, display_order: 0, tags: "",
      matrix: IDENTITY_MATRIX as number[],
      icon_name: "",
    });
    setSelectedFile(null);
    setPreviewImageFile(null);
    setEditingItem(null);
  };

  const openAddDialog = () => {
    resetForm();
    setFormData(prev => ({
      ...prev,
      category: activeTab === "beauty" ? "beauty" : "fun",
    }));
    setShowAddDialog(true);
  };

  const openEditDialog = (item: BeautyFilter | ARSticker) => {
    setEditingItem(item);
    setFormData({
      name: item.name,
      slug: (item as any).slug || "",
      description: item.description || "",
      category: item.category,
      is_premium: item.is_premium,
      is_free: item.is_free,
      price_diamonds: item.price_diamonds,
      min_level: item.min_level,
      display_order: item.display_order,
      tags: item.tags?.join(", ") || "",
      matrix: Array.isArray((item as any).matrix) && (item as any).matrix.length === 20
        ? (item as any).matrix
        : IDENTITY_MATRIX,
      icon_name: (item as any).icon_name || "",
    });
    setShowAddDialog(true);
  };

  const handleSave = async () => {
    if (!formData.name.trim()) {
      toast.error("Name is required");
      return;
    }

    const table = activeTab === "beauty" ? "beauty_filters" : "ar_stickers";
    const folder = activeTab === "beauty" ? "beauty-filters" : "ar-stickers";

    let fileUrl = editingItem?.file_url || "";
    let previewUrl = editingItem?.preview_url || "";
    let fileSize = editingItem?.file_size_bytes || 0;

    // Upload main file (.deepar / .svga / .json)
    if (selectedFile) {
      const result = await uploadFile(selectedFile, {
        bucket: "animations",
        folder,
      });
      if (!result.success) return;
      fileUrl = result.url!;
      fileSize = selectedFile.size;
    }

    // Upload preview image
    if (previewImageFile) {
      const result = await uploadFile(previewImageFile, {
        bucket: "animations",
        folder: `${folder}/previews`,
      });
      if (!result.success) return;
      previewUrl = result.url!;
    }

    if (!editingItem && !fileUrl) {
      toast.error("Please select a file to upload");
      return;
    }

    // Auto-generate slug if missing (Flutter parity requirement)
    const autoSlug = formData.slug.trim() || formData.name.trim().toLowerCase()
      .replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");

    const basePayload: Record<string, any> = {
      name: formData.name.trim(),
      slug: autoSlug,
      description: formData.description.trim() || null,
      category: formData.category,
      file_url: fileUrl,
      preview_url: previewUrl || null,
      filter_type: selectedFile?.name.endsWith(".deepar") ? "deepar"
        : selectedFile?.name.endsWith(".svga") ? "svga"
        : selectedFile?.name.endsWith(".json") ? "lottie"
        : editingItem ? (editingItem as any).filter_type : "deepar",
      file_size_bytes: fileSize,
      is_premium: formData.is_premium,
      is_free: formData.is_free,
      price_diamonds: formData.price_diamonds,
      min_level: formData.min_level,
      display_order: formData.display_order,
      tags: formData.tags.split(",").map(t => t.trim()).filter(Boolean),
      updated_at: new Date().toISOString(),
    };

    // Beauty filters get matrix + icon_name; AR stickers don't need matrix
    const payload = activeTab === "beauty"
      ? { ...basePayload, matrix: formData.matrix, icon_name: formData.icon_name.trim() || null }
      : basePayload;

    let error;
    if (editingItem) {
      ({ error } = await supabase.from(table as any).update(payload).eq("id", editingItem.id));
    } else {
      ({ error } = await supabase.from(table as any).insert(payload));
    }

    if (error) {
      toast.error(`Failed: ${error.message}`);
      return;
    }

    toast.success(editingItem ? "Updated successfully!" : "Uploaded successfully! 🎉");
    setShowAddDialog(false);
    resetForm();
    fetchAll();
  };

  const toggleActive = async (item: BeautyFilter | ARSticker) => {
    const table = activeTab === "beauty" ? "beauty_filters" : "ar_stickers";
    const { error } = await supabase
      .from(table as any)
      .update({ is_active: !item.is_active, updated_at: new Date().toISOString() })
      .eq("id", item.id);
    if (error) {
      toast.error(`Failed: ${error.message}`);
    } else {
      toast.success(item.is_active ? "Deactivated" : "Activated");
      fetchAll();
    }
  };

  const deleteItem = async (item: BeautyFilter | ARSticker) => {
    if (!confirm(`Delete "${item.name}"? This cannot be undone.`)) return;
    const table = activeTab === "beauty" ? "beauty_filters" : "ar_stickers";
    const { error } = await supabase.from(table as any).delete().eq("id", item.id);
    if (error) {
      toast.error(`Failed: ${error.message}`);
    } else {
      toast.success("Deleted");
      fetchAll();
    }
  };

  const currentItems = activeTab === "beauty" ? beautyFilters : stickers;
  const filtered = currentItems.filter(item =>
    item.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    item.category.toLowerCase().includes(searchQuery.toLowerCase())
  );
  const categories = activeTab === "beauty" ? BEAUTY_CATEGORIES : STICKER_CATEGORIES;

  const getFileTypeIcon = (type: string) => {
    if (type === "deepar") return <Wand2 className="w-4 h-4" />;
    if (type === "svga") return <Sparkles className="w-4 h-4" />;
    return <Star className="w-4 h-4" />;
  };

  const formatSize = (bytes: number | null) => {
    if (!bytes) return "—";
    if (bytes < 1024) return `${bytes}B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-gradient-to-r from-fuchsia-600 via-purple-600 to-violet-600 rounded-2xl p-6 shadow-lg">
        <div className="flex items-center gap-4">
          <div className="w-14 h-14 rounded-xl bg-white/20 flex items-center justify-center">
            <Wand2 className="w-8 h-8 text-white" />
          </div>
          <div className="flex-1">
            <h1 className="text-2xl font-bold text-white">Beauty Filters & AR Stickers</h1>
            <p className="text-white/80">Upload .deepar / .svga / Lottie files to R2 — No APK update needed</p>
          </div>
          <Button onClick={openAddDialog} className="bg-white/20 hover:bg-white/30 text-white border-0">
            <Plus className="w-4 h-4 mr-2" />
            Upload New
          </Button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card className="bg-gradient-to-br from-fuchsia-500/10 to-fuchsia-600/5 border-fuchsia-500/20">
          <CardContent className="p-3 text-center">
            <Wand2 className="w-6 h-6 mx-auto mb-1 text-fuchsia-400" />
            <p className="text-xl font-bold text-foreground">{beautyFilters.filter(f => f.is_active).length}</p>
            <p className="text-[10px] text-muted-foreground">Active Filters</p>
          </CardContent>
        </Card>
        <Card className="bg-gradient-to-br from-violet-500/10 to-violet-600/5 border-violet-500/20">
          <CardContent className="p-3 text-center">
            <Smile className="w-6 h-6 mx-auto mb-1 text-violet-400" />
            <p className="text-xl font-bold text-foreground">{stickers.filter(s => s.is_active).length}</p>
            <p className="text-[10px] text-muted-foreground">Active Stickers</p>
          </CardContent>
        </Card>
        <Card className="bg-gradient-to-br from-amber-500/10 to-amber-600/5 border-amber-500/20">
          <CardContent className="p-3 text-center">
            <Crown className="w-6 h-6 mx-auto mb-1 text-amber-400" />
            <p className="text-xl font-bold text-foreground">
              {[...beautyFilters, ...stickers].filter(i => i.is_premium).length}
            </p>
            <p className="text-[10px] text-muted-foreground">Premium Items</p>
          </CardContent>
        </Card>
        <Card className="bg-gradient-to-br from-emerald-500/10 to-emerald-600/5 border-emerald-500/20">
          <CardContent className="p-3 text-center">
            <Diamond className="w-6 h-6 mx-auto mb-1 text-emerald-400" />
            <p className="text-xl font-bold text-foreground">
              {[...beautyFilters, ...stickers].filter(i => i.is_free).length}
            </p>
            <p className="text-[10px] text-muted-foreground">Free Items</p>
          </CardContent>
        </Card>
      </div>

      {/* Main Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <div className="flex items-center gap-3 mb-4">
          <TabsList className="bg-slate-900/50">
            <TabsTrigger value="beauty" className="data-[state=active]:bg-gradient-to-r data-[state=active]:from-fuchsia-500 data-[state=active]:to-purple-500 data-[state=active]:text-white">
              <Wand2 className="w-4 h-4 mr-2" />
              Beauty Filters
            </TabsTrigger>
            <TabsTrigger value="stickers" className="data-[state=active]:bg-gradient-to-r data-[state=active]:from-violet-500 data-[state=active]:to-indigo-500 data-[state=active]:text-white">
              <Smile className="w-4 h-4 mr-2" />
              AR Stickers
            </TabsTrigger>
          </TabsList>
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Search by name or category..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9"
            />
          </div>
          <Button variant="outline" size="icon" onClick={fetchAll} disabled={loading}>
            <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
          </Button>
        </div>

        <TabsContent value="beauty" className="mt-0">
          <ItemGrid
            items={filtered}
            onEdit={openEditDialog}
            onToggle={toggleActive}
            onDelete={deleteItem}
            getFileTypeIcon={getFileTypeIcon}
            formatSize={formatSize}
            loading={loading}
          />
        </TabsContent>

        <TabsContent value="stickers" className="mt-0">
          <ItemGrid
            items={filtered}
            onEdit={openEditDialog}
            onToggle={toggleActive}
            onDelete={deleteItem}
            getFileTypeIcon={getFileTypeIcon}
            formatSize={formatSize}
            loading={loading}
          />
        </TabsContent>
      </Tabs>

      {/* Add/Edit Dialog */}
      <Dialog open={showAddDialog} onOpenChange={(open) => { if (!open) { setShowAddDialog(false); resetForm(); } }}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {activeTab === "beauty" ? <Wand2 className="w-5 h-5 text-fuchsia-400" /> : <Smile className="w-5 h-5 text-violet-400" />}
              {editingItem ? "Edit" : "Upload New"} {activeTab === "beauty" ? "Beauty Filter" : "AR Sticker"}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            {/* Name */}
            <div>
              <Label>Name *</Label>
              <Input
                placeholder="e.g. Glow Smooth, Cat Ears..."
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              />
            </div>

            {/* Slug — Flutter parity */}
            <div>
              <Label className="flex items-center gap-2">
                Slug
                <span className="text-[10px] text-muted-foreground font-normal">
                  (Flutter app key — auto-generated if empty)
                </span>
              </Label>
              <Input
                placeholder="e.g. natural, cat_ears, crown"
                value={formData.slug}
                onChange={(e) => setFormData({ ...formData, slug: e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, "_") })}
                className="font-mono text-sm"
              />
              <p className="text-[10px] text-muted-foreground mt-1">
                Must match the slug used in <code className="text-fuchsia-400">BeautyEffectService</code> for zero-breakage sync.
              </p>
            </div>

            {/* Description */}
            <div>
              <Label>Description</Label>
              <Input
                placeholder="Short description..."
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              />
            </div>

            {/* Icon name (for beauty filters only) */}
            {activeTab === "beauty" && (
              <div>
                <Label>Lucide Icon Name (optional)</Label>
                <Input
                  placeholder="e.g. Sparkles, Sun, Heart"
                  value={formData.icon_name}
                  onChange={(e) => setFormData({ ...formData, icon_name: e.target.value })}
                />
              </div>
            )}

            {/* Category */}
            <div>
              <Label>Category</Label>
              <Select value={formData.category} onValueChange={(v) => setFormData({ ...formData, category: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {categories.map(c => (
                    <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* File Upload */}
            <div>
              <Label>Effect File (.deepar / .svga / .json) {!editingItem && "*"}</Label>
              <div className="mt-1 border-2 border-dashed border-muted rounded-lg p-4 text-center">
                <input
                  type="file"
                  accept=".deepar,.svga,.json,.lottie"
                  onChange={(e) => setSelectedFile(e.target.files?.[0] || null)}
                  className="hidden"
                  id="effect-file"
                />
                <label htmlFor="effect-file" className="cursor-pointer">
                  <Upload className="w-8 h-8 mx-auto mb-2 text-muted-foreground" />
                  <p className="text-sm text-muted-foreground">
                    {selectedFile ? (
                      <span className="text-foreground font-medium">{selectedFile.name} ({formatSize(selectedFile.size)})</span>
                    ) : (
                      "Click to select .deepar / .svga / .json file"
                    )}
                  </p>
                </label>
              </div>
            </div>

            {/* Preview Image */}
            <div>
              <Label>Preview Image (optional)</Label>
              <div className="mt-1 border-2 border-dashed border-muted rounded-lg p-4 text-center">
                <input
                  type="file"
                  accept="image/*"
                  onChange={(e) => setPreviewImageFile(e.target.files?.[0] || null)}
                  className="hidden"
                  id="preview-image"
                />
                <label htmlFor="preview-image" className="cursor-pointer">
                  <p className="text-sm text-muted-foreground">
                    {previewImageFile ? (
                      <span className="text-foreground font-medium">{previewImageFile.name}</span>
                    ) : (
                      "Click to select preview thumbnail"
                    )}
                  </p>
                </label>
              </div>
            </div>

            {/* Pricing */}
            <div className="grid grid-cols-2 gap-3">
              <div className="flex items-center justify-between p-3 bg-muted/30 rounded-lg">
                <Label className="text-sm">Free</Label>
                <Switch
                  checked={formData.is_free}
                  onCheckedChange={(v) => setFormData({ ...formData, is_free: v, is_premium: v ? false : formData.is_premium })}
                />
              </div>
              <div className="flex items-center justify-between p-3 bg-muted/30 rounded-lg">
                <Label className="text-sm">Premium</Label>
                <Switch
                  checked={formData.is_premium}
                  onCheckedChange={(v) => setFormData({ ...formData, is_premium: v, is_free: v ? false : formData.is_free })}
                />
              </div>
            </div>

            {!formData.is_free && (
              <div>
                <Label>Price (Diamonds)</Label>
                <Input
                  type="number"
                  min={0}
                  value={formData.price_diamonds}
                  onChange={(e) => setFormData({ ...formData, price_diamonds: parseInt(e.target.value) || 0 })}
                />
              </div>
            )}

            {/* Level & Order */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Min Level</Label>
                <Input
                  type="number"
                  min={0}
                  value={formData.min_level}
                  onChange={(e) => setFormData({ ...formData, min_level: parseInt(e.target.value) || 0 })}
                />
              </div>
              <div>
                <Label>Display Order</Label>
                <Input
                  type="number"
                  value={formData.display_order}
                  onChange={(e) => setFormData({ ...formData, display_order: parseInt(e.target.value) || 0 })}
                />
              </div>
            </div>

            {/* Tags */}
            <div>
              <Label>Tags (comma-separated)</Label>
              <Input
                placeholder="e.g. smooth, glow, trending"
                value={formData.tags}
                onChange={(e) => setFormData({ ...formData, tags: e.target.value })}
              />
            </div>

            {/* Color Matrix Editor — beauty filters only (Elite Beauty Studio parity) */}
            {activeTab === "beauty" && (
              <div className="pt-4 border-t border-muted/30">
                <ColorMatrixEditor
                  value={formData.matrix}
                  onChange={(m) => setFormData({ ...formData, matrix: m })}
                  previewUrl={previewImageFile ? URL.createObjectURL(previewImageFile) : (editingItem?.preview_url || null)}
                />
              </div>
            )}

            {/* Upload Progress */}
            {uploading && (
              <div className="space-y-2">
                <Progress value={progress} className="h-2" />
                <p className="text-xs text-center text-muted-foreground">Uploading to R2... {progress}%</p>
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => { setShowAddDialog(false); resetForm(); }}>
              Cancel
            </Button>
            <Button
              onClick={handleSave}
              disabled={uploading}
              className="bg-gradient-to-r from-fuchsia-500 to-purple-600 text-white"
            >
              {uploading ? "Uploading..." : editingItem ? "Save Changes" : "Upload & Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

// Item Grid Component
const ItemGrid = ({
  items,
  onEdit,
  onToggle,
  onDelete,
  getFileTypeIcon,
  formatSize,
  loading,
}: {
  items: (BeautyFilter | ARSticker)[];
  onEdit: (item: any) => void;
  onToggle: (item: any) => void;
  onDelete: (item: any) => void;
  getFileTypeIcon: (type: string) => React.ReactNode;
  formatSize: (bytes: number | null) => string;
  loading: boolean;
}) => {
  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <RefreshCw className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className="text-center py-20 text-muted-foreground">
        <Wand2 className="w-12 h-12 mx-auto mb-3 opacity-30" />
        <p className="text-lg font-medium">No items yet</p>
        <p className="text-sm">Click "Upload New" to add your first effect</p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
      {items.map((item) => (
        <Card
          key={item.id}
          className={`transition-all hover:shadow-lg ${!item.is_active ? "opacity-50" : ""} border-muted/30`}
        >
          <CardContent className="p-4">
            <div className="flex items-start gap-3">
              {/* Preview */}
              <div className="w-16 h-16 rounded-xl bg-gradient-to-br from-fuchsia-500/20 to-purple-500/20 flex items-center justify-center flex-shrink-0 overflow-hidden">
                {(() => {
                  // For MediaPipe filters, use imported asset images
                  const mpKey = (item as any).filter_key;
                  const mpPreview = mpKey ? MEDIAPIPE_PREVIEW_MAP[mpKey] : null;
                  const previewSrc = mpPreview || item.preview_url;
                  if (previewSrc) {
                    return <img src={previewSrc} alt={item.name} className="w-full h-full object-cover rounded-xl" loading="lazy" onError={(e) => { const t = e.currentTarget; if (t.src.indexOf('/placeholder.svg') === -1) t.src = '/placeholder.svg'; }} />;
                  }
                  return <div className="text-fuchsia-400">{getFileTypeIcon(item.filter_type)}</div>;
                })()}
              </div>

              {/* Info */}
              <div className="flex-1 min-w-0">
                <h3 className="font-semibold text-sm truncate text-foreground">{item.name}</h3>
                {item.description && (
                  <p className="text-[10px] text-muted-foreground truncate mt-0.5">{item.description}</p>
                )}
                <div className="flex items-center gap-1 mt-1 flex-wrap">
                  <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                    {item.category}
                  </Badge>
                  {item.filter_type === 'mediapipe' ? (
                    <Badge className="bg-blue-500/20 text-blue-400 text-[10px] px-1.5 py-0 border-0">🤖 AI</Badge>
                  ) : (
                    <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                      {item.filter_type}
                    </Badge>
                  )}
                  <span className="text-[10px] text-muted-foreground">{formatSize(item.file_size_bytes)}</span>
                </div>
                <div className="flex items-center gap-1 mt-1">
                  {item.is_free && <Badge className="bg-emerald-500/20 text-emerald-400 text-[10px] px-1.5 py-0 border-0">Free</Badge>}
                  {item.is_premium && <Badge className="bg-amber-500/20 text-amber-400 text-[10px] px-1.5 py-0 border-0">Premium</Badge>}
                  {!item.is_free && <span className="text-[10px] text-muted-foreground">💎 {item.price_diamonds}</span>}
                  {item.min_level > 0 && <span className="text-[10px] text-muted-foreground">Lv{item.min_level}+</span>}
                </div>
              </div>
            </div>

            {/* Actions */}
            <div className="flex items-center gap-1 mt-3 pt-3 border-t border-muted/20">
              <Button variant="ghost" size="sm" onClick={() => onEdit(item)} className="h-7 text-xs">
                <Edit className="w-3 h-3 mr-1" /> Edit
              </Button>
              <Button variant="ghost" size="sm" onClick={() => onToggle(item)} className="h-7 text-xs">
                {item.is_active ? <EyeOff className="w-3 h-3 mr-1" /> : <Eye className="w-3 h-3 mr-1" />}
                {item.is_active ? "Hide" : "Show"}
              </Button>
              <Button variant="ghost" size="sm" onClick={() => onDelete(item)} className="h-7 text-xs text-destructive hover:text-destructive">
                <Trash2 className="w-3 h-3 mr-1" /> Delete
              </Button>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
};

export default AdminBeautyFilters;
