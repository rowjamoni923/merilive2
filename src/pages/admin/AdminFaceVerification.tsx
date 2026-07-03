import { useState, useEffect, useRef, useMemo } from "react";
import useAdminRealtime from "@/hooks/useAdminRealtime";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import { FaceVerificationDebugPanel } from "@/components/admin/FaceVerificationDebugPanel";
import { bucketOfStatus, countFaceReviewBuckets, fetchFilteredStatusCounts, invalidateStatusCountsCache, isAutoFaceReview, isKnownStatus, warnUnknownStatus, type StatusCounts } from "@/lib/admin/statusCounts";
import {ScanFace, Search, CheckCircle2, XCircle, Clock, Eye, User, Camera, Image, RefreshCw, Loader2, Calendar, Trash2, AlertTriangle, CircleCheckBig, FileCheck, Languages, CakeSlice, ImagePlus, Fingerprint, Shield, Mic, Info} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { AdminMediaDialog, AdminMediaFrame, isAdminVideoUrl } from "@/components/admin/AdminMediaViewer";
import { DuplicateFaceExplainerDialog } from "@/components/admin/DuplicateFaceExplainerDialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { adminSupabase as supabase } from "@/integrations/supabase/adminClient";

import { adminSendNotification } from "@/utils/adminNotification";
import { recordAdminError } from "@/utils/adminErrorLog";
import { getAdminSessionToken } from "@/utils/adminSession";
import { lockAdminRealtimeTables } from "@/utils/adminRealtimeMutationGuard";

import { formatAdminError } from "@/utils/formatAdminError";
import { cn } from "@/lib/utils";
import { UserAvatarImage } from "@/components/admin/UserAvatarImage";
import { CopyableUid } from "@/components/admin/CopyableUid";
import { getFaceSubmissionMediaReadiness } from "@/utils/faceVerificationMedia";

/**
 * Premium Approve/Reject action bar.
 * Layout:
 *   ┌──────────────────────────────────────────┐
 *   │   [ 👤 User ]   [ 🎤 Host ]   (segmented)│   ← role selector
 *   │   ┌──────────────────┬─────────────────┐ │
 *   │   │  ✓ APPROVE       │   ✕ REJECT      │ │   ← main actions
 *   │   └──────────────────┴─────────────────┘ │
 *   └──────────────────────────────────────────┘
 * Approve uses the selected role; Reject ignores role.
 */
function RoleApproveBar({
  defaultRole = 'user',
  processing,
  onApprove,
  onReject,
  approvalDisabled = false,
  disabledReason,
  className,
}: {
  defaultRole?: 'host' | 'user';
  processing: boolean;
  onApprove: (role: 'host' | 'user') => void;
  onReject?: () => void;
  approvalDisabled?: boolean;
  disabledReason?: string;
  className?: string;
}) {
  const [role, setRole] = useState<'host' | 'user'>(defaultRole);
  return (
    <div className={cn("space-y-2.5", className)}>
      {/* Role selector — segmented pill */}
      <div
        role="tablist"
        aria-label="Approve as"
        className="relative grid grid-cols-2 gap-1 rounded-lg border border-[#E2E8F0] bg-[#F1F5F9] p-1"
      >
        <button
          type="button"
          role="tab"
          aria-selected={role === 'user'}
          disabled={processing}
          onClick={() => setRole('user')}
          className={cn(
            "inline-flex items-center justify-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-semibold transition-all duration-150 disabled:opacity-50",
            role === 'user'
              ? "bg-white text-[#0F172A] shadow-sm"
              : "text-slate-500 hover:text-[#0F172A]"
          )}
        >
          <User className="h-3.5 w-3.5" /> User
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={role === 'host'}
          disabled={processing}
          onClick={() => setRole('host')}
          className={cn(
            "inline-flex items-center justify-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-semibold transition-all duration-150 disabled:opacity-50",
            role === 'host'
              ? "bg-white text-[#0F172A] shadow-sm"
              : "text-slate-500 hover:text-[#0F172A]"
          )}
        >
          <Mic className="h-3.5 w-3.5" /> Host
        </button>
      </div>

      {/* Main actions */}
      <div className="grid grid-cols-2 gap-2">
        <Button
          size="sm"
          disabled={processing || approvalDisabled}
          onClick={() => onApprove(role)}
          className="w-full bg-[#2563EB] hover:bg-blue-700 text-white font-semibold shadow-sm"
          title={disabledReason}
        >
          <CheckCircle2 className="h-4 w-4 mr-2" />
          Approve {role === 'host' ? 'as Host' : 'as User'}
        </Button>
        {onReject && (
          <Button
            variant="outline"
            size="sm"
            disabled={processing}
            onClick={onReject}
            className="w-full border-[#E2E8F0] text-slate-700 hover:bg-slate-50 font-semibold"
          >
            <XCircle className="h-4 w-4 mr-2" />
            Reject
          </Button>
        )}
      </div>
      {approvalDisabled && disabledReason && (
        <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-medium text-amber-800">
          ⚠ Approval locked: {disabledReason}
        </div>
      )}
    </div>
  );
}


const normalizeFaceVerificationStatus = (status?: string | null): Submission['status'] => {
  const normalized = String(status || 'pending').trim().toLowerCase();
  if (['approved', 'auto_approved', 'auto-approved', 'auto_verified', 'auto-verified', 'verified', 'passed'].includes(normalized)) return 'approved';
  if (['rejected', 'auto_rejected', 'auto-rejected', 'failed', 'denied'].includes(normalized)) return 'rejected';
  if (normalized === 'submitted' || normalized === 'under_review' || normalized === 'pending') return normalized;
  return 'pending';
};

const inferFaceReviewSource = (s: any): 'auto' | 'manual' => {
  const status = String(s?.status || '').trim().toLowerCase();
  const method = String(s?.verification_method || '').trim().toLowerCase();
  const reviewSource = String(s?.review_source || '').trim().toLowerCase();
  const notes = String(s?.admin_notes || '').toLowerCase();
  if (
    Boolean(s?.is_auto_reviewed) ||
    reviewSource === 'auto' ||
    method.startsWith('auto') ||
    ['auto_approved', 'auto-approved', 'auto_verified', 'auto-verified', 'auto_rejected', 'auto-rejected'].includes(status) ||
    isAutoFaceReview(status, notes)
  ) return 'auto';
  return 'manual';
};

interface Submission {
  id: string;
  user_id: string;
  verification_type: 'user' | 'host';
  status: 'pending' | 'submitted' | 'under_review' | 'approved' | 'rejected';
  full_name: string | null;
  age: number | null;
  language: string | null;
  profile_photo_url: string | null;
  video_url: string | null;
  host_photos: string[] | null;
  face_image_url: string | null;
  selfie_url?: string | null;
  front_url?: string | null;
  left_url?: string | null;
  right_url?: string | null;
  ai_analysis?: Record<string, unknown> | null;
  rejection_reason: string | null;
  admin_notes: string | null;
  status_bucket?: 'pending' | 'approved' | 'rejected';
  is_auto_reviewed?: boolean | null;
  review_source?: 'auto' | 'manual' | string | null;
  created_at: string;
  reviewed_at: string | null;
  is_duplicate_face: boolean | null;
  duplicate_face_user_id: string | null;
  duplicate_face_name: string | null;
  duplicate_face_uid: string | null;
  duplicate_face_avatar: string | null;
  profile?: {
    display_name: string;
    avatar_url: string;
    app_uid: string;
    gender: string;
    is_host: boolean;
    is_face_verified: boolean | null;
    is_verified: boolean | null;
    country_code: string | null;
    country_flag: string | null;
    country_name: string | null;
    city: string | null;
    region: string | null;
    registration_ip: string | null;
    last_login_ip: string | null;
  };
  agency_info?: {
    agency_name: string;
    agency_code: string;
  } | null;
}

interface StepItem {
  label: string;
  icon: React.ReactNode;
  done: boolean;
  preview?: React.ReactNode;
}

const FACE_VERIFICATION_CACHE_KEY = 'admin_face_verification_cache_disabled_v4';
const FACE_VERIFICATION_FETCH_LIMIT = 30;
const ADMIN_FAST_LOADING_TIMEOUT_MS = 900;
const EMPTY_FACE_STATS: StatusCounts = { pending: 0, under_review: 0, approved: 0, rejected: 0, total: 0, auto_approved: 0, auto_rejected: 0, auto_host: 0, auto_user: 0 };

const AdminFaceVerification = () => {
  const { toast } = useToast();
  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const debouncedSearchQuery = useDebouncedValue(searchQuery, 250);
  const [activeTab, setActiveTab] = useState("pending");
  const [mismatchOnly, setMismatchOnly] = useState(false);
  const [serverStats, setServerStats] = useState<StatusCounts>(EMPTY_FACE_STATS);
  const [selectedSubmission, setSelectedSubmission] = useState<Submission | null>(null);
  const [showDetailModal, setShowDetailModal] = useState(false);
  const [showActionModal, setShowActionModal] = useState(false);
  const [actionType, setActionType] = useState<'approve' | 'reject'>('approve');
  const [actionReason, setActionReason] = useState("");
  const [approveAs, setApproveAs] = useState<'host' | 'user'>('user');
  const [approveGender, setApproveGender] = useState<'female' | 'male'>('male');
  const [processing, setProcessing] = useState(false);
  const [expandedPhoto, setExpandedPhoto] = useState<string | null>(null);
  const [showDuplicateExplainer, setShowDuplicateExplainer] = useState(false);
  const actionInFlightRef = useRef(false);
  const fetchRequestIdRef = useRef(0);
  const optimisticTerminalRowsRef = useRef<Map<string, Submission>>(new Map());

  const matchesSubmissionQuery = (sub: Submission, rawQuery: string) => {
    const trimmed = rawQuery.trim();
    if (!trimmed) return true;
    const lower = trimmed.toLowerCase();
    const name = sub.profile?.display_name?.toLowerCase() ?? '';
    const fullName = sub.full_name?.toLowerCase() ?? '';
    const uid = sub.profile?.app_uid ?? '';
    const userId = sub.user_id?.toLowerCase() ?? '';
    return name.includes(lower) || fullName.includes(lower) || uid.includes(trimmed) || userId.startsWith(lower);
  };

  const withOptimisticTerminalRows = (rows: Submission[], rawQuery: string) => {
    const now = Date.now();
    const merged = new Map(rows.map((row) => [row.id, row]));

    optimisticTerminalRowsRef.current.forEach((row, id) => {
      const reviewedAt = row.reviewed_at ? new Date(row.reviewed_at).getTime() : now;
      const ageMs = Number.isFinite(reviewedAt) ? now - reviewedAt : 0;
      if (ageMs > 120_000) {
        optimisticTerminalRowsRef.current.delete(id);
        return;
      }
      if (matchesSubmissionQuery(row, rawQuery)) {
        merged.set(id, { ...(merged.get(id) || row), ...row });
      }
    });

    return Array.from(merged.values()).sort((a, b) => {
      const aTime = new Date(a.reviewed_at || a.created_at).getTime();
      const bTime = new Date(b.reviewed_at || b.created_at).getTime();
      return bTime - aTime;
    });
  };

  const fetchSubmissions = async () => {
    const requestId = ++fetchRequestIdRef.current;
    let fastTimeoutId: number | null = null;

    try {
      // Never keep the page blocked forever - force unblocked UI under 1s
      if (loading) {
        fastTimeoutId = window.setTimeout(() => {
          setLoading(false);
        }, ADMIN_FAST_LOADING_TIMEOUT_MS);
      }

      // Pkg9 hardening: single server-side RPC replaces direct table SELECT +
      // N+1 client joins (profile/agency). Server enforces is_active_admin_session.
      const q = debouncedSearchQuery.trim();
      const serverStatus = activeTab === 'all' ? null : activeTab;
      const [listResult, stats] = await Promise.all([
        supabase.rpc(
          'admin_list_face_verification_paginated',
          { _status: serverStatus, _search: q || null, _limit: FACE_VERIFICATION_FETCH_LIMIT, _offset: 0 }
        ),
        fetchFilteredStatusCounts(supabase as any, {
          table: 'face_verification_submissions',
          searchColumn: 'full_name',
          searchQuery: q,
          globalStatsRpc: 'admin_face_verification_stats',
        }),
      ]);

      if (listResult.error) throw listResult.error;
      const payload = (listResult.data as any) || {};
      const rows = (payload.rows || []) as any[];

      const enriched: Submission[] = rows.map((s) => ({
        ...s,
        status: normalizeFaceVerificationStatus(s.status ?? s.status_bucket),
        is_auto_reviewed: inferFaceReviewSource(s) === 'auto',
        review_source: inferFaceReviewSource(s),
        // RPC returns profile as a jsonb object; normalize null → undefined
        profile: s.profile && s.profile.id ? s.profile : undefined,
        agency_info: s.agency_name
          ? { agency_name: s.agency_name, agency_code: s.agency_code }
          : null,
      }));

      if (requestId !== fetchRequestIdRef.current) return;
      setSubmissions(withOptimisticTerminalRows(enriched, q));
      setServerStats(stats);

      // Never reuse old face-verification rows: approval state must be DB-fresh.
      if (typeof window !== 'undefined') {
        try {
          sessionStorage.removeItem('admin_face_verification_cache_v3');
          sessionStorage.removeItem(FACE_VERIFICATION_CACHE_KEY);
        } catch {}
      }
    } catch (error) {
      recordAdminError({ kind: "rpc", label: "AdminFaceVerification.ErrorFetchingSubmissions", message: formatAdminError(error)});
      toast({ title: "Error", description: "Failed to load submissions", variant: "destructive" });
    } finally {
      if (fastTimeoutId) window.clearTimeout(fastTimeoutId);
      setLoading(false);
      setRefreshing(false);
    }
  };

  useAdminRealtime(['face_verification_submissions'], () => {
    invalidateStatusCountsCache('face_verification_submissions');
    fetchSubmissions();
  });

  useEffect(() => {
    if (!getAdminSessionToken()) return;
    fetchSubmissions();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, debouncedSearchQuery]);

  const handleRefresh = () => { setRefreshing(true); invalidateStatusCountsCache('face_verification_submissions'); fetchSubmissions(); };

  type SubmissionActionParams = {
    submission: Submission;
    action: 'approve' | 'reject';
    approveAs?: 'host' | 'user';
    setGender?: 'female' | 'male';
    reason?: string | null;
    closeModals?: boolean;
  };

  const processSubmissionAction = async ({
    submission,
    action,
    approveAs,
    setGender,
    reason,
    closeModals = true,
  }: SubmissionActionParams) => {
    if (processing || actionInFlightRef.current) return;
    actionInFlightRef.current = true;
    setProcessing(true);

    const previousSubmissions = submissions;
    const previousServerStats = serverStats;
    const nextStatus = action === 'approve' ? 'approved' : 'rejected';
    const previousBucket = bucketOfStatus(submission.status || submission.status_bucket);
    const resolvedApproveAs = action === 'approve'
      ? (approveAs || (submission.verification_type === 'host' ? 'host' : 'user'))
      : 'user';
    const resolvedGender = action === 'approve'
      ? (setGender || (resolvedApproveAs === 'host' ? 'female' : 'male'))
      : null;
    const resolvedReason = action === 'reject'
      ? (reason?.trim() || 'Rejected by admin')
      : (reason?.trim() || null);

    const reviewedAt = new Date().toISOString();
    const optimisticSubmission: Submission = {
      ...submission,
      status: nextStatus as Submission['status'],
      status_bucket: nextStatus as Submission['status_bucket'],
      reviewed_at: reviewedAt,
      rejection_reason: action === 'reject' ? resolvedReason : null,
    };

    // Optimistic: update/add the row immediately so Pending loses it in the
    // same frame, while Approved/Rejected can show it before the next DB fetch.
    optimisticTerminalRowsRef.current.set(submission.id, optimisticSubmission);
    setSubmissions((prev) => {
      const exists = prev.some((s) => s.id === submission.id);
      const next = exists
        ? prev.map((s) => (s.id === submission.id ? optimisticSubmission : s))
        : [optimisticSubmission, ...prev];
      return withOptimisticTerminalRows(next, debouncedSearchQuery);
    });
    setServerStats((prev) => {
      const fromKey = previousBucket;
      const toKey = nextStatus as 'approved' | 'rejected';
      const next = { ...prev } as StatusCounts;
      if (fromKey !== toKey) {
        next[fromKey] = Math.max(0, Number(next[fromKey] || 0) - 1);
        next[toKey] = Number(next[toKey] || 0) + 1;
        if (fromKey === 'pending') {
          next.manual_pending = Math.max(0, Number(next.manual_pending || 0) - 1);
          if (submission.status === 'under_review') {
            next.under_review = Math.max(0, Number(next.under_review || 0) - 1);
          }
        } else if (fromKey === 'approved') next.manual_approved = Math.max(0, Number(next.manual_approved || 0) - 1);
        else if (fromKey === 'rejected') next.manual_rejected = Math.max(0, Number(next.manual_rejected || 0) - 1);
        if (toKey === 'approved') next.manual_approved = Number(next.manual_approved || 0) + 1;
        if (toKey === 'rejected') next.manual_rejected = Number(next.manual_rejected || 0) + 1;
      }
      return next;
    });

    // Always close modals immediately for instant feel
    setShowActionModal(false);
    setShowDetailModal(false);
    setSelectedSubmission(null);
    lockAdminRealtimeTables(['face_verification_submissions'], 2200);

    try {
      const { data, error } = await supabase.rpc('admin_process_face_verification', {
        _submission_id: submission.id,
        _action: action,
        _reason: resolvedReason,
        _approve_as: resolvedApproveAs,
        _set_gender: resolvedGender,
      });

      if (error) throw error;

      if ((data as any)?.pending) {
        toast({
          title: '⏳ Submitted for Owner Approval',
          description: 'Your decision has been queued for owner approval.',
        });
        // Restore — submission was not actually changed
        optimisticTerminalRowsRef.current.delete(submission.id);
        setSubmissions(previousSubmissions);
        setServerStats(previousServerStats);
      } else if ((data as any)?.success === false) {
        throw new Error((data as any)?.error || 'Failed to process');
      } else {
        toast({
          title: action === 'approve' ? '✅ Approved!' : '❌ Rejected!',
          description: action === 'approve' ? 'Face verification approved' : 'Face verification rejected',
        });
      }

      setActionReason('');
      // Bust the 15s server-stats cache so badges + tab counters reflect the
      // new approved/rejected row immediately instead of after TTL.
      invalidateStatusCountsCache('face_verification_submissions');
      fetchSubmissions();
    } catch (error: any) {
      optimisticTerminalRowsRef.current.delete(submission.id);
      setSubmissions(previousSubmissions);
      setServerStats(previousServerStats);
      toast({ title: 'Error', description: error.message || 'Failed to process', variant: 'destructive' });
    } finally {
      setProcessing(false);
      actionInFlightRef.current = false;
    }
  };

  const handleAction = async () => {
    if (!selectedSubmission) return;

    await processSubmissionAction({
      submission: selectedSubmission,
      action: actionType,
      approveAs,
      setGender: approveGender,
      reason: actionReason,
      closeModals: true,
    });
  };

  const handleRemoveVerification = async (userId: string) => {
    if (!confirm('Are you sure? This will remove the user\'s face verification.')) return;
    if (processing || actionInFlightRef.current) return;
    actionInFlightRef.current = true;
    setProcessing(true);
    try {
      const { data, error } = await supabase.rpc('admin_remove_face_verification', { _user_id: userId });
      if (error) throw error;
      if ((data as any)?.pending) {
        toast({ title: "⏳ Submitted for Owner Approval", description: "Revoke request queued for owner approval." });
      } else if ((data as any)?.success === false) {
        throw new Error((data as any)?.error || 'Failed to remove');
      } else {
        toast({ title: "✅ Verification Removed", description: "User can now re-verify" });
      }
      fetchSubmissions();
      setShowDetailModal(false);
    } catch (error: any) {
      toast({ title: "Error", description: error.message || "Failed to remove", variant: "destructive" });
    } finally {
      setProcessing(false);
      actionInFlightRef.current = false;
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'submitted':
      case 'under_review':
      case 'pending': return <Badge className="bg-amber-500/20 text-amber-300 border border-amber-500/30"><Clock className="w-3 h-3 mr-1" /> Pending</Badge>;
      case 'approved': return <Badge className="bg-green-500/20 text-green-300 border border-green-500/30"><CheckCircle2 className="w-3 h-3 mr-1" /> Approved</Badge>;
      case 'rejected': return <Badge className="bg-red-500/20 text-red-300 border border-red-500/30"><XCircle className="w-3 h-3 mr-1" /> Rejected</Badge>;
      default: return <Badge className="bg-amber-500/20 text-amber-300 border border-amber-500/30"><Clock className="w-3 h-3 mr-1" /> Pending</Badge>;
    }
  };

  const getTypeBadge = (type: string) => {
    return type === 'host'
      ? <Badge className="bg-pink-500/20 text-pink-300 border border-pink-500/30">Host</Badge>
      : <Badge className="bg-blue-500/20 text-blue-300 border border-blue-500/30">User</Badge>;
  };

  const getEffectiveVerificationType = (sub: Submission): 'host' | 'face' => {
    const hasHostOnlyMedia = !!sub.video_url || !!(sub.host_photos && sub.host_photos.length > 0);
    return sub.verification_type === 'host' && hasHostOnlyMedia ? 'host' : 'face';
  };

  const getVerificationSteps = (sub: Submission): StepItem[] => {
    const isHost = getEffectiveVerificationType(sub) === 'host';
    const hasProfilePhoto = !!(sub.profile_photo_url || sub.profile?.avatar_url);
    const hasFaceEvidence = !!(sub.front_url || sub.left_url || sub.right_url || sub.selfie_url || sub.face_image_url || sub.video_url || (sub.host_photos && sub.host_photos.length > 0));

    const steps: StepItem[] = [
      {
        label: 'Full Name',
        icon: <User className="w-4 h-4" />,
        done: !!sub.full_name,
        preview: sub.full_name ? <span className="text-xs text-muted-foreground">{sub.full_name}</span> : undefined,
      },
      { label: 'Age', icon: <CakeSlice className="w-4 h-4" />, done: !!sub.age, preview: sub.age ? <span className="text-xs text-muted-foreground">{sub.age} yrs</span> : undefined },
      { label: 'Language', icon: <Languages className="w-4 h-4" />, done: !!sub.language, preview: sub.language ? <span className="text-xs text-muted-foreground">{sub.language}</span> : undefined },
      { label: 'Profile Photo', icon: <Camera className="w-4 h-4" />, done: hasProfilePhoto },
      { label: 'Face Evidence', icon: <ScanFace className="w-4 h-4" />, done: hasFaceEvidence },
    ];

    if (isHost) {
      steps.push(
        { label: '10s Intro Video', icon: <Camera className="w-4 h-4" />, done: !!sub.video_url },
        { label: 'Host Photos', icon: <ImagePlus className="w-4 h-4" />, done: !!(sub.host_photos && sub.host_photos.length > 0), preview: sub.host_photos?.length ? <span className="text-xs text-muted-foreground">{sub.host_photos.length} photo{sub.host_photos.length > 1 ? 's' : ''}</span> : undefined },
      );
    }

    return steps;
  };

  const getCompletionData = (sub: Submission) => {
    const steps = getVerificationSteps(sub);
    const completed = steps.filter(s => s.done).length;
    const total = steps.length;
    const percentage = Math.round((completed / total) * 100);
    return { steps, completed, total, percentage };
  };

  const getSubmissionMediaStatus = (sub: Submission) => {
    const effectiveType = getEffectiveVerificationType(sub);
    const hasProfilePhoto = !!(sub.profile_photo_url || sub.profile?.avatar_url);
    const videoLabel = effectiveType === 'host' ? '10s Video' : 'Face Video';
    const hasRequiredVideo = effectiveType === 'host' ? !!(sub.video_url || sub.face_image_url) : !!(sub.face_image_url || sub.video_url || sub.front_url || sub.selfie_url);

    return { hasProfilePhoto, videoLabel, hasRequiredVideo };
  };

  const getPercentageColor = (pct: number) => {
    if (pct >= 100) return { bg: 'bg-green-500', text: 'text-green-400', track: 'bg-green-500/10', border: 'border-green-500/30' };
    if (pct >= 70) return { bg: 'bg-blue-500', text: 'text-blue-400', track: 'bg-blue-500/10', border: 'border-blue-500/30' };
    if (pct >= 40) return { bg: 'bg-amber-500', text: 'text-amber-400', track: 'bg-amber-500/10', border: 'border-amber-500/30' };
    return { bg: 'bg-red-500', text: 'text-red-400', track: 'bg-red-500/10', border: 'border-red-500/30' };
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleString('en-US', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  };

  const isVideoUrl = isAdminVideoUrl;

  // Sync with edge function auto-face-verify (MIN_FACE_MATCH_PERCENTAGE = 76)
  const MIN_FACE_MATCH_PERCENTAGE = 76;
  const extractFaceMatchPercentage = (notes?: string | null) => {
    if (!notes) return null;
    const match = notes.match(/Face\s*Match:\s*([0-9]+(?:\.[0-9]+)?)%/i);
    return match ? Number(match[1]) : null;
  };

  // Re-run AWS analysis (admin-only edge function)
  const handleRerunAws = async (submissionId: string) => {
    if (processing || actionInFlightRef.current) return;
    actionInFlightRef.current = true;
    setProcessing(true);
    try {
      const adminToken = getAdminSessionToken();
      if (!adminToken) throw new Error('Admin session token missing. Please reopen admin from the secret link.');
      const projectId = (import.meta as any).env?.VITE_SUPABASE_PROJECT_ID;
      const url = `https://${projectId}.supabase.co/functions/v1/admin-rerun-face-verify`;
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-admin-token': adminToken },
        body: JSON.stringify({ submissionId }),
      });
      const data = await res.json();
      if (!res.ok || data?.error) throw new Error(data?.error || 'Re-run failed');
      toast({
        title: data.ok ? '✅ AWS Re-run Complete' : '⚠️ Re-run Note Saved',
        description: typeof data.faceMatchPercentage === 'number'
          ? `Match: ${data.faceMatchPercentage.toFixed(1)}% • Faces: ${data.facesDetected} • Gender: ${data.gender || 'N/A'}`
          : (data.error || 'See admin notes'),
      });
      fetchSubmissions();
    } catch (e: any) {
      toast({ title: 'Re-run failed', description: e.message || 'Unknown error', variant: 'destructive' });
    } finally {
      setProcessing(false);
      actionInFlightRef.current = false;
    }
  };

  // Manual override approve — bypasses face-match threshold (admin takes responsibility)
  const handleManualOverrideApprove = async (sub: Submission, asRole: 'host' | 'user') => {
    const reason = prompt(
      `⚠️ MANUAL OVERRIDE\n\nFace match is below ${MIN_FACE_MATCH_PERCENTAGE}% but you are approving anyway.\nProvide a reason (logged in admin_notes):`,
      'Manual approval — verified visually by admin',
    );
    if (!reason || !reason.trim()) return;
    await processSubmissionAction({
      submission: sub,
      action: 'approve',
      approveAs: asRole,
      setGender: asRole === 'host' ? 'female' : 'male',
      reason: `[OVERRIDE] ${reason.trim()}`,
    });
  };

  const approveSubmissionAs = (submission: Submission, asRole?: 'host' | 'user') => {
    const resolvedRole = asRole || (submission.verification_type === 'host' ? 'host' : 'user');
    return processSubmissionAction({
      submission,
      action: 'approve',
      approveAs: resolvedRole,
      setGender: resolvedRole === 'host' ? 'female' : 'male',
    });
  };

  // Bucketing is delegated to the shared admin status-count module so this page
  // stays in lock-step with AdminHostApplications & friends: every status maps
  // to exactly one of pending / approved / rejected (anything not explicitly
  // approved/rejected falls into pending).
  // Button/tab visibility must follow the row's real status. `status_bucket` can
  // arrive stale from older RPC versions, so only use it when raw status is absent.
  const getSubmissionBucket = (s: Submission) => bucketOfStatus(s.status || s.status_bucket);
  const isApproved = (s: Submission) => getSubmissionBucket(s) === "approved";
  const isRejected = (s: Submission) => getSubmissionBucket(s) === "rejected";
  const isPendingBucket = (s: Submission) => getSubmissionBucket(s) === "pending";

  // Single source of truth for what the user can currently see (after search).
  // Counters are derived from the SAME pool the list uses, so badges always
  // match the visible rows regardless of search input.
  const qRaw = debouncedSearchQuery.trim();
  const q = qRaw.toLowerCase();
  const matchesSearch = (sub: Submission) => {
    if (!q) return true;
    const name = sub.profile?.display_name?.toLowerCase() ?? '';
    const fullName = sub.full_name?.toLowerCase() ?? '';
    const uid = sub.profile?.app_uid ?? '';
    const userId = sub.user_id?.toLowerCase() ?? '';
    return (
      name.includes(q)
      || fullName.includes(q)
      || uid.includes(qRaw)
      || userId.startsWith(q)
    );
  };

  const visiblePool = submissions
    .filter(matchesSearch)
    .filter((s) => (mismatchOnly ? !isKnownStatus(s.status) : true));
  const mismatchCount = submissions.filter(matchesSearch).filter((s) => !isKnownStatus(s.status)).length;

  const isAutoReviewed = (s: Submission) => Boolean(s.is_auto_reviewed) || isAutoFaceReview(s.status, s.admin_notes);
  const isUserRetryRow = (s: Submission) => {
    const st = String(s.status || '').trim().toLowerCase();
    return ['needs_retry', 'retry_required', 'upload_failed', 'upload_incomplete'].includes(st);
  };
  const filteredSubmissions = visiblePool.filter((sub) => {
    if (activeTab === 'auto_approved') return isApproved(sub) && isAutoReviewed(sub);
    if (activeTab === 'auto_rejected') return isRejected(sub) && isAutoReviewed(sub);
    if (activeTab === 'manual_approved') return isApproved(sub) && !isAutoReviewed(sub);
    if (activeTab === 'manual_rejected') return isRejected(sub) && !isAutoReviewed(sub);
    if (activeTab === 'user_retry') return isUserRetryRow(sub);
    if (activeTab === 'pending') return isPendingBucket(sub) && !isUserRetryRow(sub);
    if (activeTab === 'approved') return isApproved(sub);
    if (activeTab === 'rejected') return isRejected(sub);
    if (activeTab === 'all') return true;
    return false;
  });

  // Shared counter — guaranteed to be in sync with server bucket rules.
  const visibleCounts = mismatchOnly
    ? countFaceReviewBuckets(visiblePool, (s) => s.status || s.status_bucket, (s) => s.admin_notes)
    : serverStats;
  const pendingCount = Number(visibleCounts.manual_pending ?? visibleCounts.pending ?? 0);
  const userRetryCount = Number(visibleCounts.user_retry ?? 0);
  const approvedCount = Number(visibleCounts.approved ?? 0);
  const autoApprovedCount = Number(visibleCounts.auto_approved ?? 0);
  const manualApprovedCount = Number(visibleCounts.manual_approved ?? 0);
  const rejectedCount = Number(visibleCounts.rejected ?? 0);
  const autoRejectedCount = Number(visibleCounts.auto_rejected ?? 0);
  const manualRejectedCount = Number(visibleCounts.manual_rejected ?? 0);


  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 animate-spin text-purple-500" />
      </div>
    );
  }

  return (
    <div className="admin-pro-shell min-h-screen bg-[#F8FAFC] text-[#0F172A] -mx-4 -my-4 sm:-mx-6 sm:-my-6 px-4 sm:px-6 py-6 sm:py-8" style={{ fontFamily: 'Inter, ui-sans-serif, system-ui, sans-serif' }}>
    <div className="space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-[#0F172A] flex items-center gap-2">
            <ScanFace className="w-6 h-6 text-[#2563EB]" />
            Face Verification
          </h1>
          <p className="text-sm text-slate-500 mt-1">Review and verify user identity submissions</p>
        </div>
        <Button onClick={handleRefresh} disabled={refreshing} variant="outline" className="border-[#E2E8F0] bg-white text-slate-700 hover:bg-slate-50">
          <RefreshCw className={`w-4 h-4 mr-2 ${refreshing ? 'animate-spin' : ''}`} />
          Refresh
        </Button>
      </div>

      {/* Stats Cards — split auto vs manual so admin sees exact accountability */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: 'Manual Pending', count: pendingCount, icon: Clock, accent: '#F59E0B', hint: 'Admin action needed' },
          { label: 'User Retry', count: userRetryCount, icon: RefreshCw, accent: '#EAB308', hint: 'Waiting on user resubmit' },
          { label: 'Auto Approved', count: autoApprovedCount, icon: Shield, accent: '#06B6D4', hint: 'AI passed' },
          { label: 'Auto Rejected', count: autoRejectedCount, icon: AlertTriangle, accent: '#F97316', hint: 'AI blocked' },
          { label: 'Manual Approved', count: manualApprovedCount, icon: CheckCircle2, accent: '#10B981', hint: 'Admin approved' },
          { label: 'Manual Rejected', count: manualRejectedCount, icon: XCircle, accent: '#EF4444', hint: 'Admin rejected' },
          { label: 'Approved (total)', count: approvedCount, icon: CircleCheckBig, accent: '#059669', hint: 'Auto + Manual' },
          { label: 'Rejected (total)', count: rejectedCount, icon: XCircle, accent: '#DC2626', hint: 'Auto + Manual' },
        ].map(({ label, count, icon: Icon, accent, hint }) => (
          <div key={label} className="bg-white border border-[#E2E8F0] p-4 rounded-xl shadow-sm">
            <div className="flex items-center justify-between mb-1.5">
              <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">{label}</p>
              <Icon className="w-4 h-4" style={{ color: accent }} />
            </div>
            <p className="text-2xl font-bold text-[#0F172A]">{count}</p>
            <p className="text-[10px] text-slate-400 mt-0.5">{hint}</p>
          </div>
        ))}
      </div>


      {/* Status legend — light professional card */}
      <div className="rounded-xl border border-[#E2E8F0] bg-white shadow-sm">
        <div className="p-5">
          <div className="flex items-center gap-2.5 mb-4">
            <span className="flex h-8 w-8 items-center justify-center rounded-md bg-slate-100 border border-[#E2E8F0]">
              <ScanFace className="w-4 h-4 text-slate-600" />
            </span>
            <div className="flex flex-col">
              <span className="text-sm font-semibold text-[#0F172A] tracking-tight">Status Legend</span>
              <span className="text-[11px] uppercase tracking-[0.14em] text-slate-500 font-medium">How submissions are bucketed</span>
            </div>
          </div>
          <div className="grid gap-3 md:grid-cols-3">
            <div className="rounded-lg border border-[#E2E8F0] bg-[#F8FAFC] p-3.5">
              <div className="flex items-center gap-2 mb-1.5">
                <span className="inline-flex items-center gap-1 rounded-md bg-amber-50 border border-amber-200 px-2 py-0.5 text-[11px] font-semibold text-amber-700">
                  <Clock className="w-3 h-3" /> Pending
                </span>
              </div>
              <p className="text-xs leading-relaxed text-slate-600">Submitted but not yet reviewed. Anything not Approved or Rejected lives here.</p>
            </div>
            <div className="rounded-lg border border-[#E2E8F0] bg-[#F8FAFC] p-3.5">
              <div className="flex items-center gap-2 mb-1.5">
                <span className="inline-flex items-center gap-1 rounded-md bg-emerald-50 border border-emerald-200 px-2 py-0.5 text-[11px] font-semibold text-emerald-700">
                  <CheckCircle2 className="w-3 h-3" /> Approved
                </span>
              </div>
              <p className="text-xs leading-relaxed text-slate-600">Accepted manually or by auto-approval. Host gains <code className="rounded bg-emerald-50 px-1 text-[10px] text-emerald-700">is_host=true</code> and can go live.</p>
            </div>
            <div className="rounded-lg border border-[#E2E8F0] bg-[#F8FAFC] p-3.5">
              <div className="flex items-center gap-2 mb-1.5">
                <span className="inline-flex items-center gap-1 rounded-md bg-rose-50 border border-rose-200 px-2 py-0.5 text-[11px] font-semibold text-rose-700">
                  <XCircle className="w-3 h-3" /> Rejected
                </span>
              </div>
              <p className="text-xs leading-relaxed text-slate-600">Declined with a reason. Host stays a regular user and must resubmit to re-enter Pending.</p>
            </div>
          </div>
          <div className="mt-3 flex items-start gap-2 rounded-md border border-[#E2E8F0] bg-[#F8FAFC] px-3 py-2">
            <div className="mt-0.5 h-1.5 w-1.5 rounded-full bg-amber-500" />
            <p className="text-[11px] leading-relaxed text-slate-600">
              <span className="text-[#0F172A] font-medium">Auto Approved</span> is a sub-view of Approved (when <code className="text-slate-700">admin_notes</code> contains <span className="text-slate-700">"auto"</span>). Search and tab counters always reflect what is visible in the list.
            </p>
          </div>
        </div>
      </div>


      {/* Search + Mismatch filter */}
      <div className="flex flex-col md:flex-row gap-3 md:items-center">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <Input placeholder="Search by name or UID..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="pl-10 bg-white border-[#E2E8F0] text-[#0F172A] placeholder:text-slate-400 focus-visible:ring-2 focus-visible:ring-[#2563EB]/20 focus-visible:border-[#2563EB]" />
        </div>
        <button
          type="button"
          data-testid="mismatch-only-toggle"
          aria-pressed={mismatchOnly}
          onClick={() => setMismatchOnly((v) => !v)}
          className={`inline-flex items-center gap-2 px-3 py-2 rounded-md border text-sm font-medium transition-colors ${
            mismatchOnly
              ? 'bg-amber-50 border-amber-300 text-amber-800'
              : 'bg-white border-[#E2E8F0] text-slate-600 hover:text-[#0F172A]'
          }`}
          title="Show only submissions with an unknown/mismatched status"
        >
          <AlertTriangle className="w-4 h-4" />
          Mismatch only
          <span className="ml-1 px-1.5 py-0.5 rounded bg-amber-100 text-amber-800 text-[10px] font-bold">{mismatchCount}</span>
        </button>
      </div>


      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <div className="w-full overflow-x-auto -mx-2 px-2">
        <TabsList className="inline-flex w-max md:grid md:grid-cols-7 md:w-full md:max-w-3xl overflow-visible">

          <TabsTrigger value="pending" className="relative overflow-visible text-xs" data-testid="tab-pending">
            Pending
            <span data-testid="tab-count-pending" className={pendingCount > 0 ? "admin-tab-badge absolute -top-1 -right-1 min-w-[20px] h-5 px-1 rounded-full text-[10px] font-bold flex items-center justify-center text-slate-900 shadow" : "sr-only"} style={{ backgroundColor: "#F59E0B", color: "#fff" }}>{pendingCount}</span>
          </TabsTrigger>
          <TabsTrigger value="user_retry" className="relative overflow-visible text-xs" data-testid="tab-user_retry">
            User Retry
            <span data-testid="tab-count-user_retry" className={userRetryCount > 0 ? "admin-tab-badge absolute -top-1 -right-1 min-w-[20px] h-5 px-1 rounded-full text-[10px] font-bold flex items-center justify-center text-slate-900 shadow" : "sr-only"} style={{ backgroundColor: "#EAB308", color: "#fff" }}>{userRetryCount}</span>
          </TabsTrigger>
          <TabsTrigger value="auto_approved" className="relative overflow-visible text-xs" data-testid="tab-auto_approved">
            Auto Approved
            <span data-testid="tab-count-auto_approved" className={autoApprovedCount > 0 ? "admin-tab-badge absolute -top-1 -right-1 min-w-[20px] h-5 px-1 rounded-full text-[10px] font-bold flex items-center justify-center text-slate-900 shadow" : "sr-only"} style={{ backgroundColor: "#06B6D4", color: "#fff" }}>{autoApprovedCount}</span>
          </TabsTrigger>
          <TabsTrigger value="auto_rejected" className="relative overflow-visible text-xs" data-testid="tab-auto_rejected">
            Auto Rejected
            <span data-testid="tab-count-auto_rejected" className={autoRejectedCount > 0 ? "admin-tab-badge absolute -top-1 -right-1 min-w-[20px] h-5 px-1 rounded-full text-[10px] font-bold flex items-center justify-center text-slate-900 shadow" : "sr-only"} style={{ backgroundColor: "#F97316", color: "#fff" }}>{autoRejectedCount}</span>
          </TabsTrigger>
          <TabsTrigger value="approved" className="relative overflow-visible text-xs" data-testid="tab-approved">
            Approved
            <span data-testid="tab-count-approved" className={approvedCount > 0 ? "admin-tab-badge absolute -top-1 -right-1 min-w-[20px] h-5 px-1 rounded-full text-[10px] font-bold flex items-center justify-center text-slate-900 shadow" : "sr-only"} style={{ backgroundColor: "#10B981", color: "#fff" }}>{approvedCount}</span>
          </TabsTrigger>
          <TabsTrigger value="rejected" className="relative overflow-visible text-xs" data-testid="tab-rejected">
            Rejected
            <span data-testid="tab-count-rejected" className={rejectedCount > 0 ? "admin-tab-badge absolute -top-1 -right-1 min-w-[20px] h-5 px-1 rounded-full text-[10px] font-bold flex items-center justify-center text-slate-900 shadow" : "sr-only"} style={{ backgroundColor: "#EF4444", color: "#fff" }}>{rejectedCount}</span>
          </TabsTrigger>
          <TabsTrigger value="all" className="relative overflow-visible text-xs" data-testid="tab-all">
            All
            <span data-testid="tab-count-all" className={(visibleCounts.total || visiblePool.length) > 0 ? "admin-tab-badge absolute -top-1 -right-1 min-w-[20px] h-5 px-1 rounded-full text-[10px] font-bold flex items-center justify-center text-slate-900 shadow" : "sr-only"} style={{ backgroundColor: "#8B5CF6", color: "#fff" }}>{visibleCounts.total || visiblePool.length}</span>
          </TabsTrigger>
        </TabsList>


        </div>


        <TabsContent value={activeTab} className="mt-4">
          {filteredSubmissions.length === 0 ? (
            <div className="text-center py-12" data-testid="empty-state">
              <ScanFace className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
              <p className="text-muted-foreground">No submissions found</p>
            </div>
          ) : (
            <div className="space-y-4">
              {filteredSubmissions.map((submission, rowIndex) => {
                const { completed, total, percentage } = getCompletionData(submission);
                const faceMatch = extractFaceMatchPercentage(submission.admin_notes);
                const mediaStatus = getSubmissionMediaStatus(submission);
                const mediaReadiness = getFaceSubmissionMediaReadiness(submission);

                return (
                  <div key={submission.id} data-testid="submission-card" data-submission-id={submission.id} data-status={String(submission.status ?? "")} className="bg-white border border-[#E2E8F0] hover:border-slate-300 transition-colors rounded-xl p-4 space-y-3 shadow-sm">
                    <div className="flex items-center gap-3">
                      <Avatar className="w-10 h-10 border border-border">
                        <UserAvatarImage gender={((submission.profile) as any)?.gender} seed={submission.user_id ?? submission.id} src={submission.profile?.avatar_url} />
                        <AvatarFallback>{submission.full_name?.charAt(0) || submission.profile?.display_name?.charAt(0) || 'U'}</AvatarFallback>
                      </Avatar>

                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <h3 className="font-semibold text-sm truncate">{submission.full_name || submission.profile?.display_name || 'Unknown'}</h3>
                          {submission.profile?.is_face_verified && (
                            <Badge className="bg-cyan-500/20 text-cyan-300 border border-cyan-500/30 text-[10px]">✅ Face Verified</Badge>
                          )}
                          {getTypeBadge(getEffectiveVerificationType(submission))}
                          {getStatusBadge(submission.status)}
                          {!isKnownStatus(submission.status) && (() => {
                            warnUnknownStatus("AdminFaceVerification", submission.status, { id: submission.id, user_id: submission.user_id });
                            return (
                              <Badge
                                className="bg-amber-500/20 text-amber-300 border border-amber-500/40 text-[10px]"
                                title={`Raw status "${String(submission.status ?? "")}" is unrecognized — defaulted to Pending bucket. Please check.`}
                              >
                                ⚠ Status mismatch: {String(submission.status ?? "—")}
                              </Badge>
                            );
                          })()}
                        </div>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          <CopyableUid value={submission.profile?.app_uid} /> • {formatDate(submission.created_at)}
                        </p>
                      </div>

                      <Button asChild variant="ghost" size="icon" title="View audit timeline">
                        <a href={`/admin/face-verification/timeline/${submission.user_id}`}>
                          <Clock className="w-4 h-4" />
                        </a>
                      </Button>
                      <Button variant="ghost" size="icon" onClick={() => { setSelectedSubmission(submission); setShowDetailModal(true); }}>
                        <Eye className="w-4 h-4" />
                      </Button>
                    </div>

                    <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                      <div className="rounded-lg border border-slate-300 bg-white px-2.5 py-2 shadow-sm">
                        <p className="text-[10px] text-slate-700 uppercase tracking-wider font-bold">Completion</p>
                        <p className="text-sm font-bold text-slate-900">{completed}/{total} ({percentage}%)</p>
                      </div>
                      <div className="rounded-lg border border-slate-300 bg-white px-2.5 py-2 shadow-sm">
                        <p className="text-[10px] text-slate-700 uppercase tracking-wider font-bold">Face Match</p>
                        <p className={`text-sm font-bold ${typeof faceMatch === 'number' && faceMatch >= MIN_FACE_MATCH_PERCENTAGE ? 'text-emerald-700' : 'text-rose-700'}`}>
                          {typeof faceMatch === 'number' ? `${faceMatch.toFixed(1)}%` : 'N/A'}
                        </p>
                      </div>
                      <div className="rounded-lg border border-slate-300 bg-white px-2.5 py-2 shadow-sm">
                        <p className="text-[10px] text-slate-700 uppercase tracking-wider font-bold">Profile Photo</p>
                        <p className="text-sm font-bold text-slate-900">{mediaStatus.hasProfilePhoto ? 'Yes' : 'No'}</p>
                      </div>
                      <div className="rounded-lg border border-slate-300 bg-white px-2.5 py-2 shadow-sm">
                        <p className="text-[10px] text-slate-700 uppercase tracking-wider font-bold">{mediaStatus.videoLabel}</p>
                        <p className="text-sm font-bold text-slate-900">{mediaStatus.hasRequiredVideo ? 'Yes' : 'No'}</p>
                      </div>
                    </div>


                    {(() => {
                      // Inline media strip — admin sees every photo/video right in the list
                      // for Pending / Approved / Rejected / Auto / All tabs without opening detail.
                      const faceShot =
                        submission.front_url
                        || submission.selfie_url
                        || (submission.face_image_url && !submission.face_image_url.startsWith('admin-approved://') ? submission.face_image_url : null);
                      const profilePhoto =
                        (submission.profile_photo_url && !submission.profile_photo_url.startsWith('admin-approved://') ? submission.profile_photo_url : null)
                        || submission.profile?.avatar_url
                        || null;
                      const faceRecording = submission.face_image_url && !submission.face_image_url.startsWith('admin-approved://')
                        ? submission.face_image_url
                        : null;
                      const video = submission.video_url || null;
                      const hostPhotos = (submission.host_photos || []).filter(Boolean).slice(0, 3);
                      const angles = [submission.left_url, submission.right_url].filter(Boolean) as string[];
                      const tiles: { src: string; label: string; kind: 'image' | 'video' | 'auto' }[] = [];
                      if (profilePhoto) tiles.push({ src: profilePhoto, label: 'Profile', kind: 'image' });
                      if (faceShot) tiles.push({ src: faceShot, label: 'Face', kind: 'auto' });
                      if (faceRecording && faceRecording !== faceShot) tiles.push({ src: faceRecording, label: 'Face Video', kind: 'auto' });
                      if (video && video !== faceRecording) tiles.push({ src: video, label: 'Intro Video', kind: 'video' });
                      hostPhotos.forEach((src, i) => tiles.push({ src, label: `Host ${i + 1}`, kind: 'image' }));
                      angles.forEach((src, i) => tiles.push({ src, label: i === 0 ? 'Left' : 'Right', kind: 'auto' }));
                      if (tiles.length === 0) {
                        return (
                          <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-300">
                            ⚠ No media attached to this submission
                          </div>
                        );
                      }
                      return (
                        <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-2" data-admin-media-bucket="face-verification">
                          {tiles.map((t, idx) => {
                            const isVid = t.kind === 'video' || isAdminVideoUrl(t.src);
                            // Inline tiles are POSTERS ONLY (no <video> inside <button> — invalid HTML
                            // and the controls become unclickable). Clicking opens the detail dialog
                            // where the real <video controls> lives and plays.
                            if (isVid) {
                              const posterSrc = profilePhoto || t.src;
                              return (
                                <button
                                  key={`${submission.id}-tile-${idx}`}
                                  type="button"
                                  onClick={() => { setSelectedSubmission(submission); setShowDetailModal(true); }}
                                  className="relative aspect-square rounded-lg overflow-hidden border border-border bg-background/40 hover:border-purple-400 transition-colors group"
                                  title={`${t.label} — click to play`}
                                >
                                  <AdminMediaFrame
                                    src={posterSrc}
                                    alt={t.label}
                                    kind="image"
                                    bucket="face-verification"
                                    priority={rowIndex < 6 && idx < 6}
                                    className="w-full h-full"
                                    mediaClassName="object-cover w-full h-full"
                                  />
                                  <span className="pointer-events-none absolute inset-0 flex items-center justify-center bg-black/30 group-hover:bg-black/50 transition-colors">
                                    <span className="rounded-full bg-white/95 p-2 shadow-lg">
                                      <Camera className="w-5 h-5 text-purple-700" />
                                    </span>
                                  </span>
                                  <span className="pointer-events-none absolute bottom-0 inset-x-0 bg-black/70 text-[10px] text-white px-1.5 py-0.5 truncate">
                                    ▶ {t.label}
                                  </span>
                                </button>
                              );
                            }
                            return (
                              <button
                                key={`${submission.id}-tile-${idx}`}
                                type="button"
                                onClick={() => { setSelectedSubmission(submission); setShowDetailModal(true); }}
                                className="relative aspect-square rounded-lg overflow-hidden border border-border bg-background/40 hover:border-purple-400 transition-colors"
                                title={t.label}
                              >
                                <AdminMediaFrame
                                  src={t.src}
                                  alt={t.label}
                                  kind={t.kind}
                                  bucket="face-verification"
                                  priority={rowIndex < 6 && idx < 6}
                                  className="w-full h-full"
                                  mediaClassName="object-cover w-full h-full"
                                />
                                <span className="pointer-events-none absolute bottom-0 inset-x-0 bg-black/60 text-[10px] text-white px-1.5 py-0.5 truncate">
                                  {t.label}
                                </span>
                              </button>
                            );
                          })}
                        </div>
                      );
                    })()}

                    {submission.is_duplicate_face && (
                      <div className="flex items-center gap-2 p-2 rounded-lg bg-destructive/10 border border-destructive/30">
                        <AlertTriangle className="w-4 h-4 text-destructive" />
                        <p className="text-xs text-destructive font-medium truncate">Duplicate face: {submission.duplicate_face_name || 'Unknown'}</p>
                      </div>
                    )}

                    {isPendingBucket(submission) && (
                      <RoleApproveBar
                        defaultRole={submission.verification_type === 'host' ? 'host' : 'user'}
                        processing={processing}
                        approvalDisabled={false}
                        disabledReason={mediaReadiness.ready ? undefined : `Manual override allowed — missing: ${mediaReadiness.missing.join(', ')}`}
                        onApprove={(role) => approveSubmissionAs(submission, role)}
                        onReject={() => processSubmissionAction({ submission, action: 'reject' })}
                      />
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </TabsContent>
      </Tabs>

      {/* Detail Modal */}
      <Dialog open={showDetailModal} onOpenChange={setShowDetailModal}>
        <DialogContent className="max-w-2xl w-screen sm:w-auto h-[100dvh] sm:h-auto max-h-[100dvh] sm:max-h-[90vh] rounded-none sm:rounded-xl overflow-y-auto bg-white border-[#E2E8F0] text-[#0F172A]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ScanFace className="w-5 h-5 text-purple-500" />
              Verification Details
            </DialogTitle>
            <DialogDescription>Review submission and take action</DialogDescription>
          </DialogHeader>

          {selectedSubmission && (() => {
            const { steps, completed, total, percentage } = getCompletionData(selectedSubmission);
            const colors = getPercentageColor(percentage);
            const mediaReadiness = getFaceSubmissionMediaReadiness(selectedSubmission);

            return (
              <div className="space-y-5">
                {isPendingBucket(selectedSubmission) && (
                  <div className="sticky top-0 z-20 rounded-xl border border-[#E2E8F0] bg-white/95 p-3 shadow-sm backdrop-blur">
                    <RoleApproveBar
                      defaultRole={selectedSubmission.verification_type === 'host' ? 'host' : 'user'}
                      processing={processing}
                      approvalDisabled={false}
                      disabledReason={mediaReadiness.ready ? undefined : `Manual override allowed — missing: ${mediaReadiness.missing.join(', ')}`}
                      onApprove={(role) => approveSubmissionAs(selectedSubmission, role)}
                      onReject={() => processSubmissionAction({ submission: selectedSubmission, action: 'reject', reason: actionReason })}
                    />
                  </div>
                )}

                {/* User Info */}
                <div className="flex items-center gap-4 p-4 bg-accent/50 rounded-xl">
                  <Avatar className="w-16 h-16 border-2 border-purple-500/30">
                    <UserAvatarImage gender={((selectedSubmission.profile) as any)?.gender} seed={selectedSubmission.user_id ?? selectedSubmission.id} src={selectedSubmission.profile?.avatar_url} />
                    <AvatarFallback>{selectedSubmission.profile?.display_name?.charAt(0) || 'U'}</AvatarFallback>
                  </Avatar>
                  <div>
                    <h3 className="font-bold text-lg">{selectedSubmission.profile?.display_name}</h3>
                    <p className="text-sm text-muted-foreground"><CopyableUid value={selectedSubmission.profile?.app_uid} /></p>
                    <div className="flex items-center gap-2 mt-1">
                      {selectedSubmission.profile?.is_face_verified && (
                        <Badge className="bg-cyan-500/20 text-cyan-300 border border-cyan-500/30 text-[10px]">✅ Face Verified</Badge>
                      )}
                      {getTypeBadge(getEffectiveVerificationType(selectedSubmission))}
                      {getStatusBadge(selectedSubmission.status)}
                    </div>
                  </div>
                </div>

                {/* Duplicate Warning */}
                {selectedSubmission.is_duplicate_face && (
                  <div className="p-4 rounded-xl bg-red-500/15 border-2 border-red-500/40">
                    <div className="flex items-center gap-2 mb-2">
                      <AlertTriangle className="w-5 h-5 text-red-400" />
                      <span className="font-bold text-red-300">⚠️ Duplicate Face Detected!</span>
                    </div>
                    <p className="text-sm text-red-300/80 mb-3">This face was previously used to create another account.</p>
                    <div className="flex items-center gap-3 p-3 rounded-lg bg-red-500/10 border border-red-500/30">
                      {selectedSubmission.duplicate_face_avatar && (
                        <Avatar className="w-10 h-10 border-2 border-red-400">
                          <UserAvatarImage src={selectedSubmission.duplicate_face_avatar} />
                          <AvatarFallback>U</AvatarFallback>
                        </Avatar>
                      )}
                      <div>
                        <p className="font-semibold text-red-200">{selectedSubmission.duplicate_face_name || 'Unknown'}</p>
                        {selectedSubmission.duplicate_face_uid && <p className="text-xs text-red-300"><CopyableUid value={selectedSubmission.duplicate_face_uid} /></p>}
                      </div>
                    </div>
                    <div className="mt-3 flex justify-end">
                      <Button
                        size="sm"
                        variant="outline"
                        className="border-red-500/40 text-red-200 hover:bg-red-500/10"
                        onClick={() => setShowDuplicateExplainer(true)}
                      >
                        <Info className="w-4 h-4 mr-1" />
                        Explain decision
                      </Button>
                    </div>
                  </div>
                )}


                {/* Verification Steps */}
                <div className={`p-4 rounded-xl border-2 ${colors.border} ${colors.track}`}>
                  <div className="flex items-center justify-between mb-3">
                    <span className={`font-semibold ${colors.text} flex items-center gap-2`}>
                      <Shield className="w-5 h-5" />
                      Verification Steps
                    </span>
                    <span className={`text-2xl font-bold ${colors.text}`}>{percentage}%</span>
                  </div>
                  <div className={`w-full h-3 rounded-full ${colors.track} overflow-hidden mb-4`}>
                    <div className={`h-full rounded-full ${colors.bg} transition-all duration-500`} style={{ width: `${percentage}%` }} />
                  </div>
                  <div className="space-y-2">
                    {steps.map((step, idx) => (
                      <div key={idx} className={`flex items-center justify-between p-3 rounded-lg ${step.done ? 'bg-green-500/10 border border-green-500/20' : 'bg-red-500/10 border border-red-500/20'}`}>
                        <div className="flex items-center gap-3">
                          <div className={`w-8 h-8 rounded-full flex items-center justify-center ${step.done ? 'bg-green-500/30 text-green-400' : 'bg-red-500/30 text-red-400'}`}>
                            {step.done ? <CheckCircle2 className="w-4 h-4" /> : <XCircle className="w-4 h-4" />}
                          </div>
                          <div className="flex items-center gap-2">
                            <span className={`${step.done ? 'text-green-300' : 'text-red-300'}`}>{step.icon}</span>
                            <span className={`text-sm font-medium ${step.done ? 'text-green-200' : 'text-red-200'}`}>{step.label}</span>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          {step.preview}
                          <Badge className={`text-[10px] ${step.done ? 'bg-green-500/20 text-green-300 border-green-500/30' : 'bg-red-500/20 text-red-300 border-red-500/30'}`}>
                            {step.done ? 'Done' : 'Missing'}
                          </Badge>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Personal Info */}
                <div className="space-y-3">
                  <h4 className="font-semibold flex items-center gap-2 text-purple-300">
                    <Fingerprint className="w-5 h-5" /> Personal Info
                  </h4>
                  <div className="grid grid-cols-2 gap-3">
                    {[
                      { label: 'Full Name', value: selectedSubmission.full_name },
                      { label: 'Age', value: selectedSubmission.age ? `${selectedSubmission.age} yrs` : null },
                      { label: 'Language', value: selectedSubmission.language },
                      { label: 'Gender', value: selectedSubmission.profile?.gender },
                      { label: 'Submitted', value: formatDate(selectedSubmission.created_at) },
                      { label: 'Reviewed', value: selectedSubmission.reviewed_at ? formatDate(selectedSubmission.reviewed_at) : null },
                    ].map(({ label, value }) => (
                      <div key={label} className="p-3 bg-accent/30 rounded-lg">
                        <p className="text-xs text-muted-foreground">{label}</p>
                        <p className="font-medium text-sm mt-0.5">{value || <span className="text-red-400/60">—</span>}</p>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Debug Panel — shows raw URL, parsed bucket/path, signed URL, HTTP status */}
                <FaceVerificationDebugPanel
                  items={[
                    { label: "profile_photo_url", raw: selectedSubmission.profile_photo_url },
                    { label: "face_image_url", raw: selectedSubmission.face_image_url },
                    { label: "video_url", raw: selectedSubmission.video_url },
                    { label: "front_url", raw: selectedSubmission.front_url },
                    { label: "left_url", raw: selectedSubmission.left_url },
                    { label: "right_url", raw: selectedSubmission.right_url },
                    { label: "selfie_url", raw: selectedSubmission.selfie_url },
                    ...(selectedSubmission.host_photos || []).map((u, i) => ({ label: `host_photos[${i}]`, raw: u })),
                  ]}
                />

                {/* Face Verification */}
                {selectedSubmission.face_image_url && !selectedSubmission.face_image_url.startsWith('admin-approved://') && (() => {
                  const url = selectedSubmission.face_image_url;
                  return (
                    <div className="space-y-3 rounded-xl border border-[#E2E8F0] bg-white p-4 shadow-sm">
                      <h4 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wider text-[#0F172A]">
                        <ScanFace className="w-5 h-5 text-[#2563EB]" /> Face Verification
                      </h4>
                      <AdminMediaFrame src={url} alt="Face verification" poster={selectedSubmission.profile_photo_url} className="rounded-lg border border-[#E2E8F0] bg-slate-50 max-h-[70vh] flex items-center justify-center" mediaClassName="max-h-[70vh] w-full object-contain" onOpen={!isVideoUrl(url) ? () => setExpandedPhoto(url) : undefined} />
                    </div>
                  );
                })()}

                {/* No-media notice (legacy / empty submissions) */}
                {!selectedSubmission.profile_photo_url
                  && !selectedSubmission.video_url
                  && (!selectedSubmission.host_photos || selectedSubmission.host_photos.length === 0)
                  && (!selectedSubmission.face_image_url || selectedSubmission.face_image_url.startsWith('admin-approved://')) && (
                  <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-center">
                    <p className="text-amber-800 font-medium text-sm">⚠ No media submitted by user</p>
                    <p className="text-amber-700/80 text-xs mt-1">Legacy or admin-approved record — no photo/video attached.</p>
                  </div>
                )}

                {/* Profile Photo */}
                {selectedSubmission.profile_photo_url && (() => {
                  const url = selectedSubmission.profile_photo_url;
                  return (
                    <div className="space-y-3 rounded-xl border border-[#E2E8F0] bg-white p-4 shadow-sm">
                      <h4 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wider text-[#0F172A]">
                        <Camera className="w-5 h-5 text-[#2563EB]" /> Profile Photo
                      </h4>
                      <AdminMediaFrame src={url} alt="Profile" kind="image" className="mx-auto w-full max-w-sm rounded-lg border border-[#E2E8F0] bg-slate-50" mediaClassName="w-full max-h-[60vh] object-contain" onOpen={() => setExpandedPhoto(url)} />
                    </div>
                  );
                })()}

                {/* Verification Video */}
                {selectedSubmission.video_url && selectedSubmission.video_url !== selectedSubmission.face_image_url && (() => {
                  const url = selectedSubmission.video_url;
                  return (
                    <div className="space-y-3 rounded-xl border border-[#E2E8F0] bg-white p-4 shadow-sm">
                      <h4 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wider text-[#0F172A]">
                        <Camera className="w-5 h-5 text-[#2563EB]" /> Verification Video
                        <span className="ml-auto rounded-full border border-[#E2E8F0] bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-700 normal-case tracking-normal">10s Intro</span>
                      </h4>
                      <AdminMediaFrame src={url} alt="Verification video" kind="video" poster={selectedSubmission.profile_photo_url} className="rounded-lg border border-[#E2E8F0] bg-black max-h-[70vh] flex items-center justify-center" mediaClassName="max-h-[70vh] w-full object-contain" />
                    </div>
                  );
                })()}

                {([selectedSubmission.front_url, selectedSubmission.left_url, selectedSubmission.right_url].filter(Boolean) as string[]).length > 0 && (
                  <div className="space-y-3 rounded-xl border border-[#E2E8F0] bg-white p-4 shadow-sm">
                    <h4 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wider text-[#0F172A]">
                      <Camera className="w-5 h-5 text-[#2563EB]" /> Manual Face Angles
                    </h4>
                    <div className="grid grid-cols-3 gap-3">
                      {([selectedSubmission.front_url, selectedSubmission.left_url, selectedSubmission.right_url].filter(Boolean) as string[]).map((url, index) => (
                        <AdminMediaFrame key={index} src={url} alt={`Face angle ${index + 1}`} className="aspect-[3/4] rounded-lg border border-[#E2E8F0] bg-slate-50 flex items-center justify-center" mediaClassName="w-full h-full object-contain" onOpen={!isVideoUrl(url) ? () => setExpandedPhoto(url) : undefined} />
                      ))}
                    </div>
                  </div>
                )}

                {/* Host Photos */}
                {selectedSubmission.host_photos && selectedSubmission.host_photos.length > 0 && (
                  <div className="space-y-3 rounded-xl border border-[#E2E8F0] bg-white p-4 shadow-sm">
                    <h4 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wider text-[#0F172A]">
                      <ImagePlus className="w-5 h-5 text-[#2563EB]" /> Host Photos
                      <span className="ml-auto rounded-full border border-[#E2E8F0] bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-700 normal-case tracking-normal">{selectedSubmission.host_photos.length}</span>
                    </h4>
                    <div className="grid grid-cols-3 gap-3">
                      {selectedSubmission.host_photos.map((photo, index) => {
                        const url = photo;
                        return (
                          <div key={index} className="relative group">
                            <AdminMediaFrame src={url} alt={`Host photo ${index + 1}`} kind="image" className="aspect-[3/4] rounded-lg border border-[#E2E8F0] bg-slate-50 hover:border-slate-300 transition-colors flex items-center justify-center" mediaClassName="w-full h-full object-contain" onOpen={() => setExpandedPhoto(url)} />
                            <span className="absolute top-1.5 left-1.5 bg-[#2563EB] text-slate-900 text-[10px] px-2 py-0.5 rounded-full font-bold shadow-sm">{index + 1}</span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Rejection Reason */}
                {isRejected(selectedSubmission) && selectedSubmission.rejection_reason && (
                  <div className="p-4 bg-red-50 border border-red-200 rounded-lg">
                    <p className="text-sm text-red-700 font-semibold mb-1">Rejection Reason:</p>
                    <p className="text-red-800">{selectedSubmission.rejection_reason}</p>
                  </div>
                )}


                {/* Action Buttons */}
                {isPendingBucket(selectedSubmission) && (
                  <div className="space-y-2 pt-4">
                    <div className="flex gap-3">
                      <Button
                        className="flex-1 bg-green-600 hover:bg-green-700"
                        disabled={processing}
                        onClick={() => {
                          processSubmissionAction({
                            submission: selectedSubmission,
                            action: 'approve',
                            approveAs: selectedSubmission.verification_type === 'host' ? 'host' : 'user',
                            setGender: selectedSubmission.profile?.gender === 'female' ? 'female' : selectedSubmission.verification_type === 'host' ? 'female' : 'male',
                          });
                        }}
                      >
                        <CheckCircle2 className="w-4 h-4 mr-2" /> Approve
                      </Button>
                      <Button
                        variant="destructive"
                        className="flex-1"
                        disabled={processing}
                        onClick={() => processSubmissionAction({
                          submission: selectedSubmission,
                          action: 'reject',
                          reason: actionReason,
                        })}
                      >
                        <XCircle className="w-4 h-4 mr-2" /> Reject
                      </Button>
                    </div>
                    {/* Manual Override + Re-run row */}
                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        className="flex-1 border-amber-500/50 text-amber-300 hover:bg-amber-500/10"
                        disabled={processing}
                        onClick={() => handleRerunAws(selectedSubmission.id)}
                      >
                        {processing ? <Loader2 className="w-3 h-3 mr-2 animate-spin" /> : <RefreshCw className="w-3 h-3 mr-2" />}
                        Re-run AWS
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        className="flex-1 border-pink-500/50 text-pink-300 hover:bg-pink-500/10"
                        disabled={processing}
                        onClick={() => handleManualOverrideApprove(selectedSubmission, 'host')}
                      >
                        Override → Host
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        className="flex-1 border-blue-500/50 text-blue-300 hover:bg-blue-500/10"
                        disabled={processing}
                        onClick={() => handleManualOverrideApprove(selectedSubmission, 'user')}
                      >
                        Override → User
                      </Button>
                    </div>
                  </div>
                )}

                {/* Rejected → allow re-open via override approve */}
                {isRejected(selectedSubmission) && (
                  <div className="flex gap-2 pt-4 border-t border-slate-200">
                    <Button
                      variant="outline"
                      size="sm"
                      className="flex-1 border-amber-500/50 text-amber-300 hover:bg-amber-500/10"
                      disabled={processing}
                      onClick={() => handleRerunAws(selectedSubmission.id)}
                    >
                      <RefreshCw className="w-3 h-3 mr-2" /> Re-run AWS
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      className="flex-1 border-pink-500/50 text-pink-300 hover:bg-pink-500/10"
                      disabled={processing}
                      onClick={() => handleManualOverrideApprove(selectedSubmission, 'host')}
                    >
                      ⚠️ Re-open → Host
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      className="flex-1 border-blue-500/50 text-blue-300 hover:bg-blue-500/10"
                      disabled={processing}
                      onClick={() => handleManualOverrideApprove(selectedSubmission, 'user')}
                    >
                      ⚠️ Re-open → User
                    </Button>
                  </div>
                )}

                {/* Post-Approval Admin Controls */}
                {isApproved(selectedSubmission) && (
                  <div className="pt-4 border-t border-slate-200 space-y-4">
                    <h4 className="font-semibold text-sm text-amber-300 flex items-center gap-2">
                      <Shield className="w-4 h-4" /> Admin Controls
                    </h4>
                    
                    {/* Gender Change */}
                    <div className="space-y-2">
                      <Label className="text-xs text-muted-foreground">Change Gender</Label>
                      <div className="flex gap-2">
                        {['male', 'female', 'other'].map((g) => (
                          <Button key={g} size="sm"
                            variant={selectedSubmission.profile?.gender === g ? 'default' : 'outline'}
                            className={`flex-1 text-xs ${selectedSubmission.profile?.gender === g ? 'bg-purple-600' : ''}`}
                            disabled={processing}
                            onClick={async () => {
                              if (processing || actionInFlightRef.current) return;
                              actionInFlightRef.current = true;
                              setProcessing(true);
                              try {
                                const { error } = await supabase.rpc('admin_update_user_gender', { _user_id: selectedSubmission.user_id, _gender: g });
                                if (error) throw error;
                                toast({ title: "✅ Gender Updated", description: `Gender set to ${g}` });
                                fetchSubmissions();
                                setSelectedSubmission(prev => prev ? { ...prev, profile: prev.profile ? { ...prev.profile, gender: g } : prev.profile } : null);
                              } catch (e: any) {
                                toast({ title: "Error", description: e.message, variant: "destructive" });
                              } finally {
                                setProcessing(false);
                                actionInFlightRef.current = false;
                              }
                            }}
                          >
                            {g === 'male' ? '👨 Male' : g === 'female' ? '👩 Female' : '🧑 Other'}
                          </Button>
                        ))}
                      </div>
                    </div>

                    {/* Role Change */}
                    <div className="space-y-2">
                      <Label className="text-xs text-muted-foreground">Change Role</Label>
                      <div className="flex gap-2">
                        <Button size="sm"
                          variant={selectedSubmission.profile?.is_host ? 'default' : 'outline'}
                          className={`flex-1 text-xs ${selectedSubmission.profile?.is_host ? 'bg-pink-600' : ''}`}
                          disabled={processing}
                          onClick={async () => {
                            if (processing || actionInFlightRef.current) return;
                            actionInFlightRef.current = true;
                            setProcessing(true);
                            try {
                              const { error } = await supabase.rpc('admin_update_user_gender', { _user_id: selectedSubmission.user_id, _gender: 'female' });
                              if (error) throw error;
                              // Send notification to the user
                              await adminSendNotification(selectedSubmission.user_id, '🌟 Host Account Activated! 🎤✨', '🎉 Congratulations! Your account has been upgraded to Host status! 🔥 Complete your Face Verification now and start going live to earn rewards! 💎🫘 Welcome to the spotlight! 🌟', 'system');
                              toast({ title: "✅ Role Updated", description: "Set as Host (Female) + Notification sent" });
                              fetchSubmissions();
                              setSelectedSubmission(prev => prev ? { ...prev, profile: prev.profile ? { ...prev.profile, is_host: true, gender: 'female' } : prev.profile } : null);
                            } catch (e: any) {
                              toast({ title: "Error", description: e.message, variant: "destructive" });
                            } finally {
                              setProcessing(false);
                              actionInFlightRef.current = false;
                            }
                          }}
                        >
                          <Mic className="w-3 h-3 mr-1" /> 🎤 Host
                        </Button>
                        <Button size="sm"
                          variant={!selectedSubmission.profile?.is_host ? 'default' : 'outline'}
                          className={`flex-1 text-xs ${!selectedSubmission.profile?.is_host ? 'bg-blue-600' : ''}`}
                          disabled={processing}
                          onClick={async () => {
                            if (processing || actionInFlightRef.current) return;
                            actionInFlightRef.current = true;
                            setProcessing(true);
                            try {
                              const { error } = await supabase.rpc('admin_update_user_gender', { _user_id: selectedSubmission.user_id, _gender: 'male' });
                              if (error) throw error;
                              // Send notification to the user
                              await adminSendNotification(selectedSubmission.user_id, '👤 User Account Updated! ✨', '✅ Your account has been switched to User mode! 🔄 Please complete your Face Verification to continue enjoying all features! 💫', 'system');
                              toast({ title: "✅ Role Updated", description: "Set as User (Male) + Notification sent" });
                              fetchSubmissions();
                              setSelectedSubmission(prev => prev ? { ...prev, profile: prev.profile ? { ...prev.profile, is_host: false, gender: 'male' } : prev.profile } : null);
                            } catch (e: any) {
                              toast({ title: "Error", description: e.message, variant: "destructive" });
                            } finally {
                              setProcessing(false);
                              actionInFlightRef.current = false;
                            }
                          }}
                        >
                          <User className="w-3 h-3 mr-1" /> 👤 User
                        </Button>
                      </div>
                    </div>

                    {/* Remove Verification */}
                    <Button variant="outline" className="w-full border-amber-500/50 text-amber-500 hover:bg-amber-500/10" onClick={() => handleRemoveVerification(selectedSubmission.user_id)} disabled={processing}>
                      {processing ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Trash2 className="w-4 h-4 mr-2" />}
                      Remove Verification
                    </Button>
                    <p className="text-xs text-muted-foreground text-center">Removing will allow the user to re-verify</p>
                  </div>
                )}
              </div>
            );
          })()}
        </DialogContent>
      </Dialog>

      <AdminMediaDialog open={!!expandedPhoto} onOpenChange={(open) => !open && setExpandedPhoto(null)} src={expandedPhoto} title="Expanded Photo" kind="image" />

      {/* Action Modal */}
      <Dialog open={showActionModal} onOpenChange={setShowActionModal}>
        <DialogContent className="bg-white border-[#E2E8F0] text-[#0F172A] max-w-md w-screen sm:w-auto h-[100dvh] sm:h-auto max-h-[100dvh] sm:max-h-[90vh] rounded-none sm:rounded-xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-[#0F172A] text-lg font-bold tracking-tight">
              {actionType === 'approve' ? 'Confirm Approval' : 'Confirm Rejection'}
            </DialogTitle>
            <DialogDescription className="text-slate-500">
              {actionType === 'approve' ? 'Select gender and click Host or User to convert instantly' : 'Provide a reason for rejection'}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-5">
            {actionType === 'approve' && (
              <>
                {/* Gender Selection */}
                <div className="space-y-2">
                  <Label className="text-[11px] text-slate-500 font-semibold uppercase tracking-wider">Select Gender</Label>
                  <div className="grid grid-cols-2 gap-3">
                    <button onClick={() => setApproveGender('female')}
                      className={`relative overflow-hidden rounded-lg p-3.5 transition-all duration-150 border ${approveGender === 'female' ? 'border-pink-400 bg-pink-50 ring-2 ring-pink-200' : 'border-[#E2E8F0] bg-white hover:bg-slate-50'}`}>
                      <div className="flex items-center justify-center gap-2">
                        <span className="text-2xl">👩</span>
                        <span className={`font-semibold ${approveGender === 'female' ? 'text-pink-700' : 'text-slate-600'}`}>Female</span>
                      </div>
                      {approveGender === 'female' && (
                        <div className="absolute top-1.5 right-1.5 w-5 h-5 rounded-full bg-pink-500 flex items-center justify-center">
                          <CheckCircle2 className="w-3 h-3 text-slate-900" />
                        </div>
                      )}
                    </button>
                    <button onClick={() => setApproveGender('male')}
                      className={`relative overflow-hidden rounded-lg p-3.5 transition-all duration-150 border ${approveGender === 'male' ? 'border-blue-400 bg-blue-50 ring-2 ring-blue-200' : 'border-[#E2E8F0] bg-white hover:bg-slate-50'}`}>
                      <div className="flex items-center justify-center gap-2">
                        <span className="text-2xl">👨</span>
                        <span className={`font-semibold ${approveGender === 'male' ? 'text-blue-700' : 'text-slate-600'}`}>Male</span>
                      </div>
                      {approveGender === 'male' && (
                        <div className="absolute top-1.5 right-1.5 w-5 h-5 rounded-full bg-blue-500 flex items-center justify-center">
                          <CheckCircle2 className="w-3 h-3 text-slate-900" />
                        </div>
                      )}
                    </button>
                  </div>
                </div>

                {/* Pkg382: single combined Approve bar + Convert-to-User (re-verify) */}
                <div className="p-4 rounded-xl bg-[#F8FAFC] border border-[#E2E8F0] space-y-3">
                  <p className="text-[10px] text-slate-500 font-semibold text-center uppercase tracking-widest">
                    Select role then Approve
                  </p>
                  <RoleApproveBar
                    defaultRole={selectedSubmission?.verification_type === 'host' ? 'host' : 'user'}
                    processing={processing}
                    approvalDisabled={!selectedSubmission}
                    disabledReason={selectedSubmission ? undefined : 'No submission selected'}
                    onApprove={(role) => {
                      if (!selectedSubmission) return;
                      processSubmissionAction({
                        submission: selectedSubmission,
                        action: 'approve',
                        approveAs: role,
                        setGender: role === 'host' ? 'female' : 'male',
                        reason: actionReason,
                      });
                    }}
                  />
                  <button
                    disabled={processing || !selectedSubmission}
                    onClick={async () => {
                      if (!selectedSubmission || processing || actionInFlightRef.current) return;
                      if (!confirm('Convert this account to a plain User and RESET face verification? The user will be able to re-submit face verification. If they were in an agency, they will be detached.')) return;
                      actionInFlightRef.current = true;
                      setProcessing(true);
                      try {
                        const { data, error } = await supabase.rpc('admin_remove_face_verification', { _user_id: selectedSubmission.user_id });
                        if (error) throw error;
                        if ((data as any)?.pending) {
                          toast({ title: '⏳ Submitted for Owner Approval', description: 'Convert-to-user queued for owner approval.' });
                        } else if ((data as any)?.success === false) {
                          throw new Error((data as any)?.error || 'Failed to convert');
                        } else {
                          toast({
                            title: '✅ Converted to User',
                            description: (data as any)?.detached_from_agency
                              ? 'User was detached from agency and can re-submit face verification.'
                              : 'User can now re-submit face verification.',
                          });
                        }
                        setShowActionModal(false); setShowDetailModal(false); setActionReason(''); fetchSubmissions();
                      } catch (error: any) {
                        toast({ title: 'Error', description: error.message || 'Failed to convert', variant: 'destructive' });
                      } finally { setProcessing(false); actionInFlightRef.current = false; }
                    }}
                    className="w-full rounded-lg p-3 transition-colors disabled:opacity-50 disabled:pointer-events-none border border-amber-300 bg-amber-50 text-amber-800 hover:bg-amber-100 font-semibold text-sm"
                  >
                    {processing ? <Loader2 className="w-4 h-4 mr-2 inline animate-spin" /> : null}
                    Convert to User (allow re-verify)
                  </button>
                  <p className="text-[10px] text-slate-500 text-center leading-snug">
                    "Convert to User" removes host status &amp; face-verified flag, detaches from agency, and lets the user submit face verification again.
                  </p>
                </div>

              </>
            )}
            {/* Rejection UI */}
            {actionType === 'reject' && (
              <div>
                <Label className="text-slate-700 font-medium">Rejection Reason</Label>
                <Textarea placeholder="Enter reason for rejection..." value={actionReason} onChange={(e) => setActionReason(e.target.value)} className="mt-2 bg-white border-[#E2E8F0] text-[#0F172A] placeholder:text-slate-400" rows={3} />
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowActionModal(false)} className="bg-white border-[#E2E8F0] text-slate-700 hover:bg-slate-50">Cancel</Button>

            {actionType === 'reject' && (
              <Button onClick={handleAction} disabled={processing} className="bg-red-600 hover:bg-red-500 text-white">
                {processing ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <XCircle className="w-4 h-4 mr-2" />}
                Reject
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {selectedSubmission && (
        <DuplicateFaceExplainerDialog
          open={showDuplicateExplainer}
          onOpenChange={setShowDuplicateExplainer}
          submission={selectedSubmission}
        />
      )}
    </div>
    </div>
  );
};

export default AdminFaceVerification;
