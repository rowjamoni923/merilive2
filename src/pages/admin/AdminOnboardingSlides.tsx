import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { adminSupabase as supabase } from "@/integrations/supabase/adminClient";
import { toast } from "sonner";
import { ArrowLeft, Plus, Pencil, Trash2, GripVertical, Eye, EyeOff, Image } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useAdminRealtime } from "@/hooks/useAdminRealtime";
import { SmartImage } from "@/components/ui/smart-image";

interface OnboardingSlide {
  id: string;
  image_url: string;
  title: string;
  description: string;
  gradient: string;
  display_order: number;
  is_active: boolean;
}

const GRADIENT_OPTIONS = [
  { label: "Primary → Accent", value: "from-primary to-accent" },
  { label: "Pink → Rose", value: "from-pink-500 to-rose-500" },
  { label: "Blue → Cyan", value: "from-blue-500 to-cyan-500" },
  { label: "Red → Orange", value: "from-red-500 to-orange-500" },
  { label: "Amber → Yellow", value: "from-amber-500 to-yellow-500" },
  { label: "Purple → Indigo", value: "from-purple-500 to-indigo-500" },
  { label: "Green → Emerald", value: "from-green-500 to-emerald-500" },
];

const AdminOnboardingSlides = () => {
  const navigate = useNavigate();
  const [slides, setSlides] = useState<OnboardingSlide[]>([]);
  const [loading, setLoading] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingSlide, setEditingSlide] = useState<OnboardingSlide | null>(null);
  const [form, setForm] = useState({
    image_url: "",
    title: "",
    description: "",
    gradient: "from-primary to-accent",
    display_order: 0,
    is_active: true,
  });

  const fetchSlides = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("onboarding_slides")
        .select("*")
        .order("display_order");
      if (error) throw error;
      setSlides(data || []);
    } catch (err: any) {
      toast.error("Failed to load slides");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchSlides(); }, [fetchSlides]);
  useAdminRealtime(["onboarding_slides"], () => fetchSlides());

  const openCreate = () => {
    setEditingSlide(null);
    setForm({
    });
    setDialogOpen(true);
  };

  const openEdit = (slide: OnboardingSlide) => {
    setEditingSlide(slide);
    setForm({
    });
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!form.title || !form.image_url) {
      toast.error("Title and Image URL are required");
      return;
    }
    try {
      if (editingSlide) {
        const { error } = await supabase
          .from("onboarding_slides")
          .update({ ...form, updated_at: new Date().toISOString() })
          .eq("id", editingSlide.id);
        if (error) throw error;
        toast.success("Slide updated");
      } else {
        const { error } = await supabase
          .from("onboarding_slides")
          .insert([form]);
        if (error) throw error;
        toast.success("Slide created");
      }
      setDialogOpen(false);
      fetchSlides();
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Delete this slide?")) return;
    try {
      const { error } = await supabase.from("onboarding_slides").delete().eq("id", id);
      if (error) throw error;
      toast.success("Slide deleted");
      fetchSlides();
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  const toggleActive = async (slide: OnboardingSlide) => {
    try {
      const { error } = await supabase
        .from("onboarding_slides")
        .update({ is_active: !slide.is_active })
        .eq("id", slide.id);
      if (error) throw error;
      fetchSlides();
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  return (
    <div className="admin-pro-shell admin-content space-y-6 p-4 md:p-6 -mx-4 -my-4 sm:-mx-6 sm:-my-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => navigate("/admin")}>
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <div>
            <h1 className="text-2xl font-bold">Welcome Onboarding Slides</h1>
            <p className="text-sm text-muted-foreground">
              Manage the welcome tutorial slides shown to new users
            </p>
          </div>
        </div>
        <Button onClick={openCreate} className="gap-2">
          <Plus className="w-4 h-4" /> Add Slide
        </Button>
      </div>

      {loading ? (
        <div className="flex justify-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
        </div>
      ) : slides.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          <Image className="w-12 h-12 mx-auto mb-3 opacity-50" />
          <p>No onboarding slides yet</p>
        </div>
      ) : (
        <div className="grid gap-4">
          {slides.map((slide) => (
            <div
              key={slide.id}
              className={`flex items-center gap-4 p-4 rounded-xl border transition-all ${
                slide.is_active
                  ? "bg-card border-border"
                  : "bg-muted/30 border-border/50 opacity-60"
              }`}
            >
              <GripVertical className="w-5 h-5 text-muted-foreground shrink-0" />
              
              <div className="w-16 h-16 rounded-lg overflow-hidden shrink-0 bg-muted">
                <SmartImage
                  src={slide.image_url}
                  alt={slide.title}
                  className="w-full h-full object-cover"
                  onError={(e) => {
                    (e.target as HTMLImageElement).src = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='64' height='64'%3E%3Crect fill='%23333' width='64' height='64'/%3E%3Ctext fill='%23999' x='50%25' y='50%25' text-anchor='middle' dy='.3em' font-size='10'%3ENo img%3C/text%3E%3C/svg%3E";
                  }}
                />
              </div>

              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-mono bg-primary/20 text-primary px-1.5 py-0.5 rounded">
                    #{slide.display_order}
                  </span>
                  <h3 className="font-semibold truncate">{slide.title}</h3>
                </div>
                <p className="text-sm text-muted-foreground truncate mt-0.5">
                  {slide.description}
                </p>
                <div className={`inline-block mt-1 text-xs px-2 py-0.5 rounded-full bg-gradient-to-r ${slide.gradient} text-white`}>
                  {slide.gradient}
                </div>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                <Switch
                  checked={slide.is_active}
                  onCheckedChange={() => toggleActive(slide)}
                />
                <Button variant="ghost" size="icon" onClick={() => openEdit(slide)}>
                  <Pencil className="w-4 h-4" />
                </Button>
                <Button variant="ghost" size="icon" onClick={() => handleDelete(slide.id)} className="text-destructive">
                  <Trash2 className="w-4 h-4" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Create/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {editingSlide ? "Edit Slide" : "Add New Slide"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium">Title *</label>
              <Input
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
                placeholder="Welcome to meriLIVE!"
              />
            </div>
            <div>
              <label className="text-sm font-medium">Description *</label>
              <Textarea
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                placeholder="Your new social entertainment hub..."
                rows={3}
              />
            </div>
            <div>
              <label className="text-sm font-medium">Image URL *</label>
              <Input
                value={form.image_url}
                onChange={(e) => setForm({ ...form, image_url: e.target.value })}
                placeholder="https://..."
              />
              {form.image_url && (
                <div className="mt-2 w-full h-40 rounded-lg overflow-hidden bg-muted">
                  <SmartImage src={form.image_url} alt="Preview" className="w-full h-full object-cover" fallbackSrc="/placeholder.svg" />
                </div>
              )}
            </div>
            <div>
              <label className="text-sm font-medium">Button Gradient</label>
              <select
                value={form.gradient}
                onChange={(e) => setForm({ ...form, gradient: e.target.value })}
                className="w-full mt-1 rounded-md border border-border bg-background px-3 py-2 text-sm"
              >
                {GRADIENT_OPTIONS.map((g) => (
                  <option key={g.value} value={g.value}>{g.label}</option>
                ))}
              </select>
            </div>
            <div className="flex gap-4">
              <div className="flex-1">
                <label className="text-sm font-medium">Display Order</label>
                <Input
                  type="number"
                  value={form.display_order}
                  onChange={(e) => setForm({ ...form, display_order: parseInt(e.target.value) || 0 })}
                />
              </div>
              <div className="flex items-end gap-2 pb-1">
                <Switch
                  checked={form.is_active}
                  onCheckedChange={(v) => setForm({ ...form, is_active: v })}
                />
                <span className="text-sm">Active</span>
              </div>
            </div>
            <Button onClick={handleSave} className="w-full">
              {editingSlide ? "Update Slide" : "Create Slide"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default AdminOnboardingSlides;
