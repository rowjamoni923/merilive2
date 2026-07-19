import { useState, useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import {
  ArrowLeft,
  Link as LinkIcon,
  Copy,
  Users,
  Search,
  Loader2,
  CheckCircle2,
  XCircle,
  Share2,
  Clock,
  UserCheck,
  Bell
} from "lucide-react";
import { PageSkeleton } from "@/components/common/PageSkeleton";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import AvatarWithFrame from "@/components/common/AvatarWithFrame";
import { enhanceThumbnail } from "@/utils/enhanceThumbnail";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { recordClientError } from "@/utils/clientErrorLog";
import { usePersistedCache } from "@/hooks/usePersistedCache";

interface HostProfile {
  id: string;
  display_name: string | null;
  avatar_url: string | null;
  app_uid: string | null;
  user_level: number | null;
  total_earnings: number | null;
  is_host: boolean | null;
  is_online: boolean | null;
  bio: string | null;
}

interface AgencyHost {
  id: string;
  host_id: string;
  joined_at: string;
  status: string;
  host: HostProfile;
}

const AgencyHostManagement = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { toast } = useToast();
  // Pkg421: persist agency + hosts + pendingHosts so revisits render instantly.
  const [agency, setAgency, hadAgencyCache] = usePersistedCache<any>('agencyHostMgmt:agency', null);
  const [hosts, setHosts, hadHostsCache] = usePersistedCache<AgencyHost[]>('agencyHostMgmt:hosts', null);
  const [pendingHosts, setPendingHosts, hadPendingCache] = usePersistedCache<AgencyHost[]>('agencyHostMgmt:pending', null);
  const [loading, setLoading] = useState(!(hadAgencyCache && (hadHostsCache || hadPendingCache)));
  const [activeTab, setActiveTab] = useState("pending");
  const [filterOnline, setFilterOnline] = useState(false);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");

  // Invitation Link
  const [inviteLink, setInviteLink] = useState("");

  // Confirmation dialogs
  const [approveDialog, setApproveDialog] = useState<AgencyHost | null>(null);
  const [rejectDialog, setRejectDialog] = useState<AgencyHost | null>(null);
  const [processingId, setProcessingId] = useState<string | null>(null);

  useEffect(() => {
    const filter = searchParams.get('filter');
    if (filter === 'online') {
      setFilterOnline(true);
      setActiveTab("hosts");
    }
    fetchAgencyData();

    // Zero-refresh policy: no visibility/tab-return refetch. Mutations update
    // this screen inline; admin/app-sync pushes handle cross-screen changes.
    return undefined;

  }, [searchParams]);

  const fetchAgencyData = async () => {
    if (!agency && !hosts && !pendingHosts) setLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      
      if (!user) {
        navigate("/auth");
        return;
      }

      setCurrentUserId(user.id);

      // First check if user owns an agency (agencies table has owner_id)
      // This is the correct way since profiles.agency_id can be null for owners
      const { data: ownedAgency } = await supabase
        .from("agencies")
        .select("*")
        .eq("owner_id", user.id)
        .maybeSingle();

      if (!ownedAgency) {
        // User doesn't own any agency
        navigate("/agency");
        return;
      }

      setAgency(ownedAgency);
      
      // Use centralized share links - always production domain
      const { generateAgencyJoinLink } = await import('@/utils/shareLinks');
      setInviteLink(generateAgencyJoinLink(ownedAgency.agency_code));

      // Get all agency hosts including pending
      const { data: hostsData } = await supabase
        .from("agency_hosts")
        .select(`
          *,
          host:profiles!agency_hosts_host_id_fkey(
            id, display_name, avatar_url, app_uid, user_level, total_earnings, is_host, is_online, bio
          )
        `)
        .eq("agency_id", ownedAgency.id)
        .order("joined_at", { ascending: false });

      const allHosts = (hostsData || []) as unknown as AgencyHost[];
      setHosts(allHosts.filter(h => h.status === 'active'));
      setPendingHosts(allHosts.filter(h => h.status === 'pending'));
    } catch (error) {
      console.error('[AgencyHostManagement] Error fetching data:', error);
      recordClientError({ label: "AgencyHostManagement.allHosts", message: error instanceof Error ? error.message : String(error) });
    } finally {
      setLoading(false);
    }
  };

  const approveHost = async (hostData: AgencyHost) => {
    if (!agency || !currentUserId) return;

    setProcessingId(hostData.host_id);
    // Optimistic: instantly remove from pending, add to hosts
    setPendingHosts(prev => (prev ?? []).filter(h => h.id !== hostData.id));
    setHosts(prev => [{ ...hostData, status: 'active' }, ...(prev ?? [])]);
    setApproveDialog(null);

    try {
      const { data, error } = await supabase.rpc('approve_host_request', {
        _agency_id: agency.id,
        _host_id: hostData.host_id,
        _approver_id: currentUserId
      });

      if (error) throw error;

      // approve_host_request returns boolean (true on success)
      const ok = data === true
        || (typeof data === 'object' && data !== null && (data as { success?: boolean }).success === true);
      if (ok) {
        supabase.functions.invoke('send-app-notification', {
          body: {
            userId: hostData.host_id,
            templateKey: 'agency_request_approved',
            variables: { agency_name: agency.name },
            type: 'agency'
          }
        }).catch(console.error);

        toast({ title: "Host Approved", description: `${hostData.host?.display_name || 'Host'} approved` });
      } else {
        throw new Error("Failed to approve host");
      }
    } catch (error: any) {
      // Rollback on failure
      setPendingHosts(prev => [...(prev ?? []), hostData]);
      setHosts(prev => (prev ?? []).filter(h => h.id !== hostData.id));
      toast({ title: "Error", description: error.message || "Failed to approve host", variant: "destructive" });
    } finally {
      setProcessingId(null);
    }
  };

  const rejectHost = async (hostData: AgencyHost) => {
    if (!agency || !currentUserId) return;

    setProcessingId(hostData.host_id);
    // Optimistic: instantly remove from pending
    setPendingHosts(prev => (prev ?? []).filter(h => h.id !== hostData.id));
    setRejectDialog(null);

    try {
      const { data, error } = await supabase.rpc('reject_host_request', {
        _agency_id: agency.id,
        _host_id: hostData.host_id,
        _rejector_id: currentUserId
      });

      if (error) throw error;

      const result = typeof data === 'object' && data !== null ? data as { success?: boolean; error?: string } : null;
      if (result?.success) {
        supabase.functions.invoke('send-app-notification', {
          body: {
            userId: hostData.host_id,
            templateKey: 'agency_request_rejected',
            variables: { agency_name: agency.name },
            type: 'agency'
          }
        }).catch(console.error);

        toast({ title: "Request Rejected", description: `${hostData.host?.display_name || 'Host'}'s request rejected` });
      } else {
        throw new Error(result?.error || "Failed to reject request");
      }
    } catch (error: any) {
      // Rollback on failure
      setPendingHosts(prev => [...(prev ?? []), hostData]);
      toast({ title: "Error", description: error.message || "Failed to reject request", variant: "destructive" });
    } finally {
      setProcessingId(null);
    }
  };

  const copyLink = () => {
    navigator.clipboard.writeText(inviteLink);
    toast({ title: "Link Copied" });
  };

  const shareLink = async () => {
    if (navigator.share) {
      try {
        await navigator.share({
          title: `${agency?.name} - Join Our Agency`,
          text: `Join our agency!`,
          url: inviteLink,
        });
      } catch (error) {
        copyLink();
      }
    } else {
      copyLink();
    }
  };

  // Filter hosts by search
  const filteredHosts = (hosts ?? []).filter(h => {
    const matchesSearch = !searchQuery || 
      h.host?.display_name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      h.host?.app_uid?.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesOnline = !filterOnline || h.host?.is_online;
    return matchesSearch && matchesOnline;
  });

  if (loading) {
    return <PageSkeleton className="fixed inset-0 flex flex-col bg-background overflow-hidden" rows={6} hero />;
  }

  return (
    <div className="fixed inset-0 flex flex-col bg-gradient-to-b from-[#FFFBF2] via-[#FAF5EA] to-[#F5EFDF]">
      {/* Premium 3D Header */}
      <header
        className="flex-shrink-0 sticky top-0 z-10 bg-white/90 backdrop-blur-xl safe-area-top"
        style={{ boxShadow: '0 6px 18px -10px rgba(217,119,6,0.32), inset 0 -1px 0 rgba(217,182,107,0.4)' }}
      >
        <div className="flex items-center gap-3 px-4 py-3">
          <button
            onClick={() => navigate(-1)}
            className="h-9 w-9 rounded-full bg-white flex items-center justify-center transition-all hover:-translate-y-0.5 active:translate-y-0"
            style={{ boxShadow: '0 4px 12px -4px rgba(146,64,14,0.25), inset 0 1px 0 rgba(255,255,255,0.95), 0 0 0 1px rgba(217,182,107,0.45)' }}
          >
            <ArrowLeft className="w-5 h-5 text-slate-700" />
          </button>
          <div className="flex items-center gap-2.5 flex-1 min-w-0">
            <div
              className="w-10 h-10 rounded-2xl bg-gradient-to-br from-sky-500 to-indigo-600 flex items-center justify-center shrink-0"
              style={{ boxShadow: '0 10px 20px -8px rgba(59,130,246,0.55), inset 0 1px 0 rgba(255,255,255,0.4), inset 0 -2px 0 rgba(30,58,138,0.25)' }}
            >
              <Users className="w-5 h-5 text-white" style={{ filter: 'drop-shadow(0 1px 2px rgba(0,0,0,0.25))' }} />
            </div>
            <div className="min-w-0">
              <h1 className="text-slate-900 font-bold text-base leading-tight tracking-tight truncate">Host Management</h1>
              <p className="text-slate-500 text-[10px] truncate">{agency?.name}</p>
            </div>
          </div>
        </div>
      </header>

      {/* Scrollable Content */}
      <div className="flex-1 overflow-y-auto overscroll-contain" style={{ WebkitOverflowScrolling: 'touch', paddingBottom: 'var(--content-bottom-padding)' }}>
        <div className="p-4 space-y-4">
        {/* Agency Info */}
        <div className="bg-white rounded-2xl p-4 border border-slate-200" style={{ boxShadow: '0 8px 20px -8px rgba(15,23,42,0.12), 0 2px 6px -2px rgba(15,23,42,0.06), inset 0 1px 0 rgba(255,255,255,0.8)' }}>
          <div className="flex items-center justify-between mb-3">
            <div>
              <p className="text-slate-900 font-semibold">{agency?.name}</p>
              <p className="text-slate-500 text-sm">Code: {agency?.agency_code}</p>
            </div>
            <div className="text-right">
              <p className="text-2xl font-bold text-primary">{(hosts ?? []).length}</p>
              <p className="text-slate-500 text-xs">Total Hosts</p>
            </div>
          </div>

          {/* Pending notification */}
          {(pendingHosts ?? []).length > 0 && (
            <div 
              className="flex items-center gap-2 p-2 bg-amber-50 border border-amber-200 rounded-lg cursor-pointer"
              onClick={() => setActiveTab("pending")}
            >
              <Bell className="w-4 h-4 text-amber-600" />
              <span className="text-amber-700 text-sm font-medium">
                {(pendingHosts ?? []).length} Pending Request{(pendingHosts ?? []).length > 1 ? 's' : ''}
              </span>
            </div>
          )}
        </div>

        {/* Invite Link Card */}
        <div className="relative overflow-hidden bg-gradient-to-br from-indigo-600 via-purple-600 to-fuchsia-600 rounded-2xl p-4" style={{ boxShadow: '0 12px 28px -10px rgba(99,102,241,0.5), 0 4px 10px -2px rgba(168,85,247,0.35), inset 0 1px 0 rgba(255,255,255,0.25)' }}>
          <div className="absolute inset-0 bg-gradient-to-b from-white/15 to-transparent pointer-events-none" />
          <div className="relative">
            <div className="flex items-center gap-2 mb-3">
              <LinkIcon className="w-5 h-5 text-white drop-shadow" />
              <span className="text-white font-semibold drop-shadow-sm">Host Invite Link</span>
            </div>
            <div className="bg-white/95 rounded-lg p-3 mb-3 border border-white/40" style={{ boxShadow: 'inset 0 1px 2px rgba(15,23,42,0.06)' }}>
              <p className="text-slate-700 text-sm break-all">{inviteLink}</p>
            </div>
            <div className="flex gap-2">
              <Button
                onClick={copyLink}
                className="flex-1 bg-white/15 hover:bg-white/25 text-white border border-white/30 backdrop-blur-sm"
              >
                <Copy className="w-4 h-4 mr-2" />
                Copy
              </Button>
              <Button
                onClick={shareLink}
                className="flex-1 bg-white text-purple-700 hover:bg-white/90"
              >
                <Share2 className="w-4 h-4 mr-2" />
                Share
              </Button>
            </div>
          </div>
        </div>

        {/* Tabs */}
        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="w-full bg-white border border-slate-200 p-1 rounded-xl" style={{ boxShadow: '0 2px 8px -2px rgba(15,23,42,0.08)' }}>
            <TabsTrigger 
              value="pending" 
              className="flex-1 data-[state=active]:bg-amber-500 data-[state=active]:text-white data-[state=active]:shadow text-slate-600 rounded-lg"
            >
              Pending ({(pendingHosts ?? []).length})
            </TabsTrigger>
            <TabsTrigger 
              value="hosts" 
              className="flex-1 data-[state=active]:bg-primary data-[state=active]:text-white data-[state=active]:shadow text-slate-600 rounded-lg"
            >
              Hosts ({(hosts ?? []).length})
            </TabsTrigger>
          </TabsList>

          {/* Pending Tab */}
          <TabsContent value="pending" className="mt-4 space-y-3">
            {(pendingHosts ?? []).length === 0 ? (
              <div className="text-center py-10">
                <Clock className="w-12 h-12 text-slate-800/20 mx-auto mb-3" />
                <p className="text-slate-500">No pending requests</p>
              </div>
            ) : (
              (pendingHosts ?? []).map((hostData) => (
                <div
                  key={hostData.id}
                  className="bg-white rounded-2xl p-4 border border-slate-200"
                  style={{ boxShadow: '0 6px 16px -8px rgba(15,23,42,0.1), 0 2px 4px -2px rgba(15,23,42,0.06)' }}
                >
                  <div className="flex items-center gap-3 mb-3">
                <AvatarWithFrame
                  src={enhanceThumbnail(hostData.host?.avatar_url || undefined, { width: 96, quality: 82})}
                  name={(hostData.host as any)?.display_name || (hostData.host as any)?.agency_name || (hostData.host as any)?.name || "U"}
                  level={1}
                  size="sm"
                  showFrame={true}
                  showAnimation={false}
                />
                    <div className="flex-1">
                      <p className="text-slate-900 font-medium">{hostData.host?.display_name || "Unknown"}</p>
                      <p className="text-slate-500 text-sm">UID: {hostData.host?.app_uid || "N/A"}</p>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      onClick={() => setApproveDialog(hostData)}
                      disabled={processingId === hostData.host_id}
                      className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white"
                    >
                      {processingId === hostData.host_id ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <>
                          <CheckCircle2 className="w-4 h-4 mr-2" />
                          Approve
                        </>
                      )}
                    </Button>
                    <Button
                      onClick={() => setRejectDialog(hostData)}
                      disabled={processingId === hostData.host_id}
                      className="flex-1 bg-rose-600 hover:bg-rose-700 text-white"
                    >
                      <XCircle className="w-4 h-4 mr-2" />
                      Reject
                    </Button>
                  </div>
                </div>
              ))
            )}
          </TabsContent>

          {/* Hosts Tab */}
          <TabsContent value="hosts" className="mt-4 space-y-3">
            {/* Search & Filter */}
            <div className="flex gap-2">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <Input
                  placeholder="Search by name or UID..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-10 bg-white border-slate-200 text-slate-900"
                />
              </div>
              <Button
                variant={filterOnline ? "default" : "outline"}
                onClick={() => setFilterOnline(!filterOnline)}
                className={filterOnline ? "bg-emerald-600 hover:bg-emerald-700 text-white" : "bg-white border-slate-200 text-slate-800"}
              >
                <UserCheck className="w-4 h-4" />
              </Button>
            </div>

            {filteredHosts.length === 0 ? (
              <div className="text-center py-10">
                <Users className="w-12 h-12 text-slate-300 mx-auto mb-3" />
                <p className="text-slate-500">
                  {searchQuery || filterOnline ? "No hosts found" : "No hosts in agency"}
                </p>
              </div>
            ) : (
              filteredHosts.map((hostData) => (
                <div
                  key={hostData.id}
                  className="bg-white rounded-2xl p-4 border border-slate-200 cursor-pointer hover:-translate-y-0.5 transition-transform"
                  style={{ boxShadow: '0 6px 16px -8px rgba(15,23,42,0.1), 0 2px 4px -2px rgba(15,23,42,0.06)' }}
                  onClick={() => navigate(`/profile/${hostData.host_id}`)}
                >
                  <div className="flex items-center gap-3">
                    <div className="relative">
                <AvatarWithFrame
                  src={enhanceThumbnail(hostData.host?.avatar_url || undefined, { width: 96, quality: 82})}
                  name={(hostData.host as any)?.display_name || (hostData.host as any)?.agency_name || (hostData.host as any)?.name || "U"}
                  level={1}
                  size="sm"
                  showFrame={true}
                  showAnimation={false}
                />
                      {hostData.host?.is_online && (
                        <div className="absolute -bottom-0.5 -right-0.5 w-3 h-3 bg-emerald-500 rounded-full border-2 border-white" />
                      )}
                    </div>
                    <div className="flex-1">
                      <p className="text-slate-900 font-medium">{hostData.host?.display_name || "Unknown"}</p>
                      <p className="text-slate-500 text-sm">UID: {hostData.host?.app_uid || "N/A"}</p>
                    </div>
                    <Badge className={hostData.host?.is_online ? "bg-emerald-100 text-emerald-700 border border-emerald-200" : "bg-slate-100 text-slate-600 border border-slate-200"}>
                      {hostData.host?.is_online ? "Online" : "Offline"}
                    </Badge>
                  </div>
                </div>
              ))
            )}
          </TabsContent>
        </Tabs>
      </div>

      {/* Approve Dialog */}
      <AlertDialog open={!!approveDialog} onOpenChange={() => setApproveDialog(null)}>
        <AlertDialogContent className="bg-white/90 border-warning-200/60">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-slate-800">Approve Host</AlertDialogTitle>
            <AlertDialogDescription className="text-slate-500">
              Do you want to add {approveDialog?.host?.display_name} to the agency?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="bg-white/5 border-warning-200/60 text-slate-800">Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => approveDialog && approveHost(approveDialog)}
              className="bg-success-600 hover:bg-success-700"
            >
              Approve
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Reject Dialog */}
      <AlertDialog open={!!rejectDialog} onOpenChange={() => setRejectDialog(null)}>
        <AlertDialogContent className="bg-white/90 border-warning-200/60">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-slate-800">Reject Request</AlertDialogTitle>
            <AlertDialogDescription className="text-slate-500">
              Do you want to reject {rejectDialog?.host?.display_name}'s request?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="bg-white/5 border-warning-200/60 text-slate-800">No</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => rejectDialog && rejectHost(rejectDialog)}
              className="bg-danger-600 hover:bg-danger-700"
            >
              Reject
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      </div>
    </div>
  );
};

export default AgencyHostManagement;
