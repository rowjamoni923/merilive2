import { useState, useEffect } from "react";
import useAdminRealtime from "@/hooks/useAdminRealtime";
import { Plus, Edit2, Trash2, Save, X, Crown, Image, Upload, Link2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { adminSupabase as supabase } from "@/integrations/supabase/adminClient";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { parseSettingValue, saveAppSetting } from "@/utils/adminSettingsStorage";

interface InvitationTier {
  id: string;
  tier_name: string;
  min_invites: number;
  max_invites: number | null;
  reward_beans: number;
  reward_coins: number;
  bonus_percentage: number;
  badge_color: string;
  display_order: number;
  is_active: boolean;
}

const AdminInvitationSettings = () => {
  const [tiers, setTiers] = useState<InvitationTier[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editingTier, setEditingTier] = useState<InvitationTier | null>(null);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [bannerUrl, setBannerUrl] = useState("");
  const [bannerInput, setBannerInput] = useState("");
  const [savingBanner, setSavingBanner] = useState(false);
  const [uploadingBanner, setUploadingBanner] = useState(false);
  const [formData, setFormData] = useState<Partial<InvitationTier>>({
    tier_name: '',
    min_invites: 1,
    max_invites: null,
    reward_beans: 100,
    reward_coins: 20,
    bonus_percentage: 0,
    badge_color: '#FFD700',
    display_order: 0,
    is_active: true
  });

  useEffect(() => {
    fetchTiers();
    fetchBannerUrl();
  }, []);

  useAdminRealtime(['invitation_reward_tiers', 'app_settings'], () => { fetchTiers(); fetchBannerUrl(); });

  const fetchBannerUrl = async () => {
    try {
      const { data } = await supabase
        .from('app_settings')
        .select('setting_value')
        .eq('setting_key', 'invitation_banner_url')
        .maybeSingle();
      if (data?.setting_value) {
        const parsed = parseSettingValue<any>(data.setting_value);
        const url = typeof parsed === 'string' ? parsed : parsed?.url || '';
        setBannerUrl(url);
        setBannerInput(url);
      }
    } catch (error) {
      console.error('Error fetching banner:', error);
    }
  };

  const handleSaveBanner = async () => {
    setSavingBanner(true);
    try {
      await saveAppSetting('invitation_banner_url', { url: bannerInput }, 'Invitation page banner image URL');
      setBannerUrl(bannerInput);
      toast.success('Banner updated');
    } catch (error) {
      console.error('Error saving banner:', error);
      toast.error('Failed to save banner');
    } finally {
      setSavingBanner(false);
    }
  };

  const handleBannerUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingBanner(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('Not authenticated');

      const ext = file.name.split('.').pop();
      const fileName = `invitation-banner-${Date.now()}.${ext}`;
      
      const { error } = await supabase.storage
        .from('banners')
        .upload(fileName, file, { upsert: true });
      
      if (error) throw error;
      
      const { data: urlData } = supabase.storage
        .from('banners')
        .getPublicUrl(fileName);
      
      setBannerInput(urlData.publicUrl);
      toast.success('Banner uploaded, save now');
    } catch (error: any) {
      console.error('Upload error:', error);
      toast.error('Upload failed: ' + (error.message || 'Unknown error'));
    } finally {
      setUploadingBanner(false);
    }
  };

  const fetchTiers = async () => {
    try {
      const { data, error } = await supabase
        .from('invitation_reward_tiers')
        .select('*')
        .order('display_order');

      if (error) throw error;
      setTiers(data || []);
    } catch (error) {
      console.error('Error fetching tiers:', error);
      toast.error('Failed to load tiers');
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      if (editingTier) {
        const { error } = await supabase
          .from('invitation_reward_tiers')
          .update(formData)
          .eq('id', editingTier.id);
        if (error) throw error;
        toast.success('Tier updated');
      } else {
        const insertData = {
          tier_name: formData.tier_name || '',
          min_invites: formData.min_invites || 1,
          max_invites: formData.max_invites || null,
          reward_beans: formData.reward_beans || 0,
          reward_coins: formData.reward_coins || 0,
          bonus_percentage: formData.bonus_percentage || 0,
          badge_color: formData.badge_color || '#FFD700',
          display_order: formData.display_order || 0,
          is_active: formData.is_active ?? true
        };
        const { error } = await supabase
          .from('invitation_reward_tiers')
          .insert([insertData]);
        if (error) throw error;
        toast.success('New tier created');
      }
      setIsDialogOpen(false);
      setEditingTier(null);
      resetForm();
      fetchTiers();
    } catch (error) {
      console.error('Error saving tier:', error);
      toast.error('Failed to save');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this tier?')) return;
    try {
      const { error } = await supabase
        .from('invitation_reward_tiers')
        .delete()
        .eq('id', id);
      if (error) throw error;
      toast.success('Tier deleted');
      fetchTiers();
    } catch (error) {
      console.error('Error deleting tier:', error);
      toast.error('Failed to delete');
    }
  };

  const handleEdit = (tier: InvitationTier) => {
    setEditingTier(tier);
    setFormData(tier);
    setIsDialogOpen(true);
  };

  const resetForm = () => {
    setFormData({
      tier_name: '',
      min_invites: 1,
      max_invites: null,
      reward_beans: 100,
      reward_coins: 20,
      bonus_percentage: 0,
      badge_color: '#FFD700',
      display_order: tiers.length,
      is_active: true
    });
  };

  const toggleActive = async (tier: InvitationTier) => {
    try {
      const { error } = await supabase
        .from('invitation_settings')
        .update({ is_active: !tier.is_active })
        .eq('id', tier.id);
      if (error) throw error;
      fetchTiers();
    } catch (error) {
      console.error('Error toggling tier:', error);
    }
  };

  if (loading) {
    return <div className="p-6">Loading...</div>;
  }

  return (
    <div className="p-4 md:p-6 space-y-4 md:space-y-6">
      {/* Header with gradient */}
      <div className="bg-gradient-to-r from-pink-500 via-rose-500 to-orange-500 rounded-xl md:rounded-2xl p-4 md:p-6 shadow-xl">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
          <div>
            <h1 className="text-xl md:text-2xl font-bold text-white flex items-center gap-2">
              <Crown className="w-5 h-5 md:w-6 md:h-6" />
              Invitation Settings
            </h1>
            <p className="text-white/90 text-sm mt-1">Manage invitation reward tiers & banner</p>
          </div>
        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogTrigger asChild>
            <Button onClick={() => { setEditingTier(null); resetForm(); }} className="bg-white/20 hover:bg-white/30 text-white border border-white/30">
              <Plus className="w-4 h-4 mr-2" />
              New Tier
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-md bg-slate-900 border-slate-700">
            <DialogHeader>
              <DialogTitle className="text-white">
                {editingTier ? 'Edit Tier' : 'Create New Tier'}
              </DialogTitle>
            </DialogHeader>
            
            <div className="space-y-4">
              <div>
                <Label className="text-slate-300 font-medium">Tier Name</Label>
                <Input
                  value={formData.tier_name || ''}
                  onChange={(e) => setFormData({ ...formData, tier_name: e.target.value })}
                  placeholder="e.g., Bronze, Silver, Gold"
                  className="mt-1 bg-slate-800 border-slate-600 text-white placeholder:text-slate-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Min Invites</Label>
                  <Input type="number" value={formData.min_invites || 1} onChange={(e) => setFormData({ ...formData, min_invites: parseInt(e.target.value) })} />
                </div>
                <div>
                  <Label>Max Invites</Label>
                  <Input type="number" value={formData.max_invites || ''} onChange={(e) => setFormData({ ...formData, max_invites: e.target.value ? parseInt(e.target.value) : null })} placeholder="Leave empty for last tier" />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Beans Reward</Label>
                  <Input type="number" value={formData.reward_beans || 0} onChange={(e) => setFormData({ ...formData, reward_beans: parseInt(e.target.value) })} />
                </div>
                <div>
                  <Label>Coins Reward</Label>
                  <Input type="number" value={formData.reward_coins || 0} onChange={(e) => setFormData({ ...formData, reward_coins: parseInt(e.target.value) })} />
                </div>
              </div>

              <div>
                <Label>Bonus Percentage (%)</Label>
                <Input type="number" value={formData.bonus_percentage || 0} onChange={(e) => setFormData({ ...formData, bonus_percentage: parseInt(e.target.value) })} />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Badge Color</Label>
                  <Input type="color" value={formData.badge_color || '#FFD700'} onChange={(e) => setFormData({ ...formData, badge_color: e.target.value })} />
                </div>
                <div>
                  <Label>Display Order</Label>
                  <Input type="number" value={formData.display_order || 0} onChange={(e) => setFormData({ ...formData, display_order: parseInt(e.target.value) })} />
                </div>
              </div>

              <div className="flex items-center gap-2">
                <Switch checked={formData.is_active} onCheckedChange={(checked) => setFormData({ ...formData, is_active: checked })} />
                <Label className="text-slate-300">Active</Label>
              </div>

              <div className="flex gap-2 pt-4">
                <Button onClick={handleSave} className="flex-1 bg-gradient-to-r from-pink-500 to-rose-500 text-white">
                  <Save className="w-4 h-4 mr-2" />
                  Save
                </Button>
                <Button variant="outline" onClick={() => setIsDialogOpen(false)} className="border-slate-600 text-slate-300 hover:bg-slate-800">
                  <X className="w-4 h-4 mr-2" />
                  Cancel
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
        </div>
      </div>

      {/* Banner Management Section */}
      <Card className="bg-slate-900 border-slate-700/50 shadow-lg overflow-hidden">
        <div className="bg-gradient-to-r from-amber-600/20 to-orange-600/20 border-b border-amber-500/20 px-4 py-3">
          <h2 className="text-white font-bold flex items-center gap-2">
            <Image className="w-5 h-5 text-amber-400" />
            Invitation Banner
          </h2>
          <p className="text-white/50 text-xs mt-0.5">Set up the banner image for the invitation page</p>
        </div>
        <CardContent className="p-4 space-y-4">
          {/* Current Banner Preview */}
          {(bannerUrl || bannerInput) && (
            <div className="rounded-xl overflow-hidden border border-white/10 shadow-lg">
              <img 
                src={bannerInput || bannerUrl} 
                alt="Invitation Banner Preview" 
                className="w-full h-auto max-h-40 object-cover"
                onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
              />
            </div>
          )}

          {/* URL Input */}
          <div>
            <Label className="text-slate-300 text-sm">Banner URL</Label>
            <div className="flex gap-2 mt-1">
              <div className="relative flex-1">
                <Link2 className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                <Input
                  value={bannerInput}
                  onChange={(e) => setBannerInput(e.target.value)}
                  placeholder="https://example.com/banner.jpg"
                  className="pl-9 bg-slate-800 border-slate-600 text-white placeholder:text-slate-500"
                />
              </div>
              <Button 
                onClick={handleSaveBanner} 
                disabled={savingBanner || !bannerInput}
                className="bg-gradient-to-r from-amber-500 to-orange-500 text-white shrink-0"
              >
                <Save className="w-4 h-4 mr-1" />
                {savingBanner ? 'Saving...' : 'Save'}
              </Button>
            </div>
          </div>

          {/* File Upload */}
          <div>
            <Label className="text-slate-300 text-sm">Or upload file</Label>
            <label className="mt-1 flex items-center gap-2 cursor-pointer bg-slate-800 border border-slate-600 border-dashed rounded-lg px-4 py-3 hover:bg-slate-700/50 transition-colors">
              <Upload className="w-5 h-5 text-amber-400" />
              <span className="text-slate-400 text-sm">{uploadingBanner ? 'Uploading...' : 'Select banner image'}</span>
              <input 
                type="file" 
                accept="image/*" 
                className="hidden" 
                onChange={handleBannerUpload}
                disabled={uploadingBanner}
              />
            </label>
          </div>
        </CardContent>
      </Card>

      {/* Tiers List */}
      <div className="grid gap-3 md:gap-4">
        {tiers.map((tier) => (
          <Card key={tier.id} className={cn("bg-slate-900 border-slate-700/50 shadow-lg", !tier.is_active && 'opacity-50')}>
            <CardContent className="p-3 md:p-4">
              <div className="flex items-center gap-3 md:gap-4">
                <div 
                  className="w-10 h-10 md:w-12 md:h-12 rounded-full flex items-center justify-center shrink-0"
                  style={{ backgroundColor: tier.badge_color }}
                >
                  <Crown className="w-5 h-5 md:w-6 md:h-6 text-white" />
                </div>
                
                <div className="flex-1 min-w-0">
                  <h3 className="font-semibold text-white">{tier.tier_name}</h3>
                  <p className="text-sm text-slate-400">
                    {tier.min_invites}{tier.max_invites ? `-${tier.max_invites}` : '+'} Invites
                  </p>
                  <div className="flex gap-2 mt-1">
                    <span className="text-xs bg-amber-500/20 text-amber-300 border border-amber-500/30 px-2 py-0.5 rounded">
                      +{tier.reward_beans} Beans
                    </span>
                    <span className="text-xs bg-purple-500/20 text-purple-300 border border-purple-500/30 px-2 py-0.5 rounded">
                      +{tier.reward_coins} Coins
                    </span>
                    {tier.bonus_percentage > 0 && (
                      <span className="text-xs bg-green-500/20 text-green-300 border border-green-500/30 px-2 py-0.5 rounded">
                        +{tier.bonus_percentage}% Bonus
                      </span>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <Switch checked={tier.is_active} onCheckedChange={() => toggleActive(tier)} />
                  <Button variant="ghost" size="icon" onClick={() => handleEdit(tier)} className="text-slate-400 hover:text-white hover:bg-slate-800">
                    <Edit2 className="w-4 h-4" />
                  </Button>
                  <Button variant="ghost" size="icon" onClick={() => handleDelete(tier.id)} className="text-red-400 hover:text-red-300 hover:bg-slate-800">
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}

        {tiers.length === 0 && (
          <div className="text-center py-12 text-slate-400 bg-slate-900/50 rounded-xl border border-slate-700/50">
            No tiers found. Create a new tier.
          </div>
        )}
      </div>
    </div>
  );
};

export default AdminInvitationSettings;
