import { useState, useEffect, useCallback } from "react";
import useAdminRealtime from "@/hooks/useAdminRealtime";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, Gift, Coins, Clock, Zap, Plus, Trash2, Save, Edit2, Crown, TrendingUp, Timer, ToggleLeft, ToggleRight, Upload, Image, Type, CalendarDays } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { adminSupabase as supabase } from "@/integrations/supabase/adminClient";
import { toast } from "sonner";
import { SmartImage } from "@/components/ui/smart-image";

// ==========================================
// Admin Rewards Management
// Controls: Daily Login, First Recharge Bonus,
// Consumption Return, Limited Time Offers
// ==========================================

const AdminRewardsManagement = () => {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState("daily-login");

  // Daily Login State
  const [loginRewards, setLoginRewards] = useState<any[]>([]);
  const [loginLoading, setLoginLoading] = useState(true);

  // First Recharge State
  const [firstRechargeConfig, setFirstRechargeConfig] = useState<any>(null);
  const [firstRechargeLoading, setFirstRechargeLoading] = useState(true);

  // Consumption Return State
  const [consumptionTiers, setConsumptionTiers] = useState<any[]>([]);
  const [consumptionLoading, setConsumptionLoading] = useState(true);

  // Limited Offers State
  const [limitedOffers, setLimitedOffers] = useState<any[]>([]);
  const [offersLoading, setOffersLoading] = useState(true);
  const [showAddOffer, setShowAddOffer] = useState(false);
  const [newOffer, setNewOffer] = useState({
    title: "",
    description: "",
    bonus_percentage: 50,
    ends_at: "",
    badge_text: "LIMITED TIME",
    is_active: true,
  });

  // Weekly Login State
  const [weeklyConfig, setWeeklyConfig] = useState<any>(null);
  const [weeklyDraft, setWeeklyDraft] = useState({ reward_type: "coins", reward_amount: "500", label: "", description: "", is_active: true });

  // Fetch all data
  const fetchAll = useCallback(async () => {
    const [loginRes, firstRechargeRes, tiersRes, offersRes, weeklyRes] = await Promise.all([
      supabase.from("daily_login_rewards_config").select("*").order("day_number"),
      supabase.from("first_recharge_bonus").select("*").eq("is_active", true).maybeSingle(),
      supabase.from("consumption_return_config").select("*").order("display_order"),
      supabase.from("limited_time_offers").select("*").order("created_at", { ascending: false }),
      supabase.from("weekly_login_rewards_config").select("*").order("created_at").limit(1).maybeSingle(),
    ]);

    setLoginRewards(loginRes.data || []);
    setLoginLoading(false);
    setFirstRechargeConfig(firstRechargeRes.data || { bonus_multiplier: 2.0, bonus_label: "2x Bonus", description: "", is_active: true });
    setFirstRechargeLoading(false);
    setConsumptionTiers(tiersRes.data || []);
    setConsumptionLoading(false);
    setLimitedOffers(offersRes.data || []);
    setOffersLoading(false);
    if (weeklyRes.data) {
      setWeeklyConfig(weeklyRes.data);
      setWeeklyDraft({
        reward_type: weeklyRes.data.reward_type || "coins",
        reward_amount: String(weeklyRes.data.reward_amount ?? 500),
        label: weeklyRes.data.label || "",
        description: weeklyRes.data.description || "",
        is_active: !!weeklyRes.data.is_active,
      });
    }
  }, []);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  useAdminRealtime(['daily_login_rewards_config', 'first_recharge_bonus', 'consumption_return_config', 'limited_time_offers', 'weekly_login_rewards_config'], () => fetchAll());

  // ===== DAILY LOGIN HANDLERS =====
  const updateLoginReward = async (id: string, field: string, value: any) => {
    const { error } = await supabase
      .from("daily_login_rewards_config")
      .update({ [field]: value })
      .eq("id", id);
    if (error) {
      toast.error("Failed to update");
    } else {
      toast.success("Updated successfully");
      fetchAll();
    }
  };

  // ===== WEEKLY LOGIN HANDLER =====
  const saveWeekly = async () => {
    const amount = Math.max(0, Math.trunc(Number(weeklyDraft.reward_amount) || 0));
    const payload = {
      reward_type: weeklyDraft.reward_type,
      reward_amount: amount,
      label: weeklyDraft.label || null,
      description: weeklyDraft.description || null,
      is_active: weeklyDraft.is_active,
      updated_at: new Date().toISOString(),
    };
    const result = weeklyConfig?.id
      ? await supabase.from("weekly_login_rewards_config").update(payload).eq("id", weeklyConfig.id).select().single()
      : await supabase.from("weekly_login_rewards_config").insert(payload).select().single();
    if (result.error) toast.error("Failed to save weekly reward");
    else {
      setWeeklyConfig(result.data);
      toast.success("Weekly reward saved");
    }
  };

  const saveFirstRecharge = async () => {
    if (!firstRechargeConfig) return;

    const payload = {
      bonus_coins: firstRechargeConfig.bonus_coins ?? 0,
      bonus_percentage: firstRechargeConfig.bonus_percentage ?? 0,
      bonus_multiplier: firstRechargeConfig.bonus_multiplier,
      bonus_label: firstRechargeConfig.bonus_label,
      description: firstRechargeConfig.description,
      is_active: firstRechargeConfig.is_active,
      banner_image_url: firstRechargeConfig.banner_image_url || null,
      banner_title: firstRechargeConfig.banner_title || 'First Recharge Bonus!',
      banner_subtitle: firstRechargeConfig.banner_subtitle || 'Get extra bonus diamonds on your first purchase',
      banner_type: firstRechargeConfig.banner_type || 'image',
      updated_at: new Date().toISOString(),
    };

    const result = firstRechargeConfig.id
      ? await supabase.from("first_recharge_bonus").update(payload).eq("id", firstRechargeConfig.id).select().single()
      : await supabase.from("first_recharge_bonus").insert(payload).select().single();

    if (result.error) toast.error("Failed to save");
    else {
      setFirstRechargeConfig(result.data || firstRechargeConfig);
      toast.success("First recharge config saved");
    }
  };

  // Banner image upload handler
  const handleBannerUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    
    const fileExt = file.name.split('.').pop();
    const fileName = `first-recharge-banner-${Date.now()}.${fileExt}`;
    
    const { data, error } = await supabase.storage
      .from('banners')
      .upload(fileName, file, { upsert: true });
    
    if (error) {
      toast.error("Failed to upload banner");
      return;
    }
    
    const { data: urlData } = supabase.storage.from('banners').getPublicUrl(fileName);
    setFirstRechargeConfig({ ...firstRechargeConfig, banner_image_url: urlData.publicUrl });
    toast.success("Banner uploaded!");
  };

  const removeBannerImage = () => {
    setFirstRechargeConfig({ ...firstRechargeConfig, banner_image_url: null });
  };

  // ===== CONSUMPTION TIER HANDLERS =====
  const updateTier = async (id: string, updates: any) => {
    const { error } = await supabase
      .from("consumption_return_config")
      .update({ ...updates, updated_at: new Date().toISOString() })
      .eq("id", id);
    if (error) toast.error("Failed to update tier");
    else {
      toast.success("Tier updated");
      fetchAll();
    }
  };

  const addTier = async () => {
    const { error } = await supabase.from("consumption_return_config").insert({
      tier_name: "New Tier",
      min_spend: 0,
      return_percentage: 5,
      period_type: "weekly",
      display_order: consumptionTiers.length + 1,
    });
    if (error) toast.error("Failed to add tier");
    else {
      toast.success("Tier added");
      fetchAll();
    }
  };

  const deleteTier = async (id: string) => {
    const { error } = await supabase.from("consumption_return_config").delete().eq("id", id);
    if (error) toast.error("Failed to delete");
    else {
      toast.success("Tier deleted");
      fetchAll();
    }
  };

  // ===== LIMITED OFFER HANDLERS =====
  const addOffer = async () => {
    if (!newOffer.title || !newOffer.ends_at) {
      toast.error("Title and end date are required");
      return;
    }
    const { error } = await supabase.from("limited_time_offers").insert({
      title: newOffer.title,
      description: newOffer.description,
      coins_amount: 0,
      original_price: 0,
      offer_price: 0,
      bonus_percentage: newOffer.bonus_percentage,
      discount_percent: newOffer.bonus_percentage,
      starts_at: new Date().toISOString(),
      ends_at: newOffer.ends_at,
      badge_text: newOffer.badge_text,
      is_active: newOffer.is_active,
    });
    if (error) toast.error("Failed to add offer");
    else {
      toast.success("Offer created");
      setShowAddOffer(false);
      setNewOffer({ title: "", description: "", bonus_percentage: 50, ends_at: "", badge_text: "LIMITED TIME", is_active: true });
      fetchAll();
    }
  };

  const toggleOffer = async (id: string, isActive: boolean) => {
    const { error } = await supabase
      .from("limited_time_offers")
      .update({ is_active: !isActive, updated_at: new Date().toISOString() })
      .eq("id", id);
    if (error) toast.error("Failed to toggle");
    else {
      toast.success(isActive ? "Offer deactivated" : "Offer activated");
      fetchAll();
    }
  };

  const deleteOffer = async (id: string) => {
    const { error } = await supabase.from("limited_time_offers").delete().eq("id", id);
    if (error) toast.error("Failed to delete");
    else {
      toast.success("Offer deleted");
      fetchAll();
    }
  };

  return (
    <div className="admin-pro-shell space-y-6 p-4 md:p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Rewards Management</h1>
          <p className="text-muted-foreground text-sm">Manage daily login, first recharge, cashback & offers</p>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid grid-cols-5 w-full">
          <TabsTrigger value="daily-login" className="flex items-center gap-1.5">
            <Gift className="w-4 h-4" /> Daily Login
          </TabsTrigger>
          <TabsTrigger value="weekly-login" className="flex items-center gap-1.5">
            <CalendarDays className="w-4 h-4" /> Weekly Login
          </TabsTrigger>
          <TabsTrigger value="first-recharge" className="flex items-center gap-1.5">
            <Crown className="w-4 h-4" /> First Recharge
          </TabsTrigger>
          <TabsTrigger value="cashback" className="flex items-center gap-1.5">
            <TrendingUp className="w-4 h-4" /> Cashback
          </TabsTrigger>
          <TabsTrigger value="offers" className="flex items-center gap-1.5">
            <Zap className="w-4 h-4" /> Limited Offers
          </TabsTrigger>
        </TabsList>

        {/* ===== DAILY LOGIN TAB ===== */}
        <TabsContent value="daily-login" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">7-Day Login Reward Cycle</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid gap-4">
                {loginRewards.map((reward) => (
                  <DailyLoginRewardRow
                    key={reward.id}
                    reward={reward}
                    onCommit={(field, value) => updateLoginReward(reward.id, field, value)}
                  />
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ===== FIRST RECHARGE TAB ===== */}
        <TabsContent value="first-recharge" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">First Recharge Bonus Configuration</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {firstRechargeConfig && (
                <>
                  <div className="flex items-center justify-between p-3 bg-muted rounded-lg">
                    <div>
                      <p className="font-medium">Bonus Active</p>
                      <p className="text-xs text-muted-foreground">Enable/disable first recharge bonus</p>
                    </div>
                    <Switch
                      checked={firstRechargeConfig.is_active}
                      onCheckedChange={(val) => setFirstRechargeConfig({ ...firstRechargeConfig, is_active: val })}
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label>Bonus Multiplier</Label>
                      <Input
                        type="number"
                        step="0.5"
                        value={firstRechargeConfig.bonus_multiplier}
                        onChange={(e) => setFirstRechargeConfig({ ...firstRechargeConfig, bonus_multiplier: parseFloat(e.target.value) || 2 })}
                      />
                      <p className="text-xs text-muted-foreground mt-1">e.g. 2.0 = double coins, 3.0 = triple</p>
                    </div>
                    <div>
                      <Label>Bonus Label</Label>
                      <Input
                        value={firstRechargeConfig.bonus_label || ""}
                        onChange={(e) => setFirstRechargeConfig({ ...firstRechargeConfig, bonus_label: e.target.value })}
                      />
                    </div>
                  </div>

                  <div>
                    <Label>Description</Label>
                    <Input
                      value={firstRechargeConfig.description || ""}
                      onChange={(e) => setFirstRechargeConfig({ ...firstRechargeConfig, description: e.target.value })}
                    />
                  </div>

                  <Button onClick={saveFirstRecharge} className="w-full">
                    <Save className="w-4 h-4 mr-2" /> Save Configuration
                  </Button>
                </>
              )}
            </CardContent>
          </Card>

          {/* Banner Management Card */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <Image className="w-5 h-5" /> Recharge Page Banner
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {firstRechargeConfig && (
                <>
                  {/* Banner Type Toggle */}
                  <div className="flex items-center gap-4 p-3 bg-muted rounded-lg">
                    <Label className="font-medium">Banner Type:</Label>
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        variant={firstRechargeConfig.banner_type === 'image' ? 'default' : 'outline'}
                        onClick={() => setFirstRechargeConfig({ ...firstRechargeConfig, banner_type: 'image' })}
                      >
                        <Image className="w-4 h-4 mr-1" /> Image
                      </Button>
                      <Button
                        size="sm"
                        variant={firstRechargeConfig.banner_type === 'text' ? 'default' : 'outline'}
                        onClick={() => setFirstRechargeConfig({ ...firstRechargeConfig, banner_type: 'text' })}
                      >
                        <Type className="w-4 h-4 mr-1" /> Text
                      </Button>
                    </div>
                  </div>

                  {/* Banner Title & Subtitle */}
                  <div className="grid grid-cols-1 gap-3">
                    <div>
                      <Label>Banner Title</Label>
                      <Input
                        value={firstRechargeConfig.banner_title || ""}
                        onChange={(e) => setFirstRechargeConfig({ ...firstRechargeConfig, banner_title: e.target.value })}
                        placeholder="✨ First Recharge Bonus!"
                      />
                    </div>
                    <div>
                      <Label>Banner Subtitle</Label>
                      <Input
                        value={firstRechargeConfig.banner_subtitle || ""}
                        onChange={(e) => setFirstRechargeConfig({ ...firstRechargeConfig, banner_subtitle: e.target.value })}
                        placeholder="Get extra bonus diamonds on your first purchase"
                      />
                    </div>
                  </div>

                  {/* Image Upload (when type = image) */}
                  {firstRechargeConfig.banner_type === 'image' && (
                    <div className="space-y-3">
                      <Label>Banner Image</Label>
                      {firstRechargeConfig.banner_image_url ? (
                        <div className="relative rounded-xl overflow-hidden border border-border">
                          <SmartImage
                            src={firstRechargeConfig.banner_image_url}
                            alt="Banner Preview"
                            className="w-full h-32 object-cover" onError={(e) => { const t = e.currentTarget; if (t.src.indexOf('/placeholder.svg') === -1) t.src = '/placeholder.svg'; }} />
                          <Button
                            size="sm"
                            variant="destructive"
                            className="absolute top-2 right-2"
                            onClick={removeBannerImage}
                          >
                            <Trash2 className="w-3 h-3 mr-1" /> Remove
                          </Button>
                        </div>
                      ) : (
                        <label className="flex flex-col items-center justify-center h-28 border-2 border-dashed border-muted-foreground/30 rounded-xl cursor-pointer hover:border-primary/50 transition-colors">
                          <Upload className="w-8 h-8 text-muted-foreground mb-2" />
                          <span className="text-sm text-muted-foreground">Click to upload banner image</span>
                          <span className="text-xs text-muted-foreground/60">Recommended: 1024×512px</span>
                          <input
                            type="file"
                            accept="image/*"
                            className="hidden"
                            onChange={handleBannerUpload}
                          />
                        </label>
                      )}
                    </div>
                  )}

                  <Button onClick={saveFirstRecharge} className="w-full">
                    <Save className="w-4 h-4 mr-2" /> Save Banner Settings
                  </Button>
                </>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ===== CASHBACK TAB ===== */}
        <TabsContent value="cashback" className="space-y-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="text-lg">Consumption Return Tiers</CardTitle>
              <Button size="sm" onClick={addTier}>
                <Plus className="w-4 h-4 mr-1" /> Add Tier
              </Button>
            </CardHeader>
            <CardContent>
              <div className="grid gap-4">
                {consumptionTiers.map((tier) => (
                  <ConsumptionTierRow
                    key={tier.id}
                    tier={tier}
                    onCommit={(updates) => updateTier(tier.id, updates)}
                    onDelete={() => deleteTier(tier.id)}
                  />
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ===== LIMITED OFFERS TAB ===== */}
        <TabsContent value="offers" className="space-y-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="text-lg">Limited Time Offers</CardTitle>
              <Button size="sm" onClick={() => setShowAddOffer(!showAddOffer)}>
                <Plus className="w-4 h-4 mr-1" /> {showAddOffer ? "Cancel" : "New Offer"}
              </Button>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Add New Offer Form */}
              {showAddOffer && (
                <div className="p-4 border-2 border-dashed border-primary/30 rounded-lg space-y-3 bg-primary/5">
                  <h3 className="font-semibold">Create New Offer</h3>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label className="text-xs">Title</Label>
                      <Input
                        value={newOffer.title}
                        onChange={(e) => setNewOffer({ ...newOffer, title: e.target.value })}
                        placeholder="🔥 Flash Sale!"
                      />
                    </div>
                    <div>
                      <Label className="text-xs">Badge Text</Label>
                      <Input
                        value={newOffer.badge_text}
                        onChange={(e) => setNewOffer({ ...newOffer, badge_text: e.target.value })}
                      />
                    </div>
                  </div>
                  <div>
                    <Label className="text-xs">Description</Label>
                    <Input
                      value={newOffer.description}
                      onChange={(e) => setNewOffer({ ...newOffer, description: e.target.value })}
                      placeholder="Get extra coins on recharge!"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label className="text-xs">Bonus Percentage</Label>
                      <Input
                        type="number"
                        value={newOffer.bonus_percentage}
                        onChange={(e) => setNewOffer({ ...newOffer, bonus_percentage: parseInt(e.target.value) || 0 })}
                      />
                    </div>
                    <div>
                      <Label className="text-xs">End Date & Time</Label>
                      <Input
                        type="datetime-local"
                        value={newOffer.ends_at}
                        onChange={(e) => setNewOffer({ ...newOffer, ends_at: e.target.value })}
                      />
                    </div>
                  </div>
                  <Button onClick={addOffer} className="w-full">
                    <Plus className="w-4 h-4 mr-2" /> Create Offer
                  </Button>
                </div>
              )}

              {/* Existing Offers */}
              {limitedOffers.length === 0 && !showAddOffer ? (
                <div className="text-center py-8 text-muted-foreground">
                  <Zap className="w-10 h-10 mx-auto mb-2 opacity-30" />
                  <p>No offers yet. Create your first limited time offer!</p>
                </div>
              ) : (
                limitedOffers.map((offer) => {
                  const isExpired = new Date(offer.ends_at) < new Date();
                  return (
                    <div
                      key={offer.id}
                      className={`p-4 border rounded-lg ${isExpired ? "opacity-50" : ""}`}
                    >
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-1">
                            <h3 className="font-bold">{offer.title}</h3>
                            <Badge variant={offer.is_active && !isExpired ? "default" : "secondary"}>
                              {isExpired ? "Expired" : offer.is_active ? "Active" : "Inactive"}
                            </Badge>
                            <Badge variant="outline">{offer.badge_text}</Badge>
                          </div>
                          <p className="text-sm text-muted-foreground">{offer.description}</p>
                          <div className="flex items-center gap-4 mt-2 text-xs text-muted-foreground">
                            <span className="flex items-center gap-1">
                              <TrendingUp className="w-3 h-3" /> +{offer.bonus_percentage}% bonus
                            </span>
                            <span className="flex items-center gap-1">
                              <Timer className="w-3 h-3" /> Ends: {new Date(offer.ends_at).toLocaleDateString()}
                            </span>
                            <span>Claims: {offer.total_claimed}{offer.total_max_claims ? `/${offer.total_max_claims}` : ""}</span>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <Switch
                            checked={offer.is_active}
                            onCheckedChange={() => toggleOffer(offer.id, offer.is_active)}
                          />
                          <Button
                            variant="ghost"
                            size="icon"
                            className="text-destructive"
                            onClick={() => deleteOffer(offer.id)}
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
};

const blurOnEnter = (e: React.KeyboardEvent<HTMLInputElement>) => {
  if (e.key === "Enter") (e.target as HTMLInputElement).blur();
};

const DailyLoginRewardRow = ({ reward, onCommit }: { reward: any; onCommit: (field: string, value: any) => void }) => {
  const [draft, setDraft] = useState({
    reward_coins: String(reward.reward_coins ?? 0),
    reward_diamonds: String(reward.reward_diamonds ?? 0),
    bonus_label: reward.bonus_label || "",
  });

  useEffect(() => {
    setDraft({
      reward_coins: String(reward.reward_coins ?? 0),
      reward_diamonds: String(reward.reward_diamonds ?? 0),
      bonus_label: reward.bonus_label || "",
    });
  }, [reward.id, reward.reward_coins, reward.reward_diamonds, reward.bonus_label]);

  const commitNumber = (field: "reward_coins" | "reward_diamonds") => {
    const next = draft[field] === "" ? 0 : Math.max(0, Number(draft[field]));
    if (!Number.isFinite(next) || next === Number(reward[field] ?? 0)) return;
    onCommit(field, next);
  };

  const commitLabel = () => {
    if (draft.bonus_label !== (reward.bonus_label || "")) onCommit("bonus_label", draft.bonus_label);
  };

  return (
    <div className="flex items-center gap-4 p-3 border rounded-lg">
      <Badge variant="outline" className="min-w-[60px] justify-center">
        Day {reward.day_number}
      </Badge>
      <div className="flex-1 grid grid-cols-3 gap-3">
        <div>
          <Label className="text-xs">Coins</Label>
          <Input
            type="number"
            inputMode="numeric"
            min={0}
            value={draft.reward_coins}
            onChange={(e) => setDraft((d) => ({ ...d, reward_coins: e.target.value }))}
            onBlur={() => commitNumber("reward_coins")}
            onKeyDown={blurOnEnter}
            className="h-8"
          />
        </div>
        <div>
          <Label className="text-xs">Diamonds</Label>
          <Input
            type="number"
            inputMode="numeric"
            min={0}
            value={draft.reward_diamonds}
            onChange={(e) => setDraft((d) => ({ ...d, reward_diamonds: e.target.value }))}
            onBlur={() => commitNumber("reward_diamonds")}
            onKeyDown={blurOnEnter}
            className="h-8"
          />
        </div>
        <div>
          <Label className="text-xs">Label</Label>
          <Input
            value={draft.bonus_label}
            onChange={(e) => setDraft((d) => ({ ...d, bonus_label: e.target.value }))}
            onBlur={commitLabel}
            onKeyDown={blurOnEnter}
            className="h-8"
          />
        </div>
      </div>
      <div className="flex items-center gap-2">
        <Label className="text-xs">Active</Label>
        <Switch checked={reward.is_active} onCheckedChange={(val) => onCommit("is_active", val)} />
      </div>
    </div>
  );
};

const ConsumptionTierRow = ({ tier, onCommit, onDelete }: { tier: any; onCommit: (updates: any) => void; onDelete: () => void }) => {
  const [draft, setDraft] = useState({
    tier_name: tier.tier_name || "",
    min_spend: String(tier.min_spend ?? 0),
    max_spend: tier.max_spend == null ? "" : String(tier.max_spend),
    return_percentage: String(tier.return_percentage ?? 0),
    max_return_coins: tier.max_return_coins == null ? "" : String(tier.max_return_coins),
  });

  useEffect(() => {
    setDraft({
      tier_name: tier.tier_name || "",
      min_spend: String(tier.min_spend ?? 0),
      max_spend: tier.max_spend == null ? "" : String(tier.max_spend),
      return_percentage: String(tier.return_percentage ?? 0),
      max_return_coins: tier.max_return_coins == null ? "" : String(tier.max_return_coins),
    });
  }, [tier.id, tier.tier_name, tier.min_spend, tier.max_spend, tier.return_percentage, tier.max_return_coins]);

  const commitText = () => {
    const next = draft.tier_name.trim() || "New Tier";
    if (next !== tier.tier_name) onCommit({ tier_name: next });
  };

  const commitNumber = (field: "min_spend" | "return_percentage", decimal = false) => {
    const next = draft[field] === "" ? 0 : Math.max(0, decimal ? Number(draft[field]) : Math.trunc(Number(draft[field])));
    if (!Number.isFinite(next) || next === Number(tier[field] ?? 0)) return;
    onCommit({ [field]: next });
  };

  const commitNullableNumber = (field: "max_spend" | "max_return_coins") => {
    const next = draft[field] === "" ? null : Math.max(0, Math.trunc(Number(draft[field])));
    if (next !== null && !Number.isFinite(next)) return;
    if (next !== (tier[field] ?? null)) onCommit({ [field]: next });
  };

  return (
    <div className="p-4 border rounded-lg space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Crown className="w-5 h-5 text-amber-500" />
          <Input
            value={draft.tier_name}
            onChange={(e) => setDraft((d) => ({ ...d, tier_name: e.target.value }))}
            onBlur={commitText}
            onKeyDown={blurOnEnter}
            className="h-8 w-32 font-bold"
          />
        </div>
        <div className="flex items-center gap-2">
          <Switch checked={tier.is_active} onCheckedChange={(val) => onCommit({ is_active: val })} />
          <Button variant="ghost" size="icon" className="text-destructive" onClick={onDelete}>
            <Trash2 className="w-4 h-4" />
          </Button>
        </div>
      </div>
      <div className="grid grid-cols-4 gap-3">
        <div>
          <Label className="text-xs">Min Spend</Label>
          <Input
            type="number"
            inputMode="numeric"
            min={0}
            value={draft.min_spend}
            onChange={(e) => setDraft((d) => ({ ...d, min_spend: e.target.value }))}
            onBlur={() => commitNumber("min_spend")}
            onKeyDown={blurOnEnter}
            className="h-8"
          />
        </div>
        <div>
          <Label className="text-xs">Max Spend</Label>
          <Input
            type="number"
            inputMode="numeric"
            min={0}
            value={draft.max_spend}
            placeholder="Unlimited"
            onChange={(e) => setDraft((d) => ({ ...d, max_spend: e.target.value }))}
            onBlur={() => commitNullableNumber("max_spend")}
            onKeyDown={blurOnEnter}
            className="h-8"
          />
        </div>
        <div>
          <Label className="text-xs">Return %</Label>
          <Input
            type="number"
            inputMode="decimal"
            step="0.5"
            min={0}
            value={draft.return_percentage}
            onChange={(e) => setDraft((d) => ({ ...d, return_percentage: e.target.value }))}
            onBlur={() => commitNumber("return_percentage", true)}
            onKeyDown={blurOnEnter}
            className="h-8"
          />
        </div>
        <div>
          <Label className="text-xs">Max Return</Label>
          <Input
            type="number"
            inputMode="numeric"
            min={0}
            value={draft.max_return_coins}
            placeholder="Unlimited"
            onChange={(e) => setDraft((d) => ({ ...d, max_return_coins: e.target.value }))}
            onBlur={() => commitNullableNumber("max_return_coins")}
            onKeyDown={blurOnEnter}
            className="h-8"
          />
        </div>
      </div>
    </div>
  );
};

export default AdminRewardsManagement;
