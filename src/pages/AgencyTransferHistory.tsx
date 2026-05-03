import { useState, useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { 
  ArrowLeft, 
  Calendar,
  User,
  Loader2,
  Clock,
  TrendingUp,
  Coins,
  Percent,
  Filter,
  ChevronDown
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { recordClientError } from "@/utils/clientErrorLog";

interface Transfer {
  id: string;
  host_id: string;
  amount: number;
  transfer_type: string;
  status: string;
  period_start: string | null;
  period_end: string | null;
  processed_at: string | null;
  created_at: string;
  commission_rate: number | null;
  gift_earnings: number | null;
  call_earnings: number | null;
  host_name: string | null;
  notes: string | null;
  host_profile?: {
    display_name: string | null;
    avatar_url: string | null;
  };
}

interface CommissionRecord {
  id: string;
  original_amount: number;
  commission_rate: number;
  commission_amount: number;
  created_at: string;
  notes: string | null;
  transaction_type: string;
  host_id: string;
  host_profile?: {
    display_name: string | null;
    avatar_url: string | null;
  };
}

type DateFilter = 'this_week' | 'last_week' | 'this_month' | 'last_month' | 'all';

const AgencyTransferHistory = () => {
  const navigate = useNavigate();
  const [transfers, setTransfers] = useState<Transfer[]>([]);
  const [commissions, setCommissions] = useState<CommissionRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [coinsToUsdRate, setCoinsToUsdRate] = useState(10000);
  const [activeTab, setActiveTab] = useState<'earnings' | 'commission'>('earnings');
  const [dateFilter, setDateFilter] = useState<DateFilter>('this_week');
  const [showFilterMenu, setShowFilterMenu] = useState(false);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { navigate('/auth'); return; }

      const { data: settingsData } = await supabase
        .from('app_settings')
        .select('setting_value')
        .eq('setting_key', 'agency_commission')
        .maybeSingle();
      
      if (settingsData?.setting_value) {
        const cs = settingsData.setting_value as unknown as { coins_to_dollar_rate?: number };
        if (cs?.coins_to_dollar_rate) setCoinsToUsdRate(cs.coins_to_dollar_rate);
      }

      const { data: agencyData } = await supabase
        .from('agencies')
        .select('id')
        .eq('owner_id', user.id)
        .maybeSingle();

      if (!agencyData) {
        toast.error('You do not have an agency');
        navigate('/agency-dashboard');
        return;
      }

      const [transferRes, commissionRes] = await Promise.all([
        supabase
          .from('agency_earnings_transfers')
          .select('*')
          .eq('agency_id', agencyData.id)
          .order('created_at', { ascending: false })
          .limit(200),
        supabase
          .from('agency_commission_history')
          .select('id, original_amount, commission_rate, commission_amount, created_at, notes, transaction_type, host_id')
          .eq('agency_id', agencyData.id)
          .order('created_at', { ascending: false })
          .limit(200)
      ]);

      if (transferRes.error) throw transferRes.error;

      const transferData = transferRes.data || [];
      if (transferData.length > 0) {
        const hostIds = [...new Set(transferData.map(t => t.host_id))];
        const { data: profilesData } = await supabase
          .from('profiles')
          .select('id, display_name, avatar_url')
          .in('id', hostIds);

        setTransfers(transferData.map(t => ({
          ...t,
          host_profile: profilesData?.find(p => p.id === t.host_id) || undefined
        })));
      }

      // Process commissions with host profiles
      const commissionData = commissionRes.data || [];
      if (commissionData.length > 0) {
        const commHostIds = [...new Set(commissionData.map(c => c.host_id))];
        const { data: commProfiles } = await supabase
          .from('profiles')
          .select('id, display_name, avatar_url')
          .in('id', commHostIds);

        setCommissions(commissionData.map(c => ({
          ...c,
          host_profile: commProfiles?.find(p => p.id === c.host_id) || undefined
        })));
      }
    } catch (error) {
      console.error('Error fetching data:', error);
      recordClientError({ label: "AgencyTransferHistory.commHostIds", message: error instanceof Error ? error.message : String(error) });
      toast.error('Failed to load data');
    } finally {
      setLoading(false);
    }
  };

  const beansToUsd = (beans: number) => (beans / coinsToUsdRate).toFixed(2);

  const formatDate = (dateString: string) =>
    new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'
    });

  // Date filter logic
  const getDateRange = (filter: DateFilter): { start: Date; end: Date } | null => {
    if (filter === 'all') return null;
    const now = new Date();
    const start = new Date(now);
    const end = new Date(now);

    switch (filter) {
      case 'this_week':
        start.setDate(now.getDate() - now.getDay());
        start.setHours(0, 0, 0, 0);
        break;
      case 'last_week':
        start.setDate(now.getDate() - now.getDay() - 7);
        start.setHours(0, 0, 0, 0);
        end.setDate(now.getDate() - now.getDay());
        end.setHours(0, 0, 0, 0);
        break;
      case 'this_month':
        start.setDate(1);
        start.setHours(0, 0, 0, 0);
        break;
      case 'last_month':
        start.setMonth(now.getMonth() - 1, 1);
        start.setHours(0, 0, 0, 0);
        end.setDate(0); // last day of prev month
        end.setHours(23, 59, 59, 999);
        break;
    }
    return { start, end };
  };

  const filterByDate = <T extends { created_at: string }>(items: T[]): T[] => {
    const range = getDateRange(dateFilter);
    if (!range) return items;
    return items.filter(item => {
      const d = new Date(item.created_at);
      return d >= range.start && d <= range.end;
    });
  };

  const filteredTransfers = useMemo(() => filterByDate(transfers), [transfers, dateFilter]);
  const filteredCommissions = useMemo(() => filterByDate(commissions), [commissions, dateFilter]);

  // Aggregate commissions weekly per host
  const weeklyCommissions = useMemo(() => {
    const groups: Record<string, {
      host_id: string;
      host_profile?: { display_name: string | null; avatar_url: string | null };
      total_commission: number;
      total_original: number;
      commission_rate: number;
      week_start: string;
      week_end: string;
      count: number;
    }> = {};

    filteredCommissions.forEach(c => {
      const d = new Date(c.created_at);
      const day = d.getDay();
      const weekStart = new Date(d);
      weekStart.setDate(d.getDate() - day);
      weekStart.setHours(0, 0, 0, 0);
      const weekEnd = new Date(weekStart);
      weekEnd.setDate(weekStart.getDate() + 6);

      const key = `${c.host_id}_${weekStart.toISOString()}`;
      if (!groups[key]) {
        groups[key] = {
          host_id: c.host_id,
          host_profile: c.host_profile,
          total_commission: 0,
          total_original: 0,
          commission_rate: Number(c.commission_rate) || 0,
          week_start: weekStart.toISOString(),
          week_end: weekEnd.toISOString(),
          count: 0,
        };
      }
      groups[key].total_commission += Number(c.commission_amount) || 0;
      groups[key].total_original += Number(c.original_amount) || 0;
      groups[key].count += 1;
    });

    return Object.values(groups).sort((a, b) => new Date(b.week_start).getTime() - new Date(a.week_start).getTime());
  }, [filteredCommissions]);

  // Stats based on filtered data
  const totalEarnings = filteredTransfers.reduce((s, t) => s + (Number(t.amount) || 0), 0);
  const totalCommission = weeklyCommissions.reduce((s, c) => s + c.total_commission, 0);
  const hostCount = new Set(filteredTransfers.map(t => t.host_id)).size;

  const filterLabels: Record<DateFilter, string> = {
    all: 'All Time',
    this_week: 'This Week',
    last_week: 'Last Week',
    this_month: 'This Month',
    last_month: 'Last Month',
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="fixed inset-0 flex flex-col bg-background">
      {/* Header */}
      <header className="flex-shrink-0 sticky top-0 z-40 bg-gradient-to-r from-purple-600 to-indigo-600 text-white safe-area-top">
        <div className="px-4 py-3 flex items-center gap-3">
          <Button variant="ghost" size="icon" className="text-white hover:bg-white/20" onClick={() => navigate(-1)}>
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <div className="flex-1">
            <h1 className="text-lg font-bold">Host Earning History</h1>
            <p className="text-xs text-white/70">Weekly host earnings & agency commission</p>
          </div>
        </div>
      </header>

      <div className="flex-1 overflow-y-auto overscroll-contain" style={{ WebkitOverflowScrolling: 'touch', paddingBottom: 'var(--content-bottom-padding)' }}>
        <main className="px-4 py-4 space-y-4">

          {/* Date Filter */}
          <div className="relative">
            <Button
              variant="outline"
              size="sm"
              className="w-full justify-between"
              onClick={() => setShowFilterMenu(!showFilterMenu)}
            >
              <span className="flex items-center gap-2">
                <Filter className="w-4 h-4" />
                {filterLabels[dateFilter]}
              </span>
              <ChevronDown className="w-4 h-4" />
            </Button>
            {showFilterMenu && (
              <div className="absolute top-full left-0 right-0 mt-1 bg-card border border-border rounded-lg shadow-lg z-50 overflow-hidden">
                {(Object.keys(filterLabels) as DateFilter[]).map(key => (
                  <button
                    key={key}
                    className={`w-full px-4 py-2.5 text-left text-sm hover:bg-muted transition-colors ${dateFilter === key ? 'bg-primary/10 text-primary font-semibold' : ''}`}
                    onClick={() => { setDateFilter(key); setShowFilterMenu(false); }}
                  >
                    {filterLabels[key]}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Summary Cards */}
          <div className="grid grid-cols-2 gap-3">
            <Card className="bg-gradient-to-br from-green-500/20 to-emerald-500/20 border-green-500/30 col-span-2">
              <CardContent className="p-4">
                <div className="flex items-center gap-2 text-green-600 mb-2">
                  <TrendingUp className="w-5 h-5" />
                  <span className="text-sm">Total Host Earnings</span>
                </div>
                <p className="text-2xl font-bold text-green-600">
                  {totalEarnings.toLocaleString()} Beans
                </p>
                <p className="text-xs text-green-500">${beansToUsd(totalEarnings)} • {hostCount} Hosts</p>
              </CardContent>
            </Card>

            <Card className="bg-gradient-to-br from-emerald-500/20 to-teal-500/20 border-emerald-500/30">
              <CardContent className="p-4">
                <div className="flex items-center gap-2 text-emerald-600 mb-2">
                  <Percent className="w-5 h-5" />
                  <span className="text-sm">Commission</span>
                </div>
                <p className="text-2xl font-bold text-emerald-600">
                  {totalCommission.toLocaleString()}
                </p>
                <p className="text-xs text-emerald-500">${beansToUsd(totalCommission)}</p>
              </CardContent>
            </Card>

            <Card className="bg-gradient-to-br from-blue-500/20 to-cyan-500/20 border-blue-500/30">
              <CardContent className="p-4">
                <div className="flex items-center gap-2 text-blue-600 mb-2">
                  <Coins className="w-5 h-5" />
                  <span className="text-sm">Transfers</span>
                </div>
                <p className="text-2xl font-bold text-blue-600">
                  {filteredTransfers.length}
                </p>
                <p className="text-xs text-blue-500">Records</p>
              </CardContent>
            </Card>
          </div>

          {/* Tabs: Earnings / Commission */}
          <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as any)}>
            <TabsList className="w-full">
              <TabsTrigger value="earnings" className="flex-1">Host Earnings</TabsTrigger>
              <TabsTrigger value="commission" className="flex-1">Agency Commission</TabsTrigger>
            </TabsList>

            {/* Host Earnings Tab */}
            <TabsContent value="earnings" className="mt-3 space-y-3">
              {filteredTransfers.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <Clock className="w-12 h-12 mx-auto mb-3 opacity-30" />
                  <p>No earning records for this period</p>
                </div>
              ) : (
                filteredTransfers.map((transfer) => {
                  const hostEarnings = Number(transfer.amount) || 0;
                  return (
                    <div key={transfer.id} className="p-4 bg-gradient-to-r from-purple-500/10 to-indigo-500/10 border border-purple-500/20 rounded-xl">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <Avatar className="w-10 h-10 ring-2 ring-purple-500/30">
                            <AvatarImage src={transfer.host_profile?.avatar_url || ""} />
                            <AvatarFallback className="bg-purple-500/20">
                              <User className="w-5 h-5 text-purple-600" />
                            </AvatarFallback>
                          </Avatar>
                          <div>
                            <p className="font-semibold text-sm">
                              {transfer.host_name || transfer.host_profile?.display_name || 'Unknown Host'}
                            </p>
                            <p className="text-xs text-muted-foreground flex items-center gap-1">
                              <Clock className="w-3 h-3" />
                              {formatDate(transfer.created_at)}
                            </p>
                            {transfer.period_start && transfer.period_end && (
                              <p className="text-[10px] text-muted-foreground">
                                {new Date(transfer.period_start).toLocaleDateString('en-US', { day: 'numeric', month: 'short' })} - {new Date(transfer.period_end).toLocaleDateString('en-US', { day: 'numeric', month: 'short' })}
                              </p>
                            )}
                          </div>
                        </div>
                        <div className="text-right">
                          <p className="font-bold text-lg text-green-600">+{hostEarnings.toLocaleString()}</p>
                          <p className="text-xs text-muted-foreground">${beansToUsd(hostEarnings)}</p>
                          <Badge className="bg-green-500/20 text-green-600 border-green-500/30 text-[10px]">
                            Beans Added
                          </Badge>
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </TabsContent>

            {/* Agency Commission Tab */}
            <TabsContent value="commission" className="mt-3 space-y-3">
              {weeklyCommissions.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <Percent className="w-10 h-10 mx-auto mb-2 opacity-30" />
                  <p className="text-sm">No commission records for this period</p>
                  <p className="text-xs mt-1">Commission is calculated weekly when host earnings are transferred</p>
                </div>
              ) : (
                weeklyCommissions.map((wc, idx) => {
                  const weekStartLabel = new Date(wc.week_start).toLocaleDateString('en-US', { day: 'numeric', month: 'short' });
                  const weekEndLabel = new Date(wc.week_end).toLocaleDateString('en-US', { day: 'numeric', month: 'short', year: 'numeric' });

                  return (
                    <div key={idx} className="p-4 bg-gradient-to-r from-emerald-500/10 to-green-500/10 border border-emerald-500/20 rounded-xl">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <Avatar className="w-9 h-9 ring-2 ring-emerald-500/30">
                            <AvatarImage src={wc.host_profile?.avatar_url || ""} />
                            <AvatarFallback className="bg-emerald-500/20">
                              <User className="w-4 h-4 text-emerald-600" />
                            </AvatarFallback>
                          </Avatar>
                          <div>
                            <p className="font-semibold text-sm">
                              {wc.host_profile?.display_name || 'Host'}
                            </p>
                            <Badge className="bg-emerald-500/20 text-emerald-600 border-emerald-500/30 text-[10px]">
                              {wc.commission_rate}% Commission
                            </Badge>
                            <p className="text-[10px] text-muted-foreground mt-0.5">
                              {weekStartLabel} - {weekEndLabel}
                            </p>
                            <p className="text-[10px] text-muted-foreground">
                              Host earnings: {wc.total_original.toLocaleString()} Beans
                            </p>
                          </div>
                        </div>
                        <div className="text-right">
                          <p className="font-bold text-lg text-emerald-600">+{wc.total_commission.toLocaleString()}</p>
                          <p className="text-xs text-muted-foreground">${beansToUsd(wc.total_commission)}</p>
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </TabsContent>
          </Tabs>
        </main>
      </div>
    </div>
  );
};

export default AgencyTransferHistory;
