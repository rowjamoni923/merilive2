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
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
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
  const [loading, setLoading] = useState(true);
  const [agency, setAgency] = useState<any>(null);
  const [hosts, setHosts] = useState<AgencyHost[]>([]);
  const [pendingHosts, setPendingHosts] = useState<AgencyHost[]>([]);
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

    // Set up realtime subscription
    const channel = supabase
      .channel('agency-hosts-changes')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'agency_hosts' },
        () => fetchAgencyData()
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [searchParams]);

  const fetchAgencyData = async () => {
    setLoading(true);
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
    setPendingHosts(prev => prev.filter(h => h.id !== hostData.id));
    setHosts(prev => [{ ...hostData, status: 'active' }, ...prev]);
    setApproveDialog(null);

    try {
      const { data, error } = await supabase.rpc('approve_host_request', {
        _agency_id: agency.id,
        _host_id: hostData.host_id,
        _approver_id: currentUserId
      });

      if (error) throw error;

      if (data) {
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
      setPendingHosts(prev => [...prev, hostData]);
      setHosts(prev => prev.filter(h => h.id !== hostData.id));
      toast({ title: "Error", description: error.message || "Failed to approve host", variant: "destructive" });
    } finally {
      setProcessingId(null);
    }
  };

  const rejectHost = async (hostData: AgencyHost) => {
    if (!agency || !currentUserId) return;

    setProcessingId(hostData.host_id);
    // Optimistic: instantly remove from pending
    setPendingHosts(prev => prev.filter(h => h.id !== hostData.id));
    setRejectDialog(null);

    try {
      const { data, error } = await supabase.rpc('reject_host_request', {
        _agency_id: agency.id,
        _host_id: hostData.host_id,
        _rejector_id: currentUserId
      });

      if (error) throw error;

      if (data) {
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
        throw new Error("Failed to reject request");
      }
    } catch (error: any) {
      // Rollback on failure
      setPendingHosts(prev => [...prev, hostData]);
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
  const filteredHosts = hosts.filter(h => {
    const matchesSearch = !searchQuery || 
      h.host?.display_name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      h.host?.app_uid?.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesOnline = !filterOnline || h.host?.is_online;
    return matchesSearch && matchesOnline;
  });

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-[#FFFBF2] to-[#F5EFDF] flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="fixed inset-0 flex flex-col bg-gradient-to-b from-[#FFFBF2] to-[#F5EFDF]">
      {/* Header */}
      <header className="flex-shrink-0 sticky top-0 z-10 bg-white/90 backdrop-blur border-b border-amber-200/60 px-4 py-3 safe-area-top">
        <div className="flex items-center gap-3">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => navigate(-1)}
            className="text-slate-800"
          >
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <div className="flex-1">
            <h1 className="text-lg font-bold text-slate-800">Host Management</h1>
            <p className="text-xs text-slate-500">{agency?.name}</p>
          </div>
        </div>
      </header>

      {/* Scrollable Content */}
      <div className="flex-1 overflow-y-auto overscroll-contain" style={{ WebkitOverflowScrolling: 'touch', paddingBottom: 'var(--content-bottom-padding)' }}>
        <div className="p-4 space-y-4">
        {/* Agency Info */}
        <div className="bg-white/5 rounded-xl p-4 border border-amber-200/60">
          <div className="flex items-center justify-between mb-3">
            <div>
              <p className="text-slate-800 font-semibold">{agency?.name}</p>
              <p className="text-slate-500 text-sm">Code: {agency?.agency_code}</p>
            </div>
            <div className="text-right">
              <p className="text-2xl font-bold text-primary">{hosts.length}</p>
              <p className="text-slate-500 text-xs">Total Hosts</p>
            </div>
          </div>

          {/* Pending notification */}
          {pendingHosts.length > 0 && (
            <div 
              className="flex items-center gap-2 p-2 bg-yellow-500/10 rounded-lg cursor-pointer"
              onClick={() => setActiveTab("pending")}
            >
              <Bell className="w-4 h-4 text-yellow-400" />
              <span className="text-yellow-400 text-sm font-medium">
                {pendingHosts.length} Pending Request{pendingHosts.length > 1 ? 's' : ''}
              </span>
            </div>
          )}
        </div>

        {/* Invite Link Card */}
        <div className="bg-gradient-to-r from-primary/10 to-purple-500/10 rounded-xl p-4 border border-primary/20">
          <div className="flex items-center gap-2 mb-3">
            <LinkIcon className="w-5 h-5 text-primary" />
            <span className="text-slate-800 font-medium">Host Invite Link</span>
          </div>
          <div className="bg-white/80 rounded-lg p-3 mb-3">
            <p className="text-slate-600 text-sm break-all">{inviteLink}</p>
          </div>
          <div className="flex gap-2">
            <Button
              onClick={copyLink}
              className="flex-1 bg-white/10 hover:bg-white/20 text-slate-800"
            >
              <Copy className="w-4 h-4 mr-2" />
              Copy
            </Button>
            <Button
              onClick={shareLink}
              className="flex-1 bg-primary hover:bg-primary/90"
            >
              <Share2 className="w-4 h-4 mr-2" />
              Share
            </Button>
          </div>
        </div>

        {/* Tabs */}
        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="w-full bg-white/5 border border-amber-200/60">
            <TabsTrigger 
              value="pending" 
              className="flex-1 data-[state=active]:bg-yellow-500/20 data-[state=active]:text-yellow-400 text-slate-600"
            >
              Pending ({pendingHosts.length})
            </TabsTrigger>
            <TabsTrigger 
              value="hosts" 
              className="flex-1 data-[state=active]:bg-primary/20 data-[state=active]:text-primary text-slate-600"
            >
              Hosts ({hosts.length})
            </TabsTrigger>
          </TabsList>

          {/* Pending Tab */}
          <TabsContent value="pending" className="mt-4 space-y-3">
            {pendingHosts.length === 0 ? (
              <div className="text-center py-10">
                <Clock className="w-12 h-12 text-slate-800/20 mx-auto mb-3" />
                <p className="text-slate-500">No pending requests</p>
              </div>
            ) : (
              pendingHosts.map((hostData) => (
                <div
                  key={hostData.id}
                  className="bg-white/5 rounded-xl p-4 border border-yellow-500/20"
                >
                  <div className="flex items-center gap-3 mb-3">
                    <Avatar className="w-12 h-12 border-2 border-yellow-500/30">
                      <AvatarImage src={hostData.host?.avatar_url || undefined} />
                      <AvatarFallback className="bg-yellow-500/20 text-yellow-400">
                        {hostData.host?.display_name?.charAt(0) || "H"}
                      </AvatarFallback>
                    </Avatar>
                    <div className="flex-1">
                      <p className="text-slate-800 font-medium">{hostData.host?.display_name || "Unknown"}</p>
                      <p className="text-slate-500 text-sm">UID: {hostData.host?.app_uid || "N/A"}</p>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      onClick={() => setApproveDialog(hostData)}
                      disabled={processingId === hostData.host_id}
                      className="flex-1 bg-green-500/20 hover:bg-green-500/30 text-green-400"
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
                      className="flex-1 bg-red-500/20 hover:bg-red-500/30 text-red-400"
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
                  className="pl-10 bg-white/5 border-amber-200/60 text-slate-800"
                />
              </div>
              <Button
                variant={filterOnline ? "default" : "outline"}
                onClick={() => setFilterOnline(!filterOnline)}
                className={filterOnline ? "bg-green-500" : "bg-white/5 border-amber-200/60 text-slate-800"}
              >
                <UserCheck className="w-4 h-4" />
              </Button>
            </div>

            {filteredHosts.length === 0 ? (
              <div className="text-center py-10">
                <Users className="w-12 h-12 text-slate-800/20 mx-auto mb-3" />
                <p className="text-slate-500">
                  {searchQuery || filterOnline ? "No hosts found" : "No hosts in agency"}
                </p>
              </div>
            ) : (
              filteredHosts.map((hostData) => (
                <div
                  key={hostData.id}
                  className="bg-white/5 rounded-xl p-4 border border-amber-200/60"
                  onClick={() => navigate(`/profile/${hostData.host_id}`)}
                >
                  <div className="flex items-center gap-3">
                    <div className="relative">
                      <Avatar className="w-12 h-12">
                        <AvatarImage src={hostData.host?.avatar_url || undefined} />
                        <AvatarFallback className="bg-primary/20 text-primary">
                          {hostData.host?.display_name?.charAt(0) || "H"}
                        </AvatarFallback>
                      </Avatar>
                      {hostData.host?.is_online && (
                        <div className="absolute -bottom-0.5 -right-0.5 w-3 h-3 bg-green-500 rounded-full border-2 border-amber-200/60" />
                      )}
                    </div>
                    <div className="flex-1">
                      <p className="text-slate-800 font-medium">{hostData.host?.display_name || "Unknown"}</p>
                      <p className="text-slate-500 text-sm">UID: {hostData.host?.app_uid || "N/A"}</p>
                    </div>
                    <Badge className={hostData.host?.is_online ? "bg-green-500/20 text-green-400" : "bg-gray-500/20 text-gray-400"}>
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
        <AlertDialogContent className="bg-white/90 border-amber-200/60">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-slate-800">Approve Host</AlertDialogTitle>
            <AlertDialogDescription className="text-slate-500">
              Do you want to add {approveDialog?.host?.display_name} to the agency?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="bg-white/5 border-amber-200/60 text-slate-800">Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => approveDialog && approveHost(approveDialog)}
              className="bg-green-600 hover:bg-green-700"
            >
              Approve
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Reject Dialog */}
      <AlertDialog open={!!rejectDialog} onOpenChange={() => setRejectDialog(null)}>
        <AlertDialogContent className="bg-white/90 border-amber-200/60">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-slate-800">Reject Request</AlertDialogTitle>
            <AlertDialogDescription className="text-slate-500">
              Do you want to reject {rejectDialog?.host?.display_name}'s request?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="bg-white/5 border-amber-200/60 text-slate-800">No</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => rejectDialog && rejectHost(rejectDialog)}
              className="bg-red-600 hover:bg-red-700"
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
