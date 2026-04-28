import { useState, useEffect } from "react";
import { useAdminRealtime } from "@/hooks/useAdminRealtime";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { adminSupabase as supabase } from "@/integrations/supabase/adminClient";
import { useToast } from "@/hooks/use-toast";
import { 
  Crown, Plus, Edit2, Trash2, Sparkles, Gem, Gift, 
  Upload, Save, Image, Play, MessageCircle, Star, X,
  RefreshCw, Shield, EyeOff, Ghost, Coins, Calendar, Zap, Lock, TrendingUp
} from "lucide-react";
import UniversalAnimationPlayer from "@/components/common/UniversalAnimationPlayer";

interface VIPTier {
  id: string;
  tier_code: string;
  tier_name: string;
  tier_level: number;
  price_diamonds: number;
  duration_days: number;
  badge_url: string | null;
  badge_color: string;
  description: string;
  exclusive_frames: boolean;
  exclusive_entry_bars: boolean;
  exclusive_gifts: boolean;
  exclusive_bubbles: boolean;
  exclusive_stickers: boolean;
  priority_matching: boolean;
  ad_free: boolean;
  faster_support: boolean;
  vip_only_rooms: boolean;
  profile_highlight: boolean;
  is_active: boolean;
  display_order: number;
  // Animation URLs
  frame_animation_url?: string | null;
  entry_animation_url?: string | null;
  bubble_animation_url?: string | null;
  badge_animation_url?: string | null;
  // Power Perks (Phase 1)
  anti_kick_protection?: boolean;
  stealth_mode?: boolean;
  hide_real_level?: boolean;
  forbidden_words_bypass?: boolean;
  top_position_in_lists?: boolean;
  vip_only_lounge_access?: boolean;
  priority_random_match?: boolean;
  max_kick_tier_level?: number;
  // Economy (Phase 1)
  recharge_bonus_percent?: number;
  daily_free_diamonds?: number;
  free_name_changes_per_month?: number;
  entry_effect_duration_seconds?: number;
  username_color?: string | null;
  profile_background_url?: string | null;
}

const defaultTier: Partial<VIPTier> = {
  tier_code: '',
  tier_name: '',
  tier_level: 1,
  price_diamonds: 5000,
  duration_days: 30,
  badge_color: '#FFD700',
  description: '',
  exclusive_frames: true,
  exclusive_entry_bars: false,
  exclusive_gifts: false,
  exclusive_bubbles: false,
  exclusive_stickers: false,
  priority_matching: false,
  ad_free: true,
  faster_support: false,
  vip_only_rooms: false,
  profile_highlight: true,
  is_active: true,
  display_order: 0,
  // Power Perks defaults
  anti_kick_protection: false,
  stealth_mode: false,
  hide_real_level: false,
  forbidden_words_bypass: false,
  top_position_in_lists: false,
  vip_only_lounge_access: false,
  priority_random_match: false,
  max_kick_tier_level: 0,
  // Economy defaults
  recharge_bonus_percent: 0,
  daily_free_diamonds: 0,
  free_name_changes_per_month: 0,
  entry_effect_duration_seconds: 5,
  username_color: '',
  profile_background_url: '',
};

const AdminVIPPrivileges = () => {
  const { toast } = useToast();
  const [tiers, setTiers] = useState<VIPTier[]>([]);
  const [loading, setLoading] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingTier, setEditingTier] = useState<VIPTier | null>(null);
  const [tierForm, setTierForm] = useState<Partial<VIPTier>>(defaultTier);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState<string | null>(null);

  const fetchTiers = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("vip_tiers")
      .select("*")
      .order("display_order");
    
    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    }
    setTiers(data || []);
    setLoading(false);
  };

  useEffect(() => {
    fetchTiers();
  }, []);
  useAdminRealtime(['vip_tiers'], fetchTiers, 'admin-vip-privileges-rt');

  const handleFileUpload = async (
    e: React.ChangeEvent<HTMLInputElement>, 
    field: keyof VIPTier
  ) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 100 * 1024 * 1024) {
      toast({ title: "File too large", description: "Max 100MB allowed", variant: "destructive" });
      return;
    }

    setUploading(field);
    try {
      const fileExt = file.name.split('.').pop();
      const fileName = `vip-${field}-${Date.now()}.${fileExt}`;
      
      const { error: uploadError } = await supabase.storage
        .from('animations')
        .upload(fileName, file, { upsert: true });

      if (uploadError) throw uploadError;

      const { data: { publicUrl } } = supabase.storage
        .from('animations')
        .getPublicUrl(fileName);

      setTierForm(prev => ({ ...prev, [field]: publicUrl }));
      toast({ title: "Uploaded!", description: `${field} animation uploaded` });
    } catch (error: any) {
      toast({ title: "Upload Failed", description: error.message, variant: "destructive" });
    } finally {
      setUploading(null);
    }
  };

  const handleSave = async () => {
    if (!tierForm.tier_code || !tierForm.tier_name) {
      toast({ title: "Required", description: "Code and Name are required", variant: "destructive" });
      return;
    }

    setSaving(true);
    try {
      if (editingTier) {
        const { error } = await supabase
          .from("vip_tiers")
          .update(tierForm as any)
          .eq("id", editingTier.id);
        if (error) throw error;
        toast({ title: "Updated!", description: `${tierForm.tier_name} saved` });
      } else {
        const { error } = await supabase
          .from("vip_tiers")
          .insert([tierForm as any]);
        if (error) throw error;
        toast({ title: "Created!", description: `${tierForm.tier_name} added` });
      }
      setDialogOpen(false);
      setEditingTier(null);
      setTierForm(defaultTier);
      fetchTiers();
    } catch (error: any) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (tier: VIPTier) => {
    if (!confirm(`Delete ${tier.tier_name}?`)) return;
    
    const { error } = await supabase
      .from("vip_tiers")
      .delete()
      .eq("id", tier.id);
    
    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Deleted", description: `${tier.tier_name} removed` });
      fetchTiers();
    }
  };

  const openEdit = (tier: VIPTier) => {
    setEditingTier(tier);
    setTierForm(tier);
    setDialogOpen(true);
  };

  const openCreate = () => {
    setEditingTier(null);
    setTierForm({ ...defaultTier, display_order: tiers.length });
    setDialogOpen(true);
  };

  const getTierGradient = (level: number) => {
    const gradients: Record<number, string> = {
      6: "from-purple-600 to-pink-600",
      5: "from-rose-500 to-pink-500",
      4: "from-cyan-400 to-blue-500",
      3: "from-gray-300 to-gray-400",
      2: "from-amber-400 to-yellow-500",
      1: "from-slate-400 to-slate-500",
    };
    return gradients[level] || gradients[1];
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin w-8 h-8 border-4 border-purple-500 border-t-transparent rounded-full" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2">
            <Crown className="w-7 h-7 text-amber-400" />
            VIP Privileges
          </h1>
          <p className="text-slate-400 text-sm">Manage VIP tiers and exclusive items</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="icon" onClick={fetchTiers}>
            <RefreshCw className="w-4 h-4" />
          </Button>
          <Button onClick={openCreate} className="bg-gradient-to-r from-purple-600 to-pink-600">
            <Plus className="w-4 h-4 mr-2" />
            Add Tier
          </Button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-slate-900 border border-slate-700 rounded-xl p-4 text-center">
          <Crown className="w-8 h-8 text-purple-400 mx-auto mb-2" />
          <p className="text-2xl font-bold text-white">{tiers.length}</p>
          <p className="text-sm text-slate-400">VIP Tiers</p>
        </div>
        <div className="bg-slate-900 border border-slate-700 rounded-xl p-4 text-center">
          <Gem className="w-8 h-8 text-cyan-400 mx-auto mb-2" />
          <p className="text-2xl font-bold text-white">{tiers.filter(t => t.is_active).length}</p>
          <p className="text-sm text-slate-400">Active</p>
        </div>
      </div>

      {/* Tier Cards */}
      <div className="grid gap-4">
        {tiers.map((tier) => (
          <div key={tier.id} className="bg-slate-900 border border-slate-700 rounded-xl overflow-hidden">
            <div className={`p-4 bg-gradient-to-r ${getTierGradient(tier.tier_level)}`}>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 rounded-xl bg-white/20 flex items-center justify-center">
                    {tier.badge_animation_url ? (
                      <UniversalAnimationPlayer
                        src={tier.badge_animation_url}
                        className="w-10 h-10"
                        loop
                        autoPlay
                      />
                    ) : (
                      <Crown className="w-6 h-6 text-white" />
                    )}
                  </div>
                  <div>
                    <h4 className="text-white font-bold">{tier.tier_name}</h4>
                    <p className="text-white/80 text-sm">{tier.duration_days} Days • {tier.price_diamonds?.toLocaleString()} 💎</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant={tier.is_active ? "default" : "secondary"}>
                    {tier.is_active ? "Active" : "Inactive"}
                  </Badge>
                  <Button
                    size="icon"
                    variant="ghost"
                    onClick={() => openEdit(tier)}
                    className="text-white hover:bg-white/20"
                  >
                    <Edit2 className="w-4 h-4" />
                  </Button>
                  <Button
                    size="icon"
                    variant="ghost"
                    onClick={() => handleDelete(tier)}
                    className="text-white hover:bg-red-500/20"
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            </div>
            <div className="p-4">
              <p className="text-slate-400 text-sm mb-3">{tier.description}</p>
              
              {/* Privilege Badges */}
              <div className="flex flex-wrap gap-2 mb-3">
                {tier.exclusive_frames && <Badge variant="outline" className="border-purple-500 text-purple-400">Frames</Badge>}
                {tier.exclusive_entry_bars && <Badge variant="outline" className="border-cyan-500 text-cyan-400">Entry</Badge>}
                {tier.exclusive_gifts && <Badge variant="outline" className="border-pink-500 text-pink-400">Gifts</Badge>}
                {tier.exclusive_bubbles && <Badge variant="outline" className="border-amber-500 text-amber-400">Bubbles</Badge>}
                {tier.ad_free && <Badge variant="outline" className="border-green-500 text-green-400">Ad-Free</Badge>}
                {tier.profile_highlight && <Badge variant="outline" className="border-rose-500 text-rose-400">Glow</Badge>}
              </div>

              {/* Animation Previews */}
              {(tier.frame_animation_url || tier.entry_animation_url) && (
                <div className="flex gap-3 mt-3 pt-3 border-t border-slate-700">
                  {tier.frame_animation_url && (
                    <div className="text-center">
                      <div className="w-16 h-16 bg-slate-800 rounded-lg overflow-hidden">
                        <UniversalAnimationPlayer
                          src={tier.frame_animation_url}
                          className="w-full h-full"
                          loop
                          autoPlay
                        />
                      </div>
                      <p className="text-xs text-slate-500 mt-1">Frame</p>
                    </div>
                  )}
                  {tier.entry_animation_url && (
                    <div className="text-center">
                      <div className="w-16 h-16 bg-slate-800 rounded-lg overflow-hidden">
                        <UniversalAnimationPlayer
                          src={tier.entry_animation_url}
                          className="w-full h-full"
                          loop
                          autoPlay
                        />
                      </div>
                      <p className="text-xs text-slate-500 mt-1">Entry</p>
                    </div>
                  )}
                  {tier.bubble_animation_url && (
                    <div className="text-center">
                      <div className="w-16 h-16 bg-slate-800 rounded-lg overflow-hidden">
                        <UniversalAnimationPlayer
                          src={tier.bubble_animation_url}
                          className="w-full h-full"
                          loop
                          autoPlay
                        />
                      </div>
                      <p className="text-xs text-slate-500 mt-1">Bubble</p>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Edit/Create Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent
          className="bg-slate-900 border-slate-700 w-[95vw] sm:max-w-5xl max-h-[92vh] p-0 flex flex-col"
          style={{ resize: 'both', overflow: 'hidden', minWidth: '320px', minHeight: '400px' }}
        >
          <DialogHeader className="p-4 border-b border-slate-700 shrink-0">
            <DialogTitle className="text-white flex items-center gap-2">
              <Crown className="w-5 h-5 text-amber-400" />
              {editingTier ? `Edit ${editingTier.tier_name}` : "Create VIP Tier"}
            </DialogTitle>
          </DialogHeader>
          
          <ScrollArea className="flex-1 min-h-0">
            <div className="p-4 space-y-6">
              <Tabs defaultValue="basic">
                <TabsList className="bg-slate-800 w-full flex-wrap h-auto">
                  <TabsTrigger value="basic" className="flex-1 min-w-[90px]">Basic</TabsTrigger>
                  <TabsTrigger value="privileges" className="flex-1 min-w-[90px]">Cosmetic</TabsTrigger>
                  <TabsTrigger value="power" className="flex-1 min-w-[90px]">Power Perks</TabsTrigger>
                  <TabsTrigger value="economy" className="flex-1 min-w-[90px]">Economy</TabsTrigger>
                  <TabsTrigger value="animations" className="flex-1 min-w-[90px]">Animations</TabsTrigger>
                </TabsList>

                {/* Basic Info Tab */}
                <TabsContent value="basic" className="space-y-4 mt-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="text-sm text-slate-400 mb-1 block">Tier Code *</label>
                      <Input
                        value={tierForm.tier_code || ''}
                        onChange={(e) => setTierForm(prev => ({ ...prev, tier_code: e.target.value }))}
                        placeholder="vip1"
                        className="bg-slate-800 border-slate-600 text-white"
                      />
                    </div>
                    <div>
                      <label className="text-sm text-slate-400 mb-1 block">Tier Name *</label>
                      <Input
                        value={tierForm.tier_name || ''}
                        onChange={(e) => setTierForm(prev => ({ ...prev, tier_name: e.target.value }))}
                        placeholder="VIP 1"
                        className="bg-slate-800 border-slate-600 text-white"
                      />
                    </div>
                  </div>
                  
                  <div className="grid grid-cols-3 gap-4">
                    <div>
                      <label className="text-sm text-slate-400 mb-1 block">Level</label>
                      <Input
                        type="number"
                        value={tierForm.tier_level || 1}
                        onChange={(e) => setTierForm(prev => ({ ...prev, tier_level: parseInt(e.target.value) || 1 }))}
                        className="bg-slate-800 border-slate-600 text-white"
                      />
                    </div>
                    <div>
                      <label className="text-sm text-slate-400 mb-1 block">Price (💎)</label>
                      <Input
                        type="number"
                        value={tierForm.price_diamonds || 0}
                        onChange={(e) => setTierForm(prev => ({ ...prev, price_diamonds: parseInt(e.target.value) || 0 }))}
                        className="bg-slate-800 border-slate-600 text-white"
                      />
                    </div>
                    <div>
                      <label className="text-sm text-slate-400 mb-1 block">Duration (Days)</label>
                      <Input
                        type="number"
                        value={tierForm.duration_days || 30}
                        onChange={(e) => setTierForm(prev => ({ ...prev, duration_days: parseInt(e.target.value) || 30 }))}
                        className="bg-slate-800 border-slate-600 text-white"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="text-sm text-slate-400 mb-1 block">Description</label>
                    <Textarea
                      value={tierForm.description || ''}
                      onChange={(e) => setTierForm(prev => ({ ...prev, description: e.target.value }))}
                      placeholder="VIP membership with exclusive privileges..."
                      className="bg-slate-800 border-slate-600 text-white"
                    />
                  </div>

                  <div className="flex items-center justify-between bg-slate-800 p-3 rounded-lg">
                    <span className="text-white">Active</span>
                    <Switch
                      checked={tierForm.is_active !== false}
                      onCheckedChange={(checked) => setTierForm(prev => ({ ...prev, is_active: checked }))}
                    />
                  </div>
                </TabsContent>

                {/* Privileges Tab */}
                <TabsContent value="privileges" className="space-y-3 mt-4">
                  {[
                    { key: 'exclusive_frames', label: 'Exclusive Frames', icon: Crown, color: 'text-purple-400' },
                    { key: 'exclusive_entry_bars', label: 'Entry Effects', icon: Sparkles, color: 'text-cyan-400' },
                    { key: 'exclusive_gifts', label: 'VIP Gifts', icon: Gift, color: 'text-pink-400' },
                    { key: 'exclusive_bubbles', label: 'Chat Bubbles', icon: MessageCircle, color: 'text-amber-400' },
                    { key: 'exclusive_stickers', label: 'Stickers', icon: Star, color: 'text-yellow-400' },
                    { key: 'priority_matching', label: 'Priority Matching', icon: Play, color: 'text-green-400' },
                    { key: 'ad_free', label: 'Ad-Free Experience', icon: X, color: 'text-red-400' },
                    { key: 'faster_support', label: 'Fast Support', icon: Sparkles, color: 'text-blue-400' },
                    { key: 'vip_only_rooms', label: 'VIP Rooms Access', icon: Crown, color: 'text-indigo-400' },
                    { key: 'profile_highlight', label: 'Profile Glow', icon: Gem, color: 'text-rose-400' },
                  ].map(({ key, label, icon: Icon, color }) => (
                    <div key={key} className="flex items-center justify-between bg-slate-800 p-3 rounded-lg">
                      <div className="flex items-center gap-3">
                        <Icon className={`w-5 h-5 ${color}`} />
                        <span className="text-white">{label}</span>
                      </div>
                      <Switch
                        checked={(tierForm as any)[key] || false}
                        onCheckedChange={(checked) => setTierForm(prev => ({ ...prev, [key]: checked }))}
                      />
                    </div>
                  ))}
                </TabsContent>

                {/* Power Perks Tab (Phase 1 fields) */}
                <TabsContent value="power" className="space-y-3 mt-4">
                  <p className="text-slate-400 text-sm mb-2">
                    High-tier power privileges enforced server-side and in live rooms.
                  </p>
                  {[
                    { key: 'anti_kick_protection', label: 'Anti-Kick Protection', icon: Shield, color: 'text-emerald-400', desc: 'Cannot be kicked by lower-rank moderators' },
                    { key: 'stealth_mode', label: 'Stealth Mode', icon: Ghost, color: 'text-violet-400', desc: 'Browse profiles & rooms invisibly' },
                    { key: 'hide_real_level', label: 'Hide Real Level', icon: EyeOff, color: 'text-slate-300', desc: 'Hide actual user level from other users' },
                    { key: 'forbidden_words_bypass', label: 'Forbidden Words Bypass', icon: Lock, color: 'text-orange-400', desc: 'Bypass chat profanity filter' },
                    { key: 'top_position_in_lists', label: 'Top Position in Lists', icon: TrendingUp, color: 'text-yellow-400', desc: 'Pinned to top in viewer/host lists' },
                    { key: 'vip_only_lounge_access', label: 'VIP Lounge Access', icon: Crown, color: 'text-amber-400', desc: 'Access VIP-exclusive lounges' },
                    { key: 'priority_random_match', label: 'Priority Random Match', icon: Zap, color: 'text-cyan-400', desc: 'Get matched faster in random calls' },
                  ].map(({ key, label, icon: Icon, color, desc }) => (
                    <div key={key} className="flex items-center justify-between bg-slate-800 p-3 rounded-lg">
                      <div className="flex items-center gap-3">
                        <Icon className={`w-5 h-5 ${color}`} />
                        <div>
                          <div className="text-white">{label}</div>
                          <div className="text-xs text-slate-500">{desc}</div>
                        </div>
                      </div>
                      <Switch
                        checked={(tierForm as any)[key] || false}
                        onCheckedChange={(checked) => setTierForm(prev => ({ ...prev, [key]: checked }))}
                      />
                    </div>
                  ))}

                  <div className="bg-slate-800 p-3 rounded-lg">
                    <label className="text-sm text-white block mb-2">Max Kick Tier Level (Anti-Kick threshold)</label>
                    <p className="text-xs text-slate-500 mb-2">Moderators with tier_level ≤ this value cannot kick this VIP. Set 0 to disable.</p>
                    <Input
                      type="number"
                      min={0}
                      value={tierForm.max_kick_tier_level ?? 0}
                      onChange={(e) => setTierForm(prev => ({ ...prev, max_kick_tier_level: parseInt(e.target.value) || 0 }))}
                      className="bg-slate-900 border-slate-600 text-white"
                    />
                  </div>
                </TabsContent>

                {/* Economy Tab (Phase 1 fields) */}
                <TabsContent value="economy" className="space-y-3 mt-4">
                  <p className="text-slate-400 text-sm mb-2">
                    Daily rewards, recharge bonuses, and personalization perks.
                  </p>

                  <div className="grid grid-cols-2 gap-3">
                    <div className="bg-slate-800 p-3 rounded-lg">
                      <label className="text-sm text-white flex items-center gap-2 mb-2">
                        <Coins className="w-4 h-4 text-amber-400" />
                        Recharge Bonus %
                      </label>
                      <p className="text-xs text-slate-500 mb-2">Extra diamonds on every recharge (e.g. 5 = +5%)</p>
                      <Input
                        type="number"
                        min={0}
                        max={100}
                        value={tierForm.recharge_bonus_percent ?? 0}
                        onChange={(e) => setTierForm(prev => ({ ...prev, recharge_bonus_percent: parseInt(e.target.value) || 0 }))}
                        className="bg-slate-900 border-slate-600 text-white"
                      />
                    </div>

                    <div className="bg-slate-800 p-3 rounded-lg">
                      <label className="text-sm text-white flex items-center gap-2 mb-2">
                        <Gem className="w-4 h-4 text-cyan-400" />
                        Daily Free Diamonds
                      </label>
                      <p className="text-xs text-slate-500 mb-2">Claimable once every 24 hours</p>
                      <Input
                        type="number"
                        min={0}
                        value={tierForm.daily_free_diamonds ?? 0}
                        onChange={(e) => setTierForm(prev => ({ ...prev, daily_free_diamonds: parseInt(e.target.value) || 0 }))}
                        className="bg-slate-900 border-slate-600 text-white"
                      />
                    </div>

                    <div className="bg-slate-800 p-3 rounded-lg">
                      <label className="text-sm text-white flex items-center gap-2 mb-2">
                        <Calendar className="w-4 h-4 text-emerald-400" />
                        Free Name Changes / Month
                      </label>
                      <Input
                        type="number"
                        min={0}
                        value={tierForm.free_name_changes_per_month ?? 0}
                        onChange={(e) => setTierForm(prev => ({ ...prev, free_name_changes_per_month: parseInt(e.target.value) || 0 }))}
                        className="bg-slate-900 border-slate-600 text-white"
                      />
                    </div>

                    <div className="bg-slate-800 p-3 rounded-lg">
                      <label className="text-sm text-white flex items-center gap-2 mb-2">
                        <Sparkles className="w-4 h-4 text-pink-400" />
                        Entry Effect Duration (sec)
                      </label>
                      <Input
                        type="number"
                        min={1}
                        max={60}
                        value={tierForm.entry_effect_duration_seconds ?? 5}
                        onChange={(e) => setTierForm(prev => ({ ...prev, entry_effect_duration_seconds: parseInt(e.target.value) || 5 }))}
                        className="bg-slate-900 border-slate-600 text-white"
                      />
                    </div>
                  </div>

                  <div className="bg-slate-800 p-3 rounded-lg">
                    <label className="text-sm text-white block mb-2">Username Color (hex)</label>
                    <div className="flex gap-2 items-center">
                      <Input
                        type="color"
                        value={tierForm.username_color || '#FFD700'}
                        onChange={(e) => setTierForm(prev => ({ ...prev, username_color: e.target.value }))}
                        className="w-16 h-10 bg-slate-900 border-slate-600 p-1"
                      />
                      <Input
                        value={tierForm.username_color || ''}
                        onChange={(e) => setTierForm(prev => ({ ...prev, username_color: e.target.value }))}
                        placeholder="#FFD700"
                        className="bg-slate-900 border-slate-600 text-white flex-1"
                      />
                    </div>
                  </div>

                  <div className="bg-slate-800 p-3 rounded-lg">
                    <label className="text-sm text-white block mb-2">Profile Background URL</label>
                    <Input
                      value={tierForm.profile_background_url || ''}
                      onChange={(e) => setTierForm(prev => ({ ...prev, profile_background_url: e.target.value }))}
                      placeholder="https://..."
                      className="bg-slate-900 border-slate-600 text-white"
                    />
                  </div>
                </TabsContent>

                {/* Animations Tab */}
                <TabsContent value="animations" className="space-y-4 mt-4">
                  <p className="text-slate-400 text-sm">
                    Upload SVGA, Lottie, GIF, or MP4 animations for each privilege type (max 100MB)
                  </p>

                  {/* Frame Animation */}
                  <div className="bg-slate-800 rounded-lg p-4">
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-2">
                        <Crown className="w-5 h-5 text-purple-400" />
                        <span className="text-white font-medium">Avatar Frame</span>
                      </div>
                      <label className="cursor-pointer">
                        <div className={`px-3 py-1.5 rounded-lg flex items-center gap-2 ${
                          uploading === 'frame_animation_url' 
                            ? 'bg-slate-600 text-slate-400' 
                            : 'bg-purple-600 hover:bg-purple-700 text-white'
                        }`}>
                          {uploading === 'frame_animation_url' ? (
                            <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                          ) : (
                            <Upload className="w-4 h-4" />
                          )}
                          <span className="text-sm">Upload</span>
                        </div>
                        <input
                          type="file"
                          accept=".svga,.json,.gif,.webp,.png,.mp4"
                          onChange={(e) => handleFileUpload(e, 'frame_animation_url')}
                          className="hidden"
                          disabled={!!uploading}
                        />
                      </label>
                    </div>
                    {tierForm.frame_animation_url ? (
                      <div className="flex items-center gap-4">
                        <div className="w-20 h-20 bg-slate-900 rounded-lg overflow-hidden">
                          <UniversalAnimationPlayer
                            src={tierForm.frame_animation_url}
                            className="w-full h-full"
                            loop
                            autoPlay
                          />
                        </div>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setTierForm(prev => ({ ...prev, frame_animation_url: null }))}
                          className="text-red-400"
                        >
                          <Trash2 className="w-4 h-4 mr-1" />
                          Remove
                        </Button>
                      </div>
                    ) : (
                      <p className="text-slate-500 text-sm">No frame animation uploaded</p>
                    )}
                  </div>

                  {/* Entry Animation */}
                  <div className="bg-slate-800 rounded-lg p-4">
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-2">
                        <Sparkles className="w-5 h-5 text-cyan-400" />
                        <span className="text-white font-medium">Entry Effect</span>
                      </div>
                      <label className="cursor-pointer">
                        <div className={`px-3 py-1.5 rounded-lg flex items-center gap-2 ${
                          uploading === 'entry_animation_url' 
                            ? 'bg-slate-600 text-slate-400' 
                            : 'bg-cyan-600 hover:bg-cyan-700 text-white'
                        }`}>
                          {uploading === 'entry_animation_url' ? (
                            <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                          ) : (
                            <Upload className="w-4 h-4" />
                          )}
                          <span className="text-sm">Upload</span>
                        </div>
                        <input
                          type="file"
                          accept=".svga,.json,.gif,.webp,.png,.mp4"
                          onChange={(e) => handleFileUpload(e, 'entry_animation_url')}
                          className="hidden"
                          disabled={!!uploading}
                        />
                      </label>
                    </div>
                    {tierForm.entry_animation_url ? (
                      <div className="flex items-center gap-4">
                        <div className="w-20 h-20 bg-slate-900 rounded-lg overflow-hidden">
                          <UniversalAnimationPlayer
                            src={tierForm.entry_animation_url}
                            className="w-full h-full"
                            loop
                            autoPlay
                          />
                        </div>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setTierForm(prev => ({ ...prev, entry_animation_url: null }))}
                          className="text-red-400"
                        >
                          <Trash2 className="w-4 h-4 mr-1" />
                          Remove
                        </Button>
                      </div>
                    ) : (
                      <p className="text-slate-500 text-sm">No entry animation uploaded</p>
                    )}
                  </div>

                  {/* Bubble Animation */}
                  <div className="bg-slate-800 rounded-lg p-4">
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-2">
                        <MessageCircle className="w-5 h-5 text-amber-400" />
                        <span className="text-white font-medium">Chat Bubble</span>
                      </div>
                      <label className="cursor-pointer">
                        <div className={`px-3 py-1.5 rounded-lg flex items-center gap-2 ${
                          uploading === 'bubble_animation_url' 
                            ? 'bg-slate-600 text-slate-400' 
                            : 'bg-amber-600 hover:bg-amber-700 text-white'
                        }`}>
                          {uploading === 'bubble_animation_url' ? (
                            <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                          ) : (
                            <Upload className="w-4 h-4" />
                          )}
                          <span className="text-sm">Upload</span>
                        </div>
                        <input
                          type="file"
                          accept=".svga,.json,.gif,.webp,.png,.mp4"
                          onChange={(e) => handleFileUpload(e, 'bubble_animation_url')}
                          className="hidden"
                          disabled={!!uploading}
                        />
                      </label>
                    </div>
                    {tierForm.bubble_animation_url ? (
                      <div className="flex items-center gap-4">
                        <div className="w-20 h-20 bg-slate-900 rounded-lg overflow-hidden">
                          <UniversalAnimationPlayer
                            src={tierForm.bubble_animation_url}
                            className="w-full h-full"
                            loop
                            autoPlay
                          />
                        </div>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setTierForm(prev => ({ ...prev, bubble_animation_url: null }))}
                          className="text-red-400"
                        >
                          <Trash2 className="w-4 h-4 mr-1" />
                          Remove
                        </Button>
                      </div>
                    ) : (
                      <p className="text-slate-500 text-sm">No bubble animation uploaded</p>
                    )}
                  </div>

                  {/* Badge Animation */}
                  <div className="bg-slate-800 rounded-lg p-4">
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-2">
                        <Gem className="w-5 h-5 text-rose-400" />
                        <span className="text-white font-medium">VIP Badge</span>
                      </div>
                      <label className="cursor-pointer">
                        <div className={`px-3 py-1.5 rounded-lg flex items-center gap-2 ${
                          uploading === 'badge_animation_url' 
                            ? 'bg-slate-600 text-slate-400' 
                            : 'bg-rose-600 hover:bg-rose-700 text-white'
                        }`}>
                          {uploading === 'badge_animation_url' ? (
                            <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                          ) : (
                            <Upload className="w-4 h-4" />
                          )}
                          <span className="text-sm">Upload</span>
                        </div>
                        <input
                          type="file"
                          accept=".svga,.json,.gif,.webp,.png,.mp4"
                          onChange={(e) => handleFileUpload(e, 'badge_animation_url')}
                          className="hidden"
                          disabled={!!uploading}
                        />
                      </label>
                    </div>
                    {tierForm.badge_animation_url ? (
                      <div className="flex items-center gap-4">
                        <div className="w-20 h-20 bg-slate-900 rounded-lg overflow-hidden">
                          <UniversalAnimationPlayer
                            src={tierForm.badge_animation_url}
                            className="w-full h-full"
                            loop
                            autoPlay
                          />
                        </div>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setTierForm(prev => ({ ...prev, badge_animation_url: null }))}
                          className="text-red-400"
                        >
                          <Trash2 className="w-4 h-4 mr-1" />
                          Remove
                        </Button>
                      </div>
                    ) : (
                      <p className="text-slate-500 text-sm">No badge animation uploaded</p>
                    )}
                  </div>
                </TabsContent>
              </Tabs>
            </div>
          </ScrollArea>

          {/* Footer */}
          <div className="p-4 border-t border-slate-700 flex gap-3">
            <Button
              variant="outline"
              onClick={() => {
                setDialogOpen(false);
                setSaving(false);
                setUploading(null);
              }}
              className="flex-1"
            >
              Cancel
            </Button>
            <Button
              onClick={handleSave}
              disabled={saving || !!uploading}
              className="flex-1 bg-gradient-to-r from-purple-600 to-pink-600"
            >
              {saving ? (
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
              ) : (
                <>
                  <Save className="w-4 h-4 mr-2" />
                  Save
                </>
              )}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default AdminVIPPrivileges;
