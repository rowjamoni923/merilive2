 import { useState, useEffect } from "react";
 import { motion } from "framer-motion";
 import {
   Globe,
   CheckCircle,
   XCircle,
   Clock,
   Search,
   Eye,
   Building2,
   Loader2,
   RefreshCw,
   Download,
   DollarSign,
   AlertCircle
 } from "lucide-react";
 import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
 import { Button } from "@/components/ui/button";
 import { Input } from "@/components/ui/input";
 import { Badge } from "@/components/ui/badge";
 import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
 import {
   Table,
   TableBody,
   TableCell,
   TableHead,
   TableHeader,
   TableRow,
 } from "@/components/ui/table";
 import {
   Dialog,
   DialogContent,
   DialogDescription,
   DialogFooter,
   DialogHeader,
   DialogTitle,
 } from "@/components/ui/dialog";
 import { Textarea } from "@/components/ui/textarea";
 import { ScrollArea } from "@/components/ui/scroll-area";
 import { adminSupabase as supabase } from "@/integrations/supabase/adminClient";
 import { toast } from "sonner";
 import { format } from "date-fns";
 
interface PaymentDetails {
  country_code?: string;
  currency_code?: string;
  local_amount?: number;
  exchange_rate?: number;
  usd_amount?: number;
  account_name?: string;
  account_number?: string;
  bank_name?: string;
  additional_info?: string;
  swift_pay_payout?: {
    payment_id?: string;
    payout_id?: string;
    swift_withdrawal_id?: string;
    status?: string;
    pay_currency?: string;
    pay_address?: string;
    pay_network?: string;
    amount_usd?: number;
    error?: unknown;
    at?: string;
  };
}

interface EpayWithdrawal {
  id: string;
  agency_id: string;
  amount: number;
  status: string;
  payment_method: string;
  payment_details: PaymentDetails | null;
  requested_at: string;
  processed_at: string | null;
  notes: string | null;
  agency?: {
    name: string;
    agency_code: string;
    owner_id?: string;
  };
}

 
 const CURRENCY_INFO: Record<string, { symbol: string; flag: string; name: string }> = {
   BDT: { symbol: "Tk ", flag: "🇧🇩", name: "Bangladesh" },
   INR: { symbol: "₹", flag: "🇮🇳", name: "India" },
   PKR: { symbol: "Rs", flag: "🇵🇰", name: "Pakistan" },
   EUR: { symbol: "€", flag: "🇪🇺", name: "Europe" },
   GBP: { symbol: "£", flag: "🇬🇧", name: "UK" },
   USD: { symbol: "$", flag: "🇺🇸", name: "USA" },
   AED: { symbol: "د.إ", flag: "🇦🇪", name: "UAE" },
   SAR: { symbol: "﷼", flag: "🇸🇦", name: "Saudi Arabia" },
 };
 
 export default function AdminEpayWithdrawals() {
   const [withdrawals, setWithdrawals] = useState<EpayWithdrawal[]>([]);
   const [loading, setLoading] = useState(true);
   const [processing, setProcessing] = useState(false);
   const [selectedWithdrawal, setSelectedWithdrawal] = useState<EpayWithdrawal | null>(null);
   const [showDetailDialog, setShowDetailDialog] = useState(false);
   const [showActionDialog, setShowActionDialog] = useState(false);
   const [actionType, setActionType] = useState<'complete' | 'reject'>('complete');
   const [actionNotes, setActionNotes] = useState("");
   const [searchQuery, setSearchQuery] = useState("");
   const [diamondsToUsdRate, setDiamondsToUsdRate] = useState(9000);
 
   useEffect(() => {
     fetchEpayWithdrawals();
     fetchSettings();
   }, []);
 
   const fetchSettings = async () => {
     const { data } = await supabase
       .from('app_settings')
       .select('setting_value')
       .eq('setting_key', 'beans_to_usd_rate')
       .maybeSingle();
     
     if (data?.setting_value) {
       const settings = data.setting_value as { rate?: number };
       if (settings.rate) {
         setDiamondsToUsdRate(settings.rate);
       }
     }
   };
 
  const fetchEpayWithdrawals = async () => {
    setLoading(true);
    try {
      // Pkg382: ePay gateway has been removed. Auto-withdrawals now flow through
      // SwiftPay / MeriCash (USDT TRC20). We show every auto-payout row here so admin
      // can monitor SwiftPay payout_id / status without leaving the panel.
      const { data, error } = await supabase
        .from("agency_withdrawals")
        .select(`
          *,
          agency:agencies(name, agency_code, owner_id)
        `)
        .in('payment_method', ['crypto_auto', 'usdt', 'usdttrc20'])
        .order("requested_at", { ascending: false });

      if (error) throw error;

      const enrichedData = (data || []).map(w => ({
          ...w,
          payment_details: w.payment_details as PaymentDetails | null,
        })) as unknown as EpayWithdrawal[];

      setWithdrawals(enrichedData);
    } catch (error) {
      console.error("Error fetching MeriCash withdrawals:", error);
      toast.error("Failed to load MeriCash withdrawals");
    } finally {
      setLoading(false);
    }
  };

 
   const handleAction = async () => {
     if (!selectedWithdrawal) return;
 
     setProcessing(true);
     try {
       const newStatus = actionType === 'complete' ? 'approved' : 'rejected';

       const { data, error } = await supabase.rpc('admin_process_withdrawal', {
         _withdrawal_id: selectedWithdrawal.id,
         _status: newStatus,
         _notes: actionNotes || null,
       });

       if (error) throw error;
       const result = data as { success?: boolean; error?: string; message?: string } | null;
       if (result?.success === false) {
         throw new Error(result.error || result.message || 'Withdrawal processing failed');
       }
 
       // Send notification to agency owner
       if (selectedWithdrawal.agency?.owner_id) {
         const notifTitle = actionType === 'complete' ? '✅ MeriCash Withdrawal Completed!' : '❌ MeriCash Withdrawal Rejected';
         const notifMessage = actionType === 'complete' 
           ? `Your MeriCash (USDT) withdrawal has been completed.` 
           : `Your MeriCash (USDT) withdrawal has been rejected. ${actionNotes ? `Reason: ${actionNotes}` : ''}`;
         
         await supabase.from('notifications').insert({
           user_id: selectedWithdrawal.agency.owner_id,
           type: `withdrawal_${actionType}`,
           title: notifTitle,
           message: notifMessage,
           data: { withdrawal_id: selectedWithdrawal.id, amount: selectedWithdrawal.amount }
         });
       }
 
       toast.success(actionType === 'complete' ? 'MeriCash withdrawal marked completed!' : 'MeriCash withdrawal rejected');
       setShowActionDialog(false);
       setSelectedWithdrawal(null);
       setActionNotes("");
       fetchEpayWithdrawals();
     } catch (error) {
       console.error("Error processing MeriCash withdrawal:", error);
       toast.error("Failed to process withdrawal");
     } finally {
       setProcessing(false);
     }
   };
 
   const openActionDialog = (withdrawal: EpayWithdrawal, action: 'complete' | 'reject') => {
     setSelectedWithdrawal(withdrawal);
     setActionType(action);
     setShowActionDialog(true);
   };
 
   const getStatusBadge = (status: string) => {
     switch (status) {
       case 'pending':
         return <Badge className="bg-amber-100 text-amber-700 border border-amber-200"><Clock className="w-3 h-3 mr-1" /> Pending</Badge>;
       case 'processing':
         return <Badge className="bg-blue-100 text-blue-700 border border-blue-200"><Loader2 className="w-3 h-3 mr-1 animate-spin" /> Processing</Badge>;
        case 'completed':
        case 'approved':
          return <Badge className="bg-green-100 text-green-700 border border-green-200"><CheckCircle className="w-3 h-3 mr-1" /> Completed</Badge>;
       case 'rejected':
         return <Badge className="bg-red-100 text-red-700 border border-red-200"><XCircle className="w-3 h-3 mr-1" /> Rejected</Badge>;
       default:
         return <Badge>{status}</Badge>;
     }
   };
 
   const getCurrencyInfo = (currencyCode: string) => {
     return CURRENCY_INFO[currencyCode] || { symbol: "$", flag: "🌍", name: "Unknown" };
   };
 
   const pendingCount = withdrawals.filter(w => w.status === 'pending').length;
   const totalPendingUsd = withdrawals
     .filter(w => w.status === 'pending')
     .reduce((sum, w) => sum + (w.payment_details?.usd_amount || w.amount / diamondsToUsdRate), 0);
 
   const filteredWithdrawals = withdrawals.filter(w =>
     w.agency?.name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
     w.agency?.agency_code?.toLowerCase().includes(searchQuery.toLowerCase())
   );
 
   return (
     <div className="space-y-4">
       {/* Header Card */}
       <Card className="bg-gradient-to-r from-indigo-500 via-purple-500 to-pink-500 text-white border-0 shadow-lg">
         <CardContent className="p-4">
           <div className="flex items-center gap-3">
             <div className="w-12 h-12 bg-white/20 rounded-xl flex items-center justify-center">
               <Globe className="w-6 h-6" />
             </div>
             <div className="flex-1">
               <h2 className="text-lg font-bold">MeriCash Auto-Withdrawals (USDT TRC20)</h2>
               <p className="text-white/80 text-sm">Auto-payouts handled by SwiftPay gateway. Use Complete/Reject only as fallback.</p>
             </div>
             <div className="text-right">
               <p className="text-2xl font-bold">{pendingCount}</p>
               <p className="text-white/80 text-xs">Pending</p>
             </div>
           </div>
           
           {pendingCount > 0 && (
             <div className="mt-3 p-3 bg-white/10 rounded-lg flex items-center justify-between">
               <div className="flex items-center gap-2">
                 <AlertCircle className="w-4 h-4 text-yellow-300" />
                 <span className="text-sm">Total Pending Amount:</span>
               </div>
               <span className="font-bold text-lg">${totalPendingUsd.toFixed(2)} USD</span>
             </div>
           )}
         </CardContent>
       </Card>
 
       {/* Search */}
       <div className="relative">
         <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
         <Input
           placeholder="Search by agency name or code..."
           className="pl-10 bg-white border-gray-200"
           value={searchQuery}
           onChange={(e) => setSearchQuery(e.target.value)}
         />
       </div>
 
       {/* Withdrawals Table */}
       <Card className="border-0 shadow-lg">
         <CardContent className="p-0">
           {loading ? (
             <div className="flex items-center justify-center py-12">
               <Loader2 className="w-8 h-8 animate-spin text-purple-500" />
             </div>
           ) : filteredWithdrawals.length === 0 ? (
             <div className="text-center py-12 text-gray-500">
               <Globe className="w-12 h-12 mx-auto mb-3 opacity-30" />
               <p>No MeriCash auto-withdrawal requests</p>
             </div>
           ) : (
             <ScrollArea className="max-h-[500px]">
               <Table>
                 <TableHeader className="bg-gray-50 sticky top-0">
                   <TableRow>
                     <TableHead>Agency</TableHead>
                     <TableHead>Amount</TableHead>
                     <TableHead>Country</TableHead>
                     <TableHead>Account Info</TableHead>
                     <TableHead>Status</TableHead>
                     <TableHead>Date</TableHead>
                     <TableHead className="text-right">Actions</TableHead>
                   </TableRow>
                 </TableHeader>
                 <TableBody>
                   {filteredWithdrawals.map((w) => {
                     const pd = w.payment_details;
                     const currencyInfo = getCurrencyInfo(pd?.currency_code || "USD");
                     const usdAmount = pd?.usd_amount || (w.amount / diamondsToUsdRate);
                     
                     return (
                       <TableRow key={w.id} className="hover:bg-gray-50">
                         <TableCell>
                           <div className="flex items-center gap-2">
                             <div className="w-8 h-8 bg-gradient-to-r from-purple-500 to-pink-500 rounded-full flex items-center justify-center text-white text-xs font-bold">
                               {w.agency?.name?.charAt(0) || 'A'}
                             </div>
                             <div>
                                <p className="font-medium text-foreground">{w.agency?.name}</p>
                                <p className="text-xs text-muted-foreground">#{w.agency?.agency_code}</p>
                             </div>
                           </div>
                         </TableCell>
                         <TableCell>
                           <div>
                              <p className="font-bold text-foreground">${usdAmount.toFixed(2)}</p>
                              {pd?.local_amount && (
                                <p className="text-xs text-muted-foreground">
                                  {currencyInfo.symbol}{pd.local_amount.toLocaleString()}
                               </p>
                             )}
                           </div>
                         </TableCell>
                         <TableCell>
                           <div className="flex items-center gap-2">
                             <span className="text-xl">{currencyInfo.flag}</span>
                             <span className="text-sm text-gray-600">{currencyInfo.name}</span>
                           </div>
                         </TableCell>
                         <TableCell>
                           <div className="text-sm">
                             <p className="font-medium">{pd?.account_name || '-'}</p>
                             <p className="text-gray-500">{pd?.account_number || '-'}</p>
                           </div>
                         </TableCell>
                         <TableCell>{getStatusBadge(w.status)}</TableCell>
                         <TableCell className="text-sm text-gray-500">
                           {format(new Date(w.requested_at), "dd MMM yyyy")}
                         </TableCell>
                         <TableCell className="text-right">
                           <div className="flex items-center justify-end gap-2">
                             <Button
                               variant="outline"
                               size="sm"
                               onClick={() => {
                                 setSelectedWithdrawal(w);
                                 setShowDetailDialog(true);
                               }}
                             >
                               <Eye className="w-4 h-4" />
                             </Button>
                             {w.status === 'pending' && (
                               <>
                                 <Button
                                   variant="default"
                                   size="sm"
                                   className="bg-green-500 hover:bg-green-600"
                                   onClick={() => openActionDialog(w, 'complete')}
                                 >
                                   <CheckCircle className="w-4 h-4" />
                                 </Button>
                                 <Button
                                   variant="destructive"
                                   size="sm"
                                   onClick={() => openActionDialog(w, 'reject')}
                                 >
                                   <XCircle className="w-4 h-4" />
                                 </Button>
                               </>
                             )}
                           </div>
                         </TableCell>
                       </TableRow>
                     );
                   })}
                 </TableBody>
               </Table>
             </ScrollArea>
           )}
         </CardContent>
       </Card>
 
       {/* Detail Dialog */}
       <Dialog open={showDetailDialog} onOpenChange={setShowDetailDialog}>
         <DialogContent className="max-w-lg">
           <DialogHeader>
             <DialogTitle className="flex items-center gap-2">
               <Globe className="w-5 h-5 text-purple-500" />
               MeriCash Withdrawal Details
             </DialogTitle>
           </DialogHeader>
           {selectedWithdrawal && (
             <div className="space-y-4">
               <div className="p-4 bg-gray-50 rounded-lg space-y-3">
                 <div className="flex justify-between">
                   <span className="text-gray-600">Agency:</span>
                   <span className="font-medium">{selectedWithdrawal.agency?.name}</span>
                 </div>
                 <div className="flex justify-between">
                   <span className="text-gray-600">Amount (USD):</span>
                   <span className="font-bold text-lg">
                     ${(selectedWithdrawal.payment_details?.usd_amount || selectedWithdrawal.amount / diamondsToUsdRate).toFixed(2)}
                   </span>
                 </div>
                 <div className="flex justify-between">
                   <span className="text-gray-600">Local Amount:</span>
                   <span className="font-medium">
                     {getCurrencyInfo(selectedWithdrawal.payment_details?.currency_code || 'USD').symbol}
                     {selectedWithdrawal.payment_details?.local_amount?.toLocaleString() || '-'}
                   </span>
                 </div>
                 <div className="flex justify-between">
                   <span className="text-gray-600">Account Name:</span>
                   <span className="font-medium">{selectedWithdrawal.payment_details?.account_name || '-'}</span>
                 </div>
                 <div className="flex justify-between">
                   <span className="text-gray-600">Account Number:</span>
                   <span className="font-medium">{selectedWithdrawal.payment_details?.account_number || '-'}</span>
                 </div>
                 {selectedWithdrawal.payment_details?.bank_name && (
                   <div className="flex justify-between">
                     <span className="text-gray-600">Bank/Provider:</span>
                     <span className="font-medium">{selectedWithdrawal.payment_details.bank_name}</span>
                   </div>
                 )}
                 {selectedWithdrawal.payment_details?.additional_info && (
                   <div className="pt-2 border-t">
                     <span className="text-gray-600 text-sm">Additional Info:</span>
                     <p className="mt-1 text-sm">{selectedWithdrawal.payment_details.additional_info}</p>
                   </div>
                 )}
                </div>
                {selectedWithdrawal.payment_details?.swift_pay_payout && (
                  <div className="p-3 bg-indigo-500/10 rounded-lg border border-indigo-500/30 space-y-1 text-sm">
                    <div className="font-semibold text-indigo-600 mb-1">💎 SwiftPay / MeriCash Payout</div>
                    <div className="flex justify-between"><span className="text-muted-foreground">Status:</span><span className="font-mono">{selectedWithdrawal.payment_details.swift_pay_payout.status || '-'}</span></div>
                    {selectedWithdrawal.payment_details.swift_pay_payout.payout_id && (
                      <div className="flex justify-between"><span className="text-muted-foreground">Payout ID:</span><span className="font-mono text-xs">{selectedWithdrawal.payment_details.swift_pay_payout.payout_id}</span></div>
                    )}
                    {selectedWithdrawal.payment_details.swift_pay_payout.swift_withdrawal_id && (
                      <div className="flex justify-between"><span className="text-muted-foreground">SwiftPay ID:</span><span className="font-mono text-xs">{selectedWithdrawal.payment_details.swift_pay_payout.swift_withdrawal_id}</span></div>
                    )}
                    {selectedWithdrawal.payment_details.swift_pay_payout.pay_network && (
                      <div className="flex justify-between"><span className="text-muted-foreground">Network:</span><span>{selectedWithdrawal.payment_details.swift_pay_payout.pay_network}</span></div>
                    )}
                    {selectedWithdrawal.payment_details.swift_pay_payout.amount_usd != null && (
                      <div className="flex justify-between"><span className="text-muted-foreground">Amount:</span><span>${Number(selectedWithdrawal.payment_details.swift_pay_payout.amount_usd).toFixed(2)} USDT</span></div>
                    )}
                    {selectedWithdrawal.payment_details.swift_pay_payout.error != null && (
                      <div className="mt-1 text-xs text-red-500 break-all">Error: {JSON.stringify(selectedWithdrawal.payment_details.swift_pay_payout.error)}</div>
                    )}
                  </div>
                )}
                <div className="flex justify-between items-center">
                   <span className="text-muted-foreground">Status:</span>
                   {getStatusBadge(selectedWithdrawal.status)}
                 </div>

                {selectedWithdrawal.notes && (
                  <div className="p-3 bg-yellow-500/10 rounded-lg border border-yellow-500/30">
                    <p className="text-sm text-yellow-400">{selectedWithdrawal.notes}</p>
                  </div>
               )}
             </div>
           )}
         </DialogContent>
       </Dialog>
 
       {/* Action Dialog */}
       <Dialog open={showActionDialog} onOpenChange={setShowActionDialog}>
         <DialogContent>
           <DialogHeader>
             <DialogTitle>
               {actionType === 'complete' ? '✅ Mark MeriCash Withdrawal Completed' : '❌ Reject MeriCash Withdrawal'}
             </DialogTitle>
             <DialogDescription>
               {actionType === 'complete' 
                 ? 'Confirm that you have processed this payment externally.'
                 : 'Please provide a reason for rejection.'
               }
             </DialogDescription>
           </DialogHeader>
           <div className="space-y-4">
             <Textarea
               placeholder={actionType === 'complete' ? "Add notes (optional)..." : "Reason for rejection..."}
               value={actionNotes}
               onChange={(e) => setActionNotes(e.target.value)}
               className="min-h-[100px]"
             />
           </div>
           <DialogFooter>
             <Button variant="outline" onClick={() => setShowActionDialog(false)}>
               Cancel
             </Button>
             <Button
               onClick={handleAction}
               disabled={processing}
               className={actionType === 'complete' ? 'bg-green-500 hover:bg-green-600' : 'bg-red-500 hover:bg-red-600'}
             >
               {processing ? (
                 <Loader2 className="w-4 h-4 mr-2 animate-spin" />
               ) : actionType === 'complete' ? (
                 <CheckCircle className="w-4 h-4 mr-2" />
               ) : (
                 <XCircle className="w-4 h-4 mr-2" />
               )}
               {actionType === 'complete' ? 'Complete' : 'Reject'}
             </Button>
           </DialogFooter>
         </DialogContent>
       </Dialog>
     </div>
   );
 }