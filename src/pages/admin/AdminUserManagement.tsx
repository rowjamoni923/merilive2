import { useState, useEffect, useRef } from "react";
import useAdminRealtime from "@/hooks/useAdminRealtime";
import { FaceSubmissionMediaBlocks, FaceSubmissionModalMedia } from "@/components/admin/FaceSubmissionMediaBlocks";
import { AdminMediaFrame } from "@/components/admin/AdminMediaViewer";
import { useAdminSignedUrl } from "@/hooks/useAdminSignedUrl";
import { motion } from "framer-motion";
import {
  Users,
  UserCheck,
  Shield,
  ScanFace,
  Ban,
  Search,
  Filter,
  MoreVertical,
  Eye,
  CheckCircle,
  XCircle,
  Crown,
  Clock,
  Coins,
  Video,
  ChevronLeft,
  ChevronRight,
  User,
  Building2,
  Unlock,
  AlertTriangle,
  Phone,
  Settings,
  Star,
  Download,
  RefreshCw,
  Loader2,
  Calendar,
  Languages,
  FileText,
  Play,
  Image,
  Trash2,
  Globe,
  Smartphone,
  Wifi,
  MapPin
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { adminSupabase as supabase } from "@/integrations/supabase/adminClient";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { formatDistanceToNow } from "date-fns";
import { saveAppSetting } from "@/utils/adminSettingsStorage";
import { bucketOfStatus, countFaceReviewBuckets, isAutoFaceReview } from "@/lib/admin/statusCounts";

import { adminSendNotification } from "@/utils/adminNotification";
import { recordAdminError } from "@/utils/adminErrorLog";

import { formatAdminError } from "@/utils/formatAdminError";
const normalizeFaceStatus = (status?: string | null): FaceVerificationSubmission['status'] => {
  const normalized = String(status || 'pending').trim().toLowerCase();
  return ['pending', 'submitted', 'under_review', 'approved', 'rejected'].includes(normalized)
    ? normalized as FaceVerificationSubmission['status']
    : 'pending';
};
// Helper to parse verification details from admin_notes
function parseVerificationDetails(adminNotes: string | null) {
  if (!adminNotes) return null;
  const faceMatch = adminNotes.match(/Face Match:\s*([\d.]+)%/);
  const gender = adminNotes.match(/Gender:\s*(\w+)\s*\(([\d.]+)%\)/);
  const confidence = adminNotes.match(/Confidence:\s*([\d.]+)%/);
  const age = adminNotes.match(/Age:\s*(\d+-\d+)/);
  const reason = adminNotes.match(/Reason:\s*(\w+)/);
  const warnings = adminNotes.match(/Warnings:\s*(.+?)$/);
  return {
    faceMatch: faceMatch ? parseFloat(faceMatch[1]) : null,
    gender: gender ? gender[1] : null,
    genderConfidence: gender ? parseFloat(gender[2]) : null,
    confidence: confidence ? parseFloat(confidence[1]) : null,
    age: age ? age[1] : null,
    reasonCode: reason ? reason[1] : null,
    warnings: warnings ? warnings[1].split(', ') : [],
  };
}

function HostApplicationDetailMedia({ application }: { application: HostApplication }) {
  const photoUrl = useAdminSignedUrl(application.photo_url, "host-verification");
  const videoUrl = useAdminSignedUrl(application.video_url, "host-verification");

  return (
    <div className="grid gap-3 md:grid-cols-2">
      <div className="space-y-2">
        <p className="text-xs font-medium text-slate-400">Application Photo</p>
        <AdminMediaFrame src={photoUrl || application.photo_url} alt="Application photo" kind="image" bucket="host-verification" className="aspect-square border-border bg-background" mediaClassName="object-cover" />
      </div>
      <div className="space-y-2">
        <p className="text-xs font-medium text-slate-400">Intro Video</p>
        <AdminMediaFrame src={videoUrl || application.video_url} alt="Intro video" kind="video" bucket="host-verification" poster={photoUrl || application.photo_url} className="aspect-square border-border bg-background" />
      </div>
    </div>
  );
}

// Helper to check verification steps completion
function getVerificationSteps(sub: any) {
  const steps = [
    { label: 'Profile Photo', done: !!sub.profile_photo_url || !!sub.profile?.avatar_url },
    { label: 'Face Video', done: !!sub.face_image_url },
    { label: 'Intro Video', done: !!sub.video_url },
    { label: 'Face Detected', done: sub.admin_notes?.includes('Confidence:') || sub.admin_notes?.includes('Gender:') },
    { label: 'Face Match', done: sub.admin_notes?.includes('Face Match:') && !sub.admin_notes?.includes('Face Match: 0.0%') },
  ];
  return steps;
}


// Types
interface UserProfile {
  id: string;
  display_name: string | null;
  username: string | null;
  avatar_url: string | null;
  app_uid: string | null;
  is_host: boolean | null;
  is_verified: boolean | null;
  is_online: boolean | null;
  is_blocked: boolean | null;
  blocked_reason: string | null;
  coins: number | null;
  user_level: number | null;
  host_level: number | null;
  total_earnings: number | null;
  gender: string | null;
  country_name: string | null;
  country_code: string | null;
  country_flag: string | null;
  city: string | null;
  region: string | null;
  registration_ip: string | null;
  last_login_ip: string | null;
  registration_device_info: any | null;
  last_login_device_info: any | null;
  registration_user_agent: string | null;
  last_login_device: string | null;
  last_login_at: string | null;
  created_at: string | null;
  blocked_at?: string | null;
}

interface Host {
  id: string;
  display_name: string;
  avatar_url: string | null;
  is_verified: boolean;
  is_blocked: boolean;
  host_level: number;
  host_status: string;
  call_rate_per_minute: number;
  total_earnings: number;
  total_call_minutes: number;
  total_calls_received: number;
  agency_id: string | null;
  created_at: string;
  agencies?: {
    name: string;
    agency_code: string;
  } | null;
}

interface HostApplication {
  id: string;
  user_id: string;
  full_name: string;
  age: number;
  language: string;
  photo_url: string;
  video_url: string | null;
  status: string;
  rejection_reason: string | null;
  admin_notes: string | null;
  current_step: number;
  is_complete: boolean;
  created_at: string;
  submitted_at: string | null;
  profiles?: {
    display_name: string | null;
    app_uid: string | null;
    avatar_url: string | null;
    agency_id: string | null;
  };
  agency?: {
    id: string;
    name: string;
    agency_code: string;
  } | null;
}

interface FaceVerificationSubmission {
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
  rejection_reason: string | null;
  admin_notes: string | null;
  status_bucket?: 'pending' | 'approved' | 'rejected';
  is_auto_reviewed?: boolean | null;
  review_source?: 'auto' | 'manual' | string | null;
  created_at: string;
  reviewed_at: string | null;
  profile?: {
    display_name: string;
    avatar_url: string;
    app_uid: string;
    gender: string;
    is_host: boolean;
  };
  agency_info?: {
    agency_name: string;
    agency_code: string;
  } | null;
}

interface ModerationLog {
  id: string;
  user_id: string;
  violation_type: string;
  detected_content: string | null;
  action_taken: string;
  is_auto_action: boolean;
  created_at: string;
  notes: string | null;
  user?: {
    display_name: string | null;
    avatar_url: string | null;
    app_uid: string | null;
    is_blocked: boolean | null;
  };
}

interface BlockedUser {
  id: string;
  display_name: string;
  username: string | null;
  app_uid: string | null;
  avatar_url: string | null;
  blocked_at: string;
  blocked_reason: string | null;
  is_host: boolean;
}

interface BlockedAgency {
  id: string;
  name: string;
  agency_code: string;
  blocked_at: string;
  blocked_reason: string | null;
  total_hosts: number;
  owner: {
    display_name: string;
    avatar_url: string | null;
  } | null;
}

export default function AdminUserManagement() {
  const [activeTab, setActiveTab] = useState("users");
  const [loading, setLoading] = useState(false);
  
  // Users state
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchType, setSearchType] = useState<"name" | "uid">("name");
  const [filterType, setFilterType] = useState("all");
  const [currentPage, setCurrentPage] = useState(1);
  const [totalUsers, setTotalUsers] = useState(0);
  const [selectedUser, setSelectedUser] = useState<UserProfile | null>(null);
  const [showBlockDialog, setShowBlockDialog] = useState(false);
  const [showUserDialog, setShowUserDialog] = useState(false);
  const [showResetPasswordDialog, setShowResetPasswordDialog] = useState(false);
  const [resetPasswordResult, setResetPasswordResult] = useState<string | null>(null);
  const [blockReason, setBlockReason] = useState("");
  const [actionLoading, setActionLoading] = useState(false);
  
  // Hosts state
  const [hosts, setHosts] = useState<Host[]>([]);
  const [hostSearchQuery, setHostSearchQuery] = useState("");
  const [hostStatusFilter, setHostStatusFilter] = useState("all");
  const [hostStats, setHostStats] = useState({
    totalHosts: 0,
    activeHosts: 0,
    pendingHosts: 0,
    blockedHosts: 0,
    totalEarnings: 0
  });
  
  // Host Applications state
  const [applications, setApplications] = useState<HostApplication[]>([]);
  const [appSearchQuery, setAppSearchQuery] = useState("");
  const [appFilterStatus, setAppFilterStatus] = useState("all");
  const [autoVerifiedFilter, setAutoVerifiedFilter] = useState<'all' | 'host' | 'user'>('all');
  const [selectedApplication, setSelectedApplication] = useState<HostApplication | null>(null);
  const [showAppDetailDialog, setShowAppDetailDialog] = useState(false);
  const [showRejectDialog, setShowRejectDialog] = useState(false);
  const [rejectionReason, setRejectionReason] = useState("");
  const [adminNotes, setAdminNotes] = useState("");
  
  // Face Verification state
  const [faceSubmissions, setFaceSubmissions] = useState<FaceVerificationSubmission[]>([]);
  const [faceSearchQuery, setFaceSearchQuery] = useState("");
  const [faceActiveTab, setFaceActiveTab] = useState("pending");
  const [selectedFaceSubmission, setSelectedFaceSubmission] = useState<FaceVerificationSubmission | null>(null);
  const [showFaceDetailModal, setShowFaceDetailModal] = useState(false);
  const [showFaceActionModal, setShowFaceActionModal] = useState(false);
  const [faceActionType, setFaceActionType] = useState<'approve' | 'reject'>('approve');
  const [faceActionReason, setFaceActionReason] = useState("");
  const [faceApproveAs, setFaceApproveAs] = useState<'user' | 'host'>('user');
  
  // Moderation state
  const [moderationLogs, setModerationLogs] = useState<ModerationLog[]>([]);
  const [modSearchQuery, setModSearchQuery] = useState("");
  const [modFilterType, setModFilterType] = useState("all");
  const [modCurrentPage, setModCurrentPage] = useState(1);
  const [totalLogs, setTotalLogs] = useState(0);
  const [showSettingsDialog, setShowSettingsDialog] = useState(false);
  const [moderationSettings, setModerationSettings] = useState({
    phone_detection_enabled: true,
    auto_ban_phone_threshold: 3,
    profile_slideshow_interval: 5,
    max_poster_images: 5
  });
  const [savingSettings, setSavingSettings] = useState(false);
  
  // Block List state
  const [blockedUsers, setBlockedUsers] = useState<BlockedUser[]>([]);
  const [blockedAgencies, setBlockedAgencies] = useState<BlockedAgency[]>([]);
  const [blockListTab, setBlockListTab] = useState("users");
  const [blockSearchQuery, setBlockSearchQuery] = useState("");
  
  // Blocked User Detail state
  const [selectedBlockedUser, setSelectedBlockedUser] = useState<any>(null);
  const [showBlockedUserDetailDialog, setShowBlockedUserDetailDialog] = useState(false);
  const [loadingUserDetails, setLoadingUserDetails] = useState(false);
  const [showDeleteConfirmDialog, setShowDeleteConfirmDialog] = useState(false);
  const [deletingUser, setDeletingUser] = useState(false);
  
  const pageSize = 20;
  const inFlightActionsRef = useRef<Set<string>>(new Set());

  const startSingleFlight = (key: string) => {
    if (inFlightActionsRef.current.has(key)) return false;
    inFlightActionsRef.current.add(key);
    return true;
  };

  const endSingleFlight = (key: string) => {
    inFlightActionsRef.current.delete(key);
  };

  useAdminRealtime(['profiles', 'face_verification_submissions', 'agencies', 'chat_moderation_logs'], () => {
    if (activeTab === "users") fetchUsers();
    else if (activeTab === "hosts") fetchHosts();
    else if (activeTab === "blocked") fetchBlockedItems();
    else if (activeTab === "face-verification") fetchFaceSubmissions();
    else if (activeTab === "applications") fetchApplications();
    else if (activeTab === "moderation") fetchModerationLogs();
  });

  // Fetch data based on active tab - separate effects to avoid unnecessary re-renders
  useEffect(() => {
    if (activeTab === "users") {
      fetchUsers();
    }
  }, [activeTab, currentPage, filterType, searchQuery, searchType]);
  
  useEffect(() => {
    if (activeTab === "hosts") {
      fetchHosts();
      fetchHostStats();
    }
  }, [activeTab, hostStatusFilter]);
  
  useEffect(() => {
    if (activeTab === "auto-verified" || activeTab === "auto-rejected") {
      fetchFaceSubmissions();
    }
  }, [activeTab]);
  
  useEffect(() => {
    // Always fetch face submissions so stats are available
    fetchFaceSubmissions();
  }, [faceActiveTab]);
  
  useEffect(() => {
    if (activeTab === "moderation") {
      fetchModerationLogs();
      fetchModerationSettings();
    }
  }, [activeTab, modCurrentPage, modFilterType]);
  
  useEffect(() => {
    if (activeTab === "blocked") {
      fetchBlockedItems();
    }
  }, [activeTab, blockListTab]);

  // === USERS TAB FUNCTIONS ===
  const fetchUsers = async () => {
    setLoading(true);
    try {
      let query = supabase
        .from("profiles")
        .select("*", { count: "exact" });

      if (filterType === "hosts") query = query.eq("is_host", true);
      else if (filterType === "blocked") query = query.eq("is_blocked", true);
      else if (filterType === "online") query = query.eq("is_online", true);
      else if (filterType === "verified") query = query.eq("is_verified", true);

      if (searchQuery) {
        const trimmedSearch = searchQuery.trim();
        if (searchType === "uid") {
          // First try exact match, then partial match (don't convert to uppercase for numeric UIDs)
          query = query.or(`app_uid.eq.${trimmedSearch},app_uid.ilike.%${trimmedSearch}%`);
        } else {
          query = query.or(`display_name.ilike.%${trimmedSearch}%,username.ilike.%${trimmedSearch}%`);
        }
      }

      const from = (currentPage - 1) * pageSize;
      const to = from + pageSize - 1;
      
      const { data, error, count } = await query
        .order("created_at", { ascending: false })
        .range(from, to);

      if (error) throw error;
      setUsers(data || []);
      setTotalUsers(count || 0);
    } catch (error) {
      recordAdminError({ kind: "rpc", label: "AdminUserManagement.ErrorFetchingUsers", message: formatAdminError(error)});
      toast.error("Failed to load users");
    } finally {
      setLoading(false);
    }
  };

  const handleBlockUser = async () => {
    if (!selectedUser || actionLoading) return;

    const actionKey = `block-user-${selectedUser.id}`;
    if (!startSingleFlight(actionKey)) return;

    setActionLoading(true);
    try {
      const { error } = await supabase.rpc("admin_block_user", {
        _user_id: selectedUser.id,
        _block: !selectedUser.is_blocked,
        _reason: blockReason || null
      });
      if (error) throw error;
      toast.success(selectedUser.is_blocked ? "User unblocked successfully" : "User blocked successfully");
      setShowBlockDialog(false);
      setBlockReason("");
      fetchUsers();
    } catch (error) {
      recordAdminError({ kind: "rpc", label: "AdminUserManagement.ErrorBlockingUser", message: formatAdminError(error)});
      toast.error((error as any)?.message || "Operation failed");
    } finally {
      setActionLoading(false);
      endSingleFlight(actionKey);
    }
  };

  const handleMakeHost = async (userId: string, isHost: boolean) => {
    if (actionLoading) return;
    const actionKey = `make-host-${userId}-${isHost ? 'off' : 'on'}`;
    if (!startSingleFlight(actionKey)) return;

    setActionLoading(true);
    try {
      const targetGender = isHost ? 'male' : 'female';
      const { error } = await supabase.rpc('admin_update_user_gender', {
        _user_id: userId,
        _gender: targetGender,
      });
      if (error) throw error;
      // Send notification to user when converted to Host
      if (!isHost) {
        await adminSendNotification(userId, '🌟 Host Account Activated! 🎤✨', '🎉 Congratulations! Your account has been upgraded to Host status! 🔥 Complete your Face Verification now and start going live to earn rewards! 💎🫘 Welcome to the spotlight! 🌟', 'system')
      }
      toast.success(isHost ? "Converted to User (Male)" : "Converted to Host (Female)");
      fetchUsers();
    } catch (error) {
      recordAdminError({ kind: "rpc", label: "AdminUserManagement.ErrorUpdatingHostStatus", message: formatAdminError(error)});
      toast.error((error as any)?.message || "Operation failed");
    } finally {
      setActionLoading(false);
      endSingleFlight(actionKey);
    }
  };

  const handleManualConvertFromRejected = async (submissionId: string, userId: string, toHost: boolean) => {
    if (actionLoading) return;
    const actionKey = `convert-rejected-${submissionId}-${toHost ? 'host' : 'user'}`;
    if (!startSingleFlight(actionKey)) return;
    setActionLoading(true);
    try {
      const { data: genderData, error: rpcError } = await supabase.rpc('admin_update_user_gender', {
        _user_id: userId,
        _gender: toHost ? 'female' : 'male',
      });
      if (rpcError) throw rpcError;
      if ((genderData as any)?.pending) {
        toast.success('⏳ Submitted for Owner Approval — conversion queued.');
        fetchFaceSubmissions();
        return;
      }
      if ((genderData as any)?.success === false) {
        throw new Error((genderData as any)?.error || 'Gender update failed');
      }
      await supabase.from('face_verification_submissions').update({
        status: 'approved',
        verification_type: toHost ? 'host' : 'face',
        admin_notes: `Manually converted to ${toHost ? 'Host' : 'User'} by admin from Auto Rejected.`,
        reviewed_at: new Date().toISOString(),
      }).eq('id', submissionId);
      const { error: verifyFaceError } = await supabase.rpc('admin_toggle_face_verification', {
        _user_id: userId,
        _verified: true,
      });
      if (verifyFaceError) throw verifyFaceError;
      // Send notification when converted to Host from rejected
      if (toHost) {
        await adminSendNotification(userId, '🌟 Host Account Activated! 🎤✨', '🎉 Congratulations! Your account has been upgraded to Host status! 🔥 Complete your Face Verification now and start going live to earn rewards! 💎🫘 Welcome to the spotlight! 🌟', 'system')
      }
      toast.success(toHost ? '🎤 Converted to Host!' : '👤 Converted to User!');
      fetchFaceSubmissions();
    } catch (error) {
      recordAdminError({ kind: "rpc", label: "AdminUserManagement.ErrorConverting", message: formatAdminError(error)});
      toast.error((error as any)?.message || "Operation failed");
    } finally {
      setActionLoading(false);
      endSingleFlight(actionKey);
    }
  };

  const handleVerifyUser = async (userId: string, isVerified: boolean) => {
    if (actionLoading) return;
    const actionKey = `verify-user-${userId}-${isVerified ? 'off' : 'on'}`;
    if (!startSingleFlight(actionKey)) return;

    setActionLoading(true);
    try {
      const newVerified = !isVerified;
      
      // Update is_verified
      const { error } = await supabase
        .from("profiles")
        .update({ 
          is_verified: newVerified,
          is_face_verified: newVerified,
          face_verified_at: newVerified ? new Date().toISOString() : null,
        })
        .eq("id", userId);
      if (error) throw error;
      
      toast.success(isVerified ? "Verification removed (face + profile)" : "User fully verified");
      fetchUsers();
    } catch (error) {
      recordAdminError({ kind: "rpc", label: "AdminUserManagement.ErrorVerifyingUser", message: formatAdminError(error)});
      toast.error((error as any)?.message || "Operation failed");
    } finally {
      setActionLoading(false);
      endSingleFlight(actionKey);
    }
  };

  // === HOSTS TAB FUNCTIONS ===
  const fetchHosts = async () => {
    setLoading(true);
    try {
      let query = supabase
        .from("profiles")
        .select(`
          id, display_name, avatar_url, is_verified, is_blocked,
          host_level, host_status, call_rate_per_minute, total_earnings,
          total_call_minutes, total_calls_received, agency_id, created_at,
          agencies!profiles_agency_id_fkey(name, agency_code)
        `)
        .eq("is_host", true)
        .order("total_earnings", { ascending: false });

      if (hostStatusFilter !== "all") {
        query = query.eq("host_status", hostStatusFilter);
      }

      const { data, error } = await query.limit(100);
      if (error) throw error;
      setHosts((data as unknown as Host[]) || []);
    } catch (error) {
      recordAdminError({ kind: "rpc", label: "AdminUserManagement.ErrorFetchingHosts", message: formatAdminError(error)});
      toast.error("Failed to load hosts");
    } finally {
      setLoading(false);
    }
  };

  const fetchHostStats = async () => {
    try {
      const { data: hostData } = await supabase
        .from("profiles")
        .select("host_status, is_blocked, total_earnings")
        .eq("is_host", true);

      if (hostData) {
        setHostStats({
          totalHosts: hostData.length,
          activeHosts: hostData.filter(h => h.host_status === "approved" && !h.is_blocked).length,
          pendingHosts: hostData.filter(h => h.host_status === "pending").length,
          blockedHosts: hostData.filter(h => h.is_blocked).length,
          totalEarnings: hostData.reduce((sum, h) => sum + (h.total_earnings || 0), 0)
        });
      }
    } catch (error) {
      recordAdminError({ kind: "rpc", label: "AdminUserManagement.ErrorFetchingStats", message: formatAdminError(error)});
    }
  };

  const handleApproveHost = async (hostId: string) => {
    if (actionLoading) return;
    const actionKey = `approve-host-${hostId}`;
    if (!startSingleFlight(actionKey)) return;

    setActionLoading(true);
    try {
      // Set gender to female (host convention)
      const { error: genderErr } = await supabase.rpc('admin_update_user_gender', {
        _user_id: hostId,
        _gender: 'female',
      });
      if (genderErr) throw genderErr;

      // Set host_status = approved, is_face_verified = true, is_verified = true
      const { error: profileErr } = await supabase
        .from("profiles")
        .update({
          host_status: 'approved',
          is_face_verified: true,
          is_verified: true,
          face_verified_at: new Date().toISOString(),
        })
        .eq("id", hostId);
      if (profileErr) throw profileErr;

      toast.success("Host approved successfully");
      fetchHosts();
      fetchHostStats();
    } catch (error) {
      toast.error("Failed to approve host");
    } finally {
      setActionLoading(false);
      endSingleFlight(actionKey);
    }
  };

  const handleRejectHost = async (hostId: string) => {
    if (actionLoading) return;
    const actionKey = `reject-host-${hostId}`;
    if (!startSingleFlight(actionKey)) return;

    setActionLoading(true);
    try {
      const { error: genderErr } = await supabase.rpc('admin_update_user_gender', {
        _user_id: hostId,
        _gender: 'male',
      });
      if (genderErr) throw genderErr;

      // Also reject host_status and clear face verification
      const { error: profileErr } = await supabase
        .from("profiles")
        .update({
          host_status: 'rejected',
          is_face_verified: false,
          face_verified_at: null,
        })
        .eq("id", hostId);
      if (profileErr) throw profileErr;

      toast.success("Host rejected successfully");
      fetchHosts();
      fetchHostStats();
    } catch (error) {
      toast.error("Failed to reject host");
    } finally {
      setActionLoading(false);
      endSingleFlight(actionKey);
    }
  };

  const handleBlockHost = async (hostId: string, block: boolean) => {
    if (actionLoading) return;
    const actionKey = `block-host-${hostId}-${block ? 'on' : 'off'}`;
    if (!startSingleFlight(actionKey)) return;

    setActionLoading(true);
    try {
      const { error } = await supabase.rpc("admin_block_user", {
        _user_id: hostId,
        _block: block,
        _reason: block ? "Blocked by admin" : null
      });
      if (error) throw error;
      toast.success(block ? "Host blocked successfully" : "Host unblocked successfully");
      fetchHosts();
      fetchHostStats();
    } catch (error) {
      toast.error((error as any)?.message || "Operation failed");
    } finally {
      setActionLoading(false);
      endSingleFlight(actionKey);
    }
  };

  // === HOST APPLICATIONS TAB FUNCTIONS ===
  const fetchApplications = async () => {
    setLoading(true);
    try {
      let query = supabase
        .from("host_applications")
        .select(`
          *,
          profiles!host_applications_user_id_fkey (
            display_name, app_uid, avatar_url, agency_id
          )
        `, { count: "exact" });

      if (appFilterStatus !== "all") {
        query = query.eq("status", appFilterStatus);
      }

      if (appSearchQuery) {
        query = query.ilike("full_name", `%${appSearchQuery}%`);
      }

      const { data, error } = await query
        .order("created_at", { ascending: false })
        .limit(100);

      if (error) throw error;
      
      // Batch fetch all agencies in one query
      const agencyIds = [...new Set((data || []).map((a: any) => a.profiles?.agency_id).filter(Boolean))];
      const { data: agencies } = agencyIds.length > 0 ? await supabase
        .from("agencies")
        .select("id, name, agency_code")
        .in("id", agencyIds) : { data: [] };
      const agencyMap = new Map((agencies || []).map(a => [a.id, a]));
      const appsWithAgency = (data || []).map((app: any) => ({
        ...app,
        agency: app.profiles?.agency_id ? agencyMap.get(app.profiles.agency_id) || null : null,
      }));
      
      setApplications(appsWithAgency as HostApplication[]);
    } catch (error) {
      recordAdminError({ kind: "rpc", label: "AdminUserManagement.ErrorFetchingApplications", message: formatAdminError(error)});
      toast.error("Failed to load applications");
    } finally {
      setLoading(false);
    }
  };

  const handleApproveApplication = async () => {
    if (!selectedApplication || actionLoading) return;

    const actionKey = `approve-app-${selectedApplication.id}`;
    if (!startSingleFlight(actionKey)) return;

    setActionLoading(true);
    try {
      const { error: appError } = await supabase
        .from("host_applications")
        .update({
          status: "approved",
          reviewed_at: new Date().toISOString(),
          admin_notes: adminNotes || null,
        })
        .eq("id", selectedApplication.id);

      if (appError) throw appError;

      const { data: genderData, error: profileError } = await supabase.rpc('admin_update_user_gender', {
        _user_id: selectedApplication.user_id,
        _gender: 'female',
      });
      if (profileError) throw profileError;

      if ((genderData as any)?.pending) {
        toast.success('⏳ Submitted for Owner Approval — host application queued.');
        setShowAppDetailDialog(false);
        setAdminNotes("");
        fetchApplications();
        return;
      }
      if ((genderData as any)?.success === false) {
        throw new Error((genderData as any)?.error || 'Gender update failed');
      }

      const { error: faceVerifyError } = await supabase.rpc('admin_toggle_face_verification', {
        _user_id: selectedApplication.user_id,
        _verified: true,
      });
      if (faceVerifyError) throw faceVerifyError;

      const { error: verifyError } = await supabase
        .from("profiles")
        .update({ is_verified: true })
        .eq("id", selectedApplication.user_id);
      if (verifyError) throw verifyError;

      toast.success("Application approved!");
      setShowAppDetailDialog(false);
      setAdminNotes("");
      fetchApplications();
    } catch (error) {
      recordAdminError({ kind: "rpc", label: "AdminUserManagement.ErrorApproving", message: formatAdminError(error)});
      toast.error((error as any)?.message || "Operation failed");
    } finally {
      setActionLoading(false);
      endSingleFlight(actionKey);
    }
  };

  const handleRejectApplication = async () => {
    if (!selectedApplication || !rejectionReason.trim() || actionLoading) {
      if (!rejectionReason.trim()) toast.error("Please enter rejection reason");
      return;
    }

    const actionKey = `reject-app-${selectedApplication.id}`;
    if (!startSingleFlight(actionKey)) return;

    setActionLoading(true);
    try {
      const { error } = await supabase
        .from("host_applications")
        .update({
          status: "rejected",
          rejection_reason: rejectionReason,
          reviewed_at: new Date().toISOString(),
          admin_notes: adminNotes || null,
        })
        .eq("id", selectedApplication.id);

      if (error) throw error;

      toast.success("Application rejected");
      setShowRejectDialog(false);
      setShowAppDetailDialog(false);
      setRejectionReason("");
      setAdminNotes("");
      fetchApplications();
    } catch (error) {
      recordAdminError({ kind: "rpc", label: "AdminUserManagement.ErrorRejecting", message: formatAdminError(error)});
      toast.error((error as any)?.message || "Operation failed");
    } finally {
      setActionLoading(false);
      endSingleFlight(actionKey);
    }
  };

  // === FACE VERIFICATION TAB FUNCTIONS ===
  const fetchFaceSubmissions = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.rpc('admin_list_face_verification_paginated', {
        _status: null,
        _search: null,
        _limit: 500,
        _offset: 0,
      });

      if (error) throw error;

      const rows = (((data as any) || {}).rows || []) as any[];
      const enriched = rows.map((s: any) => ({
        ...s,
        status: normalizeFaceStatus(s.status),
        profile: s.profile && s.profile.id ? s.profile : null,
        agency_info: s.agency_name ? { agency_name: s.agency_name, agency_code: s.agency_code } : null,
      }));

      setFaceSubmissions(enriched);
    } catch (error) {
      recordAdminError({ kind: "rpc", label: "AdminUserManagement.ErrorFetchingSubmissions", message: formatAdminError(error)});
      toast.error("Failed to load submissions");
    } finally {
      setLoading(false);
    }
  };

  const handleFaceAction = async () => {
    if (!selectedFaceSubmission || actionLoading) return;

    const submission = selectedFaceSubmission;
    const actionKey = `face-action-${submission.id}-${faceActionType}`;
    if (!startSingleFlight(actionKey)) return;

    const previousFaceSubmissions = faceSubmissions;
    const nextStatus: FaceVerificationSubmission['status'] = faceActionType === 'approve' ? 'approved' : 'rejected';
    const nextReason = faceActionType === 'reject' ? (faceActionReason.trim() || 'Rejected by admin') : null;
    const reviewedAt = new Date().toISOString();

    // Instant optimistic update: remove from pending views immediately
    setFaceSubmissions(prev => prev.map(item =>
      item.id === submission.id
        ? { ...item, status: nextStatus, rejection_reason: nextReason, reviewed_at: reviewedAt }
        : item
    ));

    setShowFaceActionModal(false);
    setShowFaceDetailModal(false);
    setFaceActionReason("");

    setActionLoading(true);
    try {
      const { error } = await supabase.rpc('admin_process_face_verification', {
        _submission_id: submission.id,
        _action: faceActionType,
        _reason: faceActionReason || null,
        _approve_as: faceActionType === 'approve' ? faceApproveAs : 'user',
        _set_gender: faceActionType === 'approve' ? (faceApproveAs === 'host' ? 'female' : 'male') : null
      });

      if (error) throw error;

      toast.success(faceActionType === 'approve' ? "✅ Approved!" : "❌ Rejected!");
      fetchFaceSubmissions();
    } catch (error: any) {
      setFaceSubmissions(previousFaceSubmissions);
      recordAdminError({ kind: "rpc", label: "AdminUserManagement.ErrorProcessingSubmission", message: formatAdminError(error)});
      toast.error(error.message || "Failed to process");
    } finally {
      setActionLoading(false);
      endSingleFlight(actionKey);
    }
  };

  // === MODERATION TAB FUNCTIONS ===
  const fetchModerationLogs = async () => {
    setLoading(true);
    try {
      let query = supabase
        .from("chat_moderation_logs")
        .select("*", { count: "exact" });

      if (modFilterType === "phone_number") query = query.eq("violation_type", "phone_number");
      else if (modFilterType === "auto_ban") query = query.eq("action_taken", "auto_ban");
      else if (modFilterType === "warning") query = query.eq("action_taken", "warning");

      const from = (modCurrentPage - 1) * pageSize;
      const to = from + pageSize - 1;

      const { data, error, count } = await query
        .order("created_at", { ascending: false })
        .range(from, to);

      if (error) throw error;

      if (data && data.length > 0) {
        const userIds = [...new Set(data.map(l => l.user_id))];
        const { data: profiles } = await supabase
          .from("profiles")
          .select("id, display_name, avatar_url, app_uid, is_blocked")
          .in("id", userIds);

        const profilesMap = new Map(profiles?.map(p => [p.id, p]) || []);
        const logsWithUsers = data.map(log => ({
          ...log,
          user: profilesMap.get(log.user_id)
        }));
        setModerationLogs(logsWithUsers);
      } else {
        setModerationLogs([]);
      }
      
      setTotalLogs(count || 0);
    } catch (error) {
      recordAdminError({ kind: "rpc", label: "AdminUserManagement.ErrorFetchingLogs", message: formatAdminError(error)});
      toast.error("Failed to load logs");
    } finally {
      setLoading(false);
    }
  };

  const fetchModerationSettings = async () => {
    const { data } = await supabase
      .from("app_settings")
      .select("setting_key, setting_value")
      .in("setting_key", [
        "phone_detection_enabled",
        "auto_ban_phone_threshold",
        "profile_slideshow_interval",
        "max_poster_images"
      ]);

    if (data) {
      const settingsMap: any = {};
      data.forEach((item: any) => {
        if (item.setting_key === "phone_detection_enabled") {
          settingsMap.phone_detection_enabled = item.setting_value === "true";
        } else {
          settingsMap[item.setting_key] = parseInt(item.setting_value as string) || 0;
        }
      });
      setModerationSettings(prev => ({ ...prev, ...settingsMap }));
    }
  };

  const saveModerationSettings = async () => {
    setSavingSettings(true);
    try {
      const updates = [
        { setting_key: "phone_detection_enabled", setting_value: moderationSettings.phone_detection_enabled.toString() },
        { setting_key: "auto_ban_phone_threshold", setting_value: moderationSettings.auto_ban_phone_threshold.toString() },
        { setting_key: "profile_slideshow_interval", setting_value: moderationSettings.profile_slideshow_interval.toString() },
        { setting_key: "max_poster_images", setting_value: moderationSettings.max_poster_images.toString() }
      ];

      for (const update of updates) {
        await saveAppSetting(update.setting_key, update.setting_value, `${update.setting_key} settings`);
      }

      toast.success("Settings saved");
      setShowSettingsDialog(false);
    } catch (error) {
      recordAdminError({ kind: "rpc", label: "AdminUserManagement.ErrorSavingSettings", message: formatAdminError(error)});
      toast.error("Failed to save settings");
    } finally {
      setSavingSettings(false);
    }
  };

  const handleUnbanModUser = async (userId: string) => {
    try {
      const { error } = await supabase.rpc("admin_block_user", {
        _user_id: userId,
        _block: false,
        _reason: null,
      });

      if (error) throw error;

      const { error: resetError } = await supabase
        .from("profiles")
        .update({ phone_violation_count: 0 })
        .eq("id", userId);

      if (resetError) throw resetError;
      toast.success("User unbanned");
      fetchModerationLogs();
    } catch (error) {
      recordAdminError({ kind: "rpc", label: "AdminUserManagement.ErrorUnbanningUser", message: formatAdminError(error)});
      toast.error("Failed to unban user");
    }
  };

  // === BLOCK LIST TAB FUNCTIONS ===
  const fetchBlockedItems = async () => {
    setLoading(true);
    try {
      const { data: users, error: usersError } = await supabase
        .from("profiles")
        .select("id, display_name, username, app_uid, avatar_url, blocked_at, blocked_reason, is_host")
        .eq("is_blocked", true)
        .order("blocked_at", { ascending: false });

      if (usersError) throw usersError;
      setBlockedUsers((users as BlockedUser[]) || []);

      const { data: agencies, error: agenciesError } = await supabase
        .from("agencies")
        .select("id, name, agency_code, blocked_at, blocked_reason, total_hosts, owner_id")
        .eq("is_blocked", true)
        .order("blocked_at", { ascending: false });

      if (agenciesError) throw agenciesError;
      
      // Fetch owner profiles separately since FK points to auth.users not profiles
      const ownerIds = [...new Set((agencies || []).map((a: any) => a.owner_id).filter(Boolean))];
      let ownersMap = new Map<string, { display_name: string; avatar_url: string | null }>();
      
      if (ownerIds.length > 0) {
        const { data: owners } = await supabase
          .from("profiles")
          .select("id, display_name, avatar_url")
          .in("id", ownerIds);
        
        (owners || []).forEach((o: any) => ownersMap.set(o.id, { display_name: o.display_name, avatar_url: o.avatar_url }));
      }
      
      const formattedAgencies = (agencies || []).map((agency: any) => ({
        ...agency,
        owner: ownersMap.get(agency.owner_id) || null
      })) as BlockedAgency[];
      
      setBlockedAgencies(formattedAgencies);
    } catch (error) {
      recordAdminError({ kind: "rpc", label: "AdminUserManagement.ErrorFetchingBlockedItems", message: formatAdminError(error)});
      toast.error("Failed to load data");
    } finally {
      setLoading(false);
    }
  };

  const handleUnblockUser = async (userId: string) => {
    try {
      const { error } = await supabase.rpc("admin_block_user", {
        _user_id: userId,
        _block: false
      });
      if (error) throw error;
      toast.success("User unblocked successfully");
      fetchBlockedItems();
      setShowBlockedUserDetailDialog(false);
    } catch (error) {
      toast.error("Failed to unblock");
    }
  };

  const handleUnblockAgency = async (agencyId: string) => {
    try {
      const { error } = await supabase.rpc("admin_block_agency", {
        _agency_id: agencyId,
        _block: false
      });
      if (error) throw error;
      toast.success("Agency unblocked successfully");
      fetchBlockedItems();
    } catch (error) {
      toast.error("Failed to unblock");
    }
  };

  // Fetch full blocked user details - direct query (no RPC needed since admin uses token auth, not Supabase auth)
  const fetchBlockedUserDetails = async (userId: string) => {
    setLoadingUserDetails(true);
    try {
      const { data: profile, error: profileError } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .maybeSingle();
      
      if (profileError) throw profileError;
      if (!profile) {
        toast.error("User not found");
        setLoadingUserDetails(false);
        return;
      }

      // Fetch agency info
      const { data: agencyHost } = await supabase
        .from('agency_hosts')
        .select('agency_id, agencies!agency_hosts_agency_id_fkey(id, name, agency_code)')
        .eq('host_id', userId)
        .eq('status', 'active')
        .maybeSingle();

      // Fetch counts in parallel
      const [followersRes, followingRes, giftsRes, callsRes] = await Promise.all([
        supabase.from('followers').select('id', { count: 'exact', head: true }).eq('following_id', userId),
        supabase.from('followers').select('id', { count: 'exact', head: true }).eq('follower_id', userId),
        supabase.from('gift_transactions').select('coin_value').eq('receiver_id', userId),
        supabase.from('private_calls').select('id', { count: 'exact', head: true }).or(`caller_id.eq.${userId},receiver_id.eq.${userId}`),
      ]);

      const totalGiftsReceived = giftsRes.data?.reduce((sum: number, g: any) => sum + (g.coin_value || 0), 0) || 0;

      const result = {
        id: profile.id,
        display_name: profile.display_name,
        username: profile.username,
        avatar_url: profile.avatar_url,
        app_uid: profile.app_uid,
        gender: profile.gender,
        country_name: profile.country_name,
        is_host: profile.is_host,
        is_verified: profile.is_verified,
        is_blocked: profile.is_blocked,
        blocked_at: profile.blocked_at,
        blocked_reason: profile.blocked_reason,
        is_online: profile.is_online,
        last_seen_at: profile.last_seen_at,
        user_level: profile.user_level,
        host_level: profile.host_level,
        coins: profile.coins,
        total_earnings: profile.total_earnings,
        pending_earnings: profile.pending_earnings,
        total_consumption: profile.total_consumption,
        host_status: profile.host_status,
        call_rate_per_minute: profile.call_rate_per_minute,
        created_at: profile.created_at,
        bio: profile.bio,
        agency: agencyHost?.agencies ? {
          id: (agencyHost.agencies as any).id,
          name: (agencyHost.agencies as any).name,
          agency_code: (agencyHost.agencies as any).agency_code,
        } : null,
        followers_count: followersRes.count || 0,
        following_count: followingRes.count || 0,
        total_gifts_received: totalGiftsReceived,
        total_calls: callsRes.count || 0,
      };

      setSelectedBlockedUser(result);
      setShowBlockedUserDetailDialog(true);
    } catch (error) {
      recordAdminError({ kind: "rpc", label: "AdminUserManagement.ErrorFetchingUserDetails", message: formatAdminError(error)});
      toast.error("Failed to load details");
    } finally {
      setLoadingUserDetails(false);
    }
  };

  // Delete user permanently
  const handleDeleteUser = async () => {
    if (!selectedBlockedUser?.id) return;
    setDeletingUser(true);
    try {
      const { error } = await supabase.rpc('admin_delete_user', {
        _user_id: selectedBlockedUser.id
      });
      
      if (error) throw error;
      toast.success("User account deleted successfully");
      setShowDeleteConfirmDialog(false);
      setShowBlockedUserDetailDialog(false);
      fetchBlockedItems();
    } catch (error: any) {
      recordAdminError({ kind: "rpc", label: "AdminUserManagement.ErrorDeletingUser", message: formatAdminError(error)});
      toast.error(error.message || "Failed to delete account");
    } finally {
      setDeletingUser(false);
    }
  };

  // Helper functions
  const formatCoins = (coins: number) => {
    if (coins >= 1000000) return `${(coins / 1000000).toFixed(1)}M`;
    if (coins >= 1000) return `${(coins / 1000).toFixed(1)}K`;
    return coins.toString();
  };

  const totalPages = Math.ceil(totalUsers / pageSize);
  const modTotalPages = Math.ceil(totalLogs / pageSize);

  const filteredHosts = hosts.filter(host =>
    host.display_name?.toLowerCase().includes(hostSearchQuery.toLowerCase()) ||
    host.id.includes(hostSearchQuery)
  );

  const filteredBlockedUsers = blockedUsers.filter(user =>
    user.display_name?.toLowerCase().includes(blockSearchQuery.toLowerCase()) ||
    user.app_uid?.includes(blockSearchQuery) ||
    user.username?.toLowerCase().includes(blockSearchQuery.toLowerCase()) ||
    user.id.includes(blockSearchQuery)
  );

  const filteredBlockedAgencies = blockedAgencies.filter(agency =>
    agency.name?.toLowerCase().includes(blockSearchQuery.toLowerCase()) ||
    agency.agency_code?.toLowerCase().includes(blockSearchQuery.toLowerCase())
  );

  const isFaceApproved = (s: FaceVerificationSubmission) => bucketOfStatus(s.status) === 'approved';
  const isFaceRejected = (s: FaceVerificationSubmission) => bucketOfStatus(s.status) === 'rejected';
  const isFacePendingBucket = (s: FaceVerificationSubmission) => bucketOfStatus(s.status) === 'pending';
  const isFaceAutoReviewed = (s: FaceVerificationSubmission) => Boolean(s.is_auto_reviewed) || isAutoFaceReview(s.status, s.admin_notes);

  const faceQueryRaw = faceSearchQuery.trim();
  const faceQuery = faceQueryRaw.toLowerCase();
  const faceVisiblePool = faceSubmissions.filter(sub => {
    if (!faceQuery) return true;
    return (
      sub.profile?.display_name?.toLowerCase().includes(faceQuery) ||
      sub.profile?.app_uid?.includes(faceQueryRaw) ||
      sub.full_name?.toLowerCase().includes(faceQuery) ||
      sub.user_id?.toLowerCase().startsWith(faceQuery)
    );
  });

  const filteredFaceSubmissions = faceVisiblePool.filter(sub => {
    if (faceActiveTab === 'pending') return isFacePendingBucket(sub);
    if (faceActiveTab === 'approved') return isFaceApproved(sub) && !isFaceAutoReviewed(sub);
    if (faceActiveTab === 'rejected') return isFaceRejected(sub) && !isFaceAutoReviewed(sub);
    if (faceActiveTab === 'all') return isFacePendingBucket(sub) || !isFaceAutoReviewed(sub);
    return false;
  });

  const faceCounts = countFaceReviewBuckets(faceVisiblePool, (s) => s.status, (s) => s.admin_notes);
  const pendingFaceCount = faceCounts.pending;
  const approvedFaceCount = faceCounts.manual_approved;
  const rejectedFaceCount = faceCounts.manual_rejected;

  return (
    <div className="space-y-4 md:space-y-6 px-2 md:px-0">
      {/* Header */}
      <div className="flex flex-col gap-3 p-4 md:p-6 bg-gradient-to-r from-white via-purple-50/50 to-blue-50/50 rounded-xl md:rounded-2xl shadow-lg border border-slate-200/50">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
          <div>
            <h1 className="text-xl md:text-2xl font-bold text-slate-800 flex items-center gap-2">
              <Users className="w-6 h-6 text-purple-600" />
              User Management
            </h1>
            <p className="text-sm text-slate-600">Manage all users, hosts, applications, and moderation</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Badge className="bg-blue-100 text-blue-700 border-blue-200">
              {totalUsers} Users
            </Badge>
            <Badge className="bg-pink-100 text-pink-700 border-pink-200">
              {hostStats.totalHosts} Hosts
            </Badge>
            <Badge className="bg-amber-100 text-amber-700 border-amber-200">
              {applications.filter(a => a.status === 'pending').length} Pending Apps
            </Badge>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="bg-white border border-slate-200 p-1 w-full grid grid-cols-3 md:grid-cols-7 gap-1">
          <TabsTrigger value="users" className="data-[state=active]:bg-purple-500 data-[state=active]:text-white text-slate-700 text-xs md:text-sm">
            <Users className="w-3 h-3 md:w-4 md:h-4 mr-1" />
            All Users
          </TabsTrigger>
          <TabsTrigger value="hosts" className="data-[state=active]:bg-pink-500 data-[state=active]:text-white text-slate-700 text-xs md:text-sm">
            <UserCheck className="w-3 h-3 md:w-4 md:h-4 mr-1" />
            Hosts
          </TabsTrigger>
          <TabsTrigger value="auto-verified" className="data-[state=active]:bg-cyan-500 data-[state=active]:text-white text-slate-700 text-xs md:text-sm relative">
            <Shield className="w-3 h-3 md:w-4 md:h-4 mr-1" />
            Auto Verified
            {faceSubmissions.filter(s => s.status === 'approved' && s.admin_notes?.toLowerCase().includes('auto')).length > 0 && (
              <span className="absolute -top-1 -right-1 w-4 h-4 bg-cyan-500 rounded-full text-[10px] text-white flex items-center justify-center">
                {faceSubmissions.filter(s => s.status === 'approved' && s.admin_notes?.toLowerCase().includes('auto')).length}
              </span>
            )}
          </TabsTrigger>
          <TabsTrigger value="auto-rejected" className="data-[state=active]:bg-orange-500 data-[state=active]:text-white text-slate-700 text-xs md:text-sm relative">
            <XCircle className="w-3 h-3 md:w-4 md:h-4 mr-1" />
            Auto Reject
            {faceSubmissions.filter(s => s.status === 'rejected' && s.admin_notes?.toLowerCase().includes('auto')).length > 0 && (
              <span className="absolute -top-1 -right-1 w-4 h-4 bg-orange-500 rounded-full text-[10px] text-white flex items-center justify-center">
                {faceSubmissions.filter(s => s.status === 'rejected' && s.admin_notes?.toLowerCase().includes('auto')).length}
              </span>
            )}
          </TabsTrigger>
          <TabsTrigger value="face-verification" className="data-[state=active]:bg-indigo-500 data-[state=active]:text-white text-slate-700 text-xs md:text-sm relative">
            <ScanFace className="w-3 h-3 md:w-4 md:h-4 mr-1" />
            Face Verify
            {pendingFaceCount > 0 && (
              <span className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 rounded-full text-[10px] text-white flex items-center justify-center">
                {pendingFaceCount}
              </span>
            )}
          </TabsTrigger>
          <TabsTrigger value="moderation" className="data-[state=active]:bg-orange-500 data-[state=active]:text-white text-slate-700 text-xs md:text-sm">
            <AlertTriangle className="w-3 h-3 md:w-4 md:h-4 mr-1" />
            Moderation
          </TabsTrigger>
          <TabsTrigger value="blocked" className="data-[state=active]:bg-red-500 data-[state=active]:text-white text-slate-700 text-xs md:text-sm">
            <Ban className="w-3 h-3 md:w-4 md:h-4 mr-1" />
            Block List
          </TabsTrigger>
        </TabsList>

        {/* === ALL USERS TAB === */}
        <TabsContent value="users" className="mt-4 space-y-4">
          {/* Filters */}
          <Card className="bg-white border-slate-200 shadow-md">
            <CardContent className="p-3 md:p-4">
              <div className="flex flex-col gap-3">
                <div className="flex gap-2">
                  <Button
                    variant={searchType === "name" ? "default" : "outline"}
                    size="sm"
                    onClick={() => setSearchType("name")}
                    className={cn("flex-1 md:flex-none text-xs md:text-sm", searchType === "name" ? "bg-gradient-to-r from-pink-500 to-purple-600 text-white" : "bg-white text-slate-700 border-slate-300 hover:bg-slate-100")}
                  >
                    <User className="w-3 h-3 md:w-4 md:h-4 mr-1" />
                    Name
                  </Button>
                  <Button
                    variant={searchType === "uid" ? "default" : "outline"}
                    size="sm"
                    onClick={() => setSearchType("uid")}
                    className={cn("flex-1 md:flex-none text-xs md:text-sm", searchType === "uid" ? "bg-gradient-to-r from-pink-500 to-purple-600 text-white" : "bg-slate-900 text-white border-slate-700 hover:bg-slate-800")}
                  >
                    🆔 UID
                  </Button>
                </div>
                <div className="flex flex-col md:flex-row gap-3">
                  <div className="relative flex-1">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                    <Input
                      placeholder={searchType === "uid" ? "Search by UID..." : "Search by name..."}
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(searchType === "uid" ? e.target.value.toUpperCase() : e.target.value)}
                      className="pl-10 bg-slate-50 border-slate-200 h-10 text-sm text-slate-900 placeholder:text-slate-400"
                    />
                  </div>
                  <Select value={filterType} onValueChange={setFilterType}>
                    <SelectTrigger className="w-full md:w-40 bg-slate-50 border-slate-200 h-10 text-sm text-slate-800">
                      <Filter className="w-4 h-4 mr-2 text-slate-500" />
                      <SelectValue placeholder="Filter" />
                    </SelectTrigger>
                    <SelectContent className="bg-white border-slate-200 text-slate-900">
                      <SelectItem value="all" className="text-slate-800">All</SelectItem>
                      <SelectItem value="hosts" className="text-slate-800">Hosts</SelectItem>
                      <SelectItem value="online" className="text-slate-800">Online</SelectItem>
                      <SelectItem value="verified" className="text-slate-800">Verified</SelectItem>
                      <SelectItem value="blocked" className="text-slate-800">Blocked</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Users Table */}
          <Card className="bg-white border-slate-200 shadow-xl overflow-hidden">
            <CardContent className="p-0">
              {loading ? (
                <div className="flex items-center justify-center h-64">
                  <Loader2 className="w-10 h-10 animate-spin text-purple-500" />
                </div>
              ) : users.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-64 text-slate-400">
                  <User className="w-12 h-12 mb-4" />
                  <p>No users found</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow className="border-slate-200 bg-slate-50">
                        <TableHead className="text-slate-700 font-bold">User</TableHead>
                        <TableHead className="text-slate-700 font-bold hidden md:table-cell">Country</TableHead>
                        <TableHead className="text-slate-700 font-bold hidden md:table-cell">Status</TableHead>
                        <TableHead className="text-slate-700 font-bold hidden lg:table-cell">Diamonds</TableHead>
                        <TableHead className="text-slate-700 font-bold hidden lg:table-cell">Level</TableHead>
                        <TableHead className="text-slate-700 font-bold text-right">Action</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {users.map((user) => (
                        <TableRow key={user.id} className="border-slate-100 hover:bg-slate-50">
                          <TableCell>
                            <div className="flex items-center gap-3">
                              <div className="relative">
                                <Avatar className="w-10 h-10 border-2 border-slate-200">
                                  <AvatarImage src={user.avatar_url || undefined} />
                                  <AvatarFallback className="bg-gradient-to-br from-pink-400 to-purple-500 text-white">
                                    {user.display_name?.charAt(0) || "U"}
                                  </AvatarFallback>
                                </Avatar>
                                {user.is_online && (
                                  <span className="absolute bottom-0 right-0 w-3 h-3 bg-green-500 rounded-full border-2 border-white" />
                                )}
                              </div>
                              <div>
                                <p className="font-bold flex items-center gap-2 text-slate-800">
                                  {user.display_name || "Unknown"}
                                  {user.is_verified && <CheckCircle className="w-4 h-4 text-blue-500" />}
                                  {user.is_host && <Crown className="w-4 h-4 text-amber-500" />}
                                </p>
                                <div className="flex items-center gap-2 flex-wrap">
                                  <p className="text-sm text-slate-500">@{user.username || user.id.slice(0, 8)}</p>
                                  {user.app_uid && (
                                    <Badge className="text-xs bg-slate-800 text-white border-slate-600 font-semibold">
                                      {user.app_uid}
                                    </Badge>
                                  )}
                                </div>
                              </div>
                            </div>
                          </TableCell>
                          <TableCell className="hidden md:table-cell">
                            <div className="flex items-center gap-1">
                              <span className="text-lg">{user.country_flag || '🌍'}</span>
                              <span className="text-xs text-slate-600">{user.country_code || '-'}</span>
                            </div>
                          </TableCell>
                          <TableCell className="hidden md:table-cell">
                            {user.is_blocked ? (
                              <Badge className="bg-red-600 text-white border-0">
                                <Ban className="w-3 h-3 mr-1" />
                                Blocked
                              </Badge>
                            ) : user.is_online ? (
                              <Badge className="bg-green-600 text-white border-0">
                                Online
                              </Badge>
                            ) : (
                              <Badge className="bg-slate-600 text-white border-0">
                                Offline
                              </Badge>
                            )}
                          </TableCell>
                          <TableCell className="hidden lg:table-cell">
                            <div className="flex items-center gap-1 text-yellow-500 font-bold">
                              <Coins className="w-4 h-4" />
                              <span>{user.coins?.toLocaleString() || 0}</span>
                            </div>
                          </TableCell>
                          <TableCell className="hidden lg:table-cell">
                            <Badge className="bg-gradient-to-r from-purple-600 to-pink-600 text-white border-0 font-semibold">
                              Lv. {user.user_level || 0}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-right">
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button variant="ghost" size="icon" className="text-slate-500 hover:text-slate-800 hover:bg-slate-100">
                                  <MoreVertical className="w-4 h-4" />
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end" className="bg-white border-slate-200">
                                <DropdownMenuItem onClick={() => { setSelectedUser(user); setShowUserDialog(true); }}>
                                  <Eye className="w-4 h-4 mr-2" />
                                  View Details
                                </DropdownMenuItem>
                                <DropdownMenuItem disabled={actionLoading} onClick={() => handleVerifyUser(user.id, user.is_verified || false)}>
                                  <CheckCircle className="w-4 h-4 mr-2" />
                                  {user.is_verified ? "Remove Verify" : "Verify User"}
                                </DropdownMenuItem>
                                <DropdownMenuItem disabled={actionLoading} onClick={() => handleMakeHost(user.id, user.is_host || false)}>
                                  <Crown className="w-4 h-4 mr-2" />
                                  {user.is_host ? "Remove Host" : "Make Host"}
                                </DropdownMenuItem>
                                <DropdownMenuItem 
                                  className="text-orange-600"
                                  disabled={actionLoading}
                                  onClick={() => { setSelectedUser(user); setResetPasswordResult(null); setShowResetPasswordDialog(true); }}
                                >
                                  <Unlock className="w-4 h-4 mr-2" />
                                  Reset Password
                                </DropdownMenuItem>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem 
                                  className={user.is_blocked ? "text-green-600" : "text-red-600"}
                                  onClick={() => { setSelectedUser(user); setShowBlockDialog(true); }}
                                >
                                  <Ban className="w-4 h-4 mr-2" />
                                  {user.is_blocked ? "Unblock" : "Block"}
                                </DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-center gap-2">
              <Button
                variant="outline"
                size="icon"
                disabled={currentPage === 1}
                onClick={() => setCurrentPage(p => p - 1)}
              >
                <ChevronLeft className="w-4 h-4" />
              </Button>
              <span className="text-slate-600 px-4">{currentPage} / {totalPages}</span>
              <Button
                variant="outline"
                size="icon"
                disabled={currentPage === totalPages}
                onClick={() => setCurrentPage(p => p + 1)}
              >
                <ChevronRight className="w-4 h-4" />
              </Button>
            </div>
          )}
        </TabsContent>

        {/* === HOSTS TAB === */}
        <TabsContent value="hosts" className="mt-4 space-y-4">
          {/* Stats Cards */}
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            <Card className="bg-gradient-to-br from-blue-50 to-blue-100 border-blue-200">
              <CardContent className="p-3">
                <div className="flex items-center gap-2">
                  <UserCheck className="w-8 h-8 text-blue-500" />
                  <div>
                    <p className="text-blue-600 text-xs font-medium">Total Hosts</p>
                    <p className="text-blue-900 font-bold text-xl">{hostStats.totalHosts}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card className="bg-gradient-to-br from-green-50 to-green-100 border-green-200">
              <CardContent className="p-3">
                <div className="flex items-center gap-2">
                  <CheckCircle className="w-8 h-8 text-green-500" />
                  <div>
                    <p className="text-green-600 text-xs font-medium">Active</p>
                    <p className="text-green-900 font-bold text-xl">{hostStats.activeHosts}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card className="bg-gradient-to-br from-yellow-50 to-yellow-100 border-yellow-200">
              <CardContent className="p-3">
                <div className="flex items-center gap-2">
                  <Clock className="w-8 h-8 text-yellow-500" />
                  <div>
                    <p className="text-yellow-600 text-xs font-medium">Pending</p>
                    <p className="text-yellow-900 font-bold text-xl">{hostStats.pendingHosts}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card className="bg-gradient-to-br from-red-50 to-red-100 border-red-200">
              <CardContent className="p-3">
                <div className="flex items-center gap-2">
                  <Ban className="w-8 h-8 text-red-500" />
                  <div>
                    <p className="text-red-600 text-xs font-medium">Blocked</p>
                    <p className="text-red-900 font-bold text-xl">{hostStats.blockedHosts}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card className="bg-gradient-to-br from-purple-50 to-purple-100 border-purple-200">
              <CardContent className="p-3">
                <div className="flex items-center gap-2">
                  <Coins className="w-8 h-8 text-purple-500" />
                  <div>
                    <p className="text-purple-600 text-xs font-medium">Total Earnings</p>
                    <p className="text-purple-900 font-bold text-xl">{formatCoins(hostStats.totalEarnings)}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Filters */}
          <Card className="bg-white border-slate-200 shadow-sm">
            <CardContent className="p-4">
              <div className="flex flex-col md:flex-row gap-4">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                  <Input
                    placeholder="Search by name or ID..."
                    value={hostSearchQuery}
                    onChange={(e) => setHostSearchQuery(e.target.value)}
                    className="pl-10 bg-slate-50 border-slate-200 text-slate-900 placeholder:text-slate-400"
                  />
                </div>
                <Select value={hostStatusFilter} onValueChange={setHostStatusFilter}>
                  <SelectTrigger className="w-full md:w-48 bg-slate-50 border-slate-200 text-slate-800">
                    <SelectValue placeholder="Status Filter" />
                  </SelectTrigger>
                  <SelectContent className="bg-white border-slate-200 text-slate-900">
                    <SelectItem value="all" className="text-slate-800">All</SelectItem>
                    <SelectItem value="approved" className="text-slate-800">Approved</SelectItem>
                    <SelectItem value="pending" className="text-slate-800">Pending</SelectItem>
                    <SelectItem value="rejected" className="text-slate-800">Rejected</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </CardContent>
          </Card>

          {/* Hosts Table */}
          <Card className="bg-white border-slate-200 shadow-xl overflow-hidden">
            <CardContent className="p-0">
              {loading ? (
                <div className="flex items-center justify-center h-64">
                  <Loader2 className="w-10 h-10 animate-spin text-pink-500" />
                </div>
              ) : filteredHosts.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-64 text-slate-400">
                  <UserCheck className="w-12 h-12 mb-4" />
                  <p>No hosts found</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow className="border-slate-200 bg-slate-50">
                        <TableHead className="text-slate-700 font-bold">Host</TableHead>
                        <TableHead className="text-slate-700 font-bold">Level</TableHead>
                        <TableHead className="text-slate-700 font-bold">Status</TableHead>
                        <TableHead className="text-slate-700 font-bold hidden md:table-cell">Total Earnings</TableHead>
                        <TableHead className="text-slate-700 font-bold hidden lg:table-cell">Agency</TableHead>
                        <TableHead className="text-slate-700 font-bold text-right">Action</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredHosts.map((host) => (
                        <TableRow key={host.id} className="border-slate-100 hover:bg-slate-50">
                          <TableCell>
                            <div className="flex items-center gap-3">
                              <Avatar className="w-10 h-10 border-2 border-pink-500/50">
                                <AvatarImage src={host.avatar_url || ""} />
                                <AvatarFallback className="bg-pink-100 text-pink-600">
                                  {host.display_name?.charAt(0) || "H"}
                                </AvatarFallback>
                              </Avatar>
                              <div>
                                <p className="font-medium flex items-center gap-1 text-slate-800">
                                  {host.display_name}
                                  {host.is_verified && <CheckCircle className="w-4 h-4 text-blue-400" />}
                                </p>
                                <p className="text-slate-500 text-xs">{host.id.slice(0, 8)}...</p>
                              </div>
                            </div>
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-1">
                              <Star className="w-4 h-4 text-yellow-400" />
                              <span className="text-slate-800">{host.host_level || 1}</span>
                            </div>
                          </TableCell>
                          <TableCell>
                            <Badge className={
                              host.is_blocked
                                ? "bg-red-100 text-red-600 border-red-200"
                                : host.host_status === "approved"
                                ? "bg-green-100 text-green-600 border-green-200"
                                : host.host_status === "pending"
                                ? "bg-yellow-100 text-yellow-600 border-yellow-200"
                                : "bg-slate-100 text-slate-600 border-slate-200"
                            }>
                              {host.is_blocked ? "Blocked" : host.host_status === "approved" ? "Active" : host.host_status === "pending" ? "Pending" : "Rejected"}
                            </Badge>
                          </TableCell>
                          <TableCell className="hidden md:table-cell">
                            <span className="text-green-600 font-medium">
                              {formatCoins(host.total_earnings || 0)}
                            </span>
                          </TableCell>
                          <TableCell className="hidden lg:table-cell">
                            {host.agencies ? (
                              <span className="text-purple-600">{host.agencies.name}</span>
                            ) : (
                              <span className="text-slate-400">-</span>
                            )}
                          </TableCell>
                          <TableCell className="text-right">
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button variant="ghost" size="icon" className="text-slate-500 hover:text-slate-800">
                                  <MoreVertical className="w-4 h-4" />
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end" className="bg-white border-slate-200">
                                {host.host_status === "pending" && (
                                  <>
                                    <DropdownMenuItem className="text-green-600" onClick={() => handleApproveHost(host.id)}>
                                      <CheckCircle className="w-4 h-4 mr-2" />
                                      Approve
                                    </DropdownMenuItem>
                                    <DropdownMenuItem className="text-red-600" onClick={() => handleRejectHost(host.id)}>
                                      <XCircle className="w-4 h-4 mr-2" />
                                      Reject
                                    </DropdownMenuItem>
                                    <DropdownMenuSeparator />
                                  </>
                                )}
                                <DropdownMenuItem
                                  className={host.is_blocked ? "text-green-600" : "text-red-600"}
                                  onClick={() => handleBlockHost(host.id, !host.is_blocked)}
                                >
                                  <Ban className="w-4 h-4 mr-2" />
                                  {host.is_blocked ? "Unblock" : "Block"}
                                </DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* === AUTO VERIFIED TAB === */}
        <TabsContent value="auto-verified" className="mt-4 space-y-4">
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            <Card className="bg-gradient-to-br from-cyan-50 to-cyan-100 border-cyan-200">
              <CardContent className="p-3">
                <div className="flex items-center gap-2">
                  <Shield className="w-6 h-6 text-cyan-500" />
                  <div>
                    <p className="text-lg font-bold text-cyan-600">{faceSubmissions.filter(s => s.status === 'approved' && s.admin_notes?.toLowerCase().includes('auto')).length}</p>
                    <p className="text-xs text-cyan-600/80">Auto Verified</p>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card className="bg-gradient-to-br from-pink-50 to-pink-100 border-pink-200">
              <CardContent className="p-3">
                <div className="flex items-center gap-2">
                  <Crown className="w-6 h-6 text-pink-500" />
                  <div>
                    <p className="text-lg font-bold text-pink-600">{faceSubmissions.filter(s => s.status === 'approved' && s.admin_notes?.toLowerCase().includes('auto') && s.verification_type === 'host').length}</p>
                    <p className="text-xs text-pink-600/80">Auto Host</p>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card className="bg-gradient-to-br from-blue-50 to-blue-100 border-blue-200">
              <CardContent className="p-3">
                <div className="flex items-center gap-2">
                  <User className="w-6 h-6 text-blue-500" />
                  <div>
                    <p className="text-lg font-bold text-blue-600">{faceSubmissions.filter(s => s.status === 'approved' && s.admin_notes?.toLowerCase().includes('auto') && s.verification_type !== 'host').length}</p>
                    <p className="text-xs text-blue-600/80">Auto User</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Search */}
          <Card className="bg-white border-slate-200 shadow-md">
            <CardContent className="p-3">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <Input
                  placeholder="Search by name or UID..."
                  value={appSearchQuery}
                  onChange={(e) => setAppSearchQuery(e.target.value)}
                  className="pl-10 bg-slate-50 border-slate-200 h-10 text-sm text-slate-900 placeholder:text-slate-400"
                />
              </div>
            </CardContent>
          </Card>

          {/* Auto Verified Grid */}
          {(() => {
            const autoApproved = faceSubmissions.filter(s => 
              s.status === 'approved' && s.admin_notes?.toLowerCase().includes('auto')
            ).filter(s => {
              if (autoVerifiedFilter === 'host') return s.verification_type === 'host';
              if (autoVerifiedFilter === 'user') return s.verification_type !== 'host';
              return true;
            }).filter(s => {
              if (!appSearchQuery) return true;
              const q = appSearchQuery.toLowerCase();
              return s.full_name?.toLowerCase().includes(q) || s.profile?.app_uid?.includes(q) || s.profile?.display_name?.toLowerCase().includes(q);
            });
            return autoApproved.length === 0 ? (
              <Card className="bg-white border-slate-200">
                <CardContent className="flex flex-col items-center justify-center h-64 text-slate-400">
                  <Shield className="w-12 h-12 mb-4" />
                  <p>No auto-verified submissions found</p>
                </CardContent>
              </Card>
            ) : (
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                {autoApproved.map((sub) => (
                  <Card key={sub.id} className="bg-gradient-to-br from-cyan-50 to-white border-cyan-200 hover:bg-cyan-50/80 transition-colors">
                    <CardContent className="p-4">
                      <div className="flex items-start gap-3">
                        <Avatar className="w-16 h-16 border-2 border-cyan-300">
                          <AvatarImage src={sub.profile_photo_url || sub.profile?.avatar_url || undefined} />
                          <AvatarFallback className="bg-cyan-100 text-cyan-600">
                            {sub.full_name?.charAt(0) || sub.profile?.display_name?.charAt(0) || 'A'}
                          </AvatarFallback>
                        </Avatar>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between">
                            <p className="font-semibold truncate text-slate-800">{sub.full_name || sub.profile?.display_name || 'Unknown'}</p>
                            <Badge className="bg-cyan-100 text-cyan-700 border-cyan-300 text-xs">
                              <Shield className="w-3 h-3 mr-1" />
                              Auto Verified
                            </Badge>
                          </div>
                          {sub.profile?.app_uid && (
                            <p className="text-sm text-slate-500">{sub.profile.app_uid}</p>
                          )}
                          <div className="flex items-center gap-3 mt-2 text-xs text-slate-500">
                            {sub.age && (
                              <span className="flex items-center gap-1">
                                <Calendar className="w-3 h-3" />
                                {sub.age} yrs
                              </span>
                            )}
                            {sub.language && (
                              <span className="flex items-center gap-1">
                                <Languages className="w-3 h-3" />
                                {sub.language}
                              </span>
                            )}
                            <Badge variant="outline" className="text-xs">
                              {sub.verification_type === 'host' ? '🎤 Host' : '👤 User'}
                            </Badge>
                          </div>
                          {/* Verification Details */}
                          {(() => {
                            const details = parseVerificationDetails(sub.admin_notes);
                            const steps = getVerificationSteps(sub);
                            const completedSteps = steps.filter(s => s.done).length;
                            if (!details) return null;
                            return (
                              <div className="mt-2 space-y-1.5">
                                <div className="flex flex-wrap gap-1.5">
                                  {details.faceMatch !== null && (
                                    <Badge variant="outline" className="text-[10px] bg-green-50 text-green-700 border-green-200">
                                      Face Match: {details.faceMatch.toFixed(1)}%
                                    </Badge>
                                  )}
                                  {details.genderConfidence !== null && (
                                    <Badge variant="outline" className="text-[10px] bg-purple-50 text-purple-700 border-purple-200">
                                      {details.gender}: {details.genderConfidence.toFixed(1)}%
                                    </Badge>
                                  )}
                                  {details.confidence !== null && (
                                    <Badge variant="outline" className="text-[10px] bg-blue-50 text-blue-700 border-blue-200">
                                      Conf: {details.confidence.toFixed(1)}%
                                    </Badge>
                                  )}
                                </div>
                                <div className="flex items-center gap-1">
                                  <span className="text-[10px] text-slate-500">Steps: {completedSteps}/{steps.length}</span>
                                  <div className="flex gap-0.5">
                                    {steps.map((step, i) => (
                                      <div key={i} title={step.label} className={`w-2 h-2 rounded-full ${step.done ? 'bg-green-500' : 'bg-slate-300'}`} />
                                    ))}
                                  </div>
                                </div>
                              </div>
                            );
                          })()}
                          <p className="text-[10px] text-slate-400 mt-1">
                            {formatDistanceToNow(new Date(sub.created_at), { addSuffix: true })}
                          </p>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            );
          })()}
        </TabsContent>

        {/* === AUTO REJECTED TAB === */}
        <TabsContent value="auto-rejected" className="mt-4 space-y-4">
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            <Card className="bg-gradient-to-br from-orange-50 to-orange-100 border-orange-200">
              <CardContent className="p-3">
                <div className="flex items-center gap-2">
                  <XCircle className="w-6 h-6 text-orange-500" />
                  <div>
                    <p className="text-lg font-bold text-orange-600">{faceSubmissions.filter(s => s.status === 'rejected' && s.admin_notes?.toLowerCase().includes('auto')).length}</p>
                    <p className="text-xs text-orange-600/80">Auto Rejected</p>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card className="bg-gradient-to-br from-red-50 to-red-100 border-red-200">
              <CardContent className="p-3">
                <div className="flex items-center gap-2">
                  <AlertTriangle className="w-6 h-6 text-red-500" />
                  <div>
                    <p className="text-lg font-bold text-red-600">{faceSubmissions.filter(s => s.status === 'rejected' && s.admin_notes?.toLowerCase().includes('auto') && s.admin_notes?.toLowerCase().includes('face match')).length}</p>
                    <p className="text-xs text-red-600/80">Face Mismatch</p>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card className="bg-gradient-to-br from-yellow-50 to-yellow-100 border-yellow-200">
              <CardContent className="p-3">
                <div className="flex items-center gap-2">
                  <ScanFace className="w-6 h-6 text-yellow-600" />
                  <div>
                    <p className="text-lg font-bold text-yellow-600">{faceSubmissions.filter(s => s.status === 'rejected' && s.admin_notes?.toLowerCase().includes('auto') && !s.admin_notes?.toLowerCase().includes('face match')).length}</p>
                    <p className="text-xs text-yellow-600/80">Other Reasons</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Search */}
          <Card className="bg-white border-slate-200 shadow-md">
            <CardContent className="p-3">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <Input
                  placeholder="Search by name or UID..."
                  value={appSearchQuery}
                  onChange={(e) => setAppSearchQuery(e.target.value)}
                  className="pl-10 bg-slate-50 border-slate-200 h-10 text-sm text-slate-900 placeholder:text-slate-400"
                />
              </div>
            </CardContent>
          </Card>

          {/* Auto Rejected Grid */}
          {(() => {
            const autoRejected = faceSubmissions.filter(s => 
              s.status === 'rejected' && s.admin_notes?.toLowerCase().includes('auto')
            ).filter(s => {
              if (!appSearchQuery) return true;
              const q = appSearchQuery.toLowerCase();
              return s.full_name?.toLowerCase().includes(q) || s.profile?.app_uid?.includes(q) || s.profile?.display_name?.toLowerCase().includes(q);
            });
            return autoRejected.length === 0 ? (
              <Card className="bg-white border-slate-200">
                <CardContent className="flex flex-col items-center justify-center h-64 text-slate-400">
                  <XCircle className="w-12 h-12 mb-4" />
                  <p>No auto-rejected submissions found</p>
                </CardContent>
              </Card>
            ) : (
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                {autoRejected.map((sub) => (
                  <Card key={sub.id} className="bg-gradient-to-br from-orange-50 to-white border-orange-200 hover:bg-orange-50/80 transition-colors">
                    <CardContent className="p-4">
                      <div className="flex items-start gap-3">
                        <Avatar className="w-16 h-16 border-2 border-orange-300">
                          <AvatarImage src={sub.profile_photo_url || sub.profile?.avatar_url || undefined} />
                          <AvatarFallback className="bg-orange-100 text-orange-600">
                            {sub.full_name?.charAt(0) || sub.profile?.display_name?.charAt(0) || 'R'}
                          </AvatarFallback>
                        </Avatar>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between">
                            <p className="font-semibold truncate text-slate-800">{sub.full_name || sub.profile?.display_name || 'Unknown'}</p>
                            <Badge className="bg-orange-100 text-orange-700 border-orange-300 text-xs">
                              <XCircle className="w-3 h-3 mr-1" />
                              Auto Rejected
                            </Badge>
                          </div>
                          {sub.profile?.app_uid && (
                            <p className="text-sm text-slate-500">{sub.profile.app_uid}</p>
                          )}
                          {sub.rejection_reason && (
                            <p className="text-xs text-red-600 mt-1 line-clamp-2 bg-red-50 p-1.5 rounded">
                              ❌ {sub.rejection_reason}
                            </p>
                          )}
                          {/* Verification Details */}
                          {(() => {
                            const details = parseVerificationDetails(sub.admin_notes);
                            const steps = getVerificationSteps(sub);
                            const completedSteps = steps.filter(s => s.done).length;
                            return (
                              <div className="mt-2 space-y-1.5">
                                <div className="flex flex-wrap gap-1.5">
                                  {details?.faceMatch !== null && details?.faceMatch !== undefined && (
                                    <Badge variant="outline" className="text-[10px] bg-red-50 text-red-700 border-red-200">
                                      Face Match: {details.faceMatch.toFixed(1)}%
                                    </Badge>
                                  )}
                                  {details?.genderConfidence !== null && details?.genderConfidence !== undefined && (
                                    <Badge variant="outline" className="text-[10px] bg-purple-50 text-purple-700 border-purple-200">
                                      {details.gender}: {details.genderConfidence.toFixed(1)}%
                                    </Badge>
                                  )}
                                  {details?.reasonCode && (
                                    <Badge variant="outline" className="text-[10px] bg-orange-50 text-orange-700 border-orange-200">
                                      {details.reasonCode.replace(/_/g, ' ')}
                                    </Badge>
                                  )}
                                </div>
                                <div className="flex items-center gap-1">
                                  <span className="text-[10px] text-slate-500">Steps: {completedSteps}/{steps.length}</span>
                                  <div className="flex gap-0.5">
                                    {steps.map((step, i) => (
                                      <div key={i} title={step.label} className={`w-2 h-2 rounded-full ${step.done ? 'bg-green-500' : 'bg-red-400'}`} />
                                    ))}
                                  </div>
                                </div>
                              </div>
                            );
                          })()}
                          <div className="flex items-center gap-3 mt-2 text-xs text-slate-500">
                            {sub.age && (
                              <span className="flex items-center gap-1">
                                <Calendar className="w-3 h-3" />
                                {sub.age} yrs
                              </span>
                            )}
                            {sub.language && (
                              <span className="flex items-center gap-1">
                                <Languages className="w-3 h-3" />
                                {sub.language}
                              </span>
                            )}
                            <Badge variant="outline" className="text-xs">
                              {sub.verification_type === 'host' ? '🎤 Host' : '👤 User'}
                            </Badge>
                          </div>
                          <p className="text-[10px] text-slate-400 mt-1">
                            {formatDistanceToNow(new Date(sub.created_at), { addSuffix: true })}
                          </p>
                          <div className="flex gap-2 mt-3">
                            <Button
                              size="sm"
                              disabled={actionLoading}
                              onClick={(e) => { e.stopPropagation(); handleManualConvertFromRejected(sub.id, sub.user_id, true); }}
                              className="bg-pink-500 hover:bg-pink-600 text-white text-xs flex-1"
                            >
                              🎤 Host
                            </Button>
                            <Button
                              size="sm"
                              disabled={actionLoading}
                              onClick={(e) => { e.stopPropagation(); handleManualConvertFromRejected(sub.id, sub.user_id, false); }}
                              className="bg-blue-500 hover:bg-blue-600 text-white text-xs flex-1"
                            >
                              👤 User
                            </Button>
                          </div>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            );
          })()}
        </TabsContent>

        {/* === FACE VERIFICATION TAB === */}
        <TabsContent value="face-verification" className="mt-4 space-y-4">
          {/* Stats Cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <Card className="border" style={{ background: 'rgba(245,158,11,0.15)', borderColor: 'rgba(245,158,11,0.3)' }}>
              <CardContent className="p-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full flex items-center justify-center" style={{ backgroundColor: 'rgba(245,158,11,0.3)' }}>
                    <Clock className="w-5 h-5" style={{ color: '#fbbf24' }} />
                  </div>
                  <div>
                    <p className="text-2xl font-bold" style={{ color: '#fcd34d' }}>{pendingFaceCount}</p>
                    <p className="text-sm" style={{ color: 'rgba(251,191,36,0.8)' }}>Pending</p>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card className="border" style={{ background: 'rgba(34,197,94,0.15)', borderColor: 'rgba(34,197,94,0.3)' }}>
              <CardContent className="p-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full flex items-center justify-center" style={{ backgroundColor: 'rgba(34,197,94,0.3)' }}>
                    <CheckCircle className="w-5 h-5" style={{ color: '#4ade80' }} />
                  </div>
                  <div>
                    <p className="text-2xl font-bold" style={{ color: '#86efac' }}>{approvedFaceCount}</p>
                    <p className="text-sm" style={{ color: 'rgba(74,222,128,0.8)' }}>Approved</p>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card className="border" style={{ background: 'rgba(239,68,68,0.15)', borderColor: 'rgba(239,68,68,0.3)' }}>
              <CardContent className="p-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full flex items-center justify-center" style={{ backgroundColor: 'rgba(239,68,68,0.3)' }}>
                    <XCircle className="w-5 h-5" style={{ color: '#f87171' }} />
                  </div>
                  <div>
                    <p className="text-2xl font-bold" style={{ color: '#fca5a5' }}>{rejectedFaceCount}</p>
                    <p className="text-sm" style={{ color: 'rgba(248,113,113,0.8)' }}>Rejected</p>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card className="border" style={{ background: 'rgba(168,85,247,0.15)', borderColor: 'rgba(168,85,247,0.3)' }}>
              <CardContent className="p-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full flex items-center justify-center" style={{ backgroundColor: 'rgba(168,85,247,0.3)' }}>
                    <ScanFace className="w-5 h-5" style={{ color: '#c084fc' }} />
                  </div>
                  <div>
                    <p className="text-2xl font-bold" style={{ color: '#d8b4fe' }}>{faceVisiblePool.length}</p>
                    <p className="text-sm" style={{ color: 'rgba(192,132,252,0.8)' }}>Total</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Search & Filter Tabs */}
          <div className="flex flex-col md:flex-row gap-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <Input
                placeholder="Search by name or UID..."
                value={faceSearchQuery}
                onChange={(e) => setFaceSearchQuery(e.target.value)}
                className="pl-10 bg-slate-50 border-slate-200 text-slate-900 placeholder:text-slate-400"
              />
            </div>
          </div>

          <Tabs value={faceActiveTab} onValueChange={setFaceActiveTab}>
            <TabsList className="grid grid-cols-4 w-full max-w-md bg-slate-100 border border-slate-200">
              <TabsTrigger value="pending" className="relative data-[state=active]:bg-amber-500 data-[state=active]:text-white text-slate-700">
                Pending
                {pendingFaceCount > 0 && (
                  <span className="absolute -top-1 -right-1 w-5 h-5 bg-amber-500 rounded-full text-[10px] font-bold flex items-center justify-center text-white">
                    {pendingFaceCount}
                  </span>
                )}
              </TabsTrigger>
              <TabsTrigger value="approved" className="relative data-[state=active]:bg-green-500 data-[state=active]:text-white text-slate-700">Approved
                {approvedFaceCount > 0 && <span className="absolute -top-1 -right-1 w-5 h-5 bg-green-500 rounded-full text-[10px] font-bold flex items-center justify-center text-white">{approvedFaceCount}</span>}
              </TabsTrigger>
              <TabsTrigger value="rejected" className="relative data-[state=active]:bg-red-500 data-[state=active]:text-white text-slate-700">Rejected
                {rejectedFaceCount > 0 && <span className="absolute -top-1 -right-1 w-5 h-5 bg-red-500 rounded-full text-[10px] font-bold flex items-center justify-center text-white">{rejectedFaceCount}</span>}
              </TabsTrigger>
              <TabsTrigger value="all" className="data-[state=active]:bg-purple-500 data-[state=active]:text-white text-slate-700">All</TabsTrigger>
            </TabsList>

            <TabsContent value={faceActiveTab} className="mt-4">
              {loading ? (
                <div className="flex items-center justify-center h-64">
                  <Loader2 className="w-10 h-10 animate-spin text-purple-500" />
                </div>
              ) : filteredFaceSubmissions.length === 0 ? (
                <div className="text-center py-12">
                  <ScanFace className="w-12 h-12 text-slate-400 mx-auto mb-4" />
                  <p className="text-slate-500">No submissions found</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {filteredFaceSubmissions.map((submission) => (
                    <Card 
                      key={submission.id}
                      className="bg-white border-slate-200 overflow-hidden"
                    >
                      <CardContent className="p-4 space-y-3">
                        {/* User Info Row */}
                        <div className="flex items-center gap-3">
                          <Avatar className="w-12 h-12 border-2 border-purple-300">
                            <AvatarImage src={submission.profile?.avatar_url} />
                            <AvatarFallback>
                              {submission.full_name?.charAt(0) || submission.profile?.display_name?.charAt(0) || 'U'}
                            </AvatarFallback>
                          </Avatar>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <h3 className="font-semibold truncate text-slate-800">
                                {submission.full_name || submission.profile?.display_name || 'Unknown'}
                              </h3>
                              <Badge className={submission.verification_type === 'host' ? "bg-pink-100 text-pink-700" : "bg-blue-100 text-blue-700"}>
                                {submission.verification_type === 'host' ? 'Host' : 'User'}
                              </Badge>
                              <Badge className={
                                isFacePendingBucket(submission) ? "bg-amber-100 text-amber-700" :
                                isFaceApproved(submission) ? "bg-green-100 text-green-700" :
                                "bg-red-100 text-red-700"
                              }>
                                {isFacePendingBucket(submission) ? 'Pending' : isFaceApproved(submission) ? 'Approved' : 'Rejected'}
                              </Badge>
                            </div>
                            <p className="text-xs text-slate-500">UID: {submission.profile?.app_uid}</p>
                            {submission.agency_info && (
                              <div className="flex items-center gap-1.5 mt-1">
                                <Badge className="bg-indigo-100 text-indigo-700 border border-indigo-200 text-xs">
                                  🏢 {submission.agency_info.agency_name} ({submission.agency_info.agency_code})
                                </Badge>
                              </div>
                            )}
                          </div>
                        </div>

                        {/* Personal Info */}
                        <div className="p-3 rounded-lg bg-slate-50 border border-slate-200">
                          <p className="text-xs font-semibold text-purple-600 mb-2">📋 Personal Info</p>
                          <div className="grid grid-cols-2 gap-2 text-sm">
                            <div>
                              <span className="text-xs text-slate-500">Name:</span>
                              <p className="font-medium text-slate-800">{submission.full_name || <span className="text-red-400">—</span>}</p>
                            </div>
                            <div>
                              <span className="text-xs text-slate-500">Age:</span>
                              <p className="font-medium text-slate-800">{submission.age ? `${submission.age} yrs` : <span className="text-red-400">—</span>}</p>
                            </div>
                            <div>
                              <span className="text-xs text-slate-500">Language:</span>
                              <p className="font-medium text-slate-800">{submission.language || <span className="text-red-400">—</span>}</p>
                            </div>
                            <div>
                              <span className="text-xs text-slate-500">Gender:</span>
                              <p className="font-medium text-slate-800">{submission.profile?.gender || <span className="text-red-400">—</span>}</p>
                            </div>
                          </div>
                        </div>

                        <FaceSubmissionMediaBlocks submission={submission} />


                        {/* Inline Approve/Reject Buttons */}
                        {isFacePendingBucket(submission) && (
                          <div className="flex gap-2">
                            <Button 
                              className="flex-1 bg-green-500 hover:bg-green-600 text-white"
                              disabled={actionLoading}
                              onClick={(e) => {
                                e.stopPropagation();
                                setSelectedFaceSubmission(submission);
                                setFaceActionType('approve');
                                setShowFaceActionModal(true);
                              }}
                            >
                              <CheckCircle className="w-4 h-4 mr-2" />
                              Approve
                            </Button>
                            <Button 
                              className="flex-1 bg-red-500 hover:bg-red-600 text-white"
                              disabled={actionLoading}
                              onClick={(e) => {
                                e.stopPropagation();
                                setSelectedFaceSubmission(submission);
                                setFaceActionType('reject');
                                setShowFaceActionModal(true);
                              }}
                            >
                              <XCircle className="w-4 h-4 mr-2" />
                              Reject
                            </Button>
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
            </TabsContent>
          </Tabs>
        </TabsContent>

        {/* === MODERATION TAB === */}
        <TabsContent value="moderation" className="mt-4 space-y-4">
          {/* Header with Settings */}
          <div className="flex justify-between items-center">
            <div>
              <h2 className="text-lg font-bold text-slate-800">Moderation Logs</h2>
              <p className="text-sm text-slate-500">Phone number detection and auto-ban system</p>
            </div>
            <Button onClick={() => setShowSettingsDialog(true)} variant="outline" size="sm">
              <Settings className="w-4 h-4 mr-2" />
              Settings
            </Button>
          </div>

          {/* Stats */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <Card className="bg-gradient-to-br from-red-500 to-orange-500 text-white border-0">
              <CardContent className="p-3">
                <div className="flex items-center gap-2">
                  <AlertTriangle className="w-8 h-8 opacity-80" />
                  <div>
                    <p className="text-xl font-bold">{totalLogs}</p>
                    <p className="text-xs opacity-80">Total Violations</p>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card className="bg-gradient-to-br from-purple-500 to-pink-500 text-white border-0">
              <CardContent className="p-3">
                <div className="flex items-center gap-2">
                  <Phone className="w-8 h-8 opacity-80" />
                  <div>
                    <p className="text-xl font-bold">{moderationLogs.filter(l => l.violation_type === "phone_number").length}</p>
                    <p className="text-xs opacity-80">Phone Detection</p>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card className="bg-gradient-to-br from-red-600 to-red-700 text-white border-0">
              <CardContent className="p-3">
                <div className="flex items-center gap-2">
                  <Ban className="w-8 h-8 opacity-80" />
                  <div>
                    <p className="text-xl font-bold">{moderationLogs.filter(l => l.action_taken === "auto_ban").length}</p>
                    <p className="text-xs opacity-80">Auto-Ban</p>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card className="bg-gradient-to-br from-green-500 to-emerald-500 text-white border-0">
              <CardContent className="p-3">
                <div className="flex items-center gap-2">
                  <CheckCircle className="w-8 h-8 opacity-80" />
                  <div>
                    <p className="text-xl font-bold">{moderationSettings.phone_detection_enabled ? "ON" : "OFF"}</p>
                    <p className="text-xs opacity-80">AI Detection</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Filters */}
          <Card className="bg-white border-slate-200 shadow-lg">
            <CardContent className="p-4">
              <div className="flex flex-col md:flex-row gap-4">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                  <Input
                    placeholder="Search users..."
                    value={modSearchQuery}
                    onChange={(e) => setModSearchQuery(e.target.value)}
                    className="pl-10 bg-white border-slate-200 text-slate-900 placeholder:text-slate-400"
                  />
                </div>
                <Select value={modFilterType} onValueChange={setModFilterType}>
                  <SelectTrigger className="w-full md:w-48 bg-white border-slate-200 text-slate-800">
                    <Filter className="w-4 h-4 mr-2 text-slate-500" />
                    <SelectValue placeholder="Filter" />
                  </SelectTrigger>
                  <SelectContent className="bg-white border-slate-200 text-slate-900">
                    <SelectItem value="all" className="text-slate-800">All Violations</SelectItem>
                    <SelectItem value="phone_number" className="text-slate-800">Phone Number</SelectItem>
                    <SelectItem value="auto_ban" className="text-slate-800">Auto-Ban</SelectItem>
                    <SelectItem value="warning" className="text-slate-800">Warning</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </CardContent>
          </Card>

          {/* Logs Table */}
          <Card className="bg-white border-slate-200 shadow-xl overflow-hidden">
            <CardContent className="p-0">
              {loading ? (
                <div className="flex items-center justify-center h-64">
                  <Loader2 className="w-10 h-10 animate-spin text-red-500" />
                </div>
              ) : moderationLogs.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-64 text-slate-400">
                  <Shield className="w-12 h-12 mb-4" />
                  <p>No moderation logs</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow className="border-slate-200 bg-slate-50">
                        <TableHead className="text-slate-600 font-semibold">User</TableHead>
                        <TableHead className="text-slate-600 font-semibold hidden md:table-cell">Violation</TableHead>
                        <TableHead className="text-slate-600 font-semibold">Action</TableHead>
                        <TableHead className="text-slate-600 font-semibold text-right">Operation</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {moderationLogs.map((log) => (
                        <TableRow key={log.id} className="border-slate-100 hover:bg-red-50/30">
                          <TableCell>
                            <div className="flex items-center gap-3">
                              <Avatar className="w-10 h-10 border-2 border-slate-200">
                                <AvatarImage src={log.user?.avatar_url || undefined} />
                                <AvatarFallback className="bg-gradient-to-br from-red-400 to-orange-500 text-white">
                                  {log.user?.display_name?.charAt(0) || "U"}
                                </AvatarFallback>
                              </Avatar>
                              <div>
                                <p className="font-medium text-slate-800 flex items-center gap-2">
                                  {log.user?.display_name || "Unknown"}
                                  {log.user?.is_blocked && (
                                    <Badge className="bg-red-100 text-red-600 text-xs">Banned</Badge>
                                  )}
                                </p>
                                {log.user?.app_uid && (
                                  <p className="text-xs text-slate-500">{log.user.app_uid}</p>
                                )}
                              </div>
                            </div>
                          </TableCell>
                          <TableCell className="hidden md:table-cell">
                            <Badge className="bg-orange-100 text-orange-600">
                              <Phone className="w-3 h-3 mr-1" />
                              {log.violation_type}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            <Badge className={log.action_taken === "auto_ban" ? "bg-red-100 text-red-600" : "bg-yellow-100 text-yellow-600"}>
                              {log.action_taken === "auto_ban" ? (
                                <>
                                  <Ban className="w-3 h-3 mr-1" />
                                  Auto-Ban
                                </>
                              ) : (
                                <>
                                  <AlertTriangle className="w-3 h-3 mr-1" />
                                  Warning
                                </>
                              )}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-right">
                            {log.user?.is_blocked && (
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => handleUnbanModUser(log.user_id)}
                                className="text-green-600 hover:bg-green-50"
                              >
                                <CheckCircle className="w-4 h-4 mr-1" />
                                Unban
                              </Button>
                            )}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Pagination */}
          {modTotalPages > 1 && (
            <div className="flex items-center justify-center gap-2">
              <Button
                variant="outline"
                size="icon"
                disabled={modCurrentPage === 1}
                onClick={() => setModCurrentPage(p => p - 1)}
              >
                <ChevronLeft className="w-4 h-4" />
              </Button>
              <span className="text-slate-600 px-4">{modCurrentPage} / {modTotalPages}</span>
              <Button
                variant="outline"
                size="icon"
                disabled={modCurrentPage === modTotalPages}
                onClick={() => setModCurrentPage(p => p + 1)}
              >
                <ChevronRight className="w-4 h-4" />
              </Button>
            </div>
          )}
        </TabsContent>

        {/* === BLOCK LIST TAB === */}
        <TabsContent value="blocked" className="mt-4 space-y-4">
          {/* Stats */}
          <div className="grid grid-cols-2 gap-3">
            <Card className="bg-gradient-to-br from-red-50 to-red-100 border-red-200 shadow-md">
              <CardContent className="p-3">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 rounded-xl bg-red-500 flex items-center justify-center shadow-lg">
                    <Users className="w-6 h-6 text-white" />
                  </div>
                  <div>
                    <p className="text-red-600 text-sm font-medium">Blocked Users</p>
                    <p className="text-red-700 font-bold text-2xl">{blockedUsers.length}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card className="bg-gradient-to-br from-orange-50 to-orange-100 border-orange-200 shadow-md">
              <CardContent className="p-3">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 rounded-xl bg-orange-500 flex items-center justify-center shadow-lg">
                    <Building2 className="w-6 h-6 text-white" />
                  </div>
                  <div>
                    <p className="text-orange-600 text-sm font-medium">Blocked Agencies</p>
                    <p className="text-orange-700 font-bold text-2xl">{blockedAgencies.length}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Search */}
          <Card className="bg-white border-slate-200 shadow-sm">
            <CardContent className="p-3">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <Input
                  placeholder="Search by UID, name, or username..."
                  value={blockSearchQuery}
                  onChange={(e) => setBlockSearchQuery(e.target.value)}
                  className="pl-10 bg-slate-50 border-slate-200 text-slate-900 placeholder:text-slate-400"
                />
              </div>
            </CardContent>
          </Card>

          {/* Tabs */}
          <Tabs value={blockListTab} onValueChange={setBlockListTab}>
            <TabsList className="bg-slate-100 border border-slate-200 p-1 w-full grid grid-cols-2">
              <TabsTrigger value="users" className="data-[state=active]:bg-red-500 data-[state=active]:text-white text-slate-700 font-medium">
                <Users className="w-4 h-4 mr-2" />
                Users ({blockedUsers.length})
              </TabsTrigger>
              <TabsTrigger value="agencies" className="data-[state=active]:bg-red-500 data-[state=active]:text-white text-slate-700 font-medium">
                <Building2 className="w-4 h-4 mr-2" />
                Agencies ({blockedAgencies.length})
              </TabsTrigger>
            </TabsList>

            <TabsContent value="users" className="mt-4">
              <Card className="bg-white border-slate-200 shadow-md overflow-hidden">
                <CardContent className="p-0">
                  <Table>
                    <TableHeader>
                      <TableRow className="border-slate-200 bg-slate-50">
                         <TableHead className="text-slate-700 font-semibold">User</TableHead>
                        <TableHead className="text-slate-700 font-semibold">UID</TableHead>
                        <TableHead className="text-slate-700 font-semibold">Type</TableHead>
                        <TableHead className="text-slate-700 font-semibold hidden md:table-cell">Ban Reason</TableHead>
                        <TableHead className="text-slate-700 font-semibold hidden md:table-cell">Banned At</TableHead>
                        <TableHead className="text-slate-700 font-semibold text-right">Action</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {loading ? (
                        <TableRow>
                          <TableCell colSpan={6} className="text-center text-slate-500 py-10">
                            Loading...
                          </TableCell>
                        </TableRow>
                      ) : filteredBlockedUsers.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={6} className="text-center text-slate-500 py-10">
                            No banned users found
                          </TableCell>
                        </TableRow>
                      ) : (
                        filteredBlockedUsers.map((user) => (
                          <TableRow 
                            key={user.id} 
                            className="border-slate-100 hover:bg-slate-50 cursor-pointer"
                            onClick={() => fetchBlockedUserDetails(user.id)}
                          >
                            <TableCell>
                              <div className="flex items-center gap-3">
                                <Avatar className="w-10 h-10 border-2 border-red-300">
                                  <AvatarImage src={user.avatar_url || ""} />
                                  <AvatarFallback className="bg-red-100 text-red-600">
                                    {user.display_name?.charAt(0) || "U"}
                                  </AvatarFallback>
                                </Avatar>
                                <div>
                                  <p className="text-slate-900 font-medium">{user.display_name}</p>
                                  <p className="text-slate-500 text-xs">@{user.username || user.id.slice(0, 8)}</p>
                                  {/* Show ban reason on mobile (hidden on md+) */}
                                  <div className="flex items-center gap-1 mt-1 md:hidden">
                                    <AlertTriangle className="w-3 h-3 text-amber-500 flex-shrink-0" />
                                    <p className="text-xs text-red-600 font-medium truncate max-w-[200px]">
                                      {user.blocked_reason || "No reason specified"}
                                    </p>
                                  </div>
                                </div>
                              </div>
                            </TableCell>
                            <TableCell>
                              <Badge className="bg-purple-100 text-purple-700 border-purple-200 font-mono">
                                {user.app_uid || "—"}
                              </Badge>
                            </TableCell>
                            <TableCell>
                              <Badge className="bg-blue-100 text-blue-700 border-blue-200">
                                {user.is_host ? "Host" : "User"}
                              </Badge>
                            </TableCell>
                            <TableCell className="hidden md:table-cell">
                              <div className="flex items-center gap-2 text-slate-700 max-w-xs truncate">
                                <AlertTriangle className="w-4 h-4 text-amber-500 flex-shrink-0" />
                                <span className="truncate">{user.blocked_reason || "No reason specified"}</span>
                              </div>
                            </TableCell>
                            <TableCell className="hidden md:table-cell">
                              <div className="flex items-center gap-2 text-slate-600">
                                <Clock className="w-4 h-4" />
                                {user.blocked_at ? formatDistanceToNow(new Date(user.blocked_at), { addSuffix: true }) : "-"}
                              </div>
                            </TableCell>
                            <TableCell className="text-right">
                              <div className="flex items-center justify-end gap-2">
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="text-purple-600 hover:bg-purple-50 border-purple-200"
                                  onClick={(e) => { e.stopPropagation(); fetchBlockedUserDetails(user.id); }}
                                >
                                  <Eye className="w-4 h-4 mr-1" />
                                  Details
                                </Button>
                                <Button
                                  size="sm"
                                  className="bg-green-500 hover:bg-green-600 text-white"
                                  onClick={(e) => { e.stopPropagation(); handleUnblockUser(user.id); }}
                                >
                                  <Unlock className="w-4 h-4 mr-1" />
                                  Unban
                                </Button>
                              </div>
                            </TableCell>
                          </TableRow>
                        ))
                      )}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="agencies" className="mt-4">
              <Card className="bg-white border-slate-200 shadow-md overflow-hidden">
                <CardContent className="p-0">
                  <Table>
                    <TableHeader>
                      <TableRow className="border-slate-200 bg-slate-50">
                         <TableHead className="text-slate-700 font-semibold">Agency</TableHead>
                        <TableHead className="text-slate-700 font-semibold">Code</TableHead>
                        <TableHead className="text-slate-700 font-semibold hidden md:table-cell">Hosts</TableHead>
                        <TableHead className="text-slate-700 font-semibold hidden lg:table-cell">Ban Reason</TableHead>
                        <TableHead className="text-slate-700 font-semibold text-right">Action</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {loading ? (
                        <TableRow>
                          <TableCell colSpan={5} className="text-center text-slate-500 py-10">
                            Loading...
                          </TableCell>
                        </TableRow>
                      ) : filteredBlockedAgencies.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={5} className="text-center text-slate-500 py-10">
                            No banned agencies
                          </TableCell>
                        </TableRow>
                      ) : (
                        filteredBlockedAgencies.map((agency) => (
                          <TableRow key={agency.id} className="border-slate-100 hover:bg-slate-50">
                            <TableCell>
                              <div className="flex items-center gap-3">
                                <div className="w-10 h-10 rounded-lg bg-red-100 flex items-center justify-center">
                                  <Building2 className="w-5 h-5 text-red-600" />
                                </div>
                                <div>
                                  <p className="text-slate-900 font-medium">{agency.name}</p>
                                  <p className="text-slate-500 text-xs">Owner: {agency.owner?.display_name || "N/A"}</p>
                                </div>
                              </div>
                            </TableCell>
                            <TableCell>
                              <Badge className="bg-purple-100 text-purple-700 border-purple-200">
                                {agency.agency_code}
                              </Badge>
                            </TableCell>
                            <TableCell className="hidden md:table-cell">
                              <span className="text-slate-900 font-medium">{agency.total_hosts}</span>
                            </TableCell>
                            <TableCell className="hidden lg:table-cell">
                              <div className="flex items-center gap-2 text-slate-700">
                                <AlertTriangle className="w-4 h-4 text-amber-500" />
                                {agency.blocked_reason || "No reason specified"}
                              </div>
                            </TableCell>
                            <TableCell className="text-right">
                              <Button
                                size="sm"
                                className="bg-green-500 hover:bg-green-600 text-white"
                                onClick={() => handleUnblockAgency(agency.id)}
                              >
                                <Unlock className="w-4 h-4 mr-1" />
                                Unban
                              </Button>
                            </TableCell>
                          </TableRow>
                        ))
                      )}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </TabsContent>
      </Tabs>

      {/* === DIALOGS === */}
      
      {/* Block User Dialog */}
      <Dialog open={showBlockDialog} onOpenChange={setShowBlockDialog}>
        <DialogContent className="bg-slate-900 border-slate-700">
          <DialogHeader>
            <DialogTitle className="text-white font-bold">
              {selectedUser?.is_blocked ? "Unblock User" : "Block User"}
            </DialogTitle>
            <DialogDescription className="text-slate-400">
              Do you want to {selectedUser?.is_blocked ? "unblock" : "block"} {selectedUser?.display_name}?
            </DialogDescription>
          </DialogHeader>
          {!selectedUser?.is_blocked && (
            <Textarea
              placeholder="Reason for blocking (optional)"
              value={blockReason}
              onChange={(e) => setBlockReason(e.target.value)}
              className="bg-slate-800 border-slate-600 text-white"
            />
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowBlockDialog(false)}>Cancel</Button>
            <Button
              onClick={handleBlockUser}
              disabled={actionLoading}
              className={selectedUser?.is_blocked ? "bg-green-600" : "bg-red-600"}
            >
              {actionLoading ? "Please wait..." : selectedUser?.is_blocked ? "Unblock" : "Block"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Reset Password Dialog */}
      <Dialog open={showResetPasswordDialog} onOpenChange={setShowResetPasswordDialog}>
        <DialogContent className="bg-slate-900 border-slate-700">
          <DialogHeader>
            <DialogTitle className="text-white font-bold flex items-center gap-2">
              <Unlock className="w-5 h-5 text-orange-500" />
              Reset User Password
            </DialogTitle>
            <DialogDescription className="text-slate-400">
              {resetPasswordResult 
                ? "Password has been reset successfully. Share this temporary password with the user."
                : `Reset login password for "${selectedUser?.display_name || "User"}"? A new temporary password will be generated.`
              }
            </DialogDescription>
          </DialogHeader>
          
          {resetPasswordResult ? (
            <div className="space-y-3">
              <div className="bg-green-500/10 border border-green-500/30 rounded-lg p-4">
                <p className="text-sm text-green-400 font-medium mb-2">✅ New Temporary Password:</p>
                <div className="flex items-center gap-2">
                  <code className="flex-1 bg-slate-800 border border-green-500/30 rounded px-3 py-2 text-lg font-mono text-green-300 select-all text-center">
                    {resetPasswordResult}
                  </code>
                  <Button 
                    size="sm" 
                    variant="outline"
                    className="border-green-500/30 text-green-400 hover:bg-green-500/10"
                    onClick={() => {
                      navigator.clipboard.writeText(resetPasswordResult);
                      toast.success("Password copied!");
                    }}
                  >
                    Copy
                  </Button>
                </div>
              </div>
              <p className="text-xs text-slate-400">
                ⚠️ Ask the user to change their password after logging in.
              </p>
            </div>
          ) : (
            <div className="bg-orange-500/10 border border-orange-500/30 rounded-lg p-3">
              <p className="text-sm text-orange-400">
                This will reset the user's current password and set a new temporary password.
              </p>
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowResetPasswordDialog(false)}>
              {resetPasswordResult ? "Close" : "Cancel"}
            </Button>
            {!resetPasswordResult && (
              <Button
                onClick={async () => {
                  if (!selectedUser) return;
                  setActionLoading(true);
                  try {
                    const { data, error } = await supabase.functions.invoke("admin-reset-user-password", {
                      body: { user_id: selectedUser.id },
                    });
                    if (error || !data?.success) {
                      throw new Error(data?.error || error?.message || "Failed to reset password");
                    }
                    setResetPasswordResult(data.temp_password);
                    toast.success("Password reset successful!");
                  } catch (err: any) {
                    toast.error(err.message || "Failed to reset password");
                  } finally {
                    setActionLoading(false);
                  }
                }}
                disabled={actionLoading}
                className="bg-orange-600 hover:bg-orange-700 text-white"
              >
                {actionLoading ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Resetting...</> : "Reset Password"}
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* User Details Dialog */}
      <Dialog open={showUserDialog} onOpenChange={setShowUserDialog}>
        <DialogContent className="bg-slate-900 border-slate-700 max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-white">User Details</DialogTitle>
          </DialogHeader>
          {selectedUser && (
            <div className="space-y-4">
              <div className="flex items-center gap-4">
                <Avatar className="w-16 h-16 border-2 border-purple-500/50">
                  <AvatarImage src={selectedUser.avatar_url || undefined} />
                  <AvatarFallback className="bg-purple-500/20 text-purple-400 text-xl">
                    {selectedUser.display_name?.charAt(0) || "U"}
                  </AvatarFallback>
                </Avatar>
                <div className="flex-1">
                  <p className="font-bold text-lg text-white">{selectedUser.display_name}</p>
                  <p className="text-slate-400">@{selectedUser.username || selectedUser.id.slice(0, 8)}</p>
                  {selectedUser.app_uid && (
                    <Badge className="mt-1 bg-purple-500/20 text-purple-300 border-purple-500/30">{selectedUser.app_uid}</Badge>
                  )}
                </div>
              </div>

              {/* Stats Grid */}
              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-lg p-3 bg-slate-800">
                  <p className="text-xs text-slate-400">Diamonds</p>
                  <p className="font-bold text-amber-400">{selectedUser.coins?.toLocaleString() || 0}</p>
                </div>
                <div className="rounded-lg p-3 bg-slate-800">
                  <p className="text-xs text-slate-400">Level</p>
                  <p className="font-bold text-purple-400">Lv. {selectedUser.user_level || 0}</p>
                </div>
                <div className="rounded-lg p-3 bg-slate-800">
                  <p className="text-xs text-slate-400">Earnings</p>
                  <p className="font-bold text-green-400">{selectedUser.total_earnings?.toLocaleString() || 0}</p>
                </div>
                <div className="rounded-lg p-3 bg-slate-800">
                  <p className="text-xs text-slate-400">Joined</p>
                  <p className="font-bold text-sm text-slate-300">
                    {selectedUser.created_at ? formatDistanceToNow(new Date(selectedUser.created_at), { addSuffix: true }) : '-'}
                  </p>
                </div>
              </div>

              {/* Location & IP Info */}
              <div className="rounded-lg p-3 space-y-2 bg-blue-500/10 border border-blue-500/30">
                <h4 className="font-semibold text-sm flex items-center gap-1.5 text-blue-400">
                  <Globe className="w-4 h-4" /> Location & IP
                </h4>
                <div className="grid grid-cols-2 gap-2 text-sm">
                  <div>
                    <p className="text-xs text-slate-400">Country</p>
                    <p className="font-medium text-slate-200">{selectedUser.country_flag} {selectedUser.country_name || '-'}</p>
                  </div>
                  <div>
                    <p className="text-xs text-slate-400">City / Region</p>
                    <p className="font-medium text-slate-200">{[selectedUser.city, selectedUser.region].filter(Boolean).join(', ') || '-'}</p>
                  </div>
                  <div>
                    <p className="text-xs text-slate-400">Registration IP</p>
                    <p className="font-mono text-xs font-medium text-slate-200">{selectedUser.registration_ip || '-'}</p>
                  </div>
                  <div>
                    <p className="text-xs text-slate-400">Last Login IP</p>
                    <p className="font-mono text-xs font-medium text-slate-200">{selectedUser.last_login_ip || '-'}</p>
                  </div>
                </div>
              </div>

              {/* Device Info */}
              <div className="rounded-lg p-3 space-y-2 bg-green-500/10 border border-green-500/30">
                <h4 className="font-semibold text-sm flex items-center gap-1.5 text-green-400">
                  <Smartphone className="w-4 h-4" /> Device Info
                </h4>
                <div className="space-y-2 text-sm">
                  <div>
                    <p className="text-xs text-slate-400">Registration Device</p>
                    <p className="text-xs break-all text-slate-200">{selectedUser.registration_user_agent || '-'}</p>
                  </div>
                  <div>
                    <p className="text-xs text-slate-400">Last Login Device</p>
                    <p className="text-xs break-all text-slate-200">{selectedUser.last_login_device || '-'}</p>
                  </div>
                  {selectedUser.last_login_at && (
                    <div>
                      <p className="text-xs text-slate-400">Last Login</p>
                      <p className="text-xs text-slate-200">{formatDistanceToNow(new Date(selectedUser.last_login_at), { addSuffix: true })}</p>
                    </div>
                  )}
                  {selectedUser.registration_device_info && (
                    <div>
                      <p className="text-xs text-slate-400">Screen</p>
                      <p className="text-xs text-slate-200">
                        {selectedUser.registration_device_info.screenWidth}x{selectedUser.registration_device_info.screenHeight}
                        {selectedUser.registration_device_info.platform && ` • ${selectedUser.registration_device_info.platform}`}
                      </p>
                    </div>
                  )}
                </div>
              </div>

              {/* Badges */}
              <div className="flex flex-wrap gap-2">
                {selectedUser.is_host && (
                  <Badge className="bg-yellow-500/20 text-yellow-300 border-yellow-500/30"><Crown className="w-3 h-3 mr-1" />Host</Badge>
                )}
                {selectedUser.is_verified && (
                  <Badge className="bg-blue-500/20 text-blue-300 border-blue-500/30"><CheckCircle className="w-3 h-3 mr-1" />Verified</Badge>
                )}
                {selectedUser.is_blocked && (
                  <Badge className="bg-red-500/20 text-red-300 border-red-500/30"><Ban className="w-3 h-3 mr-1" />Blocked</Badge>
                )}
              </div>
              {selectedUser.blocked_reason && (
                <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-3">
                  <p className="text-red-400 text-sm font-medium">Block Reason:</p>
                  <p className="text-slate-300 text-sm">{selectedUser.blocked_reason}</p>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Host Application Detail Dialog */}
      <Dialog open={showAppDetailDialog} onOpenChange={setShowAppDetailDialog}>
        <DialogContent className="bg-slate-900 border-slate-700 max-w-2xl">
          <DialogHeader>
            <DialogTitle className="text-white">Host Application Details</DialogTitle>
          </DialogHeader>
          {selectedApplication && (
            <div className="space-y-4">
              <div className="flex items-center gap-4">
                <Avatar className="w-20 h-20 border-2 border-slate-600">
                  <AvatarImage src={selectedApplication.photo_url} />
                  <AvatarFallback className="bg-pink-500/20 text-pink-400 text-xl">
                    {selectedApplication.full_name?.charAt(0) || "U"}
                  </AvatarFallback>
                </Avatar>
                <div className="flex-1">
                  <p className="font-bold text-lg text-white">{selectedApplication.full_name}</p>
                  <p className="text-slate-400">UID: {selectedApplication.profiles?.app_uid}</p>
                  <div className="flex items-center gap-2 mt-2">
                    <Badge className="bg-purple-500/20 text-purple-300">{selectedApplication.age} yrs</Badge>
                    <Badge className="bg-blue-500/20 text-blue-300">{selectedApplication.language}</Badge>
                  </div>
                </div>
              </div>
              <HostApplicationDetailMedia application={selectedApplication} />
              {selectedApplication.status === "pending" && (
                <div className="flex gap-2">
                  <Button className="flex-1 bg-green-500 hover:bg-green-600" onClick={handleApproveApplication} disabled={actionLoading}>
                    <CheckCircle className="w-4 h-4 mr-2" />
                    Approve
                  </Button>
                  <Button className="flex-1 bg-red-500 hover:bg-red-600" onClick={() => setShowRejectDialog(true)}>
                    <XCircle className="w-4 h-4 mr-2" />
                    Reject
                  </Button>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Reject Dialog */}
      <Dialog open={showRejectDialog} onOpenChange={setShowRejectDialog}>
        <DialogContent className="bg-slate-900 border-slate-700">
          <DialogHeader>
            <DialogTitle className="text-white">Rejection Reason</DialogTitle>
            <DialogDescription className="text-slate-400">
              Enter the reason for rejection
            </DialogDescription>
          </DialogHeader>
          <Textarea
            placeholder="Enter reason..."
            value={rejectionReason}
            onChange={(e) => setRejectionReason(e.target.value)}
            className="bg-slate-800 border-slate-600 text-white"
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowRejectDialog(false)}>Cancel</Button>
            <Button className="bg-red-500 hover:bg-red-600" onClick={handleRejectApplication} disabled={actionLoading}>
              {actionLoading ? "Please wait..." : "Reject"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Face Verification Detail Modal */}
      <Dialog open={showFaceDetailModal} onOpenChange={setShowFaceDetailModal}>
        <DialogContent className="bg-slate-900 border-slate-700 max-w-2xl">
          <DialogHeader>
            <DialogTitle className="text-white flex items-center gap-2">
              <ScanFace className="w-5 h-5 text-purple-400" />
              Verification Details
            </DialogTitle>
          </DialogHeader>
          {selectedFaceSubmission && (
            <div className="space-y-4">
              <div className="flex items-center gap-4 p-4 bg-slate-800 rounded-xl">
                <Avatar className="w-16 h-16 border-2 border-purple-500/30">
                  <AvatarImage src={selectedFaceSubmission.profile?.avatar_url} />
                  <AvatarFallback>{selectedFaceSubmission.profile?.display_name?.charAt(0) || 'U'}</AvatarFallback>
                </Avatar>
                <div>
                  <h3 className="font-bold text-lg text-white">{selectedFaceSubmission.profile?.display_name}</h3>
                  <p className="text-sm text-slate-400">UID: {selectedFaceSubmission.profile?.app_uid}</p>
                  <div className="flex items-center gap-2 mt-1">
                    <Badge className={selectedFaceSubmission.verification_type === 'host' ? "bg-pink-500/20 text-pink-300" : "bg-blue-500/20 text-blue-300"}>
                      {selectedFaceSubmission.verification_type === 'host' ? 'Host' : 'User'}
                    </Badge>
                    <Badge className={
                      isFacePendingBucket(selectedFaceSubmission) ? "bg-amber-500/20 text-amber-300" :
                      isFaceApproved(selectedFaceSubmission) ? "bg-green-500/20 text-green-300" :
                      "bg-red-500/20 text-red-300"
                    }>
                      {isFacePendingBucket(selectedFaceSubmission) ? 'Pending' : isFaceApproved(selectedFaceSubmission) ? 'Approved' : 'Rejected'}
                    </Badge>
                  </div>
                </div>
              </div>
              
              <FaceSubmissionModalMedia submission={selectedFaceSubmission} />


              {isFacePendingBucket(selectedFaceSubmission) && (
                <div className="flex gap-2">
                  <Button className="flex-1 bg-green-500 hover:bg-green-600" onClick={() => { setFaceActionType('approve'); setShowFaceActionModal(true); }}>
                    <CheckCircle className="w-4 h-4 mr-2" />
                    Approve
                  </Button>
                  <Button className="flex-1 bg-red-500 hover:bg-red-600" onClick={() => { setFaceActionType('reject'); setShowFaceActionModal(true); }}>
                    <XCircle className="w-4 h-4 mr-2" />
                    Reject
                  </Button>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Face Action Modal */}
      <Dialog open={showFaceActionModal} onOpenChange={setShowFaceActionModal}>
        <DialogContent className="bg-slate-900 border-slate-700">
          <DialogHeader>
            <DialogTitle className="text-white">
              {faceActionType === 'approve' ? '✅ Confirm Approval' : '❌ Confirm Rejection'}
            </DialogTitle>
          </DialogHeader>
          {faceActionType === 'approve' && (
            <div className="space-y-2">
              <label className="text-sm font-medium text-slate-300">Approve as:</label>
              <div className="flex gap-3">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="radio" name="approveAs" value="user" checked={faceApproveAs === 'user'} onChange={() => setFaceApproveAs('user')} />
                  <span className="text-sm text-slate-300">👤 User</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="radio" name="approveAs" value="host" checked={faceApproveAs === 'host'} onChange={() => setFaceApproveAs('host')} />
                  <span className="text-sm text-slate-300">🎙️ Host</span>
                </label>
              </div>
            </div>
          )}
          {faceActionType === 'reject' && (
            <Textarea
              placeholder="Reason for rejection..."
              value={faceActionReason}
              onChange={(e) => setFaceActionReason(e.target.value)}
              className="bg-slate-800 border-slate-600 text-white"
            />
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowFaceActionModal(false)}>Cancel</Button>
            <Button
              className={faceActionType === 'approve' ? "bg-green-500 hover:bg-green-600" : "bg-red-500 hover:bg-red-600"}
              onClick={handleFaceAction}
              disabled={actionLoading}
            >
              {actionLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : faceActionType === 'approve' ? 'Approve' : 'Reject'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Blocked User Detail Dialog */}
      <Dialog open={showBlockedUserDetailDialog} onOpenChange={setShowBlockedUserDetailDialog}>
        <DialogContent className="bg-slate-900 border-slate-700 max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-white font-bold flex items-center gap-2">
              <Ban className="w-5 h-5 text-red-400" />
              Banned User Details
            </DialogTitle>
          </DialogHeader>
          {loadingUserDetails ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-10 h-10 animate-spin text-purple-500" />
            </div>
          ) : selectedBlockedUser ? (
            <div className="space-y-6">
              {/* User Profile Section */}
              <div className="flex items-center gap-4 p-4 bg-slate-800 rounded-xl border border-slate-700">
                <Avatar className="w-20 h-20 border-3 border-red-500">
                  <AvatarImage src={selectedBlockedUser.avatar_url || undefined} />
                  <AvatarFallback className="bg-red-500/20 text-red-400 text-2xl">
                    {selectedBlockedUser.display_name?.charAt(0) || "U"}
                  </AvatarFallback>
                </Avatar>
                <div className="flex-1">
                  <p className="font-bold text-xl text-white">{selectedBlockedUser.display_name}</p>
                  <p className="text-slate-400">@{selectedBlockedUser.username || selectedBlockedUser.id.slice(0, 8)}</p>
                  <div className="flex flex-wrap gap-2 mt-2">
                    {selectedBlockedUser.app_uid && (
                      <Badge className="bg-purple-500/20 text-purple-300 border-purple-500/30">{selectedBlockedUser.app_uid}</Badge>
                    )}
                    <Badge className="bg-red-500/20 text-red-300 border-red-500/30">
                      <Ban className="w-3 h-3 mr-1" />Banned
                    </Badge>
                  </div>
                </div>
              </div>

              {/* Block Reason - Highlighted */}
              <Card className="bg-red-500/10 border-red-500/30">
                <CardContent className="p-4">
                  <h3 className="font-bold text-red-400 mb-2 flex items-center gap-2">
                    <AlertTriangle className="w-5 h-5" />
                    Ban Reason
                  </h3>
                  <p className="text-slate-200 text-lg">{selectedBlockedUser.blocked_reason || "No reason specified"}</p>
                  {selectedBlockedUser.blocked_at && (
                    <p className="text-red-400 text-sm mt-2 flex items-center gap-1">
                      <Clock className="w-4 h-4" />
                      Banned: {formatDistanceToNow(new Date(selectedBlockedUser.blocked_at), { addSuffix: true })}
                    </p>
                  )}
                </CardContent>
              </Card>

              {/* User Information Grid */}
              <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                <div className="bg-slate-800 rounded-lg p-3 border border-slate-700">
                  <p className="text-slate-400 text-xs uppercase">Email</p>
                  <p className="text-slate-200 font-medium truncate">{selectedBlockedUser.email || "-"}</p>
                </div>
                <div className="bg-slate-800 rounded-lg p-3 border border-slate-700">
                  <p className="text-slate-400 text-xs uppercase">Phone</p>
                  <p className="text-slate-200 font-medium">{selectedBlockedUser.phone || "-"}</p>
                </div>
                <div className="bg-slate-800 rounded-lg p-3 border border-slate-700">
                  <p className="text-slate-400 text-xs uppercase">Gender</p>
                  <p className="text-slate-200 font-medium">{selectedBlockedUser.gender || "-"}</p>
                </div>
                <div className="bg-slate-800 rounded-lg p-3 border border-slate-700">
                  <p className="text-slate-400 text-xs uppercase">Country</p>
                  <p className="text-slate-200 font-medium">{selectedBlockedUser.country_name || "-"}</p>
                </div>
                <div className="bg-amber-500/10 rounded-lg p-3 border border-amber-500/30">
                  <p className="text-amber-400 text-xs uppercase">Diamonds</p>
                  <p className="text-amber-300 font-bold">{selectedBlockedUser.coins?.toLocaleString() || 0}</p>
                </div>
                <div className="bg-purple-500/10 rounded-lg p-3 border border-purple-500/30">
                  <p className="text-purple-400 text-xs uppercase">Level</p>
                  <p className="text-purple-300 font-bold">Lv. {selectedBlockedUser.user_level || 0}</p>
                </div>
                <div className="bg-green-500/10 rounded-lg p-3 border border-green-500/30">
                  <p className="text-green-400 text-xs uppercase">Total Earnings</p>
                  <p className="text-green-300 font-bold">{selectedBlockedUser.total_earnings?.toLocaleString() || 0}</p>
                </div>
                <div className="bg-blue-500/10 rounded-lg p-3 border border-blue-500/30">
                  <p className="text-blue-400 text-xs uppercase">Total Spent</p>
                  <p className="text-blue-300 font-bold">{selectedBlockedUser.total_consumption?.toLocaleString() || 0}</p>
                </div>
                <div className="bg-slate-800 rounded-lg p-3 border border-slate-700">
                  <p className="text-slate-400 text-xs uppercase">Auth Provider</p>
                  <p className="text-slate-200 font-medium">{selectedBlockedUser.auth_provider || "email"}</p>
                </div>
              </div>

              {/* Stats */}
              <div className="grid grid-cols-3 gap-4">
                <div className="text-center p-3 bg-pink-500/10 rounded-lg border border-pink-500/30">
                  <p className="text-2xl font-bold text-pink-400">{selectedBlockedUser.followers_count || 0}</p>
                  <p className="text-xs text-pink-300">Followers</p>
                </div>
                <div className="text-center p-3 bg-blue-500/10 rounded-lg border border-blue-500/30">
                  <p className="text-2xl font-bold text-blue-400">{selectedBlockedUser.following_count || 0}</p>
                  <p className="text-xs text-blue-300">Following</p>
                </div>
                <div className="text-center p-3 bg-amber-500/10 rounded-lg border border-amber-500/30">
                  <p className="text-2xl font-bold text-amber-400">{selectedBlockedUser.total_gifts_received?.toLocaleString() || 0}</p>
                  <p className="text-xs text-amber-300">Gifts Received</p>
                </div>
              </div>

              {/* Agency Info */}
              {selectedBlockedUser.agency && (
                <div className="bg-purple-500/10 rounded-lg p-4 border border-purple-500/30">
                  <h3 className="font-bold text-purple-300 mb-2 flex items-center gap-2">
                    <Building2 className="w-5 h-5" />
                    Previous Agency
                  </h3>
                  <p className="text-slate-200">{selectedBlockedUser.agency.name} ({selectedBlockedUser.agency.agency_code})</p>
                </div>
              )}

              {/* Account Dates */}
              <div className="flex flex-wrap gap-4 text-sm text-slate-400">
                <span className="flex items-center gap-1">
                  <Calendar className="w-4 h-4" />
                  Joined: {selectedBlockedUser.created_at ? new Date(selectedBlockedUser.created_at).toLocaleDateString('en-US') : "-"}
                </span>
                <span className="flex items-center gap-1">
                  <Clock className="w-4 h-4" />
                  Last Login: {selectedBlockedUser.last_sign_in ? formatDistanceToNow(new Date(selectedBlockedUser.last_sign_in), { addSuffix: true }) : "-"}
                </span>
              </div>
            </div>
          ) : (
            <p className="text-slate-400 text-center py-8">User data not found</p>
          )}
          <DialogFooter className="flex flex-col sm:flex-row gap-2 mt-6">
            <Button
              variant="destructive"
              className="bg-red-600 hover:bg-red-700"
              onClick={() => setShowDeleteConfirmDialog(true)}
              disabled={!selectedBlockedUser}
            >
              <Trash2 className="w-4 h-4 mr-2" />
              Delete Account
            </Button>
            <div className="flex-1" />
            <Button variant="outline" onClick={() => setShowBlockedUserDetailDialog(false)}>Close</Button>
            <Button
              className="bg-green-500 hover:bg-green-600 text-white"
              onClick={() => selectedBlockedUser && handleUnblockUser(selectedBlockedUser.id)}
            >
              <Unlock className="w-4 h-4 mr-2" />
              Unban
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog open={showDeleteConfirmDialog} onOpenChange={setShowDeleteConfirmDialog}>
        <DialogContent className="bg-slate-900 border-slate-700">
          <DialogHeader>
            <DialogTitle className="text-red-400 font-bold flex items-center gap-2">
              <AlertTriangle className="w-6 h-6" />
              Delete Account Confirmation
            </DialogTitle>
            <DialogDescription className="text-slate-400">
              Are you sure you want to permanently delete this account?
            </DialogDescription>
          </DialogHeader>
          <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-4 my-4">
            <p className="text-red-400 font-semibold mb-2">⚠️ Warning:</p>
            <ul className="text-sm text-red-300 list-disc ml-5 space-y-1">
              <li>This action cannot be undone</li>
              <li>All data will be permanently deleted</li>
              <li>All gifts, calls, and chat history will be removed</li>
              <li>Followers and following data will be removed</li>
            </ul>
          </div>
          {selectedBlockedUser && (
            <div className="flex items-center gap-3 p-3 bg-slate-800 rounded-lg">
              <Avatar className="w-10 h-10">
                <AvatarImage src={selectedBlockedUser.avatar_url} />
                <AvatarFallback className="bg-red-500/20 text-red-400">
                  {selectedBlockedUser.display_name?.charAt(0) || "U"}
                </AvatarFallback>
              </Avatar>
              <div>
                <p className="font-medium text-white">{selectedBlockedUser.display_name}</p>
                <p className="text-sm text-slate-400">{selectedBlockedUser.app_uid || selectedBlockedUser.email}</p>
              </div>
            </div>
          )}
          <DialogFooter className="mt-4">
            <Button variant="outline" onClick={() => setShowDeleteConfirmDialog(false)}>Cancel</Button>
            <Button
              variant="destructive"
              className="bg-red-600 hover:bg-red-700"
              onClick={handleDeleteUser}
              disabled={deletingUser}
            >
              {deletingUser ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Trash2 className="w-4 h-4 mr-2" />}
              Yes, Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
