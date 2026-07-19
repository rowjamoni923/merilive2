import { useState, useEffect, useCallback } from "react";
import { Sparkles, Save, RefreshCw, Wand2, Info } from "lucide-react";
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
const SETTING_KEY = "party_discovery_ranking";

type PresetKey = "balanced_default" | "strict_competitive" | "new_room_friendly" | "custom";

interface RankingConfig {
  participant_weight: number;
  host_online_boost: number;
  recency_boost_10m: number;
  recency_boost_30m: number;
  recency_boost_120m: number;
  growth_boost_enabled: boolean;
  growth_delta_threshold: number;
  growth_boost_amount: number;
  peak_hour_boost_enabled: boolean;
  peak_hour_boost_amount: number;
  peak_hours: number[];
}

const PRESETS: Record<Exclude<PresetKey, "custom">, RankingConfig> = {
  balanced_default: {
    participant_weight: 10,
    host_online_boost: 7,
    recency_boost_10m: 20,
    recency_boost_30m: 12,
    recency_boost_120m: 6,
    growth_boost_enabled: true,
    growth_delta_threshold: 2,
    growth_boost_amount: 18,
    peak_hour_boost_enabled: true,
    peak_hour_boost_amount: 8,
    peak_hours: [18, 19, 20, 21, 22, 23],
  },
  strict_competitive: {
  },
  new_room_friendly: {
  },
};

const PRESET_LABELS: Record<Exclude<PresetKey, "custom">, { name: string; desc: string; tone: string }> = {
  balanced_default: {
    name: "Balanced (Default)",
    desc: "Recommended baseline — fair mix of size, recency, and growth.",
    tone: "from-amber-400 to-yellow-500",
  },
  strict_competitive: {
  },
  new_room_friendly: {
  },
};

const NUMERIC_FIELDS: Array<{ key: keyof RankingConfig; label: string; hint: string }> = [
  { key: "participant_weight", label: "Participant Weight", hint: "Score gained per participant in the room." },
  { key: "host_online_boost", label: "Host Online Boost", hint: "Bonus when room host is online." },
  { key: "recency_boost_10m", label: "Recency Boost (≤10m)", hint: "Bonus for activity within 10 minutes." },
  { key: "recency_boost_30m", label: "Recency Boost (≤30m)", hint: "Bonus for activity within 30 minutes." },
  { key: "recency_boost_120m", label: "Recency Boost (≤120m)", hint: "Bonus for activity within 2 hours." },
  { key: "growth_delta_threshold", label: "Growth Delta Threshold", hint: "New joins delta required to count as growth." },
  { key: "growth_boost_amount", label: "Growth Boost Amount", hint: "Bonus when growth threshold is met." },
  { key: "peak_hour_boost_amount", label: "Peak Hour Boost Amount", hint: "Bonus during peak hours." },
];

const detectPreset = (cfg: RankingConfig): PresetKey => {
  for (const [key, preset] of Object.entries(PRESETS) as Array<[Exclude<PresetKey, "custom">, RankingConfig]>) {
    const match = (Object.keys(preset) as Array<keyof RankingConfig>).every((k) => {
      if (k === "peak_hours") {
        const a = preset.peak_hours, b = cfg.peak_hours || [];
        return a.length === b.length && a.every((v, i) => v === b[i]);
      }
      return (preset as any)[k] === (cfg as any)[k];
    });
    if (match) return key;
  }
  return "custom";
};

const AdminPartyDiscoveryRanking = () => {
  const [config, setConfig] = useState<RankingConfig>(PRESETS.balanced_default);
  const [activePreset, setActivePreset] = useState<PresetKey>("balanced_default");
  const [peakHoursText, setPeakHoursText] = useState(PRESETS.balanced_default.peak_hours.join(", "));
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
        if (!Array.isArray(merged.peak_hours)) merged.peak_hours = PRESETS.balanced_default.peak_hours;
        setConfig(merged);
        setPeakHoursText(merged.peak_hours.join(", "));
        setActivePreset(((data as any).active_preset as PresetKey) || detectPreset(merged));
      }
    } catch (error) {
      recordAdminError({
        kind: "other",
        label: "AdminPartyDiscoveryRanking.fetchConfig",
        message: formatAdminError(error),
      });
      toast.error("Failed to load discovery ranking");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchConfig();
  }, [fetchConfig]);

  useAdminRealtime(["app_settings"], () => fetchConfig());

  const applyPreset = (key: Exclude<PresetKey, "custom">) => {
    const next = { ...PRESETS[key] };
    setConfig(next);
    setPeakHoursText(next.peak_hours.join(", "));
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
    const parsedHours = peakHoursText
      .split(/[,\s]+/)
      .map((s) => Number(s.trim()))
      .filter((n) => Number.isFinite(n) && n >= 0 && n <= 23);
    const finalConfig: RankingConfig = { ...config, peak_hours: Array.from(new Set(parsedHours)).sort((a, b) => a - b) };

    setSaving(true);
    try {
      await saveAppSetting(SETTING_KEY, { ...finalConfig, active_preset: detectPreset(finalConfig) }, "Party room discovery ranking & traffic control");
      setConfig(finalConfig);
      setPeakHoursText(finalConfig.peak_hours.join(", "));
      toast.success("Discovery ranking saved");
    } catch (error) {
      recordAdminError({
      });
      toast.error("Failed to save");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="admin-pro-shell admin-content space-y-6 p-4 md:p-6 -mx-4 -my-4 sm:-mx-6 sm:-my-6">
      <AdminPageHeader
        title="Party Discovery Ranking"
        subtitle="Control participant weight, recency, growth and peak-hour boosts for the party room discovery feed"
        icon={Sparkles}
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

      <Card>
        <CardHeader>
          <CardTitle>Ranking Weights & Boosts</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {NUMERIC_FIELDS.map((f) => (
            <div key={f.key} className="space-y-1.5">
              <Label className="flex items-center gap-1.5 text-sm">
                {f.label}
                <Info className="h-3 w-3 text-muted-foreground" />
              </Label>
              <Input
                type="number"
                value={Number(config[f.key as keyof RankingConfig] as number)}
                onChange={(e) => updateField(f.key, Number(e.target.value) as never)}
                disabled={loading}
              />
              <p className="text-xs text-muted-foreground">{f.hint}</p>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Toggles & Peak Hours</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <div className="flex items-center justify-between rounded-md border border-border bg-muted/30 px-3 py-2">
            <div>
              <div className="text-sm font-medium">Growth Boost Enabled</div>
              <div className="text-xs text-muted-foreground">Apply bonus when room growth exceeds threshold.</div>
            </div>
            <Switch
              checked={config.growth_boost_enabled}
              onCheckedChange={(v) => updateField("growth_boost_enabled", v)}
            />
          </div>

          <div className="flex items-center justify-between rounded-md border border-border bg-muted/30 px-3 py-2">
            <div>
              <div className="text-sm font-medium">Peak Hour Boost Enabled</div>
              <div className="text-xs text-muted-foreground">Apply bonus during defined peak hours.</div>
            </div>
            <Switch
              checked={config.peak_hour_boost_enabled}
              onCheckedChange={(v) => updateField("peak_hour_boost_enabled", v)}
            />
          </div>

          <div className="space-y-1.5 md:col-span-2">
            <Label className="text-sm">Peak Hours (24h, comma-separated, 0–23)</Label>
            <Input
              value={peakHoursText}
              onChange={(e) => setPeakHoursText(e.target.value)}
              placeholder="18, 19, 20, 21, 22, 23"
              disabled={loading}
            />
            <p className="text-xs text-muted-foreground">
              Hours during which the peak-hour boost is applied (server local time). Invalid values are ignored on save.
            </p>
          </div>
        </CardContent>
      </Card>

      <div className="sticky bottom-4 z-10 flex justify-end gap-2">
        <Button variant="outline" onClick={fetchConfig} disabled={loading || saving}>
          <RefreshCw className="mr-2 h-4 w-4" /> Reload
        </Button>
        <Button onClick={handleSave} disabled={saving || loading}>
          <Save className="mr-2 h-4 w-4" /> {saving ? "Saving…" : "Save Discovery Ranking"}
        </Button>
      </div>
    </div>
  );
};

export default AdminPartyDiscoveryRanking;
