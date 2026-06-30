import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { UserAvatarImage } from "@/components/admin/UserAvatarImage";
import { AlertTriangle, ShieldCheck, Info, Loader2 } from "lucide-react";

interface MatchedAccount {
  user_id: string;
  display_name: string | null;
  app_uid: string | null;
  avatar_url: string | null;
  is_host: boolean | null;
  is_banned: boolean | null;
  approved_at: string | null;
  submission_id: string | null;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  submission: {
    id: string;
    user_id: string;
    admin_notes: string | null;
    rejection_reason: string | null;
    duplicate_face_user_id: string | null;
    duplicate_face_name: string | null;
    duplicate_face_uid: string | null;
    duplicate_face_avatar: string | null;
    ai_analysis?: Record<string, unknown> | null;
  };
}

// Pull "similarity 97.3%" or "97.3%" out of admin_notes / rejection_reason.
function extractSimilarity(text: string | null | undefined): string | null {
  if (!text) return null;
  const m = text.match(/similarity[^\d]*([\d]+(?:\.[\d]+)?)\s*%/i)
    ?? text.match(/([\d]+(?:\.[\d]+)?)\s*%/);
  return m ? `${m[1]}%` : null;
}

export function DuplicateFaceExplainerDialog({ open, onOpenChange, submission }: Props) {
  const [loading, setLoading] = useState(false);
  const [matched, setMatched] = useState<MatchedAccount[]>([]);
  const [error, setError] = useState<string | null>(null);

  const similarity =
    extractSimilarity(submission.admin_notes) ??
    extractSimilarity(submission.rejection_reason);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const ids = new Set<string>();
        if (submission.duplicate_face_user_id) ids.add(submission.duplicate_face_user_id);

        // Pull additional matched user IDs that the analyzer may have stored
        // in ai_analysis (e.g. ai_analysis.duplicate_matches[]).
        const analysis = submission.ai_analysis as any;
        const extra = analysis?.duplicate_matches ?? analysis?.duplicate?.matches;
        if (Array.isArray(extra)) {
          for (const m of extra) {
            const uid = typeof m === "string" ? m : (m?.user_id ?? m?.matched_user_id);
            if (uid && typeof uid === "string") ids.add(uid);
          }
        }

        if (ids.size === 0) {
          if (!cancelled) setMatched([]);
          return;
        }

        const idList = Array.from(ids);

        const [{ data: profiles }, { data: subs }] = await Promise.all([
          supabase
            .from("profiles")
            .select("id, display_name, avatar_url, app_uid, is_host, is_blocked")
            .in("id", idList),
          supabase
            .from("face_verification_submissions")
            .select("id, user_id, reviewed_at, status")
            .in("user_id", idList)
            .eq("status", "approved")
            .order("reviewed_at", { ascending: false }),
        ]);

        const subByUser = new Map<string, { id: string; reviewed_at: string | null }>();
        for (const s of subs ?? []) {
          if (!subByUser.has(s.user_id as string)) {
            subByUser.set(s.user_id as string, {
              id: s.id as string,
              reviewed_at: (s.reviewed_at as string | null) ?? null,
            });
          }
        }

        const result: MatchedAccount[] = idList.map((uid) => {
          const p = profiles?.find((row: any) => row.id === uid);
          const s = subByUser.get(uid);
          return {
            user_id: uid,
            display_name: (p as any)?.display_name ?? submission.duplicate_face_name ?? null,
            app_uid: (p as any)?.app_uid ?? submission.duplicate_face_uid ?? null,
            avatar_url: (p as any)?.avatar_url ?? submission.duplicate_face_avatar ?? null,
            is_host: (p as any)?.is_host ?? null,
            is_banned: (p as any)?.is_blocked ?? null,
            approved_at: s?.reviewed_at ?? null,
            submission_id: s?.id ?? null,
          };
        });

        if (!cancelled) setMatched(result);
      } catch (e: any) {
        if (!cancelled) setError(e?.message ?? "Failed to load matched accounts.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, submission.id]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <AlertTriangle className="w-5 h-5 text-red-500" />
            Duplicate Face — Decision Explained
          </DialogTitle>
          <DialogDescription>
            This submission was auto-rejected at the{" "}
            <span className="font-semibold">Duplicate Identity Check</span> stage
            because the same face is already registered on another account.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Evidence summary */}
          <div className="rounded-lg border border-red-500/30 bg-red-500/5 p-3">
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <Badge variant="destructive">reason_code: duplicate_face</Badge>
              <Badge variant="outline">stage: duplicate_check</Badge>
              {similarity && (
                <Badge className="bg-amber-500/20 text-amber-700 border border-amber-500/30">
                  AWS Rekognition similarity: {similarity}
                </Badge>
              )}
            </div>
            {submission.admin_notes && (
              <p className="mt-2 text-xs text-muted-foreground whitespace-pre-wrap">
                {submission.admin_notes}
              </p>
            )}
          </div>

          {/* Matched account list */}
          <div>
            <h4 className="text-sm font-semibold mb-2 flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-emerald-500" />
              Matched Account(s) ({matched.length})
            </h4>
            {loading && (
              <div className="flex items-center gap-2 text-sm text-muted-foreground py-4">
                <Loader2 className="w-4 h-4 animate-spin" />
                Loading matched accounts…
              </div>
            )}
            {error && (
              <p className="text-sm text-red-500">{error}</p>
            )}
            {!loading && !error && matched.length === 0 && (
              <p className="text-sm text-muted-foreground">
                No matched account record found (it may have been deleted).
              </p>
            )}
            <div className="space-y-2">
              {matched.map((m) => (
                <div
                  key={m.user_id}
                  className="flex items-center gap-3 rounded-lg border bg-card p-3"
                >
                  <Avatar className="w-10 h-10">
                    {m.avatar_url && <UserAvatarImage src={m.avatar_url} />}
                    <AvatarFallback>U</AvatarFallback>
                  </Avatar>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium truncate">
                        {m.display_name ?? "Unknown"}
                      </span>
                      {m.app_uid && (
                        <span className="text-xs text-muted-foreground">
                          ID {m.app_uid}
                        </span>
                      )}
                      {m.is_host && (
                        <Badge variant="secondary" className="text-[10px]">Host</Badge>
                      )}
                      {m.is_banned && (
                        <Badge variant="destructive" className="text-[10px]">Banned</Badge>
                      )}
                    </div>
                    <p className="text-[11px] text-muted-foreground mt-0.5">
                      {m.approved_at
                        ? `Originally approved ${new Date(m.approved_at).toLocaleString()}`
                        : "Approval timestamp unavailable"}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Policy explanation */}
          <div className="rounded-lg border bg-muted/40 p-3">
            <h4 className="text-sm font-semibold mb-1 flex items-center gap-2">
              <Info className="w-4 h-4" />
              One-Face-One-Account Policy
            </h4>
            <ul className="text-xs text-muted-foreground space-y-1 list-disc pl-4">
              <li>
                Every approved face is fingerprinted via AWS Rekognition and
                indexed in our duplicate-check collection.
              </li>
              <li>
                New submissions are compared against the collection. A match at
                or above the configured similarity threshold (default 92%)
                triggers an automatic rejection — only the <em>first</em>{" "}
                account that registered this face stays valid.
              </li>
              <li>
                Same person, different account ⇒ <strong>not allowed</strong>.
                The user must sign in to the original account, or contact
                Support to merge / recover access.
              </li>
              <li>
                If the matched account is banned, the new submission is also
                rejected (ban-list reuse protection).
              </li>
              <li>
                False positives can be overridden manually here — but only after
                verifying ID documents to confirm the two people are genuinely
                different.
              </li>
            </ul>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
