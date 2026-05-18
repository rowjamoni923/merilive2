import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, Flame, Check, Clock, AlertTriangle, Gift, CalendarRange, Ban } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import BeansIcon from "@/components/common/BeansIcon";
import { getTaskDate } from "@/utils/taskDateUtils";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

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

type RangeKey = "today" | "yesterday" | "last7" | "all";

const RANGE_LABELS: Record<RangeKey, string> = {
  today: "Today",
  yesterday: "Yesterday",
  last7: "Last 7 days",
  all: "All",
};

// Return [startDateInclusive, endDateInclusive] in YYYY-MM-DD (Europe/London task date space).
const rangeBounds = (key: RangeKey): { from: string | null; to: string | null } => {
  if (key === "all") return { from: null, to: null };
  const today = getTaskDate(); // YYYY-MM-DD in server tz
  const [y, m, d] = today.split("-").map(Number);
  const todayUtc = Date.UTC(y, m - 1, d);
  const fmt = (ms: number) => {
    const dt = new Date(ms);
    return `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, "0")}-${String(dt.getUTCDate()).padStart(2, "0")}`;
  };
  if (key === "today") return { from: today, to: today };
  if (key === "yesterday") {
    const y1 = fmt(todayUtc - 86_400_000);
    return { from: y1, to: y1 };
  }
  // last7 = today + previous 6 days
  return { from: fmt(todayUtc - 6 * 86_400_000), to: today };
};

const HostBonusLedger = () => {
  const navigate = useNavigate();
  const [ledger, setLedger] = useState<Ledger | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [range, setRange] = useState<RangeKey>("last7");

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

  // Filter days by selected range and compute a cap-aware summary.
  const { filteredDays, summary } = useMemo(() => {
    if (!ledger) {
      return {
        filteredDays: [] as DayRow[],
        summary: { days: 0, completed: 0, recorded: 0, beans: 0, capBroken: 0, capDays: [] as string[] },
      };
    }
    const { from, to } = rangeBounds(range);
    const days = ledger.days.filter((d) => {
      if (!d.task_date) return range === "all";
      if (from && d.task_date < from) return false;
      if (to && d.task_date > to) return false;
      return true;
    });
    const summary = days.reduce(
      (acc, d) => {
        acc.days += 1;
        acc.completed += d.completed_hours;
        acc.recorded += d.rows_recorded;
        acc.beans += d.day_beans;
        if (d.cap_exceeded) {
          acc.capBroken += 1;
          if (d.task_date) acc.capDays.push(d.task_date);
        }
        return acc;
      },
      { days: 0, completed: 0, recorded: 0, beans: 0, capBroken: 0, capDays: [] as string[] },
    );
    return { filteredDays: days, summary };
  }, [ledger, range]);

  return (
    <TooltipProvider delayDuration={150}>
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

            {/* Date-range filter */}
            <section
              className="flex items-center gap-1.5 overflow-x-auto"
              role="tablist"
              aria-label="Date range filter"
            >
              <CalendarRange className="w-4 h-4 text-muted-foreground shrink-0" />
              {(Object.keys(RANGE_LABELS) as RangeKey[]).map((k) => {
                const active = range === k;
                return (
                  <button
                    key={k}
                    role="tab"
                    aria-selected={active}
                    onClick={() => setRange(k)}
                    className={`text-[11px] px-2.5 py-1 rounded-full border whitespace-nowrap transition-colors ${
                      active
                        ? "bg-primary text-primary-foreground border-primary"
                        : "border-border/60 text-muted-foreground hover:bg-muted"
                    }`}
                  >
                    {RANGE_LABELS[k]}
                  </button>
                );
              })}
            </section>

            {/* Range summary — hours vs cap, so the 5-hour cap break is obvious */}
            <section
              className={`rounded-xl border p-3 ${
                summary.capBroken > 0
                  ? "border-destructive/60 bg-destructive/5"
                  : "border-border/60 bg-card/60"
              }`}
              aria-live="polite"
            >
              <div className="flex items-center justify-between mb-2">
                <p className="text-[11px] text-muted-foreground uppercase tracking-wide">
                  {RANGE_LABELS[range]} summary
                </p>
                <span className="text-[10px] text-muted-foreground tabular-nums">
                  {summary.days} day{summary.days === 1 ? "" : "s"}
                </span>
              </div>
              <div className="grid grid-cols-3 gap-2 text-center">
                <SummaryCell
                  top={`${summary.completed}`}
                  bottom={`completed hr${summary.completed === 1 ? "" : "s"}`}
                />
                <SummaryCell
                  top={`${summary.recorded} / ${ledger.max_hours_per_day * Math.max(summary.days, 1)}`}
                  bottom={`rows vs cap`}
                  danger={summary.capBroken > 0}
                />
                <SummaryCell
                  top={summary.beans.toLocaleString()}
                  bottom="beans earned"
                  icon={<BeansIcon size={12} />}
                />
              </div>
              {summary.capBroken > 0 ? (
                <div className="flex items-start gap-1.5 text-[11px] text-destructive mt-2">
                  <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                  <span>
                    {summary.capBroken} day{summary.capBroken === 1 ? "" : "s"} exceeded the{" "}
                    {ledger.max_hours_per_day}-hour cap
                    {summary.capDays.length > 0 && `: ${summary.capDays.join(", ")}`}.
                  </span>
                </div>
              ) : summary.days > 0 ? (
                <p className="text-[11px] text-green-500 mt-2 flex items-center gap-1">
                  <Check className="w-3 h-3" /> Within {ledger.max_hours_per_day}-hour daily cap.
                </p>
              ) : null}
            </section>

            {filteredDays.length === 0 && (
              <p className="text-sm text-muted-foreground text-center py-8">
                No bonus activity in this range.
              </p>
            )}

            <div className="space-y-3">
              {filteredDays.map((d) => (
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

const SummaryCell = ({
  top,
  bottom,
  icon,
  danger,
}: {
  top: string;
  bottom: string;
  icon?: React.ReactNode;
  danger?: boolean;
}) => (
  <div className="flex flex-col items-center gap-0.5">
    <div className={`flex items-center gap-1 text-sm font-bold tabular-nums ${danger ? "text-destructive" : ""}`}>
      {icon}
      {top}
    </div>
    <span className="text-[10px] text-muted-foreground">{bottom}</span>
  </div>
);

export default HostBonusLedger;
