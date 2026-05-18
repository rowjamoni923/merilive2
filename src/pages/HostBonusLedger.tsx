import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, Flame, Check, Clock, AlertTriangle, Gift } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import BeansIcon from "@/components/common/BeansIcon";

interface HourRow {
  hour_number: number;
  target_minutes: number;
  minutes_accumulated: number;
  completed: boolean;
  claimed: boolean;
  claimed_beans: number;
  bonus_amount: number;
  claimed_at: string | null;
  last_minute_at: string | null;
}

interface DayRow {
  program_day: number;
  task_date: string | null;
  hours: HourRow[];
  completed_hours: number;
  rows_recorded: number;
  day_beans: number;
  cap_exceeded: boolean;
}

interface Ledger {
  success: boolean;
  max_hours_per_day: number;
  days: DayRow[];
  totals: { total_beans: number; total_claimed_hours: number; total_completed_hours: number };
}

const HostBonusLedger = () => {
  const navigate = useNavigate();
  const [ledger, setLedger] = useState<Ledger | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    const { data, error } = await supabase.rpc("get_my_host_bonus_ledger", { _limit_days: 30 });
    if (error) {
      setError(error.message);
    } else {
      setLedger(data as unknown as Ledger);
    }
    setLoading(false);
  };

  useEffect(() => {
    load();
  }, []);

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="sticky top-0 z-10 flex items-center gap-3 px-4 py-3 border-b border-border/40 bg-background/95 backdrop-blur">
        <button onClick={() => navigate(-1)} className="p-1.5 rounded-lg hover:bg-muted">
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div className="flex items-center gap-2">
          <Flame className="w-5 h-5 text-primary" />
          <h1 className="text-base font-semibold">Bonus Ledger</h1>
        </div>
      </header>

      <main className="px-4 py-4 space-y-4 max-w-2xl mx-auto">
        {loading && <p className="text-sm text-muted-foreground">Loading…</p>}
        {error && <p className="text-sm text-destructive">{error}</p>}

        {ledger && (
          <>
            <section className="grid grid-cols-3 gap-2">
              <Stat label="Total Beans" value={ledger.totals.total_beans.toLocaleString()} icon={<BeansIcon size={14} />} />
              <Stat label="Claimed Hours" value={String(ledger.totals.total_claimed_hours)} icon={<Gift className="w-3.5 h-3.5" />} />
              <Stat label="Cap / Day" value={`${ledger.max_hours_per_day} hr`} icon={<Clock className="w-3.5 h-3.5" />} />
            </section>

            {ledger.days.length === 0 && (
              <p className="text-sm text-muted-foreground text-center py-8">No bonus activity yet.</p>
            )}

            <div className="space-y-3">
              {ledger.days.map((d) => (
                <article
                  key={d.program_day}
                  className="rounded-xl border border-border/60 bg-card/60 p-3"
                >
                  <header className="flex items-center justify-between mb-2">
                    <div>
                      <p className="text-sm font-semibold">Program Day {d.program_day}</p>
                      <p className="text-[11px] text-muted-foreground">
                        {d.task_date ?? "—"} · {d.completed_hours}/{ledger.max_hours_per_day} hours completed
                      </p>
                    </div>
                    <div className="flex items-center gap-1">
                      <BeansIcon size={12} />
                      <span className="text-sm font-bold">{d.day_beans.toLocaleString()}</span>
                    </div>
                  </header>

                  {d.cap_exceeded && (
                    <div className="flex items-center gap-1.5 text-[11px] text-destructive bg-destructive/10 rounded-md px-2 py-1 mb-2">
                      <AlertTriangle className="w-3.5 h-3.5" />
                      Cap exceeded — {d.rows_recorded} rows vs {ledger.max_hours_per_day}-hour cap.
                    </div>
                  )}

                  <ul className="space-y-1.5">
                    {d.hours.map((h) => {
                      const pct = Math.min(
                        100,
                        (h.minutes_accumulated / Math.max(h.target_minutes, 1)) * 100,
                      );
                      return (
                        <li
                          key={h.hour_number}
                          className="flex items-center gap-2 text-[11px] bg-muted/40 rounded-md px-2 py-1.5"
                        >
                          <span className="w-10 font-semibold tabular-nums">H{h.hour_number}</span>
                          <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden">
                            <div
                              className={`h-full ${h.completed ? "bg-green-500" : "bg-primary"}`}
                              style={{ width: `${pct}%` }}
                            />
                          </div>
                          <span className="w-16 text-right tabular-nums text-muted-foreground">
                            {h.minutes_accumulated}/{h.target_minutes}m
                          </span>
                          {h.claimed ? (
                            <span className="flex items-center gap-0.5 text-green-500 font-semibold w-20 justify-end">
                              <Check className="w-3 h-3" />+{h.claimed_beans.toLocaleString()}
                            </span>
                          ) : h.completed ? (
                            <span className="text-amber-500 font-semibold w-20 text-right">unclaimed</span>
                          ) : (
                            <span className="text-muted-foreground w-20 text-right">—</span>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                </article>
              ))}
            </div>
          </>
        )}
      </main>
    </div>
  );
};

const Stat = ({ label, value, icon }: { label: string; value: string; icon: React.ReactNode }) => (
  <div className="rounded-xl border border-border/60 bg-card/60 p-2.5">
    <div className="flex items-center gap-1 text-[10px] text-muted-foreground">{icon} {label}</div>
    <p className="text-sm font-bold mt-0.5">{value}</p>
  </div>
);

export default HostBonusLedger;
