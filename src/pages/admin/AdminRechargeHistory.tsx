import ReportExportMenu from "@/components/admin/ReportExportMenu";
import { useState, useEffect, useCallback } from "react";
import { getAdminCache, setAdminCache } from "@/utils/adminDataCache";
import useAdminRealtime from "@/hooks/useAdminRealtime";
import { useNavigate } from "react-router-dom";
import { SmartImage } from "@/components/ui/smart-image";
import {
  ArrowLeft, Search, Filter, RefreshCw, Coins, User, Calendar,
  CheckCircle, XCircle, Clock, CreditCard, Smartphone, DollarSign,
  ChevronLeft, ChevronRight, Eye
} from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar as CalendarComponent } from "@/components/ui/calendar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle
} from "@/components/ui/dialog";
import { ImageViewer, useImageViewer } from "@/components/ui/image-viewer";
import { adminSupabase as supabase } from "@/integrations/supabase/adminClient";
import { toast } from "sonner";
import { format } from "date-fns";
import { recordAdminError } from "@/utils/adminErrorLog";

import { formatAdminError } from "@/utils/formatAdminError";
import { UserAvatarImage } from "@/components/admin/UserAvatarImage";
import { CopyableUid } from "@/components/admin/CopyableUid";
interface RechargeRecord {
  id: string;
  user_id: string;
  coin_amount: number;
  amount_usd: number;
  amount_local: number;
  currency_code: string;
  payment_method: string;
  status: string;
  created_at: string;
  processed_at: string | null;
  helper_id: string | null;
  payment_details: any;
  user_payment_proof: string | null;
  source: 'helper' | 'google_play' | 'google_play_attempt' | 'gateway' | 'admin_manual' | 'trader' | 'diamond_transfer' | 'swift_pay';
  source_label: string;
  transaction_id: string | null;
  google_order_id: string | null;
  // Joined
  user_name?: string;
  user_avatar?: string;
  user_uid?: string;
  helper_name?: string;
  sender_name?: string;
  sender_uid?: string;
  receiver_name?: string;
  receiver_uid?: string;
}

const AdminRechargeHistory = () => {
  const navigate = useNavigate();
  const imageViewer = useImageViewer();
  const [records, setRecords] = useState<RechargeRecord[]>(() => getAdminCache<RechargeRecord[]>('admin_recharge') || []);
  const [loading, setLoading] = useState(() => !getAdminCache('admin_recharge'));
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [sourceFilter, setSourceFilter] = useState("all");
  const [selectedDate, setSelectedDate] = useState<Date | undefined>(undefined);
  const [page, setPage] = useState(0);
  const [totalCount, setTotalCount] = useState(0);
  const [selectedRecord, setSelectedRecord] = useState<RechargeRecord | null>(null);
  const [stats, setStats] = useState({ total: 0, completed: 0, cancelled: 0, pending: 0, totalCoins: 0, totalUsd: 0, playStoreCount: 0, playStoreUsd: 0 });

  const PAGE_SIZE = 30;

  const getDateRange = useCallback(() => {
    if (!selectedDate) return { start: null, end: null };
    const start = new Date(selectedDate);
    start.setHours(0, 0, 0, 0);
    const end = new Date(selectedDate);
    end.setHours(23, 59, 59, 999);
    return { start: start.toISOString(), end: end.toISOString() };
  }, [selectedDate]);

  const fetchRecords = useCallback(async () => {
    if (records.length === 0) setLoading(true);
    try {
      const { start, end } = getDateRange();

      // 1. Fetch helper_orders
      let helperQ = supabase
        .from('helper_orders')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(500);

      if (start && end) {
        helperQ = helperQ.gte('created_at', start).lte('created_at', end);
      }
      if (statusFilter !== 'all') {
        helperQ = helperQ.eq('status', statusFilter);
      }

      // 2. Fetch recharge_transactions (Google Play, etc.)
      let rechargeQ = supabase
        .from('recharge_transactions')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(500);

      if (start && end) {
        rechargeQ = rechargeQ.gte('created_at', start).lte('created_at', end);
      }
      if (statusFilter !== 'all') {
        rechargeQ = rechargeQ.eq('status', statusFilter);
      }

      // 3. Fetch Google Play purchase attempts (including failed/pending verification)
      let googleAttemptQ = supabase
        .from('google_play_purchase_attempts' as any)
        .select('*')
        .order('created_at', { ascending: false })
        .limit(500);

      if (start && end) {
        googleAttemptQ = googleAttemptQ.gte('created_at', start).lte('created_at', end);
      }
      if (statusFilter !== 'all') {
        const attemptStatuses = statusFilter === 'completed'
          ? ['completed', 'already_processed']
          : statusFilter === 'failed'
            ? ['failed', 'google_not_purchased']
            : [statusFilter];
        googleAttemptQ = googleAttemptQ.in('status', attemptStatuses);
      }

      // 4. Fetch payment_transactions (Gateway)
      let gatewayQ = supabase
        .from('payment_transactions')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(500);

      if (start && end) {
        gatewayQ = gatewayQ.gte('created_at', start).lte('created_at', end);
      }
      if (statusFilter !== 'all') {
        gatewayQ = gatewayQ.eq('status', statusFilter);
      }

      // 5. Fetch helper_transactions (Trader top-ups)
      let traderQ = supabase
        .from('helper_transactions')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(500);

      if (start && end) {
        traderQ = traderQ.gte('created_at', start).lte('created_at', end);
      }
      if (statusFilter !== 'all') {
        traderQ = traderQ.eq('status', statusFilter);
      }

      // 6. Fetch coin_transfers (Diamond transfers)
      let diamondQ = supabase
        .from('coin_transfers')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(500);

      if (start && end) {
        diamondQ = diamondQ.gte('created_at', start).lte('created_at', end);
      }
      if (statusFilter !== 'all') {
        diamondQ = diamondQ.eq('status', statusFilter);
      }

      // 7. Fetch swift_pay_topups (Crypto)
      let swiftQ = supabase
        .from('swift_pay_topups')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(500);

      if (start && end) {
        swiftQ = swiftQ.gte('created_at', start).lte('created_at', end);
      }
      if (statusFilter !== 'all') {
        // swift_pay statuses: pending, paid, credited, expired, failed
        const swiftStatuses = statusFilter === 'completed'
          ? ['credited', 'paid']
          : statusFilter === 'failed'
            ? ['failed', 'expired']
            : [statusFilter];
        swiftQ = swiftQ.in('status', swiftStatuses);
      }

      const [helperRes, rechargeRes, googleAttemptRes, gatewayRes, traderRes, diamondRes, swiftRes] = await Promise.all([
        helperQ, rechargeQ, googleAttemptQ, gatewayQ, traderQ, diamondQ, swiftQ
      ]);

      // Transform helper_orders
      const helperRecords: RechargeRecord[] = (helperRes.data || []).map((r: any) => ({
        id: r.id,
        user_id: r.user_id,
        coin_amount: r.coin_amount || 0,
        amount_usd: r.amount_usd || 0,
        amount_local: r.amount_local || 0,
        currency_code: r.currency_code || 'USD',
        payment_method: r.payment_method || 'N/A',
        status: r.status,
        created_at: r.created_at,
        processed_at: r.processed_at || null,
        helper_id: r.helper_id || null,
        payment_details: r.payment_details || null,
        user_payment_proof: r.user_payment_proof || null,
        source: 'helper' as const,
        source_label: '🧑‍💼 Local Agent',
        transaction_id: null,
        google_order_id: null,
      }));

      // Transform recharge_transactions
      const rechargeRecords: RechargeRecord[] = (rechargeRes.data || []).map((r: any) => {
        const src = r.purchase_source || 'unknown';
        let sourceType: RechargeRecord['source'] = 'google_play';
        let sourceLabel = '📱 Google Play';
        if (src === 'admin_manual' || src === 'manual') {
          sourceType = 'admin_manual';
          sourceLabel = '🔧 Admin Manual';
        } else if (src === 'gateway') {
          sourceType = 'gateway';
          sourceLabel = '💳 Gateway';
        }

        return {
          id: r.id,
          user_id: r.user_id,
          coin_amount: r.coins_received || 0,
          amount_usd: r.amount || 0,
          amount_local: r.local_currency_amount || 0,
          currency_code: r.currency_code || 'USD',
          payment_method: src === 'google_play' ? 'Google Play' : (r.payment_method || src),
          status: r.status,
          created_at: r.created_at,
          processed_at: r.completed_at || null,
          helper_id: null,
          payment_details: { 
            purchase_source: r.purchase_source,
            google_order_id: r.google_order_id,
            google_product_id: r.google_product_id,
            agent_name: r.agent_name,
            agency_name: r.agency_name,
            ip_address: r.ip_address,
          },
          user_payment_proof: null,
          source: sourceType,
          source_label: sourceLabel,
          transaction_id: r.transaction_id || null,
          google_order_id: r.google_order_id || null,
        };
      });

      const rechargeTokenHashes = new Set((rechargeRes.data || [])
        .filter((r: any) => r.purchase_source === 'google_play' && r.transaction_id)
        .map((r: any) => String(r.transaction_id)));

      const googleAttemptRecords: RechargeRecord[] = ((googleAttemptRes.data || []) as any[])
        .filter((r: any) => !['completed', 'already_processed'].includes(String(r.status || '')))
        .filter((r: any) => !rechargeTokenHashes.has(String(r.purchase_token_hash || '')))
        .map((r: any) => ({
          id: r.id,
          user_id: r.user_id,
          coin_amount: r.coins_amount || 0,
          amount_usd: r.amount_usd || 0,
          amount_local: 0,
          currency_code: r.currency_code || 'USD',
          payment_method: 'Google Play Verification',
          status: r.status === 'already_processed' ? 'completed' : r.status,
          created_at: r.created_at,
          processed_at: r.completed_at || null,
          helper_id: null,
          payment_details: {
            product_id: r.product_id,
            google_order_id: r.google_order_id,
            requested_order_id: r.requested_order_id,
            purchase_token_suffix: r.purchase_token_suffix,
            error_code: r.error_code,
            error_message: r.error_message,
            google_purchase_state: r.google_purchase_state,
          },
          user_payment_proof: null,
          source: 'google_play_attempt' as const,
          source_label: '📱 Google Play Attempt',
          transaction_id: r.purchase_token_suffix ? `token…${r.purchase_token_suffix}` : r.purchase_token_hash,
          google_order_id: r.google_order_id || r.requested_order_id || null,
        }));

      // Transform payment_transactions
      const gatewayRecords: RechargeRecord[] = (gatewayRes.data || []).map((r: any) => ({
        id: r.id,
        user_id: r.user_id,
        coin_amount: r.coins_to_receive || 0,
        amount_usd: r.amount_usd || 0,
        amount_local: r.amount_local || 0,
        currency_code: r.currency_code || 'USD',
        payment_method: 'Payment Gateway',
        status: r.status,
        created_at: r.created_at,
        processed_at: r.completed_at || null,
        helper_id: null,
        payment_details: r.payment_data || null,
        user_payment_proof: null,
        source: 'gateway' as const,
        source_label: '💳 Gateway',
        transaction_id: r.gateway_transaction_id || r.transaction_ref || null,
        google_order_id: null,
      }));

      // Transform helper_transactions (Trader)
      const traderRecords: RechargeRecord[] = (traderRes.data || []).map((r: any) => ({
        id: r.id,
        user_id: r.user_id,
        coin_amount: r.coin_amount || 0,
        amount_usd: r.usd_amount || 0,
        amount_local: r.local_amount || 0,
        currency_code: r.currency_code || 'USD',
        payment_method: r.payment_method || 'Trader Wallet',
        status: r.status || 'completed',
        created_at: r.created_at,
        processed_at: r.processed_at || null,
        helper_id: r.helper_id || null,
        payment_details: {
          transaction_type: r.transaction_type,
          notes: r.notes,
          ...(r.payment_details || {}),
        },
        user_payment_proof: null,
        source: 'trader' as const,
        source_label: '🏪 Trader',
        transaction_id: null,
        google_order_id: null,
      }));

      // Transform coin_transfers (Diamond Transfer)
      const diamondRecords: RechargeRecord[] = (diamondRes.data || []).map((r: any) => {
        const senderType = r.sender_type || 'unknown';
        let methodLabel = 'Diamond Transfer';
        if (senderType === 'agency_to_user') methodLabel = 'Agency → User';
        else if (senderType === 'agency_to_agency') methodLabel = 'Agency → Agency';
        else if (senderType === 'helper') methodLabel = 'Helper Transfer';
        else if (senderType === 'trader') methodLabel = 'Trader Transfer';

        return {
          id: r.id,
          user_id: r.receiver_id,
          coin_amount: r.amount || 0,
          amount_usd: 0,
          amount_local: 0,
          currency_code: 'USD',
          payment_method: methodLabel,
          status: r.status || 'completed',
          created_at: r.created_at,
          processed_at: null,
          helper_id: null,
          payment_details: {
            sender_type: r.sender_type,
            sender_id: r.sender_id,
            note: r.note,
          },
          user_payment_proof: null,
          source: 'diamond_transfer' as const,
          source_label: '💎 Diamond Transfer',
          transaction_id: null,
          google_order_id: null,
        };
      });

      // Transform swift_pay_topups (Crypto)
      const swiftRecords: RechargeRecord[] = (swiftRes.data || []).map((r: any) => {
        const rawStatus = String(r.status || '');
        const uiStatus = rawStatus === 'credited' || rawStatus === 'paid'
          ? 'completed'
          : rawStatus === 'expired' || rawStatus === 'failed'
            ? 'failed'
            : rawStatus;
        return {
          id: r.id,
          user_id: r.user_id,
          coin_amount: r.coins_amount || 0,
          amount_usd: Number(r.price_usd || 0),
          amount_local: Number(r.pay_amount || 0),
          currency_code: r.pay_currency || 'USD',
          payment_method: `Swift Pay (${r.pay_currency || 'crypto'}/${r.pay_network || ''})`,
          status: uiStatus,
          created_at: r.created_at,
          processed_at: r.credited_at || r.paid_at || null,
          helper_id: null,
          payment_details: {
            raw_status: rawStatus,
            pay_currency: r.pay_currency,
            pay_network: r.pay_network,
            pay_address: r.pay_address,
            pay_amount: r.pay_amount,
            expires_at: r.expires_at,
            paid_at: r.paid_at,
            credited_at: r.credited_at,
            poll_attempts: r.poll_attempts,
            error_message: r.error_message,
            target_type: r.target_type,
            target_helper_id: r.target_helper_id,
          },
          user_payment_proof: null,
          source: 'swift_pay' as const,
          source_label: '🪙 Swift Pay',
          transaction_id: r.payment_id || null,
          google_order_id: null,
        };
      });

      // Merge & sort
      let allRecords = [
        ...helperRecords,
        ...rechargeRecords,
        ...googleAttemptRecords,
        ...gatewayRecords,
        ...traderRecords,
        ...diamondRecords,
        ...swiftRecords,
      ];

      // Apply source filter
      if (sourceFilter !== 'all') {
        allRecords = allRecords.filter(r => r.source === sourceFilter);
      }

      allRecords.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

      // Calculate stats from all records
      const completedRecords = allRecords.filter(r => r.status === 'completed');
      const playStoreCompleted = completedRecords.filter(r => r.source === 'google_play');
      setStats({
        total: allRecords.length,
        completed: completedRecords.length,
        cancelled: allRecords.filter(r => r.status === 'cancelled' || r.status === 'rejected').length,
        pending: allRecords.filter(r => r.status === 'pending').length,
        totalCoins: completedRecords.reduce((sum, r) => sum + (r.coin_amount || 0), 0),
        totalUsd: completedRecords.reduce((sum, r) => sum + (r.amount_usd || 0), 0),
        playStoreCount: playStoreCompleted.length,
        playStoreUsd: playStoreCompleted.reduce((sum, r) => sum + (r.amount_usd || 0), 0),
      });

      setTotalCount(allRecords.length);

      // Fetch user & helper profiles for current page
      const pageRecords = allRecords.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);
      
      const userIds = [...new Set(pageRecords.map(r => r.user_id))];
      const helperIds = [...new Set(pageRecords.filter(r => r.helper_id).map(r => r.helper_id!))];
      const senderIds = [...new Set(pageRecords
        .filter(r => r.source === 'diamond_transfer' && r.payment_details?.sender_id)
        .map(r => r.payment_details.sender_id))];

      const allProfileIds = [...new Set([...userIds, ...senderIds])].filter(Boolean);

      let userProfiles: any[] = [];
      if (allProfileIds.length > 0) {
        const { data } = await supabase
          .from('profiles_public')
          .select('id, display_name, avatar_url, app_uid')
          .in('id', allProfileIds);
        userProfiles = data || [];
      }

      const profileMap = new Map(userProfiles.map(p => [p.id, p]));

      const helperNameMap = new Map<string, string>();
      if (helperIds.length > 0) {
        const { data: helpers } = await supabase
          .from('topup_helpers')
          .select('id, user_id')
          .in('id', helperIds);

        if (helpers && helpers.length > 0) {
          const { data: helperProfiles } = await supabase
            .from('profiles_public')
            .select('id, display_name')
            .in('id', helpers.map(h => h.user_id).filter(Boolean));

          const helperProfileMap = new Map(helperProfiles?.map(p => [p.id, p.display_name]) || []);
          helpers.forEach(h => {
            helperNameMap.set(h.id, helperProfileMap.get(h.user_id) || 'Unknown Helper');
          });
        }
      }

      // Also resolve trader helper names
      const traderHelperIds = [...new Set(pageRecords
        .filter(r => r.source === 'trader' && r.helper_id && !helperNameMap.has(r.helper_id))
        .map(r => r.helper_id!))];
      
      if (traderHelperIds.length > 0) {
        const { data: traderHelpers } = await supabase
          .from('topup_helpers')
          .select('id, user_id')
          .in('id', traderHelperIds);

        if (traderHelpers && traderHelpers.length > 0) {
          const { data: thProfiles } = await supabase
            .from('profiles_public')
            .select('id, display_name')
            .in('id', traderHelpers.map(h => h.user_id).filter(Boolean));

          const thMap = new Map(thProfiles?.map(p => [p.id, p.display_name]) || []);
          traderHelpers.forEach(h => {
            helperNameMap.set(h.id, thMap.get(h.user_id) || 'Unknown Trader');
          });
        }
      }

      const enriched = pageRecords.map(r => {
        const senderId = r.payment_details?.sender_id;
        const senderProfile = senderId ? profileMap.get(senderId) : null;

        return {
          ...r,
          user_name: profileMap.get(r.user_id)?.display_name || 'Unknown',
          user_avatar: profileMap.get(r.user_id)?.avatar_url || null,
          user_uid: profileMap.get(r.user_id)?.app_uid || null,
          helper_name: r.helper_id ? (helperNameMap.get(r.helper_id) || 'Unknown Helper') : null,
          sender_name: senderProfile?.display_name || undefined,
          sender_uid: senderProfile?.app_uid || undefined,
        };
      });

      // Apply search filter
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const filtered = enriched.filter(r =>
          r.user_name?.toLowerCase().includes(q) ||
          r.user_uid?.includes(q) ||
          r.helper_name?.toLowerCase().includes(q) ||
          r.payment_method?.toLowerCase().includes(q) ||
          r.google_order_id?.toLowerCase().includes(q) ||
          r.transaction_id?.toLowerCase().includes(q) ||
          r.sender_name?.toLowerCase().includes(q) ||
          r.sender_uid?.includes(q)
        );
        setRecords(filtered);
      } else {
        setRecords(enriched);
      }
    } catch (error) {
      recordAdminError({ kind: "rpc", label: "AdminRechargeHistory.FetchError", message: formatAdminError(error)});
      toast.error('Failed to load recharge history');
    } finally {
      setLoading(false);
    }
  }, [page, statusFilter, sourceFilter, searchQuery, getDateRange]);

  useEffect(() => {
    fetchRecords();
  }, [fetchRecords]);

  useAdminRealtime(['helper_orders', 'recharge_transactions', 'payment_transactions', 'helper_transactions', 'coin_transfers', 'swift_pay_topups', 'google_play_purchase_attempts'], fetchRecords);

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'completed':
        return <Badge className="bg-emerald-500/20 text-emerald-400 border-emerald-500/30"><CheckCircle className="w-3 h-3 mr-1" /> Completed</Badge>;
      case 'cancelled':
      case 'rejected':
        return <Badge className="bg-red-500/20 text-red-400 border-red-500/30"><XCircle className="w-3 h-3 mr-1" /> Cancelled</Badge>;
      case 'pending':
        return <Badge className="bg-amber-500/20 text-amber-400 border-amber-500/30"><Clock className="w-3 h-3 mr-1" /> Pending</Badge>;
      case 'failed':
        return <Badge className="bg-red-500/20 text-red-400 border-red-500/30"><XCircle className="w-3 h-3 mr-1" /> Failed</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  const getSourceBadge = (record: RechargeRecord) => {
    switch (record.source) {
      case 'google_play':
        return <Badge className="bg-green-500/20 text-green-400 border-green-500/30 text-[10px]">📱 Google Play</Badge>;
      case 'google_play_attempt':
        return <Badge className="bg-amber-500/20 text-amber-500 border-amber-500/30 text-[10px]">📱 Play Attempt</Badge>;
      case 'helper':
        return <Badge className="bg-blue-500/20 text-blue-400 border-blue-500/30 text-[10px]">🧑‍💼 Local Agent</Badge>;
      case 'gateway':
        return <Badge className="bg-purple-500/20 text-purple-400 border-purple-500/30 text-[10px]">💳 Gateway</Badge>;
      case 'admin_manual':
        return <Badge className="bg-orange-500/20 text-orange-400 border-orange-500/30 text-[10px]">🔧 Admin</Badge>;
      case 'trader':
        return <Badge className="bg-teal-500/20 text-teal-400 border-teal-500/30 text-[10px]">🏪 Trader</Badge>;
      case 'diamond_transfer':
        return <Badge className="bg-pink-500/20 text-pink-400 border-pink-500/30 text-[10px]">💎 Transfer</Badge>;
      default:
        return <Badge variant="outline" className="text-[10px]">{record.source}</Badge>;
    }
  };

  const totalPages = Math.ceil(totalCount / PAGE_SIZE);

  return (
    <div className="admin-pro-shell space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <div>
            <h1 className="text-2xl font-bold text-foreground">Recharge History</h1>
            <p className="text-sm text-muted-foreground">All recharges: Google Play, failed Play attempts, Local Agent, Gateway, Admin Manual, Trader & Diamond Transfer</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <ReportExportMenu
            rows={records as any}
            columns={[
              { key: "created_at", label: "Date", weight: 1.2, format: (v) => v ? new Date(String(v)).toLocaleString() : "—" },
              { key: "user_name", label: "User", weight: 1.3, format: (_, r: any) => r.user_name || r.user?.display_name || r.user_id || "—" },
              { key: "source", label: "Source", weight: 1 },
              { key: "coin_amount", label: "Diamonds", weight: 1, format: (v) => v != null ? Number(v).toLocaleString() : "—" },
              { key: "usd_amount", label: "USD", weight: 0.9, format: (v) => v != null ? `$${Number(v).toFixed(2)}` : "—" },
              { key: "status", label: "Status", weight: 0.9 },
              { key: "method", label: "Method", weight: 1 },
            ]}
            meta={{
              title: "Recharge History Report",
              subtitle: `${records.length} records • All sources`,
              fileName: "recharge-history",
              summary: [
                { label: "Total Orders", value: stats.total },
                { label: "Completed", value: stats.completed },
                { label: "Pending", value: stats.pending },
                { label: "Revenue", value: `$${stats.totalUsd.toFixed(2)}` },
              ],
            }}
          />
          <Button onClick={fetchRecords} variant="outline" size="sm">
            <RefreshCw className="w-4 h-4 mr-2" /> Refresh
          </Button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
        <Card className="bg-card border-border">
          <CardContent className="p-4 text-center">
            <p className="text-2xl font-bold text-foreground">{stats.total}</p>
            <p className="text-xs text-muted-foreground">Total Orders</p>
          </CardContent>
        </Card>
        <Card className="bg-card border-border">
          <CardContent className="p-4 text-center">
            <p className="text-2xl font-bold text-emerald-400">{stats.completed}</p>
            <p className="text-xs text-muted-foreground">Completed</p>
          </CardContent>
        </Card>
        <Card className="bg-card border-border">
          <CardContent className="p-4 text-center">
            <p className="text-2xl font-bold text-amber-400">{stats.pending}</p>
            <p className="text-xs text-muted-foreground">Pending</p>
          </CardContent>
        </Card>
        <Card className="bg-card border-border">
          <CardContent className="p-4 text-center">
            <p className="text-2xl font-bold text-red-400">{stats.cancelled}</p>
            <p className="text-xs text-muted-foreground">Cancelled/Failed</p>
          </CardContent>
        </Card>
        <Card className="bg-card border-border">
          <CardContent className="p-4 text-center">
            <p className="text-2xl font-bold text-foreground">💎 {stats.totalCoins.toLocaleString()}</p>
            <p className="text-xs text-muted-foreground">Total Diamonds Sold</p>
          </CardContent>
        </Card>
        <Card className="bg-card border-border">
          <CardContent className="p-4 text-center">
            <p className="text-2xl font-bold text-green-400">${stats.totalUsd.toFixed(2)}</p>
            <p className="text-xs text-muted-foreground">Total Revenue</p>
          </CardContent>
        </Card>
        <Card className="bg-gradient-to-br from-emerald-900/40 to-emerald-700/20 border-emerald-500/40 cursor-pointer hover:border-emerald-400 transition"
              onClick={() => { setSourceFilter('google_play'); setPage(0); }}>
          <CardContent className="p-4 text-center">
            <p className="text-2xl font-bold text-emerald-300">📱 {stats.playStoreCount}</p>
            <p className="text-xs text-emerald-300/80">Play Store · ${stats.playStoreUsd.toFixed(2)}</p>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3 flex-wrap">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Search name, UID, order ID, helper..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10"
          />
        </div>
        <Popover>
          <PopoverTrigger asChild>
            <Button variant="outline" className="w-[180px] justify-start text-left font-normal">
              <Calendar className="mr-2 h-4 w-4" />
              {selectedDate ? format(selectedDate, 'MMM dd, yyyy') : '📅 All Dates'}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0" align="start">
            <CalendarComponent
              mode="single"
              selected={selectedDate}
              onSelect={(date) => { setSelectedDate(date); setPage(0); }}
              initialFocus
            />
            <div className="p-2 border-t border-border">
              <Button variant="ghost" size="sm" className="w-full" onClick={() => { setSelectedDate(undefined); setPage(0); }}>
                All Dates
              </Button>
            </div>
          </PopoverContent>
        </Popover>
        <Select value={sourceFilter} onValueChange={(v) => { setSourceFilter(v); setPage(0); }}>
          <SelectTrigger className="w-[160px]">
            <SelectValue placeholder="Source" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Sources</SelectItem>
            <SelectItem value="google_play">📱 Google Play</SelectItem>
            <SelectItem value="google_play_attempt">📱 Play Attempts</SelectItem>
            <SelectItem value="helper">🧑‍💼 Local Agent</SelectItem>
            <SelectItem value="gateway">💳 Gateway</SelectItem>
            <SelectItem value="admin_manual">🔧 Admin Manual</SelectItem>
            <SelectItem value="trader">🏪 Trader</SelectItem>
            <SelectItem value="diamond_transfer">💎 Diamond Transfer</SelectItem>
          </SelectContent>
        </Select>
        <Select value={statusFilter} onValueChange={(v) => { setStatusFilter(v); setPage(0); }}>
          <SelectTrigger className="w-[160px]">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Status</SelectItem>
            <SelectItem value="completed">Completed</SelectItem>
            <SelectItem value="pending">Pending</SelectItem>
            <SelectItem value="cancelled">Cancelled</SelectItem>
            <SelectItem value="failed">Failed</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Table */}
      <Card className="bg-card border-border overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/30">
                <th className="text-left p-3 font-medium text-muted-foreground">User</th>
                <th className="text-left p-3 font-medium text-muted-foreground">Source</th>
                <th className="text-left p-3 font-medium text-muted-foreground">Diamonds</th>
                <th className="text-left p-3 font-medium text-muted-foreground">Amount</th>
                <th className="text-left p-3 font-medium text-muted-foreground">Method</th>
                <th className="text-left p-3 font-medium text-muted-foreground">Helper/Agent</th>
                <th className="text-left p-3 font-medium text-muted-foreground">Status</th>
                <th className="text-left p-3 font-medium text-muted-foreground">Date</th>
                <th className="text-left p-3 font-medium text-muted-foreground">Action</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={9} className="text-center p-8 text-muted-foreground">Loading...</td></tr>
              ) : records.length === 0 ? (
                <tr><td colSpan={9} className="text-center p-8 text-muted-foreground">No recharge records found</td></tr>
              ) : records.map(r => (
                <tr key={`${r.source}-${r.id}`} className="border-b border-border/50 hover:bg-muted/20 transition-colors">
                  <td className="p-3">
                    <div className="flex items-center gap-2">
                      <Avatar className="w-8 h-8">
                        <UserAvatarImage src={r.user_avatar || ''} />
                        <AvatarFallback className="bg-primary/20 text-primary text-xs">
                          {r.user_name?.charAt(0) || '?'}
                        </AvatarFallback>
                      </Avatar>
                      <div>
                        <p className="font-medium text-foreground text-xs">{r.user_name}</p>
                        {r.user_uid && <p className="text-[10px] text-muted-foreground">{r.user_uid}</p>}
                      </div>
                    </div>
                  </td>
                  <td className="p-3">{getSourceBadge(r)}</td>
                  <td className="p-3">
                    <span className="font-semibold text-foreground">💎 {r.coin_amount?.toLocaleString()}</span>
                  </td>
                  <td className="p-3">
                    <div>
                      <p className="text-foreground">${r.amount_usd?.toFixed(2)}</p>
                      {r.amount_local > 0 && r.currency_code !== 'USD' && (
                        <p className="text-[10px] text-muted-foreground">{r.currency_code} {r.amount_local?.toFixed(2)}</p>
                      )}
                    </div>
                  </td>
                  <td className="p-3">
                    <Badge variant="outline" className="text-xs capitalize">{r.payment_method || 'N/A'}</Badge>
                  </td>
                  <td className="p-3">
                    {r.source === 'diamond_transfer' && r.sender_name ? (
                      <div>
                        <p className="text-xs text-foreground">{r.sender_name}</p>
                        {r.sender_uid && <p className="text-[10px] text-muted-foreground">{r.sender_uid}</p>}
                      </div>
                    ) : (
                      <span className="text-xs text-muted-foreground">{r.helper_name || '-'}</span>
                    )}
                  </td>
                  <td className="p-3">{getStatusBadge(r.status)}</td>
                  <td className="p-3">
                    <span className="text-xs text-muted-foreground">
                      {format(new Date(r.created_at), 'MMM dd, yyyy HH:mm')}
                    </span>
                  </td>
                  <td className="p-3">
                    <Button variant="ghost" size="icon" onClick={() => setSelectedRecord(r)}>
                      <Eye className="w-4 h-4" />
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between p-3 border-t border-border">
            <p className="text-xs text-muted-foreground">
              Page {page + 1} of {totalPages} ({totalCount} records)
            </p>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" disabled={page === 0} onClick={() => setPage(p => p - 1)}>
                <ChevronLeft className="w-4 h-4" />
              </Button>
              <Button variant="outline" size="sm" disabled={page >= totalPages - 1} onClick={() => setPage(p => p + 1)}>
                <ChevronRight className="w-4 h-4" />
              </Button>
            </div>
          </div>
        )}
      </Card>

      {/* Detail Dialog */}
      <Dialog open={!!selectedRecord} onOpenChange={() => setSelectedRecord(null)}>
        <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Recharge Details</DialogTitle>
          </DialogHeader>
          {selectedRecord && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div>
                  <p className="text-muted-foreground">User</p>
                  <p className="font-medium">{selectedRecord.user_name}</p>
                  {selectedRecord.user_uid && <p className="text-xs text-muted-foreground"><CopyableUid value={selectedRecord.user_uid} /></p>}
                </div>
                <div>
                  <p className="text-muted-foreground">Source</p>
                  {getSourceBadge(selectedRecord)}
                </div>
                <div>
                  <p className="text-muted-foreground">Status</p>
                  {getStatusBadge(selectedRecord.status)}
                </div>
                <div>
                  <p className="text-muted-foreground">Diamonds</p>
                  <p className="font-bold text-lg">💎 {selectedRecord.coin_amount?.toLocaleString()}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Amount</p>
                  <p className="font-medium">${selectedRecord.amount_usd?.toFixed(2)}</p>
                  {selectedRecord.amount_local > 0 && selectedRecord.currency_code !== 'USD' && (
                    <p className="text-xs text-muted-foreground">{selectedRecord.currency_code} {selectedRecord.amount_local?.toFixed(2)}</p>
                  )}
                </div>
                <div>
                  <p className="text-muted-foreground">Payment Method</p>
                  <p className="font-medium capitalize">{selectedRecord.payment_method || 'N/A'}</p>
                </div>
                {selectedRecord.helper_name && (
                  <div>
                    <p className="text-muted-foreground">Helper/Trader</p>
                    <p className="font-medium">{selectedRecord.helper_name}</p>
                  </div>
                )}
                {selectedRecord.sender_name && (
                  <div>
                    <p className="text-muted-foreground">Sender</p>
                    <p className="font-medium">{selectedRecord.sender_name}</p>
                    {selectedRecord.sender_uid && <p className="text-xs text-muted-foreground"><CopyableUid value={selectedRecord.sender_uid} /></p>}
                  </div>
                )}
                {selectedRecord.google_order_id && (
                  <div className="col-span-2">
                    <p className="text-muted-foreground">Google Order ID</p>
                    <p className="font-mono text-xs break-all">{selectedRecord.google_order_id}</p>
                  </div>
                )}
                {selectedRecord.transaction_id && (
                  <div className="col-span-2">
                    <p className="text-muted-foreground">Transaction ID</p>
                    <p className="font-mono text-xs break-all">{selectedRecord.transaction_id}</p>
                  </div>
                )}
                <div>
                  <p className="text-muted-foreground">Created</p>
                  <p className="text-xs">{format(new Date(selectedRecord.created_at), 'MMM dd, yyyy HH:mm:ss')}</p>
                </div>
                {selectedRecord.processed_at && (
                  <div>
                    <p className="text-muted-foreground">Processed</p>
                    <p className="text-xs">{format(new Date(selectedRecord.processed_at), 'MMM dd, yyyy HH:mm:ss')}</p>
                  </div>
                )}
              </div>
              {selectedRecord.payment_details && (
                <div>
                  <p className="text-muted-foreground text-sm mb-1">Payment Details</p>
                  <Card className="bg-muted/30">
                    <CardContent className="p-3 text-xs space-y-1">
                      {Object.entries(selectedRecord.payment_details)
                        .filter(([_, value]) => value != null && value !== '')
                        .map(([key, value]) => (
                          <div key={key} className="flex justify-between">
                            <span className="text-muted-foreground capitalize">{key.replace(/_/g, ' ')}</span>
                            <span className="font-medium">{String(value)}</span>
                          </div>
                        ))}
                    </CardContent>
                  </Card>
                </div>
              )}
              {selectedRecord.user_payment_proof && (
                <div>
                  <p className="text-muted-foreground text-sm mb-1">Payment Proof</p>
                  <SmartImage 
                    src={selectedRecord.user_payment_proof} 
                    alt="Payment proof" 
                    className="w-full rounded-lg object-contain cursor-pointer hover:opacity-90 transition-opacity" 
                    onClick={() => imageViewer.openImage(selectedRecord.user_payment_proof!)} fallbackSrc="/placeholder.svg" />
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Fullscreen Image Viewer */}
      <ImageViewer src={imageViewer.viewerImage} open={imageViewer.isOpen} onClose={imageViewer.closeImage} alt="Payment Proof" />
    </div>
  );
};

export default AdminRechargeHistory;
