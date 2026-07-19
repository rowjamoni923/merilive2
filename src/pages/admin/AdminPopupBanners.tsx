import { useState, useEffect } from "react";
import useAdminRealtime from "@/hooks/useAdminRealtime";
import { Plus, Edit2, Trash2, Save, X, Megaphone, Upload, Link2, Eye, EyeOff, Clock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { adminSupabase as supabase } from "@/integrations/supabase/adminClient";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { recordAdminError } from "@/utils/adminErrorLog";
import { SmartImage } from "@/components/ui/smart-image";

import { formatAdminError } from "@/utils/formatAdminError";
interface PopupBanner {
  id: string;
  title: string;
  description: string | null;
  image_url: string;
  link_url: string | null;
  link_type: string | null;
  display_duration_seconds: number;
  skip_delay_seconds: number;
  auto_dismiss_seconds: number;
  is_active: boolean;
  display_order: number;
  start_date: string | null;
  end_date: string | null;
  created_at: string;
}

const AdminPopupBanners = () => {
  const [banners, setBanners] = useState<PopupBanner[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [editingBanner, setEditingBanner] = useState<PopupBanner | null>(null);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [formData, setFormData] = useState({
    title: '', description: '', image_url: '', link_url: '', link_type: 'internal',
    display_duration_seconds: 3, skip_delay_seconds: 3, auto_dismiss_seconds: 10,
    is_active: true, display_order: 0, start_date: '', end_date: '',
  });

  useAdminRealtime(['popup_event_banners'], () => fetchBanners());

  const fetchBanners = async () => {
    try {
      const { data, error } = await supabase.from('popup_event_banners').select('*').order('display_order');
      if (error) throw error;
      setBanners(data || []);
    } catch (error) {
      recordAdminError({ kind: "rpc", label: "AdminPopupBanners.ErrorFetchingPopupBanners", message: formatAdminError(error)});
      toast.error('Failed to load popup banners');
    } finally {
      setLoading(false);
    }
  };

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const ext = file.name.split('.').pop();
      const fileName = `popup-banner-${Date.now()}.${ext}`;
      const { error } = await supabase.storage.from('banners').upload(fileName, file, { upsert: true, cacheControl: '2592000' });
      if (error) throw error;
      const { data: urlData } = supabase.storage.from('banners').getPublicUrl(fileName);
      setFormData(prev => ({ ...prev, image_url: urlData.publicUrl }));
      toast.success('Image uploaded');
    } catch (error: any) {
      toast.error('Upload failed: ' + (error.message || ''));
    } finally {
      setUploading(false);
    }
  };

  const handleSave = async () => {
    if (!formData.title || !formData.image_url) {
      toast.error('Title and image are required');
      return;
    }
    setSaving(true);
    try {
      const payload = {
        image_url: formData.image_url, link_url: formData.link_url || null,
        link_type: formData.link_type || 'internal',
        skip_delay_seconds: formData.skip_delay_seconds || 3,
        auto_dismiss_seconds: formData.auto_dismiss_seconds ?? 10,
        start_date: formData.start_date || null, end_date: formData.end_date || null,
      };

      if (editingBanner) {
        const { error } = await supabase.from('popup_event_banners').update(payload).eq('id', editingBanner.id);
        if (error) throw error;
        toast.success('Banner updated');
      } else {
        const { error } = await supabase.from('popup_event_banners').insert([payload]);
        if (error) throw error;
        toast.success('New banner created');
      }
      setIsDialogOpen(false);
      setEditingBanner(null);
      resetForm();
    } catch (error) {
      recordAdminError({ kind: "rpc", label: "AdminPopupBanners.ErrorSaving", message: formatAdminError(error)});
      toast.error('Failed to save');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this banner?')) return;
    try {
      const { error } = await supabase.from('popup_event_banners').delete().eq('id', id);
      if (error) throw error;
      toast.success('Banner deleted');
    } catch (error) {
      toast.error('Failed to delete');
    }
  };

  const handleEdit = (banner: PopupBanner) => {
    setEditingBanner(banner);
    setFormData({
      end_date: banner.end_date ? banner.end_date.split('T')[0] : '',
    });
    setIsDialogOpen(true);
  };

  const resetForm = () => {
    setFormData({
    });
  };

  const toggleActive = async (banner: PopupBanner) => {
    try {
      const { error } = await supabase.from('popup_event_banners').update({ is_active: !banner.is_active }).eq('id', banner.id);
      if (error) throw error;
    } catch (error) {
      toast.error('Failed to update');
    }
  };

  if (loading) return <div className="p-6 text-slate-900">Loading...</div>;

  return (
    <div className="admin-pro-shell admin-content p-4 md:p-6 space-y-4 md:space-y-6 -mx-4 -my-4 sm:-mx-6 sm:-my-6">
      <div className="bg-gradient-to-r from-violet-600 via-purple-600 to-fuchsia-600 rounded-xl md:rounded-2xl p-4 md:p-6 shadow-xl">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
          <div>
            <h1 className="text-xl md:text-2xl font-bold text-slate-900 flex items-center gap-2">
              <Megaphone className="w-5 h-5 md:w-6 md:h-6" />
              Popup Event Banners
            </h1>
            <p className="text-slate-900/90 text-sm mt-1">Shows popup banner when app opens</p>
          </div>
          <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
            <DialogTrigger asChild>
              <Button onClick={() => { setEditingBanner(null); resetForm(); }} className="bg-slate-50 hover:bg-white/30 text-slate-900 border border-white/30">
                <Plus className="w-4 h-4 mr-2" /> New Banner
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-lg bg-white border-slate-200 max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle className="text-slate-900">
                  {editingBanner ? 'Edit Banner' : 'New Popup Banner'}
                </DialogTitle>
              </DialogHeader>
              <div className="space-y-4">
                <div>
                  <Label className="text-slate-700">Title *</Label>
                  <Input value={formData.title} onChange={(e) => setFormData({ ...formData, title: e.target.value })} placeholder="Event title" className="mt-1 bg-slate-50 border-slate-200 text-slate-900" />
                </div>
                <div>
                  <Label className="text-slate-700">Description</Label>
                  <Input value={formData.description} onChange={(e) => setFormData({ ...formData, description: e.target.value })} placeholder="Optional description" className="mt-1 bg-slate-50 border-slate-200 text-slate-900" />
                </div>
                <div>
                  <Label className="text-slate-700">Banner Image *</Label>
                  {formData.image_url && (
                    <div className="mt-2 rounded-lg overflow-hidden border border-slate-200 mb-2">
                      <SmartImage src={formData.image_url} alt="Preview" className="w-full h-auto max-h-48 object-contain bg-black/50" fallbackSrc="/placeholder.svg" />
                    </div>
                  )}
                  <div className="flex gap-2 mt-1">
                    <Input value={formData.image_url} onChange={(e) => setFormData({ ...formData, image_url: e.target.value })} placeholder="Image URL" className="bg-slate-50 border-slate-200 text-slate-900 text-sm" />
                  </div>
                  <label className="mt-2 flex items-center gap-2 cursor-pointer bg-slate-50 border border-slate-200 border-dashed rounded-lg px-3 py-2 hover:bg-slate-700/50 transition-colors">
                    <Upload className="w-4 h-4 text-purple-400" />
                    <span className="text-slate-600 text-sm">{uploading ? 'Uploading...' : 'Upload File'}</span>
                    <input type="file" accept="image/*" className="hidden" onChange={handleImageUpload} disabled={uploading} />
                  </label>
                </div>
                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <Label className="text-slate-700 flex items-center gap-1"><Clock className="w-3 h-3" /> Close Btn Delay (s)</Label>
                    <Input type="number" min={1} value={formData.skip_delay_seconds} onChange={(e) => setFormData({ ...formData, skip_delay_seconds: parseInt(e.target.value) || 3 })} className="mt-1 bg-slate-50 border-slate-200 text-slate-900" />
                  </div>
                  <div>
                    <Label className="text-slate-700 flex items-center gap-1"><Clock className="w-3 h-3" /> Auto Dismiss (s)</Label>
                    <Input type="number" min={0} value={formData.auto_dismiss_seconds} onChange={(e) => setFormData({ ...formData, auto_dismiss_seconds: parseInt(e.target.value) || 0 })} className="mt-1 bg-slate-50 border-slate-200 text-slate-900" />
                  </div>
                  <div>
                    <Label className="text-slate-700">Display Order</Label>
                    <Input type="number" value={formData.display_order} onChange={(e) => setFormData({ ...formData, display_order: parseInt(e.target.value) || 0 })} className="mt-1 bg-slate-50 border-slate-200 text-slate-900" />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label className="text-slate-700">Start Date</Label>
                    <Input type="date" value={formData.start_date} onChange={(e) => setFormData({ ...formData, start_date: e.target.value })} className="mt-1 bg-slate-50 border-slate-200 text-slate-900" />
                  </div>
                  <div>
                    <Label className="text-slate-700">End Date</Label>
                    <Input type="date" value={formData.end_date} onChange={(e) => setFormData({ ...formData, end_date: e.target.value })} className="mt-1 bg-slate-50 border-slate-200 text-slate-900" />
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Switch checked={formData.is_active} onCheckedChange={(checked) => setFormData({ ...formData, is_active: checked })} />
                  <Label className="text-slate-700">Active</Label>
                </div>
                <div className="flex gap-2 pt-4">
                  <Button onClick={handleSave} disabled={saving} className="flex-1 bg-gradient-to-r from-violet-500 to-fuchsia-500 text-white">
                    <Save className="w-4 h-4 mr-2" /> {saving ? 'Saving...' : 'Save'}
                  </Button>
                  <Button variant="outline" onClick={() => setIsDialogOpen(false)} className="border-slate-200 text-slate-700 hover:bg-slate-50">
                    <X className="w-4 h-4 mr-2" /> Cancel
                  </Button>
                </div>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      <div className="grid gap-3 md:gap-4">
        {banners.map((banner) => (
          <Card key={banner.id} className={cn("bg-white border-slate-200/50 shadow-lg overflow-hidden", !banner.is_active && 'opacity-50')}>
            <CardContent className="p-0">
              <div className="flex gap-3 md:gap-4">
                <div className="w-24 md:w-32 shrink-0">
                  <SmartImage src={banner.image_url} alt={banner.title} className="w-full h-full object-cover min-h-[80px]" fallbackSrc="/placeholder.svg" />
                </div>
                <div className="flex-1 py-3 pr-3 min-w-0">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <h3 className="font-semibold text-slate-900 truncate">{banner.title}</h3>
                      <p className="text-xs text-slate-600 mt-0.5">Skip after: {banner.skip_delay_seconds}s • Auto-close: {banner.auto_dismiss_seconds}s • Order: {banner.display_order}</p>
                      {banner.start_date && (
                        <p className="text-[10px] text-slate-500 mt-1">
                          {new Date(banner.start_date).toLocaleDateString()} — {banner.end_date ? new Date(banner.end_date).toLocaleDateString() : 'Ongoing'}
                        </p>
                      )}
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <Switch checked={banner.is_active} onCheckedChange={() => toggleActive(banner)} />
                      <Button variant="ghost" size="icon" onClick={() => handleEdit(banner)} className="text-slate-600 hover:text-slate-900 hover:bg-slate-50 h-8 w-8">
                        <Edit2 className="w-3.5 h-3.5" />
                      </Button>
                      <Button variant="ghost" size="icon" onClick={() => handleDelete(banner.id)} className="text-red-400 hover:text-red-300 hover:bg-slate-50 h-8 w-8">
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}

        {banners.length === 0 && (
          <div className="text-center py-12 text-slate-600 bg-white rounded-xl border border-slate-200">
            <Megaphone className="w-10 h-10 mx-auto mb-3 text-slate-600" />
            No popup banners yet. Create a new banner.
          </div>
        )}
      </div>
    </div>
  );
};

export default AdminPopupBanners;