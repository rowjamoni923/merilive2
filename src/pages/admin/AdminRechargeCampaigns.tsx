import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAdminRealtime } from "@/hooks/useAdminRealtime";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Plus, Edit2, Trash2, RefreshCw, Diamond, Clock, Image as ImageIcon,
  Upload, Eye, EyeOff, Sparkles, Target, Zap, Gift, Timer, DollarSign
} from "lucide-react";

interface Campaign {
  id: string;
  campaign_name: string;
  campaign_type: string;
  original_price_usd: number;
  offer_price_usd: number | null;
  diamonds_amount: number;
  bonus_diamonds: number;
  duration_minutes: number;
  banner_image_url: string | null;
  badge_text: string | null;
  display_locations: string[];
  target_audience: string;
  is_first_recharge_only: boolean;
  is_active: boolean;
  priority: number;
  created_at: string;
  updated_at: string;
}

const defaultForm: Partial<Campaign> = {
  campaign_name: "",
  campaign_type: "bonus",
  original_price_usd: 0,
  offer_price_usd: null,
  diamonds_amount: 0,
  bonus_diamonds: 0,
  duration_minutes: 60,
  banner_image_url: null,
  badge_text: "Limited Offer",
  display_locations: ["home", "party", "reels", "chat"],
  target_audience: "all",
  is_first_recharge_only: false,
  is_active: true,
  priority: 0,
};

const CAMPAIGN_TYPES = [
  { value: "bonus", label: "Bonus Diamonds", icon: "🎁" },
  { value: "discount", label: "Discounted Price", icon: "💰" },
  { value: "first_recharge", label: "First Recharge Bonus", icon: "⭐" },
  { value: "custom", label: "Custom Offer", icon: "✨" },
];

const AUDIENCES = [
  { value: "all", label: "All Users" },
  { value: "new_users", label: "New Users Only" },
  { value: "inactive", label: "Inactive Users" },
  { value: "vip", label: "VIP Users" },
];

const LOCATIONS = [
  { value: "home", label: "Home Screen" },
  { value: "party", label: "Party Screen" },
  { value: "reels", label: "Reels Screen" },
  { value: "chat", label: "Chat Screen" },
];

const TIMER_PRESETS = [
  { value: 30, label: "30 Minutes" },
  { value: 60, label: "1 Hour" },
  { value: 120, label: "2 Hours" },
  { value: 300, label: "5 Hours" },
  { value: 720, label: "12 Hours" },
  { value: 1440, label: "24 Hours" },
];

export default function AdminRechargeCampaigns() {
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Campaign | null>(null);
  const [form, setForm] = useState<Partial<Campaign>>(defaultForm);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);

  const fetchCampaigns = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("recharge_campaigns")
      .select("*")
      .order("priority", { ascending: false });

    if (error) {
      toast.error("Failed to load campaigns");
    } else {
      setCampaigns((data as Campaign[]) || []);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchCampaigns();
  }, [fetchCampaigns]);

  useAdminRealtime(["recharge_campaigns"], fetchCampaigns, "admin-recharge-campaigns-rt");

  const openCreate = () => {
    setEditing(null);
    setForm(defaultForm);
    setDialogOpen(true);
  };

  const openEdit = (c: Campaign) => {
    setEditing(c);
    setForm({
      campaign_name: c.campaign_name,
      campaign_type: c.campaign_type,
      original_price_usd: c.original_price_usd,
      offer_price_usd: c.offer_price_usd,
      diamonds_amount: c.diamonds_amount,
      bonus_diamonds: c.bonus_diamonds,
      duration_minutes: c.duration_minutes,
      banner_image_url: c.banner_image_url,
      badge_text: c.badge_text,
      display_locations: c.display_locations || [],
      target_audience: c.target_audience,
      is_first_recharge_only: c.is_first_recharge_only,
      is_active: c.is_active,
      priority: c.priority,
    });
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!form.campaign_name?.trim()) {
      toast.error("Campaign name is required");
      return;
    }
    if (!form.diamonds_amount || form.diamonds_amount <= 0) {
      toast.error("Diamonds amount must be greater than 0");
      return;
    }

    setSaving(true);
    try {
      const payload = {
        campaign_name: form.campaign_name!.trim(),
        campaign_type: form.campaign_type || "bonus",
        original_price_usd: form.original_price_usd || 0,
        offer_price_usd: form.offer_price_usd || null,
        diamonds_amount: form.diamonds_amount || 0,
        bonus_diamonds: form.bonus_diamonds || 0,
        duration_minutes: form.duration_minutes || 60,
        banner_image_url: form.banner_image_url || null,
        badge_text: form.badge_text || "Limited Offer",
        display_locations: form.display_locations || ["home"],
        target_audience: form.target_audience || "all",
        is_first_recharge_only: form.is_first_recharge_only || false,
        is_active: form.is_active ?? true,
        priority: form.priority || 0,
      };

      if (editing) {
        const { error } = await supabase
          .from("recharge_campaigns")
          .update(payload)
          .eq("id", editing.id);
        if (error) throw error;
        toast.success("Campaign updated successfully!");
      } else {
        const { error } = await supabase
          .from("recharge_campaigns")
          .insert(payload);
        if (error) throw error;
        toast.success("Campaign created successfully!");
      }

      setDialogOpen(false);
      fetchCampaigns();
    } catch (err: any) {
      toast.error(err.message || "Failed to save campaign");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    const { error } = await supabase.from("recharge_campaigns").delete().eq("id", id);
    if (error) {
      toast.error("Failed to delete campaign");
    } else {
      toast.success("Campaign deleted");
      fetchCampaigns();
    }
  };

  const toggleActive = async (c: Campaign) => {
    const { error } = await supabase
      .from("recharge_campaigns")
      .update({ is_active: !c.is_active })
      .eq("id", c.id);
    if (error) {
      toast.error("Failed to toggle");
    } else {
      toast.success(c.is_active ? "Campaign deactivated" : "Campaign activated");
      fetchCampaigns();
    }
  };

  const handleBannerUpload = async (file: File) => {
    if (!file.type.startsWith("image/")) {
      toast.error("Only image files allowed");
      return;
    }
    setUploading(true);
    try {
      const ext = file.name.split(".").pop() || "png";
      const path = `campaigns/banner_${Date.now()}.${ext}`;
      const { error } = await supabase.storage
        .from("app-assets")
        .upload(path, file, { upsert: true, contentType: file.type });
      if (error) throw error;

      const { data: urlData } = supabase.storage.from("app-assets").getPublicUrl(path);
      setForm(prev => ({ ...prev, banner_image_url: urlData.publicUrl }));
      toast.success("Banner uploaded!");
    } catch (err: any) {
      toast.error(err.message || "Upload failed");
    } finally {
      setUploading(false);
    }
  };

  const toggleLocation = (loc: string) => {
    setForm(prev => {
      const current = prev.display_locations || [];
      return {
        ...prev,
        display_locations: current.includes(loc)
          ? current.filter(l => l !== loc)
          : [...current, loc],
      };
    });
  };

  const getCampaignTypeInfo = (type: string) =>
    CAMPAIGN_TYPES.find(t => t.value === type) || CAMPAIGN_TYPES[0];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Sparkles className="w-6 h-6 text-yellow-500" />
            Recharge Campaigns
          </h1>
          <p className="text-muted-foreground text-sm mt-1">
            Create time-limited diamond offers to boost recharges
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={fetchCampaigns} disabled={loading}>
            <RefreshCw className={`w-4 h-4 mr-2 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </Button>
          <Button size="sm" onClick={openCreate}>
            <Plus className="w-4 h-4 mr-2" />
            New Campaign
          </Button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card>
          <CardContent className="p-4 text-center">
            <p className="text-2xl font-bold">{campaigns.length}</p>
            <p className="text-xs text-muted-foreground">Total Campaigns</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <p className="text-2xl font-bold text-green-500">
              {campaigns.filter(c => c.is_active).length}
            </p>
            <p className="text-xs text-muted-foreground">Active</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <p className="text-2xl font-bold text-blue-500">
              {campaigns.filter(c => c.campaign_type === "first_recharge").length}
            </p>
            <p className="text-xs text-muted-foreground">First Recharge</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <p className="text-2xl font-bold text-purple-500">
              {campaigns.filter(c => c.campaign_type === "bonus").length}
            </p>
            <p className="text-xs text-muted-foreground">Bonus Offers</p>
          </CardContent>
        </Card>
      </div>

      {/* Campaign List */}
      {loading ? (
        <div className="flex items-center justify-center py-12">
          <RefreshCw className="w-8 h-8 animate-spin text-muted-foreground" />
        </div>
      ) : campaigns.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <Sparkles className="w-12 h-12 mx-auto mb-3 opacity-30" />
            <p className="text-muted-foreground">No campaigns yet. Create your first one!</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {campaigns.map(c => {
            const typeInfo = getCampaignTypeInfo(c.campaign_type);
            return (
              <Card key={c.id} className={`relative overflow-hidden transition-all ${!c.is_active ? "opacity-60" : ""}`}>
                {/* Banner */}
                {c.banner_image_url && (
                  <div className="h-32 bg-gradient-to-br from-primary/20 to-primary/5 overflow-hidden">
                    <img
                      src={c.banner_image_url}
                      alt={c.campaign_name}
                      className="w-full h-full object-cover"
                    />
                  </div>
                )}

                <CardHeader className="pb-2">
                  <div className="flex items-start justify-between">
                    <div>
                      <CardTitle className="text-base flex items-center gap-2">
                        <span>{typeInfo.icon}</span>
                        {c.campaign_name}
                      </CardTitle>
                      <Badge variant={c.is_active ? "default" : "secondary"} className="mt-1 text-[10px]">
                        {c.is_active ? "✅ Active" : "⏸ Inactive"}
                      </Badge>
                    </div>
                    <div className="flex gap-1">
                      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => toggleActive(c)}>
                        {c.is_active ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                      </Button>
                      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEdit(c)}>
                        <Edit2 className="w-3.5 h-3.5" />
                      </Button>
                      <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => handleDelete(c.id)}>
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                  </div>
                </CardHeader>

                <CardContent className="space-y-3 pt-0">
                  {/* Offer Details */}
                  <div className="grid grid-cols-2 gap-2 text-sm">
                    <div className="flex items-center gap-1.5">
                      <Diamond className="w-3.5 h-3.5 text-blue-400" />
                      <span className="font-semibold">{c.diamonds_amount.toLocaleString()}</span>
                    </div>
                    {c.bonus_diamonds > 0 && (
                      <div className="flex items-center gap-1.5">
                        <Gift className="w-3.5 h-3.5 text-yellow-500" />
                        <span className="text-yellow-600 font-semibold">+{c.bonus_diamonds.toLocaleString()}</span>
                      </div>
                    )}
                    <div className="flex items-center gap-1.5">
                      <DollarSign className="w-3.5 h-3.5 text-green-500" />
                      <span>${Number(c.original_price_usd).toFixed(2)}</span>
                      {c.offer_price_usd && (
                        <span className="text-green-500 font-semibold">${Number(c.offer_price_usd).toFixed(2)}</span>
                      )}
                    </div>
                    <div className="flex items-center gap-1.5">
                      <Timer className="w-3.5 h-3.5 text-orange-500" />
                      <span>{c.duration_minutes >= 60 ? `${c.duration_minutes / 60}h` : `${c.duration_minutes}m`}</span>
                    </div>
                  </div>

                  {/* Locations */}
                  <div className="flex flex-wrap gap-1">
                    {(c.display_locations || []).map(loc => (
                      <Badge key={loc} variant="outline" className="text-[10px] capitalize">
                        {loc}
                      </Badge>
                    ))}
                  </div>

                  {/* Target */}
                  <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <Target className="w-3 h-3" />
                    <span className="capitalize">{c.target_audience.replace("_", " ")}</span>
                    {c.is_first_recharge_only && (
                      <Badge variant="secondary" className="text-[9px]">First Recharge Only</Badge>
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Create/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-yellow-500" />
              {editing ? "Edit Campaign" : "Create Campaign"}
            </DialogTitle>
          </DialogHeader>

          <ScrollArea className="max-h-[70vh] pr-4">
            <div className="space-y-5 pb-4">
              {/* Basic Info */}
              <div className="space-y-3">
                <h3 className="text-sm font-semibold flex items-center gap-2">
                  <Zap className="w-4 h-4" /> Basic Info
                </h3>
                <div className="grid grid-cols-2 gap-3">
                  <div className="col-span-2">
                    <Label>Campaign Name</Label>
                    <Input
                      value={form.campaign_name || ""}
                      onChange={e => setForm(p => ({ ...p, campaign_name: e.target.value }))}
                      placeholder="e.g. Weekend Diamond Rush"
                    />
                  </div>
                  <div>
                    <Label>Campaign Type</Label>
                    <Select
                      value={form.campaign_type || "bonus"}
                      onValueChange={v => setForm(p => ({ ...p, campaign_type: v }))}
                    >
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {CAMPAIGN_TYPES.map(t => (
                          <SelectItem key={t.value} value={t.value}>
                            {t.icon} {t.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label>Target Audience</Label>
                    <Select
                      value={form.target_audience || "all"}
                      onValueChange={v => setForm(p => ({ ...p, target_audience: v }))}
                    >
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {AUDIENCES.map(a => (
                          <SelectItem key={a.value} value={a.value}>{a.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </div>

              {/* Pricing */}
              <div className="space-y-3">
                <h3 className="text-sm font-semibold flex items-center gap-2">
                  <DollarSign className="w-4 h-4" /> Pricing & Diamonds
                </h3>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label>Original Price (USD)</Label>
                    <Input
                      type="number"
                      step="0.01"
                      min="0"
                      value={form.original_price_usd || ""}
                      onChange={e => setForm(p => ({ ...p, original_price_usd: parseFloat(e.target.value) || 0 }))}
                      placeholder="5.00"
                    />
                  </div>
                  <div>
                    <Label>Offer Price (USD) <span className="text-muted-foreground text-xs">optional</span></Label>
                    <Input
                      type="number"
                      step="0.01"
                      min="0"
                      value={form.offer_price_usd ?? ""}
                      onChange={e => setForm(p => ({ ...p, offer_price_usd: e.target.value ? parseFloat(e.target.value) : null }))}
                      placeholder="3.99"
                    />
                  </div>
                  <div>
                    <Label>Diamonds Amount</Label>
                    <Input
                      type="number"
                      min="1"
                      value={form.diamonds_amount || ""}
                      onChange={e => setForm(p => ({ ...p, diamonds_amount: parseInt(e.target.value) || 0 }))}
                      placeholder="5000"
                    />
                  </div>
                  <div>
                    <Label>Bonus Diamonds</Label>
                    <Input
                      type="number"
                      min="0"
                      value={form.bonus_diamonds || ""}
                      onChange={e => setForm(p => ({ ...p, bonus_diamonds: parseInt(e.target.value) || 0 }))}
                      placeholder="1000"
                    />
                  </div>
                </div>
              </div>

              {/* Timer */}
              <div className="space-y-3">
                <h3 className="text-sm font-semibold flex items-center gap-2">
                  <Timer className="w-4 h-4" /> Timer Duration
                </h3>
                <div className="flex flex-wrap gap-2">
                  {TIMER_PRESETS.map(t => (
                    <Button
                      key={t.value}
                      variant={form.duration_minutes === t.value ? "default" : "outline"}
                      size="sm"
                      onClick={() => setForm(p => ({ ...p, duration_minutes: t.value }))}
                    >
                      {t.label}
                    </Button>
                  ))}
                </div>
                <div>
                  <Label>Custom Duration (minutes)</Label>
                  <Input
                    type="number"
                    min="1"
                    value={form.duration_minutes || ""}
                    onChange={e => setForm(p => ({ ...p, duration_minutes: parseInt(e.target.value) || 60 }))}
                  />
                </div>
              </div>

              {/* Display */}
              <div className="space-y-3">
                <h3 className="text-sm font-semibold flex items-center gap-2">
                  <Eye className="w-4 h-4" /> Display Settings
                </h3>
                <div>
                  <Label>Show on Screens</Label>
                  <div className="flex flex-wrap gap-2 mt-2">
                    {LOCATIONS.map(loc => (
                      <Button
                        key={loc.value}
                        variant={(form.display_locations || []).includes(loc.value) ? "default" : "outline"}
                        size="sm"
                        onClick={() => toggleLocation(loc.value)}
                      >
                        {loc.label}
                      </Button>
                    ))}
                  </div>
                </div>
                <div>
                  <Label>Badge Text</Label>
                  <Input
                    value={form.badge_text || ""}
                    onChange={e => setForm(p => ({ ...p, badge_text: e.target.value }))}
                    placeholder="e.g. 🔥 Limited Offer"
                  />
                </div>
                <div>
                  <Label>Priority (higher = shown first)</Label>
                  <Input
                    type="number"
                    min="0"
                    value={form.priority || 0}
                    onChange={e => setForm(p => ({ ...p, priority: parseInt(e.target.value) || 0 }))}
                  />
                </div>
              </div>

              {/* Banner Image */}
              <div className="space-y-3">
                <h3 className="text-sm font-semibold flex items-center gap-2">
                  <ImageIcon className="w-4 h-4" /> Banner Image
                </h3>
                {form.banner_image_url && (
                  <div className="rounded-lg overflow-hidden border h-32">
                    <img src={form.banner_image_url} alt="Banner" className="w-full h-full object-cover" />
                  </div>
                )}
                <label>
                  <input
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={e => {
                      const file = e.target.files?.[0];
                      if (file) handleBannerUpload(file);
                      e.target.value = "";
                    }}
                  />
                  <Button variant="outline" size="sm" disabled={uploading} asChild>
                    <span>
                      <Upload className="w-4 h-4 mr-2" />
                      {uploading ? "Uploading..." : "Upload Banner"}
                    </span>
                  </Button>
                </label>
              </div>

              {/* Toggles */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <Label>First Recharge Only</Label>
                  <Switch
                    checked={form.is_first_recharge_only || false}
                    onCheckedChange={v => setForm(p => ({ ...p, is_first_recharge_only: v }))}
                  />
                </div>
                <div className="flex items-center justify-between">
                  <Label>Active</Label>
                  <Switch
                    checked={form.is_active ?? true}
                    onCheckedChange={v => setForm(p => ({ ...p, is_active: v }))}
                  />
                </div>
              </div>
            </div>
          </ScrollArea>

          <div className="flex gap-2 pt-2">
            <Button variant="outline" className="flex-1" onClick={() => setDialogOpen(false)}>
              Cancel
            </Button>
            <Button className="flex-1" onClick={handleSave} disabled={saving}>
              {saving ? "Saving..." : editing ? "Update Campaign" : "Create Campaign"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
