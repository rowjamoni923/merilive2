import React, { useState, useEffect, useCallback } from 'react';
import useAdminRealtime from "@/hooks/useAdminRealtime";
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Gift, Plus, Pencil, Trash2, Eye, EyeOff, Sparkles, Package, Users, Save, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { adminSupabase as supabase } from "@/integrations/supabase/adminClient";
import { toast } from 'sonner';
import { recordAdminError } from "@/utils/adminErrorLog";

import { formatAdminError } from "@/utils/formatAdminError";
interface ParcelTemplate {
  id: string;
  name: string;
  description: string | null;
  icon_url: string | null;
  parcel_type: string;
  unlock_condition: string;
  unlock_threshold: number;
  reward_type: string;
  reward_amount: number;
  reward_label: string | null;
  expiry_hours: number;
  unlock_wait_hours: number;
  target_segment: string;
  min_level: number;
  max_level: number;
  display_order: number;
  is_active: boolean;
  glow_color: string | null;
  created_at: string;
}

interface ParcelStats {
  total_templates: number;
  active_templates: number;
  total_assigned: number;
  total_claimed: number;
}

const EMPTY_TEMPLATE: Partial<ParcelTemplate> = {
  name: '',
  description: '',
  parcel_type: 'standard',
  unlock_condition: 'none',
  unlock_threshold: 0,
  reward_type: 'diamonds',
  reward_amount: 50,
  reward_label: '',
  expiry_hours: 24,
  unlock_wait_hours: 0,
  target_segment: 'all',
  min_level: 0,
  max_level: 999,
  display_order: 0,
  is_active: true,
  glow_color: '#a855f7',
};

const PARCEL_TYPES = [
  { value: 'standard', label: 'Standard' },
  { value: 'mega', label: 'Mega ⭐' },
  { value: 'surprise', label: 'Surprise 🎁' },
  { value: 'lucky_spin', label: 'Lucky Spin 🎰' },
];

const UNLOCK_CONDITIONS = [
  { value: 'none', label: 'No condition (instant)' },
  { value: 'recharge', label: 'Recharge' },
  { value: 'first_recharge', label: 'First Recharge' },
  { value: 'watch_live', label: 'Watch Live' },
  { value: 'send_gift', label: 'Send Gifts' },
  { value: 'daily_login', label: 'Daily Login Streak' },
  { value: 'level_reach', label: 'Reach Level' },
  { value: 'invite_friend', label: 'Invite Friend' },
];

const REWARD_TYPES = [
  { value: 'diamonds', label: 'Diamonds' },
  { value: 'beans', label: 'Beans' },
  { value: 'vip_days', label: 'VIP Days' },
  { value: 'call_minutes', label: 'Call Minutes' },
  { value: 'bonus_percentage', label: 'Bonus %' },
];

const TARGET_SEGMENTS = [
  { value: 'all', label: 'All Users' },
  { value: 'new_user', label: 'New Users' },
  { value: 'returning_user', label: 'Returning Users' },
  { value: 'vip', label: 'VIP Only' },
  { value: 'high_spender', label: 'High Spenders' },
  { value: 'inactive', label: 'Inactive Users' },
];

const AdminParcelManagement = () => {
  const navigate = useNavigate();
  const [templates, setTemplates] = useState<ParcelTemplate[]>([]);
  const [stats, setStats] = useState<ParcelStats>({ total_templates: 0, active_templates: 0, total_assigned: 0, total_claimed: 0 });
  const [loading, setLoading] = useState(true);
  const [editingTemplate, setEditingTemplate] = useState<Partial<ParcelTemplate> | null>(null);
  const [isNew, setIsNew] = useState(false);
  const [saving, setSaving] = useState(false);

  const fetchTemplates = useCallback(async () => {
    try {
      const { data, error } = await (supabase as any)
        .from('parcel_templates')
        .select('*')
        .order('display_order', { ascending: true });
      if (error) throw error;
      setTemplates(data || []);
      setStats(prev => ({
        ...prev,
        total_templates: data?.length || 0,
        active_templates: data?.filter((t: ParcelTemplate) => t.is_active).length || 0,
      }));
    } catch (error) {
      console.error('Error:', error);
      recordAdminError({ kind: "rpc", label: "AdminParcelManagement.fetchTemplates", message: formatAdminError(error) });
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchStats = useCallback(async () => {
    try {
      const [assignedRes, claimedRes] = await Promise.all([
        (supabase as any).from('user_parcels').select('id', { count: 'exact', head: true }),
        (supabase as any).from('parcel_claims').select('id', { count: 'exact', head: true }),
      ]);
      setStats(prev => ({
        ...prev,
        total_assigned: assignedRes.count || 0,
        total_claimed: claimedRes.count || 0,
      }));
    } catch {}
  }, []);

  useEffect(() => {
    fetchTemplates();
    fetchStats();
  }, [fetchTemplates, fetchStats]);

  useAdminRealtime(['parcel_templates'], () => { fetchTemplates(); });

  const handleSave = async () => {
    if (!editingTemplate?.name) {
      toast.error('Name is required');
      return;
    }
    setSaving(true);
    try {
      const payload = {
        name: editingTemplate.name,
        description: editingTemplate.description || null,
        parcel_type: editingTemplate.parcel_type || 'standard',
        unlock_condition: editingTemplate.unlock_condition || 'none',
        unlock_threshold: editingTemplate.unlock_threshold || 0,
        reward_type: editingTemplate.reward_type || 'diamonds',
        reward_amount: editingTemplate.reward_amount || 0,
        reward_label: editingTemplate.reward_label || null,
        expiry_hours: editingTemplate.expiry_hours || 24,
        unlock_wait_hours: editingTemplate.unlock_wait_hours || 0,
        target_segment: editingTemplate.target_segment || 'all',
        min_level: editingTemplate.min_level || 0,
        max_level: editingTemplate.max_level || 999,
        display_order: editingTemplate.display_order || 0,
        is_active: editingTemplate.is_active ?? true,
        glow_color: editingTemplate.glow_color || '#a855f7',
      };

      if (isNew) {
        const { error } = await (supabase as any).from('parcel_templates').insert([payload]);
        if (error) throw error;
        toast.success('Parcel template created!');
      } else {
        const { error } = await (supabase as any)
          .from('parcel_templates')
          .update(payload)
          .eq('id', editingTemplate.id);
        if (error) throw error;
        toast.success('Template updated!');
      }
      setEditingTemplate(null);
      fetchTemplates();
    } catch (error: any) {
      toast.error(error.message || 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this parcel template? This will also remove all assigned user parcels.')) return;
    try {
      const { error } = await (supabase as any).from('parcel_templates').delete().eq('id', id);
      if (error) throw error;
      toast.success('Deleted');
      fetchTemplates();
    } catch (error: any) {
      toast.error(error.message || 'Failed to delete');
    }
  };

  const toggleActive = async (id: string, currentValue: boolean) => {
    try {
      const { error } = await (supabase as any)
        .from('parcel_templates')
        .update({ is_active: !currentValue })
        .eq('id', id);
      if (error) throw error;
      toast.success(!currentValue ? 'Activated' : 'Deactivated');
      fetchTemplates();
    } catch (error: any) {
      toast.error(error.message || 'Failed');
    }
  };

  return (
    <div className="admin-pro-shell admin-content -mx-4 -my-4 sm:-mx-6 sm:-my-6">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-card border-b border-border p-4">
        <div className="flex items-center gap-3">
          <button onClick={() => navigate(-1)}>
            <ArrowLeft className="w-5 h-5 text-foreground" />
          </button>
          <div>
            <h1 className="text-lg font-bold text-foreground flex items-center gap-2">
              <Gift className="w-5 h-5 text-purple-400" /> Parcel Management
            </h1>
            <p className="text-xs text-muted-foreground">Create & manage personalized reward parcels</p>
          </div>
        </div>
      </div>

      <div className="p-4 space-y-4">
        {/* Stats */}
        <div className="grid grid-cols-2 gap-3">
          <Card className="bg-purple-500/10 border-purple-500/20">
            <CardContent className="p-3 text-center">
              <Package className="w-5 h-5 text-purple-400 mx-auto mb-1" />
              <p className="text-xl font-bold text-foreground">{stats.total_templates}</p>
              <p className="text-[10px] text-muted-foreground">Templates ({stats.active_templates} active)</p>
            </CardContent>
          </Card>
          <Card className="bg-amber-500/10 border-amber-500/20">
            <CardContent className="p-3 text-center">
              <Users className="w-5 h-5 text-amber-400 mx-auto mb-1" />
              <p className="text-xl font-bold text-foreground">{stats.total_assigned}</p>
              <p className="text-[10px] text-muted-foreground">Assigned ({stats.total_claimed} claimed)</p>
            </CardContent>
          </Card>
        </div>

        {/* Add New Button */}
        <Button
          onClick={() => { setEditingTemplate({ ...EMPTY_TEMPLATE }); setIsNew(true); }}
          variant="premium"
          className="w-full"
        >
          <Plus className="w-4 h-4 mr-2" /> Create New Parcel Template
        </Button>

        {/* Template List */}
        <div className="space-y-3">
          {templates.map((t) => (
            <Card key={t.id} className={`border ${t.is_active ? 'border-purple-500/30' : 'border-white/5 opacity-60'}`}>
              <CardContent className="p-4">
                <div className="flex items-start gap-3">
                  <div
                    className="w-10 h-10 rounded-lg flex items-center justify-center shrink-0"
                    style={{ background: `${t.glow_color}20` }}
                  >
                    {t.parcel_type === 'mega' ? (
                      <Sparkles className="w-5 h-5" style={{ color: t.glow_color || '#a855f7' }} />
                    ) : (
                      <Gift className="w-5 h-5" style={{ color: t.glow_color || '#a855f7' }} />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <h3 className="text-sm font-bold text-foreground truncate">{t.name}</h3>
                      <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-slate-50 text-muted-foreground uppercase">{t.parcel_type}</span>
                    </div>
                    <p className="text-xs text-muted-foreground truncate mt-0.5">{t.description}</p>
                    <div className="flex flex-wrap gap-2 mt-2">
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-400">
                        {t.reward_label || `${t.reward_amount} ${t.reward_type}`}
                      </span>
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-500/10 text-blue-400">
                        {UNLOCK_CONDITIONS.find(c => c.value === t.unlock_condition)?.label || t.unlock_condition}
                      </span>
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-green-500/10 text-green-400">
                        {TARGET_SEGMENTS.find(s => s.value === t.target_segment)?.label || t.target_segment}
                      </span>
                    </div>
                  </div>
                  <div className="flex flex-col gap-1 shrink-0">
                    <button onClick={() => toggleActive(t.id, t.is_active)} className="p-1.5 rounded-lg hover:bg-slate-50">
                      {t.is_active ? <Eye className="w-4 h-4 text-emerald-400" /> : <EyeOff className="w-4 h-4 text-red-400" />}
                    </button>
                    <button onClick={() => { setEditingTemplate(t); setIsNew(false); }} className="p-1.5 rounded-lg hover:bg-slate-50">
                      <Pencil className="w-4 h-4 text-blue-400" />
                    </button>
                    <button onClick={() => handleDelete(t.id)} className="p-1.5 rounded-lg hover:bg-slate-50">
                      <Trash2 className="w-4 h-4 text-red-400" />
                    </button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>

      {/* Edit/Create Modal */}
      {editingTemplate && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-end">
          <div className="w-full max-h-[90vh] overflow-y-auto bg-card rounded-t-3xl border-t border-slate-200 p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold text-foreground">
                {isNew ? 'Create Parcel Template' : 'Edit Template'}
              </h2>
              <button onClick={() => setEditingTemplate(null)}>
                <X className="w-5 h-5 text-slate-900/40" />
              </button>
            </div>

            <div className="space-y-4">
              {/* Name */}
              <div>
                <Label className="text-xs text-muted-foreground">Name *</Label>
                <Input value={editingTemplate.name || ''} onChange={e => setEditingTemplate(p => ({ ...p!, name: e.target.value }))} placeholder="Welcome Gift" />
              </div>

              {/* Description */}
              <div>
                <Label className="text-xs text-muted-foreground">Description</Label>
                <Input value={editingTemplate.description || ''} onChange={e => setEditingTemplate(p => ({ ...p!, description: e.target.value }))} placeholder="Your first reward..." />
              </div>

              {/* Type + Segment */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs text-muted-foreground">Parcel Type</Label>
                  <Select value={editingTemplate.parcel_type} onValueChange={v => setEditingTemplate(p => ({ ...p!, parcel_type: v }))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {PARCEL_TYPES.map(t => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">Target Segment</Label>
                  <Select value={editingTemplate.target_segment} onValueChange={v => setEditingTemplate(p => ({ ...p!, target_segment: v }))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {TARGET_SEGMENTS.map(s => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {/* Unlock Condition + Threshold */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs text-muted-foreground">Unlock Condition</Label>
                  <Select value={editingTemplate.unlock_condition} onValueChange={v => setEditingTemplate(p => ({ ...p!, unlock_condition: v }))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {UNLOCK_CONDITIONS.map(c => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">Threshold</Label>
                  <Input type="number" value={editingTemplate.unlock_threshold || 0} onChange={e => setEditingTemplate(p => ({ ...p!, unlock_threshold: parseInt(e.target.value) || 0 }))} />
                </div>
              </div>

              {/* Reward Type + Amount */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs text-muted-foreground">Reward Type</Label>
                  <Select value={editingTemplate.reward_type} onValueChange={v => setEditingTemplate(p => ({ ...p!, reward_type: v }))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {REWARD_TYPES.map(r => <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">Reward Amount</Label>
                  <Input type="number" value={editingTemplate.reward_amount || 0} onChange={e => setEditingTemplate(p => ({ ...p!, reward_amount: parseInt(e.target.value) || 0 }))} />
                </div>
              </div>

              {/* Reward Label */}
              <div>
                <Label className="text-xs text-muted-foreground">Reward Label (display text)</Label>
                <Input value={editingTemplate.reward_label || ''} onChange={e => setEditingTemplate(p => ({ ...p!, reward_label: e.target.value }))} placeholder="50 Diamonds" />
              </div>

              {/* Timer config */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs text-muted-foreground">Expiry (hours)</Label>
                  <Input type="number" value={editingTemplate.expiry_hours || 0} onChange={e => setEditingTemplate(p => ({ ...p!, expiry_hours: parseInt(e.target.value) || 0 }))} />
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">Wait to unlock (hours)</Label>
                  <Input type="number" value={editingTemplate.unlock_wait_hours || 0} onChange={e => setEditingTemplate(p => ({ ...p!, unlock_wait_hours: parseInt(e.target.value) || 0 }))} />
                </div>
              </div>

              {/* Level range */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs text-muted-foreground">Min Level</Label>
                  <Input type="number" value={editingTemplate.min_level || 0} onChange={e => setEditingTemplate(p => ({ ...p!, min_level: parseInt(e.target.value) || 0 }))} />
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">Max Level</Label>
                  <Input type="number" value={editingTemplate.max_level || 999} onChange={e => setEditingTemplate(p => ({ ...p!, max_level: parseInt(e.target.value) || 999 }))} />
                </div>
              </div>

              {/* Glow Color + Display Order */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs text-muted-foreground">Glow Color</Label>
                  <div className="flex gap-2">
                    <input
                      type="color"
                      value={editingTemplate.glow_color || '#a855f7'}
                      onChange={e => setEditingTemplate(p => ({ ...p!, glow_color: e.target.value }))}
                      className="w-10 h-10 rounded-lg border-0 cursor-pointer"
                    />
                    <Input value={editingTemplate.glow_color || '#a855f7'} onChange={e => setEditingTemplate(p => ({ ...p!, glow_color: e.target.value }))} className="flex-1" />
                  </div>
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">Display Order</Label>
                  <Input type="number" value={editingTemplate.display_order || 0} onChange={e => setEditingTemplate(p => ({ ...p!, display_order: parseInt(e.target.value) || 0 }))} />
                </div>
              </div>

              {/* Active */}
              <div className="flex items-center justify-between py-2">
                <Label className="text-sm text-foreground">Active</Label>
                <Switch checked={editingTemplate.is_active ?? true} onCheckedChange={v => setEditingTemplate(p => ({ ...p!, is_active: v }))} />
              </div>

              {/* Save */}
              <Button onClick={handleSave} disabled={saving} variant="premium" size="lg" className="w-full">
                <Save className="w-4 h-4 mr-2" />
                {saving ? 'Saving...' : isNew ? 'Create Template' : 'Save Changes'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AdminParcelManagement;
