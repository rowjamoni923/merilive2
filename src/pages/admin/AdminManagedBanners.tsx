import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Plus, Trash2, Save, Search, Image as ImageIcon } from "lucide-react";

type Bullet = { icon?: string; title: string; description?: string };

type BannerRow = {
  id: string;
  slug: string;
  section: string;
  label: string;
  title: string | null;
  subtitle: string | null;
  body_md: string | null;
  image_url: string | null;
  cta_text: string | null;
  cta_url: string | null;
  theme: Record<string, any>;
  bullets: Bullet[];
  is_active: boolean;
  updated_at: string;
};

const SECTIONS = ["all", "agency", "helper", "policy", "landing", "general"] as const;

export default function AdminManagedBanners() {
  const { toast } = useToast();
  const [rows, setRows] = useState<BannerRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [sectionFilter, setSectionFilter] = useState<string>("all");
  const [editing, setEditing] = useState<BannerRow | null>(null);
  const [saving, setSaving] = useState(false);

  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("managed_banners")
      .select("*")
      .order("section", { ascending: true })
      .order("label", { ascending: true });
    if (error) {
      toast({ title: "Failed to load banners", description: error.message, variant: "destructive" });
    } else {
      setRows((data ?? []) as any);
    }
    setLoading(false);
  };

  useEffect(() => {
    load();
    const channel = supabase
      .channel("admin_managed_banners")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "managed_banners" },
        () => load(),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((r) => {
      if (sectionFilter !== "all" && r.section !== sectionFilter) return false;
      if (!q) return true;
      return (
        r.slug.toLowerCase().includes(q) ||
        r.label.toLowerCase().includes(q) ||
        (r.title ?? "").toLowerCase().includes(q)
      );
    });
  }, [rows, search, sectionFilter]);

  const save = async () => {
    if (!editing) return;
    setSaving(true);
    const { error } = await supabase
      .from("managed_banners")
      .update({
        label: editing.label,
        section: editing.section,
        title: editing.title,
        subtitle: editing.subtitle,
        body_md: editing.body_md,
        image_url: editing.image_url,
        cta_text: editing.cta_text,
        cta_url: editing.cta_url,
        theme: editing.theme ?? {},
        bullets: editing.bullets ?? [],
        is_active: editing.is_active,
      })
      .eq("id", editing.id);
    setSaving(false);
    if (error) {
      toast({ title: "Save failed", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: "Banner updated", description: "Changes are live instantly across the app." });
    setEditing(null);
  };

  const toggleActive = async (row: BannerRow, next: boolean) => {
    const { error } = await supabase
      .from("managed_banners")
      .update({ is_active: next })
      .eq("id", row.id);
    if (error) {
      toast({ title: "Update failed", description: error.message, variant: "destructive" });
    }
  };

  const updateBullet = (idx: number, patch: Partial<Bullet>) => {
    if (!editing) return;
    const bullets = [...editing.bullets];
    bullets[idx] = { ...bullets[idx], ...patch };
    setEditing({ ...editing, bullets });
  };

  const removeBullet = (idx: number) => {
    if (!editing) return;
    const bullets = editing.bullets.filter((_, i) => i !== idx);
    setEditing({ ...editing, bullets });
  };

  const addBullet = () => {
    if (!editing) return;
    setEditing({
      ...editing,
    });
  };

  return (
    <div className="p-4 md:p-6 space-y-6 bg-white min-h-screen">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Banners &amp; Guidelines</h1>
          <p className="text-sm text-slate-600">
            One place to edit every hero card, guideline banner, welcome popup, and policy intro across the app.
            Changes go live instantly.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="absolute left-2 top-2.5 h-4 w-4 text-slate-400" />
            <Input
              className="pl-8 w-64"
              placeholder="Search slug, label, title…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        {SECTIONS.map((s) => (
          <Button
            key={s}
            size="sm"
            variant={sectionFilter === s ? "default" : "outline"}
            onClick={() => setSectionFilter(s)}
            className="capitalize"
          >
            {s}
          </Button>
        ))}
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="h-6 w-6 animate-spin text-slate-500" />
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {filtered.map((row) => (
            <Card
              key={row.id}
              className="border border-slate-200 shadow-sm hover:shadow-md transition-shadow bg-white"
            >
              <CardHeader className="pb-2">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <Badge variant="outline" className="mb-1 capitalize">
                      {row.section}
                    </Badge>
                    <CardTitle className="text-base text-slate-900">{row.label}</CardTitle>
                    <div className="text-[11px] text-slate-500 font-mono truncate">{row.slug}</div>
                  </div>
                  <Switch
                    checked={row.is_active}
                    onCheckedChange={(v) => toggleActive(row, v)}
                  />
                </div>
              </CardHeader>
              <CardContent className="space-y-2">
                {row.image_url ? (
                  <img
                    src={row.image_url}
                    alt={row.label}
                    className="w-full h-28 object-cover rounded-md border border-slate-200"
                  />
                ) : (
                  <div className="w-full h-28 flex items-center justify-center rounded-md bg-slate-50 border border-dashed border-slate-200">
                    <ImageIcon className="h-6 w-6 text-slate-300" />
                  </div>
                )}
                {row.title && (
                  <div className="text-sm font-semibold text-slate-900 line-clamp-1">{row.title}</div>
                )}
                {row.subtitle && (
                  <div className="text-xs text-slate-600 line-clamp-2">{row.subtitle}</div>
                )}
                <div className="flex items-center justify-between pt-2">
                  <div className="text-[10px] text-slate-400">
                    Updated {new Date(row.updated_at).toLocaleDateString()}
                  </div>
                  <Button size="sm" onClick={() => setEditing(row)}>
                    Edit
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
          {filtered.length === 0 && (
            <div className="col-span-full text-center py-12 text-slate-500">
              No banners match your filters.
            </div>
          )}
        </div>
      )}

      <Sheet open={!!editing} onOpenChange={(open) => !open && setEditing(null)}>
        <SheetContent className="w-full sm:max-w-2xl overflow-y-auto bg-white">
          {editing && (
            <>
              <SheetHeader>
                <SheetTitle className="text-slate-900">{editing.label}</SheetTitle>
                <div className="text-xs text-slate-500 font-mono">{editing.slug}</div>
              </SheetHeader>
              <div className="space-y-4 pt-4">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label>Label (admin only)</Label>
                    <Input
                      value={editing.label}
                      onChange={(e) => setEditing({ ...editing, label: e.target.value })}
                    />
                  </div>
                  <div>
                    <Label>Section</Label>
                    <Input
                      value={editing.section}
                      onChange={(e) => setEditing({ ...editing, section: e.target.value })}
                    />
                  </div>
                </div>
                <div>
                  <Label>Title</Label>
                  <Input
                    value={editing.title ?? ""}
                    onChange={(e) => setEditing({ ...editing, title: e.target.value })}
                  />
                </div>
                <div>
                  <Label>Subtitle</Label>
                  <Input
                    value={editing.subtitle ?? ""}
                    onChange={(e) => setEditing({ ...editing, subtitle: e.target.value })}
                  />
                </div>
                <div>
                  <Label>Body (Markdown)</Label>
                  <Textarea
                    rows={5}
                    value={editing.body_md ?? ""}
                    onChange={(e) => setEditing({ ...editing, body_md: e.target.value })}
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label>CTA Text</Label>
                    <Input
                      value={editing.cta_text ?? ""}
                      onChange={(e) => setEditing({ ...editing, cta_text: e.target.value })}
                    />
                  </div>
                  <div>
                    <Label>CTA URL</Label>
                    <Input
                      value={editing.cta_url ?? ""}
                      onChange={(e) => setEditing({ ...editing, cta_url: e.target.value })}
                    />
                  </div>
                </div>
                <div>
                  <Label>Image URL</Label>
                  <Input
                    value={editing.image_url ?? ""}
                    placeholder="https://…"
                    onChange={(e) => setEditing({ ...editing, image_url: e.target.value })}
                  />
                </div>
                <div>
                  <Label>Theme (JSON)</Label>
                  <Textarea
                    rows={3}
                    className="font-mono text-xs"
                    value={JSON.stringify(editing.theme ?? {}, null, 2)}
                    onChange={(e) => {
                      try {
                        setEditing({ ...editing, theme: JSON.parse(e.target.value || "{}") });
                      } catch {
                        // keep raw text without applying
                      }
                    }}
                  />
                </div>

                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label>Bullets / Features</Label>
                    <Button size="sm" variant="outline" onClick={addBullet}>
                      <Plus className="h-3 w-3 mr-1" /> Add
                    </Button>
                  </div>
                  {editing.bullets.map((b, idx) => (
                    <div key={idx} className="grid grid-cols-[100px_1fr_1fr_auto] gap-2 items-center">
                      <Input
                        placeholder="icon"
                        value={b.icon ?? ""}
                        onChange={(e) => updateBullet(idx, { icon: e.target.value })}
                      />
                      <Input
                        placeholder="title"
                        value={b.title}
                        onChange={(e) => updateBullet(idx, { title: e.target.value })}
                      />
                      <Input
                        placeholder="description"
                        value={b.description ?? ""}
                        onChange={(e) => updateBullet(idx, { description: e.target.value })}
                      />
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={() => removeBullet(idx)}
                      >
                        <Trash2 className="h-4 w-4 text-red-500" />
                      </Button>
                    </div>
                  ))}
                </div>

                <div className="flex items-center justify-between pt-3 border-t border-slate-200">
                  <div className="flex items-center gap-2">
                    <Switch
                      checked={editing.is_active}
                      onCheckedChange={(v) => setEditing({ ...editing, is_active: v })}
                    />
                    <Label>Active (visible in app)</Label>
                  </div>
                  <Button onClick={save} disabled={saving}>
                    {saving ? (
                      <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                    ) : (
                      <Save className="h-4 w-4 mr-1" />
                    )}
                    Save
                  </Button>
                </div>
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}
