/**
 * RatingProofStatusRow — Pkg64
 *
 * User-facing status row for the rating-reward proof claim.
 * - Only renders when the signed-in user has at least one rating_reward_claim row.
 * - Reflects status (pending / approved / rejected) in real time via postgres_changes.
 * - Tap behaviour:
 *     pending  → toast ("under review")
 *     approved → toast with reward credited message
 *     rejected → re-opens the proof dialog via the existing
 *                `open-rating-proof-popup` window event so the user can retry.
 *
 * Mounted on Profile.tsx (own profile only). Self-contained — no parent props.
 */
import { useEffect, useState, useCallback } from "react";
import { Star, ChevronRight, Clock, CheckCircle2, XCircle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

type ClaimStatus = "pending" | "approved" | "rejected";

interface ClaimRow {
  status: ClaimStatus;
  rejection_reason: string | null;
  created_at: string;
}

const STATUS_META: Record<ClaimStatus, {
  label: string;
  Icon: typeof Clock;
  iconClass: string;
  pillClass: string;
}> = {
  pending: {
    label: "Under Review",
    Icon: Clock,
    iconClass: "text-amber-600",
    pillClass: "bg-amber-50 text-amber-700 border border-amber-200",
  },
  approved: {
    label: "Approved",
    Icon: CheckCircle2,
    iconClass: "text-emerald-600",
    pillClass: "bg-emerald-50 text-emerald-700 border border-emerald-200",
  },
  rejected: {
    label: "Rejected — Retry",
    Icon: XCircle,
    iconClass: "text-rose-600",
    pillClass: "bg-rose-50 text-rose-700 border border-rose-200",
  },
};

export function RatingProofStatusRow() {
  const [userId, setUserId] = useState<string | null>(null);
  const [claim, setClaim] = useState<ClaimRow | null>(null);

  const refresh = useCallback(async (uid: string) => {
    const { data } = await supabase
      .from("rating_reward_claims")
      .select("status, rejection_reason, created_at")
      .eq("user_id", uid)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    setClaim((data as ClaimRow | null) ?? null);
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (cancelled || !user) return;
      setUserId(user.id);
      await refresh(user.id);
    })();
    return () => { cancelled = true; };
  }, [refresh]);

  useEffect(() => {
    if (!userId) return;
    const ch = supabase
      .channel(`rating-claim-row-${userId}`)
      .on("postgres_changes", {
        event: "*",
        schema: "public",
        table: "rating_reward_claims",
        filter: `user_id=eq.${userId}`,
      }, () => { void refresh(userId); })
      .subscribe();
    return () => { void supabase.removeChannel(ch); };
  }, [userId, refresh]);

  if (!claim) return null;

  const meta = STATUS_META[claim.status];

  const handleTap = () => {
    if (claim.status === "rejected") {
      window.dispatchEvent(new CustomEvent("open-rating-proof-popup"));
      return;
    }
    if (claim.status === "approved") {
      toast.success("Your rating reward has been credited. Thank you!");
      return;
    }
    toast.message("Rating proof is under review", {
      description: "Admin will verify your screenshot shortly.",
    });
  };

  return (
    <div className="profile-home-section rounded-xl overflow-hidden mt-2">
      <button
        onClick={handleTap}
        className="w-full flex items-center justify-between p-2.5 hover:bg-slate-50 transition-colors"
        aria-label={`Rating proof: ${meta.label}`}
      >
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg border border-amber-100 bg-amber-50 flex items-center justify-center">
            <Star className="w-4 h-4 text-amber-600" />
          </div>
          <span className="font-medium text-sm text-display">Rating Reward</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className={cn("flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold", meta.pillClass)}>
            <meta.Icon className={cn("w-3 h-3", meta.iconClass)} />
            {meta.label}
          </span>
          <ChevronRight className="w-4 h-4 text-caption" />
        </div>
      </button>
      {claim.status === "rejected" && claim.rejection_reason && (
        <div className="px-3 pb-2.5 -mt-1 text-[11px] leading-relaxed text-rose-600/90">
          Reason: {claim.rejection_reason}
        </div>
      )}
    </div>
  );
}

export default RatingProofStatusRow;
