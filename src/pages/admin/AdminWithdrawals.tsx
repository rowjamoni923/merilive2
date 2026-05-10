import { useState, useEffect, useRef } from "react";
import { adminSendNotification } from "@/utils/adminNotification";
import { getAdminCache, setAdminCache } from "@/utils/adminDataCache";
import useAdminRealtime from "@/hooks/useAdminRealtime";
import { ImageViewer, useImageViewer } from "@/components/ui/image-viewer";
import { motion } from "framer-motion";
import {
  Wallet,
  CheckCircle,
  XCircle,
  Clock,
  Search,
  Eye,
  Building2,
  CreditCard,
  Loader2,
  RefreshCw,
  Download,
  FileSpreadsheet,
  FileText,
  Globe,
  DollarSign
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { adminSupabase as supabase } from "@/integrations/supabase/adminClient";
import { toast } from "sonner";
import { format } from "date-fns";
import { bn } from "date-fns/locale";
import { resolveNetWithdrawalBeans, resolveNetWithdrawalLocal, resolveNetWithdrawalUsd } from "@/utils/agencyWithdrawalAmounts";
import { recordAdminError } from "@/utils/adminErrorLog";

import { formatAdminError } from "@/utils/formatAdminError";
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
  helper_payment_screenshot?: string;
  helper_transaction_id?: string;
  helper_notes?: string;
  helper_processed_at?: string;
}

interface Withdrawal {
  id: string;
  agency_id: string;
  amount: number;
  status: string;
  payment_method: string;
  payment_details: PaymentDetails | null;
  requested_at: string;
  processed_at: string | null;
  notes: string | null;
  helper_payment_screenshot?: string | null;
  helper_transaction_id?: string | null;
  helper_notes?: string | null;
  assigned_helper_id?: string | null;
  diamond_reward?: number | null;
  platform_fee_amount?: number | null;
  helper_net_reward?: number | null;
  agency?: {
    name: string;
    agency_code: string;
    owner?: {
      display_name: string | null;
      avatar_url: string | null;
    };
  };
}

// Country/Currency info for display
const CURRENCY_INFO: Record<string, { symbol: string; flag: string; name: string }> = {
  BDT: { symbol: "Tk ", flag: "🇧🇩", name: "Bangladesh" },
  INR: { symbol: "₹", flag: "🇮🇳", name: "India" },
  PKR: { symbol: "Rs", flag: "🇵🇰", name: "Pakistan" },
  NPR: { symbol: "Rs", flag: "🇳🇵", name: "Nepal" },
  PHP: { symbol: "₱", flag: "🇵🇭", name: "Philippines" },
  IDR: { symbol: "Rp", flag: "🇮🇩", name: "Indonesia" },
  VND: { symbol: "₫", flag: "🇻🇳", name: "Vietnam" },
  THB: { symbol: "฿", flag: "🇹🇭", name: "Thailand" },
  MYR: { symbol: "RM", flag: "🇲🇾", name: "Malaysia" },
  USD: { symbol: "$", flag: "🇺🇸", name: "USA" },
  AED: { symbol: "د.إ", flag: "🇦🇪", name: "UAE" },
  SAR: { symbol: "﷼", flag: "🇸🇦", name: "Saudi Arabia" },
};

export default function AdminWithdrawals() {
  const imageViewer = useImageViewer();
  const [withdrawals, setWithdrawals] = useState<Withdrawal[]>(() => getAdminCache<Withdrawal[]>('admin_withdrawals') || []);
  const [loading, setLoading] = useState(() => !getAdminCache('admin_withdrawals'));
  const [processing, setProcessing] = useState(false);
  const [selectedWithdrawal, setSelectedWithdrawal] = useState<Withdrawal | null>(null);
  const [showDetailDialog, setShowDetailDialog] = useState(false);
  const [showActionDialog, setShowActionDialog] = useState(false);
  const [actionType, setActionType] = useState<'approve' | 'reject' | 'complete'>('approve');
  const [actionNotes, setActionNotes] = useState("");
  const [filterStatus, setFilterStatus] = useState("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [coinsToUsdRate, setCoinsToUsdRate] = useState(10000);
  const [helperPlatformFee, setHelperPlatformFee] = useState(10);
  const [globalCounts, setGlobalCounts] = useState({ pending: 0, approved: 0, totalPendingAmount: 0 });
  const actionGuardRef = useRef<Set<string>>(new Set());
  const guardStart = (key: string) => { if (actionGuardRef.current.has(key)) return false; actionGuardRef.current.add(key); return true; };
  const guardEnd = (key: string) => { actionGuardRef.current.delete(key); };
  useEffect(() => {
    fetchWithdrawals();
    fetchSettings();
    fetchGlobalCounts();
  }, [filterStatus]);

  useAdminRealtime(['agency_withdrawals'], () => {
    fetchWithdrawals();
    fetchGlobalCounts();
  });

  const fetchGlobalCounts = async () => {
    try {
      const { data, error } = await supabase.rpc('admin_withdrawal_stats');
      if (error) throw error;
      const r = (data as any) || {};
      setGlobalCounts({
        pending: r.pending || 0,
        approved: r.approved || 0,
        totalPendingAmount: Number(r.total_pending_amount) || 0,
      });
    } catch (e) { recordAdminError({ kind: "rpc", label: "AdminWithdrawals.ErrorFetchingWithdrawalCounts", message: formatAdminError(e)}); }
  };

  const fetchSettings = async () => {
    // Fetch coins rate
    const { data } = await supabase
      .from('app_settings')
      .select('setting_value')
      .eq('setting_key', 'agency_commission')
      .maybeSingle();
    
    if (data?.setting_value) {
      const settings = data.setting_value as { coins_to_dollar_rate?: number };
      if (settings.coins_to_dollar_rate) {
        setCoinsToUsdRate(settings.coins_to_dollar_rate);
      }
    }

    // Fetch helper fee settings from DB
    const { data: helperData } = await supabase
      .from('app_settings')
      .select('setting_value')
      .eq('setting_key', 'helper_fee_settings')
      .maybeSingle();
    
    if (helperData?.setting_value) {
      const hfs = helperData.setting_value as { platform_fee_percent?: number };
      if (hfs.platform_fee_percent !== undefined) {
        setHelperPlatformFee(hfs.platform_fee_percent);
      }
    }
  };

  const fetchWithdrawals = async () => {
    if (withdrawals.length === 0) setLoading(true);
    try {
      let query = supabase
        .from("agency_withdrawals")
        .select("*")
        .order("requested_at", { ascending: false })
        .limit(200);

      if (filterStatus !== "all") {
        query = query.eq("status", filterStatus);
      }

      const { data, error } = await query;

      if (error) throw error;

      if (data && data.length > 0) {
        const uniqueAgencyIds = [...new Set(data.map(w => w.agency_id).filter(Boolean))] as string[];
        let agenciesMap: Record<string, any> = {};

        if (uniqueAgencyIds.length > 0) {
          const { data: agencies, error: agenciesError } = await supabase
            .from("agencies")
            .select("id, name, agency_code, owner_id")
            .in("id", uniqueAgencyIds);

          if (agenciesError) {
            recordAdminError({ kind: "rpc", label: "AdminWithdrawals.ErrorFetchingAgenciesForWithdrawals", message: agenciesError instanceof Error ? agenciesError.message : "Error fetching agencies for withdrawals" });
          } else if (agencies) {
            agenciesMap = Object.fromEntries(agencies.map((agency) => [agency.id, agency]));
          }
        }

        const uniqueOwnerIds = [...new Set(Object.values(agenciesMap).map((agency: any) => agency?.owner_id).filter(Boolean))] as string[];
        let ownersMap: Record<string, any> = {};

        if (uniqueOwnerIds.length > 0) {
          const { data: owners, error: ownersError } = await supabase
            .from("profiles")
            .select("id, display_name, avatar_url")
            .in("id", uniqueOwnerIds);

          if (ownersError) {
            recordAdminError({ kind: "rpc", label: "AdminWithdrawals.ErrorFetchingOwnersForWithdrawals", message: ownersError instanceof Error ? ownersError.message : "Error fetching owners for withdrawals" });
          } else if (owners) {
            ownersMap = Object.fromEntries(owners.map(o => [o.id, o]));
          }
        }

        const enrichedData = data.map(w => ({
          ...w,
          payment_details: w.payment_details as PaymentDetails | null,
          agency: agenciesMap[w.agency_id] ? {
            name: agenciesMap[w.agency_id].name,
            agency_code: agenciesMap[w.agency_id].agency_code,
            owner: agenciesMap[w.agency_id].owner_id ? ownersMap[agenciesMap[w.agency_id].owner_id] || null : null,
          } : undefined
        })) as Withdrawal[];

        setWithdrawals(enrichedData);
      } else {
        setWithdrawals([]);
      }
    } catch (error) {
      recordAdminError({ kind: "rpc", label: "AdminWithdrawals.ErrorFetchingWithdrawals", message: formatAdminError(error)});
      toast.error("Failed to load withdrawals");
    } finally {
      setLoading(false);
    }
  };

  const handleAction = async () => {
    if (!selectedWithdrawal) return;
    if (!guardStart(`action-${selectedWithdrawal.id}`)) return;
    // Map action type to status
    const statusMap: Record<string, string> = {
      'approve': 'approved',
      'reject': 'rejected',
      'complete': 'approved'
    };

    const targetStatus = statusMap[actionType] || actionType;

    // Optimistic UI: immediately update local state + close dialogs
    setWithdrawals((prev) => prev.map((w) => w.id === selectedWithdrawal.id ? { ...w, status: targetStatus } : w));
    setShowActionDialog(false);
    const savedWithdrawal = selectedWithdrawal;
    setSelectedWithdrawal(null);
    setActionNotes("");

    setProcessing(true);
    try {
      const { error } = await supabase.rpc("admin_process_withdrawal", {
        _withdrawal_id: savedWithdrawal.id,
        _status: targetStatus,
        _notes: actionNotes || null
      });

      if (error) throw error;

      // Send notification to agency owner
      if ((savedWithdrawal as any).agency?.owner_id) {
        const notifTitle = actionType === 'approve' ? '✅ Withdrawal Approved!' :
                          actionType === 'reject' ? '❌ Withdrawal Rejected' :
                          '✅ Withdrawal Completed!';
        const notifMessage = actionType === 'approve' ? `Your $${savedWithdrawal.amount} withdrawal has been approved.` :
                            actionType === 'reject' ? `Your $${savedWithdrawal.amount} withdrawal has been rejected.` :
                            `Your $${savedWithdrawal.amount} withdrawal has been completed.`;
        
        const notifType = actionType === 'approve' ? 'withdrawal_approved' : 
                         actionType === 'reject' ? 'withdrawal_rejected' : 'withdrawal_approved';
        await adminSendNotification(
          (savedWithdrawal as any).agency.owner_id,
          notifTitle,
          notifMessage,
          notifType,
          { withdrawal_id: savedWithdrawal.id, amount: savedWithdrawal.amount }
        );
      }

      toast.success(
        actionType === 'approve' ? 'Withdrawal approved successfully' :
        actionType === 'reject' ? 'Withdrawal rejected' :
        'Withdrawal completed'
      );

      fetchWithdrawals();
      fetchGlobalCounts();
    } catch (error) {
      recordAdminError({ kind: "rpc", label: "AdminWithdrawals.ErrorProcessingWithdrawal", message: formatAdminError(error)});
      toast.error("Failed to process withdrawal");
      // Rollback optimistic update
      fetchWithdrawals();
    } finally {
      setProcessing(false);
      guardEnd(`action-${savedWithdrawal.id}`);
    }
  };

  const openActionDialog = (withdrawal: Withdrawal, action: 'approve' | 'reject' | 'complete') => {
    setSelectedWithdrawal(withdrawal);
    setActionType(action);
    setShowActionDialog(true);
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'pending':
        return <Badge className="bg-amber-100 text-amber-700 border border-amber-200"><Clock className="w-3 h-3 mr-1" /> Pending</Badge>;
      case 'processing':
        return <Badge className="bg-purple-100 text-purple-700 border border-purple-200"><Loader2 className="w-3 h-3 mr-1" /> Processing</Badge>;
      case 'approved':
        return <Badge className="bg-green-100 text-green-700 border border-green-200"><CheckCircle className="w-3 h-3 mr-1" /> Completed</Badge>;
      case 'completed':
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

  const formatBeans = (beans: number) => {
    if (beans >= 10000000) {
      return `${(beans / 10000000).toFixed(2)} Crore`;
    } else if (beans >= 100000) {
      return `${(beans / 100000).toFixed(2)} Lakh`;
    } else if (beans >= 1000) {
      return `${(beans / 1000).toFixed(2)}K`;
    }
    return beans.toLocaleString();
  };

  // Export functions
  const exportToCSV = () => {
    const headers = [
      "ID",
      "Agency Name",
      "Agency Code",
      "Amount (Beans)",
      "Amount (USD)",
      "Currency",
      "Local Amount",
      "Exchange Rate",
      "Payment Method",
      "Account Name",
      "Account Number",
      "Bank Name",
      "Status",
      "Requested At",
      "Processed At",
      "Notes"
    ];

    const rows = filteredWithdrawals.map(w => {
      const pd = w.payment_details;
      const usdAmount = pd?.usd_amount || (w.amount / coinsToUsdRate);
      return [
        w.id,
        w.agency?.name || "",
        w.agency?.agency_code || "",
        w.amount,
        usdAmount.toFixed(2),
        pd?.currency_code || "USD",
        pd?.local_amount?.toFixed(2) || usdAmount.toFixed(2),
        pd?.exchange_rate || 1,
        w.payment_method,
        pd?.account_name || "",
        pd?.account_number || "",
        pd?.bank_name || "",
        w.status,
        format(new Date(w.requested_at), "yyyy-MM-dd HH:mm"),
        w.processed_at ? format(new Date(w.processed_at), "yyyy-MM-dd HH:mm") : "",
        w.notes || ""
      ];
    });

    const csvContent = [
      headers.join(","),
      ...rows.map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(","))
    ].join("\n");

    const blob = new Blob(["\ufeff" + csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `withdrawals_${format(new Date(), "yyyy-MM-dd")}.csv`;
    link.click();
    URL.revokeObjectURL(url);
    toast.success("CSV file downloaded");
  };

  const exportToPDF = () => {
    // Create a printable HTML content
    const printContent = `
      <!DOCTYPE html>
      <html>
      <head>
        <title>Withdrawal Report</title>
        <style>
          body { font-family: Arial, sans-serif; padding: 20px; }
          h1 { text-align: center; color: #333; }
          .summary { display: flex; justify-content: space-around; margin: 20px 0; padding: 20px; background: #f5f5f5; border-radius: 8px; }
          .summary-item { text-align: center; }
          .summary-value { font-size: 24px; font-weight: bold; color: #2563eb; }
          table { width: 100%; border-collapse: collapse; margin-top: 20px; font-size: 12px; }
          th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }
          th { background: #2563eb; color: white; }
          tr:nth-child(even) { background: #f9f9f9; }
          .status-pending { color: #f59e0b; }
          .status-approved { color: #3b82f6; }
          .status-completed { color: #22c55e; }
          .status-rejected { color: #ef4444; }
          .footer { margin-top: 30px; text-align: center; color: #666; font-size: 12px; }
        </style>
      </head>
      <body>
        <h1>Agency Withdrawal Report</h1>
        <p style="text-align: center; color: #666;">Generated: ${format(new Date(), "dd MMM yyyy HH:mm")}</p>
        
        <div class="summary">
          <div class="summary-item">
            <div class="summary-value">${filteredWithdrawals.length}</div>
            <div>Total Requests</div>
          </div>
          <div class="summary-item">
            <div class="summary-value">${formatBeans(totalBeans)}</div>
            <div>Total Beans</div>
          </div>
          <div class="summary-item">
            <div class="summary-value">$${totalUsd.toFixed(2)}</div>
            <div>Total USD</div>
          </div>
        </div>
        
        <table>
          <thead>
            <tr>
              <th>Agency</th>
              <th>Beans</th>
              <th>USD</th>
              <th>Local Currency</th>
              <th>Payment Info</th>
              <th>Status</th>
              <th>Date</th>
            </tr>
          </thead>
          <tbody>
            ${filteredWithdrawals.map(w => {
              const pd = w.payment_details;
              const usdAmount = pd?.usd_amount || (w.amount / coinsToUsdRate);
              const currencyInfo = getCurrencyInfo(pd?.currency_code || "USD");
              return `
                <tr>
                  <td>${w.agency?.name || "Unknown"}<br><small>#${w.agency?.agency_code || ""}</small></td>
                  <td>${w.amount.toLocaleString()}</td>
                  <td>$${usdAmount.toFixed(2)}</td>
                  <td>${currencyInfo.flag} ${currencyInfo.symbol}${(pd?.local_amount || usdAmount).toLocaleString()}</td>
                  <td>
                    ${w.payment_method}<br>
                    <small>${pd?.account_name || ""}</small><br>
                    <small>${pd?.account_number || ""}</small>
                  </td>
                  <td class="status-${w.status}">${w.status.toUpperCase()}</td>
                  <td>${format(new Date(w.requested_at), "dd MMM yyyy")}</td>
                </tr>
              `;
            }).join("")}
          </tbody>
        </table>
        
        <div class="footer">
          <p>This is a system generated report.</p>
        </div>
      </body>
      </html>
    `;

    const printWindow = window.open("", "_blank");
    if (printWindow) {
      printWindow.document.write(printContent);
      printWindow.document.close();
      printWindow.print();
    }
    toast.success("PDF print window opened");
  };

  const pendingCount = globalCounts.pending;
  const approvedCount = globalCounts.approved;
  const totalPending = globalCounts.totalPendingAmount;

  const filteredWithdrawals = withdrawals.filter(w =>
    w.agency?.name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    w.agency?.agency_code?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const totalBeans = filteredWithdrawals.reduce((sum, w) => sum + w.amount, 0);
  const totalUsd = filteredWithdrawals.reduce((sum, w) => {
    const usd = w.payment_details?.usd_amount || (w.amount / coinsToUsdRate);
    return sum + usd;
  }, 0);

  return (
    <>
    <div className="space-y-4 md:space-y-6 px-2 md:px-0">
      {/* Header */}
      <div className="flex flex-col gap-3 p-4 md:p-6 bg-gradient-to-r from-white via-emerald-50/50 to-blue-50/50 rounded-xl md:rounded-2xl shadow-lg border border-slate-200/50">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
          <div>
            <h1 className="text-xl md:text-2xl font-bold text-slate-800">Withdrawal Management</h1>
            <p className="text-sm text-slate-600">Manage agency withdrawal requests</p>
          </div>
          <div className="flex items-center gap-2">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm" className="bg-white border-slate-200 text-slate-700 text-xs md:text-sm">
                  <Download className="w-3 h-3 md:w-4 md:h-4 mr-1" />
                  Export
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="bg-white border-slate-200">
                <DropdownMenuItem onClick={exportToCSV} className="text-slate-700 hover:bg-slate-100 cursor-pointer">
                  <FileSpreadsheet className="w-4 h-4 mr-2 text-green-500" />
                  Excel (CSV)
                </DropdownMenuItem>
                <DropdownMenuItem onClick={exportToPDF} className="text-slate-700 hover:bg-slate-100 cursor-pointer">
                  <FileText className="w-4 h-4 mr-2 text-red-500" />
                  Print PDF
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            <Button
              variant="outline"
              size="sm"
              className="bg-white border-slate-200 text-slate-700 text-xs md:text-sm"
              onClick={fetchWithdrawals}
            >
              <RefreshCw className="w-3 h-3 md:w-4 md:h-4" />
            </Button>
          </div>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-2 md:gap-4">
        <Card className="bg-gradient-to-br from-yellow-50 to-amber-50 border-yellow-200 shadow-md">
          <CardContent className="p-3 md:p-4">
            <div className="flex items-center gap-2 md:gap-3">
              <div className="w-10 h-10 md:w-12 md:h-12 rounded-xl bg-yellow-200 flex items-center justify-center">
                <Clock className="w-5 h-5 md:w-6 md:h-6 text-yellow-600" />
              </div>
              <div>
                <p className="text-lg md:text-2xl font-bold text-yellow-700">{pendingCount}</p>
                <p className="text-yellow-600/80 text-xs md:text-sm">Pending</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-br from-blue-50 to-cyan-50 border-blue-200 shadow-md">
          <CardContent className="p-3 md:p-4">
            <div className="flex items-center gap-2 md:gap-3">
              <div className="w-10 h-10 md:w-12 md:h-12 rounded-xl bg-blue-200 flex items-center justify-center">
                <CheckCircle className="w-5 h-5 md:w-6 md:h-6 text-blue-600" />
              </div>
              <div>
                <p className="text-lg md:text-2xl font-bold text-blue-700">{approvedCount}</p>
                <p className="text-blue-600/80 text-xs md:text-sm">Completed</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-br from-green-50 to-emerald-50 border-green-200 shadow-md">
          <CardContent className="p-3 md:p-4">
            <div className="flex items-center gap-2 md:gap-3">
              <div className="w-10 h-10 md:w-12 md:h-12 rounded-xl bg-green-200 flex items-center justify-center">
                <Wallet className="w-5 h-5 md:w-6 md:h-6 text-green-600" />
              </div>
              <div>
                <p className="text-lg md:text-2xl font-bold text-green-700">{formatBeans(totalPending)}</p>
                <p className="text-green-600/80 text-xs md:text-sm">Pending Beans</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-br from-emerald-50 to-teal-50 border-emerald-200 shadow-md">
          <CardContent className="p-3 md:p-4">
            <div className="flex items-center gap-2 md:gap-3">
              <div className="w-10 h-10 md:w-12 md:h-12 rounded-xl bg-emerald-200 flex items-center justify-center">
                <DollarSign className="w-5 h-5 md:w-6 md:h-6 text-emerald-600" />
              </div>
              <div>
                <p className="text-lg md:text-2xl font-bold text-emerald-700">${totalUsd.toFixed(2)}</p>
                <p className="text-emerald-600/80 text-xs md:text-sm">Total USD</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-br from-purple-50 to-pink-50 border-purple-200 shadow-md">
          <CardContent className="p-3 md:p-4">
            <div className="flex items-center gap-2 md:gap-3">
              <div className="w-10 h-10 md:w-12 md:h-12 rounded-xl bg-purple-200 flex items-center justify-center">
                <CreditCard className="w-5 h-5 md:w-6 md:h-6 text-purple-600" />
              </div>
              <div>
                <p className="text-lg md:text-2xl font-bold text-purple-700">{withdrawals.length}</p>
                <p className="text-purple-600/80 text-xs md:text-sm">Total Requests</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <Card className="bg-white border-slate-200 shadow-md">
        <CardContent className="p-4">
          <div className="flex flex-col md:flex-row gap-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <Input
                placeholder="Search agencies..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10 bg-white border-slate-200 text-slate-800"
              />
            </div>
            <Tabs value={filterStatus} onValueChange={setFilterStatus} className="w-full md:w-auto">
              <TabsList className="bg-slate-100 border border-slate-200">
                <TabsTrigger value="all" className="data-[state=active]:bg-primary data-[state=active]:text-white text-slate-600 text-xs">
                  All
                </TabsTrigger>
                <TabsTrigger value="pending" className="data-[state=active]:bg-primary data-[state=active]:text-white text-slate-600 text-xs">
                  Pending
                </TabsTrigger>
                <TabsTrigger value="approved" className="data-[state=active]:bg-primary data-[state=active]:text-white text-slate-600 text-xs">
                  Completed
                </TabsTrigger>
                <TabsTrigger value="completed" className="data-[state=active]:bg-primary data-[state=active]:text-white text-slate-600 text-xs">
                  Completed
                </TabsTrigger>
                <TabsTrigger value="rejected" className="data-[state=active]:bg-primary data-[state=active]:text-white text-slate-600 text-xs">
                  Rejected
                </TabsTrigger>
              </TabsList>
            </Tabs>
          </div>
        </CardContent>
      </Card>

      {/* Withdrawals Table */}
      <Card className="bg-white border-slate-200 shadow-md">
        <CardContent className="p-0">
          {loading ? (
            <div className="flex items-center justify-center py-20">
              <Loader2 className="w-8 h-8 animate-spin text-primary" />
            </div>
          ) : (
            <ScrollArea className="h-[500px]">
              <Table>
                <TableHeader>
                  <TableRow className="border-slate-200 bg-slate-50">
                    <TableHead className="text-slate-700 font-semibold">Agency</TableHead>
                    <TableHead className="text-slate-700 font-semibold">Beans</TableHead>
                    <TableHead className="text-slate-700 font-semibold">USD</TableHead>
                    <TableHead className="text-slate-700 font-semibold">Local Currency</TableHead>
                    <TableHead className="text-slate-700 font-semibold">Payment Info</TableHead>
                    <TableHead className="text-slate-700 font-semibold">Status</TableHead>
                    <TableHead className="text-slate-700 font-semibold">Date</TableHead>
                    <TableHead className="text-slate-700 font-semibold">Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredWithdrawals.map((withdrawal) => {
                    const pd = withdrawal.payment_details;
                    const usdAmount = pd?.usd_amount || (withdrawal.amount / coinsToUsdRate);
                    const currencyInfo = getCurrencyInfo(pd?.currency_code || "USD");
                    
                    return (
                      <TableRow key={withdrawal.id} className="border-slate-100 hover:bg-slate-50">
                        <TableCell>
                          <div className="flex items-center gap-3">
                            <Avatar className="w-10 h-10">
                              <AvatarImage src={withdrawal.agency?.owner?.avatar_url || undefined} />
                              <AvatarFallback className="bg-primary/20 text-primary">
                                <Building2 className="w-5 h-5" />
                              </AvatarFallback>
                            </Avatar>
                            <div>
                              <p className="text-slate-800 font-medium">{withdrawal.agency?.name || "Unknown"}</p>
                              <p className="text-slate-500 text-xs">#{withdrawal.agency?.agency_code}</p>
                            </div>
                          </div>
                        </TableCell>
                        <TableCell>
                          <span className="text-amber-600 font-bold">{formatBeans(withdrawal.amount)}</span>
                          <span className="text-slate-500 text-xs ml-1">Beans</span>
                        </TableCell>
                        <TableCell>
                          <span className="text-green-600 font-bold">${usdAmount.toFixed(2)}</span>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <span className="text-lg">{currencyInfo.flag}</span>
                            <div>
                              <p className="text-cyan-600 font-bold">
                                {currencyInfo.symbol}{(pd?.local_amount || usdAmount).toLocaleString(undefined, { maximumFractionDigits: 2 })}
                              </p>
                              <p className="text-slate-400 text-xs">
                                Rate: {pd?.exchange_rate || 1}
                              </p>
                            </div>
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="text-slate-700 text-sm">
                            <p className="capitalize font-medium">{withdrawal.payment_method}</p>
                            <p className="text-slate-500 text-xs">{pd?.account_name}</p>
                            <p className="text-slate-500 text-xs font-mono">{pd?.account_number}</p>
                          </div>
                        </TableCell>
                        <TableCell>
                          {getStatusBadge(withdrawal.status)}
                        </TableCell>
                        <TableCell className="text-slate-600">
                          {format(new Date(withdrawal.requested_at), "dd MMM yyyy", { locale: bn })}
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            {(() => {
                              const proof = withdrawal.helper_payment_screenshot || pd?.helper_payment_screenshot;
                              if (!proof) return null;
                              return (
                                <button
                                  type="button"
                                  className="w-10 h-10 rounded-md overflow-hidden border border-purple-300 hover:border-purple-500 transition shrink-0"
                                  title="View helper payment screenshot"
                                  onClick={(e) => { e.stopPropagation(); imageViewer.openImage(proof); }}
                                >
                                  <img src={proof} alt="Helper proof" className="w-full h-full object-cover" loading="lazy" />
                                </button>
                              );
                            })()}
                            <Button
                              variant="ghost"
                              size="icon"
                              className="text-white/50 hover:text-white"
                              onClick={() => {
                                setSelectedWithdrawal(withdrawal);
                                setShowDetailDialog(true);
                              }}
                            >
                              <Eye className="w-4 h-4" />
                            </Button>
                            
                            {withdrawal.status === 'pending' && (
                              <>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="text-green-400 hover:text-green-300"
                                  onClick={() => openActionDialog(withdrawal, 'approve')}
                                >
                                  <CheckCircle className="w-4 h-4" />
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="text-red-400 hover:text-red-300"
                                  onClick={() => openActionDialog(withdrawal, 'reject')}
                                >
                                  <XCircle className="w-4 h-4" />
                                </Button>
                              </>
                            )}
                            
                            {/* Processing status - Helper has paid, awaiting admin approval */}
                            {withdrawal.status === 'processing' && (
                              <>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="text-green-400 hover:text-green-300 gap-1"
                                  onClick={() => openActionDialog(withdrawal, 'complete')}
                                >
                                  <CheckCircle className="w-4 h-4" />
                                    Complete
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="text-red-400 hover:text-red-300"
                                  onClick={() => openActionDialog(withdrawal, 'reject')}
                                >
                                  <XCircle className="w-4 h-4" />
                                </Button>
                              </>
                            )}
                            
                            {withdrawal.status === 'approved' && (
                              <Button
                                variant="ghost"
                                size="sm"
                                className="text-blue-400 hover:text-blue-300"
                                onClick={() => openActionDialog(withdrawal, 'complete')}
                              >
                                Complete
                              </Button>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                  {filteredWithdrawals.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={8} className="text-center py-10 text-white/50">
                        No withdrawals found
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </ScrollArea>
          )}
        </CardContent>
      </Card>

      {/* Detail Dialog */}
      <Dialog open={showDetailDialog} onOpenChange={setShowDetailDialog}>
        <DialogContent className="bg-slate-900 border-white/10 text-white max-w-xl">
          <DialogHeader>
            <DialogTitle>Withdrawal Details</DialogTitle>
          </DialogHeader>
          
          {selectedWithdrawal && (
            <div className="space-y-4">
              <div className="bg-white/5 rounded-lg p-4 space-y-3">
                <div className="flex justify-between">
                  <span className="text-white/60">Agency:</span>
                  <span className="font-medium">{selectedWithdrawal.agency?.name}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-white/60">Payable Beans:</span>
                  <span className="font-bold text-yellow-400">{formatBeans(resolveNetWithdrawalBeans(selectedWithdrawal))} Beans</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-white/60">Payable USD:</span>
                  <span className="font-bold text-green-400">
                    ${resolveNetWithdrawalUsd(selectedWithdrawal, coinsToUsdRate).toFixed(2)}
                  </span>
                </div>
                {selectedWithdrawal.payment_details?.currency_code && (
                  <div className="flex justify-between">
                    <span className="text-white/60">Payable Local:</span>
                    <span className="font-bold text-cyan-400">
                      {getCurrencyInfo(selectedWithdrawal.payment_details.currency_code).flag}{" "}
                      {getCurrencyInfo(selectedWithdrawal.payment_details.currency_code).symbol}
                      {resolveNetWithdrawalLocal(selectedWithdrawal).toLocaleString()}
                    </span>
                  </div>
                )}
                {selectedWithdrawal.payment_details?.exchange_rate && (
                  <div className="flex justify-between">
                    <span className="text-white/60">Exchange Rate:</span>
                    <span>$1 = {selectedWithdrawal.payment_details.exchange_rate}</span>
                  </div>
                )}
                <div className="flex justify-between">
                  <span className="text-white/60">Status:</span>
                  {getStatusBadge(selectedWithdrawal.status)}
                </div>
              </div>

              <div className="bg-white/5 rounded-lg p-4 space-y-3">
                <p className="text-white/60 text-sm font-medium flex items-center gap-2">
                  <CreditCard className="w-4 h-4" />
                  Payment Info
                </p>
                <div className="flex justify-between">
                  <span className="text-white/60">Payment Method:</span>
                  <span className="capitalize">{selectedWithdrawal.payment_method}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-white/60">Account Name:</span>
                  <span>{selectedWithdrawal.payment_details?.account_name || "N/A"}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-white/60">Account Number:</span>
                  <span className="font-mono text-primary">{selectedWithdrawal.payment_details?.account_number || "N/A"}</span>
                </div>
                {selectedWithdrawal.payment_details?.bank_name && (
                  <div className="flex justify-between">
                    <span className="text-white/60">Bank:</span>
                    <span>{selectedWithdrawal.payment_details.bank_name}</span>
                  </div>
                )}
                {selectedWithdrawal.payment_details?.additional_info && (
                  <div>
                    <span className="text-white/60 text-sm">Additional Info:</span>
                    <p className="text-white/80 mt-1">{selectedWithdrawal.payment_details.additional_info}</p>
                  </div>
                )}
              </div>

              {/* Helper Payment Info - Transaction ID & Screenshot */}
              {(() => {
                const helperTransactionId = selectedWithdrawal.helper_transaction_id || selectedWithdrawal.payment_details?.helper_transaction_id;
                const helperPaymentScreenshot = selectedWithdrawal.helper_payment_screenshot || selectedWithdrawal.payment_details?.helper_payment_screenshot;
                const helperPaymentNotes = selectedWithdrawal.helper_notes || selectedWithdrawal.payment_details?.helper_notes;

                if (!helperTransactionId && !helperPaymentScreenshot && !helperPaymentNotes) return null;

                return (
                  <div className="bg-gradient-to-br from-purple-500/20 to-pink-500/20 rounded-lg p-4 space-y-3 border border-purple-500/30">
                    <p className="text-purple-300 text-sm font-medium flex items-center gap-2">
                      <CheckCircle className="w-4 h-4" />
                      📤 Helper Payment Info (Processing)
                    </p>
                    
                    {helperTransactionId && (
                      <div className="bg-slate-800/50 rounded-lg p-3">
                        <span className="text-white/60 text-xs block mb-1">Transaction ID:</span>
                        <span className="text-yellow-400 font-mono text-lg font-bold break-all">
                          {helperTransactionId}
                        </span>
                      </div>
                    )}
                    
                    {helperPaymentNotes && (
                      <div className="bg-slate-800/50 rounded-lg p-3">
                        <span className="text-white/60 text-xs block mb-1">Helper Notes:</span>
                        <span className="text-white/80 whitespace-pre-wrap break-words">{helperPaymentNotes}</span>
                      </div>
                    )}
                    
                    {helperPaymentScreenshot && (
                      <div>
                        <span className="text-white/60 text-xs block mb-2">📸 Payment Screenshot:</span>
                        <div className="rounded-xl overflow-hidden border-2 border-purple-500/30 cursor-pointer"
                             onClick={() => imageViewer.openImage(helperPaymentScreenshot)}>
                          <img 
                            src={helperPaymentScreenshot} 
                            alt="Helper payment proof" 
                            className="w-full max-h-64 object-contain bg-slate-800"
                          />
                        </div>
                        <p className="text-xs text-purple-300 text-center mt-1">Click to view full size</p>
                      </div>
                    )}
                  </div>
                );
              })()}

              {selectedWithdrawal.notes && (
                <div className="bg-white/5 rounded-lg p-4">
                  <p className="text-white/60 text-sm">Notes:</p>
                  <p className="text-white/80">{selectedWithdrawal.notes}</p>
                </div>
              )}
            </div>
          )}

          <DialogFooter className="flex-col sm:flex-row gap-2">
            <Button variant="outline" onClick={() => setShowDetailDialog(false)}>
              Close
            </Button>
            
            {/* Action buttons for processing status in detail dialog */}
            {selectedWithdrawal?.status === 'processing' && (
              <>
                <Button
                  className="bg-green-600 hover:bg-green-700 gap-2"
                  onClick={() => {
                    setShowDetailDialog(false);
                    openActionDialog(selectedWithdrawal, 'complete');
                  }}
                >
                  <CheckCircle className="w-4 h-4" />
                  Approve
                </Button>
                <Button
                  variant="destructive"
                  onClick={() => {
                    setShowDetailDialog(false);
                    openActionDialog(selectedWithdrawal, 'reject');
                  }}
                >
                  <XCircle className="w-4 h-4 mr-1" />
                  Reject
                </Button>
              </>
            )}
            
            {selectedWithdrawal?.status === 'pending' && (
              <>
                <Button
                  className="bg-green-600 hover:bg-green-700 gap-2"
                  onClick={() => {
                    setShowDetailDialog(false);
                    openActionDialog(selectedWithdrawal, 'approve');
                  }}
                >
                  <CheckCircle className="w-4 h-4" />
                  Approve
                </Button>
              </>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Action Dialog */}
      <Dialog open={showActionDialog} onOpenChange={setShowActionDialog}>
        <DialogContent className="bg-slate-900 border-white/10 text-white">
          <DialogHeader>
            <DialogTitle>
              {actionType === 'approve' && 'Approve Withdrawal'}
              {actionType === 'reject' && 'Reject Withdrawal'}
              {actionType === 'complete' && 'Complete Withdrawal'}
            </DialogTitle>
            <DialogDescription className="text-white/60">
              {selectedWithdrawal?.agency?.name} - {formatBeans(selectedWithdrawal ? resolveNetWithdrawalBeans(selectedWithdrawal) : 0)} Beans
              <span className="text-green-400 ml-2">
                (${(selectedWithdrawal ? resolveNetWithdrawalUsd(selectedWithdrawal, coinsToUsdRate) : 0).toFixed(2)})
              </span>
            </DialogDescription>
          </DialogHeader>

          {selectedWithdrawal && (
            <div className="space-y-3">
              <div className="bg-white/5 rounded-lg p-3 space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-white/60">Payment:</span>
                  <span className="capitalize">{selectedWithdrawal.payment_method}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-white/60">Account:</span>
                  <span className="font-mono">{selectedWithdrawal.payment_details?.account_number}</span>
                </div>
                {selectedWithdrawal.payment_details?.local_amount && (
                  <div className="flex justify-between">
                    <span className="text-white/60">Amount to Pay:</span>
                    <span className="text-cyan-400 font-bold">
                      {getCurrencyInfo(selectedWithdrawal.payment_details.currency_code || "USD").symbol}
                      {resolveNetWithdrawalLocal(selectedWithdrawal).toLocaleString()}
                    </span>
                  </div>
                )}
              </div>

              {/* Show helper fee calculation for processing status when completing */}
              {selectedWithdrawal.status === 'processing' && actionType === 'complete' && selectedWithdrawal.diamond_reward && (
                <div className="bg-gradient-to-br from-purple-500/20 to-pink-500/20 rounded-lg p-4 border border-purple-500/30">
                  <p className="text-purple-300 text-sm font-medium mb-3 flex items-center gap-2">
                    💎 Helper Reward Calculation ({helperPlatformFee}% Platform Fee)
                  </p>
                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between">
                      <span className="text-white/60">Total Diamond Reward:</span>
                      <span className="text-white font-bold">{selectedWithdrawal.diamond_reward.toLocaleString()} 💎</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-red-400">Platform Fee ({helperPlatformFee}%):</span>
                      <span className="text-red-400 font-bold">-{(selectedWithdrawal.diamond_reward * (helperPlatformFee / 100)).toLocaleString()} 💎</span>
                    </div>
                    <div className="border-t border-purple-500/30 pt-2 flex justify-between">
                      <span className="text-green-400 font-semibold">Helper Receives:</span>
                      <span className="text-green-400 font-bold text-lg">{(selectedWithdrawal.diamond_reward * ((100 - helperPlatformFee) / 100)).toLocaleString()} 💎</span>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          <div className="space-y-4">
            <div>
              <label className="text-white/60 text-sm mb-2 block">Notes (Optional)</label>
              <Textarea
                value={actionNotes}
                onChange={(e) => setActionNotes(e.target.value)}
                placeholder="Write a note..."
                className="bg-white/5 border-white/10 text-white"
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowActionDialog(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleAction}
              disabled={processing}
              className={
                actionType === 'approve' ? 'bg-green-600 hover:bg-green-700' :
                actionType === 'reject' ? 'bg-red-600 hover:bg-red-700' :
                'bg-blue-600 hover:bg-blue-700'
              }
            >
              {processing && <Loader2 className="w-4 h-4 animate-spin mr-2" />}
              {actionType === 'approve' && 'Approve'}
              {actionType === 'reject' && 'Reject'}
              {actionType === 'complete' && 'Complete'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>

      <ImageViewer src={imageViewer.viewerImage} open={imageViewer.isOpen} onClose={imageViewer.closeImage} alt="Payment Screenshot" />
    </>
  );
}
