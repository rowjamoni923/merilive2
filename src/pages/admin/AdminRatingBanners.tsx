import { useState, useEffect } from "react";
import useAdminRealtime from "@/hooks/useAdminRealtime";
import { Plus, Edit2, Trash2, Star, Upload, Eye, EyeOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { adminSupabase as supabase } from "@/integrations/supabase/adminClient";
import { toast } from "sonner";
import { recordAdminError } from "@/utils/adminErrorLog";
import AdminPageHeader from "@/components/admin/AdminPageHeader";

interface RatingBanner {
  id: string;
  title: string;
  image_url: string;
  is_active: boolean;
  display_order: number;
  created_at: string;
}

const empty = { title: "", image_url: "", is_active: true, display_order: 0 };

export default function AdminRatingBanners() {
  const [banners, setBanners] = useState<RatingBanner[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [editing, setEditing] = useState<RatingBanner | null>(null);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(empty);

  const fetchBanners = async () => {
    try {
      const { data, error } = await supabase
        .from("rating_banners")
        .select("*")
        .order("display_order", { ascending: true });
      if (error) throw error;
      setBanners(data || []);
    } catch (e) {
      recordAdminError({ kind: "rest", label: "AdminRatingBanners.fetch", message: e instanceof Error ? e.message : String(e) });
      toast.error("Failed to load rating banners");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchBanners(); }, []);
  useAdminRealtime(["rating_banners"], () => fetchBanners());

  const upload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const ext = file.name.split(".").pop();
      const name = `rating-banner-${Date.now()}.${ext}`;
      const { error } = await supabase.storage.from("banners").upload(name, file, { upsert: true });
      if (error) throw error;
      const { data } = supabase.storage.from("banners").getPublicUrl(name);
      setForm(p => ({ ...p, image_url: data.publicUrl }));
      toast.success("Image uploaded");
    } catch (e: any) {
      toast.error("Upload failed: " + (e.message || ""));
    } finally {
      setUploading(false);
    }
  };

  const openNew = () => { setEditing(null); setForm(empty); setOpen(true); };
  const openEdit = (b: RatingBanner) => {
    setEditing(b);
    setForm({ title: b.title, image_url: b.image_url, is_active: b.is_active, display_order: b.display_order });
    setOpen(true);
  };

  const save = async () => {
    if (!form.title || !form.image_url) {
      toast.error("Title and image are required");
      return;
    }
    setSaving(true);
    try {
      if (editing) {
        const { error } = await supabase.from("rating_banners").update({ ...form, updated_at: new Date().toISOString() }).eq("id", editing.id);
        if (error) throw error;
        toast.success("Banner updated");
      } else {
        const { error } = await supabase.from("rating_banners").insert(form);
        if (error) throw error;
        toast.success("Banner created");
      }
      setOpen(false);
      fetchBanners();
    } catch (e: any) {
      toast.error("Save failed: " + (e.message || ""));
    } finally {
      setSaving(false);
    }
  };

  const toggleActive = async (b: RatingBanner) => {
    const { error } = await supabase.from("rating_banners").update({ is_active: !b.is_active }).eq("id", b.id);
    if (error) toast.error("Toggle failed");
    else fetchBanners();
  };

  const remove = async (b: RatingBanner) => {
    if (!confirm(`Delete banner "${b.title}"?`)) return;
    const { error } = await supabase.from("rating_banners").delete().eq("id", b.id);
    if (error) toast.error("Delete failed");
    else { toast.success("Deleted"); fetchBanners(); }
  };

  return (
    <div className="admin-content space-y-6 p-4 md:p-6">
      <AdminPageHeader
        icon={Star}
        title="Rating Reward Banners"
        subtitle="Premium half-screen banners shown in the rating + giveaway popup. Active banners rotate randomly. Users win 10,000 Diamonds, Hosts win 10,000 Beans."
      />

      <div className="flex justify-end">
        <Button onClick={openNew} className="gap-2">
          <Plus className="w-4 h-4" /> New Rating Banner
        </Button>
      </div>

      {loading ? (
        <div className="text-muted-foreground text-sm">Loading…</div>
      ) : banners.length === 0 ? (
        <Card><CardContent className="py-12 text-center text-muted-foreground">
          No rating banners yet. Click "New Rating Banner" to add one.
        </CardContent></Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {banners.map((b) => (
            <Card key={b.id} className="overflow-hidden">
              <div className="aspect-[3/4] bg-muted overflow-hidden">
                <img src={b.image_url} alt={b.title} className="w-full h-full object-cover" />
              </div>
              <CardContent className="p-3 space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <div className="font-medium truncate">{b.title}</div>
                  <span className={`text-[10px] px-2 py-0.5 rounded ${b.is_active ? "bg-green-500/20 text-green-400" : "bg-muted text-muted-foreground"}`}>
                    {b.is_active ? "Active" : "Inactive"}
                  </span>
                </div>
                <div className="text-xs text-muted-foreground">Order: {b.display_order}</div>
                <div className="flex gap-2 pt-1">
                  <Button size="sm" variant="outline" onClick={() => toggleActive(b)} className="flex-1">
                    {b.is_active ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => openEdit(b)} className="flex-1">
                    <Edit2 className="w-3.5 h-3.5" />
                  </Button>
                  <Button size="sm" variant="destructive" onClick={() => remove(b)} className="flex-1">
                    <Trash2 className="w-3.5 h-3.5" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editing ? "Edit Rating Banner" : "New Rating Banner"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Title</Label>
              <Input value={form.title} onChange={(e) => setForm(p => ({ ...p, title: e.target.value }))} placeholder="e.g. Royal Purple Edition" />
            </div>
            <div>
              <Label>Banner Image (recommended 1024×1408, vertical 3:4)</Label>
              <div className="flex gap-2">
                <Input value={form.image_url} onChange={(e) => setForm(p => ({ ...p, image_url: e.target.value }))} placeholder="https://…" />
                <label className="inline-flex items-center justify-center px-3 rounded-md border cursor-pointer hover:bg-accent">
                  <Upload className="w-4 h-4" />
                  <input type="file" accept="image/*" className="hidden" onChange={upload} disabled={uploading} />
                </label>
              </div>
              {form.image_url && (
                <img src={form.image_url} alt="preview" className="mt-2 max-h-48 rounded-md border" />
              )}
            </div>
            <div>
              <Label>Display Order</Label>
              <Input type="number" value={form.display_order} onChange={(e) => setForm(p => ({ ...p, display_order: Number(e.target.value) || 0 }))} />
            </div>
            <div className="flex items-center justify-between">
              <Label>Active</Label>
              <Switch checked={form.is_active} onCheckedChange={(v) => setForm(p => ({ ...p, is_active: v }))} />
            </div>
            <Button onClick={save} disabled={saving || uploading} className="w-full">
              {saving ? "Saving…" : "Save Banner"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
