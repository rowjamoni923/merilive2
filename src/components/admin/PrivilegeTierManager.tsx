import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { Plus, Pencil, Trash2, RefreshCw, Copy } from "lucide-react";
import { SmartImage } from "@/components/ui/smart-image";
import AnimationUploader, { type AnimationFormat } from "@/components/admin/AnimationUploader";

export interface PrivilegeTier {
  id: string;
  privilege_type: string;
  unlock_level: number;
  name: string;
  description: string | null;
  animation_url: string | null;
  animation_format: string | null;
  preview_url: string | null;
  sound_url: string | null;
  duration_ms: number | null;
  icon_bg_color: string | null;
  icon_color: string | null;
  is_active: boolean;
  display_order: number;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  categoryType: string;
  categoryName: string;
  defaultBgColor: string;
  defaultIconColor: string;
}

const emptyTier = (
  categoryType: string,
  bg: string,
  ic: string,
  fallbackLevel: number,
): PrivilegeTier => ({
  id: "",
  privilege_type: categoryType,
  unlock_level: fallbackLevel,
  name: "",
  description: "",
  animation_url: null,
  animation_format: null,
  preview_url: null,
  sound_url: null,
  duration_ms: 3000,
  icon_bg_color: bg,
  icon_color: ic,
  is_active: true,
  display_order: fallbackLevel,
});

const PrivilegeTierManager = ({ open, onOpenChange, categoryType, categoryName, defaultBgColor, defaultIconColor }: Props) => {
  const [tiers, setTiers] = useState<PrivilegeTier[]>([]);
  const [loading, setLoading] = useState(false);
  const [editing, setEditing] = useState<PrivilegeTier | null>(null);
  const [saving, setSaving] = useState(false);

  const fetchTiers = async () => {
    setLoading(true);
    const { data, error } = await (supabase as any)
      .from("level_privilege_tiers")
      .select("*")
      .eq("privilege_type", categoryType)
      .order("unlock_level", { ascending: true });
    if (error) {
      toast.error("Failed to load tiers: " + error.message);
    } else {
      setTiers((data as PrivilegeTier[]) || []);
    }
    setLoading(false);
  };

  useEffect(() => {
    if (open) {
      fetchTiers();
      setEditing(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, categoryType]);

  const handleSave = async () => {
    if (!editing) return;
    if (!editing.name.trim()) {
      toast.error("Name is required");
      return;
    }
    if (editing.unlock_level < 0 || editing.unlock_level > 100) {
      toast.error("Unlock Level must be 0–100");
      return;
    }
    setSaving(true);
    try {
      const payload = { ...editing, updated_at: new Date().toISOString() };
      let error;
      if (editing.id) {
        ({ error } = await (supabase as any)
          .from("level_privilege_tiers")
          .update(payload)
          .eq("id", editing.id));
      } else {
        const { id, ...insertData } = payload;
        ({ error } = await (supabase as any).from("level_privilege_tiers").insert(insertData));
      }
      if (error) {
        if (error.code === "23505") {
          toast.error(`A tier already exists for Level ${editing.unlock_level} in this category.`);
        } else {
          toast.error("Save failed: " + error.message);
        }
      } else {
        toast.success("Saved");
        setEditing(null);
        fetchTiers();
      }
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Delete this tier?")) return;
    const { error } = await (supabase as any).from("level_privilege_tiers").delete().eq("id", id);
    if (error) toast.error("Delete failed: " + error.message);
    else {
      toast.success("Deleted");
      fetchTiers();
    }
  };

  const handleToggleActive = async (tier: PrivilegeTier, value: boolean) => {
    const { error } = await (supabase as any)
      .from("level_privilege_tiers")
      .update({ is_active: value, updated_at: new Date().toISOString() })
      .eq("id", tier.id);
    if (error) toast.error("Update failed: " + error.message);
    else fetchTiers();
  };

  const nextSuggestedLevel = () => {
    if (tiers.length === 0) return 1;
    const taken = new Set(tiers.map((t) => t.unlock_level));
    for (let i = 1; i <= 100; i++) if (!taken.has(i)) return i;
    return tiers[tiers.length - 1].unlock_level + 1;
  };

  const startNew = () => {
    setEditing(emptyTier(categoryType, defaultBgColor, defaultIconColor, nextSuggestedLevel()));
  };

  const startCopyFrom = (source: PrivilegeTier) => {
    const lvl = nextSuggestedLevel();
    setEditing({
      ...source,
      id: "",
      unlock_level: lvl,
      display_order: lvl,
      name: source.name + ` (Lv${lvl})`,
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto bg-white border-slate-200">
        <DialogHeader>
          <DialogTitle className="text-white flex items-center justify-between">
            <span>{categoryName} – Tier Manager</span>
            <Button size="sm" variant="ghost" onClick={fetchTiers} className="text-slate-500">
              <RefreshCw className="w-4 h-4" />
            </Button>
          </DialogTitle>
          <DialogDescription className="text-slate-500">
            Upload one item per level (0–100). Each level can be locked or unlocked for users based on their progression.
          </DialogDescription>
        </DialogHeader>

        {/* Tier list */}
        {!editing && (
          <div className="space-y-3">
            <Button onClick={startNew} className="w-full">
              <Plus className="w-4 h-4 mr-2" /> Add Tier
            </Button>

            {loading ? (
              <div className="text-center py-8 text-white/50">Loading...</div>
            ) : tiers.length === 0 ? (
              <div className="text-center py-8 text-white/50">
                No tiers yet. Add the first one for Level 1.
              </div>
            ) : (
              <div className="space-y-2">
                {tiers.map((tier) => (
                  <div
                    key={tier.id}
                    className="flex items-center gap-3 p-3 bg-white/5 border border-white/10 rounded-xl"
                  >
                    <div
                      className="w-12 h-12 rounded-lg flex items-center justify-center shrink-0 text-xs font-bold text-white"
                      style={{
                        background: `linear-gradient(135deg, ${tier.icon_bg_color || defaultBgColor}, ${tier.icon_color || defaultIconColor})`,
                      }}
                    >
                      Lv{tier.unlock_level}
                    </div>
                    {tier.preview_url ? (
                      <SmartImage
                        src={tier.preview_url}
                        alt={tier.name}
                        className="w-12 h-12 rounded-lg object-cover border border-white/10"
                        fallbackSrc="/placeholder.svg"
                      />
                    ) : (
                      <div className="w-12 h-12 rounded-lg bg-white/5 border border-white/10 flex items-center justify-center text-white/30 text-xs">
                        no img
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <div className="text-white font-medium truncate">{tier.name}</div>
                      <div className="text-white/50 text-xs truncate">
                        {tier.animation_url ? `${tier.animation_format || "anim"}` : "no animation"}
                        {tier.description ? ` · ${tier.description}` : ""}
                      </div>
                    </div>
                    <Switch
                      checked={tier.is_active}
                      onCheckedChange={(v) => handleToggleActive(tier, v)}
                    />
                    <Button size="icon" variant="ghost" onClick={() => startCopyFrom(tier)} title="Duplicate to next level">
                      <Copy className="w-4 h-4 text-slate-500" />
                    </Button>
                    <Button size="icon" variant="ghost" onClick={() => setEditing(tier)}>
                      <Pencil className="w-4 h-4 text-slate-500" />
                    </Button>
                    <Button size="icon" variant="ghost" onClick={() => handleDelete(tier.id)}>
                      <Trash2 className="w-4 h-4 text-red-400" />
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Tier editor */}
        {editing && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="text-slate-500">Name</Label>
                <Input
                  value={editing.name}
                  onChange={(e) => setEditing({ ...editing, name: e.target.value })}
                  placeholder="e.g. Royal Entry Bar"
                  className="bg-white border-slate-300 text-slate-900"
                />
              </div>
              <div className="space-y-2">
                <Label className="text-slate-500">Unlock Level (0-100)</Label>
                <Input
                  type="number"
                  min={0}
                  max={100}
                  value={editing.unlock_level}
                  onChange={(e) =>
                    setEditing({
                      ...editing,
                    })
                  }
                  className="bg-white border-slate-300 text-slate-900"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label className="text-slate-500">Description</Label>
              <Textarea
                value={editing.description || ""}
                onChange={(e) => setEditing({ ...editing, description: e.target.value })}
                placeholder="Short description shown to users"
                className="bg-white border-slate-300 text-slate-900"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="text-slate-500">Icon Bg Color</Label>
                <div className="flex gap-2">
                  <Input
                    type="color"
                    value={editing.icon_bg_color || defaultBgColor}
                    onChange={(e) => setEditing({ ...editing, icon_bg_color: e.target.value })}
                    className="w-12 h-10 p-1 bg-transparent border-white/10"
                  />
                  <Input
                    value={editing.icon_bg_color || ""}
                    onChange={(e) => setEditing({ ...editing, icon_bg_color: e.target.value })}
                    className="bg-white border-slate-300 text-slate-900"
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label className="text-slate-500">Icon Color</Label>
                <div className="flex gap-2">
                  <Input
                    type="color"
                    value={editing.icon_color || defaultIconColor}
                    onChange={(e) => setEditing({ ...editing, icon_color: e.target.value })}
                    className="w-12 h-10 p-1 bg-transparent border-white/10"
                  />
                  <Input
                    value={editing.icon_color || ""}
                    onChange={(e) => setEditing({ ...editing, icon_color: e.target.value })}
                    className="bg-white border-slate-300 text-slate-900"
                  />
                </div>
              </div>
            </div>

            <AnimationUploader
              label="Animation (SVGA / VAP / Lottie / WebP / PNG / GIF / MP4)"
              bucket="level-privileges"
              folder={`tiers/${categoryType}`}
              value={{
                animation_url: editing.animation_url || "",
                animation_format: (editing.animation_format as AnimationFormat | null) ?? null,
                animation_config_url: null,
              }}
              onChange={(v) =>
                setEditing({
                  ...editing,
                })
              }
            />

            <div className="space-y-2">
              <Label className="text-slate-500">Preview Image URL (optional)</Label>
              <Input
                value={editing.preview_url || ""}
                onChange={(e) => setEditing({ ...editing, preview_url: e.target.value })}
                placeholder="https://..."
                className="bg-white border-slate-300 text-slate-900"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="text-slate-500">Sound URL (optional)</Label>
                <Input
                  value={editing.sound_url || ""}
                  onChange={(e) => setEditing({ ...editing, sound_url: e.target.value })}
                  placeholder="https://..."
                  className="bg-white border-slate-300 text-slate-900"
                />
              </div>
              <div className="space-y-2">
                <Label className="text-slate-500">Duration (ms)</Label>
                <Input
                  type="number"
                  min={500}
                  max={20000}
                  step={500}
                  value={editing.duration_ms || 3000}
                  onChange={(e) =>
                    setEditing({ ...editing, duration_ms: parseInt(e.target.value) || 3000 })
                  }
                  className="bg-white border-slate-300 text-slate-900"
                />
              </div>
            </div>

            <div className="flex items-center justify-between pt-4 border-t border-white/10">
              <div className="flex items-center gap-2">
                <Switch
                  checked={editing.is_active}
                  onCheckedChange={(checked) => setEditing({ ...editing, is_active: checked })}
                />
                <Label className="text-white">Active</Label>
              </div>
              <div className="flex gap-2">
                <Button variant="outline" onClick={() => setEditing(null)} disabled={saving}>
                  Cancel
                </Button>
                <Button onClick={handleSave} disabled={saving}>
                  {saving ? "Saving..." : "Save Tier"}
                </Button>
              </div>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};

export default PrivilegeTierManager;
