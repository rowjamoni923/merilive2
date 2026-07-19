import { useState, useEffect } from "react";
import useAdminRealtime from "@/hooks/useAdminRealtime";
import { adminSupabase as supabase } from "@/integrations/supabase/adminClient";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Label } from "@/components/ui/label";
import { SmartImage } from "@/components/ui/smart-image";
import { 
  Trophy, Upload, Trash2, Save, Crown, Medal, Award, RefreshCw, 
  Gift, Image, Loader2, Zap, Plus, Settings
} from "lucide-react";
import { cn } from "@/lib/utils";
import PKCompetitionManager from "@/components/admin/PKCompetitionManager";
import { loadAppSettingsByPrefix, saveAppSetting } from "@/utils/adminSettingsStorage";
import { AnimationUploader, type AnimationFormat } from "@/components/admin/AnimationUploader";

interface PodiumFrame {
  id: string;
  rank_position: number;
  category: string;
  frame_url: string;
  frame_type: string;
  name: string;
  is_active: boolean;
}

interface RewardConfig {
  id: string;
  category: string;
  period_type: string;
  rank_from: number;
  rank_to: number;
  reward_diamonds: number;
  reward_diamonds: number;
  reward_beans: number;
  is_active: boolean;
}

const CATEGORIES = [
  { value: "host_earnings", label: "Host Earning" },
  { value: "game_winners", label: "Game Ranking" },
  { value: "top_gifters", label: "Top Gifter" },
  { value: "agency_performance", label: "Agency" },
];

const PERIODS = [
  { value: "daily", label: "Daily" },
  { value: "weekly", label: "Weekly" },
  { value: "monthly", label: "Monthly" },
];

const RANK_ICONS = {
  1: <Crown className="w-5 h-5 text-yellow-400" />,
  2: <Medal className="w-5 h-5 text-gray-300" />,
  3: <Award className="w-5 h-5 text-orange-400" />,
};

const AdminLeaderboardManagement = () => {
  const [activeTab, setActiveTab] = useState("icons");
  const [frames, setFrames] = useState<PodiumFrame[]>([]);
  const [rewards, setRewards] = useState<RewardConfig[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState("host_earnings");
  const [selectedPeriod, setSelectedPeriod] = useState("weekly");
  const [uploading, setUploading] = useState<number | null>(null);
  const [distributing, setDistributing] = useState(false);
  const [iconUrls, setIconUrls] = useState<Record<string, string>>({});
  const [iconUploading, setIconUploading] = useState<string | null>(null);
  const [savingIcons, setSavingIcons] = useState(false);

  useEffect(() => {
    fetchLeaderboardData();
  }, [selectedCategory, selectedPeriod]);

  useAdminRealtime(['app_settings', 'leaderboard_podium_frames', 'leaderboard_reward_config'], () => {
    fetchIconSettings();
    fetchLeaderboardData();
  });

  const fetchIconSettings = async () => {
    const data = await loadAppSettingsByPrefix<string>("leaderboard_");

    if (data.length > 0) {
      const icons: Record<string, string> = {};
      data.forEach((s: any) => {
        if (!s.setting_key.endsWith('_icon')) return;
        icons[s.setting_key] = typeof s.parsed_value === 'string'
          ? s.parsed_value
          : String(s.parsed_value || '');
      });
      setIconUrls(icons);
    }
  };

  const fetchLeaderboardData = async () => {
    setLoading(true);
    try {
      const [framesRes, rewardsRes] = await Promise.all([
        supabase
          .from("leaderboard_podium_frames")
          .select("*")
          .eq("category", selectedCategory)
          .order("rank_position"),
        supabase
          .from("leaderboard_reward_config")
          .select("*")
          .eq("category", selectedCategory)
          .eq("period_type", selectedPeriod)
          .order("rank_from"),
      ]);

      if (framesRes.error) throw framesRes.error;
      if (rewardsRes.error) throw rewardsRes.error;
      setFrames((framesRes.data as PodiumFrame[]) || []);
      setRewards((rewardsRes.data as RewardConfig[]) || []);
    } catch (err: any) {
      toast.error(err.message || "Failed to load leaderboard setup");
    } finally {
      setLoading(false);
    }
  };

  const fetchFrames = async () => fetchLeaderboardData();
  const fetchRewards = async () => fetchLeaderboardData();

  // === ICON MANAGEMENT ===
  const handleIconUpload = async (settingKey: string, file: File) => {
    setIconUploading(settingKey);
    try {
      const ext = file.name.split(".").pop()?.toLowerCase() || "png";
      const fileName = `leaderboard/icons/${settingKey}-${Date.now()}.${ext}`;
      const { error: uploadError } = await supabase.storage.from("assets").upload(fileName, file, { upsert: true });
      if (uploadError) throw uploadError;

      const { data: urlData } = supabase.storage.from("assets").getPublicUrl(fileName);
      setIconUrls(prev => ({ ...prev, [settingKey]: urlData.publicUrl }));
      toast.success("Icon uploaded!");
    } catch (err: any) {
      toast.error(err.message || "Upload failed");
    } finally {
      setIconUploading(null);
    }
  };

  const saveIconSettings = async () => {
    setSavingIcons(true);
    try {
      for (const [key, value] of Object.entries(iconUrls)) {
        if (value) {
          await saveAppSetting(key, value, `Leaderboard icon: ${key}`);
        }
      }
      toast.success("All icons saved!");
    } catch (err: any) {
      toast.error("Save failed");
    } finally {
      setSavingIcons(false);
    }
  };

  // === FRAME MANAGEMENT ===
  const handleFrameUpload = async (rankPosition: number, file: File) => {
    setUploading(rankPosition);
    try {
      const ext = file.name.split(".").pop()?.toLowerCase() || "png";
      const fileName = `leaderboard/podium-rank${rankPosition}-${selectedCategory}-${Date.now()}.${ext}`;
      const { error: uploadError } = await supabase.storage.from("assets").upload(fileName, file, { upsert: true });
      if (uploadError) throw uploadError;

      const { data: urlData } = supabase.storage.from("assets").getPublicUrl(fileName);
      let frameType = "static";
      if (ext === "svga") frameType = "svga";
      else if (ext === "gif") frameType = "gif";
      else if (ext === "json") frameType = "lottie";
      else if (ext === "webp") frameType = "webp";

      const { error } = await supabase
        .from("leaderboard_podium_frames")
        .upsert({
          rank_position: rankPosition,
          category: selectedCategory,
          frame_url: urlData.publicUrl,
          frame_type: frameType,
          name: `Rank ${rankPosition} Frame`,
          is_active: true,
        }, { onConflict: "rank_position,category" });

      if (error) throw error;
      toast.success(`Rank #${rankPosition} frame uploaded!`);
      fetchFrames();
    } catch (err: any) {
      toast.error(err.message || "Upload failed");
    } finally {
      setUploading(null);
    }
  };

  const handleFrameUrlSave = async (rankPosition: number, url: string, frameType: string) => {
    try {
      const { error } = await supabase
        .from("leaderboard_podium_frames")
        .upsert({
          rank_position: rankPosition,
          category: selectedCategory,
          frame_url: url,
          frame_type: frameType,
          name: `Rank ${rankPosition} Frame`,
          is_active: true,
        }, { onConflict: "rank_position,category" });
      if (error) throw error;
      toast.success(`Rank #${rankPosition} frame saved!`);
      fetchFrames();
    } catch (err: any) {
      toast.error(err.message || "Save failed");
    }
  };

  const deleteFrame = async (frameId: string) => {
    const { error } = await supabase.from("leaderboard_podium_frames").delete().eq("id", frameId);
    if (error) toast.error("Delete failed");
    else { toast.success("Frame deleted"); fetchFrames(); }
  };

  // === REWARD MANAGEMENT ===
  const updateReward = async (rewardId: string, field: string, value: number) => {
    const { error } = await supabase
      .from("leaderboard_reward_config")
      .update({ [field]: value })
      .eq("id", rewardId);
    if (error) toast.error("Update failed");
    else fetchRewards();
  };

  const addRewardTier = async () => {
    const lastTier = rewards[rewards.length - 1];
    const newFrom = lastTier ? lastTier.rank_to + 1 : 1;
    const newTo = Math.min(newFrom, 50);

    const { error } = await supabase.from("leaderboard_reward_config").insert({
      leaderboard_type: selectedCategory,
      category: selectedCategory,
      period_type: selectedPeriod,
      rank_from: newFrom,
      rank_to: newTo,
      rank_position: newFrom,
      reward_diamonds: 0,
      reward_diamonds: 0,
      reward_beans: 0,
      reward_amount: 0,
      reward_type: 'diamonds',
      is_active: true,
    });

    if (error) toast.error(error.message);
    else { toast.success("New reward tier added"); fetchRewards(); }
  };

  const deleteReward = async (rewardId: string) => {
    const { error } = await supabase.from("leaderboard_reward_config").delete().eq("id", rewardId);
    if (error) toast.error("Delete failed");
    else { toast.success("Reward tier deleted"); fetchRewards(); }
  };

  // === MANUAL DISTRIBUTION ===
  const triggerDistribution = async () => {
    setDistributing(true);
    try {
      const { data, error } = await supabase.functions.invoke('distribute-leaderboard-rewards', {
        body: {
          category: selectedCategory,
          period_type: selectedPeriod,
        }
      });
      if (error) throw error;
      toast.success(`Distribution complete: ${JSON.stringify(data?.results || data)}`);
    } catch (err: any) {
      toast.error(err.message || "Distribution failed");
    } finally {
      setDistributing(false);
    }
  };

  const triggerAllDistribution = async () => {
    setDistributing(true);
    try {
      const { data, error } = await supabase.functions.invoke('distribute-leaderboard-rewards', {
        body: { force_all: true }
      });
      if (error) throw error;
      toast.success(`Auto-distribution: ${JSON.stringify(data?.results || data)}`);
    } catch (err: any) {
      toast.error(err.message || "Distribution failed");
    } finally {
      setDistributing(false);
    }
  };

  // Icon config entries
  const iconEntries = [
    { key: "leaderboard_host_earning_icon", label: "Host Earning Tab Icon", emoji: "✨" },
    { key: "leaderboard_game_ranking_icon", label: "Game Ranking Tab Icon", emoji: "🎮" },
    { key: "leaderboard_header_icon", label: "Leaderboard Header Icon", emoji: "🏆" },
    { key: "leaderboard_reward_icon", label: "Reward Badge Icon", emoji: "🎁" },
  ];

  return (
    <div className="admin-pro-shell space-y-6 p-4 md:p-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Trophy className="w-6 h-6 text-amber-400" />
          <div>
            <h2 className="text-xl font-bold text-slate-900">Leaderboard Management</h2>
            <p className="text-slate-500 text-sm">Icons, podium frames, rewards & auto-distribution</p>
          </div>
        </div>
        <div className="flex gap-2">
          <Button 
            variant="outline" size="sm" 
            onClick={() => { fetchLeaderboardData(); fetchIconSettings(); }}
            disabled={loading}
          >
            <RefreshCw className={cn("w-4 h-4 mr-1", loading && "animate-spin")} /> Refresh
          </Button>
        </div>
      </div>

      {/* Category Selector */}
      <div className="flex gap-2 flex-wrap">
        {CATEGORIES.map(cat => (
          <Button
            key={cat.value}
            variant={selectedCategory === cat.value ? "default" : "outline"}
            size="sm"
            onClick={() => setSelectedCategory(cat.value)}
            className={cn(
              selectedCategory === cat.value && "bg-gradient-to-r from-amber-500 to-orange-500"
            )}
          >
            {cat.label}
          </Button>
        ))}
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="bg-slate-50 flex-wrap">
          <TabsTrigger value="icons">🎨 Tab Icons</TabsTrigger>
          <TabsTrigger value="podium-frames">🏅 Podium Frames</TabsTrigger>
          <TabsTrigger value="rewards">🎁 Reward Config</TabsTrigger>
          <TabsTrigger value="distribution">⚡ Auto Distribution</TabsTrigger>
          <TabsTrigger value="pk">⚔️ PK Competition</TabsTrigger>
        </TabsList>

        {/* ===== ICONS TAB ===== */}
        <TabsContent value="icons" className="space-y-4">
          <p className="text-slate-600 text-sm">
            Upload custom icons for leaderboard tabs. These icons will replace the default Lucide icons on the leaderboard page.
          </p>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {iconEntries.map(entry => (
              <Card key={entry.key} className="bg-white border-slate-200 shadow-sm">
                <CardHeader className="pb-2">
                  <CardTitle className="flex items-center gap-2 text-slate-900 text-sm">
                    <span className="text-lg">{entry.emoji}</span>
                    {entry.label}
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  {/* Preview */}
                  <div className="w-16 h-16 mx-auto bg-slate-100 rounded-lg border border-slate-200 flex items-center justify-center overflow-hidden">
                    {iconUrls[entry.key] ? (
                      <SmartImage
                        src={iconUrls[entry.key].replace(/^"|"$/g, '')}
                        alt={entry.label}
                        className="w-12 h-12 object-contain"
                        onError={(e) => { e.currentTarget.style.display = 'none'; }}
                      />
                    ) : (
                      <Image className="w-6 h-6 text-slate-300" />
                    )}
                  </div>

                  {/* URL Input */}
                  <Input
                    placeholder="https://icon-url..."
                    value={(iconUrls[entry.key] || '').replace(/^"|"$/g, '')}
                    onChange={(e) => setIconUrls(prev => ({ ...prev, [entry.key]: e.target.value }))}
                    className="text-xs bg-white border-slate-200 shadow-sm text-slate-900"
                  />

                  {/* Upload */}
                  <label>
                    <input
                      type="file"
                      accept=".png,.jpg,.jpeg,.webp,.svg,.gif"
                      className="hidden"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) handleIconUpload(entry.key, file);
                      }}
                    />
                    <Button
                      variant="outline" size="sm" className="w-full text-xs" asChild
                      disabled={iconUploading === entry.key}
                    >
                      <span>
                        {iconUploading === entry.key ? (
                          <Loader2 className="w-3 h-3 mr-1 animate-spin" />
                        ) : (
                          <Upload className="w-3 h-3 mr-1" />
                        )}
                        Upload Icon
                      </span>
                    </Button>
                  </label>
                </CardContent>
              </Card>
            ))}
          </div>

          <Button 
            onClick={saveIconSettings} 
            disabled={savingIcons}
            className="w-full bg-gradient-to-r from-green-500 to-emerald-600"
          >
            {savingIcons ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
            Save All Icons
          </Button>
        </TabsContent>

        {/* ===== PODIUM FRAMES TAB ===== */}
        <TabsContent value="podium-frames" className="space-y-4">
          <p className="text-slate-600 text-sm">
            Pkg425 — Professional uploader: SVGA / VAP / PAG / Lottie / WebP / GIF / PNG / MP4. Plays at the designer's exact authored duration.
          </p>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {[1, 2, 3].map(rank => {
              const frame = frames.find(f => f.rank_position === rank);
              const currentFormat = (frame?.frame_type as AnimationFormat) || null;
              return (
                <Card key={rank} className="bg-white border-slate-200 shadow-sm">
                  <CardHeader className="pb-2">
                    <CardTitle className="flex items-center gap-2 text-slate-900 text-sm">
                      {RANK_ICONS[rank as keyof typeof RANK_ICONS]}
                      Rank #{rank} Frame
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <AnimationUploader
                      label={`Rank #${rank} podium frame`}
                      bucket="assets"
                      folder={`leaderboard/${selectedCategory}/rank${rank}`}
                      value={{
                        animation_url: frame?.frame_url || "",
                        animation_format: currentFormat,
                        animation_config_url: null,
                      }}
                      onChange={(v) => {
                        if (v.animation_url) {
                          handleFrameUrlSave(rank, v.animation_url, v.animation_format || "static");
                        }
                      }}
                    />

                    {frame && (
                      <div className="flex items-center justify-between gap-2 pt-1">
                        <p className="text-[10px] text-slate-500">
                          {frame.frame_type.toUpperCase()} · {frame.is_active ? "Active" : "Inactive"}
                        </p>
                        <Button variant="destructive" size="sm" onClick={() => deleteFrame(frame.id)}>
                          <Trash2 className="w-3 h-3 mr-1" />
                          Delete
                        </Button>
                      </div>
                    )}
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </TabsContent>


        {/* ===== REWARDS TAB ===== */}
        <TabsContent value="rewards" className="space-y-4">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div className="flex items-center gap-3">
              <Label className="text-slate-700 text-sm">Period:</Label>
              <div className="flex gap-2">
                {PERIODS.map(p => (
                  <Button
                    key={p.value}
                    variant={selectedPeriod === p.value ? "default" : "outline"}
                    size="sm"
                    onClick={() => setSelectedPeriod(p.value)}
                  >
                    {p.label}
                  </Button>
                ))}
              </div>
            </div>
            <p className="text-slate-500 text-xs">
              Set rewards for ranks 1-50. Only configured tiers will receive rewards.
            </p>
          </div>

          {/* Quick-fill buttons */}
          <div className="flex gap-2 flex-wrap">
            <Button
              variant="outline" size="sm"
              onClick={async () => {
                // Delete all current rewards for this category/period
                await supabase.from("leaderboard_reward_config")
                  .delete()
                  .eq("category", selectedCategory)
                  .eq("period_type", selectedPeriod);
                
                // Add individual ranks 1-10, then grouped tiers
                const tiers = [
                  { from: 1, to: 1 }, { from: 2, to: 2 }, { from: 3, to: 3 },
                  { from: 4, to: 5 }, { from: 6, to: 10 }, { from: 11, to: 20 },
                  { from: 21, to: 30 }, { from: 31, to: 50 },
                ];
                for (const t of tiers) {
                  await supabase.from("leaderboard_reward_config").insert({
                    leaderboard_type: selectedCategory,
                    category: selectedCategory, period_type: selectedPeriod,
                    rank_from: t.from, rank_to: t.to, rank_position: t.from,
                    reward_diamonds: 0, reward_diamonds: 0, reward_beans: 0,
                    reward_amount: 0, reward_type: 'diamonds', is_active: true,
                  });
                }
                toast.success("Reward tiers created (set values manually)");
                fetchRewards();
              }}
              className="text-xs"
            >
              <Settings className="w-3 h-3 mr-1" /> Generate Empty Tiers (1-50)
            </Button>
          </div>

          {/* Agency Reward Note */}
          {selectedCategory === "agency_performance" && (
            <Card className="bg-gradient-to-r from-green-500/10 to-emerald-500/10 border-green-500/20">
              <CardContent className="p-3 flex items-start gap-3">
                <span className="text-xl">💰</span>
                <div className="text-sm text-green-200">
                  <p className="font-semibold">Agency Reward: Beans Only</p>
                  <p className="text-xs text-green-300/70 mt-1">
                    Agencies receive Beans as leaderboard rewards. They can convert Beans → Diamonds from their Agency Dashboard.
                  </p>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Reward Tiers */}
          <div className="space-y-2">
            {rewards.map((reward) => (
              <RewardTierRow
                key={reward.id}
                reward={reward}
                isAgency={selectedCategory === "agency_performance"}
                onCommit={(field, value) => updateReward(reward.id, field, value)}
                onDelete={() => deleteReward(reward.id)}
              />
            ))}


            {rewards.length === 0 && (
              <div className="text-center py-8 text-slate-400">
                <Gift className="w-10 h-10 mx-auto mb-2 opacity-30" />
                <p>No reward tiers configured for this category & period.</p>
                <p className="text-xs mt-1">Click "Generate Empty Tiers" above or add tiers manually.</p>
              </div>
            )}

            <Button onClick={addRewardTier} variant="outline" className="w-full">
              <Plus className="w-4 h-4 mr-1" /> Add Reward Tier
            </Button>
          </div>
        </TabsContent>

        {/* ===== DISTRIBUTION TAB ===== */}
        <TabsContent value="distribution" className="space-y-4">
          <Card className="bg-white border-slate-200 shadow-sm">
            <CardHeader>
              <CardTitle className="text-slate-900 text-sm flex items-center gap-2">
                <Zap className="w-5 h-5 text-amber-400" />
                Automatic Reward Distribution
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="text-slate-600 text-sm space-y-2">
                <p>✅ <strong>pg_cron</strong> is configured to run every hour.</p>
                <p>⏰ <strong>Daily rewards</strong> distribute at midnight (00:00 UTC) for the previous day.</p>
                <p>📅 <strong>Weekly rewards</strong> distribute every Monday at midnight for the previous week.</p>
                <p>🗓️ <strong>Monthly rewards</strong> distribute on the 1st of each month for the previous month.</p>
                <p className="text-amber-400/80 text-xs mt-3">
                  ⚠️ Rewards are only distributed once per period. Duplicate distributions are prevented automatically.
                </p>
              </div>

              <div className="border-t border-slate-200 pt-4 space-y-3">
                <h4 className="text-slate-900 font-medium text-sm">Manual Trigger</h4>
                <p className="text-slate-500 text-xs">
                  You can manually trigger distribution for a specific category/period. This will distribute rewards for the <strong>previous</strong> completed period.
                </p>
                
                <div className="flex items-center gap-3 flex-wrap">
                  <div className="flex items-center gap-2">
                    <Label className="text-slate-600 text-xs">Period:</Label>
                    <div className="flex gap-1">
                      {PERIODS.map(p => (
                        <Button
                          key={p.value}
                          variant={selectedPeriod === p.value ? "default" : "outline"}
                          size="sm"
                          onClick={() => setSelectedPeriod(p.value)}
                          className="text-xs"
                        >
                          {p.label}
                        </Button>
                      ))}
                    </div>
                  </div>
                </div>

                <div className="flex gap-2 flex-wrap">
                  <Button
                    onClick={triggerDistribution}
                    disabled={distributing}
                    className="bg-gradient-to-r from-amber-500 to-orange-500"
                  >
                    {distributing ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Gift className="w-4 h-4 mr-2" />}
                    Distribute {selectedCategory} / {selectedPeriod}
                  </Button>
                  
                  <Button
                    onClick={triggerAllDistribution}
                    disabled={distributing}
                    variant="outline"
                    className="border-amber-500/30 text-amber-400 hover:bg-amber-500/10"
                  >
                    {distributing ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Zap className="w-4 h-4 mr-2" />}
                    Auto-Detect & Distribute All
                  </Button>
                </div>
              </div>

              {/* Recent distribution history */}
              <RecentDistributions />
            </CardContent>
          </Card>
        </TabsContent>

        {/* ===== PK COMPETITION TAB ===== */}
        <TabsContent value="pk">
          <PKCompetitionManager />
        </TabsContent>
      </Tabs>
    </div>
  );
};

// Controlled-input reward tier row — types freely, commits on blur/Enter.
// Fixes "number won't enter" bug caused by per-keystroke DB write + refetch race.
interface RewardTierRowProps {
  reward: RewardConfig;
  isAgency: boolean;
  onCommit: (field: string, value: number) => void;
  onDelete: () => void;
}
const RewardTierRow = ({ reward, isAgency, onCommit, onDelete }: RewardTierRowProps) => {
  const [draft, setDraft] = useState({
    rank_from: String(reward.rank_from ?? 0),
    rank_to: String(reward.rank_to ?? 0),
    reward_beans: String(reward.reward_beans ?? 0),
    reward_diamonds: String(reward.reward_diamonds ?? 0),
    reward_diamonds: String(reward.reward_diamonds ?? 0),
  });

  // Sync when upstream row identity/values change (e.g. after refetch from another edit)
  useEffect(() => {
    setDraft({
      rank_from: String(reward.rank_from ?? 0),
      rank_to: String(reward.rank_to ?? 0),
      reward_beans: String(reward.reward_beans ?? 0),
      reward_diamonds: String(reward.reward_diamonds ?? 0),
      reward_diamonds: String(reward.reward_diamonds ?? 0),
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reward.id, reward.rank_from, reward.rank_to, reward.reward_beans, reward.reward_diamonds, reward.reward_diamonds]);

  const commit = (field: keyof typeof draft) => {
    const raw = draft[field];
    const n = raw === "" ? 0 : Number(raw);
    if (Number.isNaN(n)) return;
    const current = Number((reward as any)[field] ?? 0);
    if (n !== current) onCommit(field, n);
  };

  const handleKey = (e: React.KeyboardEvent<HTMLInputElement>, field: keyof typeof draft) => {
    if (e.key === "Enter") {
      (e.target as HTMLInputElement).blur();
    }
  };

  const numInput = (field: keyof typeof draft, extraClass = "") => (
    <Input
      type="number"
      inputMode="numeric"
      min={0}
      value={draft[field]}
      onChange={(e) => setDraft((d) => ({ ...d, [field]: e.target.value }))}
      onBlur={() => commit(field)}
      onKeyDown={(e) => handleKey(e, field)}
      className={cn("text-xs bg-white border-slate-200 shadow-sm text-slate-900 h-8", extraClass)}
    />
  );

  return (
    <Card className="bg-white border-slate-200 shadow-sm">
      <CardContent className="p-3">
        {isAgency ? (
          <div className="grid grid-cols-4 gap-2 items-center">
            <div className="col-span-1">
              <Label className="text-slate-500 text-[10px]">Rank Range</Label>
              <div className="flex items-center gap-1">
                {numInput("rank_from", "w-14")}
                <span className="text-slate-500">-</span>
                {numInput("rank_to", "w-14")}
              </div>
            </div>
            <div className="col-span-2">
              <Label className="text-green-400 text-[10px] font-semibold">Beans (Agency Reward)</Label>
              {numInput("reward_beans", "bg-green-500/10 border-green-500/20")}
            </div>
            <div className="col-span-1 flex items-end justify-end gap-1">
              <Button variant="destructive" size="sm" onClick={onDelete}>
                <Trash2 className="w-3 h-3" />
              </Button>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-6 gap-2 items-center">
            <div className="col-span-1">
              <Label className="text-slate-500 text-[10px]">Rank Range</Label>
              <div className="flex items-center gap-1">
                {numInput("rank_from", "w-14")}
                <span className="text-slate-500">-</span>
                {numInput("rank_to", "w-14")}
              </div>
            </div>
            <div>
              <Label className="text-slate-500 text-[10px]">Beans</Label>
              {numInput("reward_beans")}
            </div>
            <div>
              <Label className="text-slate-500 text-[10px]">Diamonds 💎</Label>
              {numInput("reward_diamonds")}
            </div>
            <div>
              <Label className="text-slate-500 text-[10px]">Diamonds 💰</Label>
              {numInput("reward_diamonds")}
            </div>
            <div className="col-span-1 flex items-end justify-end gap-1">
              <Button variant="destructive" size="sm" onClick={onDelete}>
                <Trash2 className="w-3 h-3" />
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
};


// Recent distribution log
const RecentDistributions = () => {
  const [history, setHistory] = useState<any[]>([]);
  
  useEffect(() => {
    const fetchHistory = async () => {
      const { data } = await supabase
        .from("leaderboard_reward_history")
        .select("id, user_id, agency_id, category, period_type, period_label, rank_position, reward_diamonds, reward_beans, reward_diamonds, stat_value, sent_at")
        .order("sent_at", { ascending: false })
        .limit(50);
      
      if (data && data.length > 0) {
        // Fetch user names
        const userIds = [...new Set(data.filter(d => d.user_id).map(d => d.user_id))];
        const agencyIds = [...new Set(data.filter(d => d.agency_id).map(d => d.agency_id))];
        
        let userMap: Record<string, string> = {};
        let agencyMap: Record<string, string> = {};
        
        if (userIds.length > 0) {
          const { data: users } = await supabase.from("profiles").select("id, display_name, app_uid").in("id", userIds);
          users?.forEach(u => { userMap[u.id] = u.display_name || u.app_uid || u.id.slice(0, 8); });
        }
        if (agencyIds.length > 0) {
          const { data: agencies } = await supabase.from("agencies").select("id, name").in("id", agencyIds);
          agencies?.forEach(a => { agencyMap[a.id] = a.name; });
        }
        
        setHistory(data.map(d => ({
          ...d,
          display_name: d.user_id ? (userMap[d.user_id] || d.user_id.slice(0, 8)) : (agencyMap[d.agency_id] || 'Agency'),
        })));
      }
    };
    fetchHistory();
  }, []);

  const categoryLabel = (cat: string) => {
    switch(cat) {
      case 'host_earnings': return '🎤 Host';
      case 'game_winners': return '🎮 Game';
      case 'top_gifters': return '🎁 Gifter';
      case 'agency_performance': return '🏢 Agency';
      default: return cat;
    }
  };

  const periodLabel = (type: string) => {
    switch(type) {
      case 'daily': return 'Daily';
      case 'weekly': return 'Weekly';
      case 'monthly': return 'Monthly';
      default: return type;
    }
  };

  if (!history.length) return (
    <div className="border-t border-slate-200 pt-4">
      <h4 className="text-slate-500 text-sm mb-2">📋 Recent Reward Distributions</h4>
      <p className="text-slate-400 text-xs">No distributions yet.</p>
    </div>
  );

  return (
    <div className="border-t border-slate-200 pt-4">
      <h4 className="text-slate-600 text-sm mb-3">📋 Recent Reward Distributions ({history.length})</h4>
      <div className="space-y-1.5 max-h-[400px] overflow-y-auto">
        {history.map((h) => (
          <div key={h.id} className="flex items-center justify-between bg-slate-50 rounded-lg px-3 py-2 text-xs gap-2">
            <div className="flex items-center gap-2 min-w-0">
              <span className="text-amber-400 font-bold shrink-0">#{h.rank_position}</span>
              <span className="text-slate-800 truncate">{h.display_name}</span>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <span className="text-slate-500">{categoryLabel(h.category)}</span>
              <span className="text-slate-500">{periodLabel(h.period_type)}</span>
              {h.reward_beans > 0 && <span className="text-green-400">🫘{h.reward_beans.toLocaleString()}</span>}
              {h.reward_diamonds > 0 && <span className="text-blue-400">💎{h.reward_diamonds.toLocaleString()}</span>}
              {h.reward_diamonds > 0 && <span className="text-yellow-400">🪙{h.reward_diamonds.toLocaleString()}</span>}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default AdminLeaderboardManagement;
