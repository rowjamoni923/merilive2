import { useState, useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import {
  ArrowLeft,
  Building2,
  Users,
  Search,
  Loader2,
  CheckCircle2,
  XCircle,
  UserPlus,
  Clock,
  RefreshCw
} from "lucide-react";
import { PageSkeleton } from "@/components/common/PageSkeleton";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { enhanceThumbnail } from "@/utils/enhanceThumbnail";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { recordClientError } from "@/utils/clientErrorLog";

interface AgencyInfo {
  id: string;
  name: string;
  agency_code: string;
  level: string;
  total_hosts: number;
  owner_avatar?: string;
}

interface PendingRequest {
  agency_id: string;
  agency_name: string;
  agency_code: string;
  agency_level: string;
  agency_logo_url: string | null;
  status: string;
  requested_at: string;
}

const JoinAgency = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [searchParams] = useSearchParams();
  
  const [agencyCode, setAgencyCode] = useState(
    searchParams.get("code") || localStorage.getItem("meri_pending_referral") || ""
  );
  const [searching, setSearching] = useState(false);
  const [foundAgency, setFoundAgency] = useState<AgencyInfo | null>(null);
  const [agencyNotFound, setAgencyNotFound] = useState(false);
  const [joining, setJoining] = useState(false);
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [pendingRequest, setPendingRequest] = useState<PendingRequest | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    checkCurrentUser();
  }, []);

  const checkCurrentUser = async () => {
    setLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        navigate("/auth");
        return;
      }

      const { data: profile } = await supabase
        .from("profiles")
        .select("*, agency_id")
        .eq("id", user.id)
        .maybeSingle();

      if (profile?.agency_id) {
        toast({
          title: "Already in Agency",
          description: "You are already a member of an agency",
          variant: "destructive",
        });
        navigate("/agency");
        return;
      }

      setCurrentUser(profile);

      // Check for pending request
      const { data: requestData } = await supabase.rpc('get_host_agency_request', {
        _host_id: user.id
      });

      if (requestData && requestData.length > 0) {
        const request = requestData[0];
        setPendingRequest({
          agency_id: request.agency_id,
          agency_name: request.agency_name,
          agency_code: request.agency_code,
          agency_level: request.agency_level || 'A1',
          agency_logo_url: request.agency_logo_url,
          status: request.status,
          requested_at: request.requested_at
        });

        // If approved, redirect
        if (request.status === 'active') {
          toast({
            title: "✅ Request Approved!",
            description: `You have been approved to join ${request.agency_name}`,
          });
          navigate("/agency");
          return;
        }
      }

      // If code is provided in URL or from pending referral, auto-search
      const pendingRef = localStorage.getItem("meri_pending_referral");
      const codeFromUrl = searchParams.get("code");
      if ((codeFromUrl || pendingRef) && !requestData?.length) {
        // Clear pending referral after reading
        if (pendingRef) localStorage.removeItem("meri_pending_referral");
        searchAgency();
      }
    } catch (error) {
      console.error('[JoinAgency] Error checking user:', error);
      recordClientError({ label: "JoinAgency.codeFromUrl", message: error instanceof Error ? error.message : String(error) });
    } finally {
      setLoading(false);
    }
  };

  const searchAgency = async () => {
    const code = agencyCode.trim().toUpperCase() || searchParams.get("code")?.toUpperCase();
    
    if (!code) {
      toast({
        title: "Error",
        description: "Please enter an agency code",
        variant: "destructive",
      });
      return;
    }

    setSearching(true);
    setFoundAgency(null);
    setAgencyNotFound(false);

    try {
      const { data, error } = await supabase.rpc('get_agency_by_code', {
        agency_code: code
      });

      if (data && data.length > 0) {
        const agencyData = data[0];
        setFoundAgency({
          id: agencyData.id,
          name: agencyData.name,
          agency_code: code,
          level: agencyData.level || "A1",
          total_hosts: agencyData.total_hosts || 0
        });
      } else {
        setAgencyNotFound(true);
        toast({
          title: "Agency Not Found",
          description: "Please enter a valid agency code",
          variant: "destructive",
        });
      }
    } catch (error) {
      console.error("Search error:", error);
      recordClientError({ label: "JoinAgency.agencyData", message: error instanceof Error ? error.message : String(error) });
      setAgencyNotFound(true);
    } finally {
      setSearching(false);
    }
  };

  const joinAgency = async () => {
    if (!foundAgency || !currentUser) return;

    setJoining(true);
    try {
      // Pkg72: capture sub-agent referral code from URL (?ref=SAxxxxxx) so that
      // agency_hosts.referral_code is populated → enables Pkg27 sub-agent commission.
      const subAgentRef = (searchParams.get('ref') || '').trim().toUpperCase();
      const isSubAgentRef = /^SA[A-Z0-9]{4,}$/.test(subAgentRef) ? subAgentRef : null;

      const { data, error } = await supabase.rpc('join_agency', {
        _host_id: currentUser.id,
        _agency_code: foundAgency.agency_code,
        _joined_via: isSubAgentRef ? 'sub_agent_link' : 'code',
        _referral_code: isSubAgentRef,
      });

      if (error) throw error;

      if (data) {
        toast({
          title: "✅ Request Sent!",
          description: `Your request has been sent to ${foundAgency.name}. Please wait for approval.`,
        });
        
        // Notification is already sent by the join_agency RPC (SECURITY DEFINER)
        // No need for client-side notification which is blocked by RLS
        
        // Set pending request to show waiting state
        setPendingRequest({
          agency_id: foundAgency.id,
          agency_name: foundAgency.name,
          agency_code: foundAgency.agency_code,
          agency_level: foundAgency.level,
          agency_logo_url: null,
          status: 'pending',
          requested_at: new Date().toISOString()
        });
        setFoundAgency(null);
      } else {
        throw new Error("Failed to send request");
      }
    } catch (error: any) {
      // Supabase wraps RAISE EXCEPTION in error.message or error.details
      const msg = error?.message || error?.details || "Failed to send request";
      toast({
        title: "Cannot Join Agency",
        description: msg,
        variant: "destructive",
      });
    } finally {
      setJoining(false);
    }
  };

  const cancelRequest = async () => {
    if (!pendingRequest || !currentUser) return;

    try {
      const { data, error } = await supabase.rpc('cancel_agency_request', {
        _host_id: currentUser.id
      });

      if (error) throw error;

      toast({
        title: "Request Cancelled",
        description: "Your join request has been cancelled",
      });

      setPendingRequest(null);
    } catch (error: any) {
      toast({
        title: "Error",
        description: error?.message || "Failed to cancel request",
        variant: "destructive",
      });
    }
  };

  const refreshStatus = async () => {
    setLoading(true);
    await checkCurrentUser();
  };

  if (loading) {
    return <PageSkeleton className="bg-background" rows={5} hero />;
  }

  // Show pending request status page
  if (pendingRequest && pendingRequest.status === 'pending') {
    return (
      <div className="fixed inset-0 flex flex-col bg-background">
        {/* Header */}
        <header className="flex-shrink-0 sticky top-0 z-10 bg-gradient-to-r from-amber-500 to-orange-500 text-white safe-area-top">
          <div className="flex items-center h-14 px-4">
            <button 
              onClick={() => navigate(-1)}
              className="p-2 -ml-2 hover:bg-white/10 rounded-full transition-colors"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
            <h1 className="flex-1 text-center text-lg font-semibold pr-7">
              Waiting for Approval
            </h1>
          </div>
        </header>

        <div className="flex-1 overflow-y-auto overscroll-contain" style={{ WebkitOverflowScrolling: 'touch', paddingBottom: 'var(--content-bottom-padding)' }}>

        {/* Pending Status Card */}
        <div className="mx-4 mt-6">
          <div className="bg-white rounded-3xl p-6 shadow-lg border border-amber-100">
            {/* Animation */}
            <div className="flex justify-center mb-6">
              <div className="relative">
                <div className="w-24 h-24 bg-gradient-to-br from-amber-100 to-orange-100 rounded-full flex items-center justify-center">
                  <Clock className="w-12 h-12 text-amber-500 animate-pulse" />
                </div>
                <div className="absolute -top-1 -right-1 w-8 h-8 bg-amber-500 rounded-full flex items-center justify-center">
                  <span className="text-slate-800 text-sm">⏳</span>
                </div>
              </div>
            </div>

            <h2 className="text-xl font-bold text-center text-gray-800 mb-2">
              Request Pending
            </h2>
            <p className="text-center text-gray-500 text-sm mb-6">
              Your request is waiting for agency approval
            </p>

            {/* Agency Info */}
            <div className="bg-gradient-to-br from-gray-50 to-gray-100 rounded-2xl p-4 mb-6">
              <div className="flex items-center gap-4">
                <div className="w-14 h-14 bg-gradient-to-br from-purple-500 to-indigo-600 rounded-xl flex items-center justify-center">
                  {pendingRequest.agency_logo_url ? (
                  <Avatar className="w-14 h-14 rounded-xl">
                      <AvatarImage src={enhanceThumbnail(pendingRequest.agency_logo_url, { width: 96, quality: 82 })} />
                      <AvatarFallback>
                        <Building2 className="w-7 h-7 text-white" />
                      </AvatarFallback>
                    </Avatar>
                  ) : (
                    <Building2 className="w-7 h-7 text-white" />
                  )}
                </div>
                <div className="flex-1">
                  <h3 className="font-bold text-lg text-gray-800">{pendingRequest.agency_name}</h3>
                  <p className="text-sm text-gray-500">Code: {pendingRequest.agency_code}</p>
                </div>
                <Badge className="bg-amber-100 text-amber-700 border-amber-200">
                  {pendingRequest.agency_level}
                </Badge>
              </div>
            </div>

            {/* Status Timeline */}
            <div className="space-y-3 mb-6">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 bg-green-500 rounded-full flex items-center justify-center">
                  <CheckCircle2 className="w-4 h-4 text-slate-800" />
                </div>
                <div className="flex-1">
                  <p className="font-medium text-gray-800">Request Submitted</p>
                  <p className="text-xs text-gray-500">
                    {new Date(pendingRequest.requested_at).toLocaleDateString('bn-BD', {
                      day: 'numeric',
                      month: 'short',
                      year: 'numeric',
                      hour: '2-digit',
                      minute: '2-digit'
                    })}
                  </p>
                </div>
              </div>
              
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 bg-amber-500 rounded-full flex items-center justify-center animate-pulse">
                  <Clock className="w-4 h-4 text-slate-800" />
                </div>
                <div className="flex-1">
                  <p className="font-medium text-gray-800">Waiting for Approval</p>
                  <p className="text-xs text-gray-500">Agency owner will review your request</p>
                </div>
              </div>
              
              <div className="flex items-center gap-3 opacity-40">
                <div className="w-8 h-8 bg-gray-300 rounded-full flex items-center justify-center">
                  <UserPlus className="w-4 h-4 text-slate-800" />
                </div>
                <div className="flex-1">
                  <p className="font-medium text-gray-500">Join Approved</p>
                  <p className="text-xs text-gray-400">You'll be notified when approved</p>
                </div>
              </div>
            </div>

            {/* Actions */}
            <div className="space-y-3">
              <Button
                onClick={refreshStatus}
                variant="outline"
                className="w-full border-amber-200 text-amber-700 hover:bg-amber-50"
              >
                <RefreshCw className="w-4 h-4 mr-2" />
                Check Status
              </Button>
              
              <Button
                onClick={cancelRequest}
                variant="ghost"
                className="w-full text-red-500 hover:bg-red-50 hover:text-red-600"
              >
                <XCircle className="w-4 h-4 mr-2" />
                Cancel Request
              </Button>
            </div>
          </div>
        </div>

        {/* Info */}
        <div className="mx-4 mt-4 mb-6 bg-blue-50 rounded-2xl p-4 border border-blue-200">
          <h3 className="font-semibold text-blue-800 mb-2">💡 Tips</h3>
          <ul className="text-sm text-blue-700 space-y-2">
            <li>• Agency owner will receive your request notification</li>
            <li>• Approval usually takes 24-48 hours</li>
            <li>• You'll be notified when approved</li>
            <li>• Contact agency owner if needed</li>
          </ul>
        </div>
        </div>
      </div>
    );
  }

  // Show rejected status
  if (pendingRequest && pendingRequest.status === 'rejected') {
    return (
      <div className="fixed inset-0 flex flex-col bg-gray-50">
        {/* Header */}
        <header className="flex-shrink-0 sticky top-0 z-10 bg-gradient-to-r from-red-500 to-rose-500 text-white safe-area-top">
          <div className="flex items-center h-14 px-4">
            <button 
              onClick={() => navigate(-1)}
              className="p-2 -ml-2 hover:bg-white/10 rounded-full transition-colors"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
            <h1 className="flex-1 text-center text-lg font-semibold pr-7">
              Request Rejected
            </h1>
          </div>
        </header>

        <div className="flex-1 overflow-y-auto overscroll-contain" style={{ WebkitOverflowScrolling: 'touch', paddingBottom: 'var(--content-bottom-padding)' }}>
        <div className="mx-4 mt-6">
          <div className="bg-white rounded-3xl p-6 shadow-lg border border-red-100 text-center">
            <div className="w-20 h-20 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <XCircle className="w-10 h-10 text-red-500" />
            </div>
            <h2 className="text-xl font-bold text-gray-800 mb-2">Request Rejected</h2>
            <p className="text-gray-500 mb-4">
              Your request to join {pendingRequest.agency_name} was rejected.
            </p>
            <Button
              onClick={() => {
                setPendingRequest(null);
              }}
              className="w-full bg-green-600 hover:bg-green-700"
            >
              Try Another Agency
            </Button>
          </div>
        </div>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 flex flex-col bg-gray-50">
      {/* Header */}
      <header className="flex-shrink-0 sticky top-0 z-10 bg-gradient-to-r from-green-500 to-emerald-600 text-white safe-area-top">
        <div className="flex items-center h-14 px-4">
          <button 
            onClick={() => navigate(-1)}
            className="p-2 -ml-2 hover:bg-white/10 rounded-full transition-colors"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <h1 className="flex-1 text-center text-lg font-semibold pr-7">
            Join Agency
          </h1>
        </div>
      </header>

      {/* Scrollable Content */}
      <div className="flex-1 overflow-y-auto overscroll-contain" style={{ WebkitOverflowScrolling: 'touch', paddingBottom: 'var(--content-bottom-padding)' }}>
        {/* Hero */}
        <div className="mx-4 mt-4 bg-gradient-to-br from-green-500 to-emerald-600 rounded-2xl p-6 text-white">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 bg-white/20 rounded-xl flex items-center justify-center">
            <UserPlus className="w-6 h-6" />
          </div>
          <div>
            <h2 className="text-xl font-bold">Join Agency</h2>
            <p className="text-white/90 text-sm">Join with agency code</p>
          </div>
        </div>
      </div>

      {/* Search Form */}
      <div className="mx-4 mt-4 bg-white rounded-2xl p-5 shadow-sm border">
        <Label className="text-sm font-semibold flex items-center gap-2 mb-3">
          <Search className="w-4 h-4 text-green-600" />
          Enter Agency Code
        </Label>
        
        <div className="flex items-center gap-2">
          <Input
            placeholder="AG123ABC"
            value={agencyCode}
            onChange={(e) => {
              setAgencyCode(e.target.value.toUpperCase());
              setFoundAgency(null);
              setAgencyNotFound(false);
            }}
            className="flex-1"
          />
          <Button onClick={searchAgency} disabled={searching}>
            {searching ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Search className="w-4 h-4" />
            )}
          </Button>
        </div>

        {/* Found Agency */}
        {foundAgency && (
          <div className="mt-4 p-4 bg-green-50 rounded-xl border border-green-200">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 bg-gradient-to-br from-purple-500 to-indigo-600 rounded-xl flex items-center justify-center">
                  <Building2 className="w-6 h-6 text-white" />
                </div>
                <div>
                  <p className="font-semibold text-green-800">{foundAgency.name}</p>
                  <p className="text-xs text-green-600">Code: {foundAgency.agency_code}</p>
                </div>
              </div>
              <Badge className="bg-green-500 text-slate-800">{foundAgency.level}</Badge>
            </div>

            <div className="flex items-center gap-4 mb-4 text-sm text-green-700">
              <div className="flex items-center gap-1">
                <Users className="w-4 h-4" />
                <span>{foundAgency.total_hosts} Hosts</span>
              </div>
            </div>

            <Button
              onClick={joinAgency}
              disabled={joining}
              className="w-full bg-green-600 hover:bg-green-700"
            >
              {joining ? (
                <Loader2 className="w-4 h-4 animate-spin mr-2" />
              ) : (
                <UserPlus className="w-4 h-4 mr-2" />
              )}
              Send Join Request
            </Button>
          </div>
        )}

        {agencyNotFound && (
          <div className="mt-4 p-4 bg-red-50 rounded-xl border border-red-200 flex items-center gap-2 text-red-600">
            <XCircle className="w-5 h-5" />
            <span className="text-sm">Agency not found</span>
          </div>
        )}
      </div>

      {/* Info */}
      <div className="mx-4 mt-4 bg-amber-50 rounded-2xl p-4 border border-amber-200">
        <h3 className="font-semibold text-amber-800 mb-2">📋 How it works</h3>
        <ul className="text-sm text-amber-700 space-y-2">
          <li>• Get the agency code from the agency owner</li>
          <li>• Search using the code</li>
          <li>• Click "Send Join Request"</li>
          <li>• Wait for agency approval</li>
          <li>• After approval, you can start working</li>
        </ul>
      </div>

      {/* Benefits */}
      <div className="mx-4 mt-4 mb-8 bg-gradient-to-br from-green-50 to-emerald-50 rounded-2xl p-4 border border-green-100">
        <h3 className="font-semibold text-green-800 mb-3">🎯 Host Benefits</h3>
        <ul className="text-sm text-green-700 space-y-2">
          <li className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-green-500" />
            Earn through live streaming
          </li>
          <li className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-green-500" />
            Get agency support
          </li>
          <li className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-green-500" />
            Win bonuses and rewards
          </li>
        </ul>
      </div>
      </div>
    </div>
  );
};

export default JoinAgency;
