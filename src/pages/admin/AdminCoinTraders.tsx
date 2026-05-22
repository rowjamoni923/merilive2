import { useState, useEffect } from "react";
import useAdminRealtime from "@/hooks/useAdminRealtime";
import { useNavigate } from "react-router-dom";
import { 
  ArrowLeft, Plus, Search, Check, X, UserCheck, Wallet, 
  Users, Clock, MoreVertical, Eye, Ban, Coins, ArrowUpRight, ArrowDownLeft,
  Send, Loader2, DollarSign, Settings, CreditCard, Smartphone
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { adminSupabase as supabase } from "@/integrations/supabase/adminClient";
import { getAdminSession } from "@/utils/adminSession";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { format } from "date-fns";

import { adminSendNotification } from "@/utils/adminNotification";
import { recordAdminError } from "@/utils/adminErrorLog";

import { formatAdminError } from "@/utils/formatAdminError";
const AdminCoinTraders = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState("helpers");
  const [helpers, setHelpers] = useState<any[]>([]);
  const [transactions, setTransactions] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [showAddModal, setShowAddModal] = useState(false);
  const [selectedUser, setSelectedUser] = useState<any>(null);
  const [userSearchQuery, setUserSearchQuery] = useState("");
  const [userSearchResults, setUserSearchResults] = useState<any[]>([]);
  const [processing, setProcessing] = useState(false);
  const [stats, setStats] = useState({ totalHelpers: 0, activeHelpers: 0, pendingTransactions: 0, totalCoinsTraded: 0, visibleTraders: 0 });
  
  // Coin Transfer Modal State
  const [showTransferModal, setShowTransferModal] = useState(false);
  const [selectedHelper, setSelectedHelper] = useState<any>(null);
  const [transferAmount, setTransferAmount] = useState("");
  const [transferNote, setTransferNote] = useState("");
  const [isTransferring, setIsTransferring] = useState(false);

  // Payment Methods Edit Modal State
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [editingHelper, setEditingHelper] = useState<any>(null);
  const [paymentMethods, setPaymentMethods] = useState({
    manual: { enabled: false, accountName: "", accountNumber: "", bankName: "", instructions: "" },
    binance: { enabled: false, payId: "", email: "" },
    epay: { enabled: false, accountId: "", phone: "" }
  });
  const [isSavingPayment, setIsSavingPayment] = useState(false);

  useEffect(() => {
    fetchHelpers();
    fetchTransactions();
  }, []);

  useAdminRealtime(['topup_helpers', 'helper_transactions', 'profiles'], () => {
    fetchHelpers();
    fetchTransactions();
  });

  const fetchHelpers = async () => {
    try {
      const { data } = await supabase
        .from('topup_helpers')
        .select(`*, user:profiles!topup_helpers_user_id_fkey(display_name, avatar_url, app_uid, is_online, country_code, country_flag, country_name)`)
        .order('created_at', { ascending: false });
      setHelpers(data || []);
      setStats(prev => ({
        ...prev,
        totalHelpers: (data || []).length,
        activeHelpers: (data || []).filter((h: any) => h.is_active && h.is_verified).length,
        totalCoinsTraded: (data || []).reduce((sum: number, h: any) => sum + (h.total_bought || 0), 0),
        visibleTraders: (data || []).filter((h: any) => h.is_active && h.is_verified && h.trader_level !== 5 && (h.wallet_balance || 0) >= 100000).length,
      }));
    } catch (error) { recordAdminError({ kind: "rpc", label: "AdminCoinTraders", message: formatAdminError(error) }); }
    finally { setLoading(false); }
  };

  const fetchTransactions = async () => {
    try {
      const { data } = await supabase
        .from('helper_transactions')
        .select(`*, helper:topup_helpers(id, user_id, wallet_balance, user:profiles!topup_helpers_user_id_fkey(display_name, avatar_url))`)
        .order('created_at', { ascending: false }).limit(100);
      setTransactions(data || []);
      setStats(prev => ({ ...prev, pendingTransactions: (data || []).filter((t: any) => t.status === 'pending').length }));
    } catch (error) { recordAdminError({ kind: "rpc", label: "AdminCoinTraders", message: formatAdminError(error) }); }
  };

  const searchUsers = async (query: string) => {
    if (!query || query.length < 1) { setUserSearchResults([]); return; }
    const trimmedQuery = query.trim();
    
    // Try exact match on app_uid first
    const { data: exactMatch } = await supabase.from('profiles')
      .select('id, display_name, avatar_url, app_uid')
      .eq('app_uid', trimmedQuery).limit(1);
    
    if (exactMatch && exactMatch.length > 0) {
      setUserSearchResults(exactMatch);
      return;
    }
    
    // Try partial match on app_uid then name
    const { data } = await supabase.from('profiles').select('id, display_name, avatar_url, app_uid')
      .or(`app_uid.ilike.%${trimmedQuery}%,display_name.ilike.%${trimmedQuery}%`).limit(10);
    setUserSearchResults(data || []);
  };

  const handleAddHelper = async () => {
    if (!selectedUser) return;
    setProcessing(true);
    try {
      const __as = getAdminSession(); const user = __as?.admin_id ? ({ id: __as.admin_id } as { id: string }) : null;
      const { error } = await supabase.from('topup_helpers').insert({
        user_id: selectedUser.id, is_active: true, is_verified: true,
        approved_at: new Date().toISOString(), approved_by: user?.id
      });
      if (error) throw error;
      toast({ title: "Success", description: "New helper added" });
      setShowAddModal(false); setSelectedUser(null); fetchHelpers();
    } catch (error: any) {
      toast({ title: "Failed", description: error.message, variant: "destructive" });
    } finally { setProcessing(false); }
  };

  const handleToggleHelper = async (helper: any, action: 'activate' | 'deactivate') => {
    const newStatus = action === 'activate';

    const { error: updateError } = await supabase.from('topup_helpers').update({ is_active: newStatus }).eq('id', helper.id);

    if (updateError) {
      recordAdminError({ kind: "rpc", label: "AdminCoinTraders.CointradersFailedToToggleHelper", message: formatAdminError(updateError)});
      toast({ title: "Error", description: `Failed to ${action} helper: ${updateError.message}`, variant: "destructive" });
      return;
    }

    // Verify update
    const { data: verifyData } = await supabase
      .from('topup_helpers')
      .select('is_active')
      .eq('id', helper.id)
      .maybeSingle();

    if (verifyData?.is_active !== newStatus) {
      recordAdminError({ kind: "rpc", label: "AdminCoinTraders.ToggleVerify", message: `Toggle verification mismatch: expected ${newStatus}, got ${verifyData?.is_active}` });
      toast({ title: "Error", description: `Database update failed - status did not change.`, variant: "destructive" });
      return;
    }

    // If Level 5 payroll helper, update agency commission rate instantly
    if (helper.trader_level === 5 && helper.payroll_enabled) {
      const { data: agency } = await supabase
        .from('agencies')
        .select('id, level')
        .eq('owner_id', helper.user_id)
        .maybeSingle();

      if (agency) {
        if (action === 'deactivate') {
          const levelMap: Record<string, string> = { 'A1': 'bronze', 'A2': 'silver', 'A3': 'gold', 'A4': 'platinum', 'A5': 'diamond' };
          const tierCode = levelMap[agency.level || 'A1'] || agency.level || 'bronze';
          const { data: tier } = await supabase
            .from('agency_level_tiers')
            .select('commission_rate')
            .eq('level_code', tierCode)
            .eq('is_active', true)
            .maybeSingle();
          await supabase.from('agencies').update({ commission_rate: tier?.commission_rate || 3 }).eq('id', agency.id);
        } else {
          await supabase.from('agencies').update({ commission_rate: 12 }).eq('id', agency.id);
        }
      }
    }

    console.log(`[CoinTraders] Helper ${helper.id} successfully ${action}d. Verified is_active=${newStatus}`);
    toast({ title: "Success ✅", description: `Helper ${action === 'activate' ? 'activated' : 'deactivated'} successfully` });
    fetchHelpers();
  };

  // Manual Coin Transfer to Helper's Wallet
  const handleCoinTransfer = async () => {
    if (!selectedHelper || !transferAmount) return;
    
    const amount = parseInt(transferAmount);
    if (isNaN(amount) || amount <= 0) {
      toast({ title: "Error", description: "Enter a valid amount", variant: "destructive" });
      return;
    }

    setIsTransferring(true);
    try {
      const __as = getAdminSession(); const user = __as?.admin_id ? ({ id: __as.admin_id } as { id: string }) : null;
      
      // Update helper's wallet balance
      const newBalance = (selectedHelper.wallet_balance || 0) + amount;
      const { error: updateError } = await supabase
        .from('topup_helpers')
        .update({ 
          wallet_balance: newBalance,
          total_bought: (selectedHelper.total_bought || 0) + amount 
        })
        .eq('id', selectedHelper.id);

      if (updateError) throw updateError;

      // Log the transaction
      const { error: txError } = await supabase
        .from('helper_transactions')
        .insert({
          helper_id: selectedHelper.id,
          transaction_type: 'admin_transfer',
          coin_amount: amount,
          usd_amount: 0,
          status: 'completed',
          notes: transferNote || `Admin manual transfer: ${amount} Diamonds`,
          processed_by: user?.id,
          processed_at: new Date().toISOString()
        });

      if (txError) throw txError;

      // Send notification to helper
      await adminSendNotification(selectedHelper.user_id, '💎 Diamonds Added!', `${amount.toLocaleString()} diamonds have been added to your Trader Wallet`, 'diamonds_credited')

      toast({
        title: "✅ Transfer Successful",
        description: `${amount.toLocaleString()} diamonds added to ${selectedHelper.user?.display_name}'s wallet`,
      });

      // Reset and refresh
      setShowTransferModal(false);
      setSelectedHelper(null);
      setTransferAmount("");
      setTransferNote("");
      fetchHelpers();
      fetchTransactions();

    } catch (error: any) {
      recordAdminError({ kind: "rpc", label: "AdminCoinTraders.TransferError", message: formatAdminError(error)});
      toast({
        title: "Failed",
        description: error.message || "Transfer failed",
        variant: "destructive"
      });
    } finally {
      setIsTransferring(false);
    }
  };

  const openTransferModal = (helper: any) => {
    setSelectedHelper(helper);
    setTransferAmount("");
    setTransferNote("");
    setShowTransferModal(true);
  };

  // Open Payment Methods Edit Modal
  const openPaymentModal = (helper: any) => {
    setEditingHelper(helper);
    const credentials = helper.payment_credentials || {};
    setPaymentMethods({
      manual: {
        enabled: credentials.manual?.enabled || false,
        accountName: credentials.manual?.accountName || "",
        accountNumber: credentials.manual?.accountNumber || "",
        bankName: credentials.manual?.bankName || "",
        instructions: credentials.manual?.instructions || ""
      },
      binance: {
        enabled: credentials.binance?.enabled || false,
        payId: credentials.binance?.payId || "",
        email: credentials.binance?.email || ""
      },
      epay: {
        enabled: credentials.epay?.enabled || false,
        accountId: credentials.epay?.accountId || "",
        phone: credentials.epay?.phone || ""
      }
    });
    setShowPaymentModal(true);
  };

  // Save Payment Methods
  const handleSavePaymentMethods = async () => {
    if (!editingHelper) return;
    setIsSavingPayment(true);
    try {
      const { error } = await supabase
        .from('topup_helpers')
        .update({
          payment_credentials: paymentMethods
        })
        .eq('id', editingHelper.id);

      if (error) throw error;

      toast({
        title: "✅ Success",
        description: "Payment method updated"
      });
      setShowPaymentModal(false);
      setEditingHelper(null);
      fetchHelpers();
    } catch (error: any) {
      toast({
        title: "Failed",
        description: error.message,
        variant: "destructive"
      });
    } finally {
      setIsSavingPayment(false);
    }
  };

  const handleProcessTransaction = async (txn: any, action: 'approve' | 'reject') => {
    await supabase.from('helper_transactions').update({ 
      status: action === 'approve' ? 'completed' : 'failed', processed_at: new Date().toISOString() 
    }).eq('id', txn.id);
    if (action === 'approve' && txn.transaction_type === 'buy_from_platform') {
      await supabase.from('topup_helpers').update({ 
        wallet_balance: (txn.helper?.wallet_balance || 0) + txn.coin_amount 
      }).eq('id', txn.helper_id);
    }
    toast({ title: "Success", description: action === 'approve' ? 'Approved' : 'Rejected' });
    fetchTransactions(); fetchHelpers();
  };

  const filteredHelpers = helpers.filter(h => {
    const matchesSearch = !searchQuery || h.user?.display_name?.toLowerCase().includes(searchQuery.toLowerCase()) || h.user?.app_uid?.includes(searchQuery);
    const matchesStatus = statusFilter === 'all' || (statusFilter === 'active' && h.is_active) || (statusFilter === 'inactive' && !h.is_active);
    return matchesSearch && matchesStatus;
  });

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="bg-gradient-to-r from-emerald-500 via-teal-500 to-cyan-500 p-6 rounded-b-3xl shadow-lg">
        <div className="flex items-center gap-3 mb-4">
          <Button variant="ghost" size="icon" className="text-white hover:bg-white/20" onClick={() => navigate('/admin')}>
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <div className="flex-1">
            <h1 className="font-bold text-xl text-white">Diamond Traders</h1>
            <p className="text-white/80 text-sm">Diamond Trader Management</p>
          </div>
          <div className="flex gap-2">
            <Button 
              onClick={() => {
                const activeHelper = helpers.find(h => h.is_active);
                if (activeHelper) {
                  openPaymentModal(activeHelper);
                } else if (helpers.length > 0) {
                  openPaymentModal(helpers[0]);
                } else {
                  toast({ title: "No helpers found", variant: "destructive" });
                }
              }} 
              className="bg-white/20 hover:bg-white/30 text-white gap-2"
              size="sm"
            >
              <CreditCard className="w-4 h-4" />
              Payment Setup
            </Button>
            <Button 
              onClick={() => setShowTransferModal(true)} 
              className="bg-white/20 hover:bg-white/30 text-white gap-2"
              size="sm"
            >
              <Send className="w-4 h-4" />
              Transfer
            </Button>
          </div>
        </div>
        <div className="grid grid-cols-5 gap-2">
          <div className="bg-white/20 backdrop-blur-sm rounded-xl p-3 text-center">
            <p className="text-xl font-bold text-white">{stats.totalHelpers}</p><p className="text-white/80 text-xs">Total</p>
          </div>
          <div className="bg-white/20 backdrop-blur-sm rounded-xl p-3 text-center">
            <p className="text-xl font-bold text-green-200">{stats.activeHelpers}</p><p className="text-white/80 text-xs">Active</p>
          </div>
          <div className="bg-white/20 backdrop-blur-sm rounded-xl p-3 text-center">
            <p className="text-xl font-bold text-emerald-200">{stats.visibleTraders}</p><p className="text-white/80 text-xs">Visible</p>
          </div>
          <div className="bg-white/20 backdrop-blur-sm rounded-xl p-3 text-center">
            <p className="text-xl font-bold text-yellow-200">{stats.pendingTransactions}</p><p className="text-white/80 text-xs">Pending</p>
          </div>
          <div className="bg-white/20 backdrop-blur-sm rounded-xl p-3 text-center">
            <p className="text-xl font-bold text-white">{(stats.totalCoinsTraded / 1000).toFixed(0)}K</p><p className="text-white/80 text-xs">Diamonds</p>
          </div>
        </div>
      </div>

      <div className="px-4 -mt-4">
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="w-full bg-white shadow-md rounded-xl p-1">
            <TabsTrigger value="helpers" className="flex-1 data-[state=active]:bg-emerald-500 data-[state=active]:text-white rounded-lg">
              <Users className="w-4 h-4 mr-2" />Helpers
            </TabsTrigger>
            <TabsTrigger value="transactions" className="flex-1 data-[state=active]:bg-emerald-500 data-[state=active]:text-white rounded-lg">
              <Coins className="w-4 h-4 mr-2" />Transactions
            </TabsTrigger>
          </TabsList>

          <TabsContent value="helpers" className="mt-4">
            <div className="flex gap-2 mb-4">
              <div className="flex-1 relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <Input placeholder="Search..." value={searchQuery} onChange={e => setSearchQuery(e.target.value)} className="pl-10" />
              </div>
              <Button onClick={() => setShowAddModal(true)} className="gap-2 bg-emerald-500 hover:bg-emerald-600">
                <Plus className="w-4 h-4" />New
              </Button>
            </div>

            {loading ? <div className="text-center py-12">Loading...</div> : filteredHelpers.length === 0 ? (
              <div className="text-center py-12 bg-white rounded-2xl"><Users className="w-12 h-12 mx-auto mb-3 text-slate-300" /><p className="text-slate-500">No helpers found</p></div>
            ) : (
              <div className="space-y-3">
                {filteredHelpers.map(helper => (
                  <Card key={helper.id} className={cn(
                    "border-l-4",
                    helper.trader_level === 5 ? "border-l-amber-500" : 
                    (helper.wallet_balance || 0) >= 100000 ? "border-l-green-500" : "border-l-red-400"
                  )}>
                    <CardContent className="p-4">
                      <div className="flex items-center gap-4">
                        <Avatar className="w-14 h-14 ring-2 ring-emerald-200">
                          <AvatarImage src={helper.user?.avatar_url || ''} />
                          <AvatarFallback>{helper.user?.display_name?.charAt(0) || 'H'}</AvatarFallback>
                        </Avatar>
                        <div className="flex-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <h3 className="font-semibold">{helper.user?.display_name || 'Unknown'}</h3>
                            {helper.is_active ? <Badge className="bg-green-100 text-green-700 text-xs">Active</Badge> : <Badge className="bg-slate-100 text-slate-700 text-xs">Inactive</Badge>}
                            <Badge className={cn("text-xs", 
                              helper.trader_level === 5 ? "bg-amber-100 text-amber-700" : "bg-blue-100 text-blue-700"
                            )}>
                              Lv.{helper.trader_level || 1} {helper.trader_level === 5 ? 'Payroll' : 'Trader'}
                            </Badge>
                            {helper.trader_level !== 5 && (
                              <Badge className={cn("text-xs",
                                (helper.wallet_balance || 0) >= 100000 
                                  ? "bg-emerald-100 text-emerald-700" 
                                  : "bg-red-100 text-red-600"
                              )}>
                                {(helper.wallet_balance || 0) >= 100000 ? '👁 Visible' : '🚫 Hidden'}
                              </Badge>
                            )}
                          </div>
                          <p className="text-sm text-slate-500">
                            ID: {helper.user?.app_uid}
                            {helper.user?.country_flag && <span className="ml-2">{helper.user.country_flag} {helper.user.country_name || helper.user.country_code}</span>}
                          </p>
                          <div className="flex items-center gap-4 mt-1 text-xs text-slate-600">
                            <span className="flex items-center gap-1"><Wallet className="w-3 h-3" />{(helper.wallet_balance || 0).toLocaleString()} 💎</span>
                            <span className="flex items-center gap-1"><ArrowUpRight className="w-3 h-3 text-green-500" />Bought: {(helper.total_bought || 0).toLocaleString()}</span>
                            <span className="flex items-center gap-1"><ArrowDownLeft className="w-3 h-3 text-blue-500" />Sold: {(helper.total_sold || 0).toLocaleString()}</span>
                          </div>
                          {helper.trader_level !== 5 && (helper.wallet_balance || 0) < 100000 && (
                            <p className="text-[10px] text-red-500 mt-1">⚠️ Need {(100000 - (helper.wallet_balance || 0)).toLocaleString()} more diamonds to be visible on Recharge page</p>
                          )}
                        </div>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild><Button variant="ghost" size="icon"><MoreVertical className="w-4 h-4" /></Button></DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={() => openTransferModal(helper)}>
                              <Send className="w-4 h-4 mr-2 text-emerald-600" />Diamond Transfer
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => openPaymentModal(helper)}>
                              <CreditCard className="w-4 h-4 mr-2 text-blue-600" />Edit Payment Method
                            </DropdownMenuItem>
                            {helper.is_active ? (
                              <DropdownMenuItem onClick={() => handleToggleHelper(helper, 'deactivate')} className="text-red-600"><Ban className="w-4 h-4 mr-2" />Deactivate</DropdownMenuItem>
                            ) : (
                              <DropdownMenuItem onClick={() => handleToggleHelper(helper, 'activate')} className="text-green-600"><UserCheck className="w-4 h-4 mr-2" />Activate</DropdownMenuItem>
                            )}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </TabsContent>

          <TabsContent value="transactions" className="mt-4">
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-lg flex items-center gap-2"><Clock className="w-5 h-5" />Transactions</CardTitle></CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Helper</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead>Amount</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {transactions.map(txn => (
                      <TableRow key={txn.id}>
                        <TableCell>{txn.helper?.user?.display_name || 'Unknown'}</TableCell>
                        <TableCell>
                          <Badge variant="outline" className={cn(
                            txn.transaction_type === 'admin_transfer' && 'border-emerald-500 text-emerald-700',
                            txn.transaction_type === 'buy_from_platform' && 'border-blue-500 text-blue-700',
                            txn.transaction_type === 'sell_to_user' && 'border-orange-500 text-orange-700'
                          )}>
                            {txn.transaction_type === 'admin_transfer' ? 'Admin Transfer' :
                             txn.transaction_type === 'buy_from_platform' ? 'From Platform' :
                             txn.transaction_type === 'sell_to_user' ? 'Sold to User' : txn.transaction_type}
                          </Badge>
                        </TableCell>
                        <TableCell className="font-semibold text-amber-600">{txn.coin_amount.toLocaleString()} 💎</TableCell>
                        <TableCell>
                          {txn.status === 'completed' ? (
                            <Badge className="bg-green-100 text-green-700">Completed</Badge>
                          ) : txn.status === 'pending' ? (
                            <Badge className="bg-yellow-100 text-yellow-700">Pending</Badge>
                          ) : (
                            <Badge className="bg-red-100 text-red-700">Failed</Badge>
                          )}
                        </TableCell>
                        <TableCell>
                          {txn.status === 'pending' && (
                            <div className="flex gap-1">
                              <Button size="sm" variant="ghost" className="text-green-600" onClick={() => handleProcessTransaction(txn, 'approve')}>
                                <Check className="w-4 h-4" />
                              </Button>
                              <Button size="sm" variant="ghost" className="text-red-600" onClick={() => handleProcessTransaction(txn, 'reject')}>
                                <X className="w-4 h-4" />
                              </Button>
                            </div>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>

      {/* Add Helper Modal */}
      <Dialog open={showAddModal} onOpenChange={setShowAddModal}>
        <DialogContent>
          <DialogHeader><DialogTitle>Add New Helper</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <Input placeholder="Search by name or ID..." value={userSearchQuery} onChange={e => { setUserSearchQuery(e.target.value); searchUsers(e.target.value); }} className="pl-10" />
            </div>
            {userSearchResults.length > 0 && (
              <div className="border rounded-lg divide-y max-h-48 overflow-y-auto">
                {userSearchResults.map(user => (
                  <button key={user.id} onClick={() => { setSelectedUser(user); setUserSearchResults([]); setUserSearchQuery(user.display_name); }} className="w-full flex items-center gap-3 p-3 hover:bg-slate-50">
                    <Avatar className="w-10 h-10"><AvatarImage src={user.avatar_url} /><AvatarFallback>{user.display_name?.charAt(0)}</AvatarFallback></Avatar>
                    <div className="text-left"><p className="font-medium text-sm">{user.display_name}</p><p className="text-xs text-slate-500">ID: {user.app_uid}</p></div>
                  </button>
                ))}
              </div>
            )}
            {selectedUser && (
              <div className="p-4 bg-emerald-50 rounded-lg border border-emerald-200 flex items-center gap-3">
                <Avatar className="w-12 h-12"><AvatarImage src={selectedUser.avatar_url} /><AvatarFallback>{selectedUser.display_name?.charAt(0)}</AvatarFallback></Avatar>
                <div><p className="font-semibold">{selectedUser.display_name}</p><p className="text-sm text-slate-600">ID: {selectedUser.app_uid}</p></div>
                <Check className="w-6 h-6 text-emerald-500 ml-auto" />
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAddModal(false)}>Cancel</Button>
            <Button onClick={handleAddHelper} disabled={!selectedUser || processing} className="bg-emerald-500 hover:bg-emerald-600">{processing ? "Processing..." : "Add"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Coin Transfer Modal */}
      <Dialog open={showTransferModal} onOpenChange={setShowTransferModal}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Send className="w-5 h-5 text-emerald-600" />
              Transfer Diamonds to Trader
            </DialogTitle>
            <DialogDescription>
              Manually add diamonds to trader's wallet
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4">
            {/* Helper Selection */}
            {!selectedHelper ? (
              <div className="space-y-2">
                <Label>Select Trader</Label>
                <div className="max-h-48 overflow-y-auto space-y-2 border rounded-lg p-2">
                  {helpers.filter(h => h.is_active).map(helper => (
                    <button
                      key={helper.id}
                      onClick={() => setSelectedHelper(helper)}
                      className="w-full flex items-center gap-3 p-3 rounded-lg hover:bg-slate-50 border transition-colors"
                    >
                      <Avatar className="w-10 h-10">
                        <AvatarImage src={helper.user?.avatar_url} />
                        <AvatarFallback>{helper.user?.display_name?.charAt(0)}</AvatarFallback>
                      </Avatar>
                      <div className="text-left flex-1">
                        <p className="font-medium text-sm">{helper.user?.display_name}</p>
                        <p className="text-xs text-slate-500">Wallet: {(helper.wallet_balance || 0).toLocaleString()}</p>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <>
                {/* Selected Helper Display */}
                <div className="p-4 bg-gradient-to-r from-emerald-50 to-teal-50 rounded-xl border border-emerald-200">
                  <div className="flex items-center gap-3">
                    <Avatar className="w-12 h-12 ring-2 ring-emerald-300">
                      <AvatarImage src={selectedHelper.user?.avatar_url} />
                      <AvatarFallback>{selectedHelper.user?.display_name?.charAt(0)}</AvatarFallback>
                    </Avatar>
                    <div className="flex-1">
                      <p className="font-semibold">{selectedHelper.user?.display_name}</p>
                      <p className="text-sm text-emerald-700">ID: {selectedHelper.user?.app_uid}</p>
                    </div>
                    <Button variant="ghost" size="sm" onClick={() => setSelectedHelper(null)}>
                      Change
                    </Button>
                  </div>
                  <div className="mt-3 pt-3 border-t border-emerald-200 flex justify-between text-sm">
                     <span className="text-emerald-600">Current Wallet:</span>
                     <span className="font-bold text-emerald-700">{(selectedHelper.wallet_balance || 0).toLocaleString()} Diamonds</span>
                  </div>
                </div>

                {/* Amount Input */}
                <div className="space-y-2">
                   <Label>Diamond Amount</Label>
                   <div className="relative">
                     <Coins className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-amber-500" />
                     <Input
                       type="number"
                       placeholder="e.g. 100000"
                      value={transferAmount}
                      onChange={(e) => setTransferAmount(e.target.value)}
                      className="pl-10 text-lg font-medium h-12"
                    />
                  </div>
                  
                  {/* Quick Amount Buttons */}
                  <div className="flex flex-wrap gap-2">
                    {[10000, 50000, 100000, 500000, 1000000].map((amount) => (
                      <Button
                        key={amount}
                        variant="outline"
                        size="sm"
                        onClick={() => setTransferAmount(amount.toString())}
                        className={`text-xs ${transferAmount === amount.toString() ? 'border-emerald-500 bg-emerald-50' : ''}`}
                      >
                        {(amount / 1000)}K
                      </Button>
                    ))}
                  </div>
                </div>

                {/* Note Input */}
                <div className="space-y-2">
                   <Label>Note (optional)</Label>
                   <Textarea
                     placeholder="Reason for transfer..."
                     value={transferNote}
                    onChange={(e) => setTransferNote(e.target.value)}
                    rows={2}
                  />
                </div>

                {/* Summary */}
                {transferAmount && parseInt(transferAmount) > 0 && (
                  <div className="p-4 bg-amber-50 rounded-lg border border-amber-200">
                    <div className="flex justify-between items-center">
                     <span className="text-amber-700">Wallet after transfer:</span>
                       <span className="font-bold text-lg text-amber-800">
                         {((selectedHelper.wallet_balance || 0) + parseInt(transferAmount)).toLocaleString()} Diamonds
                      </span>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => { setShowTransferModal(false); setSelectedHelper(null); }} disabled={isTransferring}>
               Cancel
            </Button>
            <Button 
              onClick={handleCoinTransfer} 
              disabled={!selectedHelper || !transferAmount || parseInt(transferAmount) <= 0 || isTransferring}
              className="bg-emerald-600 hover:bg-emerald-700"
            >
              {isTransferring ? (
                <>
                   <Loader2 className="w-4 h-4 animate-spin mr-2" />
                   Processing...
                 </>
               ) : (
                 <>
                   <Send className="w-4 h-4 mr-2" />
                   Transfer
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Payment Methods Edit Modal */}
      <Dialog open={showPaymentModal} onOpenChange={setShowPaymentModal}>
        <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
               <CreditCard className="w-5 h-5 text-blue-600" />
               Payment Method Settings
             </DialogTitle>
             <DialogDescription>
               Edit payment methods for {editingHelper?.user?.display_name}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-6">
            {/* Manual/Bank Transfer */}
            <div className="border rounded-xl p-4">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-green-100 flex items-center justify-center">
                    <Wallet className="w-5 h-5 text-green-600" />
                  </div>
                  <div>
                     <h4 className="font-medium">Manual/Bank</h4>
                     <p className="text-xs text-slate-500">bKash, Nagad, Bank Transfer</p>
                  </div>
                </div>
                <Switch
                  checked={paymentMethods.manual.enabled}
                  onCheckedChange={(checked) => setPaymentMethods(prev => ({
                    ...prev,
                    manual: { ...prev.manual, enabled: checked }
                  }))}
                />
              </div>
              {paymentMethods.manual.enabled && (
                <div className="space-y-3 pt-3 border-t">
                  <div>
                   <Label className="text-xs">Account Name</Label>
                     <Input
                       placeholder="e.g. bKash Personal"
                       value={paymentMethods.manual.accountName}
                      onChange={(e) => setPaymentMethods(prev => ({
                        ...prev,
                        manual: { ...prev.manual, accountName: e.target.value }
                      }))}
                    />
                  </div>
                  <div>
                   <Label className="text-xs">Account Number</Label>
                     <Input
                       placeholder="e.g. 01XXXXXXXXX"
                       value={paymentMethods.manual.accountNumber}
                      onChange={(e) => setPaymentMethods(prev => ({
                        ...prev,
                        manual: { ...prev.manual, accountNumber: e.target.value }
                      }))}
                    />
                  </div>
                  <div>
                   <Label className="text-xs">Bank/Service Name</Label>
                     <Input
                       placeholder="e.g. bKash, Nagad, DBBL"
                       value={paymentMethods.manual.bankName}
                      onChange={(e) => setPaymentMethods(prev => ({
                        ...prev,
                        manual: { ...prev.manual, bankName: e.target.value }
                      }))}
                    />
                  </div>
                  <div>
                   <Label className="text-xs">Instructions (optional)</Label>
                     <Textarea
                       placeholder="Payment instructions..."
                       value={paymentMethods.manual.instructions}
                      onChange={(e) => setPaymentMethods(prev => ({
                        ...prev,
                        manual: { ...prev.manual, instructions: e.target.value }
                      }))}
                      rows={2}
                    />
                  </div>
                </div>
              )}
            </div>

            {/* Binance Pay */}
            <div className="border rounded-xl p-4">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-yellow-100 flex items-center justify-center">
                    <DollarSign className="w-5 h-5 text-yellow-600" />
                  </div>
                  <div>
                    <h4 className="font-medium">Binance Pay</h4>
                    <p className="text-xs text-slate-500">Crypto Payment</p>
                  </div>
                </div>
                <Switch
                  checked={paymentMethods.binance.enabled}
                  onCheckedChange={(checked) => setPaymentMethods(prev => ({
                    ...prev,
                    binance: { ...prev.binance, enabled: checked }
                  }))}
                />
              </div>
              {paymentMethods.binance.enabled && (
                <div className="space-y-3 pt-3 border-t">
                  <div>
                    <Label className="text-xs">Binance Pay ID</Label>
                    <Input
                      placeholder="e.g. 123456789"
                      value={paymentMethods.binance.payId}
                      onChange={(e) => setPaymentMethods(prev => ({
                        ...prev,
                        binance: { ...prev.binance, payId: e.target.value }
                      }))}
                    />
                  </div>
                  <div>
                    <Label className="text-xs">Binance Email</Label>
                    <Input
                      placeholder="example@email.com"
                      value={paymentMethods.binance.email}
                      onChange={(e) => setPaymentMethods(prev => ({
                        ...prev,
                        binance: { ...prev.binance, email: e.target.value }
                      }))}
                    />
                  </div>
                </div>
              )}
            </div>

            {/* ePay */}
            <div className="border rounded-xl p-4">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-purple-100 flex items-center justify-center">
                    <Smartphone className="w-5 h-5 text-purple-600" />
                  </div>
                  <div>
                    <h4 className="font-medium">ePay</h4>
                    <p className="text-xs text-slate-500">ePay Payment</p>
                  </div>
                </div>
                <Switch
                  checked={paymentMethods.epay.enabled}
                  onCheckedChange={(checked) => setPaymentMethods(prev => ({
                    ...prev,
                    epay: { ...prev.epay, enabled: checked }
                  }))}
                />
              </div>
              {paymentMethods.epay.enabled && (
                <div className="space-y-3 pt-3 border-t">
                  <div>
                    <Label className="text-xs">ePay Account ID</Label>
                    <Input
                      placeholder="Account ID"
                      value={paymentMethods.epay.accountId}
                      onChange={(e) => setPaymentMethods(prev => ({
                        ...prev,
                        epay: { ...prev.epay, accountId: e.target.value }
                      }))}
                    />
                  </div>
                  <div>
                    <Label className="text-xs">Phone Number</Label>
                    <Input
                      placeholder="+880XXXXXXXXXX"
                      value={paymentMethods.epay.phone}
                      onChange={(e) => setPaymentMethods(prev => ({
                        ...prev,
                        epay: { ...prev.epay, phone: e.target.value }
                      }))}
                    />
                  </div>
                </div>
              )}
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowPaymentModal(false)} disabled={isSavingPayment}>
               Cancel
            </Button>
            <Button 
              onClick={handleSavePaymentMethods} 
              disabled={isSavingPayment}
              className="bg-blue-600 hover:bg-blue-700"
            >
              {isSavingPayment ? (
                <>
                   <Loader2 className="w-4 h-4 animate-spin mr-2" />
                   Saving...
                 </>
               ) : (
                 <>
                   <Check className="w-4 h-4 mr-2" />
                   Save
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default AdminCoinTraders;
