/**
 * RatingProofHistory — user-facing list of every rating_reward_claims row
 * the signed-in user has ever submitted.
 *
 * Columns: submitted timestamp, reviewed timestamp, status pill,
 * rejection reason (if any), thumbnail of the uploaded screenshot.
 *
 * Reads only the current user's rows (RLS-enforced on rating_reward_claims).
 */
import { useEffect, useState, useCallback } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, Clock, CheckCircle2, XCircle, Star, ImageIcon, RefreshCw } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAppSyncEvent } from "@/hooks/useAppSyncEvent";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

type ClaimStatus = "pending" | "approved" | "rejected";

interface ClaimHistoryRow {
  id: string;
  status: ClaimStatus;
  rejection_reason: string | null;
  screenshot_url: string | null;
  created_at: string;
  reviewed_at: string | null;
  reward_amount: number | null;
  reward_type: string | null;
  platform: string | null;
}

function formatTimestamp(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  const date = d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
  const time = d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
  return `${date} · ${time}`;
}

const STATUS_META: Record<ClaimStatus, { label: string; Icon: typeof Clock; pillClass: string }> = {
  pending:  { label: "Under Review", Icon: Clock,        pillClass: "bg-amber-50 text-amber-700 border border-amber-200" },
  approved: { label: "Approved",     Icon: CheckCircle2, pillClass: "bg-emerald-50 text-emerald-700 border border-emerald-200" },
  rejected: { label: "Rejected",     Icon: XCircle,      pillClass: "bg-rose-50 text-rose-700 border border-rose-200" },
};

export default function RatingProofHistory() {
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<ClaimHistoryRow[]>([]);
  const [userId, setUserId] = useState<string | null>(null);

  const load = useCallback(async (uid: string) => {
    setLoading(true);
    const { data, error } = await supabase
      .from("rating_reward_claims")
      .select("id, status, rejection_reason, screenshot_url, created_at, reviewed_at, reward_amount, reward_type, platform")
      .eq("user_id", uid)
      .order("created_at", { ascending: false });
    if (error) {
      console.error("Rating history load error:", error);
      toast.error("Failed to load history");
      setRows([]);
    } else {
      setRows((data ?? []) as ClaimHistoryRow[]);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (cancelled || !user) {
        setLoading(false);
        return;
      }
      setUserId(user.id);
      await load(user.id);
    })();
    return () => { cancelled = true; };
  }, [load]);

  useEffect(() => {
    if (!userId) return;
    const ch = supabase
      .channel(`rating-history-${userId}`)
      .on("postgres_changes", {
        event: "*",
        schema: "public",
        table: "rating_reward_claims",
        filter: `user_id=eq.${userId}`,
      }, () => { void load(userId); })
      .subscribe();
    return () => { void supabase.removeChannel(ch); };
  }, [userId, load]);

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="sticky top-0 z-10 bg-white/95 backdrop-blur border-b border-slate-200">
        <div className="max-w-md mx-auto flex items-center gap-3 px-3 py-3">
          <Link
            to="/profile"
            className="w-9 h-9 rounded-full flex items-center justify-center hover:bg-slate-100"
            aria-label="Back"
          >
            <ArrowLeft className="w-5 h-5 text-slate-700" />
          </Link>
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg border border-amber-100 bg-amber-50 flex items-center justify-center">
              <Star className="w-4 h-4 text-amber-600" />
            </div>
            <div>
              <h1 className="text-[15px] font-semibold text-slate-800 leading-tight">Rating Proof History</h1>
              <p className="text-[11px] text-slate-500 leading-tight">All your submitted claims</p>
            </div>
          </div>
          <button
            onClick={() => userId && load(userId)}
            className="ml-auto w-9 h-9 rounded-full flex items-center justify-center hover:bg-slate-100"
            aria-label="Refresh"
          >
            <RefreshCw className={cn("w-4 h-4 text-slate-600", loading && "animate-spin")} />
          </button>
        </div>
      </header>

      <main className="max-w-md mx-auto px-3 py-4 space-y-2.5">
        {loading && rows.length === 0 ? (
          <div className="space-y-2.5">
            {[0, 1, 2].map((i) => (
              <div key={i} className="rounded-xl bg-white border border-slate-200 p-3 animate-pulse">
                <div className="h-3 w-32 bg-slate-200 rounded mb-2" />
                <div className="h-2.5 w-48 bg-slate-100 rounded" />
              </div>
            ))}
          </div>
        ) : rows.length === 0 ? (
          <div className="rounded-xl bg-white border border-slate-200 p-8 text-center">
            <div className="w-12 h-12 mx-auto mb-3 rounded-full bg-slate-100 flex items-center justify-center">
              <Star className="w-5 h-5 text-slate-400" />
            </div>
            <p className="text-sm font-semibold text-slate-700">No claims yet</p>
            <p className="text-[12px] text-slate-500 mt-1 leading-relaxed">
              When you submit a Play Store rating screenshot, it will appear here with its review status.
            </p>
          </div>
        ) : (
          rows.map((row, idx) => {
            const status = (row.status || "pending") as ClaimStatus;
            const meta = STATUS_META[status] ?? STATUS_META.pending;
            return (
              <article
                key={row.id}
                className="rounded-xl bg-white border border-slate-200 overflow-hidden"
              >
                <div className="flex items-start gap-3 p-3">
                  {/* Thumbnail */}
                  <div className="flex-shrink-0">
                    {row.screenshot_url ? (
                      <a
                        href={row.screenshot_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="block w-14 h-14 rounded-lg overflow-hidden border border-slate-200 bg-slate-100"
                      >
                        <img
                          src={row.screenshot_url}
                          alt="Rating screenshot"
                          className="w-full h-full object-cover"
                          loading="lazy"
                        />
                      </a>
                    ) : (
                      <div className="w-14 h-14 rounded-lg border border-slate-200 bg-slate-100 flex items-center justify-center">
                        <ImageIcon className="w-5 h-5 text-slate-400" />
                      </div>
                    )}
                  </div>

                  {/* Body */}
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-[10px] font-semibold text-slate-400">
                        #{rows.length - idx}
                      </span>
                      <span className={cn(
                        "inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold",
                        meta.pillClass,
                      )}>
                        <meta.Icon className="w-3 h-3" />
                        {meta.label}
                      </span>
                      {row.platform && (
                        <span className="text-[10px] text-slate-400 capitalize">
                          · {row.platform}
                        </span>
                      )}
                    </div>

                    <div className="text-[12px] text-slate-700">
                      <span className="text-slate-500">Submitted</span>{" "}
                      <span className="font-medium">{formatTimestamp(row.created_at)}</span>
                    </div>

                    {status !== "pending" && (
                      <div className="text-[12px] text-slate-700 mt-0.5">
                        <span className="text-slate-500">
                          {status === "approved" ? "Approved" : "Rejected"}
                        </span>{" "}
                        <span className="font-medium">{formatTimestamp(row.reviewed_at)}</span>
                      </div>
                    )}

                    {status === "approved" && row.reward_amount && row.reward_amount > 0 && (
                      <div className="mt-1.5 inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-emerald-50 border border-emerald-200 text-[11px] font-semibold text-emerald-700">
                        +{row.reward_amount.toLocaleString()}{" "}
                        {row.reward_type === "host_beans" ? "🫘 Beans" : "💎 Diamonds"}
                      </div>
                    )}

                    {status === "rejected" && (
                      <div className="mt-1.5 rounded-md border border-rose-200 bg-rose-50 px-2 py-1.5">
                        <div className="text-[10px] font-semibold text-rose-700/80 uppercase tracking-wide">
                          Reason
                        </div>
                        <div className="text-[11.5px] text-rose-700 leading-snug break-words mt-0.5">
                          {row.rejection_reason?.trim() ||
                            "Screenshot did not pass review."}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </article>
            );
          })
        )}

        <p className="text-[10.5px] text-slate-400 text-center pt-2 pb-6">
          Showing your latest claims. Reviews typically complete within 24 hours.
        </p>
      </main>
    </div>
  );
}
