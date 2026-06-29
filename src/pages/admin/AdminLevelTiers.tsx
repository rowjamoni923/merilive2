import { useState, useEffect, useRef } from "react";
import useAdminRealtime from "@/hooks/useAdminRealtime";
import { useSearchParams } from "react-router-dom";
import { Plus, Save, Trash2, Edit2, Users, Crown, Upload, Image, Loader2, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { adminSupabase as supabase } from "@/integrations/supabase/adminClient";
import { toast } from "sonner";
import { adminStyles, gradients } from "@/styles/adminStyles";
import { levelBadgeAnimations, LevelBadgeAnimation } from "@/data/levelBadgeAnimations";
import { AnimationPickerModal, premiumLevelAnimations } from "@/components/admin/AnimationPickerModal";
import Lottie from "lottie-react";
import { LazyImage } from "@/components/LazyImage";
import { recordAdminError } from "@/utils/adminErrorLog";
import { SmartImage } from "@/components/ui/smart-image";
import AnimationUploader, { type AnimationFormat } from "@/components/admin/AnimationUploader";

interface LevelTier {
  id: string;
  level_number: number;
  level_name: string;
  min_topup_amount: number;
  min_earning_amount: number;
  level_icon: string;
  level_color: string;
  bg_gradient: string;
  tier_type: 'user' | 'host';
  is_active: boolean;
  display_order: number;
  animation_url?: string | null;
  icon_url?: string | null;
}

const AdminLevelTiers = () => {
  const [searchParams] = useSearchParams();
  const initialTab = (searchParams.get('type') as 'user' | 'host') || 'user';
  
  const [userTiers, setUserTiers] = useState<LevelTier[]>([]);
  const [hostTiers, setHostTiers] = useState<LevelTier[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editingTier, setEditingTier] = useState<LevelTier | null>(null);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<'user' | 'host'>(initialTab);
  const [uploading, setUploading] = useState(false);
  const [showAnimationPicker, setShowAnimationPicker] = useState(false);
  const [selectedAnimationData, setSelectedAnimationData] = useState<object | null>(null);
  const iconInputRef = useRef<HTMLInputElement>(null);
  const animationInputRef = useRef<HTMLInputElement>(null);

  useAdminRealtime(['user_level_tiers', 'level_privileges'], () => fetchTiers());

  const fetchTiers = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('user_level_tiers')
      .select('*')
      .order('level_number', { ascending: true });

    if (error) {
      toast.error("Failed to fetch level tiers");
      console.error(error);
      recordAdminError({ kind: "rpc", label: "AdminLevelTiers.fetchTiers", message: error?.message ?? String(error) });
    } else if (data) {
      setUserTiers(data.filter(t => t.tier_type === 'user') as LevelTier[]);
      setHostTiers(data.filter(t => t.tier_type === 'host') as LevelTier[]);
    }
    setLoading(false);
  };

  const uploadFile = async (file: File, type: 'icon' | 'animation') => {
    if (!file) return null;
    
    setUploading(true);
    try {
      const fileExt = file.name.split('.').pop();
      const fileName = `level-${type}-${Date.now()}.${fileExt}`;
      const filePath = `level-assets/${fileName}`;

      const { error: uploadError } = await supabase.storage
        .from('avatars')
        .upload(filePath, file, { upsert: true });

      if (uploadError) throw uploadError;

      const { data: { publicUrl } } = supabase.storage
        .from('avatars')
        .getPublicUrl(filePath);

      return publicUrl;
    } catch (error: any) {
      toast.error(`Failed to upload ${type}: ${error.message}`);
      return null;
    } finally {
      setUploading(false);
    }
  };

  const handleIconUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !editingTier) return;

    const url = await uploadFile(file, 'icon');
    if (url) {
      setEditingTier({ ...editingTier, icon_url: url });
      toast.success("Icon uploaded successfully");
    }
  };

  const handleAnimationUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !editingTier) return;

    // Check if it's a GIF or supported animation format
    if (!file.type.includes('gif') && !file.type.includes('webp') && !file.type.includes('image')) {
      toast.error("Please upload a GIF, WebP, or image file");
      return;
    }

    const url = await uploadFile(file, 'animation');
    if (url) {
      setEditingTier({ ...editingTier, animation_url: url });
      toast.success("Animation uploaded successfully");
    }
  };

  const handleSave = async () => {
    if (!editingTier) return;
    
    setSaving(true);
    try {
      const saveData = {
        level_name: editingTier.level_name,
        min_topup_amount: editingTier.min_topup_amount || 0,
        min_earning_amount: editingTier.min_earning_amount || 0,
        level_icon: editingTier.level_icon,
        level_color: editingTier.level_color,
        bg_gradient: editingTier.bg_gradient,
        is_active: editingTier.is_active,
        animation_url: editingTier.animation_url || null,
        icon_url: editingTier.icon_url || null,
        // Pkg424 — unified pro animation columns
        animation_format: (editingTier as any).animation_format || null,
        animation_config_url: (editingTier as any).animation_config_url || null,
      };

      let error;
      if (editingTier.id) {
        const result = await supabase
          .from('user_level_tiers')
          .update(saveData)
          .eq('id', editingTier.id);
        error = result.error;
      } else {
        const result = await supabase
          .from('user_level_tiers')
          .insert({
            ...saveData,
            level_number: editingTier.level_number,
            tier_type: editingTier.tier_type,
            display_order: editingTier.level_number,
          });
        error = result.error;
      }

      if (error) {
        toast.error("Failed to save tier: " + error.message);
        console.error(error);
        recordAdminError({ kind: "rpc", label: "AdminLevelTiers.result", message: error });
      } else {
        toast.success("Tier saved successfully! ✅");
        setIsDialogOpen(false);
        setEditingTier(null);
        fetchTiers();
      }
    } catch (error: any) {
      toast.error("Error: " + error.message);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Are you sure you want to delete this tier?")) return;

    const { error } = await supabase
      .from('user_level_tiers')
      .delete()
      .eq('id', id);

    if (error) {
      toast.error("Failed to delete tier");
      console.error(error);
      recordAdminError({ kind: "rpc", label: "AdminLevelTiers.handleDelete", message: error?.message ?? String(error) });
    } else {
      toast.success("Tier deleted successfully");
      fetchTiers();
    }
  };

  const openAddDialog = () => {
    const tiers = activeTab === 'user' ? userTiers : hostTiers;
    const maxLevel = tiers.length > 0 ? Math.max(...tiers.map(t => t.level_number)) + 1 : 0;
    
    setEditingTier({
      id: '',
      level_number: maxLevel,
      level_name: '',
      min_topup_amount: 0,
      min_earning_amount: 0,
      level_icon: '💎',
      level_color: '#3b82f6',
      bg_gradient: 'from-blue-400 to-blue-500',
      tier_type: activeTab,
      is_active: true,
      display_order: maxLevel,
      animation_url: null,
      icon_url: null,
    });
    setIsDialogOpen(true);
  };

  const openEditDialog = (tier: LevelTier) => {
    setEditingTier({ ...tier });
    setIsDialogOpen(true);
  };

  const formatNumber = (num: number) => {
    if (num >= 1000000) return `${(num / 1000000).toFixed(1)}M`;
    if (num >= 1000) return `${(num / 1000).toFixed(0)}K`;
    return num.toLocaleString();
  };

  const renderTierCard = (tier: LevelTier) => (
    <Card key={tier.id} className={`bg-card border-border ${!tier.is_active ? 'opacity-50' : ''}`}>
      <CardContent className="p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            {tier.icon_url || tier.animation_url ? (
              <LazyImage 
                src={tier.animation_url || tier.icon_url || ''} 
                alt={tier.level_name}
                className="w-12 h-12 rounded-xl object-cover shadow-md"
              />
            ) : (
              <div 
                className="w-12 h-12 rounded-xl flex items-center justify-center text-2xl shadow-md"
                style={{ 
                  background: `linear-gradient(135deg, ${tier.level_color}80, ${tier.level_color})` 
                }}
              >
                {tier.level_icon}
              </div>
            )}
            <div>
              <h3 className="font-bold text-lg text-foreground">Level {tier.level_number}</h3>
              <p className="text-sm text-muted-foreground">{tier.level_name}</p>
            </div>
          </div>
          
          <div className="flex items-center gap-4">
            <div className="text-right">
              <p className="text-xs text-muted-foreground">
                {tier.tier_type === 'user' ? 'Min Top-up' : 'Min Earnings'}
              </p>
              <p className="font-bold text-lg text-foreground">
                {formatNumber(tier.tier_type === 'user' ? tier.min_topup_amount : tier.min_earning_amount)}
              </p>
            </div>
            
            <div className="flex gap-2">
              <Button
                size="icon"
                variant="outline"
                onClick={() => openEditDialog(tier)}
              >
                <Edit2 className="w-4 h-4" />
              </Button>
              <Button
                size="icon"
                variant="destructive"
                onClick={() => handleDelete(tier.id)}
              >
                <Trash2 className="w-4 h-4" />
              </Button>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );

  if (loading) {
    return (
      <div className={adminStyles.loadingContainer}>
        <div className={adminStyles.loadingSpinner} />
      </div>
    );
  }

  return (
    <div className={`admin-pro-shell ${adminStyles.pageContainer}`}>
      {/* Header */}
      <div className={adminStyles.headerGradient(`${gradients.purple} text-slate-900`)}>
        <div className="flex items-center gap-3">
          <div className={adminStyles.iconContainerLg('bg-white/20')}>
            <Crown className="w-8 h-8 text-slate-900" />
          </div>
          <div>
            <h1 className={adminStyles.headerTitleWhite}>Level Tier Management</h1>
            <p className={adminStyles.headerSubtitleWhite}>
              Configure user and host level requirements
            </p>
          </div>
        </div>
      </div>

      {/* Info Card */}
      <Card className={adminStyles.statsCardPurple}>
        <CardContent className="p-4">
          <p className="text-sm text-purple-800">
            <strong>User Levels:</strong> Based on top-up amount (coins purchased)<br />
            <strong>Host Levels:</strong> Based on earnings (gifts received)
          </p>
        </CardContent>
      </Card>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as 'user' | 'host')}>
        <TabsList className={`grid w-full grid-cols-2 mb-4 ${adminStyles.tabsList}`}>
          <TabsTrigger value="user" className={adminStyles.tabsTrigger}>
            <Users className="w-4 h-4 mr-2" />
            User Levels ({userTiers.length})
          </TabsTrigger>
          <TabsTrigger value="host" className={adminStyles.tabsTrigger}>
            <Crown className="w-4 h-4 mr-2" />
            Host Levels ({hostTiers.length})
          </TabsTrigger>
        </TabsList>

        <TabsContent value="user">
          <div className="space-y-3">
            {userTiers.map(renderTierCard)}
          </div>
        </TabsContent>

        <TabsContent value="host">
          <div className="space-y-3">
            {hostTiers.map(renderTierCard)}
          </div>
        </TabsContent>
      </Tabs>

      {/* Add Button */}
      <Button
        onClick={openAddDialog}
        className={`mt-4 w-full ${adminStyles.buttonPrimary}`}
      >
        <Plus className="w-4 h-4 mr-2" />
        Add New Level Tier
      </Button>

      {/* Edit/Add Dialog */}
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="max-w-md w-screen sm:w-auto h-[100dvh] sm:h-auto rounded-none sm:rounded-lg max-h-[100dvh] sm:max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {editingTier?.id ? 'Edit Level Tier' : 'Add New Level Tier'}
            </DialogTitle>
          </DialogHeader>

          {editingTier && (
            <div className="space-y-4">
              {/* Level Number & Name */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Level Number</Label>
                  <Input
                    type="number"
                    value={editingTier.level_number}
                    onChange={(e) => setEditingTier({ 
                      ...editingTier, 
                      level_number: parseInt(e.target.value) || 0 
                    })}
                    className={adminStyles.input}
                    disabled={!!editingTier.id}
                  />
                </div>
                <div>
                  <Label>Level Name</Label>
                  <Input
                    value={editingTier.level_name}
                    onChange={(e) => setEditingTier({ 
                      ...editingTier, 
                      level_name: e.target.value 
                    })}
                    placeholder="e.g., Bronze, Silver, Gold"
                    className={adminStyles.input}
                  />
                </div>
              </div>

              {/* Min Amount */}
              <div>
                <Label>
                  {activeTab === 'user' ? 'Min Top-up Amount (Diamonds)' : 'Min Earnings Amount (Beans)'}
                </Label>
                <Input
                  type="number"
                  value={activeTab === 'user' ? editingTier.min_topup_amount : editingTier.min_earning_amount}
                  onChange={(e) => setEditingTier({ 
                    ...editingTier, 
                    ...(activeTab === 'user' 
                      ? { min_topup_amount: parseInt(e.target.value) || 0 }
                      : { min_earning_amount: parseInt(e.target.value) || 0 }
                    )
                  })}
                  className={adminStyles.input}
                />
                <p className="text-xs text-muted-foreground mt-1">
                  {activeTab === 'user' 
                    ? 'Total diamonds user must purchase to reach this level'
                    : 'Total beans host must earn to reach this level'
                  }
                </p>
              </div>

              {/* Icon Upload */}
              <div className="space-y-2">
                <Label>Level Icon/Badge Image</Label>
                <div className="flex gap-3">
                  {editingTier.icon_url ? (
                    <SmartImage 
                      src={editingTier.icon_url} 
                      alt="Icon" 
                      className="w-16 h-16 rounded-xl object-cover border-2 border-purple-200" fallbackSrc="/placeholder.svg" />
                  ) : (
                    <div 
                      className="w-16 h-16 rounded-xl flex items-center justify-center text-3xl border-2 border-dashed border-slate-300"
                      style={{ backgroundColor: editingTier.level_color + '30' }}
                    >
                      {editingTier.level_icon}
                    </div>
                  )}
                  <div className="flex-1 space-y-2">
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => iconInputRef.current?.click()}
                      disabled={uploading}
                      className="w-full"
                    >
                      {uploading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Upload className="w-4 h-4 mr-2" />}
                      Upload Icon
                    </Button>
                    <Input
                      ref={iconInputRef}
                      type="file"
                      accept="image/*"
                      onChange={handleIconUpload}
                      className="hidden"
                    />
                    <Input
                      value={editingTier.level_icon}
                      onChange={(e) => setEditingTier({ ...editingTier, level_icon: e.target.value })}
                      placeholder="Or use emoji: 💎"
                      className={`${adminStyles.input} text-center text-xl`}
                    />
                  </div>
                </div>
              </div>

              {/* Animation/GIF Upload */}
              <div className="space-y-2">
                <Label>Animation/GIF (Optional)</Label>
                <div className="flex gap-3">
                  {selectedAnimationData ? (
                    <div className="w-16 h-16 rounded-xl bg-gradient-to-br from-purple-100 to-pink-100 flex items-center justify-center border-2 border-purple-300">
                      <Lottie animationData={selectedAnimationData} loop autoplay style={{ width: 50, height: 50 }} />
                    </div>
                  ) : editingTier.animation_url ? (
                    <SmartImage 
                      src={editingTier.animation_url} 
                      alt="Animation" 
                      className="w-16 h-16 rounded-xl object-cover border-2 border-pink-200" fallbackSrc="/placeholder.svg" />
                  ) : (
                    <div className="w-16 h-16 rounded-xl flex items-center justify-center border-2 border-dashed border-slate-300 bg-slate-50">
                      <Image className="w-6 h-6 text-slate-400" />
                    </div>
                  )}
                  <div className="flex-1 space-y-2">
                    {/* Premium Animation Picker Button */}
                    <Button
                      type="button"
                      onClick={() => setShowAnimationPicker(true)}
                      className="w-full bg-gradient-to-r from-purple-500 to-pink-500 text-white hover:from-purple-600 hover:to-pink-600"
                    >
                      <Sparkles className="w-4 h-4 mr-2" />
                      Choose Premium Animation (50+)
                    </Button>
                    
                    <div className="flex gap-2">
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => animationInputRef.current?.click()}
                        disabled={uploading}
                        className="flex-1"
                        size="sm"
                      >
                        {uploading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Upload className="w-4 h-4 mr-2" />}
                        Upload GIF
                      </Button>
                      <Input
                        ref={animationInputRef}
                        type="file"
                        accept="image/gif,image/webp,image/*"
                        onChange={handleAnimationUpload}
                        className="hidden"
                      />
                    </div>
                    <Input
                      value={editingTier.animation_url || ''}
                      onChange={(e) => {
                        setEditingTier({ ...editingTier, animation_url: e.target.value });
                        setSelectedAnimationData(null);
                      }}
                      placeholder="Or paste URL..."
                      className={adminStyles.input}
                    />
                  </div>
                </div>
                <p className="text-xs text-muted-foreground">
                  Choose from 50+ premium animations or upload your own GIF/WebP
                </p>
              </div>

              {/* Animation Picker Modal */}
              <AnimationPickerModal
                isOpen={showAnimationPicker}
                onClose={() => setShowAnimationPicker(false)}
                onSelect={(animationId, animationData) => {
                  setSelectedAnimationData(animationData);
                  setEditingTier({ ...editingTier, animation_url: `lottie:${animationId}` });
                  setShowAnimationPicker(false);
                }}
                selectedId={editingTier.animation_url?.startsWith('lottie:') ? editingTier.animation_url.replace('lottie:', '') : null}
              />

              {/* Pkg424 — Pro Animation (VAP / SVGA / Lottie / WebP / MP4) */}
              <AnimationUploader
                label="Pro Animation (VAP / SVGA / Lottie / WebP / PNG / GIF / MP4)"
                bucket="level-tiers"
                folder="unified"
                value={{
                  animation_url: editingTier.animation_url || '',
                  animation_format: ((editingTier as any).animation_format ?? null) as AnimationFormat | null,
                  animation_config_url: (editingTier as any).animation_config_url || null,
                }}
                onChange={(v) => setEditingTier({
                  ...editingTier,
                  animation_url: v.animation_url || null,
                  animation_format: v.animation_format,
                  animation_config_url: v.animation_config_url || null,
                } as any)}
              />

              {/* Color & Status */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Level Color</Label>
                  <div className="flex gap-2">
                    <Input
                      type="color"
                      value={editingTier.level_color}
                      onChange={(e) => setEditingTier({ ...editingTier, level_color: e.target.value })}
                      className="w-12 h-10 p-1 cursor-pointer"
                    />
                    <Input
                      value={editingTier.level_color}
                      onChange={(e) => setEditingTier({ ...editingTier, level_color: e.target.value })}
                      placeholder="#3b82f6"
                      className={adminStyles.input}
                    />
                  </div>
                </div>
                <div>
                  <Label>Status</Label>
                  <div className="flex items-center gap-2 mt-2">
                    <Switch
                      checked={editingTier.is_active}
                      onCheckedChange={(checked) => setEditingTier({ ...editingTier, is_active: checked })}
                    />
                    <span className="text-sm text-muted-foreground">
                      {editingTier.is_active ? 'Active' : 'Inactive'}
                    </span>
                  </div>
                </div>
              </div>

              {/* Preview */}
              <div className="p-4 bg-muted rounded-xl">
                <Label className="mb-2 block">Preview</Label>
                <div className="flex items-center gap-3">
                  {editingTier.animation_url || editingTier.icon_url ? (
                    <SmartImage 
                      src={editingTier.animation_url || editingTier.icon_url || ''} 
                      alt="Preview"
                      className="w-14 h-14 rounded-xl object-cover shadow-lg" fallbackSrc="/placeholder.svg" />
                  ) : (
                    <div 
                      className="w-14 h-14 rounded-xl flex items-center justify-center text-3xl shadow-lg"
                      style={{ 
                        background: `linear-gradient(135deg, ${editingTier.level_color}80, ${editingTier.level_color})` 
                      }}
                    >
                      {editingTier.level_icon}
                    </div>
                  )}
                  <div>
                    <p className="font-bold text-lg">Level {editingTier.level_number}</p>
                    <p className="text-muted-foreground">{editingTier.level_name || 'Unnamed'}</p>
                  </div>
                </div>
              </div>

              <Button
                onClick={handleSave}
                disabled={saving}
                className={`w-full ${adminStyles.buttonPrimary}`}
              >
                {saving ? (
                  <Loader2 className="w-4 h-4 animate-spin mr-2" />
                ) : (
                  <Save className="w-4 h-4 mr-2" />
                )}
                {saving ? 'Saving...' : 'Save Level Tier'}
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default AdminLevelTiers;
