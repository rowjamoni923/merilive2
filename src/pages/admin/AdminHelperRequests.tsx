import { useState, useEffect, useRef } from "react";
import useAdminRealtime from "@/hooks/useAdminRealtime";
import { useNavigate } from "react-router-dom";
import { 
  ArrowLeft, ArrowUpCircle, Wallet, Clock, CheckCircle, XCircle, 
  Eye, Search, Filter, RefreshCw, Image, AlertCircle, User
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { adminSupabase as supabase } from "@/integrations/supabase/adminClient";
import { getAdminSession } from "@/utils/adminSession";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";
import { cn } from "@/lib/utils";

import { adminSendNotification } from "@/utils/adminNotification";
import { recordAdminError } from "@/utils/adminErrorLog";

import { formatAdminError } from "@/utils/formatAdminError";
import { computeTopupApproval, usdToDiamonds } from "@/utils/traderWalletTopupRate";
interface UpgradeRequest {
  id: string;
  user_id: string;
  helper_id: string;
  requested_level: number;
  amount_usd: number;
  payment_method: string;
  transaction_id: string | null;
  payment_proof_url: string | null;
  notes: string | null;
  status: string;
  admin_notes: string | null;
  created_at: string;
  reviewed_at: string | null;
  reviewed_by: string | null;
  user?: { display_name: string; avatar_url: string; app_uid: string };
}

interface TopupRequest {
  id: string;
  user_id: string;
  helper_id: string;
  coin_amount: number;
  amount_usd: number;
  payment_method: string;
  transaction_id: string | null;
  payment_proof_url: string | null;
  notes: string | null;
  status: string;
  admin_notes: string | null;
  created_at: string;
  processed_at: string | null;
  processed_by: string | null;
  user?: { display_name: string; avatar_url: string; app_uid: string };
}

const AdminHelperRequests = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  
  const [upgradeRequests, setUpgradeRequests] = useState<UpgradeRequest[]>([]);
  const [topupRequests, setTopupRequests] = useState<TopupRequest[]>([]);
  const [loading, setLoading] = useState(false);
  const [processing, setProcessing] = useState(false);
  const actionGuardRef = useRef<Set<string>>(new Set());
  const guardStart = (key: string) => { if (actionGuardRef.current.has(key)) return false; actionGuardRef.current.add(key); return true; };
  const guardEnd = (key: string) => { actionGuardRef.current.delete(key); };
  
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("pending");
  
  const [selectedRequest, setSelectedRequest] = useState<UpgradeRequest | TopupRequest | null>(null);
  const [requestType, setRequestType] = useState<'upgrade' | 'topup'>('upgrade');
  const [showDetailModal, setShowDetailModal] = useState(false);
  const [adminNotes, setAdminNotes] = useState("");
  const [approveUsd, setApproveUsd] = useState<string>("");
  const [topupRate, setTopupRate] = useState<number | null>(null);

  const [pendingUpgradeCount, setPendingUpgradeCount] = useState(0);
  const [pendingTopupCount, setPendingTopupCount] = useState(0);

  useEffect(() => {
    loadRequests();
    supabase.rpc('get_trader_wallet_topup_rate').then(({ data }) => {
      const r = (data as any)?.usd_per_100k_diamonds;
      setTopupRate(r ? Number(r) : null);
    });
  }, [statusFilter]);

  useAdminRealtime(['helper_upgrade_requests', 'helper_topup_requests', 'app_settings'], () => loadRequests());

  const loadRequests = async () => {
    setLoading(true);
    try {
      // Load upgrade requests
      let upgradeQuery = supabase
        .from('helper_upgrade_requests')
        .select('*')
        .order('created_at', { ascending: false });
      
      if (statusFilter !== 'all') {
        upgradeQuery = upgradeQuery.eq('status', statusFilter);
      }
      
      const { data: upgrades } = await upgradeQuery;
      
      // Load topup requests in parallel
      let topupQuery = supabase
        .from('helper_topup_requests')
        .select('*')
        .order('created_at', { ascending: false });
      
      if (statusFilter !== 'all') {
        topupQuery = topupQuery.eq('status', statusFilter);
      }
      
      const { data: topups } = await topupQuery;

      // Batch fetch ALL user profiles for both upgrades + topups in one query
      const allUserIds = [...new Set([
        ...(upgrades || []).map(r => r.user_id),
        ...(topups || []).map(r => r.user_id),
      ].filter(Boolean))];
      
      const { data: allUsers } = allUserIds.length > 0 ? await supabase
        .from('profiles')
        .select('id, display_name, avatar_url, app_uid')
        .in('id', allUserIds) : { data: [] };
      const userMap = new Map((allUsers || []).map(u => [u.id, u]));

      if (upgrades) {
        setUpgradeRequests(upgrades.map(req => ({ ...req, user: userMap.get(req.user_id) || null })));
      }
      if (topups) {
        setTopupRequests(topups.map(req => ({ ...req, user: userMap.get(req.user_id) || null })));
      }
      
      // Pkg6: single server-side aggregation RPC
      const { data: statsData } = await supabase.rpc('admin_helper_requests_stats');
      const s = (statsData as any) || {};
      setPendingUpgradeCount(s.pendingUpgrades || 0);
      setPendingTopupCount(s.pendingTopups || 0);
      
    } catch (error) {
      recordAdminError({ kind: "rpc", label: "AdminHelperRequests.ErrorLoadingRequests", message: formatAdminError(error)});
    } finally {
      setLoading(false);
    }
  };

  const handleApprove = async () => {
    if (!selectedRequest) return;
    if (!guardStart(`approve-${selectedRequest.id}`)) return;
    setProcessing(true);
    try {
      const __as = getAdminSession(); const user = __as?.admin_id ? ({ id: __as.admin_id } as { id: string }) : null;
      
      if (requestType === 'upgrade') {
        const req = selectedRequest as UpgradeRequest;
        
        // Update request status
        await supabase
          .from('helper_upgrade_requests')
          .update({
            status: 'approved',
            admin_notes: adminNotes || null,
            reviewed_at: new Date().toISOString(),
            reviewed_by: user?.id
          })
          .eq('id', req.id);
        
        // Update helper level - using trader_level column
        await supabase
          .from('topup_helpers')
          .update({ trader_level: req.requested_level })
          .eq('id', req.helper_id);
        
        // Send notification
        await adminSendNotification(req.user_id, 'Level Upgrade Approved! 🎉', `Your upgrade to Level ${req.requested_level} has been approved.`, 'level_upgrade')
        
        toast({ title: "Approved!", description: `Level ${req.requested_level} upgrade approved.` });
        
      } else {
        const req = selectedRequest as TopupRequest;

        // Single source of truth — same formula + validation as SQL RPC
        const calc = computeTopupApproval(
          { usd_per_100k_diamonds: topupRate },
          approveUsd
        );
        if (calc.ok !== true) {
          toast({ title: "Cannot approve", description: calc.error, variant: "destructive" });
          setProcessing(false);
          guardEnd(`approve-${req.id}`);
          return;
        }

        const { data: rpcRes, error: rpcErr } = await supabase.rpc('admin_approve_helper_topup', {
          _request_id: req.id,
          _amount_usd: calc.usd,
          _admin_notes: adminNotes || null,
        });
        if (rpcErr) throw rpcErr;
        const res = rpcRes as any;
        if (res && res.success === false) {
          throw new Error(res.error || 'Approval failed');
        }

        const credited = Number(res?.diamonds ?? res?.diamonds_credited ?? calc.diamonds);
        await adminSendNotification(req.user_id, 'Top-up Approved! 💎', `Your top-up of ${credited.toLocaleString()} diamonds has been approved.`, 'topup_approved')

        toast({ title: "Approved!", description: `Credited ${credited.toLocaleString()} 💎 for $${calc.usd}.` });
      }
      
      setShowDetailModal(false);
      setSelectedRequest(null);
      setAdminNotes("");
      loadRequests();
      
    } catch (error: any) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } finally {
      setProcessing(false);
      if (selectedRequest) guardEnd(`approve-${selectedRequest.id}`);
    }
  };

  const handleReject = async () => {
    if (!selectedRequest) return;
    if (!guardStart(`reject-${selectedRequest.id}`)) return;
    setProcessing(true);
    try {
      const __as = getAdminSession(); const user = __as?.admin_id ? ({ id: __as.admin_id } as { id: string }) : null;
      const table = requestType === 'upgrade' ? 'helper_upgrade_requests' : 'helper_topup_requests';
      
      await supabase
        .from(table)
        .update({
          status: 'rejected',
          admin_notes: adminNotes || 'Rejected by admin',
          ...(requestType === 'upgrade' 
            ? { reviewed_at: new Date().toISOString(), reviewed_by: user?.id }
            : { processed_at: new Date().toISOString(), processed_by: user?.id }
          )
        })
        .eq('id', selectedRequest.id);
      
      // Send notification
      await adminSendNotification(selectedRequest.user_id, 'Request Rejected', adminNotes || 'Your request has been rejected.', requestType);
      
      toast({ title: "Rejected", description: "Request has been rejected." });
      
      setShowDetailModal(false);
      setSelectedRequest(null);
      setAdminNotes("");
      loadRequests();
      
    } catch (error: any) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } finally {
      setProcessing(false);
      if (selectedRequest) guardEnd(`reject-${selectedRequest.id}`);
    }
  };

  const openDetail = (request: UpgradeRequest | TopupRequest, type: 'upgrade' | 'topup') => {
    setSelectedRequest(request);
    setRequestType(type);
    setAdminNotes(request.admin_notes || "");
    setApproveUsd(type === 'topup' ? String((request as TopupRequest).amount_usd ?? "") : "");
    setShowDetailModal(true);
  };

  const previewDiamonds = (() => {
    const usd = parseFloat(approveUsd);
    if (!topupRate || !isFinite(usd) || usd <= 0) return 0;
    try { return usdToDiamonds(usd, topupRate); } catch { return 0; }
  })();

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'pending': return <Badge className="bg-yellow-500/20 text-yellow-600">Pending</Badge>;
      case 'approved': return <Badge className="bg-green-500/20 text-green-600">Approved</Badge>;
      case 'rejected': return <Badge className="bg-red-500/20 text-red-600">Rejected</Badge>;
      default: return <Badge variant="secondary">{status}</Badge>;
    }
  };

  const filteredUpgrades = upgradeRequests.filter(r => 
    !searchQuery || 
    r.user?.display_name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    r.user?.app_uid?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const filteredTopups = topupRequests.filter(r => 
    !searchQuery || 
    r.user?.display_name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    r.user?.app_uid?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="min-h-screen bg-slate-50 pb-20">
      {/* Header */}
      <div className="bg-gradient-to-r from-purple-600 via-indigo-600 to-blue-600 p-6 rounded-b-3xl shadow-lg">
        <div className="flex items-center gap-3 mb-4">
          <Button variant="ghost" size="icon" className="text-white hover:bg-white/20" onClick={() => navigate('/admin')}>
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <div className="flex-1">
            <h1 className="font-bold text-xl text-white">Helper Requests</h1>
            <p className="text-white/80 text-sm">Manage upgrade & top-up requests</p>
          </div>
          <Button variant="ghost" size="icon" className="text-white hover:bg-white/20" onClick={loadRequests}>
            <RefreshCw className={cn("w-5 h-5", loading && "animate-spin")} />
          </Button>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 gap-3">
          <div className="bg-white/20 backdrop-blur-sm rounded-xl p-4">
            <div className="flex items-center gap-2">
              <ArrowUpCircle className="w-5 h-5 text-yellow-300" />
              <span className="text-white/80 text-sm">Upgrade Pending</span>
            </div>
            <p className="text-2xl font-bold text-white mt-1">{pendingUpgradeCount}</p>
          </div>
          <div className="bg-white/20 backdrop-blur-sm rounded-xl p-4">
            <div className="flex items-center gap-2">
              <Wallet className="w-5 h-5 text-green-300" />
              <span className="text-white/80 text-sm">Top-up Pending</span>
            </div>
            <p className="text-2xl font-bold text-white mt-1">{pendingTopupCount}</p>
          </div>
        </div>
      </div>

      <div className="px-4 mt-4 space-y-4">
        {/* Filters */}
        <Card>
          <CardContent className="p-4">
            <div className="flex gap-3">
              <div className="flex-1 relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <Input 
                  placeholder="Search by name or ID..."
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  className="pl-10"
                />
              </div>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-32">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="pending">Pending</SelectItem>
                  <SelectItem value="approved">Approved</SelectItem>
                  <SelectItem value="rejected">Rejected</SelectItem>
                  <SelectItem value="all">All</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>

        {/* Tabs */}
        <Tabs defaultValue="upgrade" className="w-full">
          <TabsList className="w-full grid grid-cols-2">
            <TabsTrigger value="upgrade" className="relative">
              Level Upgrades
              {pendingUpgradeCount > 0 && (
                <span className="absolute -top-1 -right-1 min-w-5 h-5 flex items-center justify-center px-1 bg-red-500 rounded-full text-[10px] text-white font-bold">
                  {pendingUpgradeCount}
                </span>
              )}
            </TabsTrigger>
            <TabsTrigger value="topup" className="relative">
              Manual Top-ups
              {pendingTopupCount > 0 && (
                <span className="absolute -top-1 -right-1 min-w-5 h-5 flex items-center justify-center px-1 bg-red-500 rounded-full text-[10px] text-white font-bold">
                  {pendingTopupCount}
                </span>
              )}
            </TabsTrigger>
          </TabsList>

          {/* Upgrade Requests Tab */}
          <TabsContent value="upgrade" className="mt-4">
            <Card>
              <CardContent className="p-0">
                {loading ? (
                  <div className="p-8 text-center text-slate-500">Loading...</div>
                ) : filteredUpgrades.length === 0 ? (
                  <div className="p-8 text-center">
                    <AlertCircle className="w-12 h-12 mx-auto text-slate-300 mb-2" />
                    <p className="text-slate-500">No upgrade requests found</p>
                  </div>
                ) : (
                  <div className="divide-y">
                    {filteredUpgrades.map(req => (
                      <button
                        key={req.id}
                        onClick={() => openDetail(req, 'upgrade')}
                        className="w-full flex items-center gap-3 p-4 hover:bg-slate-50 transition-colors text-left"
                      >
                        <Avatar className="w-12 h-12">
                          <AvatarImage src={req.user?.avatar_url} />
                          <AvatarFallback>{req.user?.display_name?.charAt(0)}</AvatarFallback>
                        </Avatar>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <p className="font-semibold truncate">{req.user?.display_name}</p>
                            {getStatusBadge(req.status)}
                          </div>
                          <p className="text-sm text-slate-500">
                            Level {req.requested_level} Upgrade • ${req.amount_usd}
                          </p>
                          <p className="text-xs text-slate-400">
                            {format(new Date(req.created_at), 'dd/MM/yy HH:mm')} • {req.payment_method}
                          </p>
                        </div>
                        <ArrowUpCircle className="w-5 h-5 text-purple-500" />
                      </button>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Top-up Requests Tab */}
          <TabsContent value="topup" className="mt-4">
            <Card>
              <CardContent className="p-0">
                {loading ? (
                  <div className="p-8 text-center text-slate-500">Loading...</div>
                ) : filteredTopups.length === 0 ? (
                  <div className="p-8 text-center">
                    <AlertCircle className="w-12 h-12 mx-auto text-slate-300 mb-2" />
                    <p className="text-slate-500">No top-up requests found</p>
                  </div>
                ) : (
                  <div className="divide-y">
                    {filteredTopups.map(req => (
                      <button
                        key={req.id}
                        onClick={() => openDetail(req, 'topup')}
                        className="w-full flex items-center gap-3 p-4 hover:bg-slate-50 transition-colors text-left"
                      >
                        <Avatar className="w-12 h-12">
                          <AvatarImage src={req.user?.avatar_url} />
                          <AvatarFallback>{req.user?.display_name?.charAt(0)}</AvatarFallback>
                        </Avatar>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <p className="font-semibold truncate">{req.user?.display_name}</p>
                            {getStatusBadge(req.status)}
                          </div>
                          <p className="text-sm text-slate-500">
                            💎 {req.coin_amount?.toLocaleString()} coins • ${req.amount_usd}
                          </p>
                          <p className="text-xs text-slate-400">
                            {format(new Date(req.created_at), 'dd/MM/yy HH:mm')} • {req.payment_method}
                          </p>
                        </div>
                        <Wallet className="w-5 h-5 text-green-500" />
                      </button>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>

      {/* Detail Modal */}
      <Dialog open={showDetailModal} onOpenChange={setShowDetailModal}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {requestType === 'upgrade' ? (
                <><ArrowUpCircle className="w-5 h-5 text-purple-500" /> Level Upgrade Request</>
              ) : (
                <><Wallet className="w-5 h-5 text-green-500" /> Top-up Request</>
              )}
            </DialogTitle>
          </DialogHeader>

          {selectedRequest && (
            <div className="space-y-4">
              {/* User Info */}
              <div className="flex items-center gap-3 p-3 bg-slate-100 rounded-lg">
                <Avatar className="w-12 h-12">
                  <AvatarImage src={selectedRequest.user?.avatar_url} />
                  <AvatarFallback>{selectedRequest.user?.display_name?.charAt(0)}</AvatarFallback>
                </Avatar>
                <div>
                  <p className="font-semibold">{selectedRequest.user?.display_name}</p>
                  <p className="text-sm text-slate-500">ID: {selectedRequest.user?.app_uid}</p>
                </div>
                {getStatusBadge(selectedRequest.status)}
              </div>

              {/* Request Details */}
              <div className="grid grid-cols-2 gap-3">
                {requestType === 'upgrade' ? (
                  <>
                    <div className="p-3 bg-purple-50 rounded-lg">
                      <p className="text-xs text-purple-600">Requested Level</p>
                      <p className="font-bold text-lg">Level {(selectedRequest as UpgradeRequest).requested_level}</p>
                    </div>
                    <div className="p-3 bg-green-50 rounded-lg">
                      <p className="text-xs text-green-600">Amount</p>
                      <p className="font-bold text-lg">${selectedRequest.amount_usd}</p>
                    </div>
                  </>
                ) : (
                  <>
                    <div className="p-3 bg-blue-50 rounded-lg">
                      <p className="text-xs text-blue-600">Diamonds</p>
                      <p className="font-bold text-lg">💎 {(selectedRequest as TopupRequest).coin_amount?.toLocaleString()}</p>
                    </div>
                    <div className="p-3 bg-green-50 rounded-lg">
                      <p className="text-xs text-green-600">Amount USD</p>
                      <p className="font-bold text-lg">${selectedRequest.amount_usd}</p>
                    </div>
                  </>
                )}
              </div>

              {/* USD approve input + diamonds preview (topup only) */}
              {requestType === 'topup' && selectedRequest.status === 'pending' && (
                <div className="space-y-2 p-3 border rounded-lg bg-slate-50">
                  <Label htmlFor="approve-usd">Approve USD amount</Label>
                  <Input
                    id="approve-usd"
                    type="number"
                    min="0"
                    step="0.01"
                    value={approveUsd}
                    onChange={e => setApproveUsd(e.target.value)}
                    placeholder="Enter USD amount to credit"
                  />
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-slate-500">
                      Rate: {topupRate ? `$${topupRate} / 100,000 💎` : 'Loading…'}
                    </span>
                    <span className="font-semibold text-blue-600">
                      💎 {previewDiamonds.toLocaleString()} to credit
                    </span>
                  </div>
                  {!topupRate && (
                    <p className="text-xs text-red-500">Topup rate not configured in admin settings.</p>
                  )}
                </div>
              )}

              {/* Payment Info */}
              <div className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-slate-500">Payment Method:</span>
                  <span className="font-medium">{selectedRequest.payment_method}</span>
                </div>
                {selectedRequest.transaction_id && (
                  <div className="flex justify-between text-sm">
                    <span className="text-slate-500">Transaction ID:</span>
                    <span className="font-mono text-xs bg-slate-100 px-2 py-1 rounded">{selectedRequest.transaction_id}</span>
                  </div>
                )}
                <div className="flex justify-between text-sm">
                  <span className="text-slate-500">Date:</span>
                  <span>{format(new Date(selectedRequest.created_at), 'PPpp')}</span>
                </div>
              </div>

              {/* Notes from user */}
              {selectedRequest.notes && (
                <div className="p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
                  <p className="text-xs text-yellow-600 mb-1">User Notes:</p>
                  <p className="text-sm">{selectedRequest.notes}</p>
                </div>
              )}

              {/* Payment Proof */}
              {selectedRequest.payment_proof_url && (
                <div>
                  <Label className="mb-2 block">Payment Proof:</Label>
                  <a 
                    href={selectedRequest.payment_proof_url} 
                    target="_blank" 
                    rel="noopener noreferrer"
                    className="block"
                  >
                    <img 
                      src={selectedRequest.payment_proof_url} 
                      alt="Payment Proof" 
                      className="w-full max-h-60 object-contain rounded-lg border cursor-pointer hover:opacity-90" onError={(e) => { const t = e.currentTarget; if (t.src.indexOf('/placeholder.svg') === -1) t.src = '/placeholder.svg'; }} />
                  </a>
                </div>
              )}

              {/* Admin Notes */}
              <div className="space-y-2">
                <Label>Admin Notes</Label>
                <Textarea
                  placeholder="Add notes (optional, will be visible to user on rejection)"
                  value={adminNotes}
                  onChange={e => setAdminNotes(e.target.value)}
                  rows={3}
                  disabled={selectedRequest.status !== 'pending'}
                />
              </div>

              {/* Actions */}
              {selectedRequest.status === 'pending' && (
                <DialogFooter className="gap-2">
                  <Button
                    variant="outline"
                    onClick={handleReject}
                    disabled={processing}
                    className="flex-1 border-red-200 text-red-600 hover:bg-red-50"
                  >
                    <XCircle className="w-4 h-4 mr-2" />
                    Reject
                  </Button>
                  <Button
                    onClick={handleApprove}
                    disabled={processing || (requestType === 'topup' && (!previewDiamonds || !topupRate))}
                    className="flex-1 bg-green-600 hover:bg-green-700"
                  >
                    <CheckCircle className="w-4 h-4 mr-2" />
                    Approve
                  </Button>
                </DialogFooter>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default AdminHelperRequests;
