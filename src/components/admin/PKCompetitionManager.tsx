import { useState, useEffect, useCallback } from "react";
import { adminSupabase as supabase } from "@/integrations/supabase/adminClient";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Swords, Plus, Trash2, Save, Link2, Copy, Gift, Loader2, Calendar, Trophy, Settings, Eye, Zap, RefreshCw } from "lucide-react";

interface PKCompetition {
  id: string;
  title: string;
  description: string | null;
  banner_image_url: string | null;
  start_date: string;
  end_date: string;
  status: string;
  competition_type: string;
  max_participants: number;
  is_active: boolean;
  created_at: string;
}

interface PKRewardTier {
  id: string;
  competition_id: string;
  rank_from: number;
  rank_to: number;
  reward_diamonds: number;
  reward_beans: number;
  reward_badge: string | null;
  is_active: boolean;
}

const COMPETITION_TYPES = [
  { value: "gift_sending", label: "🎁 Gift Sending (Diamonds Spent)" },
  { value: "gift_receiving", label: "💝 Gift Receiving (Beans Earned)" },
  { value: "diamonds_spent", label: "💰 Total Diamonds Spent" },
  { value: "beans_earned", label: "Total Beans Earned" },
  { value: "custom", label: "⚡ Custom (Manual Score)" },
];

const STATUS_COLORS: Record<string, string> = {
  upcoming: "bg-blue-500/20 text-blue-400 border-blue-500/30",
  active: "bg-green-500/20 text-green-400 border-green-500/30",
  ended: "bg-gray-500/20 text-gray-400 border-gray-500/30",
  cancelled: "bg-red-500/20 text-red-400 border-red-500/30",
};

const PKCompetitionManager = () => {
  const [competitions, setCompetitions] = useState<PKCompetition[]>([]);
  const [loading, setLoading] = useState(false);
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [selectedComp, setSelectedComp] = useState<PKCompetition | null>(null);
  const [rewards, setRewards] = useState<PKRewardTier[]>([]);
  const [saving, setSaving] = useState(false);
  const [distributing, setDistributing] = useState<string | null>(null);

  // Create form
  const [formData, setFormData] = useState({
    title: "",
    description: "",
    banner_image_url: "",
    start_date: "",
    end_date: "",
    competition_type: "gift_receiving",
    max_participants: 50,
  });

  const fetchCompetitions = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase
      .from("pk_competitions")
      .select("*")
      .order("created_at", { ascending: false });
    setCompetitions((data as PKCompetition[]) || []);
    setLoading(false);
  }, []);

  const fetchRewards = useCallback(async (compId: string) => {
    const { data } = await supabase
      .from("pk_competition_rewards")
      .select("*")
      .eq("competition_id", compId)
      .order("rank_from");
    setRewards((data as PKRewardTier[]) || []);
  }, []);

  useEffect(() => {
    fetchCompetitions();
  }, [fetchCompetitions]);

  useEffect(() => {
    if (selectedComp) fetchRewards(selectedComp.id);
  }, [selectedComp, fetchRewards]);

  const createCompetition = async () => {
    if (!formData.title || !formData.start_date || !formData.end_date) {
      toast.error("Title, start date and end date are required");
      return;
    }
    setSaving(true);
    try {
      const { data, error } = await supabase
        .from("pk_competitions")
        .insert({
          title: formData.title,
          description: formData.description || null,
          banner_image_url: formData.banner_image_url || null,
          start_date: formData.start_date,
          end_date: formData.end_date,
          competition_type: formData.competition_type,
          max_participants: formData.max_participants,
          status: new Date(formData.start_date) <= new Date() ? "active" : "upcoming",
          is_active: true,
        })
        .select()
        .single();
      if (error) throw error;
      toast.success("PK Competition created!");
      setShowCreateDialog(false);
      setFormData({ title: "", description: "", banner_image_url: "", start_date: "", end_date: "", competition_type: "gift_receiving", max_participants: 50 });
      fetchCompetitions();
      if (data) setSelectedComp(data as PKCompetition);
    } catch (err: any) {
      toast.error(err.message || "Failed to create");
    } finally {
      setSaving(false);
    }
  };

  const generateRewardTiers = async (compId: string) => {
    try {
      const { error: deleteError } = await supabase.from("pk_competition_rewards").delete().eq("competition_id", compId);
      if (deleteError) throw deleteError;

      const tiers = [
        { from: 1, to: 1 }, { from: 2, to: 2 }, { from: 3, to: 3 },
        { from: 4, to: 5 }, { from: 6, to: 10 },
      ];
      const { error: insertError } = await supabase.from("pk_competition_rewards").insert(
        tiers.map((t) => ({
          competition_id: compId,
          rank_from: t.from,
          rank_to: t.to,
          reward_diamonds: 0,
          reward_beans: 0,
          is_active: true,
        }))
      );
      if (insertError) throw insertError;
      toast.success("Reward tiers created - set values now");
      fetchRewards(compId);
    } catch (err: any) {
      toast.error(err.message || "Failed to create reward tiers");
    }
  };

  const updateReward = async (rewardId: string, field: string, value: number) => {
    const { error } = await supabase
      .from("pk_competition_rewards")
      .update({ [field]: value })
      .eq("id", rewardId);
    if (error) toast.error("Update failed");
    else if (selectedComp) fetchRewards(selectedComp.id);
  };

  const deleteReward = async (rewardId: string) => {
    await supabase.from("pk_competition_rewards").delete().eq("id", rewardId);
    if (selectedComp) fetchRewards(selectedComp.id);
  };

  const addRewardTier = async () => {
    if (!selectedComp) return;
    const lastTier = rewards[rewards.length - 1];
    const newFrom = lastTier ? lastTier.rank_to + 1 : 1;
    const { error } = await supabase.from("pk_competition_rewards").insert({
      competition_id: selectedComp.id,
      rank_from: newFrom, rank_to: Math.min(newFrom + 4, 50),
      reward_diamonds: 0, reward_beans: 0, is_active: true,
    });
    if (error) {
      toast.error(error.message || "Failed to add reward tier");
      return;
    }
    fetchRewards(selectedComp.id);
  };

  const deleteCompetition = async (id: string) => {
    if (!confirm("Delete this PK competition?")) return;
    await supabase.from("pk_competitions").delete().eq("id", id);
    if (selectedComp?.id === id) setSelectedComp(null);
    fetchCompetitions();
    toast.success("Deleted");
  };

  const triggerDistribution = async (compId: string) => {
    setDistributing(compId);
    try {
      const { data, error } = await supabase.rpc("distribute_pk_rewards", { p_competition_id: compId });
      if (error) throw error;
      toast.success(`Distributed rewards to ${data || 0} winners!`);
      fetchCompetitions();
    } catch (err: any) {
      toast.error(err.message || "Distribution failed");
    } finally {
      setDistributing(null);
    }
  };

  const copyLink = (compId: string) => {
    const link = `/pk-leaderboard/${compId}`;
    navigator.clipboard.writeText(link);
    toast.success("Link copied! Use this in banner: " + link);
  };

  const getFullLink = (compId: string) => `/pk-leaderboard/${compId}`;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Swords className="w-5 h-5 text-red-400" />
          <h3 className="text-lg font-bold text-white">PK Competitions</h3>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={fetchCompetitions} disabled={loading}>
            <RefreshCw className={`w-4 h-4 mr-1 ${loading ? 'animate-spin' : ''}`} /> Refresh
          </Button>
          <Button size="sm" onClick={() => setShowCreateDialog(true)} className="bg-gradient-to-r from-red-500 to-pink-500">
            <Plus className="w-4 h-4 mr-1" /> Create PK
          </Button>
        </div>
      </div>

      {/* Competitions List */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {competitions.map((comp) => (
          <Card
            key={comp.id}
            className={`bg-white/5 border-white/10 cursor-pointer transition-all ${selectedComp?.id === comp.id ? 'ring-2 ring-red-500' : 'hover:border-white/20'}`}
            onClick={() => setSelectedComp(comp)}
          >
            <CardContent className="p-4">
              <div className="flex items-start justify-between mb-2">
                <div className="flex-1 min-w-0">
                  <h4 className="text-white font-semibold text-sm truncate">{comp.title}</h4>
                  <p className="text-white/40 text-xs truncate">{comp.description}</p>
                </div>
                <span className={`text-[10px] px-2 py-0.5 rounded-full border ${STATUS_COLORS[comp.status]}`}>
                  {comp.status}
                </span>
              </div>

              <div className="flex items-center gap-3 text-xs text-white/50 mb-3">
                <span className="flex items-center gap-1">
                  <Calendar className="w-3 h-3" />
                  {new Date(comp.start_date).toLocaleDateString()} - {new Date(comp.end_date).toLocaleDateString()}
                </span>
              </div>

              <div className="flex items-center gap-2">
                <Button
                  variant="outline" size="sm" className="text-xs h-7 gap-1"
                  onClick={(e) => { e.stopPropagation(); copyLink(comp.id); }}
                >
                  <Copy className="w-3 h-3" /> Copy Link
                </Button>
                <Button
                  variant="outline" size="sm" className="text-xs h-7 gap-1"
                  onClick={(e) => { e.stopPropagation(); window.open(getFullLink(comp.id), '_blank'); }}
                >
                  <Eye className="w-3 h-3" /> Preview
                </Button>
                {comp.status === 'active' && (
                  <Button
                    size="sm" className="text-xs h-7 gap-1 bg-amber-600 hover:bg-amber-700"
                    onClick={(e) => { e.stopPropagation(); triggerDistribution(comp.id); }}
                    disabled={distributing === comp.id}
                  >
                    {distributing === comp.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <Zap className="w-3 h-3" />}
                    Distribute
                  </Button>
                )}
                <Button
                  variant="destructive" size="sm" className="text-xs h-7 ml-auto"
                  onClick={(e) => { e.stopPropagation(); deleteCompetition(comp.id); }}
                >
                  <Trash2 className="w-3 h-3" />
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}

        {!loading && competitions.length === 0 && (
          <div className="col-span-2 text-center py-12 text-white/30">
            <Swords className="w-12 h-12 mx-auto mb-3 opacity-30" />
            <p>No PK competitions yet</p>
            <Button variant="link" onClick={() => setShowCreateDialog(true)} className="text-red-400">
              Create your first PK
            </Button>
          </div>
        )}
      </div>

      {/* Selected Competition - Reward Config */}
      {selectedComp && (
        <Card className="bg-white/5 border-white/10">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-white text-sm flex items-center gap-2">
                <Gift className="w-4 h-4 text-amber-400" />
                Rewards for: {selectedComp.title}
              </CardTitle>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" className="text-xs gap-1"
                  onClick={() => generateRewardTiers(selectedComp.id)}>
                  <Settings className="w-3 h-3" /> Generate Tiers
                </Button>
                <Button variant="outline" size="sm" className="text-xs gap-1" onClick={addRewardTier}>
                  <Plus className="w-3 h-3" /> Add Tier
                </Button>
              </div>
            </div>

            {/* Banner Link */}
            <div className="flex items-center gap-2 mt-3 p-2 bg-green-500/10 border border-green-500/30 rounded-lg">
              <Link2 className="w-4 h-4 text-green-400 flex-shrink-0" />
              <code className="text-green-300 text-xs flex-1 truncate">{getFullLink(selectedComp.id)}</code>
              <Button size="sm" variant="outline" className="text-xs h-7 gap-1 border-green-500/30 text-green-400"
                onClick={() => copyLink(selectedComp.id)}>
                <Copy className="w-3 h-3" /> Copy
              </Button>
            </div>
            <p className="text-white/40 text-[10px] mt-1">
              ☝️ Put this link in the banner's link_url field. Users will see the PK Leaderboard when they click the banner.
            </p>
          </CardHeader>

          <CardContent className="space-y-2">
            {rewards.map((reward) => (
              <PKRewardTierRow
                key={reward.id}
                reward={reward}
                onCommit={(field, value) => updateReward(reward.id, field, value)}
                onDelete={() => deleteReward(reward.id)}
              />
            ))}

            {rewards.length === 0 && (
              <div className="text-center py-6 text-white/30 text-sm">
                <Gift className="w-8 h-8 mx-auto mb-2 opacity-30" />
                <p>No reward tiers configured</p>
                <p className="text-xs">Click "Generate Tiers" to create default tiers</p>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Create Dialog */}
      <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Swords className="w-5 h-5 text-red-400" />
              Create PK Competition
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>Title *</Label>
              <Input value={formData.title} onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                placeholder="e.g., Valentine's Day PK Battle" />
            </div>

            <div className="space-y-2">
              <Label>Description</Label>
              <Input value={formData.description} onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                placeholder="Competition description..." />
            </div>

            <div className="space-y-2">
              <Label>Competition Type</Label>
              <Select value={formData.competition_type} onValueChange={(v) => setFormData({ ...formData, competition_type: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {COMPETITION_TYPES.map((t) => (
                    <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Start Date *</Label>
                <Input type="datetime-local" value={formData.start_date}
                  onChange={(e) => setFormData({ ...formData, start_date: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label>End Date *</Label>
                <Input type="datetime-local" value={formData.end_date}
                  onChange={(e) => setFormData({ ...formData, end_date: e.target.value })} />
              </div>
            </div>

            <div className="space-y-2">
              <Label>Banner Image URL (optional)</Label>
              <Input value={formData.banner_image_url} onChange={(e) => setFormData({ ...formData, banner_image_url: e.target.value })}
                placeholder="https://..." />
            </div>

            <div className="space-y-2">
              <Label>Max Participants</Label>
              <Input type="number" min={1} max={1000} value={formData.max_participants}
                onChange={(e) => setFormData({ ...formData, max_participants: Number(e.target.value) })} />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreateDialog(false)}>Cancel</Button>
            <Button onClick={createCompetition} disabled={saving}
              className="gap-2 bg-gradient-to-r from-red-500 to-pink-500">
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              Create & Configure Rewards
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

interface PKRewardTierRowProps {
  reward: PKRewardTier;
  onCommit: (field: string, value: number) => void;
  onDelete: () => void;
}

const PKRewardTierRow = ({ reward, onCommit, onDelete }: PKRewardTierRowProps) => {
  const [draft, setDraft] = useState({
    rank_from: String(reward.rank_from ?? 1),
    rank_to: String(reward.rank_to ?? 1),
    reward_beans: String(reward.reward_beans ?? 0),
    reward_diamonds: String(reward.reward_diamonds ?? 0),
  });

  useEffect(() => {
    setDraft({
      rank_from: String(reward.rank_from ?? 1),
      rank_to: String(reward.rank_to ?? 1),
      reward_beans: String(reward.reward_beans ?? 0),
      reward_diamonds: String(reward.reward_diamonds ?? 0),
    });
  }, [reward.id, reward.rank_from, reward.rank_to, reward.reward_beans, reward.reward_diamonds, reward.reward_diamonds]);

  const commit = (field: keyof typeof draft, min = 0) => {
    const raw = draft[field];
    const next = raw === "" ? min : Math.max(min, Number(raw));
    if (!Number.isFinite(next)) return;
    const current = Number((reward as any)[field] ?? min);
    if (next !== current) onCommit(field, next);
  };

  const numInput = (field: keyof typeof draft, className = "", min = 0, max?: number) => (
    <Input
      type="number"
      inputMode="numeric"
      min={min}
      max={max}
      value={draft[field]}
      onChange={(e) => setDraft((d) => ({ ...d, [field]: e.target.value }))}
      onBlur={() => commit(field, min)}
      onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
      className={`text-xs bg-white/5 border-white/10 text-white h-8 ${className}`}
    />
  );

  return (
    <div className="grid grid-cols-6 gap-2 items-center bg-white/5 rounded-lg p-2">
      <div className="col-span-1">
        <Label className="text-white/50 text-[10px]">Rank</Label>
        <div className="flex items-center gap-1">
          {numInput("rank_from", "w-14", 1, 50)}
          <span className="text-white/40">-</span>
          {numInput("rank_to", "w-14", 1, 50)}
        </div>
      </div>
      <div>
        <Label className="text-white/50 text-[10px]">Beans</Label>
        {numInput("reward_beans")}
      </div>
      <div>
        <Label className="text-white/50 text-[10px]">Diamonds 💎</Label>
        {numInput("reward_diamonds")}
      </div>
      <div>
        <Label className="text-white/50 text-[10px]">Diamonds (legacy)</Label>
        {numInput("reward_diamonds")}
      </div>
      <div className="col-span-1 flex items-end justify-end">
        <Button variant="destructive" size="sm" onClick={onDelete}>
          <Trash2 className="w-3 h-3" />
        </Button>
      </div>
    </div>
  );
};

export default PKCompetitionManager;
