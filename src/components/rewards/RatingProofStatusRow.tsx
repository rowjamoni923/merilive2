/**
 * RatingProofStatusRow — Pkg64
 *
 * User-facing status row for the rating-reward proof claim.
 * - Only renders while the signed-in user has a pending rating_reward_claim row.
 * - Approved/rejected claims instantly disappear from this active row.
 * - Tap behaviour:
 *     pending  → toast ("under review")
 *     approved/rejected → not rendered here; full records stay in history.
 *
 * Mounted on Profile.tsx (own profile only). Self-contained — no parent props.
 */
import { useEffect, useState, useCallback, useMemo, useRef } from "react";
import { Star, ChevronRight, Clock, CheckCircle2, XCircle, AlertTriangle, RefreshCw, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAppSyncEvent } from "@/hooks/useAppSyncEvent";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

type ClaimStatus = "pending" | "approved" | "rejected";

interface ClaimRow {
  status: ClaimStatus;
  rejection_reason: string | null;
  created_at: string;
  reviewed_at: string | null;
}

const STATUS_META: Record<ClaimStatus, {
  label: string;
  Icon: typeof Clock;
  iconClass: string;
  pillClass: string;
}> = {
  pending: {
  },
  approved: {
  },
  rejected: {
  },
};

function formatTimestamp(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  const date = d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
  const time = d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
  return `${date} · ${time}`;
}

export function RatingProofStatusRow() {
  const [userId, setUserId] = useState<string | null>(null);
  const [claim, setClaim] = useState<ClaimRow | null>(null);
  const [retrying, setRetrying] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const refresh = useCallback(async (uid: string) => {
    const { data } = await supabase
      .from("rating_reward_claims")
      .select("status, rejection_reason, created_at, reviewed_at")
      .eq("user_id", uid)
      .eq("status", "pending")
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

  // Pkg91: rating_reward_claims not in supabase_realtime publication. Use app_sync.
  useAppSyncEvent(
    ['rating_reward_claims'],
    () => { if (userId) void refresh(userId); },
    !!userId,
  );


  // Map admin rejection reason → tailored suggested fixes
  const suggestions = useMemo(() => {
    if (claim?.status !== "rejected") return [] as string[];
    const reason = (claim.rejection_reason || "").toLowerCase();
    const tips: string[] = [];
    if (!reason || reason.includes("5-star") || reason.includes("rating")) {
      tips.push("Open the Play Store listing and tap all 5 stars before screenshotting.");
    }
    if (reason.includes("blur") || reason.includes("clear") || reason.includes("readable")) {
      tips.push("Use a sharp, full-resolution screenshot — no cropping or zoom.");
    }
    if (reason.includes("crop") || reason.includes("partial") || reason.includes("cut")) {
      tips.push("Include the full Play Store rating bar and your account name in the frame.");
    }
    if (reason.includes("edit") || reason.includes("photoshop") || reason.includes("fake")) {
      tips.push("Submit the original screenshot only — edited images are auto-rejected.");
    }
    if (reason.includes("wrong app") || reason.includes("different app") || reason.includes("other app")) {
      tips.push("Make sure the screenshot is from the Merilive Play Store page, not another app.");
    }
    if (reason.includes("duplicate") || reason.includes("already")) {
      tips.push("This screenshot was already submitted. Post a fresh 5-star review and try again.");
    }
    if (tips.length === 0) {
      tips.push("Take a fresh screenshot showing 5 stars selected on the Merilive Play Store page.");
      tips.push("Keep the image full-size, unedited, and clearly readable.");
    }
    return tips;
  }, [claim]);

  const triggerFilePicker = useCallback(() => {
    if (retrying) return;
    fileRef.current?.click();
  }, [retrying]);

  const handleRetryFileSelect = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    // reset so selecting the same file twice still triggers onChange
    if (e.target) e.target.value = "";
    if (!file || !userId) return;
    if (!file.type.startsWith("image/")) {
      toast.error("Please select an image file");
      return;
    }

    setRetrying(true);
    const tId = toast.loading("Uploading new screenshot…");
    try {
      const ext = file.name.split(".").pop() || "png";
      const path = `${userId}/rating_${Date.now()}.${ext}`;

      const { error: uploadError } = await supabase.storage
        .from("rating-screenshots")
        .upload(path, file);
      if (uploadError) throw uploadError;

      const { data: urlData } = supabase.storage
        .from("rating-screenshots")
        .getPublicUrl(path);

      let platform = "web";
      try {
        const { Capacitor } = await import("@capacitor/core");
        if (Capacitor?.isNativePlatform?.()) {
          platform = Capacitor.getPlatform() || "android";
        }
      } catch { /* web fallback */ }

      const { error: claimError } = await supabase
        .from("rating_reward_claims")
      .insert({
          user_id: userId,
          screenshot_url: urlData.publicUrl,
          platform,
        });

      if (claimError) {
        if (claimError.code === "23505") {
          toast.error("You already have an active rating claim", { id: tId });
        } else {
          console.error("Rating claim insert error:", claimError);
          toast.error(claimError.message || "Failed to resubmit claim", { id: tId });
        }
        return;
      }

      // Instantly cache "already claimed" so the home rating banner never
      // pops up again for this user on this device (matches
      // FullScreenPromoBanners.ratingClaimedCacheKey).
      try { localStorage.setItem(`rating_reward_claimed_v1_${userId}`, "true"); } catch { /* ignore */ }

      toast.success("Screenshot resubmitted! Awaiting admin review.", { id: tId });
      await refresh(userId);
    } catch (err) {
      console.error("Retry upload error:", err);
      toast.error("Failed to upload screenshot", { id: tId });
    } finally {
      setRetrying(false);
    }
  }, [userId, refresh]);

  if (!claim) return null;

  const meta = STATUS_META[claim.status];
  const isRejected = claim.status === "rejected";


  const handleTap = () => {
    toast.message("Rating proof is under review", {
      description: "Admin will verify your screenshot shortly.",
    });
  };

  return (
    <div className="profile-home-section rounded-xl overflow-hidden mt-2">
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        onChange={handleRetryFileSelect}
        className="hidden"
      />
      <button
        onClick={handleTap}
        disabled={retrying}
        className="w-full flex items-center justify-between p-2.5 hover:bg-slate-50 transition-colors disabled:opacity-70"
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
            {retrying && isRejected ? (
              <Loader2 className="w-3 h-3 animate-spin text-rose-600" />
            ) : (
              <meta.Icon className={cn("w-3 h-3", meta.iconClass)} />
            )}
            {retrying && isRejected ? "Uploading…" : meta.label}
          </span>
          <ChevronRight className="w-4 h-4 text-caption" />
        </div>
      </button>

      {/* Review timeline — submitted + reviewed timestamps */}
      <div className="mx-2.5 mb-2 rounded-lg border border-slate-200 bg-white/60 px-3 py-2">
        <div className="flex items-center justify-between mb-1.5">
          <div className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide">
            Review timeline
          </div>
          <a
            href="/rewards/rating-history"
            onClick={(e) => {
              e.preventDefault();
              window.history.pushState({}, "", "/rewards/rating-history");
              window.dispatchEvent(new PopStateEvent("popstate"));
            }}
            className="text-[10.5px] font-semibold text-amber-700 hover:text-amber-800 hover:underline"
          >
            View all history →
          </a>
        </div>
        <ol className="relative space-y-2">
          <li className="flex items-start gap-2">
            <span className="mt-[3px] w-2 h-2 rounded-full bg-amber-500 ring-2 ring-amber-100 flex-shrink-0" />
            <div className="min-w-0 flex-1">
              <div className="text-[11.5px] font-semibold text-slate-700">Proof submitted</div>
              <div className="text-[10.5px] text-slate-500">{formatTimestamp(claim.created_at)}</div>
            </div>
          </li>
          {claim.status === "pending" ? (
            <li className="flex items-start gap-2">
              <span className="mt-[3px] w-2 h-2 rounded-full bg-slate-300 ring-2 ring-slate-100 flex-shrink-0" />
              <div className="min-w-0 flex-1">
                <div className="text-[11.5px] font-semibold text-slate-500">Awaiting admin review</div>
                <div className="text-[10.5px] text-slate-400">Usually within 24 hours</div>
              </div>
            </li>
          ) : (
            <li className="flex items-start gap-2">
              <span className={cn(
                "mt-[3px] w-2 h-2 rounded-full flex-shrink-0",
                claim.status === "approved"
                  ? "bg-emerald-500 ring-2 ring-emerald-100"
                  : "bg-rose-500 ring-2 ring-rose-100",
              )} />
              <div className="min-w-0 flex-1">
                <div className={cn(
                  "text-[11.5px] font-semibold",
                  claim.status === "approved" ? "text-emerald-700" : "text-rose-700",
                )}>
                  {claim.status === "approved" ? "Approved by admin" : "Rejected by admin"}
                </div>
                <div className="text-[10.5px] text-slate-500">
                  {claim.reviewed_at ? formatTimestamp(claim.reviewed_at) : "Time not recorded"}
                </div>
              </div>
            </li>
          )}
        </ol>
      </div>

      {isRejected && (
        <div className="mx-2.5 mb-2.5 rounded-lg border border-rose-200 bg-rose-50/70 overflow-hidden">
          <div className="flex items-start gap-2 px-3 pt-2.5">
            <AlertTriangle className="w-3.5 h-3.5 text-rose-600 mt-[2px] flex-shrink-0" />
            <div className="min-w-0">
              <div className="text-[11px] font-semibold text-rose-700 uppercase tracking-wide">
                Reason for rejection
              </div>
              <div className="text-[12px] text-rose-700/90 leading-relaxed mt-0.5 break-words">
                {claim.rejection_reason?.trim() ||
                  "Screenshot did not pass review. Please follow the tips below and resubmit."}
              </div>
            </div>
          </div>

          <div className="px-3 pt-2 pb-1">
            <div className="text-[11px] font-semibold text-rose-700/80 uppercase tracking-wide mb-1">
              How to fix
            </div>
            <ul className="space-y-1">
              {suggestions.map((tip, i) => (
                <li key={i} className="flex items-start gap-1.5 text-[12px] text-slate-700 leading-snug">
                  <span className="text-rose-500 mt-[1px]">•</span>
                  <span>{tip}</span>
                </li>
              ))}
            </ul>
          </div>

          <button
            onClick={(e) => {
              e.stopPropagation();
              triggerFilePicker();
            }}
            disabled={retrying}
            className="w-full mt-2 flex items-center justify-center gap-1.5 py-2 text-[12px] font-semibold text-white bg-rose-600 hover:bg-rose-500 active:bg-rose-700 transition-colors disabled:opacity-70" // dark-ok
          >
            {retrying ? (
              <>
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                Uploading new screenshot…
              </>
            ) : (
              <>
                <RefreshCw className="w-3.5 h-3.5" />
                Retry upload
              </>
            )}
          </button>
        </div>
      )}
    </div>
  );
}

export default RatingProofStatusRow;
