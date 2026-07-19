import { useState, useEffect, useCallback, useMemo } from "react";
import {
  Bot,
  Save,
  RefreshCw,
  Undo2,
  ShieldCheck,
  Sparkles,
  Wand2,
  Activity,
  CheckCircle2,
  AlertTriangle,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";
import AdminPageHeader from "@/components/admin/AdminPageHeader";
import { loadAppSetting, saveAppSetting } from "@/utils/adminSettingsStorage";
import { adminSupabase } from "@/integrations/supabase/adminClient";
import { recordAdminError } from "@/utils/adminErrorLog";

import { formatAdminError } from "@/utils/formatAdminError";
const HOME_KEY = "home_host_feed_ranking";
const PARTY_KEY = "party_discovery_ranking";
const SNAPSHOT_LS_KEY = "admin.rankingAutomation.snapshot.v1";

type HomePresetKey = "balanced_default" | "strict_quality" | "growth_mode";
type PartyPresetKey = "balanced_default" | "strict_competitive" | "new_room_friendly";
type ModeKey = "default" | "peak_campaign" | "abuse_control" | "custom";

const HOME_PRESETS: Record<HomePresetKey, Record<string, unknown>> = {
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
  },
  growth_mode: {
  },
};

const PARTY_PRESETS: Record<PartyPresetKey, Record<string, unknown>> = {
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

const MODES: Record<ModeKey, { label: string; home: HomePresetKey | null; party: PartyPresetKey | null; tone: string; desc: string }> = {
  default: {
    label: "Default (Balanced)",
    home: "balanced_default",
    party: "balanced_default",
    tone: "from-amber-400 to-yellow-500",
    desc: "Steady-state baseline for both feeds.",
  },
  peak_campaign: {
  },
  abuse_control: {
  },
  custom: {
  },
};

// ----- Validation -----
const validateHome = (v: Record<string, unknown>): string | null => {
  const num = (k: string) => Number(v[k]);
  for (const k of [
    "reject_penalty_threshold",
    "reject_penalty_strong_threshold",
    "reject_penalty_amount",
    "reject_penalty_strong_amount",
    "reject_penalty_per_extra_reject",
    "viewer_weight",
    "host_level_weight",
    "live_boost",
    "online_boost",
    "busy_boost",
  ]) {
    const n = num(k);
    if (!Number.isFinite(n) || n < 0) return `${k} must be a non-negative number`;
    if (k.endsWith("_threshold") && n === 0) return `${k} must not be 0`;
  }
  if (num("reject_penalty_strong_threshold") < num("reject_penalty_threshold")) {
    return "reject_penalty_strong_threshold must be >= reject_penalty_threshold";
  }
  return null;
};

const validateParty = (v: Record<string, unknown>): string | null => {
  const numericKeys = [
    "participant_weight",
    "host_online_boost",
    "recency_boost_10m",
    "recency_boost_30m",
    "recency_boost_120m",
    "growth_delta_threshold",
    "growth_boost_amount",
    "peak_hour_boost_amount",
  ];
  for (const k of numericKeys) {
    const n = Number(v[k]);
    if (!Number.isFinite(n) || n < 0) return `${k} must be a non-negative number`;
  }
  if (Number(v.growth_delta_threshold) === 0) return "growth_delta_threshold must not be 0";
  const hours = Array.isArray(v.peak_hours) ? (v.peak_hours as unknown[]) : [];
  for (const h of hours) {
    const n = Number(h);
    if (!Number.isFinite(n) || n < 0 || n > 23) return "peak_hours must be inside 0..23";
  }
  return null;
};

const deepEq = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

interface SnapshotRow {
  setting_value: unknown;
  saved_at: string;
}

const AdminRankingAutomation = () => {
  const [home, setHome] = useState<Record<string, unknown> | null>(null);
  const [party, setParty] = useState<Record<string, unknown> | null>(null);
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState(false);
  const [snapshot, setSnapshot] = useState<{ home: SnapshotRow | null; party: SnapshotRow | null } | null>(null);
  const [advisorContext, setAdvisorContext] = useState("");
  const [advice, setAdvice] = useState<{ home_preset: HomePresetKey; party_preset: PartyPresetKey; mode: ModeKey; rationale: string } | null>(null);
  const [advisorLoading, setAdvisorLoading] = useState(false);
  const [lastVerify, setLastVerify] = useState<{ ok: boolean; details: string } | null>(null);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    try {
      const [h, p] = await Promise.all([
        loadAppSetting<Record<string, unknown> | null>(HOME_KEY),
        loadAppSetting<Record<string, unknown> | null>(PARTY_KEY),
      ]);
      setHome((h as any) ?? null);
      setParty((p as any) ?? null);
    } catch (e) {
      recordAdminError({
        kind: "other",
        label: "AdminRankingAutomation.fetchAll",
        message: formatAdminError(e),
      });
      toast.error("Failed to load current ranking settings");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAll();
    try {
      const cached = localStorage.getItem(SNAPSHOT_LS_KEY);
      if (cached) setSnapshot(JSON.parse(cached));
    } catch {
      /* ignore */
    }
  }, [fetchAll]);

  const currentHomePreset = (home?.active_preset as HomePresetKey | undefined) ?? null;
  const currentPartyPreset = (party?.active_preset as PartyPresetKey | undefined) ?? null;
  const currentMode = useMemo<ModeKey>(() => {
    for (const [m, def] of Object.entries(MODES) as Array<[ModeKey, typeof MODES.default]>) {
      if (m === "custom") continue;
      if (def.home === currentHomePreset && def.party === currentPartyPreset) return m;
    }
    return "custom";
  }, [currentHomePreset, currentPartyPreset]);

  const takeSnapshot = useCallback(() => {
    const snap = {
      home: home ? { setting_value: home, saved_at: new Date().toISOString() } : null,
      party: party ? { setting_value: party, saved_at: new Date().toISOString() } : null,
    };
    setSnapshot(snap);
    try {
      localStorage.setItem(SNAPSHOT_LS_KEY, JSON.stringify(snap));
    } catch {
      /* ignore */
    }
    return snap;
  }, [home, party]);

  const verifyApplied = useCallback(
    async (
      expectedHome: Record<string, unknown> | null,
      expectedParty: Record<string, unknown> | null,
    ): Promise<{ ok: boolean; details: string }> => {
      const [h, p] = await Promise.all([
        loadAppSetting<Record<string, unknown> | null>(HOME_KEY),
        loadAppSetting<Record<string, unknown> | null>(PARTY_KEY),
      ]);
      const homeOk = !expectedHome || deepEq(h, expectedHome);
      const partyOk = !expectedParty || deepEq(p, expectedParty);
      const ok = homeOk && partyOk;
      const details = ok
        ? "Both keys verified against intended payload."
        : `Mismatch — home_ok=${homeOk}, party_ok=${partyOk}`;
      return { ok, details };
    },
    [],
  );

  const applyMode = useCallback(
    async (mode: Exclude<ModeKey, "custom">) => {
      const def = MODES[mode];
      if (!def.home || !def.party) return;
      await applyPresets(def.home, def.party, def.label);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [home, party],
  );

  const applyPresets = useCallback(
    async (homePreset: HomePresetKey, partyPreset: PartyPresetKey, label: string) => {
      setWorking(true);
      setLastVerify(null);
      try {
        // 1. snapshot
        const snap = takeSnapshot();

        // 2. build payloads
        const homePayload = { ...HOME_PRESETS[homePreset], active_preset: homePreset };
        const partyPayload = { ...PARTY_PRESETS[partyPreset], active_preset: partyPreset };

        // 3. validate
        const homeErr = validateHome(homePayload);
        const partyErr = validateParty(partyPayload);
        if (homeErr || partyErr) {
          toast.error(`Validation failed: ${homeErr || partyErr}`);
          return;
        }

        // 4. apply
        await Promise.all([
          saveAppSetting(HOME_KEY, homePayload, "Home host feed ranking & traffic control"),
          saveAppSetting(PARTY_KEY, partyPayload, "Party room discovery ranking & traffic control"),
        ]);

        // 5. verify
        const verify = await verifyApplied(homePayload, partyPayload);
        setLastVerify(verify);

        if (!verify.ok) {
          // 6. rollback
          if (snap.home?.setting_value) {
            await saveAppSetting(HOME_KEY, snap.home.setting_value, "Rollback: home_host_feed_ranking");
          }
          if (snap.party?.setting_value) {
            await saveAppSetting(PARTY_KEY, snap.party.setting_value, "Rollback: party_discovery_ranking");
          }
          toast.error(`${label} failed verification → rolled back.`);
        } else {
          toast.success(`${label} applied & verified.`);
        }

        await fetchAll();
      } catch (e) {
        recordAdminError({
        });
        toast.error("Failed to apply ranking presets");
      } finally {
        setWorking(false);
      }
    },
    [takeSnapshot, verifyApplied, fetchAll],
  );

  const handleRollback = useCallback(async () => {
    if (!snapshot || (!snapshot.home && !snapshot.party)) {
      toast.error("No snapshot stored yet");
      return;
    }
    setWorking(true);
    try {
      if (snapshot.home?.setting_value) {
        await saveAppSetting(HOME_KEY, snapshot.home.setting_value, "Manual rollback: home_host_feed_ranking");
      }
      if (snapshot.party?.setting_value) {
        await saveAppSetting(PARTY_KEY, snapshot.party.setting_value, "Manual rollback: party_discovery_ranking");
      }
      toast.success("Rollback applied from snapshot.");
      await fetchAll();
    } catch (e) {
      toast.error("Rollback failed");
    } finally {
      setWorking(false);
    }
  }, [snapshot, fetchAll]);

  const askAdvisor = useCallback(async () => {
    if (!advisorContext.trim()) {
      toast.error("Describe the situation first");
      return;
    }
    setAdvisorLoading(true);
    setAdvice(null);
    try {
      const { data, error } = await adminSupabase.functions.invoke("ranking-ai-advisor", {
        body: {
          context: advisorContext,
          home_current: home,
          party_current: party,
        },
      });
      if (error) throw error;
      const payload = data as any;
      if (!payload?.home_preset || !payload?.party_preset) {
        throw new Error("Invalid advisor response");
      }
      setAdvice(payload);
      toast.success("AI recommendation ready");
    } catch (e) {
      const msg = formatAdminError(e)
      toast.error(msg);
    } finally {
      setAdvisorLoading(false);
    }
  }, [advisorContext, home, party]);

  return (
    <div className="admin-pro-shell admin-content space-y-6 p-4 md:p-6 -mx-4 -my-4 sm:-mx-6 sm:-my-6">
      <AdminPageHeader
        title="Ranking Automation"
        subtitle="Snapshot → Apply → Verify → Rollback for home & party ranking, plus AI advisor"
        icon={Bot}
        onRefresh={fetchAll}
        isRefreshing={loading}
      />

      {/* Current state */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Activity className="h-5 w-5 text-primary" />
            Current State
          </CardTitle>
          <CardDescription>Live values read from <code>app_settings</code>.</CardDescription>
        </CardHeader>
        <CardContent className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <div className="rounded-lg border border-border bg-muted/30 p-3">
            <div className="text-xs text-muted-foreground">Home Feed</div>
            <div className="mt-1 text-base font-semibold">{currentHomePreset ?? "—"}</div>
          </div>
          <div className="rounded-lg border border-border bg-muted/30 p-3">
            <div className="text-xs text-muted-foreground">Party Discovery</div>
            <div className="mt-1 text-base font-semibold">{currentPartyPreset ?? "—"}</div>
          </div>
          <div className="rounded-lg border border-border bg-muted/30 p-3">
            <div className="text-xs text-muted-foreground">Detected Mode</div>
            <div className="mt-1 text-base font-semibold capitalize">{currentMode.replace("_", " ")}</div>
          </div>
        </CardContent>
      </Card>

      {/* Operational policy modes */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Wand2 className="h-5 w-5 text-primary" />
            Operational Policy Modes
          </CardTitle>
          <CardDescription>One click applies both ranking keys with full snapshot → verify → rollback.</CardDescription>
        </CardHeader>
        <CardContent className="grid grid-cols-1 gap-3 md:grid-cols-3">
          {(["default", "peak_campaign", "abuse_control"] as Array<Exclude<ModeKey, "custom">>).map((m) => {
            const def = MODES[m];
            const isActive = currentMode === m;
            return (
              <button
                key={m}
                disabled={working || loading}
                onClick={() => applyMode(m)}
                className={`relative rounded-xl border p-4 text-left transition-all disabled:opacity-50 ${
                  isActive
                    ? "border-primary bg-primary/10 shadow-[0_8px_24px_-12px_hsl(var(--primary)/0.6)]"
                    : "border-border hover:border-primary/50 hover:bg-muted/40"
                }`}
              >
                <div className={`mb-2 inline-block rounded-md bg-gradient-to-r ${def.tone} px-2 py-0.5 text-xs font-semibold text-white`}>
                  {def.label}
                </div>
                <div className="text-sm text-muted-foreground">{def.desc}</div>
                <div className="mt-2 text-xs text-muted-foreground">
                  Home: <span className="font-mono">{def.home}</span> · Party: <span className="font-mono">{def.party}</span>
                </div>
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

      {/* AI Advisor */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-primary" />
            AI Strategy Advisor
          </CardTitle>
          <CardDescription>
            Describe the situation (e.g. "Eid weekend campaign", "abuse spike from new accounts", "low traffic Tuesday morning") — AI picks the best preset combination.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <Textarea
            value={advisorContext}
            onChange={(e) => setAdvisorContext(e.target.value)}
            placeholder="Describe current platform conditions or campaign goals..."
            rows={3}
          />
          <div className="flex flex-wrap gap-2">
            <Button onClick={askAdvisor} disabled={advisorLoading || working || !advisorContext.trim()}>
              <Bot className="mr-2 h-4 w-4" />
              {advisorLoading ? "Thinking…" : "Ask AI Advisor"}
            </Button>
          </div>

          {advice && (
            <div className="rounded-lg border border-primary/40 bg-primary/5 p-4 space-y-3">
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="outline" className="capitalize">
                  Mode: {advice.mode.replace("_", " ")}
                </Badge>
                <Badge variant="outline">Home: {advice.home_preset}</Badge>
                <Badge variant="outline">Party: {advice.party_preset}</Badge>
              </div>
              <p className="text-sm text-muted-foreground">{advice.rationale}</p>
              <Button
                size="sm"
                disabled={working}
                onClick={() => applyPresets(advice.home_preset, advice.party_preset, "AI recommendation")}
              >
                <Save className="mr-2 h-4 w-4" /> Apply AI Recommendation
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Verify + rollback */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ShieldCheck className="h-5 w-5 text-primary" />
            Snapshot · Verify · Rollback
          </CardTitle>
          <CardDescription>Manual safety controls. Snapshots persist locally between sessions.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={takeSnapshot} disabled={loading}>
              <Save className="mr-2 h-4 w-4" /> Take Snapshot Now
            </Button>
            <Button
              variant="outline"
              onClick={async () => {
                setWorking(true);
                const v = await verifyApplied(home, party);
                setLastVerify(v);
                setWorking(false);
                v.ok ? toast.success(v.details) : toast.error(v.details);
              }}
              disabled={loading || working}
            >
              <ShieldCheck className="mr-2 h-4 w-4" /> Verify Current
            </Button>
            <Button variant="destructive" onClick={handleRollback} disabled={!snapshot || working}>
              <Undo2 className="mr-2 h-4 w-4" /> Rollback to Snapshot
            </Button>
            <Button variant="ghost" onClick={fetchAll} disabled={loading}>
              <RefreshCw className="mr-2 h-4 w-4" /> Reload
            </Button>
          </div>

          {snapshot && (
            <div className="text-xs text-muted-foreground">
              Snapshot taken:{" "}
              {snapshot.home?.saved_at ? new Date(snapshot.home.saved_at).toLocaleString() : "—"}
            </div>
          )}

          {lastVerify && (
            <div
              className={`flex items-start gap-2 rounded-md border p-3 text-sm ${
                lastVerify.ok
                  ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-700"
                  : "border-red-500/40 bg-red-500/10 text-red-700"
              }`}
            >
              {lastVerify.ok ? <CheckCircle2 className="mt-0.5 h-4 w-4" /> : <AlertTriangle className="mt-0.5 h-4 w-4" />}
              <span>{lastVerify.details}</span>
            </div>
          )}

          <Separator />

          <div className="text-xs text-muted-foreground space-y-1">
            <div>
              For per-field tuning use{" "}
              <a className="underline" href="/admin/host-feed-ranking">Host Feed Ranking</a> &{" "}
              <a className="underline" href="/admin/party-discovery-ranking">Party Discovery Ranking</a>.
            </div>
            <div>
              Preset source files: <code>docs/packages/home_host_feed_ranking_presets.json</code>,{" "}
              <code>docs/packages/party_discovery_ranking_presets.json</code>.
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default AdminRankingAutomation;
