import { useState, useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, Calendar, User, Loader2, Clock, TrendingUp, Gem, Percent, Filter, ChevronDown, ShieldAlert, ChevronRight } from "lucide-react";
import { PageSkeleton } from "@/components/common/PageSkeleton";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { enhanceThumbnail } from "@/utils/enhanceThumbnail";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { recordClientError } from "@/utils/clientErrorLog";
import { usePersistedCache } from "@/hooks/usePersistedCache";

interface ViolationDetail {
  id: string;
  pattern: string;
  source: string;
  beans: number;
  at: string;
}

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
  contact_violation_count?: number | null;
  contact_violation_beans_deducted?: number | null;
  contact_violations_detail?: ViolationDetail[] | null;
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

// Friendly labels for the masked-content "pattern" stored on each violation row.
const PATTERN_LABELS: Record<string, string> = {
  phone_number: 'Phone number share',
  digit_sharing: 'Digit sequence share',
  external_link: 'External link share',
  contact_intent: 'Contact-sharing intent',
  whatsapp: 'WhatsApp share',
  imo: 'IMO share',
  facebook: 'Facebook share',
  messenger: 'Messenger share',
  instagram: 'Instagram share',
  tiktok: 'TikTok share',
  telegram: 'Telegram share',
  snapchat: 'Snapchat share',
  twitter: 'Twitter / X share',
  viber: 'Viber share',
  signal: 'Signal share',
  wechat: 'WeChat share',
  line: 'Line share',
  email: 'Email share',
};
const SOURCE_LABELS: Record<string, string> = {
  chat: 'Party room chat',
  live_stream: 'Live stream chat',
  private_call: 'Private call',
  private_message: 'Direct message',
};

const DeductionsBlock = ({
  count,
  beans,
  details,
}: {
  count: number;
  beans: number;
  details: ViolationDetail[];
}) => {
  const [open, setOpen] = useState(false);
  return (
    <div className="border-t border-warning-500/30 pt-3">
      <button
        type="button"
        className="w-full flex items-center justify-between gap-2 text-left"
        onClick={() => setOpen((v) => !v)}
      >
        <div className="flex items-center gap-2">
          <ShieldAlert className="w-4 h-4 text-warning-600" />
          <div>
            <p className="text-xs font-semibold text-warning-700">
              Number-sharing deductions this week
            </p>
            <p className="text-[11px] text-muted-foreground">
              {count} violation{count === 1 ? '' : 's'} · −{beans.toLocaleString()} Beans
            </p>
          </div>
        </div>
        <ChevronRight
          className={`w-4 h-4 text-muted-foreground transition-transform ${open ? 'rotate-90' : ''}`}
        />
      </button>
      {open && details.length > 0 && (
        <ul className="mt-2 space-y-1.5">
          {details.map((d) => (
            <li
              key={d.id}
              className="flex items-center justify-between gap-2 px-2 py-1.5 rounded-md bg-warning-500/10 border border-warning-500/20"
            >
              <div className="min-w-0">
                <p className="text-[11px] font-medium text-warning-700 truncate">
                  {PATTERN_LABELS[d.pattern] || 'Contact share'}
                </p>
                <p className="text-[10px] text-muted-foreground">
                  {SOURCE_LABELS[d.source] || d.source} ·{' '}
                  {new Date(d.at).toLocaleString('en-US', {
                    day: 'numeric',
                    month: 'short',
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </p>
              </div>
              <span className="text-[11px] font-semibold text-warning-700 shrink-0">
                −{Number(d.beans || 0).toLocaleString()}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};



const AgencyTransferHistory = () => {
  const navigate = useNavigate();
  const [transfersCache, setTransfers, hadTransfersCache] = usePersistedCache<Transfer[]>('agencyTransferHist:transfers', null);
  const [commissionsCache, setCommissions, hadCommCache] = usePersistedCache<CommissionRecord[]>('agencyTransferHist:commissions', null);
  const transfers = transfersCache ?? [];
  const commissions = commissionsCache ?? [];
  const [loading, setLoading] = useState(!(hadTransfersCache && hadCommCache));
  const [diamondsToUsdRate, setDiamondsToUsdRate] = useState(10000);
  const [activeTab, setActiveTab] = useState<'earnings' | 'commission'>('earnings');
  const [dateFilter, setDateFilter] = useState<DateFilter>('this_week');
  const [showFilterMenu, setShowFilterMenu] = useState(false);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      if (!transfersCache && !commissionsCache) setLoading(true);
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { navigate('/auth'); return; }

      const { data: settingsData } = await supabase
        .from('app_settings')
        .select('setting_value')
        .eq('setting_key', 'agency_commission')
        .maybeSingle();
      
      if (settingsData?.setting_value) {
        const cs = settingsData.setting_value as unknown as { diamonds_to_dollar_rate?: number };
        if (cs?.diamonds_to_dollar_rate) setDiamondsToUsdRate(cs.diamonds_to_dollar_rate);
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

  const beansToUsd = (beans: number) => (beans / diamondsToUsdRate).toFixed(2);

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
    return <PageSkeleton className="bg-background" rows={6} hero={false} />;
  }

  return (
    <div className="fixed inset-0 flex flex-col bg-background">
      {/* Header */}
      <header className="flex-shrink-0 sticky top-0 z-40 bg-gradient-to-r from-brand-600 to-info-600 text-white safe-area-top">
        <div className="px-4 py-3 flex items-center gap-3">
          <Button variant="ghost" size="icon" className="text-white hover:bg-white/20" onClick={() => navigate(-1)}>
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <div className="flex-1">
            <h1 className="text-lg font-bold">Host Earning History</h1>
            <p className="text-xs text-white/80">Weekly host earnings & agency commission</p>
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
            <Card className="bg-gradient-to-br from-success-500/20 to-success-500/20 border-success-500/30 col-span-2">
              <CardContent className="p-4">
                <div className="flex items-center gap-2 text-success-600 mb-2">
                  <TrendingUp className="w-5 h-5" />
                  <span className="text-sm">Total Host Earnings</span>
                </div>
                <p className="text-2xl font-bold text-success-600">
                  {totalEarnings.toLocaleString()} Beans
                </p>
                <p className="text-xs text-success-500">${beansToUsd(totalEarnings)} • {hostCount} Hosts</p>
              </CardContent>
            </Card>

            <Card className="bg-gradient-to-br from-success-500/20 to-success-500/20 border-success-500/30">
              <CardContent className="p-4">
                <div className="flex items-center gap-2 text-success-600 mb-2">
                  <Percent className="w-5 h-5" />
                  <span className="text-sm">Commission</span>
                </div>
                <p className="text-2xl font-bold text-success-600">
                  {totalCommission.toLocaleString()}
                </p>
                <p className="text-xs text-success-500">${beansToUsd(totalCommission)}</p>
              </CardContent>
            </Card>

            <Card className="bg-gradient-to-br from-info-500/20 to-info-500/20 border-info-500/30">
              <CardContent className="p-4">
                <div className="flex items-center gap-2 text-info-600 mb-2">
                  <Gem className="w-5 h-5" />
                  <span className="text-sm">Transfers</span>
                </div>
                <p className="text-2xl font-bold text-info-600">
                  {filteredTransfers.length}
                </p>
                <p className="text-xs text-info-500">Records</p>
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
                  const vCount = Number(transfer.contact_violation_count) || 0;
                  const vBeans = Number(transfer.contact_violation_beans_deducted) || 0;
                  const vDetails: ViolationDetail[] = Array.isArray(transfer.contact_violations_detail)
                    ? transfer.contact_violations_detail
                    : [];
                  return (
                    <div key={transfer.id} className="p-4 bg-gradient-to-r from-brand-500/10 to-info-500/10 border border-brand-500/20 rounded-xl space-y-3">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <Avatar className="w-10 h-10 ring-2 ring-brand-500/30">
                            <AvatarImage src={enhanceThumbnail(transfer.host_profile?.avatar_url || "", { width: 96, quality: 82 })} />
                            <AvatarFallback className="bg-brand-500/20">
                              <User className="w-5 h-5 text-brand-600" />
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
                          <p className="font-bold text-lg text-success-600">+{hostEarnings.toLocaleString()}</p>
                          <p className="text-xs text-muted-foreground">${beansToUsd(hostEarnings)}</p>
                          <Badge className="bg-success-500/20 text-success-600 border-success-500/30 text-[10px]">
                            Beans Added
                          </Badge>
                        </div>
                      </div>

                      {/* Deductions section — visible only to the agency, never to the host */}
                      {vCount > 0 && (
                        <DeductionsBlock count={vCount} beans={vBeans} details={vDetails} />
                      )}
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
                    <div key={idx} className="p-4 bg-gradient-to-r from-success-500/10 to-success-500/10 border border-success-500/20 rounded-xl">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <Avatar className="w-9 h-9 ring-2 ring-success-500/30">
                            <AvatarImage src={enhanceThumbnail(wc.host_profile?.avatar_url || "", { width: 96, quality: 82 })} />
                            <AvatarFallback className="bg-success-500/20">
                              <User className="w-4 h-4 text-success-600" />
                            </AvatarFallback>
                          </Avatar>
                          <div>
                            <p className="font-semibold text-sm">
                              {wc.host_profile?.display_name || 'Host'}
                            </p>
                            <Badge className="bg-success-500/20 text-success-600 border-success-500/30 text-[10px]">
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
                          <p className="font-bold text-lg text-success-600">+{wc.total_commission.toLocaleString()}</p>
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
