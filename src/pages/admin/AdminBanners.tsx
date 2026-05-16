import { useState, useEffect, useRef } from "react";
import useAdminRealtime from "@/hooks/useAdminRealtime";
import { 
  Plus, Edit, Trash2, Eye, EyeOff, Save, Image, Link as LinkIcon, 
  Upload, GripVertical, ExternalLink, Palette 
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { adminSupabase as supabase } from "@/integrations/supabase/adminClient";
import { toast } from "sonner";
import { recordAdminError } from "@/utils/adminErrorLog";

import { formatAdminError } from "@/utils/formatAdminError";
interface Banner {
  id: string;
  title: string;
  subtitle: string | null;
  image_url: string | null;
  link_url: string | null;
  link_type: string;
  background_color: string;
  text_color: string;
  accent_color: string;
  display_order: number;
  is_active: boolean;
  start_date: string | null;
  end_date: string | null;
  created_at: string;
  updated_at: string;
}

export default function AdminBanners() {
  const [banners, setBanners] = useState<Banner[]>([]);
  const [loading, setLoading] = useState(false);
  const [showEditor, setShowEditor] = useState(false);
  const [editingBanner, setEditingBanner] = useState<Banner | null>(null);
  const [saving, setSaving] = useState(false);
  const actionGuardRef = useRef<Set<string>>(new Set());
  const guardStart = (key: string) => { if (actionGuardRef.current.has(key)) return false; actionGuardRef.current.add(key); return true; };
  const guardEnd = (key: string) => { actionGuardRef.current.delete(key); };
  const [uploading, setUploading] = useState(false);
  const [inactiveBannerCount, setInactiveBannerCount] = useState(0);

  // Editor form states
  const [formData, setFormData] = useState({
    title: "",
    subtitle: "",
    image_url: "",
    link_url: "",
    link_type: "popup",
    background_color: "#8B1538",
    text_color: "#FFFFFF",
    accent_color: "#FFD700",
    display_order: 0,
    is_active: true,
    start_date: "",
    end_date: "",
  });

  const fetchBanners = async () => {
    try {
      const { data, error } = await supabase
        .from("banners")
        .select("*")
        .order("display_order", { ascending: true });

      if (error) throw error;
      setBanners(data || []);
      const inactiveC = (data || []).filter(b => !b.is_active).length;
      setInactiveBannerCount(inactiveC);
    } catch (error) {
      recordAdminError({ kind: "rpc", label: "AdminBanners.ErrorFetchingBanners", message: formatAdminError(error)});
      toast.error("Failed to load banners");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchBanners();
  }, []);

  // Real-time updates
  useAdminRealtime(['banners'], fetchBanners, 'admin-banners-rt');

  const openEditor = (banner: Banner | null) => {
    if (banner) {
      setEditingBanner(banner);
      setFormData({
        title: banner.title,
        subtitle: banner.subtitle || "",
        image_url: banner.image_url || "",
        link_url: banner.link_url || "",
        link_type: banner.link_type || "popup",
        background_color: banner.background_color || "#8B1538",
        text_color: banner.text_color || "#FFFFFF",
        accent_color: banner.accent_color || "#FFD700",
        display_order: banner.display_order,
        is_active: banner.is_active,
        start_date: banner.start_date?.split("T")[0] || "",
        end_date: banner.end_date?.split("T")[0] || "",
      });
    } else {
      setEditingBanner(null);
      setFormData({
        title: "",
        subtitle: "",
        image_url: "",
        link_url: "",
        link_type: "popup",
        background_color: "#8B1538",
        text_color: "#FFFFFF",
        accent_color: "#FFD700",
        display_order: banners.length,
        is_active: true,
        start_date: "",
        end_date: "",
      });
    }
    setShowEditor(true);
  };

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(true);
    try {
      const fileExt = file.name.split(".").pop();
      const fileName = `banner_${Date.now()}.${fileExt}`;
      const filePath = `banners/${fileName}`;

      const { error: uploadError } = await supabase.storage
        .from("level-assets")
        .upload(filePath, file);

      if (uploadError) throw uploadError;

      const { data } = supabase.storage
        .from("level-assets")
        .getPublicUrl(filePath);

      setFormData({ ...formData, image_url: data.publicUrl });
      toast.success("Image uploaded");
    } catch (error: any) {
      toast.error("Image upload failed");
    } finally {
      setUploading(false);
    }
  };

  const handleSave = async () => {
    if (!formData.title.trim()) {
      toast.error("Please enter a title");
      return;
    }
    if (!guardStart('save-banner')) return;
    setSaving(true);
    try {
      const bannerData = {
        title: formData.title,
        subtitle: formData.subtitle || null,
        image_url: formData.image_url || null,
        link_url: formData.link_url || null,
        link_type: formData.link_type,
        background_color: formData.background_color,
        text_color: formData.text_color,
        accent_color: formData.accent_color,
        display_order: formData.display_order,
        is_active: formData.is_active,
        start_date: formData.start_date ? new Date(formData.start_date).toISOString() : null,
        end_date: formData.end_date ? new Date(formData.end_date).toISOString() : null,
      };

      if (editingBanner) {
        const { error } = await supabase
          .from("banners")
          .update(bannerData)
          .eq("id", editingBanner.id);

        if (error) throw error;
        toast.success("Banner updated");
      } else {
        const { error } = await supabase
          .from("banners")
          .insert(bannerData);

        if (error) throw error;
        toast.success("New banner created");
      }

      setShowEditor(false);
      fetchBanners();
    } catch (error: any) {
      toast.error(error.message || "Failed to save");
    } finally {
      setSaving(false);
      guardEnd('save-banner');
    }
  };

  const handleDelete = async (bannerId: string) => {
    if (!confirm("Delete this banner?")) return;
    if (!guardStart(`delete-${bannerId}`)) return;

    try {
      const { error } = await supabase
        .from("banners")
        .delete()
        .eq("id", bannerId);

      if (error) throw error;
      toast.success("Banner deleted");
      fetchBanners();
    } catch (error: any) {
      toast.error(error.message || "Failed to delete");
    } finally {
      guardEnd(`delete-${bannerId}`);
    }
  };

  const toggleActive = async (banner: Banner) => {
    try {
      const { error } = await supabase
        .from("banners")
        .update({ is_active: !banner.is_active })
        .eq("id", banner.id);

      if (error) throw error;
      fetchBanners();
      toast.success(banner.is_active ? "Banner deactivated" : "Banner activated");
    } catch (error: any) {
      toast.error(error.message || "Failed to update");
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="w-12 h-12 border-4 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-4 md:space-y-6 px-2 md:px-0">
      <div className="flex flex-col gap-3 p-4 md:p-6 bg-gradient-to-r from-white via-purple-50/50 to-blue-50/50 rounded-xl md:rounded-2xl shadow-lg border border-slate-200/50">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
          <div>
            <h1 className="text-xl md:text-2xl font-bold text-slate-800">Banner Management</h1>
            <p className="text-slate-600 text-sm mt-1">Manage homepage banners</p>
          </div>
          <div className="flex items-center gap-2 self-start md:self-auto">
            <Button
              variant="outline"
              size="sm"
              onClick={fetchBanners}
              disabled={loading}
              className="bg-white/50"
            >
              <svg className={`w-4 h-4 mr-1 ${loading ? 'animate-spin' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
              Refresh
            </Button>
            <Button onClick={() => openEditor(null)} size="sm" className="gap-2 bg-gradient-to-r from-pink-500 to-purple-600 shadow-lg">
              <Plus className="w-4 h-4" />
              New Banner
            </Button>
          </div>
        </div>
      </div>

       {/* Inactive Banners Warning */}
       {inactiveBannerCount > 0 && (
         <div className="flex items-center gap-3 p-3 rounded-xl bg-amber-100 border border-amber-200">
           <EyeOff className="w-5 h-5 text-amber-600" />
           <div className="flex-1">
             <p className="text-sm font-medium text-amber-700">
              {inactiveBannerCount} banners currently inactive
              </p>
              <p className="text-xs text-amber-500/70">See in list below</p>
           </div>
           <Badge className="bg-amber-500 text-white">{inactiveBannerCount}</Badge>
         </div>
       )}

       {/* Banners List */}
       <div className="space-y-4">
        {banners.map((banner) => (
          <Card key={banner.id} className="bg-white border-slate-200 shadow-lg hover:shadow-xl transition-shadow">
            <CardContent className="p-4">
              <div className="flex items-center gap-4">
                {/* Preview */}
                <div 
                  className="w-48 h-auto min-h-[4rem] rounded-lg flex-shrink-0 shadow-md overflow-hidden"
                  style={{ backgroundColor: banner.background_color }}
                >
                  {banner.image_url ? (
                    <img 
                      src={banner.image_url} 
                      alt={banner.title}
                      className="w-full h-auto object-contain rounded-lg" onError={(e) => { const t = e.currentTarget; if (t.src.indexOf('/placeholder.svg') === -1) t.src = '/placeholder.svg'; }} />
                  ) : (
                    <div className="flex items-center justify-between px-4 h-16">
                      <div>
                        <p className="font-bold text-sm" style={{ color: banner.text_color }}>
                          {banner.title}
                        </p>
                        {banner.subtitle && (
                          <p className="text-xs opacity-80" style={{ color: banner.text_color }}>
                            {banner.subtitle}
                          </p>
                        )}
                      </div>
                      <span className="text-lg font-bold" style={{ color: banner.accent_color }}>
                        {banner.title.split(" ")[0]}
                      </span>
                    </div>
                  )}
                </div>

                {/* Info */}
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <h3 className="text-slate-800 font-semibold">{banner.title}</h3>
                    <Badge className={banner.is_active ? "bg-green-100 text-green-600 border-green-200" : "bg-slate-100 text-slate-600 border-slate-200"}>
                      {banner.is_active ? "Active" : "Inactive"}
                    </Badge>
                    {banner.link_url && (
                      <Badge className="bg-blue-100 text-blue-600 border-blue-200">
                        <LinkIcon className="w-3 h-3 mr-1" />
                        {banner.link_type === "popup" ? "Popup" : "Link"}
                      </Badge>
                    )}
                  </div>
                  {banner.subtitle && (
                    <p className="text-slate-500 text-sm mt-1">{banner.subtitle}</p>
                  )}
                  <div className="flex items-center gap-2 mt-2 text-xs text-slate-400">
                    <span>Order: {banner.display_order}</span>
                    {banner.start_date && (
                      <span>• Start: {new Date(banner.start_date).toLocaleDateString()}</span>
                    )}
                    {banner.end_date && (
                      <span>• End: {new Date(banner.end_date).toLocaleDateString()}</span>
                    )}
                  </div>
                </div>

                {/* Actions */}
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => openEditor(banner)}
                    className="border-slate-200 text-slate-700 hover:bg-slate-100"
                  >
                    <Edit className="w-4 h-4" />
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => toggleActive(banner)}
                    className="border-slate-200 text-slate-700 hover:bg-slate-100"
                  >
                    {banner.is_active ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleDelete(banner.id)}
                    className="border-red-200 text-red-500 hover:bg-red-50"
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}

        {banners.length === 0 && (
          <div className="text-center py-12 text-slate-400 bg-white rounded-xl border border-slate-200 shadow-lg">
            <Image className="w-16 h-16 mx-auto mb-4 opacity-50" />
            <p>No banners found</p>
            <Button onClick={() => openEditor(null)} className="mt-4 bg-gradient-to-r from-pink-500 to-purple-600">
              Create First Banner
            </Button>
          </div>
        )}
      </div>

      {/* Editor Dialog */}
      <Dialog open={showEditor} onOpenChange={setShowEditor}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {editingBanner ? "Edit Banner" : "Create New Banner"}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            {/* Preview */}
            <div className="space-y-2">
              <Label>Preview</Label>
              {formData.image_url ? (
                <div className="w-full rounded-xl overflow-hidden">
                  <img 
                    src={formData.image_url} 
                    alt="Banner Preview"
                    className="w-full h-auto object-contain rounded-xl" onError={(e) => { const t = e.currentTarget; if (t.src.indexOf('/placeholder.svg') === -1) t.src = '/placeholder.svg'; }} />
                </div>
              ) : (
                <div 
                  className="w-full h-20 rounded-xl flex items-center justify-between px-6"
                  style={{ backgroundColor: formData.background_color }}
                >
                  <div>
                    <h3 className="text-xl font-bold" style={{ color: formData.text_color }}>
                      {formData.title || "Banner Title"}
                    </h3>
                    <p className="text-sm opacity-80" style={{ color: formData.text_color }}>
                      {formData.subtitle || "Subtitle"}
                    </p>
                  </div>
                  <span className="text-4xl font-bold" style={{ color: formData.accent_color }}>
                    {formData.title.split(" ")[0] || "2026"}
                  </span>
                </div>
              )}
            </div>

            {/* Basic Info */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Title *</Label>
                <Input
                  value={formData.title}
                  onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                  placeholder="e.g. 2026 GALA"
                />
              </div>
              <div className="space-y-2">
                <Label>Subtitle</Label>
                <Input
                  value={formData.subtitle}
                  onChange={(e) => setFormData({ ...formData, subtitle: e.target.value })}
                  placeholder="e.g. Special Event Coming Soon!"
                />
              </div>
            </div>

            {/* Image Upload */}
            <div className="space-y-2">
              <Label>Banner Image (Optional)</Label>
              <div className="flex gap-2">
                <Input
                  value={formData.image_url}
                  onChange={(e) => setFormData({ ...formData, image_url: e.target.value })}
                  placeholder="Image URL or upload"
                  className="flex-1"
                />
                <label className="cursor-pointer">
                  <Button variant="outline" asChild disabled={uploading}>
                    <span>
                      <Upload className="w-4 h-4 mr-2" />
                      {uploading ? "Uploading..." : "Upload"}
                    </span>
                  </Button>
                  <input 
                    type="file" 
                    className="hidden" 
                    accept="image/*"
                    onChange={handleImageUpload}
                  />
                </label>
              </div>
            </div>

            {/* Link Settings */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Link URL</Label>
                <Input
                  value={formData.link_url}
                  onChange={(e) => setFormData({ ...formData, link_url: e.target.value })}
                  placeholder="https://... or /page-name"
                />
              </div>
              <div className="space-y-2">
                <Label>Link Type</Label>
                <Select 
                  value={formData.link_type} 
                  onValueChange={(v) => setFormData({ ...formData, link_type: v })}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="popup">Popup (In-App)</SelectItem>
                    <SelectItem value="internal">Internal Navigation</SelectItem>
                    <SelectItem value="external">External (New Tab)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Colors */}
            <div className="space-y-2">
              <Label className="flex items-center gap-2">
                <Palette className="w-4 h-4" />
                Color Settings
              </Label>
              <div className="grid grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label className="text-xs">Background</Label>
                  <div className="flex gap-2">
                    <input
                      type="color"
                      value={formData.background_color}
                      onChange={(e) => setFormData({ ...formData, background_color: e.target.value })}
                      className="w-10 h-10 rounded cursor-pointer"
                    />
                    <Input
                      value={formData.background_color}
                      onChange={(e) => setFormData({ ...formData, background_color: e.target.value })}
                      className="flex-1"
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label className="text-xs">Text Color</Label>
                  <div className="flex gap-2">
                    <input
                      type="color"
                      value={formData.text_color}
                      onChange={(e) => setFormData({ ...formData, text_color: e.target.value })}
                      className="w-10 h-10 rounded cursor-pointer"
                    />
                    <Input
                      value={formData.text_color}
                      onChange={(e) => setFormData({ ...formData, text_color: e.target.value })}
                      className="flex-1"
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label className="text-xs">Accent Color</Label>
                  <div className="flex gap-2">
                    <input
                      type="color"
                      value={formData.accent_color}
                      onChange={(e) => setFormData({ ...formData, accent_color: e.target.value })}
                      className="w-10 h-10 rounded cursor-pointer"
                    />
                    <Input
                      value={formData.accent_color}
                      onChange={(e) => setFormData({ ...formData, accent_color: e.target.value })}
                      className="flex-1"
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* Schedule */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Start Date (Optional)</Label>
                <Input
                  type="date"
                  value={formData.start_date}
                  onChange={(e) => setFormData({ ...formData, start_date: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label>End Date (Optional)</Label>
                <Input
                  type="date"
                  value={formData.end_date}
                  onChange={(e) => setFormData({ ...formData, end_date: e.target.value })}
                />
              </div>
            </div>

            {/* Display Order & Active */}
            <div className="flex items-center justify-between">
              <div className="space-y-2">
                <Label>Display Order</Label>
                <Input
                  type="number"
                  value={formData.display_order}
                  onChange={(e) => setFormData({ ...formData, display_order: parseInt(e.target.value) || 0 })}
                  className="w-24"
                />
              </div>
              <div className="flex items-center gap-2">
                <Switch
                  checked={formData.is_active}
                  onCheckedChange={(v) => setFormData({ ...formData, is_active: v })}
                />
                <Label>Active</Label>
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowEditor(false)}>
              Cancel
            </Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving ? "Saving..." : (
                <>
                  <Save className="w-4 h-4 mr-2" />
                  Save
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Upload Loading Overlay */}
      {uploading && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[100]">
          <div className="bg-white dark:bg-slate-900 rounded-2xl p-6 flex flex-col items-center gap-4 shadow-2xl">
            <div className="w-12 h-12 border-4 border-purple-500 border-t-transparent rounded-full animate-spin" />
            <p className="font-medium">Uploading...</p>
            <Button 
              variant="outline" 
              size="sm"
              onClick={() => setUploading(false)}
              className="mt-2"
            >
              Cancel
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
