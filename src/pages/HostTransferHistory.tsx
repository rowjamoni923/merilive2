import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, Gift, Phone, TrendingUp, Calendar, Clock, Building2, Loader2, Coins, DollarSign } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { recordClientError } from "@/utils/clientErrorLog";

interface WeeklyEarning {
  id: string;
  period_start: string;
  period_end: string;
  gift_earnings: number;
  call_earnings: number;
  total_earnings: number;
  status: string;
  agency_name: string | null;
}

interface EarningsStats {
  totalEarnings: number;
  thisWeekEarnings: number;
  thisMonthEarnings: number;
  totalWeeks: number;
  giftTotal: number;
  callTotal: number;
}

const HostTransferHistory = () => {
  const navigate = useNavigate();
  const [weeklyEarnings, setWeeklyEarnings] = useState<WeeklyEarning[]>([]);
  const [stats, setStats] = useState<EarningsStats>({
    totalEarnings: 0,
    thisWeekEarnings: 0,
    thisMonthEarnings: 0,
    totalWeeks: 0,
    giftTotal: 0,
    callTotal: 0
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchEarnings();
    
    // Real-time subscription
    const channel = supabase
      .channel('host-earnings')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'agency_earnings_transfers'
        },
        () => {
          fetchEarnings();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const fetchEarnings = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        navigate('/auth');
        return;
      }

      // Fetch weekly earning reports from agency_earnings_transfers
      const { data, error } = await supabase
        .from('agency_earnings_transfers')
        .select(`
          id,
          amount,
          gift_earnings,
          call_earnings,
          period_start,
          period_end,
          status,
          agency_name,
          created_at
        `)
        .eq('host_id', user.id)
        .order('created_at', { ascending: false });

      if (error) throw error;

      // Map to weekly earnings format
      const earnings: WeeklyEarning[] = (data || []).map(item => ({
        id: item.id,
        period_start: item.period_start || item.created_at,
        period_end: item.period_end || item.created_at,
        gift_earnings: item.gift_earnings || 0,
        call_earnings: item.call_earnings || 0,
        total_earnings: item.amount || 0,
        status: item.status,
        agency_name: item.agency_name
      }));

      setWeeklyEarnings(earnings);

      // Calculate stats
      const now = new Date();
      const weekStart = new Date(now);
      weekStart.setDate(weekStart.getDate() - weekStart.getDay());
      weekStart.setHours(0, 0, 0, 0);
      
      const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

      const totalEarnings = earnings.reduce((sum, e) => sum + e.total_earnings, 0);
      const giftTotal = earnings.reduce((sum, e) => sum + e.gift_earnings, 0);
      const callTotal = earnings.reduce((sum, e) => sum + e.call_earnings, 0);
      const thisWeekEarnings = earnings
        .filter(e => new Date(e.period_end) >= weekStart)
        .reduce((sum, e) => sum + e.total_earnings, 0);
      const thisMonthEarnings = earnings
        .filter(e => new Date(e.period_end) >= monthStart)
        .reduce((sum, e) => sum + e.total_earnings, 0);

      setStats({
        totalEarnings,
        thisWeekEarnings,
        thisMonthEarnings,
        totalWeeks: earnings.length,
        giftTotal,
        callTotal
      });
    } catch (error) {
      console.error('Error fetching earnings:', error);
      recordClientError({ label: "HostTransferHistory.thisMonthEarnings", message: error instanceof Error ? error.message : String(error) });
    } finally {
      setLoading(false);
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });
  };

  const formatNumber = (num: number) => {
    return num.toLocaleString('en-US');
  };

  const getWeekRange = (start: string, end: string) => {
    const startDate = new Date(start);
    const endDate = new Date(end);
    return `${startDate.toLocaleDateString('en-US', { day: 'numeric', month: 'short' })} - ${endDate.toLocaleDateString('en-US', { day: 'numeric', month: 'short' })}`;
  };

  if (loading) {
    return (
      <div className="fixed inset-0 bg-background flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="fixed inset-0 flex flex-col bg-background overflow-y-auto overflow-x-hidden">
      {/* Header */}
      <div className="flex-shrink-0 sticky top-0 z-50 bg-gradient-to-r from-purple-600 to-indigo-600 text-white safe-area-top">
        <div className="flex items-center gap-3 p-4">
          <button
            type="button"
            onClick={() => navigate(-1)}
            className="p-3 -ml-2 rounded-xl hover:bg-white/10 active:bg-white/20 transition-colors touch-manipulation"
          >
            <ArrowLeft className="w-6 h-6" />
          </button>
          <div>
            <h1 className="text-lg font-bold">Weekly Earnings Report</h1>
            <p className="text-xs text-slate-700">Your weekly income details</p>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto overscroll-contain" style={{ WebkitOverflowScrolling: 'touch', paddingBottom: 'var(--content-bottom-padding)' }}>

      <div className="p-4 space-y-4">
        {/* Main Stats */}
        <div className="grid grid-cols-2 gap-3">
          <Card className="bg-gradient-to-br from-emerald-500 to-green-600 border-0 p-4 text-white col-span-2">
            <div className="flex items-center justify-between">
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <TrendingUp className="w-5 h-5" />
                  <span className="text-sm opacity-90">Total Earnings</span>
                </div>
                <p className="text-3xl font-bold">{formatNumber(stats.totalEarnings)}</p>
                <p className="text-xs opacity-80">Beans</p>
              </div>
              <div className="text-right">
                <p className="text-xs opacity-80">{stats.totalWeeks} Weeks</p>
              </div>
            </div>
          </Card>

          <Card className="bg-gradient-to-br from-pink-500 to-rose-500 border-0 p-3 text-white">
            <div className="flex items-center gap-2 mb-1">
              <Gift className="w-4 h-4" />
              <span className="text-xs opacity-90">Gift Earnings</span>
            </div>
            <p className="text-xl font-bold">{formatNumber(stats.giftTotal)}</p>
            <p className="text-[10px] opacity-80">Beans</p>
          </Card>

          <Card className="bg-gradient-to-br from-blue-500 to-cyan-500 border-0 p-3 text-white">
            <div className="flex items-center gap-2 mb-1">
              <Phone className="w-4 h-4" />
              <span className="text-xs opacity-90">Call Earnings</span>
            </div>
            <p className="text-xl font-bold">{formatNumber(stats.callTotal)}</p>
            <p className="text-[10px] opacity-80">Beans</p>
          </Card>

          <Card className="bg-gradient-to-br from-amber-500 to-orange-500 border-0 p-3 text-white">
            <div className="flex items-center gap-2 mb-1">
              <Calendar className="w-4 h-4" />
              <span className="text-xs opacity-90">This Week</span>
            </div>
            <p className="text-xl font-bold">{formatNumber(stats.thisWeekEarnings)}</p>
            <p className="text-[10px] opacity-80">Beans</p>
          </Card>

          <Card className="bg-gradient-to-br from-purple-500 to-violet-500 border-0 p-3 text-white">
            <div className="flex items-center gap-2 mb-1">
              <Clock className="w-4 h-4" />
              <span className="text-xs opacity-90">This Month</span>
            </div>
            <p className="text-xl font-bold">{formatNumber(stats.thisMonthEarnings)}</p>
            <p className="text-[10px] opacity-80">Beans</p>
          </Card>
        </div>

        {/* Weekly Reports List */}
        <div>
          <h2 className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-2">
            <Coins className="w-4 h-4 text-amber-500" />
            Weekly Earnings Report
          </h2>
          
          {weeklyEarnings.length === 0 ? (
            <Card className="p-8 text-center bg-white">
              <Calendar className="w-12 h-12 mx-auto mb-3 text-slate-500" />
              <p className="text-gray-500 font-medium">No Earnings Report</p>
              <p className="text-xs text-gray-400 mt-1">
                Your weekly earnings report will appear here
              </p>
            </Card>
          ) : (
            <div className="space-y-3">
              {weeklyEarnings.map((earning) => (
                <Card key={earning.id} className="p-4 bg-white border border-gray-100 shadow-sm hover:shadow-md transition-shadow">
                  {/* Week Header */}
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-purple-500 to-indigo-600 flex items-center justify-center">
                        <Calendar className="w-5 h-5 text-slate-800" />
                      </div>
                      <div>
                        <p className="font-semibold text-sm text-gray-800">
                          {getWeekRange(earning.period_start, earning.period_end)}
                        </p>
                        <p className="text-xs text-gray-500">
                          {earning.agency_name || 'Agency'}
                        </p>
                      </div>
                    </div>
                    <Badge className={`${earning.status === 'completed' ? 'bg-emerald-500' : 'bg-amber-500'} text-slate-800 border-0`}>
                      {earning.status === 'completed' ? 'Completed' : 'Processing'}
                    </Badge>
                  </div>

                  {/* Earnings Breakdown */}
                  <div className="grid grid-cols-3 gap-2 bg-gray-50 rounded-xl p-3">
                    <div className="text-center">
                      <div className="flex items-center justify-center gap-1 mb-1">
                        <Gift className="w-3 h-3 text-pink-500" />
                        <span className="text-[10px] text-gray-500">Gift</span>
                      </div>
                      <p className="font-bold text-pink-600 text-sm">
                        {formatNumber(earning.gift_earnings)}
                      </p>
                    </div>
                    <div className="text-center border-x border-gray-200">
                      <div className="flex items-center justify-center gap-1 mb-1">
                        <Phone className="w-3 h-3 text-blue-500" />
                        <span className="text-[10px] text-gray-500">Call</span>
                      </div>
                      <p className="font-bold text-blue-600 text-sm">
                        {formatNumber(earning.call_earnings)}
                      </p>
                    </div>
                    <div className="text-center">
                      <div className="flex items-center justify-center gap-1 mb-1">
                        <Coins className="w-3 h-3 text-amber-500" />
                        <span className="text-[10px] text-gray-500">Total</span>
                      </div>
                      <p className="font-bold text-amber-600 text-sm">
                        {formatNumber(earning.total_earnings)}
                      </p>
                    </div>
                  </div>
                </Card>
              ))}
            </div>
          )}
        </div>
      </div>
      </div>
    </div>
  );
};

export default HostTransferHistory;
