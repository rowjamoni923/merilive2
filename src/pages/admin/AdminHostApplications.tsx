import { useState, useEffect, useRef } from "react";
import { invalidateAdminCache } from "@/utils/adminDataCache";
import useAdminRealtime from "@/hooks/useAdminRealtime";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import { bucketOfStatus, invalidateStatusCountsCache } from "@/lib/admin/statusCounts";
import { fetchHostApplicationStatusCounts } from "@/pages/admin/hostApplicationsStatusCounts";
import { motion, AnimatePresence } from "framer-motion";
import { Search, Filter, CheckCircle, XCircle, Eye, Clock, User, Camera, ChevronLeft, ChevronRight, Calendar, Languages, FileText, Building2, Image as ImageIcon, RefreshCw, Shield, Star, Hash, Play, ZoomIn, X, UserCheck, AlertTriangle } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { AdminMediaDialog, AdminMediaFrame, isAdminVideoUrl } from "@/components/admin/AdminMediaViewer";
import { FaceVerificationDebugPanel } from "@/components/admin/FaceVerificationDebugPanel";
import { FaceSubmissionMediaBlocks } from "@/components/admin/FaceSubmissionMediaBlocks";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { adminSupabase as supabase } from "@/integrations/supabase/adminClient";
import { toast } from "sonner";
import { recordAdminError } from "@/utils/adminErrorLog";

import { formatAdminError } from "@/utils/formatAdminError";
import { UserAvatarImage } from "@/components/admin/UserAvatarImage";
interface HostSubmission {
  id: string;
  user_id: string;
  verification_type: string;
  status: string;
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
  status_bucket?: 'pending' | 'approved' | 'rejected' | null;
  created_at: string;
  updated_at: string;
  profile?: {
    display_name: string | null;
    app_uid: string | null;
    avatar_url: string | null;
    gender: string | null;
    is_host: boolean | null;
    face_verification_status?: string | null;
  };
  agency_info?: {
    agency_name: string;
    agency_code: string;
  } | null;
}

const statusConfig: Record<string, { bg: string; text: string; icon: any; label: string }> = {
  pending: { bg: "bg-amber-500/15", text: "text-amber-400", icon: Clock, label: "Pending" },
  submitted: { bg: "bg-amber-500/15", text: "text-amber-400", icon: Clock, label: "Pending" },
  under_review: { bg: "bg-amber-500/15", text: "text-amber-400", icon: Clock, label: "Pending" },
  approved: { bg: "bg-emerald-500/15", text: "text-emerald-400", icon: CheckCircle, label: "Approved" },
  rejected: { bg: "bg-rose-500/15", text: "text-rose-400", icon: XCircle, label: "Rejected" },
};

export default function AdminHostApplications() {
  const [applications, setApplications] = useState<HostSubmission[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [filterStatus, setFilterStatus] = useState("pending");
  const [currentPage, setCurrentPage] = useState(1);
  const [totalApplications, setTotalApplications] = useState(0);
  const [selectedApplication, setSelectedApplication] = useState<HostSubmission | null>(null);
  const [showDetailDialog, setShowDetailDialog] = useState(false);
  const [showRejectDialog, setShowRejectDialog] = useState(false);
  const [rejectionReason, setRejectionReason] = useState("");
  const [adminNotes, setAdminNotes] = useState("");
  const [actionLoading, setActionLoading] = useState(false);
  const [expandedPhoto, setExpandedPhoto] = useState<string | null>(null);
  const [approveAsRole, setApproveAsRole] = useState<'host' | 'user'>('host');
  const [statusCounts, setStatusCounts] = useState({ pending: 0, under_review: 0, approved: 0, rejected: 0 });
  const [pendingHosts, setPendingHosts] = useState<Array<{id: string; display_name: string|null; app_uid: string|null; avatar_url: string|null; gender: string|null; country_code: string|null; created_at: string|null; is_verified: boolean|null; is_face_verified: boolean|null}>>([]);
  const [pendingHostsCount, setPendingHostsCount] = useState(0);
  const actionGuardRef = useRef<Set<string>>(new Set());
  const guardStart = (key: string) => { if (actionGuardRef.current.has(key)) return false; actionGuardRef.current.add(key); return true; };
  const guardEnd = (key: string) => { actionGuardRef.current.delete(key); };

  const pageSize = 20;

  // Debounce search input so typing doesn't fire a count + list query per keystroke.
  const debouncedSearch = useDebouncedValue(searchQuery, 350);

  // Reset to page 1 whenever the effective filter/search changes.
  useEffect(() => { setCurrentPage(1); }, [filterStatus, debouncedSearch]);

  useEffect(() => {
    invalidateAdminCache('admin_host_apps');
    fetchApplications();
    fetchStatusCounts();
    fetchPendingHostsWithoutSubmission();
  }, [currentPage, filterStatus, debouncedSearch]);

  useAdminRealtime(['face_verification_submissions', 'profiles', 'host_applications'], () => {
    invalidateStatusCountsCache('face_verification_submissions');
    fetchApplications();
    fetchStatusCounts(true);
    fetchPendingHostsWithoutSubmission();
  });

  const fetchStatusCounts = async (force = false) => {
    try {
      const counts = await fetchHostApplicationStatusCounts(
        supabase as any,
        debouncedSearch,
        force,
      );
      setStatusCounts(counts);
    } catch (error) {
      recordAdminError({ kind: "rpc", label: "AdminHostApplications.ErrorFetchingStatusCounts", message: formatAdminError(error)});
    }
  };

  const fetchPendingHostsWithoutSubmission = async () => {
    try {
      // Get all face_verification_submissions user_ids
      const { data: submittedUsers } = await supabase
        .from("face_verification_submissions")
        .select("user_id");
      const submittedIds = new Set((submittedUsers || []).map((s: any) => s.user_id));

      // Get all pending female hosts
      const { data: pendingProfiles } = await supabase
        .from("profiles")
        .select("id, display_name, app_uid, avatar_url, gender, country_code, created_at, is_verified, is_face_verified")
        .eq("is_host", true)
        .eq("host_status", "pending")
        .eq("gender", "female")
        .order("created_at", { ascending: false })
        .limit(100);

      // Filter out those who already have submissions
      const noSubmission = (pendingProfiles || []).filter((p: any) => !submittedIds.has(p.id));
      setPendingHosts(noSubmission);
      setPendingHostsCount(noSubmission.length);
    } catch (error) {
      recordAdminError({ kind: "rpc", label: "AdminHostApplications.ErrorFetchingPendingHosts", message: formatAdminError(error)});
    }
  };

  const fetchApplications = async () => {
    if (applications.length === 0) setLoading(true);
    try {
      const rows: any[] = [];
      let offset = (currentPage - 1) * pageSize;
      let total = Number.POSITIVE_INFINITY;
      for (let page = 0; page < 8 && rows.length < pageSize && offset < total; page += 1) {
        const { data, error } = await supabase.rpc('admin_host_applications_paginated', {
          _status: filterStatus === 'all' ? null : filterStatus,
          _search: debouncedSearch || null,
          _limit: pageSize,
          _offset: offset,
        });
        if (error) throw error;
        const payload = (data as any) || {};
        const pageRows = (payload.rows || []) as any[];
        total = Number(payload.total ?? pageRows.length);
        rows.push(...pageRows);
        offset += pageRows.length;
        if (pageRows.length < pageSize) break;
      }

      const femaleOnly = rows.slice(0, pageSize).map((s: any) => ({
        ...s,
        status: String(s.status ?? s.status_bucket ?? 'pending').trim().toLowerCase(),
        agency_info: s.agency_name ? { agency_name: s.agency_name, agency_code: s.agency_code } : null,
      }));

      setApplications(femaleOnly as HostSubmission[]);
      setTotalApplications(total === Number.POSITIVE_INFINITY ? femaleOnly.length : total);
    } catch (error) {
      recordAdminError({ kind: "rpc", label: "AdminHostApplications.ErrorFetchingHostApplications", message: formatAdminError(error)});
      toast.error("Failed to load applications");
    } finally {
      setLoading(false);
    }
  };

  const handleApproveApplication = async (application: HostSubmission, role?: 'host' | 'user') => {
    if (!application) return;
    if (!guardStart(`approve-${application.id}`)) return;
    const finalRole = role || approveAsRole;
    const previousApplications = applications;
    const approvedId = application.id;
    // Instant moderation feel: remove the row from Pending in the same tap.
    setApplications((prev) => prev.filter((a) => a.id !== approvedId));
    setShowDetailDialog(false);
    setActionLoading(true);
    try {
      const isHost = finalRole === 'host';
      const targetGender = isHost ? 'female' : 'male';

      const { data: processData, error: processError } = await supabase.rpc('admin_process_face_verification', {
        _submission_id: application.id,
        _action: 'approve',
        _approve_as: finalRole,
        _set_gender: targetGender,
        _reason: adminNotes?.trim() || null,
      });
      if (processError) throw processError;

      if ((processData as any)?.pending) {
        toast.success('⏳ Submitted for Owner Approval');
        setApplications(previousApplications);
        setAdminNotes("");
        invalidateStatusCountsCache("face_verification_submissions"); fetchApplications(); fetchStatusCounts(true);
        return;
      }
      if ((processData as any)?.success === false) {
        throw new Error((processData as any)?.error || 'Approval failed');
      }

      await supabase.functions.invoke('send-app-notification', {
        body: {
          userId: application.user_id,
          templateKey: 'welcome_message',
          variables: { display_name: application.full_name || 'Host' },
          type: 'host_approved'
        }
      });

      toast.success(`${finalRole === 'host' ? '🎤 Host' : '👤 User'} approved!`);
      setAdminNotes("");
      invalidateStatusCountsCache("face_verification_submissions"); fetchApplications(); fetchStatusCounts(true);
    } catch (error) {
      setApplications(previousApplications);
      setShowDetailDialog(true);
      recordAdminError({ kind: "rpc", label: "AdminHostApplications.ErrorApproving", message: formatAdminError(error)});
      toast.error((error as any)?.message || "Operation failed");
    } finally {
      setActionLoading(false);
      guardEnd(`approve-${application.id}`);
    }
  };

  const handleApprove = async (role?: 'host' | 'user') => {
    if (!selectedApplication) return;
    return handleApproveApplication(selectedApplication, role);
  };

  const handleInlineRejectApplication = async (application: HostSubmission) => {
    const reason = window.prompt("Reject reason", "Rejected by admin");
    if (!reason?.trim()) return;
    if (!guardStart(`inline-reject-${application.id}`)) return;
    const previousApplications = applications;
    setApplications((prev) => prev.filter((a) => a.id !== application.id));
    setActionLoading(true);
    try {
      const { data, error } = await supabase.rpc('admin_process_face_verification', {
        _submission_id: application.id,
        _action: 'reject',
        _reason: reason.trim(),
        _approve_as: 'user',
        _set_gender: null,
      });
      if (error) throw error;
      if ((data as any)?.success === false) throw new Error((data as any)?.error || 'Rejection failed');
      toast.success("Application rejected");
      invalidateStatusCountsCache("face_verification_submissions"); fetchApplications(); fetchStatusCounts(true);
    } catch (error) {
      setApplications(previousApplications);
      toast.error((error as any)?.message || "Operation failed");
    } finally {
      setActionLoading(false);
      guardEnd(`inline-reject-${application.id}`);
    }
  };

  const handleReject = async () => {
    if (!selectedApplication || !rejectionReason.trim()) {
      toast.error("Please enter a rejection reason");
      return;
    }
    if (!guardStart(`reject-${selectedApplication.id}`)) return;
    const previousApplications = applications;
    const rejectedId = selectedApplication.id;
    setApplications((prev) => prev.filter((a) => a.id !== rejectedId));
    setShowRejectDialog(false);
    setShowDetailDialog(false);
    setActionLoading(true);
    try {
      const { data, error } = await supabase.rpc('admin_process_face_verification', {
        _submission_id: selectedApplication.id,
        _action: 'reject',
        _reason: rejectionReason.trim() || 'Rejected by admin',
        _approve_as: 'host',
        _set_gender: null,
      });
      if (error) throw error;

      if ((data as any)?.pending) {
        toast.success('⏳ Submitted for Owner Approval');
      } else if ((data as any)?.success === false) {
        throw new Error((data as any)?.error || 'Rejection failed');
      } else {
        toast.success("Application rejected");
      }

      setRejectionReason("");
      setAdminNotes("");
      invalidateStatusCountsCache("face_verification_submissions"); fetchApplications(); fetchStatusCounts(true);
    } catch (error) {
      setApplications(previousApplications);
      setShowRejectDialog(true);
      setShowDetailDialog(true);
      toast.error((error as any)?.message || "Operation failed");
    } finally {
      setActionLoading(false);
      if (selectedApplication) guardEnd(`reject-${selectedApplication.id}`);
    }
  };

  // Quick action for profiles WITHOUT a face submission (orange "no submission" cards)
  const handleForceApproveProfile = async (
    profile: { id: string; display_name: string | null },
    role: 'host' | 'user',
  ) => {
    if (!guardStart(`force-${profile.id}-${role}`)) return;
    try {
      const { data, error } = await supabase.rpc('admin_force_verify_and_approve_host', {
        _user_id: profile.id,
        _approve_as: role,
        _set_gender: role === 'host' ? 'female' : 'male',
        _reason: 'Admin direct approval (no submission)',
      });
      if (error) throw error;
      if ((data as any)?.success === false) throw new Error((data as any)?.error || 'Approval failed');
      // Optimistic removal
      setPendingHosts((prev) => prev.filter((p) => p.id !== profile.id));
      setPendingHostsCount((c) => Math.max(0, c - 1));
      toast.success(`${role === 'host' ? '🎤 Host' : '👤 User'} approved!`);
      invalidateStatusCountsCache('face_verification_submissions');
      fetchApplications();
      fetchStatusCounts(true);
      fetchPendingHostsWithoutSubmission();
    } catch (e) {
      toast.error((e as any)?.message || 'Operation failed');
    } finally {
      guardEnd(`force-${profile.id}-${role}`);
    }
  };

  const handleQuickRejectProfile = async (profile: { id: string }) => {
    if (!guardStart(`qreject-${profile.id}`)) return;
    try {
      const { error } = await supabase.rpc('admin_set_host_status', {
        _user_id: profile.id,
        _make_host: false,
      });
      if (error) throw error;
      setPendingHosts((prev) => prev.filter((p) => p.id !== profile.id));
      setPendingHostsCount((c) => Math.max(0, c - 1));
      toast.success('Host application rejected');
      fetchPendingHostsWithoutSubmission();
    } catch (e) {
      toast.error((e as any)?.message || 'Operation failed');
    } finally {
      guardEnd(`qreject-${profile.id}`);
    }
  };

  const handleMarkUnderReview = async (app: HostSubmission) => {
    if (!guardStart(`review-${app.id}`)) return;
    try {
      const { data, error } = await supabase.rpc('admin_mark_face_submission_under_review', {
        _submission_id: app.id,
      });
      if (error) throw error;
      if ((data as any)?.success === false) throw new Error((data as any)?.error || "Review start failed");
      toast.success("Review started");
      invalidateStatusCountsCache("face_verification_submissions"); fetchApplications(); fetchStatusCounts(true);
    } catch (error) { toast.error((error as any)?.message || "Operation failed"); } finally { guardEnd(`review-${app.id}`); }
  };

  const totalPages = Math.ceil(totalApplications / pageSize);

  // A row is actionable whenever the submission itself is not already approved/rejected.
  // We deliberately do NOT cross-check profile status or trust a stale RPC bucket:
  // the original app showed buttons from the row status only, and stale buckets were
  // the reason pending rows could render with no Approve/Reject buttons.
  const isPendingApplication = (app: HostSubmission) => {
    const bucket = bucketOfStatus(app.status || app.status_bucket);
    return bucket !== 'approved' && bucket !== 'rejected';
  };

  const getStatusBadge = (status: string) => {
    const config = statusConfig[status] || statusConfig.pending;
    const Icon = config.icon;
    return (
      <Badge className={`${config.bg} ${config.text} border-0 gap-1 font-medium`}>
        <Icon className="w-3 h-3" />
        {config.label}
      </Badge>
    );
  };

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString('en-US', {
      year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'
    });
  };

  // Keep the modal instant: AdminMediaFrame signs each visible item itself via
  // the shared batch signer. Pre-signing the entire selected record here caused
  // duplicate requests and delayed the first paint of photos/videos.
  const sel = selectedApplication;

  return (
    <div className="space-y-4 md:space-y-6 px-2 md:px-0 admin-pro-shell -mx-4 -my-4 sm:-mx-6 sm:-my-6 px-4 sm:px-6 py-6 sm:py-8">
      {/* Cloud White Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 bg-white p-4 md:p-6 rounded-2xl border border-slate-200 shadow-sm">
        <div className="flex items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-blue-50 border border-blue-100">
            <UserCheck className="h-6 w-6 text-blue-600" />
          </div>
          <div>
            <h1 className="text-xl md:text-2xl font-bold text-slate-900 tracking-tight">Host Application Management</h1>
            <p className="text-xs md:text-sm text-slate-500 font-medium mt-1">
              {statusCounts.pending + statusCounts.approved + statusCounts.rejected} submissions
              {pendingHostsCount > 0 && <span className="text-amber-600 font-semibold"> • {pendingHostsCount} awaiting verification</span>}
            </p>
          </div>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => fetchApplications()}
          className="bg-white border-slate-200 text-slate-700 hover:bg-slate-50 gap-2"
        >
          <RefreshCw className="w-4 h-4" />
          Refresh
        </Button>
      </div>


      {/* Stats — Pending / Approved / Rejected / All (matches AdminFaceVerification) */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 md:gap-3">
        {[
          { key: 'pending', icon: Clock, color: 'amber', label: 'Pending' },
          { key: 'approved', icon: CheckCircle, color: 'emerald', label: 'Approved' },
          { key: 'rejected', icon: XCircle, color: 'rose', label: 'Rejected' },
          { key: 'all', icon: FileText, color: 'purple', label: 'All' },
        ].map(({ key, icon: Icon, color, label }) => {
          const count = key === 'all'
            ? (statusCounts.pending || 0) + (statusCounts.approved || 0) + (statusCounts.rejected || 0)
            : (statusCounts[key as keyof typeof statusCounts] as number) || 0;
          return (
            <button
              key={key}
              onClick={() => setFilterStatus(key)}
              className={`relative overflow-hidden rounded-xl p-3 md:p-4 transition-all duration-200 border ${
                filterStatus === key
                  ? `bg-${color}-500/20 border-${color}-500/40 ring-1 ring-${color}-500/30`
                  : 'bg-white/5 border-white/10 hover:bg-white/10'
              }`}
            >
              <Icon className={`w-5 h-5 md:w-6 md:h-6 text-${color}-400 mb-1`} />
              <p className={`text-lg md:text-2xl font-bold text-${color}-400`}>{count}</p>
              <p className="text-[10px] md:text-xs text-slate-500 font-medium">{label}</p>
            </button>
          );
        })}
      </div>

      {/* Search */}
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
          <Input
            placeholder="Search by name or UID..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10 bg-white/5 border-white/10 text-slate-900 placeholder:text-slate-900/30 h-10"
          />
        </div>
        <Select value={filterStatus} onValueChange={setFilterStatus}>
          <SelectTrigger className="w-32 bg-white/5 border-white/10 text-slate-900/70 h-10">
            <Filter className="w-3.5 h-3.5 mr-1.5" />
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All</SelectItem>
            <SelectItem value="pending">Pending</SelectItem>
            <SelectItem value="approved">Approved</SelectItem>
            <SelectItem value="rejected">Rejected</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Applications List */}
      {loading ? (
        <div className="flex items-center justify-center h-64">
          <div className="w-10 h-10 border-3 border-pink-500 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : applications.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-64 text-slate-500">
          <FileText className="w-16 h-16 mb-4 opacity-50" />
          <p className="text-lg font-medium">No applications found</p>
          <p className="text-sm mt-1">New applications will appear here</p>
        </div>
      ) : (
        <div className="space-y-3">
          {applications.map((app, i) => (
            <motion.div
              key={app.id}
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: i * 0.03 }}
            >
              <Card
                className="bg-white/[0.03] border-white/10 hover:bg-white/[0.07] hover:border-white/20 transition-all duration-200 cursor-pointer group"
                onClick={() => { setSelectedApplication(app); setShowDetailDialog(true); }}
              >
                <CardContent className="p-3 md:p-4">
                  <div className="flex items-center gap-3 md:gap-4">
                    {/* Avatar with status ring */}
                    <div className="relative shrink-0">
                      <Avatar className="w-14 h-14 md:w-16 md:h-16 ring-2 ring-white/10 group-hover:ring-pink-500/30 transition-all">
                        <UserAvatarImage gender={((app) as any)?.gender} seed={((app) as any)?.id ?? ((app) as any)?.user_id ?? ((app) as any)?.host_id} src={app.profile_photo_url || app.profile?.avatar_url || undefined} className="object-contain" />
                        <AvatarFallback className="bg-pink-100 text-pink-700 text-lg font-bold">
                          {app.full_name?.charAt(0) || "?"}
                        </AvatarFallback>
                      </Avatar>
                      {/* Online-style status dot */}
                      <div className={`absolute -bottom-0.5 -right-0.5 w-4 h-4 rounded-full border-2 border-slate-200 ${
                        (app.status === 'pending' || app.status === 'submitted') ? 'bg-amber-400' :
                        app.status === 'under_review' ? 'bg-sky-400' :
                        app.status === 'approved' ? 'bg-emerald-400' : 'bg-rose-400'
                      }`} />
                    </div>

                    {/* Info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="text-slate-900 font-semibold truncate text-sm md:text-base">
                          {app.full_name || app.profile?.display_name || 'Unknown'}
                        </p>
                        {getStatusBadge(app.status)}
                      </div>
                      <div className="flex items-center gap-2 mt-1">
                        <span className="text-xs text-slate-500 font-mono flex items-center gap-1">
                          <Hash className="w-3 h-3" />
                          {app.profile?.app_uid || app.user_id.slice(0, 8)}
                        </span>
                        {app.age && (
                          <span className="text-xs text-slate-500 flex items-center gap-1">
                            <Calendar className="w-3 h-3" />
                            {app.age} yrs
                          </span>
                        )}
                        {app.language && (
                          <span className="text-xs text-slate-500 flex items-center gap-1">
                            <Languages className="w-3 h-3" />
                            {app.language}
                          </span>
                        )}
                      </div>
                      {/* Media & Agency row */}
                      <div className="flex items-center gap-1.5 mt-2 flex-wrap">
                        {app.profile_photo_url && (
                          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-blue-500/10 text-blue-400 text-[10px]">
                            <Camera className="w-2.5 h-2.5" />Photo
                          </span>
                        )}
                        {app.video_url && (
                          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-purple-500/10 text-purple-400 text-[10px]">
                            <Camera className="w-2.5 h-2.5" />Camera
                          </span>
                        )}
                        {app.host_photos && app.host_photos.length > 0 && (
                          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-pink-500/10 text-pink-400 text-[10px]">
                            <ImageIcon className="w-2.5 h-2.5" />{app.host_photos.length} Photos
                          </span>
                        )}
                        {app.face_image_url && (
                          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-400 text-[10px]">
                            <Shield className="w-2.5 h-2.5" />Face
                          </span>
                        )}
                        {app.agency_info && (
                          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-violet-500/10 text-violet-400 text-[10px]">
                            <Building2 className="w-2.5 h-2.5" />{app.agency_info.agency_name}
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Time */}
                    <div className="shrink-0 text-right hidden md:block">
                      <p className="text-[10px] text-slate-500">{formatDate(app.created_at)}</p>
                    </div>
                  </div>

                  {isPendingApplication(app) && (
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mt-3 pt-3 border-t border-border/40">
                      <Button
                        size="sm"
                        disabled={actionLoading}
                        onClick={(event) => { event.stopPropagation(); handleApproveApplication(app); }}
                      >
                        <CheckCircle className="w-3.5 h-3.5 mr-1" /> Approve
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={actionLoading}
                        onClick={(event) => { event.stopPropagation(); handleApproveApplication(app, 'host'); }}
                      >
                        <CheckCircle className="w-3.5 h-3.5 mr-1" /> Host
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={actionLoading}
                        onClick={(event) => { event.stopPropagation(); handleApproveApplication(app, 'user'); }}
                      >
                        <UserCheck className="w-3.5 h-3.5 mr-1" /> User
                      </Button>
                      <Button
                        size="sm"
                        variant="destructive"
                        disabled={actionLoading}
                        onClick={(event) => { event.stopPropagation(); handleInlineRejectApplication(app); }}
                      >
                        <XCircle className="w-3.5 h-3.5 mr-1" /> Reject
                      </Button>
                    </div>
                  )}
                </CardContent>
              </Card>
            </motion.div>
          ))}
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-3 py-2">
          <Button variant="outline" size="sm" disabled={currentPage === 1} onClick={() => setCurrentPage(p => p - 1)} className="bg-white/5 border-white/10 text-slate-900/70 h-8">
            <ChevronLeft className="w-4 h-4 mr-1" /> Prev
          </Button>
          <span className="text-slate-500 text-sm font-mono">{currentPage}/{totalPages}</span>
          <Button variant="outline" size="sm" disabled={currentPage === totalPages} onClick={() => setCurrentPage(p => p + 1)} className="bg-white/5 border-white/10 text-slate-900/70 h-8">
            Next <ChevronRight className="w-4 h-4 ml-1" />
          </Button>
        </div>
      )}

      {/* ============ PENDING HOSTS WITHOUT SUBMISSION ============ */}
      {pendingHostsCount > 0 && (
        <div className="mt-6 space-y-3">
          <div className="flex items-center gap-2">
            <div className="p-2 bg-orange-500/15 rounded-lg">
              <AlertTriangle className="w-5 h-5 text-orange-400" />
            </div>
            <div>
              <h2 className="text-slate-900 font-bold text-base">Pending Hosts — No Verification Submitted</h2>
              <p className="text-slate-500 text-xs">{pendingHostsCount} hosts registered as female but haven't submitted face verification yet</p>
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {pendingHosts.map((host) => (
              <Card key={host.id} className="bg-orange-500/[0.05] border-orange-500/20 hover:bg-orange-500/[0.1] transition-all">
                <CardContent className="p-3">
                  <div className="flex items-center gap-3">
                    <Avatar className="w-12 h-12 ring-2 ring-orange-500/30">
                      <UserAvatarImage gender={((host) as any)?.gender} seed={((host) as any)?.id ?? ((host) as any)?.user_id ?? ((host) as any)?.host_id} src={host.avatar_url || undefined} className="object-contain" />
                      <AvatarFallback className="bg-gradient-to-br from-orange-500/30 to-amber-500/30 text-orange-300 font-bold">
                        {host.display_name?.charAt(0) || "?"}
                      </AvatarFallback>
                    </Avatar>
                    <div className="flex-1 min-w-0">
                      <p className="text-slate-900 font-semibold text-sm truncate">{host.display_name || 'Unknown'}</p>
                      <p className="text-slate-500 text-xs font-mono">#{host.app_uid || host.id.slice(0, 8)}</p>
                      <div className="flex items-center gap-2 mt-1">
                        <Badge className="bg-orange-500/15 text-orange-400 border-0 text-[10px]">
                          <Clock className="w-2.5 h-2.5 mr-1" />Pending
                        </Badge>
                        {host.is_verified && (
                          <Badge className="bg-yellow-500/15 text-yellow-400 border-0 text-[10px]">
                            ⚠️ is_verified=true
                          </Badge>
                        )}
                        {host.country_code && (
                          <span className="text-[10px] text-slate-500">{host.country_code}</span>
                        )}
                      </div>
                    </div>
                  </div>
                  <p className="text-[10px] text-slate-500 mt-2">
                    Registered: {host.created_at ? new Date(host.created_at).toLocaleDateString() : '-'}
                    {' • '}No face verification submitted yet
                  </p>
                  <div className="grid grid-cols-3 gap-1.5 mt-3">
                    <Button
                      size="sm"
                      onClick={() => handleForceApproveProfile({ id: host.id, display_name: host.display_name }, 'host')}
                      className="bg-pink-600 hover:bg-pink-500 text-white h-8 text-xs"
                    >
                      <CheckCircle className="w-3 h-3 mr-1" /> Host
                    </Button>
                    <Button
                      size="sm"
                      onClick={() => handleForceApproveProfile({ id: host.id, display_name: host.display_name }, 'user')}
                      className="bg-blue-600 hover:bg-blue-500 text-white h-8 text-xs"
                    >
                      <UserCheck className="w-3 h-3 mr-1" /> User
                    </Button>
                    <Button
                      size="sm"
                      onClick={() => handleQuickRejectProfile({ id: host.id })}
                      className="bg-rose-600 hover:bg-rose-500 text-white h-8 text-xs"
                    >
                      <XCircle className="w-3 h-3 mr-1" /> Reject
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}

      {/* ============ DETAIL DIALOG ============ */}
      <Dialog open={showDetailDialog} onOpenChange={setShowDetailDialog}>
        <DialogContent className="bg-gradient-to-b from-slate-50 to-slate-100 border-white/10 max-w-4xl w-screen sm:w-auto h-[100dvh] sm:h-auto max-h-[100dvh] sm:max-h-[92vh] rounded-none sm:rounded-lg overflow-y-auto p-0">
          {sel && (
            <>
              {/* Dialog Header with profile banner */}
              <div className="relative">
                <div className="h-28 bg-gradient-to-r from-rose-600/40 via-pink-600/40 to-fuchsia-600/40" />
                <div className="absolute -bottom-10 left-6 flex items-end gap-4">
                  <div className="relative">
                    <AdminMediaFrame
                      src={sel.profile_photo_url || sel.profile?.avatar_url || ''}
                      alt="Profile"
                      kind="image"
                      className="w-20 h-20 rounded-2xl border-4 border-slate-200 shadow-xl"
                      mediaClassName="object-cover"
                    />
                    <div className={`absolute -bottom-1 -right-1 w-5 h-5 rounded-full border-2 border-slate-200 ${
                      sel.status === 'approved' ? 'bg-emerald-400' : sel.status === 'rejected' ? 'bg-rose-400' : 'bg-amber-400'
                    }`} />
                  </div>
                  <div className="mb-1">
                    <h2 className="text-slate-900 font-bold text-lg">{sel.full_name || sel.profile?.display_name || 'Unknown'}</h2>
                    <p className="text-slate-500 text-sm font-mono">#{sel.profile?.app_uid || sel.user_id.slice(0, 8)}</p>
                  </div>
                </div>
                <div className="absolute top-3 right-3">
                  {getStatusBadge(sel.status)}
                </div>
              </div>

              <div className="px-6 pt-14 pb-6 space-y-6">
                {/* ---- Basic Info Grid ---- */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  <InfoCard icon={User} label="Name" value={sel.full_name || '-'} />
                  <InfoCard icon={Calendar} label="Age" value={sel.age ? `${sel.age} years` : '-'} />
                  <InfoCard icon={Languages} label="Language" value={sel.language || '-'} />
                  <InfoCard icon={Clock} label="Applied" value={formatDate(sel.created_at)} small />
                </div>

                {/* Agency */}
                {sel.agency_info && (
                  <div className="flex items-center gap-3 p-3 rounded-xl bg-violet-500/10 border border-violet-500/20">
                    <Building2 className="w-5 h-5 text-violet-400" />
                    <div>
                      <p className="text-violet-300 font-semibold text-sm">{sel.agency_info.agency_name}</p>
                      <p className="text-violet-400/60 text-xs">Code: {sel.agency_info.agency_code}</p>
                    </div>
                  </div>
                )}

                <FaceVerificationDebugPanel
                  items={[
                    { label: "profile_photo_url", raw: selectedApplication.profile_photo_url },
                    { label: "video_url", raw: selectedApplication.video_url },
                    { label: "face_image_url", raw: selectedApplication.face_image_url },
                    { label: "front_url", raw: selectedApplication.front_url },
                    { label: "left_url", raw: selectedApplication.left_url },
                    { label: "right_url", raw: selectedApplication.right_url },
                    { label: "selfie_url", raw: selectedApplication.selfie_url },
                    ...(selectedApplication.host_photos || []).map((u, i) => ({ label: `host_photos[${i}]`, raw: u })),
                  ]}
                />

                {isPendingApplication(sel) && (
                  <div className="sticky top-0 z-20 rounded-2xl border border-white/10 bg-white/95 p-3 shadow-xl backdrop-blur">
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                      <Button onClick={() => handleApprove()} disabled={actionLoading} className="bg-emerald-600 hover:bg-emerald-500 text-white">
                        <CheckCircle className="w-4 h-4 mr-1" /> Approve
                      </Button>
                      <Button onClick={() => handleApprove('host')} disabled={actionLoading} className="bg-pink-600 hover:bg-pink-500 text-white">
                        <CheckCircle className="w-4 h-4 mr-1" /> Host
                      </Button>
                      <Button onClick={() => handleApprove('user')} disabled={actionLoading} className="bg-blue-600 hover:bg-blue-500 text-white">
                        <UserCheck className="w-4 h-4 mr-1" /> User
                      </Button>
                      <Button onClick={() => setShowRejectDialog(true)} disabled={actionLoading} className="bg-rose-600 hover:bg-rose-500 text-white">
                        <XCircle className="w-4 h-4 mr-1" /> Reject
                      </Button>
                    </div>
                  </div>
                )}

                <Separator className="bg-white/10" />

                {/* ---- Profile Photo ---- */}
                <section>
                  <SectionHeader icon={Camera} title="Profile Photo" />
                  {sel.profile_photo_url ? (
                    <div className="mt-3">
                      <AdminMediaFrame src={sel.profile_photo_url} alt="Profile" kind="image" className="w-40 h-40 md:w-48 md:h-48 rounded-2xl border-2 border-white/10 hover:border-pink-500/40 transition-all shadow-lg" mediaClassName="object-cover" onOpen={() => setExpandedPhoto(sel.profile_photo_url!)} />
                    </div>
                  ) : (
                    <EmptyState icon={Camera} text="No profile photo uploaded" />
                  )}
                </section>

                <Separator className="bg-white/10" />

                {/* ---- Host Photos ---- */}
                <section>
                  <SectionHeader icon={ImageIcon} title="Host Photos" count={sel.host_photos?.length} />
                  {sel.host_photos && sel.host_photos.length > 0 ? (
                    <div className="grid grid-cols-3 md:grid-cols-4 gap-3 mt-3">
                      {sel.host_photos.map((photo, idx) => (
                        <div key={idx} className="relative group/photo aspect-square">
                          <AdminMediaFrame src={photo} alt={`Photo ${idx + 1}`} kind="image" className="h-full w-full rounded-xl border border-white/10 group-hover/photo:border-pink-500/40 transition-all" mediaClassName="object-cover" onOpen={() => setExpandedPhoto(photo)} />
                          <div className="pointer-events-none absolute inset-0 bg-background/0 group-hover/photo:bg-background/30 transition-all rounded-xl flex items-center justify-center">
                            <ZoomIn className="w-6 h-6 text-slate-900 opacity-0 group-hover/photo:opacity-100 transition-opacity" />
                          </div>
                          <span className="absolute bottom-1.5 right-1.5 text-[10px] text-white/60 bg-black/50 px-1.5 py-0.5 rounded-md backdrop-blur-sm">
                            {idx + 1}
                          </span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <EmptyState icon={ImageIcon} text="No photos uploaded" />
                  )}
                </section>

                <Separator className="bg-white/10" />

                {/* ---- Camera ---- */}
                <section>
                  <SectionHeader icon={Camera} title="Introduction Camera" />
                  {sel.video_url ? (
                    <div className="mt-3 max-w-sm mx-auto">
                      <div className="aspect-[9/16] rounded-2xl overflow-hidden bg-background border border-white/10 shadow-xl">
                        <AdminMediaFrame src={sel.video_url} alt="Introduction video" kind="video" poster={sel.profile_photo_url} className="h-full w-full border-0 bg-background" mediaClassName="object-contain" />
                      </div>
                    </div>
                  ) : (
                    <EmptyState icon={Camera} text="No video uploaded" />
                  )}
                </section>

                <Separator className="bg-white/10" />

                {/* ---- Face Verification ---- */}
                <section>
                  <SectionHeader icon={Shield} title="Face Verification" />
                  <div className="mt-3 space-y-3" data-admin-media-bucket="face-verification">
                    <FaceSubmissionMediaBlocks submission={sel} />
                  </div>
                </section>

                {/* ---- Admin Notes ---- */}
                {isPendingApplication(sel) && (
                  <>
                    <Separator className="bg-white/10" />
                    <section>
                      <SectionHeader icon={FileText} title="Admin Notes" />
                      <Textarea
                        placeholder="Write internal notes (optional)..."
                        value={adminNotes}
                        onChange={(e) => setAdminNotes(e.target.value)}
                        className="mt-3 bg-white/5 border-white/10 text-slate-900 placeholder:text-slate-900/25 min-h-[80px]"
                      />
                    </section>
                  </>
                )}

                {/* ---- Rejection reason (if rejected) ---- */}
                {sel.status === 'rejected' && sel.rejection_reason && (
                  <div className="p-4 rounded-xl bg-rose-500/10 border border-rose-500/20">
                    <p className="text-rose-400 text-sm font-semibold flex items-center gap-2">
                      <AlertTriangle className="w-4 h-4" />
                      Rejection Reason
                    </p>
                    <p className="text-rose-300/80 text-sm mt-1">{sel.rejection_reason}</p>
                  </div>
                )}

                {/* ---- Action Buttons ---- */}
                {isPendingApplication(sel) && (
                  <div className="space-y-4 pt-2">
                    {/* Top row: Review + Reject */}
                    <div className="flex items-center gap-3">
                      {(sel.status === 'pending' || sel.status === 'submitted') && (
                        <Button
                          variant="outline"
                          onClick={() => handleMarkUnderReview(sel)}
                          className="bg-sky-500/10 border-sky-500/30 text-sky-400 hover:bg-sky-500/20 h-11 flex-1"
                        >
                          <Eye className="w-4 h-4 mr-2" />
                          Start Review
                        </Button>
                      )}
                      <Button
                        variant="outline"
                        onClick={() => setShowRejectDialog(true)}
                        className="bg-rose-500/10 border-rose-500/30 text-rose-400 hover:bg-rose-500/20 h-11 flex-1"
                      >
                        <XCircle className="w-4 h-4 mr-2" />
                        Reject
                      </Button>
                    </div>

                    {/* Direct Convert Buttons - Click = Instant Approve & Convert */}
                    <div className="p-4 rounded-2xl bg-gradient-to-br from-white/[0.04] to-white/[0.02] border border-white/10">
                      <p className="text-xs text-slate-500 font-semibold text-center mb-3 uppercase tracking-wider">
                        ⚡ Click to Convert ID
                      </p>
                      <div className="grid grid-cols-2 gap-3">
                        {/* Host Button */}
                        <button
                          disabled={actionLoading}
                          onClick={() => handleApprove('host')}
                          className="group relative overflow-hidden rounded-2xl p-5 transition-all duration-300 hover:scale-[1.02] active:scale-[0.98] disabled:opacity-50 disabled:pointer-events-none"
                          style={{
                            background: 'linear-gradient(135deg, rgba(236,72,153,0.2) 0%, rgba(219,39,119,0.3) 50%, rgba(190,24,93,0.2) 100%)',
                            border: '2px solid rgba(236,72,153,0.4)',
                            boxShadow: '0 0 30px rgba(236,72,153,0.15), inset 0 1px 0 rgba(255,255,255,0.1)',
                          }}
                        >
                          <div className="absolute inset-0 bg-gradient-to-r from-pink-500/0 via-pink-500/10 to-pink-500/0 opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
                          <div className="relative flex flex-col items-center gap-2">
                            <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-pink-500/30 to-rose-600/30 flex items-center justify-center border border-pink-500/30 shadow-lg shadow-pink-500/10">
                              {actionLoading ? (
                                <div className="w-6 h-6 border-2 border-pink-300 border-t-transparent rounded-full animate-spin" />
                              ) : (
                                <span className="text-3xl">🎤</span>
                              )}
                            </div>
                            <span className="text-pink-200 font-bold text-base">Host ID</span>
                            <span className="text-pink-300/60 text-[10px] font-medium">Convert as Host</span>
                          </div>
                        </button>

                        {/* User Button */}
                        <button
                          disabled={actionLoading}
                          onClick={() => handleApprove('user')}
                          className="group relative overflow-hidden rounded-2xl p-5 transition-all duration-300 hover:scale-[1.02] active:scale-[0.98] disabled:opacity-50 disabled:pointer-events-none"
                          style={{
                            background: 'linear-gradient(135deg, rgba(59,130,246,0.2) 0%, rgba(37,99,235,0.3) 50%, rgba(29,78,216,0.2) 100%)',
                            border: '2px solid rgba(59,130,246,0.4)',
                            boxShadow: '0 0 30px rgba(59,130,246,0.15), inset 0 1px 0 rgba(255,255,255,0.1)',
                          }}
                        >
                          <div className="absolute inset-0 bg-gradient-to-r from-blue-500/0 via-blue-500/10 to-blue-500/0 opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
                          <div className="relative flex flex-col items-center gap-2">
                            <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-blue-500/30 to-cyan-600/30 flex items-center justify-center border border-blue-500/30 shadow-lg shadow-blue-500/10">
                              {actionLoading ? (
                                <div className="w-6 h-6 border-2 border-blue-300 border-t-transparent rounded-full animate-spin" />
                              ) : (
                                <span className="text-3xl">👤</span>
                              )}
                            </div>
                            <span className="text-blue-200 font-bold text-base">User ID</span>
                            <span className="text-blue-300/60 text-[10px] font-medium">Convert as User</span>
                          </div>
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>

      <AdminMediaDialog open={!!expandedPhoto} onOpenChange={(open) => !open && setExpandedPhoto(null)} src={expandedPhoto} title="Expanded Photo" kind="image" />

      {/* Reject Dialog */}
      <Dialog open={showRejectDialog} onOpenChange={setShowRejectDialog}>
        <DialogContent className="bg-slate-50 border-white/10 w-screen sm:w-auto h-[100dvh] sm:h-auto max-h-[100dvh] sm:max-h-[90vh] rounded-none sm:rounded-lg overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-slate-900 flex items-center gap-2">
              <XCircle className="w-5 h-5 text-rose-400" />
              Reject Application
            </DialogTitle>
            <DialogDescription className="text-slate-500">
              Enter rejection reason
            </DialogDescription>
          </DialogHeader>
          <Textarea
            placeholder="Enter reason..."
            value={rejectionReason}
            onChange={(e) => setRejectionReason(e.target.value)}
            className="bg-white/5 border-white/10 text-slate-900 placeholder:text-slate-900/25 min-h-[100px]"
          />
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setShowRejectDialog(false)} className="bg-white/5 border-white/10 text-slate-900/70">
              Cancel
            </Button>
            <Button
              onClick={handleReject}
              disabled={actionLoading || !rejectionReason.trim()}
              className="bg-rose-600 hover:bg-rose-500 text-white"
            >
              {actionLoading ? "Processing..." : "Confirm Rejection"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// === Reusable sub-components ===

function InfoCard({ icon: Icon, label, value, small }: { icon: any; label: string; value: string; small?: boolean }) {
  return (
    <div className="bg-white/[0.04] rounded-xl p-3 border border-white/[0.06]">
      <div className="flex items-center gap-1.5 mb-1">
        <Icon className="w-3.5 h-3.5 text-slate-500" />
        <p className="text-[10px] text-slate-500 uppercase tracking-wider font-medium">{label}</p>
      </div>
      <p className={`text-slate-900 font-semibold ${small ? 'text-xs' : 'text-sm'}`}>{value}</p>
    </div>
  );
}

function SectionHeader({ icon: Icon, title, count }: { icon: any; title: string; count?: number }) {
  return (
    <div className="flex items-center gap-2">
      <div className="p-1.5 bg-white/[0.06] rounded-lg">
        <Icon className="w-4 h-4 text-pink-400" />
      </div>
      <h3 className="text-slate-900 font-semibold text-sm">{title}</h3>
      {count !== undefined && count > 0 && (
        <Badge className="bg-pink-500/15 text-pink-400 border-0 text-[10px] h-5">{count}</Badge>
      )}
    </div>
  );
}

function EmptyState({ icon: Icon, text }: { icon: any; text: string }) {
  return (
    <div className="flex flex-col items-center justify-center h-32 text-slate-900/25 mt-3 rounded-xl border border-dashed border-white/10 bg-white/[0.02]">
      <Icon className="w-8 h-8 mb-2" />
      <p className="text-xs">{text}</p>
    </div>
  );
}
