import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { 
  ArrowLeft, 
  TrendingUp,
  Calendar,
  User,
  Loader2,
  Clock,
  Gift,
  Phone,
  Gamepad2,
  Gem,
  Percent
} from "lucide-react";
import { PageSkeleton } from "@/components/common/PageSkeleton";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import AvatarWithFrame from "@/components/common/AvatarWithFrame";
import { enhanceThumbnail } from "@/utils/enhanceThumbnail";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { recordClientError } from "@/utils/clientErrorLog";
import { usePersistedCache } from "@/hooks/usePersistedCache";

interface CommissionRecord {
  id: string;
  host_id: string;
  transaction_type: string;
  original_amount: number;
  commission_rate: number;
  commission_amount: number;
  created_at: string;
  notes: string | null;
  host_profile?: {
    display_name: string | null;
    avatar_url: string | null;
  };
}

interface CommissionStats {
  totalCommission: number;
  todayCommission: number;
  thisWeekCommission: number;
  thisMonthCommission: number;
  totalTransactions: number;
}

const AgencyCommissionHistory = () => {
  const navigate = useNavigate();
  const [commissionsCache, setCommissions, hadCommCache] = usePersistedCache<CommissionRecord[]>('agencyCommHist:commissions', null);
  const [statsCache, setStats, hadStatsCache] = usePersistedCache<CommissionStats>('agencyCommHist:stats', null);
  const commissions = commissionsCache ?? [];
  const stats = statsCache ?? {
    totalCommission: 0,
    todayCommission: 0,
    thisWeekCommission: 0,
    thisMonthCommission: 0,
    totalTransactions: 0
  };
  const [loading, setLoading] = useState(!(hadCommCache && hadStatsCache));
  const [coinsToUsdRate, setDiamondsToUsdRate] = useState(9000); // Default: 9000 beans = $1 (matching AgencyDashboard)

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      if (!commissionsCache) setLoading(true);
      const { getCachedUser } = await import('@/utils/cachedAuth');
      const user = await getCachedUser();
      if (!user) {
        navigate('/auth');
        return;
      }

      // Fetch diamonds to USD rate (same source as AgencyDashboard for consistency)
      const { data: settingsData } = await supabase
        .from('app_settings')
        .select('setting_value')
        .eq('setting_key', 'beans_to_usd_rate')
        .maybeSingle();
      
      if (settingsData?.setting_value) {
        const rateSettings = settingsData.setting_value as unknown as { rate?: number };
        if (rateSettings?.rate) {
          setDiamondsToUsdRate(rateSettings.rate);
        }
      }

      // Fetch agency
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

      // Fetch commission history
      const { data: commissionData, error: commissionError } = await supabase
        .from('agency_commission_history')
        .select('*')
        .eq('agency_id', agencyData.id)
        .order('created_at', { ascending: false })
        .limit(200);

      if (commissionError) throw commissionError;

      // Fetch host profiles
      if (commissionData && commissionData.length > 0) {
        const hostIds = [...new Set(commissionData.map(c => c.host_id))];
        const { data: profilesData } = await supabase
          .from('profiles')
          .select('id, display_name, avatar_url')
          .in('id', hostIds);

        const commissionsWithProfiles = commissionData.map(commission => ({
          ...commission,
          host_profile: profilesData?.find(p => p.id === commission.host_id) || undefined
        }));

        setCommissions(commissionsWithProfiles);

        // Calculate stats
        const now = new Date();
        const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        const startOfWeek = new Date(now);
        startOfWeek.setDate(now.getDate() - now.getDay());
        startOfWeek.setHours(0, 0, 0, 0);
        const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

        let totalCommission = 0;
        let todayCommission = 0;
        let thisWeekCommission = 0;
        let thisMonthCommission = 0;

        commissionsWithProfiles.forEach(commission => {
          const amount = Number(commission.commission_amount) || 0;
          const commissionDate = new Date(commission.created_at);
          
          totalCommission += amount;
          if (commissionDate >= startOfDay) todayCommission += amount;
          if (commissionDate >= startOfWeek) thisWeekCommission += amount;
          if (commissionDate >= startOfMonth) thisMonthCommission += amount;
        });

        setStats({
          totalCommission,
          todayCommission,
          thisWeekCommission,
          thisMonthCommission,
          totalTransactions: commissionsWithProfiles.length
        });
      }

    } catch (error) {
      console.error('Error fetching data:', error);
      recordClientError({ label: "AgencyCommissionHistory.commissionDate", message: error instanceof Error ? error.message : String(error) });
      toast.error('Failed to load data');
    } finally {
      setLoading(false);
    }
  };

  const beansToUsd = (beans: number) => {
    return (beans / coinsToUsdRate).toFixed(2);
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('bn-BD', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const getTransactionIcon = (type: string) => {
    switch (type) {
      case 'gift':
        return <Gift className="w-4 h-4 text-brand-500" />;
      case 'call':
        return <Phone className="w-4 h-4 text-info-500" />;
      case 'game':
        return <Gamepad2 className="w-4 h-4 text-brand-500" />;
      default:
        return <Gem className="w-4 h-4 text-warning-500" />;
    }
  };

  const getTransactionBadge = (type: string) => {
    switch (type) {
      case 'gift':
        return <Badge className="bg-brand-500/20 text-brand-600 border-brand-500/30 text-[10px]">Gift</Badge>;
      case 'call':
        return <Badge className="bg-info-500/20 text-info-600 border-info-500/30 text-[10px]">Call</Badge>;
      case 'game':
        return <Badge className="bg-brand-500/20 text-brand-600 border-brand-500/30 text-[10px]">Game</Badge>;
      default:
        return <Badge variant="outline" className="text-[10px]">{type}</Badge>;
    }
  };

  if (loading) {
    return <PageSkeleton className="bg-background" rows={6} hero={false} />;
  }

  return (
    <div className="fixed inset-0 flex flex-col bg-background">
      {/* Header */}
      <header className="flex-shrink-0 sticky top-0 z-40 bg-gradient-to-r from-success-600 to-success-600 text-white safe-area-top">
        <div className="px-4 py-3 flex items-center gap-3">
          <Button variant="ghost" size="icon" className="text-white hover:bg-white/20" onClick={() => navigate(-1)}>
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <div className="flex-1">
            <h1 className="text-lg font-bold flex items-center gap-2">
              <Percent className="w-5 h-5" />
              Agency Commission History
            </h1>
            <p className="text-xs text-white/80">Level-based commission bonus from company</p>
          </div>
        </div>
      </header>

      {/* Scrollable Content */}
      <div className="flex-1 overflow-y-auto overscroll-contain" style={{ WebkitOverflowScrolling: 'touch', paddingBottom: 'var(--content-bottom-padding)' }}>
        <main className="px-4 py-4 space-y-4">
        {/* Stats Cards */}
        <div className="grid grid-cols-2 gap-3">
          <Card className="bg-gradient-to-br from-success-500/20 to-success-500/20 border-success-500/30">
            <CardContent className="p-4">
              <div className="flex items-center gap-2 text-success-600 mb-2">
                <TrendingUp className="w-5 h-5" />
                <span className="text-sm">Total Commission</span>
              </div>
              <p className="text-2xl font-bold text-success-600">
                {stats.totalCommission.toLocaleString()}
              </p>
              <p className="text-xs text-success-500">${beansToUsd(stats.totalCommission)}</p>
            </CardContent>
          </Card>

          <Card className="bg-gradient-to-br from-warning-500/20 to-warning-500/20 border-warning-500/30">
            <CardContent className="p-4">
              <div className="flex items-center gap-2 text-warning-600 mb-2">
                <Clock className="w-5 h-5" />
                <span className="text-sm">Today</span>
              </div>
              <p className="text-2xl font-bold text-warning-600">
                {stats.todayCommission.toLocaleString()}
              </p>
              <p className="text-xs text-warning-500">${beansToUsd(stats.todayCommission)}</p>
            </CardContent>
          </Card>

          <Card className="bg-gradient-to-br from-info-500/20 to-info-500/20 border-info-500/30">
            <CardContent className="p-4">
              <div className="flex items-center gap-2 text-info-600 mb-2">
                <Calendar className="w-5 h-5" />
                <span className="text-sm">This Week</span>
              </div>
              <p className="text-2xl font-bold text-info-600">
                {stats.thisWeekCommission.toLocaleString()}
              </p>
              <p className="text-xs text-info-500">${beansToUsd(stats.thisWeekCommission)}</p>
            </CardContent>
          </Card>

          <Card className="bg-gradient-to-br from-brand-500/20 to-brand-500/20 border-brand-500/30">
            <CardContent className="p-4">
              <div className="flex items-center gap-2 text-brand-600 mb-2">
                <Gem className="w-5 h-5" />
                <span className="text-sm">This Month</span>
              </div>
              <p className="text-2xl font-bold text-brand-600">
                {stats.thisMonthCommission.toLocaleString()}
              </p>
              <p className="text-xs text-brand-500">${beansToUsd(stats.thisMonthCommission)}</p>
            </CardContent>
          </Card>
        </div>

        {/* Info Banner */}
        <Card className="bg-gradient-to-r from-success-500/10 to-success-500/10 border-success-500/30">
          <CardContent className="p-4">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-full bg-success-500/20 flex items-center justify-center">
                <Percent className="w-5 h-5 text-success-600" />
              </div>
              <div className="flex-1">
 <h3 className="font-semibold text-success-700 text-sm">Company Commission Bonus</h3>
                <p className="text-xs text-muted-foreground mt-1">
                  Based on your hosts' weekly earnings, the company provides level-based commission bonuses. This commission is not deducted from host earnings.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Commission List */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <TrendingUp className="w-5 h-5 text-success-600" />
              Commission Transactions ({stats.totalTransactions})
            </CardTitle>
          </CardHeader>
          <CardContent>
            {commissions.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <Gem className="w-12 h-12 mx-auto mb-3 opacity-30" />
                <p>No Commissions Yet</p>
                <p className="text-xs mt-1">Commissions from host gifts and calls will appear here</p>
              </div>
            ) : (
              <div className="space-y-3">
                {commissions.map((commission) => (
                  <div 
                    key={commission.id}
                    className="flex items-center justify-between p-3 bg-muted/50 rounded-lg"
                  >
                    <div className="flex items-center gap-3">
                      <div className="relative">
                <AvatarWithFrame
                  src={enhanceThumbnail(commission.host_profile?.avatar_url || "", { width: 96, quality: 82})}
                  name={(commission.host_profile as any)?.display_name || (commission.host_profile as any)?.agency_name || (commission.host_profile as any)?.name || "U"}
                  level={1}
                  size="sm"
                  showFrame={true}
                  showAnimation={false}
                />
                        <div className="absolute -bottom-1 -right-1 w-5 h-5 rounded-full bg-background flex items-center justify-center border">
                          {getTransactionIcon(commission.transaction_type)}
                        </div>
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <p className="font-medium text-sm">
                            {commission.host_profile?.display_name || 'Unknown Host'}
                          </p>
                          {getTransactionBadge(commission.transaction_type)}
                        </div>
                        <p className="text-xs text-muted-foreground">
                          {formatDate(commission.created_at)}
                        </p>
                        <p className="text-[10px] text-muted-foreground">
                          Original Earning: {Number(commission.original_amount).toLocaleString()} • {commission.commission_rate}% Commission
                        </p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="font-bold text-success-600">
                        +{Number(commission.commission_amount).toLocaleString()}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        ${beansToUsd(Number(commission.commission_amount))}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </main>
      </div>
    </div>
  );
};

export default AgencyCommissionHistory;