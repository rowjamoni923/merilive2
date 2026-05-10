import { useState, useEffect, useCallback } from "react";
import { TrendingUp, Save, RefreshCw, Wand2, Info } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import AdminPageHeader from "@/components/admin/AdminPageHeader";
import { loadAppSetting, saveAppSetting } from "@/utils/adminSettingsStorage";
import { useAdminRealtime } from "@/hooks/useAdminRealtime";
import { recordAdminError } from "@/utils/adminErrorLog";

import { formatAdminError } from "@/utils/formatAdminError";
const SETTING_KEY = "home_host_feed_ranking";

type PresetKey = "balanced_default" | "strict_quality" | "growth_mode" | "custom";

interface RankingConfig {
  reject_penalty_threshold: number;
  reject_penalty_strong_threshold: number;
  reject_penalty_amount: number;
  reject_penalty_strong_amount: number;
  reject_penalty_per_extra_reject: number;
  reject_auto_scale_enabled: boolean;
  viewer_weight: number;
  host_level_weight: number;
  live_boost: number;
  online_boost: number;
  busy_boost: number;
}

const PRESETS: Record<Exclude<PresetKey, "custom">, RankingConfig> = {
  balanced_default: {
    reject_penalty_threshold: 2,
    reject_penalty_strong_threshold: 5,
    reject_penalty_amount: 55,
    reject_penalty_strong_amount: 120,
    reject_penalty_per_extra_reject: 12,
    reject_auto_scale_enabled: true,
    viewer_weight: 9,
    host_level_weight: 3,
    live_boost: 80,
    online_boost: 40,
    busy_boost: 24,
  },
  strict_quality: {
    reject_penalty_threshold: 2,
    reject_penalty_strong_threshold: 4,
    reject_penalty_amount: 80,
    reject_penalty_strong_amount: 180,
    reject_penalty_per_extra_reject: 20,
    reject_auto_scale_enabled: true,
    viewer_weight: 8,
    host_level_weight: 2,
    live_boost: 70,
    online_boost: 35,
    busy_boost: 20,
  },
  growth_mode: {
    reject_penalty_threshold: 3,
    reject_penalty_strong_threshold: 6,
    reject_penalty_amount: 35,
    reject_penalty_strong_amount: 90,
    reject_penalty_per_extra_reject: 8,
    reject_auto_scale_enabled: true,
    viewer_weight: 10,
    host_level_weight: 4,
    live_boost: 90,
    online_boost: 45,
    busy_boost: 28,
  },
};

const PRESET_LABELS: Record<Exclude<PresetKey, "custom">, { name: string; desc: string; tone: string }> = {
  balanced_default: {
    name: "Balanced (Default)",
    desc: "Recommended baseline — fair penalties, healthy traffic spread.",
    tone: "from-amber-400 to-yellow-500",
  },
  strict_quality: {
    name: "Strict Quality",
    desc: "Heavier penalties for rejecting calls. Promotes top performers.",
    tone: "from-rose-400 to-red-500",
  },
  growth_mode: {
    name: "Growth Mode",
    desc: "Forgiving — boosts new hosts and maximises live discovery.",
    tone: "from-emerald-400 to-teal-500",
  },
};

const FIELD_GROUPS: Array<{
  title: string;
  fields: Array<{ key: keyof RankingConfig; label: string; hint: string; type?: "switch" }>;
}> = [
  {
    title: "Reject Penalty",
    fields: [
      { key: "reject_penalty_threshold", label: "Reject Penalty Threshold", hint: "Rejects before soft penalty kicks in." },
      { key: "reject_penalty_strong_threshold", label: "Strong Penalty Threshold", hint: "Rejects before strong penalty kicks in." },
      { key: "reject_penalty_amount", label: "Soft Penalty Amount", hint: "Score reduction at soft threshold." },
      { key: "reject_penalty_strong_amount", label: "Strong Penalty Amount", hint: "Score reduction at strong threshold." },
      { key: "reject_penalty_per_extra_reject", label: "Per Extra Reject", hint: "Extra penalty for every additional reject." },
      { key: "reject_auto_scale_enabled", label: "Auto Scale Penalty", hint: "Scales penalty with reject count.", type: "switch" },
    ],
  },
  {
    title: "Ranking Weights & Boosts",
    fields: [
      { key: "viewer_weight", label: "Viewer Weight", hint: "How much current viewers boost ranking." },
      { key: "host_level_weight", label: "Host Level Weight", hint: "How much host level boosts ranking." },
      { key: "live_boost", label: "Live Boost", hint: "Bonus for live-streaming hosts." },
      { key: "online_boost", label: "Online Boost", hint: "Bonus for online (idle) hosts." },
      { key: "busy_boost", label: "Busy Boost", hint: "Bonus for hosts currently in a call." },
    ],
  },
];

const detectPreset = (cfg: RankingConfig): PresetKey => {
  for (const [key, preset] of Object.entries(PRESETS) as Array<[Exclude<PresetKey, "custom">, RankingConfig]>) {
    const match = (Object.keys(preset) as Array<keyof RankingConfig>).every((k) => preset[k] === cfg[k]);
    if (match) return key;
  }
  return "custom";
};

const AdminHostFeedRanking = () => {
  const [config, setConfig] = useState<RankingConfig>(PRESETS.balanced_default);
  const [activePreset, setActivePreset] = useState<PresetKey>("balanced_default");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const fetchConfig = useCallback(async () => {
    setLoading(true);
    try {
      const data = await loadAppSetting<Record<string, unknown> | null>(SETTING_KEY);
      if (data && typeof data === "object") {
        const merged: RankingConfig = { ...PRESETS.balanced_default };
        (Object.keys(merged) as Array<keyof RankingConfig>).forEach((k) => {
          const v = (data as any)[k];
          if (v !== undefined && v !== null) (merged as any)[k] = v;
        });
        setConfig(merged);
        setActivePreset(((data as any).active_preset as PresetKey) || detectPreset(merged));
      }
    } catch (error) {
      recordAdminError({
        kind: "other",
        label: "AdminHostFeedRanking.fetchConfig",
        message: formatAdminError(error),
      });
      toast.error("Failed to load ranking config");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchConfig();
  }, [fetchConfig]);

  useAdminRealtime(["app_settings"], () => fetchConfig());

  const applyPreset = (key: Exclude<PresetKey, "custom">) => {
    setConfig({ ...PRESETS[key] });
    setActivePreset(key);
    toast.success(`Loaded "${PRESET_LABELS[key].name}" — click Save to apply.`);
  };

  const updateField = <K extends keyof RankingConfig>(key: K, value: RankingConfig[K]) => {
    setConfig((prev) => {
      const next = { ...prev, [key]: value };
      setActivePreset(detectPreset(next));
      return next;
    });
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const payload = { ...config, active_preset: activePreset };
      await saveAppSetting(SETTING_KEY, payload, "Home host feed ranking & traffic control");
      toast.success("Host feed ranking saved");
    } catch (error) {
      recordAdminError({
        kind: "other",
        label: "AdminHostFeedRanking.save",
        message: formatAdminError(error),
      });
      toast.error("Failed to save ranking config");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6 admin-content">
      <AdminPageHeader
        title="Host Feed Ranking"
        subtitle="Control reject penalties, traffic boosts and ranking weights for the home host feed"
        icon={TrendingUp}
        onRefresh={fetchConfig}
        isRefreshing={loading}
      />

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Wand2 className="h-5 w-5 text-primary" />
            Quick Presets
          </CardTitle>
          <CardDescription>Pick a preset to load proven values, then fine-tune below.</CardDescription>
        </CardHeader>
        <CardContent className="grid grid-cols-1 gap-3 md:grid-cols-3">
          {(Object.keys(PRESETS) as Array<Exclude<PresetKey, "custom">>).map((key) => {
            const label = PRESET_LABELS[key];
            const isActive = activePreset === key;
            return (
              <button
                key={key}
                onClick={() => applyPreset(key)}
                className={`relative rounded-xl border p-4 text-left transition-all ${
                  isActive
                    ? "border-primary bg-primary/10 shadow-[0_8px_24px_-12px_hsl(var(--primary)/0.6)]"
                    : "border-border hover:border-primary/50 hover:bg-muted/40"
                }`}
              >
                <div className={`mb-2 inline-block rounded-md bg-gradient-to-r ${label.tone} px-2 py-0.5 text-xs font-semibold text-white`}>
                  {label.name}
                </div>
                <div className="text-sm text-muted-foreground">{label.desc}</div>
                {isActive && (
                  <Badge variant="secondary" className="absolute right-3 top-3">
                    Active
                  </Badge>
                )}
              </button>
            );
          })}
        </CardContent>
      </Card>

      {FIELD_GROUPS.map((group) => (
        <Card key={group.title}>
          <CardHeader>
            <CardTitle>{group.title}</CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-1 gap-4 md:grid-cols-2">
            {group.fields.map((f) => (
              <div key={f.key} className="space-y-1.5">
                <Label className="flex items-center gap-1.5 text-sm">
                  {f.label}
                  <Info className="h-3 w-3 text-muted-foreground" />
                </Label>
                {f.type === "switch" ? (
                  <div className="flex items-center justify-between rounded-md border border-border bg-muted/30 px-3 py-2">
                    <span className="text-xs text-muted-foreground">{f.hint}</span>
                    <Switch
                      checked={Boolean(config[f.key])}
                      onCheckedChange={(v) => updateField(f.key, v as never)}
                    />
                  </div>
                ) : (
                  <>
                    <Input
                      type="number"
                      value={Number(config[f.key])}
                      onChange={(e) => updateField(f.key, Number(e.target.value) as never)}
                      disabled={loading}
                    />
                    <p className="text-xs text-muted-foreground">{f.hint}</p>
                  </>
                )}
              </div>
            ))}
          </CardContent>
        </Card>
      ))}

      <div className="sticky bottom-4 z-10 flex justify-end gap-2">
        <Button variant="outline" onClick={fetchConfig} disabled={loading || saving}>
          <RefreshCw className="mr-2 h-4 w-4" /> Reload
        </Button>
        <Button onClick={handleSave} disabled={saving || loading}>
          <Save className="mr-2 h-4 w-4" /> {saving ? "Saving…" : "Save Ranking Config"}
        </Button>
      </div>
    </div>
  );
};

export default AdminHostFeedRanking;
