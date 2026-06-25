import { useEffect, useState } from "react";
import { Save, Phone, RefreshCw, AlertTriangle } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { adminSupabase as supabase } from "@/integrations/supabase/adminClient";
import { toast } from "sonner";
import AdminPageHeader from "@/components/admin/AdminPageHeader";

interface RandomCallSettings {
  id: number;
  is_enabled: boolean;
  min_billable_seconds: number;
  free_trial_seconds: number;
  host_split_pct: number;
  host_min_rate_coins_per_min: number;
  host_max_rate_coins_per_min: number;
  default_host_rate_coins_per_min: number;
  ring_timeout_seconds: number;
  match_timeout_seconds: number;
  price_change_cooldown_seconds: number;
  daily_skip_limit: number;
  skip_cooldown_seconds: number;
  flash_disconnect_threshold: number;
  flash_disconnect_window_seconds: number;
  flash_disconnect_cooldown_minutes: number;
  vip_match_priority_multiplier: number;
  vip_free_trial_bonus_seconds: number;
  enable_country_filter: boolean;
  country_filter_requires_vip: boolean;
  enable_gender_filter: boolean;
  min_host_level_for_pool: number;
  preauth_minutes_hold: number;
  livekit_room_max_seconds: number;
  coins_to_usd_rate: number;
  beans_to_usd_rate: number;
  score_weight_verification: number;
  score_weight_vip: number;
  score_weight_engagement: number;
  score_weight_profile: number;
  score_weight_level: number;
  score_weight_history: number;
  engagement_fresh_seconds: number;
  level_norm_cap: number;
  same_pair_block_minutes: number;
  queue_resort_interval_seconds: number;
}


const NUM = (s: string) => (s === "" ? 0 : Number(s));

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs font-medium text-muted-foreground">{label}</Label>
      {children}
      {hint && <p className="text-[11px] text-muted-foreground/70">{hint}</p>}
    </div>
  );
}

export default function AdminRandomCallSettings() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [s, setS] = useState<RandomCallSettings | null>(null);
  const [stats, setStats] = useState<{ active: number; queued: number; today: number } | null>(null);

  const load = async () => {
    setLoading(true);
    const { data, error } = await (supabase as any)
      .from("random_call_settings")
      .select("*")
      .eq("id", 1)
      .maybeSingle();
    if (error) {
      toast.error("Failed to load settings: " + error.message);
    } else if (!data) {
      toast.error("Settings row missing — please re-run migration");
    } else {
      setS(data as RandomCallSettings);
    }
    // stats
    const [{ count: queued }, { count: active }, { count: today }] = await Promise.all([
      (supabase as any).from("random_call_queue").select("id", { count: "exact", head: true }).eq("status", "waiting"),
      (supabase as any).from("random_call_sessions").select("id", { count: "exact", head: true }).in("status", ["ringing", "active"]),
      (supabase as any).from("random_call_sessions").select("id", { count: "exact", head: true }).gte("started_at", new Date(new Date().setHours(0, 0, 0, 0)).toISOString()),
    ]);
    setStats({ queued: queued || 0, active: active || 0, today: today || 0 });
    setLoading(false);
  };

  useEffect(() => {
    load();
  }, []);

  const save = async () => {
    if (!s) return;
    setSaving(true);
    const { id, ...rest } = s;
    const { error } = await (supabase as any)
      .from("random_call_settings")
      .update({ ...rest, updated_at: new Date().toISOString() })
      .eq("id", 1);
    setSaving(false);
    if (error) {
      toast.error("Save failed: " + error.message);
      return;
    }
    toast.success("Random Call settings saved — applies instantly");
  };

  const update = <K extends keyof RandomCallSettings>(k: K, v: RandomCallSettings[K]) =>
    setS((prev) => (prev ? { ...prev, [k]: v } : prev));

  if (loading || !s) {
    return (
      <div className="p-6">
        <AdminPageHeader title="Random Call Settings" subtitle="Loading..." icon={Phone} />
      </div>
    );
  }

  return (
    <div className="p-4 md:p-6 space-y-5 max-w-5xl mx-auto">
      <AdminPageHeader
        title="Random Call (Match Call)"
        subtitle="Single source of truth for the 1v1 random video-match feature. All numbers apply instantly."
        icon={Phone}
      />

      {stats && (
        <div className="grid grid-cols-3 gap-3">
          <Card><CardContent className="p-4"><div className="text-xs text-muted-foreground">Waiting in queue</div><div className="text-2xl font-bold">{stats.queued}</div></CardContent></Card>
          <Card><CardContent className="p-4"><div className="text-xs text-muted-foreground">Active calls</div><div className="text-2xl font-bold">{stats.active}</div></CardContent></Card>
          <Card><CardContent className="p-4"><div className="text-xs text-muted-foreground">Calls today</div><div className="text-2xl font-bold">{stats.today}</div></CardContent></Card>
        </div>
      )}

      <Alert>
        <AlertTriangle className="h-4 w-4" />
        <AlertDescription className="text-xs">
          <strong>40-second rule:</strong> Calls ending before <code>min_billable_seconds</code> award <strong>0 beans</strong> to the host and do <strong>not refund</strong> the caller (unless inside the free trial window). This is enforced server-side in <code>settle_random_call()</code>.
        </AlertDescription>
      </Alert>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center justify-between">
            <span>Master controls</span>
            <div className="flex items-center gap-3">
              <span className="text-xs text-muted-foreground">Feature enabled</span>
              <Switch checked={s.is_enabled} onCheckedChange={(v) => update("is_enabled", v)} />
            </div>
          </CardTitle>
          <CardDescription>Toggle off to immediately stop new matches (active calls keep running).</CardDescription>
        </CardHeader>
      </Card>

      <Tabs defaultValue="billing" className="w-full">
        <TabsList className="grid grid-cols-5 w-full">
          <TabsTrigger value="billing">Billing</TabsTrigger>
          <TabsTrigger value="matching">Matching</TabsTrigger>
          <TabsTrigger value="scoring">Scoring</TabsTrigger>
          <TabsTrigger value="abuse">Anti-abuse</TabsTrigger>
          <TabsTrigger value="vip">VIP & Misc</TabsTrigger>
        </TabsList>


        <TabsContent value="billing">
          <Card>
            <CardHeader><CardTitle className="text-base">Pricing & Revenue Split</CardTitle></CardHeader>
            <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Field label="Minimum billable seconds (40s rule)" hint="Calls shorter than this earn nothing. Industry standard: 40.">
                <Input type="number" min={10} max={120} value={s.min_billable_seconds} onChange={(e) => update("min_billable_seconds", NUM(e.target.value))} />
              </Field>
              <Field label="Free trial seconds" hint="Free window at call start (not charged). Chamet uses 90.">
                <Input type="number" min={0} max={300} value={s.free_trial_seconds} onChange={(e) => update("free_trial_seconds", NUM(e.target.value))} />
              </Field>
              <Field label="Host revenue split (0–1)" hint="0.60 = host gets 60% of charged coins as beans.">
                <Input type="number" step="0.01" min={0.2} max={0.8} value={s.host_split_pct} onChange={(e) => update("host_split_pct", Number(e.target.value))} />
              </Field>
              <Field label="Default host rate (coins/min)" hint="Applied to new hosts who haven't set a price.">
                <Input type="number" value={s.default_host_rate_coins_per_min} onChange={(e) => update("default_host_rate_coins_per_min", NUM(e.target.value))} />
              </Field>
              <Field label="Host rate FLOOR (coins/min)" hint="Lowest price a host can set.">
                <Input type="number" value={s.host_min_rate_coins_per_min} onChange={(e) => update("host_min_rate_coins_per_min", NUM(e.target.value))} />
              </Field>
              <Field label="Host rate CEILING (coins/min)" hint="Highest price a host can set.">
                <Input type="number" value={s.host_max_rate_coins_per_min} onChange={(e) => update("host_max_rate_coins_per_min", NUM(e.target.value))} />
              </Field>
              <Field label="Pre-auth hold (minutes)" hint="Coins held before caller enters queue (insufficient balance = rejected).">
                <Input type="number" min={1} max={10} value={s.preauth_minutes_hold} onChange={(e) => update("preauth_minutes_hold", NUM(e.target.value))} />
              </Field>
              <Field label="Price-change cooldown (seconds)" hint="Lock-out after host adjusts rate. 3600 = 1 hour.">
                <Input type="number" value={s.price_change_cooldown_seconds} onChange={(e) => update("price_change_cooldown_seconds", NUM(e.target.value))} />
              </Field>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="matching">
          <Card>
            <CardHeader><CardTitle className="text-base">Matching & Timeouts</CardTitle></CardHeader>
            <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Field label="Host ring timeout (seconds)" hint="How long host has to accept before re-routing.">
                <Input type="number" min={5} max={30} value={s.ring_timeout_seconds} onChange={(e) => update("ring_timeout_seconds", NUM(e.target.value))} />
              </Field>
              <Field label="No-match timeout (seconds)" hint="Max queue wait before failing.">
                <Input type="number" min={30} max={600} value={s.match_timeout_seconds} onChange={(e) => update("match_timeout_seconds", NUM(e.target.value))} />
              </Field>
              <Field label="Min host level for pool" hint="Hosts below this level cannot enter random pool.">
                <Input type="number" min={1} max={10} value={s.min_host_level_for_pool} onChange={(e) => update("min_host_level_for_pool", NUM(e.target.value))} />
              </Field>
              <Field label="LiveKit room max duration (seconds)" hint="Hard cap on any single call.">
                <Input type="number" value={s.livekit_room_max_seconds} onChange={(e) => update("livekit_room_max_seconds", NUM(e.target.value))} />
              </Field>
              <div className="flex items-center justify-between md:col-span-2 p-3 border rounded">
                <div><div className="text-sm font-medium">Country filter enabled</div><div className="text-xs text-muted-foreground">Let callers filter hosts by country.</div></div>
                <Switch checked={s.enable_country_filter} onCheckedChange={(v) => update("enable_country_filter", v)} />
              </div>
              <div className="flex items-center justify-between md:col-span-2 p-3 border rounded">
                <div><div className="text-sm font-medium">Country filter requires VIP</div><div className="text-xs text-muted-foreground">Gate the country filter behind VIP subscription.</div></div>
                <Switch checked={s.country_filter_requires_vip} onCheckedChange={(v) => update("country_filter_requires_vip", v)} />
              </div>
              <div className="flex items-center justify-between md:col-span-2 p-3 border rounded">
                <div><div className="text-sm font-medium">Gender filter enabled</div><div className="text-xs text-muted-foreground">Allow opposite-gender preference.</div></div>
                <Switch checked={s.enable_gender_filter} onCheckedChange={(v) => update("enable_gender_filter", v)} />
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="abuse">
          <Card>
            <CardHeader><CardTitle className="text-base">Anti-abuse</CardTitle></CardHeader>
            <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Field label="Daily skip limit" hint="Max times a caller can skip hosts per day.">
                <Input type="number" min={5} max={200} value={s.daily_skip_limit} onChange={(e) => update("daily_skip_limit", NUM(e.target.value))} />
              </Field>
              <Field label="Skip cooldown (seconds)" hint="Forced delay between consecutive skips.">
                <Input type="number" min={1} max={30} value={s.skip_cooldown_seconds} onChange={(e) => update("skip_cooldown_seconds", NUM(e.target.value))} />
              </Field>
              <Field label="Flash-disconnect threshold" hint="Sub-minimum calls allowed per host in window.">
                <Input type="number" min={1} max={10} value={s.flash_disconnect_threshold} onChange={(e) => update("flash_disconnect_threshold", NUM(e.target.value))} />
              </Field>
              <Field label="Flash-disconnect window (seconds)" hint="Rolling window for counting flash-disconnects.">
                <Input type="number" value={s.flash_disconnect_window_seconds} onChange={(e) => update("flash_disconnect_window_seconds", NUM(e.target.value))} />
              </Field>
              <Field label="Flash-disconnect cooldown (minutes)" hint="How long host is removed from pool after breach.">
                <Input type="number" min={5} max={1440} value={s.flash_disconnect_cooldown_minutes} onChange={(e) => update("flash_disconnect_cooldown_minutes", NUM(e.target.value))} />
              </Field>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="vip">
          <Card>
            <CardHeader><CardTitle className="text-base">VIP & Conversion</CardTitle></CardHeader>
            <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Field label="VIP match priority multiplier" hint="VIP callers' queue score is boosted by this factor.">
                <Input type="number" step="0.1" min={1} max={5} value={s.vip_match_priority_multiplier} onChange={(e) => update("vip_match_priority_multiplier", Number(e.target.value))} />
              </Field>
              <Field label="VIP free-trial bonus seconds" hint="Extra free seconds added on top of free_trial_seconds for VIPs.">
                <Input type="number" min={0} max={120} value={s.vip_free_trial_bonus_seconds} onChange={(e) => update("vip_free_trial_bonus_seconds", NUM(e.target.value))} />
              </Field>
              <Field label="Coins per USD (display only)">
                <Input type="number" value={s.coins_to_usd_rate} onChange={(e) => update("coins_to_usd_rate", NUM(e.target.value))} />
              </Field>
              <Field label="Beans per USD (display only)">
                <Input type="number" value={s.beans_to_usd_rate} onChange={(e) => update("beans_to_usd_rate", NUM(e.target.value))} />
              </Field>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <div className="sticky bottom-0 -mx-4 md:-mx-6 px-4 md:px-6 py-3 bg-background/95 backdrop-blur border-t flex gap-2 justify-end">
        <Button variant="outline" onClick={load} disabled={saving}><RefreshCw className="h-4 w-4 mr-1" />Reload</Button>
        <Button onClick={save} disabled={saving}><Save className="h-4 w-4 mr-1" />{saving ? "Saving..." : "Save changes"}</Button>
      </div>
    </div>
  );
}
