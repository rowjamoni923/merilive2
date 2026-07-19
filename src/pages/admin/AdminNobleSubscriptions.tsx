import { useState, useEffect, useCallback } from "react";
import { useAdminRealtime } from "@/hooks/useAdminRealtime";
import { adminSupabase as supabase } from "@/integrations/supabase/adminClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useToast } from "@/hooks/use-toast";
import { SmartImage } from "@/components/ui/smart-image";
import { Crown, Plus, Edit2, Trash2, Sparkles, Gem, Shield, Ghost, EyeOff, Lock, TrendingUp, Calendar, Zap, RefreshCw, Upload } from "lucide-react";
import FixedAnimationFrame from "@/components/common/FixedAnimationFrame";
interface NobleCard {
  id: string;
  rank_code: string;
  rank_name: string;
  rank_order: number;
  monthly_diamond_cost: number;
  duration_days: number;
  description: string | null;
  badge_url: string | null;
  badge_color: string | null;
  crown_url: string | null;
  entrance_animation_url: string | null;
  custom_avatar_frame_url: string | null;
  custom_chat_bubble_url: string | null;
  profile_background_url: string | null;
  username_color: string | null;
  // Power perks
  anti_kick_protection: boolean;
  stealth_mode: boolean;
  hide_real_level: boolean;
  forbidden_words_bypass: boolean;
  top_position_in_lists: boolean;
  vip_only_lounge_access: boolean;
  priority_random_match: boolean;
  exclusive_emoji_pack: boolean;
  // Economy
  recharge_bonus_percent: number;
  daily_free_diamonds: number;
  monthly_free_diamonds: number;
  cashback_percent: number;
  free_name_changes_per_month: number;
  entry_effect_duration_seconds: number;
  // Meta
  is_active: boolean;
  display_order: number;
}

const defaultCard: Partial<NobleCard> = {
  rank_code: '',
  rank_name: '',
  rank_order: 1,
  monthly_diamond_cost: 30000,
  duration_days: 30,
  description: '',
  badge_color: '#FFD700',
  username_color: '#FFD700',
  anti_kick_protection: false,
  stealth_mode: false,
  hide_real_level: false,
  forbidden_words_bypass: false,
  top_position_in_lists: false,
  vip_only_lounge_access: false,
  priority_random_match: false,
  exclusive_emoji_pack: false,
  recharge_bonus_percent: 0,
  daily_free_diamonds: 0,
  monthly_free_diamonds: 0,
  cashback_percent: 0,
  free_name_changes_per_month: 0,
  entry_effect_duration_seconds: 8,
  is_active: true,
  display_order: 0,
};

const AdminNobleSubscriptions = () => {
  const { toast } = useToast();
  const [cards, setCards] = useState<NobleCard[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<NobleCard | null>(null);
  const [form, setForm] = useState<Partial<NobleCard>>(defaultCard);

  const fetchCards = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('noble_cards')
      .select('*')
      .order('rank_order', { ascending: true });
    if (error) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    }
    setCards((data as any) || []);
    setLoading(false);
  }, [toast]);

  useEffect(() => { fetchCards(); }, [fetchCards]);
  useAdminRealtime(['noble_cards'], fetchCards, 'admin-noble-subscriptions-rt');

  const openCreate = () => {
    setEditing(null);
    setForm({ ...defaultCard, rank_order: (cards[cards.length - 1]?.rank_order || 0) + 1 });
    setDialogOpen(true);
  };

  const openEdit = (card: NobleCard) => {
    setEditing(card);
    setForm(card);
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!form.rank_code || !form.rank_name) {
      toast({ title: 'Missing fields', description: 'Rank code and name are required.', variant: 'destructive' });
      return;
    }
    setSaving(true);
    const payload: any = { ...form };
    delete payload.id;
    delete payload.created_at;
    delete payload.updated_at;

    const { error } = editing
      ? await supabase.from('noble_cards').update(payload).eq('id', editing.id)
      : await supabase.from('noble_cards').insert(payload);

    setSaving(false);
    if (error) {
      toast({ title: 'Save failed', description: error.message, variant: 'destructive' });
      return;
    }
    toast({ title: 'Saved', description: `${form.rank_name} ${editing ? 'updated' : 'created'}.` });
    setDialogOpen(false);
    fetchCards();
  };

  const handleDelete = async (card: NobleCard) => {
    if (!confirm(`Delete Noble rank "${card.rank_name}"? Existing subscriptions remain valid until expiry.`)) return;
    const { error } = await supabase.from('noble_cards').delete().eq('id', card.id);
    if (error) {
      toast({ title: 'Delete failed', description: error.message, variant: 'destructive' });
      return;
    }
    toast({ title: 'Deleted', description: `${card.rank_name} removed.` });
    fetchCards();
  };

  return (
    <div className="admin-pro-shell p-4 sm:p-6 space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
            <Crown className="w-6 h-6 text-amber-400" />
            Noble Subscriptions
          </h1>
          <p className="text-sm text-slate-400 mt-1">
            Monthly subscription tiers (Baron → King). Auto-renew & monthly bonuses are handled by edge functions.
          </p>
        </div>
        <div className="flex gap-2">
          <Button onClick={fetchCards} variant="outline" size="sm" disabled={loading}>
            <RefreshCw className={`w-4 h-4 mr-1 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
          <Button onClick={openCreate} className="bg-amber-600 hover:bg-amber-700">
            <Plus className="w-4 h-4 mr-1" />
            New Rank
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {cards.map(card => (
          <div
            key={card.id}
            className="bg-white border border-slate-200 rounded-xl overflow-hidden hover:border-amber-500/50 transition"
          >
            <div
              className="p-4 flex items-center justify-between"
              style={{
                background: `linear-gradient(135deg, ${card.badge_color || '#FFD700'}33, transparent)`
              }}
            >
              <div className="flex items-center gap-3">
                {card.crown_url ? (
                  <SmartImage src={card.crown_url} alt="" className="w-10 h-10 object-contain" fallbackSrc="/placeholder.svg" />
                ) : (
                  <Crown className="w-8 h-8" style={{ color: card.badge_color || '#FFD700' }} />
                )}
                <div>
                  <div className="text-slate-900 font-bold">{card.rank_name}</div>
                  <div className="text-xs text-slate-400">{card.rank_code} · #{card.rank_order}</div>
                </div>
              </div>
              <div className="flex items-center gap-1">
                <Badge variant={card.is_active ? 'default' : 'secondary'}>
                  {card.is_active ? 'Active' : 'Off'}
                </Badge>
                <Button size="icon" variant="ghost" onClick={() => openEdit(card)}>
                  <Edit2 className="w-4 h-4" />
                </Button>
                <Button size="icon" variant="ghost" onClick={() => handleDelete(card)} className="text-red-400">
                  <Trash2 className="w-4 h-4" />
                </Button>
              </div>
            </div>
            <div className="p-4 space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span className="text-slate-400">Monthly Cost</span>
                <span className="text-amber-400 font-semibold">💎 {card.monthly_diamond_cost.toLocaleString()}</span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-slate-400">Duration</span>
                <span className="text-slate-900">{card.duration_days} days</span>
              </div>
              <div className="flex flex-wrap gap-1 pt-2">
                {card.anti_kick_protection && <Badge variant="outline" className="border-emerald-500 text-emerald-400 text-xs">Anti-Kick</Badge>}
                {card.stealth_mode && <Badge variant="outline" className="border-violet-500 text-violet-400 text-xs">Stealth</Badge>}
                {card.hide_real_level && <Badge variant="outline" className="border-slate-400 text-slate-300 text-xs">Hide Lvl</Badge>}
                {card.recharge_bonus_percent > 0 && <Badge variant="outline" className="border-yellow-500 text-yellow-400 text-xs">+{card.recharge_bonus_percent}%</Badge>}
                {card.daily_free_diamonds > 0 && <Badge variant="outline" className="border-cyan-500 text-cyan-400 text-xs">{card.daily_free_diamonds}/day</Badge>}
                {card.monthly_free_diamonds > 0 && <Badge variant="outline" className="border-pink-500 text-pink-400 text-xs">{card.monthly_free_diamonds}/mo</Badge>}
              </div>
              {(card.entrance_animation_url || card.custom_avatar_frame_url) && (
                <div className="flex gap-2 pt-2 border-t border-slate-200">
                  {card.entrance_animation_url && (
                    <div className="w-14 h-14 bg-slate-50 rounded overflow-hidden">
                      <FixedAnimationFrame size="fill" center={false} src={card.entrance_animation_url}  loop />
                    </div>
                  )}
                  {card.custom_avatar_frame_url && (
                    <div className="w-14 h-14 bg-slate-50 rounded overflow-hidden">
                      <FixedAnimationFrame size="fill" center={false} src={card.custom_avatar_frame_url}  loop />
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        ))}
        {!loading && cards.length === 0 && (
          <div className="col-span-full text-center text-slate-500 py-12 border border-dashed border-slate-200 rounded-xl">
            No Noble ranks yet. Click "New Rank" to add Baron, Viscount, Count, Marquis, Duke, or King.
          </div>
        )}
      </div>

      {/* Create/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent
          className="bg-white border-slate-200 w-screen sm:w-[95vw] sm:max-w-4xl h-[100dvh] sm:h-auto max-h-[100dvh] sm:max-h-[92vh] rounded-none sm:rounded-lg p-0 flex flex-col overflow-hidden"
          style={{ resize: 'both', minWidth: '320px', minHeight: '400px' }}
        >
          <DialogHeader className="p-4 border-b border-slate-200 shrink-0">
            <DialogTitle className="text-slate-900 flex items-center gap-2">
              <Crown className="w-5 h-5 text-amber-400" />
              {editing ? `Edit ${editing.rank_name}` : 'Create Noble Rank'}
            </DialogTitle>
          </DialogHeader>

          <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain">
            <div className="p-4">
              <Tabs defaultValue="basic">
                <TabsList className="bg-slate-50 w-full flex-wrap h-auto">
                  <TabsTrigger value="basic" className="flex-1 min-w-[90px]">Basic</TabsTrigger>
                  <TabsTrigger value="cosmetic" className="flex-1 min-w-[90px]">Cosmetic</TabsTrigger>
                  <TabsTrigger value="power" className="flex-1 min-w-[90px]">Power</TabsTrigger>
                  <TabsTrigger value="economy" className="flex-1 min-w-[90px]">Economy</TabsTrigger>
                </TabsList>

                {/* Basic */}
                <TabsContent value="basic" className="space-y-4 mt-4">
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-sm text-slate-400 mb-1 block">Rank Code *</label>
                      <Input
                        value={form.rank_code || ''}
                        onChange={e => setForm(p => ({ ...p, rank_code: e.target.value }))}
                        placeholder="baron"
                        className="bg-slate-50 border-slate-200 text-slate-900"
                      />
                    </div>
                    <div>
                      <label className="text-sm text-slate-400 mb-1 block">Rank Name *</label>
                      <Input
                        value={form.rank_name || ''}
                        onChange={e => setForm(p => ({ ...p, rank_name: e.target.value }))}
                        placeholder="Baron"
                        className="bg-slate-50 border-slate-200 text-slate-900"
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-3 gap-3">
                    <div>
                      <label className="text-sm text-slate-400 mb-1 block">Rank Order</label>
                      <Input
                        type="number"
                        value={form.rank_order || 1}
                        onChange={e => setForm(p => ({ ...p, rank_order: parseInt(e.target.value) || 1 }))}
                        className="bg-slate-50 border-slate-200 text-slate-900"
                      />
                    </div>
                    <div>
                      <label className="text-sm text-slate-400 mb-1 block">Monthly 💎 Cost</label>
                      <Input
                        type="number"
                        value={form.monthly_diamond_cost || 0}
                        onChange={e => setForm(p => ({ ...p, monthly_diamond_cost: parseInt(e.target.value) || 0 }))}
                        className="bg-slate-50 border-slate-200 text-slate-900"
                      />
                    </div>
                    <div>
                      <label className="text-sm text-slate-400 mb-1 block">Duration (days)</label>
                      <Input
                        type="number"
                        value={form.duration_days || 30}
                        onChange={e => setForm(p => ({ ...p, duration_days: parseInt(e.target.value) || 30 }))}
                        className="bg-slate-50 border-slate-200 text-slate-900"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="text-sm text-slate-400 mb-1 block">Description</label>
                    <Textarea
                      value={form.description || ''}
                      onChange={e => setForm(p => ({ ...p, description: e.target.value }))}
                      className="bg-slate-50 border-slate-200 text-slate-900"
                    />
                  </div>
                  <div className="flex items-center justify-between bg-slate-50 p-3 rounded-lg">
                    <span className="text-slate-900">Active</span>
                    <Switch
                      checked={form.is_active !== false}
                      onCheckedChange={checked => setForm(p => ({ ...p, is_active: checked }))}
                    />
                  </div>
                </TabsContent>

                {/* Cosmetic */}
                <TabsContent value="cosmetic" className="space-y-3 mt-4">
                  <div className="bg-slate-50 p-3 rounded-lg">
                    <label className="text-sm text-white block mb-2">Badge Color</label>
                    <div className="flex gap-2 items-center">
                      <Input
                        type="color"
                        value={form.badge_color || '#FFD700'}
                        onChange={e => setForm(p => ({ ...p, badge_color: e.target.value }))}
                        className="w-16 h-10 bg-white border-slate-200 p-1"
                      />
                      <Input
                        value={form.badge_color || ''}
                        onChange={e => setForm(p => ({ ...p, badge_color: e.target.value }))}
                        className="bg-white border-slate-200 text-slate-900 flex-1"
                      />
                    </div>
                  </div>
                  <div className="bg-slate-50 p-3 rounded-lg">
                    <label className="text-sm text-slate-900 block mb-2">Username Color</label>
                    <div className="flex gap-2 items-center">
                      <Input
                        type="color"
                        value={form.username_color || '#FFD700'}
                        onChange={e => setForm(p => ({ ...p, username_color: e.target.value }))}
                        className="w-16 h-10 bg-white border-slate-200 p-1"
                      />
                      <Input
                        value={form.username_color || ''}
                        onChange={e => setForm(p => ({ ...p, username_color: e.target.value }))}
                        className="bg-white border-slate-200 text-slate-900 flex-1"
                      />
                    </div>
                  </div>
                  {[
                    { key: 'badge_url', label: 'Badge Image URL' },
                    { key: 'crown_url', label: 'Crown Icon URL' },
                    { key: 'entrance_animation_url', label: 'Entrance Animation URL (SVGA/Lottie/MP4)' },
                    { key: 'custom_avatar_frame_url', label: 'Custom Avatar Frame URL' },
                    { key: 'custom_chat_bubble_url', label: 'Custom Chat Bubble URL' },
                    { key: 'profile_background_url', label: 'Profile Background URL' },
                  ].map(({ key, label }) => (
                    <div key={key} className="bg-slate-50 p-3 rounded-lg">
                      <label className="text-sm text-slate-900 block mb-2">{label}</label>
                      <Input
                        value={(form as any)[key] || ''}
                        onChange={e => setForm(p => ({ ...p, [key]: e.target.value }))}
                        placeholder="https://..."
                        className="bg-white border-slate-200 text-slate-900"
                      />
                      {(form as any)[key] && (key === 'entrance_animation_url' || key === 'custom_avatar_frame_url' || key === 'custom_chat_bubble_url') && (
                        <div className="mt-2 w-20 h-20 bg-white rounded overflow-hidden">
                          <FixedAnimationFrame size="fill" center={false} src={(form as any)[key]}  loop />
                        </div>
                      )}
                    </div>
                  ))}
                </TabsContent>

                {/* Power Perks */}
                <TabsContent value="power" className="space-y-3 mt-4">
                  {[
                    { key: 'anti_kick_protection', label: 'Anti-Kick Protection', icon: Shield, color: 'text-emerald-400' },
                    { key: 'stealth_mode', label: 'Stealth Mode', icon: Ghost, color: 'text-violet-400' },
                    { key: 'hide_real_level', label: 'Hide Real Level', icon: EyeOff, color: 'text-slate-300' },
                    { key: 'forbidden_words_bypass', label: 'Forbidden Words Bypass', icon: Lock, color: 'text-orange-400' },
                    { key: 'top_position_in_lists', label: 'Top Position in Lists', icon: TrendingUp, color: 'text-yellow-400' },
                    { key: 'vip_only_lounge_access', label: 'VIP Lounge Access', icon: Crown, color: 'text-amber-400' },
                    { key: 'priority_random_match', label: 'Priority Random Match', icon: Zap, color: 'text-cyan-400' },
                    { key: 'exclusive_emoji_pack', label: 'Exclusive Emoji Pack', icon: Sparkles, color: 'text-pink-400' },
                  ].map(({ key, label, icon: Icon, color }) => (
                    <div key={key} className="flex items-center justify-between bg-slate-50 p-3 rounded-lg">
                      <div className="flex items-center gap-3">
                        <Icon className={`w-5 h-5 ${color}`} />
                        <span className="text-slate-900">{label}</span>
                      </div>
                      <Switch
                        checked={(form as any)[key] || false}
                        onCheckedChange={checked => setForm(p => ({ ...p, [key]: checked }))}
                      />
                    </div>
                  ))}
                </TabsContent>

                {/* Economy */}
                <TabsContent value="economy" className="space-y-3 mt-4">
                  <div className="grid grid-cols-2 gap-3">
                    {[
                      { key: 'recharge_bonus_percent', label: 'Recharge Bonus %', icon: Gem, color: 'text-amber-400' },
                      { key: 'cashback_percent', label: 'Cashback %', icon: Gem, color: 'text-emerald-400' },
                      { key: 'daily_free_diamonds', label: 'Daily Free 💎', icon: Calendar, color: 'text-cyan-400' },
                      { key: 'monthly_free_diamonds', label: 'Monthly Free 💎', icon: Sparkles, color: 'text-pink-400' },
                      { key: 'free_name_changes_per_month', label: 'Free Name Changes/mo', icon: Edit2, color: 'text-blue-400' },
                      { key: 'entry_effect_duration_seconds', label: 'Entry Duration (s)', icon: Zap, color: 'text-yellow-400' },
                    ].map(({ key, label, icon: Icon, color }) => (
                      <div key={key} className="bg-slate-50 p-3 rounded-lg">
                        <label className="text-sm text-slate-900 flex items-center gap-2 mb-2">
                          <Icon className={`w-4 h-4 ${color}`} />
                          {label}
                        </label>
                        <Input
                          type="number"
                          min={0}
                          value={(form as any)[key] ?? 0}
                          onChange={e => setForm(p => ({ ...p, [key]: parseInt(e.target.value) || 0 }))}
                          className="bg-white border-slate-200 text-slate-900"
                        />
                      </div>
                    ))}
                  </div>
                </TabsContent>
              </Tabs>
            </div>
          </div>

          <div className="p-4 border-t border-slate-200 shrink-0 flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleSave} disabled={saving} className="bg-amber-600 hover:bg-amber-700">
              {saving ? 'Saving...' : editing ? 'Save Changes' : 'Create Rank'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default AdminNobleSubscriptions;
