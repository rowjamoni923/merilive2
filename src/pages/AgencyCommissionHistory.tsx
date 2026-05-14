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
  Coins,
  Percent
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { recordClientError } from "@/utils/clientErrorLog";

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
  const [commissions, setCommissions] = useState<CommissionRecord[]>([]);
  const [stats, setStats] = useState<CommissionStats>({
    totalCommission: 0,
    todayCommission: 0,
    thisWeekCommission: 0,
    thisMonthCommission: 0,
    totalTransactions: 0
  });
  const [loading, setLoading] = useState(true);
  const [coinsToUsdRate, setCoinsToUsdRate] = useState(9000); // Default: 9000 beans = $1 (matching AgencyDashboard)

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      const { getCachedUser } = await import('@/utils/cachedAuth');
      const user = await getCachedUser();
      if (!user) {
        navigate('/auth');
        return;
      }

      // Fetch coins to USD rate (same source as AgencyDashboard for consistency)
      const { data: settingsData } = await supabase
        .from('app_settings')
        .select('setting_value')
        .eq('setting_key', 'beans_to_usd_rate')
        .maybeSingle();
      
      if (settingsData?.setting_value) {
        const rateSettings = settingsData.setting_value as unknown as { rate?: number };
        if (rateSettings?.rate) {
          setCoinsToUsdRate(rateSettings.rate);
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
        return <Gift className="w-4 h-4 text-pink-500" />;
      case 'call':
        return <Phone className="w-4 h-4 text-blue-500" />;
      case 'game':
        return <Gamepad2 className="w-4 h-4 text-purple-500" />;
      default:
        return <Coins className="w-4 h-4 text-amber-500" />;
    }
  };

  const getTransactionBadge = (type: string) => {
    switch (type) {
      case 'gift':
        return <Badge className="bg-pink-500/20 text-pink-600 border-pink-500/30 text-[10px]">Gift</Badge>;
      case 'call':
        return <Badge className="bg-blue-500/20 text-blue-600 border-blue-500/30 text-[10px]">Call</Badge>;
      case 'game':
        return <Badge className="bg-purple-500/20 text-purple-600 border-purple-500/30 text-[10px]">Game</Badge>;
      default:
        return <Badge variant="outline" className="text-[10px]">{type}</Badge>;
    }
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
      <header className="flex-shrink-0 sticky top-0 z-40 bg-gradient-to-r from-emerald-600 to-teal-600 text-slate-800 safe-area-top">
        <div className="px-4 py-3 flex items-center gap-3">
          <Button variant="ghost" size="icon" className="text-slate-800 hover:bg-white/20" onClick={() => navigate(-1)}>
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <div className="flex-1">
            <h1 className="text-lg font-bold flex items-center gap-2">
              <Percent className="w-5 h-5" />
              Agency Commission History
            </h1>
            <p className="text-xs text-slate-600">Level-based commission bonus from company</p>
          </div>
        </div>
      </header>

      {/* Scrollable Content */}
      <div className="flex-1 overflow-y-auto overscroll-contain" style={{ WebkitOverflowScrolling: 'touch', paddingBottom: 'var(--content-bottom-padding)' }}>
        <main className="px-4 py-4 space-y-4">
        {/* Stats Cards */}
        <div className="grid grid-cols-2 gap-3">
          <Card className="bg-gradient-to-br from-emerald-500/20 to-green-500/20 border-emerald-500/30">
            <CardContent className="p-4">
              <div className="flex items-center gap-2 text-emerald-600 mb-2">
                <TrendingUp className="w-5 h-5" />
                <span className="text-sm">Total Commission</span>
              </div>
              <p className="text-2xl font-bold text-emerald-600">
                {stats.totalCommission.toLocaleString()}
              </p>
              <p className="text-xs text-emerald-500">${beansToUsd(stats.totalCommission)}</p>
            </CardContent>
          </Card>

          <Card className="bg-gradient-to-br from-amber-500/20 to-orange-500/20 border-amber-500/30">
            <CardContent className="p-4">
              <div className="flex items-center gap-2 text-amber-600 mb-2">
                <Clock className="w-5 h-5" />
                <span className="text-sm">Today</span>
              </div>
              <p className="text-2xl font-bold text-amber-600">
                {stats.todayCommission.toLocaleString()}
              </p>
              <p className="text-xs text-amber-500">${beansToUsd(stats.todayCommission)}</p>
            </CardContent>
          </Card>

          <Card className="bg-gradient-to-br from-blue-500/20 to-cyan-500/20 border-blue-500/30">
            <CardContent className="p-4">
              <div className="flex items-center gap-2 text-blue-600 mb-2">
                <Calendar className="w-5 h-5" />
                <span className="text-sm">This Week</span>
              </div>
              <p className="text-2xl font-bold text-blue-600">
                {stats.thisWeekCommission.toLocaleString()}
              </p>
              <p className="text-xs text-blue-500">${beansToUsd(stats.thisWeekCommission)}</p>
            </CardContent>
          </Card>

          <Card className="bg-gradient-to-br from-purple-500/20 to-pink-500/20 border-purple-500/30">
            <CardContent className="p-4">
              <div className="flex items-center gap-2 text-purple-600 mb-2">
                <Coins className="w-5 h-5" />
                <span className="text-sm">This Month</span>
              </div>
              <p className="text-2xl font-bold text-purple-600">
                {stats.thisMonthCommission.toLocaleString()}
              </p>
              <p className="text-xs text-purple-500">${beansToUsd(stats.thisMonthCommission)}</p>
            </CardContent>
          </Card>
        </div>

        {/* Info Banner */}
        <Card className="bg-gradient-to-r from-emerald-500/10 to-teal-500/10 border-emerald-500/30">
          <CardContent className="p-4">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-full bg-emerald-500/20 flex items-center justify-center">
                <Percent className="w-5 h-5 text-emerald-600" />
              </div>
              <div className="flex-1">
                <h3 className="font-semibold text-emerald-700 dark:text-emerald-400 text-sm">Company Commission Bonus</h3>
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
              <TrendingUp className="w-5 h-5 text-emerald-600" />
              Commission Transactions ({stats.totalTransactions})
            </CardTitle>
          </CardHeader>
          <CardContent>
            {commissions.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <Coins className="w-12 h-12 mx-auto mb-3 opacity-30" />
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
                        <Avatar className="w-10 h-10">
                          <AvatarImage src={commission.host_profile?.avatar_url || ""} />
                          <AvatarFallback>
                            <User className="w-5 h-5" />
                          </AvatarFallback>
                        </Avatar>
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
                      <p className="font-bold text-emerald-600">
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