/**
 * AdminOtpProviders — Multi-provider OTP email orchestrator control panel
 *
 * Manages Resend / Brevo / Gmail SMTP providers used by `send-otp-email`
 * shared edge helper. Admin can:
 *   - Toggle each provider on/off
 *   - Reorder priority (sequential mode) or weight (race mode)
 *   - Set daily quota (auto-skip when exhausted, prevents Gmail/Brevo limit hits)
 *   - Switch race ↔ sequential mode and per-provider timeout
 *   - View 7-day stats from email_send_log: wins, success rate, avg latency
 */
import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { RefreshCw, CheckCircle2, XCircle, Zap, Activity, Save, AlertTriangle, Mail } from "lucide-react";
import useAdminRealtime from "@/hooks/useAdminRealtime";
import { adminSupabase } from "@/integrations/supabase/adminClient";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import AdminPageHeader from "@/components/admin/AdminPageHeader";
import { toast } from "sonner";

type ProviderRow = {
  id: string;
  provider: string;
  enabled: boolean;
  priority: number;
  daily_quota: number | null;
  daily_sent: number;
  last_reset_date: string;
  notes: string | null;
};

type Settings = { id: boolean; mode: "race" | "sequential"; per_provider_timeout_ms: number };

type LogRow = {
  message_id: string | null;
  status: string;
  metadata: any;
  created_at: string;
};

const PROVIDER_META: Record<string, { label: string; envHint: string; brandClass: string }> = {
  resend: { label: "Resend", envHint: "merilive.com verified · best deliverability", brandClass: "bg-blue-50 border-blue-200" },
  brevo: { label: "Brevo", envHint: "300/day free · already connected", brandClass: "bg-emerald-50 border-emerald-200" },
  gmail: { label: "Gmail SMTP", envHint: "Last-resort · ~500/day soft limit", brandClass: "bg-amber-50 border-amber-200" },
};

export default function AdminOtpProviders() {
  const qc = useQueryClient();
  const [dirty, setDirty] = useState<Record<string, Partial<ProviderRow>>>({});
  const [settingsDirty, setSettingsDirty] = useState<Partial<Settings> | null>(null);

  const providersQ = useQuery({
    queryKey: ["admin-otp-providers"],
    queryFn: async () => {
      const { data, error } = await adminSupabase
        .from("otp_provider_config")
        .select("*")
        .order("priority", { ascending: true });
      if (error) throw error;
      return data as ProviderRow[];
    },
  });

  const settingsQ = useQuery({
    queryKey: ["admin-otp-settings"],
    queryFn: async () => {
      const { data, error } = await adminSupabase
        .from("otp_orchestrator_settings")
        .select("*")
        .maybeSingle();
      if (error) throw error;
      return data as Settings | null;
    },
  });

  const logsQ = useQuery({
    queryKey: ["admin-otp-logs-7d"],
    queryFn: async () => {
      const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
      const { data, error } = await adminSupabase
        .from("email_send_log")
        .select("message_id,status,metadata,created_at")
        .eq("template_name", "otp-code")
        .gte("created_at", since)
        .order("created_at", { ascending: false })
        .limit(1000);
      if (error) throw error;
      return data as LogRow[];
    },
  });

  // Per-provider stats (deduplicated by message_id, latest status wins)
  const stats = useMemo(() => {
    const rows = logsQ.data ?? [];
    const latest = new Map<string, LogRow>();
    for (const r of rows) {
      if (!r.message_id) continue;
      if (!latest.has(r.message_id)) latest.set(r.message_id, r);
    }
    const agg: Record<string, { wins: number; failures: number; totalMs: number; samples: number; lastError?: string }> = {
      resend: { wins: 0, failures: 0, totalMs: 0, samples: 0 },
      brevo: { wins: 0, failures: 0, totalMs: 0, samples: 0 },
      "gmail-smtp": { wins: 0, failures: 0, totalMs: 0, samples: 0 },
    };
    let total = 0, sent = 0, failed = 0;
    for (const r of latest.values()) {
      total++;
      if (r.status === "sent") sent++;
      if (r.status === "failed") failed++;
      const winner = r.metadata?.provider as string | undefined;
      const race = r.metadata?.race as Record<string, { ok: boolean; ms: number; error?: string }> | undefined;
      if (race) {
        for (const [name, t] of Object.entries(race)) {
          if (!agg[name]) agg[name] = { wins: 0, failures: 0, totalMs: 0, samples: 0 };
          agg[name].samples++;
          agg[name].totalMs += t.ms;
          if (t.ok) {
            if (winner === name) agg[name].wins++;
          } else {
            agg[name].failures++;
            agg[name].lastError = t.error;
          }
        }
      }
    }
    return { total, sent, failed, perProvider: agg };
  }, [logsQ.data]);

  function patch(provider: string, patch: Partial<ProviderRow>) {
    setDirty((d) => ({ ...d, [provider]: { ...d[provider], ...patch } }));
  }

  async function saveProvider(p: ProviderRow) {
    const changes = dirty[p.provider];
    if (!changes) return;
    const { error } = await adminSupabase
      .from("otp_provider_config")
      .update({
        enabled: changes.enabled ?? p.enabled,
        priority: changes.priority ?? p.priority,
        daily_quota: changes.daily_quota === undefined ? p.daily_quota : changes.daily_quota,
        notes: changes.notes ?? p.notes,
        updated_at: new Date().toISOString(),
      })
      .eq("id", p.id);
    if (error) { toast.error(`Save failed: ${error.message}`); return; }
    toast.success(`${PROVIDER_META[p.provider]?.label ?? p.provider} updated`);
    setDirty((d) => { const c = { ...d }; delete c[p.provider]; return c; });
    qc.invalidateQueries({ queryKey: ["admin-otp-providers"] });
  }

  async function saveSettings() {
    if (!settingsDirty || !settingsQ.data) return;
    const { error } = await adminSupabase
      .from("otp_orchestrator_settings")
      .update({
        mode: settingsDirty.mode ?? settingsQ.data.mode,
        per_provider_timeout_ms: settingsDirty.per_provider_timeout_ms ?? settingsQ.data.per_provider_timeout_ms,
        updated_at: new Date().toISOString(),
      })
      .eq("id", true);
    if (error) { toast.error(`Save failed: ${error.message}`); return; }
    toast.success("Orchestrator settings saved");
    setSettingsDirty(null);
    qc.invalidateQueries({ queryKey: ["admin-otp-settings"] });
  }

  async function resetCounters() {
    const { error } = await adminSupabase.rpc("reset_otp_provider_daily_counters");
    if (error) { toast.error(error.message); return; }
    toast.success("Daily counters reset");
    qc.invalidateQueries({ queryKey: ["admin-otp-providers"] });
  }

  function refreshAll() {
    qc.invalidateQueries({ queryKey: ["admin-otp-providers"] });
    qc.invalidateQueries({ queryKey: ["admin-otp-settings"] });
    qc.invalidateQueries({ queryKey: ["admin-otp-logs-7d"] });
  }

  const mode = settingsDirty?.mode ?? settingsQ.data?.mode ?? "race";
  const timeout = settingsDirty?.per_provider_timeout_ms ?? settingsQ.data?.per_provider_timeout_ms ?? 4000;
  const successRate = stats.total ? Math.round((stats.sent / stats.total) * 100) : 100;

  return (
    <div className="min-h-screen bg-white">
      <AdminPageHeader
        title="OTP Email Providers"
        subtitle="Multi-provider failover: Resend → Brevo → Gmail. Race mode = parallel, first success wins."
        actions={
          <Button onClick={refreshAll} variant="outline" size="sm" className="gap-2">
            <RefreshCw className="h-4 w-4" /> Refresh
          </Button>
        }
      />

      <div className="p-4 md:p-6 space-y-6">
        {/* === Top stat cards === */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <StatCard icon={Mail} label="Total OTPs (7d)" value={stats.total.toString()} tint="bg-slate-50 border-slate-200" />
          <StatCard icon={CheckCircle2} label="Delivered" value={stats.sent.toString()} tint="bg-emerald-50 border-emerald-200" />
          <StatCard icon={XCircle} label="Failed" value={stats.failed.toString()} tint="bg-rose-50 border-rose-200" />
          <StatCard icon={Zap} label="Success Rate" value={`${successRate}%`} tint="bg-blue-50 border-blue-200" />
        </div>

        {/* === Orchestrator settings === */}
        <Card className="p-5 border-slate-200 shadow-[0_4px_16px_-2px_rgba(15,23,42,0.06)]">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-lg font-bold text-slate-900 font-[Space_Grotesk]">Orchestrator Mode</h2>
              <p className="text-sm text-slate-500">Controls how multiple providers cooperate when sending an OTP.</p>
            </div>
            {settingsDirty && (
              <Button onClick={saveSettings} size="sm" className="gap-2 bg-blue-600 hover:bg-blue-700">
                <Save className="h-4 w-4" /> Save settings
              </Button>
            )}
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label className="text-slate-700 font-semibold">Send strategy</Label>
              <Select value={mode} onValueChange={(v: "race" | "sequential") => setSettingsDirty((s) => ({ ...s, mode: v }))}>
                <SelectTrigger className="mt-1 bg-white"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="race">
                    <div className="flex flex-col text-left">
                      <span className="font-semibold">⚡ Race (recommended)</span>
                      <span className="text-xs text-slate-500">All providers fire in parallel — fastest wins, others auto-cancel</span>
                    </div>
                  </SelectItem>
                  <SelectItem value="sequential">
                    <div className="flex flex-col text-left">
                      <span className="font-semibold">🪜 Sequential</span>
                      <span className="text-xs text-slate-500">Try providers in priority order, only call next if previous fails</span>
                    </div>
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-slate-700 font-semibold">Per-provider timeout (ms)</Label>
              <Input
                type="number" min={1000} max={15000} step={500}
                value={timeout}
                onChange={(e) => setSettingsDirty((s) => ({ ...s, per_provider_timeout_ms: Number(e.target.value) }))}
                className="mt-1 bg-white"
              />
              <p className="text-xs text-slate-500 mt-1">Slower providers are aborted at this threshold (default 4000ms)</p>
            </div>
          </div>
        </Card>

        {/* === Per-provider cards === */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {(providersQ.data ?? []).map((p) => {
            const meta = PROVIDER_META[p.provider] ?? { label: p.provider, envHint: "", brandClass: "bg-slate-50 border-slate-200" };
            const d = dirty[p.provider] ?? {};
            const cur: ProviderRow = { ...p, ...d };
            const statsKey = p.provider === "gmail" ? "gmail-smtp" : p.provider;
            const s = stats.perProvider[statsKey] ?? { wins: 0, failures: 0, totalMs: 0, samples: 0 };
            const avgMs = s.samples ? Math.round(s.totalMs / s.samples) : 0;
            const winRate = s.samples ? Math.round(((s.samples - s.failures) / s.samples) * 100) : 100;
            const quotaPct = cur.daily_quota ? Math.min(100, Math.round((p.daily_sent / cur.daily_quota) * 100)) : 0;
            const quotaDanger = quotaPct >= 90;
            const isDirty = !!dirty[p.provider];

            return (
              <Card key={p.id} className={`p-5 border-2 ${meta.brandClass} shadow-[0_4px_16px_-2px_rgba(15,23,42,0.08)] hover:shadow-[0_8px_24px_-4px_rgba(15,23,42,0.12)] transition-shadow`}>
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="text-lg font-bold text-slate-900 font-[Space_Grotesk]">{meta.label}</h3>
                      {cur.enabled ? (
                        <Badge className="bg-emerald-600 text-white">ON</Badge>
                      ) : (
                        <Badge variant="outline" className="border-slate-400 text-slate-600">OFF</Badge>
                      )}
                    </div>
                    <p className="text-xs text-slate-600 mt-0.5">{meta.envHint}</p>
                  </div>
                  <Switch
                    checked={cur.enabled}
                    onCheckedChange={(v) => patch(p.provider, { enabled: v })}
                  />
                </div>

                <div className="grid grid-cols-2 gap-2 mb-3">
                  <MiniStat label="Wins (7d)" value={s.wins.toString()} />
                  <MiniStat label="Success" value={`${winRate}%`} good={winRate >= 95} />
                  <MiniStat label="Avg latency" value={`${avgMs}ms`} />
                  <MiniStat label="Failures" value={s.failures.toString()} bad={s.failures > 0} />
                </div>

                <div className="space-y-3">
                  <div>
                    <Label className="text-xs text-slate-700 font-semibold">Priority (lower = first)</Label>
                    <Input type="number" min={1} max={99}
                      value={cur.priority}
                      onChange={(e) => patch(p.provider, { priority: Number(e.target.value) })}
                      className="mt-1 h-9 bg-white"
                    />
                  </div>
                  <div>
                    <Label className="text-xs text-slate-700 font-semibold">Daily quota (blank = unlimited)</Label>
                    <Input type="number" min={0}
                      value={cur.daily_quota ?? ""}
                      placeholder="No limit"
                      onChange={(e) => patch(p.provider, { daily_quota: e.target.value === "" ? null : Number(e.target.value) })}
                      className="mt-1 h-9 bg-white"
                    />
                    {cur.daily_quota != null && (
                      <div className="mt-2">
                        <div className="flex items-center justify-between text-xs mb-1">
                          <span className="text-slate-600">Used today: {p.daily_sent} / {cur.daily_quota}</span>
                          {quotaDanger && <span className="text-rose-600 font-semibold flex items-center gap-1"><AlertTriangle className="h-3 w-3" /> Near limit</span>}
                        </div>
                        <div className="h-2 rounded-full bg-slate-200 overflow-hidden">
                          <div className={`h-full transition-all ${quotaDanger ? "bg-rose-500" : "bg-blue-500"}`} style={{ width: `${quotaPct}%` }} />
                        </div>
                      </div>
                    )}
                  </div>
                  {s.lastError && (
                    <div className="text-xs p-2 rounded-md bg-rose-50 border border-rose-200 text-rose-700 truncate" title={s.lastError}>
                      Last error: {s.lastError}
                    </div>
                  )}
                </div>

                {isDirty && (
                  <Button onClick={() => saveProvider(p)} size="sm" className="w-full mt-4 gap-2 bg-blue-600 hover:bg-blue-700">
                    <Save className="h-4 w-4" /> Save changes
                  </Button>
                )}
              </Card>
            );
          })}
        </div>

        {/* === Bottom actions === */}
        <Card className="p-5 border-slate-200 shadow-[0_4px_16px_-2px_rgba(15,23,42,0.06)]">
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div className="flex items-center gap-2">
              <Activity className="h-5 w-5 text-blue-600" />
              <span className="text-sm text-slate-700">Daily counters auto-reset at midnight UTC. Manual reset:</span>
            </div>
            <Button onClick={resetCounters} variant="outline" size="sm">Reset counters now</Button>
          </div>
        </Card>
      </div>
    </div>
  );
}

function StatCard({ icon: Icon, label, value, tint }: { icon: any; label: string; value: string; tint: string }) {
  return (
    <Card className={`p-4 border-2 ${tint} shadow-[0_4px_12px_-2px_rgba(15,23,42,0.06)]`}>
      <div className="flex items-center gap-2 mb-1">
        <Icon className="h-4 w-4 text-slate-700" />
        <span className="text-xs font-semibold text-slate-600 uppercase tracking-wide">{label}</span>
      </div>
      <div className="text-2xl font-bold text-slate-900 font-[Space_Grotesk]">{value}</div>
    </Card>
  );
}

function MiniStat({ label, value, good, bad }: { label: string; value: string; good?: boolean; bad?: boolean }) {
  return (
    <div className="p-2 rounded-md bg-white/60 border border-white">
      <div className="text-[10px] font-semibold text-slate-500 uppercase">{label}</div>
      <div className={`text-sm font-bold ${bad ? "text-rose-600" : good ? "text-emerald-600" : "text-slate-900"}`}>{value}</div>
    </div>
  );
}
