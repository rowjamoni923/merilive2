import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { 
  ArrowLeft, 
  Wallet, 
  TrendingUp, 
  Phone, 
  Gift, 
  Clock, 
  Calendar,
  ChevronRight,
  Coins,
  ArrowUpRight,
  Download,
  Diamond,
  Settings,
  Save
} from "lucide-react";
import { PageSkeleton } from "@/components/common/PageSkeleton";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import AvatarWithFrame from "@/components/common/AvatarWithFrame";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Slider } from "@/components/ui/slider";
import { supabase } from "@/integrations/supabase/client";
import { usePersistedCache } from "@/hooks/usePersistedCache";
import { getAppSetting, invalidateAppSetting } from "@/utils/appSettingsCache";
import { toast } from "sonner";
import { BottomNavigation } from "@/components/layout/BottomNavigation";
import { formatNumber as fmtNum } from "@/utils/formatNumber";
import { parseCallRateSettings, resolveEffectiveCallRate } from "@/utils/callRateSettings";
import { recordClientError } from "@/utils/clientErrorLog";
import { HostMatchToggleCard } from "@/components/host/HostMatchToggleCard";

interface EarningStats {
  totalEarnings: number;
  thisWeekEarnings: number;
  thisMonthEarnings: number;
  todayEarnings: number;
  callEarnings: number;
  giftEarnings: number;
  totalCalls: number;
  totalCallMinutes: number;
  withdrawableBalance: number;
  pendingEarnings: number;
  nextTransferDate: string | null;
}

interface Transaction {
  id: string;
  type: 'call' | 'gift' | 'withdrawal';
  amount: number;
  date: string;
  status?: string;
  otherUserName?: string;
  otherUserAvatar?: string;
}

const HostDashboard = () => {
  const navigate = useNavigate();
  const [profile, setProfile] = useState<any>(null);
  const [stats, setStats] = useState<EarningStats>({
    totalEarnings: 0,
    thisWeekEarnings: 0,
    thisMonthEarnings: 0,
    todayEarnings: 0,
    callEarnings: 0,
    giftEarnings: 0,
    totalCalls: 0,
    totalCallMinutes: 0,
    withdrawableBalance: 0,
    pendingEarnings: 0,
    nextTransferDate: null,
  });
  const [txCache, setTxCache, hadTxCache] = usePersistedCache<Transaction[]>("hostDashboard:transactions", []);
  const transactions = txCache ?? [];
  const setTransactions = (next: Transaction[] | ((prev: Transaction[]) => Transaction[])) =>
    setTxCache((prev) => (typeof next === 'function' ? (next as any)(prev ?? []) : next));
  const [loading, setLoading] = useState(!hadTxCache);
  const [activeTab, setActiveTab] = useState("/profile");
  const [commissionPercent, setCommissionPercent] = useState(50);
  
  // Call rate settings
  const [callRate, setCallRate] = useState(2000);
  const [minRate, setMinRate] = useState(1000);
  const [maxRate, setMaxRate] = useState(10000);
  const [savingRate, setSavingRate] = useState(false);

  useEffect(() => {
    fetchDashboardData();
    
    // Pkg83-ext: removed static `host-dashboard-realtime` channel
    // (private_calls/gift_transactions/profiles/app_settings not in publication
    // — was silent no-op). Pkg37 admin_broadcast pushes call_rates edits.
    const onAdmin = async (e: Event) => {
      const detail = (e as CustomEvent<{ table?: string }>).detail;
      if (detail?.table !== 'app_settings') return;
      invalidateAppSetting('call_rates');
      const settingValue = await getAppSetting<unknown>('call_rates');
      const nextSettings = parseCallRateSettings(settingValue);
      if (nextSettings) {
        setCommissionPercent(nextSettings.host_commission_percent ?? 50);
        setMinRate(nextSettings.min_rate ?? 1000);
        setMaxRate(nextSettings.max_rate ?? 10000);
        setCallRate(resolveEffectiveCallRate({
          settings: nextSettings,
          hostLevel: profile?.host_level,
          customRate: profile?.call_rate_per_minute,
        }) || 0);
      }
    };
    window.addEventListener('admin-table-update', onAdmin as EventListener);

    return () => {
      window.removeEventListener('admin-table-update', onAdmin as EventListener);
    };

  }, [profile?.call_rate_per_minute]);

  const fetchDashboardData = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        navigate('/auth');
        return;
      }

      const { data: profileData } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', user.id)
        .single();

      setProfile(profileData);
      
      const settingsValue = await getAppSetting<unknown>('call_rates');

      if (settingsValue) {
        const callRates = parseCallRateSettings(settingsValue);
        setCommissionPercent(callRates?.host_commission_percent ?? 50);
        setMinRate(callRates?.min_rate ?? 1000);
        setMaxRate(callRates?.max_rate ?? 10000);
        setCallRate(resolveEffectiveCallRate({
          settings: callRates,
          hostLevel: profileData?.host_level,
          customRate: profileData?.call_rate_per_minute,
        }) || 0);
      } else if (profileData?.call_rate_per_minute) {
        setCallRate(profileData.call_rate_per_minute);
      }

      const now = new Date();
      const startOfWeek = new Date(now);
      startOfWeek.setDate(now.getDate() - now.getDay());
      startOfWeek.setHours(0, 0, 0, 0);

      const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
      const startOfDay = new Date(now);
      startOfDay.setHours(0, 0, 0, 0);

      const { data: callsData } = await supabase
        .from('private_calls')
        .select('id, created_at, ended_at, duration_seconds, host_earned, host_earnings_amount')
        .eq('host_id', user.id)
        .in('status', ['ended', 'completed'])
        .order('created_at', { ascending: false });

      const { data: giftsData } = await supabase
        .from('gift_transactions')
        .select('id, created_at, receiver_beans, sender:profiles!gift_transactions_sender_id_fkey(display_name, avatar_url)')
        .eq('receiver_id', user.id)
        .order('created_at', { ascending: false });

      let totalCallEarnings = 0;
      let weekCallEarnings = 0;
      let monthCallEarnings = 0;
      let todayCallEarnings = 0;
      let totalMinutes = 0;

      const callTransactions: Transaction[] = [];

      callsData?.forEach(call => {
        const hostEarnings = Number(call.host_earnings_amount ?? call.host_earned ?? 0);
        const callDate = new Date(call.ended_at || call.created_at);

        totalCallEarnings += hostEarnings;
        totalMinutes += call.duration_seconds ? Math.ceil(call.duration_seconds / 60) : 0;

        if (callDate >= startOfWeek) weekCallEarnings += hostEarnings;
        if (callDate >= startOfMonth) monthCallEarnings += hostEarnings;
        if (callDate >= startOfDay) todayCallEarnings += hostEarnings;

        callTransactions.push({
          id: call.id,
          type: 'call',
          amount: hostEarnings,
          date: call.ended_at || call.created_at,
          otherUserName: 'Caller',
        });
      });

      let totalGiftEarnings = 0;
      let weekGiftEarnings = 0;
      let monthGiftEarnings = 0;
      let todayGiftEarnings = 0;

      const giftTransactions: Transaction[] = [];

      giftsData?.forEach(gift => {
        const hostEarnings = Number(gift.receiver_beans ?? 0);
        const giftDate = new Date(gift.created_at);
        const sender = Array.isArray(gift.sender) ? gift.sender[0] : gift.sender;

        totalGiftEarnings += hostEarnings;

        if (giftDate >= startOfWeek) weekGiftEarnings += hostEarnings;
        if (giftDate >= startOfMonth) monthGiftEarnings += hostEarnings;
        if (giftDate >= startOfDay) todayGiftEarnings += hostEarnings;

        giftTransactions.push({
          id: gift.id,
          type: 'gift',
          amount: hostEarnings,
          date: gift.created_at,
          otherUserName: sender?.display_name || 'User',
          otherUserAvatar: sender?.avatar_url,
        });
      });

      const getNextSunday = () => {
        const today = new Date();
        const daysUntilSunday = (7 - today.getDay()) % 7 || 7;
        const nextSunday = new Date(today);
        nextSunday.setDate(today.getDate() + daysUntilSunday);
        nextSunday.setHours(0, 0, 0, 0);
        return nextSunday.toISOString();
      };

      setStats({
        totalEarnings: Number(profileData?.total_earnings ?? (totalCallEarnings + totalGiftEarnings)),
        thisWeekEarnings: weekCallEarnings + weekGiftEarnings,
        thisMonthEarnings: monthCallEarnings + weekGiftEarnings,
        todayEarnings: todayCallEarnings + todayGiftEarnings,
        callEarnings: totalCallEarnings,
        giftEarnings: totalGiftEarnings,
        totalCalls: callsData?.length || 0,
        totalCallMinutes: totalMinutes,
        withdrawableBalance: Number(profileData?.beans ?? 0),
        pendingEarnings: Number(profileData?.pending_earnings ?? 0),
        nextTransferDate: getNextSunday(),
      });

      // Combine and sort transactions
      const allTransactions = [...callTransactions, ...giftTransactions]
        .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
        .slice(0, 20);

      setTransactions(allTransactions);

    } catch (error) {
      console.error('Error fetching dashboard:', error);
      recordClientError({ label: "HostDashboard.allTransactions", message: error instanceof Error ? error.message : String(error) });
      toast.error('Failed to load data');
    } finally {
      setLoading(false);
    }
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', { 
      month: 'short', 
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  // Save host's custom call rate
  const saveCallRate = async () => {
    if (!profile?.id) return;
    
    setSavingRate(true);
    try {
      const { error } = await supabase
        .from('profiles')
        .update({ call_rate_per_minute: callRate })
        .eq('id', profile.id);

      if (error) throw error;

      toast.success('Call rate saved!');
    } catch (error) {
      console.error('Error saving call rate:', error);
      recordClientError({ label: "HostDashboard.saveCallRate", message: error instanceof Error ? error.message : String(error) });
      toast.error('Failed to save call rate');
    } finally {
      setSavingRate(false);
    }
  };

  // Calculate host earnings based on commission
  const calculateHostEarnings = (rate: number) => {
    return Math.floor(rate * commissionPercent / 100);
  };

  if (loading) {
    return <PageSkeleton className="bg-background" rows={6} hero />;
  }

  return (
    <div className="mobile-page bg-background">
      {/* Header */}
      <header className="sticky top-0 z-40 glass-card border-b border-border/50 safe-area-top">
        <div className="px-4 py-3 flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <h1 className="text-xl font-bold flex-1">Host Dashboard</h1>
          <Button variant="outline" size="sm" onClick={() => navigate('/host/obs-stream')}>
            OBS
          </Button>
          {/* Recordings entry hidden per product decision — no recording UI for hosts/users/agencies. */}
        </div>
      </header>

      <main className="mobile-page-scrollable px-4 py-4 space-y-6">
        {/* Profile Card */}
        <Card className="bg-gradient-to-br from-primary/20 to-brand-500/20 border-primary/30">
          <CardContent className="p-4">
            <div className="flex items-center gap-4">
              <AvatarWithFrame
                userId={profile?.id}
                src={profile?.avatar_url}
                name={profile?.display_name || 'H'}
                level={profile?.host_level || 1}
                isHost={true}
                size="lg"
                frameId={profile?.frame_id}
                showAnimation={true}
              />
              <div className="flex-1">
                <h2 className="text-lg font-bold">{profile?.display_name || 'Host'}</h2>
                <div className="flex items-center gap-2 mt-1">
                  <Badge className="bg-success-500">Host Level {profile?.host_level || 1}</Badge>
                  {profile?.is_verified && (
                    <Badge variant="secondary">✓ Verified</Badge>
                  )}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Earnings Overview */}
        <div className="grid grid-cols-2 gap-3">
          <Card className="bg-gradient-to-br from-success-50 to-success-50 border-success-200">
            <CardContent className="p-4">
              <div className="flex items-center gap-2 text-success-700 mb-2">
                <Wallet className="w-5 h-5" />
                <span className="text-sm">Total Earnings</span>
              </div>
              <p className="text-2xl font-bold text-success-700">
                {fmtNum(stats.totalEarnings)}
              </p>
              <p className="text-xs text-muted-foreground mt-1">Beans</p>
            </CardContent>
          </Card>

          <Card className="bg-gradient-to-br from-info-50 to-info-50 border-info-200">
            <CardContent className="p-4">
              <div className="flex items-center gap-2 text-info-700 mb-2">
                <Calendar className="w-5 h-5" />
                <span className="text-sm">This Week</span>
              </div>
              <p className="text-2xl font-bold text-info-700">
                {fmtNum(stats.thisWeekEarnings)}
              </p>
              <p className="text-xs text-muted-foreground mt-1">Beans</p>
            </CardContent>
          </Card>

          <Card className="bg-gradient-to-br from-brand-50 to-brand-50 border-brand-200">
            <CardContent className="p-4">
              <div className="flex items-center gap-2 text-brand-700 mb-2">
                <TrendingUp className="w-5 h-5" />
                <span className="text-sm">This Month</span>
              </div>
              <p className="text-2xl font-bold text-brand-700">
                {fmtNum(stats.thisMonthEarnings)}
              </p>
              <p className="text-xs text-muted-foreground mt-1">Beans</p>
            </CardContent>
          </Card>

          <Card className="bg-gradient-to-br from-warning-50 to-warning-50 border-warning-200">
            <CardContent className="p-4">
              <div className="flex items-center gap-2 text-warning-700 mb-2">
                <Clock className="w-5 h-5" />
                <span className="text-sm">Today</span>
              </div>
              <p className="text-2xl font-bold text-warning-700">
                {fmtNum(stats.todayEarnings)}
              </p>
              <p className="text-xs text-muted-foreground mt-1">Beans</p>
            </CardContent>
          </Card>
        </div>

        {/* Current Earnings Balance (Auto-transfers to Agency) */}
        <Card className="bg-gradient-to-r from-warning-500 to-warning-500 text-white">
          <CardContent className="p-5">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-full bg-white/20 flex items-center justify-center">
                <Coins className="w-6 h-6 text-white" />
              </div>
              <div className="flex-1">
                <p className="text-white/85 text-sm">Current Earnings Balance</p>
                <p className="text-3xl font-bold">
                  {fmtNum(stats.withdrawableBalance)} <span className="text-lg">Beans</span>
                </p>
              </div>
            </div>
            
            {/* Agency Transfer Notice */}
            <div className="mt-4 bg-white/20 rounded-xl p-4">
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 rounded-full bg-white/20 flex items-center justify-center flex-shrink-0">
                  <ArrowUpRight className="w-5 h-5 text-white" />
                </div>
                <div>
                  <p className="font-semibold text-white">Auto Transfer to Agency</p>
                  <p className="text-sm text-white/85 mt-1">
                    All your beans are automatically transferred to the agency weekly. 
                    Contact your agency for payment.
                  </p>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Pending Earnings Card */}
        {stats.pendingEarnings > 0 && (
          <Card className="bg-gradient-to-r from-warning-500 to-warning-500 text-white">
            <CardContent className="p-5">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-white/85 text-sm flex items-center gap-2">
                    <Clock className="w-4 h-4" />
                    Pending Earnings (received from agency)
                  </p>
                  <p className="text-3xl font-bold mt-1">
                    {fmtNum(stats.pendingEarnings)} <span className="text-lg">Beans</span>
                  </p>
                </div>
              </div>
              {stats.nextTransferDate && (
                <div className="mt-3 bg-white/20 rounded-lg p-3">
                  <p className="text-sm text-white/85">
                    <Calendar className="w-4 h-4 inline mr-2" />
                    Next Transfer: {new Date(stats.nextTransferDate).toLocaleDateString('en-US', {
                      weekday: 'long',
                      month: 'long',
                      day: 'numeric'
                    })}
                  </p>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* Match Call Availability */}
        <HostMatchToggleCard />

        {/* Call Rate Settings */}
        <Card className="border-primary/30">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <Settings className="w-5 h-5 text-primary" />
              Call Rate Settings
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Current Rate Display */}
            <div className="flex items-center justify-between p-4 bg-gradient-to-r from-primary/10 to-brand-500/10 rounded-xl border border-primary/20">
              <div>
                <p className="text-sm text-muted-foreground">Your Call Rate</p>
                <p className="text-3xl font-bold text-primary">{fmtNum(callRate)}</p>
                <p className="text-xs text-muted-foreground">Diamonds/min</p>
              </div>
              <div className="text-right">
                <p className="text-sm text-muted-foreground">You Earn</p>
                <p className="text-2xl font-bold text-success-500">{fmtNum(calculateHostEarnings(callRate))}</p>
                <p className="text-xs text-muted-foreground">Beans/min ({commissionPercent}%)</p>
              </div>
            </div>

            {/* Rate Slider */}
            <div className="space-y-3">
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Adjust Rate</span>
                <Badge variant="outline">{minRate} - {maxRate}</Badge>
              </div>
              <Slider
                value={[callRate]}
                onValueChange={(value) => setCallRate(value[0])}
                min={minRate}
                max={maxRate}
                step={100}
                className="w-full"
              />
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>{fmtNum(minRate)} (Min)</span>
                <span>{fmtNum(maxRate)} (Max)</span>
              </div>
            </div>

            {/* Earnings Preview */}
            <div className="grid grid-cols-3 gap-2 text-center">
              <div className="p-2 bg-muted rounded-lg">
                <p className="text-lg font-bold text-foreground">{fmtNum(callRate)}</p>
                <p className="text-[10px] text-muted-foreground">User Pays</p>
              </div>
              <div className="p-2 bg-success-500/10 rounded-lg border border-success-500/20">
                <p className="text-lg font-bold text-success-500">{fmtNum(calculateHostEarnings(callRate))}</p>
                <p className="text-[10px] text-success-600">You Earn</p>
              </div>
              <div className="p-2 bg-muted rounded-lg">
                <p className="text-lg font-bold text-muted-foreground">{fmtNum(callRate - calculateHostEarnings(callRate))}</p>
                <p className="text-[10px] text-muted-foreground">Platform</p>
              </div>
            </div>

            {/* Save Button */}
            <Button 
              onClick={saveCallRate} 
              disabled={savingRate}
              className="w-full bg-gradient-to-r from-primary to-brand-600 hover:from-primary/90 hover:to-brand-600/90"
            >
              {savingRate ? (
                <span className="flex items-center gap-2">
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  Saving...
                </span>
              ) : (
                <span className="flex items-center gap-2">
                  <Save className="w-4 h-4" />
                  Save Call Rate
                </span>
              )}
            </Button>

            <p className="text-xs text-center text-muted-foreground">
              💡 Tip: You can increase your call rate as your level increases
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Earnings Breakdown</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between p-3 bg-muted rounded-lg">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-info-500/20 flex items-center justify-center">
                  <Phone className="w-5 h-5 text-info-700" />
                </div>
                <div>
                  <p className="font-medium">From Calls</p>
                  <p className="text-xs text-muted-foreground">
                    {stats.totalCalls} calls · {stats.totalCallMinutes} mins
                  </p>
                </div>
              </div>
              <p className="font-bold text-info-700">+{fmtNum(stats.callEarnings)}</p>
            </div>

            <div className="flex items-center justify-between p-3 bg-muted rounded-lg">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-brand-500/20 flex items-center justify-center">
                  <Gift className="w-5 h-5 text-brand-700" />
                </div>
                <div>
                  <p className="font-medium">From Gifts</p>
                  <p className="text-xs text-muted-foreground">All gifts</p>
                </div>
              </div>
              <p className="font-bold text-brand-700">+{fmtNum(stats.giftEarnings)}</p>
            </div>
          </CardContent>
        </Card>

        {/* Recent Transactions */}
        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base">Recent Transactions</CardTitle>
              <Button variant="ghost" size="sm" className="text-primary">
                View All <ChevronRight className="w-4 h-4 ml-1" />
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            {transactions.length === 0 ? (
              <p className="text-center text-muted-foreground py-4">
                No transactions yet
              </p>
            ) : (
              transactions.map((tx) => (
                <div 
                  key={tx.id} 
                  className="flex items-center justify-between p-3 bg-muted/50 rounded-lg"
                >
                  <div className="flex items-center gap-3">
                    <div className={`w-10 h-10 rounded-full flex items-center justify-center ${
                      tx.type === 'call' ? 'bg-info-500/20' : 
                      tx.type === 'gift' ? 'bg-brand-500/20' : 'bg-success-500/20'
                    }`}>
                      {tx.type === 'call' ? (
                        <Phone className="w-5 h-5 text-info-700" />
                      ) : tx.type === 'gift' ? (
                        <Gift className="w-5 h-5 text-brand-700" />
                      ) : (
                        <Download className="w-5 h-5 text-success-700" />
                      )}
                    </div>
                    <div>
                      <p className="font-medium text-sm">
                        {tx.type === 'call' ? 'Private Call' : 
                         tx.type === 'gift' ? 'Gift Received' : 'Withdrawal'}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {tx.otherUserName && `${tx.otherUserName} · `}
                        {formatDate(tx.date)}
                      </p>
                    </div>
                  </div>
                  <p className={`font-bold ${
                    tx.type === 'withdrawal' ? 'text-danger-600' : 'text-success-700'
                  }`}>
                    {tx.type === 'withdrawal' ? '-' : '+'}
                    {fmtNum(tx.amount)}
                  </p>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </main>

      <BottomNavigation 
        activeTab={activeTab} 
        onTabChange={(path) => {
          setActiveTab(path);
          navigate(path);
        }} 
      />
    </div>
  );
};

export default HostDashboard;
