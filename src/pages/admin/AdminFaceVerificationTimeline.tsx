import { useEffect, useMemo, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { ArrowLeft, Clock, CheckCircle2, XCircle, Loader2, ScanFace, Shield, AlertTriangle, Image as ImageIcon, Video, Fingerprint, Eye, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Card } from "@/components/ui/card";
import { adminSupabase as supabase } from "@/integrations/supabase/adminClient";
import { CopyableUid } from "@/components/admin/CopyableUid";
import { formatAdminError } from "@/utils/formatAdminError";
import { recordAdminError } from "@/utils/adminErrorLog";

// ────────────────────────────────────────────────────────────────────────────
// Per-user face verification audit timeline.
// Route: /admin/face-verification/timeline/:userId
// Sources:
//   • face_verification_submissions  → every submitted / under_review / approved / rejected event
//   • security_alerts (alert_type LIKE 'face_%')  → stuck alerts, fraud signals
// Everything chronological, newest first.
// ────────────────────────────────────────────────────────────────────────────

type SubmissionRow = {
  id: string;
  user_id: string;
  status: string | null;
  verification_type: string | null;
  full_name: string | null;
  created_at: string;
  reviewed_at: string | null;
  reviewed_by: string | null;
  notes: string | null;
  admin_notes: string | null;
  rejection_reason: string | null;
  confidence_score: number | null;
  match_confidence: number | null;
  rekognition_confidence: number | null;
  is_duplicate_face: boolean | null;
  duplicate_face_name: string | null;
  duplicate_face_uid: string | null;
  duplicate_face_user_id: string | null;
  ai_analysis: any;
  profile_photo_url: string | null;
  face_image_url: string | null;
  video_url: string | null;
  front_url: string | null;
  left_url: string | null;
  right_url: string | null;
  selfie_url: string | null;
  reference_image_url: string | null;
  host_photos: string[] | null;
  updated_at: string | null;
};

type AlertRow = {
  id: string;
  alert_type: string;
  severity: string;
  description: string | null;
  metadata: any;
  is_resolved: boolean | null;
  created_at: string;
  resolved_at: string | null;
};

type ProfileRow = {
  id: string;
  display_name: string | null;
  app_uid: string | null;
  avatar_url: string | null;
  gender: string | null;
  is_face_verified: boolean | null;
  face_verification_status: string | null;
  host_status: string | null;
};

type TimelineEvent =
  | { kind: "submission"; at: string; row: SubmissionRow; label: string }
  | { kind: "decision"; at: string; row: SubmissionRow; label: string }
  | { kind: "alert"; at: string; alert: AlertRow };

const STATUS_LABEL: Record<string, string> = {
  pending: "Submitted",
  submitted: "Submitted",
  under_review: "Under Review",
  approved: "Approved",
  rejected: "Rejected",
  auto_approved: "Auto-Approved",
  auto_rejected: "Auto-Rejected",
};

function statusBadge(status: string | null) {
  const s = String(status || "").toLowerCase();
  if (s === "approved" || s === "auto_approved")
    return (
      <Badge className="bg-emerald-100 text-emerald-700 border border-emerald-200">
        <CheckCircle2 className="w-3 h-3 mr-1" /> {STATUS_LABEL[s] || s}
      </Badge>
    );
  if (s === "rejected" || s === "auto_rejected")
    return (
      <Badge className="bg-rose-100 text-rose-700 border border-rose-200">
        <XCircle className="w-3 h-3 mr-1" /> {STATUS_LABEL[s] || s}
      </Badge>
    );
  if (s === "under_review")
    return (
      <Badge className="bg-amber-100 text-amber-700 border border-amber-200">
        <Clock className="w-3 h-3 mr-1" /> Under Review
      </Badge>
    );
  return (
    <Badge className="bg-sky-100 text-sky-700 border border-sky-200">
      <ScanFace className="w-3 h-3 mr-1" /> {STATUS_LABEL[s] || s || "—"}
    </Badge>
  );
}

function severityBadge(sev: string) {
  const s = String(sev || "").toLowerCase();
  const tone =
    s === "critical"
      ? "bg-rose-100 text-rose-700 border-rose-200"
      : s === "high"
      ? "bg-orange-100 text-orange-700 border-orange-200"
      : s === "medium"
      ? "bg-amber-100 text-amber-700 border-amber-200"
      : "bg-slate-100 text-slate-700 border-slate-200";
  return <Badge className={`${tone} border`}>{s || "info"}</Badge>;
}

function fmt(date: string | null) {
  if (!date) return "—";
  try {
    return new Date(date).toLocaleString();
  } catch {
    return date;
  }
}

function pickSimilarity(row: SubmissionRow): number | null {
  const candidates = [row.match_confidence, row.confidence_score, row.rekognition_confidence];
  for (const c of candidates) {
    if (typeof c === "number" && Number.isFinite(c)) return c;
  }
  // dig into ai_analysis
  const ai = row.ai_analysis;
  if (ai && typeof ai === "object") {
    const ev = ai?.rekognition?.evidence_checks as Array<{ score?: number }> | undefined;
    if (Array.isArray(ev)) {
      const scores = ev.map((e) => e?.score).filter((n): n is number => typeof n === "number");
      if (scores.length) return Math.min(...scores);
    }
  }
  return null;
}

function decisionReason(row: SubmissionRow): string {
  if (row.rejection_reason) return row.rejection_reason;
  const ai = row.ai_analysis;
  const dec = ai?.decision as { kind?: string; reason?: string; failedEvidence?: string[] } | undefined;
  if (dec?.kind === "needs_retry") return `Needs retry: ${(dec.failedEvidence || []).join(", ") || "evidence below threshold"}`;
  if (dec?.kind === "reject") return `Hard reject — ${dec.reason || "policy violation"}`;
  if (dec?.kind === "manual_review") return `Manual review — ${dec.reason || "infrastructure gate"}`;
  if (dec?.kind === "auto_approve") return "Auto-approved";
  if (row.notes) return row.notes;
  return "—";
}

function evidenceLinks(row: SubmissionRow): Array<{ label: string; url: string; icon: "img" | "video" }> {
  const out: Array<{ label: string; url: string; icon: "img" | "video" }> = [];
  if (row.profile_photo_url) out.push({ label: "Profile Photo", url: row.profile_photo_url, icon: "img" });
  if (row.face_image_url) out.push({ label: "Face Image", url: row.face_image_url, icon: "img" });
  if (row.selfie_url) out.push({ label: "Selfie", url: row.selfie_url, icon: "img" });
  if (row.reference_image_url) out.push({ label: "Reference", url: row.reference_image_url, icon: "img" });
  if (row.front_url) out.push({ label: "Front Scan", url: row.front_url, icon: "img" });
  if (row.left_url) out.push({ label: "Left Scan", url: row.left_url, icon: "img" });
  if (row.right_url) out.push({ label: "Right Scan", url: row.right_url, icon: "img" });
  if (row.video_url) out.push({ label: "Intro Video", url: row.video_url, icon: "video" });
  (row.host_photos || []).slice(0, 4).forEach((u, i) => {
    if (u) out.push({ label: `Host Photo ${i + 1}`, url: u, icon: "img" });
  });
  return out;
}

const AdminFaceVerificationTimeline = () => {
  const { userId = "" } = useParams<{ userId: string }>();
  const [profile, setProfile] = useState<ProfileRow | null>(null);
  const [submissions, setSubmissions] = useState<SubmissionRow[]>([]);
  const [alerts, setAlerts] = useState<AlertRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    if (!userId) return;
    setLoading(true);
    setError(null);
    try {
      const [{ data: prof }, { data: subs, error: subErr }, { data: al, error: alErr }] = await Promise.all([
        supabase
          .from("profiles")
          .select("id,display_name,app_uid,avatar_url,gender,is_face_verified,face_verification_status,host_status")
          .eq("id", userId)
          .maybeSingle(),
        supabase
          .from("face_verification_submissions")
          .select("*")
          .eq("user_id", userId)
          .order("created_at", { ascending: false })
          .limit(200),
        supabase
          .from("security_alerts")
          .select("id,alert_type,severity,description,metadata,is_resolved,created_at,resolved_at")
          .eq("user_id", userId)
          .ilike("alert_type", "face_%")
          .order("created_at", { ascending: false })
          .limit(100),
      ]);
      if (subErr) throw subErr;
      if (alErr) throw alErr;
      setProfile((prof as ProfileRow) || null);
      setSubmissions((subs as SubmissionRow[]) || []);
      setAlerts((al as AlertRow[]) || []);
    } catch (e: any) {
      const msg = formatAdminError(e);
      setError(msg);
      recordAdminError({ kind: "rpc", label: "AdminFaceVerificationTimeline.Load", message: msg });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  const events: TimelineEvent[] = useMemo(() => {
    const list: TimelineEvent[] = [];
    submissions.forEach((row) => {
      // Always log the submission event.
      list.push({
        kind: "submission",
        at: row.created_at,
        row,
        label: STATUS_LABEL[String(row.status || "").toLowerCase()] || "Submitted",
      });
      // If reviewed, log a separate decision event so the gap is visible.
      const s = String(row.status || "").toLowerCase();
      if (row.reviewed_at && (s === "approved" || s === "rejected" || s === "auto_approved" || s === "auto_rejected")) {
        list.push({
          kind: "decision",
          at: row.reviewed_at,
          row,
          label: STATUS_LABEL[s] || s,
        });
      }
    });
    alerts.forEach((a) => list.push({ kind: "alert", at: a.created_at, alert: a }));
    return list.sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());
  }, [submissions, alerts]);

  const stats = useMemo(() => {
    let approved = 0, rejected = 0, pending = 0, retries = 0;
    submissions.forEach((s) => {
      const st = String(s.status || "").toLowerCase();
      if (st === "approved" || st === "auto_approved") approved++;
      else if (st === "rejected" || st === "auto_rejected") rejected++;
      else if (st === "under_review" || st === "submitted" || st === "pending") pending++;
      const dec = (s.ai_analysis as any)?.decision?.kind;
      if (dec === "needs_retry") retries++;
    });
    return { approved, rejected, pending, retries, total: submissions.length };
  }, [submissions]);

  return (
    <div className="min-h-screen bg-white p-4 md:p-6 space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3">
          <Link to="/admin/face-verification">
            <Button variant="outline" size="sm" className="border-slate-300">
              <ArrowLeft className="w-4 h-4 mr-1.5" /> Back
            </Button>
          </Link>
          <div>
            <h1 className="text-xl md:text-2xl font-bold tracking-tight text-slate-900">
              Face Verification Audit Timeline
            </h1>
            <p className="text-xs text-slate-500">
              All submission, decision, and security events for this user — newest first.
            </p>
          </div>
        </div>
        <Button variant="outline" size="sm" onClick={load} disabled={loading} className="border-slate-300">
          <RefreshCw className={`w-4 h-4 mr-1.5 ${loading ? "animate-spin" : ""}`} /> Refresh
        </Button>
      </div>

      {/* User card */}
      <Card className="p-4 border border-slate-200 shadow-sm">
        <div className="flex items-center gap-4 flex-wrap">
          <Avatar className="w-14 h-14 border border-slate-200">
            <AvatarImage src={profile?.avatar_url || undefined} />
            <AvatarFallback>{profile?.display_name?.charAt(0) || "U"}</AvatarFallback>
          </Avatar>
          <div className="flex-1 min-w-[200px]">
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="font-bold text-base text-slate-900">{profile?.display_name || "Unknown user"}</h2>
              {profile?.is_face_verified && (
                <Badge className="bg-cyan-100 text-cyan-700 border border-cyan-200 text-[10px]">
                  ✅ Face Verified
                </Badge>
              )}
              {profile?.host_status === "approved" && (
                <Badge className="bg-emerald-100 text-emerald-700 border border-emerald-200 text-[10px]">
                  Host Approved
                </Badge>
              )}
            </div>
            <div className="text-xs text-slate-500 mt-1 flex items-center gap-2 flex-wrap">
              <CopyableUid value={profile?.app_uid} />
              <span>• Status: {profile?.face_verification_status || "—"}</span>
              <span>• Gender: {profile?.gender || "—"}</span>
            </div>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
            <Stat label="Total" value={stats.total} />
            <Stat label="Approved" value={stats.approved} tone="emerald" />
            <Stat label="Rejected" value={stats.rejected} tone="rose" />
            <Stat label="Pending" value={stats.pending} tone="amber" />
            <Stat label="Retries" value={stats.retries} tone="sky" />
          </div>
        </div>
      </Card>

      {error && (
        <Card className="p-3 border border-rose-200 bg-rose-50 text-rose-700 text-sm flex items-center gap-2">
          <AlertTriangle className="w-4 h-4" /> {error}
        </Card>
      )}

      {/* Timeline */}
      {loading ? (
        <div className="flex items-center justify-center py-16 text-slate-500">
          <Loader2 className="w-5 h-5 animate-spin mr-2" /> Loading timeline…
        </div>
      ) : events.length === 0 ? (
        <Card className="p-8 border border-slate-200 text-center text-sm text-slate-500">
          No face verification events recorded for this user.
        </Card>
      ) : (
        <ol className="relative border-l-2 border-slate-200 ml-3 space-y-4">
          {events.map((ev, idx) => (
            <li key={`${ev.kind}-${idx}-${ev.at}`} className="ml-6">
              <span className="absolute -left-[11px] mt-2 w-5 h-5 rounded-full bg-white border-2 border-slate-300 flex items-center justify-center">
                {ev.kind === "alert" ? (
                  <Shield className="w-2.5 h-2.5 text-rose-500" />
                ) : ev.kind === "decision" ? (
                  <CheckCircle2 className="w-2.5 h-2.5 text-emerald-500" />
                ) : (
                  <ScanFace className="w-2.5 h-2.5 text-sky-500" />
                )}
              </span>
              {ev.kind === "alert" ? (
                <AlertEventCard alert={ev.alert} />
              ) : (
                <SubmissionEventCard row={ev.row} eventKind={ev.kind} eventTime={ev.at} />
              )}
            </li>
          ))}
        </ol>
      )}
    </div>
  );
};

function Stat({ label, value, tone = "slate" }: { label: string; value: number; tone?: "slate" | "emerald" | "rose" | "amber" | "sky" }) {
  const tones: Record<string, string> = {
    slate: "bg-slate-50 text-slate-900 border-slate-200",
    emerald: "bg-emerald-50 text-emerald-700 border-emerald-200",
    rose: "bg-rose-50 text-rose-700 border-rose-200",
    amber: "bg-amber-50 text-amber-700 border-amber-200",
    sky: "bg-sky-50 text-sky-700 border-sky-200",
  };
  return (
    <div className={`px-3 py-2 rounded-lg border text-center ${tones[tone]}`}>
      <div className="text-[10px] uppercase tracking-wider font-semibold opacity-80">{label}</div>
      <div className="text-base font-bold">{value}</div>
    </div>
  );
}

function SubmissionEventCard({ row, eventKind, eventTime }: { row: SubmissionRow; eventKind: "submission" | "decision"; eventTime: string }) {
  const sim = pickSimilarity(row);
  const reason = decisionReason(row);
  const links = evidenceLinks(row);
  const isDup = !!row.is_duplicate_face;
  return (
    <Card className="p-4 border border-slate-200 shadow-sm">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2 flex-wrap">
          {statusBadge(row.status)}
          <Badge variant="outline" className="text-[10px] border-slate-300">
            {eventKind === "decision" ? "Decision" : "Submission"}
          </Badge>
          <Badge variant="outline" className="text-[10px] border-slate-300 capitalize">
            {row.verification_type || "user"}
          </Badge>
          {isDup && (
            <Badge className="bg-rose-100 text-rose-700 border border-rose-200 text-[10px]">
              <Fingerprint className="w-3 h-3 mr-1" /> Duplicate face
            </Badge>
          )}
        </div>
        <div className="text-xs text-slate-500">{fmt(eventTime)}</div>
      </div>

      <div className="mt-3 grid grid-cols-1 md:grid-cols-3 gap-3 text-xs">
        <Field label="Similarity">
          <span className={sim !== null && sim < 55 ? "text-rose-600 font-semibold" : "text-emerald-700 font-semibold"}>
            {sim !== null ? `${sim.toFixed(1)}%` : "—"}
          </span>
        </Field>
        <Field label="Submission ID">
          <code className="text-[10px] break-all text-slate-600">{row.id}</code>
        </Field>
        <Field label={eventKind === "decision" ? "Reviewed by" : "Created"}>
          <span className="text-slate-700">
            {eventKind === "decision" ? row.reviewed_by || "Automated" : fmt(row.created_at)}
          </span>
        </Field>
      </div>

      <div className="mt-3">
        <div className="text-[10px] uppercase tracking-wider font-semibold text-slate-500 mb-1">
          Decision reason
        </div>
        <div className="text-sm text-slate-800 bg-slate-50 border border-slate-200 rounded-md px-3 py-2">
          {reason}
        </div>
      </div>

      {isDup && (row.duplicate_face_name || row.duplicate_face_uid) && (
        <div className="mt-3 text-xs flex items-center gap-2 flex-wrap text-rose-700 bg-rose-50 border border-rose-200 rounded-md px-3 py-2">
          <Fingerprint className="w-3.5 h-3.5" />
          Matched account: <strong>{row.duplicate_face_name || "Unknown"}</strong>
          {row.duplicate_face_uid && <span>(UID {row.duplicate_face_uid})</span>}
          {row.duplicate_face_user_id && (
            <Link to={`/admin/face-verification/timeline/${row.duplicate_face_user_id}`} className="underline text-rose-700">
              View their timeline →
            </Link>
          )}
        </div>
      )}

      {row.admin_notes && (
        <div className="mt-3 text-xs">
          <div className="text-[10px] uppercase tracking-wider font-semibold text-slate-500 mb-1">Admin notes</div>
          <div className="text-slate-700 bg-amber-50 border border-amber-200 rounded-md px-3 py-2 whitespace-pre-wrap">
            {row.admin_notes}
          </div>
        </div>
      )}

      {links.length > 0 && (
        <div className="mt-3">
          <div className="text-[10px] uppercase tracking-wider font-semibold text-slate-500 mb-1.5">
            Evidence ({links.length})
          </div>
          <div className="flex flex-wrap gap-2">
            {links.map((l, i) => (
              <a
                key={`${l.url}-${i}`}
                href={l.url}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-md border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 hover:text-slate-900 transition-colors"
              >
                {l.icon === "video" ? <Video className="w-3.5 h-3.5" /> : <ImageIcon className="w-3.5 h-3.5" />}
                {l.label}
              </a>
            ))}
          </div>
        </div>
      )}
    </Card>
  );
}

function AlertEventCard({ alert }: { alert: AlertRow }) {
  return (
    <Card className="p-4 border border-rose-200 bg-rose-50/30 shadow-sm">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2 flex-wrap">
          <Badge className="bg-rose-100 text-rose-700 border border-rose-200">
            <Shield className="w-3 h-3 mr-1" /> Security Alert
          </Badge>
          {severityBadge(alert.severity)}
          <Badge variant="outline" className="text-[10px] border-slate-300">{alert.alert_type}</Badge>
          {alert.is_resolved && (
            <Badge className="bg-emerald-100 text-emerald-700 border border-emerald-200 text-[10px]">Resolved</Badge>
          )}
        </div>
        <div className="text-xs text-slate-500">{fmt(alert.created_at)}</div>
      </div>
      {alert.description && (
        <div className="mt-2 text-sm text-slate-800">{alert.description}</div>
      )}
      {alert.metadata && typeof alert.metadata === "object" && Object.keys(alert.metadata).length > 0 && (
        <details className="mt-2">
          <summary className="text-[11px] text-slate-500 cursor-pointer hover:text-slate-700">
            <Eye className="w-3 h-3 inline mr-1" /> Metadata
          </summary>
          <pre className="mt-1 text-[10px] bg-white border border-slate-200 rounded-md p-2 overflow-x-auto text-slate-700">
            {JSON.stringify(alert.metadata, null, 2)}
          </pre>
        </details>
      )}
    </Card>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wider font-semibold text-slate-500">{label}</div>
      <div className="mt-0.5">{children}</div>
    </div>
  );
}

export default AdminFaceVerificationTimeline;
