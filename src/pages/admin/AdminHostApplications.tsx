import { useState, useEffect, useRef, useMemo } from "react";
import { getAdminCache, setAdminCache } from "@/utils/adminDataCache";
import useAdminRealtime from "@/hooks/useAdminRealtime";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import { invalidateStatusCountsCache } from "@/lib/admin/statusCounts";
import { resolveAdminStorageImageUrl } from "@/utils/adminStorageImages";
import { fetchHostApplicationStatusCounts } from "@/pages/admin/hostApplicationsStatusCounts";
import { motion, AnimatePresence } from "framer-motion";
import {
  Search,
  Filter,
  CheckCircle,
  XCircle,
  Eye,
  Clock,
  User,
  Video,
  Camera,
  ChevronLeft,
  ChevronRight,
  Calendar,
  Languages,
  FileText,
  Building2,
  Image as ImageIcon,
  RefreshCw,
  Shield,
  Star,
  Hash,
  Play,
  ZoomIn,
  X,
  UserCheck,
  AlertTriangle
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { AdminMediaDialog, AdminMediaFrame, isAdminVideoUrl } from "@/components/admin/AdminMediaViewer";
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
  created_at: string;
  updated_at: string;
  profile?: {
    display_name: string | null;
    app_uid: string | null;
    avatar_url: string | null;
    gender: string | null;
    is_host: boolean | null;
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
  const [applications, setApplications] = useState<HostSubmission[]>(() => getAdminCache<HostSubmission[]>('admin_host_apps') || []);
  const [loading, setLoading] = useState(() => !getAdminCache('admin_host_apps'));
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
    fetchApplications();
    fetchStatusCounts();
    fetchPendingHostsWithoutSubmission();
  }, [currentPage, filterStatus, debouncedSearch]);

  useAdminRealtime(['face_verification_submissions', 'profiles'], () => {
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
      let query = supabase
        .from("face_verification_submissions")
        .select(`
          *,
          profile:profiles!face_verification_submissions_user_id_fkey(
            display_name, app_uid, avatar_url, gender, is_host
          )
        `, { count: "exact" });

      if (filterStatus === "pending") query = query.not("status", "in", "(approved,rejected)");
      else if (filterStatus !== "all") query = query.eq("status", filterStatus);
      if (debouncedSearch) query = query.ilike("full_name", `%${debouncedSearch}%`);

      const from = (currentPage - 1) * pageSize;
      const { data, error, count } = await query
        .order("created_at", { ascending: false })
        .range(from, from + pageSize - 1);

      if (error) throw error;

      const userIds = (data || []).map((s: any) => s.user_id);
      let agencyMap: Record<string, { agency_name: string; agency_code: string }> = {};

      if (userIds.length > 0) {
        const { data: agencyData } = await supabase
          .from('agency_hosts')
          .select('host_id, agency:agencies!agency_hosts_agency_id_fkey(name, agency_code)')
          .in('host_id', userIds)
          .eq('status', 'active');

        if (agencyData) {
          agencyData.forEach((ah: any) => {
            if (ah.agency) agencyMap[ah.host_id] = { agency_name: ah.agency.name, agency_code: ah.agency.agency_code };
          });
        }
      }

      // Filter to only show female users in Host Applications
      const femaleOnly = (data || [])
        .filter((s: any) => {
          const gender = s.profile?.gender?.toLowerCase();
          return gender === 'female';
        })
        .map((s: any) => ({ ...s, agency_info: agencyMap[s.user_id] || null }));

      setApplications(femaleOnly as HostSubmission[]);
      setTotalApplications(femaleOnly.length);
    } catch (error) {
      recordAdminError({ kind: "rpc", label: "AdminHostApplications.ErrorFetchingHostApplications", message: formatAdminError(error)});
      toast.error("Failed to load applications");
    } finally {
      setLoading(false);
    }
  };

  const handleApprove = async (role?: 'host' | 'user') => {
    if (!selectedApplication) return;
    if (!guardStart(`approve-${selectedApplication.id}`)) return;
    const finalRole = role || approveAsRole;
    setActionLoading(true);
    try {
      const isHost = finalRole === 'host';
      const targetGender = isHost ? 'female' : 'male';

      const { data: processData, error: processError } = await supabase.rpc('admin_process_face_verification', {
        _submission_id: selectedApplication.id,
        _action: 'approve',
        _approve_as: finalRole,
        _set_gender: targetGender,
        _reason: adminNotes?.trim() || null,
      });
      if (processError) throw processError;

      if ((processData as any)?.pending) {
        toast.success('⏳ Submitted for Owner Approval');
        setShowDetailDialog(false);
        setAdminNotes("");
        invalidateStatusCountsCache("face_verification_submissions"); fetchApplications(); fetchStatusCounts(true);
        return;
      }
      if ((processData as any)?.success === false) {
        throw new Error((processData as any)?.error || 'Approval failed');
      }

      await supabase.functions.invoke('send-app-notification', {
        body: {
          userId: selectedApplication.user_id,
          templateKey: 'welcome_message',
          variables: { display_name: selectedApplication.full_name || 'Host' },
          type: 'host_approved'
        }
      });

      toast.success(`${finalRole === 'host' ? '🎤 Host' : '👤 User'} approved!`);
      setShowDetailDialog(false);
      setAdminNotes("");
      invalidateStatusCountsCache("face_verification_submissions"); fetchApplications(); fetchStatusCounts(true);
    } catch (error) {
      recordAdminError({ kind: "rpc", label: "AdminHostApplications.ErrorApproving", message: formatAdminError(error)});
      toast.error((error as any)?.message || "Operation failed");
    } finally {
      setActionLoading(false);
      if (selectedApplication) guardEnd(`approve-${selectedApplication.id}`);
    }
  };

  const handleReject = async () => {
    if (!selectedApplication || !rejectionReason.trim()) {
      toast.error("Please enter a rejection reason");
      return;
    }
    if (!guardStart(`reject-${selectedApplication.id}`)) return;
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

      setShowRejectDialog(false);
      setShowDetailDialog(false);
      setRejectionReason("");
      setAdminNotes("");
      invalidateStatusCountsCache("face_verification_submissions"); fetchApplications(); fetchStatusCounts(true);
    } catch (error) {
      toast.error((error as any)?.message || "Operation failed");
    } finally {
      setActionLoading(false);
      if (selectedApplication) guardEnd(`reject-${selectedApplication.id}`);
    }
  };

  const handleMarkUnderReview = async (app: HostSubmission) => {
    if (!guardStart(`review-${app.id}`)) return;
    try {
      const { error } = await supabase
        .from("face_verification_submissions")
        .update({ status: "under_review" })
        .eq("id", app.id);
      if (error) throw error;
      toast.success("Review started");
      invalidateStatusCountsCache("face_verification_submissions"); fetchApplications(); fetchStatusCounts(true);
    } catch (error) { toast.error((error as any)?.message || "Operation failed"); } finally { guardEnd(`review-${app.id}`); }
  };

  const totalPages = Math.ceil(totalApplications / pageSize);

  const isPendingStatus = (status: string) => status !== 'approved' && status !== 'rejected';

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

  // Resolve private storage URLs → signed URLs whenever the selected application changes
  const [resolvedMedia, setResolvedMedia] = useState<{
    profile_photo_url?: string | null;
    video_url?: string | null;
    face_image_url?: string | null;
    host_photos?: string[];
  }>({});

  useEffect(() => {
    if (!selectedApplication) {
      setResolvedMedia({});
      return;
    }
    let cancelled = false;
    (async () => {
      const a = selectedApplication;
      const [profile_photo_url, video_url, face_image_url, ...hostPhotos] = await Promise.all([
        resolveAdminStorageImageUrl(a.profile_photo_url, 'face-verification'),
        resolveAdminStorageImageUrl(a.video_url, 'face-verification'),
        resolveAdminStorageImageUrl(a.face_image_url, 'face-verification'),
        ...((a.host_photos || []).map((u) => resolveAdminStorageImageUrl(u, 'face-verification'))),
      ]);
      if (cancelled) return;
      setResolvedMedia({
        profile_photo_url,
        video_url,
        face_image_url,
        host_photos: hostPhotos.map((u) => u || ''),
      });
    })();
    return () => { cancelled = true; };
  }, [selectedApplication]);

  const sel = useMemo(() => {
    if (!selectedApplication) return null;
    return {
      ...selectedApplication,
      profile_photo_url: resolvedMedia.profile_photo_url ?? selectedApplication.profile_photo_url,
      video_url: resolvedMedia.video_url ?? selectedApplication.video_url,
      face_image_url: resolvedMedia.face_image_url ?? selectedApplication.face_image_url,
      host_photos: (resolvedMedia.host_photos && resolvedMedia.host_photos.length === (selectedApplication.host_photos?.length || 0))
        ? resolvedMedia.host_photos.map((u, i) => u || (selectedApplication.host_photos?.[i] ?? ''))
        : selectedApplication.host_photos,
    };
  }, [selectedApplication, resolvedMedia]);

  return (
    <div className="space-y-4 md:space-y-6 px-2 md:px-0">
      {/* Header */}
      <div className="relative overflow-hidden rounded-xl md:rounded-2xl">
        <div className="absolute inset-0 bg-gradient-to-r from-rose-600 via-pink-600 to-fuchsia-600" />
        <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNjAiIGhlaWdodD0iNjAiIHZpZXdCb3g9IjAgMCA2MCA2MCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48ZyBmaWxsPSJub25lIiBmaWxsLXJ1bGU9ImV2ZW5vZGQiPjxnIGZpbGw9IiNmZmYiIGZpbGwtb3BhY2l0eT0iMC4wNSI+PHBhdGggZD0iTTM2IDE4YzMuMzE0IDAgNi0yLjY4NiA2LTZzLTIuNjg2LTYtNi02LTYgMi42ODYtNiA2IDIuNjg2IDYgNiA2em0wIDJjLTQuNDE4IDAtOC0zLjU4Mi04LThzMy41ODItOCA4LTggOCAzLjU4MiA4IDgtMy41ODIgOC04IDh6Ii8+PC9nPjwvZz48L3N2Zz4=')] opacity-30" />
        <div className="relative p-4 md:p-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-xl md:text-2xl font-bold text-white flex items-center gap-2">
                <div className="p-2 bg-white/15 rounded-lg backdrop-blur-sm">
                  <UserCheck className="w-5 h-5 md:w-6 md:h-6" />
                </div>
                Host Application Management
              </h1>
              <p className="text-white/70 text-sm mt-1.5">
                {statusCounts.pending + statusCounts.approved + statusCounts.rejected} submissions
                {pendingHostsCount > 0 && <span className="text-orange-400 font-semibold"> • {pendingHostsCount} awaiting verification</span>}
              </p>
            </div>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => fetchApplications()}
              className="text-white hover:bg-white/15 rounded-lg"
            >
              <RefreshCw className={`w-5 h-5 ${loading ? 'animate-spin' : ''}`} />
            </Button>
          </div>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-4 gap-2 md:gap-3">
        {[
          { key: 'pending', icon: Clock, color: 'amber', label: 'Pending' },
          { key: 'approved', icon: CheckCircle, color: 'emerald', label: 'Approved' },
          { key: 'rejected', icon: XCircle, color: 'rose', label: 'Rejected' },
        ].map(({ key, icon: Icon, color, label }) => {
          const count = statusCounts[key as keyof typeof statusCounts] || 0;
          return (
            <button
              key={key}
              onClick={() => setFilterStatus(filterStatus === key ? 'all' : key)}
              className={`relative overflow-hidden rounded-xl p-3 md:p-4 transition-all duration-200 border ${
                filterStatus === key
                  ? `bg-${color}-500/20 border-${color}-500/40 ring-1 ring-${color}-500/30`
                  : 'bg-white/5 border-white/10 hover:bg-white/10'
              }`}
            >
              <Icon className={`w-5 h-5 md:w-6 md:h-6 text-${color}-400 mb-1`} />
              <p className={`text-lg md:text-2xl font-bold text-${color}-400`}>{count}</p>
              <p className="text-[10px] md:text-xs text-white/50 font-medium">{label}</p>
            </button>
          );
        })}
      </div>

      {/* Search */}
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/30" />
          <Input
            placeholder="Search by name or UID..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10 bg-white/5 border-white/10 text-white placeholder:text-white/30 h-10"
          />
        </div>
        <Select value={filterStatus} onValueChange={setFilterStatus}>
          <SelectTrigger className="w-32 bg-white/5 border-white/10 text-white/70 h-10">
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
        <div className="flex flex-col items-center justify-center h-64 text-white/40">
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
                        <AvatarImage src={app.profile_photo_url || app.profile?.avatar_url || undefined} className="object-cover" />
                        <AvatarFallback className="bg-gradient-to-br from-pink-500/30 to-rose-500/30 text-pink-300 text-lg font-bold">
                          {app.full_name?.charAt(0) || "?"}
                        </AvatarFallback>
                      </Avatar>
                      {/* Online-style status dot */}
                      <div className={`absolute -bottom-0.5 -right-0.5 w-4 h-4 rounded-full border-2 border-slate-900 ${
                        (app.status === 'pending' || app.status === 'submitted') ? 'bg-amber-400' :
                        app.status === 'under_review' ? 'bg-sky-400' :
                        app.status === 'approved' ? 'bg-emerald-400' : 'bg-rose-400'
                      }`} />
                    </div>

                    {/* Info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="text-white font-semibold truncate text-sm md:text-base">
                          {app.full_name || app.profile?.display_name || 'Unknown'}
                        </p>
                        {getStatusBadge(app.status)}
                      </div>
                      <div className="flex items-center gap-2 mt-1">
                        <span className="text-xs text-white/40 font-mono flex items-center gap-1">
                          <Hash className="w-3 h-3" />
                          {app.profile?.app_uid || app.user_id.slice(0, 8)}
                        </span>
                        {app.age && (
                          <span className="text-xs text-white/40 flex items-center gap-1">
                            <Calendar className="w-3 h-3" />
                            {app.age} yrs
                          </span>
                        )}
                        {app.language && (
                          <span className="text-xs text-white/40 flex items-center gap-1">
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
                            <Video className="w-2.5 h-2.5" />Video
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
                      <p className="text-[10px] text-white/30">{formatDate(app.created_at)}</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          ))}
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-3 py-2">
          <Button variant="outline" size="sm" disabled={currentPage === 1} onClick={() => setCurrentPage(p => p - 1)} className="bg-white/5 border-white/10 text-white/70 h-8">
            <ChevronLeft className="w-4 h-4 mr-1" /> Prev
          </Button>
          <span className="text-white/40 text-sm font-mono">{currentPage}/{totalPages}</span>
          <Button variant="outline" size="sm" disabled={currentPage === totalPages} onClick={() => setCurrentPage(p => p + 1)} className="bg-white/5 border-white/10 text-white/70 h-8">
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
              <h2 className="text-white font-bold text-base">Pending Hosts — No Verification Submitted</h2>
              <p className="text-white/50 text-xs">{pendingHostsCount} hosts registered as female but haven't submitted face verification yet</p>
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {pendingHosts.map((host) => (
              <Card key={host.id} className="bg-orange-500/[0.05] border-orange-500/20 hover:bg-orange-500/[0.1] transition-all">
                <CardContent className="p-3">
                  <div className="flex items-center gap-3">
                    <Avatar className="w-12 h-12 ring-2 ring-orange-500/30">
                      <AvatarImage src={host.avatar_url || undefined} className="object-cover" />
                      <AvatarFallback className="bg-gradient-to-br from-orange-500/30 to-amber-500/30 text-orange-300 font-bold">
                        {host.display_name?.charAt(0) || "?"}
                      </AvatarFallback>
                    </Avatar>
                    <div className="flex-1 min-w-0">
                      <p className="text-white font-semibold text-sm truncate">{host.display_name || 'Unknown'}</p>
                      <p className="text-white/40 text-xs font-mono">#{host.app_uid || host.id.slice(0, 8)}</p>
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
                          <span className="text-[10px] text-white/40">{host.country_code}</span>
                        )}
                      </div>
                    </div>
                  </div>
                  <p className="text-[10px] text-white/30 mt-2">
                    Registered: {host.created_at ? new Date(host.created_at).toLocaleDateString() : '-'}
                    {' • '}No face verification submitted yet
                  </p>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}

      {/* ============ DETAIL DIALOG ============ */}
      <Dialog open={showDetailDialog} onOpenChange={setShowDetailDialog}>
        <DialogContent className="bg-gradient-to-b from-slate-800 to-slate-900 border-white/10 max-w-4xl max-h-[92vh] overflow-y-auto p-0">
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
                      className="w-20 h-20 rounded-2xl border-4 border-slate-800 shadow-xl"
                      mediaClassName="object-cover"
                    />
                    <div className={`absolute -bottom-1 -right-1 w-5 h-5 rounded-full border-2 border-slate-800 ${
                      sel.status === 'approved' ? 'bg-emerald-400' : sel.status === 'rejected' ? 'bg-rose-400' : 'bg-amber-400'
                    }`} />
                  </div>
                  <div className="mb-1">
                    <h2 className="text-white font-bold text-lg">{sel.full_name || sel.profile?.display_name || 'Unknown'}</h2>
                    <p className="text-white/50 text-sm font-mono">#{sel.profile?.app_uid || sel.user_id.slice(0, 8)}</p>
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
                            <ZoomIn className="w-6 h-6 text-white opacity-0 group-hover/photo:opacity-100 transition-opacity" />
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

                {/* ---- Video ---- */}
                <section>
                  <SectionHeader icon={Video} title="Introduction Video" />
                  {sel.video_url ? (
                    <div className="mt-3 max-w-sm mx-auto">
                      <div className="aspect-[9/16] rounded-2xl overflow-hidden bg-background border border-white/10 shadow-xl">
                        <AdminMediaFrame src={sel.video_url} alt="Introduction video" kind="video" poster={sel.profile_photo_url} className="h-full w-full border-0 bg-background" mediaClassName="object-contain" />
                      </div>
                    </div>
                  ) : (
                    <EmptyState icon={Video} text="No video uploaded" />
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
                {(sel.status === 'pending' || sel.status === 'submitted' || sel.status === 'under_review') && (
                  <>
                    <Separator className="bg-white/10" />
                    <section>
                      <SectionHeader icon={FileText} title="Admin Notes" />
                      <Textarea
                        placeholder="Write internal notes (optional)..."
                        value={adminNotes}
                        onChange={(e) => setAdminNotes(e.target.value)}
                        className="mt-3 bg-white/5 border-white/10 text-white placeholder:text-white/25 min-h-[80px]"
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
                {(sel.status === 'pending' || sel.status === 'submitted' || sel.status === 'under_review') && (
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
                      <p className="text-xs text-white/50 font-semibold text-center mb-3 uppercase tracking-wider">
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
        <DialogContent className="bg-slate-800 border-white/10">
          <DialogHeader>
            <DialogTitle className="text-white flex items-center gap-2">
              <XCircle className="w-5 h-5 text-rose-400" />
              Reject Application
            </DialogTitle>
            <DialogDescription className="text-white/50">
              Enter rejection reason
            </DialogDescription>
          </DialogHeader>
          <Textarea
            placeholder="Enter reason..."
            value={rejectionReason}
            onChange={(e) => setRejectionReason(e.target.value)}
            className="bg-white/5 border-white/10 text-white placeholder:text-white/25 min-h-[100px]"
          />
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setShowRejectDialog(false)} className="bg-white/5 border-white/10 text-white/70">
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
        <Icon className="w-3.5 h-3.5 text-white/30" />
        <p className="text-[10px] text-white/40 uppercase tracking-wider font-medium">{label}</p>
      </div>
      <p className={`text-white font-semibold ${small ? 'text-xs' : 'text-sm'}`}>{value}</p>
    </div>
  );
}

function SectionHeader({ icon: Icon, title, count }: { icon: any; title: string; count?: number }) {
  return (
    <div className="flex items-center gap-2">
      <div className="p-1.5 bg-white/[0.06] rounded-lg">
        <Icon className="w-4 h-4 text-pink-400" />
      </div>
      <h3 className="text-white font-semibold text-sm">{title}</h3>
      {count !== undefined && count > 0 && (
        <Badge className="bg-pink-500/15 text-pink-400 border-0 text-[10px] h-5">{count}</Badge>
      )}
    </div>
  );
}

function EmptyState({ icon: Icon, text }: { icon: any; text: string }) {
  return (
    <div className="flex flex-col items-center justify-center h-32 text-white/25 mt-3 rounded-xl border border-dashed border-white/10 bg-white/[0.02]">
      <Icon className="w-8 h-8 mb-2" />
      <p className="text-xs">{text}</p>
    </div>
  );
}
