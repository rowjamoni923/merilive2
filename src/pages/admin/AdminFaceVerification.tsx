import { useState, useEffect, useRef, useMemo } from "react";
import useAdminRealtime from "@/hooks/useAdminRealtime";
import { resolveAdminStorageImageUrl } from "@/utils/adminStorageImages";
import { 
  ScanFace, 
  Search, 
  CheckCircle2, 
  XCircle, 
  Clock, 
  Eye,
  User,
  Video,
  Image,
  RefreshCw,
  Loader2,
  Calendar,
  Trash2,
  AlertTriangle,
  CircleCheckBig,
  Camera,
  FileCheck,
  Languages,
  CakeSlice,
  ImagePlus,
  Fingerprint,
  Shield,
  Mic
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
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

import { formatAdminError } from "@/utils/formatAdminError";
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
  rejection_reason: string | null;
  admin_notes: string | null;
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

const FACE_VERIFICATION_CACHE_KEY = 'admin_face_verification_cache_v2';
const FACE_VERIFICATION_FETCH_LIMIT = 200;
const ADMIN_FAST_LOADING_TIMEOUT_MS = 900;

const AdminFaceVerification = () => {
  const { toast } = useToast();
  const [submissions, setSubmissions] = useState<Submission[]>(() => {
    if (typeof window === 'undefined') return [];
    try {
      const raw = sessionStorage.getItem(FACE_VERIFICATION_CACHE_KEY);
      return raw ? (JSON.parse(raw) as Submission[]) : [];
    } catch {
      return [];
    }
  });
  const [loading, setLoading] = useState(() => {
    if (typeof window === 'undefined') return true;
    try {
      return !sessionStorage.getItem(FACE_VERIFICATION_CACHE_KEY);
    } catch {
      return true;
    }
  });
  const [refreshing, setRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [activeTab, setActiveTab] = useState("pending");
  const [selectedSubmission, setSelectedSubmission] = useState<Submission | null>(null);
  const [showDetailModal, setShowDetailModal] = useState(false);
  const [showActionModal, setShowActionModal] = useState(false);
  const [actionType, setActionType] = useState<'approve' | 'reject'>('approve');
  const [actionReason, setActionReason] = useState("");
  const [approveAs, setApproveAs] = useState<'host' | 'user'>('user');
  const [approveGender, setApproveGender] = useState<'female' | 'male'>('male');
  const [processing, setProcessing] = useState(false);
  const [expandedPhoto, setExpandedPhoto] = useState<string | null>(null);
  const [resolvedMedia, setResolvedMedia] = useState<{
    profile_photo_url?: string | null;
    video_url?: string | null;
    face_image_url?: string | null;
    front_url?: string | null;
    left_url?: string | null;
    right_url?: string | null;
    selfie_url?: string | null;
    host_photos?: string[];
  }>({});
  const actionInFlightRef = useRef(false);

  // Resolve private storage URLs → signed URLs whenever a submission is opened
  useEffect(() => {
    if (!selectedSubmission) {
      setResolvedMedia({});
      return;
    }
    let cancelled = false;
    (async () => {
      const sub = selectedSubmission;
      const [profile_photo_url, video_url, face_image_url, front_url, left_url, right_url, selfie_url, ...hostPhotos] = await Promise.all([
        resolveAdminStorageImageUrl(sub.profile_photo_url, 'face-verification'),
        resolveAdminStorageImageUrl(sub.video_url, 'face-verification'),
        resolveAdminStorageImageUrl(sub.face_image_url, 'face-verification'),
        resolveAdminStorageImageUrl(sub.front_url, 'face-verification'),
        resolveAdminStorageImageUrl(sub.left_url, 'face-verification'),
        resolveAdminStorageImageUrl(sub.right_url, 'face-verification'),
        resolveAdminStorageImageUrl(sub.selfie_url, 'face-verification'),
        ...((sub.host_photos || []).map((u) => resolveAdminStorageImageUrl(u, 'face-verification'))),
      ]);
      if (cancelled) return;
      setResolvedMedia({
        profile_photo_url,
        video_url,
        face_image_url,
        front_url,
        left_url,
        right_url,
        selfie_url,
        host_photos: hostPhotos.map((u) => u || ''),
      });
    })();
    return () => { cancelled = true; };
  }, [selectedSubmission]);

  const fetchSubmissions = async () => {
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
      const { data, error } = await supabase.rpc(
        'admin_list_face_verification_paginated',
        { _status: null, _search: null, _limit: FACE_VERIFICATION_FETCH_LIMIT, _offset: 0 }
      );

      if (error) throw error;

      const payload = (data as any) || {};
      const rows = (payload.rows || []) as any[];

      const enriched: Submission[] = rows.map((s) => ({
        ...s,
        // RPC returns profile as a jsonb object; normalize null → undefined
        profile: s.profile && s.profile.id ? s.profile : undefined,
        agency_info: s.agency_name
          ? { agency_name: s.agency_name, agency_code: s.agency_code }
          : null,
      }));

      setSubmissions(enriched);

      // Cache for instant subsequent loads
      if (typeof window !== 'undefined') {
        try {
          sessionStorage.setItem(FACE_VERIFICATION_CACHE_KEY, JSON.stringify(enriched));
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

  useAdminRealtime(['face_verification_submissions'], fetchSubmissions);

  const handleRefresh = () => { setRefreshing(true); fetchSubmissions(); };

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
    const nextStatus = action === 'approve' ? 'approved' : 'rejected';
    const resolvedApproveAs = action === 'approve'
      ? (approveAs || (submission.verification_type === 'host' ? 'host' : 'user'))
      : 'user';
    const resolvedGender = action === 'approve'
      ? (resolvedApproveAs === 'host' ? 'female' : 'male')
      : null;
    const resolvedReason = action === 'reject'
      ? (reason?.trim() || 'Rejected by admin')
      : (reason?.trim() || null);

    // Optimistic: remove from current view immediately
    setSubmissions((prev) => prev.filter((s) => s.id !== submission.id));

    // Always close modals immediately for instant feel
    setShowActionModal(false);
    setShowDetailModal(false);
    setSelectedSubmission(null);

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
        setSubmissions(previousSubmissions);
      } else {
        toast({
          title: action === 'approve' ? '✅ Approved!' : '❌ Rejected!',
          description: action === 'approve' ? 'Face verification approved' : 'Face verification rejected',
        });
      }

      setActionReason('');
      fetchSubmissions();
    } catch (error: any) {
      setSubmissions(previousSubmissions);
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
    const hasFaceEvidence = !!(sub.front_url || sub.selfie_url || sub.face_image_url);

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
        { label: '10s Intro Video', icon: <Video className="w-4 h-4" />, done: !!sub.video_url },
        { label: 'Host Photos', icon: <ImagePlus className="w-4 h-4" />, done: !!(sub.host_photos && sub.host_photos.length === 3), preview: sub.host_photos?.length ? <span className="text-xs text-muted-foreground">{sub.host_photos.length}/3 photos</span> : undefined },
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
    const hasRequiredVideo = effectiveType === 'host' ? !!sub.video_url : !!sub.face_image_url;

    return { hasProfilePhoto, videoLabel, hasRequiredVideo };
  };

  const isSubmissionEligibleForApproval = (sub: Submission) => {
    const { percentage } = getCompletionData(sub);
    const hasVisualEvidence = !!(sub.profile_photo_url || sub.profile?.avatar_url || sub.front_url || sub.selfie_url || sub.face_image_url || sub.video_url || (sub.host_photos && sub.host_photos.length > 0));
    return percentage === 100 && hasVisualEvidence;
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

  const isVideoUrl = (url: string) => /\.(webm|mp4|mov|avi|ogg)(\?|$)/i.test(url);

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
      const adminToken = localStorage.getItem('admin_session_token') || '';
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

  // Bulletproof bucketing: every submission lands in EXACTLY one of pending / approved / rejected.
  // Anything that is not explicitly approved or rejected counts as pending (submitted, pending,
  // under_review, applied, or any future intermediate status). This guarantees a host who just
  // applied always shows up in the Pending tab — never silently in "All" only.
  const isApproved = (s: Submission) => s.status === 'approved';
  const isRejected = (s: Submission) => s.status === 'rejected';
  const isPendingBucket = (s: Submission) => !isApproved(s) && !isRejected(s);

  // Single source of truth for what the user can currently see (after search).
  // Counters are derived from the SAME pool the list uses, so badges always match
  // the visible rows regardless of search input. Search is applied BEFORE the tab
  // bucket filter, so typing a query narrows results within the active tab.
  //
  // Match rules (case-insensitive, whitespace-trimmed):
  //   • display_name contains query
  //   • full_name contains query
  //   • app_uid contains query (digits only typed by admin)
  //   • user_id (uuid) starts-with query — handy for direct lookups
  const qRaw = searchQuery.trim();
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

  const visiblePool = submissions.filter(matchesSearch);

  const autoApprovedSubmissions = visiblePool.filter(
    (s) => isApproved(s) && s.admin_notes?.toLowerCase().includes('auto'),
  );
  const filteredSubmissions = visiblePool.filter((sub) => {
    if (activeTab === 'auto_approved') {
      return isApproved(sub) && sub.admin_notes?.toLowerCase().includes('auto');
    }
    if (activeTab === 'pending') return isPendingBucket(sub);
    if (activeTab === 'approved') return isApproved(sub);
    if (activeTab === 'rejected') return isRejected(sub);
    if (activeTab === 'all') return true;
    return false;
  });

  const pendingCount = visiblePool.filter(isPendingBucket).length;
  const approvedCount = visiblePool.filter(isApproved).length;
  const autoApprovedCount = autoApprovedSubmissions.length;
  const rejectedCount = visiblePool.filter(isRejected).length;

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 animate-spin text-purple-500" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <ScanFace className="w-7 h-7 text-purple-500" />
            Face Verification
          </h1>
          <p className="text-muted-foreground">Manage face verification requests</p>
        </div>
        <Button onClick={handleRefresh} disabled={refreshing} variant="outline">
          <RefreshCw className={`w-4 h-4 mr-2 ${refreshing ? 'animate-spin' : ''}`} />
          Refresh
        </Button>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: 'Pending', count: pendingCount, icon: Clock, bg: 'rgba(245,158,11,0.15)', border: 'rgba(245,158,11,0.3)', iconBg: 'rgba(245,158,11,0.3)', iconColor: '#fbbf24', textColor: '#fcd34d', subColor: 'rgba(251,191,36,0.8)' },
          { label: 'Auto Approved', count: autoApprovedCount, icon: Shield, bg: 'rgba(6,182,212,0.15)', border: 'rgba(6,182,212,0.3)', iconBg: 'rgba(6,182,212,0.3)', iconColor: '#22d3ee', textColor: '#67e8f9', subColor: 'rgba(34,211,238,0.8)' },
          { label: 'Approved', count: approvedCount, icon: CheckCircle2, bg: 'rgba(34,197,94,0.15)', border: 'rgba(34,197,94,0.3)', iconBg: 'rgba(34,197,94,0.3)', iconColor: '#4ade80', textColor: '#86efac', subColor: 'rgba(74,222,128,0.8)' },
          { label: 'Rejected', count: rejectedCount, icon: XCircle, bg: 'rgba(239,68,68,0.15)', border: 'rgba(239,68,68,0.3)', iconBg: 'rgba(239,68,68,0.3)', iconColor: '#f87171', textColor: '#fca5a5', subColor: 'rgba(248,113,113,0.8)' },
          { label: 'Total', count: visiblePool.length, icon: ScanFace, bg: 'rgba(168,85,247,0.15)', border: 'rgba(168,85,247,0.3)', iconBg: 'rgba(168,85,247,0.3)', iconColor: '#c084fc', textColor: '#d8b4fe', subColor: 'rgba(192,132,252,0.8)' },
        ].map(({ label, count, icon: Icon, bg, border, iconBg, iconColor, textColor, subColor }) => (
          <div key={label} className="rounded-xl p-4 shadow-md" style={{ background: bg, border: `1px solid ${border}` }}>
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full flex items-center justify-center" style={{ backgroundColor: iconBg }}>
                <Icon className="w-5 h-5" style={{ color: iconColor }} />
              </div>
              <div>
                <p className="text-2xl font-bold" style={{ color: textColor }}>{count}</p>
                <p className="text-sm" style={{ color: subColor }}>{label}</p>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Status legend */}
      <div className="rounded-lg border border-border/50 bg-card/40 p-4 text-sm">
        <div className="font-semibold text-foreground mb-2 flex items-center gap-2">
          <ScanFace className="w-4 h-4 text-primary" /> Status Legend — How hosts are bucketed
        </div>
        <ul className="grid gap-2 md:grid-cols-3">
          <li className="flex gap-2">
            <Badge className="bg-amber-500/20 text-amber-300 border border-amber-500/30 shrink-0"><Clock className="w-3 h-3 mr-1" />Pending</Badge>
            <span className="text-muted-foreground">Host has submitted face verification but admin has not yet approved or rejected. Anything not Approved/Rejected lives here.</span>
          </li>
          <li className="flex gap-2">
            <Badge className="bg-green-500/20 text-green-300 border border-green-500/30 shrink-0"><CheckCircle2 className="w-3 h-3 mr-1" />Approved</Badge>
            <span className="text-muted-foreground">Admin (or auto-approval, when threshold met) accepted the submission. Host gains <code>is_host=true</code> and can go live.</span>
          </li>
          <li className="flex gap-2">
            <Badge className="bg-red-500/20 text-red-300 border border-red-500/30 shrink-0"><XCircle className="w-3 h-3 mr-1" />Rejected</Badge>
            <span className="text-muted-foreground">Admin declined the submission with a reason. Host stays a regular user and must resubmit to re-enter Pending.</span>
          </li>
        </ul>
        <div className="mt-2 text-xs text-muted-foreground/80">
          Auto Approved is a sub-view of Approved (admin_notes contains "auto"). Search and tab counters always reflect what is visible in the list.
        </div>
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input placeholder="Search by name or UID..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="pl-10" />
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid grid-cols-5 w-full max-w-lg">
          <TabsTrigger value="pending" className="relative">
            Pending
            {pendingCount > 0 && <span className="absolute -top-1 -right-1 w-5 h-5 bg-amber-500 rounded-full text-[10px] font-bold flex items-center justify-center text-white">{pendingCount}</span>}
          </TabsTrigger>
          <TabsTrigger value="auto_approved" className="relative text-xs">
            Auto Approved
            {autoApprovedCount > 0 && <span className="absolute -top-1 -right-1 w-5 h-5 bg-cyan-500 rounded-full text-[10px] font-bold flex items-center justify-center text-white">{autoApprovedCount}</span>}
          </TabsTrigger>
          <TabsTrigger value="approved">Approved</TabsTrigger>
          <TabsTrigger value="rejected">Rejected</TabsTrigger>
          <TabsTrigger value="all">All</TabsTrigger>
        </TabsList>

        <TabsContent value={activeTab} className="mt-4">
          {filteredSubmissions.length === 0 ? (
            <div className="text-center py-12">
              <ScanFace className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
              <p className="text-muted-foreground">No submissions found</p>
            </div>
          ) : (
            <div className="space-y-4">
              {filteredSubmissions.map((submission) => {
                const { completed, total, percentage } = getCompletionData(submission);
                const faceMatch = extractFaceMatchPercentage(submission.admin_notes);
                const canApprove = isSubmissionEligibleForApproval(submission);
                const mediaStatus = getSubmissionMediaStatus(submission);

                return (
                  <div key={submission.id} className="bg-card border rounded-xl p-3 space-y-3">
                    <div className="flex items-center gap-3">
                      <Avatar className="w-10 h-10 border border-border">
                        <AvatarImage src={submission.profile?.avatar_url} />
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
                        </div>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          UID: {submission.profile?.app_uid} • {formatDate(submission.created_at)}
                        </p>
                      </div>

                      <Button variant="ghost" size="icon" onClick={() => { setSelectedSubmission(submission); setShowDetailModal(true); }}>
                        <Eye className="w-4 h-4" />
                      </Button>
                    </div>

                    <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                      <div className="rounded-lg border border-border bg-accent/20 px-2.5 py-2">
                        <p className="text-[10px] text-muted-foreground">Completion</p>
                        <p className="text-sm font-semibold">{completed}/{total} ({percentage}%)</p>
                      </div>
                      <div className="rounded-lg border border-border bg-accent/20 px-2.5 py-2">
                        <p className="text-[10px] text-muted-foreground">Face Match</p>
                        <p className={`text-sm font-semibold ${typeof faceMatch === 'number' && faceMatch >= MIN_FACE_MATCH_PERCENTAGE ? 'text-emerald-400' : 'text-rose-400'}`}>
                          {typeof faceMatch === 'number' ? `${faceMatch.toFixed(1)}%` : 'N/A'}
                        </p>
                      </div>
                      <div className="rounded-lg border border-border bg-accent/20 px-2.5 py-2">
                        <p className="text-[10px] text-muted-foreground">Profile Photo</p>
                        <p className="text-sm font-semibold">{mediaStatus.hasProfilePhoto ? 'Yes' : 'No'}</p>
                      </div>
                      <div className="rounded-lg border border-border bg-accent/20 px-2.5 py-2">
                        <p className="text-[10px] text-muted-foreground">{mediaStatus.videoLabel}</p>
                        <p className="text-sm font-semibold">{mediaStatus.hasRequiredVideo ? 'Yes' : 'No'}</p>
                      </div>
                    </div>

                    {submission.is_duplicate_face && (
                      <div className="flex items-center gap-2 p-2 rounded-lg bg-destructive/10 border border-destructive/30">
                        <AlertTriangle className="w-4 h-4 text-destructive" />
                        <p className="text-xs text-destructive font-medium truncate">Duplicate face: {submission.duplicate_face_name || 'Unknown'}</p>
                      </div>
                    )}

                    {['pending', 'submitted', 'under_review'].includes(submission.status) && (
                      <div className="flex gap-2">
                        <Button
                          className="flex-1"
                          disabled={processing || !canApprove}
                          onClick={() => {
                            if (!canApprove) {
                              toast({
                                title: 'Approval blocked',
                                description: 'Required verification media is incomplete. Open details to review or re-run AWS.',
                                variant: 'destructive',
                              });
                              return;
                            }
                            processSubmissionAction({
                              submission,
                              action: 'approve',
                              approveAs: submission.verification_type === 'host' ? 'host' : 'user',
                              setGender: submission.profile?.gender === 'female' ? 'female' : submission.verification_type === 'host' ? 'female' : 'male',
                            });
                          }}
                        >
                          <CheckCircle2 className="w-4 h-4 mr-2" /> Approve
                        </Button>
                        <Button
                          variant="destructive"
                          className="flex-1"
                          disabled={processing}
                          onClick={() => processSubmissionAction({ submission, action: 'reject' })}
                        >
                          <XCircle className="w-4 h-4 mr-2" /> Reject
                        </Button>
                      </div>
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
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto bg-slate-900 border-slate-700 text-white">
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
            const canApproveSelected = isSubmissionEligibleForApproval(selectedSubmission);

            return (
              <div className="space-y-5">
                {/* User Info */}
                <div className="flex items-center gap-4 p-4 bg-accent/50 rounded-xl">
                  <Avatar className="w-16 h-16 border-2 border-purple-500/30">
                    <AvatarImage src={selectedSubmission.profile?.avatar_url} />
                    <AvatarFallback>{selectedSubmission.profile?.display_name?.charAt(0) || 'U'}</AvatarFallback>
                  </Avatar>
                  <div>
                    <h3 className="font-bold text-lg">{selectedSubmission.profile?.display_name}</h3>
                    <p className="text-sm text-muted-foreground">UID: {selectedSubmission.profile?.app_uid}</p>
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
                          <AvatarImage src={selectedSubmission.duplicate_face_avatar} />
                          <AvatarFallback>U</AvatarFallback>
                        </Avatar>
                      )}
                      <div>
                        <p className="font-semibold text-red-200">{selectedSubmission.duplicate_face_name || 'Unknown'}</p>
                        {selectedSubmission.duplicate_face_uid && <p className="text-xs text-red-300">UID: {selectedSubmission.duplicate_face_uid}</p>}
                      </div>
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

                {/* Face Verification */}
                {selectedSubmission.face_image_url && !selectedSubmission.face_image_url.startsWith('admin-approved://') && (() => {
                  const url = resolvedMedia.face_image_url || selectedSubmission.face_image_url;
                  return (
                    <div className="space-y-3">
                      <h4 className="font-semibold flex items-center gap-2 text-purple-300">
                        <ScanFace className="w-5 h-5" /> Face Verification
                      </h4>
                      <div className="flex justify-center rounded-xl overflow-hidden border-2 border-purple-500/30 bg-black">
                        {isVideoUrl(url) ? (
                          <video src={url} controls autoPlay muted playsInline crossOrigin="anonymous" className="w-full max-h-80 object-contain"
                            onError={(e) => { const v = e.currentTarget; if (v.crossOrigin) { v.removeAttribute('crossorigin'); v.load(); } }} />
                        ) : (
                          <img src={url} alt="Face" className="max-h-80 object-contain cursor-pointer" onClick={() => setExpandedPhoto(url)} />
                        )}
                      </div>
                    </div>
                  );
                })()}

                {/* No-media notice (legacy / empty submissions) */}
                {!selectedSubmission.profile_photo_url
                  && !selectedSubmission.video_url
                  && (!selectedSubmission.host_photos || selectedSubmission.host_photos.length === 0)
                  && (!selectedSubmission.face_image_url || selectedSubmission.face_image_url.startsWith('admin-approved://')) && (
                  <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 text-center">
                    <p className="text-amber-300 font-medium text-sm">⚠ No media submitted by user</p>
                    <p className="text-amber-200/70 text-xs mt-1">Legacy or admin-approved record — no photo/video attached.</p>
                  </div>
                )}

                {/* Profile Photo */}
                {selectedSubmission.profile_photo_url && (() => {
                  const url = resolvedMedia.profile_photo_url || selectedSubmission.profile_photo_url;
                  return (
                    <div className="space-y-3">
                      <h4 className="font-semibold flex items-center gap-2 text-purple-300">
                        <Camera className="w-5 h-5" /> Profile Photo
                      </h4>
                      <div className="flex justify-center">
                        <img src={url} alt="Profile"
                          className="w-40 h-40 rounded-2xl object-cover border-2 border-purple-500/30 cursor-pointer hover:scale-105 transition-transform"
                          onClick={() => setExpandedPhoto(url)} />
                      </div>
                    </div>
                  );
                })()}

                {/* Verification Video */}
                {selectedSubmission.video_url && selectedSubmission.video_url !== selectedSubmission.face_image_url && (() => {
                  const url = resolvedMedia.video_url || selectedSubmission.video_url;
                  return (
                    <div className="space-y-3">
                      <h4 className="font-semibold flex items-center gap-2 text-purple-300">
                        <Video className="w-5 h-5" /> Verification Video
                      </h4>
                      <div className="rounded-xl overflow-hidden border-2 border-purple-500/30 bg-black">
                        <video src={url} controls autoPlay muted playsInline crossOrigin="anonymous" className="w-full max-h-80 object-contain"
                          onError={(e) => { const v = e.currentTarget; if (v.crossOrigin) { v.removeAttribute('crossorigin'); v.load(); } }} />
                      </div>
                    </div>
                  );
                })()}

                {/* Host Photos */}
                {selectedSubmission.host_photos && selectedSubmission.host_photos.length > 0 && (
                  <div className="space-y-3">
                    <h4 className="font-semibold flex items-center gap-2 text-purple-300">
                      <ImagePlus className="w-5 h-5" /> Host Photos ({selectedSubmission.host_photos.length})
                    </h4>
                    <div className="grid grid-cols-3 gap-3">
                      {selectedSubmission.host_photos.map((photo, index) => {
                        const url = resolvedMedia.host_photos?.[index] || photo;
                        return (
                          <div key={index} className="relative group">
                            <img src={url} alt={`Host photo ${index + 1}`}
                              className="aspect-square rounded-xl object-cover border-2 border-slate-600 cursor-pointer hover:border-purple-500/50 transition-colors"
                              onClick={() => setExpandedPhoto(url)} />
                            <span className="absolute top-1 left-1 bg-black/70 text-white text-[10px] px-1.5 py-0.5 rounded-full font-bold">{index + 1}</span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Rejection Reason */}
                {selectedSubmission.status === 'rejected' && selectedSubmission.rejection_reason && (
                  <div className="p-4 bg-red-500/10 border border-red-500/30 rounded-xl">
                    <p className="text-sm text-red-400 font-medium mb-1">Rejection Reason:</p>
                    <p className="text-red-300">{selectedSubmission.rejection_reason}</p>
                  </div>
                )}

                {/* Action Buttons */}
                {['pending', 'submitted', 'under_review'].includes(selectedSubmission.status) && (
                  <div className="space-y-2 pt-4">
                    <div className="flex gap-3">
                      <Button
                        className="flex-1 bg-green-600 hover:bg-green-700"
                        disabled={processing || !canApproveSelected}
                        onClick={() => {
                          if (!canApproveSelected) return;
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
                      {!canApproveSelected && (
                        <>
                          <Button
                            variant="outline"
                            size="sm"
                            className="flex-1 border-pink-500/50 text-pink-300 hover:bg-pink-500/10"
                            disabled={processing}
                            onClick={() => handleManualOverrideApprove(selectedSubmission, 'host')}
                          >
                            ⚠️ Override → Host
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            className="flex-1 border-blue-500/50 text-blue-300 hover:bg-blue-500/10"
                            disabled={processing}
                            onClick={() => handleManualOverrideApprove(selectedSubmission, 'user')}
                          >
                            ⚠️ Override → User
                          </Button>
                        </>
                      )}
                    </div>
                    {!canApproveSelected && (
                      <p className="text-[11px] text-amber-300/70 text-center">
                        Standard Approve disabled — required verification media is incomplete. Use Override only after manual visual confirmation, or Re-run AWS.
                      </p>
                    )}
                  </div>
                )}

                {/* Rejected → allow re-open via override approve */}
                {selectedSubmission.status === 'rejected' && (
                  <div className="flex gap-2 pt-4 border-t border-slate-700">
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
                {selectedSubmission.status === 'approved' && (
                  <div className="pt-4 border-t border-slate-700 space-y-4">
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

      {/* Expanded Photo Modal */}
      <Dialog open={!!expandedPhoto} onOpenChange={() => setExpandedPhoto(null)}>
        <DialogContent className="max-w-3xl bg-black/95 border-slate-700 p-2">
          {expandedPhoto && (
            <img src={expandedPhoto} alt="Expanded" className="w-full h-auto max-h-[85vh] object-contain rounded-lg" />
          )}
        </DialogContent>
      </Dialog>

      {/* Action Modal */}
      <Dialog open={showActionModal} onOpenChange={setShowActionModal}>
        <DialogContent className="bg-gradient-to-b from-slate-800 to-slate-900 border-white/10 max-w-md">
          <DialogHeader>
            <DialogTitle className="text-white text-lg">
              {actionType === 'approve' ? '✅ Confirm Approval' : '❌ Confirm Rejection'}
            </DialogTitle>
            <DialogDescription className="text-white/50">
              {actionType === 'approve' ? 'Select gender and click Host or User to convert instantly' : 'Provide a reason for rejection'}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-5">
            {actionType === 'approve' && (
              <>
                {/* Gender Selection */}
                <div className="space-y-2">
                  <Label className="text-xs text-white/50 font-semibold uppercase tracking-wider">Select Gender</Label>
                  <div className="grid grid-cols-2 gap-3">
                    <button onClick={() => setApproveGender('female')}
                      className={`relative overflow-hidden rounded-xl p-3.5 transition-all duration-300 ${approveGender === 'female' ? 'ring-2 ring-pink-500 scale-[1.02]' : 'hover:scale-[1.01]'}`}
                      style={{
                        background: approveGender === 'female' ? 'linear-gradient(135deg, rgba(236,72,153,0.25), rgba(219,39,119,0.15))' : 'rgba(255,255,255,0.04)',
                        border: `1px solid ${approveGender === 'female' ? 'rgba(236,72,153,0.5)' : 'rgba(255,255,255,0.1)'}`,
                      }}>
                      <div className="flex items-center justify-center gap-2">
                        <span className="text-2xl">👩</span>
                        <span className={`font-bold ${approveGender === 'female' ? 'text-pink-300' : 'text-white/50'}`}>Female</span>
                      </div>
                      {approveGender === 'female' && (
                        <div className="absolute top-1.5 right-1.5 w-5 h-5 rounded-full bg-pink-500 flex items-center justify-center">
                          <CheckCircle2 className="w-3 h-3 text-white" />
                        </div>
                      )}
                    </button>
                    <button onClick={() => setApproveGender('male')}
                      className={`relative overflow-hidden rounded-xl p-3.5 transition-all duration-300 ${approveGender === 'male' ? 'ring-2 ring-blue-500 scale-[1.02]' : 'hover:scale-[1.01]'}`}
                      style={{
                        background: approveGender === 'male' ? 'linear-gradient(135deg, rgba(59,130,246,0.25), rgba(37,99,235,0.15))' : 'rgba(255,255,255,0.04)',
                        border: `1px solid ${approveGender === 'male' ? 'rgba(59,130,246,0.5)' : 'rgba(255,255,255,0.1)'}`,
                      }}>
                      <div className="flex items-center justify-center gap-2">
                        <span className="text-2xl">👨</span>
                        <span className={`font-bold ${approveGender === 'male' ? 'text-blue-300' : 'text-white/50'}`}>Male</span>
                      </div>
                      {approveGender === 'male' && (
                        <div className="absolute top-1.5 right-1.5 w-5 h-5 rounded-full bg-blue-500 flex items-center justify-center">
                          <CheckCircle2 className="w-3 h-3 text-white" />
                        </div>
                      )}
                    </button>
                  </div>
                </div>

                {/* Direct Convert Buttons */}
                <div className="p-4 rounded-2xl bg-gradient-to-br from-white/[0.04] to-white/[0.02] border border-white/10">
                  <p className="text-[10px] text-white/40 font-semibold text-center mb-3 uppercase tracking-widest">
                    ⚡ Click to Convert Instantly
                  </p>
                  <div className="grid grid-cols-2 gap-3">
                    {/* Host Button */}
                    <button disabled={processing || !selectedSubmission || !isSubmissionEligibleForApproval(selectedSubmission)}
                      onClick={async () => {
                        if (!selectedSubmission || processing || actionInFlightRef.current || !isSubmissionEligibleForApproval(selectedSubmission)) return;
                        actionInFlightRef.current = true;
                        setProcessing(true);
                        try {
                          const { error } = await supabase.rpc('admin_process_face_verification', {
                            _submission_id: selectedSubmission.id, _action: 'approve', _reason: actionReason || null, _approve_as: 'host', _set_gender: 'female'
                          });
                          if (error) throw error;
                          toast({ title: "✅ Approved as Host!", description: "ID successfully converted to Host" });
                          setShowActionModal(false); setShowDetailModal(false); setActionReason(""); fetchSubmissions();
                        } catch (error: any) {
                          toast({ title: "Error", description: error.message || "Failed to process", variant: "destructive" });
                        } finally { setProcessing(false); actionInFlightRef.current = false; }
                      }}
                      className="group relative overflow-hidden rounded-2xl p-5 transition-all duration-300 hover:scale-[1.03] active:scale-[0.97] disabled:opacity-50 disabled:pointer-events-none"
                      style={{
                        background: 'linear-gradient(135deg, rgba(236,72,153,0.2) 0%, rgba(219,39,119,0.3) 50%, rgba(190,24,93,0.2) 100%)',
                        border: '2px solid rgba(236,72,153,0.4)',
                        boxShadow: '0 0 30px rgba(236,72,153,0.15), inset 0 1px 0 rgba(255,255,255,0.1)',
                      }}>
                      <div className="absolute inset-0 bg-gradient-to-r from-pink-500/0 via-pink-500/10 to-pink-500/0 opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
                      <div className="relative flex flex-col items-center gap-2">
                        <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-pink-500/30 to-rose-600/30 flex items-center justify-center border border-pink-500/30 shadow-lg shadow-pink-500/10">
                          {processing ? <Loader2 className="w-6 h-6 text-pink-300 animate-spin" /> : <Mic className="w-7 h-7 text-pink-300" />}
                        </div>
                        <span className="text-pink-200 font-bold text-base">🎤 Host</span>
                        <span className="text-pink-300/50 text-[10px] font-medium">Convert as Host</span>
                      </div>
                    </button>

                    {/* User Button */}
                    <button disabled={processing || !selectedSubmission || !isSubmissionEligibleForApproval(selectedSubmission)}
                      onClick={async () => {
                        if (!selectedSubmission || processing || actionInFlightRef.current || !isSubmissionEligibleForApproval(selectedSubmission)) return;
                        actionInFlightRef.current = true;
                        setProcessing(true);
                        try {
                          const { error } = await supabase.rpc('admin_process_face_verification', {
                            _submission_id: selectedSubmission.id, _action: 'approve', _reason: actionReason || null, _approve_as: 'user', _set_gender: 'male'
                          });
                          if (error) throw error;
                          toast({ title: "✅ Approved as User!", description: "ID successfully converted to User" });
                          setShowActionModal(false); setShowDetailModal(false); setActionReason(""); fetchSubmissions();
                        } catch (error: any) {
                          toast({ title: "Error", description: error.message || "Failed to process", variant: "destructive" });
                        } finally { setProcessing(false); actionInFlightRef.current = false; }
                      }}
                      className="group relative overflow-hidden rounded-2xl p-5 transition-all duration-300 hover:scale-[1.03] active:scale-[0.97] disabled:opacity-50 disabled:pointer-events-none"
                      style={{
                        background: 'linear-gradient(135deg, rgba(59,130,246,0.2) 0%, rgba(37,99,235,0.3) 50%, rgba(29,78,216,0.2) 100%)',
                        border: '2px solid rgba(59,130,246,0.4)',
                        boxShadow: '0 0 30px rgba(59,130,246,0.15), inset 0 1px 0 rgba(255,255,255,0.1)',
                      }}>
                      <div className="absolute inset-0 bg-gradient-to-r from-blue-500/0 via-blue-500/10 to-blue-500/0 opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
                      <div className="relative flex flex-col items-center gap-2">
                        <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-blue-500/30 to-cyan-600/30 flex items-center justify-center border border-blue-500/30 shadow-lg shadow-blue-500/10">
                          {processing ? <Loader2 className="w-6 h-6 text-blue-300 animate-spin" /> : <User className="w-7 h-7 text-blue-300" />}
                        </div>
                        <span className="text-blue-200 font-bold text-base">👤 User</span>
                        <span className="text-blue-300/50 text-[10px] font-medium">Convert as User</span>
                      </div>
                    </button>
                  </div>
                </div>
              </>
            )}
            {/* Rejection UI */}
            {actionType === 'reject' && (
              <div>
                <Label className="text-white/70">Rejection Reason</Label>
                <Textarea placeholder="Enter reason for rejection..." value={actionReason} onChange={(e) => setActionReason(e.target.value)} className="mt-2 bg-white/5 border-white/10 text-white placeholder:text-white/25" rows={3} />
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowActionModal(false)} className="bg-white/5 border-white/10 text-white/70">Cancel</Button>
            {actionType === 'reject' && (
              <Button onClick={handleAction} disabled={processing} className="bg-red-600 hover:bg-red-500 text-white">
                {processing ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <XCircle className="w-4 h-4 mr-2" />}
                Reject
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default AdminFaceVerification;
