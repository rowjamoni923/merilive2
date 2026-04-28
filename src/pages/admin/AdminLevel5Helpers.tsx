import { useState, useEffect } from "react";
import useAdminRealtime from "@/hooks/useAdminRealtime";
import { useNavigate } from "react-router-dom";
import { 
  Search, Users, CheckCircle, XCircle, Clock, 
  Gem, Crown, Star, Shield, Loader2, Image, DollarSign,
  Banknote, Settings, Building2, User, Globe, FileText, Download, TrendingUp
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { adminSupabase as supabase } from "@/integrations/supabase/adminClient";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { format, subDays, startOfDay, eachDayOfInterval } from "date-fns";
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, BarChart, Bar, Legend } from "recharts";

interface Level5Helper {
  id: string;
  user_id: string;
  country_code: string;
  trader_level: number;
  wallet_balance: number;
  payroll_enabled: boolean;
  is_verified: boolean;
  created_at: string;
  user?: {
    display_name: string;
    avatar_url: string;
    app_uid: string;
    country_code: string | null;
    country_flag: string | null;
    country_name: string | null;
  };
  payment_methods_count?: number;
}

interface WithdrawalRequest {
  id: string;
  helper_id: string;
  beans_amount: number;
  usd_amount: number;
  local_amount: number;
  currency_code: string;
  status: string;
  payment_method?: string;
  payment_screenshot_url?: string;
  diamond_reward: number;
  helper_notes?: string;
  admin_notes?: string;
  created_at: string;
  helper?: {
    user_id: string;
    country_code: string;
    user?: {
      display_name: string;
      avatar_url: string;
    };
  };
  agency?: {
    name: string;
    agency_code: string;
  };
  host?: {
    display_name: string;
  };
}

interface LevelConfig {
  id: string;
  level_number: number;
  level_name: string;
  is_enabled: boolean;
  has_payroll_access: boolean;
  has_withdrawal_processing: boolean;
  commission_rate: number;
}

interface PayrollApplication {
  id: string;
  user_id: string;
  trader_level: number;
  country_code: string;
  payroll_status: string;
  payroll_applied_at: string;
  user?: {
    display_name: string;
    avatar_url: string;
    app_uid: string;
  };
}

const AdminLevel5Helpers = () => {
  const { toast } = useToast();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [activeTab, setActiveTab] = useState("payroll");
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [countryFilter, setCountryFilter] = useState("all");
  
  // Data states
  const [helpers, setHelpers] = useState<Level5Helper[]>([]);
  const [payrollApplications, setPayrollApplications] = useState<PayrollApplication[]>([]);
  const [withdrawalRequests, setWithdrawalRequests] = useState<WithdrawalRequest[]>([]);
  const [levelConfigs, setLevelConfigs] = useState<LevelConfig[]>([]);
  const [countries, setCountries] = useState<string[]>([]);
  
  // Dialog states
  const [selectedWithdrawal, setSelectedWithdrawal] = useState<WithdrawalRequest | null>(null);
  const [showWithdrawalDialog, setShowWithdrawalDialog] = useState(false);
  const [adminNotes, setAdminNotes] = useState("");
  const [diamondReward, setDiamondReward] = useState("");

  // Stats
  const [stats, setStats] = useState({
    totalHelpers: 0,
    pendingWithdrawals: 0,
    completedToday: 0,
    totalDiamondsAwarded: 0,
    pendingPayroll: 0
  });

  // Chart data
  const [chartData, setChartData] = useState<Array<{
    date: string;
    approved: number;
    pending: number;
    rejected: number;
    usdTotal: number;
  }>>([]);

  useAdminRealtime(['topup_helpers', 'helper_withdrawal_requests', 'helper_level_config'], () => {
    loadHelpers();
    loadPayrollApplications();
    loadStats();
    loadWithdrawals();
    loadChartData();
    loadLevelConfigs();
  });
  
  // Reload withdrawals when status filter changes
  useEffect(() => {
    if (statusFilter) {
      loadWithdrawals();
    }
  }, [statusFilter]);

  const loadData = async () => {
    setLoading(true);
    try {
      await Promise.all([
        loadHelpers(),
        loadPayrollApplications(),
        loadWithdrawals(),
        loadLevelConfigs(),
        loadStats(),
        loadChartData()
      ]);
    } catch (error) {
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  const loadPayrollApplications = async () => {
    const { data } = await supabase
      .from('topup_helpers')
      .select(`
        *,
        user:profiles!topup_helpers_user_id_fkey(display_name, avatar_url, app_uid, country_code, country_flag, country_name)
      `)
      .eq('trader_level', 5)
      .not('payroll_status', 'is', null)
      .order('payroll_applied_at', { ascending: false });
    
    setPayrollApplications((data || []) as PayrollApplication[]);
    
    // Get unique countries
    const uniqueCountries = [...new Set((data || []).map((h: any) => h.country_code).filter(Boolean))];
    setCountries(uniqueCountries as string[]);
  };

  const loadHelpers = async () => {
    const { data } = await supabase
      .from('topup_helpers')
      .select(`
        *,
        user:profiles!topup_helpers_user_id_fkey(display_name, avatar_url, app_uid, country_code, country_flag, country_name)
      `)
      .eq('trader_level', 5)
      .eq('payroll_enabled', true)
      .order('created_at', { ascending: false });
    
    setHelpers((data || []) as Level5Helper[]);
  };

  const loadWithdrawals = async () => {
    let query = supabase
      .from('helper_withdrawal_requests')
      .select(`
        *,
        helper:topup_helpers!helper_withdrawal_requests_helper_id_fkey(
          user_id, country_code,
          user:profiles!topup_helpers_user_id_fkey(display_name, avatar_url)
        ),
        agency:agencies(name, agency_code),
        host:profiles!helper_withdrawal_requests_host_id_fkey(display_name)
      `)
      .order('created_at', { ascending: false });

    if (statusFilter !== 'all') {
      query = query.eq('status', statusFilter);
    }

    const { data } = await query;
    setWithdrawalRequests((data || []) as WithdrawalRequest[]);
  };

  const loadLevelConfigs = async () => {
    const { data } = await supabase
      .from('helper_level_config')
      .select('*')
      .order('level_number', { ascending: true });
    
    setLevelConfigs((data || []) as LevelConfig[]);
  };

  const loadStats = async () => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const [helpersResult, pendingResult, completedResult, diamondsResult, payrollPendingResult] = await Promise.all([
      supabase.from('topup_helpers').select('id', { count: 'exact' }).eq('trader_level', 5).eq('payroll_enabled', true),
      supabase.from('helper_withdrawal_requests').select('id', { count: 'exact' }).eq('status', 'screenshot_submitted'),
      supabase.from('helper_withdrawal_requests').select('id', { count: 'exact' }).eq('status', 'approved').gte('approved_at', today.toISOString()),
      supabase.from('helper_withdrawal_requests').select('diamond_reward').eq('status', 'approved'),
      supabase.from('topup_helpers').select('id', { count: 'exact' }).eq('trader_level', 5).eq('payroll_status', 'pending')
    ]);

    setStats({
      totalHelpers: helpersResult.count || 0,
      pendingWithdrawals: pendingResult.count || 0,
      completedToday: completedResult.count || 0,
      totalDiamondsAwarded: (diamondsResult.data || []).reduce((sum, r) => sum + (r.diamond_reward || 0), 0),
      pendingPayroll: payrollPendingResult.count || 0
    });
  };

  // Load chart data for last 14 days
  const loadChartData = async () => {
    const endDate = new Date();
    const startDate = subDays(endDate, 13);
    
    const { data } = await supabase
      .from('helper_withdrawal_requests')
      .select('created_at, status, usd_amount')
      .gte('created_at', startOfDay(startDate).toISOString())
      .order('created_at', { ascending: true });

    // Create date range
    const dateRange = eachDayOfInterval({ start: startDate, end: endDate });
    
    // Aggregate data by date
    const aggregated = dateRange.map(date => {
      const dateStr = format(date, 'yyyy-MM-dd');
      const dayData = (data || []).filter(d => format(new Date(d.created_at), 'yyyy-MM-dd') === dateStr);
      
      return {
        date: format(date, 'MMM dd'),
        approved: dayData.filter(d => d.status === 'approved').length,
        pending: dayData.filter(d => ['pending', 'paid', 'screenshot_submitted'].includes(d.status)).length,
        rejected: dayData.filter(d => d.status === 'rejected').length,
        usdTotal: dayData.filter(d => d.status === 'approved').reduce((sum, d) => sum + (d.usd_amount || 0), 0)
      };
    });

    setChartData(aggregated);
  };

  // Payroll approval/rejection handlers
  const handleApprovePayroll = async (helper: PayrollApplication) => {
    setProcessing(true);
    try {
      const { error } = await supabase
        .from('topup_helpers')
        .update({
          payroll_enabled: true,
          payroll_status: 'approved',
          payroll_approved_at: new Date().toISOString()
        })
        .eq('id', helper.id);

      if (error) throw error;

      // Send notification
      await supabase.from('helper_notifications').insert({
        helper_id: helper.id,
        type: 'payroll_approved',
        title: '✅ Payroll Access Approved!',
        message: 'You now have access to Level 5 Payroll Dashboard',
        data: { approved_at: new Date().toISOString() }
      });

      toast({ title: "Approved!", description: "Payroll access granted" });
      loadData();
    } catch (error: any) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } finally {
      setProcessing(false);
    }
  };

  const handleRejectPayroll = async (helper: PayrollApplication, reason?: string) => {
    setProcessing(true);
    try {
      const { error } = await supabase
        .from('topup_helpers')
        .update({
          payroll_enabled: false,
          payroll_status: 'rejected'
        })
        .eq('id', helper.id);

      if (error) throw error;

      // Send notification
      await supabase.from('helper_notifications').insert({
        helper_id: helper.id,
        type: 'payroll_rejected',
        title: '❌ Payroll Access Rejected',
        message: reason || 'Your payroll access application was rejected',
        data: { rejected_at: new Date().toISOString() }
      });

      toast({ title: "Rejected", description: "Payroll access denied" });
      loadData();
    } catch (error: any) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } finally {
      setProcessing(false);
    }
  };

  // Filter payroll applications by country
  const filteredPayrollApplications = payrollApplications.filter(app => {
    if (countryFilter !== 'all' && app.country_code !== countryFilter) return false;
    if (!searchQuery) return true;
    const search = searchQuery.toLowerCase();
    return (
      app.user?.display_name?.toLowerCase().includes(search) ||
      app.user?.app_uid?.toLowerCase().includes(search)
    );
  });

  const handleApproveWithdrawal = async () => {
    if (!selectedWithdrawal) return;

    setProcessing(true);
    try {
      const reward = parseInt(diamondReward) || selectedWithdrawal.diamond_reward || 0;

      // Get helper info
      const { data: helper } = await supabase
        .from('topup_helpers')
        .select('wallet_balance, user_id')
        .eq('id', selectedWithdrawal.helper_id)
        .single();

      if (!helper) throw new Error('Helper not found');

      // Update withdrawal status
      const { error: updateError } = await supabase
        .from('helper_withdrawal_requests')
        .update({
          status: 'approved',
          diamond_reward: reward,
          admin_notes: adminNotes || null,
          approved_at: new Date().toISOString()
        })
        .eq('id', selectedWithdrawal.id);

      if (updateError) throw updateError;

      // Add diamonds to helper wallet
      if (reward > 0) {
        await supabase
          .from('topup_helpers')
          .update({ wallet_balance: (helper.wallet_balance || 0) + reward })
          .eq('id', selectedWithdrawal.helper_id);

        // Send notification
        await supabase.from('helper_notifications').insert({
          helper_id: selectedWithdrawal.helper_id,
          type: 'diamonds_credited',
          title: '💎 Diamonds Credited!',
          message: `${reward.toLocaleString()} diamonds added for processing withdrawal`,
          data: { diamond_reward: reward, withdrawal_id: selectedWithdrawal.id }
        });
      }

      toast({ title: "Approved!", description: `${reward.toLocaleString()} diamonds credited to helper` });
      setShowWithdrawalDialog(false);
      setSelectedWithdrawal(null);
      setAdminNotes("");
      setDiamondReward("");
      loadData();
    } catch (error: any) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } finally {
      setProcessing(false);
    }
  };

  const handleRejectWithdrawal = async () => {
    if (!selectedWithdrawal) return;

    setProcessing(true);
    try {
      await supabase
        .from('helper_withdrawal_requests')
        .update({
          status: 'rejected',
          admin_notes: adminNotes || 'Rejected by admin'
        })
        .eq('id', selectedWithdrawal.id);

      // Send notification
      await supabase.from('helper_notifications').insert({
        helper_id: selectedWithdrawal.helper_id,
        type: 'withdrawal_rejected',
        title: '❌ Withdrawal Rejected',
        message: adminNotes || 'Your withdrawal submission was rejected',
        data: { withdrawal_id: selectedWithdrawal.id }
      });

      toast({ title: "Rejected", description: "Withdrawal has been rejected" });
      setShowWithdrawalDialog(false);
      setSelectedWithdrawal(null);
      setAdminNotes("");
      loadData();
    } catch (error: any) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } finally {
      setProcessing(false);
    }
  };

  const toggleLevelConfig = async (config: LevelConfig, field: 'is_enabled' | 'has_payroll_access' | 'has_withdrawal_processing') => {
    try {
      await supabase
        .from('helper_level_config')
        .update({ [field]: !config[field] })
        .eq('id', config.id);

      toast({ title: "Updated", description: `Level ${config.level_number} ${field.replace(/_/g, ' ')} toggled` });
      loadLevelConfigs();
    } catch (error: any) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    }
  };

  const toggleHelperPayroll = async (helper: Level5Helper, enabled: boolean) => {
    try {
      await supabase
        .from('topup_helpers')
        .update({ payroll_enabled: enabled })
        .eq('id', helper.id);

      toast({ title: "Updated", description: `Payroll ${enabled ? 'enabled' : 'disabled'} for helper` });
      loadHelpers();
    } catch (error: any) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    }
  };

  const getLevelIcon = (level: number) => {
    switch (level) {
      case 1: return <Star className="w-4 h-4" />;
      case 2: return <Star className="w-4 h-4" />;
      case 3: return <Crown className="w-4 h-4" />;
      case 4: return <Shield className="w-4 h-4" />;
      case 5: return <Gem className="w-4 h-4" />;
      default: return <Star className="w-4 h-4" />;
    }
  };

  const getStatusBadge = (status: string) => {
    const configs: Record<string, { color: string; label: string }> = {
      pending: { color: "bg-yellow-500", label: "Pending" },
      paid: { color: "bg-blue-500", label: "Paid" },
      screenshot_submitted: { color: "bg-purple-500", label: "Review Required" },
      approved: { color: "bg-green-500", label: "Approved" },
      rejected: { color: "bg-red-500", label: "Rejected" }
    };
    return configs[status] || configs.pending;
  };

  const filteredHelpers = helpers.filter(h => {
    if (!searchQuery) return true;
    const search = searchQuery.toLowerCase();
    return (
      h.user?.display_name?.toLowerCase().includes(search) ||
      h.user?.app_uid?.toLowerCase().includes(search) ||
      h.country_code?.toLowerCase().includes(search) ||
      h.user_id?.toLowerCase().includes(search)
    );
  });

  // Filter withdrawal requests by search
  const filteredWithdrawals = withdrawalRequests.filter(w => {
    if (!searchQuery) return true;
    const search = searchQuery.toLowerCase();
    return (
      w.helper?.user?.display_name?.toLowerCase().includes(search) ||
      w.agency?.name?.toLowerCase().includes(search) ||
      w.agency?.agency_code?.toLowerCase().includes(search) ||
      w.host?.display_name?.toLowerCase().includes(search) ||
      w.helper?.country_code?.toLowerCase().includes(search)
    );
  });

  // Export withdrawals to CSV
  const exportToCSV = () => {
    const headers = [
      'Date',
      'Helper Name',
      'Country',
      'Agency/Host',
      'USD Amount',
      'Local Amount',
      'Currency',
      'Status',
      'Diamond Reward',
      'Payment Method'
    ];

    const rows = filteredWithdrawals.map(w => [
      format(new Date(w.created_at), 'yyyy-MM-dd HH:mm'),
      w.helper?.user?.display_name || 'Unknown',
      w.helper?.country_code || 'N/A',
      w.agency?.name || w.host?.display_name || 'N/A',
      w.usd_amount,
      w.local_amount || 0,
      w.currency_code || 'N/A',
      w.status,
      w.diamond_reward || 0,
      w.payment_method || 'N/A'
    ]);

    const csvContent = [
      headers.join(','),
      ...rows.map(row => row.map(cell => `"${cell}"`).join(','))
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', `level5_withdrawals_${format(new Date(), 'yyyy-MM-dd')}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    toast({ title: "Exported!", description: `${filteredWithdrawals.length} records exported to CSV` });
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-4 md:space-y-6 px-2 md:px-0">
      {/* Header with gradient */}
      <div className="bg-gradient-to-r from-amber-500 via-yellow-500 to-orange-600 rounded-xl md:rounded-2xl p-4 md:p-6 shadow-xl">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
          <div>
            <h1 className="text-xl md:text-2xl font-bold text-white flex items-center gap-2">
              <Gem className="w-5 h-5 md:w-6 md:h-6" />
              Level 5 Helper Management
            </h1>
            <p className="text-white/90 text-sm mt-1">Manage Diamond Helpers with Payroll Access</p>
          </div>
          <div className="flex items-center gap-2">
            <Button 
              variant="outline" 
              className="gap-2 bg-white/20 border-white/30 text-white hover:bg-white/30"
              onClick={() => navigate('/admin/payroll-orders')}
            >
              <FileText className="w-4 h-4" />
              <span className="hidden md:inline">View All Orders</span>
            </Button>
            <Button variant="outline" onClick={() => loadData()} className="bg-white/20 border-white/30 text-white hover:bg-white/30">
              <Loader2 className={cn("w-4 h-4", loading && "animate-spin")} />
              <span className="ml-2 hidden md:inline">Refresh</span>
            </Button>
          </div>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card className="bg-gradient-to-br from-cyan-500/20 to-cyan-600/10 border-cyan-500/30 shadow-lg">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-cyan-500/30 rounded-xl flex items-center justify-center">
                <Gem className="w-5 h-5 text-cyan-400" />
              </div>
              <div>
                <p className="text-2xl font-bold text-white">{stats.totalHelpers}</p>
                <p className="text-xs text-slate-400">Level 5 Helpers</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-br from-purple-500/20 to-purple-600/10 border-purple-500/30 shadow-lg">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-purple-500/30 rounded-xl flex items-center justify-center">
                <Clock className="w-5 h-5 text-purple-400" />
              </div>
              <div>
                <p className="text-2xl font-bold text-white">{stats.pendingWithdrawals}</p>
                <p className="text-xs text-slate-400">Pending Review</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-br from-green-500/20 to-green-600/10 border-green-500/30 shadow-lg">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-green-500/30 rounded-xl flex items-center justify-center">
                <CheckCircle className="w-5 h-5 text-green-400" />
              </div>
              <div>
                <p className="text-2xl font-bold text-white">{stats.completedToday}</p>
                <p className="text-xs text-slate-400">Completed Today</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-br from-amber-500/20 to-amber-600/10 border-amber-500/30 shadow-lg">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-amber-500/30 rounded-xl flex items-center justify-center">
                <Gem className="w-5 h-5 text-white" />
              </div>
              <div>
                <p className="text-2xl font-bold text-yellow-700 dark:text-yellow-300">{stats.totalDiamondsAwarded.toLocaleString()}</p>
                <p className="text-xs text-yellow-600 dark:text-yellow-400">Diamonds Awarded</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Withdrawal Trends Chart */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-base">
              <TrendingUp className="w-4 h-4 text-green-500" />
              Withdrawal Status Trends (Last 14 Days)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                  <XAxis 
                    dataKey="date" 
                    tick={{ fontSize: 10 }} 
                    tickLine={false}
                    axisLine={false}
                  />
                  <YAxis 
                    tick={{ fontSize: 10 }} 
                    tickLine={false}
                    axisLine={false}
                    allowDecimals={false}
                  />
                  <Tooltip 
                    contentStyle={{ 
                      backgroundColor: 'hsl(var(--background))', 
                      border: '1px solid hsl(var(--border))',
                      borderRadius: '8px',
                      fontSize: '12px'
                    }}
                  />
                  <Legend wrapperStyle={{ fontSize: '11px' }} />
                  <Bar dataKey="approved" name="Approved" fill="#22c55e" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="pending" name="Pending" fill="#f59e0b" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="rejected" name="Rejected" fill="#ef4444" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-base">
              <DollarSign className="w-4 h-4 text-cyan-500" />
              USD Volume (Approved Withdrawals)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={chartData} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
                  <defs>
                    <linearGradient id="usdGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#06b6d4" stopOpacity={0.4}/>
                      <stop offset="95%" stopColor="#06b6d4" stopOpacity={0}/>
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                  <XAxis 
                    dataKey="date" 
                    tick={{ fontSize: 10 }} 
                    tickLine={false}
                    axisLine={false}
                  />
                  <YAxis 
                    tick={{ fontSize: 10 }} 
                    tickLine={false}
                    axisLine={false}
                    tickFormatter={(value) => `$${value}`}
                  />
                  <Tooltip 
                    formatter={(value: number) => [`$${value.toFixed(2)}`, 'USD Volume']}
                    contentStyle={{ 
                      backgroundColor: 'hsl(var(--background))', 
                      border: '1px solid hsl(var(--border))',
                      borderRadius: '8px',
                      fontSize: '12px'
                    }}
                  />
                  <Area 
                    type="monotone" 
                    dataKey="usdTotal" 
                    stroke="#06b6d4" 
                    strokeWidth={2}
                    fill="url(#usdGradient)" 
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Main Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="w-full justify-start flex-wrap">
          <TabsTrigger value="payroll" className="gap-2">
            <Banknote className="w-4 h-4" />
            Payroll Applications
            {stats.pendingPayroll > 0 && (
              <Badge className="ml-1 bg-orange-500 text-white">{stats.pendingPayroll}</Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="helpers" className="gap-2">
            <Users className="w-4 h-4" />
            Active Helpers
          </TabsTrigger>
          <TabsTrigger value="withdrawals" className="gap-2">
            <DollarSign className="w-4 h-4" />
            Withdrawals
            {stats.pendingWithdrawals > 0 && (
              <Badge className="ml-1 bg-red-500 text-white">{stats.pendingWithdrawals}</Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="settings" className="gap-2">
            <Settings className="w-4 h-4" />
            Settings
          </TabsTrigger>
        </TabsList>

        {/* Payroll Applications Tab */}
        <TabsContent value="payroll" className="mt-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2">
                <Crown className="w-5 h-5 text-orange-500" />
                Level 5 Payroll Applications (By Country)
              </CardTitle>
              <div className="flex items-center gap-4 mt-3">
                <Select value={countryFilter} onValueChange={setCountryFilter}>
                  <SelectTrigger className="w-48">
                    <Globe className="w-4 h-4 mr-2" />
                    <SelectValue placeholder="Filter by country" />
                  </SelectTrigger>
                  <SelectContent className="bg-background border shadow-lg z-50">
                    <SelectItem value="all">🌍 All Countries</SelectItem>
                    {countries.map((country) => (
                      <SelectItem key={country} value={country}>
                        🏳️ {country}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input
                    placeholder="Search by name or ID..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="pl-10"
                  />
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {filteredPayrollApplications.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    No payroll applications found
                  </div>
                ) : (
                  filteredPayrollApplications.map((app) => (
                    <div 
                      key={app.id}
                      className={cn(
                        "flex items-center gap-4 p-4 rounded-xl transition-colors",
                        app.payroll_status === 'pending' 
                          ? "bg-orange-50 dark:bg-orange-950/30 border border-orange-200 dark:border-orange-800" 
                          : app.payroll_status === 'approved'
                          ? "bg-green-50 dark:bg-green-950/30 border border-green-200 dark:border-green-800"
                          : "bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800"
                      )}
                    >
                      <Avatar className="w-12 h-12 border-2 border-orange-500">
                        <AvatarImage src={app.user?.avatar_url} />
                        <AvatarFallback>
                          <Crown className="w-5 h-5" />
                        </AvatarFallback>
                      </Avatar>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="font-semibold truncate text-slate-900 dark:text-white">{app.user?.display_name || 'Unknown'}</p>
                          <Badge variant="outline" className="gap-1 text-xs">
                            {(app as any).user?.country_flag ? (
                              <span>{(app as any).user.country_flag}</span>
                            ) : (
                              <Globe className="w-3 h-3" />
                            )}
                            {(app as any).user?.country_name || app.country_code || 'N/A'}
                          </Badge>
                          <Badge 
                            className={cn(
                              "text-white text-xs",
                              app.payroll_status === 'pending' ? "bg-orange-500" :
                              app.payroll_status === 'approved' ? "bg-green-500" : "bg-red-500"
                            )}
                          >
                            {app.payroll_status === 'pending' ? 'Pending' :
                             app.payroll_status === 'approved' ? 'Approved' : 'Rejected'}
                          </Badge>
                        </div>
                        <p className="text-sm text-muted-foreground">ID: {app.user?.app_uid}</p>
                        <p className="text-xs text-muted-foreground">
                          Applied: {app.payroll_applied_at ? format(new Date(app.payroll_applied_at), 'dd MMM yyyy, HH:mm') : 'N/A'}
                        </p>
                      </div>
                      {app.payroll_status === 'pending' ? (
                        <div className="flex items-center gap-2">
                          <Button
                            size="sm"
                            variant="outline"
                            className="border-red-500 text-red-500 hover:bg-red-50"
                            onClick={() => handleRejectPayroll(app)}
                            disabled={processing}
                          >
                            <XCircle className="w-4 h-4 mr-1" />
                            Reject
                          </Button>
                          <Button
                            size="sm"
                            className="bg-green-500 hover:bg-green-600 text-white"
                            onClick={() => handleApprovePayroll(app)}
                            disabled={processing}
                          >
                            <CheckCircle className="w-4 h-4 mr-1" />
                            Approve
                          </Button>
                        </div>
                      ) : (
                        <div className="flex items-center gap-3">
                          <div className="text-right">
                            <p className="text-xs text-muted-foreground mb-1">Payroll Access</p>
                            <Switch
                              checked={app.payroll_status === 'approved'}
                              onCheckedChange={async (checked) => {
                                setProcessing(true);
                                try {
                                  await supabase
                                    .from('topup_helpers')
                                    .update({ 
                                      payroll_enabled: checked,
                                      payroll_status: checked ? 'approved' : 'rejected'
                                    })
                                    .eq('user_id', app.user_id);
                                  
                                  toast({ 
                                    title: checked ? "Payroll Enabled" : "Payroll Disabled", 
                                    description: `Payroll access ${checked ? 'enabled' : 'disabled'} for ${app.user?.display_name}` 
                                  });
                                  loadData();
                                } catch (error: any) {
                                  toast({ title: "Error", description: error.message, variant: "destructive" });
                                } finally {
                                  setProcessing(false);
                                }
                              }}
                              disabled={processing}
                            />
                          </div>
                        </div>
                      )}
                    </div>
                  ))
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Helpers Tab */}
        <TabsContent value="helpers" className="mt-4">
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center gap-4">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input
                    placeholder="Search helpers..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="pl-10"
                  />
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {filteredHelpers.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    No Level 5 helpers found
                  </div>
                ) : (
                  filteredHelpers.map((helper) => (
                    <div 
                      key={helper.id}
                      className="flex items-center gap-4 p-4 bg-muted/50 rounded-xl hover:bg-muted/70 transition-colors"
                    >
                      <Avatar className="w-12 h-12 border-2 border-cyan-500">
                        <AvatarImage src={helper.user?.avatar_url} />
                        <AvatarFallback>
                          <Gem className="w-5 h-5" />
                        </AvatarFallback>
                      </Avatar>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="font-semibold truncate text-slate-900 dark:text-white">{helper.user?.display_name || 'Unknown'}</p>
                          <Badge className="bg-cyan-500 text-white">Level 5</Badge>
                          {(helper.user?.country_flag || helper.country_code) && (
                            <Badge variant="outline" className="gap-1">
                              {helper.user?.country_flag ? (
                                <span>{helper.user.country_flag}</span>
                              ) : (
                                <Globe className="w-3 h-3" />
                              )}
                              {helper.user?.country_name || helper.country_code}
                            </Badge>
                          )}
                        </div>
                        <p className="text-sm text-muted-foreground">ID: {helper.user?.app_uid}</p>
                        <p className="text-xs text-muted-foreground">
                          Balance: {helper.wallet_balance?.toLocaleString() || 0} 💎
                        </p>
                      </div>
                      <div className="flex items-center gap-3">
                        <div className="text-right">
                          <p className="text-xs text-muted-foreground">Payroll</p>
                          <Switch
                            checked={helper.payroll_enabled}
                            onCheckedChange={(checked) => toggleHelperPayroll(helper, checked)}
                          />
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Withdrawals Tab */}
        <TabsContent value="withdrawals" className="mt-4">
          <Card>
            <CardHeader className="pb-3">
              <div className="flex flex-col gap-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="flex items-center gap-2">
                    <DollarSign className="w-5 h-5 text-green-500" />
                    Withdrawal Requests
                  </CardTitle>
                  <Button 
                    variant="outline" 
                    size="sm" 
                    className="gap-2"
                    onClick={exportToCSV}
                    disabled={filteredWithdrawals.length === 0}
                  >
                    <Download className="w-4 h-4" />
                    Export CSV ({filteredWithdrawals.length})
                  </Button>
                </div>
                <div className="flex items-center gap-4">
                  <Select value={statusFilter} onValueChange={setStatusFilter}>
                    <SelectTrigger className="w-48">
                      <SelectValue placeholder="Filter by status" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Status</SelectItem>
                      <SelectItem value="pending">Pending</SelectItem>
                      <SelectItem value="paid">Paid</SelectItem>
                      <SelectItem value="screenshot_submitted">Review Required</SelectItem>
                      <SelectItem value="approved">Approved</SelectItem>
                      <SelectItem value="rejected">Rejected</SelectItem>
                    </SelectContent>
                  </Select>
                  <div className="relative flex-1">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <Input
                      placeholder="Search by helper, agency, App UID..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="pl-10"
                    />
                  </div>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {filteredWithdrawals.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    No withdrawal requests found
                  </div>
                ) : (
                  filteredWithdrawals.map((request) => {
                    const statusConfig = getStatusBadge(request.status);
                    
                    return (
                      <div 
                        key={request.id}
                        className={cn(
                          "flex items-center gap-4 p-4 rounded-xl cursor-pointer hover:bg-muted/70 transition-colors",
                          request.status === 'screenshot_submitted' 
                            ? "bg-purple-50 dark:bg-purple-950/30 border border-purple-200 dark:border-purple-800" 
                            : "bg-muted/50"
                        )}
                        onClick={() => { setSelectedWithdrawal(request); setShowWithdrawalDialog(true); setDiamondReward(String(request.diamond_reward || 0)); }}
                      >
                        <Avatar className="w-12 h-12">
                          <AvatarImage src={request.helper?.user?.avatar_url} />
                          <AvatarFallback>
                            <User className="w-5 h-5" />
                          </AvatarFallback>
                        </Avatar>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <p className="font-semibold truncate text-slate-900 dark:text-white">{request.helper?.user?.display_name || 'Unknown Helper'}</p>
                            <Badge className={cn("text-white text-xs", statusConfig.color)}>
                              {statusConfig.label}
                            </Badge>
                          </div>
                          <p className="text-sm text-muted-foreground">
                            {request.agency?.name || request.host?.display_name || 'Unknown'} • {request.currency_code}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {format(new Date(request.created_at), 'dd MMM yyyy, HH:mm')}
                          </p>
                        </div>
                        <div className="text-right">
                          <p className="font-bold text-green-600">${request.usd_amount}</p>
                          <p className="text-xs text-muted-foreground">
                            {request.currency_code} {request.local_amount?.toLocaleString()}
                          </p>
                        </div>
                        {request.payment_screenshot_url && (
                          <Image className="w-5 h-5 text-purple-500" />
                        )}
                      </div>
                    );
                  })
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Settings Tab */}
        <TabsContent value="settings" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle>Helper Level Configuration</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {levelConfigs.map((config) => (
                  <div 
                    key={config.id}
                    className={cn(
                      "flex items-center gap-4 p-4 rounded-xl border",
                      config.level_number === 5 
                        ? "bg-gradient-to-r from-cyan-50 to-blue-50 dark:from-cyan-950/30 dark:to-blue-950/30 border-cyan-200 dark:border-cyan-800" 
                        : "bg-muted/50 border-transparent"
                    )}
                  >
                    <div className={cn(
                      "w-12 h-12 rounded-xl flex items-center justify-center",
                      config.level_number === 5 ? "bg-cyan-500" : "bg-slate-500"
                    )}>
                      {getLevelIcon(config.level_number)}
                      <span className="text-white text-xs ml-1">{config.level_number}</span>
                    </div>
                    <div className="flex-1">
                      <p className="font-semibold text-slate-900 dark:text-white">{config.level_name}</p>
                      <p className="text-xs text-muted-foreground">Commission: {config.commission_rate}%</p>
                    </div>
                    <div className="flex items-center gap-6">
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-muted-foreground">Enabled</span>
                        <Switch
                          checked={config.is_enabled}
                          onCheckedChange={() => toggleLevelConfig(config, 'is_enabled')}
                        />
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-muted-foreground">Payroll</span>
                        <Switch
                          checked={config.has_payroll_access}
                          onCheckedChange={() => toggleLevelConfig(config, 'has_payroll_access')}
                          disabled={config.level_number !== 5}
                        />
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-muted-foreground">Withdrawals</span>
                        <Switch
                          checked={config.has_withdrawal_processing}
                          onCheckedChange={() => toggleLevelConfig(config, 'has_withdrawal_processing')}
                          disabled={config.level_number !== 5}
                        />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Withdrawal Review Dialog */}
      <Dialog open={showWithdrawalDialog} onOpenChange={setShowWithdrawalDialog}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Review Withdrawal</DialogTitle>
          </DialogHeader>
          
          {selectedWithdrawal && (
            <div className="space-y-4">
              {/* Amount Info */}
              <div className="bg-gradient-to-br from-green-50 to-emerald-50 dark:from-green-950/30 dark:to-emerald-950/30 rounded-xl p-4 border border-green-200 dark:border-green-800">
                <div className="text-center">
                  <p className="text-3xl font-bold text-green-600">${selectedWithdrawal.usd_amount}</p>
                  <p className="text-sm text-muted-foreground mt-1">
                    ≈ {selectedWithdrawal.currency_code} {selectedWithdrawal.local_amount?.toLocaleString()}
                  </p>
                </div>
              </div>

              {/* Helper Info */}
              <div className="flex items-center gap-3 p-3 bg-muted/50 rounded-xl">
                <Avatar className="w-10 h-10">
                  <AvatarImage src={selectedWithdrawal.helper?.user?.avatar_url} />
                  <AvatarFallback><User className="w-4 h-4" /></AvatarFallback>
                </Avatar>
                <div>
                  <p className="font-semibold">{selectedWithdrawal.helper?.user?.display_name}</p>
                  <p className="text-xs text-muted-foreground">Country: {selectedWithdrawal.helper?.country_code}</p>
                </div>
              </div>

              {/* Agency/Host */}
              {(selectedWithdrawal.agency || selectedWithdrawal.host) && (
                <div className="flex items-center gap-3 p-3 bg-muted/50 rounded-xl">
                  <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                    {selectedWithdrawal.agency ? <Building2 className="w-4 h-4" /> : <User className="w-4 h-4" />}
                  </div>
                  <div>
                    <p className="font-semibold">
                      {selectedWithdrawal.agency?.name || selectedWithdrawal.host?.display_name}
                    </p>
                    {selectedWithdrawal.agency?.agency_code && (
                      <p className="text-xs text-muted-foreground">Code: {selectedWithdrawal.agency.agency_code}</p>
                    )}
                  </div>
                </div>
              )}

              {/* Screenshot */}
              {selectedWithdrawal.payment_screenshot_url && (
                <div>
                  <p className="text-sm font-semibold mb-2">Payment Screenshot</p>
                  <div className="rounded-xl overflow-hidden border">
                    <img 
                      src={selectedWithdrawal.payment_screenshot_url} 
                      alt="Payment proof" 
                      className="w-full object-cover max-h-64"
                    />
                  </div>
                </div>
              )}

              {/* Helper Notes */}
              {selectedWithdrawal.helper_notes && (
                <div className="p-3 bg-blue-50 dark:bg-blue-950/30 rounded-xl">
                  <p className="text-xs font-semibold text-blue-600 dark:text-blue-400">Helper Notes:</p>
                  <p className="text-sm mt-1">{selectedWithdrawal.helper_notes}</p>
                </div>
              )}

              {/* Actions for screenshot_submitted status */}
              {selectedWithdrawal.status === 'screenshot_submitted' && (
                <>
                  <div>
                    <p className="text-sm font-semibold mb-2">Diamond Reward</p>
                    <Input
                      type="number"
                      value={diamondReward}
                      onChange={(e) => setDiamondReward(e.target.value)}
                      placeholder="Enter diamond amount"
                    />
                    <p className="text-xs text-muted-foreground mt-1">Diamonds to credit to helper's wallet</p>
                  </div>

                  <div>
                    <p className="text-sm font-semibold mb-2">Admin Notes</p>
                    <Textarea
                      value={adminNotes}
                      onChange={(e) => setAdminNotes(e.target.value)}
                      placeholder="Add any notes..."
                      rows={2}
                    />
                  </div>

                  <div className="flex gap-3">
                    <Button
                      onClick={handleRejectWithdrawal}
                      disabled={processing}
                      variant="destructive"
                      className="flex-1"
                    >
                      {processing && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                      <XCircle className="w-4 h-4 mr-2" />
                      Reject
                    </Button>
                    <Button
                      onClick={handleApproveWithdrawal}
                      disabled={processing}
                      className="flex-1 bg-green-600 hover:bg-green-700"
                    >
                      {processing && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                      <CheckCircle className="w-4 h-4 mr-2" />
                      Approve
                    </Button>
                  </div>
                </>
              )}

              {/* Status Info for other statuses */}
              {selectedWithdrawal.status !== 'screenshot_submitted' && (
                <div className={cn(
                  "text-center p-4 rounded-xl",
                  selectedWithdrawal.status === 'approved' ? "bg-green-50 dark:bg-green-950/30" :
                  selectedWithdrawal.status === 'rejected' ? "bg-red-50 dark:bg-red-950/30" :
                  "bg-muted/50"
                )}>
                  <Badge className={cn("text-white", getStatusBadge(selectedWithdrawal.status).color)}>
                    {getStatusBadge(selectedWithdrawal.status).label}
                  </Badge>
                  {selectedWithdrawal.status === 'approved' && selectedWithdrawal.diamond_reward > 0 && (
                    <p className="text-sm text-green-600 mt-2">
                      +{selectedWithdrawal.diamond_reward.toLocaleString()} diamonds credited
                    </p>
                  )}
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default AdminLevel5Helpers;
