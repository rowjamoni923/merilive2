import { useState, useEffect, useCallback } from "react";
import useAdminRealtime from "@/hooks/useAdminRealtime";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, Gift, Coins, Clock, Zap, Plus, Trash2, Save, Edit2, Crown, TrendingUp, Timer, ToggleLeft, ToggleRight, Upload, Image, Type } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { adminSupabase as supabase } from "@/integrations/supabase/adminClient";
import { toast } from "sonner";

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

  // Fetch all data
  const fetchAll = useCallback(async () => {
    const [loginRes, firstRechargeRes, tiersRes, offersRes] = await Promise.all([
      supabase.from("daily_login_rewards_config").select("*").order("day_number"),
      supabase.from("first_recharge_bonus").select("*").eq("is_active", true).maybeSingle(),
      supabase.from("consumption_return_config").select("*").order("display_order"),
      supabase.from("limited_time_offers").select("*").order("created_at", { ascending: false }),
    ]);

    setLoginRewards(loginRes.data || []);
    setLoginLoading(false);
    setFirstRechargeConfig(firstRechargeRes.data || { bonus_multiplier: 2.0, bonus_label: "2x Bonus", description: "", is_active: true });
    setFirstRechargeLoading(false);
    setConsumptionTiers(tiersRes.data || []);
    setConsumptionLoading(false);
    setLimitedOffers(offersRes.data || []);
    setOffersLoading(false);
  }, []);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  useAdminRealtime(['daily_login_rewards_config', 'first_recharge_bonus', 'consumption_return_config', 'limited_time_offers'], () => fetchAll());

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

  // ===== FIRST RECHARGE HANDLERS =====
  const saveFirstRecharge = async () => {
    if (!firstRechargeConfig?.id) return;
    const { error } = await supabase
      .from("first_recharge_bonus")
      .update({
        bonus_multiplier: firstRechargeConfig.bonus_multiplier,
        bonus_label: firstRechargeConfig.bonus_label,
        description: firstRechargeConfig.description,
        is_active: firstRechargeConfig.is_active,
        banner_image_url: firstRechargeConfig.banner_image_url || null,
        banner_title: firstRechargeConfig.banner_title || 'First Recharge Bonus!',
        banner_subtitle: firstRechargeConfig.banner_subtitle || 'Get extra bonus diamonds on your first purchase',
        banner_type: firstRechargeConfig.banner_type || 'image',
        updated_at: new Date().toISOString(),
      })
      .eq("id", firstRechargeConfig.id);
    if (error) toast.error("Failed to save");
    else toast.success("First recharge config saved");
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
      bonus_percentage: newOffer.bonus_percentage,
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
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Rewards Management</h1>
          <p className="text-muted-foreground text-sm">Manage daily login, first recharge, cashback & offers</p>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid grid-cols-4 w-full">
          <TabsTrigger value="daily-login" className="flex items-center gap-1.5">
            <Gift className="w-4 h-4" /> Daily Login
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
                  <div key={reward.id} className="flex items-center gap-4 p-3 border rounded-lg">
                    <Badge variant="outline" className="min-w-[60px] justify-center">
                      Day {reward.day_number}
                    </Badge>
                    <div className="flex-1 grid grid-cols-3 gap-3">
                      <div>
                        <Label className="text-xs">Diamonds</Label>
                        <Input
                          type="number"
                          value={reward.reward_coins}
                          onChange={(e) => updateLoginReward(reward.id, "reward_coins", parseInt(e.target.value) || 0)}
                          className="h-8"
                        />
                      </div>
                      <div>
                        <Label className="text-xs">Diamonds</Label>
                        <Input
                          type="number"
                          value={reward.reward_diamonds}
                          onChange={(e) => updateLoginReward(reward.id, "reward_diamonds", parseInt(e.target.value) || 0)}
                          className="h-8"
                        />
                      </div>
                      <div>
                        <Label className="text-xs">Label</Label>
                        <Input
                          value={reward.bonus_label || ""}
                          onChange={(e) => updateLoginReward(reward.id, "bonus_label", e.target.value)}
                          className="h-8"
                        />
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Label className="text-xs">Active</Label>
                      <Switch
                        checked={reward.is_active}
                        onCheckedChange={(val) => updateLoginReward(reward.id, "is_active", val)}
                      />
                    </div>
                  </div>
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
                          <img
                            src={firstRechargeConfig.banner_image_url}
                            alt="Banner Preview"
                            className="w-full h-32 object-cover"
                          />
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
                  <div key={tier.id} className="p-4 border rounded-lg space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Crown className="w-5 h-5 text-amber-500" />
                        <Input
                          value={tier.tier_name}
                          onChange={(e) => updateTier(tier.id, { tier_name: e.target.value })}
                          className="h-8 w-32 font-bold"
                        />
                      </div>
                      <div className="flex items-center gap-2">
                        <Switch
                          checked={tier.is_active}
                          onCheckedChange={(val) => updateTier(tier.id, { is_active: val })}
                        />
                        <Button
                          variant="ghost"
                          size="icon"
                          className="text-destructive"
                          onClick={() => deleteTier(tier.id)}
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    </div>
                    <div className="grid grid-cols-4 gap-3">
                      <div>
                        <Label className="text-xs">Min Spend</Label>
                        <Input
                          type="number"
                          value={tier.min_spend}
                          onChange={(e) => updateTier(tier.id, { min_spend: parseInt(e.target.value) || 0 })}
                          className="h-8"
                        />
                      </div>
                      <div>
                        <Label className="text-xs">Max Spend</Label>
                        <Input
                          type="number"
                          value={tier.max_spend || ""}
                          placeholder="Unlimited"
                          onChange={(e) => updateTier(tier.id, { max_spend: e.target.value ? parseInt(e.target.value) : null })}
                          className="h-8"
                        />
                      </div>
                      <div>
                        <Label className="text-xs">Return %</Label>
                        <Input
                          type="number"
                          step="0.5"
                          value={tier.return_percentage}
                          onChange={(e) => updateTier(tier.id, { return_percentage: parseFloat(e.target.value) || 0 })}
                          className="h-8"
                        />
                      </div>
                      <div>
                        <Label className="text-xs">Max Return</Label>
                        <Input
                          type="number"
                          value={tier.max_return_coins || ""}
                          placeholder="Unlimited"
                          onChange={(e) => updateTier(tier.id, { max_return_coins: e.target.value ? parseInt(e.target.value) : null })}
                          className="h-8"
                        />
                      </div>
                    </div>
                  </div>
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

export default AdminRewardsManagement;
