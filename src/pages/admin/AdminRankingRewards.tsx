import { useState, useEffect } from "react";
import useAdminRealtime from "@/hooks/useAdminRealtime";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, Save, Plus, Trash2, RefreshCw, Trophy, Gift, Gem, Users, Gamepad2, Building2, Edit2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { adminSupabase as supabase } from "@/integrations/supabase/adminClient";
import { toast } from "sonner";
import { adminStyles } from "@/styles/adminStyles";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { recordAdminError } from "@/utils/adminErrorLog";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";

import { formatAdminError } from "@/utils/formatAdminError";
interface RankingReward {
  id: string;
  ranking_type: string;
  period_type: string;
  rank_position: number;
  reward_diamonds: number;
  reward_badge: string | null;
  min_income_requirement: number;
  created_at: string;
}

// Category → list of ranking_type prefixes present in DB
const rankingCategories: { id: string; label: string; icon: any; subtypes: string[] }[] = [
  { id: 'agency', label: 'Agency', icon: Building2, subtypes: ['agency_performance'] },
  {
    id: 'host',
    label: 'Host',
    icon: Users,
    subtypes: ['host_earnings', 'host_duration', 'golden_host', 'golden_host_income', 'new_host', 'top_gifters', 'pk_reward'],
  },
  { id: 'game', label: 'Game', icon: Gamepad2, subtypes: ['game_winners'] },
];

// Period suffix appended to ranking_type in DB
const periodTypes = [
  { id: 'daily', label: 'Daily' },
  { id: 'weekly', label: 'Weekly' },
  { id: 'monthly', label: 'Monthly' },
];

const AdminRankingRewards = () => {
  const navigate = useNavigate();
  const [rewards, setRewards] = useState<RankingReward[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [activeCategory, setActiveCategory] = useState('agency');
  const [activePeriod, setActivePeriod] = useState('weekly');
  const [activeSubtype, setActiveSubtype] = useState('agency_performance');
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [editingReward, setEditingReward] = useState<RankingReward | null>(null);

  // Form state for adding/editing
  const [formData, setFormData] = useState({
    rank_position: 1,
    reward_diamonds: 10000,
    reward_badge: '',
    min_income_requirement: 0,
  });

  useEffect(() => {
    const cat = rankingCategories.find(c => c.id === activeCategory);
    if (cat && !cat.subtypes.includes(activeSubtype)) {
      setActiveSubtype(cat.subtypes[0]);
    }
  }, [activeCategory]);

  const fetchRewards = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('ranking_rewards')
        .select('*')
        .order('ranking_type', { ascending: true })
        .order('period_type', { ascending: true })
        .order('rank_position', { ascending: true });

      if (error) throw error;
      setRewards(data || []);
    } catch (err) {
      console.error('Error fetching rewards:', err);
      recordAdminError({ kind: "rpc", label: "AdminRankingRewards.fetchRewards", message: formatAdminError(err) });
      toast.error('Failed to load rewards');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchRewards(); }, []);
  useAdminRealtime(['ranking_rewards'], () => fetchRewards());

  // ranking_type in DB is `${subtype}_${period}` (e.g. agency_performance_weekly).
  // We also keep back-compat: some rows may still store period_type separately.
  const fullRankingType = `${activeSubtype}_${activePeriod}`;
  const filteredRewards = rewards.filter(r => r.ranking_type === fullRankingType);

  const handleAddReward = async () => {
    setSaving(true);
    try {
      const { error } = await supabase
        .from('ranking_rewards')
        .insert({
          ranking_type: fullRankingType,
          period_type: activePeriod,
          rank_position: formData.rank_position,
          reward_diamonds: formData.reward_diamonds,
          reward_badge: formData.reward_badge || null,
          min_income_requirement: formData.min_income_requirement,
        });

      if (error) throw error;
      
      toast.success('Reward added successfully');
      setShowAddDialog(false);
      resetForm();
    } catch (err: any) {
      console.error('Error adding reward:', err);
      recordAdminError({ kind: "rpc", label: "AdminRankingRewards.handleAddReward", message: formatAdminError(err) });
      toast.error(err.message || 'Failed to add reward');
    } finally {
      setSaving(false);
    }
  };

  const handleUpdateReward = async () => {
    if (!editingReward) return;
    
    setSaving(true);
    try {
      const { error } = await supabase
        .from('ranking_rewards')
        .update({
          reward_diamonds: formData.reward_diamonds,
          reward_badge: formData.reward_badge || null,
          min_income_requirement: formData.min_income_requirement,
        })
        .eq('id', editingReward.id);

      if (error) throw error;
      
      toast.success('Reward updated successfully');
      setEditingReward(null);
      resetForm();
    } catch (err: any) {
      console.error('Error updating reward:', err);
      recordAdminError({ kind: "rpc", label: "AdminRankingRewards.handleUpdateReward", message: formatAdminError(err) });
      toast.error(err.message || 'Failed to update reward');
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteReward = async (id: string) => {
    if (!confirm('Are you sure you want to delete this reward?')) return;
    
    try {
      const { error } = await supabase
        .from('ranking_rewards')
        .delete()
        .eq('id', id);

      if (error) throw error;
      toast.success('Reward deleted');
    } catch (err) {
      console.error('Error deleting reward:', err);
      recordAdminError({ kind: "rpc", label: "AdminRankingRewards.handleDeleteReward", message: formatAdminError(err) });
      toast.error('Failed to delete reward');
    }
  };

  const openEditDialog = (reward: RankingReward) => {
    setFormData({
      rank_position: reward.rank_position,
      reward_diamonds: reward.reward_diamonds,
      reward_badge: reward.reward_badge || '',
      min_income_requirement: reward.min_income_requirement,
    });
    setEditingReward(reward);
  };

  const resetForm = () => {
    setFormData({
      rank_position: filteredRewards.length + 1,
      reward_diamonds: 10000,
      reward_badge: '',
      min_income_requirement: 0,
    });
  };

  const formatNumber = (num: number): string => {
    if (num >= 1000000) return `${(num / 1000000).toFixed(1)}M`;
    if (num >= 1000) return `${(num / 1000).toFixed(1)}K`;
    return num.toString();
  };

  const getPositionBadge = (position: number) => {
    switch (position) {
      case 1: return '🥇';
      case 2: return '🥈';
      case 3: return '🥉';
      default: return `#${position}`;
    }
  };

  return (
    <div className="admin-pro-shell min-h-screen">
      {/* Header */}
      <div className={adminStyles.header}>
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <div>
            <h1 className="text-xl font-bold text-foreground flex items-center gap-2">
              <Trophy className="w-5 h-5 text-yellow-500" />
              Ranking Rewards
            </h1>
            <p className="text-xs text-muted-foreground">Manage rewards for all ranking types</p>
          </div>
        </div>
        <Button variant="ghost" size="icon" onClick={fetchRewards} disabled={loading}>
          <RefreshCw className={`w-5 h-5 ${loading ? 'animate-spin' : ''}`} />
        </Button>
      </div>

      <div className="p-4 space-y-4 max-w-2xl mx-auto">
        {/* Category Tabs */}
        <Tabs value={activeCategory} onValueChange={setActiveCategory}>
          <TabsList className="w-full grid grid-cols-3 bg-card border border-border">
            {rankingCategories.map((type) => (
              <TabsTrigger
                key={type.id}
                value={type.id}
                className="flex items-center gap-1.5 text-xs data-[state=active]:bg-primary data-[state=active]:text-primary-foreground"
              >
                <type.icon className="w-4 h-4" />
                <span>{type.label}</span>
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>

        {/* Subtype selector (only when category has multiple subtypes) */}
        {(() => {
          const cat = rankingCategories.find(c => c.id === activeCategory);
          if (!cat || cat.subtypes.length <= 1) return null;
          return (
            <Select value={activeSubtype} onValueChange={setActiveSubtype}>
              <SelectTrigger className="bg-card">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {cat.subtypes.map(s => (
                  <SelectItem key={s} value={s}>
                    {s.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          );
        })()}

        {/* Period Tabs */}
        <div className="flex gap-2">
          {periodTypes.map((period) => (
            <Button
              key={period.id}
              variant={activePeriod === period.id ? 'default' : 'outline'}
              size="sm"
              onClick={() => setActivePeriod(period.id)}
              className="flex-1"
            >
              {period.id === 'daily' ? '🗓️' : period.id === 'weekly' ? '📅' : '📆'} {period.label}
            </Button>
          ))}
        </div>

        {/* Rewards List */}
        <Card className={adminStyles.card}>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <Gift className="w-4 h-4 text-yellow-500" />
              {rankingCategories.find(t => t.id === activeCategory)?.label} · {activeSubtype.replace(/_/g, ' ')} · {activePeriod}
            </CardTitle>
            <Button
              size="sm"
              onClick={() => {
                resetForm();
                setShowAddDialog(true);
              }}
              className="gap-1"
            >
              <Plus className="w-4 h-4" />
              Add
            </Button>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="flex items-center justify-center py-8">
                <RefreshCw className="w-6 h-6 animate-spin text-muted-foreground" />
              </div>
            ) : filteredRewards.length === 0 ? (
              <div className="text-center py-8">
                <Gift className="w-12 h-12 mx-auto text-muted-foreground/30 mb-2" />
                <p className="text-muted-foreground text-sm">No rewards configured</p>
                <Button
                  variant="link"
                  size="sm"
                  onClick={() => {
                    resetForm();
                    setShowAddDialog(true);
                  }}
                >
                  Add your first reward
                </Button>
              </div>
            ) : (
              <div className="space-y-2">
                {filteredRewards.map((reward) => (
                  <div
                    key={reward.id}
                    className="flex items-center gap-3 p-3 rounded-lg border bg-card border-border"
                  >
                    <div className="w-10 h-10 flex items-center justify-center bg-primary/10 rounded-full text-lg">
                      {getPositionBadge(reward.rank_position)}
                    </div>
                    
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <Gem className="w-4 h-4 text-cyan-400" />
                        <span className="font-bold text-foreground">
                          {formatNumber(reward.reward_diamonds)}
                        </span>
                      </div>
                      {reward.reward_badge && (
                        <p className="text-xs text-muted-foreground truncate">
                          {reward.reward_badge}
                        </p>
                      )}
                      {reward.min_income_requirement > 0 && (
                        <p className="text-[10px] text-muted-foreground">
                          Min: {formatNumber(reward.min_income_requirement)}
                        </p>
                      )}
                    </div>

                    <div className="flex items-center gap-2">
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => openEditDialog(reward)}
                        className="h-8 w-8"
                      >
                        <Edit2 className="w-4 h-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handleDeleteReward(reward.id)}
                        className="h-8 w-8 text-destructive hover:text-destructive"
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Info Card */}
        <Card className="bg-blue-500/10 border-blue-500/30">
          <CardContent className="p-4">
            <h3 className="font-semibold text-foreground mb-2 flex items-center gap-2">
              <Trophy className="w-4 h-4 text-blue-400" />
              How It Works
            </h3>
            <ul className="text-xs text-muted-foreground space-y-1">
              <li>• Rewards are distributed automatically at the end of each period</li>
              <li>• Weekly rewards reset every Sunday at 23:59</li>
              <li>• Monthly rewards reset on the last day of each month</li>
              <li>• Configure rewards for Agency, Host Earning, and Game rankings</li>
            </ul>
          </CardContent>
        </Card>
      </div>

      {/* Add/Edit Dialog */}
      <Dialog open={showAddDialog || !!editingReward} onOpenChange={(open) => {
        if (!open) {
          setShowAddDialog(false);
          setEditingReward(null);
          resetForm();
        }
      }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Gift className="w-5 h-5 text-yellow-500" />
              {editingReward ? 'Edit Reward' : 'Add New Reward'}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-4">
            {!editingReward && (
              <div className="space-y-2">
                <Label>Position</Label>
                <Select
                  value={formData.rank_position.toString()}
                  onValueChange={(v) => setFormData({ ...formData, rank_position: parseInt(v) })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((pos) => (
                      <SelectItem key={pos} value={pos.toString()}>
                        {getPositionBadge(pos)} Position {pos}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            <div className="space-y-2">
              <Label>Reward Diamonds</Label>
              <Input
                type="number"
                value={formData.reward_diamonds}
                onChange={(e) => setFormData({ ...formData, reward_diamonds: parseInt(e.target.value) || 0 })}
                placeholder="10000"
              />
            </div>

            <div className="space-y-2">
              <Label>Reward Badge (Optional)</Label>
              <Input
                value={formData.reward_badge}
                onChange={(e) => setFormData({ ...formData, reward_badge: e.target.value })}
                placeholder="e.g., 🏆 Champion Badge"
              />
            </div>

            <div className="space-y-2">
              <Label>Min Income Requirement</Label>
              <Input
                type="number"
                value={formData.min_income_requirement}
                onChange={(e) => setFormData({ ...formData, min_income_requirement: parseInt(e.target.value) || 0 })}
                placeholder="0"
              />
              <p className="text-xs text-muted-foreground">Minimum income required to qualify for this reward</p>
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setShowAddDialog(false);
                setEditingReward(null);
                resetForm();
              }}
            >
              Cancel
            </Button>
            <Button
              onClick={editingReward ? handleUpdateReward : handleAddReward}
              disabled={saving}
              className="gap-2"
            >
              {saving ? (
                <RefreshCw className="w-4 h-4 animate-spin" />
              ) : (
                <Save className="w-4 h-4" />
              )}
              {editingReward ? 'Update' : 'Add'} Reward
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default AdminRankingRewards;
