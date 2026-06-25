import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Radio, Zap, Clock, AlertTriangle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface AvailabilityRow {
  host_id: string;
  is_available: boolean;
  auto_on_when_live: boolean;
  last_active_at: string;
  suspended_until: string | null;
  suspension_reason: string | null;
}

interface StatsRow {
  acceptance_pct: number;
  rings_received_7d: number;
  rings_accepted_7d: number;
  avg_rating_7d: number;
  rating_count_7d: number;
  is_queue_suppressed: boolean;
  suppressed_reason: string | null;
}

/**
 * Host "Available for Match Call" toggle.
 * Mirrors Chamet's Match availability switch on the host dashboard.
 */
export function HostMatchToggleCard() {
  const [userId, setUserId] = useState<string | null>(null);
  const [row, setRow] = useState<AvailabilityRow | null>(null);
  const [stats, setStats] = useState<StatsRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Load
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user || cancelled) { setLoading(false); return; }
      setUserId(user.id);

      const [avail, st] = await Promise.all([
        supabase.from("host_match_availability").select("*").eq("host_id", user.id).maybeSingle(),
        supabase.from("host_match_stats").select("*").eq("host_id", user.id).maybeSingle(),
      ]);
      if (cancelled) return;
      setRow((avail.data as AvailabilityRow) ?? null);
      setStats((st.data as StatsRow) ?? null);
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, []);

  // Realtime: reflect server-side flips (auto-on when live, suspension lift, etc.)
  useEffect(() => {
    if (!userId) return;
    const channel = supabase
      .channel(`host_match_avail:${userId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "host_match_availability", filter: `host_id=eq.${userId}` },
        (payload) => setRow((payload.new as AvailabilityRow) ?? null),
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [userId]);

  // Heartbeat: keep last_active_at fresh every 60s while available
  useEffect(() => {
    if (!userId || !row?.is_available) return;
    const beat = async () => {
      await supabase.rpc("random_match_touch_host_availability", { _host_id: userId });
    };
    const id = setInterval(beat, 60_000);
    return () => clearInterval(id);
  }, [userId, row?.is_available]);

  const isSuspended = row?.suspended_until && new Date(row.suspended_until) > new Date();

  const toggle = async (next: boolean) => {
    if (!userId || saving) return;
    if (isSuspended) {
      toast.error("Your match availability is temporarily suspended.");
      return;
    }
    setSaving(true);
    const { data, error } = await supabase.rpc("random_match_set_host_availability", {
      _host_id: userId,
      _on: next,
    });
    setSaving(false);
    if (error) {
      toast.error("Could not update availability");
      return;
    }
    setRow(data as AvailabilityRow);
    toast.success(next ? "You're online for Match Call" : "Match Call turned off");
  };

  const toggleAutoLive = async (next: boolean) => {
    if (!userId) return;
    const { error } = await supabase
      .from("host_match_availability")
      .upsert({ host_id: userId, auto_on_when_live: next }, { onConflict: "host_id" });
    if (error) {
      toast.error("Could not update auto-on setting");
      return;
    }
    setRow((r) => (r ? { ...r, auto_on_when_live: next } : r));
  };

  if (loading) return null;

  const on = !!row?.is_available;

  return (
    <Card className="border-primary/30">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center justify-between text-base">
          <span className="flex items-center gap-2">
            <Radio className={`w-5 h-5 ${on ? "text-success-500 animate-pulse" : "text-muted-foreground"}`} />
            Match Call Availability
          </span>
          {on && !isSuspended && (
            <Badge className="bg-success-500/15 text-success-600 border-success-500/30">Live in pool</Badge>
          )}
          {isSuspended && (
            <Badge variant="destructive">Suspended</Badge>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Main toggle */}
        <div className="flex items-center justify-between p-4 bg-gradient-to-r from-primary/10 to-brand-500/10 rounded-xl border border-primary/20">
          <div className="min-w-0 pr-3">
            <p className="text-sm font-medium">Available for incoming match calls</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              Callers in the global pool can be matched with you.
            </p>
          </div>
          <Switch checked={on} disabled={saving || !!isSuspended} onCheckedChange={toggle} />
        </div>

        {/* Auto-on while live */}
        <div className="flex items-center justify-between rounded-lg border p-3">
          <div className="flex items-start gap-2 min-w-0 pr-3">
            <Zap className="w-4 h-4 text-warning-500 mt-0.5 shrink-0" />
            <div className="min-w-0">
              <p className="text-sm font-medium">Auto-on while I'm Live</p>
              <p className="text-xs text-muted-foreground">
                Turn match availability on automatically when you start a live stream.
              </p>
            </div>
          </div>
          <Switch
            checked={!!row?.auto_on_when_live}
            onCheckedChange={toggleAutoLive}
          />
        </div>

        {isSuspended && (
          <div className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/5 p-3">
            <AlertTriangle className="w-4 h-4 text-destructive mt-0.5 shrink-0" />
            <div className="text-xs">
              <p className="font-medium text-destructive">Temporarily suspended</p>
              <p className="text-muted-foreground">
                {row?.suspension_reason || "Multiple user reports."} Until{" "}
                {new Date(row!.suspended_until!).toLocaleString()}.
              </p>
            </div>
          </div>
        )}

        {stats && stats.rings_received_7d > 0 && (
          <div className="grid grid-cols-3 gap-2 text-center">
            <div className="p-2 bg-muted rounded-lg">
              <p className="text-base font-bold">{stats.acceptance_pct}%</p>
              <p className="text-[10px] text-muted-foreground">Accept (7d)</p>
            </div>
            <div className="p-2 bg-muted rounded-lg">
              <p className="text-base font-bold">{stats.rings_received_7d}</p>
              <p className="text-[10px] text-muted-foreground">Rings (7d)</p>
            </div>
            <div className="p-2 bg-muted rounded-lg">
              <p className="text-base font-bold">
                {stats.rating_count_7d > 0 ? stats.avg_rating_7d.toFixed(1) : "—"}
              </p>
              <p className="text-[10px] text-muted-foreground">Rating</p>
            </div>
          </div>
        )}

        {stats?.is_queue_suppressed && (
          <div className="flex items-start gap-2 rounded-lg border border-warning-500/30 bg-warning-500/5 p-3">
            <Clock className="w-4 h-4 text-warning-500 mt-0.5 shrink-0" />
            <p className="text-xs text-muted-foreground">
              {stats.suppressed_reason || "Your queue priority is temporarily reduced."} Keep accept rate
              between 60–75% to recover.
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default HostMatchToggleCard;
