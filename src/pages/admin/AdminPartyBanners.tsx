import { useState, useEffect } from "react";
import useAdminRealtime from "@/hooks/useAdminRealtime";
import { motion } from "framer-motion";
import { 
  Plus, 
  Edit2, 
  Trash2, 
  Save, 
  X, 
  Trophy,
  Sparkles,
  Star,
  Eye,
  EyeOff,
  GripVertical
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { adminSupabase as supabase } from "@/integrations/supabase/adminClient";
import { toast } from "sonner";

interface PartyBanner {
  id: string;
  banner_type: string;
  title: string;
  subtitle: string | null;
  amount: number;
  icon_emoji: string;
  gradient_from: string;
  gradient_to: string;
  link_type: string | null;
  link_url: string | null;
  is_active: boolean;
  display_order: number;
  min_room_level: number;
  room_types: string[];
}

const bannerTypes = [
  { value: 'big_win', label: 'Big Win / Jackpot', icon: '💎' },
  { value: 'city_pk', label: 'City PK Battle', icon: '⚔️' },
  { value: 'daily_star', label: 'Daily Star', icon: '⭐' },
  { value: 'event', label: 'Special Event', icon: '🎉' },
  { value: 'game', label: 'Game Promo', icon: '🎮' },
];

const linkTypes = [
  { value: 'game', label: 'Open Game' },
  { value: 'pk_battle', label: 'PK Battle' },
  { value: 'event', label: 'Event Page' },
  { value: 'external', label: 'External URL' },
];

const roomTypeOptions = [
  { value: 'audio', label: 'Audio Room' },
  { value: 'video', label: 'Video Room' },
  { value: 'game', label: 'Game Room' },
];

export default function AdminPartyBanners() {
  const [banners, setBanners] = useState<PartyBanner[]>([]);
  const [loading, setLoading] = useState(false);
  const [editingBanner, setEditingBanner] = useState<PartyBanner | null>(null);
  const [isCreating, setIsCreating] = useState(false);

  const [formData, setFormData] = useState({
    banner_type: 'big_win',
    title: '',
    subtitle: '',
    amount: 0,
    icon_emoji: '💎',
    gradient_from: '#8B5CF6',
    gradient_to: '#EC4899',
    link_type: 'game',
    link_url: '',
    is_active: true,
    display_order: 0,
    min_room_level: 0,
    room_types: ['audio', 'video', 'game'],
  });

  useAdminRealtime(['party_room_banners'], () => fetchBanners());

  const fetchBanners = async () => {
    try {
      const { data, error } = await supabase
        .from('party_room_banners')
        .select('*')
        .order('display_order', { ascending: true });

      if (error) throw error;
      setBanners(data || []);
    } catch (error) {
      console.error('Error fetching banners:', error);
      toast.error('Failed to load banners');
    } finally {
      setLoading(false);
    }
  };

  const handleCreate = async () => {
    try {
      const { error } = await supabase
        .from('party_room_banners')
        .insert([formData]);

      if (error) throw error;
      toast.success('Banner created successfully');
      setIsCreating(false);
      resetForm();
      fetchBanners();
    } catch (error) {
      console.error('Error creating banner:', error);
      toast.error('Failed to create banner');
    }
  };

  const handleUpdate = async () => {
    if (!editingBanner) return;

    try {
      const { error } = await supabase
        .from('party_room_banners')
        .update(formData)
        .eq('id', editingBanner.id);

      if (error) throw error;
      toast.success('Banner updated successfully');
      setEditingBanner(null);
      resetForm();
      fetchBanners();
    } catch (error) {
      console.error('Error updating banner:', error);
      toast.error('Failed to update banner');
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to delete this banner?')) return;

    try {
      const { error } = await supabase
        .from('party_room_banners')
        .delete()
        .eq('id', id);

      if (error) throw error;
      toast.success('Banner deleted successfully');
      fetchBanners();
    } catch (error) {
      console.error('Error deleting banner:', error);
      toast.error('Failed to delete banner');
    }
  };

  const toggleActive = async (banner: PartyBanner) => {
    try {
      const { error } = await supabase
        .from('party_room_banners')
        .update({ is_active: !banner.is_active })
        .eq('id', banner.id);

      if (error) throw error;
      toast.success(`Banner ${!banner.is_active ? 'enabled' : 'disabled'}`);
      fetchBanners();
    } catch (error) {
      console.error('Error toggling banner:', error);
      toast.error('Failed to toggle banner');
    }
  };

  const resetForm = () => {
    setFormData({
      banner_type: 'big_win',
      title: '',
      subtitle: '',
      amount: 0,
      icon_emoji: '💎',
      gradient_from: '#8B5CF6',
      gradient_to: '#EC4899',
      link_type: 'game',
      link_url: '',
      is_active: true,
      display_order: 0,
      min_room_level: 0,
      room_types: ['audio', 'video', 'game'],
    });
  };

  const startEdit = (banner: PartyBanner) => {
    setEditingBanner(banner);
    setFormData({
      banner_type: banner.banner_type,
      title: banner.title,
      subtitle: banner.subtitle || '',
      amount: banner.amount,
      icon_emoji: banner.icon_emoji,
      gradient_from: banner.gradient_from,
      gradient_to: banner.gradient_to,
      link_type: banner.link_type || 'game',
      link_url: banner.link_url || '',
      is_active: banner.is_active,
      display_order: banner.display_order,
      min_room_level: banner.min_room_level,
      room_types: banner.room_types,
    });
    setIsCreating(false);
  };

  const formatAmount = (num: number) => {
    if (num >= 1000000) return `${(num / 1000000).toFixed(2)}M`;
    if (num >= 1000) return `${(num / 1000).toFixed(0)}K`;
    return num.toLocaleString();
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6 p-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Party Room Banners</h1>
          <p className="text-muted-foreground">
            Manage Big Win, City PK, and promotional banners shown in party rooms
          </p>
        </div>
        <Button 
          onClick={() => { setIsCreating(true); setEditingBanner(null); resetForm(); }}
          className="bg-gradient-to-r from-purple-500 to-pink-500"
        >
          <Plus className="w-4 h-4 mr-2" />
          Add Banner
        </Button>
      </div>

      {/* Create/Edit Form */}
      {(isCreating || editingBanner) && (
        <Card className="border-2 border-primary/20">
          <CardHeader>
            <CardTitle>{editingBanner ? 'Edit Banner' : 'Create New Banner'}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Banner Type</Label>
                <Select 
                  value={formData.banner_type}
                  onValueChange={(value) => setFormData({ ...formData, banner_type: value })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {bannerTypes.map(type => (
                      <SelectItem key={type.value} value={type.value}>
                        {type.icon} {type.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Link Type</Label>
                <Select 
                  value={formData.link_type}
                  onValueChange={(value) => setFormData({ ...formData, link_type: value })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {linkTypes.map(type => (
                      <SelectItem key={type.value} value={type.value}>
                        {type.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Title</Label>
                <Input 
                  value={formData.title}
                  onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                  placeholder="BIG WIN"
                />
              </div>
              <div className="space-y-2">
                <Label>Subtitle</Label>
                <Input 
                  value={formData.subtitle}
                  onChange={(e) => setFormData({ ...formData, subtitle: e.target.value })}
                  placeholder="Jackpot"
                />
              </div>
            </div>

            <div className="grid grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label>Amount</Label>
                <Input 
                  type="number"
                  value={formData.amount}
                  onChange={(e) => setFormData({ ...formData, amount: parseFloat(e.target.value) || 0 })}
                  placeholder="10000000"
                />
              </div>
              <div className="space-y-2">
                <Label>Icon Emoji</Label>
                <Input 
                  value={formData.icon_emoji}
                  onChange={(e) => setFormData({ ...formData, icon_emoji: e.target.value })}
                  placeholder="💎"
                />
              </div>
              <div className="space-y-2">
                <Label>Display Order</Label>
                <Input 
                  type="number"
                  value={formData.display_order}
                  onChange={(e) => setFormData({ ...formData, display_order: parseInt(e.target.value) || 0 })}
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Gradient From</Label>
                <div className="flex gap-2">
                  <Input 
                    type="color"
                    value={formData.gradient_from}
                    onChange={(e) => setFormData({ ...formData, gradient_from: e.target.value })}
                    className="w-12 h-10 p-1"
                  />
                  <Input 
                    value={formData.gradient_from}
                    onChange={(e) => setFormData({ ...formData, gradient_from: e.target.value })}
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label>Gradient To</Label>
                <div className="flex gap-2">
                  <Input 
                    type="color"
                    value={formData.gradient_to}
                    onChange={(e) => setFormData({ ...formData, gradient_to: e.target.value })}
                    className="w-12 h-10 p-1"
                  />
                  <Input 
                    value={formData.gradient_to}
                    onChange={(e) => setFormData({ ...formData, gradient_to: e.target.value })}
                  />
                </div>
              </div>
            </div>

            <div className="space-y-2">
              <Label>Show in Room Types</Label>
              <div className="flex gap-4">
                {roomTypeOptions.map(option => (
                  <label key={option.value} className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={formData.room_types.includes(option.value)}
                      onChange={(e) => {
                        if (e.target.checked) {
                          setFormData({ ...formData, room_types: [...formData.room_types, option.value] });
                        } else {
                          setFormData({ ...formData, room_types: formData.room_types.filter(t => t !== option.value) });
                        }
                      }}
                      className="rounded"
                    />
                    <span>{option.label}</span>
                  </label>
                ))}
              </div>
            </div>

            <div className="flex items-center gap-2">
              <Switch
                checked={formData.is_active}
                onCheckedChange={(checked) => setFormData({ ...formData, is_active: checked })}
              />
              <Label>Active</Label>
            </div>

            {/* Preview */}
            <div className="p-4 bg-black/50 rounded-xl">
              <p className="text-xs text-white/60 mb-2">Preview:</p>
              <div className="flex justify-end">
                <motion.div
                  className="relative overflow-hidden rounded-xl"
                  style={{
                    background: `linear-gradient(to right, ${formData.gradient_from}, ${formData.gradient_to})`
                  }}
                >
                  <div 
                    className="backdrop-blur-sm rounded-xl px-3 py-2"
                    style={{
                      background: `linear-gradient(to right, ${formData.gradient_from}E6, ${formData.gradient_to}E6)`
                    }}
                  >
                    <div className="flex flex-col items-center">
                      <span className="text-[10px] font-bold text-white/90">{formData.title || 'TITLE'}</span>
                      <div className="flex items-center gap-1">
                        <span className="text-sm">{formData.icon_emoji}</span>
                        <span className="text-sm font-bold text-white">{formatAmount(formData.amount)}</span>
                      </div>
                    </div>
                  </div>
                </motion.div>
              </div>
            </div>

            <div className="flex gap-2">
              <Button onClick={editingBanner ? handleUpdate : handleCreate}>
                <Save className="w-4 h-4 mr-2" />
                {editingBanner ? 'Update' : 'Create'}
              </Button>
              <Button variant="outline" onClick={() => { setIsCreating(false); setEditingBanner(null); resetForm(); }}>
                <X className="w-4 h-4 mr-2" />
                Cancel
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Banners List */}
      <div className="grid gap-4">
        {banners.map((banner) => (
          <Card key={banner.id} className={!banner.is_active ? 'opacity-50' : ''}>
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <div className="cursor-move">
                    <GripVertical className="w-5 h-5 text-muted-foreground" />
                  </div>
                  
                  {/* Banner Preview */}
                  <div 
                    className="px-3 py-2 rounded-xl"
                    style={{
                      background: `linear-gradient(to right, ${banner.gradient_from}, ${banner.gradient_to})`
                    }}
                  >
                    <div className="flex items-center gap-2">
                      <span className="text-lg">{banner.icon_emoji}</span>
                      <div>
                        <p className="text-white font-bold text-sm">{banner.title}</p>
                        <p className="text-white/80 text-xs">{formatAmount(banner.amount)}</p>
                      </div>
                    </div>
                  </div>

                  <div>
                    <p className="font-medium">{banner.title}</p>
                    <div className="flex gap-1 mt-1">
                      {banner.room_types.map(type => (
                        <Badge key={type} variant="secondary" className="text-xs">
                          {type}
                        </Badge>
                      ))}
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <Button 
                    variant="ghost" 
                    size="icon"
                    onClick={() => toggleActive(banner)}
                  >
                    {banner.is_active ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
                  </Button>
                  <Button 
                    variant="ghost" 
                    size="icon"
                    onClick={() => startEdit(banner)}
                  >
                    <Edit2 className="w-4 h-4" />
                  </Button>
                  <Button 
                    variant="ghost" 
                    size="icon"
                    className="text-red-500"
                    onClick={() => handleDelete(banner.id)}
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}

        {banners.length === 0 && (
          <Card>
            <CardContent className="py-8 text-center">
              <Sparkles className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
              <p className="text-muted-foreground">No banners configured yet</p>
              <Button 
                variant="outline" 
                className="mt-4"
                onClick={() => setIsCreating(true)}
              >
                Create First Banner
              </Button>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
